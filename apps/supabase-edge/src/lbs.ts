import type { ElementType } from "@qingpet/shared-types";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface SpawnPoint {
  id: string;
  landmarkType: "park" | "office" | "mall" | "residential" | "convenience" | "mixed";
  rarityWeight: number;
  elementPool?: ElementType | "mixed";
  position: GeoPoint;
}

export type PetRarity = "common" | "rare" | "epic";

export interface SpawnedPet {
  spawnPointId: string;
  element: ElementType;
  rarity: PetRarity;
  refreshedHourKey: string;
}

export interface CaptureCheckInput {
  userPosition: GeoPoint;
  spawnPosition: GeoPoint;
  geofenceMeters?: number;
  gpsAccuracyMeters?: number;
}

export interface DriftFilterInput {
  points: Array<GeoPoint & { tsMs: number }>;
  maxSpeedMps?: number;
}

const LANDMARK_TO_ELEMENT: Record<SpawnPoint["landmarkType"], ElementType | "mixed"> = {
  park: "wood",
  office: "metal",
  mall: "fire",
  residential: "earth",
  convenience: "water",
  mixed: "mixed"
};

const ELEMENTS: ElementType[] = ["metal", "wood", "earth", "water", "fire"];

export function resolveElementPool(point: SpawnPoint): ElementType | "mixed" {
  if (point.elementPool) return point.elementPool;
  return LANDMARK_TO_ELEMENT[point.landmarkType];
}

export function generateSpawnedPet(
  point: SpawnPoint,
  now: Date,
  randomValue = Math.random()
): SpawnedPet {
  const elementPool = resolveElementPool(point);
  const element =
    elementPool === "mixed"
      ? ELEMENTS[Math.floor(normalizeRandom(randomValue) * ELEMENTS.length)]
      : elementPool;

  const rarity = chooseRarity(point.rarityWeight, randomValue);
  const hour = String(now.getUTCHours()).padStart(2, "0");
  const refreshedHourKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getUTCDate()).padStart(2, "0")}T${hour}:00Z`;

  return {
    spawnPointId: point.id,
    element,
    rarity,
    refreshedHourKey
  };
}

export function chooseRarity(rarityWeight: number, randomValue = Math.random()): PetRarity {
  // Higher rarityWeight slightly biases towards rare/epic.
  const normalized = normalizeRandom(randomValue);
  const rareThreshold = Math.max(0.08, Math.min(0.32, 0.18 + rarityWeight * 0.01));
  const epicThreshold = Math.max(0.01, Math.min(0.12, 0.03 + rarityWeight * 0.003));

  if (normalized < epicThreshold) return "epic";
  if (normalized < rareThreshold + epicThreshold) return "rare";
  return "common";
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

export function compensateDistanceMeters(
  rawDistanceMeters: number,
  gpsAccuracyMeters = 0
): number {
  // Conservative compensation to tolerate moderate drift.
  const compensation = Math.min(30, Math.max(0, gpsAccuracyMeters * 0.5));
  return Math.max(0, rawDistanceMeters - compensation);
}

export function canCaptureWithinGeofence(input: CaptureCheckInput): {
  rawDistanceMeters: number;
  compensatedDistanceMeters: number;
  inRange: boolean;
} {
  const geofenceMeters = input.geofenceMeters ?? 100;
  const rawDistanceMeters = haversineDistanceMeters(input.userPosition, input.spawnPosition);
  const compensatedDistanceMeters = compensateDistanceMeters(
    rawDistanceMeters,
    input.gpsAccuracyMeters ?? 0
  );

  return {
    rawDistanceMeters,
    compensatedDistanceMeters,
    inRange: compensatedDistanceMeters <= geofenceMeters
  };
}

export function filterGpsDrift(input: DriftFilterInput): Array<GeoPoint & { tsMs: number }> {
  const maxSpeedMps = input.maxSpeedMps ?? 45;
  if (input.points.length <= 2) return input.points;

  const filtered: Array<GeoPoint & { tsMs: number }> = [input.points[0]];
  for (let i = 1; i < input.points.length; i += 1) {
    const prev = filtered[filtered.length - 1];
    const curr = input.points[i];

    const dtSeconds = Math.max(1, (curr.tsMs - prev.tsMs) / 1000);
    const distance = haversineDistanceMeters(prev, curr);
    const speed = distance / dtSeconds;

    if (speed <= maxSpeedMps) {
      filtered.push(curr);
    }
  }

  return filtered;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeRandom(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 0.999999;
  return value;
}

