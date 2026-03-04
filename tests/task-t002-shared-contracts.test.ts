import { describe, expect, it } from "vitest";

import {
  APP_ERROR_CODES,
  CORE_EVENTS,
  buildAppError,
  fail,
  isAppErrorCode,
  ok
} from "@qingpet/shared-types";
import { validateBattleTurnPayloadOrError } from "@qingpet/supabase-edge";

describe("T-002 shared contracts and error codes", () => {
  it("keeps error codes unique", () => {
    const values = Object.values(APP_ERROR_CODES);
    expect(new Set(values).size).toBe(values.length);
  });

  it("builds metadata-rich errors", () => {
    const err = buildAppError(
      APP_ERROR_CODES.VALIDATION_INVALID_PAYLOAD,
      "invalid payload"
    );

    expect(err.code).toBe(APP_ERROR_CODES.VALIDATION_INVALID_PAYLOAD);
    expect(err.httpStatus).toBe(400);
    expect(err.recoverable).toBe(true);
    expect(isAppErrorCode(err.code)).toBe(true);
  });

  it("returns strongly typed API responses", () => {
    const success = ok("req-1", { done: true });
    const error = fail("req-2", APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR);

    expect(success.ok).toBe(true);
    expect(success.data.done).toBe(true);
    expect(error.ok).toBe(false);
    expect(error.error.httpStatus).toBe(500);
  });

  it("validates battle payload with unified error contract", () => {
    const result = validateBattleTurnPayloadOrError("req-3", {
      attackerId: "u1",
      defenderId: "u1",
      attackerElement: "fire",
      defenderElement: "water",
      action: "normal_attack"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APP_ERROR_CODES.BATTLE_INVALID_ACTION);
    }
  });

  it("keeps core event names stable", () => {
    expect(CORE_EVENTS.BATTLE_ROOM_CREATED).toBe("battle_room_created");
    expect(CORE_EVENTS.TERRITORY_OCCUPIED).toBe("territory_occupied");
  });
});

