import { describe, expect, it } from "vitest";

import {
  CoreLoopService,
  InMemoryBattleRoomService,
  InMemoryCaptureService,
  InMemoryTerritoryService,
  type SpawnPoint
} from "@qingpet/supabase-edge";

describe("integration: core loop service", () => {
  it("links capture, battle, territory and reward in one flow", () => {
    const captureSvc = new InMemoryCaptureService();
    const roomSvc = new InMemoryBattleRoomService();
    const territorySvc = new InMemoryTerritoryService();
    const territory = territorySvc.createTerritory({
      territoryName: "人民广场",
      regionCode: "CN-SH-RMGC",
      ownerId: "rival"
    });

    const spawnPoint: SpawnPoint = {
      id: "sp-rmgc",
      landmarkType: "office",
      rarityWeight: 3,
      position: { lat: 31.2303, lng: 121.4736 }
    };

    const service = new CoreLoopService(captureSvc, roomSvc, territorySvc);
    const result = service.runCoreLoop({
      userId: "u1",
      rivalUserId: "rival",
      spawnPoint,
      territoryId: territory.id,
      userPosition: { lat: 31.23035, lng: 121.47362 },
      petName: "测试宠",
      memoryTag: "集成测试",
      userAction: "normal_attack",
      rivalAction: "element_attack",
      baseReward: 88
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.territoryOwnerId).toBe("u1");
    expect(result.data.finalReward).toBeGreaterThan(88);
  });
});

