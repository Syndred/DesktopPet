import type { BattleActionType, ElementType } from "../../battle.js";

export type BattleMode = "training" | "friend" | "wild" | "territory";
export type BattleWinner = "player" | "enemy" | null;
export interface BattleStatus {
  type: "burn" | "freeze" | "parasite" | "vulnerability" | "petrify";
  duration: number; stacks?: number; potency?: number; sourceId?: string;
}
export interface BattleActor {
  id: string; element: ElementType; hp: number; maxHp: number; anger: number;
  freeDodgeUsed?: boolean; statuses: BattleStatus[];
}
export interface BattleSnapshot { round: number; player: BattleActor; enemy: BattleActor }
export interface BattleParticipant {
  petId: string; petName: string; element: ElementType; level?: number; model?: string;
  resourceRef?: string; avatar?: string;
  appearance2d?: string;
  resource?: { resourceId: string; kind: "2d" | "3d"; legacyModel?: string };
}
export interface BattleRound {
  round: number;
  actions: { player: BattleActionType | "stunned"; enemy: BattleActionType | "stunned" };
  damageTaken: { player: number; enemy: number };
  directDamage?: { player: number; enemy: number };
  dotDamageEvents?: Record<"player" | "enemy", Array<{ type: string; amount: number }>>;
  healEvents?: Record<"player" | "enemy", Array<{ type: string; amount: number }>>;
  hpAfter?: { player: number; enemy: number }; angerAfter?: { player: number; enemy: number };
  statusesAfter?: { player: BattleStatus[]; enemy: BattleStatus[] };
  state?: BattleSnapshot; winner: BattleWinner; notes: string[];
}
export interface BattleReward {
  actionId: string; experience: number; applied: boolean; petId: string;
  previousExperience?: number; currentExperience?: number; previousLevel?: number; currentLevel?: number;
  pendingReason?: string;
}
export interface BattleSession {
  id: string; mode: BattleMode; status: "waiting" | "active" | "settling" | "finished" | "abandoned";
  revision: number; startedAt: string; endedAt?: string;
  player: BattleParticipant; enemy: BattleParticipant; snapshot: BattleSnapshot;
  rounds: BattleRound[]; winner: BattleWinner;
  room?: { id: string; room_code: string; status: string; current_round: number; winner_side?: string };
  side?: "host" | "guest";
  pendingAction?: { actionId: string; action: BattleActionType; roundNo: number; uncertain?: boolean } | null;
  reward?: BattleReward; reportId?: string; historyComplete?: boolean; context?: Record<string, unknown>;
}
export interface BattleReport {
  id: string; sessionId: string; mode: BattleMode | "duel" | "capture";
  status: string; winner: BattleWinner; startedAt: string; endedAt: string;
  player: BattleParticipant; enemy: BattleParticipant; rounds: BattleRound[];
  reward?: BattleReward; legacy?: boolean; historyComplete?: boolean;
}
export interface DuelUser { id: string; account: string; username: string }
export interface DuelInvitation {
  id: string; fromUserId: string; fromAccount: string; toUserId: string; toAccount: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  roomId?: string | null; roomCode?: string | null; roomStatus?: string | null;
  createdAt: string; updatedAt: string;
}
export interface BattleFeatureAdapter {
  /** Main-process-only: verified challenge data, never a renderer supplied combatant. */
  beginWildChallenge(input: { ownerAccountId: string; petId: string; actionId: string; challenge: { id: string; opponent: BattleParticipant; [key: string]: unknown } }): BattleSession;
  beginTerritoryChallenge(input: { ownerAccountId: string; petId: string; actionId: string; challenge: { id: string; opponent: BattleParticipant; [key: string]: unknown } }): BattleSession;
  getOutcome(input: { ownerAccountId: string; sessionId: string }): { session: BattleSession; won: boolean; settled: boolean };
  settleTerritoryChallenge(input: { ownerAccountId: string; sessionId: string }): { session: BattleSession; won: boolean; settled: boolean; receipt: { id: string; actionId: string; territoryId: string; petId: string; won: boolean; authority: string; verified: boolean } };
}
