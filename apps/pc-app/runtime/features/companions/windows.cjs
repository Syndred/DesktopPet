const { atomic, CompanionError } = require('./service.cjs');
const { randomUUID } = require('node:crypto');

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

function placeDesktopWindow(window, pet, screen, position) {
  const bounds = boundsFor(pet, screen, position);
  // Electron setPosition reads GetSize() and feeds the native rounded size back
  // into SetBounds. Transparent Windows at fractional DPI grow on every move.
  // Always supply the original saved scale in DIP; never derive size from getBounds.
  window.setBounds({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, false);
  return bounds;
}

function persistLocalDesktopPosition({ entry, service, bounds, displayId, changed }) {
  const committed = atomic(service.db, () => {
    const pet = service.requirePet(entry.owner, entry.pet.petId);
    const previous = pet.desktop.position;
    const moved = previous.x !== bounds.x || previous.y !== bounds.y || previous.displayId !== displayId;
    if (moved) {
      pet.desktop.position = { x: bounds.x, y: bounds.y, displayId };
      service.storePet(pet);
      service.db.prepare('UPDATE companion_accounts SET revision = revision + 1 WHERE owner_account_id = ?').run(entry.owner);
      entry.pet = pet;
    }
    // Do not rewrite stationary saved coordinates for Windows fractional-DPI rounding on every restart.
    entry.positionDirty = false;
    return moved;
  });
  // The renderer caches per-pet CAS revisions. Publish only after the SQLite
  // savepoint commits; otherwise natural movement silently leaves an open UI stale.
  if (committed) changed(entry.owner);
  return committed;
}

/** Window policy belongs to foundation/accounts; the same React/Pixi resource stage renders every 2D pet. */
function createDesktopWindowManager({ services, service, ensureImported, changed }) {
  const { screen } = require('electron');
  if (!services.windows?.create) throw new Error('Companions require the foundation desktop window adapter');
  const entries = new Map();
  let owner = null; let disposed = false; let syncing = false; let quiet = false; let animationsAllowed = true;
  const notifyWindows = () => services.events.emit('companions:windows-changed', { ownerAccountId: owner });

  function persistPosition(entry,force=false) {
    if (!entry.positionDirty || entry.window.isDestroyed() || services.session.getOwnerAccountId() !== entry.owner) return;
    const bounds = entry.window.getBounds();
    const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
    const companions=services.get('companions');
    if(companions?.isCloudOwner?.(entry.owner)){
      if(entry.positionPromise&&!force)return entry.positionPromise;
      const position=entry.desiredPosition||{x:bounds.x,y:bounds.y,displayId:String(display.id)};
      const pending={actionId:'desktop-position-'+randomUUID(),petId:entry.pet.petId,position};
      const promise=Promise.resolve(companions.persistDesktopPosition(entry.owner,pending)).then(result=>{
        if(!entry.window.isDestroyed()){
          const desired=entry.desiredPosition||entry.window.getBounds();
          if(desired.x===pending.position.x&&desired.y===pending.position.y){entry.positionDirty=false;entry.desiredPosition=null;}
          else{placeDesktopWindow(entry.window,entry.pet,screen,desired);entry.positionDirty=true;}
          entry.pet=service.readPet(entry.owner,entry.pet.petId);
        }
        return result;
      }).catch(error=>{
        if(['SYNC_CONFLICT','REVISION_CONFLICT','ACTION_ID_CONFLICT','ACTION_ID_REUSED'].includes(error.code)&&entry.positionPromise===promise){
          entry.positionDirty=false;entry.desiredPosition=null;
          if(!entry.window.isDestroyed()){entry.pet=service.requirePet(entry.owner,entry.pet.petId);placeDesktopWindow(entry.window,entry.pet,screen);}
        }
        throw error;
      }).finally(()=>{if(entry.positionPromise===promise)entry.positionPromise=null;});
      entry.positionPromise=promise;return promise;
    }
    return persistLocalDesktopPosition({ entry, service, bounds, displayId: String(display.id), changed });
  }
  function destroy(entry, persist = true) {
    if (entry.window.isDestroyed()) return;
    if (persist) {const result=persistPosition(entry,true);if(result?.then)void result.catch(error=>console.warn('[companions:position-pending]',error.code));}
    entry.window.destroy();
  }
  function create(pet) {
    const bounds = boundsFor(pet, screen);
    const window = services.windows.create(pet.petId, { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
    const entry = { window, pet, owner: pet.ownerAccountId, drag: null, tick: 0,
      // A second device may clamp a restored position to its own monitors.
      // Persist only actual drag/movement, never overwrite the original on open.
      positionDirty: false };
    entries.set(pet.petId, entry);
    window.setIgnoreMouseEvents(true, { forward: true });
    // Use movement's canonical geometry before the first show, without persisting it.
    placeDesktopWindow(window, pet, screen, bounds);
    window.on('closed', () => { if (entries.get(pet.petId) === entry) entries.delete(pet.petId); notifyWindows(); });
    window.once('ready-to-show', () => {
      if (services.session.getOwnerAccountId() !== entry.owner) destroy(entry, false);
      else notifyWindows();
    });
    return entry;
  }
  function sync() {
    if (disposed || syncing) return;
    syncing = true;
    try {
      const current = services.session.getOwnerAccountId();
      if (current !== owner) {
        for (const entry of [...entries.values()]) destroy(entry, false); owner = current;
        if (owner && services.get('accounts')?.settings) animationsAllowed = services.get('accounts').settings(owner).document.desktop.animationsEnabled !== false;
      }
      if (!owner) return;
      ensureImported(owner);
      // Historical unsupported appearances remain in storage, never opened by this 2D release.
      const companions=services.get('companions');
      const pets = companions?.hasPendingRecallAll?.(owner)?[]:(companions?.isCloudOwner?.(owner)?companions.listPets(owner):service.snapshot(owner).data.pets).filter(pet => pet.desktop.visible && pet.resource.kind === '2d');
      const ids = new Set(pets.map(pet => pet.petId));
      for (const [id, entry] of entries) if (!ids.has(id)) destroy(entry);
      for (const pet of pets) {
        const entry = entries.get(pet.petId);
        if (!entry) { create(pet); continue; }
        // A verified full-save replacement can restore a different device's
        // state with the same per-pet revision. Reconcile the saved content too.
        if (JSON.stringify(entry.pet) !== JSON.stringify(pet)) {
          const previous = entry.pet; entry.pet = pet;
          if (!entry.drag && (previous.desktop.scale !== pet.desktop.scale || JSON.stringify(previous.desktop.position) !== JSON.stringify(pet.desktop.position))) {
            if(entry.positionDirty||entry.positionPromise){
              if(previous.desktop.scale!==pet.desktop.scale)placeDesktopWindow(entry.window,pet,screen,entry.desiredPosition||entry.window.getBounds());
              continue;
            }
            placeDesktopWindow(entry.window,pet,screen);
            // Applying a saved/cloud position only derives local window bounds.
            // Its monitor clamp must not become another device's saved position.
            entry.positionDirty = false;
          }
        }
      }
    } catch (error) { console.error('[companions:desktop-sync]', error); }
    finally { syncing = false; }
  }
  async function handleInput(ownerAccountId, input) {
    const entry = entries.get(input?.petId);
    if (!entry || entry.owner !== ownerAccountId || ownerAccountId !== services.session.getOwnerAccountId() || entry.window.isDestroyed()) throw new CompanionError('PET_NOT_FOUND', '这只伙伴不在当前账号的桌面');
    const point = () => {
      // Preserve the event-time cursor and grab offset even when IPC is delayed.
      if (!Number.isFinite(input.screenX) || !Number.isFinite(input.screenY) || Math.abs(input.screenX) > 100000 || Math.abs(input.screenY) > 100000) throw new CompanionError('INVALID_INPUT', '拖拽位置无效');
      return { x: input.screenX, y: input.screenY };
    };
    if (input.action === 'hit' || input.action === 'miss') entry.window.setIgnoreMouseEvents(input.action === 'miss', { forward: true });
    else if (input.action === 'drag-start') entry.drag = { cursor: point(), bounds: entry.window.getBounds() };
    else if (input.action === 'drag-move' && entry.drag) {
      const cursor = point();
      const bounds = placeDesktopWindow(entry.window, entry.pet, screen, { x: entry.drag.bounds.x + cursor.x - entry.drag.cursor.x, y: entry.drag.bounds.y + cursor.y - entry.drag.cursor.y, displayId: null });
      entry.positionDirty = true;
      entry.desiredPosition={x:bounds.x,y:bounds.y,displayId:bounds.displayId};
    } else if (input.action === 'drag-end') { entry.drag = null;await persistPosition(entry,true);if(entry.positionDirty)await persistPosition(entry);changed(ownerAccountId); }
    else if (input.action !== 'drag-move') throw new CompanionError('INVALID_INPUT', '不支持的桌面输入');
    return { ok: true, data: { petId: input.petId } };
  }
  const motionTimer = setInterval(() => {
    if (disposed || quiet || !animationsAllowed) return;
    const currentOwner = services.session.getOwnerAccountId();
    for (const entry of entries.values()) {
      if (entry.owner !== currentOwner) { sync(); break; }
      if (entry.drag || entry.window.isDestroyed() || !entry.window.isVisible()) continue;
      const conversations = services.get('conversations');
      if (conversations?.isChatting(entry.owner, entry.pet.petId) && conversations.getProfile(entry.owner, entry.pet.petId)?.pauseWhileChatting) continue;
      const mode = entry.pet.desktop.behavior;
      if (mode !== 'wander' && mode !== 'follow') continue;
      const bounds = entry.window.getBounds(); let x = bounds.x; let y = bounds.y;
      if (mode === 'follow') {
        const cursor = screen.getCursorScreenPoint(); const dx = cursor.x - (x + bounds.width / 2); const dy = cursor.y - (y + bounds.height / 2);
        if (Math.hypot(dx, dy) < 150) continue;
        x += Math.round(Math.sign(dx) * Math.min(4, Math.abs(dx) / 20)); y += Math.round(Math.sign(dy) * Math.min(4, Math.abs(dy) / 20));
      } else { entry.tick += 1; const seed = [...entry.pet.petId].reduce((sum, char) => sum + char.charCodeAt(0), 0); x += Math.sin((entry.tick + seed) / 90) >= 0 ? 2 : -2; }
      const target = placeDesktopWindow(entry.window, entry.pet, screen, { x, y, displayId: null });
      entry.positionDirty = true;entry.desiredPosition={x:target.x,y:target.y,displayId:target.displayId};
    }
  }, 100);
  const syncTimer = setInterval(sync, 800);
  const saveTimer = setInterval(() => { for (const entry of entries.values()) if (!entry.drag) { try {const result=persistPosition(entry);if(result?.then)void result.catch(error=>console.warn('[companions:position-pending]',error.code));} catch (error) { console.error('[companions:save-position]', error); } } }, 5000);
  const stopPolicy = services.events.on('accounts:behavior', policy => { quiet = Boolean(policy?.quiet || policy?.fullscreen); animationsAllowed = policy?.settings?.desktop?.animationsEnabled !== false; });
  for (const timer of [motionTimer, syncTimer, saveTimer]) timer.unref();
  return { sync, handleInput,
    inspect: () => [...entries.values()].map(entry => {
      const bounds=entry.window.getBounds();const display=screen.getDisplayMatching(bounds);const expected=boundsFor(entry.pet,screen);
      return { petId: entry.pet.petId, ownerAccountId: entry.owner, windowId: entry.window.id, bounds, visible: entry.window.isVisible(),
        geometry: { units: 'DIP', savedScale: entry.pet.desktop.scale, logicalSize: {width:expected.width,height:expected.height},
          displayId:String(display.id),displayScaleFactor:display.scaleFactor,contentBounds:entry.window.getContentBounds(),zoomFactor:entry.window.webContents.getZoomFactor() } };
    }),
    dispose() { disposed = true; stopPolicy(); for (const timer of [motionTimer, syncTimer, saveTimer]) clearInterval(timer); for (const entry of [...entries.values()]) destroy(entry); }
  };
}
module.exports = { createDesktopWindowManager, boundsFor, placeDesktopWindow, persistLocalDesktopPosition };
