-- Created by Supabase CLI2.122.0. Requires08 canonical identity migration and
--03 location migration. Only service-role entry points, after08 withActor.
begin;
create function lingjing_discovery.live_actor(p_actor jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_owner text:=p_actor->>'ownerAccountId';v_uid uuid;v_device uuid;v_session uuid;
begin
  begin
    v_uid:=(p_actor->>'authUserId')::uuid;
    v_device:=(p_actor->>'deviceId')::uuid;
    v_session:=(p_actor->>'sessionId')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode='28000',message='AUTH_REQUIRED';
  end;
  -- These canonical rows linearize revocation with the protected operation.
  -- No extra auth.users/auth.sessions permissions or identity registry.
  perform 1 from public.lingjing_accounts a join public.lingjing_devices d on d.owner_id=a.owner_id
    where a.owner_id=v_owner and a.auth_user_id=v_uid and a.status='active'
      and d.device_id=v_device and d.auth_session_id=v_session and d.revoked_at is null
    for share of a,d;
  if not found then raise exception using errcode='28000',message='AUTH_REQUIRED';end if;
end $$;
revoke all on function lingjing_discovery.live_actor(jsonb) from public,anon,authenticated;
grant execute on function lingjing_discovery.live_actor(jsonb) to service_role;

-- Retain the already published location implementation and permissions while
-- adding the current canonical device check to every call, including policy.
alter function public.lingjing_discovery_location(jsonb,text,jsonb) set schema lingjing_discovery;
alter function lingjing_discovery.lingjing_discovery_location(jsonb,text,jsonb) rename to location_v1;
create function public.lingjing_discovery_location(p_actor jsonb,p_op text,p_input jsonb default '{}'::jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform lingjing_discovery.live_actor(p_actor);
  return lingjing_discovery.location_v1(p_actor,p_op,p_input);
end $$;
revoke all on function public.lingjing_discovery_location(jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.lingjing_discovery_location(jsonb,text,jsonb) to service_role;

alter function public.lingjing_discovery_take_location(jsonb,uuid,text,text,text) set schema lingjing_discovery;
alter function lingjing_discovery.lingjing_discovery_take_location(jsonb,uuid,text,text,text) rename to take_location_v1;
create function public.lingjing_discovery_take_location(p_actor jsonb,p_proof_id uuid,p_purpose text,p_reference text,p_consumer text) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
  perform lingjing_discovery.live_actor(p_actor);
  return lingjing_discovery.take_location_v1(p_actor,p_proof_id,p_purpose,p_reference,p_consumer);
end $$;
revoke all on function public.lingjing_discovery_take_location(jsonb,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.lingjing_discovery_take_location(jsonb,uuid,text,text,text) to service_role;
commit;
