const { join, resolve, relative, isAbsolute } = require('node:path');
const { pathToFileURL } = require('node:url');
const { existsSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { atomic } = require('./service.cjs');

function boundsFor(pet, screen, previous) {
  const width = Math.round(230 * pet.desktop.scale);
  const height = Math.round(280 * pet.desktop.scale);
  const position = previous || pet.desktop.position;
  const displays = screen.getAllDisplays();
  const display = displays.find(item => String(item.id) === position.displayId)
    || screen.getDisplayNearestPoint({ x: position.x, y: position.y }) || screen.getPrimaryDisplay();
  const area = display.workArea;
  return { x: Math.round(Math.min(Math.max(position.x, area.x), Math.max(area.x, area.x + area.width - width))),
    y: Math.round(Math.min(Math.max(position.y, area.y), Math.max(area.y, area.y + area.height - height))), width, height, displayId: String(display.id) };
}

function safeLegacyModel(services, ref) {
  if (!ref?.legacyModel) return null;
  const assetRoot = resolve(services.paths.assets);
  // Old references are relative to runtime/renderer, e.g. ../assets/models/Fox.glb.
  const file = resolve(assetRoot, '..', 'renderer', ref.legacyModel);
  const rel = relative(assetRoot, file);
  if (isAbsolute(rel) || rel.startsWith('..') || !/\.(glb|gltf)$/i.test(file) || !existsSync(file)) return null;
  return { kind: 'model', url: pathToFileURL(file).href, name: '保留的 3D 角色' };
}

function createDesktopWindowManager({ services, service, ensureImported, changed }) {
  const { BrowserWindow, ipcMain, screen } = require('electron');
  const entries = new Map();
  const channel = `lingjing:companion-desktop:${randomUUID()}`;
  let owner = null;
  let disposed = false;
  let syncing = false;

  function persistPosition(entry) {
    if (entry.window.isDestroyed() || services.session.getOwnerAccountId() !== entry.owner) return;
    const bounds = entry.window.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    atomic(service.db, () => {
      const pet = service.requirePet(entry.owner, entry.pet.petId);
      const previous = pet.desktop.position;
      if (previous.x === bounds.x && previous.y === bounds.y && previous.displayId === String(display.id)) return;
      pet.desktop.position = { x: bounds.x, y: bounds.y, displayId: String(display.id) };
      service.storePet(pet);
      service.db.prepare('UPDATE companion_accounts SET revision = revision + 1 WHERE owner_account_id = ?').run(entry.owner);
      entry.pet = pet;
    });
  }

  function destroy(entry, persist = true) {
    if (entry.window.isDestroyed()) return;
    if (persist) persistPosition(entry);
    entry.window.destroy();
  }

  async function resourceFor(pet) {
    const resources = services.get('resources');
    if (resources?.resolveForPet) return await resources.resolveForPet(pet.ownerAccountId, pet);
    if (resources?.resolveResource) return await resources.resolveResource(pet.ownerAccountId, pet.resource);
    if (resources?.resolve && resources?.assetFile) {
      const action = pet.desktop.behavior === 'sleep' ? 'sleep' : ['wander', 'follow'].includes(pet.desktop.behavior) ? 'walk' : 'idle';
      // Invoke the registered command to wait for resources' asynchronous seed.
      const response = await services.invoke('resources', 'resolve', { resourceId: pet.resource.resourceId, petId: pet.petId, context: 'desktop', action });
      if (!response.ok) throw Object.assign(new Error(response.message), { code: response.code });
      const display = response.data;
      if (display.resource.availability !== 'ready') return null;
      const file = await resources.assetFile(pet.ownerAccountId, display.resource.id, display.resource.entryAsset);
      return { kind: display.resource.kind === 'model3d' ? 'model' : 'spritesheet', url: pathToFileURL(file).href,
        sheet: display.resource.sheet, clip: display.clip, calibration: display.calibration, resourceRevision: display.resource.revision };
    }
    return safeLegacyModel(services, pet.resource);
  }

  function create(pet) {
    const bounds = boundsFor(pet, screen);
    const window = new BrowserWindow({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
      alwaysOnTop: true, skipTaskbar: true, resizable: false, maximizable: false,
      focusable: false, show: false,
      webPreferences: { preload: join(__dirname, 'desktop-preload.cjs'),
        additionalArguments: [`--companion-channel=${channel}`], contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    const entry = { window, pet, owner: pet.ownerAccountId, drag: null, lastBounds: bounds, tick: 0 };
    entries.set(pet.petId, entry);
    window.setIgnoreMouseEvents(true, { forward: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.on('closed', () => entries.delete(pet.petId));
    window.once('ready-to-show', () => {
      if (services.session.getOwnerAccountId() === entry.owner && !window.isDestroyed()) window.showInactive();
      else destroy(entry, false);
    });
    window.loadFile(join(__dirname, 'desktop.html'));
    return entry;
  }

  function sync() {
    if (disposed || syncing) return;
    syncing = true;
    try {
      const current = services.session.getOwnerAccountId();
      if (current !== owner) {
        for (const entry of [...entries.values()]) destroy(entry, false);
        owner = current;
      }
      if (!owner) return;
      ensureImported(owner);
      const pets = service.snapshot(owner).data.pets.filter(pet => pet.desktop.visible);
      const ids = new Set(pets.map(pet => pet.petId));
      for (const [id, entry] of entries) if (!ids.has(id)) destroy(entry);
      for (const pet of pets) {
        const entry = entries.get(pet.petId);
        if (!entry) { create(pet); continue; }
        if (entry.pet.revision !== pet.revision) {
          const previous = entry.pet;
          entry.pet = pet;
          if (previous.desktop.scale !== pet.desktop.scale || JSON.stringify(previous.desktop.position) !== JSON.stringify(pet.desktop.position)) {
            const bounds = boundsFor(pet, screen);
            entry.window.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, false);
            entry.lastBounds = bounds;
          }
          entry.window.webContents.send('companions:desktop-changed');
        }
      }
    } catch (error) { console.error('[companions:desktop-sync]', error); }
    finally { syncing = false; }
  }

  ipcMain.handle(channel, async (event, command, payload) => {
    const entry = [...entries.values()].find(candidate => candidate.window.webContents === event.sender);
    if (!entry || event.senderFrame !== event.sender.mainFrame || entry.owner !== services.session.getOwnerAccountId()) return { ok: false, code: 'AUTH_REQUIRED', message: '当前伙伴已离开此账号的桌面' };
    const petId = entry.pet.petId;
    try {
      if (command === 'snapshot') {
        const pet = service.requirePet(entry.owner, petId);
        const resource = await resourceFor(pet);
        if (services.session.getOwnerAccountId() !== entry.owner) return { ok: false, code: 'AUTH_REQUIRED', message: '账号已切换' };
        let modelViewerModule = null;
        try { modelViewerModule = pathToFileURL(require.resolve('@google/model-viewer/dist/model-viewer.min.js')).href; } catch { /* clearly surfaced by the desktop renderer */ }
        return { ok: true, data: { pet, resource, modelViewerModule } };
      }
      if (command === 'hit' || command === 'miss') { entry.window.setIgnoreMouseEvents(command === 'miss', { forward: true }); return { ok: true }; }
      const eventPoint = () => {
        if (payload && Number.isFinite(payload.screenX) && Number.isFinite(payload.screenY) && Math.abs(payload.screenX) <= 100000 && Math.abs(payload.screenY) <= 100000) return { x: payload.screenX, y: payload.screenY };
        return screen.getCursorScreenPoint();
      };
      if (command === 'drag-start') { entry.drag = { cursor: eventPoint(), bounds: entry.window.getBounds() }; return { ok: true }; }
      if (command === 'drag-move' && entry.drag) {
        const cursor = eventPoint();
        const position = { x: entry.drag.bounds.x + cursor.x - entry.drag.cursor.x, y: entry.drag.bounds.y + cursor.y - entry.drag.cursor.y, displayId: null };
        const bounds = boundsFor(entry.pet, screen, position);
        entry.window.setPosition(bounds.x, bounds.y, false);
        entry.lastBounds = bounds;
        return { ok: true };
      }
      if (command === 'drag-end') { entry.drag = null; persistPosition(entry); changed(entry.owner); return { ok: true }; }
      if (command === 'recall' || command === 'interact') {
        const input = { petId, actionId: randomUUID() };
        const result = command === 'recall' ? service.updateDesktop(entry.owner, { ...input, visible: false }) : service.interact(entry.owner, input);
        changed(entry.owner);
        return result;
      }
      return { ok: false, code: 'INVALID_INPUT', message: '不支持的桌面操作' };
    } catch (error) { return { ok: false, code: error.code || 'INTERNAL_ERROR', message: error.message }; }
  });

  const motionTimer = setInterval(() => {
    if (disposed) return;
    const currentOwner = services.session.getOwnerAccountId();
    for (const entry of entries.values()) {
      if (entry.owner !== currentOwner) { sync(); break; }
      if (entry.drag || entry.window.isDestroyed()) continue;
      const mode = entry.pet.desktop.behavior;
      if (mode !== 'wander' && mode !== 'follow') continue;
      const bounds = entry.window.getBounds();
      let x = bounds.x; let y = bounds.y;
      if (mode === 'follow') {
        const cursor = screen.getCursorScreenPoint();
        const dx = cursor.x - (x + bounds.width / 2); const dy = cursor.y - (y + bounds.height / 2);
        if (Math.hypot(dx, dy) < 150) continue;
        x += Math.round(Math.sign(dx) * Math.min(4, Math.abs(dx) / 20));
        y += Math.round(Math.sign(dy) * Math.min(4, Math.abs(dy) / 20));
      } else {
        entry.tick += 1;
        const seed = [...entry.pet.petId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
        x += Math.sin((entry.tick + seed) / 90) >= 0 ? 2 : -2;
      }
      const target = boundsFor(entry.pet, screen, { x, y, displayId: null });
      entry.window.setPosition(target.x, target.y, false);
      entry.lastBounds = target;
    }
  }, 100);
  const syncTimer = setInterval(sync, 800);
  const saveTimer = setInterval(() => {
    for (const entry of entries.values()) if (!entry.drag) {
      try { persistPosition(entry); } catch (error) { console.error('[companions:save-position]', error); }
    }
  }, 5000);
  for (const timer of [motionTimer, syncTimer, saveTimer]) timer.unref();

  return {
    sync,
    inspect: () => [...entries.values()].map(entry => ({ petId: entry.pet.petId, ownerAccountId: entry.owner, windowId: entry.window.id, bounds: entry.window.getBounds(), visible: entry.window.isVisible() })),
    dispose() {
      disposed = true;
      for (const timer of [motionTimer, syncTimer, saveTimer]) clearInterval(timer);
      ipcMain.removeHandler(channel);
      for (const entry of [...entries.values()]) destroy(entry);
    }
  };
}
module.exports = { createDesktopWindowManager, boundsFor };
