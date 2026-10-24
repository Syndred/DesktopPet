import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanionMutation, CompanionPet, CompanionResult, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions/index';
import '../../app/types';

export const actionId = () => crypto.randomUUID();
export async function companionsRequest<T>(command: string, payload?: unknown): Promise<T> {
  if (!window.lingjing) throw new Error('请在灵境桌面应用中打开。');
  const result = await window.lingjing.invoke('companions', command, payload) as CompanionResult<T>;
  if (!result.ok) throw Object.assign(new Error(result.message), { code: result.code });
  return result.data;
}

export function useCompanions() {
  const [snapshot, setSnapshot] = useState<CompanionsSnapshot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requestGeneration = useRef(0);
  const mutationLock = useRef(false);
  const mounted = useRef(true);
  const reload = useCallback(async () => {
    const generation = ++requestGeneration.current;
    try {
      const data = await companionsRequest<CompanionsSnapshot>('list');
      if (mounted.current && generation === requestGeneration.current) { setSnapshot(data); setError(''); }
    } catch (failure) {
      if (mounted.current && generation === requestGeneration.current) { setError(failure instanceof Error ? failure.message : String(failure)); setSnapshot(null); }
    } finally { if (mounted.current && generation === requestGeneration.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; void reload();
    const unsubscribe = window.lingjing?.subscribe('companions:changed', () => { void reload(); });
    const sessionUnsubscribe = window.lingjing?.subscribe('app:session', () => {
      requestGeneration.current += 1; setSnapshot(null); setLoading(true); void reload();
    });
    return () => { mounted.current = false; requestGeneration.current += 1; unsubscribe?.(); sessionUnsubscribe?.(); };
  }, [reload]);
  const mutate = useCallback(async (command: string, payload: Record<string, unknown>) => {
    if (mutationLock.current) return null;
    mutationLock.current = true; setBusy(true); setError('');
    try {
      const result = await companionsRequest<CompanionMutation>(command, { actionId: actionId(), ...payload });
      await reload(); return result;
    } catch (failure) {
      await reload();
      if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    } finally { mutationLock.current = false; if (mounted.current) setBusy(false); }
  }, [reload]);
  const petAction = (command: string, pet: CompanionPet, payload: Record<string, unknown> = {}) => mutate(command, { petId: pet.petId, expectedRevision: pet.revision, ...payload });
  return { snapshot, error, loading, busy, reload, mutate, petAction };
}
