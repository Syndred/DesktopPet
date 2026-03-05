import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it } from "vitest";

type WildPetRuntimeServiceType = new () => {
  getNearbyWildPets: (input: {
    providerId: string;
    location: { lat: number; lng: number };
    radiusMeters?: number;
  }) => {
    ok: boolean;
    pets?: Array<{
      id: string;
      serial: string;
      inRange: boolean;
      status: string;
      position: { lat: number; lng: number };
      element: string;
      rarity: "common" | "rare" | "epic";
      model: string;
      name: { zh: string; en: string };
      avatar: string;
    }>;
  };
  prepareCaptureBattle: (input: {
    providerId: string;
    wildPetId: string;
    location: { lat: number; lng: number };
  }) => {
    ok: boolean;
    error?: { code: string; message: string };
    wildPet?: {
      id: string;
      serial: string;
      element: string;
      rarity: "common" | "rare" | "epic";
      model: string;
      name: { zh: string; en: string };
      avatar: string;
    };
  };
  completeCaptureBattle: (input: {
    providerId: string;
    wildPetId: string;
    success: boolean;
    runtimeDataStore: {
      captureWildPet: (payload: object) => {
        duplicate: boolean;
        pet: { id: string; serial: string } | null;
      };
    };
  }) => {
    ok: boolean;
    success?: boolean;
    duplicate?: boolean;
    capturedPet?: { id: string; serial: string };
  };
};

type RuntimeDataStoreType = new (options: { filePath: string }) => {
  getInventorySnapshot: () => {
    pets: Array<{ id: string; serial: string; element: string; name: { zh: string; en: string } }>;
  };
  captureWildPet: (input: object) => {
    duplicate: boolean;
    pet: { id: string; serial: string } | null;
  };
};

let WildPetRuntimeService: WildPetRuntimeServiceType;
let RuntimeDataStore: RuntimeDataStoreType;
let tempDirs: string[] = [];

function createTempStoreFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "qp-wild-capture-"));
  tempDirs.push(dir);
  return join(dir, "runtime-store.json");
}

describe("D-006 pc nearby wild pet and capture flow", () => {
  beforeAll(async () => {
    const wildModulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/wild-pet-runtime.cjs")
    ).href;
    const storeModulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/runtime-data-store.cjs")
    ).href;

    const wildLoaded = (await import(wildModulePath)) as {
      WildPetRuntimeService: WildPetRuntimeServiceType;
    };
    const storeLoaded = (await import(storeModulePath)) as {
      RuntimeDataStore: RuntimeDataStoreType;
    };
    WildPetRuntimeService = wildLoaded.WildPetRuntimeService;
    RuntimeDataStore = storeLoaded.RuntimeDataStore;
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs = [];
  });

  it("returns nearby wild pets with serial numbers", () => {
    const service = new WildPetRuntimeService();
    const result = service.getNearbyWildPets({
      providerId: "tencent",
      location: { lat: 31.2304, lng: 121.4737 },
      radiusMeters: 260
    });

    expect(result.ok).toBe(true);
    expect((result.pets?.length ?? 0) > 0).toBe(true);
    const first = result.pets?.[0];
    expect(typeof first?.serial).toBe("string");
    expect(first?.serial.startsWith("WP-")).toBe(true);
    expect(first?.name.zh).not.toMatch(/[0-9]+$/);
    expect(first?.name.en).not.toMatch(/-[0-9]+$/);
  });

  it("rejects capture duel preparation when target is out of 100m range", () => {
    const service = new WildPetRuntimeService();
    const nearby = service.getNearbyWildPets({
      providerId: "tencent",
      location: { lat: 31.2304, lng: 121.4737 },
      radiusMeters: 400
    });
    expect(nearby.ok).toBe(true);

    const outOfRangePet = (nearby.pets ?? []).find((item) => !item.inRange);
    expect(Boolean(outOfRangePet)).toBe(true);

    const prepare = service.prepareCaptureBattle({
      providerId: "tencent",
      wildPetId: outOfRangePet!.id,
      location: { lat: 31.2304, lng: 121.4737 }
    });

    expect(prepare.ok).toBe(false);
    expect(prepare.error?.code).toBe("OUT_OF_CAPTURE_RANGE");
  });

  it("captures in-range wild pet into inventory with serial-level duplicate protection", () => {
    const service = new WildPetRuntimeService();
    const store = new RuntimeDataStore({ filePath: createTempStoreFilePath() });
    const nearby = service.getNearbyWildPets({
      providerId: "tencent",
      location: { lat: 31.2304, lng: 121.4737 },
      radiusMeters: 260
    });
    const inRangePet = (nearby.pets ?? []).find((item) => item.inRange && item.status === "available");
    expect(Boolean(inRangePet)).toBe(true);

    const prepare = service.prepareCaptureBattle({
      providerId: "tencent",
      wildPetId: inRangePet!.id,
      location: { lat: 31.2304, lng: 121.4737 }
    });
    expect(prepare.ok).toBe(true);

    const captured = service.completeCaptureBattle({
      providerId: "tencent",
      wildPetId: inRangePet!.id,
      success: true,
      runtimeDataStore: store
    });
    expect(captured.ok).toBe(true);
    expect(captured.success).toBe(true);
    expect(captured.duplicate).toBe(false);
    expect(captured.capturedPet?.serial).toBe(inRangePet!.serial);

    const second = service.completeCaptureBattle({
      providerId: "tencent",
      wildPetId: inRangePet!.id,
      success: true,
      runtimeDataStore: store
    });
    expect(second.ok).toBe(true);
    expect(second.success).toBe(true);
    expect(second.duplicate).toBe(true);

    const pets = store.getInventorySnapshot().pets;
    const matching = pets.filter((pet) => pet.serial === inRangePet!.serial);
    expect(matching.length).toBe(1);
  });

  it("allows owning duplicate species when serial is different", () => {
    const store = new RuntimeDataStore({ filePath: createTempStoreFilePath() });
    const first = store.captureWildPet({
      wildPetId: "wild-fire-1",
      wildSerial: "WP-2026030510-9001",
      rarity: "common",
      element: "fire",
      name: { zh: "火灵", en: "Fireling" },
      capturedAt: "2026-03-05 10:01:00"
    });
    const second = store.captureWildPet({
      wildPetId: "wild-fire-1",
      wildSerial: "WP-2026030510-9002",
      rarity: "common",
      element: "fire",
      name: { zh: "火灵", en: "Fireling" },
      capturedAt: "2026-03-05 10:02:00"
    });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);

    const inventory = store.getInventorySnapshot().pets;
    const owned = inventory.filter((pet) => pet.name.zh === "火灵" && pet.element === "fire");
    expect(owned.length).toBe(2);
    expect(new Set(owned.map((pet) => pet.serial)).size).toBe(2);
  });
});
