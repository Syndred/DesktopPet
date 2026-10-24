const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { createServices } = require('../../../core/services.cjs');
const { ResourcesService } = require('../../resources/service.cjs');
const { migrations } = require('../../resources/repository.cjs');
const { registerRoster } = require('../../resources/roster.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService } = require('../service.cjs');
const { createCompanionPlayback } = require('../playback.cjs');

test('actual resource clips dispatch to one owner/pet only; replay and an in-flight account change cannot play twice or cross owners', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'lingjing-playback-'));
  const db = new DatabaseSync(join(folder, 'shared.sqlite')); migrateCompanions(db);
  for (const migration of migrations) db.exec(migration.sql);
  let owner = 'verified-owner-a';
  const services = createServices({ db, legacy: {}, paths: { userData: folder }, windows: {} });
  services.session.setAdapter({ getCurrentUser: () => ({ id: owner }) });
  const resources = new ResourcesService({ db, storageRoot: join(folder, 'resources') }); await resources.seed();
  await registerRoster(resources);
  services.provide('resources', resources);
  const service = new CompanionsService({ db });
  const pets = ['鱼丸', '同形象另一只'].map((name, index) => service.adopt(owner, { actionId: `adopt-${index}`, templateId: 'big-fish-gentle', name, showOnDesktop: false }).data.pet);
  const playback = createCompanionPlayback({ services, service });
  const events = []; const stop = services.events.on('companions:action', event => events.push(event));
  try {
    const input = { actionId: 'play-1', petId: pets[0].petId, expectedRevision: 1, action: 'attack' };
    assert.equal((await playback.perform(owner, input)).ok, true);
    assert.equal(events.length, 1); assert.equal(events[0].petId, pets[0].petId);
    assert.equal(events[0].ownerAccountId, owner); assert.equal(events[0].resourceId, pets[0].resource.resourceId);
    assert.equal(events[0].action, 'attack'); assert.ok(events[0].expiresAt > events[0].startedAt);
    assert.equal((await playback.perform(owner, input)).duplicate, true); assert.equal(events.length, 1);
    await assert.rejects(playback.perform(owner, { ...input, petId: pets[1].petId }), error => error.code === 'ACTION_ID_CONFLICT');
    await assert.rejects(playback.perform(owner, { ...input, actionId: 'unsupported', action: 'nonexistent' }), error => error.code === 'ACTION_UNAVAILABLE');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('unsupported').n, 0);
    service.updateDesktop(owner, { actionId: 'position-saved', petId: pets[0].petId, position: { x: 100, y: 100, displayId: 'main' } });
    assert.equal((await playback.perform(owner, { ...input, actionId: 'pose-after-position-save', resourceId: pets[0].resource.resourceId })).ok, true);
    assert.equal(events.length, 2);
    const inFlight = playback.perform(owner, { actionId: 'changed-session', petId: pets[1].petId, action: 'hit' });
    owner = 'verified-owner-b';
    await assert.rejects(inFlight, error => error.code === 'SESSION_CHANGED'); assert.equal(events.length, 2);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('changed-session').n, 0);
    await assert.rejects(playback.perform(owner, { actionId: 'foreign', petId: pets[0].petId, action: 'hit' }), error => error.code === 'PET_NOT_FOUND');
    owner = 'verified-owner-a';
    const food = { actionId: 'garden:committed-food', petId: pets[0].petId, effect: { satiety: 10 } };
    db.exec('SAVEPOINT garden_outer');
    playback.afterGrowthCommit(owner, food, service.applyGrowthInTransaction(owner, food));
    db.exec('ROLLBACK TO SAVEPOINT garden_outer; RELEASE SAVEPOINT garden_outer');
    await new Promise(resolve => setImmediate(resolve)); assert.equal(events.length, 2);
    const eaten = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { off(); reject(new Error('A committed food action did not reach playback')); }, 3000);
      const off = services.events.on('companions:action', event => { if (event.action === 'eat') { clearTimeout(timeout); off(); resolve(event); } });
    });
    playback.afterGrowthCommit(owner, food, service.applyGrowthInTransaction(owner, food));
    const meal = await eaten; assert.equal(meal.petId, pets[0].petId); assert.equal(events.length, 3);
    playback.afterGrowthCommit(owner, food, service.applyGrowthInTransaction(owner, food));
    await new Promise(resolve => setImmediate(resolve)); assert.equal(events.length, 3);
    assert.equal(service.requirePet(owner, pets[0].petId).growth.satiety, 70);
    assert.equal(service.requirePet(owner, pets[1].petId).growth.satiety, 60);
  } finally {
    stop(); playback.dispose(); db.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith('lingjing-playback-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
