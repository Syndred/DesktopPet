"use strict";
const { GardenService } = require("./service.cjs");
const { migrations } = require("./migrations.cjs");
const { reconcileSeeds } = require("./settlements.cjs");
const { TerritoryService } = require("./territories.cjs");
const { createGardenBackupAdapter } = require('./backup.cjs');

function companionAdapter(services) {
  const get = () => {
    const provided = services.get("companions");
    return provided?.service || provided;
  };
  return {
    listForOwner({ ownerAccountId }) {
      const service = get();
      return service?.listForOwner ? service.listForOwner({ db: services.db, ownerAccountId }) : service?.listPets ? service.listPets(ownerAccountId) : service?.snapshot?.(ownerAccountId)?.data?.pets || [];
    },
    applyFoodInTransaction({ db, ownerAccountId, petId, expectedRevision, effects, actionId, now }) {
      const service = get();
      if (!service) return { ok: false, code: "COMPANIONS_UNAVAILABLE", message: "伙伴养成服务尚未就绪" };
      if (service.db && service.db !== db) throw new Error("Garden and companions must use the same SQLite connection");
      if (service.applyFoodInTransaction) return service.applyFoodInTransaction({ db, ownerAccountId, petId, expectedRevision, effects, actionId, now });
      const result = service.applyGrowthInTransaction?.(ownerAccountId, {
        petId, expectedRevision, actionId: `garden:${actionId}`,
        effect: { satiety: effects.satiety, mood: effects.mood, affinity: effects.intimacy }
      });
      return result?.ok ? { ok: true, pet: result.data.pet } : result || { ok: false, code: "COMPANIONS_UNAVAILABLE", message: "伙伴养成事务尚未就绪" };
    }
  };
}
function territoryAdapter(services) {
  const get = () => services.get("territories") || services.get("discovery")?.territories;
  return {
    listForOwner(input) { return get()?.listForOwner?.(input) || []; },
    getForOwner(input) { return get()?.getForOwner?.(input) || null; },
    gardenBonusForOwner(input) { return get()?.gardenBonusForOwner?.(input) || 0; }
  };
}
module.exports = {
  id: "garden", migrations, companionAdapter,
  register(services) {
    const service = new GardenService({ db: services.db, companions: companionAdapter(services), territories: territoryAdapter(services),
      onCommitted: event => {
        services.events.emit("garden:changed", event);
        if (event.kind === "feed") services.events.emit("companions:changed", event);
      }
    });
    const territories = services.get('territories') || new TerritoryService(services);
    if (!services.get('territories')) services.provide('territories', territories);
    const removeBackupAdapter = services.get('backups')?.register(createGardenBackupAdapter(services.db));
    services.provide("garden", {
      service,
      snapshot: context => service.snapshot(context),
      territories,
      // Trusted callers can include this in their own synchronous settlement transaction.
      grantSeeds: (context, input, verifiedReceipt) => service.grantSeeds(context, input, verifiedReceipt)
    });
    const commands = Object.fromEntries(["plant", "harvest", "craft", "feed", "garrison"].map(command => [command, (payload, context) => service[command](context, payload)]));
    commands.snapshot = async (_payload, context) => {
      await reconcileSeeds(services, service, context);
      const snapshot = service.snapshot(context);
      if (snapshot.ok) {
        snapshot.data.remainingInvasions = territories.dailyRemaining?.(context.ownerAccountId) ?? 2;
        const discovery = services.get('discovery');
        if (discovery?.map?.project) snapshot.data.territories = snapshot.data.territories.map(t => ({ ...t, mapBoundary: t.boundary?.map(point => discovery.map.project(point)) }));
        snapshot.data.territoryChallenges = services.db.prepare('SELECT battle_id sessionId,territory_id territoryId FROM garden_territory_challenges WHERE owner_account_id=? AND settled=0').all(context.ownerAccountId);
      }
      return snapshot;
    };
    commands.territoryLocate = (payload, context) => service.command(context, 'territoryLocate', payload, () => territories.discoverAtSystemFix(territories.currentFix()));
    commands.territoryChallenge = (payload, context) => service.command(context, 'territoryChallenge', payload, ({ owner, actionId }) => territories.startChallenge({ ...payload, ownerAccountId: owner, actionId }));
    commands.territorySettle = (payload, context) => service.command(context, 'territorySettle', payload, ({ owner }) => territories.settleChallenge({ ...payload, ownerAccountId: owner }));
    return { commands, dispose() { removeBackupAdapter?.(); } };
  }
};
