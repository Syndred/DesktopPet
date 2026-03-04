export interface PetProgressionState {
  level: number;
  exp: number;
  intimacy: number;
  unlockedSkills: string[];
}

export interface BattleGrowthModifiers {
  hpBonus: number;
  attackBonusPct: number;
  defenseBonusPct: number;
}

const SKILL_UNLOCK_LEVELS: Array<{ level: number; skillId: string }> = [
  { level: 3, skillId: "skill_focus_strike" },
  { level: 5, skillId: "skill_guard_break" },
  { level: 8, skillId: "skill_ultimate_bloom" }
];

export function getRequiredExpForLevel(level: number): number {
  const normalized = Math.max(1, level);
  return 40 + normalized * normalized * 12;
}

export function addExperience(
  state: PetProgressionState,
  gainedExp: number
): PetProgressionState {
  let level = Math.max(1, state.level);
  let exp = Math.max(0, state.exp) + Math.max(0, gainedExp);
  const intimacy = Math.max(0, state.intimacy);

  while (exp >= getRequiredExpForLevel(level)) {
    exp -= getRequiredExpForLevel(level);
    level += 1;
  }

  const unlockedSkills = computeUnlockedSkills(level);
  return {
    level,
    exp,
    intimacy,
    unlockedSkills
  };
}

export function addIntimacy(
  state: PetProgressionState,
  delta: number
): PetProgressionState {
  return {
    ...state,
    intimacy: Math.max(0, state.intimacy + delta)
  };
}

export function toBattleGrowthModifiers(state: PetProgressionState): BattleGrowthModifiers {
  const level = Math.max(1, state.level);
  const intimacy = Math.max(0, state.intimacy);
  return {
    hpBonus: (level - 1) * 5 + Math.floor(intimacy / 20),
    attackBonusPct: Number((((level - 1) * 1.5 + intimacy * 0.05) / 100).toFixed(4)),
    defenseBonusPct: Number((((level - 1) * 1.2 + intimacy * 0.03) / 100).toFixed(4))
  };
}

export function createInitialProgressionState(): PetProgressionState {
  return {
    level: 1,
    exp: 0,
    intimacy: 0,
    unlockedSkills: []
  };
}

function computeUnlockedSkills(level: number): string[] {
  return SKILL_UNLOCK_LEVELS.filter((item) => level >= item.level).map((item) => item.skillId);
}

