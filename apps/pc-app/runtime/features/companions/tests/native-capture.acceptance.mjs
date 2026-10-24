import { _electron } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Targeted correction only: reopen the completed isolated flow and capture its
// actual native canvases. No adoption, growth, selection or garrison is repeated.
const previousFile = resolve(process.argv[2]);
const previous = JSON.parse(readFileSync(previousFile, 'utf8'));
assert.equal(previous.result, 'passed'); assert.equal(previous.scenario.isolated, true);
const output = join(previous.output, 'native-correction'); mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: previous.profile, LINGJING_QA_SCENARIO: previous.scenario.id }; delete env.ELECTRON_RUN_AS_NODE;
const evidence = { at: new Date().toISOString(), runtimeSourceSha: previous.source.sha, harnessSourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), previousEvidence: previousFile, scenario: previous.scenario, captures: [] };
const app = await _electron.launch({ args: [resolve('.'), '--force-device-scale-factor=1'], env });
let main;
const invoke = (feature, command, payload) => main.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
try {
  for (let attempt = 0; attempt < 100; attempt++) { main = app.windows().find(page => page.url().includes('/dist/ui/index.html') && !page.url().includes('#/desktop/')); if (main) break; await delay(100); }
  assert.ok(main); await main.waitForFunction(() => Boolean(window.lingjing));
  const info = (await invoke('app', 'info')).data;
  assert.equal(info.build.sourceCommit, previous.source.sha); assert.equal(info.build.codeFingerprint, previous.build.codeFingerprint); assert.equal(info.build.compiledFingerprint, previous.build.compiledFingerprint);
  evidence.build = info.build;
  assert.equal((await invoke('accounts', 'login', { provider: 'local', account: 'companions_five', password: 'Local-five-proof-72!', rememberSession: false })).ok, true);
  const before = (await invoke('companions', 'list')).data;
  for (const element of ['wood', 'earth']) {
    const pet = before.pets.find(pet => pet.element === element && pet.resource.kind === '2d'); assert.ok(pet);
    let page;
    for (let attempt = 0; attempt < 100; attempt++) { page = app.windows().find(page => page.url().includes(`#/desktop/${pet.petId}`)); if (page) break; await delay(100); }
    assert.ok(page);
    const wasThrottled = await app.evaluate(({ BrowserWindow }, petId) => {
      const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes(`#/desktop/${petId}`));
      const previous = window.webContents.getBackgroundThrottling(); window.webContents.setBackgroundThrottling(false); window.showInactive(); window.moveTop(); return previous;
    }, pet.petId);
    try {
      await page.locator('.resource-stage[data-status="ready"] canvas').waitFor({ timeout: 15000 });
      await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      const stage = await page.locator('.resource-stage').evaluate(node => ({ petId: node.dataset.petId, resourceId: node.dataset.resourceId, action: node.dataset.action, status: node.dataset.status, frame: node.querySelector('[data-frame]')?.getAttribute('data-frame'), canvas: Boolean(node.querySelector('canvas')) }));
      assert.equal(stage.petId, pet.petId); assert.equal(stage.resourceId, pet.resource.resourceId); assert.equal(stage.status, 'ready'); assert.equal(stage.canvas, true);
      const captured = await app.evaluate(async ({ BrowserWindow }, petId) => {
        const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes(`#/desktop/${petId}`)); let timer;
        try {
          const image = await Promise.race([window.webContents.capturePage(undefined, { stayAwake: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Native capture timed out')), 8000); })]);
          const bitmap = image.toBitmap(); let visiblePixels = 0; for (let offset = 3; offset < bitmap.length; offset += 4) if (bitmap[offset]) visiblePixels++;
          return { png: image.toPNG().toString('base64'), visiblePixels, size: image.getSize(), bounds: window.getBounds(), visible: window.isVisible() };
        } finally { clearTimeout(timer); }
      }, pet.petId);
      assert.ok(captured.visiblePixels > 2500, 'A loading star and name are insufficient sprite evidence');
      const name = `desktop-${element}.png`; writeFileSync(join(output, name), Buffer.from(captured.png, 'base64'));
      const { png, ...pixels } = captured; void png;
      evidence.captures.push({ name, petId: pet.petId, resourceId: pet.resource.resourceId, element, stage, ...pixels, capturePolicy: 'actual-canvas-ready + two-animation-frames + temporary-unthrottled/front + restored', originalBackgroundThrottling: wasThrottled });
    } finally { await app.evaluate(({ BrowserWindow }, { petId, wasThrottled }) => { BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes(`#/desktop/${petId}`)).webContents.setBackgroundThrottling(wasThrottled); }, { petId: pet.petId, wasThrottled }); }
  }
  const after = (await invoke('companions', 'list')).data;
  assert.deepEqual(after.selections, before.selections);
  for (const pet of before.pets) { const actual = after.pets.find(candidate => candidate.petId === pet.petId); assert.equal(actual.name, pet.name); assert.deepEqual(actual.growth, pet.growth); assert.deepEqual(actual.resource, pet.resource); assert.deepEqual(actual.desktop, pet.desktop); }
  evidence.stateUnchanged = true; evidence.result = 'passed'; console.log(`REAL_NATIVE_CAPTURE_PASSED ${output}`);
} catch (error) { evidence.result = 'failed'; evidence.error = error.stack; process.exitCode = 1; console.error(error); }
finally { writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); await app.close(); }
