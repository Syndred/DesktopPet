/* eslint-disable @typescript-eslint/no-require-imports -- Headless SSR/SQLite contract checks; no desktop session. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolve, dirname } = require('node:path');
const Module = require('node:module');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const entry = resolve(__dirname, '../../../../ui/src/features/conversations/identity.tsx');
const output = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', write: false }).outputFiles[0].text;
const compiled = new Module(entry, module); compiled.filename = entry; compiled.paths = Module._nodeModulePaths(dirname(entry)); compiled._compile(output, entry);
const { conversationIdentity, petIdentityLabel, petIdentityHint, PetIdentity } = compiled.exports;
const firstId = 'pet-11111111-0000-4000-8000-000000000001';
const secondId = 'pet-22222222-0000-4000-8000-000000000001';
// Controlled main-process metadata fixtures, not real server allocation receipts.
const pet = (petId = firstId, globalSerial) => ({ petId, ownerAccountId: 'owner-a', templateId: 'animal-hat-cat', name: '原昵称<不改>', serial: 'same-short-serial',
  ...(globalSerial === undefined ? {} : { globalSerial }),
  resource: { resourceId: 'mutable-appearance', kind: '2d' }, growth: { level: 9 }, origin: { source: 'historical' } });
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

test('fixed catalog role ignores historical nickname and mutable appearance without changing the DTO', () => {
  const source = freeze(pet(firstId, '1')), before = JSON.stringify(source);
  assert.deepEqual(conversationIdentity(source), { roleName: '礼帽喵', instanceNumber: '0001', historicalNickname: source.name });
  assert.equal(conversationIdentity({ ...source, name: '另一个昵称', resource: { resourceId: 'another-role-artwork' } }).roleName, '礼帽喵');
  assert.equal(JSON.stringify(source), before);
});
test('same-name twins render confirmed global numbers while keeping original petId attributes', () => {
  const a = freeze(pet(firstId, '1')), b = freeze(pet(secondId, '10000')); assert.equal(a.petId.slice(-8), b.petId.slice(-8));
  const markup = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(PetIdentity, { pet: a, historical: true }), React.createElement(PetIdentity, { pet: b, historical: true })));
  for (const item of [a, b]) {
    assert.ok(markup.includes(`>编号 ${item.globalSerial.padStart(4, '0')}</code>`));
    assert.ok(markup.includes(`data-pet-id="${item.petId}"`));
    assert.ok(petIdentityLabel(item).includes(item.globalSerial.padStart(4, '0')));
    assert.equal(petIdentityLabel(item).includes(item.petId), false); assert.ok(petIdentityHint(item).includes(item.name));
  }
  assert.notEqual(petIdentityLabel(a), petIdentityLabel(b));
  assert.ok(markup.includes('历史昵称：原昵称&lt;不改&gt;')); assert.equal(markup.includes('<不改>'), false);
});
test('canonical server strings retain all digits above Number precision and pad only for display', () => {
  for (const [globalSerial, expected] of [['1', '0001'], ['9999', '9999'], ['10000', '10000'], ['9007199254740993', '9007199254740993']]) {
    const source = freeze(pet(firstId, globalSerial)), before = JSON.stringify(source);
    assert.equal(conversationIdentity(source).instanceNumber, expected);
    assert.equal(JSON.stringify(source), before); assert.equal(source.globalSerial, globalSerial);
  }
});
test('missing or malformed metadata displays pending without UUID or legacy serial fallback', () => {
  for (const globalSerial of [undefined, null, 1, 0, '', '0', '00', '0001', '-1', '+1', '1e3', '1.5', '１２', ' 1', '1 ']) {
    const source = freeze(pet(firstId, globalSerial)), before = JSON.stringify(source);
    assert.equal(conversationIdentity(source).instanceNumber, '待同步');
    const markup = renderToStaticMarkup(React.createElement(PetIdentity, { pet: source }));
    assert.ok(markup.includes('>编号 待同步</code>')); assert.equal(JSON.stringify(source), before);
    assert.equal(petIdentityLabel(source).includes(firstId), false);
    assert.equal(petIdentityLabel(source).includes(source.serial), false);
  }
});
test('unknown or missing template stays historical instead of inferring identity from the appearance', () => {
  for (const templateId of [null, undefined, 'retired-template']) {
    const source = freeze({ ...pet(firstId, '42'), templateId, resource: { resourceId: 'animal-hat-cat' } });
    assert.deepEqual(conversationIdentity(source), { roleName: '历史伙伴', instanceNumber: '0042', historicalNickname: source.name });
  }
});
test('read-only label/SSR projection leaves prompt, stored pet JSON, messages, persona, memory, connections, ciphertext and backup bytes unchanged', async t => {
  const db = new DatabaseSync(':memory:'); let feature;
  t.after(() => { feature?.dispose(); db.close(); });
  for (const migration of [...require('../../accounts/schema.cjs').migrations, ...require('../schema.cjs').migrations]) db.exec(migration.sql);
  const { ConversationStore } = require('../store.cjs'), store = new ConversationStore(db), owner = 'owner-a';
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(owner, 'local', 'original-local-id', 'original-account', 'original-account', '历史用户', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
  const pets = freeze([pet(), pet(secondId)]), originalDocument = JSON.stringify({ pets, messages: [{ content: '原昵称<不改>是原始正文' }] });
  db.prepare('INSERT INTO account_legacy_data VALUES(?,?,?,?)').run(owner, 'original-source-hash', originalDocument, '2026-01-01T00:00:00Z');
  const config = { provider: 'openai_compatible', baseUrl: 'https://example.invalid/v1', model: 'original-model', contextChars: 24000, maxOutputTokens: 64 };
  for (const item of pets) {
    store.saveProfile(owner, item.petId, { persona: '原昵称<不改>的人设正文', replyStyle: 'natural', memoryEnabled: true, pauseWhileChatting: true, useOverride: true }, 0);
    store.saveMemory(owner, item.petId, { content: '原昵称<不改>的记忆正文' });
    store.saveConnection(owner, item.petId, { ...config, encryptedKey: 'SIMULATED-ORIGINAL-CIPHERTEXT' }, 0);
    store.createTurn(owner, item.petId, `original-turn:${item.petId}`, '原昵称<不改>的原始消息', config);
    store.updateReply(owner, item.petId, `original-turn:${item.petId}`, '原回复正文', 'complete');
  }
  // Metadata is supplied by the main-process adapter, never backfilled into archived JSON.
  let metadata = freeze(pets.map((item, i) => ({ ...item, globalSerial: String(i + 1) })));
  feature = require('../index.cjs').createConversationsFeature({ db, secrets: { available: () => false }, getSession: () => ({ ownerAccountId: owner, revision: 1 }), listPets: () => metadata });
  const adapter = require('../backup.cjs').createConversationBackupAdapter({ db });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'conversation_%' OR name='account_legacy_data') ORDER BY name").all().map(row => row.name);
  const bytes = () => JSON.stringify(tables.map(name => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
  const before = bytes(), backup = JSON.stringify(adapter.export(owner));
  db.exec('PRAGMA query_only=ON'); assert.equal(db.prepare('PRAGMA query_only').get().query_only, 1);
  const { buildContext } = require('../context.cjs');
  for (const original of pets) {
    const context = { profile: store.getProfile(owner, original.petId), memories: store.listMemories(owner, original.petId),
      pairs: store.contextPairs(owner, original.petId), prompt: '原始用户输入', budget: config.contextChars };
    const originalPrompt = JSON.stringify(buildContext({ ...context, pet: original }));
    assert.equal(JSON.stringify(buildContext({ ...context, pet: metadata.find(item => item.petId === original.petId) })), originalPrompt);
  }
  const snapshot = await feature.invoke('snapshot', { globalSerial: '999999' }); assert.equal(snapshot.ok, true);
  for (const dto of snapshot.data.pets) {
    assert.equal(dto.name, pets.find(item => item.petId === dto.petId).name);
    assert.equal(dto.globalSerial, metadata.find(item => item.petId === dto.petId).globalSerial);
    assert.equal(conversationIdentity(dto).instanceNumber, dto.globalSerial.padStart(4, '0'));
    assert.equal(Object.hasOwn(dto, 'roleName'), false); assert.equal(Object.hasOwn(dto, 'instanceNumber'), false);
    renderToStaticMarkup(React.createElement(PetIdentity, { pet: dto, historical: true }));
  }
  for (const globalSerial of [undefined, null, 1, '0', '0001', '1e3', ' 1']) {
    metadata = [{ ...pets[0], globalSerial }];
    const pending = await feature.invoke('snapshot'); assert.equal(pending.ok, true);
    assert.equal(Object.hasOwn(pending.data.pets[0], 'globalSerial'), false);
    assert.equal(conversationIdentity(pending.data.pets[0]).instanceNumber, '待同步');
  }
  assert.ok(pets.every(item => !Object.hasOwn(item, 'globalSerial')));
  assert.equal(bytes(), before); assert.equal(JSON.stringify(adapter.export(owner)), backup);
  assert.equal(db.prepare('SELECT document FROM account_legacy_data WHERE owner_account_id=?').get(owner).document, originalDocument);
  assert.equal(createHash('sha256').update(bytes()).digest('hex'), createHash('sha256').update(before).digest('hex'));
});
test('registered adapter excludes unverified legacy numbers and forwards only the companion inventory metadata', async t => {
  const db = new DatabaseSync(':memory:'); let registered;
  t.after(() => { registered?.dispose(); db.close(); });
  for (const migration of require('../schema.cjs').migrations) db.exec(migration.sql);
  const owner = 'owner-a', legacyPets = freeze([pet(firstId, '777')]), before = JSON.stringify(legacyPets);
  let companions;
  registered = require('../index.cjs').register({ db, secrets: { available: () => false },
    session: { getCurrentUser: () => ({ id: owner, lastLoginAt: 'original-session' }), getOwnerAccountId: () => owner },
    events: { on: () => () => {}, emit() {} }, get: () => companions, provide() {},
    legacy: { runtimeDataStore: { getInventorySnapshot: () => ({ pets: legacyPets }) } } });
  const unverified = await registered.commands.snapshot({}, { ownerAccountId: owner });
  assert.equal(unverified.ok, true); assert.equal(Object.hasOwn(unverified.data.pets[0], 'globalSerial'), false);
  assert.equal(conversationIdentity(unverified.data.pets[0]).instanceNumber, '待同步');
  companions = { listPets: requestedOwner => [freeze({ ...pet(firstId, '8'), ownerAccountId: requestedOwner })],
    getSelections: () => ({ chatPetId: firstId }) };
  const confirmed = await registered.commands.snapshot({ globalSerial: '9999' }, { ownerAccountId: owner });
  assert.equal(confirmed.ok, true, confirmed.message); assert.equal(confirmed.data.pets[0].globalSerial, '8');
  assert.equal(confirmed.data.pets[0].petId, firstId); assert.equal(conversationIdentity(confirmed.data.pets[0]).instanceNumber, '0008');
  assert.equal(JSON.stringify(legacyPets), before);
});
