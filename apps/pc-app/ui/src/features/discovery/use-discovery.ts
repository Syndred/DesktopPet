import { useCallback, useEffect, useRef, useState } from 'react';
import { request } from '../../app/bridge';
import { motionTokens } from '../../components/motion';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';

let explorationViews = 0;
let handoff: ReturnType<typeof setTimeout> | undefined;
const inExploration = () => /^#\/discovery(?:\/|$|\?)/.test(window.location.hash);
const setExploring = (active: boolean) => { void window.lingjing?.invoke('discovery', 'setExploring', { active }).catch(() => {}); };
function claimExploration() {
  ++explorationViews;
  clearTimeout(handoff);
  const update = () => setExploring(inExploration() && document.visibilityState === 'visible');
  update();
  document.addEventListener('visibilitychange', update);
  window.addEventListener('hashchange', update);
  return () => {
    document.removeEventListener('visibilitychange', update);
    window.removeEventListener('hashchange', update);
    if (--explorationViews > 0) return;
    clearTimeout(handoff);
    if (!inExploration() || document.hidden) { setExploring(false); return; }
    // PageTransition replaces the old discovery page before mounting the next
    // one. Keep the explicit watch only across this bounded, visible handoff.
    // An error/unmount without a replacement still releases the location lease.
    handoff = setTimeout(() => { if (!explorationViews) setExploring(false); }, (motionTokens.duration + motionTokens.exit) * 1000 + 50);
  };
}

export function useDiscovery() {
  const [data, setData] = useState<DiscoverySnapshot | null>(null);
  const [error, setError] = useState('');
  const [snapshotError, setSnapshotError] = useState('');
  const [pending, setPending] = useState(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const alive = useRef(true), generation = useRef(0), sessionGeneration = useRef(0), locked = useRef(false);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try { const state = await request<DiscoverySnapshot>('discovery', 'snapshot'); if (alive.current && generation.current === current) { setData(state); setSnapshotError(''); } }
    catch (e) { if (alive.current && generation.current === current) setSnapshotError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => {
    alive.current = true;
    const release = claimExploration();
    void refresh();
    const subscriptions = ['discovery:changed', 'discovery:location', 'companions:changed', 'garden:changed'].map(event => window.lingjing?.subscribe(event, () => void refresh()));
    for (const event of ['app:session','accounts:session-changed']) subscriptions.push(window.lingjing?.subscribe(event, () => {
      ++generation.current; ++sessionGeneration.current; locked.current = false; setPending(false); setError(''); setSessionEpoch(value => value + 1); setData(null); setSnapshotError('');
      setExploring(inExploration() && document.visibilityState === 'visible'); void refresh();
    }));
    const timer = setInterval(() => { if(document.visibilityState === 'visible') void refresh(); }, 15000);
    return () => { alive.current = false; ++sessionGeneration.current;clearInterval(timer);release(); for (const off of subscriptions) off?.(); };
  }, [refresh]);
  const run = useCallback(async <T,>(command: string, payload?: unknown): Promise<T | undefined> => {
    if (locked.current) return undefined;
    const epoch = sessionGeneration.current;
    const current = () => alive.current && sessionGeneration.current === epoch;
    locked.current = true; setPending(true); setError('');
    try {
      const result = await request<T>('discovery', command, payload);
      if (!current()) return undefined;
      await refresh();
      return current() ? result : undefined;
    } catch (e) {
      if (current()) { setError(e instanceof Error ? e.message : String(e)); await refresh(); }
      return undefined;
    } finally { if (current()) { locked.current = false; setPending(false); } }
  }, [refresh]);
  return { data, error: snapshotError || error, pending, run, refresh, sessionEpoch };
}
export const actionId = () => crypto.randomUUID();
