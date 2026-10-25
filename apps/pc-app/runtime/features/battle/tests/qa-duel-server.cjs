const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createSession, executeRound } = require('../../../services/battle-runtime.cjs');

/** Isolated loopback protocol fixture. Uses the same runtime engine; never a live cloud receipt. */
async function startQaDuelServer({ runId, token, directory }) {
  const state = { provenance: 'simulated', runId, users: {}, requests: {}, rooms: {}, rounds: {}, actions: {}, claims: {}, operations: [] };
  mkdirSync(directory, { recursive: true });
  const persist = () => writeFileSync(join(directory, 'qa-authority.json'), JSON.stringify(state, null, 2));
  const reject = (code, message) => { throw Object.assign(new Error(message), { code }); };
  const getRoom = input => {
    const room = state.rooms[input.roomId] || Object.values(state.rooms).find(value => value.room_code === input.roomCode);
    if (!room) reject('ROOM_NOT_FOUND', '找不到房间');
    return room;
  };
  const side = (room, user) => room.host_user_id === user.id ? 'host' : room.guest_user_id === user.id ? 'guest' : null;
  const owned = (room, user) => { const value = side(room, user); if (!value) reject('ROOM_FORBIDDEN', '不是房间参与者'); return value; };
  const statuses = values => values.map(status => ({ ...status, sourceId: status.sourceId === 'player' ? 'host' : status.sourceId === 'enemy' ? 'guest' : status.sourceId }));
  function roomState(room) {
    const session = createSession(room.host_element, room.guest_element || 'wood'); session.round = room.last_resolved_round;
    for (const [role, prefix] of [['player', 'host'], ['enemy', 'guest']]) Object.assign(session[role], {
      hp: room[`${prefix}_hp`], anger: room[`${prefix}_anger`], freeDodgeUsed: room[`${prefix}_free_dodge_used`],
      statuses: (room[`${prefix}_statuses`] || []).map(status => ({ ...status, sourceId: status.sourceId === 'host' ? 'player' : status.sourceId === 'guest' ? 'enemy' : status.sourceId }))
    });
    return session;
  }
  function saveRoomState(room, session) {
    for (const [role, prefix] of [['player', 'host'], ['enemy', 'guest']]) {
      const actor = session[role];
      for (const [suffix, value] of Object.entries({ hp: actor.hp, anger: actor.anger, free_dodge_used: actor.freeDodgeUsed, statuses: statuses(actor.statuses) })) room[`${prefix}_${suffix}`] = value;
    }
    room.updated_at = new Date().toISOString();
  }
  function dispatch(input) {
    const { op, userId, sessionToken } = input;
    if (!userId || sessionToken !== `qa:${runId}:${userId}`) reject('AUTH_REQUIRED', '场景身份不匹配');
    const user = state.users[userId] ||= { id: userId, account: input.userAccount || userId, username: input.username || input.userAccount || userId };
    if (input.userAccount) user.account = input.userAccount;
    state.operations.push({ at: new Date().toISOString(), op, userId, roomId: input.roomId, action: input.action, roundNo: input.roundNo, provenance: 'simulated' });
    if (op === 'search_accounts') return { users: Object.values(state.users).filter(value => value.id !== userId && value.account.includes(input.keyword || input.query || '')) };
    if (op === 'list_duel_requests') return { inbound: Object.values(state.requests).filter(value => value.toUserId === userId), outbound: Object.values(state.requests).filter(value => value.fromUserId === userId) };
    if (op === 'send_duel_request') {
      const target = Object.values(state.users).find(value => value.account === input.targetAccount);
      if (!target || target.id === userId) reject('USER_NOT_FOUND', '找不到对方');
      const request = { id: randomUUID(), fromUserId: userId, toUserId: target.id, fromAccount: user.account, toAccount: target.account, status: 'pending', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      state.requests[request.id] = request; return { request };
    }
    if (op === 'respond_duel_request' || op === 'cancel_duel_request') {
      const request = state.requests[input.requestId];
      if (!request || (op === 'respond_duel_request' ? request.toUserId : request.fromUserId) !== userId) reject('REQUEST_FORBIDDEN', '邀请不属于当前账号');
      request.status = op === 'cancel_duel_request' ? 'cancelled' : input.decision === 'accept' ? 'accepted' : 'rejected';
      Object.assign(request, { roomId: input.roomId || null, roomCode: input.roomCode || null, roomStatus: input.roomStatus || null, updatedAt: new Date().toISOString() });
      return { request };
    }
    if (op === 'create_room') {
      const request = input.requestId ? state.requests[input.requestId] : null;
      if (request && request.toUserId !== userId) reject('REQUEST_FORBIDDEN', '邀请对象不匹配');
      const room = { id: randomUUID(), room_code: randomUUID().slice(0, 6).toUpperCase(), status: 'waiting',
        host_user_id: userId, host_account: user.account, host_pet_id: input.petId, host_pet_name: input.petName,
        host_resource_id: input.petResourceId, host_element: input.petElement, guest_user_id: null, guest_element: null,
        invitation_id: input.requestId || null, invited_user_id: request?.fromUserId || null,
        current_round: 1, last_resolved_round: 0, host_hp: 120, guest_hp: 120, host_anger: 0, guest_anger: 0,
        host_statuses: [], guest_statuses: [], host_free_dodge_used: false, guest_free_dodge_used: false,
        winner_side: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      state.rooms[room.id] = room; state.rounds[room.id] = []; return { room };
    }
    const room = getRoom(input);
    if (op === 'join_room') {
      if (room.invited_user_id && room.invited_user_id !== userId) reject('ROOM_FORBIDDEN', '房间邀请不匹配');
      if (room.guest_user_id && room.guest_user_id !== userId || room.host_user_id === userId) reject('ROOM_FULL', '房间已满');
      Object.assign(room, { guest_user_id: userId, guest_account: user.account, guest_pet_id: input.petId, guest_pet_name: input.petName,
        guest_resource_id: input.petResourceId, guest_element: input.petElement, status: 'active', updated_at: new Date().toISOString() });
      return { room };
    }
    const role = owned(room, user);
    if (op === 'get_room') return { room, rounds: state.rounds[room.id].filter(round => !input.beforeRound || round.round_no < input.beforeRound).slice(-(input.roundsLimit || 50)) };
    if (op === 'qa_set_state') {
      const presets = { charged: [85,50,100,30], finisher: [120,50,12,0], defending: [12,0,120,50] };
      if (room.current_round !== 1 || !presets[input.preset]) reject('QA_PRESET_INVALID', '仅支持未出招的场景');
      const peer = role === 'host' ? 'guest' : 'host';
      [room[`${role}_hp`],room[`${role}_anger`],room[`${peer}_hp`],room[`${peer}_anger`]]=presets[input.preset];
      room.qaPreset = input.preset; room.updated_at = new Date().toISOString(); return { room };
    }
    if (op === 'submit_action') {
      const prior = state.rounds[room.id].find(value => value.round_no === input.roundNo);
      if (prior) return { room, round: prior };
      if (room.status !== 'active' || input.roundNo !== room.current_round) reject('ROUND_CONFLICT', '回合不匹配');
      const key = `${room.id}:${input.roundNo}`;
      const actions = state.actions[key] ||= {};
      if (actions[role] && actions[role] !== input.action) reject('ACTION_LOCKED', '行动已锁定');
      actions[role] = input.action;
      if (!actions.host || !actions.guest) return { room, accepted: true };
      const session = roomState(room), result = executeRound(session, actions.host, actions.guest);
      saveRoomState(room, session);
      const pairs = values => ({ host: values.player, guest: values.enemy });
      const winner = result.winner === 'player' ? 'host' : result.winner === 'enemy' ? 'guest' : null;
      const round = { id: randomUUID(), room_id: room.id, round_no: result.round, host_action: result.actions.player, guest_action: result.actions.enemy,
        winner_side: winner, round_result: { hp_after: pairs(result.hpAfter), anger_after: pairs(result.angerAfter), damage_taken: pairs(result.damageTaken), direct_damage: pairs(result.directDamage),
          free_dodge_used: { host: session.player.freeDodgeUsed, guest: session.enemy.freeDodgeUsed },
          statuses_after: { host: statuses(result.statusesAfter.player), guest: statuses(result.statusesAfter.enemy) }, dot_damage_events: pairs(result.dotDamageEvents), heal_events: pairs(result.healEvents), winner_side: winner, notes: result.notes }, created_at: new Date().toISOString() };
      state.rounds[room.id].push(round); room.last_resolved_round = result.round; room.current_round = result.round + 1;
      if (winner) { room.status = 'finished'; room.winner_side = winner; }
      return { room, round };
    }
    if (op === 'claim_battle_settlement') {
      if (room.status !== 'finished' || !room.winner_side || input.petId !== room[`${role}_pet_id`]) reject('BATTLE_UNFINISHED', '结算条件不匹配');
      const key = `${room.id}:${userId}`, won = room.winner_side === role;
      const proof = state.claims[key] ||= { owner_account_id: userId, room_id: room.id, pet_id: input.petId, action_id: `battle:${room.id}:${userId}`, experience: won ? 20 : 5, won, authority: 'simulated', scenarioId: runId };
      return proof;
    }
    if (op === 'leave_room') { if (!['finished', 'abandoned'].includes(room.status)) room.status = 'abandoned'; return { room }; }
    reject('OP_UNSUPPORTED', `Unsupported isolated operation: ${op}`);
  }
  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers['x-qa-run'] !== runId || request.headers['x-qa-token'] !== token) reject('QA_TOKEN_INVALID', '场景令牌无效');
      let body = ''; for await (const chunk of request) { body += chunk; if (body.length > 32768) reject('BODY_TOO_LARGE', '请求过大'); }
      const result = dispatch(JSON.parse(body)); persist(); response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: true, ...result }));
    } catch (error) { response.writeHead(400, { 'content-type': 'application/json' }); response.end(JSON.stringify({ ok: false, code: error.code, message: error.message })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  persist();
  return { endpoint: `http://127.0.0.1:${server.address().port}/`, state, close: () => new Promise(resolve => server.close(resolve)) };
}
module.exports = { startQaDuelServer };
