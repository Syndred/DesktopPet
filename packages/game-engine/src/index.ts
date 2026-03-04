import type { BattleActionType, ElementType } from "@qingpet/shared-types";

const ELEMENT_ADVANTAGE_CHAIN: Record<ElementType, ElementType> = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal"
};

const BASE_DAMAGE: Record<BattleActionType, number> = {
  normal_attack: 20,
  element_attack: 24,
  dodge: 0,
  ultimate: 40
};

export type StatusType = "burn" | "freeze" | "parasite" | "vulnerability" | "petrify";

export interface StatusEffect {
  type: StatusType;
  duration: number;
  potency?: number;
  sourceId?: string;
}

export interface Combatant {
  id: string;
  element: ElementType;
  hp: number;
  maxHp: number;
  anger: number;
  statuses: StatusEffect[];
}

export interface RoundCommands {
  [playerId: string]: BattleActionType;
}

export interface RoundResult {
  round: number;
  appliedActions: Record<string, BattleActionType | "stunned">;
  damageTaken: Record<string, number>;
  hpAfter: Record<string, number>;
  angerAfter: Record<string, number>;
  statusesAfter: Record<string, StatusEffect[]>;
  notes: string[];
}

export class BattleEngine {
  private readonly players: [Combatant, Combatant];
  private round = 0;

  constructor(playerA: Combatant, playerB: Combatant) {
    this.players = [cloneCombatant(playerA), cloneCombatant(playerB)];
  }

  snapshot(): [Combatant, Combatant] {
    return [cloneCombatant(this.players[0]), cloneCombatant(this.players[1])];
  }

  executeRound(commands: RoundCommands): RoundResult {
    this.round += 1;

    const [left, right] = this.players;
    const notes: string[] = [];
    const damageTaken: Record<string, number> = {
      [left.id]: 0,
      [right.id]: 0
    };

    let leftAction: BattleActionType | "stunned" = normalizeAction(
      left,
      commands[left.id],
      notes
    );
    let rightAction: BattleActionType | "stunned" = normalizeAction(
      right,
      commands[right.id],
      notes
    );

    const leftStunned = hasStatus(left, "freeze") || hasStatus(left, "petrify");
    const rightStunned = hasStatus(right, "freeze") || hasStatus(right, "petrify");

    if (leftStunned) {
      leftAction = "stunned";
      notes.push(`${left.id} is stunned and cannot act`);
    }
    if (rightStunned) {
      rightAction = "stunned";
      notes.push(`${right.id} is stunned and cannot act`);
    }

    if (leftAction !== "stunned" && leftAction !== "dodge") {
      if (doesActionHit(leftAction, rightAction)) {
        const damage = computeDamage(leftAction, left, right);
        applyDamage(right, damage);
        damageTaken[right.id] += damage;
        if (leftAction !== "ultimate") {
          gainAngerOnHit(left, left.element, right.element);
        }
        gainAngerOnHurt(right, damage);
        applyAttackStatus(leftAction, left, right, notes);
      } else {
        notes.push(`${left.id} missed with ${leftAction}`);
      }
    }

    if (rightAction !== "stunned" && rightAction !== "dodge") {
      if (doesActionHit(rightAction, leftAction)) {
        const damage = computeDamage(rightAction, right, left);
        applyDamage(left, damage);
        damageTaken[left.id] += damage;
        if (rightAction !== "ultimate") {
          gainAngerOnHit(right, right.element, left.element);
        }
        gainAngerOnHurt(left, damage);
        applyAttackStatus(rightAction, right, left, notes);
      } else {
        notes.push(`${right.id} missed with ${rightAction}`);
      }
    }

    applyRoundEndStatusEffects(this.players, damageTaken, notes);
    reduceStatusDuration(left);
    reduceStatusDuration(right);

    const appliedActions: Record<string, BattleActionType | "stunned"> = {
      [left.id]: leftAction,
      [right.id]: rightAction
    };

    return {
      round: this.round,
      appliedActions,
      damageTaken,
      hpAfter: {
        [left.id]: left.hp,
        [right.id]: right.hp
      },
      angerAfter: {
        [left.id]: left.anger,
        [right.id]: right.anger
      },
      statusesAfter: {
        [left.id]: left.statuses.map(cloneStatus),
        [right.id]: right.statuses.map(cloneStatus)
      },
      notes
    };
  }
}

export * from "./progression.js";

export function getElementMultiplier(
  attacker: ElementType,
  defender: ElementType
): number {
  if (ELEMENT_ADVANTAGE_CHAIN[attacker] === defender) return 1.5;
  if (ELEMENT_ADVANTAGE_CHAIN[defender] === attacker) return 0.7;
  return 1;
}

function normalizeAction(
  player: Combatant,
  action: BattleActionType | undefined,
  notes: string[]
): BattleActionType {
  if (!action) return "normal_attack";
  if (action === "ultimate" && player.anger < 100) {
    notes.push(`${player.id} ultimate downgraded to normal_attack (anger < 100)`);
    return "normal_attack";
  }
  if (action === "ultimate") {
    player.anger = 0;
  }
  return action;
}

function doesActionHit(
  attackerAction: BattleActionType,
  defenderAction: BattleActionType | "stunned"
): boolean {
  if (attackerAction === "dodge") return false;
  if (attackerAction === "ultimate") return true;
  if (defenderAction === "stunned") return true;

  if (attackerAction === "normal_attack" && defenderAction === "dodge") return false;
  if (attackerAction === "element_attack" && defenderAction === "normal_attack") {
    return false;
  }

  return true;
}

function computeDamage(
  action: BattleActionType,
  attacker: Combatant,
  defender: Combatant
): number {
  let damage = BASE_DAMAGE[action];
  damage *= getElementMultiplier(attacker.element, defender.element);
  if (hasStatus(defender, "vulnerability")) damage *= 1.2;
  return Math.max(0, Math.round(damage));
}

function applyAttackStatus(
  action: BattleActionType,
  attacker: Combatant,
  defender: Combatant,
  notes: string[]
): void {
  if (action !== "element_attack") return;

  if (attacker.element === "fire") {
    addOrRefreshStatus(defender, { type: "burn", duration: 2, potency: 5, sourceId: attacker.id });
    notes.push(`${defender.id} is burned`);
  }
  if (attacker.element === "water") {
    addOrRefreshStatus(defender, { type: "freeze", duration: 2, sourceId: attacker.id });
    notes.push(`${defender.id} is frozen`);
  }
  if (attacker.element === "wood") {
    addOrRefreshStatus(defender, {
      type: "parasite",
      duration: 2,
      potency: 4,
      sourceId: attacker.id
    });
    notes.push(`${defender.id} is parasitized`);
  }
  if (attacker.element === "metal") {
    addOrRefreshStatus(defender, {
      type: "vulnerability",
      duration: 2,
      sourceId: attacker.id
    });
    notes.push(`${defender.id} is vulnerable`);
  }
  if (attacker.element === "earth") {
    addOrRefreshStatus(defender, { type: "petrify", duration: 2, sourceId: attacker.id });
    notes.push(`${defender.id} is petrified`);
  }
}

function gainAngerOnHurt(player: Combatant, damage: number): void {
  player.anger = Math.min(100, player.anger + Math.floor(damage * 0.5));
}

function gainAngerOnHit(
  player: Combatant,
  attackerElement: ElementType,
  defenderElement: ElementType
): void {
  const hasAdvantage = getElementMultiplier(attackerElement, defenderElement) > 1;
  if (hasAdvantage) {
    player.anger = Math.min(100, player.anger + 20);
  }
}

function applyRoundEndStatusEffects(
  players: [Combatant, Combatant],
  damageTaken: Record<string, number>,
  notes: string[]
): void {
  for (const player of players) {
    for (const status of player.statuses) {
      if (status.type === "burn" && status.potency) {
        applyDamage(player, status.potency);
        damageTaken[player.id] += status.potency;
        notes.push(`${player.id} takes ${status.potency} burn damage`);
      }

      if (status.type === "parasite" && status.potency && status.sourceId) {
        applyDamage(player, status.potency);
        damageTaken[player.id] += status.potency;
        const source = players.find((p) => p.id === status.sourceId);
        if (source) {
          source.hp = Math.min(source.maxHp, source.hp + status.potency);
        }
        notes.push(`${player.id} takes ${status.potency} parasite damage`);
      }
    }
  }
}

function addOrRefreshStatus(player: Combatant, next: StatusEffect): void {
  const idx = player.statuses.findIndex((status) => status.type === next.type);
  if (idx === -1) {
    player.statuses.push(next);
    return;
  }
  player.statuses[idx] = next;
}

function hasStatus(player: Combatant, type: StatusType): boolean {
  return player.statuses.some((status) => status.type === type);
}

function reduceStatusDuration(player: Combatant): void {
  player.statuses = player.statuses
    .map((status) => ({ ...status, duration: status.duration - 1 }))
    .filter((status) => status.duration > 0);
}

function applyDamage(player: Combatant, amount: number): void {
  player.hp = Math.max(0, player.hp - amount);
}

function cloneStatus(status: StatusEffect): StatusEffect {
  return { ...status };
}

function cloneCombatant(player: Combatant): Combatant {
  return {
    ...player,
    statuses: player.statuses.map(cloneStatus)
  };
}
