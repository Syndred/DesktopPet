// Server-only state machine. Store writes are transactions, not client save JSON.
import { BattleRuntimeService, getBattleRules, presentSession, nearbySpawns, geofence } from './_generated/runtime.mjs';
import { ACTIONS, PROTOCOL, canonical, checkedFix, identifier, rejectClientAuthority, requireValue, verifiedActor } from './protocol.mjs';
const clone = value => structuredClone(value);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value))))).map(b => b.toString(16).padStart(2, '0')).join('');
const cleanName = value => { requireValue(typeof value === 'string' && value.trim() && [...value.trim()].length <= 24 && !/[\u0000-\u001f]/u.test(value), 'INVALID_NAME', '昵称需为1–24个字符'); return value.trim(); };
export function createWildAuthority({ store, now = Date.now, uuid = () => crypto.randomUUID(), projectRef }) {
  const result = async (actor, actionId, request, execute) => {
    identifier(actionId, 'actionId'); const requestHash = await hash({ protocol: PROTOCOL, ...request });
    const old = await store.action(actor, actionId);
    if (old) { requireValue(old.requestHash === requestHash, 'ACTION_ID_CONFLICT', '操作编号已用于其他请求', 409); return old.result; }
    return execute({ actionId, requestHash });
  };
  const permit = async (actor, id) => {
    const value = await store.permit(actor, identifier(id, 'permitId')); requireValue(value, 'PERMIT_NOT_FOUND', '找不到这次云端相遇', 404);
    requireValue(value.ownerAccountId === actor.ownerAccountId, 'OWNER_MISMATCH', '无权访问这次相遇', 403); return value;
  };
  const proof = async (actor, id, purpose, reference) => {
    const value = await store.location(actor, 'read_proof', { proofId: identifier(id, 'proofId') });
    for (const field of ['authUserId', 'ownerAccountId', 'deviceId', 'sessionId']) requireValue(value[field] === actor[field], 'LOCATION_OWNER_MISMATCH', '位置许可不属于当前设备', 403);
    requireValue(value.purpose === purpose && value.reference === reference && value.expiresAt > now() && !value.consumedAt, 'LOCATION_PROOF_SCOPE_MISMATCH', '请更新当前操作的位置许可');
    return { ...value, fix: checkedFix(value.fix, actor, now()) };
  };
  const inRange = (value, spawn) => { const range = geofence({ ...value.fix, source: 'os' }, spawn.position, 100, now()); requireValue(range.ok, range.code || 'OUT_OF_CAPTURE_RANGE', range.message); return range; };
  return async ({ actor, input }) => {
    verifiedActor(actor); rejectClientAuthority(input);
    if (input.op === 'reserve') {
      const request = { op: 'reserve', spawnId: identifier(input.spawnId, 'spawnId'), petId: identifier(input.petId, 'petId'), proofId: identifier(input.proofId, 'proofId') };
      return result(actor, input.actionId, request, async operation => {
        const location = await proof(actor, request.proofId, 'begin', request.spawnId);
        const spawn = nearbySpawns(location.fix, now()).find(value => value.id === request.spawnId); requireValue(spawn, 'SPAWN_EXPIRED', '附近伙伴已刷新'); inRange(location, spawn);
        const pet = await store.ownedPet(actor, request.petId); requireValue(pet && pet.ownerAccountId === actor.ownerAccountId, 'CLOUD_PET_NOT_SYNCED', '出战伙伴尚无可信云端记录');
        requireValue(['metal', 'wood', 'water', 'fire', 'earth'].includes(pet.element) && ['2d', 'spritesheet'].includes(pet.resource?.kind), 'PET_2D_REQUIRED', '请选择可信2D出战伙伴');
        const id = uuid(), sessionId = `battle-cloud-${id}`, engine = new BattleRuntimeService();
        const player = { ...clone(pet), petName: pet.name, appearance2d: pet.resource.resourceId };
        const enemy = { petId: spawn.id, petName: spawn.name, name: spawn.name, templateId: spawn.templateId, element: spawn.element, level: 1,
          resource: { resourceId: spawn.resourceId, kind: '2d' }, appearance2d: spawn.resourceId, combatStats: clone(spawn.stats) };
        const session = { id: sessionId, mode: 'wild', status: 'active', player, enemy,
          snapshot: engine.reset({ playerElement: pet.element, enemyElement: spawn.element }), rules: getBattleRules(), rounds: [], winner: null,
          revision: 1, historyComplete: true, pendingAction: null, startedAt: new Date(now()).toISOString(),
          context: { origin: 'discovery', permitId: id, encounterId: `encounter-${id}`, authority: location.source === 'simulated' ? 'simulated' : 'supabase',
            cloudAuthority: 'discovery', cloudProject: projectRef, inputSource: location.source, scenarioId: location.fix.scenarioId, returnPath: `/discovery/encounter/encounter-${id}` } };
        return store.reserve(actor, { ...operation, id, sessionId, ownerAccountId: actor.ownerAccountId, authUserId: actor.authUserId, petId: pet.petId,
          createdAt: now(), expiresAt: now() + 30 * 60 * 1000, spawn, source: location.source, scenarioId: location.fix.scenarioId,
          locationProofId: location.id, expectedPetRevision: pet.revision, status: 'active', revision: 1, session });
      });
    }
    if (input.op === 'session') return presentSession((await permit(actor, input.permitId)).session);
    if (input.op === 'action') { const value = await store.action(actor, identifier(input.actionId, 'actionId')); requireValue(value, 'ACTION_NOT_FOUND', '找不到操作回执', 404); return value; }
    if (input.op === 'captures') return store.captures(actor);
    if (input.op === 'permits') return store.permits(actor);
    if (input.op === 'act') {
      requireValue(ACTIONS.has(input.action) && Number.isSafeInteger(input.expectedRound) && input.expectedRound >= 1, 'INVALID_BATTLE_ACTION', '行动或回合无效');
      const request = { op: 'act', permitId: identifier(input.permitId, 'permitId'), action: input.action, expectedRound: input.expectedRound };
      return result(actor, input.actionId, request, async operation => {
        const current = await permit(actor, request.permitId); requireValue(current.expiresAt > now(), 'ENCOUNTER_EXPIRED', '云端相遇已过期');
        requireValue(current.status === 'active' && current.session.status === 'active', 'BATTLE_FINISHED', '这场挑战已结束');
        requireValue(current.session.snapshot.round + 1 === request.expectedRound, 'ROUND_CONFLICT', '回合已更新，请先同步', 409);
        requireValue(canonical(current.session.rules) === canonical(getBattleRules()), 'RULES_VERSION_UNAVAILABLE', '此历史会话需要其原规则版本');
        const engine = new BattleRuntimeService(); engine.restore(current.session.snapshot);
        const resolved = engine.act(request.action), session = clone(current.session);
        session.snapshot = resolved.state; session.rounds.push({ ...resolved.roundResult, state: clone(resolved.state) }); session.revision++;
        session.winner = resolved.roundResult.winner || null;
        if (session.winner) { session.status = 'finished'; session.endedAt = new Date(now()).toISOString(); session.reportId = `report-cloud-${current.id}`; }
        // The SQL store locks/CASes the old revision, persists this authoritative
        // result and commits the canonical08/02/05 reward fragment if terminal.
        return store.advance(actor, { ...operation, permitId: current.id, expectedRevision: current.revision, expectedRound: request.expectedRound,
          action: request.action, session, status: session.winner === 'player' ? 'won' : session.winner ? 'lost' : 'active' });
      });
    }
    if (input.op === 'cancel') {
      const request = { op: 'cancel', permitId: identifier(input.permitId, 'permitId') };
      return result(actor, input.actionId, request, async operation => {
        const current = await permit(actor, request.permitId); requireValue(current.status !== 'captured', 'CAPTURE_ALREADY_CONFIRMED', '伙伴已经加入');
        const session = clone(current.session);
        if (session.status === 'active') { session.status = 'abandoned'; session.endedAt = new Date(now()).toISOString(); session.reportId = `report-cloud-${current.id}`; session.revision++; }
        return store.cancel(actor, { ...operation, permitId: current.id, expectedRevision: current.revision, session });
      });
    }
    if (input.op === 'confirm') {
      const request = { op: 'confirm', permitId: identifier(input.permitId, 'permitId'), proofId: identifier(input.proofId, 'proofId'), name: cleanName(input.name) };
      return result(actor, input.actionId, request, async operation => {
        const current = await permit(actor, request.permitId), existing = await store.capture(actor, current.id);
        if (existing) return store.recordExistingCapture(actor, { ...operation, permitId: current.id, capture: existing });
        requireValue(current.status === 'won' && current.session.status === 'finished' && current.session.winner === 'player', 'VICTORY_REQUIRED', '云端尚未确认胜利');
        requireValue(current.expiresAt > now(), 'ENCOUNTER_EXPIRED', '云端相遇已过期');
        const location = await proof(actor, request.proofId, 'capture', current.id), range = inRange(location, current.spawn);
        requireValue(current.source === location.source && (current.scenarioId || null) === (location.fix.scenarioId || null), 'LOCATION_SCENARIO_MISMATCH', '请在本次相遇的同一位置场景完成收服', 403);
        const petId = `pet-${current.id}`, capturedAt = new Date(now()).toISOString();
        const memory = { id: `encounter-${current.id}:first-meeting`, kind: 'first_meeting', title: '我们的第一次见面',
          text: `在${current.spawn.placeLabel}相遇，赢得挑战后成为了伙伴。`, placeLabel: current.spawn.placeLabel, createdAt: capturedAt };
        const simulated = current.source === 'simulated' || location.source === 'simulated';
        const capture = { id: `capture-${current.id}`, ownerAccountId: actor.ownerAccountId, encounterId: `encounter-${current.id}`, permitId: current.id,
          battleId: current.sessionId, petId, actionId: `discovery:encounter-${current.id}`, name: request.name, templateId: current.spawn.templateId,
          resourceId: current.spawn.resourceId, element: current.spawn.element, placeLabel: current.spawn.placeLabel, capturedAtMs: now(),
          memoryTags: [memory], showOnDesktop: false, validation: simulated ? 'simulated' : 'cloud', scenario: simulated ? 'qa' : 'live',
          scenarioId: current.scenarioId || location.fix.scenarioId, distanceMeters: Math.round(range.rawDistanceMeters), cloud: { projectRef, transport: 'https', authoritative: true } };
        return store.claim(actor, { ...operation, permitId: current.id, expectedRevision: current.revision, locationProofId: location.id, capture,
          instance: { petId, templateId: capture.templateId, name: capture.name, element: capture.element, stats: clone(current.spawn.stats), resource: { kind: '2d', resourceId: capture.resourceId },
            origin: { wildPetId: current.spawn.id, wildSerial: current.spawn.wildSerial, battleId: current.sessionId, encounterId: capture.encounterId,
              capturedAt, placeLabel: capture.placeLabel, memoryTags: [memory], validation: capture.validation, scenario: capture.scenario,
              scenarioId: capture.scenarioId, cloudReceiptId: capture.id } } });
      });
    }
    requireValue(false, 'UNSUPPORTED_OP', '不支持的探索操作');
  };
}
