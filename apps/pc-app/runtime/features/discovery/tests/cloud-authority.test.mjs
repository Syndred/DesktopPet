// Pure server state-machine checks with an explicitly in-memory transaction
// contract. This is not deployed PostgreSQL, HTTPS, Auth or real GPS evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWildAuthority } from '../../../../../../infra/supabase/functions/discovery/authority.mjs';
import { nearbySpawns } from '../../../../../../infra/supabase/functions/discovery/_generated/runtime.mjs';
import { DiscoveryError } from '../../../../../../infra/supabase/functions/discovery/protocol.mjs';
const actor = { schemaVersion: 1, authority: 'live', authKind: 'supabase', authUserId: 'c53a59ce-f84f-4c2d-a318-be89b3b4d21a', ownerAccountId: 'runtime:original-account', deviceId: 'device-a', sessionId: 'session-a', allowSimulatedLocation: true, scenarioId: 'unit-only' };
const clock = 1792895000000, clone = value => structuredClone(value);
const fail = code => { throw new DiscoveryError(code); };
function fixture() {
  const fix = { lat: 31.2, lng: 121.4, source: 'simulated', provider: 'qa-discovery', scenarioId: 'unit-only', coordinateSystem: 'wgs84', accuracyMeters: 5, timestampMs: clock };
  const spawn = nearbySpawns(fix, clock)[0]; fix.lat = spawn.position.lat; fix.lng = spawn.position.lng;
  const advantageous = { metal: 'fire', wood: 'metal', water: 'earth', fire: 'water', earth: 'wood' }[spawn.element];
  const pet = { petId: 'original-independent-pet-id', ownerAccountId: actor.ownerAccountId, name: '原伙伴', element: advantageous, level: 3, revision: 9, resource: { kind: '2d', resourceId: 'builtin:lingjing-yuwan-v2' } };
  const actions = new Map(), permits = new Map(), captures = new Map(), proofs = new Map(), rewardCommits = new Set(), instanceCommits = new Set();
  const store = {
    action: async (who, id) => actions.get(`${who.ownerAccountId}:${id}`),
    permit: async (who, id) => { const value = permits.get(id); return value?.ownerAccountId === who.ownerAccountId ? clone(value) : null; },
    ownedPet: async (who, id) => who.ownerAccountId === pet.ownerAccountId && id === pet.petId ? clone(pet) : null,
    location: async (who, op, input) => { assert.equal(op, 'read_proof'); const p = proofs.get(input.proofId); if (!p || p.ownerAccountId !== who.ownerAccountId) fail('LOCATION_PROOF_INVALID'); return clone(p); },
    async reserve(who, data) { permits.set(data.id, clone(data)); proofs.get(data.locationProofId).consumedAt = clock; const result = { id: data.id, sessionId: data.sessionId, expiresAt: data.expiresAt }; actions.set(`${who.ownerAccountId}:${data.actionId}`, { requestHash: data.requestHash, result: clone(result) }); return result; },
    async advance(who, data) { const p = permits.get(data.permitId); if (p.revision !== data.expectedRevision) fail('REVISION_CONFLICT'); p.session = clone(data.session); p.status = data.status; p.revision++; if (data.session.status === 'finished') rewardCommits.add(p.sessionId); const result = clone(data.session); actions.set(`${who.ownerAccountId}:${data.actionId}`, { requestHash: data.requestHash, result }); return clone(result); },
    capture: async (who, id) => captures.get(`${who.ownerAccountId}:${id}`),
    captures: async who => [...captures.values()].filter(value => value.ownerAccountId === who.ownerAccountId),
    async claim(who, data) { const p = permits.get(data.permitId); if (p.revision !== data.expectedRevision || p.status !== 'won') fail('REVISION_CONFLICT'); captures.set(`${who.ownerAccountId}:${p.id}`, clone(data.capture)); instanceCommits.add(data.instance.petId); p.status = 'captured'; p.revision++; proofs.get(data.locationProofId).consumedAt = clock; const result = clone(data.capture); actions.set(`${who.ownerAccountId}:${data.actionId}`, { requestHash: data.requestHash, result }); return clone(result); },
    async recordExistingCapture(who, data) { const result = { ...clone(data.capture), duplicate: true }; actions.set(`${who.ownerAccountId}:${data.actionId}`, { requestHash: data.requestHash, result }); return result; },
    async cancel(who, data) { const p = permits.get(data.permitId); if (p.revision !== data.expectedRevision) fail('REVISION_CONFLICT'); p.status = 'cancelled'; p.session = clone(data.session); p.revision++; const result = clone(p.session); actions.set(`${who.ownerAccountId}:${data.actionId}`, { requestHash: data.requestHash, result }); return result; }
  };
  let serial = 0;
  const authority = createWildAuthority({ store, now: () => clock, uuid: () => `c1ed72dc-bf3d-44f4-9e6b-${String(++serial).padStart(12, '0')}`, projectRef: 'local-unit-not-cloud' });
  const issue = (purpose, reference, who = actor) => { const id = `proof-${proofs.size}`; proofs.set(id, { ...who, id, purpose, reference, source: 'simulated', fix: clone(fix), expiresAt: clock + 15000 }); return id; };
  const call = (input, who = actor) => authority({ actor: who, input });
  return { call, issue, spawn, pet, actions, captures, permits, rewardCommits, instanceCommits };
}
test('actual server kernel refuses forged victory/foreign ownership, replays original actions, and returns one capture across same-owner devices', async t => {
  t.mock.method(Math, 'random', () => .5); // Unit-only deterministic NPC, never an HTTP input or production preset.
  const f = fixture(), begin = { op: 'reserve', spawnId: f.spawn.id, petId: f.pet.petId, proofId: f.issue('begin', f.spawn.id), actionId: 'begin-a' };
  const permit = await f.call(begin); assert.deepEqual(await f.call(begin), permit);
  await assert.rejects(f.call({ op: 'confirm', permitId: permit.id, name: '新伙伴', proofId: 'none', actionId: 'early' }), { code: 'VICTORY_REQUIRED' });
  await assert.rejects(f.call({ op: 'act', permitId: permit.id, action: 'normal_attack', expectedRound: 1, actionId: 'forged', winner: 'player' }), { code: 'CLIENT_AUTHORITY_FORBIDDEN' });
  await assert.rejects(f.call({ op: 'session', permitId: permit.id }, { ...actor, ownerAccountId: 'foreign' }), { code: 'PERMIT_NOT_FOUND' });
  const second = { ...actor, deviceId: 'device-b', sessionId: 'session-b' };
  let session = await f.call({ op: 'session', permitId: permit.id }, second); assert.equal(session.player.petId, f.pet.petId);
  const first = { op: 'act', permitId: permit.id, action: 'normal_attack', expectedRound: 1, actionId: 'round-a' };
  session = await f.call(first); assert.deepEqual(await f.call(first, second), session);
  await assert.rejects(f.call({ ...first, action: 'ultimate' }), { code: 'ACTION_ID_CONFLICT' });
  await assert.rejects(f.call({ ...first, actionId: 'stale' }), { code: 'ROUND_CONFLICT' });
  for (let round = 0; round < 40 && session.status === 'active'; round++) session = await f.call({ op: 'act', permitId: permit.id, actionId: `round-${round}`, action: session.snapshot.player.anger >= session.rules.ultimateAnger ? 'ultimate' : 'normal_attack', expectedRound: session.snapshot.round + 1 });
  assert.equal(session.status, 'finished'); assert.equal(session.winner, 'player'); assert.equal(f.rewardCommits.size, 1);
  const confirm = { op: 'confirm', permitId: permit.id, proofId: f.issue('capture', permit.id, second), name: '新伙伴', actionId: 'capture-a' };
  const captured = await f.call(confirm, second); assert.equal(captured.petId, `pet-${permit.id}`); assert.equal(captured.battleId, permit.sessionId); assert.equal(captured.validation, 'simulated');
  assert.deepEqual(await f.call(confirm, second), captured);
  const duplicate = await f.call({ ...confirm, name: '不能用重复确认改名', actionId: 'capture-b' }, second); assert.equal(duplicate.petId, captured.petId); assert.equal(duplicate.name, '新伙伴');
  await assert.rejects(f.call({ op: 'cancel', permitId: permit.id, actionId: 'capture-b' }, second), { code: 'ACTION_ID_CONFLICT' });
  assert.equal(f.instanceCommits.size, 1); assert.equal(f.captures.size, 1); assert.equal((await f.call({ op: 'captures' }, second))[0].petId, captured.petId);
});
