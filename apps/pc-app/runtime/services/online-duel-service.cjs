const { setTimeout: sleep } = require("node:timers/promises");

let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {
  createClient = null;
}

let websocketTransport = null;
try {
  websocketTransport = require("ws");
} catch {
  websocketTransport = null;
}

const DEFAULT_FUNCTION_NAME = "duel-online";
const DEFAULT_WAIT_TIMEOUT_MS = 12000;
const DEFAULT_WAIT_INTERVAL_MS = 350;

class OnlineDuelService {
  constructor(options = {}) {
    this.supabaseUrl = options.supabaseUrl || process.env.SUPABASE_URL || "";
    this.supabaseAnonKey = options.supabaseAnonKey || process.env.SUPABASE_ANON_KEY || "";
    this.functionName = options.functionName || process.env.SUPABASE_DUEL_FUNCTION || DEFAULT_FUNCTION_NAME;

    this.available = Boolean(createClient);
    this.configured = Boolean(this.supabaseUrl && this.supabaseAnonKey);
    this.enabled = this.available && this.configured;

    this.client = null;
    this.channel = null;
    this.listeners = new Set();
    this.currentUser = null;
    this.room = null;
    this.side = null;
    this.roundCache = new Map();

    if (this.enabled) {
      const realtimeOptions = {};
      // Realtime in Node/Electron is more reliable with explicit ws transport.
      if (websocketTransport) {
        realtimeOptions.transport = websocketTransport;
      }

      this.client = createClient(this.supabaseUrl, this.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        },
        realtime: realtimeOptions
      });
    }
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
      configured: this.configured,
      room: this.room ? { ...this.room } : null,
      side: this.side,
      currentUser: this.currentUser ? { ...this.currentUser } : null
    };
  }

  hasActiveRoom() {
    return Boolean(this.room?.id && this.side);
  }

  setCurrentUser(user) {
    const normalized = normalizeUser(user);
    const prevUserId = this.currentUser?.id || null;
    this.currentUser = normalized;

    if (!normalized) {
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
    const user = this.requireUser();

    const response = await this.invoke("create_room", {
      userId: user.id,
      userAccount: user.account,
      petElement: normalizeElement(payload.petElement) || "metal",
      petName: normalizePetName(payload.petName)
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
    const user = this.requireUser();
    const roomCode = normalizeRoomCode(payload.roomCode);
    if (!roomCode) {
      throw new Error("roomCode is required");
    }

    const response = await this.invoke("join_room", {
      roomCode,
      userId: user.id,
      userAccount: user.account,
      petElement: normalizeElement(payload.petElement) || "metal",
      petName: normalizePetName(payload.petName)
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
    const roomId = options.roomId || this.room?.id;
    const roomCode = options.roomCode || this.room?.room_code;
    if (!roomId && !roomCode) {
      throw new Error("roomId or roomCode is required");
    }

    const response = await this.invoke("get_room", {
      roomId,
      roomCode,
      roundsLimit: clampRoundsLimit(options.roundsLimit)
    });

    this.applyRoom(response.room);
    this.cacheRounds(response.rounds);
    this.emit("room-synced", {
      room: this.room,
      side: this.side
    });

    return {
      ok: true,
      room: this.room,
      side: this.side,
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
    const user = this.requireUser();
    const room = this.requireRoom();
    const action = normalizeAction(input.action);
    if (!action) {
      throw new Error("invalid action");
    }

    const roundNo = Number(room.current_round);
    const response = await this.invoke("submit_action", {
      roomId: room.id,
      userId: user.id,
      action,
      roundNo
    });

    if (response.room) {
      this.applyRoom(response.room);
    }

    let resolvedRound = response.round ? normalizeRound(response.round) : null;
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

  async leaveRoom(options = {}) {
    const room = this.room;
    const user = this.currentUser;

    if (this.enabled && room?.id && user?.id) {
      try {
        await this.invoke("leave_room", {
          roomId: room.id,
          userId: user.id,
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
    this.roundCache.clear();

    if (this.channel && this.client) {
      const current = this.channel;
      this.channel = null;
      try {
        await this.client.removeChannel(current);
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

  ensureEnabled() {
    if (!this.available) {
      throw new Error("@supabase/supabase-js is not installed");
    }
    if (!this.configured) {
      throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required");
    }
    if (!this.client) {
      throw new Error("supabase client not initialized");
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
    const requestBody = {
      op,
      ...payload
    };

    const { data, error } = await this.client.functions.invoke(this.functionName, {
      body: requestBody
    });

    if (error) {
      throw new Error(error.message || `failed to invoke function: ${op}`);
    }

    const wrapped = data && typeof data === "object" ? data : null;
    if (wrapped?.ok === false) {
      throw new Error(wrapped.error?.message || `function rejected op: ${op}`);
    }

    const body = wrapped && wrapped.ok === true ? wrapped.data : wrapped;
    if (!body || typeof body !== "object") {
      throw new Error(`invalid function response for op: ${op}`);
    }

    return body;
  }

  async subscribeRoom() {
    this.ensureEnabled();
    const room = this.requireRoom();

    if (this.channel) {
      try {
        await this.client.removeChannel(this.channel);
      } catch {
        // ignore
      }
      this.channel = null;
    }

    const channelName = `duel-room-${room.id}`;
    const channel = this.client.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "duel_rooms",
        filter: `id=eq.${room.id}`
      },
      (payload) => {
        if (!payload?.new) return;
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
        table: "duel_rounds",
        filter: `room_id=eq.${room.id}`
      },
      (payload) => {
        const normalized = normalizeRound(payload?.new);
        if (!normalized) return;
        this.roundCache.set(normalized.round_no, normalized);
        this.emit("round-updated", {
          round: normalized,
          room: this.room,
          side: this.side,
          source: "realtime"
        });
      }
    );

    channel.subscribe((status) => {
      this.emit("realtime-status", { status, roomId: room.id });
    });

    this.channel = channel;
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
        hp: clampInt(room[`${playerPrefix}_hp`], 0, 120, 120),
        maxHp: 120,
        anger: clampInt(room[`${playerPrefix}_anger`], 0, 100, 0),
        statuses: []
      },
      enemy: {
        id: "enemy",
        element: normalizeElement(room[`${enemyPrefix}_element`]) || "wood",
        hp: clampInt(room[`${enemyPrefix}_hp`], 0, 120, 120),
        maxHp: 120,
        anger: clampInt(room[`${enemyPrefix}_anger`], 0, 100, 0),
        statuses: []
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
          player: [],
          enemy: []
        },
        healEvents: {
          player: [],
          enemy: []
        },
        winner:
          normalizeWinnerSide(result.winner_side) === playerSide
            ? "player"
            : normalizeWinnerSide(result.winner_side) === enemySide
              ? "enemy"
              : null,
        notes: Array.isArray(result.notes) ? result.notes : []
      },
      state: this.toBattleState()
    };
  }
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
    host_pet_name: normalizePetName(input.host_pet_name),
    guest_pet_name: normalizeString(input.guest_pet_name) || null,
    host_element: normalizeElement(input.host_element) || "metal",
    guest_element: normalizeElement(input.guest_element) || null,
    current_round: toPositiveInt(input.current_round, 1),
    last_resolved_round: Math.max(0, toPositiveInt(input.last_resolved_round, 0)),
    host_hp: clampInt(input.host_hp, 0, 120, 120),
    guest_hp: clampInt(input.guest_hp, 0, 120, 120),
    host_anger: clampInt(input.host_anger, 0, 100, 0),
    guest_anger: clampInt(input.guest_anger, 0, 100, 0),
    host_free_dodge_used: Boolean(input.host_free_dodge_used),
    guest_free_dodge_used: Boolean(input.guest_free_dodge_used),
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
      winner_side: normalizeWinnerSide(result.winner_side),
      damage_taken: {
        host: clampInt(result.damage_taken?.host, 0, 9999, 0),
        guest: clampInt(result.damage_taken?.guest, 0, 9999, 0)
      },
      direct_damage: {
        host: clampInt(result.direct_damage?.host, 0, 9999, 0),
        guest: clampInt(result.direct_damage?.guest, 0, 9999, 0)
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
  return { id, account };
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

module.exports = {
  OnlineDuelService
};
