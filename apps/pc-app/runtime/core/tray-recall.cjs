/** Await the domain command; this host never changes companion progress or intents. */
async function recallDesktopCompanions(services, actionId) {
  let owner;
  try {
    owner = services.session.getOwnerAccountId();
    if (!owner) return { ok: false, code: 'AUTH_REQUIRED' };
    const companions = services.get('companions');
    const windows = companions.getDesktopWindows().filter(entry => entry.ownerAccountId === owner);
    const result = await companions.recallAll(owner, actionId);
    if (services.session.getOwnerAccountId() !== owner) return { ok: false, code: 'SESSION_CHANGED' };
    if (result?.ok !== true) throw new Error('Recall not confirmed');
    const closed = [];
    for (const entry of windows) {
      if (services.session.getOwnerAccountId() !== owner) return { ok: false, code: 'SESSION_CHANGED' };
      const window = services.windows.get(entry.petId);
      // An account switch/reopen can replace a window while the command is pending.
      if (!window || window.id !== entry.windowId || window.isDestroyed()) continue;
      services.windows.close(entry.petId); closed.push(entry.petId);
    }
    return { ok: true, closed };
  } catch {
    try {
      if (owner && services.session.getOwnerAccountId() === owner) {
        services.events.emit('accounts:host-warning', { code: 'COMPANION_RECALL_UNCONFIRMED', operation: 'recall-all' });
      }
    } catch { /* A failed warning listener must not reject the native menu callback. */ }
    return { ok: false, code: 'COMPANION_RECALL_UNCONFIRMED' };
  }
}
module.exports = { recallDesktopCompanions };
