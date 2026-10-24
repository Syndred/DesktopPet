import { useEffect, useState } from 'react';
import { Footprints, MessageCircle, Settings2, Trash2, ChevronRight } from 'lucide-react';
import type { ConversationClient, ConversationMemory } from '../../../../../../packages/shared-types/src/features/conversations';
import { MemoryEditor, MemoryPanel, Modal, PetAvatar, PetScene, ActionHint } from './components';
import { Button } from '../../components/ui/button';
import { Switch } from '../../components/ui/switch';
import { AnimatedList } from '../../components/motion';
import { AssistantConversationThread } from './assistant-thread';
import { useConversations } from './use-conversations';

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
  if (!data) return <div className="cv-root"><header className="cv-page-header"><p>聊天 / 独立陪伴</p><h1>想说的话，我都在听。</h1></header>
    <section className="cv-card cv-empty" aria-live="polite"><MessageCircle className="cv-empty-star" size={45}/>
      <h2>{chat.loading ? '正在打开你们的小世界…' : '从一份陪伴开始'}</h2><p>{chat.error || '请先登录，再选择一只伙伴聊天。'}</p>
      {!chat.loading && <><Button asChild className="cv-button"><a href="#/account">前往账号</a></Button><Button variant="secondary" className="cv-button secondary" onClick={() => void chat.reload(undefined, true)}>重新读取</Button></>}
    </section></div>;
  if (!pet || !data.profile) return <div className="cv-root"><section className="cv-card cv-empty"><h1>先认识一位伙伴吧。</h1><p>领养后，每只伙伴都会拥有独立的聊天与记忆。</p><a className="cv-button" href="#/companions">我的灵宠</a></section></div>;
  const profile = data.profile;
  const connection = profile.useOverride ? data.connection : data.globalConnection;
  return <div className="cv-root">
    <header className="cv-page-header"><p>聊天 / 与{pet.name}聊天</p><div><div><h1>想说的话，我都在听。</h1><p>和她聊聊天，分享日常，让每一天都更温暖。</p></div>
      <a className="cv-link cv-settings-shortcut" href="#/settings/ai"><Settings2 size={15}/>对话设置</a></div></header>
    {(chat.error || actionError) && <div role="alert" className="cv-error">{actionError || chat.error}</div>}
    <div className="cv-chat-grid">
      <aside className="cv-card cv-pet-list" aria-label="选择聊天伙伴"><h2>我的伙伴 <small>{data.pets.length}</small></h2>
        <AnimatedList className="cv-partner-list">{data.pets.map(item => <ActionHint key={item.petId} text={`${item.name} · 独立伙伴 ${item.petId.slice(-8)}`}><Button variant="ghost" className={`cv-pet-option ${item.petId === pet.petId ? 'selected' : ''}`} aria-label={`${item.name}，独立伙伴 ${item.petId.slice(-8)}`} aria-pressed={item.petId === pet.petId} onClick={() => void chat.choose(item.petId)}>
          <PetAvatar pet={item}/><span><strong>{item.name}</strong><small>{data.summaries[item.petId]?.content?.slice(0, 28) || '开始属于你们的对话'}</small></span>
          {data.summaries[item.petId] && <time>{time(data.summaries[item.petId]!.createdAt)}</time>}
        </Button></ActionHint>)}</AnimatedList><p className="cv-caption">同样的形象，也有不同的小世界。</p>
      </aside>
      <section className="cv-card cv-thread" aria-label={`与${pet.name}的聊天`}>
        <header className="cv-thread-header"><PetAvatar pet={pet}/><div><h2>{pet.name}</h2>
          <p><span className={`cv-dot ${connection?.hasKey ? '' : 'offline'}`}/>{busy ? '正在认真听你说…' : connection?.hasKey ? '温柔陪伴 · 已配置连接' : '请先设置模型连接'}</p></div>
          <ActionHint text="清空当前伙伴的聊天"><Button variant="ghost" className="cv-icon" aria-label="清空当前伙伴聊天记录" onClick={() => setClear(scope)} disabled={busy || !messages.length}><Trash2 size={17}/></Button></ActionHint></header>
        <AssistantConversationThread key={scope} pet={pet} messages={messages} busy={busy} hasConnection={Boolean(connection?.hasKey)} nextCursor={data.nextCursor} moreBusy={moreBusy}
          more={() => { setMoreBusy(true); void chat.more().catch(cause => setActionError(cause instanceof Error ? cause.message : '读取失败。')).finally(() => setMoreBusy(false)); }}
          send={chat.send} cancel={cancel} retry={actionId => { void chat.send('', actionId); }} remember={text => setEditor({ scope, text })}/>
      </section>
      <aside className="cv-details"><section className="cv-card cv-pet-card"><PetScene pet={pet}/>
        <div className="cv-section-heading"><h2>{pet.name} <span className="cv-level">Lv.{String(pet.level).padStart(2, '0')}</span></h2><a className="cv-link" href="#/settings/ai">当前对话设置<ChevronRight size={12}/></a></div>
        <p className="cv-persona-preview"><span className="cv-dot"/>{profile.persona || '温柔型 · 日常陪伴'}</p></section>
        <MemoryPanel key={scope} pet={pet} memories={data.memories ?? []} enabled={profile.memoryEnabled}
          add={() => setEditor({ scope })} edit={memory => setEditor({ scope, memory })} remove={async memory => {
            await chat.request('memory.delete', { petId: pet.petId, id: memory.id, revision: memory.revision }); await chat.reload(pet.petId);
          }}/>
        <label className="cv-card cv-pause"><Footprints size={22}/><span>聊天时暂停散步<small>仅作用于当前伙伴</small></span><Switch aria-label="聊天时暂停散步" checked={profile.pauseWhileChatting}
          onCheckedChange={checked => { void chat.request('profile.save', { petId: pet.petId, profile: { ...profile, pauseWhileChatting: checked }, revision: profile.revision })
            .then(() => chat.reload(pet.petId)).catch(cause => setActionError(cause instanceof Error ? cause.message : '保存失败。')); }}/></label>
      </aside>
    </div>
    {editor?.scope === scope && <MemoryEditor key={scope} pet={pet} memory={editor.memory} initialText={editor.text} close={() => setEditor(null)}
      save={async content => { await chat.request('memory.save', { petId: pet.petId, memory: { content, ...(editor.memory ? { id: editor.memory.id, revision: editor.memory.revision } : {}) } }); await chat.reload(pet.petId); }}/>}
    {clear === scope && <Modal title={`清空与${pet.name}的聊天？`} close={() => setClear(null)}><p>只清空这只伙伴的聊天记录。人设和保存的记忆会继续保留。</p><footer>
      <Button variant="secondary" className="cv-button secondary" onClick={() => setClear(null)}>保留记录</Button><Button variant="destructive" className="cv-button danger" onClick={() => {
        void chat.request('history.clear', { petId: pet.petId }).then(() => { setClear(null); return chat.reload(pet.petId); })
          .catch(cause => setActionError(cause instanceof Error ? cause.message : '清空失败。'));
      }}>确认清空</Button></footer></Modal>}
  </div>;
}
