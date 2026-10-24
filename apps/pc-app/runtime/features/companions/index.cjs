const { migrations } = require('./migrations.cjs');
const { CompanionsService, toLegacyPet } = require('./service.cjs');
const { createCompanionOwnerMigration } = require('./identity.cjs');
const { createCompanionPlayback } = require('./playback.cjs');
const { companionCombatProfile } = require('./combat-profile.cjs');

module.exports = {
  id: 'companions', migrations,
  register(services) {
    const service = new CompanionsService({ db: services.db });
    const playback = createCompanionPlayback({ services, service });
    const disposers = [];
    let desktop;
    let changeQueued = false;
    function changed(ownerAccountId) {
      if (changeQueued) return;
      changeQueued = true;
      queueMicrotask(() => {
        changeQueued = false;
        services.events.emit('companions:changed', { ownerAccountId });
        desktop?.sync();
      });
    }
    const ownerMigration = createCompanionOwnerMigration(services, changed);
    function upgradeBuiltins(ownerAccountId) {
      const resources = services.get('resources');
      if (resources?.canonicalId && service.upgradeBuiltinResources(ownerAccountId, id => resources.canonicalId(id)).length) changed(ownerAccountId);
    }
    function ensureImported(ownerAccountId) {
      ownerMigration.ensure(ownerAccountId);
      if (service.account(ownerAccountId).legacy_imported_at) { upgradeBuiltins(ownerAccountId); return; }
      const accounts = services.get('accounts');
      if (accounts?.getLegacyInventory) {
        const inventory = accounts.getLegacyInventory(ownerAccountId);
        service.importLegacyInventory(ownerAccountId, inventory || { pets: [] });
        upgradeBuiltins(ownerAccountId);
        return;
      }
      const legacy = services.legacy?.runtimeDataStore;
      // Never import the anonymous global mirror or another account's inventory.
      if (!legacy || legacy.getAuthSession()?.currentUser?.id !== ownerAccountId) return;
      const inventory = legacy.getInventorySnapshot();
      service.importLegacyInventory(ownerAccountId, inventory);
      upgradeBuiltins(ownerAccountId);
    }
    const api = {
      db: services.db,
      migrateOwnerAlias: ownerMigration.migrate,
      listPets(ownerAccountId) { ensureImported(ownerAccountId); return service.snapshot(ownerAccountId).data.pets.filter(pet => pet.resource.kind === '2d'); },
      getPet(ownerAccountId, petId) {
        ensureImported(ownerAccountId); const pet = service.requirePet(ownerAccountId, petId);
        if (pet.resource.kind !== '2d') throw Object.assign(new Error('旧伙伴原始记录已保留，本版使用 2D 伙伴'), { code: 'RESOURCE_UNAVAILABLE' });
        return pet;
      },
      getSelections(ownerAccountId) { return service.selections(ownerAccountId); },
      getCombatProfile(ownerAccountId, petId) { return companionCombatProfile(api.getPet(ownerAccountId, petId)); },
      listTemplates() { return service.templates(); },
      playAction(ownerAccountId, input) { return playback.play(ownerAccountId, api.getPet(ownerAccountId, input.petId), input.action, input.actionId); },
      applyGrowthInTransaction(ownerAccountId, input) {
        const result = service.applyGrowthInTransaction(ownerAccountId, input);
        changed(ownerAccountId);
        playback.afterGrowthCommit(ownerAccountId, input, result);
        return result;
      },
      createCapturedInstance(ownerAccountId, input) {
        ensureImported(ownerAccountId);
        const result = service.createCapturedInstance(ownerAccountId, input);
        changed(ownerAccountId);
        return result;
      },
      select(ownerAccountId, input) { const result = service.select(ownerAccountId, input); changed(ownerAccountId); return result; },
      recallAll(ownerAccountId, actionId) {
        const result = service.action(ownerAccountId, 'recall-all', { actionId }, () => {
          const pets = service.snapshot(ownerAccountId).data.pets.filter(pet => pet.desktop.visible);
          for (const pet of pets) { pet.desktop.visible = false; service.storePet(pet); }
          return { recalled: pets.map(pet => pet.petId) };
        });
        changed(ownerAccountId); return result;
      },
      importLegacyInventory: (ownerAccountId, inventory) => service.importLegacyInventory(ownerAccountId, inventory),
      toLegacyPet,
      notifyChanged: changed,
      getDesktopWindows: () => desktop?.inspect() || []
    };
    services.provide('companions', api);
    // Electron is required lazily, so domain/migration checks also run under Node.
    if (process.versions.electron && process.type === 'browser') {
      const { createDesktopWindowManager } = require('./windows.cjs');
      desktop = createDesktopWindowManager({ services, service, ensureImported, changed });
      for (const event of ['accounts:changed', 'session:changed', 'auth:changed', 'accounts:session-changed']) disposers.push(services.events.on(event, () => desktop.sync()));
      desktop.sync();
    }
    const execute = (method) => (payload, context) => {
      ensureImported(context.ownerAccountId);
      const result = service[method](context.ownerAccountId, payload);
      changed(context.ownerAccountId);
      return result;
    };
    return {
      commands: {
        async list(_payload, context) { await services.get('resources')?.ready; ensureImported(context.ownerAccountId); desktop?.sync(); return service.snapshot(context.ownerAccountId); },
        async get(payload, context) { await services.get('resources')?.ready; const pet = api.getPet(context.ownerAccountId, payload.petId); return { ok: true, data: pet, revision: pet.revision }; },
        combatProfile(payload, context) { return { ok: true, data: api.getCombatProfile(context.ownerAccountId, payload.petId) }; },
        desktopInput(payload, context) {
          if (!desktop) return { ok: false, code: 'DESKTOP_UNAVAILABLE', message: '请在灵境桌面应用中操作伙伴' };
          return desktop.handleInput(context.ownerAccountId, payload);
        },
        adopt: execute('adopt'), rename: execute('rename'), desktop: execute('updateDesktop'),
        select: execute('select'),
        interact(payload, context) {
          const result = execute('interact')(payload, context);
          if (!result.duplicate) void playback.play(context.ownerAccountId, result.data.pet, 'wave', payload.actionId).catch(() => {});
          return result;
        },
        perform(payload, context) { ensureImported(context.ownerAccountId); return playback.perform(context.ownerAccountId, payload); },
        async appearance(payload, context) {
          ensureImported(context.ownerAccountId);
          const resource = await services.get('resources').get(context.ownerAccountId, payload.resourceId);
          if (resource.availability !== 'ready') throw Object.assign(new Error('角色文件暂不可用。'), { code: 'RESOURCE_UNAVAILABLE' });
          if (resource.kind !== 'spritesheet') throw Object.assign(new Error('本版请选择 2D 角色资源。'), { code: 'RESOURCE_UNAVAILABLE' });
          if (services.session.getOwnerAccountId() !== context.ownerAccountId) throw Object.assign(new Error('账号已切换。'), { code: 'SESSION_CHANGED' });
          const result = service.action(context.ownerAccountId, 'appearance', payload, () => {
            const pet = service.requirePet(context.ownerAccountId, payload.petId, payload.expectedRevision);
            pet.resource = { resourceId: resource.id, kind: '2d' };
            service.storePet(pet);
            return { pet, selections: service.selections(context.ownerAccountId) };
          });
          changed(context.ownerAccountId); return result;
        }
      },
      dispose() { playback.dispose(); for (const dispose of disposers) dispose(); desktop?.dispose(); }
    };
  }
};
