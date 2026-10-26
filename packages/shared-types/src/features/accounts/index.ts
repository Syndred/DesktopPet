export interface AccountUser {
  id: string;
  subjectId: string;
  ownerAccountId: string;
  provider: "local" | "runtime";
  dataMode?: "live" | "simulated";
  authKind?: 'supabase';
  authUserId?: string;
  account: string;
  username: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface SettingsDocument {
  desktop: {
    alwaysOnTop: boolean; clickThrough: boolean; launchAtLogin: boolean; closeToTray: boolean;
    companionLimit: number; interactionSounds: boolean; volume: number; hideInFullscreen: boolean; animationsEnabled: boolean;
  };
  notifications: {
    enabled: boolean; companions: boolean; battles: boolean; garden: boolean;
    quietEnabled: boolean; quietStart: string; quietEnd: string;
  };
  privacy: { locationAllowed: boolean; locationOnlyWhileExploring: boolean; emotionStatistics: boolean };
  sync: { enabled: boolean };
}
export interface AccountsSession {
  dataMode?: "live" | "simulated";
  scenario?: { id: "unified-battle"; runId: string; provenance: "simulated"; isolated: true } | null;
  currentUser: AccountUser | null;
  defaultProvider: "local" | "runtime";
  secureStorageAvailable: boolean;
  persistence: "none" | "memory" | "secure";
  startupIssue: string | null;
  migration: { status: string; imported: number; unresolved: Array<{ legacyId?: string; reason: string }> };
}
export interface DesktopHostStatus {
  ownerAccountId?: string | null;
  startup: boolean; fullscreenMonitor: boolean; foregroundFullscreen: boolean;
  fullscreenMonitorReady: boolean; fullscreenSource: "win32" | "electron" | null;
  companionWindows: number; clickThroughWindows: number[];
  /** Runtime policy only; companionWindows remains the diagnostic created-window count. */
  companionLimit?: number | null;
  windows: Array<{ id: number; alwaysOnTop: boolean; visible: boolean; slotAllocated?: boolean | null; hiddenReason?: 'limit' | 'fullscreen' | null }>;
  locationAllowed: boolean; emotionStatistics: boolean;
  closeToTrayConnected: boolean; companionLimitConnected: boolean;
}
export interface SettingsSnapshot {
  document: SettingsDocument; revision: number; updatedAt: string; host?: DesktopHostStatus;
}
export interface SyncStatus {
  mode?: 'cloud-authority';
  status?: 'waiting' | 'ready' | 'partial' | 'offline' | 'blocked';
  recordsInitialized?: boolean;
  domains?: Array<{ domain: string; revision: number; verifiedAt: string }>;
  domainStates?: Array<{ domain: string; status: string; error: string | null; category?: string | null; pending?: number }>;
  preservedLocalRecords?: number;
  configured: boolean; cloudRevision: number; lastVerifiedAt: string | null;
  lastError: string | null; pending: number; conflicts: number; localChanged: boolean; running: boolean;
  unverifiedLocal?: number;
  privacyRedactions?: number;
  observedCloudRevision?: number | null;
  lastCloudCheckedAt?: string | null;
  remoteChanged?: boolean;
}
export interface BackupPreview {
  previewId: string; checksum: string; currentChecksum?: string; cloudRevision?: number;
  createdAt: string; modules: string[]; tables: Array<{ name: string; count: number }>; excluded?: string[];
}
/** Main-process adapters are synchronous and run inside the common SQLite transaction. */
export interface AccountBackupAdapter<Database = unknown, Data = unknown> {
  id: string; version: number; tables?: string[];
  /** Conversion is a verified restore/fingerprint view; never rewrites the source envelope. */
  legacyTables?: string[];
  fromLegacyTables?(tables: Record<string, { schema: unknown[]; rows: Array<Record<string, unknown>> }>, ownerAccountId: string): Data | null;
  export(ownerAccountId: string, db: Database): Data;
  validate(data: Data, ownerAccountId: string, db: Database): void;
  restore(ownerAccountId: string, data: Data, mode: "merge" | "replace", db: Database): void;
}
