import { BattleEngine, type Combatant } from "@qingpet/game-engine";
import { APP_ERROR_CODES, fail, ok, type ApiResponse, type BattleActionType } from "@qingpet/shared-types";

import { InMemoryCaptureService } from "./capture.js";
import { generateSpawnedPet, type SpawnPoint } from "./lbs.js";
import { InMemoryBattleRoomService } from "./realtime-room.js";
import { InMemoryTerritoryService } from "./territory.js";

export interface CoreLoopInput {
  userId: string;
  rivalUserId: string;
  spawnPoint: SpawnPoint;
  territoryId: string;
  userPosition: { lat: number; lng: number };
  petName: string;
  memoryTag: string;
  userAction: BattleActionType;
  rivalAction: BattleActionType;
  baseReward: number;
  now?: Date;
}

export interface CoreLoopSummary {
  capturedPetId: string;
  battleRoomId: string;
  winnerId: string;
  territoryOwnerId: string | null;
  finalReward: number;
}

export class CoreLoopService {
  constructor(
    private readonly captureService: InMemoryCaptureService,
    private readonly roomService: InMemoryBattleRoomService,
    private readonly territoryService: InMemoryTerritoryService
  ) {}

  runCoreLoop(input: CoreLoopInput): ApiResponse<CoreLoopSummary> {
    const spawned = generateSpawnedPet(
      input.spawnPoint,
      input.now ?? new Date(),
      0.51
    );

    const capture = this.captureService.adoptCapturedPet({
      userId: input.userId,
      spawnedPet: spawned,
      petName: input.petName,
      memoryTag: input.memoryTag,
      userPosition: input.userPosition,
      spawnPosition: input.spawnPoint.position,
      gpsAccuracyMeters: 12
    });
    if (!capture.ok) {
      return fail("core-loop", APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR, capture.error.message);
    }

    const roomCreated = this.roomService.createRoom(input.userId);
    if (!roomCreated.ok) {
      return fail("core-loop", APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR, "room creation failed");
    }

    const joined = this.roomService.joinRoom(roomCreated.data.id, input.rivalUserId);
    if (!joined.ok) {
      return fail("core-loop", APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR, "room join failed");
    }

    const action1 = this.roomService.submitAction({
      roomId: roomCreated.data.id,
      userId: input.userId,
      roundNo: 1,
      action: input.userAction
    });
    if (!action1.ok) {
      return fail("core-loop", APP_ERROR_CODES.BATTLE_INVALID_ACTION, action1.error.message);
    }

    const action2 = this.roomService.submitAction({
      roomId: roomCreated.data.id,
      userId: input.rivalUserId,
      roundNo: 1,
      action: input.rivalAction
    });
    if (!action2.ok || !action2.data.broadcast) {
      return fail("core-loop", APP_ERROR_CODES.BATTLE_INVALID_ACTION, "battle round did not broadcast");
    }

    const userCombatant = createCombatant(
      input.userId,
      capture.data.pet.element
    );
    const rivalCombatant = createCombatant(input.rivalUserId, "wood");
    const engine = new BattleEngine(userCombatant, rivalCombatant);
    const roundResult = engine.executeRound({
      [input.userId]: input.userAction,
      [input.rivalUserId]: input.rivalAction
    });

    const winnerId = decideWinner(input.userId, input.rivalUserId, roundResult.hpAfter);
    const territoryResult = this.territoryService.invadeTerritory({
      territoryId: input.territoryId,
      attackerId: input.userId,
      attackerWon: winnerId === input.userId
    });
    if (!territoryResult.ok) {
      return fail("core-loop", APP_ERROR_CODES.TERRITORY_CONFLICT, territoryResult.error.message);
    }

    const reward = this.territoryService.applyCaptureBonus({
      territoryId: input.territoryId,
      userId: input.userId,
      baseReward: input.baseReward
    });
    if (!reward.ok) {
      return fail("core-loop", APP_ERROR_CODES.SYSTEM_INTERNAL_ERROR, reward.error.message);
    }

    return ok("core-loop", {
      capturedPetId: capture.data.pet.id,
      battleRoomId: roomCreated.data.id,
      winnerId,
      territoryOwnerId: territoryResult.data.ownerId,
      finalReward: reward.data.finalReward
    });
  }
}

function createCombatant(id: string, element: Combatant["element"]): Combatant {
  return {
    id,
    element,
    hp: 120,
    maxHp: 120,
    anger: 0,
    statuses: []
  };
}

function decideWinner(
  userId: string,
  rivalUserId: string,
  hpAfter: Record<string, number>
): string {
  if (hpAfter[userId] > hpAfter[rivalUserId]) return userId;
  if (hpAfter[rivalUserId] > hpAfter[userId]) return rivalUserId;
  return userId;
}

