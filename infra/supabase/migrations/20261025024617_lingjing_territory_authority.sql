begin;
-- Generated with Supabase CLI migration new. Deploy ONLY through the coordinator.
-- Requires08 identity20314/protectedCAS21759 and03 location20719. Text owners remain.
-- Auth UID/device/owner come exclusively from08's verified Edge actor context.
-- No client role can call these internal RPCs or write shared-world records.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
grant usage on schema extensions to service_role;

create table if not exists public.runtime_territory_regions (
  id text primary key,
  name text not null,
  world_mode text not null default 'live' check(world_mode in ('live','simulated')),
  scenario_id text,
  check ((world_mode='live' and scenario_id is null) or (world_mode='simulated' and length(scenario_id)>0)),
  owner_account_id text references public.lingjing_accounts(owner_id),
  revision bigint not null default 1 check (revision > 0),
  boundary extensions.geometry(Polygon,4326) not null,
  center extensions.geography(Point,4326) not null,
  capture_multiplier numeric not null default 2 check (capture_multiplier between 1 and 10),
  garrison_pet_id text,
  defender_json jsonb,
  occupied_at timestamptz,
  updated_at timestamptz not null default now(),
  check (extensions.st_isvalid(boundary)),
  check ((garrison_pet_id is null) = (defender_json is null))
);
create index if not exists runtime_territory_regions_boundary_gist on public.runtime_territory_regions using gist(boundary);
create index if not exists runtime_territory_regions_center_gist on public.runtime_territory_regions using gist(center);
create index if not exists runtime_territory_regions_owner on public.runtime_territory_regions(owner_account_id) where owner_account_id is not null;
create unique index if not exists runtime_territory_one_guard_region on public.runtime_territory_regions(owner_account_id,garrison_pet_id) where garrison_pet_id is not null;
create table if not exists public.runtime_territory_views (
  owner_account_id text not null references public.lingjing_accounts(owner_id),
  territory_id text not null references public.runtime_territory_regions(id),
  last_seen_at timestamptz not null default now(),
  primary key(owner_account_id,territory_id)
);
create index if not exists runtime_territory_views_owner_seen on public.runtime_territory_views(owner_account_id,last_seen_at desc);

create table if not exists public.runtime_territory_challenges (
  session_id text primary key,
  owner_account_id text not null references public.lingjing_accounts(owner_id),
  actor_uid uuid not null,
  device_id text not null,
  territory_id text not null references public.runtime_territory_regions(id),
  territory_revision bigint not null,
  pet_id text not null,
  location_receipt_id text not null,
  revision bigint not null default 1,
  battle_json jsonb not null,
  status text not null check (status in ('active','finished','settled','superseded')),
  result_json jsonb,
  expires_at timestamptz not null default now() + interval '30 minutes',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists runtime_territory_challenges_owner_created on public.runtime_territory_challenges(owner_account_id,created_at desc);
create index if not exists runtime_territory_challenges_region on public.runtime_territory_challenges(territory_id);
create table if not exists public.runtime_territory_attempts (
  owner_account_id text not null references public.lingjing_accounts(owner_id),
  day_key date not null,
  count integer not null check (count between 0 and 2),
  primary key(owner_account_id,day_key)
);
create table if not exists public.runtime_territory_actions (
  owner_account_id text not null references public.lingjing_accounts(owner_id),
  action_id text not null,
  kind text not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key(owner_account_id,action_id)
);
create table if not exists public.runtime_territory_logs (
  id uuid primary key default gen_random_uuid(),
  territory_id text not null references public.runtime_territory_regions(id),
  actor_owner_id text not null references public.lingjing_accounts(owner_id),
  action text not null,
  old_owner_id text,
  new_owner_id text,
  session_id text references public.runtime_territory_challenges(session_id),
  created_at timestamptz not null default now()
);
create index if not exists runtime_territory_logs_region_created on public.runtime_territory_logs(territory_id,created_at desc);
create index if not exists runtime_territory_logs_actor on public.runtime_territory_logs(actor_owner_id);
alter table public.runtime_territory_regions enable row level security;
alter table public.runtime_territory_challenges enable row level security;
alter table public.runtime_territory_attempts enable row level security;
alter table public.runtime_territory_actions enable row level security;
alter table public.runtime_territory_logs enable row level security;
alter table public.runtime_territory_views enable row level security;
revoke all on public.runtime_territory_regions,public.runtime_territory_challenges,public.runtime_territory_attempts,public.runtime_territory_actions,public.runtime_territory_logs,public.runtime_territory_views from public,anon,authenticated;
grant select,insert,update on public.runtime_territory_regions,public.runtime_territory_challenges,public.runtime_territory_attempts,public.runtime_territory_actions,public.runtime_territory_logs,public.runtime_territory_views to service_role;

create or replace function public.runtime_territory_view(p_region public.runtime_territory_regions)
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('id',p_region.id,'name',p_region.name,'regionName','附近领地',
    'ownerAccountId',p_region.owner_account_id,'revision',p_region.revision,
    'captureMultiplier',p_region.capture_multiplier,'garrisonPetId',p_region.garrison_pet_id,
    'occupiedAt',p_region.occupied_at,'provenance',case when p_region.world_mode='simulated' then 'cloud-simulated-geographic' else 'cloud-geographic' end,'worldMode',p_region.world_mode,'scenarioId',p_region.scenario_id,
    'logs',(select coalesce(jsonb_agg(entry),'[]'::jsonb) from (
      select jsonb_build_object('id',l.id,'action',case l.action when 'challenge' then '发起入侵' when 'occupy' then '占领成功' when 'defend' then '守住领地' else '驻守更新' end,'actorName',coalesce(a.username,'旅人'),'createdAt',l.created_at) as entry
      from public.runtime_territory_logs l left join public.lingjing_accounts a on a.owner_id=l.actor_owner_id where l.territory_id=p_region.id order by l.created_at desc limit 20
    ) log_entries),
    'boundary',(select jsonb_agg(jsonb_build_object('lat',point->1,'lng',point->0))
      from jsonb_array_elements(extensions.st_asgeojson(p_region.boundary)::jsonb->'coordinates'->0) point));
$$;
revoke all on function public.runtime_territory_view(public.runtime_territory_regions) from public,anon,authenticated;
grant execute on function public.runtime_territory_view(public.runtime_territory_regions) to service_role;

-- The privileged Edge worker already used08 requireActor. Recheck the same
-- mapping and active device/session inside each write, without broader access
-- to auth.users/auth.sessions and without introducing a second identity store.
create or replace function public.runtime_territory_check_actor(p_owner text,p_uid uuid,p_device text,p_session uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.lingjing_devices d join public.lingjing_accounts a on a.owner_id=d.owner_id
    where a.owner_id=p_owner and a.auth_user_id=p_uid and a.status='active'
      and d.device_id::text=p_device and d.auth_session_id=p_session and d.revoked_at is null for share of d;
  if not found then raise exception 'ACTOR_OWNER_MISMATCH'; end if;
end;
$$;
revoke all on function public.runtime_territory_check_actor(text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.runtime_territory_check_actor(text,uuid,text,uuid) to service_role;

-- Private full-save commit reused by garden and territory. This transaction has
-- the same account lock as08's save CAS. Preserve identity and unrelated
-- module data; only garden and the canonical companion tables may change.
create table if not exists public.lingjing_garden_operations (
  owner_account_id text not null references public.lingjing_accounts(owner_id),
  action_id text not null, request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  account_revision bigint not null, response_json jsonb not null,
  created_at timestamptz not null default now(),primary key(owner_account_id,action_id)
);
alter table public.lingjing_garden_operations enable row level security;
revoke all on public.lingjing_garden_operations from public,anon,authenticated;
grant select,insert on public.lingjing_garden_operations to service_role;

create or replace function public.runtime_garden_commit_authoritative(
  p_owner text,p_actor_uid uuid,p_device_id text,p_actor_session uuid,p_action_id text,p_request_hash text,p_base_revision bigint,p_envelope jsonb,p_result jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  current_save public.lingjing_saves%rowtype;
  prior public.lingjing_garden_operations%rowtype;
  response jsonb; committed jsonb; fragments jsonb;
  protected_old jsonb; protected_new jsonb; pet_tables jsonb;
  old_pets jsonb; new_pets jsonb; old_others jsonb; new_others jsonb;
  operation text; target_pet text;
begin
  perform lingjing_private.lock_save_owner(p_owner);
  perform public.runtime_territory_check_actor(p_owner,p_actor_uid,p_device_id,p_actor_session);
  if p_action_id is null or p_action_id !~ '^[a-zA-Z0-9:_-]{1,160}$' or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_ACTION'; end if;
  select * into prior from public.lingjing_garden_operations where owner_account_id=p_owner and action_id=p_action_id;
  if found then
    if prior.request_hash<>p_request_hash then raise exception 'ACTION_ID_REUSED'; end if;
    return prior.response_json||jsonb_build_object('replayed',true);
  end if;
  select * into current_save from public.lingjing_saves where owner_id=p_owner for update;
  if p_base_revision is null or coalesce(current_save.revision,0)<>p_base_revision then raise exception 'SYNC_CONFLICT'; end if;
  if p_envelope->>'ownerAccountId' is distinct from p_owner
    or p_envelope#>>'{data,modules,garden,data,ownerAccountId}' is distinct from p_owner
    or p_result->>'ok' is distinct from 'true' or octet_length(p_envelope::text)>26214400 then raise exception 'INVALID_SAVE'; end if;
  perform lingjing_private.validate_envelope(p_owner,p_envelope);
  select entry->>'kind' into operation from jsonb_array_elements(p_envelope#>'{data,modules,garden,data,tables,garden_actions}') entry
    where entry->>'owner_account_id'=p_owner and entry->>'action_id'=p_action_id and entry->>'request_hash'=p_request_hash;
  if operation is null or operation not in ('initialize','plant','harvest','craft','feed','reward','territorySettle','garrison') then raise exception 'INVALID_ACTION'; end if;
  new_pets=coalesce(case when p_envelope#>'{data,modules,companions}' is not null then p_envelope#>'{data,modules,companions,data,tables,companion_pets}' else p_envelope#>'{data,tables,companion_pets,rows}' end,'[]'::jsonb);
  if current_save.owner_id is null then
    if operation<>'initialize' or new_pets<>'[]'::jsonb then raise exception 'CLOUD_GARDEN_NOT_INITIALIZED'; end if;
  else
    if p_envelope->'identity' is distinct from current_save.envelope->'identity' then raise exception 'INVALID_SAVE'; end if;
    protected_old=(current_save.envelope-'checksum'-'createdAt')#-'{data,modules,garden}'#-'{data,tables,companion_pets}'#-'{data,tables,companion_actions}'#-'{data,tables,companion_accounts}'#-'{data,modules,companions,data,tables,companion_pets}'#-'{data,modules,companions,data,tables,companion_actions}'#-'{data,modules,companions,data,tables,companion_accounts}';
    protected_new=(p_envelope-'checksum'-'createdAt')#-'{data,modules,garden}'#-'{data,tables,companion_pets}'#-'{data,tables,companion_actions}'#-'{data,tables,companion_accounts}'#-'{data,modules,companions,data,tables,companion_pets}'#-'{data,modules,companions,data,tables,companion_actions}'#-'{data,modules,companions,data,tables,companion_accounts}';
    if protected_old is distinct from protected_new then raise exception 'UNRELATED_SAVE_CHANGED'; end if;
    old_pets=coalesce(case when current_save.envelope#>'{data,modules,companions}' is not null then current_save.envelope#>'{data,modules,companions,data,tables,companion_pets}' else current_save.envelope#>'{data,tables,companion_pets,rows}' end,'[]'::jsonb);
    if (select coalesce(jsonb_agg(entry->>'pet_id' order by entry->>'pet_id'),'[]') from jsonb_array_elements(old_pets) entry) is distinct from (select coalesce(jsonb_agg(entry->>'pet_id' order by entry->>'pet_id'),'[]') from jsonb_array_elements(new_pets) entry) then raise exception 'UNRELATED_PET_CHANGED'; end if;
    target_pet=case when operation in ('feed','territorySettle') then p_result#>>'{data,petId}' else null end;
    select coalesce(jsonb_agg(entry order by entry->>'pet_id'),'[]') into old_others from jsonb_array_elements(old_pets) entry where target_pet is null or entry->>'pet_id'<>target_pet;
    select coalesce(jsonb_agg(entry order by entry->>'pet_id'),'[]') into new_others from jsonb_array_elements(new_pets) entry where target_pet is null or entry->>'pet_id'<>target_pet;
    if old_others is distinct from new_others then raise exception 'UNRELATED_PET_CHANGED'; end if;
  end if;
  if exists(select 1 from jsonb_array_elements(new_pets) entry where entry->>'owner_account_id' is distinct from p_owner or not exists(select 1 from lingjing_private.owned_pet_ids ids where ids.owner_id=p_owner and ids.pet_id=entry->>'pet_id')) then raise exception 'PET_NOT_OWNED'; end if;
  fragments=jsonb_build_object('garden',jsonb_build_object('module',p_envelope#>'{data,modules,garden}'));
  if p_envelope#>'{data,modules,companions}' is not null then
    fragments=fragments||jsonb_build_object('companions',jsonb_build_object('module',p_envelope#>'{data,modules,companions}'));
  else
    select coalesce(jsonb_object_agg(key,value),'{}') into pet_tables from jsonb_each(coalesce(p_envelope#>'{data,tables}','{}')) where key in ('companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts');
    if pet_tables<>'{}'::jsonb then fragments=fragments||jsonb_build_object('companions',jsonb_build_object('tables',pet_tables)); end if;
  end if;
  -- The authority helper updates all protected fragments + the unified save
  -- revision HERE, within this same world/inventory SQL transaction. No second
  -- SDK request, no direct save-table write, no new pet registration by05.
  committed=lingjing_private.commit_authority(p_owner,'garden:'||p_request_hash,fragments,p_base_revision);
  response=jsonb_build_object('actionId',p_action_id,'requestHash',p_request_hash,'accountRevision',(committed->>'revision')::bigint,'authorityReceiptId',committed->>'actionId','result',p_result,'replayed',false);
  insert into public.lingjing_garden_operations(owner_account_id,action_id,request_hash,account_revision,response_json)
    values(p_owner,p_action_id,p_request_hash,(committed->>'revision')::bigint,response);
  return response;
end;
$$;
revoke all on function public.runtime_garden_commit_authoritative(text,uuid,text,uuid,text,text,bigint,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.runtime_garden_commit_authoritative(text,uuid,text,uuid,text,text,bigint,jsonb,jsonb) to service_role;

create or replace function public.runtime_territory_read(p_owner text,p_session_id text default null,p_territory_id text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved public.lingjing_saves%rowtype; challenge public.runtime_territory_challenges%rowtype; region public.runtime_territory_regions%rowtype; world jsonb;
begin
  select * into saved from public.lingjing_saves where owner_id=p_owner;
  if not found then raise exception 'CLOUD_GARDEN_NOT_INITIALIZED'; end if;
  if p_session_id is not null then
    select * into challenge from public.runtime_territory_challenges where session_id=p_session_id and owner_account_id=p_owner;
    if not found then raise exception 'NOT_PARTICIPANT'; end if;
    p_territory_id=challenge.territory_id;
  end if;
  if p_territory_id is not null then select * into region from public.runtime_territory_regions where id=p_territory_id; end if;
  select coalesce(jsonb_agg(public.runtime_territory_view(t.region)),'[]'::jsonb) into world from (
    select r as region from public.runtime_territory_regions r where r.owner_account_id=p_owner or r.id in (select c.territory_id from public.runtime_territory_challenges c where c.owner_account_id=p_owner) or r.id in (select v.territory_id from public.runtime_territory_views v where v.owner_account_id=p_owner order by v.last_seen_at desc limit 30) order by r.updated_at desc limit 30
  ) t;
  return jsonb_build_object('serverTime',floor(extract(epoch from now())*1000),'envelope',saved.envelope,'accountRevision',saved.revision,
    'territories',world,'territory',case when region.id is null then null else public.runtime_territory_view(region) end,'defender',region.defender_json,
    'challenge',case when challenge.session_id is null then null else to_jsonb(challenge)-'actor_uid'-'device_id' end,
    'territoryChallenges',coalesce((select jsonb_agg(jsonb_build_object('sessionId',c.session_id,'territoryId',c.territory_id,'status',c.status)) from public.runtime_territory_challenges c where c.owner_account_id=p_owner and c.status in ('active','finished')),'[]'::jsonb),
    'remainingInvasions',2-coalesce((select count from public.runtime_territory_attempts where owner_account_id=p_owner and day_key=(now() at time zone 'Asia/Shanghai')::date),0));
end;
$$;
revoke all on function public.runtime_territory_read(text,text,text) from public,anon,authenticated;
grant execute on function public.runtime_territory_read(text,text,text) to service_role;

-- A shared region lock serializes capture context with ownership settlement.
create or replace function public.runtime_territory_capture_context(p_owner text,p_lat double precision,p_lng double precision,p_scenario_id text default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare region public.runtime_territory_regions%rowtype;
begin
  perform lingjing_private.lock_save_owner(p_owner);
  --03 calls this INSIDE its capture commit transaction, holding the region lock
  -- through reward creation. An HTTP preview alone cannot authorize a bonus.
  select * into region from public.runtime_territory_regions where scenario_id is not distinct from p_scenario_id and extensions.st_covers(boundary,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)) order by id limit 1 for share;
  if not found then return jsonb_build_object('territoryId',null,'captureMultiplier',1); end if;
  return jsonb_build_object('territoryId',region.id,'territoryRevision',region.revision,'captureMultiplier',case when region.owner_account_id=p_owner then region.capture_multiplier else 1 end);
end;
$$;
revoke all on function public.runtime_territory_capture_context(text,double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.runtime_territory_capture_context(text,double precision,double precision,text) to service_role;

-- A location object is supplied ONLY by03's verified server permit adapter,
-- never copied from the HTTP body. Client roles cannot execute this function.
create or replace function public.runtime_territory_verified_point(p_owner text,p_device text,p_permit jsonb)
returns extensions.geometry language plpgsql immutable security invoker set search_path='' as $$
declare fix jsonb=p_permit->'fix';lat double precision;lng double precision;
begin
  --03 take_location already verified signature, actor, current key, 30s/80m,
  -- nonce purpose/reference/consumer,15s expiry and coordinator-only QA grants.
  if p_permit->>'ownerAccountId' is distinct from p_owner or p_permit->>'deviceId' is distinct from p_device
    or p_permit->>'source' not in ('os','simulated') then raise exception 'LOCATION_PERMIT_REQUIRED'; end if;
  if p_permit->>'source'='simulated' and coalesce(length(fix->>'scenarioId'),0)=0 then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
  if jsonb_typeof(fix->'lat') is distinct from 'number' or jsonb_typeof(fix->'lng') is distinct from 'number' then raise exception 'INVALID_COORDINATES';end if;
  lat=(fix->>'lat')::double precision;lng=(fix->>'lng')::double precision;
  if lat not between -85 and 85 or lng not between -180 and 180 then raise exception 'INVALID_COORDINATES';end if;
  if lng=180 then lng=-180;end if;
  return extensions.st_setsrid(extensions.st_makepoint(lng,lat),4326);
end;
$$;
revoke all on function public.runtime_territory_verified_point(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.runtime_territory_verified_point(text,text,jsonb) to service_role;

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
      if region.scenario_id is distinct from case when permit->>'source'='simulated' then permit#>>'{fix,scenarioId}' else null end then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
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
          if region.scenario_id is distinct from case when permit->>'source'='simulated' then permit#>>'{fix,scenarioId}' else null end then raise exception 'LOCATION_SCENARIO_MISMATCH';end if;
          if not extensions.st_covers(region.boundary,pt) then raise exception 'OUT_OF_TERRITORY_RANGE';end if;
        end if;
        if p_payload#>>'{result,data,territoryId}' is distinct from region.id or p_payload#>>'{result,data,petId}' is distinct from challenge.pet_id or p_payload#>>'{result,data,won}' is distinct from (winner='player')::text
          or (p_payload->'settledBattle'-'reward') is distinct from challenge.battle_json then raise exception 'INVALID_SETTLEMENT_PROOF'; end if;
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
