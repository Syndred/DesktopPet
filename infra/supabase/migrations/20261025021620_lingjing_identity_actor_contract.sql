-- Created by Supabase CLI 2.122.0 migration new. Additive Lingjing namespace only.
-- Does not import comparisontext users or assert that old DesktopPet users migrated.
begin;
create schema if not exists lingjing_private;
revoke all on schema lingjing_private from public, anon;
grant usage on schema lingjing_private to authenticated, service_role;

create table public.lingjing_accounts (
  owner_id text primary key check (length(owner_id) between 1 and 160),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  account_key text not null unique check (account_key = lower(btrim(account_key)) and length(account_key) between 3 and 32),
  account text not null check (length(account) between 3 and 32),
  username text not null check (length(username) between 2 and 24),
  status text not null default 'active' check (status in ('active','locked')),
  legacy_source text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lingjing_devices (
  owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
  device_id uuid not null, auth_session_id uuid not null,
  label text not null default 'Windows PC' check (length(label) between 1 and 80),
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), revoked_at timestamptz,
  primary key (owner_id,device_id)
);
create index lingjing_devices_session_idx on public.lingjing_devices(auth_session_id);
alter table public.lingjing_accounts enable row level security;
alter table public.lingjing_devices enable row level security;
revoke all on public.lingjing_accounts, public.lingjing_devices from public, anon, authenticated;
grant select on public.lingjing_accounts, public.lingjing_devices to authenticated;
grant all on public.lingjing_accounts, public.lingjing_devices to service_role;

-- A trusted source export is staged here by the deployment coordinator only.
-- Old SHA256 passwords are verified once on login, then Supabase Auth owns them.
create table lingjing_private.legacy_account_claims (
  source_instance text not null, legacy_subject text not null, owner_id text not null unique,
  account_key text not null, account text not null, username text not null,
  password_hash text not null check (password_hash ~ '^[0-9a-f]{64}$'),
  hash_algorithm text not null default 'sha256' check (hash_algorithm='sha256'),
  source_record_checksum text not null check (source_record_checksum ~ '^[0-9a-f]{64}$'),
  source_manifest_checksum text not null check (source_manifest_checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null, imported_at timestamptz not null default now(),
  linked_auth_user_id uuid references auth.users(id) on delete restrict,
  linked_at timestamptz,
  primary key(source_instance,legacy_subject), unique(source_instance,account_key)
);
alter table lingjing_private.legacy_account_claims enable row level security;
revoke all on lingjing_private.legacy_account_claims from public, anon, authenticated;
grant all on lingjing_private.legacy_account_claims to service_role;

-- Strict revocation guard, including JWTs that have not expired after signOut.
-- Definer use is confined to private auth.sessions/users lookup, not public data APIs.
create function lingjing_private.live_session_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_sid uuid; v_claim text := auth.jwt()->>'session_id';
begin
  if v_uid is null or v_claim is null or v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='28000', message='LJ_AUTH_REQUIRED';
  end if;
  v_sid := v_claim::uuid;
  if not exists (select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=v_sid and s.user_id=v_uid and coalesce(u.is_anonymous,false)=false
      and (s.not_after is null or s.not_after>now())) then
    raise exception using errcode='28000', message='LJ_SESSION_REVOKED';
  end if;
  return v_sid;
end $$;

create function lingjing_private.session_owner() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_owner text;
begin
  perform lingjing_private.live_session_id();
  select owner_id into v_owner from public.lingjing_accounts where auth_user_id=auth.uid() and status='active';
  if v_owner is null then raise exception using errcode='28000', message='LJ_IDENTITY_REQUIRED'; end if;
  return v_owner;
end $$;

create function lingjing_private.actor_for_device(p_device_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_owner text := lingjing_private.session_owner(); v_sid uuid := lingjing_private.live_session_id();
  v_header text := nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id'; v_account public.lingjing_accounts;
begin
  if p_device_id is null or v_header is null or lower(v_header)<>p_device_id::text then
    raise exception using errcode='28000',message='LJ_DEVICE_REQUIRED';
  end if;
  if not exists(select 1 from public.lingjing_devices where owner_id=v_owner and device_id=p_device_id and auth_session_id=v_sid and revoked_at is null) then
    raise exception using errcode='28000',message='LJ_DEVICE_SESSION_REQUIRED';
  end if;
  select * into strict v_account from public.lingjing_accounts where owner_id=v_owner;
  return jsonb_build_object('schemaVersion',1,'authority','live','authKind','supabase',
    'authUserId',auth.uid(),'ownerAccountId',v_owner,'deviceId',p_device_id,'sessionId',v_sid,
    'account',v_account.account,'username',v_account.username);
end $$;

create function lingjing_private.actor_owner() returns text
language plpgsql stable security invoker set search_path = '' as $$
declare v_header text := nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id';
begin
  if v_header is null or v_header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using errcode='28000',message='LJ_DEVICE_REQUIRED';
  end if;
  return lingjing_private.actor_for_device(v_header::uuid)->>'ownerAccountId';
end $$;

create function public.lingjing_current_owner() returns text
language sql stable security invoker set search_path = '' as $$ select lingjing_private.actor_owner() $$;
create function public.lingjing_actor_context(p_device_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$ select lingjing_private.actor_for_device(p_device_id) $$;

create function lingjing_private.register_device(p_device_id uuid,p_label text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner text := lingjing_private.session_owner(); v_sid uuid := lingjing_private.live_session_id();
  v_header text := nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id';
begin
  if p_device_id is null or lower(coalesce(v_header,''))<>p_device_id::text or length(coalesce(p_label,'')) not between 1 and 80 then
    raise exception using errcode='22023',message='LJ_DEVICE_REQUIRED';
  end if;
  insert into public.lingjing_devices(owner_id,device_id,auth_session_id,label) values(v_owner,p_device_id,v_sid,p_label)
  on conflict(owner_id,device_id) do update set auth_session_id=excluded.auth_session_id,label=excluded.label,last_seen_at=now(),revoked_at=null;
  return lingjing_private.actor_for_device(p_device_id);
end $$;
create function public.lingjing_register_device(p_device_id uuid,p_label text default 'Windows PC') returns jsonb
language sql security invoker set search_path = '' as $$ select lingjing_private.register_device(p_device_id,p_label) $$;

create function lingjing_private.revoke_device(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner text := lingjing_private.actor_owner();
begin
  update public.lingjing_devices set revoked_at=now() where owner_id=v_owner and device_id=p_device_id;
  return jsonb_build_object('revoked',found,'deviceId',p_device_id);
end $$;
create function public.lingjing_revoke_device(p_device_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select lingjing_private.revoke_device(p_device_id) $$;

create policy lingjing_account_self_read on public.lingjing_accounts for select to authenticated
using(auth_user_id=(select auth.uid()) and (select lingjing_private.live_session_id()) is not null);
create policy lingjing_device_self_read on public.lingjing_devices for select to authenticated
using(owner_id=(select public.lingjing_current_owner()));

-- Trusted bridge only. A client can neither supply an old owner nor edit linkage.
create function public.lingjing_link_auth_user(p_auth_user_id uuid,p_account text,p_username text,p_legacy_source text default null,p_legacy_subject text default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_key text := lower(btrim(p_account)); v_owner text; v_legacy lingjing_private.legacy_account_claims; v_existing public.lingjing_accounts;
begin
  -- auth.users SELECT is intentionally unavailable to service_role on hosted
  -- Supabase. The FK verifies existence; the bridge creates a named Auth user,
  -- and live_session_id independently rejects anonymous users on every access.
  if p_auth_user_id is null or coalesce(length(v_key),0) not between 3 and 32 or v_key ~ '\s' or coalesce(length(p_username),0) not between 2 and 24 then
    raise exception using errcode='22023',message='LJ_INVALID_IDENTITY';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('lingjing-account:'||v_key,0));
  select * into v_existing from public.lingjing_accounts where auth_user_id=p_auth_user_id or account_key=v_key for update;
  if found then
    if v_existing.auth_user_id<>p_auth_user_id or v_existing.account_key<>v_key then
      raise exception using errcode='23505',message='LJ_IDENTITY_CONFLICT';
    end if;
    return to_jsonb(v_existing);
  end if;
  if p_legacy_source is not null then
    select * into v_legacy from lingjing_private.legacy_account_claims where source_instance=p_legacy_source and legacy_subject=p_legacy_subject for update;
    if not found or v_legacy.account_key<>v_key or (v_legacy.linked_auth_user_id is not null and v_legacy.linked_auth_user_id<>p_auth_user_id) then
      raise exception using errcode='28000',message='LJ_LEGACY_PROOF_REQUIRED';
    end if;
    v_owner := v_legacy.owner_id;
  else
    if exists(select 1 from lingjing_private.legacy_account_claims where account_key=v_key) then
      raise exception using errcode='28000',message='LJ_LEGACY_PROOF_REQUIRED';
    end if;
    v_owner := 'account:'||gen_random_uuid()::text;
  end if;
  insert into public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username,legacy_source)
    values(v_owner,p_auth_user_id,v_key,btrim(p_account),p_username,p_legacy_source) returning * into v_existing;
  if p_legacy_source is not null then update lingjing_private.legacy_account_claims set linked_auth_user_id=p_auth_user_id,linked_at=now()
    where source_instance=p_legacy_source and legacy_subject=p_legacy_subject; end if;
  return to_jsonb(v_existing);
end $$;

revoke all on all functions in schema lingjing_private from public,anon,authenticated;
grant execute on function lingjing_private.live_session_id(),lingjing_private.session_owner(),lingjing_private.actor_for_device(uuid),lingjing_private.actor_owner(),
  lingjing_private.register_device(uuid,text),lingjing_private.revoke_device(uuid) to authenticated;
revoke all on function public.lingjing_current_owner(),public.lingjing_actor_context(uuid),public.lingjing_register_device(uuid,text),public.lingjing_revoke_device(uuid) from public,anon;
grant execute on function public.lingjing_current_owner(),public.lingjing_actor_context(uuid),public.lingjing_register_device(uuid,text),public.lingjing_revoke_device(uuid) to authenticated;
revoke all on function public.lingjing_link_auth_user(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.lingjing_link_auth_user(uuid,text,text,text,text) to service_role;
comment on table public.lingjing_accounts is 'Auth UID to stable legacy/new text owner. No automatic comparisontext or username-only identity merge.';
comment on function public.lingjing_current_owner() is 'RLS owner predicate: verified live Auth session AND matching registered X-Lingjing-Device-Id.';
commit;
