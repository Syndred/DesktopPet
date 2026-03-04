# Supabase Schema Baseline

This folder contains SQL migrations for core game data.

## Files

1. `migrations/0001_core_schema.sql`
   - Core tables
   - PostGIS indexes
   - RLS policies

## Notes

1. `player_profiles.id` is mapped to `auth.users.id`.
2. Game writes should go through edge functions for extra validation.
3. RLS policies in this baseline only allow self-owned data access by default.

