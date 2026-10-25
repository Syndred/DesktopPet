-- CLI-generated Lingjing full-save CAS. Personal data is user-writable only
-- through this guard; economic/game state is supplied by trusted domain RPCs.
begin;
create table public.lingjing_saves (
  owner_id text primary key references public.lingjing_accounts(owner_id) on delete restrict,
  revision bigint not null check(revision>0), action_id text not null, checksum text not null,
  envelope jsonb not null, updated_at timestamptz not null default now()
);
create table public.lingjing_save_actions (
  owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
  action_id text not null, kind text not null check(kind in ('personal','authority')),
  input_hash text not null, base_revision bigint not null, revision bigint not null,
  checksum text not null, envelope jsonb not null, device_id uuid, session_id uuid,
  created_at timestamptz not null default now(), primary key(owner_id,action_id)
);
create table public.lingjing_save_archives (
  id uuid primary key default gen_random_uuid(), owner_id text not null references public.lingjing_accounts(owner_id),
  action_id text not null, reason text not null check(reason in ('unverified-local','pre-conflict','before-cloud-restore')),
  checksum text not null,envelope jsonb not null,created_at timestamptz not null default now(),unique(owner_id,action_id)
);
create table lingjing_private.authority_fragments (
  owner_id text not null references public.lingjing_accounts(owner_id), module_id text not null,
  module_state jsonb, table_states jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),primary key(owner_id,module_id)
);
create table lingjing_private.owned_pet_ids (
  pet_id text primary key, owner_id text not null references public.lingjing_accounts(owner_id),
  created_at timestamptz not null default now()
);
create index lingjing_owned_pets_owner_idx on lingjing_private.owned_pet_ids(owner_id);
alter table public.lingjing_saves enable row level security;
alter table public.lingjing_save_actions enable row level security;
alter table public.lingjing_save_archives enable row level security;
alter table lingjing_private.authority_fragments enable row level security;
alter table lingjing_private.owned_pet_ids enable row level security;
revoke all on public.lingjing_saves,public.lingjing_save_actions,public.lingjing_save_archives,lingjing_private.authority_fragments,lingjing_private.owned_pet_ids from public,anon,authenticated;
grant select on public.lingjing_saves,public.lingjing_save_actions,public.lingjing_save_archives to authenticated;
grant all on public.lingjing_saves,public.lingjing_save_actions,public.lingjing_save_archives,lingjing_private.authority_fragments,lingjing_private.owned_pet_ids to service_role;
create policy lingjing_save_self_read on public.lingjing_saves for select to authenticated using(owner_id=(select public.lingjing_current_owner()));
create policy lingjing_save_action_self_read on public.lingjing_save_actions for select to authenticated using(owner_id=(select public.lingjing_current_owner()));
create policy lingjing_save_archive_self_read on public.lingjing_save_archives for select to authenticated using(owner_id=(select public.lingjing_current_owner()));

-- JSON.stringify-compatible UTF-16 key ordering, including astral keys.
create function lingjing_private.utf16_key(p_text text) returns text language plpgsql immutable strict set search_path='' as $$
declare v_out text:='';v_cp integer;v_i integer;
begin
  for v_i in 1..length(p_text) loop v_cp:=ascii(substr(p_text,v_i,1));
    if v_cp>65535 then v_cp:=v_cp-65536;v_out:=v_out||lpad(to_hex(55296+v_cp/1024),4,'0')||lpad(to_hex(56320+v_cp%1024),4,'0');
    else v_out:=v_out||lpad(to_hex(v_cp),4,'0');end if;
  end loop;return v_out;
end $$;
-- ECMAScript shortest round-trip decimal. PostgreSQL deliberately chooses an
-- interior representation for some floats (1e23 is one example), so casting a
-- float to text is insufficient for checksums made by JSON.stringify.
create function lingjing_private.canonical_number(p_json jsonb) returns text
language plpgsql immutable strict set search_path='' as $$
declare v_float double precision:=p_json::text::double precision;v_bytes bytea;v_exp2 integer;v_mantissa numeric;
 v_exact numeric;v_candidate numeric;v_unit numeric;v_i integer;v_exp10 integer;v_scale integer;
 v_plain text;v_digits text;v_sign text:=case when v_float<0 then '-' else '' end;v_match boolean:=false;
begin
 if v_float=0 then return '0';end if;
 v_bytes:=float8send(abs(v_float));
 v_exp2:=((get_byte(v_bytes,0)&127)*16+(get_byte(v_bytes,1)>>4));
 v_mantissa:=get_byte(v_bytes,1)&15;
 for v_i in 2..7 loop v_mantissa:=v_mantissa*256+get_byte(v_bytes,v_i);end loop;
 if v_exp2=0 then v_exp2:=-1074;else v_mantissa:=v_mantissa+4503599627370496;v_exp2:=v_exp2-1075;end if;
 if v_exp2>=0 then v_exact:=v_mantissa*power(2::numeric,v_exp2);
 else v_exact:=v_mantissa*power(5::numeric,-v_exp2)*('1e'||v_exp2)::numeric;end if;
 v_plain:=v_exact::text;
 if v_exact>=1 then v_exp10:=length(split_part(v_plain,'.',1))-1;
 else v_digits:=split_part(v_plain,'.',2);v_exp10:=-(length(v_digits)-length(ltrim(v_digits,'0'))+1);end if;
 for v_i in 1..17 loop
  v_scale:=v_i-1-v_exp10;v_candidate:=round(v_exact,v_scale);v_unit:=('1e'||(-v_scale))::numeric;
  -- Number::toString uses an even final digit for an exactly equidistant tie.
  if v_candidate-v_exact=v_unit/2 and mod(v_candidate/v_unit,2)=1 then v_candidate:=v_candidate-v_unit;end if;
  begin v_match:=v_candidate::double precision=abs(v_float);exception when numeric_value_out_of_range then v_match:=false;end;
  exit when v_match;
 end loop;
 if not v_match then raise exception 'LJ_NON_JSON_NUMBER';end if;
 v_plain:=v_candidate::text;
 if strpos(v_plain,'.')>0 then v_plain:=rtrim(rtrim(v_plain,'0'),'.');end if;
 if v_candidate>=0.000001 and v_candidate<1e21 then return v_sign||v_plain;end if;
 if v_candidate>=1 then v_exp10:=length(split_part(v_plain,'.',1))-1;
 else v_digits:=split_part(v_plain,'.',2);v_exp10:=-(length(v_digits)-length(ltrim(v_digits,'0'))+1);end if;
 v_digits:=rtrim(ltrim(replace(v_plain,'.',''),'0'),'0');
 return v_sign||left(v_digits,1)||case when length(v_digits)>1 then '.'||substr(v_digits,2) else '' end||'e'||case when v_exp10>=0 then '+' else '-' end||abs(v_exp10)::text;
end $$;
create function lingjing_private.canonical_json(p_json jsonb) returns text
language plpgsql immutable strict set search_path='' set extra_float_digits=3 as $$
declare v_kind text:=jsonb_typeof(p_json);v_text text;v_float double precision;v_exp integer;
begin
  if v_kind='object' then
    select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||lingjing_private.canonical_json(value),',' order by lingjing_private.utf16_key(key) collate "C"),'')||'}' into v_text from jsonb_each(p_json);return v_text;
  elsif v_kind='array' then
    select '['||coalesce(string_agg(lingjing_private.canonical_json(value),',' order by ordinal),'')||']' into v_text from jsonb_array_elements(p_json) with ordinality t(value,ordinal);return v_text;
  elsif v_kind='number' then
    return lingjing_private.canonical_number(p_json);
  end if;return p_json::text;
end $$;
create function lingjing_private.seal_save(p_envelope jsonb) returns jsonb language sql immutable strict set search_path='' as $$
  select (p_envelope-'checksum')||jsonb_build_object('checksum',encode(sha256(convert_to(lingjing_private.canonical_json(p_envelope-'checksum'),'UTF8')),'hex'))
$$;
create function lingjing_private.has_secret(p_json jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare v_kind text:=jsonb_typeof(p_json);v_entry record;
begin
  if v_kind='object' then for v_entry in select * from jsonb_each(p_json) loop
    if lower(v_entry.key) in ('password','password_hash','passwordhash','api_key','apikey','encrypted_key','service_role','service_role_key','secret','secret_key','secretkey','session_token','sessiontoken','access_token','accesstoken','refresh_token','refreshtoken','authorization') then return true;end if;
    if lingjing_private.has_secret(v_entry.value) then return true;end if;
  end loop;
  elsif v_kind='array' then for v_entry in select value from jsonb_array_elements(p_json) loop if lingjing_private.has_secret(v_entry.value) then return true;end if;end loop;
  end if;return false;
end $$;
create function lingjing_private.validate_envelope(p_owner text,p_envelope jsonb) returns void
language plpgsql immutable set search_path='' as $$
begin
  if p_envelope->>'format' is distinct from 'lingjing-account-save' or p_envelope->>'version' is distinct from '1'
    or p_envelope->>'ownerAccountId' is distinct from p_owner
    or p_envelope#>>'{identity,provider}' is distinct from 'runtime' or p_envelope#>>'{identity,subjectId}' is distinct from p_owner
    or coalesce(p_envelope#>>'{provenance,mode}','live')<>'live'
    or jsonb_typeof(p_envelope#>'{data,modules}') is distinct from 'object' or jsonb_typeof(p_envelope#>'{data,tables}') is distinct from 'object'
    or octet_length(p_envelope::text)>26*1024*1024 then raise exception 'LJ_INVALID_SAVE';end if;
  if p_envelope->>'checksum' is distinct from lingjing_private.seal_save(p_envelope)->>'checksum' then raise exception 'LJ_SAVE_CHECKSUM_MISMATCH';end if;
  if lingjing_private.has_secret(p_envelope->'data') then raise exception 'LJ_SAVE_CONTAINS_SECRET';end if;
end $$;
create function lingjing_private.validate_personal(p_owner text,p_module text,p_record jsonb) returns void
language plpgsql stable set search_path='' as $$
declare v_table record;v_row jsonb;v_pet text;v_field text;
begin
  if p_record->>'version' is distinct from '1' or jsonb_typeof(p_record->'data') is distinct from 'object' then raise exception 'LJ_INVALID_SAVE';end if;
  if p_module='settings' then
    if jsonb_typeof(p_record#>'{data,desktop}') is distinct from 'object' or jsonb_typeof(p_record#>'{data,privacy}') is distinct from 'object' then raise exception 'LJ_INVALID_SAVE';end if;
  elsif p_module='conversations' then
    if p_record#>>'{data,ownerAccountId}' is distinct from p_owner or jsonb_typeof(p_record#>'{data,tables}') is distinct from 'object' then raise exception 'LJ_SAVE_OWNER_MISMATCH';end if;
    for v_table in select * from jsonb_each(p_record#>'{data,tables}') loop
      if v_table.key not in ('conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences') or jsonb_typeof(v_table.value)<>'array' then raise exception 'LJ_INVALID_SAVE';end if;
      for v_row in select * from jsonb_array_elements(v_table.value) loop
        if v_row->>'owner_account_id' is distinct from p_owner then raise exception 'LJ_SAVE_OWNER_MISMATCH';end if;
        v_pet:=coalesce(v_row->>'pet_id',v_row->>'selected_pet_id',case when v_row->>'scope'='pet' then v_row->>'scope_id' end);
        if coalesce(v_pet,'')<>'' and not exists(select 1 from lingjing_private.owned_pet_ids where owner_id=p_owner and pet_id=v_pet) then raise exception 'LJ_PET_OWNER_MISMATCH';end if;
      end loop;
    end loop;
  else raise exception 'LJ_SAVE_MODULE_NOT_ALLOWED';end if;
end $$;
create function lingjing_private.guard_authority(p_owner text,p_data jsonb) returns void
language plpgsql stable set search_path='' as $$
declare v_module record;v_table record;v_expected lingjing_private.authority_fragments;
begin
  for v_module in select * from jsonb_each(p_data->'modules') loop
    if v_module.key in ('settings','conversations') then perform lingjing_private.validate_personal(p_owner,v_module.key,v_module.value);
    elsif v_module.key='legacy' and v_module.value->'data'='null'::jsonb then null;
    else
      select * into v_expected from lingjing_private.authority_fragments where owner_id=p_owner and module_id=v_module.key;
      if not found or v_expected.module_state is distinct from v_module.value then raise exception 'LJ_PROTECTED_STATE_REQUIRES_AUTHORITY';end if;
    end if;
  end loop;
  for v_expected in select * from lingjing_private.authority_fragments where owner_id=p_owner loop
    if v_expected.module_state is not null and (p_data->'modules'->v_expected.module_id) is distinct from v_expected.module_state then raise exception 'LJ_PROTECTED_STATE_MISMATCH';end if;
    for v_table in select * from jsonb_each(v_expected.table_states) loop
      if (p_data->'tables'->v_table.key) is distinct from v_table.value then raise exception 'LJ_PROTECTED_STATE_MISMATCH';end if;
    end loop;
  end loop;
  for v_table in select * from jsonb_each(p_data->'tables') loop
    if not exists(select 1 from lingjing_private.authority_fragments where owner_id=p_owner and table_states->v_table.key=v_table.value) then raise exception 'LJ_PROTECTED_STATE_REQUIRES_AUTHORITY';end if;
  end loop;
end $$;
create function lingjing_private.lock_save_owner(p_owner text) returns void language plpgsql set search_path='' as $$
begin perform 1 from public.lingjing_accounts where owner_id=p_owner for update;
  if not found then raise exception 'LJ_IDENTITY_REQUIRED';end if;
end $$;
create function lingjing_private.save_receipt(p_owner text,p_action text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('actionId',action_id,'revision',revision,'checksum',checksum,'envelope',envelope,'kind',kind)
 from public.lingjing_save_actions where owner_id=p_owner and action_id=p_action
$$;
create function lingjing_private.push_personal_save(p_action_id text,p_base_revision bigint,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text:=lingjing_private.actor_owner();v_actor jsonb;v_prior public.lingjing_save_actions;v_current bigint;v_hash text;
begin
  if coalesce(p_action_id,'') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$' or p_base_revision is null or p_base_revision<0 then raise exception 'LJ_INVALID_REQUEST';end if;
  perform lingjing_private.validate_envelope(v_owner,p_envelope);perform lingjing_private.lock_save_owner(v_owner);
  v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(jsonb_build_object('baseRevision',p_base_revision,'envelope',p_envelope)),'UTF8')),'hex');
  select * into v_prior from public.lingjing_save_actions where owner_id=v_owner and action_id=p_action_id;
  if found then if v_prior.kind<>'personal' or v_prior.input_hash<>v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
    return lingjing_private.save_receipt(v_owner,p_action_id)||jsonb_build_object('duplicate',true);end if;
  select coalesce((select revision from public.lingjing_saves where owner_id=v_owner),0) into v_current;
  if v_current<>p_base_revision then raise exception 'LJ_SYNC_CONFLICT';end if;
  perform lingjing_private.guard_authority(v_owner,p_envelope->'data');
  v_actor:=lingjing_private.actor_for_device((nullif(current_setting('request.headers',true),'')::jsonb->>'x-lingjing-device-id')::uuid);
  insert into public.lingjing_saves(owner_id,revision,action_id,checksum,envelope) values(v_owner,v_current+1,p_action_id,p_envelope->>'checksum',p_envelope)
    on conflict(owner_id) do update set revision=excluded.revision,action_id=excluded.action_id,checksum=excluded.checksum,envelope=excluded.envelope,updated_at=now();
  insert into public.lingjing_save_actions(owner_id,action_id,kind,input_hash,base_revision,revision,checksum,envelope,device_id,session_id)
    values(v_owner,p_action_id,'personal',v_hash,v_current,v_current+1,p_envelope->>'checksum',p_envelope,(v_actor->>'deviceId')::uuid,(v_actor->>'sessionId')::uuid);
  return lingjing_private.save_receipt(v_owner,p_action_id);
end $$;
create function public.lingjing_push_save(p_action_id text,p_base_revision bigint,p_envelope jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select lingjing_private.push_personal_save(p_action_id,p_base_revision,p_envelope) $$;

-- DOMAIN CONTRACT: lock_save_owner first, then domain rows, then this function
-- in the SAME transaction as inventory/reward/battle mutation. Fragments must be
-- SELECTed from canonical server rows, never forwarded renderer JSON. Private
-- SQL helpers are available to trusted definer RPCs; the public server wrapper
-- below is service_role-only, useful for verified Storage/source import receipts.
create function lingjing_private.commit_authority(p_owner_id text,p_action_id text,p_fragments jsonb,p_expected_revision bigint default null) returns jsonb
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
        if exists(select 1 from lingjing_private.owned_pet_ids where pet_id=(v_pet#>>'{}') and owner_id<>p_owner_id) then raise exception 'LJ_PET_OWNER_MISMATCH';end if;
        insert into lingjing_private.owned_pet_ids(pet_id,owner_id) values(v_pet#>>'{}',p_owner_id) on conflict(pet_id) do nothing;
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
  return lingjing_private.save_receipt(p_owner_id,p_action_id);
end $$;
create function public.lingjing_commit_authority(p_owner_id text,p_action_id text,p_fragments jsonb,p_expected_revision bigint default null) returns jsonb
language sql security invoker set search_path='' as $$select lingjing_private.commit_authority(p_owner_id,p_action_id,p_fragments,p_expected_revision)$$;

create function lingjing_private.archive_save(p_action_id text,p_reason text,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text:=lingjing_private.actor_owner();v_row public.lingjing_save_archives;
begin
  if coalesce(p_action_id,'') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$' or p_reason is null or p_reason not in ('unverified-local','pre-conflict','before-cloud-restore') then raise exception 'LJ_INVALID_REQUEST';end if;
  perform lingjing_private.validate_envelope(v_owner,p_envelope);perform lingjing_private.lock_save_owner(v_owner);
  select * into v_row from public.lingjing_save_archives where owner_id=v_owner and action_id=p_action_id;
  if found then if v_row.checksum<>p_envelope->>'checksum' or v_row.reason<>p_reason then raise exception 'LJ_ACTION_ID_REUSED';end if;
  else insert into public.lingjing_save_archives(owner_id,action_id,reason,checksum,envelope) values(v_owner,p_action_id,p_reason,p_envelope->>'checksum',p_envelope) returning * into v_row;end if;
  return jsonb_build_object('id',v_row.id,'actionId',p_action_id,'checksum',v_row.checksum,'promoted',false,'reason',v_row.reason);
end $$;
create function public.lingjing_archive_save(p_action_id text,p_reason text,p_envelope jsonb) returns jsonb
language sql security invoker set search_path='' as $$select lingjing_private.archive_save(p_action_id,p_reason,p_envelope)$$;

revoke all on function lingjing_private.utf16_key(text),lingjing_private.canonical_number(jsonb),lingjing_private.canonical_json(jsonb),lingjing_private.seal_save(jsonb),lingjing_private.has_secret(jsonb),lingjing_private.validate_envelope(text,jsonb),
  lingjing_private.validate_personal(text,text,jsonb),lingjing_private.guard_authority(text,jsonb),lingjing_private.lock_save_owner(text),lingjing_private.save_receipt(text,text),
  lingjing_private.push_personal_save(text,bigint,jsonb),lingjing_private.commit_authority(text,text,jsonb,bigint),lingjing_private.archive_save(text,text,jsonb) from public,anon,authenticated;
grant execute on function lingjing_private.push_personal_save(text,bigint,jsonb),lingjing_private.archive_save(text,text,jsonb) to authenticated;
grant execute on function lingjing_private.utf16_key(text),lingjing_private.canonical_number(jsonb),lingjing_private.canonical_json(jsonb),lingjing_private.seal_save(jsonb),lingjing_private.has_secret(jsonb),lingjing_private.validate_envelope(text,jsonb),
  lingjing_private.validate_personal(text,text,jsonb),lingjing_private.guard_authority(text,jsonb),lingjing_private.lock_save_owner(text),lingjing_private.save_receipt(text,text),lingjing_private.commit_authority(text,text,jsonb,bigint) to service_role;
revoke all on function public.lingjing_push_save(text,bigint,jsonb),public.lingjing_archive_save(text,text,jsonb) from public,anon;
grant execute on function public.lingjing_push_save(text,bigint,jsonb),public.lingjing_archive_save(text,text,jsonb) to authenticated;
revoke all on function public.lingjing_commit_authority(text,text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.lingjing_commit_authority(text,text,jsonb,bigint) to service_role;
commit;
