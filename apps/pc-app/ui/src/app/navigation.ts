import { createContext, useContext, useSyncExternalStore } from 'react';
// Exiting pages retain their own location until Motion removes them. Without
// this snapshot a page can mount the next route's layout while it is exiting.
export const RoutePath = createContext<string | null>(null);
export function navigate(path: string) { window.location.hash = path.startsWith('/') ? path : `/${path}`; }
export function usePath() {
  const routePath = useContext(RoutePath);
  const currentPath = useSyncExternalStore(listener => { window.addEventListener('hashchange', listener); return () => window.removeEventListener('hashchange', listener); }, () => decodeURI(window.location.hash.slice(1) || '/companions'));
  return routePath ?? currentPath;
}
