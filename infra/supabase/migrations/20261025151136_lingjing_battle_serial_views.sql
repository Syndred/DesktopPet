-- Created with Supabase CLI migration new. Additive, service-only display lookup.
-- No registration, numbering, backfill, row locks or historical JSON changes.
begin;

create function lingjing_private.global_serial_read_actor_namespace(p_actor jsonb) returns text
-- Separate read guard: the write guard deliberately locks rows. STABLE uses the
-- calling statement's snapshot and can run in a READ ONLY transaction. Recheck
-- every canonical Auth/device/revocation/scope condition without granting the
-- service worker direct access to auth.users or auth.sessions.
language plpgsql stable security definer set search_path='' as $$
declare v_owner text:=p_actor->>'ownerAccountId';v_uid uuid;v_device uuid;v_sid uuid;
 v_account public.lingjing_accounts;v_anonymous boolean;v_not_after timestamptz;
 v_scopes text[];v_scope text;v_grant lingjing_discovery.location_test_grants;
begin
 if jsonb_typeof(p_actor) is distinct from 'object' or p_actor->'schemaVersion' is distinct from '1'::jsonb
  or p_actor->>'authority' is distinct from 'live' or p_actor->>'authKind' is distinct from 'supabase'
  or jsonb_typeof(p_actor->'ownerAccountId') is distinct from 'string'
  or coalesce(length(v_owner),0) not between 1 and 160
  or coalesce(p_actor->>'authUserId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_actor->>'deviceId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or coalesce(p_actor->>'sessionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end if;
 begin
  v_uid:=(p_actor->>'authUserId')::uuid;v_device:=(p_actor->>'deviceId')::uuid;v_sid:=(p_actor->>'sessionId')::uuid;
 exception when invalid_text_representation then
  raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';
 end;
 if v_uid is null or v_device is null or v_sid is null then
  raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end if;
 select * into v_account from public.lingjing_accounts where owner_id=v_owner;
 if not found or v_account.status<>'active' or v_account.auth_user_id<>v_uid then
  raise exception using errcode='28000',message='LJ_OWNER_MISMATCH';end if;
 select is_anonymous into v_anonymous from auth.users where id=v_uid;
 if not found or coalesce(v_anonymous,false) then
  raise exception using errcode='28000',message='LJ_AUTH_INVALID';end if;
 select not_after into v_not_after from auth.sessions where id=v_sid and user_id=v_uid;
 if not found or(v_not_after is not null and v_not_after<=statement_timestamp()) then
  raise exception using errcode='28000',message='LJ_SESSION_REVOKED';end if;
 if exists(select 1 from lingjing_private.revoked_auth_sessions where auth_session_id=v_sid) then
  raise exception using errcode='28000',message='LJ_SESSION_REVOKED';end if;
 if not exists(select 1 from public.lingjing_devices where owner_id=v_owner and device_id=v_device
  and auth_session_id=v_sid and revoked_at is null) then
  raise exception using errcode='28000',message='LJ_DEVICE_SESSION_REQUIRED';end if;
 select array_agg(distinct namespace order by namespace) into v_scopes
  from lingjing_private.global_serial_qa_scopes where auth_uid=v_uid;
 if cardinality(v_scopes)>1 then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_CONFLICT';end if;
 v_scope:=coalesce(v_scopes[1],'live');
 select * into v_grant from lingjing_discovery.location_test_grants
  where auth_uid=v_uid and device_id=p_actor->>'deviceId';
 if found then
  if v_grant.expires_at<=statement_timestamp() then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';end if;
  if v_scope is distinct from 'qa:'||v_grant.scenario_id then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_CONFLICT';end if;
 elsif v_scope<>'live' or p_actor->>'allowSimulatedLocation'='true' then
  raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';
 end if;
 return v_scope;
end $$;
revoke all on function lingjing_private.global_serial_read_actor_namespace(jsonb) from public,anon,authenticated,service_role;
grant execute on function lingjing_private.global_serial_read_actor_namespace(jsonb) to service_role;

create function public.lingjing_battle_serial_views(p_actor jsonb,p_room_ids uuid[]) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare v_namespace text;v_rooms jsonb;
begin
 v_namespace:=lingjing_private.global_serial_read_actor_namespace(p_actor);
 if p_room_ids is null or cardinality(p_room_ids) not between 1 and 20
  or array_ndims(p_room_ids)<>1 or exists(select 1 from unnest(p_room_ids) id where id is null)
  or (select count(distinct id) from unnest(p_room_ids) id)<>cardinality(p_room_ids) then
  raise exception 'LJ_INVALID_COMMAND';end if;
 -- Unknown rooms and nonmembers have one indistinguishable whole-batch refusal.
 -- Historical membership remains valid after active=false; invitations alone do
 -- not authorize a room. Match stored room AND member identity, never input IDs.
 if exists(select 1 from unnest(p_room_ids) requested(id) where not exists(
  select 1 from public.lingjing_battle_rooms r join public.lingjing_battle_members m on m.room_id=r.id
  where r.id=requested.id and m.auth_uid=(p_actor->>'authUserId')::uuid and m.owner_account_id=p_actor->>'ownerAccountId'
  and ((m.side='host' and r.host_auth_uid=m.auth_uid and r.host_user_id=m.owner_account_id)
    or(m.side='guest' and r.guest_auth_uid=m.auth_uid and r.guest_user_id=m.owner_account_id))
 )) then raise exception 'LJ_ROOM_FORBIDDEN';end if;
 select jsonb_agg(jsonb_build_object('roomId',r.id,'roomRevision',r.revision::text,'participants',coalesce((
  select jsonb_agg(jsonb_build_object('side',p.side,'ownerAccountId',p.owner_id,'petId',p.pet_id,
    'templateId',g.template_id,'globalSerial',g.global_serial::text) order by p.position)
  from (values('host',r.host_auth_uid,r.host_user_id,r.host_pet_id,0),
              ('guest',r.guest_auth_uid,r.guest_user_id,r.guest_pet_id,1)) p(side,auth_uid,owner_id,pet_id,position)
  join public.lingjing_battle_members m on m.room_id=r.id and m.side=p.side and m.auth_uid=p.auth_uid and m.owner_account_id=p.owner_id
  join public.lingjing_accounts a on a.owner_id=p.owner_id and a.auth_user_id=p.auth_uid and a.status='active'
  join lingjing_private.global_pet_serials g on g.owner_id=p.owner_id and g.pet_id=p.pet_id and g.namespace=v_namespace
  where not exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=p.auth_uid and q.namespace<>v_namespace)
   and(v_namespace='live' or exists(select 1 from lingjing_private.global_serial_qa_scopes q where q.auth_uid=p.auth_uid and q.namespace=v_namespace))
 ),'[]'::jsonb)) order by requested.position) into v_rooms
 from unnest(p_room_ids) with ordinality requested(id,position) join public.lingjing_battle_rooms r on r.id=requested.id;
 return jsonb_build_object('format','lingjing.battle.serial-views','version',1,'ownerAccountId',p_actor->>'ownerAccountId',
  'namespace',v_namespace,'rooms',v_rooms);
end $$;
revoke all on function public.lingjing_battle_serial_views(jsonb,uuid[]) from public,anon,authenticated,service_role;
grant execute on function public.lingjing_battle_serial_views(jsonb,uuid[]) to service_role;
commit;
