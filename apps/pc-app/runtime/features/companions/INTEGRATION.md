# Companions integration

The implementation follows `docs/implementation/foundation-contract.md` and the current `scope-2d-ui-first.txt`. This feature owns no root dependency changes, SQLite connection, common preload, route engine or character animation engine. Foundation discovers its renderer/runtime entry points and runs additive migrations on `services.db`.

## Current UI and desktop

Routes: `/companions`, `/companions/adopt`, `/companions/:petId`, `/desktop/:petId`. The desktop route is the same React application in a sandboxed transparent window supplied by `services.windows.create`. It uses the normal verified IPC bridge and resources' shared Pixi `ResourceStage`. There is no companion-specific HTML application or preload. Windows show without taking focus, forward mouse input outside their hit regions, drag independently and persist their global positions. Pointer screen coordinates are captured with the event, avoiding asynchronous cursor races. Stationary coordinates are not rewritten merely because Windows DPI rounds native bounds.

Each account can adopt the same template repeatedly. A new petId, serial, growth object, desktop state and provenance are allocated per adoption. Template/resource IDs are never instance IDs. Chat, battle, guard and desktop visibility are separate states. The chat and memory entry points first persist the companions selection, then call the real `conversations.select` with the returned petId and expected verified owner before navigating.

The feature consumes the public shadcn Radix Dialog, Tabs, Select, Slider, Switch, Checkbox, Input, Tooltip and Button components, plus foundation's Motion PageTransition/AnimatedList. Radix owns focus/keyboard/Escape/ARIA behavior. The feature adds an accessible name to the public Slider Thumb because the current shared wrapper places its author label only on the root. It does not replace Radix behavior. Static roster thumbnails share the same registered atlas; animated detail, adoption and native windows use the actual shared Pixi renderer. Application animations off stops both Pixi playback and main-process walking. The installed Motion hook reads system reduced motion on mount; initialization with that preference is verified.

## IPC and ownership

Commands: `list`, `get`, `adopt`, `rename`, `desktop`, `select`, `interact`, `appearance`, `desktopInput`, `perform`, `combatProfile`. Main derives owner from the verified request context. Renderer owner fields never authorize access. `appearance` accepts only a registered, ready spritesheet resource and preserves the pet's identity/growth. `desktopInput` checks the current verified owner and that exact native window entry; it accepts hit-region and drag events only.

`perform({actionId,petId,resourceId?,action})` previews a clip from the pet's current registered resource. Main refuses an unavailable/fallback action, checks owner and resource identity again after resource I/O, records the idempotent receipt, then emits `companions:action` with owner/pet/resource/action and a short expiry. Position/growth revision changes do not invalidate a pure preview; persistent edits retain CAS. The renderer narrows the action against the public resources convention and only changes its Pixi clip for that exact identity. It does not update React state per frame. Touch requests wave when the resource actually provides it. Successful feeding requests eat only after its synchronous outer transaction leaves a surviving growth receipt; replay or rollback does not play food again. Playback never consumes food by itself.

`combatProfile({petId})` and main `getCombatProfile(owner,petId)` consume `battle.getRules()` / `battle-runtime.getBattleRules` and the unchanged session constructor. Detail labels persisted HP/ATK/DEF/SPD as growth attributes and explicitly shows the standard mode's normalized opening HP. The same pet/resource and actual training maximum HP are compared in real Electron; no battle formula or duplicated UI constant is introduced.

Mutations require a unique actionId. A retry with the same operation and payload returns the recorded result. Changing either with the same ID fails with ACTION_ID_CONFLICT. Pet mutations support expectedRevision; stale writes fail with REVISION_CONFLICT. Capture creation and arbitrary growth effects are main-service-only and are not exposed as renderer IPC.

## Main service

```js
const companions = services.get('companions');
companions.db;                                  // exactly services.db
companions.listPets(ownerAccountId);             // current 2D Pet[], synchronous
companions.getPet(ownerAccountId, petId);         // PET_NOT_FOUND across accounts
companions.getSelections(ownerAccountId);        // {chatPetId,battlePetId,guardPetId}
companions.listTemplates();                      // current 2D adoption/capture templates
companions.select(ownerAccountId, {actionId, petId, slot: 'battlePetId'});
companions.applyGrowthInTransaction(ownerAccountId, {
  actionId, petId, expectedRevision, effect: {satiety: 12, mood: 2, affinity: 3}
});
companions.createCapturedInstance(ownerAccountId, {
  actionId, templateId: 'big-fish-gentle', name: '相遇的伙伴',
  element: 'fire', // optional authoritative encounter element, independent of appearance
  showOnDesktop: false, origin: {wildPetId, wildSerial, battleId},
  stats // optional trusted settlement stats; omitted values retain element base stats
});
companions.toLegacyPet(pet);                     // existing battle projection, no JSON replacement
companions.recallAll(ownerAccountId, actionId);   // persists each visible flag, used by tray
companions.getDesktopWindows();                  // main diagnostics
```

Garden must use the same services.db for inventory debit and applyGrowthInTransaction. Both are synchronous and compose with an outer SQLite transaction through savepoints. An outer rollback removes growth and its action receipt too. Garden owns the whole feeding ledger and checks it before another debit: a duplicate growth receipt is not authorization to debit food again. Prefix cross-module action IDs by domain.

Discovery creates an instance only after authoritative settlement. The adapter requires wildPetId, wildSerial and battleId; both action replay and a second action for the same owner/battle/encounter return the original pet. Distinct encounters using one appearance create distinct pets. This receipt is not a substitute for validating battle victory. Current template IDs are big-fish-gentle, big-fish-cheerful and big-fish-foodie. All use the approved 2D resource builtin:lingjing-yuwan-v1. No 3D animal template is offered in the new catalog.

Resources resolves registered assets with `{resourceId,petId,context,action}`. Only ready spritesheets reach ResourceStage. Previews and native windows share that public renderer and clip/calibration mapping. A failed or missing resource shows an honest unavailable state; there is no model-viewer/GLB/VRM fallback.

## Existing records and recovery

The import uses accounts.getLegacyInventory for the verified mapped owner; without that adapter it accepts only an exactly matching verified legacy session. It never imports an anonymous global mirror. Existing local account aliases such as local:<legacy user id> are respected.

Raw records are kept in companion_legacy_archive. Historical owner/pet IDs use a composite key, so equal legacy IDs in different accounts do not collide. Original JSON, animals, captures and battle reports are retained. Unsupported old appearances remain stored with their raw metadata but are excluded from active listPets/new UI/native windows. getPet returns RESOURCE_UNAVAILABLE for these archived appearances. A later 2D resource binding may use the same identity without resetting its growth or messages.

Migration is additive, transactional and once per owner. It does not overwrite later progress. Rolling back the executable leaves the additive tables and all original files intact; no destructive down migration runs. Account transitions close previous-owner windows and restore the new owner's persisted visible 2D instances.

## Validation and provenance

`docs/implementation/status/companions.json` is the handoff record. Committed screenshots and the evidence summary are under `docs/implementation/evidence/companions/`. Full isolated test profiles, SQLite readbacks, native drag evidence and raw logs remain under the referenced local artifacts paths.

The domain command runs 12 actual SQLite/account/conversation checks. The lifecycle script runs the real Electron app through adopt/rename/harvest/craft/feed/restart/account transitions; it includes a manual native-drag checkpoint. The UI script reopens that profile and verifies real Radix keyboard/focus behavior, chat memory isolation, stopped Pixi pixels and reduced-motion initialization without resetting inventories.

Code library versions/licenses and actual use sites are listed in status. Approved artwork provenance is in docs/implementation/illustration-assets.json; it is generated project artwork, not material copied under an assumed third-party character license. Current animal art is not available as 2D, so its adoption category shows an empty state. Final all-module regression belongs to foundation.
