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
| `territories` | authenticated | - | owner | - |
| `territory_logs` | authenticated | actor | - | - |
| `emotion_snapshots` | owner | owner | - | - |

Operational note:
1. Privileged modifications should use service role through edge functions.

