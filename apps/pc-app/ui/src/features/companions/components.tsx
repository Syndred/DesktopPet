import { useEffect, useState } from 'react';
import { Footprints, Heart, Maximize2, MessageCircle, Monitor, Pencil, Plus, Smile, Soup, Swords } from 'lucide-react';
import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { navigate } from '../../app/navigation';
import { Button, EmptyState, ErrorNotice } from '../../components/ui';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Slider } from '../../components/ui/slider';
import { Switch } from '../../components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { PageTransition } from '../../components/motion';
import type { useCompanions } from './client';

export type Controller = ReturnType<typeof useCompanions>;
export const elements: Record<string, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' };
export const behaviors = [{ value: 'wander', label: '自由散步' }, { value: 'quiet', label: '安静陪伴' }, { value: 'follow', label: '跟随鼠标' }, { value: 'sleep', label: '好好休息' }] as const;
export function activeSnapshot(snapshot: CompanionsSnapshot): CompanionsSnapshot {
  return { ...snapshot, pets: snapshot.pets.filter(pet => pet.resource.kind === '2d'), templates: snapshot.templates.filter(template => template.resource.kind === '2d') };
}
export function usePageScroll() { useEffect(() => { document.querySelector('.main-content')?.scrollTo({ top: 0 }); }, []); }

export function StateMeters({ pet }: { pet: CompanionPet }) {
  return <div className="cp-meters">{[
    { name: '心情', value: pet.growth.mood, className: 'mood', Icon: Smile },
    { name: '饱食', value: pet.growth.satiety, className: 'satiety', Icon: Soup },
    { name: '亲密度', value: pet.growth.affinity, className: 'affinity', Icon: Heart }
  ].map(item => <div className={`cp-meter ${item.className}`} key={item.name}><item.Icon className="cp-meter-icon" size={20} aria-hidden="true"/><span>{item.name}</span><meter min={0} max={100} value={item.value} aria-label={`${pet.name}的${item.name}`}/><strong>{item.value}</strong></div>)}</div>;
}

/** Public shadcn/Radix primitives own modal focus, Tab containment, Escape and focus return. */
export function RenameControl({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(pet.name);
  return <Dialog open={open} onOpenChange={next => { if (!controller.busy) { if (next) setName(pet.name); setOpen(next); } }}>
    <TooltipProvider delayDuration={350}><Tooltip><TooltipTrigger asChild><DialogTrigger asChild><Button variant="ghost" className="cp-icon-button" aria-label={`修改${pet.name}的名字`}><Pencil size={16}/></Button></DialogTrigger></TooltipTrigger><TooltipContent>给它起个独有的名字</TooltipContent></Tooltip></TooltipProvider>
    <DialogContent className="cp-modal shadow-none" showCloseButton={!controller.busy} onEscapeKeyDown={event => { if (controller.busy) event.preventDefault(); }} onPointerDownOutside={event => { if (controller.busy) event.preventDefault(); }}>
      <PageTransition routeKey={`rename:${pet.petId}`}><DialogHeader><DialogTitle>给伙伴起个名字</DialogTitle><DialogDescription>这是这只伙伴独有的名字。</DialogDescription></DialogHeader>
        <form onSubmit={async event => { event.preventDefault(); if (await controller.petAction('rename', pet, { name })) setOpen(false); }} className="cp-rename-form">
          <label htmlFor="cp-new-name">伙伴名字</label><Input id="cp-new-name" value={name} onChange={event => setName(event.target.value)} maxLength={48} required/>
          <small>1–24 个字符</small><ErrorNotice message={controller.error}/><DialogFooter className="cp-dialog-actions"><DialogClose asChild><Button type="button" variant="secondary" disabled={controller.busy}>取消</Button></DialogClose><Button disabled={controller.busy || !name.trim() || [...name.trim()].length > 24} type="submit">{controller.busy ? '正在保存…' : '保存名字'}</Button></DialogFooter>
        </form>
      </PageTransition>
    </DialogContent>
  </Dialog>;
}

export function PetActions({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  return <div className="cp-actions"><Button variant="secondary" disabled={controller.busy} onClick={() => controller.petAction('interact', pet)}><Heart size={17}/>摸摸</Button><Button variant="secondary" onClick={() => navigate('/inventory')}><Soup size={17}/>喂食</Button><Button variant="secondary" disabled={controller.busy} onClick={async () => { if (await controller.petAction('select', pet, { slot: 'chatPetId' })) navigate('/chat'); }}><MessageCircle size={17}/>聊聊天</Button></div>;
}

export function DesktopControls({ pet, controller }: { pet: CompanionPet; controller: Controller }) {
  const [scale, setScale] = useState(pet.desktop.scale);
  useEffect(() => setScale(pet.desktop.scale), [pet.petId, pet.desktop.scale]);
  return <div className="cp-desktop-controls">
    <div className="cp-control-row"><span><Footprints size={16}/>行为模式</span><Select value={pet.desktop.behavior} disabled={controller.busy} onValueChange={behavior => { void controller.petAction('desktop', pet, { behavior }); }}><SelectTrigger aria-label={`${pet.name}的行为模式`} className="cp-behavior-select"><SelectValue/></SelectTrigger><SelectContent>{behaviors.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
    <div className="cp-control-row"><span><Maximize2 size={16}/>外观大小</span><Slider className="cp-scale-slider" aria-label={`${pet.name}的外观大小`} value={[scale]} min={.5} max={2} step={.05} disabled={controller.busy} onValueChange={values => setScale(values[0])} onValueCommit={values => { if (values[0] !== pet.desktop.scale) void controller.petAction('desktop', pet, { scale: values[0] }); }}/><small>{Math.round(scale * 100)}%</small></div>
    <div className="cp-control-row"><span><Monitor size={17}/>在桌面显示</span><Switch aria-label={`${pet.name}在桌面显示`} checked={pet.desktop.visible} disabled={controller.busy} onCheckedChange={visible => { void controller.petAction('desktop', pet, { visible }); }}/></div>
    <Button variant="secondary" disabled={controller.busy || controller.snapshot?.selections.battlePetId === pet.petId} onClick={() => controller.petAction('select', pet, { slot: 'battlePetId' })}><Swords size={17}/>{controller.snapshot?.selections.battlePetId === pet.petId ? '当前出战伙伴' : '设为出战伙伴'}</Button>
  </div>;
}

export function LoadingOrEmpty({ controller }: { controller: Controller }) {
  if (controller.loading) return <EmptyState title="伙伴们正在赶来…"/>;
  return <EmptyState title={controller.error ? '还没能连接到伙伴' : '第一份陪伴，从这里开始。'} description={controller.error || '领养一个新伙伴，一起让桌面热闹起来。'} action={controller.error ? <Button onClick={() => controller.reload()}>重新连接</Button> : <Button onClick={() => navigate('/companions/adopt')}><Plus size={17}/>领养伙伴</Button>}/>;
}
