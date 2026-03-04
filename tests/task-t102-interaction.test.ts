import { describe, expect, it } from "vitest";

import {
  isPointerInsideModel,
  selectRenderFps,
  shouldIgnoreMouseEvents
} from "@qingpet/pc-app";

describe("T-102 interaction and fps policy", () => {
  it("detects pointer hit inside model bounds", () => {
    const hit = isPointerInsideModel(
      { x: 120, y: 145 },
      { x: 100, y: 100, width: 80, height: 80 }
    );

    expect(hit).toBe(true);
  });

  it("requests mouse ignore when pointer is outside model", () => {
    const ignore = shouldIgnoreMouseEvents({
      pointer: { x: 50, y: 40 },
      modelBounds: { x: 100, y: 100, width: 80, height: 80 }
    });

    expect(ignore).toBe(true);
  });

  it("keeps 60fps during interaction", () => {
    expect(selectRenderFps({ isInteracting: true, isAnimating: false })).toBe(60);
  });

  it("uses low idle fps when no interaction and no animation", () => {
    expect(selectRenderFps({ isInteracting: false, isAnimating: false })).toBe(10);
  });

  it("uses reduced animation fps under low power mode", () => {
    expect(
      selectRenderFps({
        isInteracting: false,
        isAnimating: true,
        lowPowerMode: true
      })
    ).toBe(24);
  });
});

