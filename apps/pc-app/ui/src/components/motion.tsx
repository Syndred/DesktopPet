import { createContext, forwardRef, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion, useIsPresent } from 'motion/react';

export const motionTokens = { duration: .18, exit: .1, ease: [.22, 1, .36, 1] as const, distance: 5 };
const AnimationPreference = createContext(true);
const readSystemPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const listenSystemPreference = (update: () => void) => {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', update);
  return () => query.removeEventListener('change', update);
};
export { AnimatePresence as AppPresence };
export function useAppMotion() {
  return useContext(AnimationPreference);
}
export function MotionPanel({ children }: { children: ReactNode }) {
  const enabled = useAppMotion();
  return <motion.div initial={enabled ? { opacity: 0, scale: .99 } : false} animate={{ opacity: 1, scale: 1 }} exit={enabled ? { opacity: 0, scale: .99 } : undefined} transition={{ duration: enabled ? motionTokens.duration : 0, ease: motionTokens.ease }}>{children}</motion.div>;
}

export function AppMotionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  // Motion 14's useReducedMotion snapshots the initial value. Keep the shared
  // policy live when Windows changes its setting while the app stays open.
  const reduced = useSyncExternalStore(listenSystemPreference, readSystemPreference, () => true);
  const active = enabled && !reduced;
  useEffect(() => {
    document.documentElement.dataset.motion = active ? 'enabled' : 'reduced';
  }, [active]);
  useEffect(() => {
    const refresh = async () => {
      const result = await window.lingjing.call('accounts', 'settingsGet');
      setEnabled(result.ok ? result.data.document.desktop.animationsEnabled !== false : true);
    };
    void refresh();
    const off = window.lingjing.subscribe('accounts:behavior', (value: any) => setEnabled(value.settings?.desktop?.animationsEnabled !== false));
    const offSession = window.lingjing.subscribe('accounts:session-changed', () => { void refresh(); });
    return () => { off(); offSession(); };
  }, []);
  return <AnimationPreference.Provider value={active}><MotionConfig reducedMotion={active ? 'never' : 'always'}>{children}</MotionConfig></AnimationPreference.Provider>;
}

const RouteFrame = forwardRef<HTMLDivElement, { routeKey: string; children: ReactNode }>(function RouteFrame({ routeKey, children }, ref) {
  const enabled = useAppMotion();
  const present = useIsPresent();
  return <motion.div ref={ref} data-route-key={routeKey} data-current-route={present} aria-hidden={!present} inert={!present} data-motion={enabled ? 'enabled' : 'reduced'} className="app-page-motion" initial={enabled ? { opacity: 0, y: motionTokens.distance } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: enabled ? motionTokens.duration : 0, ease: motionTokens.ease }}>{children}</motion.div>;
});
export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  return <AnimatePresence mode="wait" initial={false}><RouteFrame key={routeKey} routeKey={routeKey}>{children}</RouteFrame></AnimatePresence>;
}

export function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  const enabled = useAppMotion();
  return <motion.div layout={enabled} className={className} transition={{ duration: enabled ? motionTokens.duration : 0, ease: motionTokens.ease }}>{children}</motion.div>;
}
