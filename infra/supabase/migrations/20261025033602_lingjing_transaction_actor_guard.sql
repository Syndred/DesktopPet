-- Privileged Edge workers pass only the actor obtained by fresh requireActor.
-- This private definer rechecks real Auth state inside the business transaction.
begin;
create function lingjing_private.assert_service_actor(p_owner text,p_uid uuid,p_device uuid,p_sid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_account public.lingjing_accounts;v_anonymous boolean;v_not_after timestamptz;
begin
 if coalesce(length(p_owner),0) not between 1 and 160 or p_uid is null or p_device is null or p_sid is null then
  raise exception using errcode='28000',message='LJ_AUTH_REQUIRED';end if;
 -- The same owner lock is acquired first by device bind/revoke and save commits.
 select * into v_account from public.lingjing_accounts where owner_id=p_owner for update;
 if not found or v_account.status<>'active' or v_account.auth_user_id<>p_uid then
  raise exception using errcode='28000',message='LJ_OWNER_MISMATCH';end if;
 -- Hold actual Auth rows against UPDATE/DELETE until the business transaction
 -- ends. Provider sign-out/expiry updates cannot race a successful commit.
 select is_anonymous into v_anonymous from auth.users where id=p_uid for share;
 if not found or coalesce(v_anonymous,false) then raise exception using errcode='28000',message='LJ_AUTH_INVALID';end if;
 select not_after into v_not_after from auth.sessions where id=p_sid and user_id=p_uid for share;
 if not found or(v_not_after is not null and v_not_after<=clock_timestamp()) then
  raise exception using errcode='28000',message='LJ_SESSION_REVOKED';end if;
 if exists(select 1 from lingjing_private.revoked_auth_sessions where auth_session_id=p_sid) then
  raise exception using errcode='28000',message='LJ_SESSION_REVOKED';end if;
 perform 1 from public.lingjing_devices where owner_id=p_owner and device_id=p_device and auth_session_id=p_sid and revoked_at is null for share;
 if not found then raise exception using errcode='28000',message='LJ_DEVICE_SESSION_REQUIRED';end if;
end $$;
revoke all on function lingjing_private.assert_service_actor(text,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function lingjing_private.assert_service_actor(text,uuid,uuid,uuid) to service_role;
commit;
