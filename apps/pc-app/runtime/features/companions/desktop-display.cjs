/** Transient owner-bound DTO only. Never persist this view or use it to allocate windows. */
function projectDesktopDisplay({ ownerAccountId, currentOwnerAccountId, pets, windows, host }) {
  const available = currentOwnerAccountId === ownerAccountId && host?.ownerAccountId === ownerAccountId && Array.isArray(windows) && Array.isArray(host?.windows);
  const limit = available && Number.isInteger(host.companionLimit) && host.companionLimit >= 1 && host.companionLimit <= 4 ? host.companionLimit : null;
  const allocated = new Map((available ? host.windows : []).map(window => [window.id, window]));
  const ownedWindows = new Map();
  for (const window of available ? windows : []) {
    if (window.ownerAccountId === ownerAccountId) ownedWindows.set(window.petId, window);
  }
  return { ownerAccountId, available, limit, pets: pets.filter(pet => pet.ownerAccountId === ownerAccountId && pet.resource.kind === '2d').map(pet => {
    let state = pet.desktop.visible ? 'unknown' : 'off', reason = null;
    const window = ownedWindows.get(pet.petId), actual = window && allocated.get(window.windowId);
    if (pet.desktop.visible && actual) {
      // Actual visibility wins; never fabricate an effective count by clamping requests.
      if (actual.visible === true) state = 'visible';
      else if (actual.visible === false) {
        if (actual.slotAllocated === false && actual.hiddenReason === 'limit') { state = 'waiting'; reason = 'limit'; }
        else { state = 'hidden'; reason = actual.hiddenReason === 'fullscreen' ? 'fullscreen' : null; }
      }
    }
    return { petId: pet.petId, state, reason };
  }) };
}
module.exports = { projectDesktopDisplay };
