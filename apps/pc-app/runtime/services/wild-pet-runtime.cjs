const { randomUUID } = require("node:crypto");

const PROVIDER_META = {
  tencent: {
    center: { lat: 31.2304, lng: 121.4737 },
    coordinateSystem: "gcj02"
  },
  google: {
    center: { lat: 37.7749, lng: -122.4194 },
    coordinateSystem: "wgs84"
  }
};

const DEFAULT_RADIUS_METERS = 220;
const CAPTURE_RADIUS_METERS = 100;
const COOLDOWN_MS = 5 * 60 * 1000;
const MODEL_BY_ELEMENT = {
  fire: "../assets/models/Fox.glb",
  water: "../assets/models/Astronaut.glb",
  wood: "../assets/models/Horse.glb",
  metal: "../assets/models/CesiumMan.glb",
  earth: "../assets/models/NeilArmstrong.glb"
};

const SPAWN_LAYOUT = [
  { id: "A1", dx: 35, dy: 18, landmarkType: "park", element: "wood", rarity: "common" },
  { id: "A2", dx: -48, dy: 20, landmarkType: "office", element: "metal", rarity: "common" },
  { id: "A3", dx: 72, dy: -26, landmarkType: "mall", element: "fire", rarity: "rare" },
  { id: "A4", dx: -82, dy: -34, landmarkType: "convenience", element: "water", rarity: "common" },
  { id: "A5", dx: 102, dy: 46, landmarkType: "residential", element: "earth", rarity: "rare" },
  { id: "A6", dx: -122, dy: 62, landmarkType: "park", element: "wood", rarity: "epic" },
  { id: "A7", dx: 145, dy: -66, landmarkType: "office", element: "metal", rarity: "rare" },
  { id: "A8", dx: -155, dy: -78, landmarkType: "mall", element: "fire", rarity: "epic" }
];

class WildPetRuntimeService {
  constructor() {
    this.providerState = new Map();
  }

  getNearbyWildPets(input = {}) {
    const providerId = resolveProviderId(input.providerId);
    const location = normalizeLocation(input.location);
    if (!location) {
      return fail("LOCATION_REQUIRED", "location is required to query nearby wild pets");
    }

    const radiusMeters = clampRadius(input.radiusMeters);
    const state = this.ensureProviderState(providerId, input.now);
    this.applyCooldownRecovery(state, Date.now());

    const list = state.spawns
      .map((spawn) => {
        const distanceMeters = haversineDistanceMeters(location, spawn.position);
        const inRange = distanceMeters <= CAPTURE_RADIUS_METERS;
        const inSearchRange = distanceMeters <= radiusMeters;
        if (!inSearchRange) return null;
        return {
          id: spawn.id,
          serial: spawn.serial,
          name: { ...spawn.name },
          element: spawn.element,
          rarity: spawn.rarity,
          landmarkType: spawn.landmarkType,
          model: spawn.model,
          stats: spawn.stats,
          position: { ...spawn.position },
          status: spawn.status,
          distanceMeters: Number(distanceMeters.toFixed(2)),
          inRange,
          cooldownRemainingSec:
            spawn.status === "cooldown" && Number.isFinite(spawn.cooldownUntilMs)
              ? Math.max(0, Math.ceil((spawn.cooldownUntilMs - Date.now()) / 1000))
              : 0
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);

    return ok({
      providerId,
      coordinateSystem: PROVIDER_META[providerId].coordinateSystem,
      captureRadiusMeters: CAPTURE_RADIUS_METERS,
      pets: list
    });
  }

  prepareCaptureBattle(input = {}) {
    const providerId = resolveProviderId(input.providerId);
    const location = normalizeLocation(input.location);
    const wildPetId = typeof input.wildPetId === "string" ? input.wildPetId.trim() : "";
    if (!location) {
      return fail("LOCATION_REQUIRED", "location is required");
    }
    if (!wildPetId) {
      return fail("INVALID_WILD_PET", "wildPetId is required");
    }

    const state = this.ensureProviderState(providerId, input.now);
    this.applyCooldownRecovery(state, Date.now());
    const spawn = state.spawns.find((item) => item.id === wildPetId);
    if (!spawn) {
      return fail("WILD_PET_NOT_FOUND", "target wild pet does not exist");
    }
    if (spawn.status === "captured") {
      return fail("WILD_PET_CAPTURED", "target wild pet has already been captured");
    }
    if (spawn.status === "engaged") {
      return fail("WILD_PET_ENGAGED", "target wild pet is already in a capture battle");
    }
    if (spawn.status === "cooldown") {
      return fail("WILD_PET_COOLDOWN", "target wild pet is cooling down");
    }

    const distanceMeters = haversineDistanceMeters(location, spawn.position);
    if (distanceMeters > CAPTURE_RADIUS_METERS) {
      return fail("OUT_OF_CAPTURE_RANGE", "target wild pet is out of capture range");
    }

    spawn.status = "engaged";
    spawn.cooldownUntilMs = null;
    return ok({
      providerId,
      captureRadiusMeters: CAPTURE_RADIUS_METERS,
      wildPet: toPublicWildPet(spawn, distanceMeters, true)
    });
  }

  completeCaptureBattle(input = {}) {
    const providerId = resolveProviderId(input.providerId);
    const wildPetId = typeof input.wildPetId === "string" ? input.wildPetId.trim() : "";
    const success = Boolean(input.success);
    const runtimeDataStore = input.runtimeDataStore;
    if (!wildPetId) {
      return fail("INVALID_WILD_PET", "wildPetId is required");
    }

    const state = this.ensureProviderState(providerId, input.now);
    const spawn = state.spawns.find((item) => item.id === wildPetId);
    if (!spawn) {
      return fail("WILD_PET_NOT_FOUND", "target wild pet does not exist");
    }

    if (success) {
      if (!runtimeDataStore || typeof runtimeDataStore.captureWildPet !== "function") {
        return fail("STORE_REQUIRED", "runtime data store is required for capture success flow");
      }
      spawn.status = "captured";
      spawn.cooldownUntilMs = null;
      const capturedAt = new Date().toISOString().slice(0, 19).replace("T", " ");
      const captureResult = runtimeDataStore.captureWildPet({
        wildPetId: spawn.id,
        wildSerial: spawn.serial,
        rarity: spawn.rarity,
        element: spawn.element,
        model: spawn.model,
        name: spawn.name,
        capturedAt,
        avatar: spawn.avatar
      });
      return ok({
        success: true,
        wildPet: toPublicWildPet(spawn),
        capturedPet: captureResult.pet,
        duplicate: Boolean(captureResult.duplicate)
      });
    }

    spawn.status = "cooldown";
    spawn.cooldownUntilMs = Date.now() + COOLDOWN_MS;
    return ok({
      success: false,
      wildPet: toPublicWildPet(spawn),
      cooldownUntilMs: spawn.cooldownUntilMs
    });
  }

  ensureProviderState(providerId, nowInput) {
    const hourKey = toHourKey(nowInput ? new Date(nowInput) : new Date());
    const existing = this.providerState.get(providerId);
    if (existing && existing.hourKey === hourKey) {
      return existing;
    }

    const spawns = createSpawnSet(providerId, hourKey);
    const next = {
      providerId,
      hourKey,
      spawns
    };
    this.providerState.set(providerId, next);
    return next;
  }

  applyCooldownRecovery(state, nowMs) {
    for (const spawn of state.spawns) {
      if (spawn.status !== "cooldown") continue;
      if (!Number.isFinite(spawn.cooldownUntilMs)) {
        spawn.status = "available";
        spawn.cooldownUntilMs = null;
        continue;
      }
      if (nowMs >= spawn.cooldownUntilMs) {
        spawn.status = "available";
        spawn.cooldownUntilMs = null;
      }
    }
  }
}

function createSpawnSet(providerId, hourKey) {
  const center = PROVIDER_META[providerId].center;
  const dateTag = hourKey.replace(/[-:TZ]/g, "").slice(0, 10);
  return SPAWN_LAYOUT.map((layout, idx) => {
    const id = `wild-${providerId}-${layout.id}`;
    const serial = `WP-${dateTag}-${String(idx + 1).padStart(4, "0")}`;
    const position = offsetPosition(center, layout.dx, layout.dy);
    const element = layout.element;
    const rarity = layout.rarity;
    const avatar = elementToAvatar(element);
    const zhElement = elementToZh(element);
    const enElement = elementToEn(element);
    const name = {
      zh: `${zhElement}${rarityToZh(rarity)}灵宠`,
      en: `${enElement} ${rarityToEn(rarity)} Pet`
    };
    return {
      id,
      serial,
      providerId,
      element,
      rarity,
      landmarkType: layout.landmarkType,
      position,
      model: MODEL_BY_ELEMENT[element] || "../assets/models/RobotExpressive.glb",
      stats: rarityToStats(element, rarity),
      avatar,
      name,
      status: "available",
      cooldownUntilMs: null
    };
  });
}

function toPublicWildPet(spawn, distanceMeters = null, inRange = false) {
  return {
    id: spawn.id,
    serial: spawn.serial,
    element: spawn.element,
    rarity: spawn.rarity,
    landmarkType: spawn.landmarkType,
    position: { ...spawn.position },
    model: spawn.model,
    avatar: spawn.avatar,
    name: { ...spawn.name },
    stats: spawn.stats,
    status: spawn.status,
    distanceMeters: Number.isFinite(distanceMeters) ? Number(distanceMeters.toFixed(2)) : null,
    inRange: Boolean(inRange),
    cooldownRemainingSec:
      spawn.status === "cooldown" && Number.isFinite(spawn.cooldownUntilMs)
        ? Math.max(0, Math.ceil((spawn.cooldownUntilMs - Date.now()) / 1000))
        : 0
  };
}

function ok(payload) {
  return {
    ok: true,
    ...payload
  };
}

function fail(code, message) {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function resolveProviderId(providerId) {
  if (providerId === "google") return "google";
  return "tencent";
}

function clampRadius(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_METERS;
  return Math.max(80, Math.min(1000, Math.round(parsed)));
}

function normalizeLocation(input) {
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function toHourKey(date) {
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}T${hour}:00Z`;
}

function offsetPosition(base, dxMeters, dyMeters) {
  const metersPerLat = 111320;
  const metersPerLng = Math.cos((base.lat * Math.PI) / 180) * 111320;
  return {
    lat: Number((base.lat + dyMeters / metersPerLat).toFixed(7)),
    lng: Number((base.lng + dxMeters / metersPerLng).toFixed(7))
  };
}

function haversineDistanceMeters(a, b) {
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

function toRad(value) {
  return (value * Math.PI) / 180;
}

function rarityToZh(rarity) {
  if (rarity === "epic") return "稀";
  if (rarity === "rare") return "优";
  return "普";
}

function rarityToEn(rarity) {
  if (rarity === "epic") return "Epic";
  if (rarity === "rare") return "Rare";
  return "Common";
}

function rarityToStats(element, rarity) {
  const base = {
    fire: { hp: 118, atk: 34, def: 20, spd: 22 },
    water: { hp: 126, atk: 28, def: 24, spd: 20 },
    wood: { hp: 132, atk: 26, def: 26, spd: 18 },
    metal: { hp: 136, atk: 30, def: 30, spd: 13 },
    earth: { hp: 142, atk: 24, def: 34, spd: 11 }
  }[element] || { hp: 120, atk: 30, def: 24, spd: 18 };
  const ratio = rarity === "epic" ? 1.18 : rarity === "rare" ? 1.08 : 1;
  return `HP${Math.round(base.hp * ratio)} / ATK${Math.round(base.atk * ratio)} / DEF${Math.round(
    base.def * ratio
  )} / SPD${Math.round(base.spd * ratio)}`;
}

function elementToZh(element) {
  if (element === "fire") return "火";
  if (element === "water") return "水";
  if (element === "wood") return "木";
  if (element === "metal") return "金";
  if (element === "earth") return "土";
  return "灵";
}

function elementToEn(element) {
  if (element === "fire") return "Fire";
  if (element === "water") return "Water";
  if (element === "wood") return "Wood";
  if (element === "metal") return "Metal";
  if (element === "earth") return "Earth";
  return "Spirit";
}

function elementToAvatar(element) {
  if (element === "fire") return "焰";
  if (element === "water") return "潮";
  if (element === "wood") return "芽";
  if (element === "metal") return "锋";
  if (element === "earth") return "岩";
  return "灵";
}

module.exports = {
  CAPTURE_RADIUS_METERS,
  WildPetRuntimeService
};
