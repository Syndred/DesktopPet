const MAP_PROVIDER_IDS = ["tencent", "google"];
const MAP_PERMISSION_STATUSES = ["prompt", "granted", "denied", "system_disabled"];

const PROVIDER_META = {
  tencent: {
    providerId: "tencent",
    coordinateSystem: "gcj02",
    center: { lat: 31.2304, lng: 121.4737 }
  },
  google: {
    providerId: "google",
    coordinateSystem: "wgs84",
    center: { lat: 37.7749, lng: -122.4194 }
  }
};

const DEFAULT_WATCH_INTERVAL_MS = 1500;

class SimulatedMapProvider {
  constructor(meta) {
    this.providerId = meta.providerId;
    this.coordinateSystem = meta.coordinateSystem;
    this.center = {
      lat: Number(meta.center.lat),
      lng: Number(meta.center.lng)
    };
    this.step = 0;
  }

  nextLocation() {
    this.step += 1;
    const theta = this.step * 0.55;
    const driftLat = Math.sin(theta) * 0.0002;
    const driftLng = Math.cos(theta) * 0.00024;
    const noiseLat = (Math.random() - 0.5) * 0.00003;
    const noiseLng = (Math.random() - 0.5) * 0.00003;
    return {
      lat: Number((this.center.lat + driftLat + noiseLat).toFixed(7)),
      lng: Number((this.center.lng + driftLng + noiseLng).toFixed(7)),
      accuracyMeters: 8 + Math.floor(Math.random() * 7),
      timestampMs: Date.now(),
      providerId: this.providerId,
      coordinateSystem: this.coordinateSystem
    };
  }
}

class MapRuntimeService {
  constructor(options = {}) {
    this.providers = {
      tencent: new SimulatedMapProvider(PROVIDER_META.tencent),
      google: new SimulatedMapProvider(PROVIDER_META.google)
    };
    this.providerId = MAP_PROVIDER_IDS.includes(options.providerId) ? options.providerId : "tencent";
    this.permissionStatus = "prompt";
    this.watchActive = false;
    this.watchIntervalMs = DEFAULT_WATCH_INTERVAL_MS;
    this.lastLocation = null;
    this.updateSeq = 0;
    this.updatedAt = new Date().toISOString();
    this.lastError = null;
    this.watchTimer = null;
    this.listeners = new Set();
  }

  snapshot() {
    const provider = this.providers[this.providerId];
    return {
      providerId: this.providerId,
      coordinateSystem: provider.coordinateSystem,
      permissionStatus: this.permissionStatus,
      watchActive: this.watchActive,
      watchIntervalMs: this.watchIntervalMs,
      lastLocation: this.lastLocation ? { ...this.lastLocation } : null,
      updateSeq: this.updateSeq,
      updatedAt: this.updatedAt,
      lastError: this.lastError
    };
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setProvider(providerId) {
    if (!MAP_PROVIDER_IDS.includes(providerId)) {
      return this.fail("INVALID_PROVIDER", `unsupported provider: ${String(providerId)}`);
    }
    this.providerId = providerId;
    this.lastError = null;
    this.bumpUpdatedAt();
    this.emit();
    return this.ok();
  }

  requestPermission(mode) {
    if (mode && !MAP_PERMISSION_STATUSES.includes(mode)) {
      return this.fail("INVALID_PERMISSION_MODE", `unsupported permission mode: ${String(mode)}`);
    }

    const nextMode = mode || "granted";
    this.permissionStatus = nextMode;
    if (nextMode !== "granted") {
      this.stopWatch();
    }
    this.lastError = null;
    this.bumpUpdatedAt();
    this.emit();
    return this.ok();
  }

  getCurrentLocation() {
    if (!this.ensurePermissionReady()) {
      return this.fail("LOCATION_UNAVAILABLE", "permission is not granted");
    }
    this.pullLocation();
    this.emit();
    return this.ok();
  }

  startWatch(options = {}) {
    if (!this.ensurePermissionReady()) {
      return this.fail("WATCH_UNAVAILABLE", "permission is not granted");
    }

    const intervalMs = clampInterval(options.intervalMs);
    this.watchIntervalMs = intervalMs;
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.watchActive = true;
    this.watchTimer = setInterval(() => {
      if (!this.watchActive) return;
      this.pullLocation();
      this.emit();
    }, intervalMs);

    this.pullLocation();
    this.emit();
    return this.ok();
  }

  stopWatch() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.watchActive = false;
    this.bumpUpdatedAt();
    this.emit();
    return this.ok();
  }

  distanceTo(target) {
    const lat = Number(target?.lat);
    const lng = Number(target?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return this.fail("INVALID_TARGET", "target lat/lng are required");
    }

    if (!this.lastLocation) {
      const locationResult = this.getCurrentLocation();
      if (!locationResult.ok) {
        return locationResult;
      }
    }

    const meters = haversineDistanceMeters(this.lastLocation, { lat, lng });
    this.lastError = null;
    this.bumpUpdatedAt();
    return {
      ok: true,
      distanceMeters: Number(meters.toFixed(2)),
      state: this.snapshot()
    };
  }

  dispose() {
    if (this.watchTimer) {
      clearInterval(this.watchTimer);
      this.watchTimer = null;
    }
    this.watchActive = false;
    this.listeners.clear();
  }

  ensurePermissionReady() {
    return this.permissionStatus === "granted";
  }

  pullLocation() {
    const provider = this.providers[this.providerId];
    this.lastLocation = provider.nextLocation();
    this.updateSeq += 1;
    this.lastError = null;
    this.bumpUpdatedAt();
  }

  ok() {
    return {
      ok: true,
      state: this.snapshot()
    };
  }

  fail(code, message) {
    this.lastError = {
      code,
      message
    };
    this.bumpUpdatedAt();
    this.emit();
    return {
      ok: false,
      error: {
        code,
        message
      },
      state: this.snapshot()
    };
  }

  bumpUpdatedAt() {
    this.updatedAt = new Date().toISOString();
  }

  emit() {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // Keep broadcast resilient.
      }
    }
  }
}

function clampInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_WATCH_INTERVAL_MS;
  return Math.max(300, Math.min(6000, Math.round(parsed)));
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

module.exports = {
  MAP_PERMISSION_STATUSES,
  MAP_PROVIDER_IDS,
  MapRuntimeService
};
