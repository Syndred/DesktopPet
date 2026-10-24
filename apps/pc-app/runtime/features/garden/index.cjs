"use strict";
const { GardenService } = require("./service.cjs");
const { migrations } = require("./migrations.cjs");

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
    services.provide("garden", {
      service,
      snapshot: context => service.snapshot(context),
      // Trusted callers can include this in their own synchronous settlement transaction.
      grantSeeds: (context, input, verifiedReceipt) => service.grantSeeds(context, input, verifiedReceipt)
    });
    return { commands: Object.fromEntries(["snapshot", "plant", "harvest", "craft", "feed", "garrison"].map(command => [command, (payload, context) => command === "snapshot" ? service.snapshot(context) : service[command](context, payload)])) };
  }
};
