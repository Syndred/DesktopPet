import { _electron as electron } from 'playwright';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd();
const phase = process.argv[2] || 'plant';
const output = resolve('artifacts/garden/electron');
const profile = resolve(output, 'profile');
mkdirSync(profile, { recursive: true });
const runFile = resolve(output, 'run.json');
let run = existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')) : null;
if (!run) {
  const { RuntimeDataStore } = require(resolve('apps/pc-app/runtime/services/runtime-data-store.cjs'));
  const store = new RuntimeDataStore({ filePath: resolve(profile, 'pet-runtime-data.json'), sessionFilePath: resolve(profile, 'pet-auth-session.json') });
  const account = store.registerUser(`garden-check-${Date.now()}`, 'garden-local-acceptance-926', '菜园验收');
  assert.equal(account.ok, true);
  run = { at: new Date().toISOString(), ownerAccountId: account.currentUser.id, phases: [] };
  writeFileSync(runFile, JSON.stringify(run, null, 2));
}
const env = { ...process.env, PET_USER_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [root], cwd: root, env });
const errors = [];
try {
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const invoke = async (command, payload) => page.evaluate(({ command, payload }) => window.lingjing.invoke('garden', command, payload), { command, payload });
  const route = async path => { await page.evaluate(path => { location.hash = path; }, path); };
  if (phase === 'plant') {
    const companions = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.equal(companions.ok, true, JSON.stringify(companions));
    const names = ['鱼丸', '小蓝', '饭团'];
    run.petIds ||= {};
    for (const name of names) {
      if (run.petIds[name]) continue;
      const result = await page.evaluate(({ name }) => window.lingjing.invoke('companions', 'adopt', { actionId: `garden-smoke-adopt:${name}`, templateId: 'big-fish-gentle', name, showOnDesktop: false }), { name });
      assert.equal(result.ok, true, JSON.stringify(result)); run.petIds[name] = result.data.pet.petId;
    }
    await route('/garden/plots');
    await page.getByRole('heading', { name: '把小日子，种成好收成。' }).waitFor();
    await page.getByRole('button', { name: '稻米 种子', exact: false }).click();
    await page.getByRole('button', { name: '＋ 播种', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '稻米已播种' }).waitFor();
    await page.locator('[data-plot-id="plot-2"]').click();
    await page.getByRole('button', { name: '胡萝卜 种子', exact: false }).click();
    await page.getByRole('button', { name: '＋ 播种', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '胡萝卜已播种' }).waitFor();
    const snapshot = await invoke('snapshot'); assert.equal(snapshot.ok, true); assert.equal(snapshot.data.plots.filter(p => p.cropType).length, 2);
    assert.equal(snapshot.data.plots[0].cropType, 'rice'); assert.equal(snapshot.data.plots[1].cropType, 'carrot');
    run.planted = snapshot;
    await page.screenshot({ path: resolve(output, '01-planted.png'), fullPage: true });
  } else if (phase === 'harvest') {
    await route('/garden/plots');
    await page.getByRole('heading', { name: '把小日子，种成好收成。' }).waitFor();
    const grown = await invoke('snapshot');
    assert.equal(grown.ok, true);
    assert.equal(grown.data.plots[0].stage, 'mature', `Rice matures at ${new Date(grown.data.plots[0].maturesAt).toISOString()}; wait for normal production growth`);
    assert.equal(grown.data.plots[0].plantedAt, run.planted.data.plots[0].plantedAt);
    await page.getByRole('button', { name: '♧ 收获成熟作物', exact: false }).click();
    await page.getByRole('status').filter({ hasText: '成熟作物已放入背包' }).waitFor();
    const harvested = await invoke('snapshot'); assert.equal(harvested.data.items.find(i => i.id === 'rice').quantity, 2);
    await page.getByRole('link', { name: '制作食物', exact: true }).click();
    await page.getByRole('button', { name: '♧ 制作米饭', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '米饭做好了' }).waitFor();
    const beforeFeed = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    await page.getByRole('button', { name: '鱼丸 Lv.', exact: false }).click();
    await page.getByRole('button', { name: '♡ 喂给鱼丸', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已给鱼丸喂食 1 份' }).waitFor();
    const afterFeed = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    const result = await invoke('snapshot');
    const fishBefore = beforeFeed.data.pets.find(p => p.petId === run.petIds['鱼丸']);
    const fishAfter = afterFeed.data.pets.find(p => p.petId === run.petIds['鱼丸']);
    assert.equal(fishAfter.growth.satiety, fishBefore.growth.satiety + 20); assert.equal(fishAfter.growth.affinity, fishBefore.growth.affinity + 4);
    for (const name of ['小蓝', '饭团']) assert.deepEqual(afterFeed.data.pets.find(p => p.petId === run.petIds[name]), beforeFeed.data.pets.find(p => p.petId === run.petIds[name]));
    assert.equal(result.data.items.find(i => i.id === 'rice').quantity, 1); assert.equal(result.data.items.find(i => i.id === 'cooked_rice').quantity, 0);
    run.harvested = harvested; run.beforeFeed = beforeFeed; run.afterFeed = afterFeed; run.final = result;
    await page.screenshot({ path: resolve(output, '02-cooked-and-fed.png'), fullPage: true });
    await route('/inventory'); await page.getByRole('heading', { name: '把喜欢的，都留给你。' }).waitFor();
    await page.screenshot({ path: resolve(output, '03-inventory.png'), fullPage: true });
  } else if (phase === 'readback') {
    const result = await invoke('snapshot'); assert.equal(result.ok, true);
    assert.deepEqual(result.data.items, run.final.data.items);
    const pets = await page.evaluate(() => window.lingjing.invoke('companions', 'list'));
    assert.deepEqual(pets.data.pets, run.afterFeed.data.pets);
    const repeatHarvest = await invoke('harvest', { actionId: 'after-restart-double-harvest', expectedRevision: result.revision, plotIds: ['plot-1'] });
    assert.equal(repeatHarvest.code, 'ALREADY_HARVESTED');
    run.readback = { result, pets, repeatHarvest };
  }
  assert.deepEqual(errors, []);
  run.phases.push({ phase, at: new Date().toISOString(), errors, electron: await application.evaluate(() => process.versions.electron) });
  writeFileSync(runFile, JSON.stringify(run, null, 2));
  console.log(JSON.stringify({ phase, profile, runFile, maturesAt: run.planted?.data.plots[0].maturesAt, at: new Date().toISOString() }));
} finally { await application.close(); }
const db = new DatabaseSync(resolve(profile, 'lingjing.sqlite'), { readOnly: true });
const readback = { account: db.prepare('SELECT * FROM garden_accounts WHERE owner_account_id=?').get(run.ownerAccountId), plots: db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=?').all(run.ownerAccountId), items: db.prepare('SELECT * FROM garden_items WHERE owner_account_id=?').all(run.ownerAccountId), ledger: db.prepare('SELECT * FROM garden_events WHERE owner_account_id=? ORDER BY created_at').all(run.ownerAccountId) };
writeFileSync(resolve(output, `${phase}-disk-readback.json`), JSON.stringify(readback, null, 2)); db.close();
