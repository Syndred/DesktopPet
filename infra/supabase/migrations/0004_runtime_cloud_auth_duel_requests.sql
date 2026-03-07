-- T-209: runtime cloud auth + duel request hub (internal-test baseline)

create table if not exists public.runtime_accounts (
  id text primary key,
  account text not null unique,
  account_key text not null unique,
  username text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index if not exists idx_runtime_accounts_account_key
  on public.runtime_accounts(account_key);
create index if not exists idx_runtime_accounts_updated_at
  on public.runtime_accounts(updated_at desc);

drop trigger if exists trg_runtime_accounts_set_updated_at on public.runtime_accounts;
create trigger trg_runtime_accounts_set_updated_at
before update on public.runtime_accounts
for each row execute procedure public.set_updated_at_tz();

create table if not exists public.runtime_duel_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id text not null references public.runtime_accounts(id) on delete cascade,
  from_account text not null,
  to_user_id text not null references public.runtime_accounts(id) on delete cascade,
  to_account text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
  room_id uuid,
  room_code text,
  room_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user_id <> to_user_id)
);

create index if not exists idx_runtime_duel_requests_to_user_id
  on public.runtime_duel_requests(to_user_id, updated_at desc);
create index if not exists idx_runtime_duel_requests_from_user_id
  on public.runtime_duel_requests(from_user_id, updated_at desc);
create index if not exists idx_runtime_duel_requests_status
  on public.runtime_duel_requests(status);
create index if not exists idx_runtime_duel_requests_room_code
  on public.runtime_duel_requests(room_code);

drop trigger if exists trg_runtime_duel_requests_set_updated_at on public.runtime_duel_requests;
create trigger trg_runtime_duel_requests_set_updated_at
before update on public.runtime_duel_requests
for each row execute procedure public.set_updated_at_tz();

-- Keep writes behind edge function service role for internal test.
alter table public.runtime_accounts enable row level security;
alter table public.runtime_duel_requests enable row level security;

