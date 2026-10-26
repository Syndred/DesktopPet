-- Preserve observed legacy message order without rewriting message identities,
-- content revisions, gameplay state or previous deployment sources.
begin;
create or replace function public.lingjing_write_personal_records(p_owner text,p_uid uuid,p_device uuid,p_sid uuid,p_action_id text,p_changes jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_prior lingjing_private.personal_record_actions;v_hash text;v_change jsonb;v_row public.lingjing_personal_records;
 v_collection text;v_id text;v_document jsonb;v_pet text;v_result jsonb:='[]'::jsonb;v_seen text[]:='{}';v_key text;v_receipt jsonb;v_position bigint;
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
  v_collection:=v_change->>'collection';v_id:=v_change->>'id';v_document:=v_change->'document';v_position:=null;
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
   -- Historical rows may be inserted before a known same-pet anchor. The
   -- account actor lock serializes insertion; content revisions stay separate.
   if v_change ? 'beforeId' then
    if v_collection<>'conversation_messages' or v_row.owner_id is not null or (v_change->>'baseRevision')::bigint<>0
     or jsonb_typeof(v_change->'beforeId') is distinct from 'string' or length(v_change->>'beforeId') not between 1 and 1024
     or v_change->>'beforeId'=v_id then raise exception 'LJ_RECORD_INVALID';end if;
    select position into v_position from public.lingjing_personal_records
     where owner_id=p_owner and collection=v_collection and record_id=v_change->>'beforeId' and not deleted
      and document->>'pet_id'=v_pet;
    if v_position is null then raise exception 'LJ_RECORD_CONFLICT';end if;
    update public.lingjing_personal_records set position=position+1,change_sequence=nextval('lingjing_private.personal_record_changes')
     where owner_id=p_owner and collection=v_collection and position>=v_position;
   end if;
   insert into public.lingjing_personal_records(owner_id,collection,record_id,revision,document,position)
    values(p_owner,v_collection,v_id,1,v_document,coalesce(v_position,nextval('lingjing_private.personal_record_changes')))
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
commit;

