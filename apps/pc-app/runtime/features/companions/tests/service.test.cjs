const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService, atomic, toLegacyPet } = require('../service.cjs');
let folder, file, db, service, milliseconds;
const owner = 'runtime-user-text-001';
const another = 'runtime-user-text-002';
const adopt = (name, extra = {}) => service.adopt(owner, { actionId: `adopt-${name}`, templateId: 'big-fish-gentle', name, showOnDesktop: true, ...extra });
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'lingjing-companions-'));
  file = join(folder, 'shared.sqlite'); milliseconds = Date.parse('2026-10-24T12:00:00Z');
  db = new DatabaseSync(file); db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;'); migrateCompanions(db);
  service = new CompanionsService({ db, now: () => new Date(milliseconds) });
});
afterEach(() => { db.close(); rmSync(folder, { recursive: true, force: true }); });

test('three identical templates retain independent names, growth, desktop modes and positions after reopening SQLite', () => {
  const pets = ['鱼丸', '小蓝', '饭团'].map(name => adopt(name).data.pet);
  assert.equal(new Set(pets.map(pet => pet.petId)).size, 3);
  assert.equal(new Set(pets.map(pet => pet.templateId)).size, 1);
  service.rename(owner, { actionId: 'rename-1', petId: pets[0].petId, name: '鱼丸一号', expectedRevision: 1 });
  service.applyGrowthInTransaction(owner, { actionId: 'feed-1', petId: pets[0].petId, effect: { satiety: 18, affinity: 4, mood: 3 } });
  service.updateDesktop(owner, { actionId: 'move-2', petId: pets[1].petId, position: { x: -800, y: 84, displayId: 'left-monitor' }, behavior: 'wander', scale: 1.2 });
  service.updateDesktop(owner, { actionId: 'recall-3', petId: pets[2].petId, visible: false });
  const before = service.snapshot(owner);
  assert.equal(before.data.pets.find(pet => pet.petId === pets[0].petId).growth.satiety, 78);
  for (const id of [pets[1].petId, pets[2].petId]) assert.equal(before.data.pets.find(pet => pet.petId === id).growth.satiety, 60);
  db.close(); db = new DatabaseSync(file); service = new CompanionsService({ db });
  assert.deepEqual(service.snapshot(owner), before);
});

test('garden inventory debit and one pet growth update commit or roll back together', () => {
  const pet = adopt('鱼丸').data.pet;
  const other = adopt('小蓝').data.pet;
  db.exec('CREATE TABLE test_inventory(owner TEXT PRIMARY KEY, rice INTEGER NOT NULL CHECK(rice>=0));');
  db.prepare('INSERT INTO test_inventory VALUES (?, 2)').run(owner);
  const feed = () => service.applyGrowthInTransaction(owner, { actionId: 'rice-feed', petId: pet.petId, effect: { satiety: 12, affinity: 3 } });
  assert.throws(() => atomic(db, () => { db.prepare('UPDATE test_inventory SET rice=rice-1 WHERE owner=?').run(owner); feed(); throw new Error('abort outer transaction'); }), /abort outer/);
  assert.equal(db.prepare('SELECT rice FROM test_inventory').get().rice, 2);
  assert.equal(service.requirePet(owner, pet.petId).growth.satiety, 60);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('rice-feed').n, 0);
  atomic(db, () => { db.prepare('UPDATE test_inventory SET rice=rice-1 WHERE owner=?').run(owner); feed(); });
  assert.equal(db.prepare('SELECT rice FROM test_inventory').get().rice, 1);
  assert.equal(service.requirePet(owner, pet.petId).growth.satiety, 72);
  assert.deepEqual(service.requirePet(owner, other.petId), other);
  assert.equal(feed().duplicate, true);
  assert.equal(service.requirePet(owner, pet.petId).growth.satiety, 72);
});

test('action IDs bind the operation and full payload, including target pet; retry after restart is idempotent', () => {
  const input = { actionId: 'same-action', templateId: 'big-fish-gentle', name: '鱼丸', showOnDesktop: true };
  const first = service.adopt(owner, input);
  db.close(); db = new DatabaseSync(file); service = new CompanionsService({ db });
  const retry = service.adopt(owner, input);
  assert.equal(retry.duplicate, true); assert.equal(retry.data.pet.petId, first.data.pet.petId);
  assert.equal(service.snapshot(owner).data.pets.length, 1);
  assert.throws(() => service.adopt(owner, { ...input, name: '另一个名字' }), error => error.code === 'ACTION_ID_CONFLICT');
  assert.throws(() => service.rename(owner, { actionId: 'same-action', petId: first.data.pet.petId, name: '名字' }), error => error.code === 'ACTION_ID_CONFLICT');
});

test('main-derived account ownership isolates reads, edits, selections, actions and identical legacy IDs', () => {
  const pet = adopt('鱼丸').data.pet;
  assert.throws(() => service.requirePet(another, pet.petId), error => error.code === 'PET_NOT_FOUND');
  assert.throws(() => service.rename(another, { actionId: 'steal', petId: pet.petId, name: '别人家的' }), error => error.code === 'PET_NOT_FOUND');
  assert.equal(service.snapshot(another).data.pets.length, 0);
  const copiedAction = service.adopt(another, { actionId: 'adopt-鱼丸', templateId: 'big-fish-gentle', name: '自己的鱼丸', showOnDesktop: false });
  assert.notEqual(copiedAction.data.pet.petId, pet.petId);
  const legacy = { pets: [{ id: 'pet-001', name: { zh: '旧动物' }, element: 'fire', level: 8, experience: 77, mood: 88, winsTotal: 42, stats: 'HP198 / ATK54 / DEF31 / SPD20' }], activePetId: 'pet-001' };
  service.importLegacyInventory(owner, legacy); service.importLegacyInventory(another, legacy);
  service.rename(owner, { actionId: 'legacy-rename', petId: 'pet-001', name: '一号账号的动物' });
  assert.equal(service.requirePet(another, 'pet-001').name, '旧动物');
  assert.equal(service.selections(owner).battlePetId, null);
});

test('legacy migration preserves raw records, original JSON/history, IDs, stats and does not overwrite later progress', () => {
  const old = { pets: [{ id: 'pet-001', name: { zh: '焰柴', en: 'BlazeShiba' }, model: '../assets/models/AnimatedDogShibaInu.glb', element: 'fire', stats: 'HP128 / ATK32 / DEF20 / SPD18', level: 6, experience: 83, mood: 74, winsTotal: 18, extension: { historical: true } }], activePetId: 'pet-001', battleReports: [{ id: 'old-report' }], captureRecords: [{ id: 'old-capture', petId: 'pet-001' }] };
  const json = JSON.stringify(old); const oldFile = join(folder, 'original.json'); writeFileSync(oldFile, json);
  assert.equal(service.importLegacyInventory(owner, old).imported, 1);
  const pet = service.requirePet(owner, 'pet-001');
  assert.equal(pet.growth.level, 6); assert.equal(pet.growth.experience, 83); assert.equal(pet.growth.winsTotal, 18);
  assert.equal(toLegacyPet(pet).stats, old.pets[0].stats);
  assert.deepEqual(JSON.parse(db.prepare('SELECT source_json FROM companion_legacy_archive').get().source_json), old.pets[0]);
  service.rename(owner, { actionId: 'rename', petId: pet.petId, name: '老朋友' });
  assert.equal(service.importLegacyInventory(owner, old).alreadyImported, true);
  assert.equal(service.requirePet(owner, pet.petId).name, '老朋友');
  assert.equal(readFileSync(oldFile, 'utf8'), json);
});

test('migration failure rolls back all pets and can be retried after source repair', () => {
  assert.throws(() => service.importLegacyInventory(owner, { pets: [{ id: 'old-good', name: '朋友' }, { name: '缺编号' }] }), error => error.code === 'INVALID_INPUT');
  assert.equal(service.snapshot(owner).data.pets.length, 0);
  assert.equal(service.importLegacyInventory(owner, { pets: [{ id: 'old-good', name: '朋友' }] }).imported, 1);
});

test('desktop, chat, battle and guard choices are independent and never inferred from a template', () => {
  const a = adopt('鱼丸').data.pet; const b = adopt('小蓝').data.pet; const c = adopt('饭团').data.pet;
  service.select(owner, { actionId: 'chat', petId: a.petId, slot: 'chatPetId' });
  service.select(owner, { actionId: 'battle', petId: b.petId, slot: 'battlePetId' });
  service.select(owner, { actionId: 'guard', petId: c.petId, slot: 'guardPetId' });
  service.updateDesktop(owner, { actionId: 'recall', petId: b.petId, visible: false });
  assert.deepEqual(service.selections(owner), { chatPetId: a.petId, battlePetId: b.petId, guardPetId: c.petId });
  assert.equal(service.requirePet(owner, a.petId).desktop.visible, true);
  assert.equal(service.requirePet(owner, c.petId).desktop.visible, true);
});

test('second SQLite connection rejects a stale revision without losing a newer name', () => {
  const pet = adopt('鱼丸').data.pet;
  const secondDb = new DatabaseSync(file); const second = new CompanionsService({ db: secondDb });
  try {
    service.rename(owner, { actionId: 'first-writer', petId: pet.petId, expectedRevision: 1, name: '已保存的名字' });
    assert.throws(() => second.rename(owner, { actionId: 'stale-writer', petId: pet.petId, expectedRevision: 1, name: '过时的名字' }), error => error.code === 'REVISION_CONFLICT' && error.revision === 2);
    assert.equal(second.requirePet(owner, pet.petId).name, '已保存的名字');
    assert.equal(secondDb.prepare('SELECT COUNT(*) AS n FROM companion_actions WHERE action_id=?').get('stale-writer').n, 0);
  } finally { secondDb.close(); }
});

test('trusted capture creation is idempotent; distinct captures of one template remain distinct', () => {
  const input = { actionId: 'capture-1', templateId: 'big-fish-gentle', name: '收服的伙伴', origin: { wildPetId: 'wild-1', wildSerial: '0019812', battleId: 'battle-1' }, showOnDesktop: false };
  const first = service.createCapturedInstance(owner, input);
  assert.equal(service.createCapturedInstance(owner, input).data.pet.petId, first.data.pet.petId);
  assert.equal(service.createCapturedInstance(owner, { ...input, actionId: 'same-encounter-new-request' }).data.pet.petId, first.data.pet.petId);
  assert.equal(first.data.pet.source, 'capture');
  const next = service.createCapturedInstance(owner, { ...input, actionId: 'capture-2', origin: { wildPetId: 'wild-2', wildSerial: '0019813', battleId: 'battle-2' } });
  assert.notEqual(next.data.pet.petId, first.data.pet.petId);
  assert.throws(() => service.createCapturedInstance(owner, { ...input, actionId: 'missing-battle', origin: { wildPetId: 'wild-3' } }), error => error.code === 'INVALID_INPUT');
});

test('growth retains current 100 XP / 10 percent rule and validates numerical effects', () => {
  const pet = adopt('鱼丸').data.pet;
  const result = service.applyGrowthInTransaction(owner, { actionId: 'win', petId: pet.petId, effect: { experience: 205, mood: 70, wins: 1 } });
  assert.equal(result.data.pet.growth.level, 3); assert.equal(result.data.pet.growth.experience, 5);
  assert.equal(result.data.pet.growth.stats.hp, Math.round(Math.round(pet.growth.stats.hp * 1.1) * 1.1));
  assert.equal(result.data.pet.growth.mood, 100); assert.equal(result.data.pet.growth.winsTotal, 1);
  assert.throws(() => service.applyGrowthInTransaction(owner, { actionId: 'bad-effect', petId: pet.petId, effect: { satiety: NaN } }), error => error.code === 'INVALID_INPUT');
});

test('touch cooldown belongs to each pet and persists; invalid positions and names do not write', () => {
  const a = adopt('鱼丸').data.pet; const b = adopt('小蓝').data.pet;
  service.interact(owner, { actionId: 'touch-a', petId: a.petId }); service.interact(owner, { actionId: 'touch-b', petId: b.petId });
  assert.throws(() => service.interact(owner, { actionId: 'touch-too-soon', petId: a.petId }), error => error.code === 'RATE_LIMITED');
  milliseconds += 10001; service.interact(owner, { actionId: 'touch-later', petId: a.petId });
  assert.equal(service.requirePet(owner, a.petId).growth.affinity, 2); assert.equal(service.requirePet(owner, b.petId).growth.affinity, 1);
  assert.throws(() => service.rename(owner, { actionId: 'empty-name', petId: a.petId, name: '  ' }), error => error.code === 'INVALID_INPUT');
  assert.throws(() => service.updateDesktop(owner, { actionId: 'infinite', petId: a.petId, position: { x: Infinity, y: 0 } }), error => error.code === 'INVALID_INPUT');
  assert.equal(service.requirePet(owner, a.petId).desktop.position.x, a.desktop.position.x);
});
