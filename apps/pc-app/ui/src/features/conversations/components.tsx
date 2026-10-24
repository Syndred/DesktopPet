import { useState, type ReactNode } from 'react';
import type { ConversationMemory, ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import { Pencil, Trash2, Heart, Plus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { AnimatedList, MotionPanel } from '../../components/motion';
import { CompanionPortrait } from '../companions/CompanionPortrait';

export function PetAvatar({ pet, large = false }: { pet: ConversationPet; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`cv-avatar ${large ? 'cv-avatar-large' : ''}`} aria-hidden="true">
    {pet.resource && pet.resource.resourceId !== 'builtin:lingjing-yuwan-v1' ? <CompanionPortrait petId={pet.petId} name={pet.name} resource={pet.resource}/> :
      pet.avatarUrl && /\.(png|jpe?g|webp)(?:$|\?)/i.test(pet.avatarUrl) && !failed ? <img src={pet.avatarUrl} alt="" onError={() => setFailed(true)}/> :
        <span className="cv-avatar-art" data-character="lingjing-yuwan-2d" style={{ backgroundImage: 'url("./illustrations/yuwan-sprites-v1.png")' }}/>}
  </span>;
}
export function PetScene({ pet }: { pet: ConversationPet }) {
  if (pet.resource && pet.resource.resourceId !== 'builtin:lingjing-yuwan-v1') return <figure className="cv-pet-scene cv-custom-scene">
    <CompanionPortrait petId={pet.petId} name={pet.name} resource={pet.resource}/>
  </figure>;
  return <figure className="cv-pet-scene"><img src="./illustrations/companionship-room-v1.png" alt={`${pet.name}在湖畔房间陪伴你`} draggable={false}/></figure>;
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
  return <TooltipProvider delayDuration={350}><Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{text}</TooltipContent></Tooltip></TooltipProvider>;
}
export function MemoryEditor({ pet, memory, initialText = '', save, close }: {
  pet: ConversationPet; memory?: ConversationMemory; initialText?: string;
  save: (content: string) => Promise<void>; close: () => void;
}) {
  const [text, setText] = useState(memory?.content ?? initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Modal title={memory ? `编辑${pet.name}的记忆` : `让${pet.name}记住`} close={close} busy={busy}>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError('');
      void save(text).then(close).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(false)); }}>
      <p className="cv-muted">这条记忆只属于{pet.name}。开启记忆时，会在后续聊天中用到。</p>
      <label className="cv-field">记忆内容<Textarea autoFocus rows={5} maxLength={1000} value={text} onChange={event => setText(event.target.value)}/></label>
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
  return <section className="cv-card cv-memories" aria-label={`${pet.name}的独立记忆`}>
    <header className="cv-section-heading"><h3>她记得的小事 <small>{memories.length}/100</small></h3><Button variant="ghost" className="cv-link" onClick={add}><Plus size={13}/>添加记忆</Button></header>
    {!enabled && <p className="cv-note">记忆已暂停，后续回复暂不使用这些内容。</p>}
    {!memories.length && <p className="cv-memory-empty">还没有保存的小事。<br/>把想让她记住的日常，留在这里。</p>}
    <AnimatedList className="cv-memory-list"><ul>{memories.map(memory => <li key={memory.id}>
      <span className="cv-memory-mark" aria-hidden="true"><Heart size={18} fill="currentColor"/></span><p>{memory.content}</p>
      <ActionHint text="编辑这条记忆"><Button variant="ghost" className="cv-icon" aria-label={`编辑记忆：${memory.content.slice(0, 24)}`} onClick={() => edit(memory)} disabled={busy}><Pencil size={14}/></Button></ActionHint>
      <ActionHint text="删除这条记忆"><Button variant="ghost" className="cv-icon" aria-label={`删除记忆：${memory.content.slice(0, 24)}`} onClick={() => setConfirm(memory.id)} disabled={busy}><Trash2 size={14}/></Button></ActionHint>
      {confirm === memory.id && <div className="cv-delete-confirm"><span>删除后不再用于新回复。</span>
        <Button variant="ghost" className="cv-link" disabled={busy} onClick={() => setConfirm(null)}>取消</Button>
        <Button variant="ghost" className="cv-link danger" disabled={busy} onClick={() => {
          setBusy(true); setError(''); void remove(memory).then(() => setConfirm(null))
            .catch(cause => setError(cause instanceof Error ? cause.message : '删除失败。')).finally(() => setBusy(false));
        }}>确认删除</Button></div>}
    </li>)}</ul></AnimatedList>
    {error && <p role="alert" className="cv-error">{error}</p>}
    <p className="cv-caption">这份记忆只属于{pet.name}。由你添加、编辑和删除。</p>
  </section>;
}
