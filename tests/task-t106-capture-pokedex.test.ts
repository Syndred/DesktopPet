import { describe, expect, it } from "vitest";

import { InMemoryCaptureService, generateSpawnedPet, type SpawnPoint } from "@qingpet/supabase-edge";

function createSpawnPoint(): SpawnPoint {
  return {
    id: "sp-office",
    landmarkType: "office",
    rarityWeight: 2,
    position: { lat: 31.2304, lng: 121.4737 }
  };
}

describe("T-106 capture, pokedex and memory tags", () => {
  it("writes pet/capture/tag/pokedex consistently on success", () => {
    const svc = new InMemoryCaptureService();
    const point = createSpawnPoint();
    const spawned = generateSpawnedPet(point, new Date("2026-03-04T08:00:00Z"), 0.5);

    const result = svc.adoptCapturedPet({
      userId: "u1",
      spawnedPet: spawned,
      petName: "小钢",
      memoryTag: "在写字楼门口遇见",
      userPosition: { lat: 31.23045, lng: 121.47371 },
      spawnPosition: point.position,
      gpsAccuracyMeters: 12
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pokedexSize).toBe(1);

    const pokedex = svc.getPokedex("u1");
    expect(pokedex.length).toBe(1);
    expect(pokedex[0].petId).toBe(result.data.pet.id);

    const tags = svc.getMemoryTagsByPetId(result.data.pet.id);
    expect(tags.length).toBe(1);
    expect(tags[0].tag).toBe("在写字楼门口遇见");
  });

  it("rolls back all writes when transaction fails midway", () => {
    const svc = new InMemoryCaptureService();
    const point = createSpawnPoint();
    const spawned = generateSpawnedPet(point, new Date("2026-03-04T08:00:00Z"), 0.5);

    const result = svc.adoptCapturedPet({
      userId: "u2",
      spawnedPet: spawned,
      petName: "回滚测试宠",
      memoryTag: "不应落库",
      userPosition: { lat: 31.23042, lng: 121.47374 },
      spawnPosition: point.position,
      simulateFailureAt: "after_tag"
    });

    expect(result.ok).toBe(false);
    expect(svc.getPokedex("u2").length).toBe(0);
  });

  it("rejects capture when out of geofence range", () => {
    const svc = new InMemoryCaptureService();
    const point = createSpawnPoint();
    const spawned = generateSpawnedPet(point, new Date("2026-03-04T08:00:00Z"), 0.5);

    const result = svc.adoptCapturedPet({
      userId: "u3",
      spawnedPet: spawned,
      petName: "太远了",
      memoryTag: "捕获失败",
      userPosition: { lat: 31.2404, lng: 121.4837 },
      spawnPosition: point.position
    });

    expect(result.ok).toBe(false);
  });

  it("restores pokedex and tags after state reload", () => {
    const svc = new InMemoryCaptureService();
    const point = createSpawnPoint();
    const spawned = generateSpawnedPet(point, new Date("2026-03-04T08:00:00Z"), 0.5);

    const result = svc.adoptCapturedPet({
      userId: "u4",
      spawnedPet: spawned,
      petName: "可恢复",
      memoryTag: "重启后仍可见",
      userPosition: { lat: 31.23045, lng: 121.47371 },
      spawnPosition: point.position
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const dumped = svc.exportState();
    const restoredSvc = InMemoryCaptureService.fromState(dumped);

    const restoredPokedex = restoredSvc.getPokedex("u4");
    expect(restoredPokedex.length).toBe(1);

    const restoredTags = restoredSvc.getMemoryTagsByPetId(restoredPokedex[0].petId);
    expect(restoredTags.length).toBe(1);
    expect(restoredTags[0].tag).toBe("重启后仍可见");
  });
});

