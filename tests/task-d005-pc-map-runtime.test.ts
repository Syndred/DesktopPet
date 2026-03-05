import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type MapRuntimeServiceType = new (options?: { providerId?: string }) => {
  snapshot: () => {
    providerId: string;
    coordinateSystem: string;
    permissionStatus: string;
    watchActive: boolean;
    updateSeq: number;
    lastLocation: null | {
      lat: number;
      lng: number;
      accuracyMeters: number;
      timestampMs: number;
      providerId: string;
      coordinateSystem: string;
    };
  };
  requestPermission: (mode?: string) => {
    ok: boolean;
    state: { permissionStatus: string };
  };
  setProvider: (providerId: string) => {
    ok: boolean;
    state: { providerId: string; coordinateSystem: string };
  };
  getCurrentLocation: () => {
    ok: boolean;
    state: {
      lastLocation: null | {
        lat: number;
        lng: number;
        accuracyMeters: number;
        timestampMs: number;
        providerId: string;
        coordinateSystem: string;
      };
    };
    error?: { code: string; message: string };
  };
  startWatch: (options?: { intervalMs?: number }) => {
    ok: boolean;
    state: { watchActive: boolean; updateSeq: number };
  };
  stopWatch: () => {
    ok: boolean;
    state: { watchActive: boolean };
  };
  distanceTo: (target: { lat: number; lng: number }) => {
    ok: boolean;
    distanceMeters?: number;
    state: { providerId: string };
  };
  subscribe: (listener: (state: { updateSeq: number }) => void) => () => void;
  dispose: () => void;
};

let MapRuntimeService: MapRuntimeServiceType;

describe("D-005 pc map runtime service", () => {
  beforeAll(async () => {
    const modulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/map-runtime.cjs")
    ).href;
    const loaded = (await import(modulePath)) as {
      MapRuntimeService: MapRuntimeServiceType;
    };
    MapRuntimeService = loaded.MapRuntimeService;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("distinguishes denied, system-disabled and granted permission states", () => {
    const service = new MapRuntimeService();
    const denied = service.requestPermission("denied");
    const disabled = service.requestPermission("system_disabled");
    const granted = service.requestPermission("granted");

    expect(denied.ok).toBe(true);
    expect(denied.state.permissionStatus).toBe("denied");
    expect(disabled.state.permissionStatus).toBe("system_disabled");
    expect(granted.state.permissionStatus).toBe("granted");
    service.dispose();
  });

  it("streams continuous watch updates with complete location fields", () => {
    vi.useFakeTimers();
    const service = new MapRuntimeService({ providerId: "tencent" });
    service.requestPermission("granted");

    const updateSnapshots: number[] = [];
    const unbind = service.subscribe((state) => {
      updateSnapshots.push(state.updateSeq);
    });

    const start = service.startWatch({ intervalMs: 400 });
    expect(start.ok).toBe(true);
    expect(start.state.watchActive).toBe(true);

    vi.advanceTimersByTime(1400);

    const snap = service.snapshot();
    expect(snap.watchActive).toBe(true);
    expect(snap.updateSeq).toBeGreaterThanOrEqual(4);
    expect(updateSnapshots.length).toBeGreaterThanOrEqual(4);
    expect(snap.lastLocation).toBeTruthy();
    expect(typeof snap.lastLocation?.lat).toBe("number");
    expect(typeof snap.lastLocation?.lng).toBe("number");
    expect(typeof snap.lastLocation?.accuracyMeters).toBe("number");
    expect(typeof snap.lastLocation?.timestampMs).toBe("number");
    expect(snap.lastLocation?.providerId).toBe("tencent");
    expect(snap.lastLocation?.coordinateSystem).toBe("gcj02");

    const stopped = service.stopWatch();
    expect(stopped.ok).toBe(true);
    expect(stopped.state.watchActive).toBe(false);

    unbind();
    service.dispose();
  });

  it("supports provider switching and distance calculation via unified API", () => {
    const service = new MapRuntimeService({ providerId: "tencent" });
    service.requestPermission("granted");

    const switched = service.setProvider("google");
    expect(switched.ok).toBe(true);
    expect(switched.state.providerId).toBe("google");
    expect(switched.state.coordinateSystem).toBe("wgs84");

    const current = service.getCurrentLocation();
    expect(current.ok).toBe(true);
    expect(current.state.lastLocation?.providerId).toBe("google");

    const distance = service.distanceTo({ lat: 37.7769, lng: -122.4177 });
    expect(distance.ok).toBe(true);
    expect(typeof distance.distanceMeters).toBe("number");
    expect((distance.distanceMeters as number) >= 0).toBe(true);
    expect(distance.state.providerId).toBe("google");

    service.dispose();
  });
});
