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
  // Windows at DPR 1.25 can round the first native content-size request by 2 DIP.
  // Correct the native request, then still assert the exact CSS viewport below.
  let requested = { width: 1280, height: 844 };
  for (let attempt = 0; attempt < 3; attempt++) {
    await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), requested);
    await page.waitForTimeout(100);
    const actual = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (actual.width === 1280 && actual.height === 844) break;
    requested = { width: requested.width + 1280 - actual.width, height: requested.height + 844 - actual.height };
  }
  const register = await page.evaluate(() => window.lingjing.invoke('accounts', 'register', { provider: 'local', account: 'map_path_test', password: 'isolated-verification-only', confirmPassword: 'isolated-verification-only', username: '地图路径验证', rememberSession: false }));
  assert.equal(register.ok, true, JSON.stringify(register));
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '附近探索', exact: true }).click();
  await page.getByRole('heading', { name: '下楼走走，遇见新伙伴。', exact: true }).waitFor();
  await page.waitForFunction(() => {
    const style = getComputedStyle(document.querySelector('.app-page-motion'));
    return Number(style.opacity) === 1 && (style.transform === 'none' || new DOMMatrixReadOnly(style.transform).m42 === 0);
  });
  const layout = await page.evaluate(() => {
    const page = document.querySelector('.discovery-page'), title = page.querySelector('h1');
    const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    return { viewport: { width: innerWidth, height: innerHeight }, main: rect(document.querySelector('.main-content')), title: rect(title), map: rect(document.querySelector('.discovery-map')), panel: rect(document.querySelector('.discovery-nearby-panel')), paddingLeft: getComputedStyle(page).paddingLeft, paddingTop: getComputedStyle(page).paddingTop, fontSize: getComputedStyle(title).fontSize, fontWeight: getComputedStyle(title).fontWeight, fontFamily: getComputedStyle(title).fontFamily };
  });
  assert.deepEqual(layout.viewport, { width: 1280, height: 844 });
  assert.equal(layout.paddingLeft, '32px'); assert.equal(layout.paddingTop, '24px');
  assert.equal(layout.title.x - layout.main.x, 32); assert.equal(layout.title.y - layout.main.y, 24);
  assert.equal(layout.map.x, layout.title.x); assert.equal(layout.fontSize, '28px');
  assert.equal(layout.fontWeight, '700');
  const empty = await page.evaluate(() => window.lingjing.invoke('discovery', 'snapshot'));
  assert.equal(empty.data.location.fix, null); assert.equal(empty.data.spawns.length, 0);
  await page.screenshot({ path: join(output, '02-empty-1280x844.png') });
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
  const evidence = { at: new Date().toISOString(), productionMain: true, passed: true, emptyStateHasNoPosition: true, explicitDemo: true, realPhysicalLocationAcceptance: false, layout, engine: 'MapLibre GL JS 6.15.0', loadedTiles, cachedPngTiles: files.length, warnings, output };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/discovery/latest-map-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  const page = app.windows()[0];
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ error: error.message, warnings }, null, 2));
  throw error;
} finally { await app.close(); }
