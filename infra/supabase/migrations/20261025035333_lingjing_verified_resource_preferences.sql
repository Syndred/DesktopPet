begin;
create table public.lingjing_resource_preferences (
 owner_account_id text not null references public.lingjing_accounts(owner_id),auth_user_id uuid not null,
 resource_id text not null check(length(resource_id) between 1 and 200),revision bigint not null check(revision>0),
 document jsonb not null,authority_action_id text not null,
 primary key(owner_account_id,resource_id),
 foreign key(owner_account_id,authority_action_id) references public.lingjing_save_actions(owner_id,action_id) deferrable initially deferred
);
create table public.lingjing_resource_preference_actions (
 owner_account_id text not null references public.lingjing_accounts(owner_id),action_id uuid not null,resource_id text not null,
 request_hash text not null,preference_revision bigint not null,authority_action_id text not null,
 primary key(owner_account_id,action_id),foreign key(owner_account_id,authority_action_id) references public.lingjing_save_actions(owner_id,action_id)
);
create index lingjing_resource_preferences_action_fk on public.lingjing_resource_preferences(owner_account_id,authority_action_id);
create index lingjing_resource_preference_actions_authority_fk on public.lingjing_resource_preference_actions(owner_account_id,authority_action_id);
alter table public.lingjing_resource_preferences enable row level security;
alter table public.lingjing_resource_preference_actions enable row level security;
revoke all on public.lingjing_resource_preferences,public.lingjing_resource_preference_actions from public,anon,authenticated;
grant select on public.lingjing_resource_preferences,public.lingjing_resource_preference_actions to authenticated;
grant all on public.lingjing_resource_preferences,public.lingjing_resource_preference_actions to service_role;
create policy lingjing_resource_preference_self_read on public.lingjing_resource_preferences for select to authenticated
 using(auth_user_id=(select auth.uid()) and owner_account_id=(select public.lingjing_current_owner()));
create policy lingjing_resource_preference_action_self_read on public.lingjing_resource_preference_actions for select to authenticated
 using(owner_account_id=(select public.lingjing_current_owner()));

-- Closed numeric/boolean/clip-name document only. The Edge command additionally
-- uses the SAME pure desktop validator against the actual verified clips.
create function lingjing_private.validate_resource_preferences(p_doc jsonb) returns void language plpgsql set search_path='' as $$
declare v_context jsonb;v_value jsonb;v_key text;v_number numeric;
begin
 if jsonb_typeof(p_doc) is distinct from 'object' or jsonb_typeof(p_doc->'calibration') is distinct from 'object' or jsonb_typeof(p_doc->'actions') is distinct from 'object'
  or (select array_agg(key order by key) from jsonb_object_keys(p_doc) key) is distinct from array['actions','calibration']::text[]
  or (select array_agg(key order by key) from jsonb_object_keys(p_doc->'calibration') key) is distinct from array['battle','desktop']::text[] then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
 for v_context in select value from jsonb_each(p_doc->'calibration') loop
  if jsonb_typeof(v_context)<>'object' or (select array_agg(key order by key) from jsonb_object_keys(v_context) key) is distinct from array['anchorX','anchorY','fps','mirrorX','rotationDeg','scale','verticalOffset']::text[]
   or jsonb_typeof(v_context->'mirrorX')<>'boolean' then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
  for v_key,v_value in select * from jsonb_each(v_context-'mirrorX') loop
   if jsonb_typeof(v_value)<>'number' then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
   v_number:=(v_value#>>'{}')::numeric;
   if (v_key='scale' and (v_number<0.25 or v_number>3)) or(v_key='rotationDeg' and(v_number< -180 or v_number>180))
    or(v_key='verticalOffset' and(v_number< -0.5 or v_number>0.5)) or(v_key in('anchorX','anchorY') and(v_number<0 or v_number>1))
    or(v_key='fps' and(v_number<0 or v_number>60 or(v_number>0 and v_number<1))) then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
  end loop;
 end loop;
 if (select array_agg(key order by key) from jsonb_object_keys(p_doc->'actions') key) is distinct from array['attack','attack_release','attack_windup','blink','eat','hit','idle','skill','sleep','victory','walk','wave']::text[] then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
 for v_value in select value from jsonb_each(p_doc->'actions') loop
  if jsonb_typeof(v_value) not in('string','null') or(jsonb_typeof(v_value)='string' and length(v_value#>>'{}') not between 1 and 200) then raise exception 'LJ_RESOURCE_PREFERENCE_INVALID';end if;
 end loop;
end $$;

create function lingjing_private.resource_module(p_owner text) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('version',2,'data',jsonb_build_object('format','lingjing-resource-references','ownerAccountId',p_owner,
 'references',coalesce((select jsonb_agg(jsonb_build_object('authUserId',auth_user_id,'resourceId',resource_id,'manifestSha256',manifest_sha256,'contentHash',content_hash,
  'manifestPath',manifest_path,'manifestBytes',manifest_bytes,'totalBytes',total_bytes,'kind',resource_kind) order by resource_id,manifest_sha256) from public.lingjing_resource_references where owner_account_id=p_owner),'[]'::jsonb),
 'preferences',coalesce((select jsonb_agg(jsonb_build_object('resourceId',resource_id,'revision',revision,'calibration',document->'calibration','actions',document->'actions') order by resource_id)
 from public.lingjing_resource_preferences where owner_account_id=p_owner),'[]'::jsonb)))
$$;
revoke all on function lingjing_private.validate_resource_preferences(jsonb),lingjing_private.resource_module(text) from public,anon,authenticated;
grant execute on function lingjing_private.validate_resource_preferences(jsonb),lingjing_private.resource_module(text) to service_role;

create function public.lingjing_set_resource_preferences(p_owner text,p_uid uuid,p_device uuid,p_sid uuid,p_resource_id text,p_action_id uuid,p_base_revision bigint,p_document jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_prior public.lingjing_resource_preference_actions;v_hash text;v_current bigint;v_receipt jsonb;v_authority text;
begin
 perform lingjing_private.assert_service_actor(p_owner,p_uid,p_device,p_sid);
 if p_action_id is null or p_resource_id is null or length(p_resource_id) not between 1 and 200 or p_base_revision is null or p_base_revision<0 then raise exception 'LJ_INVALID_REQUEST';end if;
 perform lingjing_private.validate_resource_preferences(p_document);
 if p_resource_id not in('builtin:lingjing-yuwan-v2','builtin:lingjing-xiaolan-v1','builtin:lingjing-fantuan-v1','builtin:lingjing-shiba-v2','builtin:lingjing-hatcat-v1','builtin:lingjing-xiaohu-v1','builtin:lingjing-qingya-v1','builtin:lingjing-yantuan-v1')
  and not exists(select 1 from public.lingjing_resource_references where owner_account_id=p_owner and auth_user_id=p_uid and resource_id::text=p_resource_id and resource_kind='spritesheet') then raise exception 'LJ_RESOURCE_REFERENCE_REQUIRED';end if;
 v_hash:=encode(sha256(convert_to(lingjing_private.canonical_json(jsonb_build_object('resourceId',p_resource_id,'baseRevision',p_base_revision,'document',p_document)),'UTF8')),'hex');
 select * into v_prior from public.lingjing_resource_preference_actions where owner_account_id=p_owner and action_id=p_action_id;
 if found then
  if v_prior.request_hash<>v_hash then raise exception 'LJ_ACTION_ID_REUSED';end if;
  return lingjing_private.save_receipt(p_owner,v_prior.authority_action_id)-'envelope'||jsonb_build_object('resourceId',p_resource_id,'preferenceRevision',v_prior.preference_revision,'duplicate',true);
 end if;
 select revision into v_current from public.lingjing_resource_preferences where owner_account_id=p_owner and resource_id=p_resource_id;
 v_current:=coalesce(v_current,0);if v_current<>p_base_revision then raise exception 'LJ_RESOURCE_PREFERENCE_CONFLICT';end if;
 v_authority:='resource-pref:'||p_action_id::text;
 insert into public.lingjing_resource_preferences(owner_account_id,auth_user_id,resource_id,revision,document,authority_action_id)
 values(p_owner,p_uid,p_resource_id,v_current+1,p_document,v_authority) on conflict(owner_account_id,resource_id)
 do update set revision=excluded.revision,document=excluded.document,authority_action_id=excluded.authority_action_id;
 v_receipt:=lingjing_private.commit_authority(p_owner,v_authority,jsonb_build_object('character-resources',jsonb_build_object('module',lingjing_private.resource_module(p_owner),'tables','{}'::jsonb)),null);
 insert into public.lingjing_resource_preference_actions values(p_owner,p_action_id,p_resource_id,v_hash,v_current+1,v_authority);
 return v_receipt-'envelope'||jsonb_build_object('resourceId',p_resource_id,'preferenceRevision',v_current+1,'duplicate',false);
end $$;
revoke all on function public.lingjing_set_resource_preferences(text,uuid,uuid,uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.lingjing_set_resource_preferences(text,uuid,uuid,uuid,text,uuid,bigint,jsonb) to service_role;

-- Rebuild from canonical reference AND preference rows when another package is
-- published, preserving all already committed calibration/action preferences.
create or replace function public.lingjing_register_resource_receipt(p_owner_id text,p_auth_user_id uuid,p_resource_id uuid,p_manifest_sha256 text,p_device_id uuid,p_actor_session uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_package public.lingjing_resource_packages;v_prior public.lingjing_resource_references;
 v_refs jsonb;v_next jsonb;v_receipt jsonb;v_action text;
begin
 perform lingjing_private.assert_service_actor(p_owner_id,p_auth_user_id,p_device_id,p_actor_session);
 select * into v_prior from public.lingjing_resource_references where owner_account_id=p_owner_id and auth_user_id=p_auth_user_id and resource_id=p_resource_id and manifest_sha256=p_manifest_sha256;
 if found then return jsonb_build_object('resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,'authorityActionId',v_prior.authority_action_id,'revision',v_prior.authority_revision,'checksum',v_prior.authority_checksum,'duplicate',true);end if;
 select * into v_package from public.lingjing_resource_packages where auth_user_id=p_auth_user_id and owner_account_id=p_owner_id and resource_id=p_resource_id and manifest_sha256=p_manifest_sha256;
 if not found then raise exception 'LJ_RESOURCE_PACKAGE_REQUIRED';end if;
 v_next:=jsonb_build_object('authUserId',p_auth_user_id,'resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,'contentHash',v_package.content_hash,'manifestPath',v_package.manifest_path,'manifestBytes',v_package.manifest_bytes,'totalBytes',v_package.total_bytes,'kind',v_package.resource_kind);
 select coalesce(jsonb_agg(value order by value->>'resourceId',value->>'manifestSha256'),'[]'::jsonb) into v_refs from(
  select jsonb_array_elements(lingjing_private.resource_module(p_owner_id)->'data'->'references') value union all select v_next) refs;
 v_action:='resources:'||p_resource_id::text||':'||p_manifest_sha256;
 v_receipt:=lingjing_private.commit_authority(p_owner_id,v_action,jsonb_build_object('character-resources',jsonb_build_object('module',jsonb_set(lingjing_private.resource_module(p_owner_id),'{data,references}',v_refs),'tables','{}'::jsonb)),null);
 insert into public.lingjing_resource_references(owner_account_id,auth_user_id,resource_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind,authority_action_id,authority_revision,authority_checksum)
 values(p_owner_id,p_auth_user_id,p_resource_id,p_manifest_sha256,v_package.content_hash,v_package.manifest_path,v_package.manifest_bytes,v_package.total_bytes,v_package.resource_kind,v_action,(v_receipt->>'revision')::bigint,v_receipt->>'checksum');
 return jsonb_build_object('resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,'authorityActionId',v_action,'revision',v_receipt->'revision','checksum',v_receipt->>'checksum','duplicate',false);
end $$;
comment on table public.lingjing_resource_preferences is 'Closed 2D calibration and verified clip mappings; common protected-save authority/CAS, no growth/inventory or raw resource schema.';
commit;
