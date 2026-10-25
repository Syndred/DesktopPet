// Request/proof validation. Identity is supplied by 08's verified actor wrapper,
// never extracted from a body owner, user_metadata or the former session_token.
export const PROTOCOL = 'lingjing-discovery-v2';
export const LOCATION_PURPOSES = new Set(['discover', 'begin', 'capture', 'territory:read', 'territory:challenge', 'territory:settle']);
export const ACTIONS = new Set(['normal_attack', 'element_attack', 'dodge', 'ultimate']);
export const LOCATION_POLICY = Object.freeze({ maxAgeMs: 30000, maxAccuracyMeters: 80, maxFutureMs: 5000, nonceTtlMs: 30000, proofTtlMs: 15000, captureRadiusMeters: 100 });
export class DiscoveryError extends Error {
  constructor(code, message = code, status = 400) { super(message); this.name = 'DiscoveryError'; this.code = code; this.status = status; }
}
export function requireValue(value, code, message, status) { if (!value) throw new DiscoveryError(code, message, status); }
export function identifier(value, field = 'id', max = 180) {
  requireValue(typeof value === 'string' && value.length >= 1 && value.length <= max && !/[\u0000-\u0020]/u.test(value), 'INVALID_INPUT', `${field}无效`);
  return value;
}
export function verifiedActor(actor) {
  requireValue(actor && actor.schemaVersion === 1 && actor.authority === 'live' && actor.authKind === 'supabase'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actor.authUserId || ''), 'AUTH_REQUIRED', '请先登录云端账号', 401);
  for (const key of ['ownerAccountId', 'deviceId', 'sessionId']) identifier(actor[key], key);
  return actor;
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
export function publicJwk(value) {
  requireValue(value?.kty === 'EC' && value.crv === 'P-256' && typeof value.x === 'string' && typeof value.y === 'string' && !value.d, 'DEVICE_KEY_INVALID', '设备公钥无效');
  requireValue(/^[A-Za-z0-9_-]{43}$/.test(value.x) && /^[A-Za-z0-9_-]{43}$/.test(value.y), 'DEVICE_KEY_INVALID', '设备公钥无效');
  return { kty: 'EC', crv: 'P-256', x: value.x, y: value.y };
}
export function checkedFix(value, actor, now) {
  verifiedActor(actor);
  requireValue(value && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value.lng) && Math.abs(value.lng) <= 180, 'INVALID_COORDINATES', '位置坐标无效');
  const simulated = value.source === 'simulated';
  if (simulated) {
    requireValue(actor.allowSimulatedLocation === true && typeof actor.scenarioId === 'string' && value.scenarioId === actor.scenarioId && value.provider === 'qa-discovery', 'REAL_LOCATION_REQUIRED', '模拟位置未获当前服务端场景授权');
  } else {
    requireValue(value.source === 'os' && value.provider === 'windows-geolocator', 'REAL_LOCATION_REQUIRED', '需要当前系统位置');
  }
  requireValue(value.coordinateSystem === 'wgs84', 'COORDINATE_SYSTEM_UNSUPPORTED', '系统位置必须使用 WGS84');
  requireValue(value.positionSource !== 'Default', 'LOCATION_DEFAULT_POSITION', '系统默认位置不可用于准入');
  requireValue(Number.isFinite(value.timestampMs) && now - value.timestampMs <= LOCATION_POLICY.maxAgeMs && value.timestampMs - now <= LOCATION_POLICY.maxFutureMs, 'LOCATION_STALE', '位置已过期');
  requireValue(Number.isFinite(value.accuracyMeters) && value.accuracyMeters > 0 && value.accuracyMeters <= LOCATION_POLICY.maxAccuracyMeters, 'LOCATION_IMPRECISE', '定位精度不足（需要 ≤ 80 米）');
  return { lat: value.lat, lng: value.lng, accuracyMeters: value.accuracyMeters, timestampMs: value.timestampMs, coordinateSystem: 'wgs84',
    source: value.source, provider: value.provider, ...(value.positionSource ? { positionSource: value.positionSource } : {}), ...(simulated ? { scenarioId: value.scenarioId } : {}) };
}
export function locationEnvelope(actor, challenge, fix) {
  return { protocol: PROTOCOL, authUserId: actor.authUserId, ownerAccountId: actor.ownerAccountId, deviceId: actor.deviceId, sessionId: actor.sessionId,
    challengeId: challenge.id, nonce: challenge.nonce, purpose: challenge.purpose, reference: challenge.reference || '', fix };
}
function bytes(value) {
  requireValue(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value) && value.length <= 512, 'LOCATION_SIGNATURE_INVALID', '位置签名无效');
  try { return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0)); }
  catch { throw new DiscoveryError('LOCATION_SIGNATURE_INVALID', '位置签名无效'); }
}
export async function verifySignedLocation({ actor, challenge, device, fix: input, signature, now = Date.now() }) {
  verifiedActor(actor);
  requireValue(challenge && device && !device.revokedAt && !challenge.consumedAt, 'LOCATION_CHALLENGE_INVALID', '定位许可无效或已使用');
  for (const field of ['authUserId', 'ownerAccountId', 'deviceId', 'sessionId']) requireValue(challenge[field] === actor[field], 'LOCATION_OWNER_MISMATCH', '定位许可不属于当前设备', 403);
  for (const field of ['authUserId', 'ownerAccountId', 'deviceId']) requireValue(device[field] === actor[field], 'DEVICE_OWNER_MISMATCH', '设备公钥归属不匹配', 403);
  requireValue(LOCATION_PURPOSES.has(challenge.purpose) && typeof challenge.nonce === 'string' && challenge.nonce.length >= 32, 'LOCATION_CHALLENGE_INVALID');
  requireValue(challenge.expiresAt > now && challenge.createdAt <= now + LOCATION_POLICY.maxFutureMs && challenge.expiresAt - challenge.createdAt <= LOCATION_POLICY.nonceTtlMs, 'LOCATION_CHALLENGE_EXPIRED', '定位许可已过期');
  requireValue(challenge.keyFingerprint === device.keyFingerprint, 'DEVICE_KEY_CHANGED', '设备密钥已更新');
  const fix = checkedFix(input, actor, now), data = new TextEncoder().encode(canonical(locationEnvelope(actor, challenge, fix)));
  let valid = false;
  try {
    const key = await crypto.subtle.importKey('jwk', { ...publicJwk(device.publicJwk), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const raw = bytes(signature); valid = raw.byteLength === 64 && await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, raw, data);
  } catch { /* Do not leak malformed key/signature internals. */ }
  requireValue(valid, 'LOCATION_SIGNATURE_INVALID', '位置签名无效', 403);
  return fix;
}
export function rejectClientAuthority(payload) {
  requireValue(payload && typeof payload === 'object' && !Array.isArray(payload), 'INVALID_REQUEST');
  for (const field of ['actor', 'authUserId', 'owner', 'ownerAccountId', 'deviceId', 'sessionId', 'allowSimulatedLocation', 'userId', 'sessionToken', 'session_token', 'winner', 'battle', 'pet', 'reward', 'rewards', 'experience', 'captureMultiplier']) {
    requireValue(!Object.hasOwn(payload, field), 'CLIENT_AUTHORITY_FORBIDDEN', `请求不能指定${field}`, 403);
  }
}
