import { useState } from 'react';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import type { CompanionElement as ElementType, CompanionPet } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate } from '../../app/navigation';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader } from '../../components/ui';
import { Checkbox } from '../../components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AnimatedList } from '../../components/motion';
import { useCompanions } from './client';
import { CompanionPortrait } from './CompanionPortrait';
import { companionIdentity } from './identity';
import { activeSnapshot, CompanionCloudNotice, CompanionElement, CompanionInstanceNumber, LoadingOrEmpty, usePageScroll } from './components';

const elementCategories: ElementType[] = ['metal', 'wood', 'water', 'fire', 'earth'];

export function AdoptionPage() {
  usePageScroll(); const controller = useCompanions();
  const [selectedId, setSelectedId] = useState('big-fish-gentle');
  const [elementFilter, setElementFilter] = useState('all');
  const [showOnDesktop, setShowOnDesktop] = useState(true);
  const [ownedOnly, setOwnedOnly] = useState(false);
  const [adopted, setAdopted] = useState<CompanionPet | null>(null);
  if (!controller.snapshot) return <div className="cp-page"><LoadingOrEmpty controller={controller}/></div>;
  const snapshot = activeSnapshot(controller.snapshot);
  const counts = new Map<string, number>();
  for (const pet of snapshot.pets) counts.set(pet.templateId, (counts.get(pet.templateId) || 0) + 1);
  const templates = snapshot.templates.filter(template => (elementFilter === 'all' || template.element === elementFilter) && (!ownedOnly || counts.has(template.templateId)));
  const selected = templates.find(template => template.templateId === selectedId) || templates[0];
  // Mutation receipts remain immutable historical data. Only the matching read
  // projection may supply an authoritative number; a receipt alone is pending.
  const welcomed = adopted?.ownerAccountId === snapshot.ownerAccountId
    ? snapshot.pets.find(pet => pet.ownerAccountId === adopted.ownerAccountId && pet.petId === adopted.petId) || { ...adopted, globalSerial: undefined }
    : null;

  return <div className="cp-page cp-adoption-page"><CompanionCloudNotice controller={controller}/><ErrorNotice message={controller.error}/>
    {welcomed && <div className="cp-success" role="status"><Check size={18}/><span>{companionIdentity(welcomed).roleName} 已加入你的灵境。<CompanionInstanceNumber pet={welcomed}/></span><Button variant="ghost" onClick={() => navigate(`/companions/${encodeURIComponent(welcomed.petId)}`)}>去看它<ArrowRight size={16}/></Button></div>}
    <div className="cp-adoption-layout"><section className="cp-adoption-main"><PageHeader back={{ label: '我的灵宠', onClick: () => navigate('/companions') }} eyebrow="领养伙伴" title="再认识一位新朋友。" description="不同的性格，一样的温柔。找到让你心动的伙伴吧。"/>
      <Tabs value={elementFilter} onValueChange={value => { setElementFilter(value); setAdopted(null); }}>
        <div className="cp-adoption-filter"><TabsList className="cp-segmented cp-element-categories" aria-label="按五行分类"><TabsTrigger value="all">全部</TabsTrigger>{elementCategories.map(element => <TabsTrigger key={element} value={element}><CompanionElement element={element}/></TabsTrigger>)}</TabsList><label className="cp-checkbox"><Checkbox checked={ownedOnly} onCheckedChange={value => { setOwnedOnly(value === true); setAdopted(null); }} aria-label="只看已拥有"/>已拥有</label></div>
        <TabsContent value={elementFilter}><AnimatedList className="cp-template-grid">{templates.map(template => <Button variant="ghost" key={template.templateId} className={`cp-template-card ${selected?.templateId === template.templateId ? 'selected' : ''}`} aria-pressed={selected?.templateId === template.templateId} onClick={() => { setSelectedId(template.templateId); setAdopted(null); }}><div className="cp-template-art"><CompanionPortrait petId={`preview:${template.templateId}`} resource={template.resource} name={template.name} framing="portrait"/><span className="cp-type-tag"><CompanionElement element={template.element}/></span></div><strong>{template.name}</strong><p>{template.description}</p><Badge>{counts.has(template.templateId) ? `已拥有 ${counts.get(template.templateId)} 只` : '期待相遇'}</Badge></Button>)}</AnimatedList>{!templates.length && <EmptyState title="暂时还没有符合筛选的伙伴" description={ownedOnly ? '这个五行下还没有已拥有的伙伴，试试关闭“已拥有”或切换五行。' : '试试其他五行，寻找下一位新朋友。'}/>}</TabsContent>
      </Tabs>
    </section><Card className="cp-adoption-preview">{selected ? <><div className="cp-adoption-art cp-lakeside-scene"><CompanionPortrait petId={`preview:${selected.templateId}`} resource={selected.resource} name={selected.name} animate/></div><div className="cp-adoption-caption"><h2>{selected.name}<Badge><CompanionElement element={selected.element}/></Badge></h2><p className="muted">{selected.description}</p></div><form onSubmit={async event => { event.preventDefault(); const result = await controller.mutate('adopt', { templateId: selected.templateId, name: selected.name, showOnDesktop }); if (result) setAdopted(result.pet); }}>
      <p className="cp-adoption-identity-note">角色名为「{selected.name}」。每位伙伴都会保留自己的唯一编号，同一个角色也能拥有不同的陪伴与成长。</p><label className="cp-checkbox"><Checkbox checked={showOnDesktop} onCheckedChange={value => setShowOnDesktop(value === true)} aria-label="领养后放到桌面"/>领养后放到桌面</label><Button type="submit" disabled={controller.busy}><Sparkles size={18}/>{controller.busy ? '正在迎接伙伴…' : '领养这位伙伴'}</Button>
    </form></> : <EmptyState title="选择一位伙伴再领养" description="切换五行或关闭“已拥有”筛选，继续寻找新朋友。"/>}</Card></div>
  </div>;
}
