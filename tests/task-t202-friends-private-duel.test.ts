import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES } from "@qingpet/shared-types";
import { InMemoryFriendService } from "@qingpet/supabase-edge";

describe("T-202 friends and private duel", () => {
  it("supports friend request and acceptance flow", () => {
    const svc = new InMemoryFriendService();

    const req = svc.sendFriendRequest("u1", "u2");
    expect(req.ok).toBe(true);
    if (!req.ok) return;

    const accepted = svc.acceptFriendRequest(req.data.requestId, "u2");
    expect(accepted.ok).toBe(true);

    expect(svc.listFriends("u1")).toEqual(["u2"]);
    expect(svc.listFriends("u2")).toEqual(["u1"]);
  });

  it("creates and joins private duel room for friends", () => {
    const svc = new InMemoryFriendService();
    const req = svc.sendFriendRequest("u10", "u11");
    if (!req.ok) return;
    svc.acceptFriendRequest(req.data.requestId, "u11");

    const room = svc.createPrivateDuelRoom("u10", "u11");
    expect(room.ok).toBe(true);
    if (!room.ok) return;

    const joined = svc.joinPrivateDuelRoom(room.data.roomCode, "u11");
    expect(joined.ok).toBe(true);
    if (!joined.ok) return;
    expect(joined.data.status).toBe("active");
  });

  it("rejects private room creation for non-friends", () => {
    const svc = new InMemoryFriendService();
    const room = svc.createPrivateDuelRoom("u20", "u21");
    expect(room.ok).toBe(false);
    if (!room.ok) {
      expect(room.error.code).toBe(APP_ERROR_CODES.AUTH_FORBIDDEN);
    }
  });

  it("rejects unauthorized user join", () => {
    const svc = new InMemoryFriendService();
    const req = svc.sendFriendRequest("u30", "u31");
    if (!req.ok) return;
    svc.acceptFriendRequest(req.data.requestId, "u31");
    const room = svc.createPrivateDuelRoom("u30", "u31");
    if (!room.ok) return;

    const joined = svc.joinPrivateDuelRoom(room.data.roomCode, "u32");
    expect(joined.ok).toBe(false);
    if (!joined.ok) {
      expect(joined.error.code).toBe(APP_ERROR_CODES.AUTH_FORBIDDEN);
    }
  });
});

