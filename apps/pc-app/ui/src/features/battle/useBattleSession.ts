import { useCallback, useEffect, useRef, useState } from 'react';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import type { BattleContext, BattleParticipant, BattleReport, BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { request } from '../../app/bridge';
import { reserveBattleAction, resolvedBattleAction, type BattleActionAttempt } from './action-intent';

export interface BattleOverview {
  rules: BattleRulesProfile; pets: BattleParticipant[]; selectedPetId?: string; session: BattleSession | null;
  reports: BattleReport[]; opponents: BattleParticipant[]; online: { enabled: boolean };
}
/** One owner-scoped controller for every entry, including ambiguous network actions. */
export function useBattleSession(sessionId?: string) {
  const [data, setData] = useState<BattleOverview | null>(null);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [context, setContext] = useState<BattleContext | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [syncedAt, setSyncedAt] = useState('');
  const generation = useRef(0), processing = useRef(false), syncing = useRef(false);
  const retry = useRef<BattleActionAttempt | null>(null);
  const reload = useCallback(async () => {
    const version = generation.current;
    const [overview, current] = await Promise.all([
      request<BattleOverview>('battle', 'overview'),
      sessionId ? request<BattleSession>('battle', 'snapshot', { sessionId }) : Promise.resolve(null)
    ]);
    if (version !== generation.current) return;
    setData(overview); setSession(current || overview.session); setError('');
  }, [sessionId]);
  useEffect(() => {
    const version = ++generation.current;
    void reload().catch(failure => { if (generation.current === version) setError(failure.message); });
    const reset = () => { const next = ++generation.current; retry.current = null; setData(null); setSession(null); setContext(null); setBusy(false); void reload().catch(failure => { if (generation.current === next) setError(failure.message); }); };
    const stop = window.lingjing?.subscribe('app:session', reset);
    return () => { generation.current++; stop?.(); };
  }, [reload]);
  const run = useCallback(async <T,>(task: () => Promise<T>): Promise<T | undefined> => {
    if (processing.current) return;
    const version = generation.current;
    processing.current = true; setBusy(true); setError('');
    try { const value = await task(); return version === generation.current ? value : undefined; }
    catch (failure) { if (version === generation.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { processing.current = false; if (version === generation.current) setBusy(false); }
  }, []);
  const id = session?.id;
  const sync = useCallback(async () => {
    if (!id || syncing.current || processing.current) return;
    const version = generation.current;
    syncing.current = true;
    try {
      const value = await request<BattleSession>('battle', 'sync', { sessionId: id });
      if (version !== generation.current) return;
      if(resolvedBattleAction(retry.current,value))retry.current=null;
      setSession(value); setSyncedAt(new Date().toISOString()); setError('');
    } catch (failure) { if (version === generation.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { syncing.current = false; }
  }, [id]);
  const online = session?.mode === 'friend' && ['waiting', 'active'].includes(session.status);
  useEffect(() => {
    if (!online) return;
    let delay: number | undefined;
    const stop = window.lingjing?.subscribe('battle:online', value => {
      const type = (value as { type?: string }).type;
      if (['room-updated', 'round-updated', 'realtime-status'].includes(type || '')) {
        window.clearTimeout(delay); delay = window.setTimeout(() => void sync(), 150);
      }
    });
    const timer = window.setInterval(() => { if (!document.hidden) void sync(); }, 1500);
    const reconnect = () => void sync(); window.addEventListener('online', reconnect); void sync();
    return () => { stop?.(); window.clearTimeout(delay); window.clearInterval(timer); window.removeEventListener('online', reconnect); };
  }, [online, sync]);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    void request<BattleContext>('battle', 'context', { sessionId: id }).then(value => { if (alive) setContext(value); }).catch(() => { if (alive) setContext(null); });
    return () => { alive = false; };
  }, [id, session?.revision]);
  const act = async (action: BattleActionType) => {
    if (!session) return;
    const current = session, version = generation.current;
    const result = await run(async () => {
      const attempt = reserveBattleAction(retry.current,current.id,action,current.snapshot.round+1,()=>crypto.randomUUID());
      retry.current = attempt;
      const {roundNo,...command}=attempt;
      try { return await request<BattleSession>('battle', 'act', { ...command, expectedRound: roundNo }); }
      catch (failure) {
        const saved = await request<BattleSession>('battle', 'snapshot', { sessionId: current.id });
        if (version === generation.current) setSession(saved);
        throw failure;
      }
    });
    if (result) { retry.current = null; setSession(result); }
  };
  const mutateSession = async (command: 'leave' | 'retryAction') => {
    if (!id) return;
    const result = await run(() => request<BattleSession>('battle', command, { sessionId: id }));
    if (result) setSession(result);
  };
  return { data, session, context, error, busy, syncedAt, run, reload, act, sync, setSession,
    leave: () => mutateSession('leave'), retryAction: () => mutateSession('retryAction') };
}
