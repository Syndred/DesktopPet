import { randomUUID } from "node:crypto";

import { APP_ERROR_CODES, fail, ok, type ApiResponse } from "@qingpet/shared-types";

type RequestStatus = "pending" | "accepted" | "rejected";

interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: RequestStatus;
  createdAt: string;
}

interface PrivateDuelRoom {
  id: string;
  roomCode: string;
  ownerId: string;
  invitedUserId: string;
  status: "waiting" | "active";
  createdAt: string;
}

export class InMemoryFriendService {
  private requests = new Map<string, FriendRequest>();
  private friendships = new Map<string, Set<string>>();
  private duelRooms = new Map<string, PrivateDuelRoom>();

  sendFriendRequest(fromUserId: string, toUserId: string): ApiResponse<{ requestId: string }> {
    if (fromUserId === toUserId) {
      return fail("friend-request", APP_ERROR_CODES.VALIDATION_INVALID_PAYLOAD, "self request");
    }

    const existing = this.areFriends(fromUserId, toUserId);
    if (existing) {
      return fail("friend-request", APP_ERROR_CODES.TERRITORY_CONFLICT, "already friends");
    }

    const req: FriendRequest = {
      id: randomUUID(),
      fromUserId,
      toUserId,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    this.requests.set(req.id, req);
    return ok("friend-request", { requestId: req.id });
  }

  acceptFriendRequest(requestId: string, accepterUserId: string): ApiResponse<{ accepted: true }> {
    const req = this.requests.get(requestId);
    if (!req) {
      return fail("friend-accept", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND, "request not found");
    }

    if (req.toUserId !== accepterUserId) {
      return fail("friend-accept", APP_ERROR_CODES.AUTH_FORBIDDEN, "not request recipient");
    }

    req.status = "accepted";
    this.addFriendship(req.fromUserId, req.toUserId);
    return ok("friend-accept", { accepted: true });
  }

  listFriends(userId: string): string[] {
    return [...(this.friendships.get(userId) ?? new Set<string>())].sort();
  }

  createPrivateDuelRoom(ownerId: string, invitedUserId: string): ApiResponse<{ roomCode: string }> {
    if (!this.areFriends(ownerId, invitedUserId)) {
      return fail(
        "private-room-create",
        APP_ERROR_CODES.AUTH_FORBIDDEN,
        "users are not friends"
      );
    }

    const room: PrivateDuelRoom = {
      id: randomUUID(),
      roomCode: randomUUID().slice(0, 8).toUpperCase(),
      ownerId,
      invitedUserId,
      status: "waiting",
      createdAt: new Date().toISOString()
    };
    this.duelRooms.set(room.roomCode, room);
    return ok("private-room-create", { roomCode: room.roomCode });
  }

  joinPrivateDuelRoom(roomCode: string, userId: string): ApiResponse<{ status: "active" }> {
    const room = this.duelRooms.get(roomCode);
    if (!room) {
      return fail("private-room-join", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND, "room not found");
    }

    if (userId !== room.ownerId && userId !== room.invitedUserId) {
      return fail("private-room-join", APP_ERROR_CODES.AUTH_FORBIDDEN, "user not allowed");
    }

    room.status = "active";
    return ok("private-room-join", { status: "active" });
  }

  private addFriendship(a: string, b: string): void {
    const aSet = this.friendships.get(a) ?? new Set<string>();
    const bSet = this.friendships.get(b) ?? new Set<string>();
    aSet.add(b);
    bSet.add(a);
    this.friendships.set(a, aSet);
    this.friendships.set(b, bSet);
  }

  private areFriends(a: string, b: string): boolean {
    return this.friendships.get(a)?.has(b) ?? false;
  }
}

