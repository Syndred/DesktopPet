import { DiscoveryError, requireValue } from './protocol.mjs';
import { confirmedGlobalSerial, serialProjection, withoutGlobalSerials } from './global-serial.mjs';
const exposed = new Set(['AUTH_REQUIRED','DEVICE_KEY_INVALID','DEVICE_KEY_REQUIRED','DEVICE_KEY_CHANGED','DEVICE_OWNER_MISMATCH',
  'LOCATION_PURPOSE_INVALID','LOCATION_CHALLENGE_INVALID','LOCATION_CHALLENGE_EXPIRED','LOCATION_SIGNATURE_INVALID','LOCATION_NONCE_REPLAY',
  'LOCATION_PROOF_INVALID','LOCATION_PROOF_USED','LOCATION_PROOF_SCOPE_MISMATCH','LOCATION_PROOF_EXPIRED','LOCATION_RATE_LIMITED',
  'INVALID_COORDINATES','LOCATION_STALE','LOCATION_IMPRECISE','REAL_LOCATION_REQUIRED','INVALID_CONSUMER','UNSUPPORTED_OP',
  'ACTION_ID_CONFLICT','INVALID_ACTION','PERMIT_NOT_FOUND','ROUND_CONFLICT','REVISION_CONFLICT','SYNC_CONFLICT','BATTLE_FINISHED',
  'ENCOUNTER_PENDING','ENCOUNTER_EXPIRED','SPAWN_ALREADY_CAPTURED','CLOUD_PET_NOT_SYNCED','VICTORY_REQUIRED','CAPTURE_ALREADY_CONFIRMED',
  'COMPANIONS_AUTHORITY_REQUIRED','CLOUD_REWARD_ADAPTER_REQUIRED','TERRITORY_CONFLICT','DISCOVERY_SCHEMA_CONFLICT','INVALID_CAPTURE_RECEIPT','LOCATION_SCENARIO_MISMATCH',
  'GLOBAL_SERIAL_SCOPE_REVOKED','GLOBAL_SERIAL_SCOPE_CONFLICT','GLOBAL_SERIAL_INVALID','GLOBAL_SERIAL_UNAVAILABLE','GLOBAL_SERIAL_CONFLICT','GLOBAL_SERIAL_TEMPLATE_MISMATCH']);
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
      const status = code === 'LOCATION_RATE_LIMITED' ? 429 : /CONFLICT|REPLAY|USED|PENDING/.test(code || '') ? 409 : code === 'AUTH_REQUIRED' ? 401 : ['GLOBAL_SERIAL_INVALID','GLOBAL_SERIAL_UNAVAILABLE'].includes(code) ? 503 : code ? 403 : 503;
      const serialMessage = { GLOBAL_SERIAL_SCOPE_REVOKED: '当前场景编号授权已失效，等待重新授权', GLOBAL_SERIAL_SCOPE_CONFLICT: '当前账号的场景编号授权冲突，请联系支持核对' }[code];
      throw new DiscoveryError(code || 'DISCOVERY_STORAGE_UNAVAILABLE', serialMessage || code || '云端探索存储暂不可用', status);
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
    p_actor: actorDto(actor), p_op: op, p_operation: withoutGlobalSerials(operation), p_expected_save_revision: revision, p_fragments: fragments
  });
  const entityKey = value => JSON.stringify([value.id, value.templateId]);
  const validNamespace = value => value === 'live' || typeof value === 'string' && /^qa:.+/.test(value);
  function checkedIdentity(actor, value) {
    requireValue(value?.ownerAccountId === actor.ownerAccountId && validNamespace(value.namespace), 'GLOBAL_SERIAL_INVALID', '云端编号归属不一致', 503);
    confirmedGlobalSerial(value.globalSerial); return value;
  }
  async function wildSerials(actor, spawns) {
    const entities = [...new Map(spawns.map(value => [entityKey(value), { id: value.id, templateId: value.templateId }])).values()];
    if (!entities.length) return new Map();
    const batches = []; for (let offset = 0; offset < entities.length; offset += 100) batches.push(entities.slice(offset, offset + 100));
    const results = await Promise.all(batches.map(p_spawns => rpc('lingjing_global_serial_wild_lookup', { p_actor: actorDto(actor), p_spawns })));
    requireValue(results.every(Array.isArray), 'GLOBAL_SERIAL_INVALID', '云端编号读回无效', 503);
    const rows = results.flat();
    requireValue(Array.isArray(rows), 'GLOBAL_SERIAL_INVALID', '云端编号读回无效', 503);
    const expected = new Set(entities.map(entityKey)), result = new Map();
    for (const row of rows) {
      checkedIdentity(actor, row); const key = entityKey({ id: row.spawnId, templateId: row.templateId });
      requireValue(expected.has(key) && !result.has(key), 'GLOBAL_SERIAL_INVALID', '云端编号对象不一致', 503); result.set(key, row.globalSerial);
    }
    return result;
  }
  async function ownedSerials(actor, revision) {
    const value = await rpc('lingjing_global_serial_owned', { p_actor: actorDto(actor), p_expected_revision: revision });
    requireValue(value?.format === 'lingjing.global-serial.readback' && value.version === 1 && value.ownerAccountId === actor.ownerAccountId
      && validNamespace(value.namespace) && value.revision === revision && Array.isArray(value.pets), 'GLOBAL_SERIAL_INVALID', '伙伴编号读回不一致', 503);
    const result = new Map();
    for (const row of value.pets) {
      checkedIdentity(actor, row);
      requireValue(typeof row.petId === 'string' && typeof row.templateId === 'string' && !result.has(row.petId), 'GLOBAL_SERIAL_INVALID', '伙伴编号对象不一致', 503);
      result.set(row.petId, row);
    }
    return result;
  }
  async function projectNearby(actor, spawns) {
    // Lookup only: map refreshes never allocate candidate wild numbers.
    const records = await wildSerials(actor, spawns);
    return spawns.map(spawn => serialProjection(spawn, records.get(entityKey(spawn))));
  }
  async function projectGlobalSerials(actor, input) {
    const value = withoutGlobalSerials(input), wild = [], owned = [], permits = new Map(), deferred = [];
    const addWild = (target, spawn) => {
      if (typeof spawn?.id === 'string' && typeof spawn.templateId === 'string') wild.push({ target, spawn });
    };
    const visit = node => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (node.spawn && node.session) {
        requireValue(node.ownerAccountId === actor.ownerAccountId, 'GLOBAL_SERIAL_INVALID', '相遇编号归属不一致', 503);
        permits.set(node.id, node); addWild(node.spawn, node.spawn);
      }
      if (node.mode === 'wild' && node.enemy && node.player) {
        addWild(node.enemy, { id: node.enemy.petId, templateId: node.enemy.templateId });
        if (node.player.petId && node.player.templateId) owned.push(node.player);
      }
      if (node.petId && node.templateId && node.encounterId) {
        requireValue(node.ownerAccountId === actor.ownerAccountId, 'GLOBAL_SERIAL_INVALID', '捕获编号归属不一致', 503);
        owned.push(node);
        const permitId = node.permitId || (node.encounterId.startsWith('encounter-') ? node.encounterId.slice(10) : null);
        if (permitId) deferred.push({ target: node, permitId });
      } else if (node.id && node.sessionId === `battle-cloud-${node.id}` && !node.spawn) deferred.push({ target: node, permitId: node.id });
      Object.values(node).forEach(visit);
    };
    visit(value);
    await Promise.all([...new Set(deferred.map(item => item.permitId))].map(async id => {
      if (!permits.has(id)) permits.set(id, await read(actor, 'permit', id));
    }));
    for (const item of deferred) {
      const permit = permits.get(item.permitId);
      if (permit) {
        requireValue(permit.ownerAccountId === actor.ownerAccountId && (!item.target.templateId || item.target.templateId === permit.spawn?.templateId), 'GLOBAL_SERIAL_INVALID', '相遇编号对象不一致', 503);
        addWild(item.target, permit.spawn);
      }
    }
    const records = await wildSerials(actor, wild.map(item => item.spawn));
    for (const item of wild) { const serial = records.get(entityKey(item.spawn)); if (serial !== undefined) item.target.globalSerial = serial; }
    if (owned.length) {
      const current = await head(actor), records = await ownedSerials(actor, current.revision);
      for (const target of owned) {
        const record = records.get(target.petId);
        if (record?.templateId === target.templateId) {
          requireValue(target.globalSerial === undefined || target.globalSerial === record.globalSerial, 'GLOBAL_SERIAL_CONFLICT', '相遇与捕获编号不一致', 503);
          target.globalSerial = record.globalSerial;
        }
      }
    }
    return value;
  }
  return {
    head, projectNearby, projectGlobalSerials,
    async ensureWildSerial(actor, spawn, location) {
      const value = checkedIdentity(actor, await rpc('lingjing_global_serial_wild_ensure', { p_actor: actorDto(actor), p_spawn: spawn, p_proof_id: location.id }));
      requireValue(value.spawnId === spawn.id && value.templateId === spawn.templateId, 'GLOBAL_SERIAL_INVALID', '相遇编号对象不一致', 503); return value;
    },
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
      const { envelope, revision } = await head(actor), module = envelope.data?.modules?.companions;
      requireValue(module === undefined || module?.version === 1 && module.data?.ownerAccountId === actor.ownerAccountId, 'CLOUD_PET_NOT_SYNCED');
      // Once the canonical module exists never blend/fall back to generic rows.
      const rows = module === undefined ? envelope.data?.tables?.companion_pets?.rows : module.data?.tables?.companion_pets;
      requireValue(Array.isArray(rows), 'CLOUD_PET_NOT_SYNCED');
      const matches = rows.filter(row => row.owner_account_id === actor.ownerAccountId && row.pet_id === id);
      requireValue(matches.length === 1, 'CLOUD_PET_NOT_SYNCED');
      let pet; try { pet = JSON.parse(matches[0].data_json); } catch { throw new DiscoveryError('CLOUD_PET_NOT_SYNCED'); }
      requireValue(pet.ownerAccountId === actor.ownerAccountId && pet.petId === id && pet.revision === matches[0].revision, 'CLOUD_PET_NOT_SYNCED');
      const record = (await ownedSerials(actor, revision)).get(id);
      return serialProjection(pet, record?.templateId === pet.templateId ? record.globalSerial : undefined);
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
    async recordExistingCapture(actor, operation) {
      // A capture observed after the initial action read may have committed that
      // same request in the meantime. Its receipt is atomic with the capture:
      // re-read it before switching from the claim to duplicate-capture writer.
      const prior = await read(actor, 'action', operation.actionId);
      if (prior) { requireValue(prior.requestHash === operation.requestHash, 'ACTION_ID_CONFLICT', '操作编号已用于其他请求', 409); return prior.result; }
      return write(actor, 'recordExistingCapture', operation, (await head(actor)).revision);
    },
    async claim(actor, operation) {
      requireValue(typeof createCapture === 'function', 'COMPANIONS_AUTHORITY_REQUIRED', '规范伙伴捕捉构造器尚未部署', 503);
      const current = await head(actor);
      const proof = await rpc('lingjing_discovery_location', { p_actor: actorDto(actor), p_op: 'read_proof', p_input: { proofId: operation.locationProofId } });
      const context = await rpc('runtime_territory_capture_context', { p_owner: actor.ownerAccountId, p_lat: proof.fix.lat, p_lng: proof.fix.lng, p_scenario_id: proof.source === 'simulated' ? proof.fix.scenarioId : null });
      // This preview is recomputed/compared and locked by05 inside game_write.
      // A region change aborts the whole capture; no stale HTTP multiplier grant.
      const capture = { ...operation.capture, ...context }, instance = { ...operation.instance, origin: { ...operation.instance.origin, ...context } };
      const result = await createCapture({ actor, envelope: current.envelope, capture, instance, now: now() });
      requireValue(result?.pet?.petId === capture.petId && result.fragments?.companions, 'COMPANIONS_AUTHORITY_REQUIRED');
      return write(actor, 'claim', { ...operation, capture, instance, expectedTerritoryContext: context }, current.revision, result.fragments);
    }
  };
}
