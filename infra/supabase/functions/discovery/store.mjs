import { DiscoveryError } from './protocol.mjs';
const exposed = new Set(['AUTH_REQUIRED','DEVICE_KEY_INVALID','DEVICE_KEY_REQUIRED','DEVICE_KEY_CHANGED','DEVICE_OWNER_MISMATCH',
  'LOCATION_PURPOSE_INVALID','LOCATION_CHALLENGE_INVALID','LOCATION_CHALLENGE_EXPIRED','LOCATION_SIGNATURE_INVALID','LOCATION_NONCE_REPLAY',
  'LOCATION_PROOF_INVALID','LOCATION_PROOF_USED','LOCATION_PROOF_SCOPE_MISMATCH','LOCATION_PROOF_EXPIRED','LOCATION_RATE_LIMITED',
  'INVALID_COORDINATES','LOCATION_STALE','LOCATION_IMPRECISE','REAL_LOCATION_REQUIRED','INVALID_CONSUMER','UNSUPPORTED_OP']);
export function actorDto(actor) {
  return { authUserId: actor.authUserId, ownerAccountId: actor.ownerAccountId, deviceId: actor.deviceId, sessionId: actor.sessionId,
    ...(actor.allowSimulatedLocation === true ? { allowSimulatedLocation: true, scenarioId: actor.scenarioId } : {}) };
}
/** Server-generated authority writes only. This client is the shared helper's
 * backend client, after withActor; it is never returned or used to query Auth. */
export function createDiscoveryStore(admin) {
  async function rpc(name, input) {
    const { data, error } = await admin.rpc(name, input);
    if (error) {
      const code = [...exposed].find(code => new RegExp(`\\b${code}\\b`).test(error.message || ''));
      const status = code === 'LOCATION_RATE_LIMITED' ? 429 : code?.includes('REPLAY') || code?.includes('USED') ? 409 : code === 'AUTH_REQUIRED' ? 401 : code ? 403 : 503;
      throw new DiscoveryError(code || 'DISCOVERY_STORAGE_UNAVAILABLE', code || '云端探索存储暂不可用', status);
    }
    return data;
  }
  return {
    location: (actor, op, input) => rpc('lingjing_discovery_location', { p_actor: actorDto(actor), p_op: op, p_input: input }),
    takeLocation: (actor, proofId, purpose, reference, consumer) => rpc('lingjing_discovery_take_location', {
      p_actor: actorDto(actor), p_proof_id: proofId, p_purpose: purpose, p_reference: reference, p_consumer: consumer
    })
  };
}
