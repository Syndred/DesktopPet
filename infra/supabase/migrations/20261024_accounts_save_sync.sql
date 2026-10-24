-- Review and deploy separately. Non-destructive: leaves runtime_accounts and UUID player_profiles intact.
create table if not exists public.runtime_account_saves (
  owner_account_id text primary key references public.runtime_accounts(id),
  revision bigint not null check (revision > 0),
  action_id text not null,
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  envelope jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.runtime_account_save_actions (
  owner_account_id text not null references public.runtime_accounts(id),
  action_id text not null,
  base_revision bigint not null check (base_revision >= 0),
  revision bigint not null check (revision > 0),
  checksum text not null check (checksum ~ '^[a-f0-9]{64}$'),
  envelope jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_account_id, action_id),
  unique (owner_account_id, revision)
);
alter table public.runtime_account_saves enable row level security;
alter table public.runtime_account_save_actions enable row level security;
revoke all on public.runtime_account_saves, public.runtime_account_save_actions from anon, authenticated;

-- Serializes on the verified runtime account, including the first save. No auth.uid() cast or renderer owner trust.
create or replace function public.accounts_push_save(
  p_user_id text, p_session_token text, p_action_id text, p_base_revision bigint, p_envelope jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_token text; v_revision bigint; v_receipt public.runtime_account_save_actions%rowtype;
  v_checksum text := p_envelope->>'checksum';
begin
  select session_token into v_token from public.runtime_accounts where id = p_user_id for update;
  if not found or v_token is null or v_token <> p_session_token then
    raise exception 'SESSION_INVALIDATED';
  end if;
  if p_action_id is null or p_action_id !~ '^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$'
    or p_base_revision is null or p_base_revision < 0 or p_base_revision > 9007199254740990
    or p_envelope is null or octet_length(p_envelope::text) > 26214400
    or p_envelope->>'format' is distinct from 'lingjing-account-save'
    or p_envelope->>'version' is distinct from '1'
    or p_envelope->>'ownerAccountId' is distinct from p_user_id
    or p_envelope#>>'{identity,provider}' is distinct from 'runtime'
    or p_envelope#>>'{identity,subjectId}' is distinct from p_user_id
    or v_checksum is null or v_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_SAVE';
  end if;
  select * into v_receipt from public.runtime_account_save_actions
    where owner_account_id = p_user_id and action_id = p_action_id;
  if found then
    if v_receipt.checksum <> v_checksum or v_receipt.base_revision <> p_base_revision then
      raise exception 'ACTION_ID_REUSED';
    end if;
    return jsonb_build_object('actionId', p_action_id, 'revision', v_receipt.revision, 'checksum', v_receipt.checksum);
  end if;
  select revision into v_revision from public.runtime_account_saves where owner_account_id = p_user_id;
  v_revision := coalesce(v_revision, 0);
  if v_revision <> p_base_revision then raise exception 'SYNC_CONFLICT'; end if;
  v_revision := v_revision + 1;
  insert into public.runtime_account_save_actions(owner_account_id,action_id,base_revision,revision,checksum,envelope)
    values(p_user_id,p_action_id,p_base_revision,v_revision,v_checksum,p_envelope);
  insert into public.runtime_account_saves(owner_account_id,revision,action_id,checksum,envelope)
    values(p_user_id,v_revision,p_action_id,v_checksum,p_envelope)
    on conflict(owner_account_id) do update set revision=excluded.revision,action_id=excluded.action_id,
      checksum=excluded.checksum,envelope=excluded.envelope,updated_at=now();
  return jsonb_build_object('actionId', p_action_id, 'revision', v_revision, 'checksum', v_checksum);
end;
$$;
revoke all on function public.accounts_push_save(text,text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.accounts_push_save(text,text,text,bigint,jsonb) to service_role;
