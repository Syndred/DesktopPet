import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES } from "@qingpet/shared-types";
import { InMemoryBattleRoomService, InMemoryFriendService } from "@qingpet/supabase-edge";

describe("security: access control", () => {
  it("blocks non-participants from submitting battle actions", () => {
    const svc = new InMemoryBattleRoomService();
    const room = svc.createRoom("owner");
    if (!room.ok) return;
    svc.joinRoom(room.data.id, "guest");

    const submit = svc.submitAction({
      roomId: room.data.id,
      userId: "attacker",
      roundNo: 1,
      action: "normal_attack"
    });

    expect(submit.ok).toBe(false);
    if (!submit.ok) {
      expect(submit.error.code).toBe(APP_ERROR_CODES.AUTH_FORBIDDEN);
    }
  });

  it("blocks unauthorized users from joining private duel room", () => {
    const svc = new InMemoryFriendService();
    const req = svc.sendFriendRequest("u1", "u2");
    if (!req.ok) return;
    svc.acceptFriendRequest(req.data.requestId, "u2");
    const room = svc.createPrivateDuelRoom("u1", "u2");
    if (!room.ok) return;

    const joined = svc.joinPrivateDuelRoom(room.data.roomCode, "u3");
    expect(joined.ok).toBe(false);
    if (!joined.ok) {
      expect(joined.error.code).toBe(APP_ERROR_CODES.AUTH_FORBIDDEN);
    }
  });
});

