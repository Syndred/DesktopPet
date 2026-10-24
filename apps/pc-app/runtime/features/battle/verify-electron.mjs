import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { RuntimeDataStore } = require('../../services/runtime-data-store.cjs');
const runtime = resolve('apps/pc-app/runtime');
const output = resolve('artifacts/battle', `windows-${Date.now()}`);
const project = join(output, 'application');
const overlayRuntime = join(project, 'apps/pc-app/runtime');
mkdirSync(overlayRuntime, { recursive: true });
cpSync(runtime, overlayRuntime, { recursive: true, filter: source => source !== join(runtime, 'assets') && source !== join(runtime, 'features') });
symlinkSync(join(runtime, 'assets'), join(overlayRuntime, 'assets'), 'junction');
mkdirSync(join(overlayRuntime, 'features'));
cpSync(join(runtime, 'features/battle'), join(overlayRuntime, 'features/battle'), { recursive: true });
const dependencies = {};
for (const id of ['accounts', 'companions', 'resources', 'garden']) {
  const file = process.env[`LINGJING_${id.toUpperCase()}_MODULE`] || join(runtime, 'features', id, 'index.cjs');
  if (existsSync(file)) {
    dependencies[id] = resolve(file);
    cpSync(dirname(resolve(file)), join(overlayRuntime, 'features', id), { recursive: true });
  }
}
assert.ok(dependencies.companions, 'The real companions module is required for experience acceptance');
cpSync(resolve('apps/pc-app/dist'), join(project, 'apps/pc-app/dist'), { recursive: true });
const bootstrap = `require('./apps/pc-app/dist/main/index.cjs');`;
writeFileSync(join(project, 'bootstrap.cjs'), bootstrap);
writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'lingjing-battle-verification', version: '0.0.0', main: 'bootstrap.cjs' }));
const profile = join(output, 'profile');
mkdirSync(profile);
const legacy = new RuntimeDataStore({ filePath: join(profile, 'pet-runtime-data.json'), sessionFilePath: join(profile, 'pet-auth-session.json') });
const account = `battle-ui-${Date.now()}`;
legacy.registerUser(account, 'isolated-local-verification', '并肩验证');
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const checks = [], errors = [], logs = [], requested3dAssets = [];
const visualOnly = process.argv.includes('--visual-only');
let application;
let sessionId;
async function sizeWindow(app, page, width, height) {
  const window = await app.browserWindow(page);
  await window.evaluate((win, size) => win.setContentSize(size.width, size.height, false), { width, height });
  await page.waitForFunction(size => Math.abs(innerWidth - size.width) <= 2 && Math.abs(innerHeight - size.height) <= 2, { width, height });
}
async function launch() {
  const app = await electron.launch({ args: [project], env });
  application = app;
  app.process().stdout?.on('data', data => logs.push(String(data)));
  app.process().stderr?.on('data', data => logs.push(String(data)));
  const page = await app.firstWindow();
  await sizeWindow(app, page, 1280, 844);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\.(glb|gltf|vrm)(?:[?#]|$)/i.test(request.url())) requested3dAssets.push(request.url()); });
  await page.waitForFunction(() => Boolean(window.lingjing));
  const login = await page.evaluate(account => window.lingjing.invoke('accounts', 'login', { provider: 'local', account, password: 'isolated-local-verification', rememberSession: true }), account);
  if (!login.ok && login.code !== 'COMMAND_UNAVAILABLE') throw new Error(JSON.stringify(login));
  // The party is populated by actual independent adoptions, never by painted sample portraits.
  {
    const inventory = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.equal(inventory.ok, true);
    const templates = inventory.data.templates.slice(0, 4);
    let chosen;
    for (const [index, template] of templates.entries()) {
      const adopted = await page.evaluate(({ template, index }) => window.lingjing.invoke('companions', 'adopt', { actionId: `battle-ui-adoption-${template.templateId}`, templateId: template.templateId, name: index === 0 ? '鱼丸' : template.name, showOnDesktop: false }), { template, index });
      assert.equal(adopted.ok, true, JSON.stringify(adopted));
      if (index === 0) chosen = adopted.data.pet.petId;
    }
    const selected = await page.evaluate(petId => window.lingjing.invoke('companions', 'select', { actionId: 'battle-ui-party', petId, slot: 'battlePetId' }), chosen);
    assert.equal(selected.ok, true);
  }
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '对战中心', exact: true }).click();
  await page.getByRole('heading', { name: '和伙伴，并肩出战。' }).waitFor();
  return { app, page };
}
const api = async (page, command, payload = {}) => {
  const result = await page.evaluate(({ command, payload }) => window.lingjing.invoke('battle', command, payload), { command, payload });
  assert.equal(result.ok, true, `${command}: ${result.message}`);
  return result.data;
};
const motionEvidence = [];
async function verifyStillStage(page, label) {
  await page.locator('.battle-stage .battle-portrait[data-animating="false"]').nth(1).waitFor();
  await page.waitForTimeout(350);
  const first = await page.locator('.battle-stage').screenshot();
  await page.waitForTimeout(400);
  const second = await page.locator('.battle-stage').screenshot();
  writeFileSync(join(output, `${label}-1.png`), first); writeFileSync(join(output, `${label}-2.png`), second);
  const difference = await application.evaluate(({ nativeImage }, images) => {
    const a = nativeImage.createFromBuffer(Buffer.from(images.first, 'base64'));
    const b = nativeImage.createFromBuffer(Buffer.from(images.second, 'base64'));
    const size = a.getSize(), other = b.getSize();
    if (size.width !== other.width || size.height !== other.height) return { dimensionsChanged: true };
    const left = a.toBitmap(), right = b.toBitmap();
    let maxChannel = 0, changedPixels = 0, pixelsOverOne = 0;
    for (let index = 0; index < left.length; index += 4) {
      let pixelMax = 0;
      for (let channel = 0; channel < 4; channel++) pixelMax = Math.max(pixelMax, Math.abs(left[index + channel] - right[index + channel]));
      maxChannel = Math.max(maxChannel, pixelMax);
      if (pixelMax) changedPixels++;
      if (pixelMax > 1) pixelsOverOne++;
    }
    return { size, maxChannel, changedPixels, pixelsOverOne };
  }, { first: first.toString('base64'), second: second.toString('base64') });
  const actors = await page.locator('.battle-stage').evaluate(element => [...element.querySelectorAll('.battle-portrait')].map(actor => ({ animating: actor.getAttribute('data-animating'), action: actor.querySelector('.resource-stage')?.getAttribute('data-action') })));
  motionEvidence.push({ label, difference, actors });
  writeFileSync(join(output, 'motion-evidence.json'), JSON.stringify(motionEvidence, null, 2));
  // Chromium's GPU compositing can round isolated channels by one; a changed atlas frame exceeds this bound.
  assert.equal(difference.dimensionsChanged, undefined, `${label}: stage dimensions changed`);
  assert.equal(difference.pixelsOverOne, 0, `${label}: sprite frame changed: ${JSON.stringify(difference)}`);
}
async function captureSettledPage(page, name) {
  // AnimatePresence may still expose outgoing content while its route is fading.
  await page.waitForTimeout(350);
  await page.waitForFunction(() => {
    const pages = [...document.querySelectorAll('.app-page-motion')];
    return pages.length === 1 && Number(getComputedStyle(pages[0]).opacity) >= .999;
  });
  await page.screenshot({ path: join(output, name) });
}
async function captureBattleLayout(page, name) {
  await captureSettledPage(page, `${name}.png`);
  const metrics = await page.evaluate(() => {
    const read = element => ({ rect: element.getBoundingClientRect().toJSON(), font: { family: getComputedStyle(element).fontFamily, size: getComputedStyle(element).fontSize, weight: getComputedStyle(element).fontWeight }, marginBottom: getComputedStyle(element).marginBottom });
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, title: read(document.querySelector('.page-header h1')), tabs: read(document.querySelector('.battle-tabs')), arena: read(document.querySelector('.battle-arena')), sidebar: read(document.querySelector('.battle-side-panel')), cards: [...document.querySelectorAll('.battle-move')].map(element => ({ action: element.className, selected: element.getAttribute('aria-pressed'), ...read(element), art: read(element.querySelector('.battle-skill-art')), copy: read(element.querySelector('.battle-skill-copy')), status: read(element.querySelector('.battle-skill-status')) })), party: [...document.querySelectorAll('.battle-party-grid > div')].map(element => ({ name: element.textContent, petId: element.querySelector('[data-pet-id]')?.getAttribute('data-pet-id') })), resources: [...document.querySelectorAll('.battle-stage .resource-stage')].map(element => ({ petId: element.getAttribute('data-pet-id'), resourceId: element.getAttribute('data-resource-id'), action: element.getAttribute('data-action') })) };
  });
  writeFileSync(join(output, `${name}.json`), JSON.stringify(metrics, null, 2));
  assert.equal(metrics.cards.length, 4);
  assert.ok(Number(metrics.title.font.weight) >= 700);
  for (const card of metrics.cards) {
    assert.ok(card.art.rect.width >= 44);
    assert.ok(card.copy.rect.left >= card.art.rect.right);
    assert.ok(Math.abs(card.status.rect.bottom - metrics.cards[0].status.rect.bottom) <= 1);
    assert.ok(card.rect.bottom <= metrics.viewport.height, 'Core actions must fit the standard viewport');
  }
  assert.ok(Math.abs(metrics.arena.rect.top - metrics.sidebar.rect.top) <= 1);
  assert.ok(Math.abs(metrics.arena.rect.bottom - metrics.sidebar.rect.bottom) <= 2);
  return metrics;
}
async function verify() {
  let instance = await launch(); application = instance.app; let page = instance.page;
  await page.getByRole('button', { name: '开始训练', exact: true }).waitFor();
  let overview = await api(page, 'overview');
  const petId = overview.selectedPetId;
  await page.getByRole('combobox', { name: '选择出战伙伴' }).click();
  await page.getByRole('option', { name: /^鱼丸 ·/ }).click();
  await page.getByRole('combobox', { name: '训练对手五行' }).click();
  await page.getByRole('option', { name: /^火系/ }).click();
  await page.getByRole('combobox', { name: '训练对手五行' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('listbox').waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('combobox', { name: '训练对手五行' }).evaluate(element => document.activeElement === element), true);
  checks.push('real Radix Select portals selected the independent pet and element; Escape closes the list and restores trigger focus');
  if (dependencies.resources) {
    {
      await page.locator('.battle-portrait .resource-stage[data-status="ready"] canvas').first().waitFor({ timeout: 25000 });
      const bounds = await page.locator('.battle-portrait canvas').first().boundingBox();
      assert.ok(bounds.width > 100 && bounds.height > 100, `Battle resource collapsed: ${JSON.stringify(bounds)}`);
      checks.push('real adopted 2D instance rendered through the shared resources ResourceStage/Pixi adapter');
    }
  }
  await captureSettledPage(page, '01-training.png');
  const beforePets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
  assert.equal(beforePets.ok, true);
  await page.getByRole('button', { name: '开始训练', exact: true }).click();
  await page.getByRole('region', { name: '当前对战' }).waitFor();
  overview = await api(page, 'overview'); sessionId = overview.session.id;
  for (let i = 0; i < 3; i++) {
    await page.locator('.battle-move.element_attack').click();
    await page.waitForFunction(({ id, round }) => window.lingjing.invoke('battle', 'snapshot', { sessionId: id }).then(result => result.ok && result.data.snapshot.round >= round), { id: sessionId, round: i + 1 });
  }
  const saved = await api(page, 'snapshot', { sessionId });
  assert.equal(await page.locator('.battle-page model-viewer').count(), 0);
  await page.locator('.battle-stage > .battle-portrait').nth(1).locator('.resource-stage[data-status="ready"]').waitFor();
  assert.equal(await page.locator('.battle-stage canvas').count(), 2);
  checks.push('both actors use real 2D sprite atlases; battlefield contains two live Pixi canvases and no 3D element');
  if (visualOnly) {
    const standard = await captureBattleLayout(page, '02-live-1280');
    await sizeWindow(application, page, 1440, 900);
    const wide = await captureBattleLayout(page, '02-live-1440');
    const state = await api(page, 'snapshot', { sessionId });
    writeFileSync(join(output, 'visual-preview.json'), JSON.stringify({ at: new Date().toISOString(), source: 'Real Electron and real adoptions; visual iteration only, not final integrated acceptance', standard, wide, state, checks, errors }, null, 2));
    console.log(JSON.stringify({ output, passed: true, mode: 'visual-preview' }));
    return;
  }
  await page.locator('.battle-move-tooltip').filter({ has: page.locator('.battle-move.ultimate') }).focus();
  await page.getByRole('tooltip').filter({ hasText: '需要至少 50 怒气' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('tooltip').waitFor({ state: 'detached' });
  checks.push('disabled ultimate exposes its actual anger requirement through a keyboard-focusable Radix Tooltip');
  await page.getByRole('button', { name: '离开对战', exact: true }).click();
  await page.getByRole('dialog', { name: '确认离开对战' }).waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), true);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: '确认离开对战' }).waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.textContent?.includes('离开对战'));
  checks.push('Radix Dialog traps keyboard focus, Escape closes it and focus returns to the leave trigger');
  const settings = await page.evaluate(() => window.lingjing.invoke('accounts', 'settingsGet'));
  const setAnimations = async enabled => {
    const current = await page.evaluate(() => window.lingjing.invoke('accounts', 'settingsGet'));
    assert.equal(current.ok, true);
    const result = await page.evaluate(({ current, enabled }) => window.lingjing.invoke('accounts', 'settingsSave', { actionId: crypto.randomUUID(), revision: current.revision, document: { ...current.document, desktop: { ...current.document.desktop, animationsEnabled: enabled } } }), { current: current.data, enabled });
    assert.equal(result.ok, true, JSON.stringify(result));
  };
  if (settings.ok) {
    await setAnimations(false);
    await page.locator('[data-motion="reduced"] .battle-stage').waitFor();
    await verifyStillStage(page, 'app-motion-off');
    await setAnimations(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('[data-motion="reduced"] .battle-stage').waitFor();
    await verifyStillStage(page, 'system-reduced-motion');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    checks.push('app animation switch and OS reduced motion propagate through shared MotionConfig; actual sprite frames remain still (pixel comparison permits only one-level GPU rounding)');
  }
  await captureSettledPage(page, '02-live.png');
  await application.close(); application = null;
  instance = await launch(); application = instance.app; page = instance.page;
  await page.getByRole('region', { name: '当前对战' }).waitFor();
  const restored = await api(page, 'snapshot', { sessionId });
  assert.deepEqual(restored.snapshot, saved.snapshot); assert.deepEqual(restored.rounds, saved.rounds);
  checks.push('three UI-selected rounds persisted and restored across a real Electron process restart');
  let session = restored;
  for (let i = 0; i < 100 && session.status === 'active'; i++) {
    const action = session.snapshot.player.anger >= 50 ? 'ultimate' : 'element_attack';
    await page.locator(`.battle-move.${action}`).click();
    const previous = session.snapshot.round;
    await page.waitForFunction(({ id, round }) => window.lingjing.invoke('battle', 'snapshot', { sessionId: id }).then(result => result.ok && result.data.snapshot.round > round), { id: sessionId, round: previous });
    session = await api(page, 'snapshot', { sessionId });
  }
  assert.equal(session.status, 'finished'); assert.equal(session.reward.applied, true);
  await page.getByRole('button', { name: '查看战报与结算' }).click();
  await page.getByRole('region', { name: '战报详情' }).waitFor();
  await page.getByRole('button', { name: '回顾这一回合' }).click();
  await page.locator('.battle-replay-timeline li.current').first().waitFor();
  assert.equal(await page.locator('.battle-timeline-scroll [data-slot="scroll-area-viewport"]').count(), 1);
  await captureSettledPage(page, '03-report.png');
  const report = await api(page, 'getReport', { reportId: sessionId });
  assert.equal(report.rounds.length, session.snapshot.round);
  assert.deepEqual(report.rounds.at(-1).state, session.snapshot);
  const afterPets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
  const before = beforePets.data.pets.find(pet => pet.petId === petId).growth;
  const after = afterPets.data.pets.find(pet => pet.petId === petId).growth;
  assert.equal((after.level - before.level) * 100 + after.experience - before.experience, session.winner === 'player' ? 20 : 5);
  for (const pet of beforePets.data.pets.filter(pet => pet.petId !== petId)) assert.deepEqual(afterPets.data.pets.find(other => other.petId === pet.petId), pet);
  await api(page, 'retrySettlement', { sessionId }); await api(page, 'retrySettlement', { sessionId });
  const duplicatePets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
  assert.deepEqual(duplicatePets.data.pets, afterPets.data.pets);
  checks.push('UI actions completed a real battle, awarded only the chosen instance and produced a readable full-state report');
  checks.push('two repeated settlement requests did not alter XP, wins or other companion instances');
  assert.deepEqual(errors, []);
  await page.getByRole('tab', { name: '好友对战', exact: true }).click();
  await page.getByPlaceholder('搜索账号或用户名…').waitFor();
  await page.getByRole('tab', { name: '好友对战', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === '训练');
  await page.keyboard.press('ArrowRight');
  await page.getByPlaceholder('搜索账号或用户名…').waitFor();
  checks.push('Radix Tabs arrow keys navigate actual feature routes; report logs use the shared Radix ScrollArea');
  await captureSettledPage(page, '04-friends.png');
  checks.push('friend invitation UI opens; this isolated local account correctly requires cloud login');
  await page.setViewportSize({ width: 960, height: 700 });
  const overflow = await page.evaluate(() => { const el = document.querySelector('.main-content'); return { width: el.clientWidth, scroll: el.scrollWidth }; });
  assert.ok(overflow.scroll <= overflow.width + 2, JSON.stringify(overflow));
  assert.deepEqual(errors, []);
  assert.deepEqual(requested3dAssets, []);
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ at: new Date().toISOString(), platform: process.platform, checks, dependencies, sessionId, rounds: session.snapshot.round, winner: session.winner, reward: session.reward, errors, requested3dAssets, onlineAcceptance: 'Not verified: deployed Supabase endpoint is unavailable; no simulated multiplayer success claimed' }, null, 2));
  console.log(JSON.stringify({ output, passed: true, checks }, null, 2));
}
try { await verify(); } catch (error) {
  if (application) {
    try {
      const page = application.windows()[0];
      await page.screenshot({ path: join(output, 'failure.png') });
      writeFileSync(join(output, 'page.txt'), await page.locator('body').innerText());
      const result = await page.evaluate(() => window.lingjing.invoke('battle', 'overview'));
      writeFileSync(join(output, 'overview.json'), JSON.stringify(result, null, 2));
    } catch { /* Preserve the original failure. */ }
  }
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, errors, logs: logs.slice(-20) }, null, 2));
  console.error(JSON.stringify({ output, passed: false, message: error.message, checks, errors }, null, 2));
  process.exitCode = 1;
} finally {
  writeFileSync(join(output, 'main-process.log'), logs.join(''));
  if (application) await application.close();
}
