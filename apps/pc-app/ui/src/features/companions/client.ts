import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompanionMutation, CompanionPet, CompanionResult, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions/index';
import '../../app/types';
import { desktopPolicyFingerprint } from '../../app/desktop-policy';

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
  const [refreshing, setRefreshing] = useState(false);
  const requestGeneration = useRef(0);
  const mutationLock = useRef(false);
  const mounted = useRef(true);
  const policyFingerprint = useRef<string | null>(null);
  const acceptedOwner = useRef<string | null>(null);
  const reload = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setRefreshing(true);
    try {
      const data = await companionsRequest<CompanionsSnapshot>('list');
      if (mounted.current && generation === requestGeneration.current) { acceptedOwner.current = data.ownerAccountId; setSnapshot(data); setError(''); }
    } catch (failure) {
      if (mounted.current && generation === requestGeneration.current) { acceptedOwner.current = null; setError(failure instanceof Error ? failure.message : String(failure)); setSnapshot(null); }
    } finally { if (mounted.current && generation === requestGeneration.current) { setLoading(false); setRefreshing(false); } }
  }, []);
  useEffect(() => {
    mounted.current = true; void reload();
    const unsubscribe = window.lingjing?.subscribe('companions:changed', () => { void reload(); });
    const windowsUnsubscribe = window.lingjing?.subscribe('companions:windows-changed', value => {
      const who = (value as { ownerAccountId?: string } | null)?.ownerAccountId;
      if (!who || !acceptedOwner.current || who === acceptedOwner.current) void reload();
    });
    const policyUnsubscribe = window.lingjing?.subscribe('accounts:behavior', value => {
      const who = (value as { ownerAccountId?: string } | null)?.ownerAccountId;
      if (who && acceptedOwner.current && who !== acceptedOwner.current) return;
      const fingerprint = desktopPolicyFingerprint(value);
      if (fingerprint !== null && fingerprint !== policyFingerprint.current) { policyFingerprint.current = fingerprint; void reload(); }
    });
    const sessionUnsubscribe = window.lingjing?.subscribe('app:session', () => {
      requestGeneration.current += 1; policyFingerprint.current = null; acceptedOwner.current = null; setSnapshot(null); setLoading(true); void reload();
    });
    return () => { mounted.current = false; requestGeneration.current += 1; unsubscribe?.(); windowsUnsubscribe?.(); policyUnsubscribe?.(); sessionUnsubscribe?.(); };
  }, [reload]);
  const mutate = useCallback(async (command: string, payload: Record<string, unknown>) => {
    if (mutationLock.current) return null;
    mutationLock.current = true; setBusy(true); setError('');
    try {
      const result = await companionsRequest<CompanionMutation>(command, { actionId: actionId(), ...payload });
      if (command === 'select' && payload.slot === 'chatPetId') {
        // The conversation feature persists its own selected instance. Finish
        // that verified-owner selection before either chat entry can navigate.
        const selected = await window.lingjing.invoke('conversations', 'select', {
          petId: result.pet.petId, expectedAccountId: result.pet.ownerAccountId
        });
        if (!selected.ok) throw Object.assign(new Error(selected.message), { code: selected.code });
      }
      await reload(); return result;
    } catch (failure) {
      await reload();
      if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure));
      return null;
    } finally { mutationLock.current = false; if (mounted.current) setBusy(false); }
  }, [reload]);
  const petAction = (command: string, pet: CompanionPet, payload: Record<string, unknown> = {}) => mutate(command, { petId: pet.petId, expectedRevision: pet.revision, ...payload });
  return { snapshot, error, loading, busy, refreshing, reload, mutate, petAction };
}
