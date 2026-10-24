# Isolated QA identity contract

Foundation's main entry now calls both the low-level profile validator and this account resolver before opening stores. It passes the verified private context through `qaProfile`; Accounts reuses it for SQLite validation and publishes `qaIdentity`. The single common `qaScenario` delegates its `requireIdentity()` to `qaIdentity`. Core never imports Accounts, avoiding a circular validator dependency. Unified runs use one `.lingjing-qa-profile.json` and the `unified-battle` flag.

For the unified battle goal (2026-10-24). Accounts consumes foundation's public scenario guard from commit 4c05172; it adds no battle engine or simulated cloud sync.

## One shared scenario

Use foundation's `node scripts/acceptance/create-scenario-profile.mjs`, or the test-only `provisionQaProfile(newAbsoluteDirectory)` helper which writes the same marker schema and refuses every existing directory. Launch with both `LINGJING_QA_SCENARIO=unified-battle` and the resulting `PET_USER_DATA_DIR`.

The only marker is `.lingjing-qa-profile.json`; the public descriptor is `{id:'unified-battle',runId,provenance:'simulated',isolated:true}`. Foundation's `runtime/core/qa-scenario.cjs` validates directory binding, copied markers and scenario selection. Accounts reuses that exact guard, checks existing raw accounts, and binds SQLite `account_qa_profile` to `runId/id`. QA owners are `qa:<runId>:local-<uuid>`. No network failure, local login or renderer payload enables simulation. QA sessions are memory-only.

## Main-process identity

Foundation retains ownership of `services.get('qaScenario')`. Accounts never replaces an existing descriptor. It registers a separate `services.get('qaIdentity')` with `{descriptor,requireIdentity()}` only in a verified QA profile. `requireIdentity()` accepts no renderer owner and returns the current verified account `{authority:'simulated',scenarioId:'unified-battle',runId,provider:'qa',id,ownerAccountId,account,username}`. It throws when signed out and contains no token or password. Battle may alternatively call `accounts.requireScenarioIdentity('unified-battle')`.

A simulated battle adapter may consume this identity. Real OnlineDuelService calls must continue using `accounts.requireRuntimeUser()`, which rejects QA. Peer context belongs to battle's explicit scenario adapter. Never synthesize cloud session tokens, route QA identities into a real client, or fall back to simulated results after a live failure.

Foundation's early preflight must remain before legacy/database initialization (already published in its unified-battle main). Accounts' feature guard follows it and validates DB ownership before importing identities. The older public shell in this feature branch uses the same shared core guard at registration and only supplies `qaScenario` when the shell has not already registered it. Final integration uses foundation's early guard and descriptor.

## Data and visible evidence

Accounts session/currentUser expose `dataMode:'simulated'` for QA (`'live'` for normal execution), and session.scenario is the canonical public descriptor. The small flask tooltip follows this descriptor; it never claims a normal local account is a live cloud service.

QA host policy blocks real location/emotion gates, native notifications and system startup changes. Backup provenance is `{mode:'simulated',scenarioId,runId}` for QA and `{mode:'live'}` for ordinary execution. Cross-environment and cross-run restores fail before owner validation. Old version-1 live backups without provenance remain compatible. Native pickers, owner/integrity checks, transactional restore and before-restore preservation use the original backup implementation.

Verification: `node --test apps/pc-app/runtime/features/accounts/tests/qa-scenario.test.cjs`, plus `qa-ui.acceptance.mjs` for actual Electron/native picker/session/data evidence. Source SHA and screenshots are in `docs/implementation/status/accounts.json`. This verifies accounts boundaries; shared friend-PK completion still needs battle's scenario adapter and final integrated acceptance.
