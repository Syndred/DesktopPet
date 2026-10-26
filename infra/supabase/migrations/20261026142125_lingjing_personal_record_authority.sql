-- Per-record personal data. Gameplay keeps its existing authoritative RPCs.
-- Old full saves are retained as historical sources, not merged into live rows.
begin;
create table public.lingjing_personal_record_accounts (
  owner_id text primary key references public.lingjing_accounts(owner_id) on delete restrict,
  source_revision bigint not null, initialized_at timestamptz not null default now()
);
create sequence lingjing_private.personal_record_changes;
create table public.lingjing_personal_records (
  owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
  collection text not null check(collection in ('conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences')),
  record_id text not null check(length(record_id) between 1 and 1024),
  revision bigint not null check(revision>0), document jsonb not null,
  deleted boolean not null default false,
  position bigint not null default nextval('lingjing_private.personal_record_changes'),
  change_sequence bigint not null default nextval('lingjing_private.personal_record_changes'),
  updated_at timestamptz not null default now(), primary key(owner_id,collection,record_id)
);
create index lingjing_personal_records_changes on public.lingjing_personal_records(owner_id,change_sequence);
create unique index lingjing_personal_message_turn on public.lingjing_personal_records(owner_id,(document->>'pet_id'),(document->>'action_id'),(document->>'role'))
 where collection='conversation_messages' and not deleted;
create table lingjing_private.personal_record_actions (
  owner_id text not null references public.lingjing_accounts(owner_id), action_id text not null,
  input_hash text not null, changes jsonb not null, receipt jsonb not null,
  created_at timestamptz not null default now(), primary key(owner_id,action_id)
);
alter table public.lingjing_personal_record_accounts enable row level security;
alter table public.lingjing_personal_records enable row level security;
alter table lingjing_private.personal_record_actions enable row level security;
revoke all on public.lingjing_personal_record_accounts,public.lingjing_personal_records,lingjing_private.personal_record_actions from public,anon,authenticated;
grant select on public.lingjing_personal_record_accounts,public.lingjing_personal_records to authenticated;
grant all on public.lingjing_personal_record_accounts,public.lingjing_personal_records,lingjing_private.personal_record_actions to service_role;
grant usage,select on sequence lingjing_private.personal_record_changes to service_role;
create policy lingjing_personal_records_self on public.lingjing_personal_records for select to authenticated using(owner_id=(select public.lingjing_current_owner()));
create policy lingjing_personal_record_account_self on public.lingjing_personal_record_accounts for select to authenticated using(owner_id=(select public.lingjing_current_owner()));

create function lingjing_private.personal_record_id(p_collection text,p_document jsonb) returns text
language sql immutable set search_path='' as $$
 select lingjing_private.canonical_json(case p_collection
  when 'conversation_profiles' then jsonb_build_array(p_document->'pet_id')
  when 'conversation_connections' then jsonb_build_array(p_document->'scope',p_document->'scope_id')
  when 'conversation_messages' then jsonb_build_array(p_document->'id')
  when 'conversation_memories' then jsonb_build_array(p_document->'pet_id',p_document->'id')
  when 'conversation_preferences' then jsonb_build_array(p_document->'owner_account_id') end)
$$;
create function lingjing_private.initialize_personal_records(p_owner text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_head public.lingjing_saves; v_collection text; v_rows jsonb; v_document jsonb;
begin
 if exists(select 1 from public.lingjing_personal_record_accounts where owner_id=p_owner) then return;end if;
 select * into v_head from public.lingjing_saves where owner_id=p_owner;
 foreach v_collection in array array['conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences'] loop
  v_rows:=coalesce(v_head.envelope#>array['data','modules','conversations','data','tables',v_collection],v_head.envelope#>array['data','tables',v_collection,'rows'],'[]'::jsonb);
  if jsonb_typeof(v_rows)<>'array' then raise exception 'LJ_RECORD_SOURCE_INVALID';end if;
  for v_document in select value from jsonb_array_elements(v_rows) loop
   if v_document->>'owner_account_id' is distinct from p_owner then raise exception 'LJ_OWNER_MISMATCH';end if;
   insert into public.lingjing_personal_records(owner_id,collection,record_id,revision,document)
    values(p_owner,v_collection,lingjing_private.personal_record_id(v_collection,v_document),1,v_document);
  end loop;
 end loop;
 insert into public.lingjing_personal_record_accounts(owner_id,source_revision) values(p_owner,coalesce(v_head.revision,0));
end $$;

create function public.lingjing_read_personal_records(p_owner text,p_uid uuid,p_device uuid,p_sid uuid,p_after bigint default 0,p_limit integer default 500)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_records jsonb; v_cursor bigint;v_more boolean;
begin
 perform lingjing_private.assert_service_actor(p_owner,p_uid,p_device,p_sid);
 if p_after<0 or p_limit not between 1 and 500 then raise exception 'LJ_INVALID_REQUEST';end if;
 perform lingjing_private.initialize_personal_records(p_owner);
 select coalesce(jsonb_agg(jsonb_build_object('collection',collection,'id',record_id,'revision',revision,'document',document,
  'deleted',deleted,'position',position,'changeSequence',change_sequence) order by change_sequence),'[]'::jsonb),coalesce(max(change_sequence),p_after)
  into v_records,v_cursor from (select * from public.lingjing_personal_records where owner_id=p_owner and change_sequence>p_after order by change_sequence limit p_limit) r;
 select exists(select 1 from public.lingjing_personal_records where owner_id=p_owner and change_sequence>v_cursor) into v_more;
 return jsonb_build_object('ownerAccountId',p_owner,'records',v_records,'cursor',v_cursor,'hasMore',v_more);
end $$;

create function public.lingjing_write_personal_records(p_owner text,p_uid uuid,p_device uuid,p_sid uuid,p_action_id text,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_prior lingjing_private.personal_record_actions;v_hash text;v_change jsonb;v_row public.lingjing_personal_records;
 v_collection text;v_id text;v_document jsonb;v_pet text;v_result jsonb:='[]'::jsonb;v_seen text[]:='{}';v_key text;v_receipt jsonb;
begin
 perform lingjing_private.assert_service_actor(p_owner,p_uid,p_device,p_sid);
 if coalesce(p_action_id,'') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$' or jsonb_typeof(p_changes) is distinct from 'array'
  or jsonb_array_length(p_changes) not between 1 and 100 then raise exception 'LJ_INVALID_REQUEST';end if;
 v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(p_changes),'UTF8')),'hex');
 select * into v_prior from lingjing_private.personal_record_actions where owner_id=p_owner and action_id=p_action_id;
 if found then
  if v_prior.input_hash<>v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
  return v_prior.receipt||jsonb_build_object('duplicate',true);
 end if;
 perform lingjing_private.initialize_personal_records(p_owner);
 for v_change in select value from jsonb_array_elements(p_changes) loop
  v_collection:=v_change->>'collection';v_id:=v_change->>'id';v_document:=v_change->'document';
  if v_collection not in ('conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences')
   or coalesce(length(v_id),0) not between 1 and 1024 or coalesce(v_change->>'baseRevision','') !~ '^[0-9]+$'
   or not(v_change ? 'document') then raise exception 'LJ_RECORD_INVALID';end if;
  v_key:=v_collection||':'||v_id;if v_key=any(v_seen) then raise exception 'LJ_RECORD_INVALID';end if;v_seen:=array_append(v_seen,v_key);
  select * into v_row from public.lingjing_personal_records where owner_id=p_owner and collection=v_collection and record_id=v_id for update;
  if coalesce(v_row.revision,0)<>(v_change->>'baseRevision')::bigint then raise exception 'LJ_RECORD_CONFLICT';end if;
  if v_document='null'::jsonb then
   if v_row.owner_id is null then raise exception 'LJ_RECORD_NOT_FOUND';end if;
   update public.lingjing_personal_records set deleted=true,revision=revision+1,change_sequence=nextval('lingjing_private.personal_record_changes'),updated_at=now()
    where owner_id=p_owner and collection=v_collection and record_id=v_id returning * into v_row;
  else
   if jsonb_typeof(v_document) is distinct from 'object' or v_document->>'owner_account_id' is distinct from p_owner
    or lingjing_private.personal_record_id(v_collection,v_document) is distinct from v_id then raise exception 'LJ_RECORD_INVALID';end if;
   if v_collection='conversation_messages' then
    if v_row.owner_id is not null and (v_document->>'pet_id' is distinct from v_row.document->>'pet_id' or v_document->>'action_id' is distinct from v_row.document->>'action_id' or v_document->>'role' is distinct from v_row.document->>'role') then raise exception 'LJ_RECORD_ID_REUSED';end if;
    if exists(select 1 from public.lingjing_personal_records where owner_id=p_owner and collection=v_collection and record_id<>v_id and not deleted
      and document->>'pet_id'=v_document->>'pet_id' and document->>'action_id'=v_document->>'action_id' and document->>'role'=v_document->>'role') then raise exception 'LJ_RECORD_ID_REUSED';end if;
   end if;
   -- Request documents have an exact allow-list in the authenticated worker;
   -- the privileged transaction independently rejects credentials and ownership.
   if v_document ?| array['encrypted_key','api_key','access_token','refresh_token','password','secret','session_token'] then raise exception 'LJ_SAVE_CONTAINS_SECRET';end if;
   v_pet:=coalesce(v_document->>'pet_id',v_document->>'selected_pet_id',case when v_document->>'scope'='pet' then v_document->>'scope_id' end);
   if v_pet is not null and not exists(select 1 from lingjing_private.owned_pet_ids where owner_id=p_owner and pet_id=v_pet) then raise exception 'LJ_PET_OWNER_MISMATCH';end if;
   insert into public.lingjing_personal_records(owner_id,collection,record_id,revision,document) values(p_owner,v_collection,v_id,1,v_document)
    on conflict(owner_id,collection,record_id) do update set revision=lingjing_personal_records.revision+1,document=excluded.document,deleted=false,
     change_sequence=nextval('lingjing_private.personal_record_changes'),updated_at=now() returning * into v_row;
  end if;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('collection',v_row.collection,'id',v_row.record_id,'revision',v_row.revision,
   'document',v_row.document,'deleted',v_row.deleted,'position',v_row.position,'changeSequence',v_row.change_sequence));
 end loop;
 v_receipt:=jsonb_build_object('ownerAccountId',p_owner,'actionId',p_action_id,'records',v_result,'duplicate',false);
 insert into lingjing_private.personal_record_actions(owner_id,action_id,input_hash,changes,receipt) values(p_owner,p_action_id,v_hash,p_changes,v_receipt);
 return v_receipt;
end $$;

-- Once this owner uses records, a stale old desktop must not upload its whole
-- personal snapshot over the new canonical rows. Retain all historical receipts.
-- Preserve the existing private actor-checked definer and put the transition
-- guard inside its existing owner lock; no new privilege is granted to clients.
create or replace function lingjing_private.push_personal_save(p_action_id text,p_base_revision bigint,p_envelope jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_owner text:=lingjing_private.actor_owner();v_actor jsonb;v_prior public.lingjing_save_actions;v_current bigint;v_hash text;
begin
 if coalesce(p_action_id,'') !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$' or p_base_revision is null or p_base_revision<0 then raise exception 'LJ_INVALID_REQUEST';end if;
 perform lingjing_private.validate_envelope(v_owner,p_envelope);perform lingjing_private.lock_save_owner(v_owner);
 v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(jsonb_build_object('baseRevision',p_base_revision,'envelope',p_envelope)),'UTF8')),'hex');
 select * into v_prior from public.lingjing_save_actions where owner_id=v_owner and action_id=p_action_id;
 if found then if v_prior.kind<>'personal' or v_prior.input_hash<>v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
  return lingjing_private.save_receipt(v_owner,p_action_id)||jsonb_build_object('duplicate',true);end if;
 if exists(select 1 from public.lingjing_personal_record_accounts where owner_id=v_owner) then raise exception 'LJ_RECORD_API_REQUIRED';end if;
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
create or replace function public.lingjing_push_save(p_action_id text,p_base_revision bigint,p_envelope jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare v_owner text:=public.lingjing_current_owner();
begin
 if exists(select 1 from public.lingjing_personal_record_accounts where owner_id=v_owner) then raise exception 'LJ_RECORD_API_REQUIRED';end if;
 return lingjing_private.push_personal_save(p_action_id,p_base_revision,p_envelope);
end $$;
revoke all on function lingjing_private.personal_record_id(text,jsonb),lingjing_private.initialize_personal_records(text),
 public.lingjing_read_personal_records(text,uuid,uuid,uuid,bigint,integer),public.lingjing_write_personal_records(text,uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function lingjing_private.personal_record_id(text,jsonb),lingjing_private.initialize_personal_records(text),
 public.lingjing_read_personal_records(text,uuid,uuid,uuid,bigint,integer),public.lingjing_write_personal_records(text,uuid,uuid,uuid,text,jsonb) to service_role;
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.lingjing_personal_records;
 end if;
end $$;
commit;
