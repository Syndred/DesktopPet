// Offline assertion contract only. This module neither samples nor authenticates
// observations, authorizes actions, grants access, logs in, nor calls a service.
// A future separately authorized sampler must project real product observations
// into this schema. In particular, signOutPendingResult is merely reported data,
// not proof that the normal logout path ran. No input boolean confers authority.
// Profile/process path digests are SHA-256 of the sampler's exact canonical path;
// dev/ino and pid/startTicks come from its existing owned-profile/process checks.
// sync.before/after project syncStatus to the companions domain only. UI projects
// the existing readC11UiSample roster fields. This is not a new production API.
import { types } from 'node:util';

const roles = ['a', 'a2', 'a3', 'b', 'c'];
const peers = roles.slice(1);
const phases = ['a-before', 'signedout-after-a', 'b-active', 'signedout-after-b', 'a-returned'];
const actorKeys = ['ownerAccountId', 'authUserId', 'deviceId', 'sessionId', 'epoch'];
const grantKeys = ['ownerAccountId', 'authUserId', 'deviceId', 'scenario', 'expiresAtMs'];
const fail = () => { throw Object.assign(new Error('Invalid C11 account-switch observations'), { code: 'C11_SWITCH_OBSERVATION_INVALID' }); };
const check = value => { if (!value) fail(); };
const integer = value => check(Number.isSafeInteger(value) && value >= 0);
const time = value => { integer(value); check(value > 0); };
const match = (value, pattern) => check(typeof value === 'string' && pattern.test(value));
const id = value => match(value, /^[A-Za-z0-9:_-]{1,180}$/);
const uuid = value => match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const owner = value => { match(value, /^account:/); uuid(value.slice(8)); };
const hash = value => match(value, /^[a-f0-9]{64}$/);

// Require plain JSON data, no getters, inherited fields, symbols, sparse arrays,
// or extra properties. Errors deliberately never include actual/expected input.
function json(value, seen = new Set()) {
  check(!types.isProxy(value));
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { check(Number.isFinite(value)); return; }
  check(typeof value === 'object' && !seen.has(value) && seen.size < 20); seen.add(value);
  if (Array.isArray(value)) {
    check(Object.getPrototypeOf(value) === Array.prototype);
    check(value.length <= 10000 && Reflect.ownKeys(value).length === value.length + 1);
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      check(d && Object.hasOwn(d, 'value') && d.enumerable); json(d.value, seen);
    }
  } else {
    check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    for (const key of Reflect.ownKeys(value)) {
      check(typeof key === 'string'); const d = Object.getOwnPropertyDescriptor(value, key);
      check(d && Object.hasOwn(d, 'value') && d.enumerable); json(d.value, seen);
    }
  }
  seen.delete(value);
}
function exact(value, keys) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value));
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  check(actual.length === expected.length && actual.every((key, i) => key === expected[i]));
}
function equal(a, b) {
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { check(a === b); return; }
  check(Array.isArray(a) === Array.isArray(b));
  const keys = Object.keys(a); check(keys.length === Object.keys(b).length);
  for (const key of keys) { check(Object.hasOwn(b, key)); equal(a[key], b[key]); }
}
function profile(value) { exact(value, ['canonicalPathSha256', 'dev', 'ino']); hash(value.canonicalPathSha256); integer(value.dev); integer(value.ino); }
function processIdentity(value) { exact(value, ['pid', 'startTicks', 'imagePathSha256']); time(value.pid); match(value.startTicks, /^[1-9][0-9]{0,18}$/); hash(value.imagePathSha256); }
function actor(value) {
  exact(value, actorKeys); owner(value.ownerAccountId);
  for (const key of ['authUserId', 'deviceId', 'sessionId']) uuid(value[key]); integer(value.epoch);
}
function grant(value, identity, scenario, deadline) {
  exact(value, grantKeys); for (const key of ['ownerAccountId', 'authUserId', 'deviceId']) equal(value[key], identity[key]);
  equal(value.scenario, scenario); time(value.expiresAtMs); check(value.expiresAtMs >= deadline);
}
function tuple(value) {
  exact(value, ['ownerAccountId', 'petId', 'templateId', 'globalSerial']); owner(value.ownerAccountId);
  id(value.petId); id(value.templateId); match(value.globalSerial, /^[1-9][0-9]*$/);
}
function timestamp(value) {
  check(typeof value === 'string'); const n = Date.parse(value);
  check(Number.isSafeInteger(n) && n > 0 && new Date(n).toISOString() === value); return n;
}
function syncStatus(value, observedAtMs) {
  exact(value, ['mode', 'running', 'pending', 'lastCloudCheckedAt', 'domainStates']);
  equal(value.mode, 'cloud-authority'); check(typeof value.running === 'boolean'); integer(value.pending);
  const at = value.lastCloudCheckedAt === null ? null : timestamp(value.lastCloudCheckedAt); if (at !== null) check(at <= observedAtMs);
  check(Array.isArray(value.domainStates) && value.domainStates.length === 1); const d = value.domainStates[0];
  exact(d, ['domain', 'checkedAt', 'status', 'pending', 'error', 'metadataWarning']); equal(d.domain, 'companions');
  if (d.checkedAt !== null) check(timestamp(d.checkedAt) <= observedAtMs);
  check(['ready', 'partial', 'blocked', 'offline', 'conflict', 'error', 'pending'].includes(d.status)); integer(d.pending);
  check(d.error === null || typeof d.error === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(d.error));
  check(typeof d.metadataWarning === 'boolean'); return at;
}
function freshAutomaticSync(value, previousAtMs, observedAtMs) {
  exact(value, ['authenticatedAtMs', 'baselineObservedAtMs', 'before', 'after']);
  time(value.authenticatedAtMs); time(value.baselineObservedAtMs);
  check(previousAtMs < value.authenticatedAtMs && value.authenticatedAtMs <= value.baselineObservedAtMs && value.baselineObservedAtMs < observedAtMs);
  const before = syncStatus(value.before, value.baselineObservedAtMs), after = syncStatus(value.after, observedAtMs);
  check(after !== null && after > value.baselineObservedAtMs && (before === null || after > before));
  const d = value.after.domainStates[0];
  check(!value.after.running && value.after.pending === 0 && d.checkedAt === value.after.lastCloudCheckedAt
    && d.status === 'ready' && d.pending === 0 && d.error === null && d.metadataWarning === false);
}
function roster(value, expected, forbiddenPetIds) {
  exact(value, ['ownerAccountId', 'pets', 'ui']); equal(value.ownerAccountId, expected.ownerAccountId);
  check(Array.isArray(value.pets) && value.pets.length > 0);
  const pets = new Map(); for (const pet of value.pets) {
    tuple(pet); equal(pet.ownerAccountId, expected.ownerAccountId); check(!pets.has(pet.petId) && !forbiddenPetIds.has(pet.petId)); pets.set(pet.petId, pet);
  }
  equal(pets.get(expected.petId), expected);
  const ui = value.ui; exact(ui, ['routeMatches', 'currentRouteCount', 'currentRouteMatches', 'visibleAlertCount', 'openingCount', 'surfaceReady', 'roster']);
  for (const key of ['routeMatches', 'currentRouteMatches', 'surfaceReady']) equal(ui[key], true);
  equal(ui.currentRouteCount, 1); equal(ui.visibleAlertCount, 0); equal(ui.openingCount, 0);
  check(Array.isArray(ui.roster)); const visible = new Set();
  for (const card of ui.roster) {
    exact(card, ['petId', 'numbers']); id(card.petId); check(!visible.has(card.petId) && !forbiddenPetIds.has(card.petId) && pets.has(card.petId)); visible.add(card.petId);
    check(Array.isArray(card.numbers) && card.numbers.length === 1); equal(card.numbers[0], '编号 ' + pets.get(card.petId).globalSerial.padStart(4, '0'));
  }
  check(visible.has(expected.petId));
  return new Set(pets.keys());
}

/** Verifies consistency of supplied observations, never their origin or authority.
 * nowMs is the verifier's observation time; historical transcripts may be checked
 * after expiry, but all sampled stages must precede the original fixed deadline.
 * Return/error values contain no caller paths, credentials, actors or evidence.
 */
function validateObservations(input, nowMs) {
  json(input); time(nowMs); exact(input, ['version', 'binding', 'observations']); equal(input.version, 1);
  const b = input.binding;
  exact(b, ['run', 'commit', 'scenario', 'startedAtMs', 'deadlineMs', 'profile', 'launcher', 'runtime', 'identities', 'originalGrants', 'bOnADeviceGrant', 'capturedTuple', 'bTuple']);
  match(b.run, /^[1-9][0-9]{0,19}$/); match(b.commit, /^[a-f0-9]{40}$/); equal(b.scenario, 'cloud-acceptance-20261027-8be246d1');
  time(b.startedAtMs); time(b.deadlineMs); check(b.startedAtMs < b.deadlineMs && b.deadlineMs - b.startedAtMs <= 7200000);
  profile(b.profile); processIdentity(b.launcher); processIdentity(b.runtime); check(b.launcher.pid !== b.runtime.pid);
  exact(b.identities, roles); exact(b.originalGrants, roles);
  for (const role of roles) { actor(b.identities[role]); grant(b.originalGrants[role], b.identities[role], b.scenario, b.deadlineMs); }
  for (const role of ['a2', 'a3']) for (const key of ['ownerAccountId', 'authUserId']) equal(b.identities[role][key], b.identities.a[key]);
  for (const key of ['ownerAccountId', 'authUserId']) check(new Set(['a', 'b', 'c'].map(role => b.identities[role][key])).size === 3);
  for (const key of ['deviceId', 'sessionId']) check(new Set(roles.map(role => b.identities[role][key])).size === 5);
  const bOnA = { ...b.identities.b, deviceId: b.identities.a.deviceId };
  grant(b.bOnADeviceGrant, bOnA, b.scenario, b.deadlineMs);
  tuple(b.capturedTuple); tuple(b.bTuple); equal(b.capturedTuple.ownerAccountId, b.identities.a.ownerAccountId);
  equal(b.bTuple.ownerAccountId, b.identities.b.ownerAccountId); check(b.bTuple.petId !== b.capturedTuple.petId);
  check(Array.isArray(input.observations) && input.observations.length === phases.length);
  const aPets = new Set([b.capturedTuple.petId]), bPets = new Set([b.bTuple.petId]);
  const sessions = new Set(roles.map(role => b.identities[role].sessionId)); let previous = null;
  for (const [i, o] of input.observations.entries()) {
    exact(o, ['sequence', 'phase', 'observedAtMs', 'run', 'commit', 'profile', 'launcher', 'runtime', 'deviceId', 'epoch', 'dataMode', 'persistence', 'actor', 'logout', 'sync', 'roster', 'peers', 'originalGrants', 'bOnADeviceGrant']);
    equal(o.sequence, i + 1); equal(o.phase, phases[i]); time(o.observedAtMs);
    check(o.observedAtMs >= b.startedAtMs && o.observedAtMs < b.deadlineMs && o.observedAtMs <= nowMs && (!previous || o.observedAtMs > previous.observedAtMs));
    for (const key of ['run', 'commit', 'profile', 'launcher', 'runtime', 'originalGrants', 'bOnADeviceGrant']) equal(o[key], b[key]);
    equal(o.deviceId, b.identities.a.deviceId); equal(o.epoch, b.identities.a.epoch + i); equal(o.dataMode, 'live');
    exact(o.peers, peers); for (const role of peers) equal(o.peers[role], b.identities[role]);
    if (i === 1 || i === 3) {
      equal(o.actor, null); equal(o.persistence, 'none'); equal(o.sync, null); equal(o.roster, null);
      exact(o.logout, ['requestedAtMs', 'confirmedAtMs', 'previousSessionId', 'signOutPendingResult']);
      time(o.logout.requestedAtMs); time(o.logout.confirmedAtMs);
      check(o.logout.requestedAtMs > previous.observedAtMs && o.logout.requestedAtMs <= o.logout.confirmedAtMs && o.logout.confirmedAtMs <= o.observedAtMs);
      equal(o.logout.previousSessionId, previous.actor.sessionId); exact(o.logout.signOutPendingResult, ['confirmed']); equal(o.logout.signOutPendingResult.confirmed, true);
    } else {
      equal(o.logout, null); equal(o.persistence, 'memory'); actor(o.actor); equal(o.actor.epoch, o.epoch);
      const expected = i === 2 ? bOnA : b.identities.a;
      for (const key of ['ownerAccountId', 'authUserId', 'deviceId']) equal(o.actor[key], expected[key]);
      if (i === 0) { equal(o.actor, expected); equal(o.sync, null); }
      else { check(!sessions.has(o.actor.sessionId)); sessions.add(o.actor.sessionId); freshAutomaticSync(o.sync, previous.observedAtMs, o.observedAtMs); }
      const observedPets = roster(o.roster, i === 2 ? b.bTuple : b.capturedTuple, i === 2 ? aPets : bPets);
      for (const petId of observedPets) (i === 2 ? bPets : aPets).add(petId);
    }
    previous = o;
  }
  return Object.freeze({ scope: 'assertion-only', source: 'not-authenticated', fullCasePassed: false });
}

export function assertC11AccountSwitchObservations(input, nowMs) {
  try { return validateObservations(input, nowMs); }
  catch { fail(); } // Do not expose attacker-controlled errors, input or causes.
}
