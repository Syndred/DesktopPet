import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
const require = createRequire(import.meta.url);
const root = process.cwd();
const outputRoot = resolve('artifacts/companions'); mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, 'electron-'));
const profile = join(output, 'profile'); mkdirSync(profile);
const legacyFile = join(profile, 'pet-runtime-data.json');
const sessionFile = join(profile, 'pet-auth-session.json');
const { RuntimeDataStore } = require(resolve('apps/pc-app/runtime/services/runtime-data-store.cjs'));
const legacy = new RuntimeDataStore({ filePath: legacyFile, sessionFilePath: sessionFile });
const password = 'Companion-local-test-72!';
const accountA = legacy.registerUser('companions_a', password, '伙伴验收 A').currentUser;
const accountB = legacy.registerUser('companions_b', password, '伙伴验收 B').currentUser;
legacy.loginUser('companions_a', password);
legacy.saveBattleReport({ id: 'preserved-report', status: 'finished', winner: 'player', mode: 'duel', totalRounds: 1, player: { petId: 'pet-001', petName: '焰柴', element: 'fire' }, enemy: { petName: '对手', element: 'wood' }, rounds: [] });
const original = JSON.parse(readFileSync(legacyFile, 'utf8'));
const hasAccounts = existsSync(resolve('apps/pc-app/runtime/features/accounts/index.cjs'));
// A real planted crop with a historical plantedAt proves offline maturation on startup.
const { GardenService } = require(resolve('apps/pc-app/runtime/features/garden/service.cjs'));
const fixtureDb = new DatabaseSync(join(profile, 'lingjing.sqlite'));
let ownerA = accountA.id; let ownerB = accountB.id;
if (hasAccounts) {
  const { migrations } = require(resolve('apps/pc-app/runtime/features/accounts/schema.cjs'));
  for (const migration of migrations) fixtureDb.exec(migration.sql);
  const { importLegacy } = require(resolve('apps/pc-app/runtime/features/accounts/legacy.cjs'));
  importLegacy({ db: fixtureDb, filePath: legacyFile, archiveDir: join(profile, 'fixture-legacy-archives') });
  ownerA = fixtureDb.prepare("SELECT owner_account_id FROM account_aliases WHERE provider='local' AND subject_id=?").get(accountA.id).owner_account_id;
  ownerB = fixtureDb.prepare("SELECT owner_account_id FROM account_aliases WHERE provider='local' AND subject_id=?").get(accountB.id).owner_account_id;
}
const garden = new GardenService({ db: fixtureDb, clock: () => Date.now() - 26 * 60_000 });
assert.equal(garden.plant({ ownerAccountId: ownerA }, { actionId: 'offline-rice-seed', expectedRevision: 0, plotId: 'plot-1', cropType: 'rice' }).ok, true);
fixtureDb.close();

const errors = []; const evidence = { at: new Date().toISOString(), output, accountA: accountA.id, accountB: accountB.id, ownerA, ownerB, fixture: 'Two local test accounts; retained six legacy animals and one battle report; rice planted 26 minutes before startup by real GardenService.', checks: [] };
writeFileSync(join(outputRoot, 'latest.txt'), output);
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
let application;
const invoke = (page, feature, command, payload) => page.evaluate(async ({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function screenshot(page, name) { await page.screenshot({ path: join(output, `${name}.png`) }); }
async function snapshot(page) { const result = await invoke(page, 'companions', 'list'); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; }
async function nativeWindows() { return application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(win => ({ id: win.id, title: win.getTitle(), bounds: win.getBounds(), visible: win.isVisible(), url: win.webContents.getURL(), sandbox: win.webContents.getLastWebPreferences().sandbox, contextIsolation: win.webContents.getLastWebPreferences().contextIsolation }))); }
async function mainPage() {
  // Restored companion windows can be created before the main window, initially about:blank.
  for (let i = 0; i < 150; i++) {
    const page = application.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('#/desktop/'));
    if (page) return page;
    await delay(100);
  }
  throw new Error('The real management renderer did not open');
}
async function waitForCount(count) {
  for (let i = 0; i < 60; i++) { const windows = await nativeWindows(); if (windows.filter(win => win.url.includes('#/desktop/') && win.visible).length === count) return windows; await delay(100); }
  throw new Error(`Expected ${count} native companion windows: ${JSON.stringify(await nativeWindows())}`);
}
try {
  application = await electron.launch({ args: [root], env });
  let page = await mainPage(); page.on('pageerror', error => errors.push(error.message));
  application.on('window', target => { target.on('pageerror', error => errors.push(error.message)); });
  const info = await invoke(page, 'app', 'info');
  assert.ok(info.data.features.some(feature => feature.id === 'resources'), 'resources must be registered in the real host');
  assert.ok(info.data.features.some(feature => feature.id === 'garden'), 'garden must be registered in the real host');
  if (hasAccounts) {
    const loggedIn = await invoke(page, 'accounts', 'login', { account: 'companions_a', password, provider: 'local', rememberSession: true });
    assert.equal(loggedIn.ok, true, JSON.stringify(loggedIn));
  }
  await page.getByRole('button', { name: '领养伙伴', exact: true }).waitFor();
  const initial = await snapshot(page); assert.equal(initial.pets.length, 6);
  assert.equal(initial.pets.find(pet => pet.petId === 'pet-001').growth.level, original.userInventories[accountA.id].pets[0].level);
  evidence.checks.push('legacy animals imported with original IDs and growth');
  await page.getByRole('button', { name: '领养伙伴', exact: true }).click();
  for (const name of ['鱼丸', '小蓝', '饭团']) {
    await page.getByLabel('给它起个昵称').fill(name);
    await page.getByRole('button', { name: '领养这位伙伴', exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${name} 已加入` }).waitFor();
  }
  const adopted = (await snapshot(page)).pets.filter(pet => pet.source === 'adoption');
  assert.equal(adopted.length, 3); assert.equal(new Set(adopted.map(pet => pet.petId)).size, 3); assert.equal(new Set(adopted.map(pet => pet.templateId)).size, 1);
  await waitForCount(3);
  evidence.adopted = adopted.map(pet => ({ petId: pet.petId, name: pet.name, templateId: pet.templateId }));
  for (const companionPage of application.windows().filter(page => page.url().includes('#/desktop/'))) {
    await companionPage.locator('.resource-stage[data-status="ready"] [data-renderer="pixi"] canvas').waitFor();
    assert.equal(await companionPage.locator('model-viewer').count(), 0);
    await screenshot(companionPage, `desktop-${await companionPage.locator('.cp-desktop-name').innerText()}`);
  }
  evidence.checks.push('three visible sandboxed Electron windows render three independently owned instances of one 2D template');
  await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click();
  await page.getByRole('button', { name: new RegExp(`选择伙伴 鱼丸`) }).click();
  await page.getByRole('button', { name: '修改鱼丸的名字' }).click();
  await page.getByLabel('伙伴名字', { exact: true }).fill('鱼丸一号');
  await page.getByRole('button', { name: '保存名字', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const renamed = await snapshot(page); assert.equal(renamed.pets.find(pet => pet.petId === adopted.find(pet => pet.name === '鱼丸').petId).name, '鱼丸一号');
  assert.equal(renamed.pets.find(pet => pet.petId === adopted.find(pet => pet.name === '小蓝').petId).name, '小蓝');
  await screenshot(page, 'companions-overview');
  evidence.checks.push('UI adoption and per-pet rename pass through production preload and IPC');
  const fish = renamed.pets.find(pet => pet.name === '鱼丸一号');
  await page.getByRole('button', { name: '查看伙伴详情' }).click();
  await page.getByRole('heading', { name: '每一份陪伴，都有回应。' }).waitFor();
  await screenshot(page, 'pet-detail');
  // Real garden UI: offline mature rice -> harvest -> craft -> choose exactly one pet -> feed.
  await page.getByRole('button', { name: '领地', exact: true }).click();
  await page.getByRole('link', { name: '我的菜园', exact: true }).click();
  await page.getByRole('button', { name: '♧ 收获', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '稻米已放入背包' }).waitFor();
  await page.getByRole('link', { name: '制作食物', exact: true }).click();
  await page.getByRole('button', { name: /制作米饭/ }).click();
  await page.getByRole('status').filter({ hasText: '米饭' }).waitFor();
  const beforeFeeding = await snapshot(page);
  await page.getByRole('group', { name: '指定伙伴' }).getByRole('button', { name: /鱼丸一号/ }).click();
  await page.getByRole('button', { name: '♡ 喂给鱼丸一号', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '已给鱼丸一号喂食' }).waitFor();
  const fed = await snapshot(page);
  assert.equal(fed.pets.find(pet => pet.petId === fish.petId).growth.satiety, fish.growth.satiety + 20);
  for (const pet of beforeFeeding.pets.filter(pet => pet.petId !== fish.petId)) assert.deepEqual(fed.pets.find(current => current.petId === pet.petId).growth, pet.growth);
  await screenshot(page, 'specified-pet-feeding');
  const gardenAfter = await invoke(page, 'garden', 'snapshot'); assert.equal(gardenAfter.data.items.find(item => item.id === 'cooked_rice').quantity, 0);
  evidence.checks.push('real garden harvest and rice crafting debit one cooked rice and affect only the selected fish');
  evidence.fed = { petId: fish.petId, growthBefore: fish.growth, growthAfter: fed.pets.find(pet => pet.petId === fish.petId).growth };
  await page.getByRole('button', { name: '我的灵宠', exact: true }).click();
  await page.getByRole('button', { name: /选择伙伴 小蓝/ }).click();
  const behavior = page.getByRole('combobox', { name: '小蓝的行为模式' });
  if (await behavior.evaluate(element => element.tagName === 'SELECT')) await behavior.selectOption('sleep');
  else { await behavior.click(); await page.getByRole('option', { name: '好好休息', exact: true }).click(); }
  assert.equal((await snapshot(page)).pets.find(pet => pet.name === '小蓝').desktop.behavior, 'sleep');
  assert.equal(await page.locator('model-viewer').count(), 0);
  const blue = adopted.find(pet => pet.name === '小蓝');
  await invoke(page, 'companions', 'select', { actionId: 'select-chat', petId: fish.petId, slot: 'chatPetId' });
  await invoke(page, 'companions', 'select', { actionId: 'select-battle', petId: blue.petId, slot: 'battlePetId' });
  const separated = await snapshot(page);
  assert.equal(separated.selections.chatPetId, fish.petId);
  assert.equal(separated.selections.battlePetId, blue.petId);
  assert.equal(separated.selections.guardPetId, null);
  assert.equal(separated.pets.filter(pet => pet.desktop.visible).length, 3);
  evidence.checks.push('production IPC selects chat and battle independently without changing desktop or guard selection');
  // Native drag can be performed while this actual application remains open.
  evidence.windowsBeforeDrag = await waitForCount(3);
  if (process.env.COMPANIONS_NATIVE_PAUSE === '1') {
    writeFileSync(join(output, 'ready-native.json'), JSON.stringify(evidence.windowsBeforeDrag, null, 2));
    console.log(`NATIVE_READY ${output}`);
    while (!existsSync(join(output, 'native.done'))) await delay(250);
  }
  const beforeRestart = await snapshot(page);
  evidence.beforeRestart = beforeRestart;
  evidence.windowsBeforeRestart = await nativeWindows();
  await application.close(); application = null;
  application = await electron.launch({ args: [root], env }); page = await mainPage();
  await page.getByRole('heading', { name: '今天，也有小家伙在等你。' }).waitFor();
  await waitForCount(3);
  const afterRestart = await snapshot(page);
  for (const before of beforeRestart.pets) {
    const after = afterRestart.pets.find(pet => pet.petId === before.petId);
    assert.equal(after.name, before.name); assert.deepEqual(after.growth, before.growth); assert.equal(after.desktop.behavior, before.desktop.behavior); assert.equal(after.desktop.visible, before.desktop.visible);
    assert.deepEqual(after.desktop.position, before.desktop.position);
  }
  evidence.checks.push('close/relaunch restores names, growth, independent behavior, desktop visibility and saved positions');
  // Switch through the real local RuntimeDataStore, not a mock session resolver.
  if (hasAccounts) {
    const result = await invoke(page, 'accounts', 'login', { account: 'companions_b', password, provider: 'local', rememberSession: true });
    assert.equal(result.ok, true, JSON.stringify(result));
  } else await application.evaluate(async (_electron, { runtime, password }) => {
    const load = process.getBuiltinModule('module').createRequire(runtime);
    const { initializeLegacy } = load(runtime); initializeLegacy().runtimeDataStore.loginUser('companions_b', password);
  }, { runtime: resolve('apps/pc-app/runtime/main.cjs'), password });
  await waitForCount(0);
  const other = await snapshot(page); assert.equal(other.ownerAccountId, ownerB); assert.equal(other.pets.filter(pet => pet.source === 'adoption').length, 0);
  const denied = await invoke(page, 'companions', 'rename', { actionId: 'foreign-pet', petId: fish.petId, name: '不能改名', ownerAccountId: ownerA }); assert.equal(denied.code, 'PET_NOT_FOUND');
  if (hasAccounts) {
    const result = await invoke(page, 'accounts', 'login', { account: 'companions_a', password, provider: 'local', rememberSession: true });
    assert.equal(result.ok, true, JSON.stringify(result));
  } else await application.evaluate(async (_electron, { runtime, password }) => { const load = process.getBuiltinModule('module').createRequire(runtime); const { initializeLegacy } = load(runtime); initializeLegacy().runtimeDataStore.loginUser('companions_a', password); }, { runtime: resolve('apps/pc-app/runtime/main.cjs'), password });
  await waitForCount(3);
  assert.equal((await snapshot(page)).pets.find(pet => pet.petId === fish.petId).name, '鱼丸一号');
  evidence.checks.push('real local account switch removes previous account windows; foreign pet mutation denied even with forged renderer owner');
  const afterLegacy = JSON.parse(readFileSync(legacyFile, 'utf8'));
  assert.deepEqual(afterLegacy.userInventories[accountA.id].pets, original.userInventories[accountA.id].pets);
  assert.deepEqual(afterLegacy.userInventories[accountA.id].battleReports, original.userInventories[accountA.id].battleReports);
  evidence.checks.push('legacy animals and battle history remain unchanged');
  evidence.windows = await nativeWindows(); evidence.errors = errors; assert.deepEqual(errors, []);
  evidence.electron = await application.evaluate(() => process.versions.electron);
  evidence.result = 'passed';
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(`REAL_ELECTRON_PASSED ${output}`);
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.stack; evidence.errors = errors;
  if (application) { evidence.windows = await nativeWindows().catch(() => []); const page = await mainPage().catch(() => null); if (page) { await screenshot(page, 'failure').catch(() => {}); evidence.visibleText = await page.locator('body').innerText().catch(() => ''); } }
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.error(`REAL_ELECTRON_FAILED ${output}`, error); process.exitCode = 1;
} finally { if (application) await application.close(); }
