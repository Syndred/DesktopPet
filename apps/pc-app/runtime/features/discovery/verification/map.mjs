// Narrow production-main check for the real MapLibre → IPC → tile/cache path.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
const output = resolve(`artifacts/discovery/map-${Date.now()}`);
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'profile') };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_DISCOVERY_CLOUD;
const app = await electron.launch({ args: [resolve('.')], env });
const warnings = [];
try {
  const page = await app.firstWindow();
  page.on('console', message => { if (message.text().includes('[discovery:map]')) warnings.push(message.text()); });
  await page.waitForFunction(() => Boolean(window.lingjing));
  const register = await page.evaluate(() => window.lingjing.invoke('accounts', 'register', { provider: 'local', account: 'map_path_test', password: 'isolated-verification-only', confirmPassword: 'isolated-verification-only', username: '地图路径验证', rememberSession: false }));
  assert.equal(register.ok, true, JSON.stringify(register));
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.getByRole('button', { name: '探索设置', exact: true }).click();
  await page.getByRole('switch', { name: '演示模式', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => Number(document.querySelector('[data-map-engine="maplibre-gl"]')?.getAttribute('data-map-loaded-tiles')) >= 12, null, { timeout: 45000 });
  const loadedTiles = Number(await page.locator('[data-map-engine="maplibre-gl"]').getAttribute('data-map-loaded-tiles'));
  assert.ok(loadedTiles >= 12);
  assert.equal(warnings.some(message=>/worker/i.test(message)),false,JSON.stringify(warnings));
  assert.ok(await page.locator('.discovery-pin-button').count() > 0);
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) > .99);
  await page.screenshot({ path: join(output, '02-real-map-explicit-demo.png') });
  const files = readdirSync(join(output, 'profile/cache/discovery/tiles/osm'), { recursive: true }).filter(name => String(name).endsWith('.png'));
  assert.ok(files.length >= 12);
  const evidence = { at: new Date().toISOString(), productionMain: true, passed: true, explicitDemo: true, realPhysicalLocationAcceptance: false, engine: 'MapLibre GL JS 6.15.0', loadedTiles, cachedPngTiles: files.length, warnings, output };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/discovery/latest-map-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  const page = app.windows()[0];
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ error: error.message, warnings }, null, 2));
  throw error;
} finally { await app.close(); }
