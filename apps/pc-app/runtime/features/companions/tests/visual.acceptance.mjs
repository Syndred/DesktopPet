import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const width = Number(process.env.LINGJING_ACCEPTANCE_WIDTH || 1280);
const height = Number(process.env.LINGJING_ACCEPTANCE_HEIGHT || 844);
const profile = process.env.COMPANIONS_UI_PROFILE || join(readFileSync(resolve('artifacts/companions/latest.txt'), 'utf8').trim(), 'profile');
const outputRoot = resolve('artifacts/companions'); mkdirSync(outputRoot, { recursive: true });
const output = mkdtempSync(join(outputRoot, 'visual-'));
const evidence = { at: new Date().toISOString(), output, window: { width, height, deviceScaleFactor: 1 }, checks: [], errors: [] };
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve('.'), '--force-device-scale-factor=1'], env });
const invoke = (page, feature, command, payload) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
let page;
async function screenshot(name) {
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.main-content > .app-page-motion')).opacity) > .99);
  await page.mouse.move(0, 0); await page.evaluate(() => { document.activeElement?.blur(); document.querySelector('.main-content')?.scrollTo({ top: 0 }); });
  await page.screenshot({ path: join(output, `${name}.png`), animations: 'disabled', timeout: 5000 });
}
try {
  for (let i = 0; i < 100 && !page; i++) { page = application.windows().find(candidate => candidate.url().includes('/dist/ui/index.html') && !candidate.url().includes('#/desktop/')); if (!page) await delay(100); }
  assert.ok(page); page.setDefaultTimeout(10000); page.on('pageerror', error => evidence.errors.push(error.message));
  await application.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/dist/ui/index.html') && !window.webContents.getURL().includes('#/desktop/')).setContentSize(size.width, size.height), { width, height });
  await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, { width, height });
  evidence.viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
  assert.equal(evidence.viewport.dpr, 1);
  const snapshot = (await invoke(page, 'companions', 'list')).data;
  const fish = snapshot.pets.find(pet => pet.resource.kind === '2d' && pet.name === '鱼丸一号') || snapshot.pets.find(pet => pet.resource.kind === '2d'); assert.ok(fish);
  await page.getByRole('button', { name: new RegExp(`选择伙伴 ${fish.name}`) }).click();
  await screenshot('overview');
  await page.getByRole('button', { name: '查看伙伴详情', exact: true }).click();
  await page.locator('.cp-detail-scene-art').waitFor();
  await page.waitForFunction(() => { const image = document.querySelector('.cp-detail-scene-art'); return image.complete && image.naturalWidth > 0; });
  await screenshot('detail');
  evidence.detail = await page.evaluate(() => {
    const rect = selector => { const bounds = document.querySelector(selector).getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }; };
    const main = document.querySelector('.main-content');
    return { title: rect('.cp-detail-left .page-header'), tabs: rect('.cp-detail-tabs'), right: rect('.cp-detail-body'), scene: rect('.cp-detail-hero'), memory: rect('.cp-origin-memory'), headingFont: getComputedStyle(document.querySelector('.cp-detail-left h1')).fontSize, headingWeight: getComputedStyle(document.querySelector('.cp-detail-left h1')).fontWeight, cardMargins: [...document.querySelectorAll('.cp-detail-body .card')].map(card => getComputedStyle(card).marginBottom), scroll: { clientHeight: main.clientHeight, scrollHeight: main.scrollHeight }, memoryArtworkLoaded: document.querySelector('.cp-memory-art img').naturalWidth > 0 };
  });
  assert.ok(Math.abs(evidence.detail.title.y - evidence.detail.tabs.y) <= 2, 'Title and right Tabs must start side by side');
  assert.ok(evidence.detail.tabs.width >= evidence.detail.right.width - 2, 'Tabs must span the right column');
  assert.equal(evidence.detail.memoryArtworkLoaded, true);
  assert.equal(evidence.detail.headingFont, '28px'); assert.equal(evidence.detail.headingWeight, '700');
  assert.ok(evidence.detail.cardMargins.every(margin => margin === '0px'));
  assert.equal(await page.locator('.cp-detail-page > .cp-back').count(), 0);
  evidence.checks.push('Detail title/scene are in the left column; right Tabs align at the top and span the column; genuine scene and memory art are loaded');
  await page.getByRole('tab', { name: '外观', exact: true }).click();
  await page.getByRole('combobox', { name: `${fish.name}的预览动作` }).waitFor();
  const performed = await invoke(page, 'companions', 'perform', { actionId: `visual-action-${Date.now()}`, petId: fish.petId, expectedRevision: fish.revision, action: 'attack' });
  assert.equal(performed.ok, true, JSON.stringify(performed));
  const desktop = application.windows().find(candidate => candidate.url().includes(`#/desktop/${fish.petId}`)); assert.ok(desktop);
  await desktop.locator('.resource-stage[data-action="attack"][data-status="ready"]').waitFor();
  evidence.playback = { petId: fish.petId, resourceId: await desktop.locator('.resource-stage').getAttribute('data-resource-id'), action: 'attack', frames: [] };
  for (let i = 0; i < 6; i++) { evidence.playback.frames.push(await desktop.locator('[data-renderer^="pixi"]').getAttribute('data-frame')); await delay(170); }
  assert.equal(evidence.playback.resourceId, fish.resource.resourceId);
  assert.ok(new Set(evidence.playback.frames).size > 1, 'Actual shared AnimatedSprite must change frames');
  assert.ok(application.windows().filter(candidate => candidate.url().includes('#/desktop/') && candidate !== desktop).every(candidate => !candidate.url().endsWith(fish.petId)));
  await desktop.locator('.resource-stage[data-action="idle"]').waitFor();
  evidence.checks.push('Verified-owner action command reaches the exact native pet and actual shared Pixi frames advance, then return to its own idle behavior');
  const combat = await invoke(page, 'companions', 'combatProfile', { petId: fish.petId }); assert.equal(combat.ok, true);
  const training = await invoke(page, 'battle', 'startTraining', { actionId: `visual-training-${Date.now()}`, petId: fish.petId, enemyElement: 'fire' });
  assert.equal(training.ok, true, JSON.stringify(training));
  try {
    assert.equal(training.data.player.petId, fish.petId);
    assert.equal(training.data.player.resource.resourceId, fish.resource.resourceId);
    assert.equal(training.data.snapshot.player.maxHp, combat.data.training.maxHp);
    evidence.combat = { petId: fish.petId, resourceId: training.data.player.resource.resourceId, growthHp: combat.data.growthStats.hp, detailTrainingMaxHp: combat.data.training.maxHp, actualTrainingMaxHp: training.data.snapshot.player.maxHp, authority: combat.data.authority };
  } finally { assert.equal((await invoke(page, 'battle', 'leave', { sessionId: training.data.id })).ok, true); }
  evidence.checks.push('A11: detail reads the unchanged battle authority; actual training uses the same pet/resource and exactly that normalized max HP');
  await page.getByRole('button', { name: '我的灵宠', exact: true }).first().click();
  await page.getByRole('button', { name: '领养伙伴', exact: true }).click();
  await page.locator('.cp-adoption-preview .resource-stage[data-status="ready"]').waitFor();
  await screenshot('adoption');
  evidence.adoption = await page.evaluate(() => ({ titleTop: document.querySelector('.cp-adoption-main .page-header').getBoundingClientRect().y, previewTop: document.querySelector('.cp-adoption-preview').getBoundingClientRect().y, cards: document.querySelectorAll('.cp-template-card').length }));
  assert.ok(Math.abs(evidence.adoption.titleTop - evidence.adoption.previewTop) <= 2);
  assert.equal(await page.locator('model-viewer').count(), 0);
  assert.deepEqual(evidence.errors, []);
  evidence.checks.push('Adoption header stays in the left column, preview aligns to page top; actual registered 2D assets render without page errors');
  evidence.result = 'passed'; console.log(`REAL_NORMALIZED_VISUAL_PASSED ${output}`);
} catch (error) {
  evidence.result = 'failed'; evidence.error = error.stack; process.exitCode = 1;
  if (page) await page.screenshot({ path: join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
  console.error(`REAL_NORMALIZED_VISUAL_FAILED ${output}`, error);
} finally {
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  await application.close();
}
