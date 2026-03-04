import { randomUUID } from "node:crypto";

import { APP_ERROR_CODES, fail, ok, type ApiResponse } from "@qingpet/shared-types";

export type TerritoryAction = "invade" | "defend" | "occupy" | "release";

export interface TerritoryRecord {
  id: string;
  territoryName: string;
  regionCode: string;
  ownerId: string | null;
  bonusMultiplier: number;
  status: "neutral" | "occupied";
  version: number;
  occupiedAt: string | null;
}

export interface TerritoryLog {
  id: string;
  territoryId: string;
  action: TerritoryAction;
  actorUserId: string;
  oldOwnerId: string | null;
  newOwnerId: string | null;
  createdAt: string;
}

export class InMemoryTerritoryService {
  private readonly territories = new Map<string, TerritoryRecord>();
  private readonly logs: TerritoryLog[] = [];

  createTerritory(input: {
    territoryName: string;
    regionCode: string;
    bonusMultiplier?: number;
    ownerId?: string | null;
  }): TerritoryRecord {
    const now = new Date().toISOString();
    const record: TerritoryRecord = {
      id: randomUUID(),
      territoryName: input.territoryName,
      regionCode: input.regionCode,
      ownerId: input.ownerId ?? null,
      bonusMultiplier: input.bonusMultiplier ?? 2.0,
      status: input.ownerId ? "occupied" : "neutral",
      version: 1,
      occupiedAt: input.ownerId ? now : null
    };
    this.territories.set(record.id, record);
    return { ...record };
  }

  getTerritory(territoryId: string): TerritoryRecord | null {
    const record = this.territories.get(territoryId);
    return record ? { ...record } : null;
  }

  listLogs(territoryId: string): TerritoryLog[] {
    return this.logs.filter((item) => item.territoryId === territoryId).map((item) => ({ ...item }));
  }

  invadeTerritory(input: {
    territoryId: string;
    attackerId: string;
    attackerWon: boolean;
    expectedVersion?: number;
  }): ApiResponse<TerritoryRecord> {
    const territory = this.territories.get(input.territoryId);
    if (!territory) {
      return fail("territory-invade", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND, "territory not found");
    }

    if (
      typeof input.expectedVersion === "number" &&
      territory.version !== input.expectedVersion
    ) {
      return fail(
        "territory-invade",
        APP_ERROR_CODES.TERRITORY_CONFLICT,
        "territory version conflict"
      );
    }

    const oldOwnerId = territory.ownerId;
    if (input.attackerWon) {
      territory.ownerId = input.attackerId;
      territory.status = "occupied";
      territory.occupiedAt = new Date().toISOString();
      territory.version += 1;

      this.logs.push({
        id: randomUUID(),
        territoryId: territory.id,
        action: "occupy",
        actorUserId: input.attackerId,
        oldOwnerId,
        newOwnerId: input.attackerId,
        createdAt: new Date().toISOString()
      });
    } else {
      territory.version += 1;
      this.logs.push({
        id: randomUUID(),
        territoryId: territory.id,
        action: "defend",
        actorUserId: input.attackerId,
        oldOwnerId,
        newOwnerId: oldOwnerId,
        createdAt: new Date().toISOString()
      });
    }

    return ok("territory-invade", { ...territory });
  }

  applyCaptureBonus(input: {
    territoryId: string;
    userId: string;
    baseReward: number;
  }): ApiResponse<{ finalReward: number; multiplier: number }> {
    const territory = this.territories.get(input.territoryId);
    if (!territory) {
      return fail("territory-bonus", APP_ERROR_CODES.BATTLE_ROOM_NOT_FOUND, "territory not found");
    }

    const multiplier = territory.ownerId === input.userId ? territory.bonusMultiplier : 1;
    return ok("territory-bonus", {
      finalReward: Number((input.baseReward * multiplier).toFixed(2)),
      multiplier
    });
  }
}

