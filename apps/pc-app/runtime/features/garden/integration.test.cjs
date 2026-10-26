"use strict";
const test = require('node:test'); const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'); const { mkdtempSync } = require('node:fs'); const { tmpdir } = require('node:os'); const { join, resolve } = require('node:path'); const { randomUUID } = require('node:crypto');
const { GardenService } = require('./service.cjs'); const { companionAdapter } = require('./testing-adapter.cjs');
const { createServices } = require('../../core/services.cjs');
const { TerritoryService, validFix } = require('./territories.cjs'); const { createGardenBackupAdapter } = require('./backup.cjs'); const { reconcileSeeds } = require('./settlements.cjs');
const companionRoot = process.env.GARDEN_COMPANIONS_DIR || resolve(__dirname, '../companions'); const battleRoot = process.env.GARDEN_BATTLE_DIR || resolve(__dirname, '../battle');
const { CompanionsService } = require(join(companionRoot, 'service.cjs')); const { migrateCompanions } = require(join(companionRoot, 'migrations.cjs'));
const { BattleFeatureService } = require(join(battleRoot, 'service.cjs')); const battleMigrations = require(join(battleRoot, 'migrations.cjs'));
function fixture() {
  const profile = mkdtempSync(join(tmpdir(), 'garden-integration-'));
  const db = new DatabaseSync(join(profile, 'actual.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
  db.transaction = fn => (...args) => { const key = `test_${randomUUID().replaceAll('-', '')}`; db.exec(`SAVEPOINT ${key}`); try { const result = fn(...args); db.exec(`RELEASE ${key}`); return result; } catch (error) { db.exec(`ROLLBACK TO ${key}; RELEASE ${key}`); throw error; } };
  migrateCompanions(db); for (const migration of battleMigrations) db.exec(migration.sql);
  const companions = new CompanionsService({ db }); const owner = 'territory-check';
  const pet = companions.adopt(owner, { actionId: 'adopt-2d', name: '守护伙伴', templateId: 'big-fish-gentle', showOnDesktop: false }).data.pet;
  // Use the production event bus, including its unsubscribe contract. These
  // local domain/OS-fix fixtures do not log in or invoke cloud transports.
  const services = createServices({ db, legacy: {}, paths: { userData: profile } });
  services.session.setAdapter({ getCurrentUser: () => ({ id: owner, ownerAccountId: owner, provider: 'local' }) });
  const companionsApi = { db, getPet: (who, id) => companions.requirePet(who, id), listPets: who => companions.snapshot(who).data.pets, applyGrowthInTransaction: (who, input) => companions.applyGrowthInTransaction(who, input) };
  services.provide('companions', companionsApi);
  const battle = new BattleFeatureService(services); services.provide('battle', { getOutcome: input => battle.getOutcome(input), beginTerritoryChallenge: input => battle.beginTerritoryChallenge(input) });
  services.invoke = async (feature, command, input) => feature === 'battle' ? { ok: true, data: battle[command](input, { ownerAccountId: owner }) } : { ok: false };
  const garden = new GardenService({ db, companions: companionAdapter(companionsApi, db) }); const territories = new TerritoryService(services); garden.territories = territories;
  // A deterministic OS-fix fixture tests validation. This is not evidence of real GPS access.
  const fix = { source: 'os', coordinateSystem: 'wgs84', lat: 31.232, lng: 121.472, timestampMs: Date.now(), accuracyMeters: 12 };
  services.provide('discovery', { location: { snapshot: () => ({ fix }) } }); services.provide('territories', territories);
  return { db, owner, pet, services, garden, territories, battle, fix, close() { battle.dispose(); db.close(); } };
}
async function finishBattle(f, session) {
  // Fixed dice exercise an actual winning sequence and its real persisted
  // receipt. This is a domain fixture, not a claim of live PvP or GPS success.
  const originalRandom=Math.random;Math.random=()=>.4;
  try {for (let i = 0; i < 150 && session.status === 'active'; i++) session = await f.battle.act({ sessionId: session.id, actionId: `act:${session.id}:${i}`, expectedRound: session.snapshot.round + 1, action: session.snapshot.player.anger >= 50 ? 'ultimate' : 'normal_attack' }, { ownerAccountId: f.owner });}
  finally{Math.random=originalRandom;}
  assert.equal(session.status, 'finished'); return session;
}
test('a real battle receipt repairs seed settlement exactly once on garden open', async () => {
  const f = fixture(); const context = { ownerAccountId: f.owner };
  const session = await f.battle.startTraining({ actionId: 'start-training', petId: f.pet.petId, enemyElement: 'wood' }, context);
  const result = await finishBattle(f, session); assert.equal(result.reward.applied, true);
  const before = f.garden.snapshot(context).data.items.filter(i => i.category === 'seed').reduce((sum, item) => sum + item.quantity, 0);
  await reconcileSeeds(f.services, f.garden, context); await reconcileSeeds(f.services, f.garden, context);
  const after = f.garden.snapshot(context).data.items.filter(i => i.category === 'seed').reduce((sum, item) => sum + item.quantity, 0);
  assert.equal(after - before, 2); assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_reward_receipts').get().n, 1); f.close();
});
test('territory challenge uses the real battle outcome and retains a personal crop', async () => {
  const f = fixture(); const context = { ownerAccountId: f.owner }; f.garden.snapshot(context);
  const territory = f.territories.discoverAtSystemFix(f.fix);
  const plant = f.garden.plant(context, { actionId: 'personal-plant', expectedRevision: 0, plotId: 'plot-1', cropType: 'carrot' }); assert.equal(plant.ok, true);
  const challenge = f.garden.command(context, 'territoryChallenge', { actionId: 'invade', expectedRevision: 1 }, () => f.territories.startChallenge({ ownerAccountId: f.owner, petId: f.pet.petId, territoryId: territory.id, expectedTerritoryRevision: territory.revision, actionId: 'invade' })); assert.equal(challenge.ok, true, JSON.stringify(challenge));
  assert.equal(f.territories.dailyRemaining(f.owner), 1);
  const session = await finishBattle(f, f.battle.store.session(f.owner, challenge.data.sessionId));
  assert.equal(session.winner,'player');
  const settled = f.garden.command(context, 'territorySettle', { actionId: 'settle', expectedRevision: 2 }, () => f.territories.settleChallenge({ ownerAccountId: f.owner, sessionId: session.id })); assert.equal(settled.ok, true);
  const bonus = f.territories.applyCaptureBonus({ ownerAccountId: f.owner, territoryId: territory.id, baseReward: 12 }); assert.equal(bonus.multiplier, session.winner === 'player' ? 2 : 1);
  assert.equal(f.garden.snapshot(context).data.plots[0].cropType, 'carrot');
  if (session.winner === 'player') {
    assert.equal(f.garden.garrison(context, { actionId: 'guard', expectedRevision: 3, territoryId: territory.id, expectedTerritoryRevision: 2, petId: f.pet.petId }).ok, true);
    f.territories.importRecord({ ...f.territories.get(territory.id), ownerAccountId: 'new-owner', revision: 3 });
    assert.equal(f.garden.snapshot(context).data.plots[0].cropType, 'carrot'); assert.equal(f.garden.snapshot(context).data.territories[0].garrisonPetId, null);
  }
  assert.throws(() => validFix({ ...f.fix, source: 'demo' }, Date.now()), { code: 'REAL_LOCATION_REQUIRED' }); f.close();
});
test('territory refuses the OS default location and shares discovery boundary rules', () => {
  const f = fixture();
  assert.throws(() => f.territories.discoverAtSystemFix({...f.fix,positionSource:'Default'}),{code:'LOCATION_DEFAULT_POSITION'});
  assert.equal(f.territories.listForOwner().length,0);
  const region=f.territories.discoverAtSystemFix(f.fix),{inside}=require('./territories.cjs');
  assert.equal(inside(region.boundary[0],region.boundary),true);
  assert.equal(inside({lat:0,lng:0},region.boundary),false);f.close();
});

test('an abandoned territory challenge retains its attempt and history without blocking the remaining challenge',async()=>{
  const f=fixture(),context={ownerAccountId:f.owner},originalGet=f.services.get,providers=new Map();
  f.services.get=name=>providers.has(name)?providers.get(name):originalGet(name);
  f.services.provide=(name,value)=>providers.set(name,value);
  const registered=require('./index.cjs').register(f.services);
  try{
    const initial=await registered.commands.snapshot({},context),territory=f.territories.discoverAtSystemFix(f.fix);
    const start=async actionId=>registered.commands.territoryChallenge({actionId,sessionOwnerAccountId:f.owner,expectedRevision:(await registered.commands.snapshot({},context)).revision,petId:f.pet.petId,territoryId:territory.id,expectedTerritoryRevision:territory.revision},context);
    const first=await start('cancelled-territory-start');assert.equal(first.ok,true,JSON.stringify(first));
    const active=await registered.commands.snapshot({},context);
    assert.deepEqual(active.data.territoryChallenges,[{sessionId:first.data.sessionId,territoryId:territory.id,status:'active'}]);
    assert.equal(active.data.remainingInvasions,1);
    const abandoned=await f.battle.leave({sessionId:first.data.sessionId},context);assert.equal(abandoned.status,'abandoned');
    const history=f.db.prepare('SELECT * FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(f.owner,first.data.sessionId);
    const logs=f.db.prepare('SELECT * FROM garden_territory_logs ORDER BY id').all();
    const territoryRow=f.db.prepare('SELECT * FROM garden_territory_records WHERE territory_id=?').get(territory.id);
    for(let i=0;i<2;i++){
      const after=await registered.commands.snapshot({},context);
      assert.deepEqual(after.data.territoryChallenges,[]);assert.equal(after.data.remainingInvasions,1);
      assert.deepEqual(after.data.items,initial.data.items);
      assert.deepEqual(f.db.prepare('SELECT * FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(f.owner,first.data.sessionId),history);
      assert.deepEqual(f.db.prepare('SELECT * FROM garden_territory_logs ORDER BY id').all(),logs);
      assert.deepEqual(f.db.prepare('SELECT * FROM garden_territory_records WHERE territory_id=?').get(territory.id),territoryRow);
      assert.equal(f.battle.snapshot({sessionId:first.data.sessionId},context).status,'abandoned');
    }
    assert.equal(history.settled,0);assert.equal(history.result_json,null);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM battle_reward_receipts').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_reward_receipts').get().n,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_garrisons').get().n,0);
    const second=await start('remaining-territory-start');assert.equal(second.ok,true,JSON.stringify(second));
    assert.notEqual(second.data.sessionId,first.data.sessionId);
    const remaining=await registered.commands.snapshot({},context);
    assert.deepEqual(remaining.data.territoryChallenges,[{sessionId:second.data.sessionId,territoryId:territory.id,status:'active'}]);
    assert.equal(remaining.data.remainingInvasions,0);
    assert.equal((await start('over-quota-territory-start')).code,'DAILY_INVASIONS_USED');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_territory_challenges').get().n,2);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_territory_logs').get().n,2);
  }finally{registered.dispose();f.close();}
});
test('account backup cannot merge a harvest action with an older planted plot', () => {
  const f = fixture(); const context = { ownerAccountId: f.owner }; f.garden.snapshot(context);
  const adapter = createGardenBackupAdapter(f.db); const before = adapter.export(f.owner);
  f.garden.plant(context, { actionId: 'separate-progress', expectedRevision: 0, plotId: 'plot-1', cropType: 'rice' });
  assert.throws(() => adapter.restore(f.owner, before, 'merge'), { code: 'GARDEN_BACKUP_CONFLICT' });
  assert.equal(f.garden.snapshot(context).data.plots[0].cropType, 'rice');
  const same = adapter.export(f.owner); assert.doesNotThrow(() => adapter.restore(f.owner, same, 'merge'));
  f.db.exec('BEGIN IMMEDIATE'); adapter.restore(f.owner, before, 'replace'); f.db.exec('COMMIT'); assert.equal(f.garden.snapshot(context).data.plots[0].cropType, null); f.close();
});

test('public battle-context settlement keeps its original receipt after another inventory transaction',async()=>{
  const f=fixture(),context={ownerAccountId:f.owner},originalGet=f.services.get,providers=new Map();
  f.services.get=name=>providers.has(name)?providers.get(name):originalGet(name);
  f.services.provide=(name,value)=>providers.set(name,value);
  const registered=require('./index.cjs').register(f.services),api=f.services.get('garden');
  try{
    const initial=await registered.commands.snapshot({},context),territory=f.territories.discoverAtSystemFix(f.fix);
    const started=await registered.commands.territoryChallenge({actionId:'shared-context-start',sessionOwnerAccountId:f.owner,expectedRevision:initial.revision,petId:f.pet.petId,territoryId:territory.id,expectedTerritoryRevision:territory.revision},context);
    assert.equal(started.ok,true,JSON.stringify(started));
    await finishBattle(f,f.battle.snapshot({sessionId:started.data.sessionId},context));
    assert.deepEqual((await registered.commands.snapshot({},context)).data.territoryChallenges,[{sessionId:started.data.sessionId,territoryId:territory.id,status:'finished'}]);
    assert.equal(api.getBattleContext({...context,sessionId:started.data.sessionId}).settled,false);
    assert.equal(api.getBattleContext({...context,sessionId:started.data.sessionId}).action,'territory');assert.equal(api.getBattleContext({...context,sessionId:started.data.sessionId}).returnTo,'/garden');
    assert.throws(()=>api.getBattleContext({ownerAccountId:'another-owner',sessionId:started.data.sessionId}),{code:'SESSION_CHANGED'});
    const input={...context,sessionId:started.data.sessionId,actionId:'shared-context-confirm'};
    const settled=await api.settleBattleContext(input);assert.equal(settled.ok,true,JSON.stringify(settled));
    assert.equal(settled.data.resultPath,'/garden');
    assert.equal(api.getBattleContext({...context,sessionId:input.sessionId}).settled,true);
    const current=await registered.commands.snapshot({},context);
    const planted=await registered.commands.plant({actionId:'later-personal-plant',sessionOwnerAccountId:f.owner,expectedRevision:current.revision,plotId:'plot-1',cropType:'carrot'},context);assert.equal(planted.ok,true);
    const before=await registered.commands.snapshot({},context),territoryRevision=f.territories.get(territory.id).revision;
    const replay=await api.settleBattleContext(input);assert.equal(replay.ok,true);assert.equal(replay.replayed,true);
    const after=await registered.commands.snapshot({},context);assert.deepEqual(after.data.items,before.data.items);assert.equal(after.revision,before.revision);assert.equal(f.territories.get(territory.id).revision,territoryRevision);
    assert.equal((await api.settleBattleContext({...input,sessionId:'different-battle'})).code,'ACTION_ID_REUSED');
  }finally{registered.dispose();f.close();}
});
