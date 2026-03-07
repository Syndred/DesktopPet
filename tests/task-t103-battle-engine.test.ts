import { describe, expect, it } from "vitest";

import { BattleEngine, getElementMultiplier, type Combatant } from "@qingpet/game-engine";

function createCombatant(id: string, element: Combatant["element"]): Combatant {
  return {
    id,
    element,
    hp: 120,
    maxHp: 120,
    anger: 0,
    statuses: []
  };
}

describe("T-103 battle engine rules", () => {
  it("applies element advantage and disadvantage multipliers", () => {
    expect(getElementMultiplier("metal", "wood")).toBe(1.2);
    expect(getElementMultiplier("wood", "metal")).toBe(0.8);
    expect(getElementMultiplier("fire", "earth")).toBe(1);
  });

  it("normal attack interrupts element attack", () => {
    const engine = new BattleEngine(
      createCombatant("p1", "metal"),
      createCombatant("p2", "wood")
    );
    const result = engine.executeRound({
      p1: "normal_attack",
      p2: "element_attack"
    });

    expect(result.damageTaken.p2).toBeGreaterThan(0);
    expect(result.damageTaken.p1).toBe(0);
  });

  it("dodge avoids normal attack but not element attack", () => {
    const engine = new BattleEngine(
      createCombatant("p1", "fire"),
      createCombatant("p2", "water")
    );

    const round1 = engine.executeRound({
      p1: "normal_attack",
      p2: "dodge"
    });
    expect(round1.damageTaken.p2).toBe(0);

    const round2 = engine.executeRound({
      p1: "element_attack",
      p2: "dodge"
    });
    expect(round2.damageTaken.p2).toBeGreaterThan(0);
  });

  it("applies elemental status effects", () => {
    const engine = new BattleEngine(
      createCombatant("p1", "fire"),
      createCombatant("p2", "metal")
    );
    const round1 = engine.executeRound({
      p1: "element_attack",
      p2: "dodge"
    });

    expect(round1.statusesAfter.p2.some((status) => status.type === "burn")).toBe(true);
  });

  it("downgrades ultimate when anger is not full", () => {
    const engine = new BattleEngine(
      createCombatant("p1", "earth"),
      createCombatant("p2", "water")
    );
    const round1 = engine.executeRound({
      p1: "ultimate",
      p2: "dodge"
    });

    expect(round1.appliedActions.p1).toBe("normal_attack");
    expect(round1.notes.some((line) => line.includes("downgraded"))).toBe(true);
  });

  it("executes ultimate when anger is full and resets anger", () => {
    const p1 = createCombatant("p1", "earth");
    const p2 = createCombatant("p2", "water");
    p1.anger = 100;

    const engine = new BattleEngine(p1, p2);
    const round1 = engine.executeRound({
      p1: "ultimate",
      p2: "dodge"
    });

    expect(round1.appliedActions.p1).toBe("ultimate");
    expect(round1.damageTaken.p2).toBeGreaterThanOrEqual(20);
    expect(round1.angerAfter.p1).toBe(0);
  });

  it("freeze status blocks next turn action", () => {
    const engine = new BattleEngine(
      createCombatant("p1", "water"),
      createCombatant("p2", "fire")
    );

    const round1 = engine.executeRound({
      p1: "element_attack",
      p2: "dodge"
    });
    expect(round1.statusesAfter.p2.some((status) => status.type === "freeze")).toBe(true);

    const round2 = engine.executeRound({
      p1: "dodge",
      p2: "normal_attack"
    });
    expect(round2.appliedActions.p2).toBe("stunned");
  });
});
