import { useSyncExternalStore } from 'react';
export function navigate(path: string) { window.location.hash = path.startsWith('/') ? path : `/${path}`; }
export function usePath() {
  return useSyncExternalStore(listener => { window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); }, () => decodeURI(window.location.hash.slice(1) || '/companions'));
}
