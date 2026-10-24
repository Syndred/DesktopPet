import { useState } from 'react';
import type { ConnectionSettings, ConversationClient, ConversationCommands, ConversationMemory, ConversationPet, ConversationProfile, PublicConnection } from '../../../../../../packages/shared-types/src/features/conversations';
import { MemoryEditor, MemoryPanel, PetAvatar } from './components';
import { useConversations } from './use-conversations';

type Request = <K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input']) => Promise<ConversationCommands[K]['output']>;
const blank: ConnectionSettings = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: '', contextChars: 24000, maxOutputTokens: 512 };

function ConnectionForm({ connection, petId, label, secure, request, refresh }: {
  connection: PublicConnection | null; petId: string | null; label: string; secure: boolean; request: Request; refresh: () => Promise<void>;
}) {
  const initial: ConnectionSettings = connection ? { provider: connection.provider, baseUrl: connection.baseUrl, model: connection.model,
    contextChars: connection.contextChars, maxOutputTokens: connection.maxOutputTokens } : blank;
  const [form, setForm] = useState<ConnectionSettings>(initial);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dirty = JSON.stringify(initial) !== JSON.stringify(form) || Boolean(apiKey) || clearKey;
  const change = (value: Partial<ConnectionSettings>) => { setForm(current => ({ ...current, ...value })); setNotice(''); setError(''); };
  return <section className="cv-card cv-connection"><h2>{label}</h2><p className="cv-muted">保存后测试连接，仅发送一条简短测试消息。</p>
    <form autoComplete="off" onSubmit={event => { event.preventDefault(); setBusy('save'); setError(''); setNotice('');
      void request('connection.save', { petId, connection: form, revision: connection?.revision ?? 0, apiKey, clearKey })
        .then(() => { setApiKey(''); setClearKey(false); setNotice('连接已保存。'); return refresh(); })
        .catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(null)); }}>
      <label className="cv-field">服务提供商<select value={form.provider} onChange={event => {
        const provider = event.target.value as ConnectionSettings['provider'];
        change({ provider, baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'deepseek' ? 'https://api.deepseek.com/v1' : '', model: '' });
        setApiKey(''); setClearKey(false);
      }}><option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option><option value="openai_compatible">OpenAI 兼容 / 本机服务</option></select></label>
      <label className="cv-field">API Key<input type="password" autoComplete="new-password" spellCheck={false} value={apiKey} maxLength={4096} disabled={!secure || busy !== null}
        placeholder={connection?.hasKey ? '已安全保存；留空保留密钥' : '填写此连接的 API Key'} onChange={event => { setApiKey(event.target.value); setNotice(''); setClearKey(false); }}/></label>
      <p className="cv-caption">密钥通过主进程加密保存，界面不会读取已保存的密钥。</p>
      {connection?.hasKey && <label className="cv-check"><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); setApiKey(''); setNotice(''); }}/>保存时移除此连接的密钥</label>}
      <label className="cv-field">接口地址<input type="url" value={form.baseUrl} maxLength={512} required placeholder="https://服务地址/v1" onChange={event => change({ baseUrl: event.target.value })}/></label>
      <label className="cv-field">模型<input value={form.model} maxLength={200} required placeholder="填写服务支持的模型 ID" onChange={event => change({ model: event.target.value })}/></label>
      <details className="cv-advanced"><summary>回复与上下文</summary><div className="cv-form-row">
        <label className="cv-field">上下文字符上限<select value={form.contextChars} onChange={event => change({ contextChars: Number(event.target.value) })}>
          <option value={12000}>12,000 字符</option><option value={24000}>24,000 字符</option><option value={48000}>48,000 字符</option></select></label>
        <label className="cv-field">回复 Token 上限<input type="number" min={64} max={4096} value={form.maxOutputTokens} onChange={event => change({ maxOutputTokens: Number(event.target.value) })}/></label>
      </div><p className="cv-caption">较早消息超出上限后不随请求发送，历史记录仍保留在本机。</p></details>
      {!secure && <p className="cv-error" role="alert">系统安全存储不可用，请恢复系统存储后再填写密钥。</p>}
      {error && <p className="cv-error" role="alert">{error}</p>}
      {notice && <p className="cv-success" role="status">{notice}</p>}
      <div className="cv-form-actions"><button type="button" className="cv-button secondary" disabled={busy !== null || dirty || !connection?.hasKey} onClick={() => {
        setBusy('test'); setError(''); setNotice('正在等待模型返回文本…');
        void request('connection.test', { petId }).then(result => setNotice(`连接可用 · ${result.model} · ${(result.elapsedMs / 1000).toFixed(1)} 秒`))
          .catch(cause => { setNotice(''); setError(cause instanceof Error ? cause.message : '测试失败。'); }).finally(() => setBusy(null));
      }}>{busy === 'test' ? '正在测试…' : dirty ? '保存后可测试' : '测试连接'}</button>
      <button className="cv-button" disabled={busy !== null || !form.model.trim() || !form.baseUrl.trim()}>{busy === 'save' ? '正在保存…' : '保存连接'}</button></div>
      {busy === 'test' && <button type="button" className="cv-link" onClick={() => { void request('connection.cancel', { petId }).catch(cause => setError(cause instanceof Error ? cause.message : '停止测试失败。')); }}>停止测试</button>}
    </form>
  </section>;
}

function PersonaForm({ pet, profile, request, refresh }: { pet: ConversationPet; profile: ConversationProfile; request: Request; refresh: () => Promise<void> }) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  return <section className="cv-card cv-persona"><div className="cv-section-heading"><h2>{pet.name}的对话设置</h2><span className="cv-level">仅当前实例</span></div>
    <div className="cv-persona-header"><PetAvatar pet={pet} large/><div><strong>{pet.name}</strong><p>实例 · {pet.petId.slice(-8)}</p><a className="cv-link" href="#/chat">回到聊天 ›</a></div></div>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError('');
      void request('profile.save', { petId: pet.petId, profile: form, revision: profile.revision })
        .then(() => { setSaved(true); return refresh(); }).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(false)); }}>
      <label className="cv-field">性格设定 <span className="cv-caption">只对{pet.name}生效</span>
        <textarea rows={6} maxLength={2000} placeholder="温柔、爱撒娇，喜欢和你待在一起。用你希望的方式，描述这只伙伴。" value={form.persona}
          onChange={event => { setForm(current => ({ ...current, persona: event.target.value })); setSaved(false); }}/></label>
      <div className="cv-counter">{form.persona.length}/2000</div>
      <label className="cv-field">回复风格<select value={form.replyStyle} onChange={event => { setForm(current => ({ ...current, replyStyle: event.target.value as ConversationProfile['replyStyle'] })); setSaved(false); }}>
        <option value="natural">简短、自然</option><option value="warm">温柔、细腻</option><option value="playful">活泼、俏皮</option><option value="detailed">清晰、充分</option></select></label>
      <label className="cv-toggle-row"><span>启用记忆<small>在回复中使用你为她保存的小事</small></span><input type="checkbox" role="switch" checked={form.memoryEnabled}
        onChange={event => { setForm(current => ({ ...current, memoryEnabled: event.target.checked })); setSaved(false); }}/></label>
      <label className="cv-toggle-row"><span>使用独立连接<small>关闭时沿用本账号的全局连接</small></span><input type="checkbox" role="switch" checked={form.useOverride}
        onChange={event => { setForm(current => ({ ...current, useOverride: event.target.checked })); setSaved(false); }}/></label>
      <label className="cv-toggle-row"><span>聊天时暂停散步<small>只暂停正在对话的伙伴</small></span><input type="checkbox" role="switch" checked={form.pauseWhileChatting}
        onChange={event => { setForm(current => ({ ...current, pauseWhileChatting: event.target.checked })); setSaved(false); }}/></label>
      {error && <p className="cv-error" role="alert">{error}</p>}{saved && <p className="cv-success" role="status">人设已保存。</p>}
      <button className="cv-button" disabled={busy}>{busy ? '正在保存…' : '保存伙伴人设'}</button>
    </form>
  </section>;
}

export function ConversationSettingsPage({ client }: { client?: ConversationClient }) {
  const chat = useConversations(client);
  const [tab, setTab] = useState<'global' | 'pet'>('global');
  const [editor, setEditor] = useState<{ scope: string; memory?: ConversationMemory } | null>(null);
  const data = chat.data;
  const scope = JSON.stringify([data?.accountId, data?.sessionRevision, data?.petId]);
  const pet = data?.pets.find(item => item.petId === data.petId);
  if (!data) return <div className="cv-root"><header className="cv-page-header"><h1>给每位伙伴，不同的声音与性格。</h1></header><section className="cv-card cv-empty">
    <p role={chat.error ? 'alert' : 'status'}>{chat.loading ? '正在读取设置…' : chat.error || '请先登录账号。'}</p><a className="cv-button" href="#/account">前往账号</a></section></div>;
  const refresh = () => chat.reload(data.petId ?? undefined);
  return <div className="cv-root"><header className="cv-page-header"><p>设置 / AI 对话</p><div><div><h1>给每位伙伴，不同的声音与性格。</h1>
    <p>选择合适的对话服务，并为每位伙伴设定独特的性格与回应方式。</p></div><a className="cv-button secondary" href="#/chat">回到聊天</a></div></header>
    {chat.error && <p className="cv-error" role="alert">{chat.error}</p>}
    <div className="cv-settings-grid"><div className="cv-settings-main"><div className="cv-tabs" role="tablist" aria-label="AI 设置范围">
      <button role="tab" aria-selected={tab === 'global'} aria-controls="cv-connection-panel" className={tab === 'global' ? 'active' : ''} onClick={() => setTab('global')}>全局连接</button>
      <button role="tab" aria-selected={tab === 'pet'} aria-controls="cv-connection-panel" className={tab === 'pet' ? 'active' : ''} onClick={() => setTab('pet')} disabled={!pet}>伙伴独立连接</button></div>
      <div id="cv-connection-panel" role="tabpanel">
        {tab === 'global' ? <ConnectionForm key={`${data.accountId}:global:${data.globalConnection?.revision ?? 0}`} connection={data.globalConnection} petId={null} label="对话服务设置"
          secure={data.secureStorageAvailable} request={chat.request} refresh={refresh}/> : pet && <>
          <p className="cv-note">为{pet.name}单独保存连接后，在右侧开启“使用独立连接”。独立连接需要自己的密钥。</p>
          <ConnectionForm key={`${data.accountId}:${pet.petId}:${data.connection?.revision ?? 0}`} connection={data.connection ?? null} petId={pet.petId} label={`${pet.name}的独立连接`}
            secure={data.secureStorageAvailable} request={chat.request} refresh={refresh}/></>}
      </div>
      <section className="cv-card cv-partners"><h2>选择设置的伙伴 <small>{pet?.name || '暂无伙伴'}</small></h2><div>
        {data.pets.map(item => <button className={item.petId === pet?.petId ? 'selected' : ''} key={item.petId} aria-pressed={item.petId === pet?.petId}
          onClick={() => { setEditor(null); void chat.choose(item.petId); }}><PetAvatar pet={item}/><strong>{item.name}</strong><small>实例 · {item.petId.slice(-8)}</small></button>)}
      </div><p className="cv-caption">全局连接属于当前账号。伙伴人设、独立连接和记忆分别保存。</p></section>
    </div>
    <aside className="cv-settings-side">{pet && data.profile ? <>
      <PersonaForm key={`${data.accountId}:${pet.petId}:${data.profile.revision}`} pet={pet} profile={data.profile} request={chat.request} refresh={refresh}/>
      <MemoryPanel key={`${data.accountId}:${pet.petId}`} pet={pet} memories={data.memories ?? []} enabled={data.profile.memoryEnabled}
        add={() => setEditor({ scope })} edit={memory => setEditor({ scope, memory })} remove={async memory => { await chat.request('memory.delete', { petId: pet.petId, id: memory.id, revision: memory.revision }); await refresh(); }}/>
    </> : <section className="cv-card cv-empty"><h2>还没有伙伴</h2><a href="#/companions" className="cv-link">先领养一只灵宠 →</a></section>}</aside></div>
    {editor?.scope === scope && pet && <MemoryEditor key={scope} pet={pet} memory={editor.memory} close={() => setEditor(null)}
      save={async content => { await chat.request('memory.save', { petId: pet.petId, memory: { content, ...(editor.memory ? { id: editor.memory.id, revision: editor.memory.revision } : {}) } }); await refresh(); }}/>}
  </div>;
}
