import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, ipcMain, Menu, nativeImage, protocol, safeStorage, screen, session, Tray } from 'electron';

const require = createRequire(import.meta.url);
const runtime = resolve(dirname(fileURLToPath(import.meta.url)), '../../runtime');
if (process.platform === 'win32') app.setAppUserModelId('com.lingjing.desktop');
// Prefer canonical SQLite before legacy JSON; preserve each archive in place.
const { resolveProfilePath } = require(join(runtime, 'core/profile-path.cjs'));
app.setPath('userData', resolveProfilePath({ current: app.getPath('userData'), appData: app.getPath('appData'), override: process.env.PET_USER_DATA_DIR }));
const { openDatabase, backupLegacy } = require(join(runtime, 'core/database.cjs'));
const { createServices, discoverFeatures } = require(join(runtime, 'core/services.cjs'));
const { readQaScenario } = require(join(runtime, 'core/qa-scenario.cjs'));
const { createRuntimeCompatibility } = require(join(runtime, 'core/runtime-compat.cjs'));
const { validateIpcRequest, desktopEventAllowed } = require(join(runtime, 'core/ipc-guard.cjs'));
const { recallDesktopCompanions } = require(join(runtime, 'core/tray-recall.cjs'));
const { mainWindowDisplayProbe, fitMainWindowBounds } = require(join(runtime, 'core/main-window-geometry.cjs'));
const resourceEntry = join(runtime, 'features/resources/index.cjs');
if (existsSync(resourceEntry)) require(resourceEntry).registerResourceScheme(protocol);

let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let shuttingDown = false;
let shutdownComplete = false;
let services: any;
let features: any[] = [];
let closeToTray = true;
let compatibility: { dispose(): void } | undefined;
const companionWindows = new Map<string, BrowserWindow>();
const rendererFile = resolve(runtime, '../dist/ui/index.html');
const desktopRendererFile = resolve(runtime, '../dist/ui/desktop.html');
const preload = resolve(runtime, '../dist/preload/index.cjs');
const manifestFile = resolve(runtime, '../dist/build-manifest.json');
let build: Record<string, unknown> | undefined;
try { if (existsSync(manifestFile)) build = JSON.parse(readFileSync(manifestFile, 'utf8')); } catch { /* Older builds have no provenance manifest. */ }

function trusted(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) {
  try {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  const host = BrowserWindow.fromWebContents(event.sender);
  const desktop = [...companionWindows.values()].some(value => value === host);
  if (host !== window && !desktop) return false;
  if (process.env.ELECTRON_RENDERER_URL) return new URL(frame.url).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin;
  return frame.url.startsWith('file:') && fileURLToPath(frame.url.split('#')[0]) === (desktop ? desktopRendererFile : rendererFile);
  } catch { return false; }
}

function protect(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (url.split('#')[0] !== win.webContents.getURL().split('#')[0]) event.preventDefault();
  });
}

function load(win: BrowserWindow, route = '/companions') {
  const url = process.env.ELECTRON_RENDERER_URL;
  const desktop = route.startsWith('/desktop/');
  if (url) void win.loadURL(`${desktop ? new URL('desktop.html', url.endsWith('/') ? url : `${url}/`).href : url}#${route}`);
  else void win.loadFile(desktop ? desktopRendererFile : rendererFile, { hash: route });
}

function createWindow() {
  let restored: any = {};
  try { restored = JSON.parse(services.db.prepare('SELECT value FROM lingjing_meta WHERE key=?').get('main-window-bounds')?.value || '{}'); } catch { /* Use default geometry if older settings are invalid. */ }
  const probe = mainWindowDisplayProbe(restored);
  const area = (probe ? screen.getDisplayMatching(probe) : screen.getPrimaryDisplay()).workArea;
  const geometry = fitMainWindowBounds(restored, area);
  window = new BrowserWindow({ ...geometry,
    show: false, frame: false, backgroundColor: '#f8fbff', title: '灵境',
    icon: join(runtime, 'assets/brand/app-icon.png'),
    webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  protect(window);
  window.once('ready-to-show', () => window?.show());
  const persist = () => {
    if (services.db.open && window && !window.isDestroyed() && !window.isMinimized()) services.db.prepare('INSERT INTO lingjing_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('main-window-bounds', JSON.stringify(window.getNormalBounds()));
  };
  window.on('close', event => {
    persist();
    if (!quitting && closeToTray) { event.preventDefault(); window?.hide(); }
    else if (!quitting) { quitting = true; app.quit(); }
  });
  let geometryTimer: ReturnType<typeof setTimeout>;
  const schedule = () => { clearTimeout(geometryTimer); geometryTimer = setTimeout(persist, 400); };
  window.on('move', schedule);
  window.on('resize', schedule);
  window.on('closed', () => clearTimeout(geometryTimer));
  window.on('closed', () => { window = null; });
  load(window);
}

function emit(name: string, payload: unknown) {
  if (window && !window.isDestroyed()) window.webContents.send('lingjing:event', { name, payload });
  for (const [petId, win] of companionWindows) if (!win.isDestroyed() && desktopEventAllowed(name, payload, petId)) win.webContents.send('lingjing:event', { name, payload });
}

const windows = {
  create(petId: string, options: any = {}) {
    if (companionWindows.has(petId)) return companionWindows.get(petId);
    const win = new BrowserWindow({ width: options.width || 240, height: options.height || 280,
      ...(Number.isFinite(options.x) && Number.isFinite(options.y) ? { x: options.x, y: options.y } : {}),
      transparent: true, frame: false, resizable: false, hasShadow: false, skipTaskbar: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true, show: false, focusable: false,
      webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    companionWindows.set(petId, win);
    protect(win);
    win.once('ready-to-show', () => win.showInactive());
    win.on('closed', () => companionWindows.delete(petId));
    load(win, `/desktop/${encodeURIComponent(petId)}`);
    return win;
  },
  close(petId: string) { companionWindows.get(petId)?.close(); companionWindows.delete(petId); },
  get(petId: string) { return companionWindows.get(petId); },
  all() { return [...companionWindows.entries()]; },
  applySettings(settings: { alwaysOnTop?: boolean; clickThrough?: boolean; closeToTray?: boolean }) {
    if (typeof settings.closeToTray === 'boolean') closeToTray = settings.closeToTray;
    for (const win of companionWindows.values()) {
      if (typeof settings.alwaysOnTop === 'boolean') win.setAlwaysOnTop(settings.alwaysOnTop);
      if (typeof settings.clickThrough === 'boolean') win.setIgnoreMouseEvents(settings.clickThrough, { forward: true });
    }
  },
  showMain() { if (!window) createWindow(); window?.show(); window?.focus(); },
  emit
};

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  const userData = app.getPath('userData');
  const legacyDataFile = process.env.PET_RUNTIME_DATA_FILE || join(userData, 'pet-runtime-data.json');
  // Refuse invalid QA configuration before reading, backing up or opening saves.
  const qaScenario = readQaScenario({ userData });
  const accountContext = qaScenario ? require(join(runtime, 'features/accounts/qa-scenario.cjs')).resolveQaScenario({ userData, legacyDataFile,
    foundationScenario: qaScenario, productionDirectories: ['Lingjing', 'qingpet-desktop-runtime', 'qingpet-lord-3d'].map(name => join(app.getPath('appData'), name)) }) : null;
  const db = openDatabase(join(userData, 'lingjing.sqlite'));
  const sourceKey = `legacy-source:${legacyDataFile}`;
  const sourceMarker = db.prepare('SELECT value FROM lingjing_meta WHERE key=?').get(sourceKey);
  const legacyDataExisted = sourceMarker ? sourceMarker.value === 'existing' : existsSync(legacyDataFile);
  if (!sourceMarker) db.prepare('INSERT INTO lingjing_meta(key,value) VALUES(?,?)').run(sourceKey, legacyDataExisted ? 'existing' : 'new');
  backupLegacy(legacyDataFile);
  const legacy = createRuntimeCompatibility({ userData, legacyDataFile });
  compatibility = legacy;
  services = createServices({ db, legacy, paths: { userData, assets: join(runtime, 'assets'), legacyDataFile, legacyDataExisted }, windows, safeStorage });
  if (qaScenario) {
    services.provide('qaProfile', Object.freeze({ ...qaScenario, accountContext }));
    services.provide('qaScenario', Object.freeze({ ...qaScenario, requireIdentity() {
      const identity = services.get('qaIdentity');
      if (!identity) throw Object.assign(new Error('验收身份尚未就绪。'), { code: 'QA_IDENTITY_UNAVAILABLE' });
      return identity.requireIdentity();
    } }));
  }
  features = discoverFeatures(join(runtime, 'features'), services);
  await require(join(runtime, 'core/builtin-art.cjs')).registerBuiltinArt(services);
  if (services.get('backups') && services.get('companions')?.backupAdapter && !services.get('backups').adapters.has('companions')) services.get('backups').register(services.get('companions').backupAdapter);
  if (services.get('backups') && services.get('resources')) services.get('backups').register(require(join(runtime, 'core/resource-backup.cjs')).createResourceBackupAdapter(services));
  if (services.get('backups') && services.get('conversations')) services.get('backups').register(services.get('conversations').createBackupAdapter());
  services.ipc.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, build,
    runtime: { electron: process.versions.electron, node: process.versions.node, modules: process.versions.modules, napi: process.versions.napi, arch: process.arch,
      tray: { active: Boolean(tray && !tray.isDestroyed()), ...(tray && !tray.isDestroyed() && process.platform === 'win32' ? { bounds: tray.getBounds() } : {}) } },
    features: features.map(x => ({ id: x.id, commands: x.commands })), user: services.session.getCurrentUser(), ...(qaScenario ? { scenario: qaScenario.descriptor } : {}) }), { public: true });
  ipcMain.handle('lingjing:invoke', async (event, request) => {
    if (quitting) return { ok: false, code: 'APP_CLOSING', message: '应用正在关闭。' };
    if (!trusted(event)) return { ok: false, code: 'UNTRUSTED_SENDER', message: '请求来源无效。' };
    const desktopPetId = [...companionWindows].find(([, host]) => host.webContents === event.sender)?.[0];
    const invalid = validateIpcRequest(request, desktopPetId);
    if (invalid) return { ok: false, code: invalid, message: invalid === 'WINDOW_SCOPE_VIOLATION' ? '此窗口不能操作该功能或伙伴。' : '请求格式无效。' };
    const owner = services.session.getOwnerAccountId();
    const result = await services.invoke(request.feature, request.command, request.payload);
    if (owner !== services.session.getOwnerAccountId()) {
      for (const [id] of companionWindows) windows.close(id);
      emit('app:session', services.session.getCurrentUser());
    }
    return result;
  });
  ipcMain.on('lingjing:window', (event, action) => {
    if (!trusted(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (action === 'minimize') win?.minimize();
    if (action === 'maximize') { if (win?.isMaximized()) win.unmaximize(); else win?.maximize(); }
    if (action === 'close') win?.close();
  });
  const originalEmit = services.events.emit;
  services.events.emit = (name: string, payload: unknown) => { originalEmit(name, payload); emit(name, payload); };
  createWindow();
  const icon = nativeImage.createFromPath(join(runtime, 'assets/brand/logo-mark.png')).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip('灵境 · 桌面伙伴');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开灵境', click: windows.showMain },
    { label: '收起桌面伙伴', click: async () => {
      if (!quitting) await recallDesktopCompanions(services, randomUUID());
    } },
    { type: 'separator' }, { label: '退出灵境', click: () => { quitting = true; app.quit(); } }
  ]));
  tray.on('double-click', windows.showMain);
  app.on('activate', windows.showMain);
}).catch(error => { console.error(error); app.exit(1); });

app.on('before-quit', event => {
  if (shutdownComplete) return;
  event.preventDefault();
  if (shuttingDown) return;
  shuttingDown = true;
  quitting = true;
  const dispose = async () => {
    for (const feature of [...features].reverse()) {
      try { await feature.dispose?.(); } catch { console.error('[shutdown]', { feature: feature.id, code: 'DISPOSE_FAILED' }); }
    }
    compatibility?.dispose();
  };
  void Promise.race([dispose(), new Promise<void>(done => setTimeout(done, 4000))]).finally(() => {
    if (services?.db?.open) services.db.close();
    tray?.destroy(); shutdownComplete = true; app.quit();
  });
});
app.on('window-all-closed', () => { /* Tray and independent companion windows remain alive. */ });
