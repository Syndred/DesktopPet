import { DiscoveryError, requireValue } from './protocol.mjs';
const exposed = new Set(['AUTH_REQUIRED','DEVICE_KEY_INVALID','DEVICE_KEY_REQUIRED','DEVICE_KEY_CHANGED','DEVICE_OWNER_MISMATCH',
  'LOCATION_PURPOSE_INVALID','LOCATION_CHALLENGE_INVALID','LOCATION_CHALLENGE_EXPIRED','LOCATION_SIGNATURE_INVALID','LOCATION_NONCE_REPLAY',
  'LOCATION_PROOF_INVALID','LOCATION_PROOF_USED','LOCATION_PROOF_SCOPE_MISMATCH','LOCATION_PROOF_EXPIRED','LOCATION_RATE_LIMITED',
  'INVALID_COORDINATES','LOCATION_STALE','LOCATION_IMPRECISE','REAL_LOCATION_REQUIRED','INVALID_CONSUMER','UNSUPPORTED_OP',
  'ACTION_ID_CONFLICT','INVALID_ACTION','PERMIT_NOT_FOUND','ROUND_CONFLICT','REVISION_CONFLICT','SYNC_CONFLICT','BATTLE_FINISHED',
  'ENCOUNTER_PENDING','ENCOUNTER_EXPIRED','SPAWN_ALREADY_CAPTURED','CLOUD_PET_NOT_SYNCED','VICTORY_REQUIRED','CAPTURE_ALREADY_CONFIRMED',
  'COMPANIONS_AUTHORITY_REQUIRED','CLOUD_REWARD_ADAPTER_REQUIRED','TERRITORY_CONFLICT','DISCOVERY_SCHEMA_CONFLICT','INVALID_CAPTURE_RECEIPT']);
export function actorDto(actor) {
  return { authUserId: actor.authUserId, ownerAccountId: actor.ownerAccountId, deviceId: actor.deviceId, sessionId: actor.sessionId,
    ...(actor.allowSimulatedLocation === true ? { allowSimulatedLocation: true, scenarioId: actor.scenarioId } : {}) };
}
/** Server-generated authority writes only. This client is the shared helper's
 * backend client, after withActor; it is never returned or used to query Auth.
 * @param {any} admin
 * @param {{awardBattle?: (input:any)=>Promise<any>,createCapture?: (input:any)=>Promise<any>,now?:()=>number}} options
 */
export function createDiscoveryStore(admin, { awardBattle, createCapture, now = Date.now } = {}) {
  async function rpc(name, input) {
    const { data, error } = await admin.rpc(name, input);
    if (error) {
      const message = (error.message || '').replace(/\bLJ_/g, '');
      const code = [...exposed].find(code => new RegExp(`\\b${code}\\b`).test(message));
      const status = code === 'LOCATION_RATE_LIMITED' ? 429 : /CONFLICT|REPLAY|USED|PENDING/.test(code || '') ? 409 : code === 'AUTH_REQUIRED' ? 401 : code ? 403 : 503;
      throw new DiscoveryError(code || 'DISCOVERY_STORAGE_UNAVAILABLE', code || '云端探索存储暂不可用', status);
    }
    return data;
  }
  async function head(actor) {
    // Ordinary owner reads use08's user-scoped SDK/RLS, never the admin client.
    requireValue(actor.client?.from, 'AUTH_REQUIRED', '请重新登录', 401);
    const { data, error } = await actor.client.from('lingjing_saves').select('revision,envelope').eq('owner_id', actor.ownerAccountId).maybeSingle();
    if (error) throw new DiscoveryError('DISCOVERY_STORAGE_UNAVAILABLE', '请稍后重试云存档读取', 503);
    requireValue(data?.envelope?.ownerAccountId === actor.ownerAccountId && Number.isSafeInteger(data.revision), 'CLOUD_PET_NOT_SYNCED', '请先初始化可信云端伙伴');
    return data;
  }
  const read = (actor, op, key = null) => rpc('lingjing_discovery_game_read', { p_actor: actorDto(actor), p_op: op, p_key: key });
  const write = (actor, op, operation, revision, fragments = {}) => rpc('lingjing_discovery_game_write', {
    p_actor: actorDto(actor), p_op: op, p_operation: operation, p_expected_save_revision: revision, p_fragments: fragments
  });
  return {
    head,
    location: (actor, op, input) => rpc('lingjing_discovery_location', { p_actor: actorDto(actor), p_op: op, p_input: input }),
    takeLocation: (actor, proofId, purpose, reference, consumer) => rpc('lingjing_discovery_take_location', {
      p_actor: actorDto(actor), p_proof_id: proofId, p_purpose: purpose, p_reference: reference, p_consumer: consumer
    }),
    action: (actor, id) => read(actor, 'action', id),
    permit: (actor, id) => read(actor, 'permit', id),
    permits: actor => read(actor, 'permits'),
    capture: (actor, id) => read(actor, 'capture', id),
    captures: actor => read(actor, 'captures'),
    async ownedPet(actor, id) {
      const { envelope } = await head(actor), module = envelope.data?.modules?.companions;
      requireValue(module === undefined || module?.version === 1 && module.data?.ownerAccountId === actor.ownerAccountId, 'CLOUD_PET_NOT_SYNCED');
      // Once the canonical module exists never blend/fall back to generic rows.
      const rows = module === undefined ? envelope.data?.tables?.companion_pets?.rows : module.data?.tables?.companion_pets;
      requireValue(Array.isArray(rows), 'CLOUD_PET_NOT_SYNCED');
      const matches = rows.filter(row => row.owner_account_id === actor.ownerAccountId && row.pet_id === id);
      requireValue(matches.length === 1, 'CLOUD_PET_NOT_SYNCED');
      let pet; try { pet = JSON.parse(matches[0].data_json); } catch { throw new DiscoveryError('CLOUD_PET_NOT_SYNCED'); }
      requireValue(pet.ownerAccountId === actor.ownerAccountId && pet.petId === id && pet.revision === matches[0].revision, 'CLOUD_PET_NOT_SYNCED');
      return pet;
    },
    async reserve(actor, operation) { return write(actor, 'reserve', operation, (await head(actor)).revision); },
    async advance(actor, operation) {
      const current = await head(actor); let fragments = {};
      if (operation.session.status === 'finished') {
        requireValue(typeof awardBattle === 'function', 'CLOUD_REWARD_ADAPTER_REQUIRED', '规范成长与库存适配尚未部署', 503);
        const result = await awardBattle({ actor, envelope: current.envelope, session: operation.session, now: now() });
        requireValue(result?.reward?.applied === true && result.fragments?.companions && result.fragments?.garden, 'CLOUD_REWARD_ADAPTER_REQUIRED');
        operation = { ...operation, session: { ...operation.session, reward: result.reward } }; fragments = result.fragments;
      }
      return write(actor, 'advance', operation, current.revision, fragments);
    },
    async cancel(actor, operation) { return write(actor, 'cancel', operation, (await head(actor)).revision); },
    async recordExistingCapture(actor, operation) { return write(actor, 'recordExistingCapture', operation, (await head(actor)).revision); },
    async claim(actor, operation) {
      requireValue(typeof createCapture === 'function', 'COMPANIONS_AUTHORITY_REQUIRED', '规范伙伴捕捉构造器尚未部署', 503);
      const current = await head(actor);
      const proof = await rpc('lingjing_discovery_location', { p_actor: actorDto(actor), p_op: 'read_proof', p_input: { proofId: operation.locationProofId } });
      const context = await rpc('runtime_territory_capture_context', { p_owner: actor.ownerAccountId, p_lat: proof.fix.lat, p_lng: proof.fix.lng });
      // This preview is recomputed/compared and locked by05 inside game_write.
      // A region change aborts the whole capture; no stale HTTP multiplier grant.
      const capture = { ...operation.capture, ...context }, instance = { ...operation.instance, origin: { ...operation.instance.origin, ...context } };
      const result = await createCapture({ actor, envelope: current.envelope, capture, instance, now: now() });
      requireValue(result?.pet?.petId === capture.petId && result.fragments?.companions, 'COMPANIONS_AUTHORITY_REQUIRED');
      return write(actor, 'claim', { ...operation, capture, instance, expectedTerritoryContext: context }, current.revision, result.fragments);
    }
  };
}
