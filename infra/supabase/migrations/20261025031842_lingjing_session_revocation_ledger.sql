-- Session IDs are immutable revocation identities. Replacing a device binding
-- must not erase the fact that its previous Auth session was revoked.
begin;
create table lingjing_private.revoked_auth_sessions (
 auth_session_id uuid primary key,auth_user_id uuid not null references auth.users(id) on delete restrict,
 owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,device_id uuid,
 reason text not null check(reason in ('explicit-device-revoke','device-session-replaced','pre-upgrade-unbound')),
 revoked_at timestamptz not null default now()
);
alter table lingjing_private.revoked_auth_sessions enable row level security;
revoke all on lingjing_private.revoked_auth_sessions from public,anon,authenticated,service_role;
grant select on lingjing_private.revoked_auth_sessions to service_role;
create index lingjing_revoked_sessions_owner_idx on lingjing_private.revoked_auth_sessions(owner_id,revoked_at);
create function lingjing_private.immutable_revocation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'LJ_REVOCATION_IMMUTABLE';end $$;
revoke all on function lingjing_private.immutable_revocation() from public,anon,authenticated,service_role;
create trigger lingjing_revocation_immutable before update or delete on lingjing_private.revoked_auth_sessions
 for each row execute function lingjing_private.immutable_revocation();

insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason,revoked_at)
 select d.auth_session_id,a.auth_user_id,d.owner_id,d.device_id,'explicit-device-revoke',d.revoked_at
 from public.lingjing_devices d join public.lingjing_accounts a on a.owner_id=d.owner_id
 where d.revoked_at is not null and d.auth_session_id is not null on conflict(auth_session_id) do nothing;
-- Prior code did not retain overwritten session history. Retire only already
-- unbound sessions of linked Lingjing users. Every active bound device stays
-- live; no other project/user is touched and no Auth-table grant is expanded.
insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,reason)
 select s.id,s.user_id,a.owner_id,'pre-upgrade-unbound' from auth.sessions s
 join public.lingjing_accounts a on a.auth_user_id=s.user_id
 where not exists(select 1 from public.lingjing_devices d where d.owner_id=a.owner_id and d.auth_session_id=s.id and d.revoked_at is null)
 on conflict(auth_session_id) do nothing;

create or replace function lingjing_private.live_session_id() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid();v_sid uuid;v_claim text:=auth.jwt()->>'session_id';
begin
 if v_uid is null or v_claim is null or v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end if;
 v_sid:=v_claim::uuid;
 if exists(select 1 from lingjing_private.revoked_auth_sessions where auth_session_id=v_sid)
  or not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    where s.id=v_sid and s.user_id=v_uid and coalesce(u.is_anonymous,false)=false and(s.not_after is null or s.not_after>now())) then
  raise exception using errcode='28000',message='LJ_SESSION_REVOKED';end if;
 return v_sid;
end $$;
create or replace function lingjing_private.register_device(p_device_id uuid,p_label text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text:=lingjing_private.session_owner();v_sid uuid:=lingjing_private.live_session_id();v_previous public.lingjing_devices;
 v_header text:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id';
begin
 if p_device_id is null or lower(coalesce(v_header,''))<>p_device_id::text or length(coalesce(p_label,'')) not between 1 and 80 then
  raise exception using errcode='22023',message='LJ_DEVICE_REQUIRED';end if;
 perform 1 from public.lingjing_accounts where owner_id=v_owner for update;
 perform lingjing_private.live_session_id(); -- Recheck after waiting for another bind/revoke transaction.
 if exists(select 1 from public.lingjing_devices where auth_session_id=v_sid and(owner_id<>v_owner or device_id<>p_device_id)) then
  raise exception using errcode='28000',message='LJ_DEVICE_SESSION_BOUND';end if;
 select * into v_previous from public.lingjing_devices where owner_id=v_owner and device_id=p_device_id for update;
 if found and v_previous.auth_session_id is not null and v_previous.auth_session_id<>v_sid then
  insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason)
   values(v_previous.auth_session_id,auth.uid(),v_owner,p_device_id,'device-session-replaced') on conflict(auth_session_id) do nothing;
 end if;
 insert into public.lingjing_devices(owner_id,device_id,auth_session_id,label) values(v_owner,p_device_id,v_sid,p_label)
  on conflict(owner_id,device_id) do update set auth_session_id=excluded.auth_session_id,label=excluded.label,last_seen_at=now(),revoked_at=null;
 return lingjing_private.actor_for_device(p_device_id);
end $$;
create or replace function lingjing_private.revoke_device(p_device_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text:=lingjing_private.actor_owner();v_previous public.lingjing_devices;v_found boolean;
begin
 perform 1 from public.lingjing_accounts where owner_id=v_owner for update;
 perform lingjing_private.actor_owner();
 select * into v_previous from public.lingjing_devices where owner_id=v_owner and device_id=p_device_id for update;v_found:=found;
 if v_found then
  if v_previous.auth_session_id is not null then insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason)
   values(v_previous.auth_session_id,auth.uid(),v_owner,p_device_id,'explicit-device-revoke') on conflict(auth_session_id) do nothing;end if;
  update public.lingjing_devices set revoked_at=coalesce(revoked_at,now()) where owner_id=v_owner and device_id=p_device_id;
 end if;
 return jsonb_build_object('revoked',v_found,'deviceId',p_device_id);
end $$;
revoke all on function lingjing_private.live_session_id(),lingjing_private.register_device(uuid,text),lingjing_private.revoke_device(uuid) from public,anon;
grant execute on function lingjing_private.live_session_id(),lingjing_private.register_device(uuid,text),lingjing_private.revoke_device(uuid) to authenticated;
commit;
