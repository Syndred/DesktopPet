import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConversationClient, ConversationMemory, ConversationMessage, ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import { MemoryEditor, MemoryPanel, Modal, PetAvatar } from './components';
import { useConversations } from './use-conversations';

function time(value: number) { return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }); }
const errorText: Record<string, string> = { CANCELLED: '已停止回复', INTERRUPTED: '应用退出导致中断', SESSION_CHANGED: '账号切换，回复已停止',
  TIMEOUT: '模型响应超时', INVALID_RESPONSE: '模型连接中断', RATE_LIMITED: '请求过于频繁', NETWORK_ERROR: '连接失败',
  PROVIDER_AUTH: '密钥验证失败', PROVIDER_REJECTED: '模型拒绝请求', PROVIDER_UNAVAILABLE: '模型服务暂时不可用' };

function Message({ message, pet, last, retry, remember }: { message: ConversationMessage; pet: ConversationPet;
  last: boolean; retry: () => void; remember: () => void;
}) {
  const assistant = message.role === 'assistant';
  const pending = ['pending', 'streaming'].includes(message.status);
  const failed = ['failed', 'cancelled'].includes(message.status);
  return <article className={`cv-message ${assistant ? 'assistant' : 'user'}`} aria-label={assistant ? `${pet.name}的回复` : '我的消息'}>
    {assistant && <PetAvatar pet={pet}/>}
    <div className="cv-message-body"><div className="cv-message-meta">{assistant ? pet.name : '我'}<time dateTime={new Date(message.createdAt).toISOString()}>{time(message.createdAt)}</time></div>
      <div className={`cv-bubble ${failed ? 'interrupted' : ''}`}>{message.content || (pending ? '正在想怎么回复你…' : '未收到完整回复')}
        {pending && <span className="cv-typing" aria-hidden="true"> ▍</span>}</div>
      <div className="cv-message-actions">
        {failed && <span>{errorText[message.errorCode ?? ''] || '回复失败，可检查连接后重试'}</span>}
        {failed && last && <button className="cv-link" onClick={retry}>重新回复</button>}
        {!pending && message.content && <button className="cv-link" onClick={remember}>记住这件事</button>}
        {assistant && message.status === 'complete' && message.model && <span className="cv-model-label">{message.model}</span>}
      </div>
    </div>
  </article>;
}

export function ConversationsPage({ client, initialPetId }: { client?: ConversationClient; initialPetId?: string }) {
  const chat = useConversations(client, initialPetId);
  const [draftValue, setDraftValue] = useState({ scope: '', text: '' });
  const [editor, setEditor] = useState<{ scope: string; memory?: ConversationMemory; text?: string } | null>(null);
  const [clear, setClear] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [moreBusy, setMoreBusy] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const end = useRef<HTMLDivElement>(null);
  const data = chat.data;
  const scope = JSON.stringify([data?.accountId, data?.sessionRevision, data?.petId]);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const draft = draftValue.scope === scope ? draftValue.text : '';
  const pet = data?.pets.find(item => item.petId === data.petId);
  const messages = data?.messages ?? [];
  const busy = messages.some(message => ['pending', 'streaming'].includes(message.status));
  useEffect(() => { setEditor(null); setClear(null); setActionError(''); setAutoScroll(true); }, [scope]);
  const lastContent = messages.at(-1)?.content;
  useEffect(() => { if (autoScroll) end.current?.scrollIntoView({ block: 'end' }); }, [lastContent, messages.length, autoScroll]);
  async function cancel() {
    if (!pet) return;
    try { await chat.request('cancel', { petId: pet.petId }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : '停止失败。'); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const text = draft.trim(); setDraftValue({ scope, text: '' }); setAutoScroll(true);
    void chat.send(text).then(recorded => {
      if (!recorded && latestScope.current === scope) setDraftValue(current => ({ scope, text: current.scope === scope && current.text ? current.text : text }));
    });
  }
  if (!data) return <div className="cv-root"><header className="cv-page-header"><p>聊天 / 独立陪伴</p><h1>想说的话，我都在听。</h1></header>
    <section className="cv-card cv-empty" aria-live="polite"><span className="cv-empty-star">✧</span>
      <h2>{chat.loading ? '正在打开你们的小世界…' : '从一份陪伴开始'}</h2>
      <p>{chat.error || '请先登录，再选择一只伙伴聊天。'}</p>
      {!chat.loading && <><a className="cv-button" href="#/account">前往账号</a><button className="cv-button secondary" onClick={() => void chat.reload(undefined, true)}>重新读取</button></>}
    </section></div>;
  if (!pet || !data.profile) return <div className="cv-root"><section className="cv-card cv-empty"><h1>先认识一位伙伴吧。</h1><p>领养后，每只伙伴都会拥有独立的聊天与记忆。</p><a className="cv-button" href="#/companions">我的灵宠</a></section></div>;
  const profile = data.profile;
  const connection = profile.useOverride ? data.connection : data.globalConnection;
  return <div className="cv-root">
    <header className="cv-page-header"><p>聊天 / 与{pet.name}聊天</p><div><div><h1>想说的话，我都在听。</h1><p>和她聊聊天，分享日常，让每一天都更温暖。</p></div><a className="cv-button secondary" href="#/settings/ai">对话设置</a></div></header>
    {(chat.error || actionError) && <div role="alert" className="cv-error">{actionError || chat.error}</div>}
    <div className="cv-chat-grid">
      <aside className="cv-card cv-pet-list" aria-label="选择聊天伙伴">
        <h2>我的伙伴 <small>{data.pets.length}</small></h2>
        {data.pets.map(item => <button key={item.petId} className={`cv-pet-option ${item.petId === pet.petId ? 'selected' : ''}`}
          aria-pressed={item.petId === pet.petId} onClick={() => void chat.choose(item.petId)}>
          <PetAvatar pet={item}/><span><strong>{item.name}</strong><small>{data.summaries[item.petId]?.content?.slice(0, 28) || '开始属于你们的对话'}</small>
          <span className="cv-instance-id">实例 · {item.petId.slice(-8)}</span></span>
          {data.summaries[item.petId] && <time>{time(data.summaries[item.petId]!.createdAt)}</time>}
        </button>)}
        <p className="cv-caption">同样的形象，也有不同的小世界。</p>
      </aside>
      <section className="cv-card cv-thread" aria-label={`与${pet.name}的聊天`}>
        <header className="cv-thread-header"><PetAvatar pet={pet}/><div><h2>{pet.name}</h2>
          <p><span className={`cv-dot ${connection?.hasKey ? '' : 'offline'}`}/>{busy ? '正在认真听你说…' : connection?.hasKey ? 'AI 陪伴 · 已配置连接' : '请先设置模型连接'}</p></div>
          <button className="cv-icon" aria-label="清空当前伙伴聊天记录" onClick={() => setClear(scope)} disabled={busy || !messages.length}>⌫</button></header>
        <div className="cv-message-list" role="log" aria-label="聊天记录" onScroll={event => { const el = event.currentTarget; setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 100); }}>
          {data.nextCursor && <button className="cv-history-more cv-link" disabled={moreBusy} onClick={() => {
            setMoreBusy(true); setAutoScroll(false); void chat.more().catch(cause => setActionError(cause instanceof Error ? cause.message : '读取失败。')).finally(() => setMoreBusy(false));
          }}>{moreBusy ? '正在读取…' : '查看更早的消息'}</button>}
          {!messages.length && <div className="cv-thread-empty"><PetAvatar pet={pet} large/><h3>今天，有什么想和{pet.name}分享？</h3><p>你们的故事，从这一句话开始。</p>
            {!connection?.hasKey && <a className="cv-link" href="#/settings/ai">配置模型连接 →</a>}</div>}
          {messages.map((message, index) => <Message key={message.id} message={message} pet={pet} last={index === messages.length - 1 && !busy}
            retry={() => { setAutoScroll(true); void chat.send('', message.actionId); }} remember={() => setEditor({ scope, text: message.content.slice(0, 1000) })}/>)}
          <div ref={end}/>
        </div>
        <form className="cv-composer" onSubmit={submit}><label className="cv-sr-only" htmlFor="conversation-message">给{pet.name}发消息</label>
          <textarea id="conversation-message" maxLength={8000} rows={2} placeholder={`和${pet.name}说点什么…`} value={draft}
            onChange={event => setDraftValue({ scope, text: event.target.value })} onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!busy) event.currentTarget.form?.requestSubmit(); }
            }}/>
          {busy ? <button type="button" className="cv-button secondary" onClick={() => void cancel()}>停止回复</button> :
            <button className="cv-button" disabled={!draft.trim() || !connection?.hasKey}>发送</button>}
          <span className="cv-composer-hint">Enter 发送 · Shift+Enter 换行 <span>{draft.length}/8000</span></span>
        </form>
      </section>
      <aside className="cv-details">
        <section className="cv-card cv-pet-card"><div className="cv-portrait"><span className="cv-portrait-stars" aria-hidden="true">✧</span><PetAvatar pet={pet} large/></div>
          <div className="cv-section-heading"><h2>{pet.name} <span className="cv-level">Lv.{String(pet.level).padStart(2, '0')}</span></h2><a className="cv-link" href="#/settings/ai">人设设置 ›</a></div>
          <p className="cv-persona-preview">{profile.persona || '温柔真诚的陪伴，正在等待你们的故事。'}</p>
          <span className="cv-caption">独立实例 · {pet.petId.slice(-8)}</span>
        </section>
        <MemoryPanel key={`${data.accountId}:${pet.petId}`} pet={pet} memories={data.memories ?? []} enabled={profile.memoryEnabled}
          add={() => setEditor({ scope })} edit={memory => setEditor({ scope, memory })} remove={async memory => {
            await chat.request('memory.delete', { petId: pet.petId, id: memory.id, revision: memory.revision }); await chat.reload(pet.petId);
          }}/>
        <label className="cv-card cv-pause"><span>聊天时暂停散步<small>仅作用于当前伙伴</small></span><input type="checkbox" role="switch" checked={profile.pauseWhileChatting}
          onChange={event => { void chat.request('profile.save', { petId: pet.petId, profile: { ...profile, pauseWhileChatting: event.target.checked }, revision: profile.revision })
            .then(() => chat.reload(pet.petId)).catch(cause => setActionError(cause instanceof Error ? cause.message : '保存失败。')); }}/></label>
      </aside>
    </div>
    {editor?.scope === scope && <MemoryEditor key={scope} pet={pet} memory={editor.memory} initialText={editor.text} close={() => setEditor(null)}
      save={async content => { await chat.request('memory.save', { petId: pet.petId, memory: { content, ...(editor.memory ? { id: editor.memory.id, revision: editor.memory.revision } : {}) } }); await chat.reload(pet.petId); }}/>}
    {clear === scope && <Modal title={`清空与${pet.name}的聊天？`} close={() => setClear(null)}><p>只清空这只伙伴的聊天记录。人设和保存的记忆会继续保留。</p><footer>
      <button className="cv-button secondary" onClick={() => setClear(null)}>保留记录</button><button className="cv-button danger" onClick={() => {
        void chat.request('history.clear', { petId: pet.petId }).then(() => { setClear(null); return chat.reload(pet.petId); })
          .catch(cause => setActionError(cause instanceof Error ? cause.message : '清空失败。'));
      }}>确认清空</button></footer></Modal>}
  </div>;
}
