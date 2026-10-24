# Lingjing foundation contract v1

Feature entry points are discovered automatically, without editing root files.

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
