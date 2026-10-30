import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppResult, FeatureId } from '../../../../../packages/shared-types/src/app';
import type { IpcFeature, IpcCommand, IpcArguments, IpcOutput } from '../../../../../packages/shared-types/src/ipc';
export function command<Feature extends IpcFeature, Command extends IpcCommand<Feature>>(feature: Feature, method: Command, ...args: IpcArguments<Feature, Command>): Promise<AppResult<IpcOutput<Feature, Command>>> {
  return window.lingjing.call(feature, method, ...args);
}
export function useCommand<Feature extends IpcFeature, Command extends IpcCommand<Feature>>(feature: Feature, method: Command, ...args: IpcArguments<Feature, Command>) {
  return useFeatureRequest<IpcOutput<Feature, Command>>(feature, method, args[0]);
}
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
  const generation = useRef(0);
  const active = useRef(false);
  const serialized = JSON.stringify(payload);
  const reload = useCallback(async () => {
    if (!active.current) return;
    const current = ++generation.current;
    const isCurrent = () => active.current && generation.current === current;
    setLoading(true);
    try {
      const result = await request<T>(feature, command, JSON.parse(serialized || '{}'));
      if (isCurrent()) { setData(result); setError(''); }
    } catch (e) { if (isCurrent()) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (isCurrent()) setLoading(false); }
  }, [feature, command, serialized]);
  useEffect(() => {
    active.current = true;
    setData(null); setError('');
    void reload();
    return () => { active.current = false; ++generation.current; };
  }, [reload]);
  useEffect(() => {
    const sessionChanged = () => {
      if (!active.current) return;
      // Never show the previous session's result while the new read is pending.
      setData(null); setError('');
      void reload();
    };
    const offApp = window.lingjing?.subscribe('app:session', sessionChanged);
    const offAccounts = window.lingjing?.subscribe('accounts:session-changed', sessionChanged);
    return () => { offApp?.(); offAccounts?.(); };
  }, [reload]);
  return { data, error, loading, reload };
}
