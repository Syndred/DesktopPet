# Supabase Schema Baseline

This folder contains SQL migrations for core game data.

## Files

1. `migrations/0001_core_schema.sql`
   - Core tables
   - PostGIS indexes
   - RLS policies
2. `migrations/0002_pet_inventory_battle_reports.sql`
   - PC inventory persistence and battle report tables
   - RLS policies for owner-scoped history
3. `migrations/0003_duel_realtime_schema.sql`
   - Online duel room/action/round tables
   - Realtime-oriented read policies and room lifecycle fields
4. `migrations/0004_runtime_cloud_auth_duel_requests.sql`
   - Runtime cloud account tables (`runtime_accounts`, `runtime_duel_requests`)
   - Duel request hub for register/login/search/request workflow
   - Baseline RLS enabled (writes via edge function service-role)
5. `migrations/0005_runtime_single_login_session.sql`
   - Adds `runtime_accounts.session_token` and `session_issued_at`
   - Enables single active login session per account
6. `functions/duel-online/index.ts`
   - Edge Function entry for runtime auth/request + online duel flow
   - Server-side round resolution (authoritative HP/anger updates)
   - Supported ops:
     - `register_account`, `login_account`, `update_account`
     - `search_accounts`
     - `send_duel_request`, `list_duel_requests`, `respond_duel_request`, `cancel_duel_request`
     - `create_room`, `join_room`, `get_room`, `submit_action`, `leave_room`

## Notes

1. `player_profiles.id` is mapped to `auth.users.id`.
2. Game writes should go through edge functions for extra validation.
3. RLS policies in this baseline only allow self-owned data access by default.
4. `0003` keeps duel table writes behind service-role edge functions; select policies are open for realtime prototype subscription and should be tightened after full Supabase Auth rollout.
5. `0004` keeps account/request writes behind service-role edge functions for internal test; tighten RLS after migrating to full auth token identity.
6. `0005` introduces session token checks: second login invalidates previous session immediately.
