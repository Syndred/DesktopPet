import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const ELEMENT_ADVANTAGE_CHAIN = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal"
};

const BASE_DAMAGE = {
  normal_attack: 10,
  element_attack: 12,
  dodge: 0,
  ultimate: 20
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOWED_ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ALLOWED_ACTIONS = new Set(["normal_attack", "element_attack", "dodge", "ultimate"]);
const ALLOWED_STATUS_TYPES = new Set(["burn", "freeze", "parasite", "vulnerability", "petrify"]);
const ALLOWED_DUEL_REQUEST_STATUS = new Set(["pending", "accepted", "rejected", "cancelled"]);
const MAX_HP = 120;
const ULTIMATE_ANGER_THRESHOLD = 50;
const ULTIMATE_ANGER_COST = 50;
const DUEL_REQUEST_RESEND_INTERVAL_MS = 30 * 1000;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "Only POST is supported" }
      },
      405
    );
  }

  try {
    const payload = await request.json();
    const op = normalizeString(payload?.op);
    if (!op) {
      return jsonResponse(
        {
          ok: false,
          error: { code: "INVALID_OP", message: "payload.op is required" }
        },
        400
      );
    }

    const supabase = createSupabaseServiceClient();

    if (op === "register_account") {
      return jsonResponse({ ok: true, data: await handleRegisterAccount(supabase, payload) });
    }
    if (op === "login_account") {
      return jsonResponse({ ok: true, data: await handleLoginAccount(supabase, payload) });
    }
    if (op === "update_account") {
      return jsonResponse({ ok: true, data: await handleUpdateAccount(supabase, payload) });
    }
    if (op === "search_accounts") {
      return jsonResponse({ ok: true, data: await handleSearchAccounts(supabase, payload) });
    }
    if (op === "send_duel_request") {
      return jsonResponse({ ok: true, data: await handleSendDuelRequest(supabase, payload) });
    }
    if (op === "list_duel_requests") {
      return jsonResponse({ ok: true, data: await handleListDuelRequests(supabase, payload) });
    }
    if (op === "respond_duel_request") {
      return jsonResponse({ ok: true, data: await handleRespondDuelRequest(supabase, payload) });
    }
    if (op === "cancel_duel_request") {
      return jsonResponse({ ok: true, data: await handleCancelDuelRequest(supabase, payload) });
    }
    if (op === "create_room") {
      return jsonResponse({ ok: true, data: await handleCreateRoom(supabase, payload) });
    }
    if (op === "join_room") {
      return jsonResponse({ ok: true, data: await handleJoinRoom(supabase, payload) });
    }
    if (op === "get_room") {
      return jsonResponse({ ok: true, data: await handleGetRoom(supabase, payload) });
    }
    if (op === "submit_action") {
      return jsonResponse({ ok: true, data: await handleSubmitAction(supabase, payload) });
    }
    if (op === "leave_room") {
      return jsonResponse({ ok: true, data: await handleLeaveRoom(supabase, payload) });
    }

    return jsonResponse(
      {
        ok: false,
        error: { code: "UNSUPPORTED_OP", message: `Unsupported op: ${op}` }
      },
      400
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "UNHANDLED_ERROR",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      },
      500
    );
  }
});

function createSupabaseServiceClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeElement(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return ALLOWED_ELEMENTS.has(normalized) ? normalized : null;
}

function normalizeAction(value) {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return ALLOWED_ACTIONS.has(normalized) ? normalized : null;
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

function normalizeUser(payload) {
  const userId = normalizeString(payload?.userId);
  const userAccount = normalizeString(payload?.userAccount);
  if (!userId) {
    throw new Error("userId is required");
  }
  return {
    id: userId,
    account: userAccount || userId
  };
}

function normalizeSessionToken(input) {
  const token = normalizeString(input);
  if (!token) {
    throw new Error("session token is required");
  }
  if (token.length < 16 || token.length > 128) {
    throw new Error("invalid session token");
  }
  return token;
}

function generateSessionToken() {
  return `sess_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeRoomCode(value) {
  return normalizeString(value)?.toUpperCase() || null;
}

function normalizePetName(value) {
  const text = normalizeString(value);
  if (!text) return "Player";
  return text.slice(0, 48);
}

function normalizeWinnerSide(value) {
  if (value === "host" || value === "guest") return value;
  return null;
}

function generateRoomCode() {
  const seed = crypto.getRandomValues(new Uint32Array(6));
  let code = "";
  for (let index = 0; index < seed.length; index += 1) {
    code += ROOM_CODE_ALPHABET[seed[index] % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

function getElementMultiplier(attacker, defender) {
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.2;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.8;
  return 1;
}

async function getRoomById(supabase, roomId) {
  const { data, error } = await supabase.from("duel_rooms").select("*").eq("id", roomId).maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query room");
  }
  return data ? normalizeRoom(data) : null;
}

async function getRoomByCode(supabase, roomCode) {
  const { data, error } = await supabase
    .from("duel_rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query room");
  }
  return data ? normalizeRoom(data) : null;
}

async function getRoomByIdOrThrow(supabase, roomId) {
  const room = await getRoomById(supabase, roomId);
  if (!room) throw new Error("room not found");
  return room;
}

async function getRoomByCodeOrThrow(supabase, roomCode) {
  const room = await getRoomByCode(supabase, roomCode);
  if (!room) throw new Error("room not found");
  return room;
}

async function listRoundsByRoomId(supabase, roomId, limit = 20) {
  const { data, error } = await supabase
    .from("duel_rounds")
    .select("*")
    .eq("room_id", roomId)
    .order("round_no", { ascending: false })
    .limit(limit);
  if (error) {
    throw new Error(error.message || "failed to query rounds");
  }
  const rows = Array.isArray(data) ? data.map(normalizeRound) : [];
  return rows.reverse();
}

async function getRoundByRoomAndNo(supabase, roomId, roundNo) {
  const { data, error } = await supabase
    .from("duel_rounds")
    .select("*")
    .eq("room_id", roomId)
    .eq("round_no", roundNo)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query round");
  }
  return data ? normalizeRound(data) : null;
}

async function listActionsByRound(supabase, roomId, roundNo) {
  const { data, error } = await supabase
    .from("duel_actions")
    .select("actor_side, action_type")
    .eq("room_id", roomId)
    .eq("round_no", roundNo);
  if (error) {
    throw new Error(error.message || "failed to query actions");
  }
  return Array.isArray(data) ? data : [];
}

function resolveUserSide(room, userId) {
  if (room.host_user_id === userId) return "host";
  if (room.guest_user_id === userId) return "guest";
  return null;
}

function normalizeRoom(input) {
  return {
    id: input.id,
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
    host_hp: clampInt(input.host_hp, 0, MAX_HP, MAX_HP),
    guest_hp: clampInt(input.guest_hp, 0, MAX_HP, MAX_HP),
    host_anger: clampInt(input.host_anger, 0, 100, 0),
    guest_anger: clampInt(input.guest_anger, 0, 100, 0),
    host_free_dodge_used: Boolean(input.host_free_dodge_used),
    guest_free_dodge_used: Boolean(input.guest_free_dodge_used),
    host_statuses: normalizeStatusList(input.host_statuses),
    guest_statuses: normalizeStatusList(input.guest_statuses),
    winner_side: normalizeWinnerSide(input.winner_side),
    created_at: input.created_at,
    updated_at: input.updated_at
  };
}

function normalizeRound(input) {
  const roundResult = normalizeRoundResult(input.round_result);
  return {
    id: input.id,
    room_id: input.room_id,
    round_no: toPositiveInt(input.round_no, 1),
    host_action: normalizeString(input.host_action) || "normal_attack",
    guest_action: normalizeString(input.guest_action) || "normal_attack",
    winner_side: normalizeWinnerSide(input.winner_side),
    round_result: roundResult,
    created_at: input.created_at
  };
}

async function handleCreateRoom(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const user = normalizeUser({
    ...payload,
    userId: sessionUser.id,
    userAccount: sessionUser.account
  });
  const hostElement = normalizeElement(payload?.petElement) || "metal";
  const hostPetName = normalizePetName(payload?.petName);

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from("duel_rooms")
      .insert({
        room_code: generateRoomCode(),
        status: "waiting",
        host_user_id: user.id,
        host_account: user.account,
        host_pet_name: hostPetName,
        host_element: hostElement,
        current_round: 1,
        last_resolved_round: 0
      })
      .select("*")
      .single();

    if (!error && data) {
      return {
        room: normalizeRoom(data)
      };
    }

    if (error?.code !== "23505") {
      throw new Error(error?.message || "failed to create room");
    }

    lastError = error;
  }

  throw new Error(lastError?.message || "failed to create room code");
}

async function handleJoinRoom(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const user = normalizeUser({
    ...payload,
    userId: sessionUser.id,
    userAccount: sessionUser.account
  });
  const roomCode = normalizeRoomCode(payload?.roomCode);
  const guestElement = normalizeElement(payload?.petElement) || "metal";
  const guestPetName = normalizePetName(payload?.petName);

  if (!roomCode) {
    throw new Error("roomCode is required");
  }

  const room = await getRoomByCodeOrThrow(supabase, roomCode);
  if (room.host_user_id === user.id || room.guest_user_id === user.id) {
    return { room };
  }

  if (room.status !== "waiting" && room.status !== "active") {
    throw new Error("room is not joinable");
  }

  if (room.guest_user_id && room.guest_user_id !== user.id) {
    throw new Error("room is full");
  }

  const { data, error } = await supabase
    .from("duel_rooms")
    .update({
      guest_user_id: user.id,
      guest_account: user.account,
      guest_pet_name: guestPetName,
      guest_element: guestElement,
      status: "active"
    })
    .eq("id", room.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "failed to join room");
  }

  return {
    room: normalizeRoom(data)
  };
}

async function handleGetRoom(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const roomId = normalizeString(payload?.roomId);
  const roomCode = normalizeRoomCode(payload?.roomCode);
  const roundsLimit = clampRoundsLimit(payload?.roundsLimit);

  let room = null;
  if (roomId) {
    room = await getRoomById(supabase, roomId);
  } else if (roomCode) {
    room = await getRoomByCode(supabase, roomCode);
  } else {
    throw new Error("roomId or roomCode is required");
  }

  if (!room) {
    throw new Error("room not found");
  }
  if (room.host_user_id !== sessionUser.id && room.guest_user_id !== sessionUser.id) {
    throw new Error("user is not room participant");
  }

  return {
    room,
    rounds: await listRoundsByRoomId(supabase, room.id, roundsLimit)
  };
}

function normalizeRoundResult(input) {
  const result = input && typeof input === "object" ? input : {};
  const notes = Array.isArray(result.notes)
    ? result.notes.filter((item) => typeof item === "string" && item.length > 0).slice(0, 20)
    : [];
  return {
    round: Math.max(0, toPositiveInt(result.round, 0)),
    actions: {
      host: normalizeString(result.actions?.host) || "normal_attack",
      guest: normalizeString(result.actions?.guest) || "normal_attack"
    },
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
    hp_after: {
      host: clampInt(result.hp_after?.host, 0, MAX_HP, MAX_HP),
      guest: clampInt(result.hp_after?.guest, 0, MAX_HP, MAX_HP)
    },
    anger_after: {
      host: clampInt(result.anger_after?.host, 0, 100, 0),
      guest: clampInt(result.anger_after?.guest, 0, 100, 0)
    },
    statuses_after: {
      host: normalizeStatusList(result.statuses_after?.host),
      guest: normalizeStatusList(result.statuses_after?.guest)
    },
    free_dodge_used: {
      host: Boolean(result.free_dodge_used?.host),
      guest: Boolean(result.free_dodge_used?.guest)
    },
    winner_side: normalizeWinnerSide(result.winner_side),
    notes
  };
}

function resolveRound(room, hostInputAction, guestInputAction) {
  const notes = [];

  const host = {
    id: "host",
    element: room.host_element,
    hp: room.host_hp,
    anger: room.host_anger,
    freeDodgeUsed: Boolean(room.host_free_dodge_used),
    statuses: normalizeStatusList(room.host_statuses)
  };

  const guest = {
    id: "guest",
    element: room.guest_element || "wood",
    hp: room.guest_hp,
    anger: room.guest_anger,
    freeDodgeUsed: Boolean(room.guest_free_dodge_used),
    statuses: normalizeStatusList(room.guest_statuses)
  };

  const normalizeCombatAction = (side, actor, actionInput) => {
    const normalized = normalizeAction(actionInput) || "normal_attack";
    if (normalized === "dodge" && actor.anger <= 0 && actor.freeDodgeUsed) {
      notes.push(`${side} dodge downgraded to normal_attack (anger <= 0)`);
      return "normal_attack";
    }
    if (normalized === "ultimate" && actor.anger < ULTIMATE_ANGER_THRESHOLD) {
      notes.push(`${side} ultimate downgraded to normal_attack (anger < ${ULTIMATE_ANGER_THRESHOLD})`);
      return "normal_attack";
    }
    if (normalized === "ultimate") {
      actor.anger = Math.max(0, actor.anger - ULTIMATE_ANGER_COST);
      return "ultimate";
    }
    if (normalized === "dodge") {
      actor.freeDodgeUsed = true;
    }
    return normalized;
  };

  let hostAction = normalizeCombatAction("host", host, hostInputAction);
  let guestAction = normalizeCombatAction("guest", guest, guestInputAction);

  if (hasStatus(host, "freeze") || hasStatus(host, "petrify")) {
    hostAction = "stunned";
    notes.push("host is stunned and cannot act");
  }
  if (hasStatus(guest, "freeze") || hasStatus(guest, "petrify")) {
    guestAction = "stunned";
    notes.push("guest is stunned and cannot act");
  }

  if (hostAction === "dodge") {
    spendDodgeAnger(host, notes);
  }
  if (guestAction === "dodge") {
    spendDodgeAnger(guest, notes);
  }

  const doesHit = (attackerAction, defenderAction) => {
    if (attackerAction === "dodge") return false;
    if (attackerAction === "ultimate") return true;
    if (defenderAction === "stunned") return true;
    if (attackerAction === "normal_attack" && defenderAction === "dodge") return false;
    if (attackerAction === "element_attack" && defenderAction === "normal_attack") return false;
    return true;
  };

  const computeDamage = (attackerAction, attacker, defender) => {
    let damage = BASE_DAMAGE[attackerAction] || BASE_DAMAGE.normal_attack;
    damage *= getElementMultiplier(attacker.element, defender.element);
    const vulnerability = getStatus(defender, "vulnerability");
    if (vulnerability) {
      const stacks = Math.max(1, vulnerability.stacks || 1);
      damage *= 1 + 0.2 * stacks;
    }
    return Math.max(0, Math.round(damage));
  };

  const dotDamageEvents = {
    host: [],
    guest: []
  };
  const healEvents = {
    host: [],
    guest: []
  };
  const damageTaken = { host: 0, guest: 0 };
  const directDamage = { host: 0, guest: 0 };
  let firstDefeated = null;

  if (doesHit(hostAction, guestAction)) {
    const damage = computeDamage(hostAction, host, guest);
    const guestWasAlive = guest.hp > 0;
    guest.hp = Math.max(0, guest.hp - damage);
    if (guestWasAlive && guest.hp <= 0 && !firstDefeated) firstDefeated = "guest";
    damageTaken.guest += damage;
    directDamage.guest += damage;
    if (hostAction !== "ultimate" && getElementMultiplier(host.element, guest.element) > 1) {
      host.anger = Math.min(100, host.anger + 20);
    }
    guest.anger = Math.min(100, guest.anger + Math.floor(damage * 0.5));
    applyAttackStatus(hostAction, host, guest, notes);
  } else if (hostAction !== "dodge") {
    notes.push("host action missed");
  }

  if (doesHit(guestAction, hostAction)) {
    const damage = computeDamage(guestAction, guest, host);
    const hostWasAlive = host.hp > 0;
    host.hp = Math.max(0, host.hp - damage);
    if (hostWasAlive && host.hp <= 0 && !firstDefeated) firstDefeated = "host";
    damageTaken.host += damage;
    directDamage.host += damage;
    if (guestAction !== "ultimate" && getElementMultiplier(guest.element, host.element) > 1) {
      guest.anger = Math.min(100, guest.anger + 20);
    }
    host.anger = Math.min(100, host.anger + Math.floor(damage * 0.5));
    applyAttackStatus(guestAction, guest, host, notes);
  } else if (guestAction !== "dodge") {
    notes.push("guest action missed");
  }

  const bothDodged = hostAction === "dodge" && guestAction === "dodge";
  if (!bothDodged && hostAction === "dodge" && guestAction === "normal_attack") {
    refundDodgeAnger(host, notes);
  }
  if (!bothDodged && guestAction === "dodge" && hostAction === "normal_attack") {
    refundDodgeAnger(guest, notes);
  }

  applyRoundEndStatusEffects([host, guest], damageTaken, dotDamageEvents, healEvents, notes, (side) => {
    if (!firstDefeated) firstDefeated = side;
  });
  reduceStatusDuration(host);
  reduceStatusDuration(guest);

  let winnerSide = null;
  if (host.hp <= 0 && guest.hp <= 0) {
    winnerSide = firstDefeated === "host" ? "guest" : "host";
  } else if (host.hp <= 0) {
    winnerSide = "guest";
  } else if (guest.hp <= 0) {
    winnerSide = "host";
  }

  return {
    round: room.current_round,
    actions: {
      host: hostAction,
      guest: guestAction
    },
    damage_taken: damageTaken,
    direct_damage: directDamage,
    dot_damage_events: dotDamageEvents,
    heal_events: healEvents,
    hp_after: {
      host: host.hp,
      guest: guest.hp
    },
    anger_after: {
      host: host.anger,
      guest: guest.anger
    },
    statuses_after: {
      host: host.statuses.map(cloneStatus),
      guest: guest.statuses.map(cloneStatus)
    },
    free_dodge_used: {
      host: host.freeDodgeUsed,
      guest: guest.freeDodgeUsed
    },
    winner_side: winnerSide,
    notes
  };
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
  if (!type || !ALLOWED_STATUS_TYPES.has(type)) return null;
  const duration = clampInt(input.duration, 1, 12, 1);
  const potency = input.potency == null ? undefined : clampInt(input.potency, 1, 999, 1);
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

function hasStatus(actor, type) {
  return Array.isArray(actor.statuses) && actor.statuses.some((status) => status.type === type);
}

function getStatus(actor, type) {
  if (!Array.isArray(actor.statuses)) return null;
  return actor.statuses.find((status) => status.type === type) || null;
}

function addOrRefreshStatus(actor, next) {
  if (!Array.isArray(actor.statuses)) actor.statuses = [];
  const idx = actor.statuses.findIndex((status) => status.type === next.type);
  if (idx === -1) {
    const inserted = { ...next };
    actor.statuses.push(inserted);
    return inserted;
  }
  const current = actor.statuses[idx];
  const stackable = Boolean(next.stackable);
  const nextStacks = stackable ? Math.min(5, Math.max(1, (current.stacks || 1) + 1)) : 1;
  const addDuration = Math.max(1, Number(next.duration) || 1);
  const mergedDuration = stackable
    ? Math.min(12, Math.max(1, Number(current.duration) || 0) + addDuration)
    : Math.max(Math.max(1, Number(current.duration) || 1), addDuration);
  const merged = {
    ...current,
    ...next,
    stacks: nextStacks,
    duration: mergedDuration
  };
  actor.statuses[idx] = merged;
  return merged;
}

function applyAttackStatus(action, attacker, defender, notes) {
  if (action !== "element_attack") return;
  if (attacker.element === "fire") {
    const status = addOrRefreshStatus(defender, {
      type: "burn",
      duration: 2,
      potency: 3,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy burned x${status.stacks || 1}`);
  }
  if (attacker.element === "water") {
    addOrRefreshStatus(defender, {
      type: "freeze",
      duration: 2,
      stacks: 1,
      stackable: false,
      sourceId: attacker.id
    });
    notes.push("enemy frozen");
  }
  if (attacker.element === "wood") {
    const status = addOrRefreshStatus(defender, {
      type: "parasite",
      duration: 2,
      potency: 2,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy parasitized x${status.stacks || 1}`);
  }
  if (attacker.element === "metal") {
    const status = addOrRefreshStatus(defender, {
      type: "vulnerability",
      duration: 2,
      stacks: 1,
      stackable: true,
      sourceId: attacker.id
    });
    notes.push(`enemy vulnerable x${status.stacks || 1}`);
  }
  if (attacker.element === "earth") {
    addOrRefreshStatus(defender, {
      type: "petrify",
      duration: 2,
      stacks: 1,
      stackable: false,
      sourceId: attacker.id
    });
    notes.push("enemy petrified");
  }
}

function spendDodgeAnger(actor, notes) {
  if (actor.anger > 0) {
    actor.anger = Math.max(0, actor.anger - 20);
    notes.push(`${actor.id} spends 20 anger on dodge`);
    return;
  }
  notes.push(`${actor.id} uses first free dodge`);
}

function refundDodgeAnger(actor, notes) {
  actor.anger = Math.min(100, actor.anger + 30);
  notes.push(`${actor.id} dodged normal attack and refunded 30 anger`);
}

function reduceStatusDuration(actor) {
  if (!Array.isArray(actor.statuses)) {
    actor.statuses = [];
    return;
  }
  actor.statuses = actor.statuses
    .map((status) => ({ ...status, duration: clampInt(status.duration, 1, 12, 1) - 1 }))
    .filter((status) => status.duration > 0);
}

function applyRoundEndStatusEffects(players, damageTaken, dotDamageEvents, healEvents, notes, onDefeated) {
  for (const player of players) {
    for (const status of player.statuses) {
      if (status.type === "burn" && status.potency) {
        const burnDamage = status.potency * Math.max(1, status.stacks || 1);
        applyDamage(player, burnDamage, onDefeated);
        damageTaken[player.id] += burnDamage;
        dotDamageEvents[player.id].push({ type: "burn", amount: burnDamage });
        notes.push(`${player.id} takes burn damage`);
      }
      if (status.type === "parasite" && status.potency && status.sourceId) {
        const parasiteDamage = status.potency * Math.max(1, status.stacks || 1);
        applyDamage(player, parasiteDamage, onDefeated);
        damageTaken[player.id] += parasiteDamage;
        dotDamageEvents[player.id].push({ type: "parasite", amount: parasiteDamage });
        const source = players.find((item) => item.id === status.sourceId);
        if (source) {
          const hpBefore = source.hp;
          source.hp = Math.min(MAX_HP, source.hp + parasiteDamage);
          const healAmount = source.hp - hpBefore;
          if (healAmount > 0) {
            healEvents[source.id].push({ type: "parasite", amount: healAmount });
            notes.push(`${source.id} healed by parasite`);
          }
        }
        notes.push(`${player.id} takes parasite damage`);
      }
    }
  }
}

function applyDamage(actor, amount, onDefeated) {
  const damage = clampInt(amount, 0, 9999, 0);
  const wasAlive = actor.hp > 0;
  actor.hp = Math.max(0, actor.hp - damage);
  if (wasAlive && actor.hp <= 0 && typeof onDefeated === "function") {
    onDefeated(actor.id);
  }
}

function cloneStatus(status) {
  return {
    ...status
  };
}

async function handleSubmitAction(supabase, payload) {
  const roomId = normalizeString(payload?.roomId);
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const actionType = normalizeAction(payload?.action);
  const roundNo = toPositiveInt(payload?.roundNo, 0);

  if (!roomId || !userId || !actionType || roundNo <= 0) {
    throw new Error("roomId, userId, roundNo and valid action are required");
  }

  const room = await getRoomByIdOrThrow(supabase, roomId);
  const side = resolveUserSide(room, userId);
  if (!side) {
    throw new Error("user is not room participant");
  }

  if (room.status === "finished" || room.status === "abandoned") {
    throw new Error("room already finished");
  }

  if (room.status === "waiting") {
    throw new Error("room is waiting for second player");
  }

  if (roundNo !== room.current_round) {
    const resolvedRound = await getRoundByRoomAndNo(supabase, room.id, roundNo);
    if (resolvedRound) {
      return {
        room: await getRoomByIdOrThrow(supabase, room.id),
        round: resolvedRound,
        accepted: true,
        waiting: false
      };
    }
    throw new Error(`round mismatch: expected ${room.current_round}, got ${roundNo}`);
  }

  const { error: actionError } = await supabase
    .from("duel_actions")
    .upsert(
      {
        room_id: room.id,
        round_no: roundNo,
        actor_user_id: userId,
        actor_side: side,
        action_type: actionType
      },
      {
        onConflict: "room_id,round_no,actor_user_id"
      }
    );

  if (actionError) {
    throw new Error(actionError.message || "failed to submit action");
  }

  const actions = await listActionsByRound(supabase, room.id, roundNo);
  const hostAction = actions.find((item) => item.actor_side === "host")?.action_type || null;
  const guestAction = actions.find((item) => item.actor_side === "guest")?.action_type || null;

  if (!hostAction || !guestAction) {
    return {
      room: await getRoomByIdOrThrow(supabase, room.id),
      round: null,
      accepted: true,
      waiting: true
    };
  }

  const existingRound = await getRoundByRoomAndNo(supabase, room.id, roundNo);
  if (existingRound) {
    return {
      room: await getRoomByIdOrThrow(supabase, room.id),
      round: existingRound,
      accepted: true,
      waiting: false
    };
  }

  const resolved = resolveRound(room, hostAction, guestAction);

  const { data: insertedRound, error: roundError } = await supabase
    .from("duel_rounds")
    .insert({
      room_id: room.id,
      round_no: roundNo,
      host_action: resolved.actions.host,
      guest_action: resolved.actions.guest,
      winner_side: resolved.winner_side,
      round_result: resolved
    })
    .select("*")
    .single();

  if (roundError && roundError.code !== "23505") {
    throw new Error(roundError.message || "failed to persist resolved round");
  }

  const updatePayload = {
    host_hp: resolved.hp_after.host,
    guest_hp: resolved.hp_after.guest,
    host_anger: resolved.anger_after.host,
    guest_anger: resolved.anger_after.guest,
    host_statuses: resolved.statuses_after.host,
    guest_statuses: resolved.statuses_after.guest,
    host_free_dodge_used: resolved.free_dodge_used.host,
    guest_free_dodge_used: resolved.free_dodge_used.guest,
    last_resolved_round: roundNo,
    current_round: roundNo + 1,
    winner_side: resolved.winner_side,
    status: resolved.winner_side ? "finished" : "active"
  };

  const { error: roomUpdateError } = await supabase
    .from("duel_rooms")
    .update(updatePayload)
    .eq("id", room.id);

  if (roomUpdateError) {
    throw new Error(roomUpdateError.message || "failed to update room");
  }

  const latestRoom = await getRoomByIdOrThrow(supabase, room.id);
  const latestRound = insertedRound
    ? normalizeRound(insertedRound)
    : await getRoundByRoomAndNo(supabase, room.id, roundNo);

  return {
    room: latestRoom,
    round: latestRound,
    accepted: true,
    waiting: false
  };
}

async function handleLeaveRoom(supabase, payload) {
  const roomId = normalizeString(payload?.roomId);
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;

  if (!roomId || !userId) {
    throw new Error("roomId and userId are required");
  }

  const room = await getRoomByIdOrThrow(supabase, roomId);
  const side = resolveUserSide(room, userId);
  if (!side) {
    throw new Error("user is not room participant");
  }

  if (room.status === "finished" || room.status === "abandoned") {
    return { room };
  }

  const winnerSide = room.host_user_id && room.guest_user_id ? (side === "host" ? "guest" : "host") : null;
  const { data, error } = await supabase
    .from("duel_rooms")
    .update({
      status: "abandoned",
      winner_side: winnerSide
    })
    .eq("id", room.id)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message || "failed to leave room");
  }

  return {
    room: normalizeRoom(data)
  };
}

async function handleRegisterAccount(supabase, payload) {
  const account = normalizeAccount(payload?.account);
  const password = normalizePassword(payload?.password);
  const username = normalizeUsername(
    typeof payload?.username === "string" && payload.username.trim().length > 0
      ? payload.username
      : account
  );
  const accountKey = account.toLowerCase();

  const { data: existing, error: existingError } = await supabase
    .from("runtime_accounts")
    .select("*")
    .eq("account_key", accountKey)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message || "failed to query account");
  }
  if (existing) {
    throw new Error("account already exists");
  }

  const now = new Date().toISOString();
  const sessionToken = generateSessionToken();
  const row = {
    id: `user-${crypto.randomUUID()}`,
    account,
    account_key: accountKey,
    username,
    password_hash: await hashPassword(password),
    session_token: sessionToken,
    session_issued_at: now,
    created_at: now,
    updated_at: now,
    last_login_at: now
  };

  const { data, error } = await supabase.from("runtime_accounts").insert(row).select("*").single();
  if (error || !data) {
    throw new Error(error?.message || "failed to create account");
  }

  return {
    currentUser: toPublicRuntimeUser(data, { includeSessionToken: true })
  };
}

async function handleLoginAccount(supabase, payload) {
  const account = normalizeAccount(payload?.account);
  const password = normalizePassword(payload?.password);
  const accountKey = account.toLowerCase();

  const { data: candidate, error } = await supabase
    .from("runtime_accounts")
    .select("*")
    .eq("account_key", accountKey)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query account");
  }
  if (!candidate) {
    throw new Error("account not found");
  }

  const incomingHash = await hashPassword(password);
  if (incomingHash !== String(candidate.password_hash || "")) {
    throw new Error("invalid password");
  }

  const now = new Date().toISOString();
  const sessionToken = generateSessionToken();
  const { data: updated, error: updateError } = await supabase
    .from("runtime_accounts")
    .update({
      session_token: sessionToken,
      session_issued_at: now,
      last_login_at: now,
      updated_at: now
    })
    .eq("id", candidate.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    throw new Error(updateError?.message || "failed to update login timestamp");
  }

  return {
    currentUser: toPublicRuntimeUser(updated, { includeSessionToken: true })
  };
}

async function handleUpdateAccount(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const oldPassword = normalizePassword(payload?.oldPassword);
  const nextUsernameRaw = typeof payload?.username === "string" ? payload.username : "";
  const nextPasswordRaw = typeof payload?.newPassword === "string" ? payload.newPassword : "";

  const account = await getRuntimeAccountByIdOrThrow(supabase, userId);
  const oldPasswordHash = await hashPassword(oldPassword);
  if (oldPasswordHash !== String(account.password_hash || "")) {
    throw new Error("invalid old password");
  }

  const patch = {};
  let changed = false;
  if (nextUsernameRaw.trim().length > 0) {
    const username = normalizeUsername(nextUsernameRaw);
    if (username !== account.username) {
      patch.username = username;
      changed = true;
    }
  }
  if (nextPasswordRaw.trim().length > 0) {
    const newPassword = normalizePassword(nextPasswordRaw);
    const newHash = await hashPassword(newPassword);
    if (newHash !== account.password_hash) {
      patch.password_hash = newHash;
      changed = true;
    }
  }

  if (!changed) {
    return {
      changed: false,
      currentUser: toPublicRuntimeUser(account, { includeSessionToken: true })
    };
  }

  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("runtime_accounts")
    .update(patch)
    .eq("id", account.id)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "failed to update account");
  }

  return {
    changed: true,
    currentUser: toPublicRuntimeUser(data, { includeSessionToken: true })
  };
}

async function handleSearchAccounts(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const keyword = typeof payload?.keyword === "string" ? payload.keyword.trim().toLowerCase() : "";
  const limit = clampPositiveInt(payload?.limit, 12, 1, 50);

  let query = supabase
    .from("runtime_accounts")
    .select("id, account, username, created_at, last_login_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit + 5, 120));
  if (keyword.length > 0) {
    query = query.ilike("account_key", `%${keyword}%`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message || "search failed");
  }

  const users = (Array.isArray(data) ? data : [])
    .filter((item) => String(item?.id || "") !== userId)
    .slice(0, limit)
    .map(toPublicRuntimeUser);

  return { users };
}

async function handleSendDuelRequest(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const targetAccount = normalizeAccount(payload?.targetAccount);
  const allowResend = Boolean(payload?.allowResend);

  const fromUser = await getRuntimeAccountByIdOrThrow(supabase, userId);
  const toUser = await getRuntimeAccountByAccountOrThrow(supabase, targetAccount);
  if (fromUser.id === toUser.id) {
    throw new Error("cannot challenge yourself");
  }

  const { data: pendingRows, error: pendingError } = await supabase
    .from("runtime_duel_requests")
    .select("*")
    .eq("status", "pending")
    .or(
      `and(from_user_id.eq.${fromUser.id},to_user_id.eq.${toUser.id}),and(from_user_id.eq.${toUser.id},to_user_id.eq.${fromUser.id})`
    )
    .order("updated_at", { ascending: false })
    .limit(1);
  if (pendingError) {
    throw new Error(pendingError.message || "failed to query pending requests");
  }

  const duplicate = Array.isArray(pendingRows) && pendingRows.length > 0 ? pendingRows[0] : null;
  if (duplicate) {
    if (allowResend && String(duplicate.from_user_id || "") === fromUser.id) {
      const now = Date.now();
      const lastTouched = Date.parse(String(duplicate.updated_at || duplicate.created_at || ""));
      const elapsed = Number.isFinite(lastTouched) ? Math.max(0, now - lastTouched) : Number.MAX_SAFE_INTEGER;
      if (elapsed < DUEL_REQUEST_RESEND_INTERVAL_MS) {
        return {
          resent: false,
          retryAfterSeconds: Math.ceil((DUEL_REQUEST_RESEND_INTERVAL_MS - elapsed) / 1000),
          request: normalizeRuntimeDuelRequest(duplicate)
        };
      }
      const { data: resentRow, error: resentError } = await supabase
        .from("runtime_duel_requests")
        .update({ updated_at: new Date(now).toISOString() })
        .eq("id", duplicate.id)
        .select("*")
        .single();
      if (resentError || !resentRow) {
        throw new Error(resentError?.message || "failed to resend request");
      }
      return {
        resent: true,
        request: normalizeRuntimeDuelRequest(resentRow)
      };
    }
    throw new Error("pending duel request already exists");
  }

  const now = new Date().toISOString();
  const row = {
    from_user_id: fromUser.id,
    from_account: fromUser.account,
    to_user_id: toUser.id,
    to_account: toUser.account,
    status: "pending",
    room_id: null,
    room_code: null,
    room_status: null,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await supabase
    .from("runtime_duel_requests")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) {
    throw new Error(error?.message || "failed to send duel request");
  }

  return {
    resent: false,
    request: normalizeRuntimeDuelRequest(data)
  };
}

async function handleListDuelRequests(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;

  const [inboundRes, outboundRes] = await Promise.all([
    supabase
      .from("runtime_duel_requests")
      .select("*")
      .eq("to_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("runtime_duel_requests")
      .select("*")
      .eq("from_user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200)
  ]);

  if (inboundRes.error) {
    throw new Error(inboundRes.error.message || "failed to load inbound requests");
  }
  if (outboundRes.error) {
    throw new Error(outboundRes.error.message || "failed to load outbound requests");
  }

  return {
    inbound: (Array.isArray(inboundRes.data) ? inboundRes.data : []).map(normalizeRuntimeDuelRequest),
    outbound: (Array.isArray(outboundRes.data) ? outboundRes.data : []).map(normalizeRuntimeDuelRequest)
  };
}

async function handleRespondDuelRequest(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const requestId = normalizeString(payload?.requestId);
  const decision = normalizeDuelRequestDecision(payload?.decision);
  if (!requestId) {
    throw new Error("request id is required");
  }

  const { data: request, error } = await supabase
    .from("runtime_duel_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query duel request");
  }
  if (!request) {
    throw new Error("duel request not found");
  }
  if (String(request.to_user_id || "") !== userId) {
    throw new Error("request is not inbound");
  }
  if (String(request.status || "") !== "pending") {
    throw new Error("duel request already resolved");
  }

  const now = new Date().toISOString();
  const status = decision === "accept" ? "accepted" : "rejected";
  const patch =
    status === "accepted"
      ? {
          status,
          room_id: normalizeString(payload?.roomId) || null,
          room_code: normalizeRoomCode(payload?.roomCode),
          room_status: normalizeRuntimeRoomStatus(payload?.roomStatus),
          updated_at: now
        }
      : {
          status,
          room_id: null,
          room_code: null,
          room_status: null,
          updated_at: now
        };

  const { data: updated, error: updateError } = await supabase
    .from("runtime_duel_requests")
    .update(patch)
    .eq("id", request.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    throw new Error(updateError?.message || "failed to respond duel request");
  }

  return {
    request: normalizeRuntimeDuelRequest(updated)
  };
}

async function handleCancelDuelRequest(supabase, payload) {
  const sessionUser = await requireRuntimeSessionUser(supabase, payload);
  const userId = sessionUser.id;
  const requestId = normalizeString(payload?.requestId);
  if (!requestId) {
    throw new Error("request id is required");
  }

  const { data: request, error } = await supabase
    .from("runtime_duel_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query duel request");
  }
  if (!request) {
    throw new Error("duel request not found");
  }
  if (String(request.from_user_id || "") !== userId) {
    throw new Error("request is not outbound");
  }
  if (String(request.status || "") !== "pending") {
    throw new Error("duel request already resolved");
  }

  const { data: updated, error: updateError } = await supabase
    .from("runtime_duel_requests")
    .update({
      status: "cancelled",
      room_id: null,
      room_code: null,
      room_status: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", request.id)
    .select("*")
    .single();
  if (updateError || !updated) {
    throw new Error(updateError?.message || "failed to cancel duel request");
  }

  return {
    request: normalizeRuntimeDuelRequest(updated)
  };
}

async function getRuntimeAccountByIdOrThrow(supabase, userId) {
  const { data, error } = await supabase
    .from("runtime_accounts")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query account");
  }
  if (!data) {
    throw new Error("account not found");
  }
  return data;
}

async function requireRuntimeSessionUser(supabase, payload) {
  const userId = normalizeRuntimeUserId(payload?.userId);
  const sessionToken = normalizeSessionToken(payload?.sessionToken);
  const account = await getRuntimeAccountByIdOrThrow(supabase, userId);
  const currentToken = normalizeString(account?.session_token) || null;
  if (!currentToken || currentToken !== sessionToken) {
    throw new Error("session invalidated");
  }
  return toPublicRuntimeUser(account, { includeSessionToken: true });
}

async function getRuntimeAccountByAccountOrThrow(supabase, account) {
  const { data, error } = await supabase
    .from("runtime_accounts")
    .select("*")
    .eq("account_key", account.toLowerCase())
    .maybeSingle();
  if (error) {
    throw new Error(error.message || "failed to query account");
  }
  if (!data) {
    throw new Error("target account not found");
  }
  return data;
}

function toPublicRuntimeUser(input, options = {}) {
  const base = {
    id: normalizeRuntimeUserId(input?.id),
    account: normalizeString(input?.account) || "",
    username: normalizeString(input?.username) || normalizeString(input?.account) || "",
    createdAt: normalizeString(input?.created_at) || new Date().toISOString(),
    lastLoginAt: normalizeString(input?.last_login_at) || null
  };
  if (options?.includeSessionToken) {
    return {
      ...base,
      sessionToken: normalizeString(input?.session_token) || ""
    };
  }
  return base;
}

function normalizeRuntimeDuelRequest(input) {
  const status = normalizeString(input?.status) || "pending";
  return {
    id: normalizeString(input?.id) || "",
    fromUserId: normalizeRuntimeUserId(input?.from_user_id),
    fromAccount: normalizeString(input?.from_account) || "",
    toUserId: normalizeRuntimeUserId(input?.to_user_id),
    toAccount: normalizeString(input?.to_account) || "",
    status: ALLOWED_DUEL_REQUEST_STATUS.has(status) ? status : "pending",
    roomId: normalizeString(input?.room_id) || null,
    roomCode: normalizeRoomCode(input?.room_code),
    roomStatus: normalizeRuntimeRoomStatus(input?.room_status),
    createdAt: normalizeString(input?.created_at) || new Date().toISOString(),
    updatedAt: normalizeString(input?.updated_at) || new Date().toISOString()
  };
}

function normalizeRuntimeUserId(input) {
  const text = normalizeString(input);
  if (!text) {
    throw new Error("user id is required");
  }
  return text;
}

function normalizeAccount(input) {
  const account = normalizeString(input);
  if (!account) throw new Error("account is required");
  if (account.length < 3 || account.length > 32) {
    throw new Error("account length must be 3-32");
  }
  if (/\s/.test(account)) {
    throw new Error("account cannot contain spaces");
  }
  return account;
}

function normalizeUsername(input) {
  const username = normalizeString(input);
  if (!username) throw new Error("username is required");
  if (username.length < 2 || username.length > 24) {
    throw new Error("username length must be 2-24");
  }
  return username;
}

function normalizePassword(input) {
  const password = normalizeString(input);
  if (!password) throw new Error("password is required");
  if (password.length < 6 || password.length > 64) {
    throw new Error("password length must be 6-64");
  }
  return password;
}

function normalizeDuelRequestDecision(input) {
  const decision = normalizeString(input);
  if (!decision) throw new Error("decision is required");
  const lower = decision.toLowerCase();
  if (lower !== "accept" && lower !== "reject") {
    throw new Error("invalid duel request decision");
  }
  return lower;
}

function normalizeRuntimeRoomStatus(input) {
  const status = normalizeString(input);
  if (!status) return null;
  const lower = status.toLowerCase();
  if (lower === "waiting" || lower === "active" || lower === "finished" || lower === "abandoned") {
    return lower;
  }
  return null;
}

function clampPositiveInt(input, fallback, min, max) {
  const num = Number(input);
  if (!Number.isInteger(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

async function hashPassword(password) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
