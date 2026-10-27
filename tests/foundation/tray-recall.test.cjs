const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recallDesktopCompanions } = require('../../apps/pc-app/runtime/core/tray-recall.cjs');

// Async control fixtures only; live cloud and final native EXE acceptance are separate.
function fixture(recallAll) {
  let owner = 'owner-a'; const closed = [], events = [], calls = [], listeners = new Map();
  const open = new Map([['pet-a', { id: 1, isDestroyed: () => false }], ['pet-b', { id: 2, isDestroyed: () => false }]]);
  const services = { session: { getOwnerAccountId: () => owner }, windows: { get: id => open.get(id), close: id => { closed.push(id); open.delete(id); } },
    events: { emit: (name, value) => { events.push({ name, value }); for (const cb of listeners.get(name) || []) cb(value); }, on: (name, cb) => { const set = listeners.get(name) || new Set(); set.add(cb); listeners.set(name, set); return () => set.delete(cb); } }, get: () => ({
      getDesktopWindows: () => [{ ownerAccountId: 'owner-a', petId: 'pet-a', windowId: 1 }, { ownerAccountId: 'owner-b', petId: 'pet-b', windowId: 2 }],
      recallAll: (...args) => { calls.push(args); return recallAll(); }
    }) };
  return { services, closed, events, calls, open, listeners, setOwner: next => { owner = next; } };
}
test('tray waits for the command and closes only the original owner windows after acknowledgement', async () => {
  let acknowledge; const value = fixture(() => new Promise(done => { acknowledge = done; }));
  const pending = recallDesktopCompanions(value.services, 'original-action');
  assert.deepEqual(value.calls, [['owner-a', 'original-action']]); assert.deepEqual(value.closed, []);
  value.open.set('new-pet-a', { id: 3, isDestroyed: () => false });
  acknowledge({ ok: true }); assert.deepEqual(await pending, { ok: true, closed: ['pet-a'] });
  assert.ok(value.open.has('pet-b') && value.open.has('new-pet-a')); assert.deepEqual(value.events, []);
});
test('rejected or unsuccessful commands keep windows and emit only a safe warning', async () => {
  for (const mode of ['reject', 'result']) {
    const value = fixture(() => mode === 'reject' ? Promise.reject(new Error('PRIVATE-PROVIDER-TOKEN')) : Promise.resolve({ ok: false, message: 'PRIVATE-PROVIDER-TOKEN' }));
    const result = await recallDesktopCompanions(value.services, 'original-action');
    assert.deepEqual(result, { ok: false, code: 'COMPANION_RECALL_UNCONFIRMED' }); assert.deepEqual(value.closed, []);
    assert.deepEqual(value.events, [{ name: 'accounts:host-warning', value: { code: 'COMPANION_RECALL_UNCONFIRMED', operation: 'recall-all' } }]);
    assert.ok(!JSON.stringify({ result, events: value.events }).includes('PRIVATE-PROVIDER-TOKEN'));
  }
});
test('an account switch or replacement window while awaiting cannot close a new session window', async () => {
  for (const change of ['owner', 'window']) {
    let acknowledge; const value = fixture(() => new Promise(done => { acknowledge = done; }));
    const pending = recallDesktopCompanions(value.services, 'original-action');
    if (change === 'owner') value.setOwner('owner-b'); else value.open.set('pet-a', { id: 9, isDestroyed: () => false });
    acknowledge({ ok: true }); const result = await pending;
    assert.equal(result.code, change === 'owner' ? 'SESSION_CHANGED' : undefined); assert.deepEqual(value.closed, []); assert.deepEqual(value.events, []);
  }
});
test('synchronous local commands still work and a failed warning listener cannot reject the handler', async () => {
  const local = fixture(() => ({ ok: true })); assert.equal((await recallDesktopCompanions(local.services, 'local-action')).ok, true); assert.deepEqual(local.closed, ['pet-a']);
  const failure = fixture(() => { throw new Error('private'); }); failure.services.events.emit = () => { throw new Error('private listener'); };
  assert.equal((await recallDesktopCompanions(failure.services, 'failed-action')).ok, false);
});

test('same-owner new session and owner A-B-A round trip suppress late recall and warnings', async () => {
  for (const roundTrip of [false,true]) for (const failure of [false,true]) {
    let acknowledge,reject;const value=fixture(()=>new Promise((done,fail)=>{acknowledge=done;reject=fail;}));
    const pending=recallDesktopCompanions(value.services,'same-original-intent');
    if(roundTrip)value.setOwner('owner-b');value.services.events.emit('accounts:session-changed',{});if(roundTrip)value.setOwner('owner-a');
    // Same HWND is deliberately retained: session identity alone must protect it.
    if(failure)reject(Error('PRIVATE'));else acknowledge({ok:true});
    const result=await pending;assert.equal(result.code,failure?'COMPANION_RECALL_UNCONFIRMED':'SESSION_CHANGED');assert.deepEqual(value.closed,[]);assert.ok(value.open.has('pet-a'));
    assert.ok(value.events.every(event=>event.name!=='accounts:host-warning'));assert.ok([...value.listeners.values()].every(set=>set.size===0));
  }
});
