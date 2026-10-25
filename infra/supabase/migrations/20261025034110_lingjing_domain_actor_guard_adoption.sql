-- Apply after the shared guard and the already-deployed03/05/02 domain schema.
-- Existing wrapper signatures, SECURITY INVOKER and service-only grants remain.
begin;
create or replace function lingjing_discovery.live_actor(p_actor jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare v_owner text:=p_actor->>'ownerAccountId';v_uid uuid;v_device uuid;v_session uuid;
begin
 begin v_uid:=(p_actor->>'authUserId')::uuid;v_device:=(p_actor->>'deviceId')::uuid;v_session:=(p_actor->>'sessionId')::uuid;
 exception when invalid_text_representation then raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end;
 perform lingjing_private.assert_service_actor(v_owner,v_uid,v_device,v_session);
end $$;
revoke all on function lingjing_discovery.live_actor(jsonb) from public,anon,authenticated;
grant execute on function lingjing_discovery.live_actor(jsonb) to service_role;
create or replace function public.runtime_territory_check_actor(p_owner text,p_uid uuid,p_device text,p_session uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare v_device uuid;
begin
 begin v_device:=p_device::uuid;exception when invalid_text_representation then raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end;
 perform lingjing_private.assert_service_actor(p_owner,p_uid,v_device,p_session);
end $$;
revoke all on function public.runtime_territory_check_actor(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.runtime_territory_check_actor(text,uuid,text,uuid) to service_role;
create or replace function lingjing_private.commit_companion_command(
  p_actor jsonb,p_command text,p_input jsonb,p_module jsonb,p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_owner text:=p_actor->>'ownerAccountId'; v_uid uuid;v_device uuid;v_session uuid;
  v_action text;v_global_action text;v_hash text;v_previous jsonb;v_prior_row jsonb;
  v_current bigint;v_row jsonb;v_table text;v_record jsonb;v_result jsonb;v_pet_ids jsonb;
  v_names text[]:=array['companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts'];
begin
  if p_actor->>'schemaVersion' is distinct from '1' or p_actor->>'authority' is distinct from 'live'
    or p_actor->>'authKind' is distinct from 'supabase' or length(coalesce(v_owner,'')) not between 1 and 160
    or coalesce(p_actor->>'authUserId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_actor->>'deviceId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or coalesce(p_actor->>'sessionId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then raise exception 'LJ_AUTH_INVALID';end if;
  v_uid:=(p_actor->>'authUserId')::uuid;v_device:=(p_actor->>'deviceId')::uuid;v_session:=(p_actor->>'sessionId')::uuid;
  perform lingjing_private.assert_service_actor(v_owner,v_uid,v_device,v_session);
  if p_command is null or p_command not in ('adopt','rename','desktop','select','appearance','interact','recall-all')
    or jsonb_typeof(p_input) is distinct from 'object' or coalesce(p_input->>'actionId','') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,95}$'
    or p_expected_revision is null or p_expected_revision<0 then raise exception 'LJ_INVALID_REQUEST';end if;
  v_action:=p_input->>'actionId';v_global_action:='companions:'||v_action;
  v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(p_input),'UTF8')),'hex');
  -- Common immutable receipt is checked before CAS. Concurrent equal requests
  -- return the original generated pet/result rather than a newly generated ID.
  v_previous:=lingjing_private.save_receipt(v_owner,v_global_action);
  if v_previous is not null then
    select value into v_prior_row from jsonb_array_elements(coalesce(v_previous#>'{envelope,data,modules,companions,data,tables,companion_actions}','[]'::jsonb))
      where value->>'owner_account_id'=v_owner and value->>'action_id'=v_action;
    if v_prior_row is null or v_prior_row->>'operation' is distinct from p_command or v_prior_row->>'request_hash' is distinct from v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
    return v_previous||jsonb_build_object('result',(v_prior_row->>'result_json')::jsonb,'duplicate',true);
  end if;
  select revision into v_current from public.lingjing_saves where owner_id=v_owner;
  if coalesce(v_current,0)<>p_expected_revision then raise exception 'LJ_SYNC_CONFLICT';end if;
  if p_module->>'version' is distinct from '1' or p_module#>>'{data,ownerAccountId}' is distinct from v_owner
    or jsonb_typeof(p_module#>'{data,tables}') is distinct from 'object'
    or jsonb_typeof(p_module#>'{data,identityImports}') is distinct from 'array'
    or lingjing_private.has_secret(p_module) then raise exception 'LJ_INVALID_COMPANION_MODULE';end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_module#>'{data,tables}') key)
    is distinct from (select array_agg(name order by name) from unnest(v_names) name) then raise exception 'LJ_INVALID_COMPANION_MODULE';end if;
  foreach v_table in array v_names loop
    if jsonb_typeof(p_module#>array['data','tables',v_table]) is distinct from 'array' then raise exception 'LJ_INVALID_COMPANION_MODULE';end if;
    for v_row in select value from jsonb_array_elements(p_module#>array['data','tables',v_table]) loop
      if v_row->>'owner_account_id' is distinct from v_owner then raise exception 'LJ_OWNER_MISMATCH';end if;
    end loop;
  end loop;
  if jsonb_array_length(p_module#>'{data,tables,companion_accounts}')<>1 then raise exception 'LJ_INVALID_COMPANION_MODULE';end if;
  for v_row in select value from jsonb_array_elements(p_module#>'{data,tables,companion_pets}') loop
    v_record:=(v_row->>'data_json')::jsonb;
    if v_record->>'ownerAccountId' is distinct from v_owner or v_record->>'petId' is distinct from v_row->>'pet_id'
      or v_record->>'templateId' is distinct from v_row->>'template_id' or v_record->'revision' is distinct from v_row->'revision'
      or length(coalesce(v_row->>'pet_id','')) not between 1 and 200 then raise exception 'LJ_PET_OWNER_MISMATCH';end if;
  end loop;
  for v_row in select value from jsonb_array_elements(p_module#>'{data,identityImports}') loop
    if v_row->>'target_owner_account_id' is distinct from v_owner then raise exception 'LJ_OWNER_MISMATCH';end if;
  end loop;
  select value into v_row from jsonb_array_elements(p_module#>'{data,tables,companion_actions}') where value->>'action_id'=v_action;
  if v_row is null or v_row->>'operation' is distinct from p_command or v_row->>'request_hash' is distinct from v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
  v_result:=(v_row->>'result_json')::jsonb;
  if v_result->'ok' is distinct from 'true'::jsonb then raise exception 'LJ_INVALID_COMPANION_MODULE';end if;
  if exists(select 1 from lingjing_private.authority_fragments where owner_id=v_owner and module_id<>'companions' and table_states ?| v_names) then raise exception 'LJ_COMPANION_DOMAIN_MIGRATION_REQUIRED';end if;
  select coalesce(jsonb_agg(value->'pet_id'),'[]'::jsonb) into v_pet_ids from jsonb_array_elements(p_module#>'{data,tables,companion_pets}');
  v_previous:=lingjing_private.commit_authority(v_owner,v_global_action,
    jsonb_build_object('companions',jsonb_build_object('module',p_module,'tables','{}'::jsonb,'petIds',v_pet_ids)),p_expected_revision);
  return v_previous||jsonb_build_object('result',v_result,'duplicate',false);
end $$;
revoke all on function lingjing_private.commit_companion_command(jsonb,text,jsonb,jsonb,bigint) from public,anon,authenticated;
grant execute on function lingjing_private.commit_companion_command(jsonb,text,jsonb,jsonb,bigint) to service_role;
commit;

