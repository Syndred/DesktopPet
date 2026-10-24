// Production UI + actual registered services and atlases. The host's explicitly
// labelled controlled positions never count as physical-location acceptance.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const output = resolve(`artifacts/discovery/roster-actions-${Date.now()}`);
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'profile'), LINGJING_CONTROLLED_LOCATION: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_DISCOVERY_CLOUD;
const host = resolve('apps/pc-app/runtime/features/discovery/verification/host.cjs');
const arenaOnly = process.argv.includes('--arena-only');
const portraitsOnly = process.argv.includes('--portraits-only');
let app = await electron.launch({ args: [host], env }), page;
const evidence = { at: new Date().toISOString(), controlledPosition: true, physicalLocationAcceptance: false, previews: [], animationSamples: [], rendererErrors: [] };
const invoke = (feature, command, payload = {}) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function snapshot() { const result = await invoke('discovery', 'snapshot'); assert.equal(result.ok, true); return result.data; }
async function until(predicate, label) {
  for (let attempt = 0; attempt < 100; attempt++) { const state = await snapshot(); if (predicate(state)) return state; await page.waitForTimeout(100); }
  throw new Error(`State did not converge: ${label}`);
}
async function mainWindow() {
  for (let attempt = 0; attempt < 150; attempt++) {
    page = app.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('/desktop/'));
    if (page) { page.on('pageerror', error => evidence.rendererErrors.push(error.message)); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Main UI did not appear');
}
async function settled() {
  await page.waitForFunction(() => {
    const element = document.querySelector('.app-page-motion[data-current-route="true"]');
    if (!element) return false;
    const style = getComputedStyle(element);
    return Number(style.opacity) === 1 && (style.transform === 'none' || new DOMMatrixReadOnly(style.transform).m42 === 0);
  });
}
async function observePoses() {
  await page.evaluate(() => {
    window.__discoveryPoseEvidence ||= [];
    const root = document.querySelector('.discovery-arena-characters');
    const record = () => {
      for (const stage of root.querySelectorAll('.resource-stage')) window.__discoveryPoseEvidence.push({ petId: stage.dataset.petId, resourceId: stage.dataset.resourceId, action: stage.dataset.action, clip: stage.dataset.clip, fallback: stage.dataset.fallback, frame: stage.querySelector('[data-renderer]')?.dataset.frame });
    };
    new MutationObserver(record).observe(root, { subtree: true, attributes: true, attributeFilter: ['data-action', 'data-clip', 'data-frame'] }); record();
  });
}
async function preview(template) {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
  const target = await app.evaluate((_electron, templateId) => {
    const { services, nearbySpawns, controlled } = global.__discoveryVerification;
    if (!controlled) throw new Error('Only the isolated labelled fixture may set a sample');
    const discovery = services.get('discovery'), templates = services.get('companions').listTemplates();
    let target;
    for (let offset = 0; offset < 20 && !target; offset++) target = nearbySpawns({ lat: 31.2304 + offset * .0006, lng: 121.4737 }, Date.now(), 450, templates).find(spawn => spawn.templateId === templateId);
    if (!target) throw new Error(`No actual generated encounter for ${templateId}`);
    discovery.location.suspend(); discovery.location.fix = null;
    discovery.location.adapter = { scenario: 'qa', getPosition: async () => ({ ok: true, ...target.position, accuracyMeters: 12, timestampMs: Date.now(), coordinateSystem: 'wgs84', source: 'os', provider: 'controlled-test-fixture', positionSource: 'test-fixture' }) };
    return target;
  }, template.templateId);
  await page.getByRole('button', { name: /(?:获取系统位置|更新场景位置)/ }).click();
  const state = await until(value => value.location.status === 'ready' && value.spawns.some(spawn => spawn.id === target.id), 'canonical target visible');
  assert.equal(state.location.fix.provider, 'controlled-test-fixture');
  const spawn = state.spawns.find(spawn => spawn.id === target.id);
  assert.equal(spawn.resourceId, template.resource.resourceId); assert.equal(spawn.name, template.name); assert.equal(spawn.inRange, true);
  await page.locator(`.discovery-pin-button[data-spawn-id="${target.id}"]`).click();
  await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
  await page.getByRole('heading', { name: `在附近，遇见了${template.name}。`, exact: true }).waitFor();
  const stage = page.locator(`.discovery-scene-wild .resource-stage[data-resource-id="${spawn.resourceId}"][data-status="ready"]`);
  await stage.locator('canvas').waitFor({ timeout: 30000 });
  assert.equal(await stage.getAttribute('data-fallback'), 'false');
  const thumbnail = page.locator('.discovery-profile-top svg.discovery-atlas-thumbnail');
  await thumbnail.waitFor(); assert.ok(await thumbnail.getAttribute('viewBox'));
  assert.equal(await thumbnail.getAttribute('data-framing'), 'portrait');
  assert.equal(await thumbnail.getAttribute('data-resource-id'), template.resource.resourceId);
  await settled(); await page.screenshot({ path: join(output, `preview-${template.templateId}.png`) });
  console.log(`Verified preview ${template.name} / ${spawn.resourceId}`);
  return { spawnId: target.id, templateId: template.templateId, name: template.name, resourceId: spawn.resourceId, pixiReady: true, realAtlasThumbnail: true };
}
try {
  await mainWindow();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  let requested = { width: 1280, height: 844 };
  for (let attempt = 0; attempt < 3; attempt++) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), requested);
    await page.waitForTimeout(100);
    const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (actual.width === 1280 && actual.height === 844) break;
    requested = { width: requested.width + 1280 - actual.width, height: requested.height + 844 - actual.height };
  }
  const nativeViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  if (nativeViewport.width !== 1280 || nativeViewport.height !== 844) await page.setViewportSize({ width: 1280, height: 844 });
  evidence.viewport = { nativeAfterResize: nativeViewport, cssViewportOverride: page.viewportSize(), verification: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })) };
  assert.deepEqual(evidence.viewport.verification, { width: 1280, height: 844 });
  const templates = await app.evaluate(() => global.__discoveryVerification.services.get('companions').listTemplates());
  assert.equal(templates.length, 6); assert.equal(new Set(templates.map(template => template.resource.resourceId)).size, 6);
  // Finish on the non-fish metal character to verify that capture identity is
  // driven by its canonical template rather than a water/fish default.
  templates.sort((a, b) => (a.templateId === 'animal-hat-cat' ? 1 : 0) - (b.templateId === 'animal-hat-cat' ? 1 : 0));
  for (const template of (arenaOnly ? [templates.at(-1)] : templates)) evidence.previews.push(await preview(template));
  if (!portraitsOnly) {
  const target = evidence.previews.at(-1), before = await snapshot();
  await page.getByRole('button', { name: '开始挑战', exact: true }).click();
  await page.locator('.discovery-arena').waitFor();
  let current = (await until(state => state.encounters.some(encounter => encounter.status === 'challenging'), 'actual wild battle')).encounters.find(encounter => encounter.status === 'challenging');
  const rules = await invoke('battle', 'rules'); assert.equal(rules.ok, true); assert.deepEqual(current.battle.rules, rules.data);
  assert.equal(current.battle.view.player.maxHp, rules.data.maxHp);
  assert.ok(await page.locator('.discovery-rules-caption').textContent().then(value => value.includes(String(rules.data.maxHp))));
  assert.equal(await page.locator('.battle-moves .battle-move').count(), 4);
  const stages = page.locator('.discovery-arena-characters .resource-stage');
  await stages.nth(1).locator('canvas').waitFor({ timeout: 30000 });
  await stages.nth(0).locator('canvas').waitFor({ timeout: 30000 });
  evidence.arenaLayout = await page.locator('.discovery-arena').evaluate(arena => ({
    width: arena.getBoundingClientRect().width,
    commands: [...arena.querySelectorAll('.battle-move')].map(button => ({ text: button.textContent, width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height, disabled: button.disabled, shadow: getComputedStyle(button).boxShadow })),
    meters: [...arena.querySelectorAll('progress')].map(progress => ({ value: progress.value, max: progress.max, color: getComputedStyle(progress).accentColor }))
  }));
  await page.locator('.discovery-arena').screenshot({ path: join(output, 'battle-active-shared-moves.png') });
  if (arenaOnly) {
    await page.getByRole('button', { name: /^属性攻击/ }).click();
    const previousRound = current.battle.view.round;
    current = (await until(state => state.encounters.some(encounter => encounter.encounterId === current.encounterId && encounter.battle.view.round > previousRound), 'one actual action')).encounters.find(encounter => encounter.encounterId === current.encounterId);
    await page.waitForTimeout(1200);
    evidence.arenaAfterAction = { round: current.battle.view.round, playerHp: current.battle.view.player.hp, enemyHp: current.battle.view.enemy.hp };
    await page.locator('.discovery-arena').screenshot({ path: join(output, 'battle-after-action.png') });
    await page.getByRole('button', { name: '离开这次遭遇', exact: true }).click();
    await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
    assert.equal((await snapshot()).encounters.find(encounter => encounter.encounterId === current.encounterId).status, 'cancelled');
    evidence.arenaOnly = true; evidence.cancellationPreserved = true;
  } else {
  const canvas = await stages.nth(0).locator('canvas').elementHandle();
  await observePoses();
  let attempts = 1;
  while (current.status === 'challenging' || current.status === 'lost') {
    if (current.status === 'lost') {
      assert.ok(attempts++ < 5, 'At least one real random challenge wins within five attempts');
      await page.getByRole('button', { name: '离开这次遭遇', exact: true }).click();
      await preview(templates.at(-1));
      await page.getByRole('button', { name: '开始挑战', exact: true }).click();
      current = (await until(state => state.encounters.some(encounter => encounter.status === 'challenging'), 'retry battle')).encounters.find(encounter => encounter.status === 'challenging');
      await page.locator('.discovery-arena').waitFor();
      await stages.nth(1).locator('canvas').waitFor({ timeout: 30000 });
      await observePoses();
    }
    const action = current.battle.view.player.anger >= rules.data.ultimateAnger ? 'ultimate' : current.battle.view.round === 0 ? 'element_attack' : 'normal_attack';
    const labels = { ultimate: /^大招/, element_attack: /^属性攻击/, normal_attack: /^普通攻击/ };
    await page.getByRole('button', { name: labels[action] }).click();
    const previous = current;
    current = (await until(state => state.encounters.some(encounter => encounter.encounterId === previous.encounterId && encounter.battle.view.round > previous.battle.view.round), 'persisted next round')).encounters.find(encounter => encounter.encounterId === previous.encounterId);
    const last = current.battle.rounds.at(-1);
    console.log(`Actual random battle attempt ${attempts}, round ${last.round}: ${current.status}`);
    await page.waitForTimeout(180);
    if (!evidence.animationSamples.some(sample => sample.action === action)) {
      const bytes = await stages.nth(0).locator('canvas').screenshot({ path: join(output, `player-${action}.png`) });
      evidence.animationSamples.push({ action, round: last.round, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    if (last.damageTaken.enemy > 0 && !evidence.hitScreenshot) {
      await stages.nth(1).filter({ has: page.locator('[data-renderer]') }).waitFor();
      await page.waitForFunction(() => document.querySelectorAll('.discovery-arena-characters .resource-stage')[1]?.dataset.action === 'hit', null, { timeout: 1800 });
      await stages.nth(1).locator('canvas').screenshot({ path: join(output, 'enemy-hit.png') }); evidence.hitScreenshot = true;
    }
    await page.waitForTimeout(1200);
    assert.ok(current.battle.view.round < 80, 'Bounded real combat');
  }
  assert.equal(current.status, 'won');
  if (attempts === 1) assert.equal(await canvas.evaluate(element => element.isConnected), true, 'Pose changes keep the existing Pixi canvas');
  await page.waitForFunction(() => document.querySelector('.discovery-arena-characters .resource-stage')?.dataset.action === 'victory');
  evidence.poses = await page.evaluate(() => window.__discoveryPoseEvidence);
  for (const action of ['skill', 'attack', 'hit', 'victory']) assert.ok(evidence.poses.some(pose => pose.action === action && pose.clip === action && pose.fallback === 'false'), `Real atlas clip ${action}`);
  await page.screenshot({ path: join(output, 'battle-victory.png') });
  await page.getByRole('button', { name: /(?:获取系统位置|更新场景位置)/ }).click(); await until(state => state.location.status === 'ready', 'fresh controlled capture fix');
  await page.getByRole('button', { name: '邀请成为伙伴', exact: true }).click();
  await page.getByRole('textbox', { name: '昵称', exact: true }).fill('探索礼帽喵');
  await page.getByRole('button', { name: '确认收服', exact: true }).click();
  await page.getByText('新伙伴已加入', { exact: true }).waitFor();
  const after = await snapshot(), capture = after.captures[0];
  assert.equal(after.pets.length, before.pets.length + 1); assert.equal(capture.resourceId, target.resourceId); assert.equal(capture.element, 'metal');
  const duplicate = await invoke('discovery', 'confirm', { encounterId: capture.encounterId, actionId: randomUUID() });
  assert.equal(duplicate.ok, true); assert.equal(duplicate.data.petId, capture.petId); assert.equal((await snapshot()).pets.length, after.pets.length);
  const backpack = await invoke('companions', 'get', { petId: capture.petId }), memories = await invoke('discovery', 'memories', { petId: capture.petId });
  assert.equal(backpack.ok, true); assert.equal(backpack.data.resource.resourceId, target.resourceId); assert.equal(backpack.data.origin.memoryTags.length, 1); assert.equal(memories.data.length, 1);
  await page.locator(`.discovery-postcard .resource-stage[data-resource-id="${target.resourceId}"][data-status="ready"] canvas`).waitFor();
  await settled(); await page.screenshot({ path: join(output, 'capture-canonical-hatcat.png') });
  await page.getByRole('button', { name: '继续探索', exact: true }).click(); await page.getByRole('button', { name: '查看相遇图鉴', exact: true }).click();
  await page.getByRole('heading', { name: '探索礼帽喵', exact: true }).waitFor();
  assert.equal(await page.locator(`.discovery-pokedex-card [data-resource-id="${target.resourceId}"]`).count(), 1);
  evidence.capture = { petId: capture.petId, templateId: capture.templateId, resourceId: capture.resourceId, element: capture.element, duplicateReturnsSamePet: true, backpackMatches: true, memoryCount: memories.data.length, pokedexMatches: true, randomAttempts: attempts };
  evidence.poses = [...new Map(evidence.poses.map(pose => [JSON.stringify(pose), pose])).values()];
  await app.close(); app = await electron.launch({ args: [host], env }); await mainWindow();
  const restored = await snapshot();
  assert.equal(restored.captures[0].petId, capture.petId); assert.equal(restored.captures[0].resourceId, target.resourceId); assert.equal(restored.location.fix, null);
  evidence.restart = { samePetId: true, canonicalResourceRetained: true, currentLocationNotPersisted: true };
  }
  }
  evidence.portraitsOnly = portraitsOnly;
  assert.deepEqual(evidence.rendererErrors, []); evidence.passed = true;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve(`artifacts/discovery/latest-${portraitsOnly ? 'portraits' : arenaOnly ? 'arena' : 'roster-actions'}-evidence.json`), JSON.stringify({ ...evidence, output }, null, 2));
  console.log(JSON.stringify({ passed: true, output, previews: evidence.previews.length, capture: evidence.capture, rendererErrors: evidence.rendererErrors }, null, 2));
} catch (error) {
  if (page && !page.isClosed()) evidence.poses = await page.evaluate(() => window.__discoveryPoseEvidence || []).catch(() => []);
  if (page && !page.isClosed()) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ ...evidence, error: error.message }, null, 2)); throw error;
} finally { await app.close(); }
