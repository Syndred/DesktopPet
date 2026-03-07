-- T-210: enforce single active session per runtime account

alter table public.runtime_accounts
  add column if not exists session_token text;

alter table public.runtime_accounts
  add column if not exists session_issued_at timestamptz;

update public.runtime_accounts
set
  session_token = coalesce(nullif(session_token, ''), 'legacy-' || replace(gen_random_uuid()::text, '-', '')),
  session_issued_at = coalesce(session_issued_at, now())
where
  session_token is null
  or btrim(session_token) = ''
  or session_issued_at is null;

alter table public.runtime_accounts
  alter column session_token set not null;

