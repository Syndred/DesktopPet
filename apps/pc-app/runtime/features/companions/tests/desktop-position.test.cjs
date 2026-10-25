const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService } = require('../service.cjs');
const { persistLocalDesktopPosition } = require('../windows.cjs');

// Actual SQLite and the production position checkpoint; no Electron window,
// renderer, mouse or keyboard.09 owns the integrated UI acceptance.
function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'lingjing-position-event-'));
  const file = join(folder, 'shared.sqlite');
  const db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL'); migrateCompanions(db);
  const service = new CompanionsService({ db }), owner = 'position-event-owner';
  const pets = [0, 1].map(index => service.adopt(owner, { actionId: `adopt-${index}`, templateId: 'animal-white-fox', name: '小狐', showOnDesktop: index === 0 }).data.pet);
  service.updateDesktop(owner, { actionId: 'wander', petId: pets[0].petId, behavior: 'wander', expectedRevision: pets[0].revision });
  const entry = { owner, pet: service.requirePet(owner, pets[0].petId), positionDirty: true };
  const reader = new DatabaseSync(file); reader.exec('PRAGMA query_only=ON');
  const events = [];
  const changed = who => {
    // A separate read-only connection must already see the committed revision.
    const row = reader.prepare('SELECT revision,data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(who, entry.pet.petId);
    assert.equal(row.revision, entry.pet.revision);
    events.push({ owner: who, pet: JSON.parse(row.data_json) });
  };
  const save = (x = 104, y = 530) => persistLocalDesktopPosition({ entry, service, bounds: { x, y }, displayId: 'primary-125', changed });
  t.after(() => {
    reader.close(); db.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith('lingjing-position-event-'));
    rmSync(folder, { recursive: true, force: true });
  });
  return { db, service, owner, pets, entry, events, save };
}

test('natural-position commit publishes the new CAS revision after commit, allowing the existing UI refresh subscription to receive current behavior state', t => {
  const f = fixture(t), rendered = structuredClone(f.entry.pet);
  const before = f.db.prepare('SELECT revision FROM companion_accounts WHERE owner_account_id=?').get(f.owner).revision;
  assert.equal(f.save(), true); assert.equal(f.events.length, 1);
  const notified = f.events[0]; assert.equal(notified.owner, f.owner); assert.equal(notified.pet.petId, rendered.petId);
  assert.equal(notified.pet.revision, rendered.revision + 1); assert.equal(notified.pet.desktop.behavior, 'wander');
  assert.deepEqual(notified.pet.desktop.position, { x: 104, y: 530, displayId: 'primary-125' });
  assert.equal(f.db.prepare('SELECT revision FROM companion_accounts WHERE owner_account_id=?').get(f.owner).revision, before + 1);
  assert.equal(f.entry.positionDirty, false);
  assert.throws(() => f.service.updateDesktop(f.owner, { actionId: 'stale-ui', petId: rendered.petId, expectedRevision: rendered.revision, behavior: 'follow' }), error => error.code === 'REVISION_CONFLICT');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('stale-ui').n, 0);
  const refreshed = f.service.snapshot(f.owner).data.pets.find(pet => pet.petId === rendered.petId);
  const result = f.service.updateDesktop(f.owner, { actionId: 'explicit-ui-choice-after-refresh', petId: refreshed.petId, expectedRevision: refreshed.revision, behavior: 'follow' });
  assert.equal(result.data.pet.desktop.behavior, 'follow'); assert.deepEqual(result.data.pet.desktop.position, notified.pet.desktop.position);
  assert.equal(f.service.requirePet(f.owner, f.pets[1].petId).revision, 1);
});

test('stationary checkpoints do not publish, increment revisions or create refresh loops', t => {
  const f = fixture(t); f.save(); const original = f.service.requirePet(f.owner, f.entry.pet.petId);
  f.entry.positionDirty = true;
  assert.equal(f.save(), false); assert.equal(f.events.length, 1); assert.equal(f.entry.positionDirty, false);
  assert.deepEqual(f.service.requirePet(f.owner, original.petId), original);
});

test('a failed position transaction publishes no event and retains dirty state for recovery', t => {
  const f = fixture(t), original = structuredClone(f.entry.pet);
  f.db.exec("CREATE TRIGGER reject_position_revision BEFORE UPDATE ON companion_accounts BEGIN SELECT RAISE(ABORT,'controlled checkpoint failure'); END");
  assert.throws(() => f.save(), /controlled checkpoint failure/);
  assert.equal(f.events.length, 0); assert.equal(f.entry.positionDirty, true); assert.deepEqual(f.entry.pet, original);
  assert.deepEqual(f.service.requirePet(f.owner, original.petId), original);
});

test('refresh notifications never relax CAS or overwrite a genuinely concurrent behavior/scale edit', t => {
  const f = fixture(t); f.save(); const refreshed = f.events[0].pet;
  const concurrent = f.service.updateDesktop(f.owner, { actionId: 'concurrent-ui', petId: refreshed.petId, expectedRevision: refreshed.revision, behavior: 'quiet', scale: 1.35 }).data.pet;
  assert.throws(() => f.service.updateDesktop(f.owner, { actionId: 'stale-follow-choice', petId: refreshed.petId, expectedRevision: refreshed.revision, behavior: 'follow' }), error => error.code === 'REVISION_CONFLICT');
  assert.deepEqual(f.service.requirePet(f.owner, refreshed.petId), concurrent);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('stale-follow-choice').n, 0);
  f.entry.positionDirty = true; f.save(120, 535);
  const current = f.service.requirePet(f.owner, refreshed.petId);
  assert.equal(current.desktop.behavior, 'quiet'); assert.equal(current.desktop.scale, 1.35);
  assert.equal(current.revision, concurrent.revision + 1); assert.equal(f.events.length, 2);
  assert.equal(f.service.requirePet(f.owner, f.pets[1].petId).revision, 1);
});
