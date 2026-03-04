import { describe, expect, it } from "vitest";

import {
  CoreLoopService,
  InMemoryBattleRoomService,
  InMemoryCaptureService,
  InMemoryTerritoryService,
  type SpawnPoint
} from "@qingpet/supabase-edge";

describe("T-109 core loop integration", () => {
  it("runs capture -> battle -> occupy -> reward loop", () => {
    const captureSvc = new InMemoryCaptureService();
    const roomSvc = new InMemoryBattleRoomService();
    const territorySvc = new InMemoryTerritoryService();

    const territory = territorySvc.createTerritory({
      territoryName: "陆家嘴",
      regionCode: "CN-SH-LJZ",
      ownerId: "rival-1",
      bonusMultiplier: 2
    });

    const spawnPoint: SpawnPoint = {
      id: "sp-ljz-office",
      landmarkType: "office",
      rarityWeight: 2,
      position: { lat: 31.2400, lng: 121.5000 }
    };

    const coreLoop = new CoreLoopService(captureSvc, roomSvc, territorySvc);
    const result = coreLoop.runCoreLoop({
      userId: "user-1",
      rivalUserId: "rival-1",
      spawnPoint,
      territoryId: territory.id,
      userPosition: { lat: 31.2402, lng: 121.5000 },
      petName: "钢钢",
      memoryTag: "第一次在陆家嘴遇见",
      userAction: "normal_attack",
      rivalAction: "element_attack",
      baseReward: 100,
      now: new Date("2026-03-04T08:00:00Z")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.capturedPetId.length).toBeGreaterThan(0);
    expect(result.data.battleRoomId.length).toBeGreaterThan(0);
    expect(result.data.winnerId).toBe("user-1");
    expect(result.data.territoryOwnerId).toBe("user-1");
    expect(result.data.finalReward).toBe(200);
  });
});

