import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronRight, Heart, MessageCircle, Monitor, Pencil, Plus, Sparkles, Swords, Utensils, X } from 'lucide-react';
import type { CompanionPet, CompanionTemplate, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions/index';
import { navigate, usePath } from '../../app/navigation';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader } from '../../components/ui';
import type { FeatureModule } from '../../app/types';
import { useCompanions } from './client';
import { CompanionPortrait } from './CompanionPortrait';
import './styles.css';

const elements: Record<string, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
const behaviors = [{ value: 'wander', label: '自由散步' }, { value: 'quiet', label: '安静陪伴' }, { value: 'follow', label: '跟随鼠标' }, { value: 'sleep', label: '好好休息' }] as const;
type Controller = ReturnType<typeof useCompanions>;
function usePageScroll() {
  useEffect(() => { document.querySelector('.main-content')?.scrollTo({ top: 0 }); }, []);
}

function StateMeters({ pet }: { pet: CompanionPet }) {
  return <div className="cp-meters">{[
    { name: '心情', value: pet.growth.mood, className: 'mood', icon: '☺' },
    { name: '饱食', value: pet.growth.satiety, className: 'satiety', icon: '♧' },
    { name: '亲密度', value: pet.growth.affinity, className: 'affinity', icon: '♥' }
  ].map(item => <div className={`cp-meter ${item.className}`} key={item.name}><span className="cp-meter-icon" aria-hidden="true">{item.icon}</span><span>{item.name}</span><meter min={0} max={100} value={item.value} aria-label={`${pet.name}的${item.name}`}/><strong>{item.value}</strong></div>)}</div>;
}

function RenameDialog({ pet, controller, close }: { pet: CompanionPet; controller: Controller; close: () => void }) {
  const [name, setName] = useState(pet.name);
  return <div className="cp-modal-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !controller.busy) close(); }}><section className="cp-modal" role="dialog" aria-modal="true" aria-labelledby="cp-rename-title"><header><h2 id="cp-rename-title">给伙伴起个名字</h2><button aria-label="关闭改名" onClick={close} disabled={controller.busy}><X size={18}/></button></header><p className="muted">这是这只伙伴独有的名字。</p><form onSubmit={async event => { event.preventDefault(); if (await controller.petAction('rename', pet, { name })) close(); }}><label htmlFor="cp-new-name">伙伴名字</label><input id="cp-new-name" autoFocus value={name} onChange={event => setName(event.target.value)} maxLength={48} required/><small>1–24 个字符</small><ErrorNotice message={controller.error}/><div className="cp-dialog-actions"><Button type="button" variant="secondary" onClick={close} disabled={controller.busy}>取消</Button><Button disabled={controller.busy || !name.trim() || [...name.trim()].length > 24} type="submit">{controller.busy ? '正在保存…' : '保存名字'}</Button></div></form></section></div>;
}

function PetActions({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  return <div className="cp-actions"><Button variant="secondary" disabled={controller.busy} onClick={() => controller.petAction('interact', pet)}><Heart size={17}/>摸摸</Button><Button variant="secondary" onClick={() => navigate('/inventory')}><Utensils size={17}/>喂食</Button><Button variant="secondary" disabled={controller.busy} onClick={async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); }}><MessageCircle size={17}/>聊聊天</Button></div>;
}

function DesktopControls({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const [scale, setScale] = useState(pet.desktop.scale);
  useEffect(() => setScale(pet.desktop.scale), [pet.petId, pet.desktop.scale]);
  const saveScale = () => { if (scale !== pet.desktop.scale && !controller.busy) void controller.petAction('desktop', pet, { scale }); };
  return <div className="cp-desktop-controls"><label><span>♧ 行为模式</span><select aria-label={`${pet.name}的行为模式`} value={pet.desktop.behavior} disabled={controller.busy} onChange={event => controller.petAction('desktop', pet, { behavior: event.target.value })}>{behaviors.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label><span>⤢ 外观大小</span><input type="range" min={.5} max={2} step={.05} aria-label={`${pet.name}的外观大小`} value={scale} disabled={controller.busy} onChange={event => setScale(Number(event.target.value))} onPointerUp={saveScale} onKeyUp={saveScale} onBlur={saveScale}/><small>{Math.round(scale * 100)}%</small></label><label><span><Monitor size={17}/>在桌面显示</span><button type="button" className={`cp-switch ${pet.desktop.visible ? 'on' : ''}`} role="switch" aria-checked={pet.desktop.visible} aria-label={`${pet.name}在桌面显示`} disabled={controller.busy} onClick={() => controller.petAction('desktop', pet, { visible: !pet.desktop.visible })}><span/></button></label><Button variant="secondary" disabled={controller.busy || controller.snapshot?.selections.battlePetId === pet.petId} onClick={() => controller.petAction('select', pet, { slot: 'battlePetId' })}><Swords size={17}/>{controller.snapshot?.selections.battlePetId === pet.petId ? '当前出战伙伴' : '设为出战伙伴'}</Button></div>;
}

function LoadingOrEmpty({ controller }: { controller: Controller }) {
  if (controller.loading) return <EmptyState title="伙伴们正在赶来…"/>;
  return <EmptyState title={controller.error ? '还没能连接到伙伴' : '第一份陪伴，从这里开始。'} description={controller.error || '领养一个新伙伴，一起让桌面热闹起来。'} action={controller.error ? <Button onClick={() => controller.reload()}>重新连接</Button> : <Button onClick={() => navigate('/companions/adopt')}><Plus size={17}/>领养伙伴</Button>}/>;
}

export function CompanionsPage() {
  usePageScroll();
  const controller = useCompanions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [desktopOnly, setDesktopOnly] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const snapshot = controller.snapshot;
  if (!snapshot?.pets.length) return <div className="cp-page"><LoadingOrEmpty controller={controller}/></div>;
  const selected = snapshot.pets.find(pet => pet.petId === selectedId) || snapshot.pets[0];
  const template = snapshot.templates.find(item => item.templateId === selected.templateId);
  const visible = snapshot.pets.filter(pet => pet.desktop.visible);
  const pets = desktopOnly ? visible : snapshot.pets;
  return <div className="cp-page"><PageHeader eyebrow="我的灵宠 / 全部伙伴" title="今天，也有小家伙在等你。" description={`已拥有 ${snapshot.pets.length} 只 · 桌面陪伴 ${visible.length} 只`} action={<Button onClick={() => navigate('/companions/adopt')}><Plus size={19}/>领养伙伴</Button>}/><ErrorNotice message={controller.error}/>
    <div className="cp-overview"><section className={`cp-hero ${selected.resource.kind === '2d' ? 'cp-fish-art' : ''}`}><div className="cp-room-decoration" aria-hidden="true"><span>✧</span><span>✦</span></div><CompanionPortrait petId={selected.petId} resource={selected.resource} name={selected.name} animate action={selected.desktop.behavior === 'sleep' ? 'sleep' : 'idle'}/><div className="cp-hero-copy"><div className="cp-name-line"><h2>{selected.name}</h2><Badge>Lv.{String(selected.growth.level).padStart(2, '0')}</Badge></div><span className="cp-presence"><i className={selected.desktop.visible ? 'active' : ''}/>{selected.desktop.visible ? '正在桌面陪你' : '在灵境里休息'}</span><p>{template?.description || '每一份陪伴，都是独一无二的日常。'}</p><PetActions pet={selected} controller={controller}/></div></section>
    <Card className="cp-status-panel"><div className="cp-status-heading"><div className="cp-mini-portrait"><CompanionPortrait petId={selected.petId} resource={selected.resource} name={selected.name}/></div><div><h2>{selected.name}<button className="cp-icon-button" aria-label={`修改${selected.name}的名字`} onClick={() => setRenaming(true)}><Pencil size={16}/></button></h2><p className="muted">{template?.category === 'big-fish' ? '大肥鱼' : template?.name || '原有伙伴'} · {elements[selected.element]}属性</p></div></div><StateMeters pet={selected}/><DesktopControls pet={selected} controller={controller}/><button className="cp-text-link" onClick={() => navigate(`/companions/${encodeURIComponent(selected.petId)}`)}>查看伙伴详情<ChevronRight size={15}/></button></Card></div>
    <section className="cp-roster" aria-labelledby="cp-roster-title"><div className="cp-roster-heading"><h2 id="cp-roster-title">我的伙伴</h2><div className="cp-segmented"><button aria-pressed={!desktopOnly} onClick={() => setDesktopOnly(false)}>全部 {snapshot.pets.length}</button><button aria-pressed={desktopOnly} onClick={() => setDesktopOnly(true)}>桌面中 {visible.length}</button></div></div><div className="cp-pet-grid">{pets.map(pet => <button key={pet.petId} className={`cp-pet-card ${pet.petId === selected.petId ? 'selected' : ''}`} aria-pressed={pet.petId === selected.petId} aria-label={`选择伙伴 ${pet.name} ${pet.serial}`} onClick={() => setSelectedId(pet.petId)}><div className="cp-card-art"><CompanionPortrait petId={pet.petId} resource={pet.resource} name={pet.name}/></div><div className="cp-pet-card-title"><strong>{pet.name}</strong>{pet.desktop.visible && <small><i/>桌面中</small>}</div><div className="cp-pet-card-meta"><Badge>Lv.{String(pet.growth.level).padStart(2, '0')}</Badge><small>{elements[pet.element]}</small></div></button>)}</div>{pets.length === 0 && <p className="muted">目前还没有桌面伙伴，选择一只并打开“在桌面显示”吧。</p>}</section>
    <div className="cp-footer-links"><button onClick={() => navigate('/discovery')}><Sparkles size={23}/><span><strong>去附近探索</strong><small>寻找下一份特别的相遇</small></span><ArrowRight size={18}/></button><button onClick={() => navigate('/battle')}><Swords size={23}/><span><strong>和伙伴并肩出发</strong><small>前往对战中心</small></span><ChevronRight size={18}/></button></div>
    {renaming && <RenameDialog key={selected.petId} pet={selected} controller={controller} close={() => setRenaming(false)}/>}
  </div>;
}

export function AdoptionPage() {
  usePageScroll();
  const controller = useCompanions();
  const [selectedId, setSelectedId] = useState('big-fish-gentle');
  const [category, setCategory] = useState('all');
  const [name, setName] = useState('鱼丸');
  const [showOnDesktop, setShowOnDesktop] = useState(true);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [adopted, setAdopted] = useState<CompanionPet | null>(null);
  if (!controller.snapshot) return <div className="cp-page"><LoadingOrEmpty controller={controller}/></div>;
  const snapshot = controller.snapshot;
  const selected = snapshot.templates.find(template => template.templateId === selectedId) || snapshot.templates[0];
  const count = (template: CompanionTemplate) => snapshot.pets.filter(pet => pet.templateId === template.templateId).length;
  const templates = snapshot.templates.filter(template => (category === 'all' || template.category === category) && (!ownedOnly || count(template) > 0));
  return <div className="cp-page"><button className="cp-back" onClick={() => navigate('/companions')}><ArrowLeft size={16}/>我的灵宠</button><PageHeader eyebrow="我的灵宠 / 领养伙伴" title="再认识一位新朋友。" description="不同的性格，一样的温柔。找到让你心动的伙伴吧。"/><ErrorNotice message={controller.error}/>{adopted && <div className="cp-success" role="status"><Check size={18}/>{adopted.name} 已加入你的灵境。<button onClick={() => navigate(`/companions/${encodeURIComponent(adopted.petId)}`)}>去看它<ArrowRight size={16}/></button></div>}<div className="cp-adoption-layout"><div><div className="cp-adoption-filter"><div className="cp-segmented">{[['all', '全部'], ['big-fish', '大肥鱼'], ['animal', '动物伙伴']].map(([id, title]) => <button key={id} aria-pressed={category === id} onClick={() => setCategory(id)}>{title}</button>)}</div><label className="cp-checkbox"><input type="checkbox" checked={ownedOnly} onChange={event => setOwnedOnly(event.target.checked)}/>已拥有</label></div><div className="cp-template-grid">{templates.map(template => <button key={template.templateId} className={`cp-template-card ${selected.templateId === template.templateId ? 'selected' : ''}`} aria-pressed={selected.templateId === template.templateId} onClick={() => { setSelectedId(template.templateId); setName(template.name); setAdopted(null); }}><div className="cp-template-art"><CompanionPortrait petId={`preview:${template.templateId}`} resource={template.resource} name={template.name}/><span className="cp-type-tag">{template.resource.kind === '2d' ? '2D 动画' : '3D 模型'}</span></div><strong>{template.name}</strong><p>{template.description}</p><Badge>{count(template) ? `已拥有 ${count(template)} 只` : '期待相遇'}</Badge></button>)}</div></div><Card className="cp-adoption-preview"><div className="cp-adoption-art"><CompanionPortrait petId={`preview:${selected.templateId}`} resource={selected.resource} name={selected.name} animate/></div><h2>{selected.name}</h2><p className="muted">{selected.description}</p><form onSubmit={async event => { event.preventDefault(); const result = await controller.mutate('adopt', { templateId: selected.templateId, name, showOnDesktop }); if (result) setAdopted(result.pet); }}><label htmlFor="cp-adoption-name">给它起个昵称</label><input id="cp-adoption-name" value={name} onChange={event => setName(event.target.value)} required maxLength={48}/><small>同一种形象，也能拥有不同的伙伴。</small><label className="cp-checkbox"><input type="checkbox" checked={showOnDesktop} onChange={event => setShowOnDesktop(event.target.checked)}/>领养后放到桌面</label><Button type="submit" disabled={controller.busy || !name.trim() || [...name.trim()].length > 24}><Sparkles size={18}/>{controller.busy ? '正在迎接伙伴…' : '领养这位伙伴'}</Button></form></Card></div></div>;
}

function GrowthDetail({ pet }: { pet: CompanionPet }) {
  return <><Card><div className="cp-experience"><strong>Lv.{String(pet.growth.level).padStart(2, '0')}</strong><div><span>{pet.growth.experience} / 100 经验</span><progress max={100} value={pet.growth.experience} aria-label="本级经验"/></div></div><div className="cp-growth-columns"><StateMeters pet={pet}/><div className="cp-battle-stats"><strong>战斗属性</strong>{[['生命', pet.growth.stats.hp], ['攻击', pet.growth.stats.atk], ['防御', pet.growth.stats.def], ['速度', pet.growth.stats.spd]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div></div><p className="cp-rule-note">延续现有成长规则：每 100 经验升一级，战斗属性随等级成长。</p></Card><Card className="cp-origin"><h3>属于它的第一次相遇</h3><p>{pet.source === 'legacy' ? '从原有存档来到灵境，往日的陪伴继续保存。' : pet.source === 'capture' ? '探索途中相遇，从此一起出发。' : '你为它起了名字，一份新的陪伴开始了。'}</p><small>{new Date(pet.createdAt).toLocaleDateString('zh-CN')} · 伙伴编号 {pet.serial}</small></Card></>;
}

function PetDetailContent({ pet, snapshot, controller }: { pet: CompanionPet; snapshot: CompanionsSnapshot; controller: Controller }) {
  const [tab, setTab] = useState('growth'); const [renaming, setRenaming] = useState(false);
  return <><div className="cp-detail-layout"><section className="cp-detail-hero"><CompanionPortrait petId={pet.petId} resource={pet.resource} name={pet.name} animate/><div className="cp-detail-copy"><h2>{pet.name}<button className="cp-icon-button" aria-label={`修改${pet.name}的名字`} onClick={() => setRenaming(true)}><Pencil size={18}/></button></h2><Badge>Lv.{String(pet.growth.level).padStart(2, '0')} · {elements[pet.element]}</Badge><p className="cp-serial">伙伴编号 {pet.serial}</p><div className="cp-detail-badges">{pet.desktop.visible && <Badge>● 桌面中</Badge>}{snapshot.selections.battlePetId === pet.petId && <Badge>⚔ 出战伙伴</Badge>}{snapshot.selections.guardPetId === pet.petId && <Badge>⌂ 驻守伙伴</Badge>}</div><PetActions pet={pet} controller={controller}/></div></section><div className="cp-detail-body"><div className="cp-segmented cp-detail-tabs" role="tablist" aria-label="伙伴详情">{[['growth', '成长'], ['skills', '技能'], ['memory', '回忆'], ['appearance', '外观']].map(([id, text]) => <button key={id} role="tab" aria-selected={tab === id} aria-controls="cp-tab-content" id={`cp-tab-${id}`} aria-pressed={tab === id} onClick={() => setTab(id)}>{text}</button>)}</div><div id="cp-tab-content" role="tabpanel" aria-labelledby={`cp-tab-${tab}`}>{tab === 'growth' ? <GrowthDetail pet={pet}/> : tab === 'appearance' ? <Card><h3>桌面陪伴</h3><DesktopControls pet={pet} controller={controller}/><p className="muted">在桌面直接拖动这只伙伴即可保存位置。每只伙伴分别记住自己的位置与大小。</p></Card> : tab === 'memory' ? <Card><h3>专属于{pet.name}的回忆</h3><p>和它聊聊今天发生的事。聊天、人设和记忆始终归属这一只伙伴。</p><Button disabled={controller.busy} onClick={async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); }}><MessageCircle size={17}/>打开它的聊天与记忆</Button><hr/><p className="muted">相遇来源：{pet.source === 'legacy' ? '原有存档' : pet.source === 'capture' ? '野外收服' : '领养'}</p><small className="cp-mono">{pet.petId}</small></Card> : <Card><h3>与伙伴并肩出战</h3><div className="cp-skill-list">{[['普通攻击', '基础攻击动作'], ['元素攻击', `${elements[pet.element]}属性的元素攻击`], ['闪避', '使用现有战斗规则判定闪避'], ['终极技能', '怒气满足现有规则时可以使用']].map(([title, description]) => <div key={title}><span>✧</span><div><strong>{title}</strong><p className="muted">{description}</p></div></div>)}</div><Button variant="secondary" onClick={() => navigate('/battle')}><Swords size={17}/>前往对战中心</Button></Card>}</div><Button variant="secondary" className="cp-recall" disabled={controller.busy} onClick={() => controller.petAction('desktop', pet, { visible: !pet.desktop.visible })}><Monitor size={16}/>{pet.desktop.visible ? '收回桌面' : '放到桌面'}</Button></div></div>{renaming && <RenameDialog pet={pet} controller={controller} close={() => setRenaming(false)}/>}</>;
}

export function PetDetailPage() {
  usePageScroll();
  const controller = useCompanions(); const path = usePath(); const petId = path.slice('/companions/'.length);
  const pet = controller.snapshot?.pets.find(candidate => candidate.petId === petId);
  return <div className="cp-page"><button className="cp-back" onClick={() => navigate('/companions')}><ArrowLeft size={16}/>我的灵宠</button><PageHeader eyebrow={`我的灵宠 / ${pet?.name || '伙伴详情'}`} title="每一份陪伴，都有回应。" description="和你在一起的每一天，都是特别的日常。"/><ErrorNotice message={controller.error}/>{!controller.snapshot ? <LoadingOrEmpty controller={controller}/> : !pet ? <EmptyState title="这只伙伴不在当前账号的灵境里" action={<Button onClick={() => navigate('/companions')}>回到我的灵宠</Button>}/> : <PetDetailContent key={`${controller.snapshot.ownerAccountId}:${pet.petId}`} pet={pet} snapshot={controller.snapshot} controller={controller}/>}</div>;
}

const feature: FeatureModule = { id: 'companions', title: '我的灵宠', routes: [
  { path: '/companions', title: '我的灵宠', component: CompanionsPage },
  { path: '/companions/adopt', title: '领养伙伴', component: AdoptionPage },
  { path: '/companions/:petId', title: '伙伴详情', component: PetDetailPage }
] };
export default feature;
