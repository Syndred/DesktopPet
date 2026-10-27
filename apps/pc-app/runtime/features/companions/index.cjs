const { migrations } = require('./migrations.cjs');
const { CompanionsService, toLegacyPet } = require('./service.cjs');
const { createCompanionOwnerMigration } = require('./identity.cjs');
const { createCompanionPlayback } = require('./playback.cjs');
const { companionCombatProfile } = require('./combat-profile.cjs');
const { createCompanionBackupAdapter } = require('./backup.cjs');
const { CloudCompanionAuthority } = require('./cloud-authority.cjs');
const { companionIdentity } = require('./display-identity.mjs');
const { createGlobalSerialCache } = require('./global-serial-cache.cjs');
const { projectDesktopDisplay } = require('./desktop-display.cjs');
const { DeviceDesktop } = require('./device-desktop.cjs');
const { join } = require('node:path');

module.exports = {
  id: 'companions', migrations,
  register(services) {
    const serialCache=createGlobalSerialCache({directory:services.paths?.userData?join(services.paths.userData,'accounts'):null,safeStorage:services.safeStorage});
    let devices;
    const service = new CompanionsService({ db: services.db,projectIdentity:pet=>serialCache.project(devices?devices.project(pet):pet) });
    const backupAdapter=createCompanionBackupAdapter(services.db);
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
    const cloud=new CloudCompanionAuthority(services,service,backupAdapter,changed,serialCache);
    devices=new DeviceDesktop({db:services.db,getPet:(owner,id)=>service.requirePet(owner,id),listPets:owner=>service.snapshot(owner).data.pets,enabled:owner=>cloud.enabled(owner)});
    cloud.deviceDesktop=devices;
    const initialOwner=services.session.getOwnerAccountId();if(initialOwner)devices.capture(initialOwner);
    const ownerMigration = createCompanionOwnerMigration(services, changed);
    function upgradeBuiltins(ownerAccountId) {
      if(cloud.enabled(ownerAccountId))return;
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
      // Accounts owns registration/legacy-envelope normalization and transport.
      backupAdapter,
      isCloudOwner:owner=>cloud.enabled(owner),
      refreshCloud:(owner,options)=>{devices.capture(owner);return cloud.refresh(owner,options);},
      cloudStatus:owner=>cloud.state(owner),
      readCloudOwnedPetIds:owner=>cloud.readOwnedPetIds(owner),
      applyCloudReadback:(owner,remote)=>cloud.apply(owner,remote),
      persistDesktopPosition(owner,input){const result=devices.update(owner,input);changed(owner);return result;},
      hasPendingRecallAll(){return false;},
      migrateOwnerAlias: ownerMigration.migrate,
      listPets(ownerAccountId) { ensureImported(ownerAccountId);return service.readSnapshot(ownerAccountId).data.pets.filter(pet => pet.resource.kind === '2d'); },
      getPet(ownerAccountId, petId) {
        ensureImported(ownerAccountId); const pet = service.readPet(ownerAccountId, petId);
        if (pet.resource.kind !== '2d') throw Object.assign(new Error('旧伙伴原始记录已保留，本版使用 2D 伙伴'), { code: 'RESOURCE_UNAVAILABLE' });
        return pet;
      },
      getSelections(ownerAccountId) { return service.selections(ownerAccountId); },
      // Main-only identity reads must not trigger legacy import/resource upgrades.
      readIdentityPet(ownerAccountId, petId) { return service.readPet(ownerAccountId, petId); },
      getDisplayIdentity(ownerAccountId, petId) { return companionIdentity(api.getPet(ownerAccountId, petId)); },
      getCombatProfile(ownerAccountId, petId) { return companionCombatProfile(api.getPet(ownerAccountId, petId), services.get('battle')?.getRules()); },
      listTemplates() { return service.templates(); },
      playAction(ownerAccountId, input) { return playback.play(ownerAccountId, api.getPet(ownerAccountId, input.petId), input.action, input.actionId); },
      applyGrowthInTransaction(ownerAccountId, input) {
        if(cloud.enabled(ownerAccountId))throw Object.assign(new Error('云端成长请通过已验证的战斗或菜园结算。'),{code:'CLOUD_SETTLEMENT_REQUIRED'});
        const result = service.applyGrowthInTransaction(ownerAccountId, input);
        changed(ownerAccountId);
        playback.afterGrowthCommit(ownerAccountId, input, result);
        return result;
      },
      createCapturedInstance(ownerAccountId, input) {
        if(cloud.enabled(ownerAccountId))throw Object.assign(new Error('云端捕捉请先读回服务端伙伴凭据。'),{code:'CLOUD_CAPTURE_RECEIPT_REQUIRED'});
        ensureImported(ownerAccountId);
        const result = service.createCapturedInstance(ownerAccountId, input);
        changed(ownerAccountId);
        return result;
      },
      select(ownerAccountId, input) { if(cloud.enabled(ownerAccountId)){const result=cloud.execute(ownerAccountId,'select',input);void result.catch(()=>{});return result;}const result = service.select(ownerAccountId, input); changed(ownerAccountId); return result; },
      showAll(ownerAccountId, actionId) {
        const result = cloud.enabled(ownerAccountId) ? devices.showAll(ownerAccountId, actionId) : service.showAll(ownerAccountId, actionId);
        changed(ownerAccountId); return result;
      },
      recallAll(ownerAccountId, actionId) {
        if(cloud.enabled(ownerAccountId)){const result=devices.recallAll(ownerAccountId,actionId);changed(ownerAccountId);return result;}
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
    const backups=services.get('backups')||services.get('accounts')?.backups;
    if(backups?.normalizeData){disposers.push(backups.register(backupAdapter));disposers.push(backups.register(devices.backup()));}
    disposers.push(services.events.on('accounts:save-restored', event => {
      if (event?.ownerAccountId === services.session.getOwnerAccountId()) changed(event.ownerAccountId);
    }));
    for(const event of ['accounts:changed','accounts:session-changed'])disposers.push(services.events.on(event,()=>{
      const owner=services.session.getOwnerAccountId();
      if(owner&&cloud.enabled(owner))void api.refreshCloud(owner).catch(()=>{});
    }));
    // Electron is required lazily, so domain/migration checks also run under Node.
    if (process.versions.electron && process.type === 'browser') {
      const { createDesktopWindowManager } = require('./windows.cjs');
      desktop = createDesktopWindowManager({ services, service, ensureImported, changed });
      for (const event of ['accounts:changed', 'session:changed', 'auth:changed', 'accounts:session-changed']) disposers.push(services.events.on(event, () => desktop.sync()));
      desktop.sync();
    }
    const execute = (method,command=method) => (payload, context) => {
      ensureImported(context.ownerAccountId);
      if(cloud.enabled(context.ownerAccountId)){
        if(command==='desktop'){const result=devices.update(context.ownerAccountId,payload);changed(context.ownerAccountId);return result;}
        devices.capture(context.ownerAccountId);
        return cloud.execute(context.ownerAccountId,command,payload).then(result=>{
          if(method==='adopt'&&result?.data?.pet&&payload.showOnDesktop!==false){devices.update(context.ownerAccountId,{actionId:`device-adopt:${payload.actionId}`,petId:result.data.pet.petId,visible:true});changed(context.ownerAccountId);}
          if(result?.data?.pet)result={...result,data:{...result.data,pet:devices.project(result.data.pet)}};return result;
        });
      }
      const result = service[method](context.ownerAccountId, payload);
      changed(context.ownerAccountId);
      return result;
    };
    return {
      commands: {
        async list(_payload, context) {
          await services.get('resources')?.ready;
          const current = () => services.session.getOwnerAccountId() === context.ownerAccountId;
          const switched = () => ({ ok: false, code: 'SESSION_CHANGED', message: '账号已切换，请重新打开此页面。' });
          if (!current()) return switched();
          ensureImported(context.ownerAccountId);
          if (cloud.enabled(context.ownerAccountId) && !cloud.busy(context.ownerAccountId)) await api.refreshCloud(context.ownerAccountId,{resume:false}).catch(() => {});
          if (!current()) return switched();
          desktop?.sync();
          const result = service.readSnapshot(context.ownerAccountId);
          result.data.desktopDisplay = projectDesktopDisplay({ ownerAccountId: context.ownerAccountId,
            currentOwnerAccountId: services.session.getOwnerAccountId(), pets: result.data.pets,
            windows: desktop?.inspect(), host: services.get('accounts')?.host?.status?.() });
          if (cloud.enabled(context.ownerAccountId)) result.data.sync = cloud.state(context.ownerAccountId);
          return result;
        },
        async get(payload, context) { await services.get('resources')?.ready;if(cloud.enabled(context.ownerAccountId)&&!cloud.busy(context.ownerAccountId))await cloud.refresh(context.ownerAccountId,{resume:false}).catch(()=>{});const pet = api.getPet(context.ownerAccountId, payload.petId); return { ok: true, data: pet, revision: pet.revision }; },
        combatProfile(payload, context) { const data = api.getCombatProfile(context.ownerAccountId, payload.petId); return { ok: true, data, revision: service.requirePet(context.ownerAccountId, payload.petId).revision }; },
        identity(payload, context) { const data = api.getDisplayIdentity(context.ownerAccountId, payload.petId); return { ok: true, data, revision: service.requirePet(context.ownerAccountId, payload.petId).revision }; },
        desktopInput(payload, context) {
          if (!desktop) return { ok: false, code: 'DESKTOP_UNAVAILABLE', message: '请在灵境桌面应用中操作伙伴' };
          return desktop.handleInput(context.ownerAccountId, payload);
        },
        adopt: execute('adopt'), rename: execute('rename'), desktop: execute('updateDesktop','desktop'),
        select: execute('select'),
        async interact(payload, context) {
          const result = await execute('interact')(payload, context);
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
          if(cloud.enabled(context.ownerAccountId))return cloud.execute(context.ownerAccountId,'appearance',payload);
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
