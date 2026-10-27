import { useEffect, useSyncExternalStore } from 'react';
import type { AppBridge } from '../../../../../../packages/shared-types/src/app';

// Navigation-only state: never a global functional pet slot, cloud record or
// persisted preference. One owner at a time; session events erase it even while
// another route is mounted. The one bridge listener lives with this renderer.
type Selection = { owner: string | null; petId: string | null };
const empty: Selection = { owner: null, petId: null };
let selection = empty;
let observedBridge: AppBridge | undefined;
let releaseBridge: (() => void) | undefined;
const listeners = new Set<() => void>();
function update(next: Selection) {
  if (selection.owner === next.owner && selection.petId === next.petId) return;
  selection = next;
  for (const listener of listeners) listener();
}
function observeSession() {
  const bridge = window.lingjing;
  if (bridge === observedBridge) return;
  releaseBridge?.(); update(empty); observedBridge = bridge;
  const reset = () => update(empty);
  const off = bridge?.subscribe('app:session', reset);
  const offChanged = bridge?.subscribe('accounts:session-changed', reset);
  releaseBridge = () => { off?.(); offChanged?.(); };
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useOverviewSelection(owner: string | undefined, petIds: string[]) {
  const current = useSyncExternalStore(subscribe, () => selection, () => empty);
  const selectedId = owner && current.owner === owner && current.petId && petIds.includes(current.petId) ? current.petId : petIds[0] ?? null;
  const membership = JSON.stringify(petIds);
  useEffect(observeSession, []);
  useEffect(() => {
    // Loading/null snapshots must not discard a valid return context. The next
    // authoritative owner/member set validates it before anything is displayed.
    if (owner) update({ owner, petId: selectedId });
  }, [owner, selectedId, membership]);
  return { selectedId, select(petId: string) { if (owner && petIds.includes(petId)) update({ owner, petId }); } };
}
