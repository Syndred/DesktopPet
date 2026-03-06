-- T-206: realtime duel room schema for minimal online loop

create or replace function public.set_updated_at_tz()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.duel_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'abandoned')),
  host_user_id text not null,
  host_account text not null,
  guest_user_id text,
  guest_account text,
  host_pet_name text not null default 'Player',
  guest_pet_name text,
  host_element text not null default 'metal'
    check (host_element in ('metal', 'wood', 'earth', 'water', 'fire')),
  guest_element text
    check (guest_element in ('metal', 'wood', 'earth', 'water', 'fire')),
  current_round int not null default 1 check (current_round > 0),
  last_resolved_round int not null default 0 check (last_resolved_round >= 0),
  host_hp int not null default 120 check (host_hp >= 0),
  guest_hp int not null default 120 check (guest_hp >= 0),
  host_anger int not null default 0 check (host_anger >= 0 and host_anger <= 100),
  guest_anger int not null default 0 check (guest_anger >= 0 and guest_anger <= 100),
  host_free_dodge_used boolean not null default false,
  guest_free_dodge_used boolean not null default false,
  host_statuses jsonb not null default '[]'::jsonb,
  guest_statuses jsonb not null default '[]'::jsonb,
  winner_side text check (winner_side in ('host', 'guest')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_duel_rooms_status on public.duel_rooms(status);
create index if not exists idx_duel_rooms_host_user_id on public.duel_rooms(host_user_id);
create index if not exists idx_duel_rooms_guest_user_id on public.duel_rooms(guest_user_id);
create index if not exists idx_duel_rooms_updated_at on public.duel_rooms(updated_at desc);

create table if not exists public.duel_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  round_no int not null check (round_no > 0),
  actor_user_id text not null,
  actor_side text not null check (actor_side in ('host', 'guest')),
  action_type text not null
    check (action_type in ('normal_attack', 'element_attack', 'dodge', 'ultimate')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_duel_actions_unique_actor_round
  on public.duel_actions(room_id, round_no, actor_user_id);
create index if not exists idx_duel_actions_room_round
  on public.duel_actions(room_id, round_no);

create table if not exists public.duel_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.duel_rooms(id) on delete cascade,
  round_no int not null check (round_no > 0),
  host_action text not null
    check (host_action in ('normal_attack', 'element_attack', 'dodge', 'ultimate', 'stunned')),
  guest_action text not null
    check (guest_action in ('normal_attack', 'element_attack', 'dodge', 'ultimate', 'stunned')),
  winner_side text check (winner_side in ('host', 'guest')),
  round_result jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_duel_rounds_unique_round
  on public.duel_rounds(room_id, round_no);
create index if not exists idx_duel_rounds_room_round
  on public.duel_rounds(room_id, round_no);

drop trigger if exists trg_duel_rooms_set_updated_at on public.duel_rooms;

create trigger trg_duel_rooms_set_updated_at
before update on public.duel_rooms
for each row execute procedure public.set_updated_at_tz();

alter table public.duel_rooms enable row level security;
alter table public.duel_actions enable row level security;
alter table public.duel_rounds enable row level security;

-- Minimal online loop keeps writes behind edge function (service role).
-- Read policies are open to allow realtime subscriptions with anon key during desktop prototype stage.
create policy "duel_rooms_select_realtime" on public.duel_rooms
  for select using (true);
create policy "duel_actions_select_realtime" on public.duel_actions
  for select using (true);
create policy "duel_rounds_select_realtime" on public.duel_rounds
  for select using (true);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duel_rooms'
    ) then
      alter publication supabase_realtime add table public.duel_rooms;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duel_actions'
    ) then
      alter publication supabase_realtime add table public.duel_actions;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'duel_rounds'
    ) then
      alter publication supabase_realtime add table public.duel_rounds;
    end if;
  end if;
end
$$;
