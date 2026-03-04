import { describe, expect, it } from "vitest";

import {
  canCaptureWithinGeofence,
  filterGpsDrift,
  generateSpawnedPet,
  haversineDistanceMeters,
  percentile,
  resolveElementPool,
  type SpawnPoint
} from "@qingpet/supabase-edge";

describe("T-105 lbs refresh and geofence", () => {
  it("maps landmark type to expected element pool", () => {
    const point: SpawnPoint = {
      id: "sp1",
      landmarkType: "park",
      rarityWeight: 2,
      position: { lat: 31.2304, lng: 121.4737 }
    };

    expect(resolveElementPool(point)).toBe("wood");
  });

  it("refreshes pet spawn with hourly key and stable rarity", () => {
    const point: SpawnPoint = {
      id: "sp2",
      landmarkType: "office",
      rarityWeight: 3,
      position: { lat: 31.231, lng: 121.47 }
    };

    const spawned = generateSpawnedPet(point, new Date("2026-03-04T08:13:00Z"), 0.02);

    expect(spawned.spawnPointId).toBe("sp2");
    expect(spawned.element).toBe("metal");
    expect(spawned.rarity).toBe("epic");
    expect(spawned.refreshedHourKey).toBe("2026-03-04T08:00Z");
  });

  it("calculates geofence in-range with compensation", () => {
    const result = canCaptureWithinGeofence({
      userPosition: { lat: 31.2304, lng: 121.4737 },
      spawnPosition: { lat: 31.2310, lng: 121.4737 },
      geofenceMeters: 100,
      gpsAccuracyMeters: 15
    });

    expect(result.rawDistanceMeters).toBeGreaterThan(60);
    expect(result.rawDistanceMeters).toBeLessThan(75);
    expect(result.compensatedDistanceMeters).toBeLessThan(result.rawDistanceMeters);
    expect(result.inRange).toBe(true);
  });

  it("filters obvious gps drift points by speed threshold", () => {
    const pts = filterGpsDrift({
      points: [
        { lat: 31.2304, lng: 121.4737, tsMs: 1_000 },
        { lat: 31.2305, lng: 121.4738, tsMs: 2_000 },
        // Huge jump in 1s, should be removed.
        { lat: 31.2805, lng: 121.5738, tsMs: 3_000 },
        { lat: 31.2306, lng: 121.4739, tsMs: 4_000 }
      ],
      maxSpeedMps: 40
    });

    expect(pts.length).toBe(3);
    expect(pts.some((p) => p.lat === 31.2805)).toBe(false);
  });

  it("keeps simulated p95 capture error below 50m", () => {
    const spawn = { lat: 31.2304, lng: 121.4737 };

    const samples = [
      { lat: 31.23056, lng: 121.4737 },
      { lat: 31.23031, lng: 121.47376 },
      { lat: 31.23045, lng: 121.47355 },
      { lat: 31.23078, lng: 121.47372 },
      { lat: 31.23048, lng: 121.47395 },
      { lat: 31.23062, lng: 121.47366 },
      { lat: 31.23052, lng: 121.47382 },
      { lat: 31.23035, lng: 121.47388 },
      { lat: 31.23066, lng: 121.47362 },
      { lat: 31.23041, lng: 121.47374 },
      { lat: 31.23063, lng: 121.47392 },
      { lat: 31.23053, lng: 121.47369 }
    ];

    const errors = samples.map((p) => haversineDistanceMeters(p, spawn));
    expect(percentile(errors, 0.95)).toBeLessThan(50);
  });
});

