import { PROTOCOL, LOCATION_PURPOSES, DiscoveryError, canonical, checkedFix, identifier, publicJwk, rejectClientAuthority, requireValue, verifiedActor, verifySignedLocation } from './protocol.mjs';
import { nearbySpawns, geofence, presentSession } from './_generated/runtime.mjs';
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'authorization, apikey, content-type, x-lingjing-device-id, x-request-id' };
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(b => b.toString(16).padStart(2, '0')).join('');
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
async function readBody(request) {
  const reader = request.body?.getReader(); requireValue(reader, 'INVALID_REQUEST');
  const chunks = []; let length = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; requireValue(length <= 32768, 'REQUEST_TOO_LARGE', '请求过大', 413); chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new DiscoveryError('INVALID_REQUEST', '请求格式无效'); }
}
/** @param {{requireActor:(request:Request)=>Promise<any>,store:any,now?:()=>number,authority?:null|((input:any)=>Promise<any>)}} options */
export function createDiscoveryHandler({ requireActor, store, now = Date.now, authority = null }) {
  requireValue(typeof requireActor === 'function' && store?.location, 'SERVER_CONFIGURATION_INVALID');
  return async request => {
    if (request.method === 'OPTIONS') return new Response('ok', { headers });
    if (request.method !== 'POST') return reply({ ok: false, code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST' }, 405);
    try {
      // 08 verifies JWT/device and maps Auth UID to the preserved legacy owner.
      const actor = verifiedActor(await requireActor(request));
      const input = await readBody(request); rejectClientAuthority(input);
      let data;
      if (input.op === 'protocol') data = { protocol: PROTOCOL, locationPolicy: '80m/30s/100m', serverTime: now(),
        wildAuthority: Boolean(authority), receiptRecovery: Boolean(authority), wildObserve: Boolean(authority && store.ensureWildSerial), ...(actor.allowSimulatedLocation === true ? { scenarioId: actor.scenarioId, simulatedLocationAllowed: true } : {}) };
      else if (input.op === 'device.register') {
        const jwk = publicJwk(input.publicJwk), keyFingerprint = await digest(canonical(jwk));
        data = await store.location(actor, 'register_device', { publicJwk: jwk, keyFingerprint });
      } else if (input.op === 'location.challenge') {
        requireValue(LOCATION_PURPOSES.has(input.purpose), 'LOCATION_PURPOSE_INVALID');
        data = await store.location(actor, 'issue_nonce', { purpose: input.purpose, reference: input.reference ? identifier(input.reference, 'reference') : '' });
      } else if (input.op === 'location.prove') {
        const challengeId = identifier(input.challengeId, 'challengeId'), signatureHash = await digest(String(input.signature || ''));
        const challenge = await store.location(actor, 'nonce', { challengeId });
        if (challenge.proofId) {
          data = await store.location(actor, 'read_proof', { proofId: challenge.proofId });
          requireValue(challenge.signatureHash === signatureHash && canonical(data.fix) === canonical(input.fix), 'LOCATION_NONCE_REPLAY', '定位许可已用于不同请求', 409);
        } else {
          const device = await store.location(actor, 'device', {});
          const fix = await verifySignedLocation({ actor, challenge, device, fix: input.fix, signature: input.signature, now: now() });
          data = await store.location(actor, 'accept_nonce', { challengeId, fix, signatureHash });
        }
      } else if (input.op === 'nearby') {
        const proof = await store.location(actor, 'read_proof', { proofId: identifier(input.proofId, 'proofId') });
        requireValue(proof.purpose === 'discover' && proof.reference === '' && proof.expiresAt > now(), 'LOCATION_PROOF_EXPIRED', '请更新位置');
        const fix = checkedFix(proof.fix, actor, now()), metricFix = { ...fix, source: 'os' };
        const spawns = nearbySpawns(fix, now()).map(spawn => ({ ...spawn, inRange: geofence(metricFix, spawn.position, 100, now()).ok }));
        data = { source: fix.source, scenarioId: fix.scenarioId, serverTime: now(), spawns: store.projectNearby ? await store.projectNearby(actor, spawns, fix) : spawns };
      } else {
        requireValue(authority, 'CLOUD_AUTHORITY_NOT_READY', '云端权威接口尚未接入', 503);
        data = await authority({ actor, input, now: now() });
      }
      // Registry metadata is appended AFTER mutation receipts have committed.
      // It never changes stored game JSON, old receipt bytes or save checksums.
      if (store.projectGlobalSerials && !['protocol','observe','nearby','device.register','location.challenge','location.prove'].includes(input.op)) data = await store.projectGlobalSerials(actor, data);
      return reply({ ok: true, protocol: PROTOCOL, data: presentSession(data) });
    } catch (error) {
      // Internal DB errors never leak SQL, JWTs, raw request bodies or key data.
      const known = error instanceof DiscoveryError;
      const code = known ? error.code : 'DISCOVERY_UNAVAILABLE', message = known ? error.message : '探索服务暂不可用';
      return reply({ ok: false, code, message, error: { code, message } }, known ? error.status : 503);
    }
  };
}
