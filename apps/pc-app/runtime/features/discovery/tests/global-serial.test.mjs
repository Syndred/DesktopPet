// Explicit local RPC/state-machine fixtures and in-memory SQLite only.
// These checks do not claim deployed Auth, physical GPS or cloud concurrency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { createWildAuthority } from '../../../../../../infra/supabase/functions/discovery/authority.mjs';
import { createDiscoveryStore } from '../../../../../../infra/supabase/functions/discovery/store.mjs';
import { nearbySpawns } from '../../../../../../infra/supabase/functions/discovery/_generated/runtime.mjs';
const require = createRequire(import.meta.url);
const { CloudDiscoveryRuntime } = require('../cloud-runtime.cjs');
const { checksum } = require('../../accounts/util.cjs');
const clock = 1792895000000, owner = 'runtime:preserved-owner', templateId = 'animal-hat-cat';
const actor = { schemaVersion: 1, authority: 'live', authKind: 'supabase', authUserId: 'c53a59ce-f84f-4c2d-a318-be89b3b4d21a', ownerAccountId: owner, deviceId: 'device-a', sessionId: 'session-a' };
const identity = (spawnId, globalSerial = '2') => ({ namespace: 'live', ownerAccountId: owner, spawnId, templateId, globalSerial });
const readback = pets => ({ format: 'lingjing.global-serial.readback', version: 1, namespace: 'live', ownerAccountId: owner, revision: 7, pets: pets.map(pet => ({ namespace: 'live', ownerAccountId: owner, ...pet })) });
function storeFixture({ lookup = [], pets = [], envelope = { ownerAccountId: owner, data: {} }, extra = {} } = {}) {
  const calls = [], client = { from(name) { assert.equal(name, 'lingjing_saves'); return { select() { return this; }, eq(key, value) { assert.equal(key, 'owner_id'); assert.equal(value, owner); return this; }, async maybeSingle() { return { data: { revision: 7, envelope }, error: null }; } }; } };
  const admin = { async rpc(name, args) {
    calls.push({ name, args });
    if (name === 'lingjing_global_serial_wild_lookup') return { data: lookup, error: null };
    if (name === 'lingjing_global_serial_owned') { assert.equal(args.p_expected_revision, 7); return { data: readback(pets), error: null }; }
    if (extra[name]) return { data: await extra[name](args), error: null };
    assert.fail(`Unexpected RPC ${name}`);
  } };
  return { store: createDiscoveryStore(admin), actor: { ...actor, client }, calls };
}

test('observe validates the original 80m/30s/100m policy before stable owner-scoped registration', async () => {
  const base = { lat: 31.2, lng: 121.4, source: 'os', provider: 'windows-geolocator', coordinateSystem: 'wgs84', accuracyMeters: 5, timestampMs: clock };
  const spawn = nearbySpawns(base, clock)[0], fix = { ...base, ...spawn.position }, proofs = new Map(), registrations = new Map();
  let ensures = 0;
  const store = {
    async location(who, op, input) { assert.equal(op, 'read_proof'); return proofs.get(input.proofId); },
    async ensureWildSerial(who, value, proof) {
      ++ensures; assert.equal(value.id, spawn.id); assert.equal(proof.purpose, 'discover'); assert.equal(proof.reference, '');
      const key = JSON.stringify([who.ownerAccountId, value.id]);
      if (!registrations.has(key)) registrations.set(key, { ...identity(value.id, String(registrations.size + 1)), ownerAccountId: who.ownerAccountId, templateId: value.templateId });
      return registrations.get(key);
    }
  };
  const authority = createWildAuthority({ store, now: () => clock });
  const issue = (who = actor, patch = {}) => { const id = `proof-${proofs.size}`; proofs.set(id, { ...who, id, purpose: 'discover', reference: '', expiresAt: clock + 15000, source: 'os', fix, ...patch }); return id; };
  const observe = (who = actor, proofId = issue(who), extra = {}) => authority({ actor: who, input: { op: 'observe', spawnId: spawn.id, proofId, ...extra } });
  const first = await observe(), second = { ...actor, deviceId: 'device-b', sessionId: 'session-b' };
  assert.equal(first.globalSerial, '1'); assert.equal((await observe(second)).globalSerial, first.globalSerial);
  assert.equal((await observe({ ...actor, ownerAccountId: 'runtime:other-owner' })).globalSerial, '2');
  const count = ensures;
  await assert.rejects(observe(actor, issue(actor, { fix: { ...fix, accuracyMeters: 81 } })), { code: 'LOCATION_IMPRECISE' });
  await assert.rejects(observe(actor, issue(actor, { fix: { ...fix, timestampMs: clock - 30001 } })), { code: 'LOCATION_STALE' });
  await assert.rejects(observe(actor, issue(actor, { fix: { ...fix, lat: fix.lat + .0015 } })), { code: 'OUT_OF_CAPTURE_RANGE' });
  await assert.rejects(observe(actor, issue(second)), { code: 'LOCATION_OWNER_MISMATCH' });
  await assert.rejects(observe(actor, issue(), { globalSerial: '9999' }), { code: 'CLIENT_AUTHORITY_FORBIDDEN' });
  assert.equal(ensures, count); assert.equal(registrations.size, 2);
});

test('nearby only looks up registered entities and strips imported candidate numbers', async () => {
  const f = storeFixture({ lookup: [identity('wild-a', '9007199254740993')] });
  const original = [{ id: 'wild-a', templateId, globalSerial: '999' }, { id: 'wild-b', templateId, globalSerial: '998' }], bytes = JSON.stringify(original);
  const projected = await f.store.projectNearby(f.actor, original);
  assert.equal(projected[0].globalSerial, '9007199254740993'); assert.equal(projected[1].globalSerial, undefined);
  assert.deepEqual(f.calls.map(call => call.name), ['lingjing_global_serial_wild_lookup']);
  assert.deepEqual(f.calls[0].args.p_spawns, [{ id: 'wild-a', templateId }, { id: 'wild-b', templateId }]);
  assert.equal(JSON.stringify(original), bytes);
});

test('historical projections use bounded lookup batches and revoked QA cannot fall back to live', async () => {
  const batches = [];
  const store = createDiscoveryStore({ async rpc(name, args) {
    assert.equal(name, 'lingjing_global_serial_wild_lookup'); batches.push(args.p_spawns.length);
    return { data: args.p_spawns.map(spawn => identity(spawn.id, String(BigInt(spawn.id.slice(5)) + 1n))), error: null };
  } });
  const rows = await store.projectNearby(actor, Array.from({ length: 201 }, (_, index) => ({ id: `wild-${index}`, templateId })));
  assert.deepEqual(batches, [100, 100, 1]); assert.equal(rows.length, 201); assert.ok(rows.every(row => row.globalSerial));
  const revoked = createDiscoveryStore({ async rpc() { return { data: null, error: { message: 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED' } }; } });
  await assert.rejects(revoked.projectNearby(actor, [{ id: 'wild-a', templateId }]), { code: 'GLOBAL_SERIAL_SCOPE_REVOKED', status: 403 });
});

test('permit/session/capture/action projection inherits the same number without editing historical objects or hashes', async () => {
  const permitId = 'c1ed72dc-bf3d-44f4-9e6b-000000000001';
  const player = { petId: 'original-player', templateId, globalSerial: '999' }, enemy = { petId: 'wild-a', templateId, globalSerial: '998' };
  const session = { mode: 'wild', player, enemy, snapshot: {}, rounds: [] };
  const permit = { id: permitId, ownerAccountId: owner, spawn: { id: 'wild-a', templateId, globalSerial: '997' }, session };
  const capture = { ownerAccountId: owner, petId: `pet-${permitId}`, permitId, encounterId: `encounter-${permitId}`, templateId, name: '原捕获昵称', serial: 'legacy-serial', globalSerial: '996' };
  const payload = [permit, { requestHash: 'immutable-original-hash', result: capture }], bytes = JSON.stringify(payload);
  const f = storeFixture({ lookup: [identity('wild-a')], pets: [{ petId: player.petId, templateId, globalSerial: '1' }, { petId: capture.petId, templateId, globalSerial: '2' }] });
  const projected = await f.store.projectGlobalSerials(f.actor, payload);
  assert.equal(projected[0].spawn.globalSerial, '2'); assert.equal(projected[0].session.enemy.globalSerial, '2');
  assert.equal(projected[0].session.player.globalSerial, '1'); assert.equal(projected[1].result.globalSerial, '2');
  assert.equal(projected[1].requestHash, payload[1].requestHash); assert.equal(projected[1].result.name, capture.name); assert.equal(projected[1].result.serial, capture.serial);
  assert.equal(JSON.stringify(payload), bytes); assert.equal(f.calls.filter(call => call.name.includes('wild_lookup')).length, 1);
});

test('foreign owners, wrong entity/type, duplicate rows and malformed authoritative numbers fail closed', async () => {
  for (const rows of [[{ ...identity('wild-a'), ownerAccountId: 'foreign' }], [identity('wild-b')], [{ ...identity('wild-a'), templateId: 'foreign-template' }], [identity('wild-a'), identity('wild-a')], [identity('wild-a', '0002')], [identity('wild-a', 2)]]) {
    const f = storeFixture({ lookup: rows });
    await assert.rejects(f.store.projectNearby(f.actor, [{ id: 'wild-a', templateId }]), { code: 'GLOBAL_SERIAL_INVALID' });
  }
  const f = storeFixture({ lookup: [identity('wild-a')], pets: [{ petId: 'captured', templateId, globalSerial: '3' }], extra: { lingjing_discovery_game_read: () => ({ ownerAccountId: owner, spawn: { id: 'wild-a', templateId } }) } });
  await assert.rejects(f.store.projectGlobalSerials(f.actor, { ownerAccountId: owner, petId: 'captured', templateId, encounterId: 'encounter-id', permitId: 'id' }), { code: 'GLOBAL_SERIAL_CONFLICT' });
});

test('ownedPet matches canonical owner+petId+templateId at the exact head revision and preserves original pet bytes', async () => {
  const pet = { ownerAccountId: owner, petId: 'original-owned-id', templateId, revision: 3, name: '原昵称', globalSerial: '999' };
  const envelope = { ownerAccountId: owner, data: { modules: { companions: { version: 1, data: { ownerAccountId: owner, tables: { companion_pets: [{ owner_account_id: owner, pet_id: pet.petId, revision: 3, data_json: JSON.stringify(pet) }] } } } } } };
  const bytes = JSON.stringify(envelope), f = storeFixture({ envelope, pets: [{ petId: pet.petId, templateId, globalSerial: '9007199254740993' }] });
  const result = await f.store.ownedPet(f.actor, pet.petId);
  assert.equal(result.globalSerial, '9007199254740993'); assert.equal(result.petId, pet.petId); assert.equal(result.name, pet.name);
  assert.equal(JSON.stringify(envelope), bytes); assert.equal(f.calls[0].args.p_expected_revision, 7);
});

function runtimeFixture() {
  let currentOwner = owner;
  const spawn = { id: 'wild-a', templateId }, fix = { source: 'os' }, calls = [];
  const discovery = { nearby: () => ({ spawns: [spawn] }), requireFix: () => fix, notify(who) { calls.push({ notify: who }); } };
  const services = { db: {}, session: { requireOwner: () => currentOwner }, events: { emit() {} }, get: () => null };
  const proofs = { async prove(purpose, reference) { calls.push({ purpose, reference }); return { id: `proof-${calls.length}`, fix }; } };
  const runtime = new CloudDiscoveryRuntime(services, discovery, proofs);
  runtime.nearbyState = { source: 'os', spawns: [spawn] };
  discovery.authority = { async observe(input) { calls.push(input); return { ...identity(spawn.id), source: 'os' }; } };
  return { runtime, discovery, services, calls, switchOwner: () => { currentOwner = 'foreign'; } };
}

test('main observe sends only target+new discover proof, updates a read view, and rejects an account switch', async () => {
  const f = runtimeFixture();
  assert.equal((await f.runtime.observe({ spawnId: 'wild-a', globalSerial: 'client-number' })).data.globalSerial, '2');
  assert.equal(f.runtime.nearbyState.spawns[0].globalSerial, '2');
  assert.deepEqual(f.calls[0], { purpose: 'discover', reference: '' });
  assert.deepEqual(f.calls[1], { spawnId: 'wild-a', proofId: 'proof-1' });
  const other = runtimeFixture(); other.discovery.authority.observe = async () => { other.switchOwner(); return { ...identity('wild-a'), source: 'os' }; };
  await assert.rejects(other.runtime.observe({ spawnId: 'wild-a' }), { code: 'AUTH_CHANGED' });
  assert.equal(other.runtime.nearbyState.spawns[0].globalSerial, undefined);
});

test('new local command intents strip projected numbers recursively while preserving original action and result identity', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('create table account_actions(owner_account_id text,action_id text,kind text,input_hash text,result text,created_at text,primary key(owner_account_id,action_id))');
  try {
    const f = runtimeFixture(); f.runtime.db = db;
    const reply = { petId: 'original-captured-id', name: '原昵称', globalSerial: '2', session: { enemy: { petId: 'wild-a', globalSerial: '2' } } };
    f.discovery.authority.invoke = async () => reply;
    const body = { op: 'confirm', permitId: 'original-permit', proofId: 'proof-original', actionId: 'original-action' };
    assert.equal((await f.runtime.request(owner, body)).globalSerial, '2');
    const row = db.prepare('select * from account_actions').get(), saved = JSON.parse(row.result);
    assert.equal(row.action_id, 'discovery-client:original-action'); assert.equal(row.input_hash, checksum(body)); assert.deepEqual(saved.request, body);
    assert.equal(saved.result.globalSerial, undefined); assert.equal(saved.result.session.enemy.globalSerial, undefined); assert.equal(saved.result.petId, reply.petId);
    assert.equal(reply.session.enemy.globalSerial, '2'); assert.deepEqual(await f.runtime.request(owner, body), saved.result);
  } finally { db.close(); }
});

test('discovery applies independent serialRegistry from companions snapshot without changing the envelope checksum', async () => {
  const f = runtimeFixture(), seen = [];
  const body = { ownerAccountId: owner, data: { modules: { companions: { version: 1, data: {} } }, tables: {} } };
  const envelope = { ...body, checksum: checksum(body) }, serialRegistry = readback([]), before = JSON.stringify(envelope);
  f.services.get = name => ({ cloudActor: { async invoke(endpoint, input) { assert.equal(endpoint, 'companions-sync'); assert.deepEqual(input, { op: 'snapshot' }); return { authority: 'live', ownerAccountId: owner, revision: 7, envelope, serialRegistry }; } }, companions: { applyCloudReadback(who, value) { seen.push({ who, value }); } }, garden: { applyCloudReadback() {} }, accounts: { sync: { acceptAuthoritativeReadback() {} } } })[name];
  f.runtime.db = { transaction: work => () => work() };
  const head = await f.runtime.head(owner); f.runtime.apply(owner, head);
  assert.equal(seen[0].value.serialRegistry, serialRegistry); assert.equal(seen[0].value.envelope, envelope); assert.equal(JSON.stringify(envelope), before);
});
