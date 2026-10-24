import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

// Production Electron/IPC/Pixi against a fresh, explicitly marked QA profile.
// The owned territory is a controlled fixture, not a geographic/cloud claim.
const require = createRequire(import.meta.url), root = resolve('.');
const outputRoot = resolve('artifacts/companions'); mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, 'five-elements-'));
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true }));
const profile = scenario.profilePath;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const evidence = {
  at: new Date().toISOString(), output, profile,
  source: { sha: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']), mainBundleSha256: digest(readFileSync(resolve('apps/pc-app/dist/main/index.cjs'))), uiEntrySha256: digest(readFileSync(resolve('apps/pc-app/dist/ui/index.html'))) },
  scenario: { id: scenario.scenario, runId: scenario.runId, provenance: 'simulated', isolated: true },
  sources: { authentication: 'isolated-QA-local-account-through-actual-accounts-service', characters: 'registered-project-original-atlases', playback: 'production-IPC-and-Pixi', training: 'actual-local-authoritative-engine', territory: 'simulated-controlled-owned-record', garrison: 'production-command-against-controlled-territory', realCloudAcceptance: false, realGeographicAcceptance: false },
  scope: 'U02/U03 presentation/U05/U07 companions self-acceptance; four-mode/all-25 rules are separately owned by battle and central integration',
  inputs: [], characters: [], screenshots: [], errors: []
};
const legacyFile = join(profile, 'pet-runtime-data.json');
const account = 'companions_five', password = 'Local-five-proof-72!';
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE;
let app, page, owner, pets, representatives, expectedBeforeRestart, original;
const invoke = (feature, command, payload) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
const input = (operation, detail) => evidence.inputs.push({ at: new Date().toISOString(), operation, ...detail });
const success = result => { assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
async function launch() {
  app = await electron.launch({ args: [root, '--force-device-scale-factor=1'], env });
  for (let i = 0; i < 120; i++) { page = app.windows().find(window => window.url().includes('/dist/ui/index.html') && !window.url().includes('#/desktop/')); if (page) break; await delay(100); }
  assert.ok(page); page.setDefaultTimeout(15000);
  page.on('pageerror', error => evidence.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
}
async function size(width, height) {
  await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/dist/ui/index.html') && !window.webContents.getURL().includes('#/desktop/')).setContentSize(value.width, value.height), { width, height });
  await page.waitForFunction(value => innerWidth === value.width && innerHeight === value.height, { width, height });
}
async function route(path) { input('navigate', { path }); await page.evaluate(path => { location.hash = path; }, path); }
async function settle(selector) {
  await page.waitForFunction(selector => {
    const content = document.querySelector(selector), motion = content?.closest('.app-page-motion');
    return content && motion && document.querySelectorAll('.main-content > .app-page-motion').length === 1 && Number(getComputedStyle(motion).opacity) > .999 && [...content.querySelectorAll('.resource-stage')].every(stage => stage.dataset.status === 'ready');
  }, selector);
  await page.evaluate(async selector => {
    await Promise.all([...document.querySelectorAll(`${selector} .resource-portrait image`)].map(async image => { const bitmap = new Image(); bitmap.src = image.getAttribute('href'); await bitmap.decode(); }));
  }, selector);
}
async function shot(name, selector) {
  await settle(selector); await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  assert.equal(await page.locator(selector).isVisible(), true);
  assert.ok((await page.locator(selector).innerText()).length > 40);
  await page.screenshot({ path: join(output, name), timeout: 5000 });
  evidence.screenshots.push({ name, route: page.url(), viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) });
}
async function detail(pet) {
  await route(`/companions/${pet.petId}`); await settle('.cp-detail-page');
  const identity = await page.locator('.cp-detail-layout').evaluate(node => ({ petId: node.dataset.petId, resourceId: node.dataset.resourceId, element: node.dataset.element }));
  assert.deepEqual(identity, { petId: pet.petId, resourceId: pet.resource.resourceId, element: pet.element });
  return identity;
}
async function desktop(pet) {
  let native;
  for (let i = 0; i < 100; i++) { native = app.windows().find(window => window.url().includes(`#/desktop/${pet.petId}`)); if (native) break; await delay(100); }
  assert.ok(native); native.setDefaultTimeout(12000);
  await native.locator('.resource-stage[data-status="ready"]').waitFor();
  const identity = await native.locator('.cp-desktop-surface').evaluate(node => ({ petId: node.dataset.petId, resourceId: node.dataset.resourceId, element: node.dataset.element }));
  assert.deepEqual(identity, { petId: pet.petId, resourceId: pet.resource.resourceId, element: pet.element });
  assert.equal(await native.locator('.resource-stage').getAttribute('data-resource-id'), pet.resource.resourceId);
  assert.equal(await native.locator('.resource-portrait').count(), 0);
  return native;
}
async function play(pet, native, action, label) {
  await page.getByRole('combobox', { name: `${pet.name}的预览动作` }).click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.evaluate(action => {
    window.__proofFrames = []; window.__proofObserver?.disconnect();
    const stage = document.querySelector('.cp-action-preview .resource-stage'), host = stage.querySelector('[data-renderer^="pixi"]');
    window.__proofObserver = new MutationObserver(() => { if (stage.dataset.action === action) window.__proofFrames.push(host.dataset.frame); });
    window.__proofObserver.observe(host, { attributes: true, attributeFilter: ['data-frame'] });
  }, action);
  input('preview-button', { petId: pet.petId, resourceId: pet.resource.resourceId, element: pet.element, action });
  await page.getByRole('button', { name: '播放动作', exact: true }).click();
  const stage = page.locator(`.cp-action-preview .resource-stage[data-action="${action}"][data-status="ready"]`);
  await stage.waitFor(); await native.locator(`.resource-stage[data-action="${action}"]`).waitFor();
  assert.equal(await stage.getAttribute('data-resource-id'), pet.resource.resourceId);
  const initial = await stage.locator('[data-renderer^="pixi"]').getAttribute('data-frame');
  await delay(300);
  const frames = await page.evaluate(initial => { window.__proofObserver.disconnect(); return [initial, ...window.__proofFrames]; }, initial);
  assert.ok(new Set(frames).size > 1, `${pet.element}/${action} must advance actual Pixi frames: ${JSON.stringify(frames)}`);
  const otherWindows = [];
  for (const other of app.windows().filter(window => window !== native && window.url().includes('#/desktop/'))) {
    const observed = await other.locator('.resource-stage').getAttribute('data-action'); assert.equal(observed, 'idle'); otherWindows.push({ route: other.url(), action: observed });
  }
  const result = { action, frames, resourceId: pet.resource.resourceId, nativeAction: await native.locator('.resource-stage').getAttribute('data-action'), otherWindows };
  if (['wood', 'earth'].includes(pet.element) && action === 'skill') await page.screenshot({ path: join(output, `${pet.element}-skill-preview.png`), timeout: 5000 });
  await page.locator('.cp-action-preview .resource-stage[data-action="idle"]').waitFor();
  await native.locator('.resource-stage[data-action="idle"]').waitFor();
  return result;
}
try {
  assert.equal(evidence.source.dirty, '', 'Commit the source before recording a reviewable runtime SHA');
  await launch(); await size(1280, 844);
  original = readFileSync(legacyFile);
  success(await invoke('accounts', 'register', { provider: 'local', account, password, confirmPassword: password, username: '五行伙伴自验', rememberSession: false }));
  const info = success(await invoke('app', 'info')); assert.equal(info.scenario.provenance, 'simulated'); assert.equal(info.scenario.runId, scenario.runId);
  evidence.build = info.build; assert.equal(info.build.sourceCommit, evidence.source.sha); assert.deepEqual(info.build.sourceDirtyFiles, []);
  evidence.runtime = await app.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node, version: app.getVersion(), userData: app.getPath('userData') }));
  assert.equal(resolve(evidence.runtime.userData), resolve(profile));
  const initial = success(await invoke('companions', 'list')); owner = initial.ownerAccountId;
  assert.ok(owner.startsWith(`qa:${scenario.runId}:`));
  const templates = initial.templates; assert.equal(templates.length, 8); assert.equal(new Set(templates.map(template => template.resource.resourceId)).size, 8);
  assert.deepEqual([...new Set(templates.map(template => template.element))].sort(), ['earth', 'fire', 'metal', 'water', 'wood']);
  await route('/companions/adopt'); await settle('.cp-adoption-page');
  assert.equal(await page.locator('.cp-template-card').count(), 8); assert.equal(await page.locator('.cp-template-card .cp-element').count(), 8);
  for (const [element, label] of [['metal', '金'], ['wood', '木'], ['water', '水'], ['fire', '火'], ['earth', '土']]) {
    await page.getByRole('combobox', { name: '按五行筛选', exact: true }).click(); await page.getByRole('option', { name: label, exact: true }).click();
    await page.waitForFunction(element => { const cards = [...document.querySelectorAll('.cp-template-card .cp-element')]; return cards.length > 0 && cards.every(card => card.dataset.element === element); }, element);
    input('adoption-element-filter', { element, actualCards: await page.locator('.cp-template-card').count() });
  }
  await page.getByRole('combobox', { name: '按五行筛选', exact: true }).click(); await page.getByRole('option', { name: '全部五行', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.cp-template-card').length === 8);
  const show = page.getByRole('checkbox', { name: '领养后放到桌面', exact: true }); if (await show.getAttribute('aria-checked') === 'true') await show.click();
  for (const template of templates) {
    await page.locator('.cp-template-card').filter({ has: page.locator('strong', { hasText: new RegExp(`^${template.name}$`) }) }).click();
    await page.getByRole('textbox', { name: '给它起个昵称', exact: true }).fill(template.name);
    input('adopt-form', { templateId: template.templateId, name: template.name, element: template.element });
    await page.getByRole('button', { name: '领养这位伙伴', exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${template.name} 已加入` }).waitFor();
  }
  const snapshot = success(await invoke('companions', 'list'));
  pets = templates.map(template => snapshot.pets.find(pet => pet.templateId === template.templateId && pet.source === 'adoption'));
  assert.ok(pets.every(Boolean)); assert.equal(new Set(pets.map(pet => pet.petId)).size, 8);
  for (const [index, pet] of pets.entries()) { assert.equal(pet.element, templates[index].element); assert.equal(pet.resource.resourceId, templates[index].resource.resourceId); }
  representatives = ['metal', 'wood', 'water', 'fire', 'earth'].map(element => pets.find(pet => pet.element === element));
  // Closed-profile fixture import uses the real territory repository contract.
  success(await invoke('garden', 'snapshot')); await app.close(); app = null;
  const db = new DatabaseSync(join(profile, 'lingjing.sqlite'));
  const { TerritoryService } = require(resolve('apps/pc-app/runtime/features/garden/territories.cjs'));
  const territory = { id: `qa:companions:${scenario.runId}`, name: '五行驻守验收庭院', regionName: '隔离 QA 场景', ownerAccountId: owner, revision: 1, captureMultiplier: 2, provenance: 'controlled-ui-fixture', scenarioId: scenario.scenario, runId: scenario.runId, boundary: [{ lat: 31, lng: 121 }, { lat: 31.006, lng: 121 }, { lat: 31.006, lng: 121.006 }, { lat: 31, lng: 121.006 }] };
  new TerritoryService({ db, get() { return null; } }).importRecord(territory); db.close(); evidence.territoryFixture = territory;
  await launch(); await size(1280, 844);
  success(await invoke('accounts', 'login', { provider: 'local', account, password, rememberSession: false }));
  for (const pet of representatives) success(await invoke('companions', 'desktop', { actionId: `quiet-${pet.petId}`, petId: pet.petId, behavior: 'quiet', visible: true }));
  for (const pet of representatives) {
    const native = await desktop(pet); const detailIdentity = await detail(pet);
    await shot(`detail-${pet.element}.png`, '.cp-detail-page');
    await page.getByRole('button', { name: '对战属性规则', exact: true }).focus();
    const hint = page.getByRole('tooltip'); await hint.waitFor(); assert.match(await hint.innerText(), /开场生命 120/);
    await page.keyboard.press('Escape'); await page.getByRole('tab', { name: '技能', exact: true }).click();
    const skillNames = await page.locator('.cp-skill-list [data-action]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-action')));
    assert.deepEqual(skillNames, ['normal_attack', 'element_attack', 'dodge', 'ultimate']);
    await page.getByRole('tab', { name: '外观', exact: true }).click();
    const actions = [];
    for (const [action, label] of [['wave', '招手'], ['eat', '吃饭'], ['attack', '普通攻击'], ['hit', '受击'], ['skill', '元素技能']]) actions.push(await play(pet, native, action, label));
    const battleChoice = page.getByRole('button', { name: '设为出战伙伴', exact: true }); if (await battleChoice.count()) await battleChoice.click();
    assert.equal(success(await invoke('companions', 'list')).selections.battlePetId, pet.petId);
    await page.getByRole('tab', { name: '回忆', exact: true }).click();
    await page.getByRole('button', { name: '打开它的聊天与记忆', exact: true }).click(); await page.waitForURL('**#/chat');
    const chat = success(await invoke('conversations', 'snapshot')); assert.equal(chat.petId, pet.petId);
    const chatPet = chat.pets.find(candidate => candidate.petId === pet.petId); assert.equal(chatPet.resource.resourceId, pet.resource.resourceId); assert.equal(chatPet.element, pet.element);
    input('conversation-entry', { petId: chat.petId, resourceId: chatPet.resource.resourceId, element: chatPet.element });
    await route('/battle'); await page.getByRole('button', { name: '开始训练', exact: true }).waitFor();
    await page.getByRole('button', { name: '开始训练', exact: true }).click();
    await page.locator('[data-battle-screen="shared-v1"]').waitFor();
    const overview = success(await invoke('battle', 'overview')), session = success(await invoke('battle', 'snapshot', { sessionId: overview.session.id }));
    assert.equal(session.player.petId, pet.petId); assert.equal(session.player.resource.resourceId, pet.resource.resourceId); assert.equal(session.player.element, pet.element);
    input('training-start-button', { sessionId: session.id, petId: pet.petId, resourceId: session.player.resource.resourceId, element: session.player.element, authority: session.context?.authority || 'local' });
    await shot(`battle-${pet.element}.png`, '[data-battle-screen="shared-v1"]');
    success(await invoke('battle', 'leave', { sessionId: session.id }));
    await route('/garden'); await page.getByRole('button', { name: '确认驻守', exact: true }).waitFor();
    await page.locator('.garden-territory-panel .garden-pet').filter({ has: page.locator('strong', { hasText: new RegExp(`^${pet.name}$`) }) }).click();
    await page.getByRole('button', { name: '确认驻守', exact: true }).click();
    await page.waitForFunction(async ({ territoryId, petId }) => { const result = await window.lingjing.invoke('garden', 'snapshot'); return result.ok && result.data.territories.find(value => value.id === territoryId)?.garrisonPetId === petId; }, { territoryId: territory.id, petId: pet.petId });
    const garden = success(await invoke('garden', 'snapshot')), gardenPet = garden.pets.find(candidate => candidate.petId === pet.petId);
    assert.equal(gardenPet.resource.resourceId, pet.resource.resourceId); assert.equal(gardenPet.element, pet.element);
    input('garrison-confirm-button', { territoryId: territory.id, petId: pet.petId, resourceId: gardenPet.resource.resourceId, element: gardenPet.element, territoryProvenance: 'controlled-ui-fixture' });
    if (['wood', 'earth'].includes(pet.element)) await shot(`garrison-${pet.element}.png`, '.garden-feature');
    evidence.characters.push({ name: pet.name, templateId: pet.templateId, ...detailIdentity, actions, chat: { petId: chat.petId, resourceId: chatPet.resource.resourceId, element: chatPet.element }, training: { sessionId: session.id, petId: session.player.petId, resourceId: session.player.resource.resourceId, element: session.player.element }, garrison: { territoryId: territory.id, petId: garden.territories.find(value => value.id === territory.id).garrisonPetId, resourceId: gardenPet.resource.resourceId, element: gardenPet.element }, skillNames });
  }
  evidence.layouts = [];
  for (const [width, height] of [[1280, 844], [1440, 900]]) {
    await size(width, height); await detail(representatives.find(pet => pet.element === 'wood')); await shot(`${width}-detail.png`, '.cp-detail-page');
    const metrics = await page.evaluate(() => { const rect = selector => { const value = document.querySelector(selector).getBoundingClientRect(); return { x: value.x, y: value.y, width: value.width, height: value.height, bottom: value.bottom }; }; const heading = getComputedStyle(document.querySelector('.cp-detail-left h1')); return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, title: rect('.cp-detail-left .page-header'), tabs: rect('.cp-detail-tabs'), right: rect('.cp-detail-body'), scene: rect('.cp-detail-hero'), hint: rect('.cp-growth-card .cp-hint'), meters: rect('.cp-growth-card .cp-meters'), heading: { size: heading.fontSize, weight: heading.fontWeight }, visibleCopy: document.querySelector('.cp-detail-content').innerText }; });
    assert.equal(metrics.heading.size, '28px'); assert.equal(metrics.heading.weight, '700'); assert.ok(Math.abs(metrics.title.y - metrics.tabs.y) <= 2); assert.ok(metrics.tabs.width >= metrics.right.width - 2); assert.ok(metrics.scene.bottom <= height);
    assert.equal(metrics.hint.width, 24); assert.equal(metrics.hint.height, 24); assert.ok(metrics.meters.height <= 120, 'Compact status hints must not stretch the growth panel');
    assert.doesNotMatch(metrics.visibleCopy, /养成属性不直接代入|在桌面拖动伙伴|聊天、人设和记忆始终归属/);
    await route('/companions'); await shot(`${width}-overview.png`, '.cp-page');
    await page.getByRole('button', { name: '领养伙伴', exact: true }).click(); await shot(`${width}-adoption.png`, '.cp-adoption-page');
    assert.equal(await page.locator('.cp-template-card [data-framing="portrait"]').count(), 8);
    await page.locator('.cp-template-card').last().scrollIntoViewIfNeeded(); await shot(`${width}-adoption-lower.png`, '.cp-adoption-page'); evidence.layouts.push(metrics);
  }
  expectedBeforeRestart = success(await invoke('companions', 'list'));
  await app.close(); app = null; await launch();
  success(await invoke('accounts', 'login', { provider: 'local', account, password, rememberSession: false }));
  const restored = success(await invoke('companions', 'list'));
  for (const pet of expectedBeforeRestart.pets.filter(pet => pet.resource.kind === '2d')) { const actual = restored.pets.find(candidate => candidate.petId === pet.petId); assert.equal(actual.name, pet.name); assert.equal(actual.element, pet.element); assert.deepEqual(actual.resource, pet.resource); assert.deepEqual(actual.growth, pet.growth); assert.equal(actual.desktop.visible, pet.desktop.visible); }
  assert.deepEqual(restored.selections, expectedBeforeRestart.selections);
  evidence.restart = { petCount: restored.pets.filter(pet => pet.resource.kind === '2d').length, selections: restored.selections, reauthenticatedSameQaAccount: true, sessionPersistence: 'memory-only-by-QA-policy' };
  assert.equal(digest(readFileSync(legacyFile)), digest(original)); evidence.originalLegacySha256 = digest(original);
  assert.deepEqual(evidence.errors, []); await app.close(); app = null;
  const readback = new DatabaseSync(join(profile, 'lingjing.sqlite'), { readOnly: true });
  evidence.database = { pets: readback.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=?').all(owner).map(row => JSON.parse(row.data_json)), selections: readback.prepare('SELECT selections_json FROM companion_accounts WHERE owner_account_id=?').get(owner), garrisons: readback.prepare('SELECT * FROM garden_garrisons WHERE owner_account_id=?').all(owner), actions: readback.prepare('SELECT operation, count(*) total FROM companion_actions WHERE owner_account_id=? GROUP BY operation').all(owner), battleSessions: readback.prepare('SELECT id,status,data_json FROM battle_sessions WHERE owner_account_id=?').all(owner).map(row => ({ id: row.id, status: row.status, player: JSON.parse(row.data_json).player })) };
  assert.equal(evidence.database.garrisons[0].pet_id, representatives.at(-1).petId); readback.close();
  evidence.result = 'passed'; console.log(`REAL_FIVE_ELEMENTS_PASSED ${output}`);
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.stack; process.exitCode = 1;
  if (page) await page.screenshot({ path: join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error(`REAL_FIVE_ELEMENTS_FAILED ${output}`, error);
} finally { writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); await app?.close().catch(() => {}); }
