-- REVIEWED-PLAN CANDIDATE ONLY. Requires separate explicit execution approval.
-- Remove only the additive metadata notification path; retain every business row.
begin;
-- DELETE changes have different Realtime RLS semantics. Unpublish first; never
-- issue row DELETE or TRUNCATE cleanup on this metadata table.
do $$begin
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lingjing_account_notifications') then
  alter publication supabase_realtime drop table public.lingjing_account_notifications;
 end if;
end $$;
drop trigger lingjing_personal_record_notification on public.lingjing_personal_records;
drop trigger lingjing_save_notification on public.lingjing_saves;
drop table public.lingjing_account_notifications;
drop function lingjing_private.publish_account_notification();
drop function lingjing_private.account_notification_owner();
commit;
