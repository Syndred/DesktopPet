-- Additive review artifact; do not apply automatically. Runtime account IDs are text.
create table if not exists public.runtime_discovery_battle_profiles (
  owner_account_id text not null references public.runtime_accounts(id),
  pet_id text not null,
  element text not null check (element in ('metal','wood','earth','water','fire')),
  revision bigint not null default 1,
  primary key(owner_account_id,pet_id)
);
comment on table public.runtime_discovery_battle_profiles is 'Written only by the trusted companions sync service. Renderer requests cannot register owned pets.';
create table if not exists public.runtime_discovery_permits (
  id uuid primary key, owner_account_id text not null references public.runtime_accounts(id),
  spawn_id text not null, data_json jsonb not null, unique(owner_account_id,spawn_id)
);
create table if not exists public.runtime_discovery_captures (
  id uuid primary key, owner_account_id text not null references public.runtime_accounts(id),
  permit_id uuid not null unique references public.runtime_discovery_permits(id),
  data_json jsonb not null
);
create table if not exists public.runtime_discovery_actions (
  owner_account_id text not null references public.runtime_accounts(id), action_id text not null,
  permit_id uuid not null references public.runtime_discovery_permits(id), data_json jsonb not null,
  primary key(owner_account_id,action_id)
);
alter table public.runtime_discovery_battle_profiles enable row level security;
alter table public.runtime_discovery_permits enable row level security;
alter table public.runtime_discovery_captures enable row level security;
alter table public.runtime_discovery_actions enable row level security;
revoke all on public.runtime_discovery_battle_profiles, public.runtime_discovery_permits, public.runtime_discovery_captures from anon, authenticated;
grant all on public.runtime_discovery_battle_profiles, public.runtime_discovery_permits, public.runtime_discovery_captures to service_role;
revoke all on public.runtime_discovery_actions from anon,authenticated;
grant all on public.runtime_discovery_actions to service_role;

create or replace function public.advance_runtime_discovery_battle(p_owner text,p_permit uuid,p_action_id text,p_action text,p_expected_round integer,p_battle jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing jsonb; permit_row public.runtime_discovery_permits; receipt jsonb;
begin
  select * into permit_row from public.runtime_discovery_permits where id=p_permit and owner_account_id=p_owner for update;
  if not found then raise exception 'PERMIT_INVALID'; end if;
  select data_json into existing from public.runtime_discovery_actions where owner_account_id=p_owner and action_id=p_action_id;
  if existing is not null then
    if existing->>'permitId' <> p_permit::text or existing->>'action' <> p_action then raise exception 'ACTION_ID_CONFLICT'; end if;
    return existing->'result';
  end if;
  if coalesce((permit_row.data_json->>'expiresAt')::numeric,0) < extract(epoch from clock_timestamp())*1000 then raise exception 'ENCOUNTER_EXPIRED'; end if;
  if p_action is null or p_action not in ('normal_attack','element_attack','dodge','ultimate') then raise exception 'INVALID_BATTLE_ACTION'; end if;
  if p_action_id is null or length(trim(p_action_id)) not between 1 and 180 then raise exception 'ACTION_ID_REQUIRED'; end if;
  if (permit_row.data_json#>>'{battle,view,round}')::integer + 1 <> p_expected_round then raise exception 'ROUND_CONFLICT'; end if;
  if (permit_row.data_json#>>'{battle,finished}')::boolean then raise exception 'BATTLE_FINISHED'; end if;
  if (p_battle#>>'{view,round}')::integer <> p_expected_round then raise exception 'INVALID_BATTLE_ROUND'; end if;
  update public.runtime_discovery_permits set data_json=jsonb_set(data_json,'{battle}',p_battle) where id=p_permit;
  receipt=jsonb_build_object('permitId',p_permit,'action',p_action,'result',p_battle);
  insert into public.runtime_discovery_actions(owner_account_id,action_id,permit_id,data_json) values(p_owner,p_action_id,p_permit,receipt);
  return p_battle;
end $$;
revoke all on function public.advance_runtime_discovery_battle(text,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.advance_runtime_discovery_battle(text,uuid,text,text,integer,jsonb) to service_role;

create or replace function public.claim_runtime_discovery_capture(p_owner text,p_permit uuid,p_receipt jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare existing jsonb; permit_row public.runtime_discovery_permits;
begin
  select * into permit_row from public.runtime_discovery_permits where id=p_permit and owner_account_id=p_owner for update;
  if not found then raise exception 'PERMIT_INVALID'; end if;
  select data_json into existing from public.runtime_discovery_captures where permit_id=p_permit;
  if existing is not null then return existing; end if;
  -- Recheck authoritative state while holding the permit lock. The edge handler
  -- checks the fresh OS fix; a stale concurrent request cannot award twice or
  -- turn an unfinished battle into a capture through this settlement function.
  if coalesce((permit_row.data_json->>'expiresAt')::numeric,0) < extract(epoch from clock_timestamp())*1000 then raise exception 'ENCOUNTER_EXPIRED'; end if;
  if (permit_row.data_json#>>'{battle,finished}')::boolean is distinct from true
    or permit_row.data_json#>>'{battle,winner}' is distinct from 'player' then raise exception 'VICTORY_REQUIRED'; end if;
  if p_receipt->>'owner' is distinct from p_owner
    or p_receipt->>'permitId' is distinct from p_permit::text
    or p_receipt->>'spawnId' is distinct from permit_row.spawn_id then raise exception 'RECEIPT_MISMATCH'; end if;
  if jsonb_typeof(p_receipt->'distanceMeters') is distinct from 'number' then raise exception 'DISTANCE_INVALID'; end if;
  if (p_receipt->>'distanceMeters')::numeric not between 0 and 100 then raise exception 'OUT_OF_RANGE'; end if;
  insert into public.runtime_discovery_captures(id,owner_account_id,permit_id,data_json)
    values((p_receipt->>'id')::uuid,p_owner,p_permit,p_receipt);
  update public.runtime_discovery_permits set data_json=jsonb_set(data_json,'{status}','"captured"'::jsonb) where id=p_permit;
  return p_receipt;
end $$;
revoke all on function public.claim_runtime_discovery_capture(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_runtime_discovery_capture(text,uuid,jsonb) to service_role;
-- Rollback: disable the discovery edge function and preserve these tables for audit.
-- Removing the feature does not require deleting pets, permits, or capture history.
