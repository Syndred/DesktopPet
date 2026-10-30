import { useRef, useSyncExternalStore } from 'react';
import { routePathFromHash } from '../../app/navigation';

/** Consume a raw hash segment exactly once; never decode the already-decoded usePath value. */
export function battleRouteId(hash: string, prefix: '/battle/session/' | '/battle/reports/'): string | null {
  if (!hash.startsWith(`#${prefix}`)) return null;
  const raw = hash.slice(prefix.length + 1);
  if (!raw || raw.includes('/')) return null;
  try { return decodeURIComponent(raw); } catch { return null; }
}

/** Raw-hash subscription distinguishes aliases collapsed by decodeURI.
 * A leaving RoutePath retains its own ID during the page exit animation. */
export function useBattleRouteId(path: string, prefix: '/battle/session/' | '/battle/reports/') {
  const rawHash = useSyncExternalStore(subscribeHash, () => window.location.hash);
  const retained = useRef('');
  if (routePathFromHash(rawHash) === path) retained.current = rawHash;
  return battleRouteId(retained.current, prefix);
}
function subscribeHash(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
