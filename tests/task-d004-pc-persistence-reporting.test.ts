import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

type InventoryPet = {
  id: string;
  serial: string;
  element: string;
  stats: string;
  name: { zh: string; en: string };
  level: number;
  experience: number;
  winsTotal: number;
};

type InventorySnapshot = {
  pets: InventoryPet[];
  activePetId: string;
  updatedAt: string;
};

type BattleReport = {
  id?: string;
  sessionId?: string;
  status?: "finished" | "abandoned";
  winner?: "player" | "enemy" | "draw" | null;
  mode?: "duel" | "capture";
  captureSuccess?: boolean | null;
  captureSerial?: string | null;
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
  captureWildPet: (payload: {
    wildPetId: string;
    wildSerial: string;
    rarity: "common" | "rare" | "epic";
    element: string;
    name: { zh: string; en: string };
    capturedAt: string;
    avatar?: string;
  }) => {
    duplicate: boolean;
    pet: {
      id: string;
      serial: string;
      element: string;
      level: number;
      experience: number;
      winsTotal: number;
    } | null;
  };
  recordBattleWin: (petId: string) => {
    ok: boolean;
    leveledUp?: boolean;
    previousLevel?: number;
    currentLevel?: number;
    currentExperience?: number;
    pet?: {
      id: string;
      stats: string;
      level: number;
      experience: number;
      winsTotal: number;
    };
  };
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
    expect(snapshot.pets[0]?.level).toBe(1);
    expect(snapshot.pets[0]?.experience).toBe(0);
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
      mode: "capture",
      captureSuccess: true,
      captureSerial: "WP-2026030508-0001",
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
      mode: "duel",
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
    expect(reports[1]?.mode).toBe("capture");
    expect(reports[1]?.captureSuccess).toBe(true);
    expect(reports[1]?.captureSerial).toBe("WP-2026030508-0001");
  });

  it("supports duplicate species by different serial and tracks level progression", () => {
    const store = new RuntimeDataStore({ filePath: createTempFilePath() });
    const initial = store.getInventorySnapshot();
    const activePet = initial.pets[0];
    expect(activePet).toBeTruthy();
    const baseStats = activePet.stats;

    const capturedA = store.captureWildPet({
      wildPetId: "wild-fire-a",
      wildSerial: "WP-2026030509-0001",
      rarity: "common",
      element: "fire",
      name: { zh: "火灵", en: "Fireling" },
      capturedAt: "2026-03-05 09:01:00"
    });
    const capturedB = store.captureWildPet({
      wildPetId: "wild-fire-a",
      wildSerial: "WP-2026030509-0002",
      rarity: "common",
      element: "fire",
      name: { zh: "火灵", en: "Fireling" },
      capturedAt: "2026-03-05 09:02:00"
    });
    expect(capturedA.duplicate).toBe(false);
    expect(capturedB.duplicate).toBe(false);

    const inventoryAfterCapture = store.getInventorySnapshot();
    const duplicatedSpecies = inventoryAfterCapture.pets.filter(
      (pet) => pet.name.zh === "火灵" && pet.element === "fire"
    );
    expect(duplicatedSpecies.length).toBe(2);
    expect(new Set(duplicatedSpecies.map((pet) => pet.serial)).size).toBe(2);

    for (let i = 0; i < 5; i += 1) {
      const progression = store.recordBattleWin(activePet.id);
      expect(progression.ok).toBe(true);
    }
    const leveled = store.getInventorySnapshot().pets.find((pet) => pet.id === activePet.id);
    expect(leveled?.level).toBe(2);
    expect(leveled?.experience).toBe(0);
    expect(leveled?.winsTotal).toBe(5);
    expect(leveled?.stats).not.toBe(baseStats);
    expect(leveled?.stats).toContain("ATK34");
  });
});
