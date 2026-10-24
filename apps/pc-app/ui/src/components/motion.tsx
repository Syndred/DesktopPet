import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';

export const motionTokens = { duration: .18, exit: .1, ease: [.22, 1, .36, 1] as const, distance: 5 };
const AnimationPreference = createContext(true);
export { AnimatePresence as AppPresence };
export function MotionPanel({ children }: { children: ReactNode }) {
  const enabled = useContext(AnimationPreference) && !useReducedMotion();
  return <motion.div initial={enabled ? { opacity: 0, scale: .99 } : false} animate={{ opacity: 1, scale: 1 }} exit={enabled ? { opacity: 0, scale: .99 } : undefined} transition={{ duration: enabled ? motionTokens.duration : 0, ease: motionTokens.ease }}>{children}</motion.div>;
}

export function AppMotionProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    const refresh = async () => {
      const result = await window.lingjing.invoke<any>('accounts', 'settingsGet');
      setEnabled(result.ok ? result.data.document.desktop.animationsEnabled !== false : true);
    };
    void refresh();
    const off = window.lingjing.subscribe('accounts:behavior', (value: any) => setEnabled(value.settings?.desktop?.animationsEnabled !== false));
    const offSession = window.lingjing.subscribe('accounts:session-changed', () => { void refresh(); });
    return () => { off(); offSession(); };
  }, []);
  return <AnimationPreference.Provider value={enabled}><MotionConfig reducedMotion={enabled ? 'user' : 'always'}>{children}</MotionConfig></AnimationPreference.Provider>;
}

export function PageTransition({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const allowed = useContext(AnimationPreference);
  const reduced = useReducedMotion();
  const enabled = allowed && !reduced;
  return <AnimatePresence mode="wait" initial={false}><motion.div key={routeKey} data-motion={enabled ? 'enabled' : 'reduced'} className="app-page-motion" initial={enabled ? { opacity: 0, y: motionTokens.distance } : false} animate={{ opacity: 1, y: 0 }} exit={enabled ? { opacity: 0 } : undefined} transition={{ duration: enabled ? motionTokens.duration : 0, ease: motionTokens.ease }}>{children}</motion.div></AnimatePresence>;
}

export function AnimatedList({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div layout className={className} transition={{ duration: motionTokens.duration, ease: motionTokens.ease }}>{children}</motion.div>;
}
