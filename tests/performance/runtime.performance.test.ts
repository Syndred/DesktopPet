import { performance } from "node:perf_hooks";

import { describe, expect, it } from "vitest";

import { BattleEngine, type Combatant } from "@qingpet/game-engine";
import { haversineDistanceMeters } from "@qingpet/supabase-edge";

function fighter(id: string, element: Combatant["element"]): Combatant {
  return {
    id,
    element,
    hp: 120,
    maxHp: 120,
    anger: 0,
    statuses: []
  };
}

describe("performance: runtime smoke", () => {
  it("runs 1000 geofence distance checks within budget", () => {
    const p1 = { lat: 31.2304, lng: 121.4737 };
    const p2 = { lat: 31.2310, lng: 121.4734 };

    const start = performance.now();
    for (let i = 0; i < 1000; i += 1) {
      haversineDistanceMeters(p1, p2);
    }
    const elapsed = performance.now() - start;

    // Loose budget to avoid CI flakiness while still detecting regressions.
    expect(elapsed).toBeLessThan(60);
  });

  it("runs 200 battle rounds within budget", () => {
    const engine = new BattleEngine(fighter("a", "metal"), fighter("b", "wood"));
    const start = performance.now();
    for (let i = 0; i < 200; i += 1) {
      engine.executeRound({
        a: i % 2 === 0 ? "normal_attack" : "element_attack",
        b: i % 3 === 0 ? "dodge" : "normal_attack"
      });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(120);
  });
});

