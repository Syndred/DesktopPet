import { useState } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { CompanionPet, CompanionTemplate } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate } from '../../app/navigation';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader } from '../../components/ui';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AnimatedList } from '../../components/motion';
import { useCompanions } from './client';
import { CompanionPortrait } from './CompanionPortrait';
import { activeSnapshot, LoadingOrEmpty, usePageScroll } from './components';

export function AdoptionPage() {
  usePageScroll(); const controller = useCompanions();
  const [selectedId, setSelectedId] = useState('big-fish-gentle'); const [category, setCategory] = useState('all');
  const [name, setName] = useState('鱼丸'); const [showOnDesktop, setShowOnDesktop] = useState(true); const [ownedOnly, setOwnedOnly] = useState(false); const [adopted, setAdopted] = useState<CompanionPet | null>(null);
  if (!controller.snapshot) return <div className="cp-page"><LoadingOrEmpty controller={controller}/></div>;
  const snapshot = activeSnapshot(controller.snapshot);
  const selected = snapshot.templates.find(template => template.templateId === selectedId) || snapshot.templates[0];
  const count = (template: CompanionTemplate) => snapshot.pets.filter(pet => pet.templateId === template.templateId).length;
  const templates = snapshot.templates.filter(template => (category === 'all' || template.category === category) && (!ownedOnly || count(template) > 0));
  return <div className="cp-page cp-adoption-page"><ErrorNotice message={controller.error}/>
    {adopted && <div className="cp-success" role="status"><Check size={18}/>{adopted.name} 已加入你的灵境。<Button variant="ghost" onClick={() => navigate(`/companions/${encodeURIComponent(adopted.petId)}`)}>去看它<ArrowRight size={16}/></Button></div>}
    <div className="cp-adoption-layout"><section className="cp-adoption-main"><PageHeader eyebrow="我的灵宠 / 领养伙伴" title="再认识一位新朋友。" description="不同的性格，一样的温柔。找到让你心动的伙伴吧。"/><Tabs value={category} onValueChange={setCategory}><div className="cp-adoption-filter"><TabsList className="cp-segmented">{[['all', '全部'], ['big-fish', '大肥鱼'], ['animal', '动物伙伴']].map(([id, title]) => <TabsTrigger key={id} value={id}>{title}</TabsTrigger>)}</TabsList><label className="cp-checkbox"><Checkbox checked={ownedOnly} onCheckedChange={value => setOwnedOnly(value === true)} aria-label="只看已拥有"/>已拥有</label></div>
      <TabsContent value={category}><AnimatedList className="cp-template-grid">{templates.map(template => <Button variant="ghost" key={template.templateId} className={`cp-template-card ${selected.templateId === template.templateId ? 'selected' : ''}`} aria-pressed={selected.templateId === template.templateId} onClick={() => { setSelectedId(template.templateId); setName(template.name); setAdopted(null); }}><div className="cp-template-art"><CompanionPortrait petId={`preview:${template.templateId}`} resource={template.resource} name={template.name}/><span className="cp-type-tag">2D 动画</span></div><strong>{template.name}</strong><p>{template.description}</p><Badge>{count(template) ? `已拥有 ${count(template)} 只` : '期待相遇'}</Badge></Button>)}</AnimatedList>{!templates.length && <EmptyState title="暂时还没有符合筛选的伙伴" description="试试其他分类，寻找下一位新朋友。"/>}</TabsContent>
    </Tabs></section><Card className="cp-adoption-preview"><div className="cp-adoption-art"><CompanionPortrait petId={`preview:${selected.templateId}`} resource={selected.resource} name={selected.name} animate/></div><h2>{selected.name}</h2><p className="muted">{selected.description}</p><form onSubmit={async event => { event.preventDefault(); const result = await controller.mutate('adopt', { templateId: selected.templateId, name, showOnDesktop }); if (result) setAdopted(result.pet); }}>
      <label htmlFor="cp-adoption-name">给它起个昵称</label><Input id="cp-adoption-name" value={name} onChange={event => setName(event.target.value)} required maxLength={48}/><small>同一种形象，也能拥有不同的伙伴。</small><label className="cp-checkbox"><Checkbox checked={showOnDesktop} onCheckedChange={value => setShowOnDesktop(value === true)} aria-label="领养后放到桌面"/>领养后放到桌面</label><Button type="submit" disabled={controller.busy || !name.trim() || [...name.trim()].length > 24}><Sparkles size={18}/>{controller.busy ? '正在迎接伙伴…' : '领养这位伙伴'}</Button>
    </form></Card></div>
  </div>;
}
