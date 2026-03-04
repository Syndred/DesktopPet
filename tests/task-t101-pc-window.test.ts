import { describe, expect, it } from "vitest";

import {
  buildTrayMenuModel,
  computeSnapPosition,
  createPetWindowConfig,
  parseWindowBounds,
  serializeWindowBounds,
  type WindowBounds
} from "@qingpet/pc-app";

describe("T-101 pc window baseline", () => {
  it("creates transparent frameless pet window defaults", () => {
    const config = createPetWindowConfig();

    expect(config.transparent).toBe(true);
    expect(config.frame).toBe(false);
    expect(config.alwaysOnTop).toBe(true);
    expect(config.backgroundColor).toBe("#00000000");
  });

  it("provides required tray menu entries", () => {
    const menu = buildTrayMenuModel();
    const ids = menu.map((item) => item.id);

    expect(ids).toEqual([
      "toggle-visibility",
      "settings",
      "pause-interaction",
      "quit"
    ]);
  });

  it("snaps window bounds inside visible work area", () => {
    const bounds: WindowBounds = { x: -5, y: 900, width: 320, height: 320 };
    const workArea = { width: 1280, height: 720 };
    const snapped = computeSnapPosition(bounds, workArea, 12);

    expect(snapped.x).toBe(12);
    expect(snapped.y).toBe(388);
  });

  it("serializes and restores window bounds for persistence", () => {
    const original: WindowBounds = { x: 88, y: 120, width: 320, height: 320 };
    const raw = serializeWindowBounds(original);
    const restored = parseWindowBounds(raw);

    expect(restored).toEqual(original);
    expect(parseWindowBounds("invalid-json")).toBeNull();
  });
});

