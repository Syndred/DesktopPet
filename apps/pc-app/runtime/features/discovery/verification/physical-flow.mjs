// Actual production entry, native Windows positioning and registered services.
// No adapter, coordinates, battle RNG or result is replaced by this verifier.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const output = resolve(`artifacts/discovery/physical-${Date.now()}`), profile = join(output, 'profile');
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_CONTROLLED_LOCATION; delete env.LINGJING_DISCOVERY_CLOUD;
const evidence = { at: new Date().toISOString(), productionMain: true, controlledPosition: false, rawCoordinatesCommitted: false, systemSamples: [], rendererErrors: [] };
let app = await electron.launch({ args: [resolve('.')], env }), page;
const invoke = (feature, command, payload = {}) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function snapshot() { const result = await invoke('discovery', 'snapshot'); assert.equal(result.ok, true, result.message); return result.data; }
async function mainWindow() {
  for (let attempt = 0; attempt < 150; attempt++) {
    page = app.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('/desktop/'));
    if (page) { page.on('pageerror', error => evidence.rendererErrors.push(error.message)); await page.waitForFunction(() => Boolean(window.lingjing)); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Production main UI did not appear');
}
async function until(predicate, label, milliseconds = 25000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) { const state = await snapshot(); if (predicate(state)) return state; await page.waitForTimeout(100); }
  throw new Error(`State did not converge: ${label}`);
}
function recordSystem(location, phase) {
  const fix = location.fix;
  const sample = { phase, at: new Date().toISOString(), status: location.status, permission: location.permission, provider: fix?.provider, source: fix?.source, positionSource: fix?.positionSource, accuracyMeters: fix?.accuracyMeters, timestampMs: fix?.timestampMs, coordinateHash: fix ? createHash('sha256').update(`${fix.lat},${fix.lng}`).digest('hex') : null, error: location.lastError };
  evidence.systemSamples.push(sample);
  assert.equal(location.mode, 'real');
  if (fix) { assert.equal(fix.source, 'os'); assert.equal(fix.provider, 'windows-geolocator'); assert.notEqual(fix.positionSource, 'test-fixture'); }
  console.log(`Native sample ${phase}: ${sample.status}, ${fix?.accuracyMeters ?? 'no fix'}m`);
}
async function freshNative(phase, request = true) {
  if (request) await page.getByRole('button', { name: '获取系统位置', exact: true }).click();
  const deadline = Date.now() + 60000; let previous;
  while (Date.now() < deadline) {
    const state = await snapshot(), location = state.location;
    const identity = JSON.stringify([location.status, location.fix?.timestampMs]);
    if (location.status !== 'locating' && identity !== previous) { recordSystem(location, phase); previous = identity; }
    if (location.status === 'ready') { assert.ok(location.fix.accuracyMeters <= 80); return state; }
    assert.ok(!['denied', 'privacy_disabled'].includes(location.status), `System location is ${location.status}`);
    assert.equal(location.watching, true, 'Only the existing opt-in native watch may wait for precision');
    await page.waitForTimeout(250);
  }
  throw new Error(`No precise OS fix within the bounded60s native watch: ${phase}`);
}
try {
  await mainWindow();
  evidence.entry = await app.evaluate(({ app }) => ({ appPath: app.getAppPath(), electron: process.versions.electron, verificationHostPresent: Boolean(global.__discoveryVerification) }));
  assert.equal(evidence.entry.verificationHostPresent, false);
  const registered = await invoke('accounts', 'register', { provider: 'local', account: 'physical_capture_test', password: 'isolated-native-verification-only', confirmPassword: 'isolated-native-verification-only', username: '系统位置收服验证', rememberSession: true });
  assert.equal(registered.ok, true, registered.message);
  const settings = await invoke('accounts', 'settingsGet'); assert.equal(settings.ok, true);
  settings.data.document.privacy.locationAllowed = true;
  const saved = await invoke('accounts', 'settingsSave', { revision: settings.data.revision, document: settings.data.document, actionId: randomUUID() }); assert.equal(saved.ok, true, saved.message);
  const adopted = await invoke('companions', 'adopt', { templateId: 'big-fish-gentle', name: '原生定位出战伙伴', showOnDesktop: false, actionId: randomUUID() }); assert.equal(adopted.ok, true, adopted.message);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
  await page.getByRole('button', { name: '探索设置', exact: true }).click();
  await page.getByRole('switch', { name: '探索时持续更新位置', exact: true }).click();
  await until(state => state.location.watching && state.location.status !== 'locating', 'native watch'); await page.keyboard.press('Escape');
  const initial = await freshNative('before challenge', false);
  console.log(`Actual Windows location: ${initial.location.fix.accuracyMeters}m`);
  const options = initial.spawns.filter(spawn => spawn.inRange && spawn.captureState === 'available');
  const target = options.find(spawn => spawn.element === 'fire') || options.find(spawn => spawn.element === 'water') || options[0];
  assert.ok(target, 'Actual generated point exists within the OS-validated geofence');
  evidence.target = { templateId: target.templateId, resourceId: target.resourceId, element: target.element, source: target.source, inRange: target.inRange, distanceMeters: target.distanceMeters };
  await page.locator(`.discovery-pin-button[data-spawn-id="${target.id}"]`).click();
  await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
  await page.getByRole('heading', { name: `在附近，遇见了${target.name}。`, exact: true }).waitFor();
  const before = await snapshot();
  const player = before.pets.find(pet => pet.petId === adopted.data.pet.petId); assert.ok(player);
  await page.getByRole('combobox', { name: '当前挑战伙伴', exact: true }).press('ArrowDown');
  await page.getByRole('option', { name: /原生定位出战伙伴/ }).click();
  await page.getByRole('button', { name: '开始挑战', exact: true }).click(); await page.locator('.discovery-arena').waitFor();
  let state = await until(state => state.encounters.some(encounter => encounter.status === 'challenging'), 'native encounter');
  let current = state.encounters.find(encounter => encounter.status === 'challenging'), attempts = 1;
  for (let turn = 0; turn < 240 && current.status !== 'won'; turn++) {
    if (current.status === 'lost') {
      assert.ok(attempts++ < 3, 'Bounded native challenges');
      await page.getByRole('button', { name: '离开这次遭遇', exact: true }).click();
      await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
      await freshNative('retry challenge');
      await page.locator(`.discovery-pin-button[data-spawn-id="${target.id}"]`).click(); await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
      await page.getByRole('button', { name: '开始挑战', exact: true }).click(); await page.locator('.discovery-arena').waitFor();
      state = await until(state => state.encounters.some(encounter => encounter.status === 'challenging'), 'retry native encounter'); current = state.encounters.find(encounter => encounter.status === 'challenging');
    }
    const action = current.battle.view.player.anger >= current.battle.rules.ultimateAnger ? /^大招/ : current.battle.view.enemy.anger >= 70 ? /^属性攻击/ : /^普通攻击/;
    await page.getByRole('button', { name: action }).click();
    const previousRound = current.battle.view.round, encounterId = current.encounterId;
    state = await until(state => state.encounters.some(encounter => encounter.encounterId === encounterId && encounter.battle.view.round > previousRound), 'native combat round'); current = state.encounters.find(encounter => encounter.encounterId === encounterId);
    console.log(`Actual battle attempt ${attempts}, round ${current.battle.view.round}: ${current.status}`);
  }
  assert.equal(current.status, 'won');
  const finalFix = await freshNative('before confirmation');
  assert.equal(finalFix.location.watching, true, 'Native watch remains opted in across exploration routes');
  evidence.battle = { battleId: current.battle.battleId, encounterId: current.encounterId, petId: current.petId, rounds: current.battle.view.round, winner: current.battle.winner, adapter: current.battle.adapter, attempts };
  await page.getByRole('button', { name: '邀请成为伙伴', exact: true }).click();
  await page.getByRole('textbox', { name: '昵称', exact: true }).fill('真实相遇伙伴');
  await page.getByRole('button', { name: '确认收服', exact: true }).click(); await page.getByText('新伙伴已加入', { exact: true }).waitFor();
  const after = await snapshot(), capture = after.captures.find(capture => capture.encounterId === current.encounterId);
  assert.ok(capture); assert.equal(after.pets.length, before.pets.length + 1); assert.equal(capture.resourceId, target.resourceId); assert.equal(capture.validation, 'local-os');
  const duplicate = await invoke('discovery', 'confirm', { encounterId: capture.encounterId, actionId: randomUUID() });
  assert.equal(duplicate.ok, true, duplicate.message); assert.equal(duplicate.data.petId, capture.petId); assert.equal((await snapshot()).pets.length, after.pets.length);
  const pet = await invoke('companions', 'get', { petId: capture.petId }), memories = await invoke('discovery', 'memories', { petId: capture.petId });
  assert.equal(pet.ok, true); assert.equal(pet.data.resource.resourceId, target.resourceId); assert.equal(pet.data.origin.memoryTags.length, 1); assert.equal(memories.data.length, 1);
  await page.locator('.discovery-postcard .resource-stage[data-status="ready"] canvas').waitFor({ timeout: 30000 });
  await page.locator('.main-content').evaluate(element => element.scrollTop = 0); await page.screenshot({ path: join(output, 'capture-result-no-location-map.png') });
  await page.getByRole('button', { name: '继续探索', exact: true }).click(); await page.getByRole('button', { name: '查看相遇图鉴', exact: true }).click();
  await page.getByRole('heading', { name: '真实相遇伙伴', exact: true }).waitFor();
  evidence.capture = { petId: capture.petId, encounterId: capture.encounterId, ownerAccountId: capture.ownerAccountId, resourceId: capture.resourceId, templateId: capture.templateId, element: capture.element, validation: capture.validation, distanceMeters: capture.distanceMeters, duplicateReturnsSamePetId: true, backpackMatches: true, pokedexMatches: true, memoryCount: memories.data.length };
  await app.close();
  const require = createRequire(import.meta.url);
  const readback = spawnSync(require('electron'), [resolve('apps/pc-app/runtime/features/discovery/verification/read-capture.cjs'), join(profile, 'lingjing.sqlite'), capture.petId, capture.encounterId], { cwd: resolve('.'), encoding: 'utf8', windowsHide: true, env: { ...env, ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(readback.status, 0, 'Actual Electron/SQLite readback succeeds'); evidence.sqlite = JSON.parse(readback.stdout.trim());
  assert.equal(evidence.sqlite.ownerAccountId, capture.ownerAccountId);
  assert.equal(evidence.sqlite.captures, 1); assert.equal(evidence.sqlite.ownedInstances, 1); assert.equal(evidence.sqlite.memories, 1); assert.equal(evidence.sqlite.petId, capture.petId); assert.equal(evidence.sqlite.resourceId, target.resourceId); assert.ok(evidence.sqlite.reports >= 1);
  app = await electron.launch({ args: [resolve('.')], env }); await mainWindow();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  const restored = await until(state => state.signedIn, 'restored account');
  assert.equal(restored.captures.find(capture => capture.encounterId === current.encounterId)?.petId, capture.petId); assert.equal(restored.location.fix, null);
  evidence.restart = { accountRestored: true, samePetId: true, currentLocationNotPersisted: true };
  assert.deepEqual(evidence.rendererErrors, []); evidence.passed = true; evidence.physicalLocationAcceptance = true;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); writeFileSync(resolve('artifacts/discovery/latest-physical-evidence.json'), JSON.stringify({ ...evidence, output }, null, 2));
  console.log(JSON.stringify({ passed: true, physicalLocationAcceptance: true, output, samples: evidence.systemSamples, capture: evidence.capture, sqlite: evidence.sqlite, restart: evidence.restart }, null, 2));
} catch (error) {
  evidence.physicalLocationAcceptance = false; evidence.error = error.message;
  writeFileSync(join(output, 'failure.json'), JSON.stringify(evidence, null, 2));
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure-private-location.png') }).catch(() => {});
  throw error;
} finally { await app.close().catch(() => {}); }
