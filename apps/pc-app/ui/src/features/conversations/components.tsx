import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { ConversationMemory, ConversationPet } from '../../../../../../packages/shared-types/src/features/conversations';
import { CompanionPortrait } from '../companions/CompanionPortrait';

export function PetAvatar({ pet, large = false }: { pet: ConversationPet; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`cv-avatar ${large ? 'cv-avatar-large' : ''}`} aria-hidden="true">
    {pet.resource?.kind === '2d' ? <CompanionPortrait resource={pet.resource} petId={pet.petId} name={pet.name}/> : pet.avatarUrl && !failed ? <img src={pet.avatarUrl} alt="" onError={() => setFailed(true)}/> : <span>{[...pet.name][0]}</span>}
  </span>;
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="cv-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="cv-icon" aria-label="关闭" onClick={close}>×</button></header>
    {children}
  </dialog>;
}
export function MemoryEditor({ pet, memory, initialText = '', save, close }: {
  pet: ConversationPet; memory?: ConversationMemory; initialText?: string;
  save: (content: string) => Promise<void>; close: () => void;
}) {
  const [text, setText] = useState(memory?.content ?? initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <Modal title={memory ? `编辑${pet.name}的记忆` : `让${pet.name}记住`} close={() => { if (!busy) close(); }}>
    <form onSubmit={event => { event.preventDefault(); setBusy(true); setError('');
      void save(text).then(close).catch(cause => setError(cause instanceof Error ? cause.message : '保存失败。')).finally(() => setBusy(false)); }}>
      <p className="cv-muted">这条记忆只属于{pet.name}。开启记忆时，会在后续聊天中用到。</p>
      <label className="cv-field">记忆内容<textarea autoFocus rows={5} maxLength={1000} value={text} onChange={event => setText(event.target.value)}/></label>
      <div className="cv-counter">{text.length}/1000</div>
      {error && <p className="cv-error" role="alert">{error}</p>}
      <footer><button type="button" className="cv-button secondary" disabled={busy} onClick={close}>取消</button>
        <button className="cv-button" disabled={busy || !text.trim()}>{busy ? '正在保存…' : '保存记忆'}</button></footer>
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
    <header className="cv-section-heading"><h3>她记得的小事 <small>{memories.length}/100</small></h3><button className="cv-link" onClick={add}>＋ 添加</button></header>
    {!enabled && <p className="cv-note">记忆已暂停，后续回复暂不使用这些内容。</p>}
    {!memories.length && <p className="cv-memory-empty">还没有保存的小事。<br/>把想让她记住的日常，留在这里。</p>}
    <ul>{memories.map(memory => <li key={memory.id}>
      <span className="cv-memory-mark" aria-hidden="true">♡</span><p>{memory.content}</p>
      <button className="cv-icon" aria-label={`编辑记忆：${memory.content.slice(0, 24)}`} onClick={() => edit(memory)} disabled={busy}>✎</button>
      <button className="cv-icon" aria-label={`删除记忆：${memory.content.slice(0, 24)}`} onClick={() => setConfirm(memory.id)} disabled={busy}>×</button>
      {confirm === memory.id && <div className="cv-delete-confirm"><span>删除后不再用于新回复。</span>
        <button className="cv-link" disabled={busy} onClick={() => setConfirm(null)}>取消</button>
        <button className="cv-link danger" disabled={busy} onClick={() => {
          setBusy(true); setError(''); void remove(memory).then(() => setConfirm(null))
            .catch(cause => setError(cause instanceof Error ? cause.message : '删除失败。')).finally(() => setBusy(false));
        }}>确认删除</button></div>}
    </li>)}</ul>
    {error && <p role="alert" className="cv-error">{error}</p>}
    <p className="cv-caption">这份记忆只属于{pet.name}。由你添加、编辑和删除。</p>
  </section>;
}
