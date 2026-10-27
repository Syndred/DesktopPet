/** Await the domain command; this host never changes companion progress or intents. */
async function recallDesktopCompanions(services, actionId) {
  let owner; let changed = false; const disposers = [];
  try {
    owner = services.session.getOwnerAccountId();
    if (!owner) return { ok: false, code: 'AUTH_REQUIRED' };
    for (const event of ['accounts:session-changed', 'session:changed', 'auth:changed']) {
      const dispose = services.events.on?.(event, () => { changed = true; }); if (dispose) disposers.push(dispose);
    }
    const companions = services.get('companions');
    const windows = companions.getDesktopWindows().filter(entry => entry.ownerAccountId === owner);
    const result = await companions.recallAll(owner, actionId);
    if (changed || services.session.getOwnerAccountId() !== owner) return { ok: false, code: 'SESSION_CHANGED' };
    if (result?.ok !== true) throw new Error('Recall not confirmed');
    const closed = [];
    for (const entry of windows) {
      if (changed || services.session.getOwnerAccountId() !== owner) return { ok: false, code: 'SESSION_CHANGED' };
      const window = services.windows.get(entry.petId);
      // An account switch/reopen can replace a window while the command is pending.
      if (!window || window.id !== entry.windowId || window.isDestroyed()) continue;
      services.windows.close(entry.petId); closed.push(entry.petId);
    }
    return { ok: true, closed };
  } catch {
    try {
      if (owner && !changed && services.session.getOwnerAccountId() === owner) {
        services.events.emit('accounts:host-warning', { code: 'COMPANION_RECALL_UNCONFIRMED', operation: 'recall-all' });
      }
    } catch { /* A failed warning listener must not reject the native menu callback. */ }
    return { ok: false, code: 'COMPANION_RECALL_UNCONFIRMED' };
  } finally { for (const dispose of disposers) dispose(); }
}
/** Persist device-local visibility intent only. The existing manager applies limits and focus policy. */
async function showDesktopCompanions(services, actionId) {
  let owner; let changed = false; const disposers = [];
  try {
    owner = services.session.getOwnerAccountId();
    if (!owner) return { ok: false, code: 'AUTH_REQUIRED' };
    for (const event of ['accounts:session-changed', 'session:changed', 'auth:changed']) {
      const dispose = services.events.on?.(event, () => { changed = true; }); if (dispose) disposers.push(dispose);
    }
    const result = await services.get('companions').showAll(owner, actionId);
    if (changed || services.session.getOwnerAccountId() !== owner) return { ok: false, code: 'SESSION_CHANGED' };
    if (result?.ok !== true) throw new Error('Show not confirmed');
    return { ok: true, requested: result.data?.shown || [] };
  } catch {
    try { if (owner && !changed && services.session.getOwnerAccountId() === owner) services.events.emit('accounts:host-warning', { code: 'COMPANION_SHOW_UNCONFIRMED', operation: 'show-all' }); } catch { /* No private error leaves the host. */ }
    return { ok: false, code: 'COMPANION_SHOW_UNCONFIRMED' };
  } finally { for (const dispose of disposers) dispose(); }
}
/** One intent while either native menu action is pending; never allocate IDs for ignored clicks. */
function createDesktopTrayActions(services, newActionId) {
  let busy = false;
  const run = async operation => {
    if (busy) return { ok: false, code: 'DESKTOP_ACTION_BUSY' };
    busy = true;
    try { return await operation(services, newActionId()); }
    finally { busy = false; }
  };
  return { show: () => run(showDesktopCompanions), recall: () => run(recallDesktopCompanions) };
}
module.exports = { recallDesktopCompanions, showDesktopCompanions, createDesktopTrayActions };
