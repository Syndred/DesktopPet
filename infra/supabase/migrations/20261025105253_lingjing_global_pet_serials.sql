-- Created by Supabase CLI migration new before the fresh-session handoff.
-- Additive sidecar only: never UPDATE historical pets, saves, actions or archives.
-- Requires the published identity/actor, discovery and companion migrations.
begin;
-- Serialize the short historical backfill with every existing owner-lock writer.
lock table public.lingjing_accounts in exclusive mode;

create table lingjing_private.global_serial_templates(template_id text primary key);
insert into lingjing_private.global_serial_templates values
 ('big-fish-gentle'),('big-fish-cheerful'),('big-fish-foodie'),('animal-shiba'),
 ('animal-hat-cat'),('animal-white-fox'),('animal-wood-deer'),('animal-earth-pangolin');
create table lingjing_private.global_serial_counters(
 namespace text not null check(namespace='live' or namespace~'^qa:[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$'),
 template_id text not null references lingjing_private.global_serial_templates(template_id),
 last_serial numeric not null default 0 check(last_serial>=0 and scale(last_serial)=0),
 primary key(namespace,template_id)
);
create index global_serial_counters_template_idx on lingjing_private.global_serial_counters(template_id);
create table lingjing_private.global_pet_serials(
 namespace text not null,template_id text not null,
 global_serial numeric not null check(global_serial>0 and scale(global_serial)=0),
 owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
 spawn_id text,pet_id text,created_at timestamptz not null default clock_timestamp(),
 primary key(namespace,template_id,global_serial),
 foreign key(namespace,template_id) references lingjing_private.global_serial_counters(namespace,template_id),
 unique(namespace,owner_id,spawn_id),unique(owner_id,pet_id),
 check(spawn_id is not null or pet_id is not null),
 check(spawn_id is null or length(spawn_id) between 1 and 180),
 check(pet_id is null or length(pet_id) between 1 and 200)
);
-- A server-issued QA grant leaves a tombstone even after DELETE/expiry. A revoked
-- device can never become a live allocator merely because its grant disappeared.
create table lingjing_private.global_serial_qa_scopes(
 auth_uid uuid not null references auth.users(id) on delete restrict,device_id text not null,
 namespace text not null check(namespace~'^qa:[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$'),
 primary key(auth_uid,device_id)
);
insert into lingjing_private.global_serial_qa_scopes
 select auth_uid,device_id,'qa:'||scenario_id from lingjing_discovery.location_test_grants;
alter table lingjing_private.global_serial_templates enable row level security;
alter table lingjing_private.global_serial_counters enable row level security;
alter table lingjing_private.global_pet_serials enable row level security;
alter table lingjing_private.global_serial_qa_scopes enable row level security;
revoke all on lingjing_private.global_serial_templates,lingjing_private.global_serial_counters,
 lingjing_private.global_pet_serials,lingjing_private.global_serial_qa_scopes from public,anon,authenticated,service_role;
grant select on lingjing_private.global_serial_templates to service_role;
grant select,insert,update on lingjing_private.global_serial_counters,lingjing_private.global_pet_serials,
 lingjing_private.global_serial_qa_scopes to service_role;

create function lingjing_private.remember_global_serial_qa_scope() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 insert into lingjing_private.global_serial_qa_scopes(auth_uid,device_id,namespace)
 values(new.auth_uid,new.device_id,'qa:'||new.scenario_id)
 on conflict(auth_uid,device_id) do update set namespace=excluded.namespace;
 return new;
end $$;
create trigger global_serial_remember_qa after insert or update on lingjing_discovery.location_test_grants
 for each row execute function lingjing_private.remember_global_serial_qa_scope();

create function lingjing_private.guard_global_serial_identity() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'LJ_GLOBAL_SERIAL_IMMUTABLE';end if;
 if tg_table_name='global_serial_counters' then
  if new.namespace is distinct from old.namespace or new.template_id is distinct from old.template_id
    or new.last_serial<old.last_serial then raise exception 'LJ_GLOBAL_SERIAL_IMMUTABLE';end if;
 else
  if new.namespace is distinct from old.namespace or new.template_id is distinct from old.template_id
    or new.global_serial is distinct from old.global_serial or new.owner_id is distinct from old.owner_id
    or new.spawn_id is distinct from old.spawn_id or new.created_at is distinct from old.created_at
    or old.pet_id is not null and new.pet_id is distinct from old.pet_id
    then raise exception 'LJ_GLOBAL_SERIAL_IMMUTABLE';end if;
 end if;
 return new;
end $$;
create trigger global_serial_counter_immutable before update or delete on lingjing_private.global_serial_counters
 for each row execute function lingjing_private.guard_global_serial_identity();
create trigger global_serial_registry_immutable before update or delete on lingjing_private.global_pet_serials
 for each row execute function lingjing_private.guard_global_serial_identity();

create function lingjing_private.global_serial_actor_namespace(p_actor jsonb) returns text
-- Private definer holds the service-owned grant against revoke/update without
-- granting workers UPDATE permission on the QA authorization table.
language plpgsql security definer set search_path='' as $$
declare v_grant lingjing_discovery.location_test_grants;v_scope text;
begin
 perform lingjing_discovery.live_actor(p_actor);
 select * into v_grant from lingjing_discovery.location_test_grants
  where auth_uid=(p_actor->>'authUserId')::uuid and device_id=p_actor->>'deviceId' for share;
 if found then
  if v_grant.expires_at<=clock_timestamp() then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';end if;
  return 'qa:'||v_grant.scenario_id;
 end if;
 select namespace into v_scope from lingjing_private.global_serial_qa_scopes
  where auth_uid=(p_actor->>'authUserId')::uuid and device_id=p_actor->>'deviceId';
 if found or p_actor->>'allowSimulatedLocation'='true' then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';end if;
 return 'live';
end $$;
create function lingjing_private.global_serial_owner_namespace(p_owner text,p_allow_expired boolean default false) returns text
language plpgsql security invoker set search_path='' as $$
declare v_scopes text[];
begin
 select array_agg(distinct q.namespace order by q.namespace) into v_scopes
 from public.lingjing_accounts a join lingjing_private.global_serial_qa_scopes q on q.auth_uid=a.auth_user_id where a.owner_id=p_owner;
 if cardinality(v_scopes)>1 then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_CONFLICT';end if;
 if cardinality(v_scopes)=1 then
  if not p_allow_expired and not exists(select 1 from lingjing_discovery.location_test_grants g join public.lingjing_accounts a on a.auth_user_id=g.auth_uid
   where a.owner_id=p_owner and 'qa:'||g.scenario_id=v_scopes[1] and g.expires_at>clock_timestamp()) then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';end if;
  return v_scopes[1];
 end if;
 return 'live';
end $$;
create function lingjing_private.lock_global_serial_counters(p_namespaces text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare v record;
begin
 -- Every type in a namespace is locked in the same order before any increment.
 -- This also covers fragments containing several species in opposite orders.
 for v in select n.namespace,t.template_id from unnest(p_namespaces) n(namespace)
  cross join lingjing_private.global_serial_templates t group by n.namespace,t.template_id
  order by n.namespace collate "C",t.template_id collate "C" loop
  insert into lingjing_private.global_serial_counters(namespace,template_id) values(v.namespace,v.template_id) on conflict do nothing;
  perform 1 from lingjing_private.global_serial_counters where namespace=v.namespace and template_id=v.template_id for update;
 end loop;
end $$;
create function lingjing_private.lock_global_serial_owner_counters(p_owner text) returns void
language sql security invoker set search_path='' as $$
 select lingjing_private.lock_global_serial_counters(array(
  select 'live' union select q.namespace from lingjing_private.global_serial_qa_scopes q join public.lingjing_accounts a on a.auth_user_id=q.auth_uid where a.owner_id=p_owner
  union select 'qa:'||scenario_id from lingjing_discovery.permits where owner_account_id=p_owner and source='simulated'
 ))
$$;
create function lingjing_private.global_serial_json(p lingjing_private.global_pet_serials) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('namespace',p.namespace,'ownerAccountId',p.owner_id,
  'spawnId',p.spawn_id,'petId',p.pet_id,'templateId',p.template_id,'globalSerial',p.global_serial::text))
$$;
create function lingjing_private.ensure_wild_global_serial(p_owner text,p_namespace text,p_spawn_id text,p_template_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_row lingjing_private.global_pet_serials;v_serial numeric;
begin
 perform lingjing_private.lock_save_owner(p_owner);
 if length(coalesce(p_spawn_id,'')) not between 1 and 180 or not exists(select 1 from lingjing_private.global_serial_templates where template_id=p_template_id)
  then raise exception 'LJ_GLOBAL_SERIAL_TEMPLATE_INVALID';end if;
 select * into v_row from lingjing_private.global_pet_serials where namespace=p_namespace and owner_id=p_owner and spawn_id=p_spawn_id;
 if found then
  if v_row.template_id is distinct from p_template_id then raise exception 'LJ_GLOBAL_SERIAL_TEMPLATE_MISMATCH';end if;
  return lingjing_private.global_serial_json(v_row);
 end if;
 perform lingjing_private.lock_global_serial_counters(array[p_namespace]);
 update lingjing_private.global_serial_counters set last_serial=trunc(last_serial+1)
  where namespace=p_namespace and template_id=p_template_id returning last_serial into v_serial;
 insert into lingjing_private.global_pet_serials(namespace,template_id,global_serial,owner_id,spawn_id)
  values(p_namespace,p_template_id,v_serial,p_owner,p_spawn_id) returning * into v_row;
 return lingjing_private.global_serial_json(v_row);
end $$;
create function lingjing_private.bind_wild_global_serial(p_owner text,p_namespace text,p_spawn_id text,p_template_id text,p_pet_id text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_row lingjing_private.global_pet_serials;v_existing lingjing_private.global_pet_serials;
begin
 perform lingjing_private.ensure_wild_global_serial(p_owner,p_namespace,p_spawn_id,p_template_id);
 select * into v_row from lingjing_private.global_pet_serials where namespace=p_namespace and owner_id=p_owner and spawn_id=p_spawn_id for update;
 select * into v_existing from lingjing_private.global_pet_serials where owner_id=p_owner and pet_id=p_pet_id;
 if found and (v_existing.namespace<>v_row.namespace or v_existing.template_id<>v_row.template_id or v_existing.global_serial<>v_row.global_serial)
  then raise exception 'LJ_GLOBAL_SERIAL_BIND_CONFLICT';end if;
 if v_row.pet_id is not null and v_row.pet_id is distinct from p_pet_id then raise exception 'LJ_GLOBAL_SERIAL_BIND_CONFLICT';end if;
 update lingjing_private.global_pet_serials set pet_id=p_pet_id where namespace=p_namespace and owner_id=p_owner and spawn_id=p_spawn_id returning * into v_row;
 return lingjing_private.global_serial_json(v_row);
end $$;
create function lingjing_private.global_serial_pet_rows(p_owner text) returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select r from public.lingjing_saves s cross join lateral jsonb_array_elements(case when s.envelope#>'{data,modules,companions}' is not null
  then coalesce(s.envelope#>'{data,modules,companions,data,tables,companion_pets}','[]'::jsonb)
  else coalesce(s.envelope#>'{data,tables,companion_pets,rows}','[]'::jsonb) end) r where s.owner_id=p_owner
$$;
create function lingjing_private.register_owned_global_serials(p_owner text,p_allow_expired boolean default false) returns void
language plpgsql security invoker set search_path='' as $$
declare v_row jsonb;v_pet jsonb;v_existing lingjing_private.global_pet_serials;v_permit lingjing_discovery.permits;
 v_default text;v_namespace text;v_serial numeric;v_missing boolean:=false;
begin
 perform lingjing_private.lock_save_owner(p_owner);
 for v_row in select r from lingjing_private.global_serial_pet_rows(p_owner) r loop
  v_pet:=(v_row->>'data_json')::jsonb;
  if v_row->>'owner_account_id' is distinct from p_owner or v_pet->>'ownerAccountId' is distinct from p_owner
   or v_pet->>'petId' is distinct from v_row->>'pet_id' or v_pet->>'templateId' is distinct from v_row->>'template_id'
   or not exists(select 1 from lingjing_private.owned_pet_ids where owner_id=p_owner and pet_id=v_row->>'pet_id')
   then raise exception 'LJ_GLOBAL_SERIAL_PET_MISMATCH';end if;
  select * into v_existing from lingjing_private.global_pet_serials where owner_id=p_owner and pet_id=v_row->>'pet_id';
  if found then
   if v_existing.template_id is distinct from v_row->>'template_id' then raise exception 'LJ_GLOBAL_SERIAL_TEMPLATE_MISMATCH';end if;
  else v_missing:=true;end if;
 end loop;
 if not v_missing then return;end if;
 perform lingjing_private.lock_global_serial_owner_counters(p_owner);
 for v_row in select r from lingjing_private.global_serial_pet_rows(p_owner) r order by (r->>'template_id') collate "C",(r->>'created_at') collate "C",(r->>'pet_id') collate "C" loop
  if exists(select 1 from lingjing_private.global_pet_serials where owner_id=p_owner and pet_id=v_row->>'pet_id') then continue;end if;
  select p.* into v_permit from lingjing_discovery.captures c join lingjing_discovery.permits p on p.id=c.permit_id and p.owner_account_id=c.owner_account_id
   where c.owner_account_id=p_owner and c.pet_id=v_row->>'pet_id';
  if found then
   v_namespace:=case when v_permit.source='simulated' then 'qa:'||v_permit.scenario_id else 'live' end;
   if v_permit.spawn_json->>'templateId' is distinct from v_row->>'template_id' then raise exception 'LJ_GLOBAL_SERIAL_TEMPLATE_MISMATCH';end if;
   perform lingjing_private.bind_wild_global_serial(p_owner,v_namespace,v_permit.spawn_id,v_row->>'template_id',v_row->>'pet_id');
  else
   v_default:=coalesce(v_default,lingjing_private.global_serial_owner_namespace(p_owner,p_allow_expired));
   if not exists(select 1 from lingjing_private.global_serial_templates where template_id=v_row->>'template_id') then raise exception 'LJ_GLOBAL_SERIAL_TEMPLATE_INVALID';end if;
   update lingjing_private.global_serial_counters set last_serial=trunc(last_serial+1)
    where namespace=v_default and template_id=v_row->>'template_id' returning last_serial into v_serial;
   insert into lingjing_private.global_pet_serials(namespace,template_id,global_serial,owner_id,pet_id)
    values(v_default,v_row->>'template_id',v_serial,p_owner,v_row->>'pet_id');
  end if;
 end loop;
end $$;

create function public.lingjing_global_serial_owned(p_actor jsonb,p_expected_revision bigint default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner text:=p_actor->>'ownerAccountId';v_namespace text;v_revision bigint;v_pets jsonb;
begin
 v_namespace:=lingjing_private.global_serial_actor_namespace(p_actor);
 select coalesce((select revision from public.lingjing_saves where owner_id=v_owner),0) into v_revision;
 if p_expected_revision is not null and p_expected_revision<>v_revision then raise exception 'LJ_SYNC_CONFLICT';end if;
 perform lingjing_private.register_owned_global_serials(v_owner);
 select coalesce(jsonb_agg(lingjing_private.global_serial_json(g) order by g.pet_id),'[]'::jsonb) into v_pets
  from lingjing_private.global_pet_serials g where g.owner_id=v_owner and exists(select 1 from lingjing_private.global_serial_pet_rows(v_owner) r where r->>'pet_id'=g.pet_id);
 return jsonb_build_object('format','lingjing.global-serial.readback','version',1,'ownerAccountId',v_owner,'namespace',v_namespace,'revision',v_revision,'pets',v_pets);
end $$;
create function public.lingjing_global_serial_wild_lookup(p_actor jsonb,p_spawns jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_namespace text;v_result jsonb;
begin
 v_namespace:=lingjing_private.global_serial_actor_namespace(p_actor);
 if jsonb_typeof(p_spawns) is distinct from 'array' or jsonb_array_length(p_spawns)>100 then raise exception 'LJ_GLOBAL_SERIAL_REQUEST_INVALID';end if;
 select coalesce(jsonb_agg(lingjing_private.global_serial_json(g) order by g.spawn_id),'[]'::jsonb) into v_result
 from lingjing_private.global_pet_serials g where g.namespace=v_namespace and g.owner_id=p_actor->>'ownerAccountId'
 and exists(select 1 from jsonb_array_elements(p_spawns) s where s->>'id'=g.spawn_id and s->>'templateId'=g.template_id);
 return v_result;
end $$;
create function public.lingjing_global_serial_wild_ensure(p_actor jsonb,p_spawn jsonb,p_proof_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_namespace text;v_proof jsonb;v_distance double precision;v_lat double precision;v_lng double precision;v_age numeric;
begin
 v_namespace:=lingjing_private.global_serial_actor_namespace(p_actor);
 -- p_spawn is reconstructed by trusted Edge from the signed discover fix. Direct
 -- clients cannot execute this RPC. Recheck the existing policy inside the tx.
 v_proof:=public.lingjing_discovery_take_location(p_actor,p_proof_id,'discover','','serial-observe:'||encode(sha256(convert_to(p_spawn->>'id','UTF8')),'hex'));
 if (v_proof->>'expiresAt')::numeric<=extract(epoch from clock_timestamp())*1000 then raise exception 'LOCATION_PROOF_EXPIRED';end if;
 if (v_namespace='live') is distinct from (v_proof->>'source'='os')
  or v_namespace<>'live' and v_namespace is distinct from 'qa:'||(v_proof#>>'{fix,scenarioId}') then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
 v_age:=extract(epoch from clock_timestamp())*1000-(v_proof#>>'{fix,timestampMs}')::numeric;
 if v_age>30000 or v_age< -5000 then raise exception 'LOCATION_STALE';end if;
 if (v_proof#>>'{fix,accuracyMeters}')::numeric not between 0.000001 and 80 then raise exception 'LOCATION_IMPRECISE';end if;
 v_lat:=(p_spawn#>>'{position,lat}')::double precision;v_lng:=(p_spawn#>>'{position,lng}')::double precision;
 if v_lat is null or v_lng is null or abs(v_lat)>90 or abs(v_lng)>180 then raise exception 'INVALID_COORDINATES';end if;
 v_distance:=6371000*2*asin(least(1.0,sqrt(power(sin(radians(v_lat-(v_proof#>>'{fix,lat}')::double precision)/2),2)
  +cos(radians(v_lat))*cos(radians((v_proof#>>'{fix,lat}')::double precision))*power(sin(radians(v_lng-(v_proof#>>'{fix,lng}')::double precision)/2),2))));
 if v_distance>100 then raise exception 'OUT_OF_CAPTURE_RANGE';end if;
 return lingjing_private.ensure_wild_global_serial(p_actor->>'ownerAccountId',v_namespace,p_spawn->>'id',p_spawn->>'templateId');
end $$;

-- Historical server rows, including expired QA grants, classify the backfill.
-- No historic envelope, action receipt, pet JSON, name, resource or ID is edited.
do $$declare p lingjing_discovery.permits;o record;begin
 for p in select * from lingjing_discovery.permits order by source,scenario_id,spawn_json->>'templateId',created_at,owner_account_id,spawn_id loop
  perform lingjing_private.ensure_wild_global_serial(p.owner_account_id,case when p.source='simulated' then 'qa:'||p.scenario_id else 'live' end,p.spawn_id,p.spawn_json->>'templateId');
 end loop;
 for o in select owner_id from public.lingjing_saves order by owner_id loop perform lingjing_private.register_owned_global_serials(o.owner_id,true);end loop;
end $$;

-- Existing common commit and discovery transaction definitions follow. Their
-- inputs, immutable receipt bodies and original request hashes stay unchanged.
create or replace function lingjing_private.commit_authority(p_owner_id text,p_action_id text,p_fragments jsonb,p_expected_revision bigint default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_prior public.lingjing_save_actions;v_hash text;v_current bigint;v_body jsonb;v_fragment record;v_table record;v_module jsonb;
  v_pet jsonb;v_row jsonb;v_sealed jsonb;
begin
  if coalesce(p_action_id,'') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$' or jsonb_typeof(p_fragments) is distinct from 'object' or p_fragments='{}'::jsonb then raise exception 'LJ_INVALID_REQUEST';end if;
  perform lingjing_private.lock_save_owner(p_owner_id);
  v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(jsonb_build_object('fragments',p_fragments,'expectedRevision',p_expected_revision)),'UTF8')),'hex');
  select * into v_prior from public.lingjing_save_actions where owner_id=p_owner_id and action_id=p_action_id;
  if found then if v_prior.kind<>'authority' or v_prior.input_hash<>v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
    return lingjing_private.save_receipt(p_owner_id,p_action_id)||jsonb_build_object('duplicate',true);end if;
  select revision,envelope-'checksum' into v_current,v_body from public.lingjing_saves where owner_id=p_owner_id;
  v_current:=coalesce(v_current,0);
  if p_expected_revision is not null and p_expected_revision<>v_current then raise exception 'LJ_SYNC_CONFLICT';end if;
  if v_body is null then v_body:=jsonb_build_object('format','lingjing-account-save','version',1,'ownerAccountId',p_owner_id,
    'identity',jsonb_build_object('provider','runtime','subjectId',p_owner_id),'provenance',jsonb_build_object('mode','live'),
    'createdAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'data',jsonb_build_object('modules','{}'::jsonb,'tables','{}'::jsonb));end if;
  for v_fragment in select * from jsonb_each(p_fragments) loop
    if v_fragment.key not in ('garden','discovery','battle','companions','resources','character-resources','legacy') or jsonb_typeof(v_fragment.value) is distinct from 'object' or lingjing_private.has_secret(v_fragment.value) then raise exception 'LJ_AUTHORITY_FRAGMENT_INVALID';end if;
    if jsonb_typeof(coalesce(v_fragment.value->'tables','{}'::jsonb))<>'object' then raise exception 'LJ_AUTHORITY_FRAGMENT_INVALID';end if;
    v_module:=case when jsonb_typeof(v_fragment.value->'module')='object' then v_fragment.value->'module' else null end;
    for v_table in select * from jsonb_each(coalesce(v_fragment.value->'tables','{}'::jsonb)) loop
      if exists(select 1 from lingjing_private.authority_fragments where owner_id=p_owner_id and module_id<>v_fragment.key and table_states ? v_table.key) then raise exception 'LJ_AUTHORITY_TABLE_CONFLICT';end if;
      if jsonb_typeof(v_table.value->'rows') is distinct from 'array' or jsonb_typeof(v_table.value->'schema') is distinct from 'array' then raise exception 'LJ_AUTHORITY_FRAGMENT_INVALID';end if;
      for v_row in select * from jsonb_array_elements(v_table.value->'rows') loop if v_row->>'owner_account_id' is distinct from p_owner_id then raise exception 'LJ_SAVE_OWNER_MISMATCH';end if;end loop;
    end loop;
    if v_fragment.value ? 'petIds' then
      if v_fragment.key<>'companions' or jsonb_typeof(v_fragment.value->'petIds')<>'array' then raise exception 'LJ_AUTHORITY_FRAGMENT_INVALID';end if;
      for v_pet in select * from jsonb_array_elements(v_fragment.value->'petIds') loop
        if jsonb_typeof(v_pet)<>'string' or length(v_pet#>>'{}') not between 1 and 160 then raise exception 'LJ_PET_OWNER_MISMATCH';end if;
        insert into lingjing_private.owned_pet_ids(pet_id,owner_id) values(v_pet#>>'{}',p_owner_id) on conflict(owner_id,pet_id) do nothing;
      end loop;
    end if;
    insert into lingjing_private.authority_fragments(owner_id,module_id,module_state,table_states)
      values(p_owner_id,v_fragment.key,v_module,coalesce(v_fragment.value->'tables','{}'::jsonb))
      on conflict(owner_id,module_id) do update set module_state=excluded.module_state,table_states=excluded.table_states,updated_at=now();
  end loop;
  -- Rebuild the protected layer from every registered fragment; dropping rows or
  -- modules in one domain cannot accidentally erase another domain's state.
  v_body:=jsonb_set(v_body,'{data,modules}',coalesce((select jsonb_object_agg(key,value) from jsonb_each(v_body#>'{data,modules}') where key in ('settings','conversations')),'{}'::jsonb));
  v_body:=jsonb_set(v_body,'{data,tables}','{}'::jsonb);
  for v_fragment in select * from lingjing_private.authority_fragments where owner_id=p_owner_id loop
    if v_fragment.module_state is not null then v_body:=jsonb_set(v_body,array['data','modules',v_fragment.module_id],v_fragment.module_state,true);end if;
    v_body:=jsonb_set(v_body,'{data,tables}',(v_body#>'{data,tables}')||v_fragment.table_states);
  end loop;
  v_body:=jsonb_set(v_body,'{createdAt}',to_jsonb(to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
  v_sealed:=lingjing_private.seal_save(v_body);perform lingjing_private.validate_envelope(p_owner_id,v_sealed);
  insert into public.lingjing_saves(owner_id,revision,action_id,checksum,envelope) values(p_owner_id,v_current+1,p_action_id,v_sealed->>'checksum',v_sealed)
    on conflict(owner_id) do update set revision=excluded.revision,action_id=excluded.action_id,checksum=excluded.checksum,envelope=excluded.envelope,updated_at=now();
  insert into public.lingjing_save_actions(owner_id,action_id,kind,input_hash,base_revision,revision,checksum,envelope)
    values(p_owner_id,p_action_id,'authority',v_hash,v_current,v_current+1,v_sealed->>'checksum',v_sealed);
  perform lingjing_private.register_owned_global_serials(p_owner_id);
  return lingjing_private.save_receipt(p_owner_id,p_action_id);
end $$;
create or replace function public.lingjing_discovery_game_write(p_actor jsonb,p_op text,p_operation jsonb,p_expected_save_revision bigint,p_fragments jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
  v_owner text:=p_actor->>'ownerAccountId';v_action text:=p_operation->>'actionId';v_hash text:=p_operation->>'requestHash';
  v_prior lingjing_discovery.game_actions;v_permit lingjing_discovery.permits;v_id uuid;v_result jsonb;v_receipt jsonb;v_proof jsonb;
  v_save jsonb;v_pet jsonb;v_pet_row jsonb;v_session jsonb:=p_operation->'session';v_status text:=p_operation->>'status';v_context jsonb;v_serial_namespace text;
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
  v_serial_namespace:=lingjing_private.global_serial_actor_namespace(p_actor);
  perform lingjing_private.lock_global_serial_owner_counters(v_owner);
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
    if (v_serial_namespace='live') is distinct from (v_proof->>'source'='os')
      or v_serial_namespace<>'live' and v_serial_namespace is distinct from 'qa:'||(v_proof#>>'{fix,scenarioId}') then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
    perform lingjing_private.ensure_wild_global_serial(v_owner,v_serial_namespace,p_operation->'spawn'->>'id',p_operation->'spawn'->>'templateId');
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

-- Explicit function grants: PUBLIC's default EXECUTE must not expose allocation.
do $$declare f record;begin
 for f in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='lingjing_private' and p.proname in(
   'remember_global_serial_qa_scope','guard_global_serial_identity','global_serial_actor_namespace','global_serial_owner_namespace',
   'lock_global_serial_counters','lock_global_serial_owner_counters','global_serial_json','ensure_wild_global_serial',
   'bind_wild_global_serial','global_serial_pet_rows','register_owned_global_serials') loop
  execute format('revoke all on function %I.%I(%s) from public,anon,authenticated',f.nspname,f.proname,f.args);
  execute format('grant execute on function %I.%I(%s) to service_role',f.nspname,f.proname,f.args);
 end loop;
end $$;
revoke all on function public.lingjing_global_serial_owned(jsonb,bigint),public.lingjing_global_serial_wild_lookup(jsonb,jsonb),
 public.lingjing_global_serial_wild_ensure(jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.lingjing_global_serial_owned(jsonb,bigint),public.lingjing_global_serial_wild_lookup(jsonb,jsonb),
 public.lingjing_global_serial_wild_ensure(jsonb,jsonb,uuid) to service_role;
commit;
