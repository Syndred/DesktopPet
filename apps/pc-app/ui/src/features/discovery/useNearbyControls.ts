import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
export type NearbyDisplayRadius = 100 | 450;
export const MANUAL_LOCATION_COOLDOWN_MS = 15_000;
/** Display-only range and manual UI throttle. Never changes service radius, watch or snapshot. */
export function useNearbyControls(sessionEpoch: number, locate: () => Promise<boolean>) {
  const scope = useRef({ epoch: sessionEpoch, busy: false, until: 0 });
  const [state, setState] = useState({ epoch: sessionEpoch, radius: 450 as NearbyDisplayRadius, until: 0, busy: false });
  const [now, setNow] = useState(() => Date.now());
  useLayoutEffect(() => {
    scope.current = { epoch: sessionEpoch, busy: false, until: 0 };
    setState({ epoch: sessionEpoch, radius: 450, until: 0, busy: false });
    setNow(Date.now());
    return () => { scope.current = { epoch: -1, busy: false, until: 0 }; };
  }, [sessionEpoch]);
  const current = state.epoch === sessionEpoch ? state : { epoch: sessionEpoch, radius: 450 as NearbyDisplayRadius, until: 0, busy: false };
  useEffect(() => {
    if (!current.until) return;
    const tick = () => { const value = Date.now(); setNow(value); if (value >= current.until) window.clearInterval(timer); };
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [current.until]);
  const setRadius = useCallback((radius: NearbyDisplayRadius) => {
    if (radius !== 100 && radius !== 450) return;
    setState(value => ({ ...value, epoch: sessionEpoch, radius }));
  }, [sessionEpoch]);
  const refreshLocation = useCallback(async () => {
    const intent = scope.current;
    if (intent.epoch !== sessionEpoch || intent.busy || intent.until > Date.now()) return;
    intent.busy = true;
    setState(value => ({ ...value, busy: true }));
    let succeeded = false;
    try { succeeded = await locate(); }
    catch { succeeded = false; }
    finally {
      if (scope.current !== intent || intent.epoch !== sessionEpoch) return;
      intent.busy = false;
      intent.until = succeeded ? Date.now() + MANUAL_LOCATION_COOLDOWN_MS : 0;
      setNow(Date.now());
      setState(value => ({ ...value, busy: false, until: intent.until }));
    }
  }, [locate, sessionEpoch]);
  return { radius: current.radius, setRadius, refreshLocation, manualPending: current.busy,
    cooldownSeconds: Math.max(0, Math.ceil((current.until - now) / 1000)) };
}
