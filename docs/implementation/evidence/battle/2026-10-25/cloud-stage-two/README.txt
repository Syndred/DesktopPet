Source implementation: 5ebb63b, branch codex/lingjing-battle-v3.
This is a reviewable deployment checkpoint, not a claim of real cloud acceptance.

authority-save.json: actual local PGlite migrations/transactions and canonical
SQLite companion, garden and battle adapters. The readback boundary uses a
scripted actor invoker backed by the real local save table, not HTTPS/Auth.
Checks include all-or-nothing rollback after protected save mutation, two owners,
one XP award/two seeds/complete mirrored reports, duplicate settlement,
late local-adapter rollback, independent local progress conflict, service-only
execution, obsolete receipt-only path refusal and server training replay.

room-rls.json: actual local Postgres invitation/action/round/RLS checks, including
device-only revoke while auth.sessions remains and another device stays valid.

native-node.json/native-electron.json: supported ordinary own-checkout install,
same SQLite DB opened by Node24.21.0 and Electron44.9.3, better-sqlite3 13.0.3.
No shared junction was rebuilt. No old36 evidence was relabeled.

Additional checks: Deno2.9.6 full entrypoint, frozen1200 cases/7162 rounds,
5 scripted SDK boundary/lifecycle checks, original16 battle/legacy-rules native
cases, build:pc with approved new main/preload and lazy UI.
V3 UI and its original screenshot evidence remain unchanged.
