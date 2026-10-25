const FEATURES = new Set(['app', 'accounts', 'resources', 'companions', 'battle', 'garden', 'discovery', 'conversations']);
const DESKTOP = new Set(['app:info', 'accounts:settingsGet', 'companions:get', 'companions:desktopInput', 'companions:interact', 'companions:desktop', 'resources:resolve']);
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null); }
function dataOnly(value, depth = 0, seen = new Set()) {
  if (depth > 24) return false;
  if (value == null || ['string', 'boolean', 'undefined'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!Array.isArray(value) && !plain(value) || seen.has(value)) return false;
  seen.add(value);
  const valid = Object.entries(value).every(([key, child]) => !['__proto__', 'constructor', 'prototype'].includes(key) && dataOnly(child, depth + 1, seen));
  seen.delete(value); return valid;
}
function validateIpcRequest(request, desktopPetId) {
  try {
    if (!plain(request) || !FEATURES.has(request.feature) || typeof request.command !== 'string' || !/^[a-zA-Z][a-zA-Z0-9.]{0,79}$/.test(request.command)
      || request.payload !== undefined && !plain(request.payload) || !dataOnly(request) || Buffer.byteLength(JSON.stringify(request), 'utf8') > 2_000_000) return 'INVALID_REQUEST';
    if (desktopPetId !== undefined) {
      if (!DESKTOP.has(`${request.feature}:${request.command}`)) return 'WINDOW_SCOPE_VIOLATION';
      if (['companions', 'resources'].includes(request.feature) && request.payload?.petId !== desktopPetId) return 'WINDOW_SCOPE_VIOLATION';
    }
    return null;
  } catch { return 'INVALID_REQUEST'; }
}
function desktopEventAllowed(name, payload, petId) {
  if (name === 'companions:action') return payload?.petId === petId;
  return ['app:session', 'accounts:session-changed', 'accounts:behavior', 'companions:changed', 'resources:changed'].includes(name);
}
module.exports = { validateIpcRequest, desktopEventAllowed };
