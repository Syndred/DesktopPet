# Lingjing foundation contract v1

## 2026-10-24 scope update: 2D and shared component kit

Authoritative scope is `scope-2d-ui-first.txt` (shared source revision d6a1ab1). The new renderer ships 2D only. Original files/history remain archived; no new GLB/model-viewer path is required.

Official shadcn/ui **Radix Nova** components are imported under `ui/src/components/ui/<name>.tsx`; `ui/components.json` fixes the Radix style. Provenance, source URLs and SHA256 hashes: `docs/implementation/shadcn-source-record.json`; MIT license is adjacent to the components. Components use Radix's interaction/focus/keyboard behavior. `ui/src/components/kit.ts` is the public barrel (Button, Card, AppDialog, Tabs, Select, NativeSelect, Switch, Tooltip, Popover, ScrollArea, Sheet, Input, Textarea, Checkbox, Label, Badge, Separator, Slider). Existing `components/ui.tsx` Button/Card wrappers now delegate to the imported library with Lingjing's flat theme. Prefer the public components over custom primitive interactions.

Tailwind v4 uses the official `@tailwindcss/vite` plugin. Design tokens and theme are in `styles/tokens.css`, `styles/shadcn.css`, with complex feature-stage CSS remaining local. Buttons have no shadows or active/hover translation.

`components/motion.tsx`: `AppMotionProvider` is already installed, `PageTransition` wraps routes, `MotionPanel` wraps the shared dialog, `AnimatedList` supplies layout/list movement, `AppPresence` exposes exit coordination. Reuse these, not a separate motion system. Timing: 180 ms enter/layout, 100 ms exit, 5 px route distance, easing [.22,1,.36,1]. System reduced motion and `desktop.animationsEnabled` are respected; the real desktop settings page persists the app toggle. No button hover movement.

Installed shared dependencies include PixiJS 8, MapLibre GL and `@turf/distance` for the discovery migration; roots remain foundation-owned. New `companions:appearance` binds a registered 2D resource to a precise petId while preserving its growth, selections and messages.

Feature entry points are discovered automatically, without editing root files.

Integration adapters added after the shared kit: `companions.migrateOwnerAlias({sourceOwnerAccountId,targetOwnerAccountId,provider,subjectId})` is synchronous, main-only, and checks the current verified Accounts alias. It imports a pre-Accounts SQLite save only into an empty/pristine legacy mirror, keeps original rows and a full archive, and rejects independently changed targets. `ensureImported` invokes it before falling back to the old JSON. Garden can use it inside its shared transaction. New backups use a conversations adapter that retains message IDs/order while regenerating local SQLite sequences, includes connection metadata without encrypted keys, preserves matching local credentials, and refuses restore while a reply is active.

Renderer: `apps/pc-app/ui/src/features/<id>/index.tsx`, default export or named `feature`:

```tsx
export default {
  id: 'companions', title: '我的灵宠',
  routes: [{ path: '/companions', title: '我的灵宠', component: CompanionsPage }]
};
```

Paths begin with `/`. Subroutes use the same feature prefix. Garden additionally owns `/inventory`; accounts owns `/settings` and `/account`; conversations owns `/chat` and `/settings/ai`; resources owns `/resources`. A page can use `window.lingjing.invoke(featureId, command, payload)` or helpers from `ui/src/app/bridge.ts`. Successful command values are returned as `{ok:true,data}`; domain results already containing `ok` are preserved (do not double unwrap). Failures contain stable `code` and Chinese `message`. Renderer routing uses hash URLs and `navigate('/path')` from `ui/src/app/navigation.ts`.

Runtime: `apps/pc-app/runtime/features/<id>/index.cjs`:

```js
module.exports = {
  id: 'companions',
  migrations: [{ id: 'companions-001', sql: 'CREATE TABLE ...' }],
  register(services) {
    const { db } = services;
    services.provide('companions', { /* synchronous transaction adapters */ });
    return { commands: {
      list(payload, context) { return db.prepare('SELECT ... WHERE owner_account_id=?').all(context.ownerAccountId); }
    }};
  }
};
```

`services.db` is the single synchronous SQLite connection, supporting `prepare().get/all/run`, `exec`, `transaction(fn)(...args)`, `pragma`. `services.database` aliases that connection. Migrations run transactionally, once per namespaced id; alternatively `{id,up(db)}`. Keep migrations inside the feature. No production cloud migration is run by foundation.

Other services: `services.session.getCurrentUser()`, `getOwnerAccountId()`, `requireOwner()`; `services.provide(name,value)` and `services.get(name)`; `services.events.emit(name,payload)` and `on(name,listener)`; `services.paths.{userData,assets,legacyDataFile}`; `services.legacy.{runtimeDataStore,battleService,mapService,wildPetService,onlineDuelService,invoke(channel,payload)}`; `services.windows` for companion window adapters; `services.safeStorage` for main-only secret encryption. `services.ipc.handle('feature:command',handler)` is an alternative to returned commands. Handler signature is `(payload,context)`.

Accounts commands `session`, `login`, `register` can declare `publicCommands` on the module; all other commands require a verified owner. Foundation accepts no renderer supplied owner. `services.session` delegates to the retained RuntimeDataStore session until accounts installs its verified session adapter with `services.session.setAdapter(adapter)`.

Registration order: accounts, resources, companions, battle, garden, discovery, conversations. Use lazy `services.get()` lookups inside commands when dependencies register later. Cross-module transaction adapters must be synchronous; asynchronous network calls stay outside SQLite transactions. The foundation preserves the original JSON files and legacy renderer under an explicit compatibility entry; no data is deleted.

Dependencies: only foundation edits root manifests and lockfile. Declare additional dependency requirements in your status JSON. Publish feature code and `docs/implementation/status/<id>.json` on your own branch; foundation collects branches read-only and performs final integration.

### Authoritative garden readback and account CAS

`accounts.sync.acceptAuthoritativeReadback(owner, {envelope, cloudRevision})` is main-only. Garden calls it inside the same SQLite readback transaction. The complete envelope is validated against current identity/adapters; local domain data must match. Pending, in-flight, stale or conflicting account saves stop adoption and roll back the local garden readback. SQL table row order is ignored for the data fingerprint; conversation message/history array order stays significant. The public cloud revision and a durable content checkpoint advance together. No pending action is superseded automatically and no production deployment is implied. Verified legacy owner aliases now migrate garden and companions using the actual registered services on the same connection.

Focused evidence: 10 foundation SQLite tests, 17 account cases (one fixed-case recheck after the final guard correction), and 8 garden HTTP/PostgreSQL WASM checks passed on 2026-10-24. Real remote service and two-device acceptance remain pending.
