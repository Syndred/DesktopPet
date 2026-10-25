-- Supabase CLI2.122.0 migration new. Requires08 protected-save CAS and03
-- location/live_actor migrations. Service-only generated game transitions.
begin;
create table lingjing_discovery.permits(
  id uuid primary key,owner_account_id text not null references public.lingjing_accounts(owner_id),auth_uid uuid not null,
  pet_id text not null,spawn_id text not null,spawn_json jsonb not null,session_json jsonb not null,
  status text not null check(status in('active','won','lost','cancelled','expired','captured')),
  revision bigint not null default 1,source text not null check(source in('os','simulated')),scenario_id text,
  created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,updated_at timestamptz not null default clock_timestamp(),
  unique(owner_account_id,id)
);
create unique index lingjing_discovery_one_pending on lingjing_discovery.permits(owner_account_id) where status in('active','won');
create unique index lingjing_discovery_one_spawn_capture on lingjing_discovery.permits(owner_account_id,spawn_id) where status='captured';
create table lingjing_discovery.game_actions(
  owner_account_id text not null references public.lingjing_accounts(owner_id),action_id text not null,
  request_hash text not null check(request_hash~'^[0-9a-f]{64}$'),operation text not null,
  permit_id uuid not null references lingjing_discovery.permits(id),result_json jsonb not null,
  created_at timestamptz not null default clock_timestamp(),primary key(owner_account_id,action_id)
);
create table lingjing_discovery.captures(
  owner_account_id text not null references public.lingjing_accounts(owner_id),permit_id uuid not null,
  pet_id text not null,receipt_json jsonb not null,created_at timestamptz not null default clock_timestamp(),
  primary key(owner_account_id,permit_id),unique(owner_account_id,pet_id),
  foreign key(owner_account_id,permit_id) references lingjing_discovery.permits(owner_account_id,id)
);
alter table lingjing_discovery.permits enable row level security;
alter table lingjing_discovery.game_actions enable row level security;
alter table lingjing_discovery.captures enable row level security;
revoke all on lingjing_discovery.permits,lingjing_discovery.game_actions,lingjing_discovery.captures from public,anon,authenticated;
grant select,insert,update on lingjing_discovery.permits to service_role;
grant select,insert on lingjing_discovery.game_actions,lingjing_discovery.captures to service_role;

create function lingjing_discovery.permit_json(p lingjing_discovery.permits) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',p.id,'ownerAccountId',p.owner_account_id,'authUserId',p.auth_uid,'petId',p.pet_id,
  'sessionId',p.session_json->>'id','session',p.session_json,'spawn',p.spawn_json,'status',p.status,'revision',p.revision,
  'source',p.source,'scenarioId',p.scenario_id,'createdAt',floor(extract(epoch from p.created_at)*1000)::bigint,'expiresAt',floor(extract(epoch from p.expires_at)*1000)::bigint)
$$;
create function lingjing_discovery.encounter_json(p lingjing_discovery.permits) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('encounterId','encounter-'||p.id,'ownerAccountId',p.owner_account_id,
  'scenario',case when p.source='simulated' then 'qa' else 'live' end,'scenarioId',p.scenario_id,'spawn',p.spawn_json,'petId',p.pet_id,
  'status',case when p.status='active' then 'challenging' when p.status='expired' then 'cancelled' else p.status end,
  'revision',p.revision,'createdAt',floor(extract(epoch from p.created_at)*1000)::bigint,'updatedAt',floor(extract(epoch from p.updated_at)*1000)::bigint,
  'cloudPermit',jsonb_build_object('id',p.id,'sessionId',p.session_json->>'id'),'capturePetId',case when p.status='captured' then 'pet-'||p.id else null end,
  'battle',jsonb_build_object('battleId',p.session_json->>'id','petId',p.pet_id,'view',p.session_json->'snapshot','rounds',p.session_json->'rounds',
    'winner',p.session_json->'winner','finished',p.session_json->>'status' in('finished','abandoned'),'adapter','battle-feature',
    'externalStatus',p.session_json->>'status','rules',p.session_json->'rules','cloudAuthority','discovery','permitId',p.id))
$$;
create function lingjing_discovery.row_key(p_row jsonb,p_keys text[]) returns text
language sql immutable set search_path='' as $$
 select lingjing_private.canonical_json(jsonb_agg(p_row->k order by n)) from unnest(p_keys) with ordinality as x(k,n)
$$;
create function lingjing_discovery.merge_rows(p_old jsonb,p_new jsonb,p_keys text[]) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(r order by lingjing_discovery.row_key(r,p_keys) collate "C"),'[]'::jsonb) from(
  select o r from jsonb_array_elements(coalesce(p_old,'[]'::jsonb)) o
    where not exists(select 1 from jsonb_array_elements(coalesce(p_new,'[]'::jsonb)) n where lingjing_discovery.row_key(n,p_keys)=lingjing_discovery.row_key(o,p_keys))
  union all select n from jsonb_array_elements(coalesce(p_new,'[]'::jsonb)) n
 ) rows
$$;
create function lingjing_discovery.fragment(p_owner text) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare
  -- Generated from the actual03 SQLite migration. Test compares every schema.
  v_schemas jsonb:='{"discovery_actions":[{"name":"owner_account_id","type":"TEXT","notnull":1,"pk":1,"dflt_value":null},{"name":"action_id","type":"TEXT","notnull":1,"pk":2,"dflt_value":null},{"name":"request_hash","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"result_json","type":"TEXT","notnull":1,"pk":0,"dflt_value":null}],"discovery_captures":[{"name":"owner_account_id","type":"TEXT","notnull":1,"pk":1,"dflt_value":null},{"name":"encounter_id","type":"TEXT","notnull":1,"pk":2,"dflt_value":null},{"name":"pet_id","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"action_id","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"data_json","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"captured_at","type":"INTEGER","notnull":1,"pk":0,"dflt_value":null}],"discovery_encounters":[{"name":"owner_account_id","type":"TEXT","notnull":1,"pk":1,"dflt_value":null},{"name":"encounter_id","type":"TEXT","notnull":1,"pk":2,"dflt_value":null},{"name":"status","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"revision","type":"INTEGER","notnull":1,"pk":0,"dflt_value":null},{"name":"data_json","type":"TEXT","notnull":1,"pk":0,"dflt_value":null},{"name":"updated_at","type":"INTEGER","notnull":1,"pk":0,"dflt_value":null}],"discovery_memory_tags":[{"name":"owner_account_id","type":"TEXT","notnull":1,"pk":1,"dflt_value":null},{"name":"pet_id","type":"TEXT","notnull":1,"pk":2,"dflt_value":null},{"name":"tag_id","type":"TEXT","notnull":1,"pk":3,"dflt_value":null},{"name":"data_json","type":"TEXT","notnull":1,"pk":0,"dflt_value":null}]}'::jsonb;
  v_tables jsonb;v_schema record;v_rows jsonb;v_key text[];
begin
  select table_states into v_tables from lingjing_private.authority_fragments where owner_id=p_owner and module_id='discovery';
  v_tables:=coalesce(v_tables,'{}'::jsonb);
  for v_schema in select * from jsonb_each(v_schemas) loop
    if v_tables ? v_schema.key and v_tables->v_schema.key->'schema'<>v_schema.value then raise exception 'DISCOVERY_SCHEMA_CONFLICT';end if;
    if not(v_tables ? v_schema.key) then v_tables:=jsonb_set(v_tables,array[v_schema.key],jsonb_build_object('schema',v_schema.value,'rows','[]'::jsonb));end if;
    if v_schema.key='discovery_encounters' then
      select coalesce(jsonb_agg(jsonb_build_object('owner_account_id',p_owner,'encounter_id','encounter-'||p.id,'status',lingjing_discovery.encounter_json(p)->>'status',
        'revision',p.revision,'data_json',lingjing_discovery.encounter_json(p)::text,'updated_at',floor(extract(epoch from p.updated_at)*1000)::bigint)),'[]'::jsonb)
      into v_rows from lingjing_discovery.permits p where p.owner_account_id=p_owner;
      v_key:=array['owner_account_id','encounter_id'];
    elsif v_schema.key='discovery_captures' then
      select coalesce(jsonb_agg(jsonb_build_object('owner_account_id',p_owner,'encounter_id',c.receipt_json->>'encounterId','pet_id',c.pet_id,
        'action_id',c.receipt_json->>'actionId','data_json',c.receipt_json::text,'captured_at',(c.receipt_json->>'capturedAtMs')::bigint)),'[]'::jsonb)
      into v_rows from lingjing_discovery.captures c where c.owner_account_id=p_owner;
      v_key:=array['owner_account_id','encounter_id'];
    elsif v_schema.key='discovery_memory_tags' then
      select coalesce(jsonb_agg(jsonb_build_object('owner_account_id',p_owner,'pet_id',c.pet_id,'tag_id',m->>'id','data_json',m::text)),'[]'::jsonb)
      into v_rows from lingjing_discovery.captures c cross join lateral jsonb_array_elements(c.receipt_json->'memoryTags') m where c.owner_account_id=p_owner;
      v_key:=array['owner_account_id','pet_id','tag_id'];
    else
      select coalesce(jsonb_agg(jsonb_build_object('owner_account_id',p_owner,'action_id','cloud:'||a.action_id,'request_hash',a.request_hash,
        'result_json',jsonb_build_object('ok',true,'data',a.result_json)::text)),'[]'::jsonb)
      into v_rows from lingjing_discovery.game_actions a where a.owner_account_id=p_owner;
      v_key:=array['owner_account_id','action_id'];
    end if;
    v_tables:=jsonb_set(v_tables,array[v_schema.key,'rows'],lingjing_discovery.merge_rows(v_tables->v_schema.key->'rows',v_rows,v_key));
  end loop;
  return jsonb_build_object('tables',v_tables);
end $$;

create function public.lingjing_discovery_game_read(p_actor jsonb,p_op text,p_key text default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner text:=p_actor->>'ownerAccountId';v_result jsonb;
begin
  perform lingjing_discovery.live_actor(p_actor);
  if p_op='permit' then select lingjing_discovery.permit_json(p) into v_result from lingjing_discovery.permits p where p.owner_account_id=v_owner and p.id=p_key::uuid;
  elsif p_op='permits' then select coalesce(jsonb_agg(lingjing_discovery.permit_json(p) order by p.created_at),'[]'::jsonb) into v_result from lingjing_discovery.permits p where p.owner_account_id=v_owner;
  elsif p_op='action' then select jsonb_build_object('requestHash',request_hash,'result',result_json,'operation',operation) into v_result from lingjing_discovery.game_actions where owner_account_id=v_owner and action_id=p_key;
  elsif p_op='capture' then select receipt_json into v_result from lingjing_discovery.captures where owner_account_id=v_owner and permit_id=p_key::uuid;
  elsif p_op='captures' then select coalesce(jsonb_agg(receipt_json order by created_at),'[]'::jsonb) into v_result from lingjing_discovery.captures where owner_account_id=v_owner;
  else raise exception 'UNSUPPORTED_OP';end if;
  return v_result;
end $$;

create function public.lingjing_discovery_game_write(p_actor jsonb,p_op text,p_operation jsonb,p_expected_save_revision bigint,p_fragments jsonb default '{}') returns jsonb
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
        --05 locks the world region FOR SHARE for the rest of this transaction.
        v_context:=public.runtime_territory_capture_context(v_owner,(v_proof->'fix'->>'lat')::double precision,(v_proof->'fix'->>'lng')::double precision);
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

revoke all on function lingjing_discovery.permit_json(lingjing_discovery.permits),lingjing_discovery.encounter_json(lingjing_discovery.permits),lingjing_discovery.row_key(jsonb,text[]),lingjing_discovery.merge_rows(jsonb,jsonb,text[]),lingjing_discovery.fragment(text),public.lingjing_discovery_game_read(jsonb,text,text),public.lingjing_discovery_game_write(jsonb,text,jsonb,bigint,jsonb) from public,anon,authenticated;
grant execute on function lingjing_discovery.permit_json(lingjing_discovery.permits),lingjing_discovery.encounter_json(lingjing_discovery.permits),lingjing_discovery.row_key(jsonb,text[]),lingjing_discovery.merge_rows(jsonb,jsonb,text[]),lingjing_discovery.fragment(text),public.lingjing_discovery_game_read(jsonb,text,text),public.lingjing_discovery_game_write(jsonb,text,jsonb,bigint,jsonb) to service_role;
commit;
