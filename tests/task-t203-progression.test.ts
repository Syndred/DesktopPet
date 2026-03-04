import { describe, expect, it } from "vitest";

import {
  addExperience,
  addIntimacy,
  createInitialProgressionState,
  getRequiredExpForLevel,
  toBattleGrowthModifiers
} from "@qingpet/game-engine";

describe("T-203 progression system", () => {
  it("uses monotonic exp curve", () => {
    expect(getRequiredExpForLevel(2)).toBeGreaterThan(getRequiredExpForLevel(1));
    expect(getRequiredExpForLevel(5)).toBeGreaterThan(getRequiredExpForLevel(4));
  });

  it("levels up and unlocks skills at thresholds", () => {
    let state = createInitialProgressionState();
    state = addExperience(state, 1000);

    expect(state.level).toBeGreaterThanOrEqual(3);
    expect(state.unlockedSkills).toContain("skill_focus_strike");
  });

  it("never drops below zero intimacy", () => {
    const state = addIntimacy(createInitialProgressionState(), -100);
    expect(state.intimacy).toBe(0);
  });

  it("maps progression to battle modifiers", () => {
    let state = createInitialProgressionState();
    state = addExperience(state, 1000);
    state = addIntimacy(state, 60);

    const modifiers = toBattleGrowthModifiers(state);
    expect(modifiers.hpBonus).toBeGreaterThan(0);
    expect(modifiers.attackBonusPct).toBeGreaterThan(0);
    expect(modifiers.defenseBonusPct).toBeGreaterThan(0);
  });

  it("prevents negative exp gain from corrupting state", () => {
    const state = addExperience(createInitialProgressionState(), -50);
    expect(state.level).toBe(1);
    expect(state.exp).toBe(0);
  });
});

