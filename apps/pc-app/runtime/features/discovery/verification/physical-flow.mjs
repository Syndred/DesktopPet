// Production main, actual Windows positioning, one shared battlefield and SQLite.
// No QA adapter, supplied coordinates, battle preset, random override or fake result.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const source = resolve('.'), output = resolve(`artifacts/discovery/physical-${Date.now()}`), profile = join(output, 'profile');
const preflight = process.argv.includes('--preflight');
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: profile };
for (const key of ['ELECTRON_RUN_AS_NODE', 'PET_RUNTIME_DATA_FILE', 'LINGJING_QA_SCENARIO', 'LINGJING_CONTROLLED_LOCATION', 'LINGJING_BATTLE_QA', 'LINGJING_DISCOVERY_CLOUD']) delete env[key];
const evidence = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  build: JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8')), productionMain: true, controlledPosition: false,
  rawCoordinatesCommitted: false, preflightOnly: preflight, physicalLocationAcceptance: false, systemSamples: [], attempts: [], rendererErrors: [] };
let app, page;
const login = { provider: 'local', account: 'physical_capture_test', password: `Native-${randomUUID()}!`, rememberSession: false };
async function invoke(feature, command, payload = {}) {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, `${feature}.${command}: ${JSON.stringify(result)}`); return result.data;
}
const snapshot = () => invoke('discovery', 'snapshot');
async function launch() {
  app = await electron.launch({ args: [source], cwd: source, env });
  page = await app.firstWindow(); page.on('pageerror', error => evidence.rendererErrors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
}
async function until(predicate, label, milliseconds = 25000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { const state = await snapshot(); if (predicate(state)) return state; await page.waitForTimeout(100); }
  throw new Error(`State did not converge: ${label}`);
}
function recordSystem(location, phase) {
  const fix = location.fix;
  const sample = { phase, at: new Date().toISOString(), status: location.status, permission: location.permission, provider: fix?.provider,
    source: fix?.source, positionSource: fix?.positionSource, accuracyMeters: fix?.accuracyMeters, timestampMs: fix?.timestampMs,
    coordinateHash: fix ? createHash('sha256').update(`${fix.lat},${fix.lng}`).digest('hex') : null, error: location.lastError };
  evidence.systemSamples.push(sample); assert.equal(location.mode, 'real');
  if (fix) { assert.equal(fix.source, 'os'); assert.equal(fix.provider, 'windows-geolocator'); assert.equal(location.permission, 'granted'); }
  console.log(`Native sample ${phase}: ${sample.status}, ${fix?.accuracyMeters ?? 'no fix'}m`); return sample;
}
async function freshNative(phase, request = true) {
  // The compact shared battlefield has no discovery location toolbar. The public
  // real locate command still obeys the opted-in foreground privacy boundary.
  if (request) await page.evaluate(() => window.lingjing.invoke('discovery', 'locate'));
  const deadline = Date.now() + 60000; let previous;
  while (Date.now() < deadline) {
    const state = await snapshot(), location = state.location, identity = JSON.stringify([location.status, location.fix?.timestampMs]);
    assert.equal(state.scenario, 'live');
    if (location.status !== 'locating' && identity !== previous) { recordSystem(location, phase); previous = identity; }
    if (location.status === 'ready') { assert.ok(location.fix.accuracyMeters <= 80); return state; }
    assert.ok(!['denied', 'privacy_disabled', 'unavailable'].includes(location.status), `System location is ${location.status}`);
    assert.equal(location.watching, true, 'Only the existing opt-in native watch may wait for precision');
    await page.waitForTimeout(250);
  }
  throw new Error(`No precise OS fix within the bounded60s native watch: ${phase}`);
}
async function map() {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.locator('.discovery-main-heading').waitFor();
}
async function startChallenge(state, playerId) {
  const visibleIds = new Set(state.spawns.slice(0, 8).map(spawn => spawn.id));
  const options = state.spawns.filter(spawn => visibleIds.has(spawn.id) && spawn.inRange && spawn.captureState === 'available');
  const target = options.find(spawn => spawn.element === 'fire') || options[0]; assert.ok(target, 'Actual generated point must be within the OS-validated geofence');
  await page.locator('.discovery-map[data-map-ready="true"]').waitFor();
  await page.getByRole('button', { name: '地图回到当前位置', exact: true }).click();
  await page.locator(`.discovery-pin-button[data-spawn-id="${target.id}"]`).click();
  await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
  await page.locator('.discovery-wild-view').waitFor();
  await page.getByRole('combobox', { name: '当前挑战伙伴', exact: true }).click();
  await page.getByRole('option').filter({ hasText: '原生定位出战伙伴' }).click();
  await page.getByRole('button', { name: '开始挑战', exact: true }).click();
  const screen = page.locator('[data-battle-screen="shared-v1"][data-battle-mode="wild"]'); await screen.waitFor();
  const linked = await until(value => value.encounters.some(item => item.status === 'challenging'), 'native encounter');
  const current = linked.encounters.find(item => item.status === 'challenging');
  assert.equal(current.petId, playerId); assert.equal(current.scenario, 'live'); assert.equal(current.spawn.resourceId, target.resourceId);
  assert.equal(await screen.getAttribute('data-session-id'), current.battle.battleId); assert.equal(await screen.getAttribute('data-authority'), 'local');
  assert.equal(await page.locator('.discovery-arena,.discovery-battle-actions').count(), 0);
  assert.equal(linked.location.watching, true, 'Explicit foreground watch survives the shared encounter route');
  return { current, target, session: await invoke('battle', 'snapshot', { sessionId: current.battle.battleId }) };
}
async function play(session) {
  const action = session.snapshot.player.anger >= session.rules.ultimateAnger ? 'ultimate' : session.snapshot.enemy.anger >= 70 ? 'element_attack' : 'normal_attack';
  await page.locator(`.battle-move.${action}`).click();
  await page.waitForFunction(key => document.querySelector('[data-animation-key]')?.getAttribute('data-animation-key') === key, `${session.id}:${session.snapshot.round + 1}`);
  await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  const result = await invoke('battle', 'snapshot', { sessionId: session.id }); assert.equal(result.snapshot.round, session.snapshot.round + 1); return result;
}
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
try {
  await launch();
  evidence.entry = await app.evaluate(({ app }) => ({ appPath: app.getAppPath(), electron: process.versions.electron, verificationHostPresent: Boolean(global.__discoveryVerification) }));
  assert.equal(evidence.entry.verificationHostPresent, false); assert.equal((await invoke('app', 'info')).scenario, undefined);
  await invoke('accounts', 'register', { ...login, confirmPassword: login.password, username: '系统位置收服验证' });
  const settings = await invoke('accounts', 'settingsGet'); settings.document.privacy.locationAllowed = true;
  await invoke('accounts', 'settingsSave', { revision: settings.revision, document: settings.document, actionId: randomUUID() });
  const adoption = await invoke('companions', 'adopt', { templateId: 'big-fish-gentle', name: '原生定位出战伙伴', showOnDesktop: false, actionId: randomUUID() });
  await map();
  await page.getByRole('button', { name: '探索设置', exact: true }).click();
  await page.getByRole('switch', { name: '探索时持续更新位置', exact: true }).click();
  const initial = await until(state => state.location.watching && state.location.status !== 'locating', 'native watch'); await page.keyboard.press('Escape');
  if (preflight) {
    const sample = recordSystem(initial.location, 'production preflight');
    assert.equal(sample.source, 'os', 'Native preflight requires an actual Windows fix');
    evidence.providerReadVerified = true; evidence.precise = initial.location.status === 'ready';
    evidence.scope = 'Actual production privacy/foreground/native-provider read only; no challenge or capture attempted';
    assert.equal((await invoke('discovery', 'stopWatch')).location.watching, false); evidence.watchStopped = true;
    assert.deepEqual(evidence.rendererErrors, []); save();
    console.log(JSON.stringify({ providerReadVerified: true, precise: evidence.precise, accuracyMeters: sample.accuracyMeters, physicalLocationAcceptance: false, output }));
  } else {
    let state = await freshNative('before challenge', false), active;
    const beforePetCount = state.pets.length;
    for (let attempt = 1; attempt <= 3; attempt++) {
      active = await startChallenge(state, adoption.pet.petId);
      for (let turn = 0; turn < 90 && active.session.status === 'active'; turn++) active.session = await play(active.session);
      const { current, target, session } = active;
      evidence.attempts.push({ attempt, encounterId: current.encounterId, battleId: session.id, templateId: target.templateId, resourceId: target.resourceId,
        rounds: session.snapshot.round, status: session.status, winner: session.winner }); save();
      assert.equal(session.status, 'finished', 'Bounded actual combat must reach a terminal state');
      if (session.winner === 'player') break;
      assert.ok(attempt < 3, 'No physical capture without an actual won challenge');
      await page.getByRole('button', { name: '返回', exact: true }).click(); await page.locator('.discovery-main-heading').waitFor();
      state = await freshNative('retry challenge');
    }
    const { current, target, session } = active; assert.equal(session.winner, 'player');
    await freshNative('before confirmation');
    await page.getByRole('button', { name: '收服', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '收服伙伴', exact: true });
    await dialog.getByRole('textbox', { name: '昵称', exact: true }).fill('真实相遇伙伴');
    await dialog.getByRole('button', { name: '确认', exact: true }).click(); await page.locator('.discovery-result').waitFor();
    const after = await snapshot(), capture = after.captures.find(item => item.encounterId === current.encounterId);
    assert.ok(capture); assert.equal(after.pets.length, beforePetCount + 1); assert.equal(capture.resourceId, target.resourceId);
    assert.equal(capture.validation, 'local-os'); assert.equal(capture.scenario, 'live'); assert.equal(capture.scenarioId, undefined);
    const duplicate = await invoke('battle', 'settleContext', { sessionId: session.id, actionId: randomUUID(), name: capture.name });
    assert.equal(duplicate.petId, capture.petId); assert.equal((await snapshot()).pets.length, after.pets.length);
    const pet = await invoke('companions', 'get', { petId: capture.petId }), memories = await invoke('discovery', 'memories', { petId: capture.petId });
    assert.equal(pet.resource.resourceId, target.resourceId); assert.equal(pet.origin.battleId, session.id); assert.equal(memories.length, 1);
    await page.locator('.discovery-postcard .resource-stage[data-status="ready"] canvas').waitFor();
    await page.screenshot({ path: join(output, 'capture-result-no-location-map.png') });
    assert.equal((await invoke('discovery', 'pokedex')).find(item => item.petId === capture.petId)?.resourceId, target.resourceId);
    evidence.capture = { petId: capture.petId, encounterId: capture.encounterId, ownerAccountId: capture.ownerAccountId, battleId: session.id,
      resourceId: capture.resourceId, templateId: capture.templateId, element: capture.element, validation: capture.validation, scenario: capture.scenario,
      distanceMeters: capture.distanceMeters, duplicateReturnsSamePetId: true, backpackMatches: true, pokedexMatches: true, memoryCount: memories.length };
    await app.close(); app = null;
    const require = createRequire(import.meta.url);
    const readback = spawnSync(require('electron'), [resolve('apps/pc-app/runtime/features/discovery/verification/read-capture.cjs'), join(profile, 'lingjing.sqlite'), capture.petId, capture.encounterId],
      { cwd: source, encoding: 'utf8', windowsHide: true, env: { ...env, ELECTRON_RUN_AS_NODE: '1' } });
    assert.equal(readback.status, 0, readback.stderr); evidence.sqlite = JSON.parse(readback.stdout.trim());
    assert.equal(evidence.sqlite.ownerAccountId, capture.ownerAccountId); assert.equal(evidence.sqlite.battleId, session.id);
    for (const field of ['captures', 'ownedInstances', 'memories', 'matchingBattleReports', 'matchingCompanionReceipts']) assert.equal(evidence.sqlite[field], 1);
    await launch(); assert.equal((await invoke('accounts', 'session')).currentUser, null); await invoke('accounts', 'login', login);
    await map(); const restored = await snapshot();
    assert.equal(restored.captures.find(item => item.encounterId === current.encounterId)?.petId, capture.petId);
    assert.equal(restored.location.fix, null); assert.equal(restored.location.watching, false);
    evidence.restart = { explicitLogin: true, samePetId: true, currentLocationNotPersisted: true, watchNotRestored: true };
    assert.deepEqual(evidence.rendererErrors, []); evidence.passed = true; evidence.physicalLocationAcceptance = true; save();
    console.log(JSON.stringify({ passed: true, physicalLocationAcceptance: true, output, samples: evidence.systemSamples, capture: evidence.capture, sqlite: evidence.sqlite, restart: evidence.restart }));
  }
} catch (error) {
  evidence.physicalLocationAcceptance = false; evidence.error = error.message; save();
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure-private-location.png') }).catch(() => {});
  throw error;
} finally { if (app) await app.close(); }
