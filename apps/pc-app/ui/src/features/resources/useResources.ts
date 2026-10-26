import { useCallback, useEffect, useRef, useState } from 'react';
import type { CharacterResource, ResourceProvenance, ResourcesClient } from '../../../../../../packages/shared-types/src/features/resources';
import type { AccountsSession } from '../../../../../../packages/shared-types/src/features/accounts';
import { resourcesClient } from './client';
import '../../app/types';

type Operation = 'import' | 'save' | null;
type View = { resources: CharacterResource[]; selected: CharacterResource | null; draft: CharacterResource | null; dirty: boolean };
const emptyView = (): View => ({ resources: [], selected: null, draft: null, dirty: false });
const updatedMessage = '当前角色资源已更新，未保存的修改已保留。请放弃修改后载入最新设置。';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function sameResource(left: CharacterResource | null | undefined, right: CharacterResource | null | undefined) {
  // Revision is part of the saved baseline even when the document is identical:
  // an older draft must still encounter the normal expectedRevision CAS guard.
  return left === right || Boolean(left && right && canonical(left) === canonical(right));
}
function sessionOwner(value: unknown): string | null | undefined {
  const user = (value as AccountsSession | null)?.currentUser;
  if (user === null) return null;
  return user && (user.ownerAccountId || user.id) || undefined;
}

export function useResources(client: ResourcesClient) {
  const [view, setView] = useState<View>(emptyView), [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<Operation>(null), [message, setMessage] = useState('');
  const current = useRef(view), alive = useRef(false), sequence = useRef(0);
  const scope = useRef<{ owner: string | null | undefined }>({ owner: undefined });
  const operationRef = useRef<Operation>(null), operationVersion = useRef(0), pendingRefresh = useRef(false);
  const commit = useCallback((next: View) => { current.current = next; setView(next); }, []);
  const reload = useCallback(async (select?: string, duringImport = false) => {
    if (!alive.current || scope.current.owner === undefined) return;
    if (operationRef.current && !duringImport) { pendingRefresh.current = true; return; }
    const request = ++sequence.current, owner = scope.current, version = operationVersion.current;
    const active = () => alive.current && scope.current === owner && request === sequence.current
      && version === operationVersion.current;
    setLoading(true);
    try {
      const result = await client.list(); if (!active()) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      const before = current.current, previous = new Map(before.resources.map(resource => [resource.id, resource]));
      const next = result.data.filter(resource => resource.kind === 'spritesheet').map(resource => {
        const saved = previous.get(resource.id); return saved && sameResource(saved, resource) ? saved : resource;
      });
      const fresh = next.find(resource => resource.id === before.selected?.id);
      if (before.dirty) {
        // Notifications invalidate the list, not the draft. Compare against the
        // saved selection; comparing against the edited draft would misreport
        // the user's own unsaved calibration as an external change.
        commit({ ...before, resources: next });
        if (!sameResource(before.selected, fresh)) setMessage(updatedMessage);
        else setMessage(value => value === updatedMessage ? '' : value);
      } else {
        const selected = (select && next.find(resource => resource.id === select)) || fresh || next[0] || null;
        const unchanged = sameResource(before.selected, selected);
        commit({ resources: next, selected: unchanged ? before.selected : selected,
          draft: unchanged ? before.draft : selected ? structuredClone(selected) : null, dirty: false });
      }
    } catch { if (active()) setMessage('资源服务连接中断，请重新载入。'); }
    finally { if (active()) setLoading(false); }
  }, [client, commit]);
  useEffect(() => {
    alive.current = true; scope.current = { owner: undefined }; commit(emptyView()); setLoading(true);
    const initialScope = scope.current;
    const acceptSession = (value: unknown) => {
      const owner = sessionOwner(value); if (owner === undefined) return;
      if (owner !== null && owner === scope.current.owner) {
        // Profile updates also emit session-changed for the current owner.
        // Preserve this operation's scope/lock; coalesce its refresh until done.
        if (operationRef.current) pendingRefresh.current = true; else void reload();
        return;
      }
      scope.current = { owner }; ++sequence.current; ++operationVersion.current;
      operationRef.current = null; pendingRefresh.current = false; setOperation(null); setLoading(false);
      commit(emptyView()); setMessage('');
      if (owner !== null) void reload();
    };
    const bridge = client === resourcesClient ? window.lingjing : undefined;
    const offResource = bridge?.subscribe('resources:changed', value => {
      const owner = (value as { ownerAccountId?: unknown } | null)?.ownerAccountId;
      if (typeof owner === 'string' && owner !== scope.current.owner) return;
      if (operationRef.current) pendingRefresh.current = true; else void reload();
    });
    const offSession = bridge?.subscribe('accounts:session-changed', acceptSession);
    if (bridge) {
      // Bind reads to the public current owner before accepting resource events.
      // A session event invalidates this initial reply and every pending read.
      void bridge.invoke<AccountsSession>('accounts', 'session').then(result => {
        if (!alive.current || scope.current !== initialScope) return;
        if (result.ok) acceptSession(result.data);
        else { setMessage(result.message); setLoading(false); }
      }).catch(() => {
        if (alive.current && scope.current === initialScope) { setMessage('账号状态暂时无法读取，请重新打开角色资源。'); setLoading(false); }
      });
    } else { scope.current = { owner: null }; void reload(); }
    return () => {
      alive.current = false; scope.current = { owner: undefined }; ++sequence.current; ++operationVersion.current;
      operationRef.current = null; pendingRefresh.current = false; offResource?.(); offSession?.();
    };
  }, [client, commit, reload]);
  function choose(resource: CharacterResource) {
    if (operationRef.current) return;
    if (current.current.dirty) { setMessage('请先保存当前设置，或放弃修改后再选择角色。'); return; }
    const selected = current.current.resources.find(value => value.id === resource.id); if (!selected) return;
    ++sequence.current; setLoading(false); commit({ ...current.current, selected, draft: structuredClone(selected), dirty: false }); setMessage('');
  }
  function edit(next: CharacterResource) {
    if (!operationRef.current && next.id === current.current.selected?.id) commit({ ...current.current, draft: next, dirty: true });
  }
  function discard() {
    if (operationRef.current) return;
    ++sequence.current; setLoading(false);
    const before = current.current, selected = before.resources.find(resource => resource.id === before.selected?.id) || before.resources[0] || null;
    commit({ ...before, selected, draft: selected ? structuredClone(selected) : null, dirty: false }); setMessage('已放弃未保存修改。');
  }
  function begin(kind: Exclude<Operation, null>) {
    ++sequence.current; const version = ++operationVersion.current, owner = scope.current;
    operationRef.current = kind; setOperation(kind); setLoading(false); setMessage('');
    return () => alive.current && scope.current === owner && version === operationVersion.current;
  }
  function finish(active: () => boolean) {
    if (!active()) return;
    operationRef.current = null; setOperation(null);
    if (pendingRefresh.current) { pendingRefresh.current = false; void reload(); }
  }
  async function save() {
    const draft = current.current.draft;
    if (!draft || operationRef.current || scope.current.owner === undefined) return;
    const active = begin('save');
    try {
      const result = await client.save({ resourceId: draft.id, expectedRevision: draft.revision, calibration: draft.calibration, actions: draft.actions });
      if (!active()) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      const saved = result.data, resources = current.current.resources.filter(resource => resource.id !== saved.id);
      const index = current.current.resources.findIndex(resource => resource.id === saved.id);
      resources.splice(index < 0 ? resources.length : index, 0, saved);
      commit({ resources, selected: saved, draft: structuredClone(saved), dirty: false }); setMessage('2D 动作与显示设置已保存。');
    } catch { if (active()) setMessage('资源服务连接中断，请重新载入。'); }
    finally { finish(active); }
  }
  async function importResource(metadata: Partial<ResourceProvenance>) {
    if (operationRef.current || scope.current.owner === undefined) return;
    if (current.current.dirty) { setMessage('请先保存当前设置，或放弃修改后再导入。'); return; }
    const active = begin('import');
    try {
      const result = await client.importResource(metadata); if (!active()) return;
      if (!result.ok) { setMessage(result.error.message); return; }
      if (!result.data) { setMessage('已取消导入。'); return; }
      await reload(result.data.resource.id, true); if (!active()) return;
      setMessage(result.data.duplicate ? '角色已在资源库，本次导入记录已保留。' : '2D 角色导入成功，可以预览与校准动作。');
    } catch { if (active()) setMessage('资源服务连接中断，请重新载入。'); }
    finally { finish(active); }
  }
  return { resources: view.resources, draft: view.draft, selectedId: view.selected?.id ?? '', choose, edit, discard, save, importResource, reload,
    dirty: view.dirty, loading, operation, message };
}
