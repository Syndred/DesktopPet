# Companions integration

Feature entry points follow `docs/implementation/foundation-contract.md`. This feature does not own a database connection, root dependencies, common IPC or the old JSON store. Migrations are additive and executed by foundation.

Renderer commands: `list`, `adopt`, `rename`, `desktop`, `select`, `interact`. Main derives the owner from `RequestContext`. The renderer cannot call capture creation or supply arbitrary growth effects. Every mutation needs a unique `actionId`; retries must send the same payload. A changed payload with an old ID fails with `ACTION_ID_CONFLICT`. Pet mutations can specify `expectedRevision`.

Main service: `services.get('companions')`:

```js
companions.listPets(ownerAccountId);             // Pet[], synchronous
companions.getPet(ownerAccountId, petId);        // throws PET_NOT_FOUND across accounts
companions.getSelections(ownerAccountId);       // { chatPetId, battlePetId, guardPetId }
companions.select(ownerAccountId, {actionId, petId, slot: 'battlePetId'});
companions.applyGrowthInTransaction(ownerAccountId, {
  actionId, petId, expectedRevision, effect: {satiety: 12, mood: 2, affinity: 3}
});
companions.createCapturedInstance(ownerAccountId, {
  actionId, templateId: 'blaze-shiba', name: '柴柴', showOnDesktop: false,
  origin: {wildPetId, wildSerial, battleId}, stats // stats optional, from trusted settlement
});
companions.toLegacyPet(pet); // existing battle-format projection; does not replace JSON
companions.getDesktopWindows(); // main diagnostics, not renderer IPC
```

Garden must use the **same `services.db`** for inventory debit and `applyGrowthInTransaction`. Both are synchronous and use composable SQLite savepoints; an outer rollback also rolls back growth and its action record. Garden owns its whole feeding action ledger and must check that ledger before a repeated debit. `duplicate` from this growth adapter does not mean a separate inventory debit can be repeated. IDs are owner-scoped; include a domain prefix in cross-module action IDs.

Discovery calls capture creation only after authoritative settlement. Two actions may create two pets from the same appearance. Retrying one action returns the original pet. `origin.battleId` / encounter IDs are recorded; this adapter is not a replacement for battle validation. Current templates are `big-fish-gentle`, `big-fish-cheerful`, `big-fish-foodie`, `blaze-shiba`, `tuxedo-cat`, `fox`, `husky`.

Resources supplies `resolve(owner,{resourceId,petId,context,action})`, `assetFile(owner,id,key)` and its normal `resolve` IPC command. Companions waits for the registered command's seed, then resolves registered assets in main. The built-in 2D reference is `builtin:fat-fish-v1`; retained model IDs are `legacy:<lowercase filename>`. Legacy model paths remain in `resource.legacyModel`. No template/appearance ID is used as a pet instance ID.

Each desktop pet has a sandboxed transparent BrowserWindow with a narrow, sender-bound preload. It shows without focus, uses mouse forwarding outside its hit area, and persists its own drag position. Motion is main-process per pet; React does not rerender on motion ticks. On an account change all old windows close; the current account's saved visible pets are restored. Foundation can use `companions.getDesktopWindows()` for diagnostics. A tray-wide recall should call the public service `recallAll` when provided, rather than hiding unrelated windows.

Migration imports only the verified current account's legacy inventory. Old `pet.id` values remain valid within that owner. The composite key supports old IDs that repeat across accounts. `companion_legacy_archive` keeps each raw pet record. Original JSON, capture records and battle reports are untouched. An existing migration does not reset adopted pets or later growth. Rolling back the app leaves the new additive tables in place; no destructive down migration is needed.

Validation: `node --test apps/pc-app/runtime/features/companions/tests/service.test.cjs` uses an actual SQLite file and a second database connection. Windows Electron acceptance is separately recorded in status and runtime evidence.
