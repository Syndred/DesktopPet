-- T-201 / T-202: pet inventory persistence + battle reports

create table if not exists public.pet_instances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  pet_template_id uuid references public.pets(id) on delete set null,
  serial_no text not null,
  nickname text not null,
  model_uri text not null,
  element text not null check (element in ('metal', 'wood', 'earth', 'water', 'fire')),
  stats jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_pet_instances_owner_serial
  on public.pet_instances(owner_id, serial_no);
create index if not exists idx_pet_instances_owner_active
  on public.pet_instances(owner_id, is_active);
create index if not exists idx_pet_instances_owner_created
  on public.pet_instances(owner_id, created_at desc);

create table if not exists public.pet_capture_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  pet_instance_id uuid not null references public.pet_instances(id) on delete cascade,
  spawn_point_id uuid references public.geo_spawn_points(id) on delete set null,
  memory_tag text,
  captured_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_pet_capture_records_owner_time
  on public.pet_capture_records(owner_id, captured_at desc);
create index if not exists idx_pet_capture_records_instance
  on public.pet_capture_records(pet_instance_id);

create table if not exists public.battle_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  player_pet_instance_id uuid references public.pet_instances(id) on delete set null,
  enemy_pet_instance_id uuid references public.pet_instances(id) on delete set null,
  status text not null check (status in ('finished', 'abandoned')),
  winner text check (winner in ('player', 'enemy', 'draw')),
  total_rounds int not null default 0 check (total_rounds >= 0),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_battle_sessions_owner_started
  on public.battle_sessions(owner_id, started_at desc);
create index if not exists idx_battle_sessions_owner_status
  on public.battle_sessions(owner_id, status);

create table if not exists public.battle_round_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.battle_sessions(id) on delete cascade,
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  round_no int not null check (round_no > 0),
  player_action text not null check (player_action in ('normal_attack', 'element_attack', 'dodge', 'ultimate', 'stunned')),
  enemy_action text not null check (enemy_action in ('normal_attack', 'element_attack', 'dodge', 'ultimate', 'stunned')),
  damage_taken jsonb not null default '{}'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  winner text check (winner in ('player', 'enemy', 'draw')),
  created_at timestamptz not null default now()
);

create unique index if not exists idx_battle_round_events_unique_round
  on public.battle_round_events(session_id, round_no);
create index if not exists idx_battle_round_events_owner_session
  on public.battle_round_events(owner_id, session_id, round_no);

alter table public.pet_instances enable row level security;
alter table public.pet_capture_records enable row level security;
alter table public.battle_sessions enable row level security;
alter table public.battle_round_events enable row level security;

create policy "pet_instances_select_owner" on public.pet_instances
  for select using (owner_id = auth.uid());
create policy "pet_instances_insert_owner" on public.pet_instances
  for insert with check (owner_id = auth.uid());
create policy "pet_instances_update_owner" on public.pet_instances
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "pet_instances_delete_owner" on public.pet_instances
  for delete using (owner_id = auth.uid());

create policy "pet_capture_records_select_owner" on public.pet_capture_records
  for select using (owner_id = auth.uid());
create policy "pet_capture_records_insert_owner" on public.pet_capture_records
  for insert with check (owner_id = auth.uid());

create policy "battle_sessions_select_owner" on public.battle_sessions
  for select using (owner_id = auth.uid());
create policy "battle_sessions_insert_owner" on public.battle_sessions
  for insert with check (owner_id = auth.uid());

create policy "battle_round_events_select_owner" on public.battle_round_events
  for select using (owner_id = auth.uid());
create policy "battle_round_events_insert_owner" on public.battle_round_events
  for insert with check (owner_id = auth.uid());
