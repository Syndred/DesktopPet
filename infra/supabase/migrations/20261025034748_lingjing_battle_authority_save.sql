-- Server reducers prepare fragments from the protected head. These RPCs commit
-- domain state, companion growth, inventory and the complete battle report in
-- one transaction. No authenticated client may supply fragments or outcomes.
ALTER TABLE public.lingjing_battle_settlements ADD COLUMN authority_revision bigint,
  ADD COLUMN result_json jsonb;
REVOKE ALL ON FUNCTION public.lingjing_battle_claim_settlement(uuid,text,uuid,uuid,uuid,text) FROM service_role;

CREATE TABLE public.lingjing_battle_training (
  id uuid PRIMARY KEY, actor_auth_uid uuid NOT NULL REFERENCES auth.users(id), owner_account_id text NOT NULL,
  pet_id text NOT NULL, status text NOT NULL CHECK(status IN ('active','finished','abandoned')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0), session_json jsonb NOT NULL,
  rules_version text NOT NULL, core_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX lingjing_battle_one_training ON public.lingjing_battle_training(owner_account_id) WHERE status='active';
CREATE TABLE public.lingjing_battle_training_commands (
  owner_account_id text NOT NULL, action_id text NOT NULL, session_id uuid NOT NULL REFERENCES public.lingjing_battle_training(id),
  input_json jsonb NOT NULL, result_json jsonb NOT NULL, PRIMARY KEY(owner_account_id,action_id)
);
CREATE TABLE public.lingjing_battle_training_settlements (
  owner_account_id text NOT NULL, session_id uuid NOT NULL REFERENCES public.lingjing_battle_training(id),
  action_id text NOT NULL UNIQUE, pet_id text NOT NULL, authority_revision bigint NOT NULL, result_json jsonb NOT NULL,
  PRIMARY KEY(owner_account_id,session_id)
);
ALTER TABLE public.lingjing_battle_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_training_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lingjing_battle_training_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lingjing_battle_training,public.lingjing_battle_training_commands,public.lingjing_battle_training_settlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.lingjing_battle_training TO authenticated;
GRANT ALL ON public.lingjing_battle_training,public.lingjing_battle_training_commands,public.lingjing_battle_training_settlements TO service_role;
CREATE POLICY lingjing_battle_training_self ON public.lingjing_battle_training FOR SELECT TO authenticated USING(
  (select auth.uid())=actor_auth_uid AND (select lingjing_private.battle_viewer_owner())=owner_account_id);

CREATE FUNCTION lingjing_private.battle_member_without_training() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF NEW.active AND EXISTS(SELECT 1 FROM public.lingjing_battle_training WHERE owner_account_id=NEW.owner_account_id AND status='active') THEN RAISE EXCEPTION 'BATTLE_IN_PROGRESS'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION lingjing_private.battle_member_without_training() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION lingjing_private.battle_member_without_training() TO service_role;
CREATE TRIGGER lingjing_battle_member_without_training BEFORE INSERT ON public.lingjing_battle_members FOR EACH ROW EXECUTE FUNCTION lingjing_private.battle_member_without_training();

CREATE FUNCTION public.lingjing_battle_training_command(p_actor uuid,p_owner text,p_device uuid,p_actor_session uuid,p_id uuid,p_action_id text,p_input jsonb,p_revision bigint,p_session jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE prior public.lingjing_battle_training_commands%ROWTYPE; game public.lingjing_battle_training%ROWTYPE; operation text:=p_input->>'operation';
BEGIN
  -- Consistent lock order with protected save commits and friend settlements.
  PERFORM lingjing_private.assert_service_actor(p_owner,p_actor,p_device,p_actor_session);
  IF NOT EXISTS(SELECT 1 FROM public.lingjing_accounts WHERE owner_id=p_owner AND auth_user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'ACTOR_OWNER_MISMATCH'; END IF;
  IF p_action_id IS NULL OR p_action_id !~ '^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$' THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO prior FROM public.lingjing_battle_training_commands WHERE owner_account_id=p_owner AND action_id=p_action_id;
  IF FOUND THEN
    IF prior.input_json IS DISTINCT FROM p_input THEN RAISE EXCEPTION 'ACTION_ID_REUSED'; END IF;
    RETURN prior.result_json;
  END IF;
  IF operation='start' THEN
    IF EXISTS(SELECT 1 FROM public.lingjing_battle_members WHERE owner_account_id=p_owner AND active)
      OR EXISTS(SELECT 1 FROM public.lingjing_battle_training WHERE owner_account_id=p_owner AND status='active') THEN RAISE EXCEPTION 'BATTLE_IN_PROGRESS'; END IF;
    IF p_session->>'id' IS DISTINCT FROM 'battle-'||p_id::text OR p_session->>'mode'<>'training' OR p_session->>'status'<>'active'
      OR p_session#>>'{player,petId}' IS DISTINCT FROM p_input->>'petId' OR (p_session#>>'{snapshot,round}')::integer<>0
      OR NOT EXISTS(SELECT 1 FROM lingjing_private.owned_pet_ids WHERE owner_id=p_owner AND pet_id=p_input->>'petId') THEN RAISE EXCEPTION 'PET_OWNER_MISMATCH'; END IF;
    INSERT INTO public.lingjing_battle_training(id,actor_auth_uid,owner_account_id,pet_id,status,session_json,rules_version,core_version)
      VALUES(p_id,p_actor,p_owner,p_input->>'petId','active',p_session,p_session#>>'{rules,id}',p_session#>>'{context,coreVersion}') RETURNING * INTO game;
  ELSE
    SELECT * INTO STRICT game FROM public.lingjing_battle_training WHERE id=p_id AND owner_account_id=p_owner AND actor_auth_uid=p_actor FOR UPDATE;
    IF game.revision<>p_revision OR game.status<>'active' THEN RAISE EXCEPTION 'ROUND_CONFLICT'; END IF;
    IF p_session->>'id' IS DISTINCT FROM game.session_json->>'id' OR p_session#>>'{player,petId}' IS DISTINCT FROM game.pet_id
      OR p_session->'player' IS DISTINCT FROM game.session_json->'player' OR p_session->'enemy' IS DISTINCT FROM game.session_json->'enemy'
      OR p_session->'rules' IS DISTINCT FROM game.session_json->'rules' OR p_session->'context' IS DISTINCT FROM game.session_json->'context' THEN RAISE EXCEPTION 'BATTLE_RULES_MISMATCH'; END IF;
    IF operation='action' AND ((p_input->>'roundNo')::integer<>(game.session_json#>>'{snapshot,round}')::integer+1
      OR (p_session#>>'{snapshot,round}')::integer<>(p_input->>'roundNo')::integer) THEN RAISE EXCEPTION 'ROUND_CONFLICT'; END IF;
    IF operation NOT IN ('action','leave') OR p_session->>'status' NOT IN ('active','finished','abandoned') THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
    UPDATE public.lingjing_battle_training SET session_json=p_session,status=p_session->>'status',revision=revision+1,updated_at=now() WHERE id=p_id RETURNING * INTO game;
  END IF;
  INSERT INTO public.lingjing_battle_training_commands VALUES(p_owner,p_action_id,p_id,p_input,to_jsonb(game));
  RETURN to_jsonb(game);
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_training_command(uuid,text,uuid,uuid,uuid,text,jsonb,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_training_command(uuid,text,uuid,uuid,uuid,text,jsonb,bigint,jsonb) TO service_role;

CREATE FUNCTION public.lingjing_battle_settle_authority(p_actor uuid,p_owner text,p_device uuid,p_session uuid,p_mode text,p_id uuid,p_pet text,p_base_revision bigint,p_fragments jsonb,p_reward jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.lingjing_battle_rooms%ROWTYPE; game public.lingjing_battle_training%ROWTYPE; prior jsonb; logical_id text;
  side text; won boolean; action_id text; receipt jsonb; result jsonb; revision bigint; report jsonb;
BEGIN
  PERFORM lingjing_private.assert_service_actor(p_owner,p_actor,p_device,p_session);
  IF NOT EXISTS(SELECT 1 FROM public.lingjing_accounts WHERE owner_id=p_owner AND auth_user_id=p_actor AND status='active') THEN RAISE EXCEPTION 'ACTOR_OWNER_MISMATCH'; END IF;
  IF p_mode='friend' THEN
    SELECT * INTO STRICT room FROM public.lingjing_battle_rooms WHERE id=p_id FOR UPDATE;
    side:=CASE WHEN room.host_auth_uid=p_actor AND room.host_user_id=p_owner THEN 'host' WHEN room.guest_auth_uid=p_actor AND room.guest_user_id=p_owner THEN 'guest' END;
    IF side IS NULL THEN RAISE EXCEPTION 'ROOM_FORBIDDEN'; END IF;
    IF room.status<>'finished' THEN RAISE EXCEPTION 'BATTLE_UNFINISHED'; END IF;
    IF (CASE side WHEN 'host' THEN room.host_pet_id ELSE room.guest_pet_id END) IS DISTINCT FROM p_pet THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
    won:=room.winner_side=side; logical_id:=p_id::text;
    SELECT result_json INTO prior FROM public.lingjing_battle_settlements WHERE owner_account_id=p_owner AND room_id=p_id;
  ELSIF p_mode='training' THEN
    SELECT * INTO STRICT game FROM public.lingjing_battle_training WHERE id=p_id AND owner_account_id=p_owner AND actor_auth_uid=p_actor FOR UPDATE;
    IF game.status<>'finished' THEN RAISE EXCEPTION 'BATTLE_UNFINISHED'; END IF;
    IF game.pet_id IS DISTINCT FROM p_pet THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
    won:=game.session_json->>'winner'='player'; logical_id:='battle-'||p_id::text;
    SELECT result_json INTO prior FROM public.lingjing_battle_training_settlements WHERE owner_account_id=p_owner AND session_id=p_id;
  ELSE RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  action_id:='battle:'||logical_id||':'||p_owner;
  IF prior IS NOT NULL THEN
    IF prior->>'pet_id' IS DISTINCT FROM p_pet THEN RAISE EXCEPTION 'PET_ROOM_MISMATCH'; END IF;
    RETURN prior||jsonb_build_object('duplicate',true);
  END IF;
  IF p_reward->>'actionId' IS DISTINCT FROM action_id OR p_reward->>'petId' IS DISTINCT FROM p_pet OR (p_reward->>'won')::boolean IS DISTINCT FROM won
    OR (p_reward->>'experience')::integer IS DISTINCT FROM (CASE WHEN won THEN 20 ELSE 5 END)
    OR NOT EXISTS(SELECT 1 FROM lingjing_private.owned_pet_ids WHERE owner_id=p_owner AND pet_id=p_pet)
    OR NOT (p_fragments ?& ARRAY['companions','garden','battle']) OR (SELECT count(*) FROM jsonb_object_keys(p_fragments))<>3 THEN RAISE EXCEPTION 'INVALID_SETTLEMENT_PROOF'; END IF;
  -- The CAS, protected fragments, domain receipt and report all roll back together.
  receipt:=lingjing_private.commit_authority(p_owner,action_id,p_fragments,p_base_revision);
  revision:=(receipt->>'revision')::bigint;
  SELECT (value->>'data_json')::jsonb INTO report FROM jsonb_array_elements(p_fragments#>'{battle,module,data,reports}') WHERE value->>'id'=CASE WHEN p_mode='friend' THEN 'online-'||p_id::text ELSE logical_id END;
  IF report IS NULL OR report#>>'{reward,actionId}' IS DISTINCT FROM action_id THEN RAISE EXCEPTION 'INVALID_SETTLEMENT_PROOF'; END IF;
  result:=jsonb_build_object('owner_account_id',p_owner,'room_id',p_id,'pet_id',p_pet,'action_id',action_id,'won',won,'experience',p_reward->'experience',
    'reward',p_reward,'report',report,'authority',jsonb_build_object('actionId',action_id,'revision',revision,'checksum',receipt->>'checksum'),'duplicate',false);
  IF p_mode='friend' THEN
    INSERT INTO public.lingjing_battle_settlements(actor_auth_uid,owner_account_id,room_id,pet_id,action_id,won,experience,rules_version,core_version,authority_revision,result_json)
      VALUES(p_actor,p_owner,p_id,p_pet,action_id,won,(p_reward->>'experience')::integer,room.rules_version,room.core_version,revision,result)
      ON CONFLICT(owner_account_id,room_id) DO UPDATE SET authority_revision=excluded.authority_revision,result_json=excluded.result_json;
  ELSE
    INSERT INTO public.lingjing_battle_training_settlements VALUES(p_owner,p_id,action_id,p_pet,revision,result);
  END IF;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.lingjing_battle_settle_authority(uuid,text,uuid,uuid,text,uuid,text,bigint,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_battle_settle_authority(uuid,text,uuid,uuid,text,uuid,text,bigint,jsonb,jsonb) TO service_role;
