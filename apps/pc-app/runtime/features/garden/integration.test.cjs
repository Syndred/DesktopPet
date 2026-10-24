"use strict";
const test = require('node:test'); const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite'); const { mkdtempSync } = require('node:fs'); const { tmpdir } = require('node:os'); const { join, resolve } = require('node:path'); const { randomUUID } = require('node:crypto');
const { GardenService } = require('./service.cjs'); const { companionAdapter } = require('./testing-adapter.cjs');
const { TerritoryService, validFix } = require('./territories.cjs'); const { createGardenBackupAdapter } = require('./backup.cjs'); const { reconcileSeeds } = require('./settlements.cjs');
const companionRoot = process.env.GARDEN_COMPANIONS_DIR || resolve(__dirname, '../companions'); const battleRoot = process.env.GARDEN_BATTLE_DIR || resolve(__dirname, '../battle');
const { CompanionsService } = require(join(companionRoot, 'service.cjs')); const { migrateCompanions } = require(join(companionRoot, 'migrations.cjs'));
const { BattleFeatureService } = require(join(battleRoot, 'service.cjs')); const battleMigrations = require(join(battleRoot, 'migrations.cjs'));
function fixture() {
  const db = new DatabaseSync(join(mkdtempSync(join(tmpdir(), 'garden-integration-')), 'actual.sqlite')); db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON');
  db.transaction = fn => (...args) => { const key = `test_${randomUUID().replaceAll('-', '')}`; db.exec(`SAVEPOINT ${key}`); try { const result = fn(...args); db.exec(`RELEASE ${key}`); return result; } catch (error) { db.exec(`ROLLBACK TO ${key}; RELEASE ${key}`); throw error; } };
  migrateCompanions(db); for (const migration of battleMigrations) db.exec(migration.sql);
  const companions = new CompanionsService({ db }); const owner = 'territory-check';
  const pet = companions.adopt(owner, { actionId: 'adopt-metal', name: '守护伙伴', templateId: 'husky', showOnDesktop: false }).data.pet;
  const registry = new Map(); const services = { db, session: { getOwnerAccountId: () => owner, getCurrentUser: () => ({ id: owner }) }, get: name => registry.get(name), events: { emit() {} }, legacy: {} };
  const companionsApi = { db, getPet: (who, id) => companions.requirePet(who, id), listPets: who => companions.snapshot(who).data.pets, applyGrowthInTransaction: (who, input) => companions.applyGrowthInTransaction(who, input) };
  registry.set('companions', companionsApi);
  const battle = new BattleFeatureService(services); registry.set('battle', { getOutcome: input => battle.getOutcome(input), beginTerritoryChallenge: input => battle.beginTerritoryChallenge(input) });
  services.invoke = async (feature, command, input) => feature === 'battle' ? { ok: true, data: battle[command](input, { ownerAccountId: owner }) } : { ok: false };
  const garden = new GardenService({ db, companions: companionAdapter(companionsApi, db) }); const territories = new TerritoryService(services); garden.territories = territories;
  // A deterministic OS-fix fixture tests validation. This is not evidence of real GPS access.
  const fix = { source: 'os', coordinateSystem: 'wgs84', lat: 31.232, lng: 121.472, timestampMs: Date.now(), accuracyMeters: 12 };
  registry.set('discovery', { location: { snapshot: () => ({ fix }) } }); registry.set('territories', territories);
  return { db, owner, pet, services, garden, territories, battle, fix, close() { battle.dispose(); db.close(); } };
}
async function finishBattle(f, session) {
  for (let i = 0; i < 150 && session.status === 'active'; i++) session = await f.battle.act({ sessionId: session.id, actionId: `act:${session.id}:${i}`, expectedRound: session.snapshot.round + 1, action: session.snapshot.player.anger >= 50 ? 'ultimate' : 'element_attack' }, { ownerAccountId: f.owner });
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
test('account backup cannot merge a harvest action with an older planted plot', () => {
  const f = fixture(); const context = { ownerAccountId: f.owner }; f.garden.snapshot(context);
  const adapter = createGardenBackupAdapter(f.db); const before = adapter.export(f.owner);
  f.garden.plant(context, { actionId: 'separate-progress', expectedRevision: 0, plotId: 'plot-1', cropType: 'rice' });
  assert.throws(() => adapter.restore(f.owner, before, 'merge'), { code: 'GARDEN_BACKUP_CONFLICT' });
  assert.equal(f.garden.snapshot(context).data.plots[0].cropType, 'rice');
  const same = adapter.export(f.owner); assert.doesNotThrow(() => adapter.restore(f.owner, same, 'merge'));
  f.db.exec('BEGIN IMMEDIATE'); adapter.restore(f.owner, before, 'replace'); f.db.exec('COMMIT'); assert.equal(f.garden.snapshot(context).data.plots[0].cropType, null); f.close();
});
