-- Created by Supabase CLI 2.122.0 migration new; NOT DEPLOYED.
-- Metadata-only invalidation; original HTTP device-header policies unchanged.
begin;
create function lingjing_private.account_notification_owner() returns text
language plpgsql stable security definer set search_path='' as $$
declare v_owner text:=lingjing_private.session_owner();
 v_session uuid:=lingjing_private.live_session_id();v_bindings bigint;
begin
 -- Never use user_metadata or a caller-supplied owner/device claim. The signed
 -- session must map to exactly one current server-owned device binding.
 select count(*) into v_bindings from public.lingjing_devices
 where owner_id=v_owner and auth_session_id=v_session and revoked_at is null;
 if v_bindings<>1 then
  raise exception using errcode='28000',message='LJ_DEVICE_SESSION_REQUIRED';
 end if;
 return v_owner;
end $$;
revoke all on function lingjing_private.account_notification_owner() from public,anon,authenticated,service_role;
grant execute on function lingjing_private.account_notification_owner() to authenticated;

-- Invalidations only: no documents, messages, pet IDs, record IDs or secrets.
create table public.lingjing_account_notifications (
 owner_id text not null references public.lingjing_accounts(owner_id) on delete restrict,
 domain text not null check(domain in ('records','save')),
 revision bigint not null check(revision>0),
 primary key(owner_id,domain)
);
alter table public.lingjing_account_notifications enable row level security;
revoke all on public.lingjing_account_notifications from public,anon,authenticated,service_role;
grant select on public.lingjing_account_notifications to authenticated;
grant select,insert,update on public.lingjing_account_notifications to service_role;
create policy lingjing_account_notification_self on public.lingjing_account_notifications
 for select to authenticated using(owner_id=(select lingjing_private.account_notification_owner()));

create function lingjing_private.publish_account_notification() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_domain text;v_revision bigint;
begin
 if TG_TABLE_SCHEMA='public' and TG_TABLE_NAME='lingjing_personal_records' then
  v_domain:='records';v_revision:=NEW.change_sequence;
 elsif TG_TABLE_SCHEMA='public' and TG_TABLE_NAME='lingjing_saves' then
  v_domain:='save';v_revision:=NEW.revision;
 else raise exception 'LJ_NOTIFICATION_SOURCE_INVALID';
 end if;
 insert into public.lingjing_account_notifications(owner_id,domain,revision)
 values(NEW.owner_id,v_domain,v_revision)
 on conflict(owner_id,domain) do update set revision=excluded.revision
 where excluded.revision>lingjing_account_notifications.revision;
 return NEW;
end $$;
revoke all on function lingjing_private.publish_account_notification() from public,anon,authenticated;
grant execute on function lingjing_private.publish_account_notification() to service_role;
create trigger lingjing_personal_record_notification after insert or update on public.lingjing_personal_records
 for each row execute function lingjing_private.publish_account_notification();
create trigger lingjing_save_notification after insert or update on public.lingjing_saves
 for each row execute function lingjing_private.publish_account_notification();
-- No backfill. Add only this new table to the existing publication;
-- leave all existing publication members unchanged.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime')
 and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lingjing_account_notifications') then
  alter publication supabase_realtime add table public.lingjing_account_notifications;
 end if;
end $$;
commit;
