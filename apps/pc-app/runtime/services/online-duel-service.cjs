const BATTLE_RULES = require('./battle-runtime.cjs').getBattleRules();
const { setTimeout: sleep } = require("node:timers/promises");

const { randomUUID } = require('node:crypto');

const DEFAULT_WAIT_TIMEOUT_MS = 12000;
const DEFAULT_WAIT_INTERVAL_MS = 350;

class OnlineDuelService {
  constructor(options = {}) {
    // Production connectivity is supplied exclusively by08's current Auth SDK.
    // The loopback adapter is separately gated by the isolated QA profile.
    this.isolatedQa = options.isolatedQa === true;
    this.supabaseUrl = null;
    this.functionName = 'lingjing-battle';
    this.available = true;
    this.availabilityError = null;
    this.configured = this.isolatedQa;
    this.enabled = this.configured;

    this.client = null;
    this.channel = null;
    this.channelRoomId = null;
    this.subscriptionTask = null;
    this.listeners = new Set();
    this.displayMetadataListeners = new Set();
    this.currentUser = null;
    this.room = null;
    this.side = null;
    this.roundCache = new Map();
    this.cloudProvider = null;
    this.cloudActor = null;
    this.authGeneration = 0;

    if (options.cloudProvider) this.useCloudTransport(options.cloudProvider);
  }

  /** Main-process accounts owns SDK sessions/refresh/device credentials. This class only
   * consumes the verified transport; no new password/JWT store or renderer token channel. */
  useCloudTransport(provider, options = {}) {
    if (typeof provider !== 'function') throw new Error('Cloud transport provider is required');
    this.authGeneration++;
    void this.clearRoomState({ notify: true, reason: 'transport-changed' });
    this.client?.realtime?.disconnect?.();
    this.client = null;
    this.cloudProvider = provider;
    this.cloudActor = null;
    this.cloudIdentity = null; this.cloudInvoker = null;
    this.functionName = options.functionName || 'lingjing-battle';
    this.available = true; this.configured = true; this.enabled = true;
  }

  async refreshCloudTransport() {
    if (!this.cloudProvider) return;
    const generation = this.authGeneration, owner = this.currentUser?.id;
    const transport = await this.cloudProvider();
    const actor = transport?.actor;
    if (generation !== this.authGeneration || owner !== this.currentUser?.id) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
    if (!owner || actor?.schemaVersion !== 1 || actor.authority !== 'live' || actor.authKind !== 'supabase' || actor.ownerAccountId !== owner || !actor.authUserId || !actor.deviceId || !actor.sessionId || !transport.client?.functions?.invoke || !transport.client?.realtime?.setAuth) throw Object.assign(new Error('云端身份尚未就绪'), { code: 'CLOUD_AUTH_UNAVAILABLE' });
    const endpoint = new URL(transport.url);
    if (endpoint.protocol !== 'https:') throw Object.assign(new Error('云端连接必须使用 HTTPS'), { code: 'CLOUD_HTTPS_REQUIRED' });
    const identity = [endpoint.origin, owner, actor.deviceId, actor.sessionId].join('|');
    if (!this.client || this.cloudIdentity !== identity) {
      const previous = this.client, channel = this.channel; this.channel = null;
      if (previous && channel) await this.removeRoomChannel(previous, channel).catch(() => {});
      if (generation !== this.authGeneration) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
      this.client = transport.client;
      this.cloudIdentity = identity;
    }
    this.cloudInvoker = typeof transport.invoke === 'function' ? transport.invoke : null;
    this.supabaseUrl = endpoint.origin;
    this.cloudActor = Object.freeze({ schemaVersion: 1, authority: 'live', authKind: 'supabase', authUserId: actor.authUserId, ownerAccountId: owner, deviceId: actor.deviceId, sessionId: actor.sessionId, account: actor.account, username: actor.username });
    // SDK's accessToken callback is refreshed by accounts. setAuth() reauthorizes all
    // existing subscriptions and does not expose an access/refresh token to the caller.
    await this.client.realtime.setAuth();
    if (generation !== this.authGeneration) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
  }

  onEvent(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onDisplayMetadata(listener) {
    this.displayMetadataListeners.add(listener);
    return () => this.displayMetadataListeners.delete(listener);
  }

  emit(event, payload = {}) {
    const message = {
      type: event,
      at: new Date().toISOString(),
      payload
    };
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch {
        // Keep event fanout non-blocking.
      }
    }
  }

  getStatus() {
    return {
      enabled: this.enabled,
      available: this.available,
      availabilityError: this.availabilityError,
      configured: this.configured,
      hasSupabaseUrl: Boolean(this.supabaseUrl),
      hasSupabasePublishableKey: Boolean(this.cloudActor),
      room: this.room ? { ...this.room } : null,
      side: this.side,
      currentUser: this.currentUser ? { id: this.currentUser.id, account: this.currentUser.account, username: this.currentUser.username } : null,
      authKind: this.cloudProvider ? 'supabase' : this.isolatedQa ? 'isolated-qa' : 'unavailable',
      actor: this.cloudActor ? { ...this.cloudActor } : null
    };
  }

  hasActiveRoom() {
    return Boolean(this.room?.id && this.side);
  }

  setCurrentUser(user) {
    const normalized = normalizeUser(user);
    const prevUserId = this.currentUser?.id || null;
    this.currentUser = normalized;
    if (prevUserId !== normalized?.id) this.authGeneration++;

    if (!normalized) {
      this.cloudActor = null;
      if (this.cloudProvider) this.client?.realtime?.disconnect?.();
      void this.clearRoomState({ notify: true, reason: "user-cleared" });
      return;
    }

    if (prevUserId && prevUserId !== normalized.id && this.room) {
      const side = resolveUserSide(this.room, normalized.id);
      if (!side) {
        void this.clearRoomState({ notify: true, reason: "user-switched" });
      } else {
        this.side = side;
      }
    }
  }

  async createRoom(payload = {}) {
    this.ensureEnabled();
    this.requireUser();

    const response = await this.invoke("create_room", {
      actionId: normalizeString(payload.actionId) || randomUUID(),
      petId: normalizeString(payload.petId),
      requestId: normalizeString(payload.requestId),
      ...(this.isolatedQa ? { petResourceId: normalizeString(payload.petResourceId), petElement: normalizeElement(payload.petElement) || 'metal', petName: normalizePetName(payload.petName) } : {})
    });

    this.applyRoom(response.room);
    await this.subscribeRoom();
    this.emit("room-updated", {
      room: this.room,
      side: this.side
    });

    return {
      ok: true,
      room: this.room,
      side: this.side
    };
  }

  async joinRoom(payload = {}) {
    this.ensureEnabled();
    this.requireUser();
    const roomCode = normalizeRoomCode(payload.roomCode);
    if (!roomCode) {
      throw new Error("roomCode is required");
    }

    const response = await this.invoke("join_room", {
      actionId: normalizeString(payload.actionId) || randomUUID(),
      roomCode,
      petId: normalizeString(payload.petId),
      ...(this.isolatedQa ? { petResourceId: normalizeString(payload.petResourceId), petElement: normalizeElement(payload.petElement) || 'metal', petName: normalizePetName(payload.petName) } : {})
    });

    this.applyRoom(response.room);
    await this.subscribeRoom();
    this.emit("room-updated", {
      room: this.room,
      side: this.side
    });

    return {
      ok: true,
      room: this.room,
      side: this.side
    };
  }

  async syncRoom(options = {}) {
    this.ensureEnabled();
    this.requireUser();
    const roomId = options.roomId || this.room?.id;
    const roomCode = options.roomCode || this.room?.room_code;
    if (!roomId && !roomCode) {
      throw new Error("roomId or roomCode is required");
    }

    const response = await this.invoke("get_room", {
      roomId,
      roomCode,
      roundsLimit: clampRoundsLimit(options.roundsLimit),
      ...(options.beforeRound ? { beforeRound: options.beforeRound } : {})
    });

    const needsSubscription = !this.channel || this.channelRoomId !== response.room?.id || !['joined', 'joining'].includes(this.channel.state);
    this.applyRoom(response.room);
    this.cacheRounds(response.rounds);
    if (needsSubscription && this.side) await this.subscribeRoom();
    this.emit("room-synced", {
      room: this.room,
      side: this.side
    });

    return {
      ok: true,
      room: this.room,
      side: this.side,
      pendingAction: response.pendingAction || null,
      rounds: Array.isArray(response.rounds) ? response.rounds.map(normalizeRound) : []
    };
  }

  async resetBattle() {
    this.ensureEnabled();
    if (!this.room?.id) {
      throw new Error("online room not ready");
    }
    await this.syncRoom({ roomId: this.room.id, roundsLimit: 3 });
    if (this.room.status === "waiting") {
      throw new Error("room is waiting for opponent");
    }
    return this.toBattleState();
  }

  async submitAction(input = {}) {
    this.ensureEnabled();
    this.requireUser();
    const room = this.requireRoom();
    const action = normalizeAction(input.action);
    if (!action) {
      throw new Error("invalid action");
    }

    // An ambiguous network response must retry the original round, never the next one.
    const roundNo = Number(input.roundNo || room.current_round);
    const response = await this.invoke("submit_action", {
      actionId: normalizeString(input.actionId) || randomUUID(),
      roomId: room.id,
      action,
      roundNo
    });

    if (response.room) {
      this.applyRoom(response.room);
    }

    let resolvedRound = response.round ? normalizeRound(response.round) : null;
    if (!resolvedRound && input.waitForResolution === false) {
      return { pending: true, accepted: true, roundNo, state: this.toBattleState() };
    }
    if (!resolvedRound) {
      resolvedRound = await this.waitForResolvedRound(roundNo);
    }

    if (!resolvedRound) {
      throw new Error("round resolution timeout");
    }

    this.roundCache.set(resolvedRound.round_no, resolvedRound);
    await this.syncRoom({ roomId: room.id, roundsLimit: 6 });

    const mapped = this.mapRoundToBattleResult(resolvedRound);
    this.emit("round-resolved", {
      room: this.room,
      round: resolvedRound,
      side: this.side
    });
    return mapped;
  }

  async searchAccounts(payload = {}) {
    this.ensureEnabled();
    this.requireUser();
    const keyword = normalizeString(payload.keyword) || "";
    const limit = Number.isInteger(Number(payload.limit)) ? Number(payload.limit) : 12;
    const response = await this.invoke("search_accounts", {
      keyword,
      limit
    });
    const users = Array.isArray(response.users)
      ? response.users.map(normalizeUser).filter(Boolean)
      : [];
    return {
      ok: true,
      users
    };
  }

  async sendDuelRequest(payload = {}) {
    this.ensureEnabled();
    this.requireUser();
    const targetAccount = normalizeString(payload.targetAccount) || "";
    const allowResend = Boolean(payload.allowResend);
    const response = await this.invoke("send_duel_request", {
      actionId: normalizeString(payload.actionId) || randomUUID(),
      targetAccount,
      allowResend
    });
    const retryAfterSeconds =
      Number.isFinite(Number(response.retryAfterSeconds)) && Number(response.retryAfterSeconds) > 0
        ? Math.ceil(Number(response.retryAfterSeconds))
        : undefined;
    if (allowResend && !response.resent && retryAfterSeconds) {
      return {
        ok: false,
        error: "resend too frequent",
        retryAfterSeconds,
        request: normalizeRuntimeDuelRequest(response.request)
      };
    }
    return {
      ok: true,
      resent: Boolean(response.resent),
      retryAfterSeconds,
      request: normalizeRuntimeDuelRequest(response.request)
    };
  }

  async listDuelRequests() {
    this.ensureEnabled();
    this.requireUser();
    const response = await this.invoke("list_duel_requests", {
    });
    return {
      ok: true,
      inbound: Array.isArray(response.inbound)
        ? response.inbound.map(normalizeRuntimeDuelRequest).filter(Boolean)
        : [],
      outbound: Array.isArray(response.outbound)
        ? response.outbound.map(normalizeRuntimeDuelRequest).filter(Boolean)
        : []
    };
  }

  async respondDuelRequest(payload = {}) {
    this.ensureEnabled();
    this.requireUser();
    const requestId = normalizeString(payload.requestId) || "";
    const decision = normalizeString(payload.decision) || "";
    const response = await this.invoke("respond_duel_request", {
      actionId: normalizeString(payload.actionId) || `${decision}:${requestId}`,
      requestId,
      decision,
      roomId: normalizeString(payload.roomId) || null,
      roomCode: normalizeRoomCode(payload.roomCode),
      roomStatus: normalizeRuntimeRoomStatus(payload.roomStatus)
    });
    return {
      ok: true,
      request: normalizeRuntimeDuelRequest(response.request)
    };
  }

  async cancelDuelRequest(payload = {}) {
    this.ensureEnabled();
    this.requireUser();
    const requestId = normalizeString(payload.requestId) || "";
    const response = await this.invoke("cancel_duel_request", {
      actionId: normalizeString(payload.actionId) || `cancel:${requestId}`,
      requestId
    });
    return {
      ok: true,
      request: normalizeRuntimeDuelRequest(response.request)
    };
  }

  async leaveRoom(options = {}) {
    const room = this.room;
    const user = this.currentUser;

    if (this.enabled && room?.id && user?.id) {
      try {
        await this.invoke("leave_room", {
          actionId: normalizeString(options.actionId) || `leave:${room.id}`,
          roomId: room.id,
          reason: normalizeString(options.reason) || "client_leave"
        });
      } catch {
        // Best effort leave.
      }
    }

    await this.clearRoomState({ notify: true, reason: "left" });
    return {
      ok: true
    };
  }

  async clearRoomState(options = {}) {
    this.room = null;
    this.side = null;
    this.channelRoomId = null;
    this.roundCache.clear();

    if (this.channel && this.client) {
      const current = this.channel;
      this.channel = null;
      try {
        await this.removeRoomChannel(this.client, current);
      } catch {
        // Ignore remove failures.
      }
    }

    if (options.notify) {
      this.emit("room-cleared", {
        reason: normalizeString(options.reason) || "unknown"
      });
    }
  }

  async removeRoomChannel(client, channel) {
    await client.removeChannel(channel);
    // realtime-js2.98 disconnect().teardown() clears the channel's close
    // binding. removeChannel then leaves that closed object in its topic cache,
    // and channel(topic) returns the unusable object. Evict only that stale
    // registration, after the normal unsubscribe and before creating its replacement.
    // Never clear the shared SDK's other feature subscriptions.
    const registered = client.getChannels?.();
    if (registered?.includes(channel) && registered.every(value => value === channel || value.topic !== channel.topic)) {
      client.realtime?._remove?.(channel);
    }
  }

  ensureEnabled() {
    if (!this.enabled || (!this.cloudProvider && !this.isolatedQa)) {
      throw Object.assign(new Error('云端对战需要统一登录连接'), { code: 'CLOUD_AUTH_UNAVAILABLE' });
    }
  }

  requireUser() {
    if (!this.currentUser?.id) {
      throw new Error("login required");
    }
    return this.currentUser;
  }

  requireRoom() {
    if (!this.room?.id || !this.side) {
      throw new Error("online room not ready");
    }
    return this.room;
  }

  async invoke(op, payload = {}) {
    this.ensureEnabled();
    if (this.cloudProvider) return this.invokeCloud(op, payload);
    throw Object.assign(new Error('隔离验收传输未注入'), { code: 'QA_TRANSPORT_REQUIRED' });
  }

  async invokeCloud(op, payload) {
    if (['register_account','login_account','update_account'].includes(op)) throw Object.assign(new Error('账号操作由统一 Auth 服务处理'), { code: 'USE_SHARED_AUTH_BRIDGE' });
    await this.refreshCloudTransport();
    const generation = this.authGeneration;
    const requestBody = { ...payload, op };
    // Authorization comes only from accounts' SDK JWT/device headers.
    for (const key of ['userId', 'userAccount', 'sessionToken', 'ownerAccountId', 'authUserId', 'actor', 'petElement', 'petResourceId', 'petName']) delete requestBody[key];
    let data, error;
    if (this.cloudInvoker) {
      try { data = { ok: true, data: await this.cloudInvoker(this.functionName, requestBody) }; }
      catch (failure) { error = failure; data = { ok: false, code: failure.code, message: failure.message }; }
    } else ({ data, error } = await this.client.functions.invoke(this.functionName, { body: requestBody, timeout: 12000 }));
    if (generation !== this.authGeneration) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
    let failed = data;
    if (error) { try { const parsed=await error.context?.clone?.().json();if(parsed)failed=parsed; } catch { /* network/response-read interruption */ } }
    if (error || failed?.ok === false) {
      const code = failed?.code || failed?.error?.code || 'BATTLE_CLOUD_UNAVAILABLE';
      const message = failed?.message || failed?.error?.message || (error ? await resolveFunctionErrorMessage(error, '云端对战请求未完成') : '云端对战请求未完成');
      await this.handleSessionInvalidatedIfNeeded(code);
      throw Object.assign(new Error(message), { code });
    }
    const value = data?.ok === true ? data.data : data;
    if (!value || typeof value !== 'object') throw new Error('云端对战响应无效');
    // Sidecar identity is main-process view data, never part of an original
    // command result/receipt, room, session or saved envelope.
    if (Object.hasOwn(value, 'displayMetadata')) {
      const { displayMetadata, ...original } = value;
      for (const listener of this.displayMetadataListeners) {
        try { listener(displayMetadata, this.cloudActor.ownerAccountId); } catch { /* Optional view data cannot fail a committed command. */ }
      }
      return original;
    }
    return value;
  }

  async handleSessionInvalidatedIfNeeded(message) {
    const lower = typeof message === "string" ? message.toLowerCase() : "";
    const invalidated =
      /auth_required|auth_invalid|session_revoked|device_session_required|device_required|identity_required|actor_invalid/.test(lower) ||
      lower.includes("session invalidated") ||
      lower.includes("session token is required") ||
      lower.includes("invalid session token");
    if (!invalidated || !this.currentUser) return;
    const previousUser = this.currentUser;
    this.currentUser = null;
    this.authGeneration++; this.cloudActor = null;
    if (this.cloudProvider) this.client?.realtime?.disconnect?.();
    await this.clearRoomState({ notify: true, reason: "session-invalidated" });
    this.emit("session-invalidated", {
      userId: previousUser.id,
      account: previousUser.account
    });
  }

  async subscribeRoom() {
    // UI sync and round readback can overlap after a socket reconnect. Serialize
    // channel replacement, then recheck state so one subscriber cannot remove
    // another subscriber's newly joined channel.
    const generation = this.authGeneration, roomId = this.requireRoom().id;
    const previous = this.subscriptionTask || Promise.resolve();
    const task = previous.catch(() => {}).then(() => this.ensureRoomSubscription(roomId, generation));
    this.subscriptionTask = task;
    try { await task; }
    finally { if (this.subscriptionTask === task) this.subscriptionTask = null; }
  }

  async ensureRoomSubscription(roomId, generation) {
    this.ensureEnabled();
    if (this.cloudProvider) await this.refreshCloudTransport();
    const room = this.requireRoom();
    const assertCurrent = () => {
      if (generation !== this.authGeneration) throw Object.assign(new Error('账号已切换'), { code: 'AUTH_CHANGED' });
      if (this.room?.id !== roomId) throw Object.assign(new Error('对战房间已变化'), { code: 'ROOM_CHANGED' });
    };
    assertCurrent();
    if (this.channelRoomId === roomId && ['joined', 'joining'].includes(this.channel?.state)) return;
    const client = this.client;

    if (this.channel) {
      const old = this.channel;
      this.channel = null;
      this.channelRoomId = null;
      try {
        await this.removeRoomChannel(client, old);
      } catch {
        // ignore
      }
      assertCurrent();
    }

    const channelName = `lingjing:battle:${room.id}`;
    const channel = this.client.channel(channelName, { config: { private: true } });
    const isCurrent = () => this.channel === channel && this.room?.id === room.id;

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: 'lingjing_battle_rooms',
        filter: `id=eq.${room.id}`
      },
      (payload) => {
        if (!payload?.new || !isCurrent() || payload.new.id !== room.id) return;
        this.applyRoom(payload.new);
        this.emit("room-updated", {
          room: this.room,
          side: this.side,
          source: "realtime"
        });
      }
    );

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: 'lingjing_battle_rounds',
        filter: `room_id=eq.${room.id}`
      },
      (payload) => {
        const normalized = normalizeRound(payload?.new);
        if (!normalized || !isCurrent() || normalized.room_id !== room.id) return;
        this.roundCache.set(normalized.round_no, normalized);
        this.emit("round-updated", {
          round: normalized,
          room: this.room,
          side: this.side,
          source: "realtime"
        });
      }
    );

    this.channel = channel;
    this.channelRoomId = roomId;
    channel.subscribe((status, error) => {
      if (!isCurrent()) return;
      this.emit("realtime-status", { status, roomId: room.id, reason: typeof error?.message === 'string' ? error.message.replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted]').slice(0, 200) : null });
    });
  }

  async waitForResolvedRound(roundNo, options = {}) {
    const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_WAIT_TIMEOUT_MS);
    const intervalMs = Math.max(150, Number(options.intervalMs) || DEFAULT_WAIT_INTERVAL_MS);

    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const fromCache = this.roundCache.get(roundNo);
      if (fromCache) {
        return fromCache;
      }

      const synced = await this.syncRoom({ roundsLimit: 8 });
      const fromSync = (synced.rounds || []).find((item) => item.round_no === roundNo) || null;
      if (fromSync) {
        return fromSync;
      }

      await sleep(intervalMs);
    }

    return null;
  }

  cacheRounds(rounds) {
    if (!Array.isArray(rounds)) return;
    for (const item of rounds) {
      const normalized = normalizeRound(item);
      if (!normalized) continue;
      this.roundCache.set(normalized.round_no, normalized);
    }
  }

  applyRoom(roomInput) {
    const normalized = normalizeRoom(roomInput);
    if (normalized && this.room?.id === normalized.id) {
      if (normalized.last_resolved_round < this.room.last_resolved_round) return;
      if (normalized.updated_at && this.room.updated_at && normalized.updated_at < this.room.updated_at) return;
    } else {
      this.roundCache.clear();
    }
    this.room = normalized;
    this.side = normalized && this.currentUser ? resolveUserSide(normalized, this.currentUser.id) : null;
  }

  toBattleState() {
    const room = this.requireRoom();
    const side = this.side;
    const playerPrefix = side === "host" ? "host" : "guest";
    const enemyPrefix = side === "host" ? "guest" : "host";

    return {
      round: Math.max(0, Number(room.current_round) - 1),
      player: {
        id: "player",
        element: normalizeElement(room[`${playerPrefix}_element`]) || "metal",
        hp: clampInt(room[`${playerPrefix}_hp`], 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp),
        maxHp: BATTLE_RULES.maxHp,
        anger: clampInt(room[`${playerPrefix}_anger`], 0, BATTLE_RULES.maxAnger, 0),
        freeDodgeUsed: Boolean(room[`${playerPrefix}_free_dodge_used`]),
        statuses: normalizeStatusList(room[`${playerPrefix}_statuses`])
      },
      enemy: {
        id: "enemy",
        element: normalizeElement(room[`${enemyPrefix}_element`]) || "wood",
        hp: clampInt(room[`${enemyPrefix}_hp`], 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp),
        maxHp: BATTLE_RULES.maxHp,
        anger: clampInt(room[`${enemyPrefix}_anger`], 0, BATTLE_RULES.maxAnger, 0),
        freeDodgeUsed: Boolean(room[`${enemyPrefix}_free_dodge_used`]),
        statuses: normalizeStatusList(room[`${enemyPrefix}_statuses`])
      }
    };
  }

  mapRoundToBattleResult(round) {
    const normalizedRound = normalizeRound(round);
    if (!normalizedRound) {
      throw new Error("invalid round payload");
    }

    const side = this.side;
    if (!side) {
      throw new Error("room side not available");
    }

    const playerSide = side;
    const enemySide = side === "host" ? "guest" : "host";
    const result = normalizedRound.round_result || {};

    const playerAction = normalizedRound[`${playerSide}_action`] || "normal_attack";
    const enemyAction = normalizedRound[`${enemySide}_action`] || "normal_attack";

    const mapStatuses = (statuses) => normalizeStatusList(statuses).map((status) => ({
      ...status,
      ...(status.sourceId ? { sourceId: status.sourceId === playerSide ? "player" : "enemy" } : {})
    }));
    const state = this.toBattleState();
    state.round = normalizedRound.round_no;
    for (const [role, prefix] of [["player", playerSide], ["enemy", enemySide]]) {
      state[role].hp = result.hp_after[prefix];
      state[role].anger = result.anger_after[prefix];
      state[role].statuses = mapStatuses(result.statuses_after[prefix]);
      state[role].freeDodgeUsed = Boolean(result.free_dodge_used[prefix]);
    }

    return {
      playerAction,
      enemyAction,
      roundResult: {
        round: normalizedRound.round_no,
        actions: {
          player: playerAction,
          enemy: enemyAction
        },
        damageTaken: {
          player: clampInt(result.damage_taken?.[playerSide], 0, 9999, 0),
          enemy: clampInt(result.damage_taken?.[enemySide], 0, 9999, 0)
        },
        directDamage: {
          player: clampInt(result.direct_damage?.[playerSide], 0, 9999, 0),
          enemy: clampInt(result.direct_damage?.[enemySide], 0, 9999, 0)
        },
        dotDamageEvents: {
          player: normalizeRoundEvents(result.dot_damage_events?.[playerSide]),
          enemy: normalizeRoundEvents(result.dot_damage_events?.[enemySide])
        },
        healEvents: {
          player: normalizeRoundEvents(result.heal_events?.[playerSide]),
          enemy: normalizeRoundEvents(result.heal_events?.[enemySide])
        },
        hpAfter: { player: state.player.hp, enemy: state.enemy.hp },
        angerAfter: { player: state.player.anger, enemy: state.enemy.anger },
        statusesAfter: { player: state.player.statuses, enemy: state.enemy.statuses },
        winner:
          normalizeWinnerSide(result.winner_side) === playerSide
            ? "player"
            : normalizeWinnerSide(result.winner_side) === enemySide
              ? "enemy"
              : null,
        notes: Array.isArray(result.notes) ? result.notes : []
      },
      state
    };
  }
}

async function resolveFunctionErrorMessage(error, fallback) {
  const fallbackMessage =
    (typeof fallback === "string" && fallback.trim().length > 0 ? fallback.trim() : "request failed");
  if (!error || typeof error !== "object") {
    return fallbackMessage;
  }

  const defaultMessage =
    (typeof error.message === "string" && error.message.trim().length > 0
      ? error.message.trim()
      : fallbackMessage);
  const context = error.context;
  if (!context || typeof context !== "object") {
    return defaultMessage;
  }

  const extractFromPayload = (payload) => {
    if (!payload || typeof payload !== "object") return null;
    const direct =
      normalizeString(payload?.error?.message) ||
      normalizeString(payload?.message) ||
      normalizeString(payload?.data?.error?.message);
    return direct || null;
  };

  try {
    if (typeof context.clone === "function") {
      const cloned = context.clone();
      if (cloned && typeof cloned.json === "function") {
        const parsed = await cloned.json();
        const payloadMessage = extractFromPayload(parsed);
        if (payloadMessage) return payloadMessage;
      }
    }
  } catch {
    // Ignore parse failures, fallback to default message.
  }

  try {
    if (typeof context.text === "function") {
      const text = await context.text();
      if (typeof text === "string" && text.trim().length > 0) {
        try {
          const parsed = JSON.parse(text);
          const payloadMessage = extractFromPayload(parsed);
          if (payloadMessage) return payloadMessage;
        } catch {
          // Not a JSON body.
        }
      }
    }
  } catch {
    // Ignore context read failures.
  }

  return defaultMessage;
}

function normalizeRoomCode(value) {
  const normalized = normalizeString(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeRoom(input) {
  if (!input || typeof input !== "object") return null;
  return {
    id: normalizeString(input.id) || "",
    room_code: normalizeRoomCode(input.room_code) || "",
    status: normalizeString(input.status) || "waiting",
    host_user_id: normalizeString(input.host_user_id) || "",
    host_account: normalizeString(input.host_account) || "",
    guest_user_id: normalizeString(input.guest_user_id) || null,
    guest_account: normalizeString(input.guest_account) || null,
    host_pet_id: normalizeString(input.host_pet_id) || null,
    guest_pet_id: normalizeString(input.guest_pet_id) || null,
    host_pet_level: toPositiveInt(input.host_pet_level,1),
    guest_pet_level: input.guest_pet_level==null?null:toPositiveInt(input.guest_pet_level,1),
    host_resource_id: normalizeString(input.host_resource_id) || null,
    guest_resource_id: normalizeString(input.guest_resource_id) || null,
    invitation_id: normalizeString(input.invitation_id) || null,
    invited_user_id: normalizeString(input.invited_user_id) || null,
    host_pet_name: normalizePetName(input.host_pet_name),
    guest_pet_name: normalizeString(input.guest_pet_name) || null,
    host_element: normalizeElement(input.host_element) || "metal",
    guest_element: normalizeElement(input.guest_element) || null,
    current_round: toPositiveInt(input.current_round, 1),
    last_resolved_round: Math.max(0, toPositiveInt(input.last_resolved_round, 0)),
    host_hp: clampInt(input.host_hp, 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp),
    guest_hp: clampInt(input.guest_hp, 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp),
    host_anger: clampInt(input.host_anger, 0, BATTLE_RULES.maxAnger, 0),
    guest_anger: clampInt(input.guest_anger, 0, BATTLE_RULES.maxAnger, 0),
    host_free_dodge_used: Boolean(input.host_free_dodge_used),
    guest_free_dodge_used: Boolean(input.guest_free_dodge_used),
    host_statuses: normalizeStatusList(input.host_statuses),
    guest_statuses: normalizeStatusList(input.guest_statuses),
    winner_side: normalizeWinnerSide(input.winner_side),
    created_at: normalizeString(input.created_at) || null,
    updated_at: normalizeString(input.updated_at) || null
  };
}

function normalizeRound(input) {
  if (!input || typeof input !== "object") return null;
  const result = input.round_result && typeof input.round_result === "object" ? input.round_result : {};
  return {
    id: normalizeString(input.id) || "",
    room_id: normalizeString(input.room_id) || "",
    round_no: toPositiveInt(input.round_no, 1),
    host_action: normalizeAction(input.host_action) || "normal_attack",
    guest_action: normalizeAction(input.guest_action) || "normal_attack",
    winner_side: normalizeWinnerSide(input.winner_side),
    round_result: {
      hp_after: {
        host: clampInt(result.hp_after?.host, 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp),
        guest: clampInt(result.hp_after?.guest, 0, BATTLE_RULES.maxHp, BATTLE_RULES.maxHp)
      },
      anger_after: {
        host: clampInt(result.anger_after?.host, 0, BATTLE_RULES.maxAnger, 0),
        guest: clampInt(result.anger_after?.guest, 0, BATTLE_RULES.maxAnger, 0)
      },
      free_dodge_used: {
        host: Boolean(result.free_dodge_used?.host),
        guest: Boolean(result.free_dodge_used?.guest)
      },
      winner_side: normalizeWinnerSide(result.winner_side),
      damage_taken: {
        host: clampInt(result.damage_taken?.host, 0, 9999, 0),
        guest: clampInt(result.damage_taken?.guest, 0, 9999, 0)
      },
      direct_damage: {
        host: clampInt(result.direct_damage?.host, 0, 9999, 0),
        guest: clampInt(result.direct_damage?.guest, 0, 9999, 0)
      },
      dot_damage_events: {
        host: normalizeRoundEvents(result.dot_damage_events?.host),
        guest: normalizeRoundEvents(result.dot_damage_events?.guest)
      },
      heal_events: {
        host: normalizeRoundEvents(result.heal_events?.host),
        guest: normalizeRoundEvents(result.heal_events?.guest)
      },
      statuses_after: {
        host: normalizeStatusList(result.statuses_after?.host),
        guest: normalizeStatusList(result.statuses_after?.guest)
      },
      notes: Array.isArray(result.notes) ? result.notes.slice(0, 20) : []
    },
    created_at: normalizeString(input.created_at) || null
  };
}

function normalizeUser(input) {
  if (!input || typeof input !== "object") return null;
  const id = normalizeString(input.id);
  if (!id) return null;
  const account = normalizeString(input.account) || id;
  return {
    id,
    account,
    username: normalizeString(input.username) || account,
    createdAt: normalizeString(input.createdAt) || null,
    lastLoginAt: normalizeString(input.lastLoginAt) || null
  };
}

function normalizeRuntimeDuelRequest(input) {
  if (!input || typeof input !== "object") return null;
  const id = normalizeString(input.id);
  if (!id) return null;
  const fromUserId = normalizeString(input.fromUserId);
  const toUserId = normalizeString(input.toUserId);
  const fromAccount = normalizeString(input.fromAccount);
  const toAccount = normalizeString(input.toAccount);
  if (!fromUserId || !toUserId || !fromAccount || !toAccount) {
    return null;
  }
  const status = normalizeString(input.status) || "pending";
  return {
    id,
    fromUserId,
    fromAccount,
    toUserId,
    toAccount,
    status,
    roomId: normalizeString(input.roomId) || null,
    roomCode: normalizeRoomCode(input.roomCode),
    roomStatus: normalizeRuntimeRoomStatus(input.roomStatus),
    createdAt: normalizeString(input.createdAt) || null,
    updatedAt: normalizeString(input.updatedAt) || null,
    ...(Object.hasOwn(input,'expiresAt')?{expiresAt:normalizeString(input.expiresAt)||null}:{})
  };
}

function normalizeRuntimeRoomStatus(value) {
  const status = normalizeString(value);
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === "waiting" || lower === "active" || lower === "finished" || lower === "abandoned") {
    return lower;
  }
  return null;
}

function resolveUserSide(room, userId) {
  if (!room || !userId) return null;
  if (room.host_user_id === userId) return "host";
  if (room.guest_user_id === userId) return "guest";
  return null;
}

function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeElement(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized;
}

function normalizePetName(value) {
  const text = normalizeString(value);
  if (!text) return "Player";
  return text.slice(0, 48);
}

function normalizeAction(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized;
}

function normalizeWinnerSide(value) {
  if (value === "host" || value === "guest") return value;
  return null;
}

function toPositiveInt(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function clampInt(value, min, max, fallback = min) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function clampRoundsLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 20;
  return Math.max(1, Math.min(50, parsed));
}

function normalizeStatusList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map(normalizeStatus)
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeStatus(input) {
  if (!input || typeof input !== "object") return null;
  const type = normalizeString(input.type);
  if (!type) return null;
  const duration = clampInt(input.duration, 1, 12, 1);
  const potency =
    input.potency == null ? undefined : clampInt(input.potency, 1, 999, 1);
  const stacks = clampInt(input.stacks, 1, 5, 1);
  const sourceId = normalizeString(input.sourceId);
  return {
    type,
    duration,
    ...(potency != null ? { potency } : {}),
    stacks,
    stackable: Boolean(input.stackable),
    ...(sourceId ? { sourceId } : {})
  };
}

function normalizeRoundEvents(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const type = normalizeString(item.type);
      const amount = clampInt(item.amount, 0, 9999, 0);
      if (!type || amount <= 0) return null;
      return { type, amount };
    })
    .filter(Boolean)
    .slice(0, 20);
}

module.exports = {
  OnlineDuelService
};
