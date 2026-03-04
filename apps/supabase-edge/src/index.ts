import {
  APP_ERROR_CODES,
  fail,
  ok,
  type ApiResponse,
  type BattleTurnPayload
} from "@qingpet/shared-types";
export * from "./realtime-room.js";
export * from "./lbs.js";
export * from "./capture.js";
export * from "./emotion.js";
export * from "./territory.js";
export * from "./core-loop.js";
export * from "./social.js";
export * from "./friends.js";
export * from "./appearance.js";
export * from "./config-center.js";
export * from "./anti-cheat.js";

const ALLOWED_ACTIONS = new Set([
  "normal_attack",
  "element_attack",
  "dodge",
  "ultimate"
]);

export function validateBattleTurnPayload(payload: BattleTurnPayload): boolean {
  if (!payload.attackerId || !payload.defenderId) return false;
  if (!ALLOWED_ACTIONS.has(payload.action)) return false;
  return payload.attackerId !== payload.defenderId;
}

export function validateBattleTurnPayloadOrError(
  requestId: string,
  payload: BattleTurnPayload
): ApiResponse<{ valid: true }> {
  if (!payload.attackerId || !payload.defenderId) {
    return fail(
      requestId,
      APP_ERROR_CODES.VALIDATION_INVALID_PAYLOAD,
      "attackerId and defenderId are required"
    );
  }

  if (payload.attackerId === payload.defenderId) {
    return fail(
      requestId,
      APP_ERROR_CODES.BATTLE_INVALID_ACTION,
      "attacker and defender cannot be the same"
    );
  }

  if (!ALLOWED_ACTIONS.has(payload.action)) {
    return fail(
      requestId,
      APP_ERROR_CODES.BATTLE_INVALID_ACTION,
      "unsupported action"
    );
  }

  return ok(requestId, { valid: true });
}
