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
  normal_attack: 20,
  element_attack: 24,
  dodge: 0,
  ultimate: 40
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ALLOWED_ELEMENTS = new Set(["metal", "wood", "earth", "water", "fire"]);
const ALLOWED_ACTIONS = new Set(["normal_attack", "element_attack", "dodge", "ultimate"]);
const MAX_HP = 120;

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
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.5;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.7;
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
    host_statuses: [],
    guest_statuses: [],
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
  const user = normalizeUser(payload);
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
  const user = normalizeUser(payload);
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
      host: [],
      guest: []
    },
    heal_events: {
      host: [],
      guest: []
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
      host: [],
      guest: []
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
    element: room.host_element,
    hp: room.host_hp,
    anger: room.host_anger,
    freeDodgeUsed: Boolean(room.host_free_dodge_used)
  };

  const guest = {
    element: room.guest_element || "wood",
    hp: room.guest_hp,
    anger: room.guest_anger,
    freeDodgeUsed: Boolean(room.guest_free_dodge_used)
  };

  const normalizeCombatAction = (side, actor, actionInput) => {
    const normalized = normalizeAction(actionInput) || "normal_attack";
    if (normalized === "dodge" && actor.anger <= 0 && actor.freeDodgeUsed) {
      notes.push(`${side} dodge downgraded to normal_attack (anger <= 0)`);
      return "normal_attack";
    }
    if (normalized === "ultimate" && actor.anger < 50) {
      notes.push(`${side} ultimate downgraded to normal_attack (anger < 50)`);
      return "normal_attack";
    }
    if (normalized === "ultimate") {
      actor.anger = Math.max(0, actor.anger - 50);
      return "ultimate";
    }
    if (normalized === "dodge") {
      actor.freeDodgeUsed = true;
      if (actor.anger > 0) {
        actor.anger = Math.max(0, actor.anger - 20);
      }
    }
    return normalized;
  };

  const hostAction = normalizeCombatAction("host", host, hostInputAction);
  const guestAction = normalizeCombatAction("guest", guest, guestInputAction);

  const doesHit = (attackerAction, defenderAction) => {
    if (attackerAction === "dodge") return false;
    if (attackerAction === "ultimate") return true;
    if (attackerAction === "normal_attack" && defenderAction === "dodge") return false;
    if (attackerAction === "element_attack" && defenderAction === "normal_attack") return false;
    return true;
  };

  const computeDamage = (attackerAction, attackerElement, defenderElement) => {
    let damage = BASE_DAMAGE[attackerAction] || BASE_DAMAGE.normal_attack;
    damage *= getElementMultiplier(attackerElement, defenderElement);
    return Math.max(0, Math.round(damage));
  };

  const damageTaken = { host: 0, guest: 0 };
  const directDamage = { host: 0, guest: 0 };

  if (doesHit(hostAction, guestAction)) {
    const damage = computeDamage(hostAction, host.element, guest.element);
    guest.hp = Math.max(0, guest.hp - damage);
    damageTaken.guest += damage;
    directDamage.guest += damage;
    if (hostAction !== "ultimate" && getElementMultiplier(host.element, guest.element) > 1) {
      host.anger = Math.min(100, host.anger + 20);
    }
    guest.anger = Math.min(100, guest.anger + Math.floor(damage * 0.5));
  } else if (hostAction !== "dodge") {
    notes.push("host action missed");
  }

  if (doesHit(guestAction, hostAction)) {
    const damage = computeDamage(guestAction, guest.element, host.element);
    host.hp = Math.max(0, host.hp - damage);
    damageTaken.host += damage;
    directDamage.host += damage;
    if (guestAction !== "ultimate" && getElementMultiplier(guest.element, host.element) > 1) {
      guest.anger = Math.min(100, guest.anger + 20);
    }
    host.anger = Math.min(100, host.anger + Math.floor(damage * 0.5));
  } else if (guestAction !== "dodge") {
    notes.push("guest action missed");
  }

  if (hostAction === "dodge" && guestAction === "normal_attack") {
    host.anger = Math.min(100, host.anger + 30);
  }

  if (guestAction === "dodge" && hostAction === "normal_attack") {
    guest.anger = Math.min(100, guest.anger + 30);
  }

  let winnerSide = null;
  if (host.hp <= 0 && guest.hp <= 0) {
    winnerSide = "guest";
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
    dot_damage_events: {
      host: [],
      guest: []
    },
    heal_events: {
      host: [],
      guest: []
    },
    hp_after: {
      host: host.hp,
      guest: guest.hp
    },
    anger_after: {
      host: host.anger,
      guest: guest.anger
    },
    statuses_after: {
      host: [],
      guest: []
    },
    free_dodge_used: {
      host: host.freeDodgeUsed,
      guest: guest.freeDodgeUsed
    },
    winner_side: winnerSide,
    notes
  };
}

async function handleSubmitAction(supabase, payload) {
  const roomId = normalizeString(payload?.roomId);
  const userId = normalizeString(payload?.userId);
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
    host_statuses: [],
    guest_statuses: [],
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
  const userId = normalizeString(payload?.userId);

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
