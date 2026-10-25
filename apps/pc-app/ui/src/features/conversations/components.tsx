import { isValidElement, useEffect, useState, type ReactNode } from 'react';
import type { ConversationMemory, ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import type { ResourceDisplay } from '../../../../../../packages/shared-types/src/features/resources';
import { Pencil, Trash2, Heart, Plus, X, ImageOff, CircleHelp, Pause, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { AnimatedList, MotionPanel } from '../../components/motion';
import { ResourcePortrait } from '../resources/ResourcePortrait';
import { useFeatureRequest } from '../../app/bridge';
import { ElementMark } from '../battle/BattleMoves';
import { elements } from '../battle/presentation';
import { petIdentityHint, petIdentityLabel } from './identity';

function StaticPortrait({ petId, resourceId, label }: { petId: string; resourceId: string; label?: string }) {
  const { data, reload } = useFeatureRequest<ResourceDisplay>('resources', 'resolve', {
    petId, resourceId, context: 'desktop', action: 'idle'
  });
  useEffect(() => window.lingjing.subscribe('resources:changed', value => {
    if ((value as { resourceId?: string } | null)?.resourceId === resourceId) void reload();
  }), [resourceId, reload]);
  return data ? <ResourcePortrait resource={data.resource} framing="portrait" decorative={!label} label={label}/> : <ImageOff size={20} aria-label={label ? `${label}暂不可用` : undefined} aria-hidden={!label || undefined}/>;
}

export function PetAvatar({ pet, large = false }: { pet: ConversationPet; large?: boolean }) {
  return <span className={`cv-avatar ${large ? 'cv-avatar-large' : ''}`} aria-hidden="true" title={petIdentityHint(pet)} data-pet-id={pet.petId} data-resource-id={pet.resource?.resourceId}>
    {pet.resource?.kind === '2d' ? <StaticPortrait key={`${pet.petId}:${pet.resource.resourceId}`} petId={pet.petId} resourceId={pet.resource.resourceId}/> : <ImageOff size={20}/>}
  </span>;
}
export function PetScene({ pet }: { pet: ConversationPet }) {
  return <figure className="cv-pet-scene cv-custom-scene" aria-label={`${petIdentityLabel(pet)}的当前形象`} data-pet-id={pet.petId} data-resource-id={pet.resource?.resourceId}>
    {pet.resource?.kind === '2d' ? <StaticPortrait key={`${pet.petId}:${pet.resource.resourceId}`} petId={pet.petId} resourceId={pet.resource.resourceId} label={`${petIdentityLabel(pet)}近景`}/> : <div className="cv-scene-unavailable"><ImageOff size={30}/><span>形象暂不可用</span></div>}
  </figure>;
}
export function petElementLabel(pet: ConversationPet) { return pet.element ? `${elements[pet.element].label}系` : ''; }
export function PetElement({ pet, hint = true }: { pet: ConversationPet; hint?: boolean }) {
  if (!pet.element) return null;
  const mark = <span className="cv-element" data-element={pet.element} role={hint ? 'img' : undefined} aria-label={hint ? petElementLabel(pet) : undefined} aria-hidden={!hint || undefined} tabIndex={hint ? 0 : undefined}><ElementMark element={pet.element} size={13}/></span>;
  return hint ? <ActionHint text={petElementLabel(pet)}>{mark}</ActionHint> : mark;
}
export function Modal({ title, children, close, busy = false }: { title: string; children: ReactNode; close: () => void; busy?: boolean }) {
  // Controlled editors can be invoked by several buttons. Use Radix's focus
  // lifecycle callback, after its focus scope unmounts, to restore the caller.
  const [returnFocus] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  return <Dialog open onOpenChange={open => { if (!open && !busy) close(); }}>
    <DialogContent className="app-dialog-content border-0 bg-transparent p-0 shadow-none" aria-describedby={undefined} showCloseButton={false}
      onCloseAutoFocus={event => { if (returnFocus?.isConnected) { event.preventDefault(); returnFocus.focus(); } }}
      onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
      <DialogTitle className="sr-only">{title}</DialogTitle><MotionPanel><div className="cv-dialog">
    <header><h2>{title}</h2><Button type="button" variant="ghost" className="cv-icon" aria-label="关闭" disabled={busy} onClick={close}><X size={18}/></Button></header>{children}
      </div></MotionPanel>
    </DialogContent>
  </Dialog>;
}
export function FormSelect({ label, value, options, onValueChange, disabled = false }: { label: string; value: string;
  options: { value: string; label: string }[]; onValueChange: (value: string) => void; disabled?: boolean;
}) {
  return <Select value={value} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger className="cv-select-trigger" aria-label={label}><SelectValue/></SelectTrigger>
    <SelectContent className="cv-select-content">{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}
export function ActionHint({ text, children }: { text: string; children: ReactNode }) {
  const disabled = isValidElement<{ disabled?: boolean }>(children) && children.props.disabled;
  return <TooltipProvider delayDuration={250}><Tooltip><TooltipTrigger asChild>{disabled ? <span className="cv-disabled-hint" tabIndex={0} role="group" aria-label={text}>{children}</span> : children}</TooltipTrigger><TooltipContent className="cv-tooltip">{text}</TooltipContent></Tooltip></TooltipProvider>;
}
export function InfoHint({ label, text, icon: Icon = CircleHelp }: { label: string; text: string; icon?: LucideIcon }) {
  return <ActionHint text={text}><Button type="button" variant="ghost" className="cv-icon cv-info-hint" aria-label={label}><Icon size={14}/></Button></ActionHint>;
}
export function MemoryEditor({ pet, memory, initialText = '', save, close }: {
  pet: ConversationPet; memory?: ConversationMemory; initialText?: string;
  save: (content: string) => Promise<void>; close: () => void;
}) {
  const [text, setText] = useState(memory?.content ?? initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Modal title={`${petIdentityLabel(pet)}的记忆`} close={close} busy={busy}>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError('');
      void save(text).then(close).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(false)); }}>
      <label className="cv-field">记忆内容<Textarea autoFocus rows={5} maxLength={1000} value={text} placeholder="想让 TA 记住什么？" onChange={event => setText(event.target.value)}/></label>
      <div className="cv-counter">{text.length}/1000</div>
      {error && <p className="cv-error" role="alert">{error}</p>}
      <footer><Button type="button" variant="secondary" className="cv-button secondary" disabled={busy} onClick={close}>取消</Button>
        <Button className="cv-button" disabled={busy || !text.trim()}>{busy ? '正在保存…' : '保存记忆'}</Button></footer>
    </form>
  </Modal>;
}
export function MemoryPanel({ pet, memories, enabled, edit, add, remove }: {
  pet: ConversationPet; memories: ConversationMemory[]; enabled: boolean;
  edit: (memory: ConversationMemory) => void; add: () => void; remove: (memory: ConversationMemory) => Promise<void>;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <section className="cv-card cv-memories" aria-label={`${petIdentityLabel(pet)}的独立记忆`}>
    <header className="cv-section-heading"><h3>记忆 <small>{memories.length}/100</small></h3><div className="cv-card-tools">
      {!enabled && <ActionHint text="后续回复暂不使用记忆，已保存内容仍保留。"><span className="cv-memory-paused" tabIndex={0} role="img" aria-label="记忆已暂停"><Pause size={13}/></span></ActionHint>}
      <InfoHint label="记忆提示" text="仅用于这位伙伴的后续回复；删除记忆不会清空聊天历史。"/>
      <ActionHint text="添加记忆"><Button variant="ghost" className="cv-icon" aria-label="添加记忆" onClick={add}><Plus size={16}/></Button></ActionHint>
    </div></header>
    {!memories.length && <p className="cv-memory-empty">暂无记忆</p>}
    <AnimatedList className="cv-memory-list"><ul>{memories.map(memory => <li key={memory.id}>
      <span className="cv-memory-mark" aria-hidden="true"><Heart size={18} fill="currentColor"/></span><p>{memory.content}</p>
      <ActionHint text="编辑这条记忆"><Button variant="ghost" className="cv-icon" aria-label={`编辑记忆：${memory.content.slice(0, 24)}`} onClick={() => edit(memory)} disabled={busy}><Pencil size={14}/></Button></ActionHint>
      <ActionHint text="删除这条记忆"><Button variant="ghost" className="cv-icon" aria-label={`删除记忆：${memory.content.slice(0, 24)}`} onClick={() => setConfirm(memory.id)} disabled={busy}><Trash2 size={14}/></Button></ActionHint>
      {confirm === memory.id && <div className="cv-delete-confirm"><span>删除记忆？聊天历史保留。</span>
        <Button variant="ghost" className="cv-link" disabled={busy} onClick={() => setConfirm(null)}>取消</Button>
        <Button variant="ghost" className="cv-link danger" disabled={busy} onClick={() => {
          setBusy(true); setError(''); void remove(memory).then(() => setConfirm(null))
            .catch(cause => setError(cause instanceof Error ? cause.message : '删除失败。')).finally(() => setBusy(false));
        }}>确认删除</Button></div>}
    </li>)}</ul></AnimatedList>
    {error && <p role="alert" className="cv-error">{error}</p>}
  </section>;
}
