-- CLI-generated additive Auth username bridge. No credential changes/imports here.
begin;
-- A refresh retains its Auth session_id. It cannot resurrect a revoked device,
-- or copy one session into a second logical device. Fresh password login may
-- explicitly rebind the same device using its newly verified Auth session.
drop index public.lingjing_devices_session_idx;
create unique index lingjing_devices_session_unique on public.lingjing_devices(auth_session_id);
create or replace function lingjing_private.register_device(p_device_id uuid,p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text := lingjing_private.session_owner(); v_sid uuid := lingjing_private.live_session_id();
  v_header text := nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id';
begin
  if p_device_id is null or lower(coalesce(v_header,''))<>p_device_id::text or length(coalesce(p_label,'')) not between 1 and 80 then
    raise exception using errcode='22023',message='LJ_DEVICE_REQUIRED'; end if;
  if exists(select 1 from public.lingjing_devices where auth_session_id=v_sid and (owner_id<>v_owner or device_id<>p_device_id)) then
    raise exception using errcode='28000',message='LJ_DEVICE_SESSION_BOUND'; end if;
  insert into public.lingjing_devices(owner_id,device_id,auth_session_id,label) values(v_owner,p_device_id,v_sid,p_label)
    on conflict(owner_id,device_id) do update set auth_session_id=excluded.auth_session_id,label=excluded.label,last_seen_at=now(),revoked_at=null
      where lingjing_devices.revoked_at is null or lingjing_devices.auth_session_id<>excluded.auth_session_id;
  return lingjing_private.actor_for_device(p_device_id);
end $$;
create table lingjing_private.auth_directory (
  account_key text primary key, account text not null, username text not null,
  login_email text not null unique default ('lj-'||gen_random_uuid()::text||'@login.lingjing.invalid'),
  auth_user_id uuid unique references auth.users(id) on delete restrict,
  legacy_source text, legacy_subject text,
  created_at timestamptz not null default now(), linked_at timestamptz
);
create table lingjing_private.auth_rate_buckets (
  key_hash text not null check(length(key_hash)=64), window_start bigint not null, attempts integer not null,
  primary key(key_hash,window_start)
);
alter table lingjing_private.auth_directory enable row level security;
alter table lingjing_private.auth_rate_buckets enable row level security;
revoke all on lingjing_private.auth_directory,lingjing_private.auth_rate_buckets from public,anon,authenticated;
grant all on lingjing_private.auth_directory,lingjing_private.auth_rate_buckets to service_role;

create function public.lingjing_auth_record(p_account_key text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_dir lingjing_private.auth_directory; v_profile public.lingjing_accounts; v_legacy lingjing_private.legacy_account_claims;
begin
  select * into v_dir from lingjing_private.auth_directory where account_key=p_account_key;
  select * into v_profile from public.lingjing_accounts where account_key=p_account_key;
  if v_profile.owner_id is null then
    if (select count(*) from lingjing_private.legacy_account_claims where account_key=p_account_key)>1 then
      raise exception using errcode='28000',message='LJ_LEGACY_IDENTITY_AMBIGUOUS';
    end if;
    select * into v_legacy from lingjing_private.legacy_account_claims where account_key=p_account_key;
  end if;
  if v_dir.account_key is null and v_profile.owner_id is null and v_legacy.owner_id is null then return null; end if;
  return jsonb_build_object('accountKey',p_account_key,'account',coalesce(v_profile.account,v_legacy.account,v_dir.account),
    'username',coalesce(v_profile.username,v_legacy.username,v_dir.username),'email',v_dir.login_email,
    'authUserId',coalesce(v_profile.auth_user_id,v_dir.auth_user_id),'ownerAccountId',v_profile.owner_id,
    'legacy',case when v_legacy.owner_id is not null and v_legacy.linked_auth_user_id is null then to_jsonb(v_legacy) else null end);
end $$;
create function public.lingjing_auth_reserve(p_account text,p_username text,p_legacy_source text default null,p_legacy_subject text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_key text := lower(btrim(p_account)); v_legacy lingjing_private.legacy_account_claims;
begin
  if coalesce(length(v_key),0) not between 3 and 32 or v_key ~ '\s' or coalesce(length(p_username),0) not between 2 and 24 then
    raise exception using errcode='22023',message='LJ_INVALID_IDENTITY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lingjing-account:'||v_key,0));
  if p_legacy_source is null then
    if exists(select 1 from lingjing_private.legacy_account_claims where account_key=v_key) then
      raise exception using errcode='28000',message='LJ_LEGACY_PROOF_REQUIRED'; end if;
  else
    select * into v_legacy from lingjing_private.legacy_account_claims where source_instance=p_legacy_source and legacy_subject=p_legacy_subject;
    if not found or v_legacy.account_key<>v_key or v_legacy.linked_auth_user_id is not null then
      raise exception using errcode='28000',message='LJ_LEGACY_PROOF_REQUIRED'; end if;
  end if;
  insert into lingjing_private.auth_directory(account_key,account,username,legacy_source,legacy_subject)
    values(v_key,btrim(p_account),p_username,p_legacy_source,p_legacy_subject) on conflict(account_key) do nothing;
  return public.lingjing_auth_record(v_key);
end $$;
create function public.lingjing_auth_finalize(p_auth_user_id uuid,p_account_key text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_dir lingjing_private.auth_directory; v_profile jsonb;
begin
  select * into v_dir from lingjing_private.auth_directory where account_key=p_account_key for update;
  if not found or (v_dir.auth_user_id is not null and v_dir.auth_user_id<>p_auth_user_id) then
    raise exception using errcode='28000',message='LJ_IDENTITY_CONFLICT'; end if;
  v_profile := public.lingjing_link_auth_user(p_auth_user_id,v_dir.account,v_dir.username,v_dir.legacy_source,v_dir.legacy_subject);
  if v_dir.legacy_source is not null then
    update public.lingjing_accounts set created_at=c.created_at
      from lingjing_private.legacy_account_claims c where lingjing_accounts.owner_id=c.owner_id
        and c.source_instance=v_dir.legacy_source and c.legacy_subject=v_dir.legacy_subject;
    select to_jsonb(a) into v_profile from public.lingjing_accounts a where a.auth_user_id=p_auth_user_id;
  end if;
  update lingjing_private.auth_directory set auth_user_id=p_auth_user_id,linked_at=coalesce(linked_at,now()) where account_key=p_account_key;
  return v_profile;
end $$;
create function public.lingjing_auth_rate_limit(p_key_hash text,p_limit integer default 12) returns void
language plpgsql security invoker set search_path='' as $$
declare v_window bigint := floor(extract(epoch from now())/60)::bigint; v_n integer;
begin
  if p_limit<1 or p_limit>1000 or p_key_hash !~ '^[0-9a-f]{64}$' then raise exception 'LJ_INVALID_REQUEST'; end if;
  delete from lingjing_private.auth_rate_buckets where window_start<v_window-1440;
  insert into lingjing_private.auth_rate_buckets values(p_key_hash,v_window,1)
    on conflict(key_hash,window_start) do update set attempts=lingjing_private.auth_rate_buckets.attempts+1 returning attempts into v_n;
  if v_n>p_limit then raise exception using errcode='P0001',message='LJ_AUTH_RATE_LIMITED'; end if;
end $$;
create function lingjing_private.update_profile(p_username text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text := lingjing_private.actor_owner(); v_row public.lingjing_accounts;
begin
  if coalesce(length(p_username),0) not between 2 and 24 then raise exception 'LJ_INVALID_IDENTITY'; end if;
  update public.lingjing_accounts set username=p_username,updated_at=now() where owner_id=v_owner returning * into v_row;
  return to_jsonb(v_row);
end $$;
create function public.lingjing_update_profile(p_username text) returns jsonb
language sql security invoker set search_path='' as $$ select lingjing_private.update_profile(p_username) $$;
revoke all on function public.lingjing_auth_record(text),public.lingjing_auth_reserve(text,text,text,text),public.lingjing_auth_finalize(uuid,text),public.lingjing_auth_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.lingjing_auth_record(text),public.lingjing_auth_reserve(text,text,text,text),public.lingjing_auth_finalize(uuid,text),public.lingjing_auth_rate_limit(text,integer) to service_role;
revoke all on function lingjing_private.update_profile(text),public.lingjing_update_profile(text) from public,anon;
grant execute on function lingjing_private.update_profile(text),public.lingjing_update_profile(text) to authenticated;
commit;
