// Production Electron entry + foundation's verified, isolated QA profile.
// Only location is simulated. Battles, UI actions and capture transactions are real.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { inspectBattle, observeBattleAction } from '../../../../../../scripts/acceptance/battle-probe.mjs';

const require = createRequire(import.meta.url), source = resolve('.');
const templates = require('../../companions/templates.cjs').listTemplates();
const output = resolve(`artifacts/discovery/unified-${Date.now()}`);
mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
assert.equal(git('status', '--porcelain'), '', 'Commit the review candidate before recording acceptance');
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const build = JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8'));
assert.equal(build.sourceCommit, git('rev-parse', 'HEAD'), 'Build must match the review candidate');
assert.deepEqual(build.sourceDirtyFiles, []);
const env = { ...process.env, ...scenario.env };
for (const key of ['ELECTRON_RUN_AS_NODE', 'PET_RUNTIME_DATA_FILE', 'LINGJING_CONTROLLED_LOCATION', 'LINGJING_DISCOVERY_CLOUD', 'LINGJING_BATTLE_QA']) delete env[key];
const proof = { at: new Date().toISOString(), sourceCommit: git('rev-parse', 'HEAD'), build, scenario,
  provenance: 'simulated location in verified QA profile; actual engine, shared UI and SQLite capture',
  liveCloudVerified: false, physicalCaptureVerified: false, checks: [], roster: [], actions: [], errors: [] };
const save = label => { proof.phase = label; writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); console.log(label); };
let app, page, capture, encounter, qaLogin;
async function launch() {
  app = await electron.launch({ args: [source], cwd: source, env });
  page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  await size(1280, 844);
}
async function invoke(feature, command, payload = {}) {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, `${feature}.${command}: ${JSON.stringify(result)}`); return result.data;
}
async function size(width, height) { await app.evaluate(({ BrowserWindow }, dimensions) => BrowserWindow.getAllWindows()[0].setSize(...dimensions), [width, height]); }
async function navigate(path) { await page.evaluate(value => { location.hash = `#${value}`; }, path); }
const snapshot = () => invoke('discovery', 'snapshot');
async function until(predicate, label, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const state = await snapshot(); if (predicate(state)) return state; await page.waitForTimeout(100); }
  throw new Error(`State did not converge: ${label}`);
}
async function map() {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.locator('.discovery-main-heading').waitFor();
}
async function target(templateId) {
  await page.locator('.discovery-main-heading').waitFor();
  const state = await invoke('discovery', 'qaTarget', { templateId });
  assert.equal(state.scenario, 'qa'); assert.equal(state.location.fix.source, 'simulated');
  assert.equal(state.location.fix.scenarioId, scenario.runId); assert.equal(state.location.permission, 'unknown');
  assert.equal(state.cloudStatus, 'disabled');
  const spawn = state.spawns.find(value => value.templateId === templateId && value.inRange && value.captureState === 'available');
  assert.ok(spawn, `Canonical ${templateId} must exist in the trusted QA geofence`);
  await page.locator(`.discovery-pin-button[data-spawn-id="${spawn.id}"]`).click();
  await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
  await page.locator('.discovery-wild-view').waitFor();
  const portraits = await page.locator('.discovery-wild-profile [data-resource-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-resource-id')));
  assert.ok(portraits.includes(spawn.resourceId), 'Preview portrait must use the actual template resource');
  return spawn;
}
async function begin(templateId) {
  await map(); const spawn = await target(templateId);
  await page.getByRole('button', { name: '探索设置', exact: true }).click();
  const watch = page.getByRole('switch', { name: '探索时持续更新位置', exact: true });
  if (await watch.getAttribute('aria-checked') !== 'true') await watch.click();
  await page.keyboard.press('Escape');
  await until(state => state.location.watching, 'explicit simulated watch');
  await page.getByRole('button', { name: '开始挑战', exact: true }).click();
  const screen = page.locator('[data-battle-screen="shared-v1"][data-battle-mode="wild"]'); await screen.waitFor();
  const state = await until(value => value.encounters.some(item => item.status === 'challenging'), 'linked wild encounter');
  encounter = state.encounters.find(item => item.status === 'challenging');
  assert.equal(await screen.getAttribute('data-session-id'), encounter.battle.battleId);
  assert.equal(await screen.getAttribute('data-authority'), 'simulated'); assert.equal(encounter.scenario, 'qa');
  const session = await invoke('battle', 'snapshot', { sessionId: encounter.battle.battleId });
  assert.equal(session.context.encounterId, encounter.encounterId); assert.equal(session.context.origin, 'discovery');
  assert.equal(session.context.scenarioId, scenario.runId); assert.equal(session.enemy.element, spawn.element);
  assert.equal(session.enemy.resource?.resourceId || session.enemy.appearance2d, spawn.resourceId);
  assert.equal(state.location.watching, true, 'The exploration route retains only the explicit foreground lease');
  return session;
}
async function action(session, type, record = false) {
  if (record) {
    const pending = observeBattleAction(page, type);
    await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'impact');
    await page.screenshot({ path: join(output, `${type}-${session.snapshot.round + 1}-impact.png`) });
    const timeline = await pending; proof.actions.push({ sessionId: session.id, round: session.snapshot.round + 1, ...timeline });
  } else {
    await page.locator(`.battle-move.${type}`).click();
    await page.waitForFunction(round => Number(document.querySelector('[data-animation-key]')?.getAttribute('data-animation-key')?.split(':').at(-1)) > round, session.snapshot.round);
    await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  }
  const next = await invoke('battle', 'snapshot', { sessionId: session.id });
  assert.equal(next.snapshot.round, session.snapshot.round + 1);
  return next;
}
async function leave() {
  await page.getByRole('button', { name: '离开', exact: true }).click();
  await page.getByRole('dialog', { name: '离开对战', exact: true }).getByRole('button', { name: '离开', exact: true }).click();
  await page.getByRole('button', { name: '战报', exact: true }).waitFor();
}
try {
  await launch();
  proof.entry = await app.evaluate(({ app }) => ({ appPath: app.getAppPath(), electron: process.versions.electron, verificationHostPresent: Boolean(global.__discoveryVerification) }));
  assert.equal(proof.entry.verificationHostPresent, false);
  const info = await invoke('app', 'info'); assert.equal(info.scenario.runId, scenario.runId);
  assert.equal(info.scenario.provenance, 'simulated');
  const password = `Discovery-${randomUUID()}!`;
  qaLogin = { provider: 'local', account: `discovery_${Date.now()}`, password, rememberSession: false };
  await invoke('accounts', 'register', { ...qaLogin, confirmPassword: password, username: '探索统一战场验收' });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  proof.owner = (await invoke('app', 'info')).user.id; assert.ok(proof.owner.startsWith(`qa:${scenario.runId}:`));
  const adopted = await invoke('companions', 'adopt', { templateId: 'big-fish-gentle', name: '探索出战伙伴', showOnDesktop: false, actionId: randomUUID() });
  const pet = adopted.pet; assert.ok(pet?.petId); proof.player = { petId: pet.petId, resourceId: pet.resource.resourceId, element: pet.element };
  save('production QA identity and registered companion');

  for (const template of templates) {
    await map(); const spawn = await target(template.templateId);
    assert.equal(spawn.resourceId, template.resource.resourceId); assert.equal(spawn.element, template.element);
    await page.screenshot({ path: join(output, `preview-${template.templateId}.png`) });
    proof.roster.push({ templateId: spawn.templateId, resourceId: spawn.resourceId, element: spawn.element, inRange: spawn.inRange });
  }
  proof.missingElements = ['wood', 'fire', 'earth', 'metal', 'water'].filter(value => !templates.some(template => template.element === value));
  save('canonical roster previews');

  let session = await begin('animal-shiba'); proof.link = { encounterId: encounter.encounterId, sessionId: session.id, spawnId: encounter.spawn.id };
  proof.wildGeometry = [];
  for (const width of [1280, 1440]) {
    await size(width, width === 1280 ? 844 : 900);
    proof.wildGeometry.push(await inspectBattle(page, { session, screenshot: join(output, `wild-${width}.png`) }));
  }
  await size(1280, 844);
  session = await action(session, 'normal_attack', true); session = await action(session, 'normal_attack', true);
  const keys = proof.actions.map(value => value.entries.find(entry => entry.phase === 'windup')?.key);
  assert.equal(new Set(keys).size, 2, 'Consecutive identical moves replay separate shared animation keys');
  const savedRound = session.snapshot.round, savedSession = session.id;
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.discovery-resume').getByRole('button', { name: '继续', exact: true }).click();
  const resumed = page.locator('[data-battle-screen="shared-v1"]'); await resumed.waitFor();
  assert.equal(await resumed.getAttribute('data-session-id'), savedSession);
  session = await invoke('battle', 'snapshot', { sessionId: savedSession }); assert.equal(session.snapshot.round, savedRound);
  assert.equal(await page.locator('[data-animation-phase]').getAttribute('data-animation-phase'), 'rest');
  proof.checks.push('Same saved battleId and round after return/resume; old round does not replay');
  session = await action(session, 'element_attack', true);
  session = await action(session, 'dodge', true);
  for (let turn = 0; turn < 90 && session.status === 'active'; turn++) {
    const type = session.snapshot.player.anger >= session.rules.ultimateAnger ? 'ultimate' : 'normal_attack';
    const record = type === 'ultimate' && !proof.actions.some(value => value.action === 'ultimate');
    session = await action(session, type, record);
  }
  assert.equal(session.status, 'finished'); assert.equal(session.winner, 'player', 'Actual random wild challenge must be won before capture');
  proof.finishedBattle = session; save('shared wild battle and actual victory');

  await page.getByRole('button', { name: '收服', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '收服伙伴', exact: true });
  await dialog.getByRole('textbox', { name: '昵称', exact: true }).fill('附近的柴柴');
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await page.locator('.discovery-result').waitFor();
  let state = await snapshot(); capture = state.captures.find(value => value.encounterId === encounter.encounterId);
  assert.ok(capture?.petId); assert.equal(capture.resourceId, encounter.spawn.resourceId); assert.equal(capture.element, 'fire');
  assert.equal(capture.scenario, 'qa'); assert.equal(capture.validation, 'simulated'); assert.equal(capture.memoryTags.length, 1);
  await page.getByLabel('QA 场景存档', { exact: true }).waitFor();
  await page.screenshot({ path: join(output, 'capture-result.png') }); proof.capture = capture;
  for (const actionId of [`context:${session.id}`, randomUUID()]) {
    const duplicate = await invoke('battle', 'settleContext', { sessionId: session.id, actionId, name: '附近的柴柴' });
    assert.equal(duplicate.petId, capture.petId); assert.equal(duplicate.resultPath, `/discovery/result/${encounter.encounterId}`);
  }
  assert.equal((await snapshot()).captures.filter(value => value.encounterId === encounter.encounterId).length, 1);
  const companion = await invoke('companions', 'get', { petId: capture.petId });
  assert.equal(companion.resource.resourceId, capture.resourceId); assert.equal(companion.origin.scenario, 'qa');
  assert.equal(companion.origin.validation, 'simulated');
  const memories = await invoke('discovery', 'memories', { petId: capture.petId }); assert.equal(memories.length, 1);
  assert.equal((await invoke('discovery', 'pokedex')).find(value => value.petId === capture.petId).resourceId, capture.resourceId);
  proof.checks.push('Shared result action creates one real instance, capture and memory; both duplicate confirmations return the same petId');
  await map();
  await page.locator(`.discovery-pin-button[data-spawn-id="${encounter.spawn.id}"]`).click();
  await page.getByRole('button', { name: '查看这次相遇', exact: true }).click(); await page.locator('.discovery-result').waitFor();
  save('shared capture, idempotency and source readback');

  const originalEncounter = encounter;
  const cancelled = await begin('animal-hat-cat'); await leave();
  assert.equal((await invoke('battle', 'snapshot', { sessionId: cancelled.id })).status, 'abandoned');
  await page.getByRole('button', { name: '返回', exact: true }).click();
  state = await until(value => value.encounters.some(item => item.battle.battleId === cancelled.id && item.status === 'cancelled'), 'shared abandon links to encounter');
  proof.cancelled = state.encounters.find(item => item.battle.battleId === cancelled.id); encounter = originalEncounter;

  const training = await invoke('battle', 'startTraining', { petId: pet.petId, enemyElement: 'fire', actionId: randomUUID() });
  await navigate(`/battle/session/${training.id}`); proof.trainingGeometry = [];
  for (const width of [1280, 1440]) {
    await size(width, width === 1280 ? 844 : 900);
    const view = await inspectBattle(page, { session: training, screenshot: join(output, `training-${width}.png`) });
    proof.trainingGeometry.push(view);
    const wild = proof.wildGeometry.find(value => value.viewport.width === view.viewport.width);
    assert.deepEqual(view.moves.map(value => [value.x, value.y, value.width, value.height]), wild.moves.map(value => [value.x, value.y, value.width, value.height]));
    assert.deepEqual(view.hud.map(value => [value.x, value.y, value.width, value.height]), wild.hud.map(value => [value.x, value.y, value.width, value.height]));
  }
  await navigate(`/discovery/encounter/${encounter.encounterId}`);
  await page.locator(`[data-battle-screen="shared-v1"][data-session-id="${session.id}"]`).waitFor();
  assert.equal((await invoke('battle', 'overview')).session.id, training.id, 'Explicit wild route must not display the newer training session');
  proof.checks.push('Training/wild use identical live HUD and move geometry at 1280/1440; encounter route preserves explicit sessionId after a newer session');
  await navigate(`/battle/session/${training.id}`); await leave();
  await navigate('/discovery');
  await page.locator('.discovery-main-heading').waitFor();
  const preRestart = await snapshot(); assert.equal(preRestart.captures.length, 1);
  await app.close(); app = null; save('shared abandon and cross-entry screen identity');

  await launch();
  assert.equal((await invoke('accounts', 'session')).currentUser, null, 'QA login is memory-only');
  await invoke('accounts', 'login', qaLogin); await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await map(); const restarted = await snapshot();
  assert.equal(restarted.location.fix, null); assert.equal(restarted.location.watching, false);
  const restored = restarted.captures.find(value => value.petId === capture.petId); assert.deepEqual(restored, capture);
  assert.equal((await invoke('discovery', 'memories', { petId: capture.petId })).length, 1);
  await navigate(`/discovery/result/${capture.encounterId}`); await page.locator('.discovery-result').waitFor();
  await page.screenshot({ path: join(output, 'restart-capture.png') });
  proof.checks.push('Explicit QA login restores the same capture and memory; location/watch are not restored');
  await app.close(); app = null;
  const database = join(scenario.profilePath, 'lingjing.sqlite');
  proof.ledger = JSON.parse(execFileSync(require('electron'), [resolve('apps/pc-app/runtime/features/discovery/verification/read-capture.cjs'), database, capture.petId, capture.encounterId], { env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' }));
  assert.equal(proof.ledger.ownerAccountId, proof.owner); assert.equal(proof.ledger.captures, 1);
  assert.equal(proof.ledger.ownedInstances, 1); assert.equal(proof.ledger.memories, 1); assert.equal(proof.ledger.validation, 'simulated');
  assert.deepEqual(proof.errors, []); proof.flowPassed = true;
  proof.rosterComplete = proof.missingElements.length === 0; proof.passed = proof.flowPassed && proof.rosterComplete;
  save(proof.passed ? 'passed' : 'flow passed; five-element roster pending');
  console.log(JSON.stringify({ passed: proof.passed, flowPassed: proof.flowPassed, missingElements: proof.missingElements, evidence: join(output, 'evidence.json') }));
} catch (error) {
  proof.failure = String(error); save('failed');
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { if (app) await app.close(); }
