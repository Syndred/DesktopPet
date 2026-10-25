import type { BattleActor, BattleRound, BattleRulesProfile, BattleSnapshot } from '../battle/index.js';

export type CoordinateSystem = 'wgs84' | 'gcj02';
export type DiscoveryScenario = 'live' | 'qa' | 'demo';
export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'timeout' | 'unavailable' | 'imprecise' | 'stale' | 'demo' | 'privacy_disabled';
export type DiscoveryElement = 'water' | 'fire' | 'wood' | 'metal' | 'earth';
export interface GeoPoint { lat: number; lng: number }
export interface LocationFix extends GeoPoint { source: 'os' | 'demo' | 'simulated'; scenarioId?: string; accuracyMeters: number; timestampMs: number; coordinateSystem: 'wgs84'; provider: string; positionSource?: string }
export interface LocationState { mode: 'real' | 'demo'; status: LocationStatus; permission: 'unknown' | 'granted' | 'denied'; fix: LocationFix | null; watching: boolean; lastError: {code: string; message: string; systemStatus?: string; hresult?: string} | null }
export interface DiscoveryMap { id: string; name: string; coordinateSystem: CoordinateSystem; available: boolean; attribution: string; attributionUrl: string; maxZoom: number; providers: Array<{id: string; name: string; available: boolean}> }
export interface WildSpawn { id: string; templateId: string; name: string; element: DiscoveryElement; description: string; resourceId: string; wildSerial: string; position: GeoPoint; mapPosition?: GeoPoint; coordinateSystem: 'wgs84'; rarity: 'common' | 'rare' | 'epic'; placeLabel: string; placeLabelSource: 'game'; expiresAt: number; distanceMeters: number; source: 'game-spawn'; demo: boolean; inRange: boolean; captureState: string }
export interface DiscoveryPet { petId: string; name: string; element: DiscoveryElement; resource: {resourceId: string; kind: string}; level: number }
export type DiscoveryCombatant = BattleActor;
export interface WildBattle { battleId: string; petId: string; view: BattleSnapshot; rounds: Array<BattleRound & {action: string}>; rules: BattleRulesProfile; winner: 'player' | 'enemy' | null; finished: boolean; adapter: string }
export interface WildEncounter { encounterId: string; ownerAccountId: string; scenario?: DiscoveryScenario; spawn: WildSpawn; petId: string; battle: WildBattle; status: 'challenging' | 'won' | 'lost' | 'cancelled' | 'captured'; revision: number; createdAt: number; updatedAt: number; capturePetId?: string }
export interface DiscoveryMemory { id: string; kind: 'first_meeting'; title: string; text: string; placeLabel: string; createdAt: string }
export interface DiscoveryTerritory {territoryId: string; name: string; ownerAccountId: string | null; owned: boolean; boundary: GeoPoint[]; mapBoundary: GeoPoint[]; revision?: number; bonusMultiplier: number}
export interface DiscoveryCapture { scenarioId?: string; ownerAccountId: string; encounterId: string; scenario?: DiscoveryScenario; petId: string; actionId: string; name: string; templateId: string; resourceId?: string; element: DiscoveryElement; serial: string; capturedAtMs: number; placeLabel: string; memoryTags: DiscoveryMemory[]; showOnDesktop: boolean; validation: 'cloud' | 'local-os' | 'simulated'; distanceMeters: number }
export interface DiscoverySnapshot { scenario: DiscoveryScenario; location: LocationState; map: DiscoveryMap; mapLocation: GeoPoint | null; spawns: WildSpawn[]; territories: DiscoveryTerritory[]; territoriesAvailable: boolean; captureRadiusMeters: number; pets: DiscoveryPet[]; encounters: WildEncounter[]; captures: DiscoveryCapture[]; signedIn: boolean; storage: 'local' | 'cloud'; cloudConfigured: boolean; cloudStatus: 'disabled' | 'not_configured' | 'battle_adapter_missing' | 'ready' }
export type DiscoveryAction = 'normal_attack' | 'element_attack' | 'dodge' | 'ultimate';
