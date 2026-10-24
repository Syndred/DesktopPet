const { migrations } = require('./migrations.cjs');
const { CompanionsService, toLegacyPet } = require('./service.cjs');

module.exports = {
  id: 'companions', migrations,
  register(services) {
    const service = new CompanionsService({ db: services.db });
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
    function ensureImported(ownerAccountId) {
      if (service.account(ownerAccountId).legacy_imported_at) return;
      const accounts = services.get('accounts');
      if (accounts?.getLegacyInventory) {
        const inventory = accounts.getLegacyInventory(ownerAccountId);
        service.importLegacyInventory(ownerAccountId, inventory || { pets: [] });
        return;
      }
      const legacy = services.legacy?.runtimeDataStore;
      // Never import the anonymous global mirror or another account's inventory.
      if (!legacy || legacy.getAuthSession()?.currentUser?.id !== ownerAccountId) return;
      const inventory = legacy.getInventorySnapshot();
      service.importLegacyInventory(ownerAccountId, inventory);
    }
    const api = {
      db: services.db,
      listPets(ownerAccountId) { ensureImported(ownerAccountId); return service.snapshot(ownerAccountId).data.pets.filter(pet => pet.resource.kind === '2d'); },
      getPet(ownerAccountId, petId) {
        ensureImported(ownerAccountId); const pet = service.requirePet(ownerAccountId, petId);
        if (pet.resource.kind !== '2d') throw Object.assign(new Error('旧伙伴原始记录已保留，本版使用 2D 伙伴'), { code: 'RESOURCE_UNAVAILABLE' });
        return pet;
      },
      getSelections(ownerAccountId) { return service.selections(ownerAccountId); },
      applyGrowthInTransaction(ownerAccountId, input) {
        const result = service.applyGrowthInTransaction(ownerAccountId, input);
        changed(ownerAccountId);
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
        list(_payload, context) { ensureImported(context.ownerAccountId); desktop?.sync(); return service.snapshot(context.ownerAccountId); },
        get(payload, context) { const pet = api.getPet(context.ownerAccountId, payload.petId); return { ok: true, data: pet, revision: pet.revision }; },
        desktopInput(payload, context) {
          if (!desktop) return { ok: false, code: 'DESKTOP_UNAVAILABLE', message: '请在灵境桌面应用中操作伙伴' };
          return desktop.handleInput(context.ownerAccountId, payload);
        },
        adopt: execute('adopt'), rename: execute('rename'), desktop: execute('updateDesktop'),
        select: execute('select'), interact: execute('interact')
      },
      dispose() { for (const dispose of disposers) dispose(); desktop?.dispose(); }
    };
  }
};
