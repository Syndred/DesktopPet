# RLS Matrix

| Table | Select | Insert | Update | Delete |
|------|--------|--------|--------|--------|
| `player_profiles` | self | self | self | - |
| `pets` | owner | owner | owner | owner |
| `pet_memory_tags` | owner | owner | - | - |
| `geo_spawn_points` | authenticated | - | - | - |
| `captures` | owner | owner | - | - |
| `battle_rooms` | participants | creator | participants | - |
| `battle_round_actions` | participants | actor-participant | - | - |
| `duel_rooms` | public-realtime (prototype) | service-role edge | service-role edge | - |
| `duel_actions` | public-realtime (prototype) | service-role edge | service-role edge | - |
| `duel_rounds` | public-realtime (prototype) | service-role edge | service-role edge | - |
| `territories` | authenticated | - | owner | - |
| `territory_logs` | authenticated | actor | - | - |
| `emotion_snapshots` | owner | owner | - | - |

Operational note:
1. Privileged modifications should use service role through edge functions.
2. Duel realtime tables are temporarily open for select to allow anon-key realtime subscription in desktop prototype; tighten after Supabase Auth is fully wired.
