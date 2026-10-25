import { useEffect, useState } from 'react';
import type { ConversationCommands, ConversationPet, LegacyConversationPreview, LegacyConversationImportResult } from '../../../../../../packages/shared-types/src/features/conversations';
import { Modal, InfoHint, ActionHint } from './components';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';

type Request = <K extends keyof ConversationCommands>(command: K, payload: ConversationCommands[K]['input']) => Promise<ConversationCommands[K]['output']>;

export function LegacyImportDialog({ pet, request, close, done }: {
  pet?: ConversationPet; request: Request; close: () => void; done: (result: LegacyConversationImportResult) => Promise<void>;
}) {
  const [preview, setPreview] = useState<LegacyConversationPreview | null>(null);
  const [assign, setAssign] = useState(false);
  const [includeSettings, setIncludeSettings] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedPet = assign ? pet?.petId : null;
  useEffect(() => {
    let current = true; setLoading(true); setError('');
    void request('legacy.preview', { unassignedPetId: selectedPet }).then(value => { if (current) setPreview(value); })
      .catch(cause => { if (current) setError(cause instanceof Error ? cause.message : '读取失败。'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [request, selectedPet]);
  const count = (preview?.messages ?? 0) + (includeSettings ? (preview?.memories ?? 0) + (preview?.profiles ?? 0) : 0);
  return <Modal title="导入旧记录" close={close} busy={busy}>
    <div className="cv-section-heading"><p>本账号的旧记录</p><InfoHint label="旧记录提示" text="从已归档的记录导入。冲突时会停止合并，原始存档保留。"/></div>
    {loading ? <p role="status">读取中…</p> : preview?.sourceHash ? <>
      <div className="cv-import-counts"><span>消息 {preview.messages}</span><span>记忆 {preview.memories}</span><span>人设 {preview.profiles}</span></div>
      {preview.unassigned > 0 && pet && <label className="cv-check"><Checkbox checked={assign} disabled={busy}
        onCheckedChange={value => setAssign(value === true)}/>未归属消息导入到{pet.name}</label>}
      {(preview.memories > 0 || preview.profiles > 0) && <label className="cv-check"><Checkbox checked={includeSettings} disabled={busy}
        onCheckedChange={value => setIncludeSettings(value === true)}/>包含人设与记忆</label>}
      {preview.unresolved > 0 && <p className="cv-note">{preview.unresolved} 条归属或格式待确认，原始存档保留。</p>}
      {preview.samples.length > 0 && <ul className="cv-import-samples">{preview.samples.map((sample,index) => <li key={`${sample.petId}:${index}`}>
        <strong>{sample.role === 'user' ? '我' : preview.pets.find(item => item.petId === sample.petId)?.name || '伙伴'}</strong><p>{sample.content}</p>
      </li>)}</ul>}
    </> : <p>没有可导入的旧记录。</p>}
    {error && <p className="cv-error" role="alert">{error}</p>}
    <footer><Button type="button" variant="secondary" className="cv-button secondary" onClick={close} disabled={busy}>取消</Button>
      <ActionHint text={loading ? '正在读取旧记录。' : count === 0 ? '没有可导入的记录。' : '合并所选记录，原始存档保留。'}>
        <Button className="cv-button" disabled={busy || loading || !preview?.sourceHash || count === 0} onClick={() => {
          if (!preview?.sourceHash) return; setBusy(true); setError('');
          void request('legacy.import', {sourceHash:preview.sourceHash,includeSettings,unassignedPetId:selectedPet})
            .then(done).catch(cause => setError(cause instanceof Error ? cause.message : '导入失败。')).finally(() => setBusy(false));
        }}>{busy ? '导入中…' : '导入'}</Button>
      </ActionHint>
    </footer>
  </Modal>;
}
