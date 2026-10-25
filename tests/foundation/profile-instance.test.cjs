// Real temporary-directory checks; Electron and windows below are SIMULATED.
// No desktop application, ordinary profile, SQLite or cloud service is opened.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { mkdtempSync, mkdirSync, realpathSync, readFileSync, rmSync, symlinkSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, dirname, join, relative, resolve, toNamespacedPath } = require('node:path');
const { pathToFileURL } = require('node:url');
const vm = require('node:vm');
const ts = require('typescript');
const { canonicalProfilePath, claimProfileInstance } = require('../../apps/pc-app/runtime/core/profile-instance.cjs');

function temporaryRoot(t) {
  const parent = realpathSync.native(tmpdir());
  const directory = mkdtempSync(join(parent, 'lingjing-profile-instance-test-'));
  t.after(() => {
    // Validate the absolute recursive-delete target before removing fixtures.
    assert.equal(dirname(resolve(directory)), parent);
    assert.ok(basename(directory).startsWith('lingjing-profile-instance-test-'));
    rmSync(directory, { recursive: true, force: true });
  });
  return directory;
}

function simulatedApp(profilePath, acquire = () => true) {
  const app = new EventEmitter();
  const calls = [];
  let current = profilePath;
  Object.assign(app, {
    getPath: name => name === 'userData' ? current : dirname(profilePath),
    setPath: (name, value) => { assert.equal(name, 'userData'); current = value; calls.push(['setPath', value]); },
    requestSingleInstanceLock: () => { calls.push(['lock', current]); return acquire(current); },
  });
  return { app, calls };
}

test('FILESYSTEM: canonical profile identity handles relative paths, dot segments and junctions', t => {
  const root = temporaryRoot(t), target = join(root, '资料 Device A');
  const canonical = canonicalProfilePath(target);
  assert.equal(canonicalProfilePath(relative(process.cwd(), target)), canonical);
  assert.equal(canonicalProfilePath(join(target, '..', '资料 Device A', '.')), canonical);
  const alias = join(root, 'profile-alias');
  symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(canonicalProfilePath(alias), canonical);
  assert.notEqual(canonicalProfilePath(join(root, 'Device B')), canonical);
});

test('FILESYSTEM: Windows profile casing and namespaced spelling select the same directory', { skip: process.platform !== 'win32' }, t => {
  const root = temporaryRoot(t), target = join(root, 'Device-A');
  const canonical = canonicalProfilePath(target);
  assert.equal(canonicalProfilePath(join(root, 'device-a')), canonical);
  assert.equal(canonicalProfilePath(toNamespacedPath(target)), canonical);
});

test('FILESYSTEM: selecting and locking an existing profile preserves its saved files', t => {
  const root = temporaryRoot(t), profile = join(root, 'existing-profile');
  mkdirSync(profile);
  const fixtures = { 'lingjing.sqlite': Buffer.from([0, 1, 2, 128, 255]), 'pet-runtime-data.json': Buffer.from('{"history":"keep"}') };
  for (const [name, bytes] of Object.entries(fixtures)) writeFileSync(join(profile, name), bytes);
  const { app } = simulatedApp(profile);
  const instance = claimProfileInstance({ app, profilePath: profile });
  for (const [name, bytes] of Object.entries(fixtures)) assert.deepEqual(readFileSync(join(profile, name)), bytes);
  instance.dispose();
});

test('SIMULATED LOCK: canonical userData is set before native lock, same profile rejects and another profile owns its lock', t => {
  const root = temporaryRoot(t), locks = new Set();
  const acquire = path => { if (locks.has(path)) return false; locks.add(path); return true; };
  const first = simulatedApp(join(root, 'device-a'), acquire);
  const instance = claimProfileInstance({ app: first.app, profilePath: join(root, 'device-a') });
  const alias = join(root, 'alias-a');
  symlinkSync(instance.profilePath, alias, process.platform === 'win32' ? 'junction' : 'dir');
  const second = simulatedApp(alias, acquire), other = simulatedApp(join(root, 'device-b'), acquire);
  const duplicate = claimProfileInstance({ app: second.app, profilePath: alias });
  const independent = claimProfileInstance({ app: other.app, profilePath: join(root, 'device-b') });
  assert.equal(instance.primary, true);
  assert.equal(duplicate.primary, false);
  assert.equal(independent.primary, true);
  assert.deepEqual(first.calls, [['setPath', instance.profilePath], ['lock', instance.profilePath]]);
  assert.equal(second.app.listenerCount('second-instance'), 0);
  let unwanted = 0;
  duplicate.ready(() => unwanted++);
  second.app.emit('second-instance');
  assert.equal(unwanted, 0);
  instance.dispose(); independent.dispose();
});

test('SIMULATED EVENTS: early duplicate requests coalesce until startup completes, then activate the existing main window', t => {
  const root = temporaryRoot(t), { app } = simulatedApp(join(root, 'profile'));
  const instance = claimProfileInstance({ app, profilePath: join(root, 'profile') });
  let shown = 0;
  for (let i = 0; i < 5; i++) app.emit('second-instance', {}, [], root, {});
  assert.equal(shown, 0);
  instance.ready(() => shown++);
  assert.equal(shown, 1);
  app.emit('second-instance');
  assert.equal(shown, 2);
  instance.dispose();
  app.emit('second-instance');
  instance.ready(() => shown++);
  assert.equal(shown, 2);
  assert.equal(app.listenerCount('second-instance'), 0);
  assert.equal(app.releaseSingleInstanceLock, undefined); // No early lock release.
});

test('FILESYSTEM: an invalid profile fails before selecting userData or acquiring a lock', t => {
  const root = temporaryRoot(t), file = join(root, 'not-a-directory');
  writeFileSync(file, 'fixture');
  const { app, calls } = simulatedApp(root);
  assert.throws(() => claimProfileInstance({ app, profilePath: file }));
  assert.deepEqual(calls, []);
});

const deferred = () => { let resolvePromise; const promise = new Promise(done => { resolvePromise = done; }); return { promise, resolve: resolvePromise }; };
const flush = () => new Promise(done => setImmediate(done));

// Execute the actual TypeScript main bootstrap with mocked Electron/platform
// modules. Only import bindings and import.meta.url are adapted for Node's VM.
function simulatedMain(t, primary) {
  const root = temporaryRoot(t), profile = join(root, 'profile');
  const { app, calls } = simulatedApp(profile, () => primary);
  const ready = deferred(), art = deferred(), windows = [], counters = { database: 0, services: 0, ready: 0, tray: 0 };
  Object.assign(app, {
    setAppUserModelId() {},
    exit: code => calls.push(['exit', code]),
    whenReady: () => { counters.ready++; return ready.promise; },
    getVersion: () => 'fixture',
  });
  class SimulatedWindow extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.actions = []; this.minimized = false;
      this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {} });
      windows.push(this);
    }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    restore() { this.actions.push('restore'); this.minimized = false; }
    show() { this.actions.push('show'); }
    focus() { this.actions.push('focus'); }
  }
  class SimulatedTray extends EventEmitter {
    constructor() { super(); counters.tray++; }
    setToolTip() {}
    setContextMenu() {}
  }
  const db = { open: true, prepare: () => ({ get() {}, run() {} }) };
  const services = { db, get() {}, provide() {}, events: { emit() {} }, ipc: { handle() {} } };
  const runtime = resolve(__dirname, '../../apps/pc-app/runtime');
  const dependencies = {
    'core/profile-path.cjs': require(join(runtime, 'core/profile-path.cjs')),
    'core/profile-instance.cjs': { claimProfileInstance },
    'core/main-window-geometry.cjs': require(join(runtime, 'core/main-window-geometry.cjs')),
    'core/database.cjs': { openDatabase() { counters.database++; return db; }, backupLegacy() {} },
    'core/services.cjs': { createServices() { counters.services++; return services; }, discoverFeatures: () => [] },
    'core/qa-scenario.cjs': { readQaScenario: () => null },
    'core/runtime-compat.cjs': { createRuntimeCompatibility: () => ({ dispose() {} }) },
    'core/ipc-guard.cjs': {},
    'core/tray-recall.cjs': {},
    'core/builtin-art.cjs': { registerBuiltinArt: () => art.promise },
  };
  const imports = {
    'node:module': { createRequire: () => file => {
      const key = relative(runtime, file).replaceAll('\\', '/');
      assert.ok(Object.hasOwn(dependencies, key), `Unexpected runtime dependency: ${key}`);
      return dependencies[key];
    } },
    'node:path': require('node:path'), 'node:url': require('node:url'), 'node:crypto': require('node:crypto'),
    'node:fs': { existsSync: () => false, readFileSync },
    electron: { app, BrowserWindow: SimulatedWindow, Tray: SimulatedTray,
      Menu: { setApplicationMenu() {}, buildFromTemplate: value => value },
      nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
      session: { defaultSession: { setPermissionRequestHandler() {} } },
      ipcMain: Object.assign(new EventEmitter(), { handle() {} }),
      screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } }) },
    },
  };
  const filename = join(runtime, 'main/index.ts');
  const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const adapted = ts.transform(source, [context => sourceFile => {
      const visit = node => {
        if (ts.isImportDeclaration(node)) return context.factory.createVariableStatement(undefined, context.factory.createVariableDeclarationList([
          context.factory.createVariableDeclaration(context.factory.createObjectBindingPattern(node.importClause.namedBindings.elements.map(item =>
            context.factory.createBindingElement(undefined, item.propertyName, item.name))), undefined, undefined,
          context.factory.createElementAccessExpression(context.factory.createIdentifier('__imports'), node.moduleSpecifier)),
        ], ts.NodeFlags.Const));
        if (ts.isMetaProperty(node)) return context.factory.createObjectLiteralExpression([
          context.factory.createPropertyAssignment('url', context.factory.createStringLiteral(pathToFileURL(resolve(runtime, '../dist/main/index.cjs')).href)),
        ]);
        return ts.visitEachChild(node, visit, context);
      };
      return ts.visitNode(sourceFile, visit);
    }]);
  const output = ts.transpileModule(ts.createPrinter().printFile(adapted.transformed[0]), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  adapted.dispose();
  const errors = [];
  const context = vm.createContext({ __imports: imports, exports: {}, process: { platform: process.platform, versions: {}, env: { PET_USER_DATA_DIR: profile } },
    console: { error: error => errors.push(error) }, setTimeout, clearTimeout, URL });
  new vm.Script(output, { filename }).runInContext(context);
  t.after(() => app.removeAllListeners());
  return { app, calls, ready, art, windows, counters, errors };
}

test('SIMULATED ACTUAL MAIN: duplicate exits before whenReady, SQLite, services, tray or window creation', async t => {
  const boot = simulatedMain(t, false);
  boot.ready.resolve(); boot.art.resolve();
  await flush();
  assert.deepEqual(boot.counters, { database: 0, services: 0, ready: 0, tray: 0 });
  assert.equal(boot.windows.length, 0);
  assert.deepEqual(boot.calls.at(-1), ['exit', 0]);
  assert.equal(boot.app.listenerCount('second-instance'), 0);
  assert.deepEqual(boot.errors, []);
});

test('SIMULATED ACTUAL MAIN: duplicate during async service startup waits, then focuses one original window', async t => {
  const boot = simulatedMain(t, true);
  boot.app.emit('second-instance');
  assert.equal(boot.windows.length, 0);
  boot.ready.resolve();
  await flush();
  assert.equal(boot.counters.database, 1);
  assert.equal(boot.counters.services, 1);
  boot.app.emit('second-instance');
  assert.equal(boot.windows.length, 0); // Built-in art/services are still initializing.
  boot.art.resolve();
  await flush();
  assert.deepEqual(boot.errors, []);
  assert.equal(boot.windows.length, 1);
  assert.deepEqual(boot.windows[0].actions, ['show', 'focus']);
  assert.deepEqual(boot.counters, { database: 1, services: 1, ready: 1, tray: 1 });
});

test('SIMULATED ACTUAL MAIN: a repeated launch restores a minimized main window and reuses services', async t => {
  const boot = simulatedMain(t, true);
  boot.ready.resolve(); boot.art.resolve();
  await flush();
  assert.deepEqual(boot.errors, []);
  const original = boot.windows[0];
  assert.ok(original);
  original.minimized = true;
  boot.app.emit('second-instance');
  assert.deepEqual(original.actions, ['restore', 'show', 'focus']);
  boot.app.emit('second-instance');
  assert.deepEqual(original.actions, ['restore', 'show', 'focus', 'show', 'focus']);
  assert.equal(boot.windows.length, 1);
  assert.deepEqual(boot.counters, { database: 1, services: 1, ready: 1, tray: 1 });
});
