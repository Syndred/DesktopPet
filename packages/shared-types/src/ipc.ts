import type { FeatureId } from './app.js';
import type { AccountsSession, SettingsSnapshot, SettingsDocument, SyncStatus, BackupPreview } from './features/accounts/index.js';
import type { CompanionsClient, CompanionPet, CompanionMutation } from './features/companions/index.js';
import type { ResourcesClient } from './features/resources/index.js';
import type { BattleSession, BattleReport, BattleRulesProfile, DuelUser, DuelInvitation } from './features/battle/index.js';
import type { BattleActionType, ElementType } from './battle.js';
import type { GardenSnapshot, PlantInput, HarvestInput, CraftInput, FeedInput, GarrisonInput, ActionInput, TerritoryChallengeReceipt } from './features/garden/index.js';
import type { DiscoverySnapshot, WildEncounter, DiscoveryCapture, DiscoveryMemory } from './features/discovery/index.js';
import type { ConversationCommands } from './features/conversations/index.js';

export interface IpcMethod<Input, Output> { input: Input; output: Output }
type MethodOf<Function> = Function extends (...args: infer Args) => Promise<infer Result> ? IpcMethod<Args extends [] ? void : Args[0], Extract<Result, { ok: true }> extends { data: infer Data } ? Data : never> : never;
type ClientMethods<Client> = { [Key in keyof Client as Client[Key] extends (...args: never[]) => Promise<unknown> ? Key : never]: MethodOf<Client[Key]> };
type Action = { actionId: string; expectedRevision?: number };
type Session = { sessionId: string };
type AuthInput = { provider?: AccountsSession['defaultProvider']; account: string; password: string; rememberSession?: boolean };
export interface AppInfo {
  version: string; platform: string; features: Array<{ id: FeatureId; commands: string[] }>;
  runtime: { electron: string; node: string; modules: string; napi: string; arch: string; tray: { active: boolean; bounds?: { x: number; y: number; width: number; height: number } } };
  user: { id: string; account?: string; username?: string } | null;
  build?: { sourceCommit: string; codeFingerprint: string; compiledFingerprint: string; [key: string]: unknown };
  support?: { packaged: boolean; executablePath: string | null; logsPath: string; logsAvailable: boolean; automaticUpdates: false };
  scenario?: { id: string; provenance: 'simulated'; isolated: true };
}
export interface AccountsCommands {
  session: IpcMethod<void, AccountsSession>;
  login: IpcMethod<AuthInput, AccountsSession>;
  register: IpcMethod<AuthInput & { username: string; confirmPassword: string }, AccountsSession>;
  logout: IpcMethod<void, AccountsSession>;
  profileSave: IpcMethod<{ username: string; expectedRevision?: number }, unknown>;
  passwordChange: IpcMethod<{ currentPassword: string; password: string; confirmPassword: string }, unknown>;
  settingsGet: IpcMethod<void, SettingsSnapshot>;
  settingsDefaults: IpcMethod<void, SettingsDocument>;
  settingsSave: IpcMethod<{ document: SettingsDocument; expectedRevision: number }, SettingsSnapshot>;
  backupList: IpcMethod<void, unknown>;
  backupExport: IpcMethod<void, unknown>;
  backupPreview: IpcMethod<void, BackupPreview | null>;
  backupRestore: IpcMethod<{ previewId: string; mode: 'merge' | 'replace' }, unknown>;
  syncStatus: IpcMethod<void, SyncStatus>;
  syncNow: IpcMethod<Action, unknown>;
  syncRetry: IpcMethod<void, unknown>;
  cloudPreview: IpcMethod<void, BackupPreview | null>;
  testNotification: IpcMethod<void, unknown>;
  pointer: IpcMethod<{ petId?: string; windowId?: number; overOpaqueContent: boolean }, { applied: boolean }>;
}
export interface CompanionsCommands extends ClientMethods<CompanionsClient> {
  get: IpcMethod<{ petId: string }, CompanionPet>;
  desktopInput: IpcMethod<{ petId: string; action: 'hit' | 'miss' | 'drag-start' | 'drag-move' | 'drag-end'; screenX?: number; screenY?: number }, { petId: string }>;
  appearance: IpcMethod<Action & { petId: string; resourceId: string }, CompanionMutation>;
}
export interface ResourcesCommands extends Omit<ClientMethods<Required<ResourcesClient>>, 'importResource'> {
  import: MethodOf<ResourcesClient['importResource']>;
}
export interface BattleCommands {
  overview: IpcMethod<void, unknown>;
  rules: IpcMethod<void, BattleRulesProfile>;
  selectPet: IpcMethod<Action & { petId: string }, unknown>;
  startTraining: IpcMethod<Action & { petId: string; enemyElement: ElementType }, BattleSession>;
  snapshot: IpcMethod<Session, BattleSession>;
  act: IpcMethod<Session & Action & { action: BattleActionType; expectedRound: number }, BattleSession>;
  retryAction: IpcMethod<Session, BattleSession>;
  sync: IpcMethod<Session, BattleSession>;
  leave: IpcMethod<Session, BattleSession>;
  context: IpcMethod<Session, { returnTo: string; action?: 'capture' | 'territory'; settled?: boolean; resultPath?: string }>;
  settleContext: IpcMethod<Session & Action & { name?: string; showOnDesktop?: boolean }, unknown>;
  search: IpcMethod<{ keyword: string }, DuelUser[]>;
  invitations: IpcMethod<void, { inbound: DuelInvitation[]; outbound: DuelInvitation[] }>;
  invite: IpcMethod<{ targetAccount: string; petId: string }, unknown>;
  respondInvite: IpcMethod<{ requestId: string; decision: 'accept' | 'reject'; petId?: string }, { session: BattleSession | null }>;
  cancelInvite: IpcMethod<{ requestId: string }, unknown>;
  createRoom: IpcMethod<{ petId: string }, BattleSession>;
  joinRoom: IpcMethod<{ roomCode: string; petId: string; requestId?: string }, BattleSession>;
  listReports: IpcMethod<{ limit?: number } | undefined, BattleReport[]>;
  getReport: IpcMethod<{ reportId: string }, BattleReport>;
  retrySettlement: IpcMethod<Session, unknown>;
}
export interface GardenCommands {
  snapshot: IpcMethod<void, GardenSnapshot>;
  plant: IpcMethod<PlantInput, unknown>;
  harvest: IpcMethod<HarvestInput, unknown>;
  craft: IpcMethod<CraftInput, unknown>;
  feed: IpcMethod<FeedInput, unknown>;
  garrison: IpcMethod<GarrisonInput, unknown>;
  territoryLocate: IpcMethod<ActionInput, unknown>;
  territoryChallenge: IpcMethod<ActionInput & { territoryId: string; petId: string; expectedTerritoryRevision: number }, TerritoryChallengeReceipt>;
  territorySettle: IpcMethod<ActionInput & Session, unknown>;
}
export interface DiscoveryCommands {
  snapshot: IpcMethod<void, DiscoverySnapshot>;
  locate: IpcMethod<void, DiscoverySnapshot>;
  watch: IpcMethod<void, DiscoverySnapshot>;
  stopWatch: IpcMethod<void, DiscoverySnapshot>;
  setExploring: IpcMethod<{ active: boolean }, DiscoverySnapshot>;
  setDemo: IpcMethod<{ enabled: boolean }, DiscoverySnapshot>;
  setProvider: IpcMethod<{ providerId: string }, DiscoverySnapshot>;
  tile: IpcMethod<{ z: number; x: number; y: number }, unknown>;
  begin: IpcMethod<Action & { spawnId: string; petId: string }, WildEncounter>;
  act: IpcMethod<Action & { encounterId: string; action: BattleActionType }, WildEncounter>;
  cancel: IpcMethod<Action & { encounterId: string }, WildEncounter>;
  confirm: IpcMethod<Action & { encounterId: string; name?: string; showOnDesktop?: boolean }, DiscoveryCapture>;
  pokedex: IpcMethod<void, DiscoveryCapture[]>;
  memories: IpcMethod<{ petId?: string }, DiscoveryMemory[]>;
}
/** Domain owners may augment their command interface when a reviewed contract grows. */
export interface IpcCommands {
  app: { info: IpcMethod<void, AppInfo>; openLogs: IpcMethod<void, { opened: boolean }>; showExecutable: IpcMethod<void, { revealed: boolean }> };
  accounts: AccountsCommands;
  companions: CompanionsCommands;
  resources: ResourcesCommands;
  battle: BattleCommands;
  garden: GardenCommands;
  discovery: DiscoveryCommands;
  conversations: ConversationCommands;
}
export type IpcFeature = keyof IpcCommands;
export type IpcCommand<Feature extends IpcFeature> = Extract<keyof IpcCommands[Feature], string>;
export type IpcInput<Feature extends IpcFeature, Command extends IpcCommand<Feature>> = IpcCommands[Feature][Command] extends { input: infer Input } ? Input : never;
export type IpcOutput<Feature extends IpcFeature, Command extends IpcCommand<Feature>> = IpcCommands[Feature][Command] extends { output: infer Output } ? Output : never;
export type IpcArguments<Feature extends IpcFeature, Command extends IpcCommand<Feature>> = undefined extends IpcInput<Feature, Command> ? [payload?: IpcInput<Feature, Command>] : [payload: IpcInput<Feature, Command>];
