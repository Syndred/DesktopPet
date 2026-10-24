// Replays the real production UI after native imports. Never uses a user profile.
// First import grid and Pixi JSON through Windows dialogs into artifacts/resources/2d-profile,
// then save its SQLite evidence with read-sqlite.cjs. Run from the repository root.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd(), require = createRequire(path.join(root, 'package.json'));
const { _electron } = require('playwright');
const profile = path.resolve(root, process.argv[2] || 'artifacts/resources/2d-profile');
const artifactRoot = path.resolve(root, 'artifacts/resources');
assert(profile.startsWith(artifactRoot + path.sep), 'Only an isolated resource verification profile is allowed');
const baseline = JSON.parse(await fs.readFile(path.join(artifactRoot, '2d-before-restart.json'), 'utf8'));
assert(baseline.imports.length >= 2, 'Native grid and Pixi imports must exist before replay');
const preference = baseline.preferences.find(row => JSON.parse(row.calibration_json).desktop.fps > 0);
assert(preference, 'Save a custom FPS/anchor calibration through the UI before replay');
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: require('electron'), args: [root], env, timeout: 15000 });
const report = { at: new Date().toISOString(), profile: path.relative(root, profile), errors: [], consoleErrors: [], checks: {} };
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(5000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', entry => { if (entry.type() === 'error') report.consoleErrors.push(entry.text()); });
  await page.getByRole('button', { name: '角色资源', exact: true }).click();
  await page.locator(`.resource-card[data-resource-id="${preference.resource_id}"]`).click();
  await page.locator('.resource-stage[data-status="ready"]').waitFor({ timeout: 10000 });
  const listed = await page.evaluate(() => window.lingjing.invoke('resources', 'list', {}));
  assert.equal(listed.ok, true);
  assert(listed.data.every(resource => resource.kind === 'spritesheet'));
  const resource = listed.data.find(resource => resource.id === preference.resource_id);
  assert.deepEqual(resource.calibration, JSON.parse(preference.calibration_json));
  assert.deepEqual(resource.actions, JSON.parse(preference.actions_json));
  assert.equal(resource.revision, preference.revision);
  assert.equal(await page.locator('model-viewer').count(), 0);
  report.checks.persisted = { resourceId: resource.id, revision: resource.revision, calibration: resource.calibration, actions: resource.actions };

  await page.getByRole('tab', { name: '动作配置', exact: true }).focus();
  await page.getByRole('tab', { name: '动作配置', exact: true }).press('ArrowRight');
  await page.getByRole('tab', { name: '动作校准', exact: true }).and(page.locator('[aria-selected="true"]')).waitFor();
  await page.getByRole('tab', { name: '动作校准', exact: true }).press('Home');
  await page.getByRole('tab', { name: '角色资源', exact: true }).and(page.locator('[aria-selected="true"]')).waitFor();
  await page.getByRole('combobox', { name: '预览动作', exact: true }).click();
  await page.getByRole('option').first().waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '预览动作');
  await page.getByRole('button', { name: '查看完整资源资料', exact: true }).click();
  await page.getByText('素材来源与权属记录', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '查看完整资源资料');
  report.checks.radix = { tabArrowAndHome: true, selectEscapeFocus: true, popoverEscapeFocus: true };

  await page.getByRole('button', { name: '双实例对照', exact: true }).click();
  await page.locator('.resource-stage[data-status="ready"]').nth(1).waitFor();
  await page.getByRole('button', { name: '暂停动画', exact: true }).click();
  const samples = [];
  for (let i = 0; i < 7; i++) {
    samples.push(await page.locator('.resource-stage').evaluateAll(elements => elements.map(element => ({
      resourceId: element.dataset.resourceId, petId: element.dataset.petId, action: element.dataset.action,
      frame: element.querySelector('.resource-sprite-host')?.dataset.frame,
      textureSource: element.querySelector('.resource-sprite-host')?.dataset.textureSource,
    }))));
    await new Promise(resolve => setTimeout(resolve, 130));
  }
  assert.equal(new Set(samples.map(sample => sample[0].frame)).size, 1);
  assert(new Set(samples.map(sample => sample[1].frame)).size > 1);
  assert(samples.every(sample => sample[0].textureSource && sample[0].textureSource === sample[1].textureSource));
  assert(samples.every(sample => sample[0].petId !== sample[1].petId && sample[0].resourceId === sample[1].resourceId));
  report.checks.instances = { samples, sharedTextureSource: true, independentPlayback: true };
  await page.screenshot({ path: path.join(artifactRoot, '2d-independent-instances.png') });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const reducedFrames = [];
  for (let i = 0; i < 5; i++) {
    reducedFrames.push(await page.locator('.resource-stage').nth(1).locator('.resource-sprite-host').getAttribute('data-frame'));
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  assert.equal(new Set(reducedFrames).size, 1);
  report.checks.systemReducedMotion = { frames: reducedFrames, paused: true };
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: '收起双实例对照', exact: true }).click();
  await page.getByRole('button', { name: '播放动画', exact: true }).click();
  await page.screenshot({ path: path.join(artifactRoot, '2d-final-after-restart.png') });
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.consoleErrors, []);
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  throw error;
} finally {
  await fs.writeFile(path.join(artifactRoot, '2d-replay-report.json'), JSON.stringify(report, null, 2));
  // Exit only the child launched by this script, even when tray-close is enabled.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
}
console.log(JSON.stringify({ passed: report.passed, resourceId: report.checks.persisted.resourceId, checks: Object.keys(report.checks), errors: report.errors }));
