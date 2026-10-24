# Isolated QA identity contract

For the unified battle goal (2026-10-24). This adds no battle engine, remote authentication, or simulated cloud synchronization.

## Explicit launch

`qa-scenario.cjs` exports `provisionQaProfile(absoluteNewDirectory, scenarioId)` and `resolveQaScenario({env,userData,legacyDataFile,productionDirectories})`. Provisioning is an explicit harness/CLI step and refuses an existing directory. It writes `lingjing-qa-profile.json` with an independent UUID and `mode:simulated`.

Launch with both `PET_USER_DATA_DIR=<new QA directory>` and `LINGJING_QA_SCENARIO=friend-pk` (or another explicitly provisioned scenario ID). Renderer payloads, local logins and network failures never activate simulation. A marker without its matching flag fails closed. SQLite `account_qa_profile` must match the marker; existing normal identities/raw history cannot be adopted. QA owners are `qa:<profileId>:local-<uuid>`. Logins are memory-only and do not restore a secure session.

## Foundation preflight

Call `resolveQaScenario` before `initializeLegacy` / `backupLegacy` / `openDatabase`, using final resolved paths and known production directories. Accounts also guards registration and validates the database before importing identities, but module discovery follows foundation's database open; this early preflight is required to reject an invalid launch before legacy initialization. Do not change ordinary profile selection or auto-provision markers on startup.

## Battle adapter

`services.get('qaScenario')` exists only after validated QA registration. It is a frozen main-only descriptor `{mode:'simulated',profileId,scenarioId,requireIdentity()}`. `requireIdentity()` accepts no renderer owner and returns the current verified local QA user `{mode,profileId,scenarioId,provider:'qa',id,ownerAccountId,account,username}`. It throws after logout and contains no session token.

A scenario adapter may consume this identity. The real OnlineDuelService continues using `accounts.requireRuntimeUser()`, which explicitly rejects QA. Never pass a synthetic token/QA identity to a real remote client; never switch to simulation after a live request fails. Peer context belongs to the battle scenario adapter and must be explicitly simulated and bound to the selected scenario.

## Public evidence and data

`accounts.session()` and its `currentUser` report `dataMode:'simulated'` for QA, `'live'` for normal account execution. Session `scenario` contains the public descriptor. The UI shows a small flask icon with a focusable Radix tooltip. This describes execution source; a normal local account is not a cloud-service claim.

QA host policy forces real location/emotion gates off, suppresses native notifications and never changes system startup, even if QA preferences save those toggles. QA backups carry `provenance:{mode:'simulated',profileId,scenarioId}`; normal backups carry `{mode:'live'}`. Validation rejects cross-environment/scenario imports before owner validation. Old version-1 live backups without provenance remain compatible. Native picking, integrity/owner checks, transactions and before-restore copies remain the original backup implementation.

Unit boundary verification: `node --test apps/pc-app/runtime/features/accounts/tests/qa-scenario.test.cjs`. Real Electron evidence and source SHA are recorded in `docs/implementation/status/accounts.json`. Final combined friend-PK acceptance requires foundation's early preflight and battle's explicit scenario adapter.
