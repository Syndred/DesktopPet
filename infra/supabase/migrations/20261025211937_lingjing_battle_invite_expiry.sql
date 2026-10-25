-- QA022: only newly created invitations have a server-owned five-minute deadline.
-- Adding a nullable column without a default/backfill preserves every legacy row.
ALTER TABLE public.lingjing_battle_invites ADD COLUMN expires_at timestamptz;
COMMENT ON COLUMN public.lingjing_battle_invites.expires_at IS
  'NULL means a legacy invitation with no expiry; new command-created invitations expire five minutes after server creation.';
ALTER TABLE public.lingjing_battle_invites DROP CONSTRAINT lingjing_battle_invites_status_check;
ALTER TABLE public.lingjing_battle_invites ADD CONSTRAINT lingjing_battle_invites_status_check
  CHECK(status IN ('pending','accepted','rejected','cancelled','expired'));

-- Private, parameterless server clock; no client or per-request time override.
CREATE FUNCTION lingjing_private.battle_invite_now() RETURNS timestamptz
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$SELECT pg_catalog.clock_timestamp()$$;
REVOKE ALL ON FUNCTION lingjing_private.battle_invite_now() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION lingjing_private.battle_invite_now() TO service_role;

-- Keep the original command/room/action/receipt protocol. A committed action is
-- replayed before consulting time; accepting an expired pending invite rolls back
-- the entire command, including any room or membership inserted by that attempt.
CREATE OR REPLACE FUNCTION public.lingjing_battle_command(p_actor uuid,p_owner text,p_device uuid,p_session uuid,p_op text,p_action_id text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  cmd public.lingjing_battle_commands%ROWTYPE; invitation public.lingjing_battle_invites%ROWTYPE;
  room public.lingjing_battle_rooms%ROWTYPE; submitted public.lingjing_battle_actions%ROWTYPE;
  result jsonb; pet jsonb:=p_input->'pet'; v_side text; requested_round integer; target_auth uuid; v_now timestamptz;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 160 OR p_action_id IS NULL OR p_action_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$' OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  PERFORM lingjing_private.assert_service_actor(p_owner,p_actor,p_device,p_session);
  IF NOT EXISTS(SELECT 1 FROM public.lingjing_accounts WHERE auth_user_id=p_actor AND owner_id=p_owner AND status='active') THEN RAISE EXCEPTION 'ACTOR_OWNER_MISMATCH'; END IF;
  INSERT INTO public.lingjing_battle_commands(actor_auth_uid,action_id,owner_account_id,operation,input_json)
    VALUES(p_actor,p_action_id,p_owner,p_op,p_input) ON CONFLICT DO NOTHING;
  SELECT * INTO STRICT cmd FROM public.lingjing_battle_commands WHERE actor_auth_uid=p_actor AND action_id=p_action_id FOR UPDATE;
  IF cmd.owner_account_id<>p_owner OR cmd.operation<>p_op OR cmd.input_json<>p_input THEN RAISE EXCEPTION 'ACTION_ID_REUSED'; END IF;
  IF cmd.result_json IS NOT NULL THEN RETURN cmd.result_json; END IF;

  IF p_op='invite' THEN
    target_auth:=(p_input->'target'->>'authUid')::uuid;
    IF target_auth IS NULL OR target_auth=p_actor OR p_input->'target'->>'ownerId'=p_owner THEN RAISE EXCEPTION 'SELF_DUEL_FORBIDDEN'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.lingjing_accounts WHERE auth_user_id=target_auth AND owner_id=p_input->'target'->>'ownerId' AND status='active') THEN RAISE EXCEPTION 'TARGET_OWNER_MISMATCH'; END IF;
    -- Serialize both directions even when there is no pending row to lock yet.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lingjing:battle:invite:'||least(p_actor,target_auth)::text||':'||greatest(p_actor,target_auth)::text,0));
    SELECT * INTO invitation FROM public.lingjing_battle_invites WHERE status='pending' AND least(from_auth_uid,to_auth_uid)=least(p_actor,target_auth) AND greatest(from_auth_uid,to_auth_uid)=greatest(p_actor,target_auth) FOR UPDATE;
    IF invitation.id IS NOT NULL AND invitation.expires_at IS NOT NULL AND invitation.expires_at<=lingjing_private.battle_invite_now() THEN
      UPDATE public.lingjing_battle_invites SET status='expired',updated_at=lingjing_private.battle_invite_now() WHERE id=invitation.id;
      invitation:=NULL;
    END IF;
    IF invitation.id IS NOT NULL THEN
      IF invitation.from_auth_uid<>p_actor THEN RAISE EXCEPTION 'INVITE_ALREADY_RECEIVED'; END IF;
    ELSE
      v_now:=lingjing_private.battle_invite_now();
      INSERT INTO public.lingjing_battle_invites(from_auth_uid,to_auth_uid,from_user_id,to_user_id,from_account,to_account,created_at,updated_at,expires_at)
      VALUES(p_actor,target_auth,p_owner,p_input->'target'->>'ownerId',p_input->>'account',p_input->'target'->>'account',v_now,v_now,v_now+interval '5 minutes') RETURNING * INTO invitation;
    END IF;
    result:=jsonb_build_object('request',to_jsonb(invitation));
  ELSIF p_op IN ('reject_invite','cancel_invite') THEN
    SELECT * INTO STRICT invitation FROM public.lingjing_battle_invites WHERE id=(p_input->>'requestId')::uuid FOR UPDATE;
    IF (p_op='reject_invite' AND (invitation.to_auth_uid<>p_actor OR invitation.to_user_id<>p_owner)) OR (p_op='cancel_invite' AND (invitation.from_auth_uid<>p_actor OR invitation.from_user_id<>p_owner)) THEN RAISE EXCEPTION 'INVITE_FORBIDDEN'; END IF;
    IF invitation.status='pending' AND invitation.expires_at IS NOT NULL AND invitation.expires_at<=lingjing_private.battle_invite_now() THEN
      UPDATE public.lingjing_battle_invites SET status='expired',updated_at=lingjing_private.battle_invite_now() WHERE id=invitation.id RETURNING * INTO invitation;
    ELSIF invitation.status<>'expired' THEN
      IF invitation.status NOT IN ('pending',CASE WHEN p_op='reject_invite' THEN 'rejected' ELSE 'cancelled' END) THEN RAISE EXCEPTION 'INVITE_CONFLICT'; END IF;
      UPDATE public.lingjing_battle_invites SET status=CASE WHEN p_op='reject_invite' THEN 'rejected' ELSE 'cancelled' END,updated_at=now() WHERE id=invitation.id RETURNING * INTO invitation;
    END IF;
    result:=jsonb_build_object('request',to_jsonb(invitation));
  ELSIF p_op IN ('create_room','accept_invite') THEN
    -- The trusted Edge resolver reads this pet from the owner's authoritative account save.
    IF pet->>'ownerId' IS DISTINCT FROM p_owner OR length(coalesce(pet->>'petId','')) NOT BETWEEN 1 AND 160 OR length(coalesce(pet->>'resourceId','')) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'PET_OWNER_MISMATCH'; END IF;
    IF p_op='accept_invite' THEN
      SELECT * INTO STRICT invitation FROM public.lingjing_battle_invites WHERE id=(p_input->>'requestId')::uuid FOR UPDATE;
      IF invitation.to_auth_uid<>p_actor OR invitation.to_user_id<>p_owner THEN RAISE EXCEPTION 'INVITE_FORBIDDEN'; END IF;
      -- Use wall-clock time after the row lock, including any time spent waiting.
      IF invitation.status='expired' OR (invitation.status='pending' AND invitation.expires_at IS NOT NULL AND invitation.expires_at<=lingjing_private.battle_invite_now()) THEN RAISE EXCEPTION 'INVITE_EXPIRED'; END IF;
      IF invitation.status='accepted' AND invitation.room_id IS NOT NULL THEN
        SELECT * INTO STRICT room FROM public.lingjing_battle_rooms WHERE id=invitation.room_id;
      ELSIF invitation.status<>'pending' THEN RAISE EXCEPTION 'INVITE_CONFLICT'; END IF;
    ELSE
      -- A new device (or a new id after an unknown create response) resumes its existing
      -- membership instead of creating another cloud room. The pet binding stays immutable.
      SELECT r.* INTO room FROM public.lingjing_battle_rooms r JOIN public.lingjing_battle_members m ON m.room_id=r.id
        WHERE m.auth_uid=p_actor AND m.owner_account_id=p_owner AND m.active FOR UPDATE OF r;
    END IF;
    IF room.id IS NULL THEN
      INSERT INTO public.lingjing_battle_rooms(host_auth_uid,host_user_id,host_account,host_pet_id,host_pet_name,host_resource_id,host_element,host_pet_level,invitation_id,invited_auth_uid,invited_user_id)
      VALUES(p_actor,p_owner,p_input->>'account',pet->>'petId',pet->>'name',pet->>'resourceId',pet->>'element',coalesce((pet->>'level')::integer,1),invitation.id,invitation.from_auth_uid,invitation.from_user_id) RETURNING * INTO room;
      INSERT INTO public.lingjing_battle_members(room_id,auth_uid,owner_account_id,side) VALUES(room.id,p_actor,p_owner,'host');
      IF invitation.id IS NOT NULL THEN
        -- Membership insertion can wait on another transaction. Recheck immediately
        -- before acceptance; failure also rolls back the new room and membership.
        IF invitation.expires_at IS NOT NULL AND invitation.expires_at<=lingjing_private.battle_invite_now() THEN RAISE EXCEPTION 'INVITE_EXPIRED'; END IF;
        UPDATE public.lingjing_battle_invites SET status='accepted',room_id=room.id,updated_at=now() WHERE id=invitation.id RETURNING * INTO invitation;
      END IF;
    ELSIF (CASE WHEN room.host_auth_uid=p_actor THEN room.host_pet_id ELSE room.guest_pet_id END) IS DISTINCT FROM pet->>'petId' THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
    result:=jsonb_build_object('room',to_jsonb(room),'request',CASE WHEN invitation.id IS NOT NULL THEN to_jsonb(invitation) ELSE NULL END);
  ELSE
    SELECT * INTO STRICT room FROM public.lingjing_battle_rooms WHERE (p_input->>'roomId' IS NOT NULL AND id=(p_input->>'roomId')::uuid) OR (p_input->>'roomId' IS NULL AND room_code=p_input->>'roomCode') FOR UPDATE;
    v_side:=CASE WHEN room.host_auth_uid=p_actor AND room.host_user_id=p_owner THEN 'host' WHEN room.guest_auth_uid=p_actor AND room.guest_user_id=p_owner THEN 'guest' END;
    IF p_op='join_room' THEN
      IF pet->>'ownerId' IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'PET_OWNER_MISMATCH'; END IF;
      IF room.host_auth_uid=p_actor OR room.host_user_id=p_owner THEN RAISE EXCEPTION 'SELF_DUEL_FORBIDDEN'; END IF;
      IF room.invited_auth_uid IS NOT NULL AND (room.invited_auth_uid<>p_actor OR room.invited_user_id<>p_owner) THEN RAISE EXCEPTION 'ROOM_FORBIDDEN'; END IF;
      IF room.guest_auth_uid IS NOT NULL AND (room.guest_auth_uid<>p_actor OR room.guest_user_id<>p_owner) THEN RAISE EXCEPTION 'ROOM_FULL'; END IF;
      IF room.invitation_id IS NOT NULL THEN
        SELECT * INTO STRICT invitation FROM public.lingjing_battle_invites WHERE id=room.invitation_id;
        IF invitation.status='expired' OR (invitation.status='pending' AND invitation.expires_at IS NOT NULL AND invitation.expires_at<=lingjing_private.battle_invite_now()) THEN RAISE EXCEPTION 'INVITE_EXPIRED'; END IF;
      END IF;
      IF room.guest_auth_uid IS NOT NULL THEN
        IF room.guest_pet_id<>pet->>'petId' THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
      ELSE
        IF room.status<>'waiting' THEN RAISE EXCEPTION 'ROOM_NOT_WAITING'; END IF;
        UPDATE public.lingjing_battle_rooms SET guest_auth_uid=p_actor,guest_user_id=p_owner,guest_account=p_input->>'account',guest_pet_id=pet->>'petId',guest_pet_name=pet->>'name',guest_resource_id=pet->>'resourceId',guest_element=pet->>'element',guest_pet_level=coalesce((pet->>'level')::integer,1),status='active',revision=revision+1,updated_at=now() WHERE id=room.id RETURNING * INTO room;
        INSERT INTO public.lingjing_battle_members(room_id,auth_uid,owner_account_id,side) VALUES(room.id,p_actor,p_owner,'guest');
      END IF;
      result:=jsonb_build_object('room',to_jsonb(room));
    ELSE
      IF v_side IS NULL THEN RAISE EXCEPTION 'ROOM_FORBIDDEN'; END IF;
      IF p_op='submit_action' THEN
        requested_round:=(p_input->>'roundNo')::integer;
        SELECT * INTO submitted FROM public.lingjing_battle_actions WHERE room_id=room.id AND round_no=requested_round AND actor_side=v_side;
        IF FOUND THEN
          IF submitted.action_type<>p_input->>'action' THEN RAISE EXCEPTION 'ACTION_LOCKED'; END IF;
        ELSE
          IF room.status<>'active' OR room.current_round<>requested_round THEN RAISE EXCEPTION 'ROUND_CONFLICT'; END IF;
          INSERT INTO public.lingjing_battle_actions(room_id,round_no,actor_side,actor_auth_uid,owner_account_id,action_type,action_id)
            VALUES(room.id,requested_round,v_side,p_actor,p_owner,p_input->>'action',p_action_id) RETURNING * INTO submitted;
        END IF;
        result:=jsonb_build_object('room',to_jsonb(room),'accepted',true,'pendingAction',jsonb_build_object('actionId',submitted.action_id,'action',submitted.action_type,'roundNo',submitted.round_no));
      ELSIF p_op='leave_room' THEN
        IF room.status IN ('waiting','active') THEN
          UPDATE public.lingjing_battle_rooms SET status='abandoned',revision=revision+1,updated_at=now() WHERE id=room.id RETURNING * INTO room;
          UPDATE public.lingjing_battle_members SET active=false WHERE room_id=room.id;
        END IF;
        result:=jsonb_build_object('room',to_jsonb(room));
      ELSE RAISE EXCEPTION 'UNSUPPORTED_OP'; END IF;
    END IF;
  END IF;
  UPDATE public.lingjing_battle_commands SET result_json=result WHERE actor_auth_uid=p_actor AND action_id=p_action_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_command(uuid,text,uuid,uuid,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_command(uuid,text,uuid,uuid,text,text,jsonb) TO service_role;

-- A read projection, not a cleanup: polling never rewrites raw statuses, dates,
-- old command results or accepted/rejected/cancelled history. NULL stays legacy.
CREATE FUNCTION public.lingjing_battle_list_invites(p_actor uuid,p_owner text,p_device uuid,p_session uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_now timestamptz; rows jsonb;
BEGIN
  PERFORM lingjing_private.assert_service_actor(p_owner,p_actor,p_device,p_session);
  v_now:=lingjing_private.battle_invite_now();
  SELECT coalesce(jsonb_agg(jsonb_set(to_jsonb(i),'{status}',to_jsonb(
    CASE WHEN i.status='pending' AND i.expires_at IS NOT NULL AND i.expires_at<=v_now THEN 'expired' ELSE i.status END))
    ORDER BY i.created_at DESC,i.id DESC),'[]'::jsonb) INTO rows
  FROM (SELECT * FROM public.lingjing_battle_invites
    WHERE (from_auth_uid=p_actor AND from_user_id=p_owner) OR (to_auth_uid=p_actor AND to_user_id=p_owner)
    ORDER BY created_at DESC,id DESC LIMIT 100) i;
  RETURN jsonb_build_object('invitations',rows,'serverNow',v_now);
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_list_invites(uuid,text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_list_invites(uuid,text,uuid,uuid) TO service_role;
