-- Additive migration. Review/deploy before the updated duel-online function.
-- Runtime account IDs intentionally remain TEXT (they are not auth.uid UUIDs).
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS host_pet_id TEXT;
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS guest_pet_id TEXT;
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS host_resource_id TEXT;
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS guest_resource_id TEXT;
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS invitation_id TEXT;
ALTER TABLE public.duel_rooms ADD COLUMN IF NOT EXISTS invited_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS duel_rooms_one_per_invitation
  ON public.duel_rooms(invitation_id) WHERE invitation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.runtime_battle_settlements (
  owner_account_id TEXT NOT NULL REFERENCES public.runtime_accounts(id),
  room_id UUID NOT NULL REFERENCES public.duel_rooms(id),
  pet_id TEXT NOT NULL,
  action_id TEXT NOT NULL UNIQUE,
  won BOOLEAN NOT NULL,
  experience INTEGER NOT NULL CHECK (experience IN (5,20)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_account_id, room_id)
);
ALTER TABLE public.runtime_battle_settlements ENABLE ROW LEVEL SECURITY;
-- No anon policies: the existing edge function verifies runtime session tokens.

CREATE OR REPLACE FUNCTION public.lingjing_commit_duel_round(
  p_room_id UUID, p_round_no INTEGER, p_host_action TEXT, p_guest_action TEXT, p_result JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  locked_room public.duel_rooms%ROWTYPE;
  saved_round public.duel_rounds%ROWTYPE;
BEGIN
  SELECT * INTO STRICT locked_room FROM public.duel_rooms WHERE id=p_room_id FOR UPDATE;
  SELECT * INTO saved_round FROM public.duel_rounds WHERE room_id=p_room_id AND round_no=p_round_no;
  IF FOUND THEN
    RETURN jsonb_build_object('room',to_jsonb(locked_room),'round',to_jsonb(saved_round),'accepted',true,'waiting',false);
  END IF;
  IF locked_room.status <> 'active' OR locked_room.current_round <> p_round_no THEN
    RAISE EXCEPTION 'round no longer active';
  END IF;
  -- Submitted choices are immutable; the edge resolves the existing formula once.
  IF NOT EXISTS (SELECT 1 FROM public.duel_actions WHERE room_id=p_room_id AND round_no=p_round_no AND actor_side='host')
     OR NOT EXISTS (SELECT 1 FROM public.duel_actions WHERE room_id=p_room_id AND round_no=p_round_no AND actor_side='guest') THEN
    RAISE EXCEPTION 'both actions are required';
  END IF;
  INSERT INTO public.duel_rounds(room_id,round_no,host_action,guest_action,winner_side,round_result)
    VALUES(p_room_id,p_round_no,p_host_action,p_guest_action,p_result->>'winner_side',p_result)
    RETURNING * INTO saved_round;
  UPDATE public.duel_rooms SET
    host_hp=(p_result->'hp_after'->>'host')::INTEGER,
    guest_hp=(p_result->'hp_after'->>'guest')::INTEGER,
    host_anger=(p_result->'anger_after'->>'host')::INTEGER,
    guest_anger=(p_result->'anger_after'->>'guest')::INTEGER,
    host_statuses=p_result->'statuses_after'->'host',
    guest_statuses=p_result->'statuses_after'->'guest',
    host_free_dodge_used=(p_result->'free_dodge_used'->>'host')::BOOLEAN,
    guest_free_dodge_used=(p_result->'free_dodge_used'->>'guest')::BOOLEAN,
    current_round=p_round_no+1,last_resolved_round=p_round_no,
    winner_side=p_result->>'winner_side',
    status=CASE WHEN p_result->>'winner_side' IS NULL THEN 'active' ELSE 'finished' END
    WHERE id=p_room_id RETURNING * INTO locked_room;
  RETURN jsonb_build_object('room',to_jsonb(locked_room),'round',to_jsonb(saved_round),'accepted',true,'waiting',false);
END $$;
REVOKE ALL ON FUNCTION public.lingjing_commit_duel_round(UUID,INTEGER,TEXT,TEXT,JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_commit_duel_round(UUID,INTEGER,TEXT,TEXT,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.lingjing_claim_battle_settlement(p_owner TEXT,p_room UUID,p_pet TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  battle public.duel_rooms%ROWTYPE;
  receipt public.runtime_battle_settlements%ROWTYPE;
  participant_side TEXT;
  bound_pet TEXT;
BEGIN
  SELECT * INTO STRICT battle FROM public.duel_rooms WHERE id=p_room FOR UPDATE;
  participant_side := CASE WHEN battle.host_user_id=p_owner THEN 'host' WHEN battle.guest_user_id=p_owner THEN 'guest' END;
  IF participant_side IS NULL THEN RAISE EXCEPTION 'user is not room participant'; END IF;
  IF battle.status <> 'finished' OR battle.winner_side IS NULL THEN RAISE EXCEPTION 'battle is not finished'; END IF;
  bound_pet := CASE WHEN participant_side='host' THEN battle.host_pet_id ELSE battle.guest_pet_id END;
  IF bound_pet IS NOT NULL AND bound_pet <> p_pet THEN RAISE EXCEPTION 'battle pet mismatch'; END IF;
  IF p_pet IS NULL OR length(p_pet)=0 OR length(p_pet)>160 THEN RAISE EXCEPTION 'pet is required'; END IF;
  INSERT INTO public.runtime_battle_settlements(owner_account_id,room_id,pet_id,action_id,won,experience)
    VALUES(p_owner,p_room,p_pet,'battle:'||p_room::TEXT||':'||p_owner,battle.winner_side=participant_side,
      CASE WHEN battle.winner_side=participant_side THEN 20 ELSE 5 END)
    ON CONFLICT(owner_account_id,room_id) DO NOTHING;
  SELECT * INTO STRICT receipt FROM public.runtime_battle_settlements WHERE owner_account_id=p_owner AND room_id=p_room;
  IF receipt.pet_id <> p_pet THEN RAISE EXCEPTION 'settlement already belongs to another pet'; END IF;
  RETURN to_jsonb(receipt);
END $$;
REVOKE ALL ON FUNCTION public.lingjing_claim_battle_settlement(TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lingjing_claim_battle_settlement(TEXT,UUID,TEXT) TO service_role;
