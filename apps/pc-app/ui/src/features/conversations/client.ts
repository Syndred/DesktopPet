import type { AppBridge } from '../../../../../../packages/shared-types/src/app';
import type { ConversationClient, ConversationCommands, ConversationEvent } from '../../../../../../packages/shared-types/src/features/conversations';

function bridge(): AppBridge | undefined { return (window as unknown as { lingjing?: AppBridge }).lingjing; }
export const desktopConversationClient: ConversationClient = {
  async invoke<K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input']) {
    const api = bridge();
    if (!api) return { ok: false, code: 'DESKTOP_REQUIRED', message: '请在灵境桌面应用中打开聊天。' };
    return api.invoke<ConversationCommands[K]['output']>('conversations', command, payload);
  },
  subscribe(listener) {
    return bridge()?.subscribe('conversations:changed', data => listener(data as ConversationEvent)) ?? (() => {});
  },
  onSessionChanged(listener) { return bridge()?.subscribe('conversations:session', listener) ?? (() => {}); }
};
