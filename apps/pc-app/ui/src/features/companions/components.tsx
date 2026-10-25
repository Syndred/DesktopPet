import { useEffect, useId, useState, type ReactNode } from 'react';
import { Footprints, Heart, Info, Maximize2, MessageCircle, Monitor, Plus, Smile, Soup, Swords } from 'lucide-react';
import type { ElementType } from '../../../../../../packages/shared-types/src/battle';
import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate } from '../../app/navigation';
import { Button, EmptyState } from '../../components/ui';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { ElementMark } from '../battle/BattleMoves';
import { elements as battleElements } from '../battle/presentation';
import type { useCompanions } from './client';
import { companionIdentity } from './identity';
import { desktopPresentation } from './desktop-display';

export type Controller = ReturnType<typeof useCompanions>;
export function CompanionCloudNotice({ controller }: { controller: Controller }) {
  const sync = controller.snapshot?.sync;
  if (!sync || (sync.status === 'ready' && !sync.sharedSavePending && sync.pending === 0)) return null;
  const message = sync.status === 'conflict' ? '伙伴存档需要核对，本机原有进度已保留。'
    : sync.pending > 0 ? `有 ${sync.pending} 项伙伴操作待云端确认，原请求已保留。`
    : sync.status === 'offline' ? '暂时无法连接云端，正在显示本机缓存。'
    : sync.status === 'ready' && sync.sharedSavePending ? '伙伴已保存，其他存档待核对。'
    : '正在核对伙伴云端存档。';
  const review = sync.status === 'conflict' || (sync.status === 'ready' && sync.sharedSavePending && sync.pending === 0);
  return <div className="cp-cloud-notice" role="status" aria-live="polite"><Info size={18} aria-hidden="true"/><span>{message}</span><Button variant="secondary" disabled={controller.busy || controller.refreshing} onClick={() => review ? navigate('/account') : void controller.reload()}>{controller.refreshing ? '正在核对…' : review ? '核对存档' : '重新确认'}</Button></div>;
}
export function CompanionElement({ element }: { element: ElementType }) {
  return <span className="cp-element" data-element={element}><ElementMark element={element}/>{battleElements[element].label}</span>;
}
export function CompanionInstanceNumber({ pet, showNickname = false }: { pet: CompanionPet; showNickname?: boolean }) {
  const identity = companionIdentity(pet);
  return <span className="cp-instance-identity" data-instance-number={identity.instanceNumber}><code>编号 {identity.instanceNumber}</code>{showNickname && identity.historicalNickname && <small>历史昵称：{identity.historicalNickname}</small>}</span>;
}
export function InfoHint({ label, children, content }: { label: string; children?: ReactNode; content: ReactNode }) {
  return <TooltipProvider delayDuration={250}><Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" className="cp-hint" aria-label={label}>{children || <Info size={14}/>}</Button></TooltipTrigger><TooltipContent>{content}</TooltipContent></Tooltip></TooltipProvider>;
}
export const behaviors = [{ value: 'wander', label: '自由散步' }, { value: 'quiet', label: '安静陪伴' }, { value: 'follow', label: '跟随鼠标' }, { value: 'sleep', label: '好好休息' }] as const;
export function activeSnapshot(snapshot: CompanionsSnapshot): CompanionsSnapshot {
  return { ...snapshot, pets: snapshot.pets.filter(pet => pet.resource.kind === '2d'), templates: snapshot.templates.filter(template => template.resource.kind === '2d') };
}
export function usePageScroll() { useEffect(() => { document.querySelector('.main-content')?.scrollTo({ top: 0 }); }, []); }

export function StateMeters({ pet, showMax = false }: { pet: CompanionPet; showMax?: boolean }) {
  const roleName = companionIdentity(pet).roleName;
  return <div className="cp-meters">{[
    { name: '心情', value: pet.growth.mood, className: 'mood', Icon: Smile },
    { name: '饱食', value: pet.growth.satiety, className: 'satiety', Icon: Soup },
    { name: '亲密度', value: pet.growth.affinity, className: 'affinity', Icon: Heart }
  ].map(item => <div className={`cp-meter ${item.className}`} key={item.name}><InfoHint label={`${item.name} ${item.value}`} content={`${item.name} ${item.value} / 100`}><item.Icon className="cp-meter-icon" size={20} aria-hidden="true"/></InfoHint><meter min={0} max={100} value={item.value} aria-label={`${roleName}的${item.name}`}/><strong>{item.value}{showMax && <small> / 100</small>}</strong></div>)}</div>;
}

export function PetActions({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  return <div className="cp-actions"><Button variant="secondary" disabled={controller.busy} onClick={() => controller.petAction('interact', pet)}><Heart size={17}/>摸摸</Button><Button variant="secondary" onClick={() => navigate('/inventory')}><Soup size={17}/>喂食</Button><Button variant="secondary" disabled={controller.busy} onClick={async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); }}><MessageCircle size={17}/>聊聊天</Button></div>;
}

export function DesktopControls({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const roleName = companionIdentity(pet).roleName;
  const display = desktopPresentation(controller.snapshot, pet), statusId = useId();
  const [scale, setScale] = useState(pet.desktop.scale);
  useEffect(() => setScale(pet.desktop.scale), [pet.petId, pet.desktop.scale]);
  return <div className="cp-desktop-controls">
    <div className="cp-control-row"><span><Footprints size={16}/>行为模式</span><Select value={pet.desktop.behavior} disabled={controller.busy} onValueChange={behavior => { void controller.petAction('desktop', pet, { behavior }); }}><SelectTrigger aria-label={`${roleName}的行为模式`} className="cp-behavior-select"><SelectValue/></SelectTrigger><SelectContent>{behaviors.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
    <div className="cp-control-row"><span><Maximize2 size={16}/>外观大小</span><Slider className="cp-scale-slider" aria-label={`${roleName}的外观大小`} value={[scale]} min={.5} max={2} step={.05} disabled={controller.busy} onValueChange={values => setScale(values[0])} onValueCommit={values => { if (values[0] !== pet.desktop.scale) void controller.petAction('desktop', pet, { scale: values[0] }); }}/><small>{Math.round(scale * 100)}%</small></div>
    <div className="cp-control-row"><span><Monitor size={17}/>开启桌面陪伴</span><Switch aria-label={`${roleName}开启桌面陪伴`} aria-describedby={statusId} checked={pet.desktop.visible} disabled={controller.busy} onCheckedChange={visible => { void controller.petAction('desktop', pet, { visible }); }}/></div>
    <p id={statusId} className="muted cp-desktop-state-note" role="status">{display.note}</p>
    <Button variant="secondary" disabled={controller.busy || controller.snapshot?.selections.battlePetId === pet.petId} onClick={() => controller.petAction('select', pet, { slot: 'battlePetId' })}><Swords size={17}/>{controller.snapshot?.selections.battlePetId === pet.petId ? '当前出战伙伴' : '设为出战伙伴'}</Button>
  </div>;
}

export function LoadingOrEmpty({ controller }: { controller: Controller }) {
  if (controller.loading) return <EmptyState title="伙伴们正在赶来…"/>;
  return <EmptyState title={controller.error ? '还没能连接到伙伴' : '第一份陪伴，从这里开始。'} description={controller.error || '领养一个新伙伴，一起让桌面热闹起来。'} action={controller.error ? <Button onClick={() => controller.reload()}>重新连接</Button> : <Button onClick={() => navigate('/companions/adopt')}><Plus size={17}/>领养伙伴</Button>}/>;
}
