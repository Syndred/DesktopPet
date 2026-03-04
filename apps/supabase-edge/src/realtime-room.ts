import { randomUUID } from "node:crypto";

import {
  APP_ERROR_CODES,
  fail,
  ok,
  type ApiResponse,
  type BattleActionType
} from "@qingpet/shared-types";

export type RoomStatus = "waiting" | "active" | "finished";

export interface BattleRoomSnapshot {
  id: string;
  roomCode: string;
  creatorId: string;
  opponentId: string | null;
  status: RoomStatus;
  currentRound: number;
  updatedAt: string;
}

export interface RoundBroadcast {
  roomId: string;
  roundNo: number;
  actions: Record<string, BattleActionType>;
}

interface BattleRoomState extends BattleRoomSnapshot {
  roundActions: Map<number, Map<string, BattleActionType>>;
}

export class InMemoryBattleRoomService {
  private readonly rooms = new Map<string, BattleRoomState>();

  createRoom(creatorId: string): ApiResponse<BattleRoomSnapshot> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const room: BattleRoomState = {
      id,
      roomCode: id.slice(0, 8).toUpperCase(),
      creatorId,
      opponentId: null,
      status: "waiting",
      currentRound: 1,
      updatedAt: now,
      roundActions: new Map()
    };

    this.rooms.set(id, room);
    return ok("create-room", stripInternalFields(room));
  }

  joinRoom(roomId: string, userId: string): ApiResponse<BattleRoomSnapshot> {
    const room = this.rooms.get(roomId);
    if (!room) return fail("join-room", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND);

    if (room.creatorId === userId || room.opponentId === userId) {
      return ok("join-room", stripInternalFields(room));
    }

    if (room.opponentId) {
      return fail(
        "join-room",
        APP_ERROR_CODES.TERRITORY_CONFLICT,
        "room already has two players"
      );
    }

    room.opponentId = userId;
    room.status = "active";
    room.updatedAt = new Date().toISOString();
    return ok("join-room", stripInternalFields(room));
  }

  submitAction(input: {
    roomId: string;
    userId: string;
    roundNo: number;
    action: BattleActionType;
  }): ApiResponse<{ accepted: true; broadcast?: RoundBroadcast }> {
    const room = this.rooms.get(input.roomId);
    if (!room) {
      return fail("submit-action", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND);
    }

    const isParticipant =
      room.creatorId === input.userId || room.opponentId === input.userId;
    if (!isParticipant) {
      return fail("submit-action", APP_ERROR_CODES.AUTH_FORBIDDEN);
    }

    if (room.status === "waiting") {
      return fail(
        "submit-action",
        APP_ERROR_CODES.BATTLE_INVALID_ACTION,
        "waiting room cannot receive actions"
      );
    }

    if (input.roundNo !== room.currentRound) {
      return fail(
        "submit-action",
        APP_ERROR_CODES.BATTLE_INVALID_ACTION,
        "round mismatch"
      );
    }

    const actions = room.roundActions.get(input.roundNo) ?? new Map();
    actions.set(input.userId, input.action);
    room.roundActions.set(input.roundNo, actions);

    const creatorAction = actions.get(room.creatorId);
    const opponentAction = room.opponentId ? actions.get(room.opponentId) : undefined;
    room.updatedAt = new Date().toISOString();

    if (!creatorAction || !opponentAction || !room.opponentId) {
      return ok("submit-action", { accepted: true });
    }

    const broadcast: RoundBroadcast = {
      roomId: room.id,
      roundNo: room.currentRound,
      actions: {
        [room.creatorId]: creatorAction,
        [room.opponentId]: opponentAction
      }
    };
    room.currentRound += 1;
    return ok("submit-action", { accepted: true, broadcast });
  }

  reconnect(roomId: string, userId: string): ApiResponse<BattleRoomSnapshot> {
    const room = this.rooms.get(roomId);
    if (!room) return fail("reconnect", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND);

    const isParticipant =
      room.creatorId === userId || room.opponentId === userId;
    if (!isParticipant) return fail("reconnect", APP_ERROR_CODES.AUTH_FORBIDDEN);

    return ok("reconnect", stripInternalFields(room));
  }
}

function stripInternalFields(room: BattleRoomState): BattleRoomSnapshot {
  return {
    id: room.id,
    roomCode: room.roomCode,
    creatorId: room.creatorId,
    opponentId: room.opponentId,
    status: room.status,
    currentRound: room.currentRound,
    updatedAt: room.updatedAt
  };
}

