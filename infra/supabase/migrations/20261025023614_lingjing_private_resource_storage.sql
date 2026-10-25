-- Additive Lingjing-only Storage deployment. Coordinator applies after legacy export.
-- No existing comparisontext table, Auth identity or function is modified.
-- Requires accounts' lingjing_identity_actor_contract migration first.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lingjing-resources-v1', 'lingjing-resources-v1', false, 4194304,
        array['application/octet-stream','application/json'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from storage.buckets where id='lingjing-resources-v1'
    and public=false and file_size_limit=4194304
    and allowed_mime_types @> array['application/octet-stream','application/json']::text[]
    and allowed_mime_types <@ array['application/octet-stream','application/json']::text[])
  then raise exception 'Existing lingjing resource bucket differs; review it instead of overwriting'; end if;
end $$;

create table public.lingjing_resource_packages (
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  resource_id uuid not null,
  owner_account_id text not null check (length(owner_account_id) between 1 and 200),
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  manifest_path text not null,
  manifest_bytes integer not null check (manifest_bytes between 1 and 1048576),
  total_bytes bigint not null check (total_bytes between 1 and 268435456),
  resource_kind text not null check (resource_kind in ('spritesheet','model3d-archive')),
  created_at timestamptz not null default now(),
  primary key (auth_user_id, resource_id, manifest_sha256),
  constraint lingjing_resource_manifest_path check (
    manifest_path = auth_user_id::text || '/' || resource_id::text || '/' || manifest_sha256 || '/manifest.json'
  )
);
create index lingjing_resource_packages_owner_time on public.lingjing_resource_packages(auth_user_id, created_at, resource_id);
alter table public.lingjing_resource_packages enable row level security;
revoke all on table public.lingjing_resource_packages from public, anon, authenticated;
grant select, insert on table public.lingjing_resource_packages to authenticated;

create policy lingjing_resource_index_select on public.lingjing_resource_packages
for select to authenticated using (
  auth_user_id=(select auth.uid()) and owner_account_id=(select public.lingjing_current_owner())
  and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
);
create policy lingjing_resource_index_insert on public.lingjing_resource_packages
for insert to authenticated with check (
  auth_user_id=(select auth.uid()) and owner_account_id=(select public.lingjing_current_owner())
  and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
);

-- Immutable objects: INSERT and SELECT only. Clients never use upsert or public URLs.
-- Runtime legacy text owner IDs confer no rights; the verified Auth UID controls access.
create policy lingjing_private_resource_read on storage.objects
for select to authenticated using (
  bucket_id='lingjing-resources-v1'
  and (select public.lingjing_current_owner()) is not null
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}/(manifest\.json|chunks/[0-9a-f]{64}/[0-9]{1,4}-[0-9a-f]{64}\.bin)$'
);
create policy lingjing_private_resource_insert on storage.objects
for insert to authenticated with check (
  bucket_id='lingjing-resources-v1'
  and (select public.lingjing_current_owner()) is not null
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and owner_id=(select auth.uid())::text
  and (select auth.jwt()->>'is_anonymous') is distinct from 'true'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}/(manifest\.json|chunks/[0-9a-f]{64}/[0-9]{1,4}-[0-9a-f]{64}\.bin)$'
);

comment on table public.lingjing_resource_packages is
  'Immutable verified Storage manifests. Auth UID is authority; owner_account_id preserves the accounts module verified legacy identity. Assets are uploaded and checked before index publication.';
