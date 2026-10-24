const { randomUUID } = require("node:crypto");
const { BattleRuntimeService } = require("../../services/battle-runtime.cjs");
const { OnlineDuelService } = require("../../services/online-duel-service.cjs");
const { BattleStore, copy } = require("./store.cjs");
const { appearance2d, SHIBA_RESOURCE } = require("./assets.cjs");

const ACTIONS = new Set(["normal_attack", "element_attack", "dodge", "ultimate"]);
const ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ELEMENT_NAMES = { metal: "金", wood: "木", earth: "土", water: "水", fire: "火" };
const fail = (code, message) => Object.assign(new Error(message), { code });
const text = (value, name) => {
  if (typeof value !== "string" || !value.trim() || value.length > 160) throw fail("INVALID_INPUT", `${name}无效`);
  return value.trim();
};

class BattleFeatureService {
  constructor(services) {
    this.services = services;
    this.store = new BattleStore(services.db);
    this.online = services.legacy?.onlineDuelService || new OnlineDuelService();
    this.locks = new Map();
    this.unsubscribe = this.online.onEvent(event => {
      // Network notifications trigger a verified sync; their payload is never a settlement.
      services.events?.emit("battle:online", {
        type: event.type, at: event.at,
        roomId: event.payload?.roomId || event.payload?.room?.id || null,
        status: event.payload?.status || null
      });
    });
  }

  owner(context) {
    const owner = this.verifiedOwner();
    if (!owner || (context?.ownerAccountId && owner !== context.ownerAccountId)) {
      throw fail("AUTH_REQUIRED", "请先登录当前账号");
    }
    return owner;
  }

  user(owner) {
    const accounts = this.services.get("accounts");
    const user = accounts?.requireRuntimeUser ? accounts.requireRuntimeUser() : this.services.session.getCurrentUser();
    if (!user || (user.ownerAccountId || user.id) !== owner || !user.sessionToken) throw fail("ONLINE_LOGIN_REQUIRED", "请登录云端账号后使用好友对战");
    this.online.setCurrentUser(user);
    return user;
  }

  assertOwner(owner) {
    if (this.verifiedOwner() !== owner) throw fail("AUTH_CHANGED", "账号已切换，请重新打开对战");
  }

  verifiedOwner() {
    const accounts = this.services.get("accounts");
    return accounts?.getOwnerAccountId ? accounts.getOwnerAccountId() : this.services.session.getOwnerAccountId();
  }

  // Serialize commands per account, including ambiguous cloud responses.
  async serial(owner, task) {
    const previous = this.locks.get(owner) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => { this.assertOwner(owner); return task(); });
    this.locks.set(owner, next);
    try { return await next; }
    finally { if (this.locks.get(owner) === next) this.locks.delete(owner); }
  }

  ownedPet(owner, petId) {
    text(petId, "出战伙伴");
    const companions = this.services.get("companions");
    this.importOwnedLegacy(owner, companions);
    let pet = companions?.getPet?.(owner, petId);
    if (!pet && companions?.getOwnedPet) pet = companions.getOwnedPet({ ownerAccountId: owner, petId });
    if (!pet) {
      const legacy = this.services.legacy?.runtimeDataStore;
      const inventory = legacy?.getAuthSession?.()?.currentUser?.id === owner ? legacy.getInventorySnapshot() : null;
      pet = inventory?.pets?.find(item => item.id === petId);
    }
    if (!pet || (pet.ownerAccountId && pet.ownerAccountId !== owner)) throw fail("PET_NOT_OWNED", "当前账号没有这只伙伴");
    return {
      petId: pet.id || pet.petId, petName: typeof pet.name === "object" ? pet.name.zh : pet.name || pet.petName,
      element: ELEMENTS.has(pet.element) ? pet.element : "metal", level: pet.growth?.level || pet.level || 1,
      resourceRef: appearance2d(pet), resource: { resourceId: appearance2d(pet), kind: "2d" },
      appearance2d: appearance2d(pet),
      avatar: pet.avatar
    };
  }

  pets(owner) {
    const companions = this.services.get("companions");
    this.importOwnedLegacy(owner, companions);
    const legacy = this.services.legacy?.runtimeDataStore;
    const pets = companions?.listPets?.(owner) || (legacy?.getAuthSession?.()?.currentUser?.id === owner ? legacy.getInventorySnapshot()?.pets : []) || [];
    return pets.map(pet => this.ownedPet(owner, pet.id || pet.petId));
  }

  ownedLegacy(owner) {
    // Accounts maps old local IDs to local:<id>; read only its explicitly owned archive.
    if (this.services.get("accounts") && this.services.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_legacy_data'").get()) {
      const row = this.services.db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get(owner);
      return row ? JSON.parse(row.document) : null;
    }
    const legacy = this.services.legacy?.runtimeDataStore;
    if (legacy?.getAuthSession?.()?.currentUser?.id !== owner) return null;
    return { ...legacy.getInventorySnapshot(), battleReports: legacy.listBattleReports(200) };
  }

  importOwnedLegacy(owner, companions) {
    if (!companions?.importLegacyInventory) return;
    const inventory = this.ownedLegacy(owner);
    if (inventory?.pets) companions.importLegacyInventory(owner, inventory);
  }

  overview(_payload, context) {
    const owner = this.owner(context);
    const current = this.store.latest(owner);
    const status = this.online.getStatus();
    return {
      pets: this.pets(owner), session: current, selectedPetId: this.services.get("companions")?.getSelections?.(owner)?.battlePetId || null,
      online: { enabled: status.enabled, configured: status.configured, available: status.available },
      reports: this.listReports({}, { ownerAccountId: owner })
    };
  }

  requireSession(owner, sessionId) {
    const session = sessionId ? this.store.session(owner, text(sessionId, "对战编号")) : this.store.latest(owner);
    if (!session) throw fail("BATTLE_NOT_FOUND", "未找到当前账号的对战");
    return session;
  }

  startLocal(owner, input, mode, challenge) {
    const actionId = text(input.actionId, "操作编号");
    const old = this.store.action(owner, actionId);
    if (old) {
      if (old.command.type !== `start:${mode}` || old.command.petId !== input.petId || old.command.challengeId !== challenge.id) {
        throw fail("ACTION_CONFLICT", "这个操作编号已用于另一项操作");
      }
      return this.store.session(owner, old.sessionId);
    }
    if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "请先完成或离开当前对战");
    const player = this.ownedPet(owner, input.petId);
    const opponent = copy(challenge.opponent);
    if (!opponent?.petId || !ELEMENTS.has(opponent.element)) throw fail("INVALID_OPPONENT", "挑战对象信息不完整");
    opponent.appearance2d = appearance2d(opponent);
    const engine = new BattleRuntimeService();
    const session = {
      id: `battle-${randomUUID()}`, mode, status: "active", startedAt: new Date().toISOString(),
      player, enemy: opponent, snapshot: engine.reset({ playerElement: player.element, enemyElement: opponent.element }),
      rounds: [], winner: null, pendingAction: null, historyComplete: true,
      context: { ...copy(challenge), authority: "local", opponent: undefined }
    };
    return this.services.db.transaction(() => {
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "当前账号已有进行中的对战");
      this.selectPet({ petId: player.petId, actionId: `${actionId}:selection` }, { ownerAccountId: owner });
      this.store.reserve(owner, actionId, session.id, { type: `start:${mode}`, petId: player.petId, challengeId: challenge.id });
      const saved = this.store.save(owner, session);
      this.store.resolve(owner, actionId, saved);
      return saved;
    })();
  }

  startTraining(payload, context) {
    const owner = this.owner(context);
    if (!ELEMENTS.has(payload.enemyElement)) throw fail("INVALID_ELEMENT", "请选择训练对手的五行");
    return this.serial(owner, () => this.startLocal(owner, payload, "training", {
      id: `training:${payload.enemyElement}`,
      opponent: { petId: `training-${payload.enemyElement}`, petName: "焰柴", element: payload.enemyElement, level: 1, appearance2d: SHIBA_RESOURCE }
    }));
  }

  beginWildChallenge(input) {
    const owner = this.owner(input);
    if (this.locks.has(owner)) throw fail("BATTLE_BUSY", "对战操作正在处理中，请稍后重试");
    return this.startLocal(owner, input, "wild", input.challenge);
  }

  beginTerritoryChallenge(input) {
    const owner = this.owner(input);
    if (this.locks.has(owner)) throw fail("BATTLE_BUSY", "对战操作正在处理中，请稍后重试");
    // Only trusted main-process garden adapters can supply a defender.
    return this.startLocal(owner, input, "territory", input.challenge);
  }

  snapshot(payload, context) {
    const owner = this.owner(context);
    return this.requireSession(owner, payload.sessionId);
  }

  selectPet(payload, context) {
    const owner = this.owner(context);
    const pet = this.ownedPet(owner, payload.petId);
    const companions = this.services.get("companions");
    if (companions?.select) {
      const result = companions.select(owner, { actionId: text(payload.actionId, "操作编号"), petId: pet.petId, slot: "battlePetId" });
      if (result?.ok === false) throw fail(result.code, result.message);
    }
    return pet;
  }

  applyReward(owner, session, proof = null) {
    const existing = this.store.reward(owner, session.id);
    if (existing) return this.applySeeds(owner, session, existing);
    const experience = session.winner === "player" ? 20 : 5;
    const cloudOwner = session.mode === "friend" ? session.context?.cloudUserId || owner : owner;
    const actionId = `battle:${session.room?.id || session.id}:${cloudOwner}`;
    const reward = { actionId, petId: session.player.petId, experience, applied: false };
    if (session.mode === "friend" && !proof) return { ...reward, pendingReason: session.settlementError || "等待云端确认结算" };
    if (session.mode === "friend" && (proof.owner_account_id !== cloudOwner || proof.room_id !== session.room.id ||
        proof.pet_id !== session.player.petId || proof.action_id !== actionId ||
        proof.experience !== experience || proof.won !== (session.winner === "player"))) {
      throw fail("INVALID_SETTLEMENT_PROOF", "云端结算凭据与本场对战不一致");
    }
    const companions = this.services.get("companions");
    if (!companions?.awardBattleResult && !companions?.applyGrowthInTransaction) return { ...reward, pendingReason: "等待伙伴养成服务接入" };
    const previous = companions.getPet?.(owner, session.player.petId)?.growth;
    const result = companions.awardBattleResult ? companions.awardBattleResult({
      ownerAccountId: owner, petId: session.player.petId, actionId,
      won: session.winner === "player", experience, proof
    }) : companions.applyGrowthInTransaction(owner, {
      actionId, petId: session.player.petId,
      effect: { experience, wins: session.winner === "player" ? 1 : 0 }
    });
    if (result?.then) throw fail("ASYNC_TRANSACTION_ADAPTER", "养成结算适配必须在同一事务中同步执行");
    if (!result || result.ok === false) throw fail(result?.code || "REWARD_FAILED", result?.message || "伙伴经验结算失败");
    const growth = result.data?.pet?.growth || result.pet?.growth;
    const applied = { ...reward, actionId, petId: session.player.petId, experience, applied: true,
      ...(previous ? { previousExperience: previous.experience, previousLevel: previous.level } : {}),
      ...(growth ? { currentExperience: growth.experience, currentLevel: growth.level } : {})
    };
    this.store.saveReward(owner, session, applied);
    return this.applySeeds(owner, session, applied);
  }

  applySeeds(owner, session, reward) {
    const garden = this.services.get("garden");
    if (!reward.applied || reward.seeds || !garden?.grantSeeds) return reward;
    const result = garden.grantSeeds({ ownerAccountId: owner },
      { actionId: `${reward.actionId}:seeds`, receiptId: session.id, source: "battle" },
      { ownerAccountId: owner, id: session.id, source: "battle", eligible: true });
    if (result?.then) throw fail("ASYNC_TRANSACTION_ADAPTER", "种子结算适配必须同步执行");
    if (!result || (result.ok === false && result.code !== "REWARD_ALREADY_CLAIMED")) throw fail(result?.code || "SEED_REWARD_FAILED", result?.message || "种子奖励结算失败");
    const next = { ...reward, seeds: result.code === "REWARD_ALREADY_CLAIMED" ? { alreadyClaimed: true } : result.data || result };
    this.services.db.prepare("UPDATE battle_reward_receipts SET data_json=? WHERE owner_account_id=? AND session_id=?").run(JSON.stringify(next), owner, session.id);
    return next;
  }

  finish(owner, session, status = "finished", proof = null) {
    session.endedAt ||= new Date().toISOString();
    session.status = status;
    session.pendingAction = null;
    if (status === "finished" && session.winner) session.reward = this.applyReward(owner, session, proof);
    session.reportId = session.id;
    const saved = this.store.save(owner, session);
    this.store.saveReport(owner, {
      id: session.id, sessionId: session.id, mode: session.mode, status, winner: session.winner,
      player: session.player, enemy: session.enemy, startedAt: session.startedAt, endedAt: session.endedAt,
      rounds: session.rounds, reward: session.reward || null, historyComplete: session.historyComplete,
      context: session.context
    });
    return saved;
  }

  act(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      const actionId = text(payload.actionId, "操作编号");
      if (!ACTIONS.has(payload.action)) throw fail("INVALID_ACTION", "无效的战斗行动");
      let session = this.requireSession(owner, payload.sessionId);
      const receipt = this.store.action(owner, actionId);
      if (receipt) {
        if (receipt.sessionId !== session.id || receipt.command.action !== payload.action) throw fail("ACTION_CONFLICT", "操作编号与原行动不一致");
        if (receipt.result) return this.store.session(owner, receipt.sessionId);
      }
      if (session.status !== "active") throw fail("BATTLE_NOT_ACTIVE", "当前对战不能提交行动");
      if (payload.expectedRound != null && payload.expectedRound !== session.snapshot.round + 1 && !receipt) throw fail("ROUND_CONFLICT", "回合已更新，请先同步");
      if (session.pendingAction && session.pendingAction.actionId !== actionId) throw fail("ACTION_PENDING", "本回合行动已锁定，请等待对手或重新同步");
      if (session.mode === "friend") return this.actOnline(owner, session, { ...payload, actionId }, receipt);
      return this.services.db.transaction(() => {
        if (!receipt) this.store.reserve(owner, actionId, session.id, { action: payload.action, roundNo: session.snapshot.round + 1 });
        const engine = new BattleRuntimeService();
        engine.restore(session.snapshot);
        const result = engine.act(payload.action);
        session.snapshot = result.state;
        session.rounds.push({ ...result.roundResult, state: result.state });
        session.winner = result.roundResult.winner;
        session = session.winner ? this.finish(owner, session) : this.store.save(owner, session);
        this.store.resolve(owner, actionId, session);
        return session;
      })();
    });
  }

  async actOnline(owner, session, payload, receipt) {
    this.user(owner);
    if (this.online.getStatus().room?.id !== session.room.id) await this.online.syncRoom({ roomId: session.room.id, roundsLimit: 50 });
    this.assertOwner(owner);
    const roundNo = receipt?.command.roundNo || session.room.current_round;
    if (!receipt) this.store.reserve(owner, payload.actionId, session.id, { action: payload.action, roundNo });
    session.pendingAction = { actionId: payload.actionId, action: payload.action, roundNo, uncertain: true };
    this.store.save(owner, session);
    try {
      await this.online.submitAction({ action: payload.action, roundNo, waitForResolution: false });
      this.assertOwner(owner);
      session = this.requireSession(owner, session.id);
      if (session.pendingAction) session.pendingAction.uncertain = false;
      this.store.save(owner, session);
      return await this.syncInternal(owner, session);
    } catch (error) {
      // Keep the original action/round for recovery. Never retry as a fresh action.
      this.assertOwner(owner);
      throw fail("ONLINE_ACTION_UNCERTAIN", `行动结果待确认，请同步原回合。${friendlyError(error)}`);
    }
  }

  retryAction(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      let session = this.requireSession(owner, payload.sessionId);
      if (!session.pendingAction || session.mode !== "friend") throw fail("NO_PENDING_ACTION", "当前没有待确认的原行动");
      // Sync first: a resolved last round must never become a command for the next round.
      session = await this.syncInternal(owner, session);
      if (!session.pendingAction) return session;
      const pending = session.pendingAction;
      return this.actOnline(owner, session, pending, this.store.action(owner, pending.actionId));
    });
  }

  async search(payload, context) {
    const owner = this.owner(context); this.user(owner);
    const result = await this.online.searchAccounts({ keyword: String(payload.keyword || "").trim().slice(0, 80), limit: 20 });
    this.assertOwner(owner);
    return result.users.map(({ id, account, username }) => ({ id, account, username }));
  }

  async invitations(_payload, context) {
    const owner = this.owner(context); this.user(owner);
    const result = await this.online.listDuelRequests();
    this.assertOwner(owner);
    return { inbound: result.inbound, outbound: result.outbound };
  }

  async invite(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      this.ownedPet(owner, payload.petId);
      const result = await this.online.sendDuelRequest({ targetAccount: text(payload.targetAccount, "对方账号"), allowResend: Boolean(payload.allowResend) });
      this.assertOwner(owner);
      if (result.ok === false) throw fail("INVITE_COOLDOWN", result.retryAfterSeconds ? `请在 ${result.retryAfterSeconds} 秒后重发` : "邀请发送失败");
      // Persist chosen combatant separately from desktop/chat selection.
      if (result.request?.id) {
        const key = `invite:${result.request.id}`;
        if (!this.store.action(owner, key)) {
          this.store.reserve(owner, key, key, { petId: payload.petId, type: "invite" });
        }
      }
      return result.request;
    });
  }

  async cancelInvite(payload, context) {
    const owner = this.owner(context); this.user(owner);
    const result = await this.online.cancelDuelRequest({ requestId: text(payload.requestId, "邀请编号") });
    this.assertOwner(owner);
    return result.request;
  }

  async respondInvite(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      const requestId = text(payload.requestId, "邀请编号");
      if (!["accept", "reject"].includes(payload.decision)) throw fail("INVALID_DECISION", "请选择接受或婉拒");
      const requests = await this.online.listDuelRequests();
      this.assertOwner(owner);
      const request = requests.inbound.find(item => item.id === requestId);
      if (!request) throw fail("INVITE_NOT_FOUND", "未找到发给当前账号的邀请");
      if (payload.decision === "reject") {
        const rejected = await this.online.respondDuelRequest({ requestId, decision: "reject" });
        this.assertOwner(owner);
        return { request: rejected.request, session: null };
      }
      if (request.status === "accepted" && request.roomId) {
        const saved = this.store.roomSession(owner, request.roomId);
        return { request, session: saved ? await this.syncInternal(owner, saved) : await this.joinInternal(owner, { ...payload, roomCode: request.roomCode }) };
      }
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "请先完成当前对战再接受邀请");
      const pet = this.ownedPet(owner, payload.petId);
      // Reuse a room after a lost response; do not create a second room for one acceptance.
      const key = `accept:${requestId}`;
      let pending = this.store.action(owner, key)?.result;
      if (!pending) {
        const created = await this.online.createRoom({ petId: pet.petId, requestId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element });
        this.assertOwner(owner);
        pending = { room: created.room };
        if (!this.store.action(owner, key)) this.store.reserve(owner, key, key, { petId: payload.petId, type: "accept" });
        this.store.resolve(owner, key, pending);
      }
      const accepted = await this.online.respondDuelRequest({ requestId, decision: "accept", roomId: pending.room.id, roomCode: pending.room.room_code, roomStatus: pending.room.status });
      this.assertOwner(owner);
      const synced = await this.online.syncRoom({ roomId: pending.room.id, roundsLimit: 50 });
      this.assertOwner(owner);
      return { request: accepted.request, session: this.bindRoom(owner, synced.room, payload.petId) };
    });
  }

  bindRoom(owner, room, petId) {
    const existing = this.store.roomSession(owner, room.id);
    if (existing) return existing;
    const player = this.ownedPet(owner, petId);
    const user = this.user(owner);
    const side = room.host_user_id === user.id ? "host" : room.guest_user_id === user.id ? "guest" : null;
    if (!side) throw fail("ROOM_FORBIDDEN", "当前账号不是房间参与者");
    const peer = side === "host" ? "guest" : "host";
    if (room[`${side}_element`] !== player.element) throw fail("PET_ROOM_MISMATCH", "该伙伴五行与房间不一致，请使用原出战伙伴");
    if (room[`${side}_pet_id`] && room[`${side}_pet_id`] !== player.petId) throw fail("PET_ROOM_MISMATCH", "请使用房间绑定的原出战伙伴");
    const session = {
      id: `online-${room.id}`, mode: "friend", status: room.status === "waiting" ? "waiting" : "active",
      startedAt: room.created_at || new Date().toISOString(), player,
      enemy: { petId: room[`${peer}_pet_id`] || room[`${peer}_user_id`] || "waiting-peer", petName: room[`${peer}_pet_name`] || "等待好友", element: room[`${peer}_element`] || "wood", appearance2d: room[`${peer}_resource_id`] || appearance2d({ element: room[`${peer}_element`] }) },
      snapshot: this.online.toBattleState(), room: copy(room), side,
      rounds: [], winner: null, pendingAction: null, historyComplete: true,
      context: { authority: "supabase", cloudUserId: user.id }
    };
    return this.store.save(owner, session);
  }

  async createRoom(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      this.user(owner);
      if (this.store.latest(owner)) throw fail("BATTLE_IN_PROGRESS", "已有待完成的对战，请先恢复或离开");
      const pet = this.ownedPet(owner, payload.petId);
      const created = await this.online.createRoom({ petId: pet.petId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element });
      this.assertOwner(owner);
      return this.bindRoom(owner, created.room, pet.petId);
    });
  }

  joinRoom(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => this.joinInternal(owner, payload));
  }

  async joinInternal(owner, payload) {
    this.user(owner);
    const active = this.store.latest(owner);
    const roomCode = text(payload.roomCode, "房间码").toUpperCase();
    if (active && active.room?.room_code !== roomCode) throw fail("BATTLE_IN_PROGRESS", "请先完成或离开当前对战");
    const petId = payload.requestId ? this.store.action(owner, `invite:${payload.requestId}`)?.command.petId || payload.petId : payload.petId;
    const pet = this.ownedPet(owner, petId);
    const joined = await this.online.joinRoom({ roomCode, petId: pet.petId, petResourceId: pet.appearance2d, petName: pet.petName, petElement: pet.element });
    this.assertOwner(owner);
    return this.syncInternal(owner, this.bindRoom(owner, joined.room, pet.petId));
  }

  sync(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => this.syncInternal(owner, this.requireSession(owner, payload.sessionId)));
  }

  async syncInternal(owner, session) {
    if (session.mode !== "friend") return session;
    this.user(owner);
    const response = await this.online.syncRoom({ roomId: session.room.id, roundsLimit: 50 });
    this.assertOwner(owner);
    session = this.requireSession(owner, session.id);
    let room = response.room;
    const rounds = new Map(session.rounds.map(round => [round.round, round]));
    let page = response.rounds || [];
    for (let pageNo = 0; pageNo < 100; pageNo++) {
      for (const round of page) {
        const mapped = this.online.mapRoundToBattleResult(round);
        rounds.set(round.round_no, { ...mapped.roundResult, state: mapped.state });
      }
      // Pagination awaits can also receive a newer room through get_room or Realtime.
      // Include its new rounds before declaring the saved history complete.
      const liveRoom = this.online.getStatus().room;
      if (liveRoom?.id === room.id) room = liveRoom;
      const last = Number(room.last_resolved_round || 0);
      let missing = 1;
      while (missing <= last && rounds.has(missing)) missing++;
      if (missing > last) break;
      const before = Math.min(last + 1, ...[...rounds.keys()].filter(number => number > missing));
      const earlier = await this.online.syncRoom({ roomId: room.id, roundsLimit: 50, beforeRound: before });
      this.assertOwner(owner);
      page = (earlier.rounds || []).filter(round => round.round_no < before && !rounds.has(round.round_no));
      if (!page.length) break;
    }
    const latestRoom = this.online.getStatus().room;
    if (latestRoom?.id === room.id) room = latestRoom;
    session.room = copy(room);
    session.snapshot = this.online.toBattleState();
    const peer = session.side === "host" ? "guest" : "host";
    session.enemy = { ...session.enemy, petId: room[`${peer}_pet_id`] || room[`${peer}_user_id`] || "waiting-peer", petName: room[`${peer}_pet_name`] || "等待好友", element: room[`${peer}_element`] || "wood", appearance2d: room[`${peer}_resource_id`] || appearance2d({ element: room[`${peer}_element`] }) };
    session.rounds = [...rounds.values()].sort((a, b) => a.round - b.round);
    session.historyComplete = session.rounds.length === Number(room.last_resolved_round || 0) && session.rounds.every((round, index) => round.round === index + 1);
    const pending = session.pendingAction;
    if (pending && rounds.has(pending.roundNo)) {
      session.pendingAction = null;
    }
    session.winner = room.winner_side === session.side ? "player" : room.winner_side ? "enemy" : null;
    let proof = null;
    if (room.status === "finished" && session.winner && !this.store.reward(owner, session.id)) {
      const user = this.user(owner);
      try {
        proof = await this.online.invoke("claim_battle_settlement", { userId: user.id, sessionToken: user.sessionToken, roomId: room.id, petId: session.player.petId });
        this.assertOwner(owner);
      } catch (error) {
        this.assertOwner(owner);
        session.settlementError = friendlyError(error);
      }
    }
    return this.services.db.transaction(() => {
      if (room.status === "finished") session = this.finish(owner, session, "finished", proof);
      else if (room.status === "abandoned") session = this.finish(owner, session, "abandoned");
      else { session.status = room.status === "waiting" ? "waiting" : "active"; session = this.store.save(owner, session); }
      if (pending && rounds.has(pending.roundNo)) this.store.resolve(owner, pending.actionId, session);
      return session;
    })();
  }

  leave(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, async () => {
      let session = this.requireSession(owner, payload.sessionId);
      if (["finished", "abandoned"].includes(session.status)) return session;
      if (session.mode === "friend") {
        const user = this.user(owner);
        // Unlike the compatibility service's best-effort leave, require server acknowledgment.
        const result = await this.online.invoke("leave_room", { userId: user.id, sessionToken: user.sessionToken, roomId: session.room.id, reason: "user_leave" });
        this.assertOwner(owner);
        if (result.room?.status === "finished") return this.syncInternal(owner, session);
        session.room = result.room || session.room;
        await this.online.clearRoomState({ notify: true, reason: "left" });
        this.assertOwner(owner);
      }
      return this.services.db.transaction(() => this.finish(owner, session, "abandoned"))();
    });
  }

  retrySettlement(payload, context) {
    const owner = this.owner(context);
    return this.serial(owner, () => {
      const session = this.requireSession(owner, payload.sessionId);
      if (session.status !== "finished" || !session.winner) throw fail("BATTLE_UNFINISHED", "这场对战还没有可领取的结算");
      return session.mode === "friend" ? this.syncInternal(owner, session) : this.services.db.transaction(() => this.finish(owner, session))();
    });
  }

  listReports(payload, context) {
    const owner = this.owner(context);
    const reports = this.store.reports(owner, payload.limit);
    const legacy = this.ownedLegacy(owner)?.battleReports || [];
    const known = new Set(reports.map(report => report.sessionId));
    for (const report of legacy) {
      if (!known.has(report.sessionId)) reports.push({ ...report, id: `legacy:${report.id}`, legacy: true, historyComplete: false,
        endedAt: report.endedAt || report.startedAt || '',
        rounds: (report.rounds || []).map(round => ({ ...round, actions: round.actions || { player: round.playerAction, enemy: round.enemyAction } }))
      });
    }
    return reports.sort((a, b) => b.endedAt.localeCompare(a.endedAt)).slice(0, Math.max(1, Math.min(200, Number(payload.limit) || 60)));
  }

  getReport(payload, context) {
    const owner = this.owner(context);
    const report = this.store.report(owner, text(payload.reportId, "战报编号")) || this.listReports({ limit: 200 }, context).find(item => item.id === payload.reportId);
    if (!report) throw fail("REPORT_NOT_FOUND", "未找到当前账号的战报");
    return report;
  }

  getOutcome(input) {
    const owner = this.owner(input);
    const session = this.requireSession(owner, input.sessionId);
    return { session, won: session.status === "finished" && session.winner === "player", settled: session.status === "finished" };
  }

  settleTerritoryChallenge(input) {
    const outcome = this.getOutcome(input);
    if (outcome.session.mode !== "territory" || !outcome.settled) throw fail("TERRITORY_BATTLE_UNFINISHED", "领地挑战尚未完成");
    return { ...outcome, receipt: {
      id: outcome.session.id, actionId: `territory:${outcome.session.id}`, ownerAccountId: this.owner(input),
      territoryId: outcome.session.context?.territoryId || outcome.session.context?.id,
      petId: outcome.session.player.petId, won: outcome.won, authority: outcome.session.context?.authority, verified: true
    } };
  }

  dispose() { this.unsubscribe?.(); }
}

function friendlyError(error) {
  const message = String(error?.message || error || "服务暂不可用");
  if (/fetch|network|timeout|Failed to send|non-2xx/i.test(message)) return "网络或联机服务暂不可用";
  if (/session|login required/i.test(message)) return "登录状态已失效，请重新登录";
  if (/Unsupported op|schema cache|function.*does not exist/i.test(message)) return "联机服务需要更新战斗恢复与结算接口";
  return message.slice(0, 200);
}
module.exports = { BattleFeatureService, friendlyError };
