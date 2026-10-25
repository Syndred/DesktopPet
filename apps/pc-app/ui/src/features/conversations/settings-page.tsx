import { useState } from 'react';
import type { ConnectionSettings, ConversationClient, ConversationCommands, ConversationMemory, ConversationPet, ConversationProfile, PublicConnection } from '../../../../../../packages/shared-types/src/features/conversations';
import { MemoryEditor, MemoryPanel, PetAvatar, PetScene, PetElement, petElementLabel, FormSelect, InfoHint, ActionHint } from './components';
import { Monitor, Bell, MessageCircle, Box, UserRound, ChevronLeft, ShieldCheck, PlugZap, Save, Square, History } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { useConversations } from './use-conversations';
import { LegacyImportDialog } from './legacy-import';

type Request = <K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input']) => Promise<ConversationCommands[K]['output']>;
const blank: ConnectionSettings = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', model: '', contextChars: 24000, maxOutputTokens: 512 };

function ConnectionForm({ connection, petId, label, secure, request, refresh, scope }: {
  connection: PublicConnection | null; petId: string | null; label: string; secure: boolean; request: Request; refresh: () => Promise<void>;
  scope?: { enabled: boolean; hint: string };
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
  const endpointChanged = connection && (form.provider !== connection.provider || form.baseUrl.replace(/\/+$/, '') !== connection.baseUrl.replace(/\/+$/, ''));
  const testHint = busy === 'test' ? '测试中，可停止本次测试。' : busy === 'save' ? '保存中。' : dirty ? '请先保存修改。' : !connection?.hasKey ? '请先填写并保存密钥。' : '测试会向所选模型发送一条简短消息。';
  const change = (value: Partial<ConnectionSettings>) => { setForm(current => ({ ...current, ...value })); setNotice(''); setError(''); };
  return <section className="cv-card cv-connection"><div className="cv-section-heading"><h2>{label}</h2><div className="cv-card-tools">
    {scope && <ActionHint text={scope.hint}><span className="cv-scope-state" tabIndex={0}>{scope.enabled ? '已启用' : '未启用'}</span></ActionHint>}
    <InfoHint label="连接提示" text={scope?.hint || '本账号默认使用这组连接。测试会发送一条简短消息。'}/>
  </div></div>
    <form autoComplete="off" onSubmit={event => { event.preventDefault(); setBusy('save'); setError(''); setNotice('');
      void request('connection.save', { petId, connection: form, revision: connection?.revision ?? 0, apiKey, clearKey })
        .then(() => { setApiKey(''); setClearKey(false); setNotice('连接已保存。'); return refresh(); })
        .catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(null)); }}>
      <label className="cv-field">提供商<FormSelect label="服务提供商" value={form.provider} options={[{ value: 'deepseek', label: 'DeepSeek' }, { value: 'openai', label: 'OpenAI' }, { value: 'openai_compatible', label: 'OpenAI 兼容' }]} onValueChange={value => {
        const provider = value as ConnectionSettings['provider'];
        change({ provider, baseUrl: provider === 'openai' ? 'https://api.openai.com/v1' : provider === 'deepseek' ? 'https://api.deepseek.com/v1' : '', model: '' });
        setApiKey(''); setClearKey(false);
      }}/></label>
      <div className="cv-secret-field"><label className="cv-field">API Key<Input type="password" autoComplete="new-password" spellCheck={false} value={apiKey} maxLength={4096} disabled={!secure || busy !== null}
        placeholder={endpointChanged ? '请重新填写密钥' : connection?.hasKey ? '已保存；留空保留' : '填写密钥'} onChange={event => { setApiKey(event.target.value); setNotice(''); setClearKey(false); }}/></label>
        <InfoHint label="密钥提示" icon={ShieldCheck} text="密钥加密保存在本机。留空保留；更换服务或地址后需重新填写。"/>
      </div>
      {connection?.hasKey && <label className="cv-check"><Checkbox aria-label="保存时移除此连接的密钥" checked={clearKey} onCheckedChange={checked => { setClearKey(checked === true); setApiKey(''); setNotice(''); }}/>移除密钥</label>}
      <label className="cv-field">接口地址<Input type="url" value={form.baseUrl} maxLength={512} required placeholder="https://服务地址/v1" onChange={event => change({ baseUrl: event.target.value })}/></label>
      <label className="cv-field">模型<Input value={form.model} maxLength={200} required placeholder="模型 ID" onChange={event => change({ model: event.target.value })}/></label>
      <details className="cv-advanced"><summary>高级</summary><div className="cv-advanced-heading"><InfoHint label="上下文提示" text="超出上限的较早消息不随本次请求发送，聊天历史仍保留。"/></div><div className="cv-form-row">
        <label className="cv-field">上下文上限<FormSelect label="上下文字符上限" value={String(form.contextChars)} onValueChange={value => change({ contextChars: Number(value) })}
          options={[{ value: '12000', label: '12,000 字符' }, { value: '24000', label: '24,000 字符' }, { value: '48000', label: '48,000 字符' }]}/></label>
        <label className="cv-field">回复 Token<Input aria-label="回复 Token 上限" type="number" min={64} max={4096} value={form.maxOutputTokens} onChange={event => change({ maxOutputTokens: Number(event.target.value) })}/></label>
      </div></details>
      {!secure && <p className="cv-error" role="alert">安全存储不可用，暂不能填写密钥。</p>}
      {error && <p className="cv-error" role="alert">{error}</p>}
      {notice && <p className="cv-success" role="status">{notice}</p>}
      <div className="cv-form-actions"><ActionHint text={testHint}><Button type="button" className="cv-button secondary" aria-label="测试连接" disabled={busy !== null || dirty || !connection?.hasKey} onClick={() => {
        setBusy('test'); setError(''); setNotice('');
        void request('connection.test', { petId }).then(result => setNotice(`可用 · ${(result.elapsedMs / 1000).toFixed(1)} 秒`))
          .catch(cause => { setNotice(''); setError(cause instanceof Error ? cause.message : '测试失败。'); }).finally(() => setBusy(null));
      }}><PlugZap size={16}/>{busy === 'test' ? '测试中' : '测试'}</Button></ActionHint>
      <Button className="cv-button" aria-label="保存连接" disabled={busy !== null || !form.model.trim() || !form.baseUrl.trim()}><Save size={16}/>{busy === 'save' ? '保存中' : '保存'}</Button></div>
      {busy === 'test' && <ActionHint text="停止测试"><Button type="button" className="cv-icon" aria-label="停止测试" onClick={() => { void request('connection.cancel', { petId }).catch(cause => setError(cause instanceof Error ? cause.message : '停止测试失败。')); }}><Square size={15}/></Button></ActionHint>}
    </form>
  </section>;
}

function PersonaForm({ pet, profile, request, refresh }: { pet: ConversationPet; profile: ConversationProfile; request: Request; refresh: () => Promise<void> }) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  return <section className="cv-card cv-persona"><div className="cv-section-heading"><h2>{pet.name}<PetElement pet={pet}/></h2><InfoHint label="伙伴设置提示" text="人设、记忆和独立连接只应用于这位伙伴。"/></div>
    <PetScene pet={pet}/>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError('');
      void request('profile.save', { petId: pet.petId, profile: form, revision: profile.revision })
        .then(() => { setSaved(true); return refresh(); }).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(false)); }}>
      <label className="cv-field">性格
        <Textarea aria-label="性格设定" rows={4} maxLength={2000} placeholder="例如：温柔、简短、爱分享。" value={form.persona}
          onChange={event => { setForm(current => ({ ...current, persona: event.target.value })); setSaved(false); }}/></label>
      <div className="cv-counter">{form.persona.length}/2000</div>
      <label className="cv-field">回复风格<FormSelect label="回复风格" value={form.replyStyle}
        options={[{ value: 'natural', label: '简短、自然' }, { value: 'warm', label: '温柔、细腻' }, { value: 'playful', label: '活泼、俏皮' }, { value: 'detailed', label: '清晰、充分' }]}
        onValueChange={value => { setForm(current => ({ ...current, replyStyle: value as ConversationProfile['replyStyle'] })); setSaved(false); }}/></label>
      <div className="cv-toggle-row"><label htmlFor={`memory-${pet.petId}`}>使用记忆</label><InfoHint label="记忆开关提示" text="关闭后暂停用于回复，已保存的记忆仍保留。"/><Switch id={`memory-${pet.petId}`} aria-label="启用记忆" checked={form.memoryEnabled}
        onCheckedChange={checked => { setForm(current => ({ ...current, memoryEnabled: checked })); setSaved(false); }}/></div>
      <div className="cv-toggle-row"><label htmlFor={`override-${pet.petId}`}>独立连接</label><InfoHint label="独立连接提示" text="开启后使用这位伙伴自己的连接和密钥；关闭时沿用全局连接。"/><Switch id={`override-${pet.petId}`} aria-label="使用独立连接" checked={form.useOverride}
        onCheckedChange={checked => { setForm(current => ({ ...current, useOverride: checked })); setSaved(false); }}/></div>
      <div className="cv-toggle-row"><label htmlFor={`pause-${pet.petId}`}>回复时暂停散步</label><InfoHint label="暂停散步提示" text="仅在这位伙伴回复期间暂停散步。"/><Switch id={`pause-${pet.petId}`} aria-label="聊天时暂停散步" checked={form.pauseWhileChatting}
        onCheckedChange={checked => { setForm(current => ({ ...current, pauseWhileChatting: checked })); setSaved(false); }}/></div>
      {error && <p className="cv-error" role="alert">{error}</p>}{saved && <p className="cv-success" role="status">已保存</p>}
      <Button className="cv-button" aria-label="保存伙伴人设" disabled={busy}><Save size={16}/>{busy ? '保存中' : '保存'}</Button>
    </form>
  </section>;
}

function SettingsNavigation() {
  const links = [{ href: '/settings', title: '桌面与行为', icon: Monitor }, { href: '/settings', title: '通知与隐私', icon: Bell },
    { href: '/settings/ai', title: 'AI 对话', icon: MessageCircle }, { href: '/resources', title: '角色资源', icon: Box }, { href: '/account', title: '账号与同步', icon: UserRound }];
  return <nav className="cv-settings-nav" aria-label="设置分类">{links.map(link => <a key={link.title} href={`#${link.href}`} className={link.href === '/settings/ai' ? 'selected' : ''}
    aria-current={link.href === '/settings/ai' ? 'page' : undefined}><link.icon size={18}/><span>{link.title}</span></a>)}</nav>;
}

export function ConversationSettingsPage({ client }: { client?: ConversationClient }) {
  const chat = useConversations(client);
  const [tab, setTab] = useState<'global' | 'pet'>('global');
  const [editor, setEditor] = useState<{ scope: string; memory?: ConversationMemory } | null>(null);
  const [legacyScope, setLegacyScope] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<{scope: string; text: string} | null>(null);
  const data = chat.data;
  const scope = JSON.stringify([data?.accountId, data?.sessionRevision, data?.petId]);
  const pet = data?.pets.find(item => item.petId === data.petId);
  if (!data) return <div className="cv-root"><header className="cv-page-header"><h1>AI 对话</h1></header><section className="cv-card cv-empty">
    <p role={chat.error ? 'alert' : 'status'}>{chat.loading ? '正在读取设置…' : chat.error || '请先登录账号。'}</p><a className="cv-button" href="#/account">前往账号</a></section></div>;
  const refresh = () => chat.reload(data.petId ?? undefined);
  return <div className="cv-root cv-ai-settings"><SettingsNavigation/><div className="cv-settings-content"><header className="cv-page-header"><p>设置 / AI 对话</p><div><div><h1>AI 对话</h1></div><ActionHint text="回到聊天"><a className="cv-icon cv-settings-shortcut" href="#/chat" aria-label="回到聊天"><ChevronLeft size={18}/></a></ActionHint></div></header>
    {chat.error && <p className="cv-error" role="alert">{chat.error}</p>}
    <div className="cv-settings-grid"><div className="cv-settings-main"><Tabs value={tab} onValueChange={value => setTab(value as 'global' | 'pet')}>
      <TabsList className="cv-tabs" aria-label="AI 设置范围"><TabsTrigger value="global">全局连接</TabsTrigger><TabsTrigger value="pet" disabled={!pet}>独立连接</TabsTrigger></TabsList>
      <TabsContent value={tab}>
        {tab === 'global' ? <ConnectionForm key={`${data.accountId}:${data.sessionRevision}:global:${data.globalConnection?.revision ?? 0}`} connection={data.globalConnection} petId={null} label="模型连接"
          secure={data.secureStorageAvailable} request={chat.request} refresh={refresh}/> : pet && <>
          <ConnectionForm key={`${data.accountId}:${data.sessionRevision}:${pet.petId}:${data.connection?.revision ?? 0}`} connection={data.connection ?? null} petId={pet.petId} label={`${pet.name}的独立连接`}
            secure={data.secureStorageAvailable} request={chat.request} refresh={refresh} scope={{ enabled: data.profile?.useOverride === true, hint: '需要自己的密钥；保存后，在右侧开启独立连接。' }}/></>}
      </TabsContent></Tabs>
      <section className="cv-card cv-partners"><header className="cv-section-heading"><h2>伙伴 <small>{data.pets.length}</small></h2><ActionHint text="导入旧记录"><Button type="button" variant="ghost" className="cv-icon" aria-label="导入旧记录" onClick={() => {setEditor(null);setLegacyScope(scope);}}><History size={16}/></Button></ActionHint></header>
      {importNotice?.scope === scope && <p className="cv-success" role="status">{importNotice.text}</p>}<div>
        {data.pets.map(item => <ActionHint key={item.petId} text={[item.name, petElementLabel(item), item.petId.slice(-8)].filter(Boolean).join(' · ')}><Button className={item.petId === pet?.petId ? 'selected' : ''} aria-pressed={item.petId === pet?.petId} aria-label={`${item.name}，${petElementLabel(item)}，伙伴 ${item.petId.slice(-8)}`}
          onClick={() => { setEditor(null); void chat.choose(item.petId); }}><PetAvatar pet={item}/><strong>{item.name}<PetElement pet={item} hint={false}/></strong></Button></ActionHint>)}
      </div></section>
    </div>
    <aside className="cv-settings-side">{pet && data.profile ? <>
      <PersonaForm key={`${data.accountId}:${data.sessionRevision}:${pet.petId}:${data.profile.revision}`} pet={pet} profile={data.profile} request={chat.request} refresh={refresh}/>
      <MemoryPanel key={`${data.accountId}:${data.sessionRevision}:${pet.petId}`} pet={pet} memories={data.memories ?? []} enabled={data.profile.memoryEnabled}
        add={() => setEditor({ scope })} edit={memory => setEditor({ scope, memory })} remove={async memory => { await chat.request('memory.delete', { petId: pet.petId, id: memory.id, revision: memory.revision }); await refresh(); }}/>
    </> : <section className="cv-card cv-empty"><h2>还没有伙伴</h2><a href="#/companions" className="cv-link">先领养一只灵宠 →</a></section>}</aside></div></div>
    {editor?.scope === scope && pet && <MemoryEditor key={scope} pet={pet} memory={editor.memory} close={() => setEditor(null)}
      save={async content => { await chat.request('memory.save', { petId: pet.petId, memory: { content, ...(editor.memory ? { id: editor.memory.id, revision: editor.memory.revision } : {}) } }); await refresh(); }}/>}
    {legacyScope === scope && <LegacyImportDialog key={scope} pet={pet} request={chat.request} close={() => setLegacyScope(null)} done={async result => {
      await refresh();setImportNotice({scope,text:`已合并 ${result.messages} 条消息、${result.memories} 条记忆`});setLegacyScope(null);
    }}/>}
  </div>;
}
