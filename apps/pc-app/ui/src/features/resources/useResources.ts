import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterResource, ResourceProvenance, ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import { resourcesClient } from './client';
import '../../app/types';

export function useResources(client: ResourcesClient) {
  const [resources, setResources] = useState<CharacterResource[]>([]), [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<CharacterResource | null>(null), [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true), [operation, setOperation] = useState<'import' | 'save' | null>(null), [message, setMessage] = useState('');
  const alive = useRef(true), sequence = useRef(0), dirtyRef = useRef(false), operationRef = useRef(operation);
  dirtyRef.current = dirty; operationRef.current = operation;
  const reload = useCallback(async (select?: string) => {
    const request = ++sequence.current; setLoading(true);
    try {
      const result = await client.list(); if (!alive.current || request !== sequence.current) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      const next = result.data.filter(resource => resource.kind === 'spritesheet'); setResources(next);
      setSelectedId(current => select && next.some(resource => resource.id === select) ? select : next.some(resource => resource.id === current) ? current : next[0]?.id ?? '');
    } finally { if (alive.current && request === sequence.current) setLoading(false); }
  }, [client]);
  useEffect(() => { alive.current = true; void reload(); return () => { alive.current = false; ++sequence.current; }; }, [reload]);
  useEffect(() => {
    if (client !== resourcesClient) return;
    return window.lingjing?.subscribe('resources:changed', () => {
      if (operationRef.current) return;
      if (dirtyRef.current) setMessage('另一窗口已更新资源设置。请放弃修改并重新载入后再编辑。');
      else void reload();
    });
  }, [client, reload]);
  const selected = resources.find(resource => resource.id === selectedId);
  useEffect(() => { setDraft(selected ? structuredClone(selected) : null); setDirty(false); }, [selected]);
  function choose(resource: CharacterResource) { if (dirty) { setMessage('请先保存当前设置，或放弃修改后再选择角色。'); return; } setSelectedId(resource.id); setMessage(''); }
  function edit(next: CharacterResource) { setDraft(next); setDirty(true); }
  function discard() { setDraft(selected ? structuredClone(selected) : null); setDirty(false); setMessage('已放弃未保存修改。'); }
  async function save() {
    if (!draft || operation) return; setOperation('save'); operationRef.current = 'save'; setMessage('');
    try {
      const result = await client.save({ resourceId: draft.id, expectedRevision: draft.revision, calibration: draft.calibration, actions: draft.actions });
      if (!result.ok) { setMessage(result.error.message); return; }
      setResources(current => current.map(resource => resource.id === result.data.id ? result.data : resource)); setDirty(false); setMessage('2D 动作与显示设置已保存。');
    } finally { setOperation(null); operationRef.current = null; }
  }
  async function importResource(metadata: Partial<ResourceProvenance>) {
    if (operation) return;
    if (dirty) { setMessage('请先保存当前设置，或放弃修改后再导入。'); return; }
    setOperation('import'); operationRef.current = 'import'; setMessage('');
    try {
      const result = await client.importResource(metadata);
      if (!result.ok) { setMessage(result.error.message); return; }
      if (!result.data) { setMessage('已取消导入。'); return; }
      await reload(result.data.resource.id); setMessage(result.data.duplicate ? '角色已在资源库，本次导入记录已保留。' : '2D 角色导入成功，可以预览与校准动作。');
    } finally { setOperation(null); operationRef.current = null; }
  }
  return { resources, draft, selectedId, choose, edit, discard, save, importResource, reload, dirty, loading, operation, message };
}
