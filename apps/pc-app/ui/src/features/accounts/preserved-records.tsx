import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui';
import { errorText, newActionId, request } from './api';

interface PreservedRecord {
  collection: string; id: string; reason: string; revision: number;
  local: Record<string, unknown> | null; cloud: Record<string, unknown> | null;
}
const names: Record<string, string> = {
  conversation_profiles: '伙伴人设', conversation_connections: '模型连接', conversation_messages: '聊天消息',
  conversation_memories: '伙伴记忆', conversation_preferences: '聊天选择'
};
function content(value: Record<string, unknown> | null) {
  if (!value) return '此版本没有这条记录。';
  if (typeof value.content === 'string') return value.content || '空消息';
  if (typeof value.persona === 'string') return `${value.persona || '默认人设'}\n独立模型连接：${value.use_override ? '开启' : '关闭'}\n记忆：${value.memory_enabled ? '开启' : '关闭'}`;
  if (typeof value.base_url === 'string') return `${value.provider} · ${value.model}\n${value.base_url}`;
  return '已保存的伙伴选择';
}
export function PreservedRecords({ onChanged }: { onChanged: () => Promise<void> }) {
  const [records, setRecords] = useState<PreservedRecord[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const generation = useRef(0);
  const actions = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    const current = ++generation.current;
    try { const result = await request<PreservedRecord[]>('preservedRecords'); if (current === generation.current) { setRecords(result); setError(''); } }
    catch (cause) { if (current === generation.current) setError(errorText(cause)); }
  }, []);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  async function choose(record: PreservedRecord, decision: 'local' | 'cloud') {
    if (busy) return;
    const key = JSON.stringify([record.collection, record.id, record.reason, decision]);
    const actionId = actions.current.get(key) ?? newActionId(); actions.current.set(key, actionId);
    setBusy(key); setError('');
    try {
      await request('resolvePreservedRecord', { collection: record.collection, id: record.id, reason: record.reason, revision: record.revision, decision, actionId });
      actions.current.delete(key); await load(); await onChanged();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(null); }
  }
  return <section aria-label="保留的本机记录" className="ac-stack">
    <p className="ac-hint">逐条选择要继续使用的版本。原记录与备份会保留，其他功能可继续使用。</p>
    {records.map(record => <section className="ac-card" key={JSON.stringify([record.collection, record.id, record.reason])}>
      <h3>{names[record.collection] || '保留记录'}</h3>
      <div className="ac-stack"><div><strong>云端版本</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content(record.cloud)}</p></div>
        <div><strong>原本机版本</strong><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{content(record.local)}</p></div></div>
      <div className="ac-actions"><Button disabled={Boolean(busy)} onClick={() => void choose(record, 'cloud')}>保留云端版本</Button>
        <Button className="ac-secondary" disabled={Boolean(busy)} onClick={() => void choose(record, 'local')}>采用原记录</Button></div>
    </section>)}
    {!records.length && !error && <p role="status">没有待处理的保留记录。</p>}
    {error && <p role="alert" className="ac-error">{error}</p>}
  </section>;
}
