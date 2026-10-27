import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve('.');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedBuild = JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8'));
assert.equal(expectedBuild.sourceCommit, sourceCommit, 'Build the current committed source before native engineering acceptance');
assert.deepEqual(expectedBuild.sourceDirtyFiles, [], 'Native acceptance requires a clean committed build');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source changes and rebuild before native acceptance');
const output = resolve(`artifacts/foundation/cloud-engineering/electron/run-${Date.now()}`); mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const manifest = JSON.parse(readFileSync('apps/pc-app/dist/ui/.vite/manifest.json', 'utf8'));
const proof = { at: new Date().toISOString(), sourceCommit, scenario,
  scope: 'Real production Electron/native windows/tray/IPC/Pixi and request graph. Explicit isolated simulated account; no cloud-service receipt.', checks: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const stage = (name, detail = {}) => { proof.stages ||= []; proof.stages.push({ at: new Date().toISOString(), name, ...detail }); save(); console.log(JSON.stringify({ stage: name, ...detail })); };
const record = check => { proof.checks.push(check); save(); };
const bounded = async (promise, ms, label) => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`ACCEPTANCE_TIMEOUT:${label}`)), ms); })]); } finally { clearTimeout(timer); } };
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const app = await electron.launch({ args: [root], cwd: root, env });
const invoke = async (page, feature, command, payload = {}, ok = true) => {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  if (ok) assert.equal(result.ok, true, JSON.stringify(result)); return ok ? result.data : result;
};
const graph = async page => {
  const host = await app.browserWindow(page), id = await host.evaluate(win => win.webContents.id);
  const requests = await app.evaluate((_electron, id) => globalThis.__engineeringRequests.filter(entry => entry.webContentsId === id).map(entry => entry.url), id);
  assert.ok(requests.length > 0, 'Request graph must contain actual native-session script requests'); return requests;
};
const featureAsset = name => Object.entries(manifest).find(([key]) => key.endsWith(`features/${name}/index.tsx`))?.[1]?.file;
const absent = (requests, features) => { for (const name of features) { const asset = featureAsset(name); assert.ok(asset, `Missing lazy manifest: ${name}`); assert.ok(!requests.some(url => url.endsWith(asset)), `${name} was eagerly loaded`); } };
try {
  await app.evaluate(({ session }) => {
    globalThis.__engineeringRequests = [];
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      if (details.resourceType === 'script') globalThis.__engineeringRequests.push({ url: details.url, webContentsId: details.webContentsId });
      callback({});
    });
  });
  const page = await app.firstWindow(); page.setDefaultTimeout(15000); page.on('pageerror', error => proof.errors.push(error.message));
  await page.reload();
  await page.waitForFunction(() => Boolean(window.lingjing?.call));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  const password = `Engineering-${randomUUID()}!`;
  await invoke(page, 'accounts', 'register', { provider: 'local', account: `qa_engine_${Date.now()}`, username: '公共工程验收', password, confirmPassword: password, rememberSession: false });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await page.locator('.companions-page, .cp-page').first().waitFor();
  proof.info = await invoke(page, 'app', 'info'); assert.equal(proof.info.runtime.electron, '44.9.3'); assert.ok(proof.info.runtime.tray.active);
  assert.equal(proof.info.build.sourceCommit, sourceCommit);
  for (const key of ['canonicalSourceFingerprint', 'compiledFingerprint']) assert.equal(proof.info.build[key], expectedBuild[key]);
  assert.equal(proof.info.build.runtimeClosure.sha256, expectedBuild.runtimeClosure.sha256);
  const initialGraph = await graph(page); absent(initialGraph, ['resources', 'battle', 'discovery', 'garden', 'conversations']);
  record({ id: 'app-entry-lazy-and-supported', requests: initialGraph, runtime: proof.info.runtime });
  await page.getByRole('button', { name: '设置', exact: true }).click(); await page.getByRole('heading', { name: '按你的节奏，安静陪伴。', exact: true }).waitFor();
  await page.getByRole('button', { name: '角色资源', exact: true }).click(); await page.locator('.resources-preview').waitFor();
  const list = await invoke(page, 'resources', 'list'); assert.ok(list.filter(item => item.availability === 'ready').length >= 8);
  record({ id: 'lazy-navigation-and-eight-assets', resources: list.map(item => ({ id: item.id, kind: item.kind, availability: item.availability })) });
  const pets = [];
  for (const [templateId, name] of [['animal-wood-deer', '工程青芽'], ['animal-earth-pangolin', '工程岩团']]) pets.push((await invoke(page, 'companions', 'adopt', { actionId: randomUUID(), templateId, name, showOnDesktop: false })).pet);
  for (const pet of pets) {
    const opening = app.waitForEvent('window', { timeout: 15000 });
    await invoke(page, 'companions', 'desktop', { actionId: randomUUID(), petId: pet.petId, visible: true });
    const desktop = await opening; desktop.on('pageerror', error => proof.errors.push(error.message));
    await desktop.waitForURL('**/desktop.html#/desktop/**');
    await desktop.locator('.resource-stage[data-status="ready"] canvas').waitFor();
    await desktop.waitForTimeout(400);
    const requests = await graph(desktop); absent(requests, ['accounts', 'companions', 'battle', 'discovery', 'garden', 'conversations', 'resources']);
    const denied = await invoke(desktop, 'companions', 'get', { petId: pets.find(other => other.petId !== pet.petId).petId }, false); assert.equal(denied.code, 'WINDOW_SCOPE_VIOLATION');
    const logout = await invoke(desktop, 'accounts', 'logout', {}, false); assert.equal(logout.code, 'WINDOW_SCOPE_VIOLATION');
    const visual = await desktop.locator('.cp-desktop-visual').evaluate(element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height, innerWidth }; });
    const native = await app.evaluate(({ BrowserWindow }, id) => {
      const win = BrowserWindow.getAllWindows().find(value => value.webContents.getURL().includes(encodeURIComponent(id)));
      return { url: win.webContents.getURL(), bounds: win.getBounds(), background: win.getBackgroundColor(), visibleWindow: win.isVisible(), alwaysOnTop: win.isAlwaysOnTop(), resizable: win.isResizable(), focusable: win.isFocusable(), webPreferences: win.webContents.getLastWebPreferences() };
    }, pet.petId);
    assert.ok(native.visibleWindow && native.alwaysOnTop && !native.resizable && !native.focusable);
    assert.ok(native.webPreferences.contextIsolation && native.webPreferences.sandbox && !native.webPreferences.nodeIntegration);
    record({ id: `native-${pet.element}-window-and-ipc`, status: 'passed', native, otherPetDenied: denied.code, logoutDenied: logout.code });
    stage('capture-start', { petId: pet.petId });
    let captureObservation;
    try {
      const capture = await bounded(app.evaluate(async ({ BrowserWindow }, { id, visual }) => {
        const win = BrowserWindow.getAllWindows().find(value => value.webContents.getURL().includes(encodeURIComponent(id)));
        let timer;
        try {
          // Electron 44 Opts: keep capture active without unhiding another window.
          const image = await Promise.race([win.capturePage(undefined, { stayAwake: true, stayHidden: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('ACCEPTANCE_TIMEOUT:native-capture')), 12000); })]);
          const size = image.getSize(), bytes = image.toBitmap(), scale = size.width / visual.innerWidth;
          let visible = 0, clear = 0, characterPixels = 0;
          for (let y = 0; y < size.height; y++) for (let x = 0; x < size.width; x++) {
            const alpha = bytes[(y * size.width + x) * 4 + 3]; if (!alpha) clear++; else visible++;
            if (alpha > 10 && x >= visual.x * scale && x < (visual.x + visual.width) * scale && y >= visual.y * scale && y < (visual.y + visual.height) * scale) characterPixels++;
          }
          return { visible, clear, characterPixels, size, png: image.toPNG().toString('base64') };
        } finally { clearTimeout(timer); }
      }, { id: pet.petId, visual }), 15000, 'native-capture-controller');
      writeFileSync(join(output, `${pet.element}-desktop.png`), Buffer.from(capture.png, 'base64')); delete capture.png; captureObservation = capture;
      assert.ok(capture.clear > 1000 && capture.characterPixels > 2000, 'Actual captured alpha/character pixels must satisfy original thresholds');
      record({ id: `native-${pet.element}-capture`, status: 'passed', capture });
      stage('capture-complete', { petId: pet.petId });
    } catch (error) {
      const status = String(error).includes('ACCEPTANCE_TIMEOUT:') ? 'blocked' : 'failed';
      record({ id: `native-${pet.element}-capture`, status, capture: captureObservation, error: String(error) });
      stage('capture-incomplete', { petId: pet.petId, status });
    }
    await desktop.getByRole('button', { name: `摸摸${pet.name}`, exact: true }).click();
    const changed = await invoke(page, 'companions', 'get', { petId: pet.petId }); assert.ok(changed.growth.mood > pet.growth.mood);
    if (pet === pets[0]) {
      await page.getByRole('button', { name: '收起到托盘', exact: true }).click();
      const mainHidden = await app.evaluate(({ BrowserWindow }) => !BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/ui/index.html')).isVisible()); assert.ok(mainHidden);
      assert.ok((await invoke(desktop, 'app', 'info')).runtime.tray.active);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/ui/index.html')).show());
    }
    record({ id: `native-${pet.element}-desktop`, petId: pet.petId, resourceId: pet.resource.resourceId, requests, native, otherPetDenied: denied.code, logoutDenied: logout.code, interactionMood: changed.growth.mood });
    const closed = desktop.waitForEvent('close', { timeout: 15000 }); await desktop.getByRole('button', { name: `收回${pet.name}`, exact: true }).click(); await closed;
  }
  const rejected = await app.evaluate(async ({ BrowserWindow }, preload) => {
    const untrusted = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } });
    try { await untrusted.loadURL('data:text/html,<title>isolated-untrusted-window</title>'); return await untrusted.webContents.executeJavaScript("window.lingjing.invoke('app','info')"); }
    finally { untrusted.destroy(); }
  }, resolve('apps/pc-app/dist/preload/index.cjs'));
  assert.equal(rejected.code, 'UNTRUSTED_SENDER'); record({ id: 'unregistered-window-rejected', code: rejected.code });
  assert.deepEqual(proof.errors, []);
  stage('resource-screenshot-start');
  try { await page.screenshot({ path: join(output, 'lazy-resource-page.png'), timeout: 10000 }); stage('resource-screenshot-complete'); }
  catch (error) { record({ id: 'resource-page-screenshot', status: error.name === 'TimeoutError' ? 'blocked' : 'failed', error: String(error) }); }
  proof.passed = !proof.checks.some(check => ['failed', 'blocked'].includes(check.status));
  proof.status = proof.passed ? 'passed' : 'partial';
  if (!proof.passed) process.exitCode = 1;
  console.log(JSON.stringify({ passed: proof.passed, status: proof.status, output, checks: proof.checks.length }));
} catch (error) { proof.failure = String(error); proof.passed = false; proof.status = 'failed'; process.exitCode = 1; }
finally {
  stage('owned-app-close-start');
  const owned = app.process();
  try { await bounded(app.close(), 15000, 'owned-app-close'); stage('owned-app-close-complete'); }
  catch (error) {
    proof.closeError = String(error); proof.passed = false; proof.status = 'failed'; process.exitCode = 1;
    if (owned && owned.exitCode === null) {
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(owned.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
        else owned.kill('SIGKILL');
        let exited = owned.exitCode !== null;
        for (let attempt = 0; attempt < 30 && !exited; attempt++) {
          try { process.kill(owned.pid, 0); } catch (error) { if (error.code === 'ESRCH') exited = true; else throw error; }
          if (!exited) await new Promise(resolve => setTimeout(resolve, 100));
          exited ||= owned.exitCode !== null;
        }
        proof.ownedProcessCleanup = { pid: owned.pid, targeted: true, exited };
        if (!exited) proof.cleanupError = 'Owned Electron process exit not confirmed within 3 seconds';
      } catch (cleanupError) { proof.cleanupError = String(cleanupError); }
    }
  }
  proof.completedAt = new Date().toISOString(); save();
}
