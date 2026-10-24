import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { RuntimeDataStore } = require('../../apps/pc-app/runtime/services/runtime-data-store.cjs');
const output = resolve('artifacts/foundation/resource-art');
const profile = join(output, 'profile');
mkdirSync(profile, { recursive: true });
// A real local account in an isolated test save; no cloud identity or API is simulated.
const store = new RuntimeDataStore({ filePath: join(profile, 'pet-runtime-data.json'), sessionFilePath: join(profile, 'pet-auth-session.json') });
const account = store.registerUser('foundation_art', 'LingjingResourceQA2026!', '图稿验收');
if (!account.ok) assert.equal(store.loginUser('foundation_art', 'LingjingResourceQA2026!').ok, true);
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve('.')], env });
const errors = [];
try {
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
  page.on('response', response => { if (response.status() >= 400) console.error('Asset response', response.status(), response.url()); });
  await page.waitForFunction(() => Boolean(window.lingjing));
  const login = await page.evaluate(() => window.lingjing.invoke('accounts', 'login', { provider: 'local', account: 'foundation_art', password: 'LingjingResourceQA2026!', rememberSession: true }));
  if (!login.ok && login.code !== 'COMMAND_UNAVAILABLE') throw new Error(JSON.stringify(login));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await page.locator('.sidebar').getByRole('button', { name: '角色资源', exact: true }).click();
  const list = await page.evaluate(() => window.lingjing.invoke('resources', 'list'));
  assert.equal(list.ok, true);
  assert.ok(list.data.find(resource => resource.id === 'builtin:lingjing-yuwan-v1'));
  await page.getByRole('button', { name: /鱼丸 · 湖畔的陪伴/ }).click();
  await page.locator('.resource-stage[data-status="ready"]').waitFor({ timeout: 30000 });
  await page.locator('canvas[aria-label="鱼丸 · 湖畔的陪伴 · 2D 动画"]').waitFor();
  await page.screenshot({ path: join(output, 'whale-girl.png') });
  const actual = await page.evaluate(async () => {
    const response = await fetch('lingjing-resource://asset/builtin%3Alingjing-yuwan-v1/yuwan-sprites-v1.png');
    const bytes = await response.arrayBuffer();
    return { status: response.status, bytes: bytes.byteLength, canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON() };
  });
  assert.equal(actual.status, 200); assert.ok(actual.bytes > 100000); assert.ok(actual.canvas.width > 0);
  const shiba = list.data.find(resource => resource.id === 'legacy:animateddogshibainu.glb');
  await page.locator('.resource-card').filter({ hasText: shiba.name }).click();
  await page.locator('.resource-stage[data-status="ready"][data-resource-id="legacy:animateddogshibainu.glb"]').waitFor({ timeout: 30000 });
  const model = await page.locator('model-viewer').evaluate(element => ({ loaded: element.loaded, clips: element.availableAnimations, src: element.src }));
  assert.ok(model.loaded); assert.ok(model.clips.length > 0);
  await page.screenshot({ path: join(output, 'textured-shiba.png') });
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'evidence.json'), JSON.stringify({ at: new Date().toISOString(), actual, model, resources: list.data.map(r => ({ id: r.id, name: r.name, kind: r.kind })), errors }, null, 2));
  console.log('Approved artwork rendered in real Electron:', output);
} catch (error) {
  const page = await application.firstWindow();
  await page.screenshot({ path: join(output, 'failure.png') });
  console.error(await page.locator('body').innerText());
  throw error;
} finally { await application.close(); }
