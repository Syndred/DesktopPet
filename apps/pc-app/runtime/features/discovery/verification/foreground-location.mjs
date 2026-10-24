// Real Electron/UI lifecycle check. Only position samples use the explicit host
// fixture; this is never physical-location acceptance.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const output = resolve(`artifacts/discovery/foreground-${Date.now()}`);
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'profile'), LINGJING_CONTROLLED_LOCATION: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_DISCOVERY_CLOUD;
const app = await electron.launch({ args: [resolve('apps/pc-app/runtime/features/discovery/verification/host.cjs')], env });
const evidence = { at: new Date().toISOString(), controlledPosition: true, physicalLocationAcceptance: false, checks: [] };
let page;
const invoke = (feature, command, payload = {}) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function snapshot() { const result = await invoke('discovery', 'snapshot'); assert.equal(result.ok, true); return result.data; }
async function until(predicate, label, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const state = await snapshot(); if (predicate(state)) return state; await page.waitForTimeout(100); }
  throw new Error(`State did not converge: ${label}`);
}
async function startWatch() {
  await page.getByRole('button', { name: '探索设置', exact: true }).click();
  await page.getByRole('switch', { name: '探索时持续更新位置', exact: true }).click();
  const state = await until(value => value.location.watching && value.location.status === 'ready', 'watch started');
  await page.keyboard.press('Escape'); return state;
}
try {
  for (let i = 0; i < 150; i++) {
    page = app.windows().find(window => window.url().includes('/dist/ui/index.html') && !window.url().includes('/desktop/'));
    if (page) break; await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Main window exists');
  await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
  const first = await startWatch();
  assert.equal(first.location.fix.provider, 'controlled-test-fixture');
  const target = first.spawns.find(spawn => spawn.inRange && spawn.captureState === 'available'); assert.ok(target);
  await page.locator(`[data-spawn-id="${target.id}"]`).click();
  await page.getByRole('button', { name: '和她打个招呼', exact: true }).click();
  await page.getByRole('heading', { name: `在附近，遇见了${target.name}。`, exact: true }).waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) > .99);
  const preview = await snapshot();
  evidence.afterPreview = { watching: preview.location.watching, status: preview.location.status };
  assert.equal(preview.location.watching, true, 'Opt-in watch must survive navigation within discovery');
  evidence.checks.push('opt-in watch survives map to encounter-preview navigation');
  await until(state => state.location.watching && state.location.fix?.timestampMs > first.location.fix.timestampMs, 'actual scheduled refresh', 20000);
  evidence.checks.push('real scheduled timer supplies a newer position sample while preview remains open');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#/discovery/wild/')).hide());
  await until(state => !state.location.watching, 'hidden window stops watch');
  evidence.hiddenDocumentVisibility = await page.evaluate(() => document.visibilityState);
  evidence.checks.push('hiding the actual Electron window stops watch');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#/discovery/wild/')).show());
  await page.waitForFunction(() => document.visibilityState === 'visible');
  const resumed = await snapshot(); assert.equal(resumed.location.watching, false, 'Showing the window must not silently re-enable watch');
  await startWatch();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#/discovery/wild/')).minimize());
  await until(state => !state.location.watching, 'minimized window stops watch');
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('#/discovery/wild/')); window.restore(); window.show(); });
  await page.waitForFunction(() => document.visibilityState === 'visible');
  assert.equal((await snapshot()).location.watching, false);
  evidence.checks.push('minimizing also stops watch and restoring does not silently restart it');
  await startWatch();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '我的灵宠', exact: true }).click();
  await until(state => !state.location.watching, 'leaving discovery stops watch');
  const denied = await invoke('discovery', 'locate'); assert.equal(denied.ok, false); assert.equal(denied.code, 'APP_LOCATION_DISABLED');
  evidence.checks.push('leaving discovery stops watch and blocks another native request');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await startWatch();
  const settings = await invoke('accounts', 'settingsGet');
  settings.data.document.privacy.locationAllowed = false;
  const saved = await invoke('accounts', 'settingsSave', { actionId: crypto.randomUUID(), revision: settings.data.revision, document: settings.data.document }); assert.equal(saved.ok, true);
  await until(state => state.location.status === 'privacy_disabled' && !state.location.fix && !state.location.watching, 'revocation clears position');
  evidence.checks.push('application permission revocation stops watch and clears its cached fix');
  evidence.passed = true;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/discovery/latest-foreground-evidence.json'), JSON.stringify({ ...evidence, output }, null, 2));
  console.log(JSON.stringify({ ...evidence, output }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ ...evidence, error: error.message }, null, 2));
  throw error;
} finally { await app.close(); }
