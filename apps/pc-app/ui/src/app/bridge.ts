import { useCallback, useEffect, useState } from 'react';
import type { AppResult, FeatureId } from '../../../../../packages/shared-types/src/app';
export async function request<T = any>(feature: FeatureId | 'app', command: string, payload?: unknown): Promise<T> {
  if (!window.lingjing) throw new Error('请在灵境桌面应用中打开此页面。');
  const result: AppResult<any> = await window.lingjing.invoke(feature, command, payload);
  if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
  return (Object.hasOwn(result, 'data') ? result.data : result) as T;
}
export const invoke = request;
export function useFeatureRequest<T = any>(feature: FeatureId | 'app', command: string, payload?: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const serialized = JSON.stringify(payload);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await request<T>(feature, command, JSON.parse(serialized || '{}'))); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [feature, command, serialized]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => window.lingjing?.subscribe('app:session', () => { void reload(); }), [reload]);
  return { data, error, loading, reload };
}
