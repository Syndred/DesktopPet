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
4. `functions/duel-online/index.ts`
   - Edge Function entry for create/join/sync/submit/leave online duel flow
   - Server-side round resolution (authoritative HP/anger updates)

## Notes

1. `player_profiles.id` is mapped to `auth.users.id`.
2. Game writes should go through edge functions for extra validation.
3. RLS policies in this baseline only allow self-owned data access by default.
4. `0003` keeps duel table writes behind service-role edge functions; select policies are open for realtime prototype subscription and should be tightened after full Supabase Auth rollout.
