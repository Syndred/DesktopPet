/* eslint-disable @typescript-eslint/no-require-imports -- Actual SQLite with simulated companion acknowledgements. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { EventEmitter } = require('node:events');
const featureModule = require('../index.cjs');
const { migrations } = require('../schema.cjs');
function setup(t) {
  const db = new DatabaseSync(':memory:'); for (const m of migrations) db.exec(m.sql);
  let owner = 'owner-a', selected = 'pet-a', listener, settle, reject, requested;
  const pets = id => ['pet-a', 'pet-b'].map(petId => ({ petId, ownerAccountId: id, name: petId, revision: 3 }));
  const feature = featureModule.createConversationsFeature({ db, secrets: { available: () => false },
    getSession: () => ({ ownerAccountId: owner, revision: 1 }), listPets: pets, getChatSelection: () => selected,
    onSessionChanged(fn) { listener = fn; return () => {}; },
    selectChatPet: (id, petId, actionId) => { requested = { owner: id, petId, actionId }; return new Promise((yes, no) => { settle = () => { selected = petId; yes(); }; reject = no; }); }
  });
  feature.service.store.selectPet('owner-a', 'pet-a');
  t.after(() => { feature.dispose(); db.close(); });
  return { feature, db, get requested() { return requested; }, confirm: () => settle(), reject: () => reject(new Error('simulated cloud rejection')),
    switchOwner() { owner = 'owner-b'; listener(); } };
}
test('PROTOCOL UNIT: pending companion ack does not publish or persist a new chat choice', async t => {
  const f = setup(t), pending = f.feature.invoke('select', { petId: 'pet-b', actionId: 'selection-action-1' });
  assert.deepEqual(f.requested, { owner: 'owner-a', petId: 'pet-b', actionId: 'selection-action-1' });
  assert.equal(f.feature.service.store.getSelectedPet('owner-a'), 'pet-a');
  assert.equal((await f.feature.invoke('snapshot')).data.petId, 'pet-a');
  f.confirm(); assert.equal((await pending).data.petId, 'pet-b');
  assert.equal(f.feature.service.store.getSelectedPet('owner-a'), 'pet-b');
});
test('PROTOCOL UNIT: rejection preserves the authoritative choice and local preference', async t => {
  const f = setup(t), pending = f.feature.invoke('select', { petId: 'pet-b' }); f.reject();
  assert.equal((await pending).code, 'SELECTION_FAILED');
  assert.equal((await f.feature.invoke('snapshot')).data.petId, 'pet-a');
  assert.equal(f.feature.service.store.getSelectedPet('owner-a'), 'pet-a');
});
test('PROTOCOL UNIT: a delayed old-owner confirmation cannot write either owner preference', async t => {
  const f = setup(t), pending = f.feature.invoke('select', { petId: 'pet-b' });
  f.switchOwner(); f.confirm(); assert.equal((await pending).code, 'SESSION_CHANGED');
  assert.equal(f.feature.service.store.getSelectedPet('owner-a'), 'pet-a');
  assert.equal(f.feature.service.store.getSelectedPet('owner-b'), null);
});
test('main integration routes only chatPetId and ignores a stale local selection hint', async t => {
  const db = new DatabaseSync(':memory:'); for (const m of migrations) db.exec(m.sql);
  const owner = 'verified-owner', selections = { chatPetId: 'pet-a', battlePetId: 'pet-a', guardPetId: 'pet-b' }, calls = [];
  const bus = new EventEmitter(), registry = new Map();
  registry.set('companions', {
    getSelections: () => selections,
    getPet: (_owner, petId) => ({ petId, revision: 7 }),
    listPets: () => ['pet-a', 'pet-b'].map(petId => ({ petId, ownerAccountId: owner, name: petId })),
    async select(id, input) { calls.push({ owner: id, ...input }); selections[input.slot] = input.petId; return { ok: true }; }
  });
  const services = { db, safeStorage: { isEncryptionAvailable: () => false },
    session: { getCurrentUser: () => ({ id: owner, lastLoginAt: 'stable-login' }), getOwnerAccountId: () => owner },
    get: name => registry.get(name), provide: (name, value) => registry.set(name, value),
    events: { on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); }, emit: (...args) => bus.emit(...args) } };
  const registered = featureModule.register(services); t.after(() => { registered.dispose(); db.close(); });
  db.prepare('INSERT INTO conversation_preferences(owner_account_id,selected_pet_id) VALUES(?,?)').run(owner, 'pet-b');
  const context = { ownerAccountId: owner };
  assert.equal((await registered.commands.snapshot({}, context)).data.petId, 'pet-a');
  const result = await registered.commands.select({ petId: 'pet-b', actionId: 'chat-choice-action' }, context);
  assert.equal(result.data.petId, 'pet-b');
  assert.deepEqual(calls, [{ owner, petId: 'pet-b', slot: 'chatPetId', expectedRevision: 7, actionId: 'chat-choice-action' }]);
  assert.deepEqual(selections, { chatPetId: 'pet-b', battlePetId: 'pet-a', guardPetId: 'pet-b' });
});
