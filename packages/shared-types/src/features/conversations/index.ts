import type { AppResult } from '../../app.js';

export type Provider = 'deepseek' | 'openai' | 'openai_compatible';
export type ReplyStyle = 'natural' | 'warm' | 'playful' | 'detailed';
export interface ConversationProfile {
  persona: string; replyStyle: ReplyStyle; memoryEnabled: boolean;
  pauseWhileChatting: boolean; useOverride: boolean; revision: number;
}
export interface ConnectionSettings {
  provider: Provider; baseUrl: string; model: string; contextChars: number; maxOutputTokens: number;
}
export interface PublicConnection extends ConnectionSettings { hasKey: boolean; revision: number }
export interface ConversationPet {
  petId: string; name: string; templateId: string | null; avatarUrl: string | null; level: number;
  resource?: { resourceId: string; kind: '2d' | '3d' };
}
export type MessageStatus = 'complete' | 'pending' | 'streaming' | 'failed' | 'cancelled';
export interface ConversationMessage {
  id: string; sequence: number; actionId: string; petId: string; role: 'user' | 'assistant';
  content: string; status: MessageStatus; errorCode: string | null; provider: string | null;
  model: string | null; attempt: number; createdAt: number; updatedAt: number;
}
export interface ConversationMemory { id: string; petId: string; content: string; revision: number; createdAt: number; updatedAt: number }
export interface HistoryPage { messages: ConversationMessage[]; nextCursor: number | null }
export interface ConversationSnapshot {
  accountId: string; sessionRevision: number; pets: ConversationPet[]; petId: string | null;
  summaries: Record<string, { content: string; status: MessageStatus; createdAt: number } | null>;
  globalConnection: PublicConnection | null; secureStorageAvailable: boolean;
  profile?: ConversationProfile; connection?: PublicConnection | null; memories?: ConversationMemory[];
  messages?: ConversationMessage[]; nextCursor?: number | null;
}
export interface ConnectionTest { provider: Provider; model: string; elapsedMs: number; receivedText: true; testedAt: number }
export interface ConversationEvent {
  type: 'reply' | 'changed'; accountId: string; petId: string | null;
  actionId?: string; content?: string; status?: MessageStatus; errorCode?: string;
}
export interface ConversationCommands {
  snapshot: { input: { petId?: string }; output: ConversationSnapshot };
  select: { input: { petId: string }; output: ConversationSnapshot };
  history: { input: { petId: string; before?: number }; output: HistoryPage };
  'profile.save': { input: { petId: string; profile: Omit<ConversationProfile, 'revision'>; revision: number }; output: ConversationProfile };
  'connection.save': { input: { petId: string | null; connection: ConnectionSettings; apiKey?: string; clearKey?: boolean; revision: number }; output: PublicConnection };
  'connection.test': { input: { petId: string | null }; output: ConnectionTest };
  'connection.cancel': { input: { petId: string | null }; output: { cancelled: true } };
  'memory.save': { input: { petId: string; memory: { id?: string; content: string; revision?: number } }; output: ConversationMemory[] };
  'memory.delete': { input: { petId: string; id: string; revision: number }; output: ConversationMemory[] };
  send: { input: { petId: string; actionId: string; text: string }; output: { messages: ConversationMessage[]; duplicate?: boolean } };
  retry: { input: { petId: string; actionId: string }; output: { messages: ConversationMessage[] } };
  cancel: { input: { petId: string | null }; output: { cancelled: true } };
  'history.clear': { input: { petId: string }; output: { cleared: true } };
}
export interface ConversationClient {
  invoke<K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input'] & {
    /** Freshness preconditions, never used to authorize or select an owner. */
    expectedAccountId?: string; expectedSessionRevision?: number;
  }): Promise<AppResult<ConversationCommands[K]['output']>>;
  subscribe(listener: (event: ConversationEvent) => void): () => void;
  onSessionChanged(listener: () => void): () => void;
}
