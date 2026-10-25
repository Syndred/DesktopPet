-- Separate the common owner-scoped CAS key from the original domain reward ID.
-- Existing result_json is returned before this new key is constructed; never rewrite old receipts.
CREATE OR REPLACE FUNCTION public.lingjing_battle_settle_authority(p_actor uuid,p_owner text,p_device uuid,p_session uuid,p_mode text,p_id uuid,p_pet text,p_base_revision bigint,p_fragments jsonb,p_reward jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE room public.lingjing_battle_rooms%ROWTYPE; game public.lingjing_battle_training%ROWTYPE; prior jsonb; logical_id text;
  side text; won boolean; action_id text; cas_action_id text; receipt jsonb; result jsonb; revision bigint; report jsonb;
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
  cas_action_id:='battle-authority:'||p_mode||':'||p_id::text;
  receipt:=lingjing_private.commit_authority(p_owner,cas_action_id,p_fragments,p_base_revision);
  revision:=(receipt->>'revision')::bigint;
  SELECT (value->>'data_json')::jsonb INTO report FROM jsonb_array_elements(p_fragments#>'{battle,module,data,reports}') WHERE value->>'id'=CASE WHEN p_mode='friend' THEN 'online-'||p_id::text ELSE logical_id END;
  IF report IS NULL OR report#>>'{reward,actionId}' IS DISTINCT FROM action_id THEN RAISE EXCEPTION 'INVALID_SETTLEMENT_PROOF'; END IF;
  result:=jsonb_build_object('owner_account_id',p_owner,'room_id',p_id,'pet_id',p_pet,'action_id',action_id,'won',won,'experience',p_reward->'experience',
    'reward',p_reward,'report',report,'authority',jsonb_build_object('actionId',cas_action_id,'revision',revision,'checksum',receipt->>'checksum'),'duplicate',false);
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
