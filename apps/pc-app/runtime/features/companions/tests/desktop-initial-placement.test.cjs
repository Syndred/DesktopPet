const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { createRequire, _load: originalLoad } = require('node:module');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const vm = require('node:vm');
const ts = require('typescript');
const { CompanionsService } = require('../service.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const { createCompanionBackupAdapter } = require('../backup.cjs');
const { createDesktopWindowManager, boundsFor } = require('../windows.cjs');
const { defaultSettings } = require('../../accounts/settings.cjs');

// Real factory and account-policy source, real SQLite, controlled native API
// doubles. Neither Electron nor a BrowserWindow nor a child process is started.
// The double's oversized constructor rectangle is not a Windows/DPI simulation.
function windowFactory(context) {
  const file = resolve(__dirname, '../../../main/index.ts');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const declaration = source.statements.flatMap(statement => ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])
    .find(value => value.name.getText(source) === 'windows');
  assert.ok(declaration?.initializer && ts.isObjectLiteralExpression(declaration.initializer));
  const compiled = ts.transpileModule(`const factory = ${declaration.initializer.getText(source)}; globalThis.factory = factory;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  return vm.runInNewContext(compiled + '\nfactory;', context, { filename: 'actual-window-factory-with-native-doubles.cjs' });
}

function accountPolicy(services, electron, trace) {
  const file = resolve(__dirname, '../../accounts/desktop-host.cjs'), localRequire = createRequire(file);
  const module = { exports: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), {
    module, exports: module.exports, __dirname: dirname(file), Buffer, console,
    process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' } }, setInterval, clearInterval, queueMicrotask,
    require(name) {
      if (name === 'node:child_process') return { spawn() {
        trace.push({ type: 'process-double-only' });
        const child = new EventEmitter(); child.stdout = new EventEmitter(); child.killed = false;
        child.kill = () => { child.killed = true; }; return child;
      } };
      if (name === './startup.cjs') return { createLoginItemController: () => ({ apply() {}, status: () => ({ fixture: true }) }) };
      return localRequire(name);
    }
  }, { filename: 'actual-account-policy-with-os-doubles.cjs' });
  return module.exports.createDesktopHost(services, electron);
}

async function fixture(t, { scale = 1, reuse = false, offscreen = false } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-initial-placement-')), file = join(directory, 'state.sqlite');
  const db = new DatabaseSync(file); migrateCompanions(db);
  const owner = 'initial-placement-owner', foreign = 'initial-placement-foreign';
  const service = new CompanionsService({ db });
  const first = service.adopt(owner, { actionId: 'original-adoption-a', templateId: 'animal-white-fox', name: '原昵称甲', showOnDesktop: true }).data.pet;
  service.adopt(owner, { actionId: 'original-adoption-b', templateId: 'animal-white-fox', name: '原昵称乙', showOnDesktop: false });
  service.adopt(foreign, { actionId: 'foreign-adoption', templateId: 'animal-white-fox', name: '其他账号', showOnDesktop: true });
  service.updateDesktop(owner, { actionId: 'original-desktop-preference', petId: first.petId, behavior: 'quiet', scale,
    position: { x: offscreen ? 4000 : scale === 2 ? 1588 : 559, y: offscreen ? 4000 : 0, displayId: 'primary-125' } });
  const pet = service.requirePet(owner, first.petId), backup = createCompanionBackupAdapter(db);
  const original = new Map([owner, foreign].map(who => [who, JSON.stringify(backup.export(who))]));
  const reader = new DatabaseSync(file, { readOnly: true }); reader.exec('PRAGMA query_only=ON');
  const app = new EventEmitter(), bus = new EventEmitter(), handles = new Set(), trace = [], changed = [];
  let currentOwner = owner, sequence = 0, manager;
  class WindowDouble extends EventEmitter {
    constructor(options) {
      super(); this.id = ++sequence; this.options = options; this.visible = false; this.destroyed = false;
      this.bounds = { x: options.x, y: options.y, width: options.width + 4, height: options.height + 4 };
      this.webContents = { getZoomFactor: () => 1 }; this.requests = [];
      handles.add(this); trace.push({ type: 'construct-double', id: this.id }); app.emit('browser-window-created', {}, this);
    }
    setBounds(value) { this.requests.push({ ...value }); this.bounds = { ...value }; trace.push({ type: 'canonical-bounds', id: this.id, value: { ...value } }); }
    getBounds() { return { ...this.bounds }; }
    getContentBounds() { return this.getBounds(); }
    setIgnoreMouseEvents(value) { trace.push({ type: 'hit-policy', id: this.id, value }); }
    setAlwaysOnTop(value) { this.topmost = value; trace.push({ type: 'topmost-policy', id: this.id, value }); }
    isAlwaysOnTop() { return Boolean(this.topmost); }
    isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    isFullScreen() { return false; }
    isFocused() { return false; }
    showInactive() { this.visible = true; trace.push({ type: 'show-without-focus', id: this.id }); }
    hide() { this.visible = false; }
    close() { this.destroy(); }
    destroy() { if (!this.destroyed) { this.destroyed = true; this.visible = false; this.emit('closed'); } }
    static fromId(id) { return [...handles].find(value => value.id === id); }
    static getAllWindows() { return [...handles]; }
  }
  const windows = windowFactory({ BrowserWindow: WindowDouble, companionWindows: new Map(), preload: 'fixture-preload',
    protect() {}, load() {}, emit() {}, quitting: false, services: {}, closeToTray: true });
  const screen = {
    getAllDisplays: () => [{ id: 'primary-125', scaleFactor: 1.25, workArea: { x: 0, y: 0, width: 2048, height: 1152 } }],
    getDisplayNearestPoint() { return this.getAllDisplays()[0]; }, getPrimaryDisplay() { return this.getAllDisplays()[0]; },
    getDisplayMatching() { return this.getAllDisplays()[0]; }
  };
  const settings = defaultSettings(); settings.notifications.quietEnabled = false; settings.desktop.clickThrough = false;
  const registry = new Map([['accounts', { settings: () => ({ document: settings }) }]]);
  const services = { db, windows, session: { getOwnerAccountId: () => currentOwner }, get: name => registry.get(name),
    events: { emit: (name, payload) => bus.emit(name, payload), on(name, listener) { bus.on(name, listener); return () => bus.off(name, listener); } } };
  registry.set('companions', { getDesktopWindows: () => manager?.inspect() || [] });
  const host = accountPolicy(services, { app, BrowserWindow: WindowDouble, session: { defaultSession: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} } } }, trace);
  t.after(() => {
    currentOwner = null; manager?.dispose(); host.dispose(); assertOriginalBytes();
    const digest = text => createHash('sha256').update(text).digest('hex');
    console.log('INITIAL_PLACEMENT_SQLITE ' + JSON.stringify({ kind: 'real-SQLite-plus-native-API-doubles', savedScale: scale, reusedFoundationHandle: reuse,
      beforeSha256: [owner, foreign].map(who => digest(original.get(who))), afterSha256: [owner, foreign].map(who => digest(JSON.stringify(backup.export(who)))),
      queryOnlyReadbackEqual: true, exactAllCompanionBytesUnchanged: true, nativeWindowStarted: false, childProcessStarted: false }));
    reader.close(); db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('lingjing-initial-placement-'));
    rmSync(directory, { recursive: true, force: true });
  });
  await host.apply(settings);
  let reused;
  if (reuse) { reused = windows.create(pet.petId, boundsFor(pet, screen)); reused.emit('ready-to-show'); await Promise.resolve(); }
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { screen };
    return originalLoad.call(this, request, parent, isMain);
  };
  try { manager = createDesktopWindowManager({ services, service, ensureImported() {}, changed: who => changed.push(who) }); }
  finally { Module._load = originalLoad; }
  function assertOriginalBytes() {
    for (const who of [owner, foreign]) {
      assert.equal(JSON.stringify(backup.export(who)), original.get(who));
      assert.equal(JSON.stringify(createCompanionBackupAdapter(reader).export(who)), original.get(who));
    }
  }
  return { manager, pet, windows, screen, settings, host, trace, changed, handles, reused, assertOriginalBytes,
    switchOwner: value => { currentOwner = value; }, owner, foreign };
}

test('initial placement precedes the actual show callback and account policies without changing saved SQLite bytes', async t => {
  for (const scale of [1, 2]) await t.test(`saved scale ${scale}`, async t => {
    const f = await fixture(t, { scale, offscreen: scale === 1 }); f.manager.sync();
    const win = f.windows.get(f.pet.petId), expected = boundsFor(f.pet, f.screen);
    assert.equal(win.requests.length, 1); assert.deepEqual(win.requests[0], { x: expected.x, y: expected.y, width: expected.width, height: expected.height });
    assert.equal(win.visible, false); f.assertOriginalBytes();
    win.emit('ready-to-show'); await Promise.resolve();
    const place = f.trace.findIndex(event => event.id === win.id && event.type === 'canonical-bounds');
    const show = f.trace.findIndex(event => event.id === win.id && event.type === 'show-without-focus');
    assert.ok(place >= 0 && place < show); assert.equal(win.requests.length, 1);
    assert.ok(f.trace.some(event => event.id === win.id && event.type === 'topmost-policy'));
    f.manager.sync(); assert.equal(win.requests.length, 1); assert.deepEqual(f.changed, []); f.assertOriginalBytes();
  });
});

test('initial placement also covers the foundation cached-window early return without waiting for ready again', async t => {
  const f = await fixture(t, { scale: 2, reuse: true }), before = f.handles.size;
  assert.equal(f.reused.requests.length, 0); f.manager.sync();
  assert.equal(f.windows.get(f.pet.petId), f.reused); assert.equal(f.handles.size, before);
  assert.equal(f.reused.requests.length, 1); assert.equal(f.reused.requests[0].width, 460); assert.equal(f.reused.requests[0].height, 560);
  assert.deepEqual(f.changed, []); f.assertOriginalBytes();
});

test('initial placement preserves the existing owner guard if the account changes before ready', async t => {
  const f = await fixture(t); f.manager.sync(); const win = f.windows.get(f.pet.petId);
  f.switchOwner(f.foreign); win.emit('ready-to-show'); await Promise.resolve();
  assert.equal(win.destroyed, true); assert.equal(f.manager.inspect().length, 0);
  assert.equal(win.requests.length, 1); assert.deepEqual(f.changed, []); f.assertOriginalBytes();
});

test('initial placement and the first ordinary drag request the same saved-scale dimensions without native-size feedback', async t => {
  const f = await fixture(t, { scale: 2 }); f.manager.sync(); const win = f.windows.get(f.pet.petId);
  assert.equal(win.requests.length, 1);
  await f.manager.handleInput(f.owner, { petId: f.pet.petId, action: 'drag-start', screenX: 1600, screenY: 20 });
  await f.manager.handleInput(f.owner, { petId: f.pet.petId, action: 'drag-move', screenX: 1550, screenY: 50 });
  assert.equal(win.requests.length, 2);
  assert.deepEqual(win.requests.map(value => [value.width, value.height]), [[460, 560], [460, 560]]);
  assert.equal(win.requests[1].x, 1538); assert.equal(win.requests[1].y, 30);
  assert.deepEqual(f.changed, []); f.assertOriginalBytes();
});
