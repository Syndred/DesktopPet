-- Requires identity, private Storage, protected-save CAS and08 assert_service_actor.
-- The Edge verifier reads actual private bytes as the user before this service-only transaction.
begin;
grant select on public.lingjing_resource_packages to service_role;
create table public.lingjing_resource_references (
  owner_account_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
  auth_user_id uuid not null,
  resource_id uuid not null,
  manifest_sha256 text not null,
  content_hash text not null,
  manifest_path text not null,
  manifest_bytes integer not null,
  total_bytes bigint not null,
  resource_kind text not null,
  authority_action_id text not null,
  authority_revision bigint not null check(authority_revision>0),
  authority_checksum text not null check(authority_checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_account_id,resource_id,manifest_sha256),
  foreign key(auth_user_id,resource_id,manifest_sha256)
    references public.lingjing_resource_packages(auth_user_id,resource_id,manifest_sha256) on delete restrict,
  foreign key(owner_account_id,authority_action_id)
    references public.lingjing_save_actions(owner_id,action_id) on delete restrict
);
create index lingjing_resource_references_uid_time on public.lingjing_resource_references(auth_user_id,created_at,resource_id);
alter table public.lingjing_resource_references enable row level security;
revoke all on public.lingjing_resource_references from public,anon,authenticated;
grant select on public.lingjing_resource_references to authenticated;
grant all on public.lingjing_resource_references to service_role;
create policy lingjing_verified_resource_self_read on public.lingjing_resource_references
for select to authenticated using(auth_user_id=(select auth.uid()) and owner_account_id=(select public.lingjing_current_owner()));

create function public.lingjing_register_resource_receipt(p_owner_id text,p_auth_user_id uuid,p_resource_id uuid,p_manifest_sha256 text,p_device_id uuid,p_actor_session uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_package public.lingjing_resource_packages;v_prior public.lingjing_resource_references;
  v_refs jsonb;v_next jsonb;v_receipt jsonb;v_action text;
begin
  --08 takes the common owner lock and rechecks the actual Auth session, immutable
  -- revocation ledger and exact device binding inside this write transaction.
  -- This guard precedes duplicate replay and all resource/domain rows.
  perform lingjing_private.assert_service_actor(p_owner_id,p_auth_user_id,p_device_id,p_actor_session);
  select * into v_prior from public.lingjing_resource_references
    where owner_account_id=p_owner_id and auth_user_id=p_auth_user_id and resource_id=p_resource_id and manifest_sha256=p_manifest_sha256;
  if found then return jsonb_build_object('resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,
    'authorityActionId',v_prior.authority_action_id,'revision',v_prior.authority_revision,'checksum',v_prior.authority_checksum,'duplicate',true);end if;
  select * into v_package from public.lingjing_resource_packages where auth_user_id=p_auth_user_id and owner_account_id=p_owner_id
    and resource_id=p_resource_id and manifest_sha256=p_manifest_sha256;
  if not found then raise exception 'LJ_RESOURCE_PACKAGE_REQUIRED';end if;
  v_next:=jsonb_build_object('authUserId',p_auth_user_id,'resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,
    'contentHash',v_package.content_hash,'manifestPath',v_package.manifest_path,'manifestBytes',v_package.manifest_bytes,
    'totalBytes',v_package.total_bytes,'kind',v_package.resource_kind);
  select coalesce(jsonb_agg(value order by value->>'resourceId',value->>'manifestSha256'),'[]'::jsonb) into v_refs from (
    select jsonb_build_object('authUserId',auth_user_id,'resourceId',resource_id,'manifestSha256',manifest_sha256,
      'contentHash',content_hash,'manifestPath',manifest_path,'manifestBytes',manifest_bytes,'totalBytes',total_bytes,'kind',resource_kind) value
    from public.lingjing_resource_references where owner_account_id=p_owner_id
    union all select v_next
  ) refs;
  v_action:='resources:'||p_resource_id::text||':'||p_manifest_sha256;
  v_receipt:=lingjing_private.commit_authority(p_owner_id,v_action,
    jsonb_build_object('character-resources',jsonb_build_object('module',jsonb_build_object('version',2,'data',
      jsonb_build_object('format','lingjing-resource-references','ownerAccountId',p_owner_id,'references',v_refs)),'tables','{}'::jsonb)),null);
  if v_receipt->>'kind' is distinct from 'authority' or v_receipt->>'checksum' is null then raise exception 'LJ_RESOURCE_RECEIPT_INVALID';end if;
  insert into public.lingjing_resource_references(owner_account_id,auth_user_id,resource_id,manifest_sha256,content_hash,manifest_path,
    manifest_bytes,total_bytes,resource_kind,authority_action_id,authority_revision,authority_checksum)
    values(p_owner_id,p_auth_user_id,p_resource_id,p_manifest_sha256,v_package.content_hash,v_package.manifest_path,
      v_package.manifest_bytes,v_package.total_bytes,v_package.resource_kind,v_action,(v_receipt->>'revision')::bigint,v_receipt->>'checksum');
  return jsonb_build_object('resourceId',p_resource_id,'manifestSha256',p_manifest_sha256,'authorityActionId',v_action,
    'revision',v_receipt->'revision','checksum',v_receipt->>'checksum','duplicate',false);
end $$;
revoke all on function public.lingjing_register_resource_receipt(text,uuid,uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.lingjing_register_resource_receipt(text,uuid,uuid,text,uuid,uuid) to service_role;
comment on table public.lingjing_resource_references is 'Service-verified private package references atomically registered in the common protected save. Client index insertion alone confers no protected reference.';
commit;
