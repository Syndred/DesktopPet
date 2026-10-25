-- CLI migration new. Correct JSON operator precedence in the already deployed function.
-- Preserve world, account, challenge, action and inventory data. Coordinator deploys.
begin;
create or replace function public.runtime_territory_write(
  p_owner text,p_actor_uid uuid,p_device_id text,p_actor_session uuid,p_kind text,p_action_id text,p_request_hash text,p_input jsonb,p_payload jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  prior public.runtime_territory_actions%rowtype;
  region public.runtime_territory_regions%rowtype;
  challenge public.runtime_territory_challenges%rowtype;
  saved public.lingjing_saves%rowtype;
  pt extensions.geometry;
  actor jsonb;permit jsonb;scenario text;location_world_mode text;
  lat_index integer; lng_index integer; region_id text;
  current_day date=(now() at time zone 'Asia/Shanghai')::date;
  attempts integer;
  pet_row jsonb;
  result jsonb;
  committed jsonb;
  winner text;
  old_owner text;
  new_session_id text;
begin
  perform lingjing_private.lock_save_owner(p_owner);
  perform public.runtime_territory_check_actor(p_owner,p_actor_uid,p_device_id,p_actor_session);
  if p_actor_uid is null or p_device_id is null or length(p_device_id)>160 or p_owner is null
    or p_action_id is null or p_action_id !~ '^[a-zA-Z0-9:_-]{1,160}$'
    or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_kind not in ('locate','challenge','act','settle','garrison') then raise exception 'INVALID_ACTION'; end if;
  -- An actor/action advisory lock serializes a lost-response retry before any
  -- region/attempt mutation, even if two HTTP processes submit simultaneously.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner||':'||p_action_id,0));
  if p_kind='garrison' then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('garrison:'||p_owner,0)); end if;
  select * into prior from public.runtime_territory_actions where owner_account_id=p_owner and action_id=p_action_id;
  if found then
    if prior.kind<>p_kind or prior.request_hash<>p_request_hash then raise exception 'ACTION_ID_REUSED'; end if;
    return prior.result_json||jsonb_build_object('replayed',true);
  end if;
  actor=jsonb_build_object('schemaVersion',1,'authority','live','authKind','supabase','authUserId',p_actor_uid,'ownerAccountId',p_owner,'deviceId',p_device_id,'sessionId',p_actor_session);
  if p_kind='locate' then
    permit=public.lingjing_discovery_take_location(actor,(p_input->>'locationReceiptId')::uuid,'territory:read','','territory:'||p_request_hash);
    pt=public.runtime_territory_verified_point(p_owner,p_device_id,permit);
    scenario=case when permit->>'source'='simulated' then permit#>>'{fix,scenarioId}' else null end;location_world_mode=case when scenario is null then 'live' else 'simulated' end;
    lat_index=floor(extensions.st_y(pt)/0.006); lng_index=floor(extensions.st_x(pt)/0.006);
    region_id=case when scenario is null then '' else 'qa:'||scenario||':' end||'territory:'||lat_index||':'||lng_index;
    insert into public.runtime_territory_regions(id,name,world_mode,scenario_id,boundary,center) values(region_id,'附近的庭院',location_world_mode,scenario,
      extensions.st_makeenvelope(lng_index*.006,lat_index*.006,(lng_index+1)*.006,(lat_index+1)*.006,4326),
      extensions.st_setsrid(extensions.st_makepoint((lng_index+.5)*.006,(lat_index+.5)*.006),4326)::extensions.geography)
      on conflict(id) do nothing;
    insert into public.runtime_territory_views(owner_account_id,territory_id,last_seen_at)
      select p_owner,id,now() from public.runtime_territory_regions where scenario_id is not distinct from scenario and extensions.st_dwithin(center,pt::extensions.geography,1000)
      on conflict(owner_account_id,territory_id) do update set last_seen_at=excluded.last_seen_at;
    select * into region from public.runtime_territory_regions where id=region_id;
    result=jsonb_build_object('ok',true,'data',public.runtime_territory_view(region),'serverTime',floor(extract(epoch from now())*1000));
  else
    if p_kind in ('act','settle') then
      select territory_id into region_id from public.runtime_territory_challenges where session_id=p_input->>'sessionId' and owner_account_id=p_owner;
      if not found then raise exception 'NOT_PARTICIPANT'; end if;
    else region_id=p_input->>'territoryId'; end if;
    -- The account lock is already held: owner -> region -> challenge ordering.
    select * into region from public.runtime_territory_regions where id=region_id for update;
    if not found then raise exception 'TERRITORY_NOT_FOUND'; end if;
    if p_kind in ('act','settle') then
      select * into challenge from public.runtime_territory_challenges where session_id=p_input->>'sessionId' and owner_account_id=p_owner for update;
      if not found then raise exception 'NOT_PARTICIPANT'; end if;
      if challenge.actor_uid is distinct from p_actor_uid then raise exception 'ACTOR_OWNER_MISMATCH'; end if;
      if challenge.status in ('settled','superseded') then
        if p_kind<>'settle' then raise exception 'BATTLE_NOT_ACTIVE'; end if;
        result=challenge.result_json||jsonb_build_object('replayed',true);
      elsif p_kind='act' and challenge.expires_at<now() then raise exception 'CHALLENGE_EXPIRED'; end if;
    end if;
    if result is null and p_kind='challenge' then
      permit=public.lingjing_discovery_take_location(actor,(p_input->>'locationReceiptId')::uuid,'territory:challenge',region.id,'territory:'||p_request_hash);
      pt=public.runtime_territory_verified_point(p_owner,p_device_id,permit);
      if region.scenario_id is distinct from (case when permit->>'source'='simulated' then permit#>>'{fix,scenarioId}' else null end) then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
      if not extensions.st_covers(region.boundary,pt) then raise exception 'OUT_OF_TERRITORY_RANGE'; end if;
      if region.owner_account_id=p_owner then raise exception 'ALREADY_OWNED'; end if;
      if (p_input->>'expectedTerritoryRevision')::bigint is distinct from region.revision then raise exception 'TERRITORY_CONFLICT'; end if;
      perform 1 from public.lingjing_accounts where owner_id=p_owner for update;
      select * into saved from public.lingjing_saves where owner_id=p_owner;
      if not found then raise exception 'CLOUD_GARDEN_NOT_INITIALIZED'; end if;
      if (p_payload->>'accountRevision')::bigint is distinct from saved.revision then raise exception 'SYNC_CONFLICT'; end if;
      select value into pet_row from jsonb_array_elements(case when saved.envelope#>'{data,modules,companions}' is not null then saved.envelope#>'{data,modules,companions,data,tables,companion_pets}' else saved.envelope#>'{data,tables,companion_pets,rows}' end) where value->>'owner_account_id'=p_owner and value->>'pet_id'=p_input->>'petId';
      if pet_row is null then raise exception 'PET_NOT_OWNED'; end if;
      if p_payload#>>'{battle,player,petId}' is distinct from pet_row->>'pet_id'
        or p_payload#>>'{battle,context,territoryId}' is distinct from region.id
        or p_payload#>>'{battle,context,territoryRevision}' is distinct from region.revision::text
        or p_payload#>>'{battle,mode}' is distinct from 'territory'
        or p_payload#>>'{battle,context,authority}' is distinct from 'cloud'
        or p_payload#>>'{battle,snapshot,round}' is distinct from '0' then raise exception 'INVALID_BATTLE_RECEIPT'; end if;
      insert into public.runtime_territory_attempts values(p_owner,current_day,0) on conflict do nothing;
      select count into attempts from public.runtime_territory_attempts where owner_account_id=p_owner and day_key=current_day for update;
      if attempts>=2 then raise exception 'DAILY_INVASIONS_USED'; end if;
      new_session_id=p_payload#>>'{battle,id}';
      if new_session_id is null or length(new_session_id)>160 then raise exception 'INVALID_BATTLE_RECEIPT'; end if;
      if p_input->>'locationReceiptId' is distinct from permit->>'id' then raise exception 'LOCATION_PERMIT_REQUIRED'; end if;
      insert into public.runtime_territory_challenges(session_id,owner_account_id,actor_uid,device_id,territory_id,territory_revision,pet_id,location_receipt_id,battle_json,status)
        values(new_session_id,p_owner,p_actor_uid,p_device_id,region.id,region.revision,pet_row->>'pet_id',p_input->>'locationReceiptId',p_payload->'battle','active');
      update public.runtime_territory_attempts set count=count+1 where owner_account_id=p_owner and day_key=current_day;
      insert into public.runtime_territory_logs(territory_id,actor_owner_id,action,old_owner_id,new_owner_id,session_id) values(region.id,p_owner,'challenge',region.owner_account_id,region.owner_account_id,new_session_id);
      result=jsonb_build_object('ok',true,'data',jsonb_build_object('sessionId',new_session_id,'territoryId',region.id,'remainingAttempts',1-attempts),'battle',p_payload->'battle');
    elsif result is null and p_kind='act' then
      if challenge.status<>'active' then raise exception 'BATTLE_NOT_ACTIVE'; end if;
      if (p_payload->>'challengeRevision')::bigint is distinct from challenge.revision
        or (p_input->>'expectedRound')::integer is distinct from (challenge.battle_json#>>'{snapshot,round}')::integer+1 then raise exception 'ROUND_CONFLICT'; end if;
      if p_payload#>'{battle,player}' is distinct from challenge.battle_json->'player'
        or p_payload#>'{battle,enemy}' is distinct from challenge.battle_json->'enemy'
        or p_payload#>'{battle,context}' is distinct from challenge.battle_json->'context'
        or p_payload#>'{battle,rules}' is distinct from challenge.battle_json->'rules'
        or (p_payload#>>'{battle,snapshot,round}')::integer<>(challenge.battle_json#>>'{snapshot,round}')::integer+1
        or p_payload#>>'{battle,mode}' is distinct from 'territory' then raise exception 'INVALID_BATTLE_RECEIPT'; end if;
      update public.runtime_territory_challenges set revision=revision+1,battle_json=p_payload->'battle',status=case when p_payload#>>'{battle,status}'='finished' then 'finished' else 'active' end,updated_at=now() where session_id=challenge.session_id;
      result=jsonb_build_object('ok',true,'data',p_payload->'battle');
    elsif result is null and p_kind='settle' then
      if challenge.status<>'finished' or challenge.battle_json->>'status'<>'finished' then raise exception 'BATTLE_UNFINISHED'; end if;
      winner=challenge.battle_json->>'winner';
      if winner is null or winner not in ('player','enemy') or jsonb_typeof(challenge.battle_json->'rounds') is distinct from 'array' or jsonb_array_length(challenge.battle_json->'rounds')<1
        or jsonb_typeof(challenge.battle_json#>'{snapshot,player,hp}') is distinct from 'number' or jsonb_typeof(challenge.battle_json#>'{snapshot,enemy,hp}') is distinct from 'number'
        or (winner='player' and (challenge.battle_json#>>'{snapshot,enemy,hp}')::numeric<>0)
        or (winner='enemy' and (challenge.battle_json#>>'{snapshot,player,hp}')::numeric<>0) then raise exception 'INVALID_BATTLE_RECEIPT'; end if;
      if region.revision<>challenge.territory_revision then
        -- A finished stale battle cannot overwrite a concurrent winner or mint
        -- rewards. Persist this terminal rejection so lost-response retry agrees.
        result=jsonb_build_object('ok',false,'code','TERRITORY_CONFLICT','message','领地归属已更新，请重新查看','data',jsonb_build_object('sessionId',challenge.session_id,'territoryId',region.id));
        update public.runtime_territory_challenges set status='superseded',result_json=result,updated_at=now() where session_id=challenge.session_id;
      else
        if winner='player' then
          permit=public.lingjing_discovery_take_location(actor,(p_input->>'locationReceiptId')::uuid,'territory:settle',challenge.session_id,'territory:'||p_request_hash);
          pt=public.runtime_territory_verified_point(p_owner,p_device_id,permit);
          if region.scenario_id is distinct from (case when permit->>'source'='simulated' then permit#>>'{fix,scenarioId}' else null end) then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
          if not extensions.st_covers(region.boundary,pt) then raise exception 'OUT_OF_TERRITORY_RANGE';end if;
        end if;
        if p_payload#>>'{result,data,territoryId}' is distinct from region.id or p_payload#>>'{result,data,petId}' is distinct from challenge.pet_id or p_payload#>>'{result,data,won}' is distinct from (winner='player')::text
          or ((p_payload->'settledBattle')-'reward') is distinct from challenge.battle_json then raise exception 'INVALID_SETTLEMENT_PROOF'; end if;
        committed=public.runtime_garden_commit_authoritative(p_owner,p_actor_uid,p_device_id,p_actor_session,p_action_id,p_request_hash,(p_payload->>'accountRevision')::bigint,p_payload->'envelope',p_payload->'result');
        old_owner=region.owner_account_id;
        update public.runtime_territory_regions set owner_account_id=case when winner='player' then p_owner else owner_account_id end,
          revision=revision+case when winner='player' then 1 else 0 end,garrison_pet_id=case when winner='player' then null else garrison_pet_id end,
          defender_json=case when winner='player' then null else defender_json end,
          occupied_at=case when winner='player' then now() else occupied_at end,updated_at=now() where id=region.id returning * into region;
        result=jsonb_build_object('ok',true,'data',(p_payload#>'{result,data}')||jsonb_build_object('territoryRevision',region.revision,'ownerAccountId',region.owner_account_id),'receipt',committed,'battle',p_payload->'settledBattle','territory',public.runtime_territory_view(region));
        update public.runtime_territory_challenges set status='settled',result_json=result,battle_json=p_payload->'settledBattle',revision=revision+1,updated_at=now() where session_id=challenge.session_id;
        insert into public.runtime_territory_logs(territory_id,actor_owner_id,action,old_owner_id,new_owner_id,session_id) values(region.id,p_owner,case when winner='player' then 'occupy' else 'defend' end,old_owner,region.owner_account_id,challenge.session_id);
      end if;
    elsif result is null and p_kind='garrison' then
      if region.owner_account_id is distinct from p_owner then raise exception 'TERRITORY_NOT_OWNED'; end if;
      if (p_input->>'expectedTerritoryRevision')::bigint is distinct from region.revision then raise exception 'TERRITORY_CONFLICT'; end if;
      if p_input->>'petId' is not null then
        select * into saved from public.lingjing_saves where owner_id=p_owner;
        select value into pet_row from jsonb_array_elements(case when saved.envelope#>'{data,modules,companions}' is not null then saved.envelope#>'{data,modules,companions,data,tables,companion_pets}' else saved.envelope#>'{data,tables,companion_pets,rows}' end) where value->>'owner_account_id'=p_owner and value->>'pet_id'=p_input->>'petId';
        if pet_row is null or p_payload#>>'{defender,petId}' is distinct from pet_row->>'pet_id' then raise exception 'PET_NOT_OWNED'; end if;
      end if;
      committed=public.runtime_garden_commit_authoritative(p_owner,p_actor_uid,p_device_id,p_actor_session,p_action_id,p_request_hash,(p_payload->>'accountRevision')::bigint,p_payload->'envelope',p_payload->'result');
      if p_input->>'petId' is not null then
        update public.runtime_territory_regions set garrison_pet_id=null,defender_json=null,revision=revision+1,updated_at=now()
          where owner_account_id=p_owner and garrison_pet_id=p_input->>'petId' and id<>region.id;
      end if;
      update public.runtime_territory_regions set revision=revision+1,garrison_pet_id=p_input->>'petId',defender_json=case when p_input->>'petId' is null then null else p_payload->'defender' end,updated_at=now() where id=region.id returning * into region;
      result=jsonb_build_object('ok',true,'data',jsonb_build_object('territoryId',region.id,'petId',region.garrison_pet_id,'territoryRevision',region.revision),'receipt',committed,'territory',public.runtime_territory_view(region));
      insert into public.runtime_territory_logs(territory_id,actor_owner_id,action,old_owner_id,new_owner_id) values(region.id,p_owner,'garrison',p_owner,p_owner);
    end if;
  end if;
  if result is null then raise exception 'INVALID_TERRITORY_COMMAND'; end if;
  result=result||jsonb_build_object('actionId',p_action_id,'requestHash',p_request_hash,'replayed',false,'serverTime',floor(extract(epoch from now())*1000));
  insert into public.runtime_territory_actions(owner_account_id,action_id,kind,request_hash,result_json) values(p_owner,p_action_id,p_kind,p_request_hash,result);
  return result;
end;
$$;
revoke all on function public.runtime_territory_write(text,uuid,text,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.runtime_territory_write(text,uuid,text,uuid,text,text,text,jsonb,jsonb) to service_role;

commit;
