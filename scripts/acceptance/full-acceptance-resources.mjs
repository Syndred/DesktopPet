// Actual Electron/production UI in a new offline QA profile. No live cloud,
// service-role secrets, grants, existing user profiles, or OS preference changes.
// R03/R04 deliberately bridge the file-dialog result to owned fixture paths:
// they exercise UI -> production importer, NOT the native file-picker surface.
import { launchPortableSession } from './portable-session.mjs';
import { pollState } from './poll-state.mjs';
import { sha256 } from '../release/release-store.mjs';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, realpathSync, rmSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
assert.equal(process.platform, 'win32', 'Actual SFX acceptance requires isolated Windows runner');
const output = resolve('artifacts/foundation/full-acceptance/resources', `run-${Date.now()}-${randomUUID().slice(0, 8)}`);
mkdirSync(output, { recursive: true });
// Native canonicalization must precede QA marker creation: Windows RUNNER~1
// short paths must match the app's native canonical userData identity.
const disposable = realpathSync.native(mkdtempSync(join(tmpdir(), 'lingjing-offline-resources-')));
const profile = join(disposable, 'qa-profile');
const { provisionQaProfile } = require('../../apps/pc-app/runtime/features/accounts/qa-scenario.cjs');
const marker = provisionQaProfile(profile);
assert.equal(marker.profilePath, realpathSync.native(profile), 'Marker must match native canonical profile before launch');
const publicConfig = join(disposable, 'offline-public.json'); writeFileSync(publicConfig, '{}', { flag: 'wx' });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expectedBuild = JSON.parse(readFileSync(option('manifest') || 'apps/pc-app/dist/build-manifest.json', 'utf8'));
const releaseConfig = JSON.parse(readFileSync('scripts/release/electron-builder.pc.json'));
const version = JSON.parse(readFileSync('package.json')).version;
const executable = resolve(option('executable') || join(releaseConfig.directories.output, `Lingjing-${version}-portable-x64.exe`));
const expectedSource = option('source') || expectedBuild.sourceCommit;
assert.equal(expectedSource, expectedBuild.sourceCommit, 'Manifest must bind the selected baseline source');
const proof = { startedAt: new Date().toISOString(), scope: 'Actual Windows portable SFX, isolated offline QA UI and Pixi. No live-cloud claim; file-picker bridging remains partial.',
  executableSha256: await sha256(executable), full98Passed: false,
  candidate: expectedBuild, profile, runId: marker.runId, cases: [], errors: [], nativeFilePickerExercised: false, productionWrites: false };
// Pass only OS essentials to the driver; all other inherited variables are
// explicitly removed from its merged spawn environment, including credentials.
const systemKeys = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'LANG', 'LC_ALL', 'CI']);
const environment = Object.fromEntries(Object.keys(process.env).filter(key => !systemKeys.has(key.toUpperCase())).map(key => [key, undefined]));
Object.assign(environment, { PET_USER_DATA_DIR: profile, LINGJING_QA_SCENARIO: marker.scenario, LINGJING_PUBLIC_CONFIG: publicConfig });
const invoke = async (page, feature, command, payload = {}) => {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, `${feature}.${command}: ${result.code || ''} ${result.message || ''}`); return result.data;
};
const labels = { idle: '待机', blink: '眨眼', walk: '行走', wave: '招手', eat: '吃东西', attack_windup: '攻击起手', attack_release: '攻击释放', attack: '普通攻击', hit: '受击', skill: '技能施放', victory: '胜利', sleep: '睡眠' };
let model, page, uncertain = false;
const pids = new Set();
const saveProof = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const checkpoint = value => { proof.cases.push(value); saveProof(); };
function alive(pid) { try { process.kill(pid, 0); return true; } catch (error) { if (error.code === 'ESRCH') return false; throw error; } }
async function stop() {
  if (model) await model.stop();
  if (uncertain) throw Error('Launch/PID outcome unknown; retain isolated profile');
  proof.pidChecks = await pollState(() => [...pids].map(pid => ({pid, alive:alive(pid)})), rows => rows.every(row => !row.alive), {timeoutMs:10000,intervalMs:200,label:'Owned process still alive; retain profile'});
  model = null;
}
async function blockNetwork() {
  await model.main(({ session }) => {
    globalThis.__resourceOfflineBlocked = {node:0,fetch:0,websocket:0,chromium:0};
    const denied = kind => { globalThis.__resourceOfflineBlocked[kind]++; throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'); };
    const local = value => { try { const host = typeof value === 'string' || value instanceof URL ? new URL(String(value)).hostname : value?.hostname || value?.host || 'localhost'; return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length === 2 ? String(host).split(':')[0] : String(host)); } catch { return false; } };
    for (const name of ['node:http','node:https']) { const transport=process.getBuiltinModule(name); for(const method of ['request','get']) { const original=transport[method]; transport[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);}; } }
    const originalFetch=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__resourceOfflineBlocked.fetch++;return Promise.reject(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'));}return originalFetch.call(this,input,...args);};
    if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__resourceOfflineBlocked.chromium++;callback({cancel:true});});
  });
}
// Read only real SQLite, no fixture seeding of resource/auth/business records.
async function databaseSnapshot() {
  return model.main(({app}, expectedProfile) => {
    const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'), path=process.getBuiltinModule('node:path');
    if(path.resolve(app.getPath('userData'))!==path.resolve(expectedProfile))throw Error('Profile mismatch');
    const db=new(req('better-sqlite3'))(path.join(expectedProfile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
    try { db.pragma('query_only=ON');const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'lingjing_resource%' OR name LIKE '%companion%' OR name LIKE 'conversation%') ORDER BY name").all();return Object.fromEntries(names.map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()])); }
    finally { db.close(); }
  }, profile);
}
async function frames() {
  let timer;
  const observation = page.locator('.resources-preview:visible .resource-sprite-host').first().evaluate(async host => {
    const samples = [], started = performance.now();
    while (performance.now() - started < 750) {
      samples.push({ frame: host.dataset.frame, texture: host.dataset.frameTexture, region: host.dataset.textureFrame });
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    return { samples, hidden: document.hidden, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, motion: host.closest('[data-motion]')?.getAttribute('data-motion') };
  });
  try { return await Promise.race([observation,new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Real Pixi frame observation timed out')),5000);})]); }
  finally { clearTimeout(timer); }
}
async function choose(resource) {
  await page.getByRole('textbox', { name: '搜索角色', exact: true }).fill(resource.name);
  const card = page.locator(`button.resource-card[data-resource-id="${resource.id}"]`); await card.click();
  await page.locator(`.resources-preview:visible .resource-stage[data-resource-id="${resource.id}"][data-status="ready"] canvas`).waitFor();
  assert.equal(await card.getAttribute('aria-pressed'), 'true');
}
async function chooseFixture(file) {
  const rel = relative(disposable, realpathSync(file)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
  await model.main(({ dialog }, selected) => {
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
  assert.equal(await model.main(() => globalThis.__resourceDialogConsumed), true);
}
try {
  proof.stage='launching-owned-portable';saveProof();
  uncertain = true;
  model = await launchPortableSession({executable,profile,expectedSource,label:'resources-offline-qa',environment});
  for(const pid of [model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);
  uncertain = false;
  proof.stage='owned-portable-connected';saveProof();
  await blockNetwork();
  page = model.page; page.setDefaultTimeout(20000);
  page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing?.invoke));
  await model.main(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 1000));
  const password = `Disposable-${randomUUID()}!`;
  const registration = await invoke(page, 'accounts', 'register', { provider: 'local', account: `qa_res_${Date.now()}`, username: '离线资源验收', password, confirmPassword: password, rememberSession: false });
  const session = await invoke(page, 'accounts', 'session');
  assert.equal(session.dataMode, 'simulated'); assert.ok(session.currentUser.id.startsWith(`qa:${marker.runId}:`));
  proof.ownerAccountId = registration.currentUser.id;
  assert.equal(await model.main(({ app }) => app.getPath('userData')), profile);
  proof.stage='offline-account-registered';saveProof();
  const info = await invoke(page, 'app', 'info'); proof.runtime = info.runtime;
  for (const key of ['sourceCommit', 'canonicalSourceFingerprint', 'compiledFingerprint']) { assert.equal(typeof expectedBuild[key], 'string'); assert.equal(info.build[key], expectedBuild[key]); }
  assert.equal(info.build.runtimeClosure?.sha256, expectedBuild.runtimeClosure?.sha256);
  assert.deepEqual(info.build.publicCloud, expectedBuild.publicCloud, 'Packaged build public-config SHA metadata must match baseline manifest; offline override remains separate');
  await page.locator('.sidebar-bottom').getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('heading', { name: '按你的节奏，安静陪伴。', exact: true }).waitFor();
  await page.getByRole('navigation', {name:'设置分类',exact:true}).getByRole('link', { name: '角色资源', exact: true }).click();
  await page.locator('.resources-preview:visible').waitFor();
  const resources = await invoke(page, 'resources', 'list');
  const builtins = resources.filter(row => row.origin !== 'import' && row.availability === 'ready');
  assert.ok(builtins.length >= 8);
  const before = await databaseSnapshot();
  const search = page.getByRole('textbox', { name: '搜索角色', exact: true });
  await search.fill('NO_MATCH_ISOLATED_QA'); await page.getByText('没有匹配的 2D 角色。', { exact: true }).waitFor();
  assert.equal(await page.locator('button.resource-card').count(), 0);
  await search.fill(''); assert.equal(await page.locator('button.resource-card').count(), resources.length);
  const previews = [], animations = [];
  for (const resource of builtins) {
    await choose(resource);
    const stage = page.locator('.resources-preview:visible .resource-stage').first();
    const canvas = stage.locator('canvas');
    const image = await canvas.screenshot({ timeout:10000 });
    assert.ok(image.length > 1000);
    writeFileSync(join(output, `preview-${previews.length + 1}.png`), image);
    previews.push({ resourceId: resource.id, name: resource.name, canvasPngSha256: hash(image), ready: true });
  }
  assert.deepEqual(await databaseSnapshot(), before);
  checkpoint({ id: 'R01', result: 'isolated-native-path-passed', previews, emptySearch: true, recordsUnchanged: true, boundary: 'Current UI offers name search; no unsupported category selector invented. No pet assignment performed.' });
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
  assert.deepEqual(await databaseSnapshot(), before, 'Preview/animation must not mutate authored resources, preferences, or business rows');
  checkpoint({ id: 'R02', result: 'isolated-native-path-passed', animations, boundary: 'Real current runner motion policy; no OS setting or media-query override.' });
  } catch (error) {
    checkpoint({ id: 'R02', result: 'not-passed', completedAnimations: animations, failure: error.message });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: join(output, 'animation-not-passed.png'), timeout:10000 }).catch(error => { proof.animationScreenshotError=error.message; });
  }

  const source = resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya');
  const sample = join(disposable, 'owned-pack'); mkdirSync(sample);
  for (const name of ['character.json', 'sprites.png']) copyFileSync(join(source, name), join(sample, name));
  await search.fill(''); await chooseFixture(join(sample, 'character.json'));
  await page.getByText('2D 角色导入成功，可以预览与校准动作。', { exact: true }).waitFor();
  const imported = (await invoke(page, 'resources', 'list')).filter(row => row.origin === 'import'); assert.equal(imported.length, 1);
  await choose(imported[0]);
  const importedState = await databaseSnapshot();
  const registered = importedState.lingjing_resource_files.filter(row => row.resource_id === imported[0].id);
  assert.equal(registered.length, 2);
  for (const row of registered) {
    const rel = relative(profile, realpathSync(row.file_path)); assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel));
    assert.deepEqual(readFileSync(row.file_path), readFileSync(join(sample, row.asset_key)));
  }
  assert.equal(importedState.lingjing_resource_imports.filter(row => row.resource_id === imported[0].id).length, 1);
  await page.screenshot({ path: join(output, 'imported-resource.png'), timeout:10000 });
  checkpoint({ id: 'R03', result: 'engineering-ui-import-passed', resourceId: imported[0].id, filesMatchOriginal: true, nativeFilePickerExercised: false });

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
    assert.deepEqual(await databaseSnapshot(), importedState);
    for (const row of registered) assert.deepEqual(readFileSync(row.file_path), readFileSync(join(sample, row.asset_key)));
    assert.equal(hash(readFileSync(sentinel)), sentinelHash);
    negatives.push({ name, message, originalRowsAndBytesUnchanged: true });
  }
  checkpoint({ id: 'R04', result: 'engineering-ui-boundary-passed', negatives, nativeFilePickerExercised: false });
  proof.networkBlocked = await model.main(() => globalThis.__resourceOfflineBlocked);
  assert.deepEqual(proof.errors, []);
  proof.passed = proof.cases.length === 4 && proof.cases.every(row => row.result !== 'not-passed' && row.result.endsWith('-passed'));
  if (!proof.passed) process.exitCode = 1;
} catch (error) {
  proof.passed = false; proof.failure = { message: error.message, stack: error.stack }; process.exitCode = 1;
  if (page) await page.screenshot({ path: join(output, 'failure.png'), timeout:10000 }).catch(() => {});
} finally {
  try { await stop(); proof.ownedProcessStopped = true; }
  catch(error) { proof.shutdownError=error.message;proof.passed=false;process.exitCode=1; }
  try {
    assert.equal(dirname(disposable),realpathSync.native(tmpdir()));
    assert.ok(basename(disposable).startsWith('lingjing-offline-resources-'));
    if(!proof.ownedProcessStopped)throw Error('Keep isolated profile outside artifacts: exact process exit not confirmed');
    rmSync(disposable,{recursive:true,force:true});proof.profileRemoved=true;
  } catch(error) { proof.cleanupError=error.message;proof.passed=false;process.exitCode=1; }
  proof.completedAt=new Date().toISOString();saveProof();
  console.log(JSON.stringify({passed:proof.passed,output,cases:proof.cases.map(({id,result})=>({id,result})),failure:proof.failure?.message,shutdownError:proof.shutdownError}));
}
