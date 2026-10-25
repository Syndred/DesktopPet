const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { RuntimeDataStore } = require('../../../services/runtime-data-store.cjs');
const { createServices } = require('../../../core/services.cjs');
const { AccountsService } = require('../../accounts/service.cjs');
const { SupabaseRemote } = require('../../accounts/supabase-remote.cjs');
const { migrations: accountMigrations } = require('../../accounts/schema.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const feature = require('../index.cjs');
const conversations = require('../../conversations/index.cjs');

test('real accounts aliases and verified local login isolate 2D instances while preserving unsupported historical animals', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'lingjing-companion-boundary-'));
  const file = join(folder, 'legacy.json'); const db = new DatabaseSync(join(folder, 'shared.sqlite'));
  const legacy = new RuntimeDataStore({ filePath: file });
  const password = 'Local-boundary-72!';
  const a = legacy.registerUser('boundary_a', password, '本机 A').currentUser;
  const b = legacy.registerUser('boundary_b', password, '本机 B').currentUser;
  legacy.loginUser('boundary_a', password);
  const original = readFileSync(file, 'utf8');
  for (const migration of accountMigrations) db.exec(migration.sql);
  for (const migration of conversations.migrations) db.exec(migration.sql);
  migrateCompanions(db);
  const services = createServices({ db, legacy: { runtimeDataStore: legacy }, paths: { userData: folder, legacyDataFile: file }, windows: {}, safeStorage: undefined });
  const accounts = new AccountsService({ services, remote: new SupabaseRemote({userData:folder,config:null}) });
  services.session.setAdapter(accounts); services.provide('accounts', accounts);
  const registration = feature.register(services);
  for (const [command, handler] of Object.entries(registration.commands)) services.ipc.handle(`companions:${command}`, handler);
  const chat = conversations.register(services);
  for (const [command, handler] of Object.entries(chat.commands)) services.ipc.handle(`conversations:${command}`, handler);
  try {
    await accounts.authenticate({ provider: 'local', account: 'boundary_a', password, rememberSession: false });
    const ownerA = services.session.requireOwner(); assert.equal(ownerA, `local:${a.id}`);
    const imported = await services.invoke('companions', 'list');
    assert.equal(imported.data.pets.length, 6);
    assert.equal(imported.data.templates.length, 8);
    assert.equal(new Set(imported.data.templates.map(template => template.resource.resourceId)).size, 8);
    assert.deepEqual([...new Set(imported.data.templates.map(template => template.element))].sort(), ['earth', 'fire', 'metal', 'water', 'wood']);
    assert.equal(services.get('companions').listPets(ownerA).length, 0);
    assert.equal(services.get('companions').getSelections(ownerA).battlePetId, null);
    assert.throws(() => services.get('companions').getPet(ownerA, 'pet-001'), error => error.code === 'RESOURCE_UNAVAILABLE');
    const pets = [];
    for (const name of ['鱼丸', '小蓝', '饭团']) {
      const result = await services.invoke('companions', 'adopt', { actionId: `adopt-${name}`, templateId: 'big-fish-gentle', name, showOnDesktop: false, ownerAccountId: 'forged-renderer-owner' });
      assert.equal(result.ok, true); assert.equal(result.data.pet.ownerAccountId, ownerA); pets.push(result.data.pet);
    }
    assert.equal(services.get('companions').listPets(ownerA).length, 3);
    assert.equal(new Set(pets.map(pet => pet.petId)).size, 3);
    assert.ok(imported.data.templates.every(template => template.resource.kind === '2d'));
    const store = new conversations.ConversationStore(db);
    for (const pet of pets) {
      assert.equal((await services.invoke('conversations', 'select', { petId: pet.petId, expectedAccountId: ownerA })).data.petId, pet.petId);
      assert.equal((await services.invoke('conversations', 'memory.save', { petId: pet.petId, memory: { content: `${pet.name}的独立记忆` } })).ok, true);
      // Persist a pending local turn, without a model call or fabricated reply.
      store.createTurn(ownerA, pet.petId, 'same-action-different-instance', `${pet.name}的消息`, { provider: 'openai-compatible', model: 'not-called' });
    }
    for (const pet of pets) {
      const actual = (await services.invoke('conversations', 'snapshot', { petId: pet.petId })).data;
      assert.deepEqual(actual.memories.map(memory => memory.content), [`${pet.name}的独立记忆`]);
      assert.equal(actual.messages.length, 2);
      assert.equal(actual.messages[0].content, `${pet.name}的消息`);
      assert.ok(actual.messages.every(message => message.petId === pet.petId));
      assert.equal(actual.messages[1].status, 'pending');
    }
    await accounts.authenticate({ provider: 'local', account: 'boundary_b', password, rememberSession: false });
    assert.equal(services.session.requireOwner(), `local:${b.id}`);
    assert.equal((await services.invoke('companions', 'rename', { actionId: 'foreign-rename', petId: pets[0].petId, name: '不能修改', ownerAccountId: ownerA })).code, 'PET_NOT_FOUND');
    assert.equal(services.get('companions').listPets(services.session.requireOwner()).length, 0);
    assert.equal((await services.invoke('conversations', 'memory.save', { petId: pets[0].petId, memory: { content: '不能跨账号添加' }, ownerAccountId: ownerA })).code, 'PET_NOT_FOUND');
    await accounts.logout();
    assert.equal((await services.invoke('companions', 'list')).code, 'AUTH_REQUIRED');
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM companion_legacy_archive WHERE owner_account_id=?').get(ownerA).n, 6);
  } finally {
    chat.dispose(); registration.dispose(); accounts.dispose(); db.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith('lingjing-companion-boundary-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
