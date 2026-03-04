import { describe, expect, it } from "vitest";

import { APP_ERROR_CODES } from "@qingpet/shared-types";
import { InMemoryTerritoryService } from "@qingpet/supabase-edge";

describe("T-108 territory occupation", () => {
  it("assigns ownership when attacker wins", () => {
    const svc = new InMemoryTerritoryService();
    const territory = svc.createTerritory({
      territoryName: "静安商圈",
      regionCode: "CN-SH-JA",
      ownerId: "defender-1",
      bonusMultiplier: 2
    });

    const result = svc.invadeTerritory({
      territoryId: territory.id,
      attackerId: "attacker-1",
      attackerWon: true
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ownerId).toBe("attacker-1");
    expect(result.data.status).toBe("occupied");
  });

  it("keeps old ownership when attacker loses", () => {
    const svc = new InMemoryTerritoryService();
    const territory = svc.createTerritory({
      territoryName: "徐汇商圈",
      regionCode: "CN-SH-XH",
      ownerId: "defender-2",
      bonusMultiplier: 2
    });

    const result = svc.invadeTerritory({
      territoryId: territory.id,
      attackerId: "attacker-2",
      attackerWon: false
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.ownerId).toBe("defender-2");
  });

  it("applies capture bonus only to territory owner", () => {
    const svc = new InMemoryTerritoryService();
    const territory = svc.createTerritory({
      territoryName: "浦东新区",
      regionCode: "CN-SH-PD",
      ownerId: "owner-1",
      bonusMultiplier: 2
    });

    const ownerReward = svc.applyCaptureBonus({
      territoryId: territory.id,
      userId: "owner-1",
      baseReward: 100
    });
    expect(ownerReward.ok).toBe(true);
    if (!ownerReward.ok) return;
    expect(ownerReward.data.finalReward).toBe(200);

    const nonOwnerReward = svc.applyCaptureBonus({
      territoryId: territory.id,
      userId: "other",
      baseReward: 100
    });
    expect(nonOwnerReward.ok).toBe(true);
    if (!nonOwnerReward.ok) return;
    expect(nonOwnerReward.data.finalReward).toBe(100);
  });

  it("records territory logs for occupancy changes", () => {
    const svc = new InMemoryTerritoryService();
    const territory = svc.createTerritory({
      territoryName: "黄浦江沿线",
      regionCode: "CN-SH-HP",
      ownerId: "defender-3"
    });

    svc.invadeTerritory({
      territoryId: territory.id,
      attackerId: "attacker-3",
      attackerWon: true
    });

    const logs = svc.listLogs(territory.id);
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe("occupy");
    expect(logs[0].newOwnerId).toBe("attacker-3");
  });

  it("rejects stale concurrent updates by expectedVersion", () => {
    const svc = new InMemoryTerritoryService();
    const territory = svc.createTerritory({
      territoryName: "虹桥",
      regionCode: "CN-SH-HQ",
      ownerId: "defender-4"
    });

    const first = svc.invadeTerritory({
      territoryId: territory.id,
      attackerId: "attacker-a",
      attackerWon: true,
      expectedVersion: territory.version
    });
    expect(first.ok).toBe(true);

    const second = svc.invadeTerritory({
      territoryId: territory.id,
      attackerId: "attacker-b",
      attackerWon: true,
      expectedVersion: territory.version
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe(APP_ERROR_CODES.TERRITORY_CONFLICT);
    }
  });
});

