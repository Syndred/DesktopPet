import { describe, expect, it } from "vitest";

import {
  CoreLoopService,
  InMemoryBattleRoomService,
  InMemoryCaptureService,
  InMemoryFriendService,
  InMemoryLightSocialService,
  InMemoryTerritoryService,
  type SpawnPoint
} from "@qingpet/supabase-edge";

describe("e2e: player journey", () => {
  it("completes journey from exploration to social duel setup", () => {
    const captureSvc = new InMemoryCaptureService();
    const roomSvc = new InMemoryBattleRoomService();
    const territorySvc = new InMemoryTerritoryService();
    const socialSvc = new InMemoryLightSocialService();
    const friendSvc = new InMemoryFriendService();

    const territory = territorySvc.createTerritory({
      territoryName: "陆家嘴",
      regionCode: "CN-SH-LJZ",
      ownerId: null
    });
    const spawnPoint: SpawnPoint = {
      id: "sp-ljz",
      landmarkType: "office",
      rarityWeight: 2,
      position: { lat: 31.2401, lng: 121.4998 }
    };

    const loopSvc = new CoreLoopService(captureSvc, roomSvc, territorySvc);
    const loop = loopSvc.runCoreLoop({
      userId: "player-a",
      rivalUserId: "player-b",
      spawnPoint,
      territoryId: territory.id,
      userPosition: { lat: 31.2402, lng: 121.4998 },
      petName: "阿宠",
      memoryTag: "E2E记录",
      userAction: "normal_attack",
      rivalAction: "element_attack",
      baseReward: 100
    });
    expect(loop.ok).toBe(true);

    const encounter = socialSvc.triggerGlimmerEncounter([
      { pointId: spawnPoint.id, userId: "player-a", petId: "pet-a" },
      { pointId: spawnPoint.id, userId: "player-b", petId: "pet-b" }
    ]);
    expect(encounter.length).toBe(1);

    const req = friendSvc.sendFriendRequest("player-a", "player-b");
    expect(req.ok).toBe(true);
    if (!req.ok) return;
    const accepted = friendSvc.acceptFriendRequest(req.data.requestId, "player-b");
    expect(accepted.ok).toBe(true);

    const room = friendSvc.createPrivateDuelRoom("player-a", "player-b");
    expect(room.ok).toBe(true);
  });
});

