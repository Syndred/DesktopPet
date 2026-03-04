import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES } from "@qingpet/shared-types";
import { InMemoryBattleRoomService } from "@qingpet/supabase-edge";

describe("T-104 realtime room sync and validation", () => {
  it("creates and joins a battle room", () => {
    const svc = new InMemoryBattleRoomService();
    const created = svc.createRoom("u1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const joined = svc.joinRoom(created.data.id, "u2");
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;

    expect(joined.data.status).toBe("active");
    expect(joined.data.opponentId).toBe("u2");
  });

  it("rejects non-participant submissions", () => {
    const svc = new InMemoryBattleRoomService();
    const created = svc.createRoom("u1");
    if (!created.ok) return;
    svc.joinRoom(created.data.id, "u2");

    const result = svc.submitAction({
      roomId: created.data.id,
      userId: "u3",
      roundNo: 1,
      action: "normal_attack"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APP_ERROR_CODES.AUTH_FORBIDDEN);
    }
  });

  it("broadcasts actions only after both players submit", () => {
    const svc = new InMemoryBattleRoomService();
    const created = svc.createRoom("u1");
    if (!created.ok) return;
    svc.joinRoom(created.data.id, "u2");

    const first = svc.submitAction({
      roomId: created.data.id,
      userId: "u1",
      roundNo: 1,
      action: "normal_attack"
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.data.broadcast).toBeUndefined();

    const second = svc.submitAction({
      roomId: created.data.id,
      userId: "u2",
      roundNo: 1,
      action: "dodge"
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.broadcast?.roundNo).toBe(1);
    expect(second.data.broadcast?.actions.u1).toBe("normal_attack");
    expect(second.data.broadcast?.actions.u2).toBe("dodge");
  });

  it("supports reconnect for participants", () => {
    const svc = new InMemoryBattleRoomService();
    const created = svc.createRoom("u1");
    if (!created.ok) return;
    svc.joinRoom(created.data.id, "u2");

    const reconnect = svc.reconnect(created.data.id, "u2");
    expect(reconnect.ok).toBe(true);
    if (!reconnect.ok) return;
    expect(reconnect.data.id).toBe(created.data.id);
  });

  it("rejects round mismatch", () => {
    const svc = new InMemoryBattleRoomService();
    const created = svc.createRoom("u1");
    if (!created.ok) return;
    svc.joinRoom(created.data.id, "u2");

    const result = svc.submitAction({
      roomId: created.data.id,
      userId: "u1",
      roundNo: 2,
      action: "normal_attack"
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(APP_ERROR_CODES.BATTLE_INVALID_ACTION);
    }
  });
});

