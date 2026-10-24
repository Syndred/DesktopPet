import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../app/bridge';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';

export function useDiscovery() {
  const [data, setData] = useState<DiscoverySnapshot | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const alive = useRef(true), generation = useRef(0), locked = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try { const state = await request<DiscoverySnapshot>('discovery', 'snapshot'); if (alive.current && generation.current === current) setData(state); }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const exploring = () => {void window.lingjing?.invoke('discovery', 'setExploring', {active:document.visibilityState === 'visible'}).catch(() => {});};
    exploring(); void refresh();document.addEventListener('visibilitychange', exploring);
    const subscriptions = ['discovery:changed', 'discovery:location', 'app:session', 'companions:changed', 'garden:changed'].map(event => window.lingjing?.subscribe(event, () => void refresh()));
    subscriptions.push(window.lingjing?.subscribe('accounts:session-changed', () => { exploring(); void refresh(); }));
    const timer = setInterval(() => { if(document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => { alive.current = false;clearInterval(timer);document.removeEventListener('visibilitychange', exploring);void window.lingjing?.invoke('discovery', 'setExploring', {active:false}).catch(() => {}); for (const off of subscriptions) off?.(); };
  }, [refresh]);
  const run = useCallback(async <T,>(command: string, payload?: unknown): Promise<T | undefined> => {
    if (locked.current) return undefined;
    locked.current = true; setPending(true); setError('');
    try { const result = await request<T>('discovery', command, payload); await refresh(); return result; }
    catch (e) { if (alive.current) setError(e instanceof Error ? e.message : String(e)); await refresh(); return undefined; }
    finally { locked.current = false; if (alive.current) setPending(false); }
  }, [refresh]);
  return { data, error, pending, run, refresh };
}
export const actionId = () => crypto.randomUUID();
