-- Additive. Review/deploy after 20261024_accounts_save_sync.sql.
-- Garden and companion rows stay in the existing canonical account-save envelope.
-- No second inventory or identity store; no auth.uid() UUID conversion.
CREATE TABLE IF NOT EXISTS public.runtime_garden_operations (
  owner_account_id TEXT NOT NULL REFERENCES public.runtime_accounts(id),
  action_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
  account_revision BIGINT NOT NULL,
  response_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_account_id,action_id)
);
ALTER TABLE public.runtime_garden_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.runtime_garden_operations FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.garden_commit_operation(
  p_owner TEXT,p_session_token TEXT,p_action_id TEXT,p_request_hash TEXT,
  p_base_revision BIGINT,p_envelope JSONB,p_result JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  token TEXT; current_revision BIGINT; prior public.runtime_garden_operations%ROWTYPE;
  next_revision BIGINT; response JSONB; doc_checksum TEXT;
BEGIN
  -- Same account lock as accounts_push_save, including first operation and login rotation.
  SELECT session_token INTO token FROM public.runtime_accounts WHERE id=p_owner FOR UPDATE;
  IF NOT FOUND OR token IS NULL OR token IS DISTINCT FROM p_session_token THEN RAISE EXCEPTION 'SESSION_INVALIDATED'; END IF;
  IF p_action_id IS NULL OR p_action_id !~ '^[a-zA-Z0-9:_-]{1,160}$'
     OR p_request_hash IS NULL OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  SELECT * INTO prior FROM public.runtime_garden_operations WHERE owner_account_id=p_owner AND action_id=p_action_id;
  IF FOUND THEN
    IF prior.request_hash<>p_request_hash THEN RAISE EXCEPTION 'ACTION_ID_REUSED'; END IF;
    RETURN prior.response_json || jsonb_build_object('replayed',true);
  END IF;
  SELECT revision INTO current_revision FROM public.runtime_account_saves WHERE owner_account_id=p_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CLOUD_GARDEN_NOT_INITIALIZED'; END IF;
  IF p_base_revision IS NULL OR current_revision<>p_base_revision THEN RAISE EXCEPTION 'SYNC_CONFLICT'; END IF;
  doc_checksum:=p_envelope->>'checksum';
  IF p_envelope->>'ownerAccountId' IS DISTINCT FROM p_owner
    OR p_envelope#>>'{identity,provider}' IS DISTINCT FROM 'runtime'
    OR p_envelope#>>'{identity,subjectId}' IS DISTINCT FROM p_owner
    OR p_envelope#>>'{data,modules,garden,data,ownerAccountId}' IS DISTINCT FROM p_owner
    OR doc_checksum IS NULL OR doc_checksum !~ '^[a-f0-9]{64}$'
    OR octet_length(p_envelope::TEXT)>26214400 OR p_result->>'ok' IS DISTINCT FROM 'true'
    THEN RAISE EXCEPTION 'INVALID_SAVE'; END IF;
  next_revision:=current_revision+1;
  response:=jsonb_build_object('actionId',p_action_id,'requestHash',p_request_hash,'accountRevision',next_revision,'result',p_result,'replayed',false);
  INSERT INTO public.runtime_account_save_actions(owner_account_id,action_id,base_revision,revision,checksum,envelope)
    VALUES(p_owner,'garden:'||p_action_id,current_revision,next_revision,doc_checksum,p_envelope);
  UPDATE public.runtime_account_saves SET revision=next_revision,action_id='garden:'||p_action_id,
    checksum=doc_checksum,envelope=p_envelope,updated_at=now() WHERE owner_account_id=p_owner;
  INSERT INTO public.runtime_garden_operations(owner_account_id,action_id,request_hash,account_revision,response_json)
    VALUES(p_owner,p_action_id,p_request_hash,next_revision,response);
  RETURN response;
END;
$$;
REVOKE ALL ON FUNCTION public.garden_commit_operation(TEXT,TEXT,TEXT,TEXT,BIGINT,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.garden_commit_operation(TEXT,TEXT,TEXT,TEXT,BIGINT,JSONB,JSONB) TO service_role;

-- Rollback: disable/remove the garden-sync function deployment first. Keep both
-- operation receipts and account-save history for recovery. No DROP/DELETE needed.
