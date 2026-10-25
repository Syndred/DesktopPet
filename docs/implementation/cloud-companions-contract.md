# Companion consistency unit for the shared cloud save

This feature uses Accounts' identity and complete-save CAS/transport. It introduces no cloud account, inventory, reward endpoint or remote schema. Runtime-only API: `services.get('companions').backupAdapter`.

The adapter is `id: companions, version: 1`, with synchronous `export(owner)`, `validate(data, owner)`, `restore(owner, data, mode)`, `dataChecksum(owner)` and `fromLegacyTables(tables, owner)` methods. Its data is `{ownerAccountId, tables, identityImports}`. `tables` contains the complete existing `companion_accounts`, `companion_pets`, `companion_actions`, `companion_legacy_archive`, `companion_interactions` and `companion_capture_receipts` rows. `identityImports` contains historical `companion_identity_imports` rows whose target is this owner. Those archives confer no authentication authority; Accounts must still verify every alias independently.

Every pet keeps its original petId, template/resource reference, name/serial/origin, growth, desktop position/visibility/behavior/scale and three independent chat/battle/guard selections. Same-template pets are never combined. Captured and action receipts retain their original IDs, request hashes and result JSON. Raw legacy/archived 3D animals remain in saves/history without becoming active 3D resources.

Restore is one SQLite savepoint, composing with the complete-save outer transaction. A matching unit is idempotent. Merge into an empty unit is allowed; different nonempty units raise `COMPANION_BACKUP_CONFLICT`, preserving both. Complete replacement requires Accounts' verified owner, preview, local-checksum/CAS checks and before-restore archive. A pet's state must never be row-unioned with another device's receipts. Foreign owner/nested pet mismatches, duplicate keys and dangling selections/capture references are rejected. Existing identity-import rows belonging to another target cannot be overwritten.

## Accounts integration requirement

Register this adapter only after the shared BackupManager supports legacy-table conversion. Its `tables` claims all seven SQLite tables, and `legacyTables` names the six former generic tables. The current baseline BackupManager rejects generic tables claimed by a new adapter, so auto-registering now would break existing archives. `fromLegacyTables(completeGenericTables, owner)` validates and converts all six original table entries without changing saved cell values; incomplete groups fail instead of being stitched together. It does not fabricate an identity-import proof missing from an old archive. Accounts should validate the original envelope checksum, provenance and verified identity, normalize the complete old unit, then validate/restore using this adapter. Source owner strings must not be blindly replaced by an Auth UUID.

After an atomic full-save restore, emit `accounts:save-restored` with the verified owner. Companions listens for that existing event to refresh its pages and reconcile desktop windows after commit. Authentication and resource download readiness remain with Accounts/Resources.

## Garden integration requirement

`garden/cloud-domain.mjs` currently reads `envelope.data.tables.companion_pets/accounts.rows`. For new saves, read the same rows from `envelope.data.modules.companions.data.tables.companion_pets/accounts`; keep complete old-format reads for migration. The inventory debit, pet effect, account revision and receipt must stay in the same authoritative locked complete-save transaction. Do not create a second pet, inventory or growth-reward store. Companions' local `applyGrowthInTransaction` remains the same shared-connection adapter.

## Verification boundaries

The initial four `tests/backup.test.cjs` cases use independent real SQLite files and product domain code. They are local preservation/transaction tests, not live-cloud evidence. Real HTTPS identity, two-device save CAS and deployed inventory readback remain required after the coordinator publishes the shared contracts and deployment. Existing 2D and Accounts' 1–4 visible-companion contract stay unchanged. A new device may derive an on-screen clamp, but opening/closing it without movement must preserve the saved position rather than writing its monitor geometry back.
