"use strict";
const { GardenService } = require("./service.cjs");
const { migrations } = require("./migrations.cjs");
const { reconcileSeeds } = require("./settlements.cjs");
const { TerritoryService } = require("./territories.cjs");
const { createGardenBackupAdapter } = require('./backup.cjs');
const { CloudGardenAuthority } = require('./cloud-authority.cjs');
const { createOwnerMigration } = require('./identity.cjs');
const { createTerritorySerialViews } = require('./battle-serial-views.cjs');

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
    const cloud = new CloudGardenAuthority(services, service);
    const serialViews = createTerritorySerialViews(services, cloud);
    const identity = createOwnerMigration(services,service);
    services.provide("garden", {
      service,
      snapshot: context => service.snapshot(context),
      applyCloudReadback:(owner,remote)=>cloud.applyReadback({ownerAccountId:owner},remote),
      refreshCloud:owner=>cloud.snapshot({ownerAccountId:owner}),
      territories,
      getBattleSerialViews:input=>serialViews.read(input),
      cloudBattles:{owns:(payload,context)=>cloud.ownsBattle(payload,context),invoke:(name,payload,context)=>cloud.battleCommand(name,payload,context)},
      migrateOwnerAlias:context=>identity.migrate(context),
      getBattleContext:input=>{
        if(input.ownerAccountId!==services.session.getOwnerAccountId())throw Object.assign(new Error('账号已切换'),{code:'SESSION_CHANGED'});
        if(cloud.ownsBattle(input,input))return cloud.battleCommand('context',input,input);
        const challenge=territories.challengeForOwner(input);
        return challenge?{...challenge,returnTo:'/garden',resultPath:'/garden',action:'territory',gardenRevision:service.snapshot(input).revision}:null;
      },
      settleBattleContext:async input=>{
        const owner=input.ownerAccountId;
        if(owner!==services.session.getOwnerAccountId())return {ok:false,code:'SESSION_CHANGED',message:'账号已切换'};
        if(cloud.ownsBattle(input,input))try{return {ok:true,data:await cloud.settleContext(input,input)};}catch(error){return service.failure(error,owner);}
        const row=services.db.prepare('SELECT payload_json FROM garden_outbox WHERE owner_account_id=? AND action_id=?').get(owner,input.actionId);
        const previous=row?JSON.parse(row.payload_json):null;
        if(previous&&(previous.kind!=='territorySettle'||previous.input.sessionId!==input.sessionId))return {ok:false,code:'ACTION_ID_REUSED',message:'操作编号已使用'};
        const payload=previous?.input||{sessionId:input.sessionId,actionId:input.actionId,sessionOwnerAccountId:owner,expectedRevision:service.snapshot({ownerAccountId:owner}).revision};
        const result=await commands.territorySettle(payload,{ownerAccountId:owner});
        return result.ok?{...result,data:{...result.data,resultPath:'/garden'}}:result;
      },
      // Trusted callers can include this in their own synchronous settlement transaction.
      grantSeeds: (context, input, verifiedReceipt) => {
        if (!cloud.isCloud(context)) return service.grantSeeds(context,input,verifiedReceipt);
        if (!verifiedReceipt || verifiedReceipt.ownerAccountId!==context.ownerAccountId || verifiedReceipt.id!==input.receiptId || verifiedReceipt.source!==input.source || verifiedReceipt.eligible!==true) return {ok:false,code:'UNVERIFIED_REWARD',message:'需要已结算的主进程凭据'};
        // The caller stores this pending marker in its settlement transaction.
        // It is not an inventory grant; snapshot reconciles server receipts later.
        return {ok:true,pending:true,data:{pending:true,status:'awaiting_server',source:input.source,receiptId:input.receiptId,message:'种子等待云端确认，未在本机重复发放'}};
      }
    });
    const commands = Object.fromEntries(["plant", "harvest", "craft", "feed", "garrison"].map(command => [command, (payload, context) => service[command](context, payload)]));
    commands.snapshot = async (_payload, context) => {
      try{identity.migrate(context);}catch(error){return service.failure(error,context.ownerAccountId);}
      if (cloud.isCloud(context)) {
        try { return await cloud.snapshot(context); }
        catch (error) {
          if (services.session.getOwnerAccountId() !== context.ownerAccountId) return {ok:false,code:'SESSION_CHANGED',message:'账号已切换，请重新打开菜园'};
          // A failed first cloud read cannot mint a local starter inventory.
          if (!services.db.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(context.ownerAccountId)) return service.failure(error,context.ownerAccountId);
          const cached = service.snapshot(context);
          if (cached.ok) cached.data.sync = { mode: 'cached', pending: 0, conflicts: error.code === 'CLOUD_LOCAL_CONFLICT' ? 1 : 0, issue: error.message || '云端菜园尚不可用' };
          return cached;
        }
      }
      await reconcileSeeds(services, service, context);
      if (services.session.getOwnerAccountId() !== context.ownerAccountId) return {ok:false,code:'SESSION_CHANGED',message:'账号已切换，请重新打开菜园'};
      const snapshot = service.snapshot(context);
      if (snapshot.ok) {
        snapshot.data.remainingInvasions = territories.dailyRemaining?.(context.ownerAccountId) ?? 2;
        if(territories.scenario)snapshot.data.scenario=territories.scenario.descriptor;
        const discovery = services.get('discovery');
        if (discovery?.map?.project) snapshot.data.territories = snapshot.data.territories.map(t => ({ ...t, mapBoundary: t.boundary?.map(point => discovery.map.project(point)) }));
        // Leaving consumes the original attempt but cannot be resumed or settled.
        // Keep its durable history; only omit it from the actionable projection.
        snapshot.data.territoryChallenges = services.db.prepare('SELECT battle_id sessionId,territory_id territoryId FROM garden_territory_challenges WHERE owner_account_id=? AND settled=0').all(context.ownerAccountId)
          .map(challenge=>({...challenge,status:services.get('battle')?.getOutcome?.({ownerAccountId:context.ownerAccountId,sessionId:challenge.sessionId})?.session?.status}))
          .filter(challenge=>challenge.status!=='abandoned');
      }
      return snapshot;
    };
    commands.territoryLocate = (payload, context) => service.command(context, 'territoryLocate', payload, () => territories.discoverAtSystemFix(territories.currentFix()));
    commands.territoryChallenge = (payload, context) => service.command(context, 'territoryChallenge', payload, ({ owner, actionId }) => territories.startChallenge({ ...payload, ownerAccountId: owner, actionId }));
    commands.territorySettle = (payload, context) => service.command(context, 'territorySettle', payload, ({ owner }) => territories.settleChallenge({ ...payload, ownerAccountId: owner }));
    for (const [kind, local] of Object.entries(commands)) if (kind !== 'snapshot') commands[kind] = async (payload, context) => {
      // This value is a stale-view guard, never an authority source. The owner
      // still comes solely from the verified main-process session context.
      if (payload?.sessionOwnerAccountId !== context.ownerAccountId) return {ok:false,code:'SESSION_CHANGED',message:'账号已切换，请刷新菜园后再操作'};
      try{identity.migrate(context);}catch(error){return service.failure(error,context.ownerAccountId);}
      if (!cloud.isCloud(context)) return local(payload, context);
      try { return await cloud.command(context, kind, payload); } catch (error) { return service.failure(error,context.ownerAccountId); }
    };
    return { commands, dispose() { removeBackupAdapter?.(); } };
  }
};
