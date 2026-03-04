-- T-003: core schema + RLS baseline
create extension if not exists postgis;
create extension if not exists pgcrypto;

-- User profile mapped to Supabase auth.users
create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 32),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  name text not null,
  element text not null check (element in ('metal', 'wood', 'earth', 'water', 'fire')),
  level int not null default 1 check (level >= 1),
  intimacy int not null default 0 check (intimacy >= 0),
  anger int not null default 0 check (anger >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pets_owner_id on public.pets(owner_id);
create index if not exists idx_pets_element on public.pets(element);

create table if not exists public.pet_memory_tags (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.pets(id) on delete cascade,
  owner_id uuid not null references public.player_profiles(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 100),
  created_at timestamptz not null default now()
);

create index if not exists idx_pet_memory_tags_pet_id on public.pet_memory_tags(pet_id);
create index if not exists idx_pet_memory_tags_owner_id on public.pet_memory_tags(owner_id);

create table if not exists public.geo_spawn_points (
  id uuid primary key default gen_random_uuid(),
  point_name text not null,
  landmark_type text not null,
  element_pool text not null check (element_pool in ('metal', 'wood', 'earth', 'water', 'fire', 'mixed')),
  rarity_weight int not null default 1 check (rarity_weight > 0),
  geom geography(point, 4326) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_geo_spawn_points_geom on public.geo_spawn_points using gist(geom);
create index if not exists idx_geo_spawn_points_landmark_type on public.geo_spawn_points(landmark_type);

create table if not exists public.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  spawn_point_id uuid references public.geo_spawn_points(id),
  distance_meters numeric(10, 2) not null check (distance_meters >= 0),
  memory_tag text,
  captured_at timestamptz not null default now()
);

create index if not exists idx_captures_user_id on public.captures(user_id);
create index if not exists idx_captures_spawn_point_id on public.captures(spawn_point_id);
create index if not exists idx_captures_captured_at on public.captures(captured_at desc);

create table if not exists public.battle_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  creator_id uuid not null references public.player_profiles(id) on delete cascade,
  opponent_id uuid references public.player_profiles(id) on delete set null,
  status text not null check (status in ('waiting', 'active', 'finished', 'abandoned')),
  winner_id uuid references public.player_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_battle_rooms_creator_id on public.battle_rooms(creator_id);
create index if not exists idx_battle_rooms_opponent_id on public.battle_rooms(opponent_id);
create index if not exists idx_battle_rooms_status on public.battle_rooms(status);

create table if not exists public.battle_round_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.battle_rooms(id) on delete cascade,
  round_no int not null check (round_no > 0),
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  action_type text not null check (action_type in ('normal_attack', 'element_attack', 'dodge')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_battle_round_actions_unique
  on public.battle_round_actions(room_id, round_no, player_id);
create index if not exists idx_battle_round_actions_room_id
  on public.battle_round_actions(room_id, round_no);

create table if not exists public.territories (
  id uuid primary key default gen_random_uuid(),
  territory_name text not null,
  region_code text not null,
  owner_id uuid references public.player_profiles(id) on delete set null,
  bonus_multiplier numeric(4, 2) not null default 1.00 check (bonus_multiplier >= 1),
  boundary geography(polygon, 4326),
  occupied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_territories_region_code on public.territories(region_code);
create index if not exists idx_territories_owner_id on public.territories(owner_id);
create index if not exists idx_territories_boundary on public.territories using gist(boundary);

create table if not exists public.territory_logs (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.territories(id) on delete cascade,
  action text not null check (action in ('invade', 'defend', 'occupy', 'release')),
  actor_user_id uuid not null references public.player_profiles(id) on delete cascade,
  old_owner_id uuid references public.player_profiles(id),
  new_owner_id uuid references public.player_profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_territory_logs_territory_id on public.territory_logs(territory_id);
create index if not exists idx_territory_logs_actor_user_id on public.territory_logs(actor_user_id);

create table if not exists public.emotion_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.player_profiles(id) on delete cascade,
  source text not null check (source in ('pc', 'mobile')),
  focus_score numeric(5, 2) not null check (focus_score >= 0 and focus_score <= 100),
  stress_score numeric(5, 2) not null check (stress_score >= 0 and stress_score <= 100),
  recommendation text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_emotion_snapshots_user_id_created_at
  on public.emotion_snapshots(user_id, created_at desc);

-- RLS baseline
alter table public.player_profiles enable row level security;
alter table public.pets enable row level security;
alter table public.pet_memory_tags enable row level security;
alter table public.geo_spawn_points enable row level security;
alter table public.captures enable row level security;
alter table public.battle_rooms enable row level security;
alter table public.battle_round_actions enable row level security;
alter table public.territories enable row level security;
alter table public.territory_logs enable row level security;
alter table public.emotion_snapshots enable row level security;

-- Profiles
create policy "profiles_select_self" on public.player_profiles
  for select using (auth.uid() = id);
create policy "profiles_update_self" on public.player_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_self" on public.player_profiles
  for insert with check (auth.uid() = id);

-- Pets
create policy "pets_select_owner" on public.pets
  for select using (owner_id = auth.uid());
create policy "pets_insert_owner" on public.pets
  for insert with check (owner_id = auth.uid());
create policy "pets_update_owner" on public.pets
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "pets_delete_owner" on public.pets
  for delete using (owner_id = auth.uid());

-- Pet memory tags
create policy "pet_memory_tags_select_owner" on public.pet_memory_tags
  for select using (owner_id = auth.uid());
create policy "pet_memory_tags_insert_owner" on public.pet_memory_tags
  for insert with check (owner_id = auth.uid());

-- Spawn points are readable for authenticated users
create policy "geo_spawn_points_select_authenticated" on public.geo_spawn_points
  for select using (auth.role() = 'authenticated');

-- Captures
create policy "captures_select_owner" on public.captures
  for select using (user_id = auth.uid());
create policy "captures_insert_owner" on public.captures
  for insert with check (user_id = auth.uid());

-- Battle rooms
create policy "battle_rooms_select_participants" on public.battle_rooms
  for select using (creator_id = auth.uid() or opponent_id = auth.uid());
create policy "battle_rooms_insert_creator" on public.battle_rooms
  for insert with check (creator_id = auth.uid());
create policy "battle_rooms_update_participants" on public.battle_rooms
  for update using (creator_id = auth.uid() or opponent_id = auth.uid())
  with check (creator_id = auth.uid() or opponent_id = auth.uid());

-- Battle actions
create policy "battle_round_actions_select_participants" on public.battle_round_actions
  for select using (
    exists (
      select 1 from public.battle_rooms br
      where br.id = room_id
      and (br.creator_id = auth.uid() or br.opponent_id = auth.uid())
    )
  );
create policy "battle_round_actions_insert_actor" on public.battle_round_actions
  for insert with check (
    player_id = auth.uid()
    and exists (
      select 1 from public.battle_rooms br
      where br.id = room_id
      and (br.creator_id = auth.uid() or br.opponent_id = auth.uid())
    )
  );

-- Territories: public read, authenticated writes through edge functions
create policy "territories_select_authenticated" on public.territories
  for select using (auth.role() = 'authenticated');
create policy "territories_update_owner_only" on public.territories
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Territory logs
create policy "territory_logs_select_authenticated" on public.territory_logs
  for select using (auth.role() = 'authenticated');
create policy "territory_logs_insert_actor" on public.territory_logs
  for insert with check (actor_user_id = auth.uid());

-- Emotion snapshots
create policy "emotion_snapshots_select_owner" on public.emotion_snapshots
  for select using (user_id = auth.uid());
create policy "emotion_snapshots_insert_owner" on public.emotion_snapshots
  for insert with check (user_id = auth.uid());

