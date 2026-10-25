-- New JWT-bound battle storage. Existing legacy tables/data are deliberately untouched.
-- Identity mapping is owned by accounts (08). Only its verified Edge actor may call write RPCs.
CREATE TABLE public.lingjing_battle_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_auth_uid uuid NOT NULL REFERENCES auth.users(id), to_auth_uid uuid NOT NULL REFERENCES auth.users(id),
  from_user_id text NOT NULL, to_user_id text NOT NULL,
  from_account text NOT NULL, to_account text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
  room_id uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(from_auth_uid<>to_auth_uid AND from_user_id<>to_user_id)
);
CREATE UNIQUE INDEX lingjing_battle_pending_pair ON public.lingjing_battle_invites
  (least(from_auth_uid,to_auth_uid),greatest(from_auth_uid,to_auth_uid)) WHERE status='pending';
CREATE INDEX lingjing_battle_invites_inbox ON public.lingjing_battle_invites(to_auth_uid,created_at DESC);
CREATE INDEX lingjing_battle_invites_outbox ON public.lingjing_battle_invites(from_auth_uid,created_at DESC);

CREATE TABLE public.lingjing_battle_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_code text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
  host_auth_uid uuid NOT NULL REFERENCES auth.users(id), guest_auth_uid uuid REFERENCES auth.users(id),
  host_user_id text NOT NULL, guest_user_id text, host_account text NOT NULL, guest_account text,
  host_pet_id text NOT NULL, guest_pet_id text, host_pet_name text NOT NULL, guest_pet_name text,
  host_resource_id text NOT NULL, guest_resource_id text,
  host_element text NOT NULL CHECK(host_element IN ('metal','wood','earth','water','fire')),
  guest_element text CHECK(guest_element IN ('metal','wood','earth','water','fire')),
  host_hp integer NOT NULL DEFAULT 120 CHECK(host_hp BETWEEN 0 AND 120), guest_hp integer NOT NULL DEFAULT 120 CHECK(guest_hp BETWEEN 0 AND 120),
  host_anger integer NOT NULL DEFAULT 0 CHECK(host_anger BETWEEN 0 AND 100), guest_anger integer NOT NULL DEFAULT 0 CHECK(guest_anger BETWEEN 0 AND 100),
  host_statuses jsonb NOT NULL DEFAULT '[]', guest_statuses jsonb NOT NULL DEFAULT '[]',
  host_free_dodge_used boolean NOT NULL DEFAULT false, guest_free_dodge_used boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','active','finished','abandoned')),
  current_round integer NOT NULL DEFAULT 1 CHECK(current_round>0), last_resolved_round integer NOT NULL DEFAULT 0 CHECK(last_resolved_round>=0),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), winner_side text CHECK(winner_side IN ('host','guest')),
  rules_version text NOT NULL DEFAULT 'five-elements-standard-v1', core_version text NOT NULL DEFAULT 'five-elements-standard-v1/2026-10-25',
  invitation_id uuid UNIQUE REFERENCES public.lingjing_battle_invites(id), invited_auth_uid uuid REFERENCES auth.users(id), invited_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(host_auth_uid IS DISTINCT FROM guest_auth_uid), CHECK(host_user_id IS DISTINCT FROM guest_user_id),
  CHECK(current_round=last_resolved_round+1), CHECK(jsonb_typeof(host_statuses)='array' AND jsonb_typeof(guest_statuses)='array'),
  CHECK((guest_auth_uid IS NULL)=(guest_user_id IS NULL)), CHECK(status<>'active' OR guest_auth_uid IS NOT NULL),
  CHECK((status='finished')=(winner_side IS NOT NULL))
);
ALTER TABLE public.lingjing_battle_invites ADD CONSTRAINT lingjing_battle_invite_room_fk FOREIGN KEY(room_id) REFERENCES public.lingjing_battle_rooms(id);
CREATE INDEX lingjing_battle_rooms_host ON public.lingjing_battle_rooms(host_auth_uid,updated_at DESC);
CREATE INDEX lingjing_battle_rooms_guest ON public.lingjing_battle_rooms(guest_auth_uid,updated_at DESC) WHERE guest_auth_uid IS NOT NULL;
CREATE INDEX lingjing_battle_rooms_invited ON public.lingjing_battle_rooms(invited_auth_uid) WHERE invited_auth_uid IS NOT NULL;

-- This membership constraint spans host/guest columns: one account cannot occupy two active rooms,
-- and two devices of the same Auth identity cannot impersonate two different players.
CREATE TABLE public.lingjing_battle_members (
  room_id uuid NOT NULL REFERENCES public.lingjing_battle_rooms(id), auth_uid uuid NOT NULL REFERENCES auth.users(id),
  owner_account_id text NOT NULL, side text NOT NULL CHECK(side IN ('host','guest')), active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(room_id,auth_uid), UNIQUE(room_id,side)
);
CREATE UNIQUE INDEX lingjing_battle_one_active_member ON public.lingjing_battle_members(auth_uid) WHERE active;
CREATE UNIQUE INDEX lingjing_battle_one_active_owner ON public.lingjing_battle_members(owner_account_id) WHERE active;
CREATE INDEX lingjing_battle_members_owner ON public.lingjing_battle_members(owner_account_id);

-- Unresolved choices are never granted to client roles or added to the Realtime publication.
CREATE TABLE public.lingjing_battle_actions (
  room_id uuid NOT NULL REFERENCES public.lingjing_battle_rooms(id), round_no integer NOT NULL CHECK(round_no>0),
  actor_side text NOT NULL CHECK(actor_side IN ('host','guest')), actor_auth_uid uuid NOT NULL REFERENCES auth.users(id), owner_account_id text NOT NULL,
  action_type text NOT NULL CHECK(action_type IN ('normal_attack','element_attack','dodge','ultimate')), action_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(room_id,round_no,actor_side), UNIQUE(actor_auth_uid,action_id)
);
CREATE TABLE public.lingjing_battle_rounds (
  room_id uuid NOT NULL REFERENCES public.lingjing_battle_rooms(id), round_no integer NOT NULL CHECK(round_no>0),
  id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), host_action text NOT NULL, guest_action text NOT NULL,
  winner_side text CHECK(winner_side IN ('host','guest')), round_result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(room_id,round_no)
);
CREATE TABLE public.lingjing_battle_commands (
  actor_auth_uid uuid NOT NULL REFERENCES auth.users(id), action_id text NOT NULL, owner_account_id text NOT NULL,
  operation text NOT NULL, input_json jsonb NOT NULL, result_json jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(actor_auth_uid,action_id)
);
CREATE TABLE public.lingjing_battle_settlements (
  actor_auth_uid uuid NOT NULL REFERENCES auth.users(id), owner_account_id text NOT NULL,
  room_id uuid NOT NULL REFERENCES public.lingjing_battle_rooms(id), pet_id text NOT NULL,
  action_id text NOT NULL UNIQUE, won boolean NOT NULL, experience integer NOT NULL CHECK(experience IN (5,20)),
  rules_version text NOT NULL, core_version text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_auth_uid,room_id), UNIQUE(owner_account_id,room_id)
);

ALTER TABLE public.lingjing_battle_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lingjing_battle_invites,public.lingjing_battle_rooms,public.lingjing_battle_members,public.lingjing_battle_actions,public.lingjing_battle_rounds,public.lingjing_battle_commands,public.lingjing_battle_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lingjing_battle_invites,public.lingjing_battle_rooms,public.lingjing_battle_members,public.lingjing_battle_rounds,public.lingjing_battle_settlements TO authenticated;
GRANT ALL ON public.lingjing_battle_invites,public.lingjing_battle_rooms,public.lingjing_battle_members,public.lingjing_battle_actions,public.lingjing_battle_rounds,public.lingjing_battle_commands,public.lingjing_battle_settlements TO service_role;
-- Realtime does not forward custom WebSocket headers. Consume 08's header-free fresh
-- session/owner guard, not its HTTP device-header helper and not auth.uid() alone.
-- Direct Data API SELECT therefore also rejects revoked/expired/anonymous/locked sessions.
CREATE POLICY lingjing_battle_invite_participant ON public.lingjing_battle_invites FOR SELECT TO authenticated USING(
  ((select auth.uid())=from_auth_uid AND (select lingjing_private.session_owner())=from_user_id)
  OR ((select auth.uid())=to_auth_uid AND (select lingjing_private.session_owner())=to_user_id));
CREATE POLICY lingjing_battle_room_participant ON public.lingjing_battle_rooms FOR SELECT TO authenticated USING(
  ((select auth.uid())=host_auth_uid AND (select lingjing_private.session_owner())=host_user_id)
  OR ((select auth.uid())=guest_auth_uid AND (select lingjing_private.session_owner())=guest_user_id));
CREATE POLICY lingjing_battle_member_self ON public.lingjing_battle_members FOR SELECT TO authenticated USING((select auth.uid())=auth_uid AND (select lingjing_private.session_owner())=owner_account_id);
CREATE POLICY lingjing_battle_round_participant ON public.lingjing_battle_rounds FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.lingjing_battle_rooms r WHERE r.id=room_id AND ((select auth.uid())=r.host_auth_uid OR (select auth.uid())=r.guest_auth_uid)));
CREATE POLICY lingjing_battle_settlement_self ON public.lingjing_battle_settlements FOR SELECT TO authenticated USING((select auth.uid())=actor_auth_uid AND (select lingjing_private.session_owner())=owner_account_id);

-- Private Realtime topic joins are participant-bound, with no client Broadcast INSERT policy.
-- Postgres Changes independently applies the room/round SELECT RLS for every delivered row.
CREATE POLICY lingjing_battle_private_topic ON realtime.messages FOR SELECT TO authenticated USING(
  extension='broadcast' AND EXISTS(SELECT 1 FROM public.lingjing_battle_rooms r
    WHERE 'lingjing:battle:'||r.id::text=(select realtime.topic())
      AND ((select auth.uid())=r.host_auth_uid OR (select auth.uid())=r.guest_auth_uid))
);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lingjing_battle_rooms,public.lingjing_battle_rounds,public.lingjing_battle_invites;
  END IF;
END $$;

-- All write RPCs are invoker functions executable ONLY by service_role. Actor arguments must be
-- derived by 08's verified Auth/JWT context, never copied from request JSON or user_metadata.
CREATE FUNCTION public.lingjing_battle_command(p_actor uuid,p_owner text,p_op text,p_action_id text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE
  cmd public.lingjing_battle_commands%ROWTYPE; invitation public.lingjing_battle_invites%ROWTYPE;
  room public.lingjing_battle_rooms%ROWTYPE; submitted public.lingjing_battle_actions%ROWTYPE;
  result jsonb; pet jsonb:=p_input->'pet'; v_side text; requested_round integer; target_auth uuid;
BEGIN
  IF p_actor IS NULL OR p_owner IS NULL OR length(p_owner) NOT BETWEEN 1 AND 160 OR p_action_id IS NULL OR p_action_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$' OR jsonb_typeof(p_input)<>'object' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
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
    SELECT * INTO invitation FROM public.lingjing_battle_invites WHERE status='pending' AND least(from_auth_uid,to_auth_uid)=least(p_actor,target_auth) AND greatest(from_auth_uid,to_auth_uid)=greatest(p_actor,target_auth) FOR UPDATE;
    IF FOUND THEN
      IF invitation.from_auth_uid<>p_actor THEN RAISE EXCEPTION 'INVITE_ALREADY_RECEIVED'; END IF;
    ELSE
      INSERT INTO public.lingjing_battle_invites(from_auth_uid,to_auth_uid,from_user_id,to_user_id,from_account,to_account)
      VALUES(p_actor,target_auth,p_owner,p_input->'target'->>'ownerId',p_input->>'account',p_input->'target'->>'account') RETURNING * INTO invitation;
    END IF;
    result:=jsonb_build_object('request',to_jsonb(invitation));
  ELSIF p_op IN ('reject_invite','cancel_invite') THEN
    SELECT * INTO STRICT invitation FROM public.lingjing_battle_invites WHERE id=(p_input->>'requestId')::uuid FOR UPDATE;
    IF (p_op='reject_invite' AND (invitation.to_auth_uid<>p_actor OR invitation.to_user_id<>p_owner)) OR (p_op='cancel_invite' AND (invitation.from_auth_uid<>p_actor OR invitation.from_user_id<>p_owner)) THEN RAISE EXCEPTION 'INVITE_FORBIDDEN'; END IF;
    IF invitation.status NOT IN ('pending',CASE WHEN p_op='reject_invite' THEN 'rejected' ELSE 'cancelled' END) THEN RAISE EXCEPTION 'INVITE_CONFLICT'; END IF;
    UPDATE public.lingjing_battle_invites SET status=CASE WHEN p_op='reject_invite' THEN 'rejected' ELSE 'cancelled' END,updated_at=now() WHERE id=invitation.id RETURNING * INTO invitation;
    result:=jsonb_build_object('request',to_jsonb(invitation));
  ELSIF p_op IN ('create_room','accept_invite') THEN
    -- The trusted Edge resolver reads this pet from the owner's authoritative account save.
    IF pet->>'ownerId' IS DISTINCT FROM p_owner OR length(coalesce(pet->>'petId','')) NOT BETWEEN 1 AND 160 OR length(coalesce(pet->>'resourceId','')) NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'PET_OWNER_MISMATCH'; END IF;
    IF p_op='accept_invite' THEN
      SELECT * INTO STRICT invitation FROM public.lingjing_battle_invites WHERE id=(p_input->>'requestId')::uuid FOR UPDATE;
      IF invitation.to_auth_uid<>p_actor OR invitation.to_user_id<>p_owner THEN RAISE EXCEPTION 'INVITE_FORBIDDEN'; END IF;
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
      INSERT INTO public.lingjing_battle_rooms(host_auth_uid,host_user_id,host_account,host_pet_id,host_pet_name,host_resource_id,host_element,invitation_id,invited_auth_uid,invited_user_id)
      VALUES(p_actor,p_owner,p_input->>'account',pet->>'petId',pet->>'name',pet->>'resourceId',pet->>'element',invitation.id,invitation.from_auth_uid,invitation.from_user_id) RETURNING * INTO room;
      INSERT INTO public.lingjing_battle_members(room_id,auth_uid,owner_account_id,side) VALUES(room.id,p_actor,p_owner,'host');
      IF invitation.id IS NOT NULL THEN UPDATE public.lingjing_battle_invites SET status='accepted',room_id=room.id,updated_at=now() WHERE id=invitation.id RETURNING * INTO invitation; END IF;
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
      IF room.guest_auth_uid IS NOT NULL THEN
        IF room.guest_pet_id<>pet->>'petId' THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
      ELSE
        IF room.status<>'waiting' THEN RAISE EXCEPTION 'ROOM_NOT_WAITING'; END IF;
        UPDATE public.lingjing_battle_rooms SET guest_auth_uid=p_actor,guest_user_id=p_owner,guest_account=p_input->>'account',guest_pet_id=pet->>'petId',guest_pet_name=pet->>'name',guest_resource_id=pet->>'resourceId',guest_element=pet->>'element',status='active',revision=revision+1,updated_at=now() WHERE id=room.id RETURNING * INTO room;
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
REVOKE ALL ON FUNCTION public.lingjing_battle_command(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_command(uuid,text,text,text,jsonb) TO service_role;

CREATE FUNCTION public.lingjing_battle_commit_round(p_room uuid,p_round integer,p_revision bigint,p_host_action text,p_guest_action text,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.lingjing_battle_rooms%ROWTYPE; saved public.lingjing_battle_rounds%ROWTYPE;
BEGIN
  SELECT * INTO STRICT room FROM public.lingjing_battle_rooms WHERE id=p_room FOR UPDATE;
  SELECT * INTO saved FROM public.lingjing_battle_rounds WHERE room_id=p_room AND round_no=p_round;
  IF FOUND THEN RETURN jsonb_build_object('room',to_jsonb(room),'round',to_jsonb(saved)); END IF;
  IF room.status<>'active' OR room.current_round<>p_round OR room.revision<>p_revision THEN RAISE EXCEPTION 'ROUND_CONFLICT'; END IF;
  IF (p_result->>'round')::integer IS DISTINCT FROM p_round OR p_result->>'rules_version' IS DISTINCT FROM room.rules_version OR p_result->>'core_version' IS DISTINCT FROM room.core_version THEN RAISE EXCEPTION 'BATTLE_RULES_MISMATCH'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.lingjing_battle_actions WHERE room_id=p_room AND round_no=p_round AND actor_side='host' AND action_type=p_host_action)
     OR NOT EXISTS(SELECT 1 FROM public.lingjing_battle_actions WHERE room_id=p_room AND round_no=p_round AND actor_side='guest' AND action_type=p_guest_action) THEN RAISE EXCEPTION 'ACTIONS_REQUIRED'; END IF;
  INSERT INTO public.lingjing_battle_rounds(room_id,round_no,host_action,guest_action,winner_side,round_result)
    VALUES(p_room,p_round,p_result->'actions'->>'host',p_result->'actions'->>'guest',p_result->>'winner_side',p_result) RETURNING * INTO saved;
  UPDATE public.lingjing_battle_rooms SET host_hp=(p_result->'hp_after'->>'host')::integer,guest_hp=(p_result->'hp_after'->>'guest')::integer,
    host_anger=(p_result->'anger_after'->>'host')::integer,guest_anger=(p_result->'anger_after'->>'guest')::integer,
    host_statuses=p_result->'statuses_after'->'host',guest_statuses=p_result->'statuses_after'->'guest',
    host_free_dodge_used=(p_result->'free_dodge_used'->>'host')::boolean,guest_free_dodge_used=(p_result->'free_dodge_used'->>'guest')::boolean,
    current_round=p_round+1,last_resolved_round=p_round,winner_side=p_result->>'winner_side',
    status=CASE WHEN p_result->>'winner_side' IS NULL THEN 'active' ELSE 'finished' END,revision=revision+1,updated_at=now()
    WHERE id=p_room RETURNING * INTO room;
  IF room.status='finished' THEN UPDATE public.lingjing_battle_members SET active=false WHERE room_id=p_room; END IF;
  RETURN jsonb_build_object('room',to_jsonb(room),'round',to_jsonb(saved));
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_commit_round(uuid,integer,bigint,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_commit_round(uuid,integer,bigint,text,text,jsonb) TO service_role;

CREATE FUNCTION public.lingjing_battle_claim_settlement(p_actor uuid,p_owner text,p_room uuid,p_pet text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.lingjing_battle_rooms%ROWTYPE; receipt public.lingjing_battle_settlements%ROWTYPE; side text; bound_pet text;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.lingjing_accounts WHERE auth_user_id=p_actor AND owner_id=p_owner AND status='active') THEN RAISE EXCEPTION 'ACTOR_OWNER_MISMATCH'; END IF;
  SELECT * INTO STRICT room FROM public.lingjing_battle_rooms WHERE id=p_room FOR UPDATE;
  side:=CASE WHEN room.host_auth_uid=p_actor AND room.host_user_id=p_owner THEN 'host' WHEN room.guest_auth_uid=p_actor AND room.guest_user_id=p_owner THEN 'guest' END;
  IF side IS NULL THEN RAISE EXCEPTION 'ROOM_FORBIDDEN'; END IF;
  IF room.status<>'finished' THEN RAISE EXCEPTION 'BATTLE_UNFINISHED'; END IF;
  bound_pet:=CASE WHEN side='host' THEN room.host_pet_id ELSE room.guest_pet_id END;
  IF p_pet IS DISTINCT FROM bound_pet THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
  INSERT INTO public.lingjing_battle_settlements(actor_auth_uid,owner_account_id,room_id,pet_id,action_id,won,experience,rules_version,core_version)
    VALUES(p_actor,p_owner,p_room,bound_pet,'battle:'||p_room::text||':'||p_owner,room.winner_side=side,CASE WHEN room.winner_side=side THEN 20 ELSE 5 END,room.rules_version,room.core_version)
    ON CONFLICT(actor_auth_uid,room_id) DO NOTHING;
  SELECT * INTO STRICT receipt FROM public.lingjing_battle_settlements WHERE actor_auth_uid=p_actor AND room_id=p_room;
  IF receipt.owner_account_id<>p_owner OR receipt.pet_id<>p_pet THEN RAISE EXCEPTION 'SETTLEMENT_OWNER_MISMATCH'; END IF;
  RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_claim_settlement(uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_claim_settlement(uuid,text,uuid,text) TO service_role;
