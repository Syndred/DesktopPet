import type { BattleRulesProfile } from '../battle/index.js';

/** A template is an appearance. A petId identifies one owned, independent companion. */
export type PetId = string;
export type CompanionBehavior = 'wander' | 'quiet' | 'follow' | 'sleep';
export type CompanionElement = 'metal' | 'wood' | 'earth' | 'water' | 'fire';
export type CompanionSource = 'adoption' | 'capture' | 'legacy';

export interface CompanionResourceRef {
  resourceId: string;
  kind: '2d' | '3d';
  /** Raw historical metadata only. The new renderer and active roster use 2D. */
  legacyModel?: string;
}

export interface CompanionTemplate {
  templateId: string;
  name: string;
  category: 'big-fish' | 'animal' | 'legacy';
  description: string;
  element: CompanionElement;
  resource: CompanionResourceRef;
  baseStats: { hp: number; atk: number; def: number; spd: number };
}

export interface CompanionPosition {
  x: number;
  y: number;
  displayId: string | null;
}

/** Display only; canonical names, serials and saved pet identifiers stay intact. */
export interface CompanionDisplayIdentity {
  readonly roleName: string;
  /** globalSerial padded to at least four digits, or 待同步. Never an instance key. */
  readonly instanceNumber: string;
  readonly historicalNickname: string | null;
}

export interface CompanionPet {
  petId: PetId;
  ownerAccountId: string;
  templateId: string;
  /** Original persisted name. UI role names come from CompanionDisplayIdentity. */
  name: string;
  /** Historical receipt/encounter serial; not a unique display identifier. */
  serial: string;
  /** Server-assigned global sequence per original templateId, canonical positive decimal text without leading zeros. Never accept from a renderer mutation. */
  globalSerial?: string;
  element: CompanionElement;
  resource: CompanionResourceRef;
  source: CompanionSource;
  origin: Record<string, unknown>;
  growth: {
    level: number;
    experience: number;
    mood: number;
    satiety: number;
    affinity: number;
    winsTotal: number;
    stats: { hp: number; atk: number; def: number; spd: number };
  };
  desktop: {
    visible: boolean;
    behavior: CompanionBehavior;
    scale: number;
    position: CompanionPosition;
  };
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionSelections {
  chatPetId: PetId | null;
  battlePetId: PetId | null;
  guardPetId: PetId | null;
}

export interface CompanionsSnapshot {
  ownerAccountId: string;
  pets: CompanionPet[];
  selections: CompanionSelections;
  templates: CompanionTemplate[];
  revision: number;
  /** Main-process runtime projection, never part of raw pets, receipts or backups. */
  desktopDisplay?: {
    ownerAccountId: string;
    available: boolean;
    limit: number | null;
    pets: Array<{ petId: PetId; state: 'off' | 'visible' | 'waiting' | 'hidden' | 'unknown'; reason: 'limit' | 'fullscreen' | null }>;
  };
  sync?: {
    mode: 'cloud';
    status: 'cached' | 'ready' | 'pending' | 'offline' | 'conflict';
    pending: number;
    sharedSavePending: boolean;
    sharedSaveReason?: 'local-difference';
    cloudRevision?: number;
    error?: string;
    message?: string;
  };
}

export interface CompanionAction {
  actionId: string;
  petId: PetId;
  expectedRevision?: number;
}

/** Main-process only. Never accept these effects directly from an untrusted renderer. */
export interface CompanionGrowthEffect {
  mood?: number;
  satiety?: number;
  affinity?: number;
  experience?: number;
  wins?: number;
}

export type CompanionErrorCode =
  | 'AUTH_REQUIRED' | 'PET_NOT_FOUND' | 'TEMPLATE_NOT_FOUND'
  | 'INVALID_INPUT' | 'REVISION_CONFLICT' | 'ACTION_ID_CONFLICT'
  | 'RATE_LIMITED' | 'RESOURCE_UNAVAILABLE' | 'ACTION_UNAVAILABLE' | 'SESSION_CHANGED' | 'INTERNAL_ERROR';

export type CompanionResult<T> =
  | { ok: true; data: T; revision: number; duplicate?: boolean }
  | { ok: false; code: CompanionErrorCode; message: string; revision?: number };

export interface CompanionMutation {
  pet: CompanionPet;
  selections: CompanionSelections;
}
export interface CompanionCombatProfile {
  petId: PetId;
  resourceId: string;
  growthStats: CompanionPet['growth']['stats'];
  training: { initialHp: number; maxHp: number; initialAnger: number; normalized: boolean };
  rules: BattleRulesProfile;
  authority: string;
}

export interface CompanionsClient {
  list(): Promise<CompanionResult<CompanionsSnapshot>>;
  identity(input: { petId: PetId }): Promise<CompanionResult<CompanionDisplayIdentity>>;
  adopt(input: { actionId: string; templateId: string; name: string; showOnDesktop: boolean }): Promise<CompanionResult<CompanionMutation>>;
  rename(input: CompanionAction & { name: string }): Promise<CompanionResult<CompanionMutation>>;
  desktop(input: CompanionAction & { visible?: boolean; behavior?: CompanionBehavior; scale?: number; position?: CompanionPosition }): Promise<CompanionResult<CompanionMutation>>;
  select(input: CompanionAction & { slot: keyof CompanionSelections }): Promise<CompanionResult<CompanionMutation>>;
  interact(input: CompanionAction): Promise<CompanionResult<CompanionMutation>>;
  perform(input: { actionId: string; petId: PetId; resourceId?: string; action: string }): Promise<CompanionResult<CompanionMutation>>;
  combatProfile(input: { petId: PetId }): Promise<CompanionResult<CompanionCombatProfile>>;
  subscribe(listener: () => void): () => void;
}
