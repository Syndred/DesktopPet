// Actual Electron/production UI in a new offline QA profile. No live cloud,
// service-role secrets, grants, existing user profiles, or OS preference changes.
// R03/R04 deliberately bridge the file-dialog result to owned fixture paths:
// they exercise UI -> production importer, NOT the native file-picker surface.
import { _electron as electron } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, realpathSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url), root = resolve('.');
const output = resolve('artifacts/foundation/full-acceptance/resources', `run-${Date.now()}-${randomUUID().slice(0, 8)}`);
mkdirSync(output, { recursive: true });
const disposable = mkdtempSync(join(tmpdir(), 'lingjing-offline-resources-'));
const profile = join(disposable, 'qa-profile');
const { provisionQaProfile } = require('../../apps/pc-app/runtime/features/accounts/qa-scenario.cjs');
const marker = provisionQaProfile(profile);
const publicConfig = join(disposable, 'offline-public.json'); writeFileSync(publicConfig, '{}', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedBuild = JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8'));
const proof = { startedAt: new Date().toISOString(), scope: 'Isolated offline QA / actual Electron UI and Pixi. Not live-cloud or Windows-portable acceptance.',
  candidate: expectedBuild, profile, runId: marker.runId, cases: [], errors: [], nativeFilePickerExercised: false, productionWrites: false };
const wrapper = join(disposable, 'entry.cjs');
// require('electron') must resolve its built-in module in the Electron child,
// not the npm launcher (which would only return an executable path).
writeFileSync(wrapper, `const {app,session}=require('electron');
app.setPath('appData',${JSON.stringify(disposable)});app.setPath('userData',${JSON.stringify(profile)});
globalThis.__resourceOfflineBlocked=[];
const denied=()=>{globalThis.__resourceOfflineBlocked.push('node-network');throw new Error('OFFLINE_QA_NETWORK_FORBIDDEN');};
for(const mod of ['node:http','node:https']){const transport=require(mod);transport.request=denied;transport.get=denied;}
const originalFetch=globalThis.fetch;globalThis.fetch=(input,...args)=>{const url=String(input?.url||input);if(/^(https?|wss?):/i.test(url)){globalThis.__resourceOfflineBlocked.push('fetch-network');return Promise.reject(new Error('OFFLINE_QA_NETWORK_FORBIDDEN'));}return originalFetch(input,...args);};
app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(details,callback)=>{globalThis.__resourceOfflineBlocked.push('chromium-network');callback({cancel:true});}));
require(${JSON.stringify(join(root, 'apps/pc-app/dist/main/index.cjs'))});
`, { encoding: 'utf8' });
// Allowlist OS process essentials rather than forwarding runner/cloud secrets.
const systemKeys = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'LANG', 'LC_ALL', 'CI']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => systemKeys.has(key.toUpperCase())));
Object.assign(env, { PET_USER_DATA_DIR: profile, LINGJING_QA_SCENARIO: marker.scenario, LINGJING_PUBLIC_CONFIG: publicConfig });
const invoke = async (page, feature, command, payload = {}) => {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, `${feature}.${command}: ${result.code || ''} ${result.message || ''}`); return result.data;
};
const labels = { idle: '待机', blink: '眨眼', walk: '行走', wave: '招手', eat: '吃东西', attack_windup: '攻击起手', attack_release: '攻击释放', attack: '普通攻击', hit: '受击', skill: '技能施放', victory: '胜利', sleep: '睡眠' };
let app, page;
// Read only real SQLite, no fixture seeding of resource/auth/business records.
function databaseSnapshot() {
  const db = new (require('better-sqlite3'))(join(profile, 'lingjing.sqlite'), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'lingjing_resource%' OR name LIKE '%companion%' OR name LIKE 'conversation%') ORDER BY name").all();
    return Object.fromEntries(names.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
  } finally { db.close(); }
}
async function frames() {
  return page.locator('.resources-preview:visible .resource-sprite-host').first().evaluate(async host => {
    const samples = [], started = performance.now();
    while (performance.now() - started < 750) {
      samples.push({ frame: host.dataset.frame, texture: host.dataset.frameTexture, region: host.dataset.textureFrame });
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return { samples, hidden: document.hidden, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, motion: host.closest('[data-motion]')?.getAttribute('data-motion') };
  });
}
async function choose(resource) {
  await page.getByRole('textbox', { name: '搜索角色', exact: true }).fill(resource.name);
  const card = page.locator(`button.resource-card[data-resource-id="${resource.id}"]`); await card.click();
  await page.locator(`.resources-preview:visible .resource-stage[data-resource-id="${resource.id}"][data-status="ready"] canvas`).waitFor();
  assert.equal(await card.getAttribute('aria-pressed'), 'true');
}
async function chooseFixture(file) {
  const rel = relative(disposable, realpathSync(file)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
  await app.evaluate(({ dialog }, selected) => {
    globalThis.__resourceDialogOriginal ||= dialog.showOpenDialog;
    globalThis.__resourceDialogConsumed = false;
    dialog.showOpenDialog = async (...args) => {
      const options = args[args.length - 1];
      if (options.title !== '导入 2D 角色资源' || globalThis.__resourceDialogConsumed) throw new Error('UNEXPECTED_DIALOG');
      globalThis.__resourceDialogConsumed = true;
      dialog.showOpenDialog = globalThis.__resourceDialogOriginal;
      return { canceled: false, filePaths: [selected] };
    };
  }, file);
  await page.getByRole('button', { name: '选择文件并导入', exact: true }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.textContent.includes('正在选择与导入')));
  assert.equal(await app.evaluate(() => globalThis.__resourceDialogConsumed), true);
}
try {
  app = await electron.launch({ args: [wrapper], cwd: root, env, timeout: 60000 });
  page = await app.firstWindow(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing?.invoke));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  const password = `Disposable-${randomUUID()}!`;
  const registration = await invoke(page, 'accounts', 'register', { provider: 'local', account: `qa_res_${Date.now()}`, username: '离线资源验收', password, confirmPassword: password, rememberSession: false });
  const session = await invoke(page, 'accounts', 'session');
  assert.equal(session.dataMode, 'simulated'); assert.ok(session.currentUser.id.startsWith(`qa:${marker.runId}:`));
  proof.ownerAccountId = registration.currentUser.id;
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), profile);
  const info = await invoke(page, 'app', 'info'); proof.runtime = info.runtime;
  for (const key of ['sourceCommit', 'canonicalSourceFingerprint', 'compiledFingerprint']) { assert.equal(typeof expectedBuild[key], 'string'); assert.equal(info.build[key], expectedBuild[key]); }
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('heading', { name: '按你的节奏，安静陪伴。', exact: true }).waitFor();
  await page.getByRole('button', { name: '角色资源', exact: true }).click();
  await page.locator('.resources-preview:visible').waitFor();
  const resources = await invoke(page, 'resources', 'list');
  const builtins = resources.filter(row => row.origin !== 'import' && row.availability === 'ready');
  assert.ok(builtins.length >= 8);
  const before = databaseSnapshot();
  const search = page.getByRole('textbox', { name: '搜索角色', exact: true });
  await search.fill('NO_MATCH_ISOLATED_QA'); await page.getByText('没有匹配的 2D 角色。', { exact: true }).waitFor();
  assert.equal(await page.locator('button.resource-card').count(), 0);
  await search.fill(''); assert.equal(await page.locator('button.resource-card').count(), resources.length);
  const previews = [], animations = [];
  for (const resource of builtins) {
    await choose(resource);
    const stage = page.locator('.resources-preview:visible .resource-stage').first();
    const canvas = stage.locator('canvas');
    const image = await canvas.screenshot();
    assert.ok(image.length > 1000);
    writeFileSync(join(output, `preview-${previews.length + 1}.png`), image);
    previews.push({ resourceId: resource.id, name: resource.name, canvasPngSha256: hash(image), ready: true });
  }
  assert.deepEqual(databaseSnapshot(), before);
  proof.cases.push({ id: 'R01', result: 'isolated-native-path-passed', previews, emptySearch: true, recordsUnchanged: true, boundary: 'Current UI offers name search; no unsupported category selector invented. No pet assignment performed.' });
  try {
   for (const resource of builtins) {
    await choose(resource);
    const stage = page.locator('.resources-preview:visible .resource-stage').first();
    for (const [action, label] of Object.entries(labels)) {
      await page.getByRole('combobox', { name: '预览动作', exact: true }).click();
      await page.getByRole('option', { name: resource.actions[action] ? label : `${label} · 回退待机`, exact: true }).click();
      await page.getByRole('button', { name: '重播动作', exact: true }).click();
      const first = await frames();
      assert.equal(first.hidden, false); assert.equal(first.reducedMotion, false); assert.notEqual(first.motion, 'reduced');
      const clip = resource.clips.find(clip => clip.name === resource.actions[action]) || resource.clips.find(clip => clip.name === resource.actions.idle) || resource.clips[0];
      const frameCount = clip.frameNames?.length || clip.frames?.length || resource.atlas?.animations?.[clip.name]?.length || 1;
      if (frameCount > 1) assert.ok(new Set(first.samples.map(row => row.region)).size > 1, `${resource.name}/${action}: actual texture did not advance`);
      const key = await stage.getAttribute('data-playback-key');
      await page.getByRole('button', { name: '重播动作', exact: true }).click();
      assert.notEqual(await stage.getAttribute('data-playback-key'), key);
      const replay = await frames();
      if (frameCount > 1) assert.ok(new Set(replay.samples.map(row => row.region)).size > 1, `${resource.name}/${action}: repeated action did not advance`);
      animations.push({ resourceId: resource.id, action, clip: clip.name, frameCount, first, replay });
    }
  }
  assert.deepEqual(databaseSnapshot(), before, 'Preview/animation must not mutate authored resources, preferences, or business rows');
  proof.cases.push({ id: 'R02', result: 'isolated-native-path-passed', animations, boundary: 'Real current runner motion policy; no OS setting or media-query override.' });
  } catch (error) {
    proof.cases.push({ id: 'R02', result: 'not-passed', completedAnimations: animations, failure: error.message });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: join(output, 'animation-not-passed.png') });
  }

  const source = resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya');
  const sample = join(disposable, 'owned-pack'); mkdirSync(sample);
  for (const name of ['character.json', 'sprites.png']) copyFileSync(join(source, name), join(sample, name));
  await search.fill(''); await chooseFixture(join(sample, 'character.json'));
  await page.getByText('2D 角色导入成功，可以预览与校准动作。', { exact: true }).waitFor();
  const imported = (await invoke(page, 'resources', 'list')).filter(row => row.origin === 'import'); assert.equal(imported.length, 1);
  await choose(imported[0]);
  const importedState = databaseSnapshot();
  const registered = importedState.lingjing_resource_files.filter(row => row.resource_id === imported[0].id);
  assert.equal(registered.length, 2);
  for (const row of registered) {
    const rel = relative(profile, realpathSync(row.file_path)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    assert.deepEqual(readFileSync(row.file_path), readFileSync(join(sample, row.asset_key)));
  }
  assert.equal(importedState.lingjing_resource_imports.filter(row => row.resource_id === imported[0].id).length, 1);
  await page.screenshot({ path: join(output, 'imported-resource.png') });
  proof.cases.push({ id: 'R03', result: 'engineering-ui-import-passed', resourceId: imported[0].id, filesMatchOriginal: true, nativeFilePickerExercised: false });

  const invalid = join(disposable, 'invalid'); mkdirSync(invalid);
  writeFileSync(join(invalid, 'bad.json'), '{invalid');
  copyFileSync(join(sample, 'character.json'), join(invalid, 'missing.json'));
  const traversal = JSON.parse(readFileSync(join(sample, 'character.json'), 'utf8'));
  traversal.meta.image = '../sentinel.png'; writeFileSync(join(invalid, 'traversal.json'), JSON.stringify(traversal));
  const sentinel = join(disposable, 'sentinel.png'); copyFileSync(join(sample, 'sprites.png'), sentinel);
  const sentinelHash = hash(readFileSync(sentinel)), negatives = [];
  for (const [name, expected] of [['bad.json', /JSON/], ['missing.json', /缺少|不存在/], ['traversal.json', /路径/]]) {
    await chooseFixture(join(invalid, name));
    await page.locator('.resources-status').filter({ hasText: expected }).waitFor();
    const message = await page.locator('.resources-status').innerText();
    assert.deepEqual(databaseSnapshot(), importedState);
    for (const row of registered) assert.deepEqual(readFileSync(row.file_path), readFileSync(join(sample, row.asset_key)));
    assert.equal(hash(readFileSync(sentinel)), sentinelHash);
    negatives.push({ name, message, originalRowsAndBytesUnchanged: true });
  }
  proof.cases.push({ id: 'R04', result: 'engineering-ui-boundary-passed', negatives, nativeFilePickerExercised: false });
  proof.networkBlocked = await app.evaluate(() => globalThis.__resourceOfflineBlocked);
  assert.deepEqual(proof.errors, []);
  proof.passed = proof.cases.length === 4 && proof.cases.every(row => row.result !== 'not-passed' && row.result.endsWith('-passed'));
  if (!proof.passed) process.exitCode = 1;
} catch (error) {
  proof.passed = false; proof.failure = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
} finally {
  if (app) await app.close().catch(error => { proof.shutdownError = error.message; proof.passed = false; process.exitCode = 1; });
  // One-off QA profile retained only on the disposable runner for diagnosis;
  // no passwords/tokens/profile DB are copied into the evidence artifact.
  proof.completedAt = new Date().toISOString();
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ passed: proof.passed, output, cases: proof.cases.map(({ id, result }) => ({ id, result })), failure: proof.failure?.message }));
}
