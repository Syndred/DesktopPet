import test from 'node:test';
import assert from 'node:assert/strict';
import { assertC11AccountSwitchObservations as validate } from './cloud-c11-account-switch-observations.mjs';

const start = Date.parse('2026-11-05T06:00:00.000Z');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const roles = ['a', 'a2', 'a3', 'b', 'c'];
const phases = ['a-before', 'signedout-after-a', 'b-active', 'signedout-after-b', 'a-returned'];
const expectedResult = { scope: 'assertion-only', source: 'not-authenticated', fullCasePassed: false };
const clone = structuredClone;
function status(at) {
  const checkedAt = at === null ? null : new Date(at).toISOString();
  return { mode: 'cloud-authority', running: false, pending: 0, lastCloudCheckedAt: checkedAt,
    domainStates: [{ domain: 'companions', checkedAt, status: 'ready', pending: 0, error: null, metadataWarning: false }] };
}
function roster(tuple) {
  return { ownerAccountId: tuple.ownerAccountId, pets: [clone(tuple)], ui: {
    routeMatches: true, currentRouteCount: 1, currentRouteMatches: true, visibleAlertCount: 0,
    openingCount: 0, surfaceReady: true, roster: [{ petId: tuple.petId, numbers: ['编号 ' + tuple.globalSerial.padStart(4, '0')] }],
  } };
}
function fixture() {
  const identities = Object.fromEntries(roles.map((role, i) => {
    const account = i < 3 ? 1 : i;
    return [role, { ownerAccountId: 'account:' + uuid(account), authUserId: uuid(account + 10), deviceId: uuid(i + 20), sessionId: uuid(i + 30), epoch: 7 }];
  }));
  const binding = { run: '123456', commit: 'a'.repeat(40), scenario: 'cloud-acceptance-20261027-8be246d1', startedAtMs: start, deadlineMs: start + 1000,
    profile: { canonicalPathSha256: 'b'.repeat(64), dev: 1, ino: 2 },
    launcher: { pid: 123, startTicks: '638000000000000000', imagePathSha256: 'c'.repeat(64) },
    runtime: { pid: 124, startTicks: '638000000000000001', imagePathSha256: 'd'.repeat(64) }, identities,
    originalGrants: Object.fromEntries(roles.map(role => [role, {
      ownerAccountId: identities[role].ownerAccountId, authUserId: identities[role].authUserId, deviceId: identities[role].deviceId,
      scenario: 'cloud-acceptance-20261027-8be246d1', expiresAtMs: start + 2000,
    }])),
    bOnADeviceGrant: null,
    capturedTuple: { ownerAccountId: identities.a.ownerAccountId, petId: 'captured-a', templateId: 'animal-wood-deer', globalSerial: '7' },
    bTuple: { ownerAccountId: identities.b.ownerAccountId, petId: 'original-b', templateId: 'animal-wood-deer', globalSerial: '5' },
  };
  binding.bOnADeviceGrant = { ...binding.originalGrants.b, deviceId: identities.a.deviceId };
  const observations = phases.map((phase, i) => {
    const observedAtMs = start + (i + 1) * 100;
    const signedout = i === 1 || i === 3;
    const actor = signedout ? null : { ...(i === 2 ? identities.b : identities.a), deviceId: identities.a.deviceId,
      epoch: identities.a.epoch + i, sessionId: i === 0 ? identities.a.sessionId : uuid(90 + i) };
    const o = { sequence: i + 1, phase, observedAtMs,
      ...Object.fromEntries(['run', 'commit', 'profile', 'launcher', 'runtime', 'originalGrants', 'bOnADeviceGrant'].map(k => [k, clone(binding[k])])),
      deviceId: identities.a.deviceId, epoch: identities.a.epoch + i, dataMode: 'live', persistence: signedout ? 'none' : 'memory', actor,
      logout: signedout ? { requestedAtMs: observedAtMs - 80, confirmedAtMs: observedAtMs - 70,
        previousSessionId: i === 1 ? identities.a.sessionId : uuid(92), signOutPendingResult: { confirmed: true } } : null,
      sync: i === 2 || i === 4 ? { authenticatedAtMs: observedAtMs - 60, baselineObservedAtMs: observedAtMs - 50,
        before: status(observedAtMs - 51), after: status(observedAtMs - 20) } : null,
      roster: signedout ? null : roster(i === 2 ? binding.bTuple : binding.capturedTuple),
      peers: Object.fromEntries(roles.slice(1).map(role => [role, clone(identities[role])])),
    };
    return o;
  });
  return { version: 1, binding, observations };
}
const run = f => validate(f, start + 3000);
function rejects(change, nowMs = start + 3000) {
  const f = fixture(); change(f);
  assert.throws(() => validate(f, nowMs), error => {
    assert.equal(error.code, 'C11_SWITCH_OBSERVATION_INVALID');
    assert.equal(error.message, 'Invalid C11 account-switch observations');
    assert.deepEqual(Object.keys(error), ['code']);
    return true;
  });
}
function freeze(value) { if (value && typeof value === 'object') { for (const v of Object.values(value)) freeze(v); Object.freeze(value); } return value; }
function atPath(value, path) { return path.split('.').reduce((v, key) => v[key], value); }

test('OFFLINE five-stage transcript is assertion-only, immutable and does not authenticate its source', () => {
  const f = freeze(fixture()), before = JSON.stringify(f), result = run(f);
  assert.deepEqual(result, expectedResult); assert.equal(Object.isFrozen(result), true);
  assert.equal(JSON.stringify(f), before); assert.equal(JSON.stringify(result).includes(f.binding.run), false);
  // Fabricated data can satisfy this contract: its result must never claim live acceptance.
  assert.equal(result.fullCasePassed, false); assert.equal(result.source, 'not-authenticated');
});

test('OFFLINE supports fresh automatic reads after null or pending baselines and wide serials', () => {
  const f = fixture(); f.observations[2].sync.before = status(null);
  f.observations[4].sync.before.domainStates[0].status = 'pending';
  f.observations[4].sync.before.domainStates[0].pending = 1;
  const serial = '90071992547409931234567890'; f.binding.capturedTuple.globalSerial = serial;
  for (const i of [0, 4]) f.observations[i].roster = roster(f.binding.capturedTuple);
  assert.deepEqual(run(f), expectedResult);
});

const schemaPaths = ['', 'binding', 'binding.profile', 'binding.launcher', 'binding.runtime', 'binding.identities', 'binding.identities.a',
  'binding.originalGrants', 'binding.originalGrants.a', 'binding.bOnADeviceGrant', 'binding.capturedTuple', 'binding.bTuple',
  'observations.0', 'observations.0.actor', 'observations.0.peers', 'observations.0.peers.a2', 'observations.0.profile',
  'observations.0.originalGrants', 'observations.0.originalGrants.b', 'observations.0.bOnADeviceGrant',
  'observations.0.roster', 'observations.0.roster.pets.0', 'observations.0.roster.ui', 'observations.0.roster.ui.roster.0',
  'observations.1.logout', 'observations.1.logout.signOutPendingResult', 'observations.2.sync',
  'observations.2.sync.before', 'observations.2.sync.before.domainStates.0', 'observations.2.sync.after', 'observations.2.sync.after.domainStates.0'];
test('OFFLINE all schema objects reject missing and extra fields, including authority booleans and secrets', async t => {
  for (const path of schemaPaths) await t.test(path || 'root', () => {
    const get = f => path ? atPath(f, path) : f;
    rejects(f => { get(f).approved = true; });
    rejects(f => { get(f).password = 'must-not-appear-in-errors'; });
    rejects(f => { delete get(f)[Object.keys(get(f))[0]]; });
  });
  for (const key of ['accessToken', 'refreshToken', 'cloudProof', 'canonical', 'profilePath', 'image', 'credential', 'authorization', 'token'])
    rejects(f => { f.observations[2].actor[key] = '/private/must-not-appear'; });
});

test('OFFLINE malformed JSON shapes never invoke getters or accept hidden credential fields', () => {
  rejects(f => { f.observations[2].roster = null; });
  rejects(f => { f.binding.identities = []; });
  rejects(f => { f.observations.length = 6; });
  rejects(f => { f.observations.extra = true; });
  rejects(f => { f.binding.self = f; });
  rejects(f => { Object.setPrototypeOf(f.binding, { approved: true }); });
  rejects(f => { Object.defineProperty(f.binding, 'password', { value: 'secret', enumerable: false }); });
  rejects(f => { f.binding[Symbol('secret')] = 'secret'; });
  rejects(f => { Object.defineProperty(f.binding, 'run', { enumerable: true, get() { assert.fail('getter executed'); } }); });
  rejects(f => { f.binding.deadlineMs = NaN; });
});

test('OFFLINE rejects proxies and custom array prototypes before any attacker code runs', () => {
  let executed = 0;
  const trap = () => { executed++; throw new Error('RAW_PROXY_SECRET'); };
  const proxy = value => new Proxy(value, { ownKeys: trap, get: trap, getPrototypeOf: trap, getOwnPropertyDescriptor: trap });
  const assertSafe = value => assert.throws(() => validate(value, start + 3000), error => {
    assert.equal(error.code, 'C11_SWITCH_OBSERVATION_INVALID');
    assert.equal(error.message, 'Invalid C11 account-switch observations');
    assert.equal(Object.hasOwn(error, 'cause'), false);
    assert.equal(String(error.stack).includes('RAW_PROXY_SECRET'), false);
    return true;
  });
  assertSafe(proxy(fixture()));
  for (const path of ['binding', 'observations', 'observations.0.actor', 'observations.2.sync.after.domainStates']) {
    const f = fixture(), parts = path.split('.'), key = parts.pop(), parent = parts.reduce((o, part) => o[part], f);
    parent[key] = proxy(parent[key]); assertSafe(f);
  }
  const f = fixture(), prototype = Object.create(Array.prototype);
  prototype.entries = function () { executed++; return [][Symbol.iterator](); };
  Object.setPrototypeOf(f.observations, prototype); assertSafe(f);
  const nested = fixture(); Object.setPrototypeOf(nested.observations[0].roster.pets, prototype); assertSafe(nested);
  const revoked = Proxy.revocable({}, {}); revoked.revoke(); assertSafe(revoked.proxy);
  assert.equal(executed, 0);
});

test('OFFLINE fixed business window cannot exceed two hours even when every grant expires later', () => {
  const updateDeadline = (f, duration) => {
    f.binding.deadlineMs = start + duration;
    for (const grant of [...Object.values(f.binding.originalGrants), f.binding.bOnADeviceGrant]) grant.expiresAtMs = start + duration + 1000;
    for (const o of f.observations) {
      o.originalGrants = clone(f.binding.originalGrants); o.bOnADeviceGrant = clone(f.binding.bOnADeviceGrant);
    }
  };
  const f = fixture(); updateDeadline(f, 7200000); assert.deepEqual(run(f), expectedResult);
  rejects(value => updateDeadline(value, 7200001));
  rejects(value => updateDeadline(value, 14400000));
});

test('OFFLINE a consistently substituted scenario never replaces the original fixed namespace', () => {
  rejects(f => {
    f.binding.scenario = 'replacement-scenario';
    for (const grant of [...Object.values(f.binding.originalGrants), f.binding.bOnADeviceGrant]) grant.scenario = f.binding.scenario;
    for (const o of f.observations) {
      o.originalGrants = clone(f.binding.originalGrants); o.bOnADeviceGrant = clone(f.binding.bOnADeviceGrant);
    }
  });
});

test('OFFLINE binds exact phases, sequence, clock, run, commit, profile and original processes', () => {
  const changes = [
    f => { f.observations.pop(); }, f => { f.observations.reverse(); }, f => { f.observations[2].sequence = 2; },
    f => { f.observations[2].phase = 'a-returned'; }, f => { f.version = 2; },
    f => { f.binding.startedAtMs = start + 1001; }, f => { f.observations[0].observedAtMs = start - 1; },
    f => { f.observations[2].observedAtMs = f.observations[1].observedAtMs; },
    f => { f.observations[4].observedAtMs = f.binding.deadlineMs; }, f => { f.observations[0].observedAtMs = 1.5; },
    f => { f.observations[2].run = '654321'; }, f => { f.observations[2].commit = 'b'.repeat(40); },
    f => { f.observations[2].profile.canonicalPathSha256 = 'e'.repeat(64); }, f => { f.observations[2].profile.ino++; },
    f => { f.observations[2].profile.dev++; }, f => { f.observations[2].launcher.pid++; },
    f => { f.observations[2].runtime.startTicks = '638000000000000002'; },
    f => { f.observations[2].runtime.imagePathSha256 = 'e'.repeat(64); },
    f => { f.binding.profile.canonicalPathSha256 = '/private/profile'; }, f => { f.binding.commit = 'short'; },
  ];
  for (const change of changes) rejects(change);
  rejects(() => {}, start + 499); rejects(() => {}, -1); rejects(() => {}, Infinity);
});

test('OFFLINE requires exact owners/device, four epoch increments and new distinct B/A sessions', () => {
  for (const i of [0, 2, 4]) {
    for (const key of ['ownerAccountId', 'authUserId', 'deviceId']) rejects(f => { f.observations[i].actor[key] = key === 'ownerAccountId' ? 'account:' + uuid(99) : uuid(99); });
    rejects(f => { f.observations[i].actor.epoch++; });
    rejects(f => { f.observations[i].actor.sessionId = uuid(31); });
    rejects(f => { f.observations[i].persistence = 'secure'; });
  }
  for (let i = 0; i < 5; i++) {
    rejects(f => { f.observations[i].epoch++; }); rejects(f => { f.observations[i].deviceId = uuid(99); });
    rejects(f => { f.observations[i].dataMode = 'simulated'; });
  }
  rejects(f => { f.observations[4].actor.sessionId = f.observations[2].actor.sessionId; });
  rejects(f => { f.observations[2].actor.sessionId = f.observations[0].actor.sessionId; });
  rejects(f => { f.binding.identities.a2.ownerAccountId = 'account:' + uuid(99); });
  rejects(f => { f.binding.identities.b.authUserId = f.binding.identities.a.authUserId; });
});

test('OFFLINE requires bounded normal logout result observations for each exact previous session', () => {
  for (const i of [1, 3]) for (const change of [
    o => { o.actor = clone(fixture().observations[0].actor); }, o => { o.persistence = 'memory'; },
    o => { o.logout = null; }, o => { o.logout.signOutPendingResult.confirmed = false; },
    o => { o.logout.signOutPendingResult.confirmed = 'true'; }, o => { o.logout.previousSessionId = uuid(99); },
    o => { o.logout.confirmedAtMs = o.observedAtMs + 1; }, o => { o.logout.requestedAtMs = o.logout.confirmedAtMs + 1; },
    o => { o.logout.requestedAtMs = start; }, o => { o.roster = roster(fixture().binding.capturedTuple); },
    o => { o.sync = {}; },
  ]) rejects(f => change(f.observations[i]));
});

test('OFFLINE preserves all five original grants/four peers and requires independent B on original A device', () => {
  for (const i of [0, 1, 2, 3, 4]) {
    for (const role of roles) rejects(f => { f.observations[i].originalGrants[role].expiresAtMs++; });
    for (const role of roles.slice(1)) for (const key of ['ownerAccountId', 'authUserId', 'deviceId', 'sessionId', 'epoch'])
      rejects(f => { f.observations[i].peers[role][key] = key === 'epoch' ? 8 : key === 'ownerAccountId' ? 'account:' + uuid(99) : uuid(99); });
    rejects(f => { f.observations[i].bOnADeviceGrant.expiresAtMs++; });
  }
  for (const role of roles) rejects(f => { f.binding.originalGrants[role].expiresAtMs = f.binding.deadlineMs - 1; });
  for (const change of [
    f => { f.binding.bOnADeviceGrant = clone(f.binding.originalGrants.b); },
    f => { f.binding.bOnADeviceGrant = clone(f.binding.originalGrants.a); },
    f => { f.binding.bOnADeviceGrant.expiresAtMs = f.binding.deadlineMs - 1; },
    f => { f.binding.bOnADeviceGrant.scenario = 'other'; },
    f => { f.binding.bOnADeviceGrant = { approved: true }; },
  ]) rejects(change);
});

test('OFFLINE both B and returned A require later completed automatic cloud readback, never stale/failed status', () => {
  for (const i of [2, 4]) for (const change of [
    s => { s.authenticatedAtMs = start; }, s => { s.baselineObservedAtMs = s.authenticatedAtMs - 1; },
    s => { s.after = clone(s.before); }, s => { s.after = status(s.baselineObservedAtMs); },
    s => { s.after = status(start + 900); }, s => { s.before = status(start + 900); },
    s => { s.after.running = true; }, s => { s.after.pending = 1; }, s => { s.after.lastCloudCheckedAt = null; },
    s => { s.after.mode = 'local'; }, s => { s.after.lastCloudCheckedAt = '2026-11-05'; },
    s => { s.after.domainStates[0].checkedAt = s.before.lastCloudCheckedAt; },
    s => { s.after.domainStates[0].domain = 'garden'; }, s => { s.after.domainStates.push(clone(s.after.domainStates[0])); },
    s => { s.after.domainStates[0].pending = 1; }, s => { s.after.domainStates[0].status = 'partial'; },
    s => { s.after.domainStates[0].error = 'CLOUD_UNAVAILABLE'; }, s => { s.after.domainStates[0].metadataWarning = true; },
    s => { s.before.domainStates[0].error = 'raw secret or error detail'; },
  ]) rejects(f => change(f.observations[i].sync));
});

test('OFFLINE B cannot expose A private pet and returned A must keep original exact tuple/visible number', () => {
  rejects(f => { f.observations[2].roster.pets.push(clone(f.binding.capturedTuple)); });
  rejects(f => { f.observations[2].roster.ui.roster.push({ petId: f.binding.capturedTuple.petId, numbers: ['编号 0007'] }); });
  rejects(f => { f.observations[2].roster.pets[0].petId = f.binding.capturedTuple.petId; });
  for (const i of [0, 2, 4]) {
    for (const key of ['ownerAccountId', 'petId', 'templateId', 'globalSerial']) rejects(f => { f.observations[i].roster.pets[0][key] = key === 'ownerAccountId' ? 'account:' + uuid(99) : key === 'globalSerial' ? '8' : 'other'; });
    for (const number of ['7', '编号 7', '编号 0008', '', 7]) rejects(f => { f.observations[i].roster.ui.roster[0].numbers = [number]; });
    rejects(f => { f.observations[i].roster.ui.roster = []; });
    rejects(f => { f.observations[i].roster.pets.push(clone(f.observations[i].roster.pets[0])); });
    rejects(f => { f.observations[i].roster.ui.roster.push(clone(f.observations[i].roster.ui.roster[0])); });
    for (const key of ['routeMatches', 'currentRouteMatches', 'surfaceReady']) rejects(f => { f.observations[i].roster.ui[key] = false; });
    for (const key of ['visibleAlertCount', 'openingCount']) rejects(f => { f.observations[i].roster.ui[key] = 1; });
  }
  for (const serial of [7, '07', '0', '-1', '1.0', '1e3', '']) rejects(f => { f.binding.capturedTuple.globalSerial = serial; });
});

test('OFFLINE every observed A/B pet ID retains its owner, including non-target and owner-relabelled pets', () => {
  function add(o, pet) {
    o.roster.pets.push(pet); o.roster.ui.roster.push({ petId: pet.petId, numbers: ['编号 ' + pet.globalSerial.padStart(4, '0')] });
  }
  for (const i of [0, 4]) rejects(f => add(f.observations[i], { ...f.binding.bTuple, ownerAccountId: f.binding.identities.a.ownerAccountId }));
  rejects(f => {
    add(f.observations[0], { ...f.binding.capturedTuple, petId: 'additional-a' });
    add(f.observations[2], { ...f.binding.bTuple, petId: 'additional-a' });
  });
  rejects(f => {
    add(f.observations[2], { ...f.binding.bTuple, petId: 'additional-b' });
    add(f.observations[4], { ...f.binding.capturedTuple, petId: 'additional-b' });
  });
  const f = fixture();
  for (const i of [0, 4]) add(f.observations[i], { ...f.binding.capturedTuple, petId: 'additional-a' });
  add(f.observations[2], { ...f.binding.bTuple, petId: 'additional-b' });
  assert.deepEqual(run(f), expectedResult);
});
