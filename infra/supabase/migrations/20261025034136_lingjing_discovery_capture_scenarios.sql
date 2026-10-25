-- Supabase CLI2.122.0 migration new. Append-only update after published03 gameSQL.
-- Align approved05 scenario-scoped world context; reject cross-world capture.
begin;
create or replace function public.lingjing_discovery_game_write(p_actor jsonb,p_op text,p_operation jsonb,p_expected_save_revision bigint,p_fragments jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_owner text:=p_actor->>'ownerAccountId';v_action text:=p_operation->>'actionId';v_hash text:=p_operation->>'requestHash';
  v_prior lingjing_discovery.game_actions;v_permit lingjing_discovery.permits;v_id uuid;v_result jsonb;v_receipt jsonb;v_proof jsonb;
  v_save jsonb;v_pet jsonb;v_pet_row jsonb;v_session jsonb:=p_operation->'session';v_status text:=p_operation->>'status';v_context jsonb;
begin
  -- Shared order: save-owner lock, canonical actor/domain rows, authority commit.
  perform lingjing_private.lock_save_owner(v_owner);
  perform lingjing_discovery.live_actor(p_actor);
  if coalesce(v_action,'')!~'^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$' or coalesce(v_hash,'')!~'^[0-9a-f]{64}$' then raise exception 'INVALID_ACTION';end if;
  select * into v_prior from lingjing_discovery.game_actions where owner_account_id=v_owner and action_id=v_action;
  if found then
    if v_prior.request_hash<>v_hash or v_prior.operation<>p_op then raise exception 'ACTION_ID_CONFLICT';end if;
    return v_prior.result_json;
  end if;
  if jsonb_typeof(p_fragments)<>'object' or exists(select 1 from jsonb_object_keys(p_fragments) k where k not in('companions','garden')) then raise exception 'DISCOVERY_FRAGMENT_FORBIDDEN';end if;
  if p_op='reserve' then
    v_id:=(p_operation->>'id')::uuid;
    if v_session->>'id'<>'battle-cloud-'||v_id or v_session->>'mode'<>'wild' or v_session->>'status'<>'active' or (v_session->'snapshot'->>'round')::int<>0 or v_session->'player'->>'petId'<>p_operation->>'petId' then raise exception 'INVALID_BATTLE_SESSION';end if;
    if not exists(select 1 from lingjing_private.owned_pet_ids where owner_id=v_owner and pet_id=p_operation->>'petId') then raise exception 'CLOUD_PET_NOT_SYNCED';end if;
    select envelope into v_save from public.lingjing_saves where owner_id=v_owner;
    if v_save->'data'->'modules' ? 'companions' then
      select r into v_pet_row from jsonb_array_elements(v_save->'data'->'modules'->'companions'->'data'->'tables'->'companion_pets') r where r->>'owner_account_id'=v_owner and r->>'pet_id'=p_operation->>'petId';
    else
      select r into v_pet_row from jsonb_array_elements(v_save->'data'->'tables'->'companion_pets'->'rows') r where r->>'owner_account_id'=v_owner and r->>'pet_id'=p_operation->>'petId';
    end if;
    if v_pet_row is null or (v_pet_row->>'revision')::bigint<>(p_operation->>'expectedPetRevision')::bigint then raise exception 'CLOUD_PET_NOT_SYNCED';end if;
    v_pet:=(v_pet_row->>'data_json')::jsonb;
    if v_pet->>'ownerAccountId'<>v_owner or v_pet->>'element'<>v_session->'player'->>'element' or v_pet->'resource'<>v_session->'player'->'resource' then raise exception 'CLOUD_PET_NOT_SYNCED';end if;
    if exists(select 1 from lingjing_discovery.permits where owner_account_id=v_owner and spawn_id=p_operation->'spawn'->>'id' and status='captured') then raise exception 'SPAWN_ALREADY_CAPTURED';end if;
    update lingjing_discovery.permits set status='expired',revision=revision+1,updated_at=clock_timestamp() where owner_account_id=v_owner and status in('active','won') and expires_at<=clock_timestamp();
    if exists(select 1 from lingjing_discovery.permits where owner_account_id=v_owner and status in('active','won')) then raise exception 'ENCOUNTER_PENDING';end if;
    v_proof:=public.lingjing_discovery_take_location(p_actor,(p_operation->>'locationProofId')::uuid,'begin',p_operation->'spawn'->>'id','reserve:'||v_id);
    insert into lingjing_discovery.permits(id,owner_account_id,auth_uid,pet_id,spawn_id,spawn_json,session_json,status,source,scenario_id,expires_at)
      values(v_id,v_owner,(p_actor->>'authUserId')::uuid,p_operation->>'petId',p_operation->'spawn'->>'id',p_operation->'spawn',v_session,'active',v_proof->>'source',v_proof->'fix'->>'scenarioId',clock_timestamp()+interval '30 minutes') returning * into v_permit;
    v_result:=jsonb_build_object('id',v_id,'sessionId',v_session->>'id','expiresAt',floor(extract(epoch from v_permit.expires_at)*1000)::bigint);
  else
    v_id:=(p_operation->>'permitId')::uuid;
    select * into v_permit from lingjing_discovery.permits where owner_account_id=v_owner and id=v_id for update;
    if not found then raise exception 'PERMIT_NOT_FOUND';end if;
    if p_op='recordExistingCapture' then
      select receipt_json into v_result from lingjing_discovery.captures where owner_account_id=v_owner and permit_id=v_id;
      if v_result is null then raise exception 'CAPTURE_NOT_FOUND';end if;
      v_result:=v_result||jsonb_build_object('duplicate',true);
    else
      if v_permit.revision<>(p_operation->>'expectedRevision')::bigint then raise exception 'REVISION_CONFLICT';end if;
      if p_op='advance' then
        if v_permit.status<>'active' or v_permit.expires_at<=clock_timestamp() then raise exception 'BATTLE_FINISHED';end if;
        if v_session->>'id'<>v_permit.session_json->>'id' or v_session->'rules'<>v_permit.session_json->'rules' or v_session->'player'<>v_permit.session_json->'player' or v_session->'enemy'<>v_permit.session_json->'enemy' then raise exception 'INVALID_BATTLE_SESSION';end if;
        if (p_operation->>'expectedRound')::int<>(v_permit.session_json->'snapshot'->>'round')::int+1 or (v_session->'snapshot'->>'round')::int<>(p_operation->>'expectedRound')::int or jsonb_array_length(v_session->'rounds')<>jsonb_array_length(v_permit.session_json->'rounds')+1 then raise exception 'ROUND_CONFLICT';end if;
        if v_status not in('active','won','lost') or (v_status='active')<>(v_session->>'status'='active') or v_status='won' and v_session->>'winner'<>'player' or v_status='lost' and v_session->>'winner'<>'enemy' then raise exception 'INVALID_BATTLE_SESSION';end if;
        if v_status in('won','lost') and (not(p_fragments ? 'companions') or not(p_fragments ? 'garden') or v_session->'reward'->>'applied' is distinct from 'true') then raise exception 'CLOUD_REWARD_ADAPTER_REQUIRED';end if;
        update lingjing_discovery.permits set session_json=v_session,status=v_status,revision=revision+1,updated_at=clock_timestamp() where id=v_id;
        v_result:=v_session;
      elsif p_op='cancel' then
        if v_permit.status='captured' then raise exception 'CAPTURE_ALREADY_CONFIRMED';end if;
        if v_session->>'id'<>v_permit.session_json->>'id' or v_session->'snapshot'<>v_permit.session_json->'snapshot' or v_session->'rounds'<>v_permit.session_json->'rounds' then raise exception 'INVALID_BATTLE_SESSION';end if;
        update lingjing_discovery.permits set session_json=v_session,status='cancelled',revision=revision+1,updated_at=clock_timestamp() where id=v_id;
        v_result:=v_session;
      elsif p_op='claim' then
        if v_permit.status<>'won' or v_permit.session_json->>'winner'<>'player' then raise exception 'VICTORY_REQUIRED';end if;
        if v_permit.expires_at<=clock_timestamp() then raise exception 'ENCOUNTER_EXPIRED';end if;
        v_proof:=public.lingjing_discovery_take_location(p_actor,(p_operation->>'locationProofId')::uuid,'capture',v_id::text,'capture:'||v_id);
        if v_permit.source is distinct from v_proof->>'source' or v_permit.scenario_id is distinct from v_proof->'fix'->>'scenarioId' then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
        --05 locks the world region FOR SHARE for the rest of this transaction.
        v_context:=public.runtime_territory_capture_context(v_owner,(v_proof->'fix'->>'lat')::double precision,(v_proof->'fix'->>'lng')::double precision,v_permit.scenario_id);
        if v_context is distinct from p_operation->'expectedTerritoryContext' then raise exception 'TERRITORY_CONFLICT';end if;
        v_receipt:=p_operation->'capture';
        if v_receipt->>'ownerAccountId'<>v_owner or v_receipt->>'petId'<>'pet-'||v_id or v_receipt->>'battleId'<>v_permit.session_json->>'id' or v_receipt->>'encounterId'<>'encounter-'||v_id or not(p_fragments ? 'companions') then raise exception 'INVALID_CAPTURE_RECEIPT';end if;
        --02's trusted pure constructor supplies the exact canonical instance.08
        -- registers its original ID only as part of this companions fragment.
        if not(coalesce(p_fragments->'companions'->'petIds','[]'::jsonb) ? ('pet-'||v_id)) then raise exception 'COMPANIONS_AUTHORITY_REQUIRED';end if;
        insert into lingjing_discovery.captures(owner_account_id,permit_id,pet_id,receipt_json) values(v_owner,v_id,'pet-'||v_id,v_receipt);
        update lingjing_discovery.permits set status='captured',revision=revision+1,updated_at=clock_timestamp() where id=v_id;
        v_result:=v_receipt;
      else raise exception 'UNSUPPORTED_OP';end if;
    end if;
  end if;
  insert into lingjing_discovery.game_actions(owner_account_id,action_id,request_hash,operation,permit_id,result_json) values(v_owner,v_action,v_hash,p_op,v_id,v_result);
  -- Domain rows, consumption, new companion/reward fragments and common save
  -- revision roll back together if CAS, validation or any later step fails.
  perform lingjing_private.commit_authority(v_owner,'discovery:'||encode(sha256(convert_to(v_action,'UTF8')),'hex'),p_fragments||jsonb_build_object('discovery',lingjing_discovery.fragment(v_owner)),p_expected_save_revision);
  return v_result;
end $$;
revoke all on function public.lingjing_discovery_game_write(jsonb,text,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.lingjing_discovery_game_write(jsonb,text,jsonb,bigint,jsonb) to service_role;
commit;
