/** Resource IDs identify shared appearances. They must never replace a pet instance ID. */
export const RESOURCE_ACTIONS = ['idle', 'walk', 'attack', 'hit', 'skill', 'victory', 'sleep'] as const;
export type ResourceAction = (typeof RESOURCE_ACTIONS)[number];
export type ResourceContext = 'desktop' | 'battle';
export type ResourceKind = 'spritesheet' | 'model3d';
export interface ResourceCalibration {
  scale: number;
  yawDeg: number;
  pitchDeg: number;
  verticalOffset: number;
  mirrorX: boolean;
}
export interface ResourceProvenance {
  author: string;
  source: string;
  license: string;
  licenseUrl?: string;
  attribution?: string;
  status: 'project-original' | 'recorded' | 'unverified';
}
export interface ResourceClip {
  name: string;
  frames?: number[];
  fps?: number;
  loop: boolean;
}
export interface CharacterResource {
  id: string;
  name: string;
  kind: ResourceKind;
  origin: 'builtin' | 'import' | 'legacy';
  revision: number;
  contentHash: string;
  importedAt: string;
  provenance: ResourceProvenance;
  entryAsset: string;
  thumbnailAsset?: string;
  sheet?: { width: number; height: number; columns: number; rows: number };
  clips: ResourceClip[];
  actions: Record<ResourceAction, string | null>;
  calibration: Record<ResourceContext, ResourceCalibration>;
  availability: 'ready' | 'missing' | 'invalid';
  warnings: string[];
  legacyModel?: string;
}
export interface ResourceDisplayRequest {
  resourceId: string;
  petId: string;
  action?: ResourceAction;
  context?: ResourceContext;
  facing?: 'left' | 'right';
}
export interface ResourceDisplay {
  resource: CharacterResource;
  petId: string;
  context: ResourceContext;
  calibration: ResourceCalibration;
  clip: ResourceClip | null;
  fallback: boolean;
  warning?: string;
}
export type ResourceResult<T> = { ok: true; data: T; revision?: number } | {
  ok: false; error: { code: string; message: string; revision?: number };
};
export interface ResourceSaveRequest {
  resourceId: string;
  expectedRevision: number;
  calibration: CharacterResource['calibration'];
  actions: CharacterResource['actions'];
}
/** Main resolves owner and native file dialog; renderer never supplies a local path or owner ID. */
export interface ResourcesClient {
  list(): Promise<ResourceResult<CharacterResource[]>>;
  importResource(provenance?: Partial<ResourceProvenance>): Promise<ResourceResult<{
    resource: CharacterResource; duplicate: boolean;
  }> | { ok: true; data: null }>;
  save(request: ResourceSaveRequest): Promise<ResourceResult<CharacterResource>>;
  resolve(request: ResourceDisplayRequest): Promise<ResourceResult<ResourceDisplay>>;
  assetUrl(resourceId: string, assetKey: string): string;
  importLegacyCalibration?(profiles: Record<string, unknown>): Promise<ResourceResult<{ migrated: number }>>;
}
