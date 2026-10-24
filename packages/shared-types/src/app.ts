/** Stable Lingjing feature boundary. Domain types live under features/<id>. */
export type FeatureId = "companions" | "discovery" | "battle" | "garden" | "conversations" | "resources" | "accounts";
export type AppResult<T = unknown> = { ok: true; data: T; revision?: number } | { ok: false; code: string; message: string };
export interface RequestContext {
  /** Derived in the main process from the verified session, never renderer input. */
  ownerAccountId: string;
  requestId: string;
}
export interface AppBridge {
  invoke<T = unknown>(feature: FeatureId | "app", command: string, payload?: unknown): Promise<AppResult<T>>;
  subscribe(event: string, listener: (data: unknown) => void): () => void;
  window: { minimize(): void; maximize(): void; close(): void };
}
