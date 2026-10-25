const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { join, resolve, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const { CompanionsService } = require('../service.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const { createCompanionBackupAdapter } = require('../backup.cjs');
const { migrations } = require('../../accounts/schema.cjs');
const { defaultSettings } = require('../../accounts/settings.cjs');
const { createServices } = require('../../../core/services.cjs');
const { projectDesktopDisplay } = require('../desktop-display.cjs');

// Execute actual host allocation and IPC/list code; native windows, native
// fullscreen detection and processes are explicit doubles. No Electron starts.
function loadSource(file, overrides, globals = {}) {
  const module = { exports: {} }, localRequire = createRequire(file);
  vm.runInNewContext(readFileSync(file, 'utf8'), { module, exports: module.exports, __dirname: dirname(file), Buffer, console,
    process: { platform: 'win32', env: { SystemRoot: 'C:\\Windows' }, versions: {}, type: 'fixture' },
    setInterval, clearInterval, queueMicrotask,
    require(name) { return Object.hasOwn(overrides, name) ? overrides[name] : localRequire(name); }, ...globals
  }, { filename: file });
  return module.exports;
}
const displayFile = resolve(__dirname, '../../../../ui/src/features/companions/desktop-display.ts');
const displayExports = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync(displayFile, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: displayExports, exports: displayExports.exports });
const { desktopSummary, desktopPresentation } = displayExports.exports;

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-desktop-display-')), file = join(directory, 'state.sqlite');
  const db = new DatabaseSync(file); migrations.forEach(migration => db.exec(migration.sql)); migrateCompanions(db);
  const owner = 'qa_desktop_display_a', foreign = 'qa_desktop_display_b', settings = defaultSettings();
  settings.desktop.companionLimit = 4; settings.notifications.quietEnabled = false;
  const raw = new CompanionsService({ db });
  for (const who of [owner, foreign]) {
    db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(who, 'runtime', who, who, who, '原账号', '2026-10-26', '2026-10-26');
    db.prepare('INSERT INTO account_settings VALUES(?,?,?,?)').run(who, 0, JSON.stringify(settings), '2026-10-26');
  }
  const pets = [0, 1, 2, 3, 4].map(index => raw.adopt(owner, { actionId: `original-adopt-${index}`, templateId: 'animal-white-fox', name: `原昵称${index}`, showOnDesktop: true }).data.pet);
  raw.adopt(foreign, { actionId: 'foreign-adopt', templateId: 'animal-white-fox', name: '其他账号', showOnDesktop: true });
  for (const who of [owner, foreign]) db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-26', who);
  const reader = new DatabaseSync(file, { readOnly: true }); reader.exec('PRAGMA query_only=ON');
  const backup = createCompanionBackupAdapter(db), original = new Map([owner, foreign].map(who => [who, JSON.stringify(backup.export(who))]));
  const accountRows = JSON.stringify(db.prepare('SELECT * FROM account_settings ORDER BY owner_account_id').all());
  let currentOwner = owner;
  const services = createServices({ db, legacy: {}, paths: { userData: directory }, windows: {} });
  const policies = []; services.events.on('accounts:behavior', value => policies.push(value));
  services.session.setAdapter({ getCurrentUser: () => ({ id: currentOwner }) });
  const app = new EventEmitter(), windows = new Map();
  class WindowDouble extends EventEmitter {
    constructor(id, pet) { super(); this.id = id; this.pet = pet; this.visible = true; this.destroyed = false; }
    setIgnoreMouseEvents() {} setAlwaysOnTop(value) { this.topmost = value; }
    isAlwaysOnTop() { return Boolean(this.topmost); } isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; } isFullScreen() { return false; } isFocused() { return false; }
    hide() { this.visible = false; } showInactive() { this.visible = true; }
    getBounds() { return { width: 230, height: 280 }; }
  }
  // This is intentionally not the SQL/pet array order.
  for (const [index, petIndex] of [4, 1, 3, 0, 2].entries()) windows.set(pets[petIndex].petId, new WindowDouble(index + 4, pets[petIndex]));
  services.windows.all = () => [...windows];
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.killed = false; child.kill = () => { child.killed = true; };
  const hostFile = resolve(__dirname, '../../accounts/desktop-host.cjs');
  const { createDesktopHost } = loadSource(hostFile, {
    'node:child_process': { spawn: () => child }, './startup.cjs': { createLoginItemController: () => ({ apply() {}, status: () => false }) }
  });
  const host = createDesktopHost(services, { app, BrowserWindow: {
    fromId: id => [...windows.values()].find(window => window.id === id), getAllWindows: () => [...windows.values()]
  }, session: { defaultSession: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} } } });
  const manager = { sync() {}, dispose() {}, inspect: () => [...windows.values()].map(window => ({
    ownerAccountId: owner, petId: window.pet.petId, windowId: window.id
  })) };
  services.provide('accounts', { host, identity: who => ({ provider: 'runtime', subject_id: who }),
    privateSession: () => ({ ownerAccountId: currentOwner, authKind: 'runtime' }) });
  const resources = { ready: Promise.resolve() }; services.provide('resources', resources);
  const indexFile = resolve(__dirname, '../index.cjs');
  const feature = loadSource(indexFile, { './windows.cjs': { createDesktopWindowManager: () => manager } },
    { process: { versions: { electron: 'explicit-fixture-only' }, type: 'browser' } }).register(services);
  for (const [name, handler] of Object.entries(feature.commands)) services.ipc.handle(`companions:${name}`, handler);
  await host.apply(settings);
  const snapshot = async () => { const result = await services.invoke('companions', 'list'); assert.equal(result.ok, true); return result.data; };
  function unchanged() {
    for (const who of [owner, foreign]) {
      assert.equal(JSON.stringify(backup.export(who)), original.get(who));
      assert.equal(JSON.stringify(createCompanionBackupAdapter(reader).export(who)), original.get(who));
    }
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM account_settings ORDER BY owner_account_id').all()), accountRows);
  }
  t.after(() => {
    feature.dispose(); host.dispose(); unchanged();
    const hash = value => createHash('sha256').update(value).digest('hex');
    console.log('DESKTOP_DISPLAY_SQLITE ' + JSON.stringify({ owners: 2, before: [...original.values()].map(hash), after: [owner, foreign].map(who => hash(JSON.stringify(backup.export(who)))), settingsBytesUnchanged: true, queryOnlyReadback: true, nativeWindowStarted: false, processStarted: false }));
    reader.close(); db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('lingjing-desktop-display-')); rmSync(directory, { recursive: true, force: true });
  });
  return { owner, foreign, pets, windows, settings, host, child, services, resources, manager, snapshot, unchanged, policies, switchOwner: value => { currentOwner = value; } };
}

test('actual Main allocation order binds per-pet state and never stores the runtime sibling', async t => {
  const f = await fixture(t), data = await f.snapshot(), summary = desktopSummary(data);
  assert.equal(summary.enabled, 5); assert.equal(summary.visible.length, 4); assert.equal(summary.countLabel, '4');
  assert.equal(f.host.status().companionWindows, 5);
  assert.deepEqual(summary.visible.map(pet => pet.petId).sort(), [f.pets[4], f.pets[1], f.pets[3], f.pets[0]].map(pet => pet.petId).sort());
  assert.equal(desktopPresentation(data, f.pets[2]).state, 'waiting');
  assert.equal(desktopPresentation(data, f.pets[4]).state, 'visible');
  assert.ok(data.pets.every(pet => pet.desktop.visible && !Object.hasOwn(pet, 'desktopDisplay'))); f.unchanged();
});

test('limit changes and simulated native fullscreen report actual zero without closing preferences or inventing chat reasons', async t => {
  const f = await fixture(t); f.settings.desktop.companionLimit = 1; await f.host.apply(f.settings);
  let data = await f.snapshot(); assert.equal(desktopSummary(data).visible.length, 1);
  assert.equal(data.desktopDisplay.pets.filter(pet => pet.state === 'waiting').length, 4);
  f.child.stdout.emit('data', Buffer.from('true\n')); data = await f.snapshot();
  assert.equal(desktopSummary(data).countLabel, '0'); assert.equal(desktopSummary(data).enabled, 5);
  assert.equal(data.desktopDisplay.pets.filter(pet => pet.reason === 'fullscreen').length, 1);
  assert.ok(data.pets.every(pet => pet.desktop.visible));
  f.child.stdout.emit('data', Buffer.from('false\n')); data = await f.snapshot(); assert.equal(desktopSummary(data).countLabel, '1');
  const assigned = [...f.windows.values()][0], priorPolicy = f.policies.at(-1); assigned.hide();
  f.services.events.emit('companions:windows-changed', { ownerAccountId: f.owner }); data = await f.snapshot();
  assert.equal(f.policies.at(-1).companionLimit, priorPolicy.companionLimit);
  assert.equal(f.policies.at(-1).fullscreen, priorPolicy.fullscreen);
  assert.notEqual(f.policies.at(-1).desktopDisplayFingerprint, priorPolicy.desktopDisplayFingerprint);
  const hidden = data.desktopDisplay.pets.find(pet => pet.petId === assigned.pet.petId);
  assert.equal(hidden.state, 'hidden'); assert.equal(hidden.reason, null); f.unchanged();
});

test('closing a preceding handle promotes the actual waiting window using the existing host event and order', async t => {
  const f = await fixture(t), waiting = f.windows.get(f.pets[2].petId);
  assert.equal(waiting.isVisible(), false);
  const first = f.windows.keys().next().value; f.windows.delete(first);
  f.services.events.emit('companions:windows-changed', { ownerAccountId: f.owner });
  assert.equal(waiting.isVisible(), true);
  const data = await f.snapshot(); assert.equal(desktopPresentation(data, f.pets[2]).state, 'visible');
  assert.equal(desktopPresentation(data, f.pets[4]).state, 'unknown'); assert.equal(desktopSummary(data).enabled, 5); f.unchanged();
});

test('foreign window/host metadata and absent runtime state cannot supply a requested or guessed count', async t => {
  const f = await fixture(t), data = await f.snapshot();
  const foreignHost = { ...f.host.status(), ownerAccountId: f.foreign };
  data.desktopDisplay = projectDesktopDisplay({ ownerAccountId: f.owner, currentOwnerAccountId: f.owner, pets: data.pets, windows: f.manager.inspect(), host: foreignHost });
  assert.equal(data.desktopDisplay.available, false); assert.equal(desktopSummary(data).countLabel, '待确认');
  assert.equal(desktopPresentation(data, f.pets[0]).state, 'unknown');
  const wrongWindows = f.manager.inspect().map(window => ({ ...window, ownerAccountId: f.foreign }));
  data.desktopDisplay = projectDesktopDisplay({ ownerAccountId: f.owner, currentOwnerAccountId: f.owner, pets: data.pets, windows: wrongWindows, host: f.host.status() });
  assert.ok(data.desktopDisplay.pets.every(pet => pet.state === 'unknown')); f.unchanged();
});

test('actual IPC list refuses a stale owner after the existing asynchronous resource boundary', async t => {
  const f = await fixture(t); let release; f.resources.ready = new Promise(resolve => { release = resolve; });
  const pending = f.services.invoke('companions', 'list'); f.switchOwner(f.foreign); release();
  const result = await pending; assert.equal(result.ok, false); assert.equal(result.code, 'SESSION_CHANGED');
  assert.equal(Object.hasOwn(result, 'desktopDisplay'), false); f.unchanged();
});
