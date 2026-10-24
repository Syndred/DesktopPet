import { useEffect, useMemo, useState } from 'react';
import { AssistantRuntimeProvider, ComposerPrimitive, MessagePrimitive, ThreadPrimitive,
  useAuiState, useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react';
import { ArrowDown, RotateCcw, BookmarkPlus, Send, Square, Smile, Keyboard, Settings2 } from 'lucide-react';
import type { ConversationMessage, ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import { PetAvatar, ActionHint, InfoHint } from './components';
import { Button } from '../../components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { AnimatedList } from '../../components/motion';
import { CompanionPortrait } from '../companions/CompanionPortrait';
import { useFeatureRequest } from '../../app/bridge';
import type { SettingsSnapshot } from '../../../../../../packages/shared-types/src/features/accounts';

const errors: Record<string, string> = { CANCELLED: '已停止回复', INTERRUPTED: '上次回复因退出而中断', SESSION_CHANGED: '账号切换，回复已停止',
  TIMEOUT: '模型响应超时', INVALID_RESPONSE: '模型连接中断', RATE_LIMITED: '请求过于频繁', NETWORK_ERROR: '连接失败',
  PROVIDER_AUTH: '密钥验证失败', PROVIDER_REJECTED: '模型拒绝请求', PROVIDER_UNAVAILABLE: '模型服务暂时不可用' };
const convertMessage = (message: ConversationMessage): ThreadMessageLike => ({
  id: message.id, role: message.role, content: [{ type: 'text', text: message.content }], createdAt: new Date(message.createdAt),
  ...(message.role === 'assistant' ? { status: message.status === 'pending' || message.status === 'streaming' ? { type: 'running' as const } :
    message.status === 'complete' ? { type: 'complete' as const, reason: 'stop' as const } :
      { type: 'incomplete' as const, reason: message.status === 'cancelled' ? 'cancelled' as const : 'error' as const } } : {})
});

function CompanionReaction({ pet }: { pet: ConversationPet }) {
  const { data } = useFeatureRequest<SettingsSnapshot>('accounts', 'settingsGet');
  const [preference, setPreference] = useState<boolean | null>(null);
  useEffect(() => window.lingjing.subscribe('accounts:behavior', value => {
    const settings = (value as { settings?: SettingsSnapshot['document'] }).settings;
    if (settings) setPreference(settings.desktop.animationsEnabled !== false);
  }), []);
  if (pet.resource?.kind !== '2d') return null;
  return <div className="cv-companion-reaction" aria-label={`${pet.name}的陪伴动作`}>
    <CompanionPortrait petId={pet.petId} name={pet.name} resource={pet.resource} action="victory" animate={preference ?? data?.document.desktop.animationsEnabled === true}/>
  </div>;
}

function Composer({ pet, busy, insertEmoji }: { pet: ConversationPet; busy: boolean; insertEmoji: (emoji: string) => void }) {
  const length = useAuiState(state => state.composer.text.length);
  const [emojiOpen, setEmojiOpen] = useState(false);
  return <ComposerPrimitive.Root className="cv-composer">
    <Popover open={emojiOpen} onOpenChange={setEmojiOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" className="cv-icon cv-emoji-trigger" aria-label="选择表情"><Smile size={19}/></Button></PopoverTrigger>
      <PopoverContent className="cv-emoji-picker" side="top" align="start" aria-label="常用聊天表情">{['😊','💙','🌷','✨','🍚','☀️','🌙','🤗'].map(emoji =>
        <Button key={emoji} type="button" variant="ghost" onClick={() => { insertEmoji(emoji); setEmojiOpen(false); }}>{emoji}</Button>)}</PopoverContent></Popover>
    <label className="cv-sr-only" htmlFor="conversation-message">给{pet.name}发消息</label>
    <ComposerPrimitive.Input id="conversation-message" maxLength={8000} minRows={1} maxRows={4}
      placeholder={`和${pet.name}说点什么…`} aria-label={`给${pet.name}发消息`}/>
    {busy ? <ComposerPrimitive.Cancel asChild><Button variant="secondary" className="cv-button secondary" aria-label="停止回复" title="停止回复"><Square size={17} fill="currentColor"/></Button></ComposerPrimitive.Cancel> :
      <ComposerPrimitive.Send asChild><Button className="cv-button" aria-label="发送" title="发送"><Send size={18}/></Button></ComposerPrimitive.Send>}
    <span className="cv-composer-hint"><InfoHint label="发送快捷键" text="Enter 发送，Shift+Enter 换行。" icon={Keyboard}/>{length > 0 && <span>{length}/8000</span>}</span>
  </ComposerPrimitive.Root>;
}

function StoredMessage({ message, pet, last, retry, remember }: { message: ConversationMessage; pet: ConversationPet;
  last: boolean; retry: () => void; remember: () => void;
}) {
  const assistant = message.role === 'assistant';
  const pending = message.status === 'pending' || message.status === 'streaming';
  const failed = message.status === 'failed' || message.status === 'cancelled';
  return <MessagePrimitive.Root asChild><article className={`cv-message ${assistant ? 'assistant' : 'user'}`} aria-label={assistant ? `${pet.name}的回复` : '我的消息'}>
    {assistant && <PetAvatar pet={pet}/>}
    <div className="cv-message-body"><div className="cv-message-meta">{assistant ? pet.name : '我'}
      <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time></div>
      <div className={`cv-bubble ${failed ? 'interrupted' : ''}`}>
        {message.content ? <MessagePrimitive.Parts/> : pending ? <span className="cv-pending-text" role="status" aria-label="回复中">…</span> : '回复未完成'}
      </div>
      <div className="cv-message-actions">{failed && <span>{errors[message.errorCode ?? ''] || '回复失败，可检查连接后重试'}</span>}
        {failed && last && <ActionHint text="重新回复"><Button variant="ghost" className="cv-icon" aria-label="重新回复" onClick={retry}><RotateCcw size={14}/></Button></ActionHint>}
        {!pending && message.content && <ActionHint text="保存为记忆"><Button variant="ghost" className="cv-icon cv-remember-message" aria-label="记住这件事" onClick={remember}><BookmarkPlus size={14}/></Button></ActionHint>}
      </div>
    </div>
  </article></MessagePrimitive.Root>;
}

/** assistant-ui owns composer/IME handling, accessible messages and scroll state.
 * The external store remains the account + pet scoped SQLite/IPC domain. */
export function AssistantConversationThread({ pet, messages, busy, hasConnection, nextCursor, moreBusy, more, send, cancel, retry, remember }: {
  pet: ConversationPet; messages: ConversationMessage[]; busy: boolean; hasConnection: boolean; nextCursor?: number | null; moreBusy: boolean;
  more: () => void; send: (text: string) => Promise<boolean>; cancel: () => Promise<void>;
  retry: (actionId: string) => void; remember: (text: string) => void;
}) {
  const indexed = useMemo(() => new Map(messages.map(message => [message.id, message])), [messages]);
  const runtime = useExternalStoreRuntime<ConversationMessage>({ messages, convertMessage, isRunning: busy, isSendDisabled: !hasConnection,
    onNew: async message => {
      const text = message.content.filter(part => part.type === 'text').map(part => part.type === 'text' ? part.text : '').join('\n');
      const recorded = await send(text);
      if (!recorded) runtime.thread.composer.setText(text);
    }, onCancel: cancel });
  return <AssistantRuntimeProvider runtime={runtime}>
    <ThreadPrimitive.Root className="cv-thread-content" aria-label={`与${pet.name}的对话内容`}>
      <ThreadPrimitive.Viewport className="cv-message-list" role="log" aria-label="聊天记录" autoScroll turnAnchor="bottom">
        {nextCursor && <Button variant="ghost" className="cv-history-more cv-link" disabled={moreBusy} onClick={more}>{moreBusy ? '正在读取…' : '查看更早的消息'}</Button>}
        {!messages.length && <div className="cv-thread-empty"><PetAvatar pet={pet} large/><h3>暂无消息</h3>
          {!hasConnection && <a className="cv-link" href="#/settings/ai" aria-label="配置模型连接"><Settings2 size={14}/>设置连接</a>}</div>}
        <AnimatedList className="cv-thread-messages"><ThreadPrimitive.Messages>{({ message }) => {
          const stored = indexed.get(message.id);
          return stored ? <StoredMessage message={stored} pet={pet} last={message.id === messages.at(-1)?.id && !busy}
            retry={() => retry(stored.actionId)} remember={() => remember(stored.content.slice(0, 1000))}/> : null;
        }}</ThreadPrimitive.Messages></AnimatedList>
        {!busy && messages.at(-1)?.role === 'assistant' && messages.at(-1)?.status === 'complete' && <CompanionReaction pet={pet}/>}
      </ThreadPrimitive.Viewport>
      <ThreadPrimitive.ScrollToBottom asChild><Button variant="ghost" className="cv-scroll-bottom" aria-label="回到最新消息"><ArrowDown size={16}/></Button></ThreadPrimitive.ScrollToBottom>
      <Composer pet={pet} busy={busy} insertEmoji={emoji => runtime.thread.composer.setText(runtime.thread.composer.getState().text + emoji)}/>
    </ThreadPrimitive.Root>
  </AssistantRuntimeProvider>;
}
