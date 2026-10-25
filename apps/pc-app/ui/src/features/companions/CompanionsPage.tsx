import { useState } from 'react';
import { ArrowRight, ChevronRight, Plus, Sparkles, Swords } from 'lucide-react';
import { navigate } from '../../app/navigation';
import { Badge, Button, Card, ErrorNotice, PageHeader } from '../../components/ui';
import { AnimatedList } from '../../components/motion';
import { useCompanions } from './client';
import { companionIdentity } from './identity';
import { CompanionPortrait } from './CompanionPortrait';
import { hasYuwanRoomArtwork } from './artwork';
import { desktopPresentation, desktopSummary } from './desktop-display';
import { activeSnapshot, CompanionCloudNotice, CompanionElement, DesktopControls, LoadingOrEmpty, PetActions, CompanionInstanceNumber, StateMeters, usePageScroll } from './components';

export function CompanionsPage() {
  usePageScroll(); const controller = useCompanions();
  const [selectedId, setSelectedId] = useState<string | null>(null); const [desktopOnly, setDesktopOnly] = useState(false);
  const snapshot = controller.snapshot && activeSnapshot(controller.snapshot);
  if (!snapshot?.pets.length) return <div className="cp-page"><CompanionCloudNotice controller={controller}/><LoadingOrEmpty controller={controller}/></div>;
  const selected = snapshot.pets.find(pet => pet.petId === selectedId) || snapshot.pets[0];
  const selectedIdentity = companionIdentity(selected);
  const template = snapshot.templates.find(item => item.templateId === selected.templateId);
  const desktop = desktopSummary(snapshot), selectedDesktop = desktopPresentation(snapshot, selected);
  const pets = desktopOnly ? desktop.visible : snapshot.pets;
  const selectPet = (petId: string) => { setSelectedId(petId); requestAnimationFrame(() => document.querySelector('.main-content')?.scrollTo({ top: 0 })); };
  return <div className="cp-page"><PageHeader eyebrow="我的灵宠 / 全部伙伴" title="今天，也有小家伙在等你。" description={`已拥有 ${snapshot.pets.length} 只 · 已开启陪伴 ${desktop.enabled} 只 · 桌面显示 ${desktop.countLabel}${desktop.confirmed ? ' 只' : ''}`} action={<Button onClick={() => navigate('/companions/adopt')}><Plus size={19}/>领养伙伴</Button>}/><ErrorNotice message={controller.error}/>
    <CompanionCloudNotice controller={controller}/><div className="cp-overview"><section className={`cp-hero ${hasYuwanRoomArtwork(selected.resource.resourceId) ? 'cp-fish-art' : 'cp-lakeside-scene'}`}>
      {!hasYuwanRoomArtwork(selected.resource.resourceId) && <CompanionPortrait ownerAccountId={selected.ownerAccountId} petId={selected.petId} resource={selected.resource} name={selectedIdentity.roleName} animate action={selected.desktop.behavior === 'sleep' ? 'sleep' : 'idle'}/>}
      <div className="cp-hero-copy"><div className="cp-name-line"><h2>{selectedIdentity.roleName}</h2><Badge>Lv.{String(selected.growth.level).padStart(2, '0')}</Badge></div><CompanionInstanceNumber pet={selected}/><span className="cp-presence"><i className={selectedDesktop.state === 'visible' ? 'active' : ''}/>{selectedDesktop.label}</span><p>{template?.description || '每一份陪伴，都是独一无二的日常。'}</p><PetActions pet={selected} controller={controller}/></div>
    </section><Card className="cp-status-panel"><div className="cp-status-heading"><div className="cp-mini-portrait"><CompanionPortrait petId={selected.petId} resource={selected.resource} name={selectedIdentity.roleName} framing="portrait"/></div><div><h2>{selectedIdentity.roleName}</h2><CompanionInstanceNumber pet={selected} showNickname/><p className="muted cp-identity-line"><CompanionElement element={selected.element}/></p></div></div><StateMeters pet={selected}/><DesktopControls pet={selected} controller={controller}/><Button variant="ghost" className="cp-text-link" onClick={() => navigate(`/companions/${encodeURIComponent(selected.petId)}`)}>查看伙伴详情<ChevronRight size={15}/></Button></Card></div>
    <section className="cp-roster" aria-labelledby="cp-roster-title"><div className="cp-roster-heading"><h2 id="cp-roster-title">我的伙伴</h2><div className="cp-segmented" role="group" aria-label="伙伴筛选"><Button variant="ghost" aria-pressed={!desktopOnly} onClick={() => setDesktopOnly(false)}>全部 {snapshot.pets.length}</Button><Button variant="ghost" aria-pressed={desktopOnly} onClick={() => setDesktopOnly(true)}>桌面中 {desktop.countLabel}</Button></div></div><p className="muted cp-desktop-state-note">{desktop.policyNote}</p>
      <AnimatedList className="cp-pet-grid">{pets.map(pet => <Button variant="ghost" key={pet.petId} data-pet-id={pet.petId} className={`cp-pet-card ${pet.petId === selected.petId ? 'selected' : ''}`} aria-pressed={pet.petId === selected.petId} aria-label={`选择伙伴 ${companionIdentity(pet).roleName}，编号 ${companionIdentity(pet).instanceNumber}`} onClick={() => selectPet(pet.petId)}><div className="cp-card-art"><CompanionPortrait petId={pet.petId} resource={pet.resource} name={companionIdentity(pet).roleName} framing="portrait"/></div><div className="cp-pet-card-title"><strong>{companionIdentity(pet).roleName}</strong>{pet.desktop.visible && <small><i/>{desktopPresentation(snapshot, pet).badge}</small>}</div><CompanionInstanceNumber pet={pet}/><div className="cp-pet-card-meta"><Badge>Lv.{String(pet.growth.level).padStart(2, '0')}</Badge><small><CompanionElement element={pet.element}/></small></div></Button>)}</AnimatedList>
      {pets.length === 0 && <p className="muted">当前没有正在桌面显示的伙伴；等待空位或暂时隐藏时，已开启的陪伴偏好仍会保留。</p>}
    </section><div className="cp-footer-links"><Button variant="secondary" onClick={() => navigate('/discovery')}><Sparkles size={23}/><span><strong>去附近探索</strong><small>寻找下一份特别的相遇</small></span><ArrowRight size={18}/></Button><Button variant="secondary" onClick={() => navigate('/battle')}><Swords size={23}/><span><strong>和伙伴并肩出发</strong><small>前往对战中心</small></span><ChevronRight size={18}/></Button></div>
  </div>;
}
