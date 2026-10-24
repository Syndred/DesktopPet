import { _electron as electron } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

// This test uses the real Windows picker; select the printed JSON while it waits.
// There are no picker, model, cloud, location, battle or domain service mocks.
const output = resolve('artifacts/foundation/resource-art'); mkdirSync(output, { recursive: true });
const resume = process.env.LINGJING_RESOURCE_RESUME ? JSON.parse(readFileSync(process.env.LINGJING_RESOURCE_RESUME, 'utf8')) : null;
const profile = resume?.profile || join(output, `profile-${Date.now()}`);
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const password = 'LingjingResourceQA2026!';
const evidence = resume ? { ...resume, resumedAt: new Date().toISOString(), errors: [] } : { at: new Date().toISOString(), profile, checks: [], errors: [] };
delete evidence.failure;
let application;
const invoke = async (page, feature, command, payload) => {
  const result = await page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
  assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
};
async function mainPage() {
  for (let i = 0; i < 100; i++) {
    const page = application.windows().find(p => p.url().includes('/dist/ui/index.html') && !p.url().includes('#/desktop/'));
    if (page) { page.on('pageerror', error => evidence.errors.push(error.message)); await page.waitForFunction(() => Boolean(window.lingjing)); return page; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Management renderer did not open');
}
async function go(page, path, selector) {
  await page.evaluate(path => { location.hash = `#${path}`; }, path);
  if (selector) await page.locator(selector).waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) > .99);
}
const capture = (page, name) => page.screenshot({ path: join(output, `${name}.png`) });
try {
  application = await electron.launch({ args: [resolve('.')], env });
  application.on('window', page => page.on('pageerror', error => evidence.errors.push(error.message)));
  let page = await mainPage();
  let pets, firstId, secondId, imported;
  if (!resume) {
  await invoke(page, 'accounts', 'register', { provider: 'local', account: 'foundation_art', username: '2D 流程验收', password, confirmPassword: password, rememberSession: true });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await go(page, '/companions/adopt', '#cp-adoption-name');
  await page.getByRole('checkbox', { name: '领养后放到桌面', exact: true }).uncheck();
  for (const name of ['图集伙伴甲', '图集伙伴乙']) {
    await page.getByLabel('给它起个昵称', { exact: true }).fill(name);
    await page.getByRole('button', { name: '领养这位伙伴', exact: true }).click();
    await page.getByRole('status').filter({ hasText: `${name} 已加入` }).waitFor();
  }
  pets = (await invoke(page, 'companions', 'list')).pets;
  assert.equal(pets.length, 2); assert.equal(new Set(pets.map(p => p.templateId)).size, 1);
  firstId = pets.find(p => p.name === '图集伙伴甲').petId; secondId = pets.find(p => p.name === '图集伙伴乙').petId;
  evidence.pets = pets.map(p => ({ petId: p.petId, name: p.name, templateId: p.templateId }));
  evidence.checks.push('UI adopts two independent petIds from the same template');
  await go(page, '/companions', '.cp-overview');
  await page.getByRole('button', { name: /选择伙伴 图集伙伴甲/ }).click();
  const rename = page.getByRole('button', { name: '修改图集伙伴甲的名字', exact: true });
  await rename.click(); await page.getByRole('dialog').waitFor();
  for (let i = 0; i < 9; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[role=dialog]'))), true); }
  await capture(page, 'radix-dialog'); await page.keyboard.press('Escape'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await rename.evaluate(element => document.activeElement === element), true);
  evidence.checks.push('Radix modal traps Tab, closes with Escape and returns focus');
  await go(page, '/resources', '.resources-page');
  let resources = await invoke(page, 'resources', 'list'); assert.ok(resources.length > 0 && resources.every(r => r.kind === 'spritesheet'));
  await page.locator('.resource-stage[data-status="ready"]').first().waitFor({ timeout: 30000 }); await capture(page, 'whale-girl');
  evidence.asset = await page.evaluate(async () => { const response = await fetch('lingjing-resource://asset/builtin%3Alingjing-yuwan-v1/yuwan-sprites-v1.png'); return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }; });
  assert.equal(evidence.asset.status, 200); assert.ok(evidence.asset.bytes > 100000);
  await page.getByRole('button', { name: '选择文件并导入', exact: true }).click();
  console.log('NATIVE_PICKER_READY', resolve('apps/pc-app/runtime/assets/illustrations/yuwan-character-v1.json'));
  for (let i = 0; i < 360; i++) {
    resources = await invoke(page, 'resources', 'list'); imported = resources.find(r => r.origin === 'import');
    if (imported) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(imported, 'No resource imported through the native picker within 180 seconds');
  evidence.imported = { id: imported.id, name: imported.name, kind: imported.kind };
  await page.locator(`.resource-card[data-resource-id="${imported.id}"]`).click();
  await page.locator(`.resource-stage[data-resource-id="${imported.id}"][data-status="ready"]`).waitFor({ timeout: 30000 });
  const scale = page.getByRole('slider', { name: '大小', exact: true }); await scale.focus(); await scale.press('ArrowRight');
  const anchor = page.getByRole('slider', { name: '锚点 X', exact: true }); await anchor.focus(); await anchor.press('ArrowRight');
  await page.getByRole('button', { name: '保存动作与显示设置', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '2D 动作与显示设置已保存' }).waitFor();
  await page.getByRole('button', { name: '应用给伙伴', exact: true }).click();
  await page.getByRole('combobox', { name: '应用形象的伙伴', exact: true }).click(); await page.getByRole('option', { name: /图集伙伴甲/ }).click();
  await page.getByRole('button', { name: '应用给图集伙伴甲', exact: true }).click(); await page.getByRole('status').filter({ hasText: '已为图集伙伴甲应用形象' }).waitFor();
  pets = (await invoke(page, 'companions', 'list')).pets;
  assert.equal(pets.find(p => p.petId === firstId).resource.resourceId, imported.id); assert.notEqual(pets.find(p => p.petId === secondId).resource.resourceId, imported.id);
  await page.keyboard.press('Escape');
  evidence.calibration = (await invoke(page, 'resources', 'resolve', { resourceId: imported.id, petId: firstId, context: 'desktop', action: 'idle' })).calibration;
  assert.equal(evidence.calibration.scale, 1.01); assert.equal(evidence.calibration.anchorX, .51);
  await page.getByRole('button', { name: '双实例对照', exact: true }).click(); await page.locator('.resource-stage-pair .resource-stage[data-status="ready"]').nth(1).waitFor();
  const keys = await page.locator('.resource-stage-pair [data-texture-key]').evaluateAll(elements => elements.map(e => e.getAttribute('data-texture-key')));
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]); await capture(page, 'native-2d-import-and-binding');
  evidence.checks.push('Real Windows picker imports managed bytes; keyboard calibration saves; only the chosen pet changes; two Pixi instances share an atlas cache key');
  } else {
    await page.getByRole('navigation', { name: '主导航' }).waitFor();
    firstId = evidence.pets.find(p => p.name === '图集伙伴甲').petId; secondId = evidence.pets.find(p => p.name === '图集伙伴乙').petId; imported = evidence.imported;
  }
  await go(page, '/settings', '.ac-preferences-page'); await page.getByRole('switch', { name: '界面动效', exact: true }).uncheck(); await page.getByRole('button', { name: '保存设置', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced'); await go(page, '/companions', '.cp-overview'); assert.equal(await page.locator('.app-page-motion').getAttribute('data-motion'), 'reduced');
  await go(page, '/settings', '.ac-preferences-page'); await page.getByRole('switch', { name: '界面动效', exact: true }).check(); await page.getByRole('button', { name: '保存设置', exact: true }).click(); await page.waitForFunction(() => document.documentElement.dataset.motion === 'enabled');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced'); await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForFunction(() => document.documentElement.dataset.motion === 'enabled');
  evidence.checks.push('Saved app animation preference and reduced-motion media both control shared Motion/Pixi policy');
  await go(page, `/companions/${firstId}`, '.cp-detail-layout'); await page.getByRole('button', { name: '放到桌面', exact: true }).click();
  let desktop; for (let i = 0; i < 100; i++) { desktop = application.windows().find(p => p.url().includes(`#/desktop/${firstId}`)); if (desktop) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(desktop); await desktop.locator(`.resource-stage[data-resource-id="${imported.id}"][data-status="ready"] canvas`).waitFor({ timeout: 30000 }); await capture(desktop, 'desktop-imported-2d');
  await invoke(page, 'companions', 'select', { petId: secondId, slot: 'chatPetId', actionId: crypto.randomUUID() }); await invoke(page, 'battle', 'selectPet', { petId: firstId, actionId: crypto.randomUUID() });
  await go(page, '/battle', '.battle-training-card'); await page.getByRole('button', { name: '开始训练', exact: true }).click();
  await page.locator(`.battle-stage .resource-stage[data-pet-id="${firstId}"][data-resource-id="${imported.id}"][data-status="ready"]`).waitFor({ timeout: 30000 }); await capture(page, 'battle-imported-2d');
  const selections = (await invoke(page, 'companions', 'list')).selections; assert.equal(selections.chatPetId, secondId); assert.equal(selections.battlePetId, firstId);
  const session = (await invoke(page, 'battle', 'overview')).session; evidence.battle = { sessionId: session.id, player: session.player.petId, appearance: session.player.appearance2d }; assert.equal(session.player.appearance2d, imported.id);
  evidence.checks.push('Imported appearance renders in actual desktop and battle; chat/battle selections remain independent');
  await application.close(); application = await electron.launch({ args: [resolve('.')], env }); page = await mainPage(); await page.getByRole('navigation', { name: '主导航' }).waitFor();
  pets = (await invoke(page, 'companions', 'list')).pets; assert.equal(pets.find(p => p.petId === firstId).resource.resourceId, imported.id);
  const recovered = await invoke(page, 'resources', 'resolve', { resourceId: imported.id, petId: firstId, context: 'desktop', action: 'idle' }); assert.deepEqual(recovered.calibration, evidence.calibration); assert.equal((await invoke(page, 'battle', 'overview')).session.id, session.id);
  await go(page, '/resources', '.resources-page'); await page.locator(`.resource-card[data-resource-id="${imported.id}"]`).click(); await page.locator(`.resource-stage[data-resource-id="${imported.id}"][data-status="ready"]`).waitFor({ timeout: 30000 }); await capture(page, 'restored-2d-resource');
  assert.equal(await page.locator('model-viewer').count(), 0); assert.deepEqual(evidence.errors, []); evidence.checks.push('Full app restart restores local session, petIds, imported bytes, calibration and in-progress battle');
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log('Real 2D import/appearance/desktop/battle/restart flow passed:', output);
} catch (error) {
  evidence.failure = String(error); writeFileSync(join(output, 'failure.json'), JSON.stringify(evidence, null, 2));
  const page = application?.windows().find(p => !p.url().includes('#/desktop/')); if (page) { await capture(page, 'failure'); console.error(await page.locator('body').innerText()); } throw error;
} finally { if (application) await application.close(); }
