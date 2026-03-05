import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

type InventorySnapshot = {
  pets: Array<{ id: string; name: { zh: string; en: string } }>;
  activePetId: string;
  updatedAt: string;
};

type BattleReport = {
  id?: string;
  sessionId?: string;
  status?: "finished" | "abandoned";
  winner?: "player" | "enemy" | "draw" | null;
  totalRounds?: number;
  startedAt?: string;
  endedAt?: string;
  player?: { petId?: string | null; petName?: string; element?: string };
  enemy?: { petId?: string | null; petName?: string; element?: string };
  rounds?: Array<{
    round: number;
    playerAction: string;
    enemyAction: string;
    damageTaken?: { player?: number; enemy?: number };
    winner?: "player" | "enemy" | "draw" | null;
    notes?: string[];
  }>;
};

type RuntimeDataStoreType = new (options: { filePath: string }) => {
  getInventorySnapshot: () => InventorySnapshot;
  setActivePet: (petId: string) => InventorySnapshot;
  listBattleReports: (limit?: number) => BattleReport[];
  saveBattleReport: (report: BattleReport) => BattleReport;
};

let RuntimeDataStore: RuntimeDataStoreType;
let tempDirs: string[] = [];

function createTempFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "qp-runtime-store-"));
  tempDirs.push(dir);
  return join(dir, "pet-runtime-data.json");
}

describe("D-004 pc inventory persistence and battle report persistence", () => {
  beforeAll(async () => {
    const modulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/runtime-data-store.cjs")
    ).href;
    const loaded = (await import(modulePath)) as {
      RuntimeDataStore: RuntimeDataStoreType;
    };
    RuntimeDataStore = loaded.RuntimeDataStore;
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("loads default pet inventory on first startup", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    const snapshot = store.getInventorySnapshot();

    expect(snapshot.pets.length).toBeGreaterThanOrEqual(6);
    expect(snapshot.activePetId).toBe(snapshot.pets[0]?.id);
  });

  it("persists active pet across runtime restarts", () => {
    const filePath = createTempFilePath();
    const store = new RuntimeDataStore({ filePath });
    const original = store.getInventorySnapshot();
    const nextActive = original.pets[2]?.id;
    expect(typeof nextActive).toBe("string");

    store.setActivePet(nextActive as string);

    const restarted = new RuntimeDataStore({ filePath });
    const restored = restarted.getInventorySnapshot();
    expect(restored.activePetId).toBe(nextActive);
  });

  it("keeps pet list unique when active pet changes concurrently", async () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    const petIds = store.getInventorySnapshot().pets.map((pet) => pet.id);
    expect(petIds.length).toBeGreaterThan(3);

    await Promise.all(
      petIds.slice(0, 4).map(async (petId) => {
        store.setActivePet(petId);
      })
    );

    const snapshot = store.getInventorySnapshot();
    const uniqueIds = new Set(snapshot.pets.map((pet) => pet.id));
    expect(uniqueIds.size).toBe(snapshot.pets.length);
    expect(snapshot.pets.length).toBe(petIds.length);
  });

  it("stores and returns battle reports in reverse chronological order", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    store.saveBattleReport({
      sessionId: "s-1",
      status: "finished",
      winner: "player",
      startedAt: "2026-03-05T08:00:00.000Z",
      endedAt: "2026-03-05T08:02:00.000Z",
      player: { petId: "pet-001", petName: "焰尾", element: "fire" },
      enemy: { petId: "pet-002", petName: "星航", element: "water" },
      rounds: [
        {
          round: 1,
          playerAction: "normal_attack",
          enemyAction: "dodge",
          damageTaken: { player: 0, enemy: 24 },
          winner: null,
          notes: ["enemy action missed"]
        }
      ]
    });
    store.saveBattleReport({
      sessionId: "s-2",
      status: "abandoned",
      winner: null,
      startedAt: "2026-03-05T09:00:00.000Z",
      endedAt: "2026-03-05T09:00:30.000Z",
      player: { petId: "pet-003", petName: "草蹄", element: "wood" },
      enemy: { petId: "pet-004", petName: "锐铠", element: "metal" },
      rounds: []
    });

    const reports = store.listBattleReports(10);
    expect(reports.length).toBe(2);
    expect(reports[0]?.sessionId).toBe("s-2");
    expect(reports[1]?.sessionId).toBe("s-1");
    expect(reports[1]?.totalRounds).toBe(1);
  });
});
