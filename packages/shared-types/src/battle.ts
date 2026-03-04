export const SHARED_SCHEMA_VERSION = "0.3.0";

export type ElementType = "metal" | "wood" | "earth" | "water" | "fire";

export type BattleActionType =
  | "normal_attack"
  | "element_attack"
  | "dodge"
  | "ultimate";

export interface BattleTurnPayload {
  attackerId: string;
  defenderId: string;
  attackerElement: ElementType;
  defenderElement: ElementType;
  action: BattleActionType;
}

export function toActionLabel(action: BattleActionType): string {
  if (action === "normal_attack") return "Normal Attack";
  if (action === "element_attack") return "Element Attack";
  if (action === "ultimate") return "Ultimate";
  return "Dodge";
}
