import { useEffect, useState } from 'react';
import { Footprints, MessageCircle, Settings2, Trash2, Pencil } from 'lucide-react';
import type { ConversationClient, ConversationMemory } from '../../../../../../packages/shared-types/src/features/conversations';
import { MemoryEditor, MemoryPanel, Modal, PetAvatar, PetScene, PetElement, petElementLabel, ActionHint, InfoHint } from './components';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { AnimatedList } from '../../components/motion';
import { AssistantConversationThread } from './assistant-thread';
import { useConversations } from './use-conversations';
import { PetIdentity, petIdentityHint, petIdentityLabel } from './identity';

const time = (value: number) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

export function ConversationsPage({ client, initialPetId }: { client?: ConversationClient; initialPetId?: string }) {
  const chat = useConversations(client, initialPetId);
  const [editor, setEditor] = useState<{ scope: string; memory?: ConversationMemory; text?: string } | null>(null);
  const [clear, setClear] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [moreBusy, setMoreBusy] = useState(false);
  const data = chat.data;
  const scope = JSON.stringify([data?.accountId, data?.sessionRevision, data?.petId]);
  const pet = data?.pets.find(item => item.petId === data.petId);
  const messages = data?.messages ?? [];
  const busy = messages.some(message => ['pending', 'streaming'].includes(message.status));
  useEffect(() => { setEditor(null); setClear(null); setActionError(''); }, [scope]);
  async function cancel() {
    if (!pet) return;
    try { await chat.request('cancel', { petId: pet.petId }); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : '停止失败。'); }
  }
  if (!data) return <div className="cv-root"><header className="cv-page-header"><h1>聊天</h1></header>
    <section className="cv-card cv-empty" aria-live="polite"><MessageCircle className="cv-empty-star" size={45}/>
      <h2>{chat.loading ? '读取中…' : '暂时无法打开聊天'}</h2><p>{chat.error || '请先登录。'}</p>
      {!chat.loading && <><Button asChild className="cv-button"><a href="#/account">前往账号</a></Button><Button variant="secondary" className="cv-button secondary" onClick={() => void chat.reload(undefined, true)}>重新读取</Button></>}
    </section></div>;
  if (!pet || !data.profile) return <div className="cv-root"><section className="cv-card cv-empty"><h1>暂无伙伴</h1><a className="cv-button" href="#/companions/adopt">前往领养</a></section></div>;
  const profile = data.profile;
  const connection = profile.useOverride ? data.connection : data.globalConnection;
  return <div className="cv-root">
    <header className="cv-page-header"><p className="cv-active-identity">聊天 / <PetIdentity pet={pet}/></p><div><div><h1>聊天</h1></div>
      <ActionHint text="对话设置"><a className="cv-icon cv-settings-shortcut" href="#/settings/ai" aria-label="对话设置"><Settings2 size={18}/></a></ActionHint></div></header>
    {(chat.error || actionError) && <div role="alert" className="cv-error">{actionError || chat.error}</div>}
    <div className="cv-chat-grid">
      <aside className="cv-card cv-pet-list" aria-label="选择聊天伙伴"><h2>我的伙伴 <small>{data.pets.length}</small></h2>
        <AnimatedList className="cv-partner-list">{data.pets.map(item => <ActionHint key={item.petId} text={[petIdentityHint(item), petElementLabel(item)].filter(Boolean).join(' · ')}><Button variant="ghost" className={`cv-pet-option ${item.petId === pet.petId ? 'selected' : ''}`} data-pet-id={item.petId} aria-label={`${petIdentityLabel(item)}，${petElementLabel(item)}`} aria-pressed={item.petId === pet.petId} onClick={() => void chat.choose(item.petId)}>
          <PetAvatar pet={item}/><span><PetIdentity pet={item}><PetElement pet={item} hint={false}/></PetIdentity>{data.summaries[item.petId]?.content && <small>{data.summaries[item.petId]!.content.slice(0, 28)}</small>}</span>
          {data.summaries[item.petId] && <time>{time(data.summaries[item.petId]!.createdAt)}</time>}
        </Button></ActionHint>)}</AnimatedList>
      </aside>
      <section className="cv-card cv-thread" data-pet-id={pet.petId} aria-label={`与${petIdentityLabel(pet)}的聊天`}>
        <header className="cv-thread-header"><PetAvatar pet={pet}/><div><h2><PetIdentity pet={pet}><PetElement pet={pet}/></PetIdentity></h2>
          <ActionHint text={busy ? '可随时停止本次回复。' : connection?.hasKey ? `模型：${connection.model}` : '添加模型连接后即可发送消息。'}><p className="cv-connection-state" tabIndex={0}><span className={`cv-dot ${connection?.hasKey ? '' : 'offline'}`}/>{busy ? '回复中…' : connection?.hasKey ? '已配置' : '未配置'}</p></ActionHint></div>
          <ActionHint text={busy ? '回复结束后可清空聊天。' : !messages.length ? '暂无聊天记录。' : '清空聊天'}><Button variant="ghost" className="cv-icon" aria-label="清空当前伙伴聊天记录" onClick={() => setClear(scope)} disabled={busy || !messages.length}><Trash2 size={17}/></Button></ActionHint></header>
        <AssistantConversationThread key={scope} pet={pet} messages={messages} busy={busy} hasConnection={Boolean(connection?.hasKey)} nextCursor={data.nextCursor} moreBusy={moreBusy}
          more={() => { setMoreBusy(true); void chat.more().catch(cause => setActionError(cause instanceof Error ? cause.message : '读取失败。')).finally(() => setMoreBusy(false)); }}
          send={chat.send} cancel={cancel} retry={actionId => { void chat.send('', actionId); }} remember={text => setEditor({ scope, text })}/>
      </section>
      <aside className="cv-details"><section className="cv-card cv-pet-card"><PetScene pet={pet}/>
        <div className="cv-section-heading"><h2><PetIdentity pet={pet} historical><PetElement pet={pet}/><span className="cv-level">Lv.{String(pet.level).padStart(2, '0')}</span></PetIdentity></h2><ActionHint text="编辑人设"><a className="cv-icon" href="#/settings/ai" aria-label="编辑人设"><Pencil size={15}/></a></ActionHint></div>
        {profile.persona && <p className="cv-persona-preview">{profile.persona}</p>}</section>
        <MemoryPanel key={scope} pet={pet} memories={data.memories ?? []} enabled={profile.memoryEnabled}
          add={() => setEditor({ scope })} edit={memory => setEditor({ scope, memory })} remove={async memory => {
            await chat.request('memory.delete', { petId: pet.petId, id: memory.id, revision: memory.revision }); await chat.reload(pet.petId);
          }}/>
        <div className="cv-card cv-pause"><Footprints size={20}/><label className="cv-pause-label" htmlFor={`chat-pause-${pet.petId}`}>回复时暂停散步</label><InfoHint label="暂停散步提示" text="仅在这位伙伴回复期间暂停散步。"/><Switch id={`chat-pause-${pet.petId}`} aria-label="聊天时暂停散步" checked={profile.pauseWhileChatting}
          onCheckedChange={checked => { void chat.request('profile.save', { petId: pet.petId, profile: { ...profile, pauseWhileChatting: checked }, revision: profile.revision })
            .then(() => chat.reload(pet.petId)).catch(cause => setActionError(cause instanceof Error ? cause.message : '保存失败。')); }}/></div>
      </aside>
    </div>
    {editor?.scope === scope && <MemoryEditor key={scope} pet={pet} memory={editor.memory} initialText={editor.text} close={() => setEditor(null)}
      save={async content => { await chat.request('memory.save', { petId: pet.petId, memory: { content, ...(editor.memory ? { id: editor.memory.id, revision: editor.memory.revision } : {}) } }); await chat.reload(pet.petId); }}/>}
    {clear === scope && <Modal title={`清空与${petIdentityLabel(pet)}的聊天？`} close={() => setClear(null)}><p>聊天将清空，人设与记忆保留。</p><footer>
      <Button variant="secondary" className="cv-button secondary" onClick={() => setClear(null)}>保留记录</Button><Button variant="destructive" className="cv-button danger" onClick={() => {
        void chat.request('history.clear', { petId: pet.petId }).then(() => { setClear(null); return chat.reload(pet.petId); })
          .catch(cause => setActionError(cause instanceof Error ? cause.message : '清空失败。'));
      }}>确认清空</Button></footer></Modal>}
  </div>;
}
