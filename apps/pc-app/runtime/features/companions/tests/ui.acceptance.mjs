import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const profile = process.env.COMPANIONS_UI_PROFILE || join(readFileSync(resolve('artifacts/companions/latest.txt'), 'utf8').trim(), 'profile');
const outputRoot = resolve('artifacts/companions'); mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, 'ui-2d-'));
const evidence = { at: new Date().toISOString(), profile, output, checks: [], scope: 'Approved UI 01/03, shared shadcn Radix + Motion, 2D-only; no adoption/inventory reset.' };
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve('.')], env });
const invoke = (page, feature, command, payload) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
let page; let originalSettings;
async function settled() {
  await page.waitForFunction(() => { const root = document.querySelector('.main-content > .app-page-motion'); return root && Number(getComputedStyle(root).opacity) > .99; }, null, { timeout: 10000 });
}
async function screenshot(name) {
  await settled(); await page.mouse.move(0, 0);
  await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.main-content')?.scrollTo({ top: 0 }); });
  await page.getByRole('tooltip').waitFor({ state: 'hidden' });
  await page.screenshot({ path: join(output, `${name}.png`), timeout: 5000, animations: 'disabled' });
}
try {
  for (let i = 0; i < 100 && !page; i++) { page = application.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('#/desktop/')); if (!page) await delay(100); }
  assert.ok(page); page.setDefaultTimeout(8000);
  const snapshot = (await invoke(page, 'companions', 'list')).data;
  const fish = snapshot.pets.find(pet => pet.name === '鱼丸一号'); const blue = snapshot.pets.find(pet => pet.name === '小蓝');
  assert.ok(fish && blue); assert.equal(snapshot.pets.filter(pet => pet.resource.kind === '2d').length, 3);
  await page.getByRole('button', { name: /选择伙伴 鱼丸一号/ }).click();
  await page.getByRole('button', { name: '修改鱼丸一号的名字' }).click();
  const dialog = page.getByRole('dialog', { name: '给伙伴起个名字' }); await dialog.waitFor();
  assert.equal(await page.getByRole('button', { name: '关闭改名', exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'cp-new-name');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(element => element.contains(document.activeElement)), true); }
  await page.screenshot({ path: join(output, 'rename-dialog.png'), timeout: 5000, animations: 'disabled' });
  await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '修改鱼丸一号的名字');
  evidence.checks.push('Real Radix Dialog: Chinese close label, initial textbox focus, Tab trap, Escape and trigger focus return');
  await screenshot('overview');
  const memories = [];
  try {
    for (const pet of [fish, blue]) {
      await page.getByRole('button', { name: new RegExp(`选择伙伴 ${pet.name}`) }).click();
      await page.getByRole('button', { name: '聊聊天', exact: true }).click();
      await page.waitForURL('**#/chat');
      const chat = await invoke(page, 'conversations', 'snapshot');
      assert.equal(chat.ok, true, JSON.stringify(chat)); assert.equal(chat.data.petId, pet.petId);
      const content = `独立伙伴验收 ${pet.petId} ${Date.now()}`;
      const saved = await invoke(page, 'conversations', 'memory.save', { petId: pet.petId, memory: { content } });
      assert.equal(saved.ok, true, JSON.stringify(saved));
      const memory = saved.data.find(item => item.content === content); assert.ok(memory);
      memories.push({ petId: pet.petId, memory });
      await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click();
    }
    for (const selected of memories) {
      const chat = await invoke(page, 'conversations', 'snapshot', { petId: selected.petId });
      assert.equal(chat.data.memories.some(item => item.id === selected.memory.id), true);
      assert.equal(chat.data.memories.some(item => memories.some(other => other.petId !== selected.petId && other.memory.id === item.id)), false);
    }
    evidence.checks.push('Both real chat entries select the precise instance in ConversationService; per-pet saved memories do not appear in the other instance');
  } finally {
    for (const { petId, memory } of memories) await invoke(page, 'conversations', 'memory.delete', { petId, id: memory.id, revision: memory.revision });
  }
  await page.getByRole('button', { name: /选择伙伴 鱼丸一号/ }).click();
  await page.getByRole('button', { name: '查看伙伴详情', exact: true }).click();
  await page.getByRole('tab', { name: '成长', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.querySelector('[role="tab"][aria-selected="true"]')?.textContent === '技能');
  await page.keyboard.press('End');
  const slider = page.getByRole('slider', { name: '鱼丸一号的外观大小' }); await slider.waitFor();
  assert.equal(await slider.getAttribute('aria-valuenow'), '1');
  const behavior = page.getByRole('combobox', { name: '鱼丸一号的行为模式' }); await behavior.focus(); await page.keyboard.press('Enter');
  await page.getByRole('listbox').waitFor(); await page.keyboard.press('Escape'); await page.getByRole('listbox').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '鱼丸一号的行为模式');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '鱼丸一号的行为模式');
  evidence.checks.push('Real Radix Tabs roving keyboard, named Slider Thumb, Select keyboard/Escape/focus return');
  await page.getByRole('tab', { name: '成长', exact: true }).click();
  await page.locator('.cp-detail-hero .resource-stage[data-status="ready"]').waitFor();
  await screenshot('detail');
  await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click();
  await page.getByRole('button', { name: '领养伙伴', exact: true }).click();
  await page.locator('.cp-adoption-preview .resource-stage[data-status="ready"]').waitFor();
  await screenshot('adoption');
  assert.equal(await page.locator('model-viewer').count(), 0);
  assert.equal(await page.getByText(/3D 模型|GLB|GLTF|VRM/).count(), 0);
  assert.equal(await page.locator('[data-slot="checkbox"]').count(), 2);
  evidence.checks.push('Official Checkbox/Input and 2D-only adoption preview; no 3D component or import label in the live feature');

  originalSettings = (await invoke(page, 'accounts', 'settingsGet')).data.document;
  const settings = await invoke(page, 'accounts', 'settingsGet');
  const disabled = structuredClone(settings.data.document); disabled.desktop.animationsEnabled = false;
  const saved = await invoke(page, 'accounts', 'settingsSave', { actionId: `ui-motion-off-${Date.now()}`, revision: settings.data.revision, document: disabled }); assert.equal(saved.ok, true, JSON.stringify(saved));
  await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click();
  await page.waitForFunction(() => document.querySelector('.main-content > .app-page-motion')?.getAttribute('data-motion') === 'reduced');
  const desktop = application.windows().find(candidate => candidate.url().includes(`#/desktop/${fish.petId}`)); assert.ok(desktop);
  const canvas = desktop.locator('[data-renderer="pixi"] canvas'); await desktop.locator('.resource-stage[data-status="ready"]').waitFor();
  const first = await canvas.screenshot({ timeout: 5000, omitBackground: true }); await delay(1800);
  const second = await canvas.screenshot({ timeout: 5000, omitBackground: true });
  assert.equal(digest(first), digest(second), 'Application animations off must leave actual desktop Pixi pixels unchanged');
  evidence.pausedCanvasHash = digest(first);
  const current = await invoke(page, 'accounts', 'settingsGet');
  assert.equal((await invoke(page, 'accounts', 'settingsSave', { actionId: `ui-motion-on-${Date.now()}`, revision: current.data.revision, document: originalSettings })).ok, true);
  originalSettings = null;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Motion's installed useReducedMotion snapshots the media value on mount.
  // Verify the actual app initialization with that system preference enabled.
  await page.reload();
  await page.getByRole('button', { name: '领养伙伴', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.main-content > .app-page-motion')?.getAttribute('data-motion') === 'reduced');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  evidence.checks.push('Shared Motion app animation switch and reduced-motion media at app initialization; actual stopped desktop Pixi canvas pixels remain identical');
  evidence.result = 'passed';
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(`REAL_2D_UI_PASSED ${output}`);
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.stack;
  if (page) { await page.screenshot({ path: join(output, 'failure.png'), timeout: 5000 }).catch(() => {}); evidence.visibleText = await page.locator('body').innerText().catch(() => ''); }
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.error(`REAL_2D_UI_FAILED ${output}`, error); process.exitCode = 1;
} finally {
  if (originalSettings && page) { const current = await invoke(page, 'accounts', 'settingsGet').catch(() => null); if (current?.ok) await invoke(page, 'accounts', 'settingsSave', { actionId: `ui-motion-restore-${Date.now()}`, revision: current.data.revision, document: originalSettings }).catch(() => {}); }
  await application.close();
}
