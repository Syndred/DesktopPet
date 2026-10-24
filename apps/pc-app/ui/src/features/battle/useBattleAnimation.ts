import { useEffect, useRef, useState } from 'react';
import type { BattleSession, BattleSnapshot, BattleRound } from '../../../../../../packages/shared-types/src/features/battle';
import type { ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { useAppMotion } from '../../components/motion';

export type BattlePhase = 'rest' | 'windup' | 'release' | 'impact' | 'effects';
export const battleTimeline = { windup: 0, release: 280, impact: 620, effects: 940, rest: 1520 } as const;
interface Timeline { key: string; phase: BattlePhase; before: BattleSnapshot; round: BattleRound | null }
export function useBattleAnimation(session: BattleSession) {
  const allowed = useAppMotion();
  const seen = useRef({ id: session.id, round: session.snapshot.round, snapshot: session.snapshot });
  const current = useRef(session); current.current = session;
  const [timeline, setTimeline] = useState<Timeline>({ key: `${session.id}:${session.snapshot.round}`, phase: 'rest', before: session.snapshot, round: null });
  useEffect(() => {
    const session = current.current, latest = session.rounds.at(-1);
    const key = `${session.id}:${session.snapshot.round}`;
    const previous = seen.current;
    seen.current = { id: session.id, round: session.snapshot.round, snapshot: session.snapshot };
    if (!allowed || previous.id !== session.id || !latest || previous.round === session.snapshot.round) {
      setTimeline(value => value.key === key && allowed ? value : { key, phase: 'rest', before: session.snapshot, round: null });
      return;
    }
    setTimeline({ key, phase: 'windup', before: previous.snapshot, round: latest });
    const timers = (['release', 'impact', 'effects', 'rest'] as const).map(phase => window.setTimeout(() => {
      setTimeline(value => value.key === key ? { ...value, phase } : value);
    }, battleTimeline[phase]));
    return () => timers.forEach(window.clearTimeout);
  }, [session.id, session.snapshot.round, allowed]);
  const phase = allowed ? timeline.phase : 'rest';
  const round = timeline.round;
  const interrupted = (side: 'player' | 'enemy') => round?.actions[side] === 'element_attack' && round.actions[side === 'player' ? 'enemy' : 'player'] === 'normal_attack' && (round.directDamage?.[side === 'player' ? 'enemy' : 'player'] || 0) === 0;
  const action = (side: 'player' | 'enemy'): ResourceAction => {
    if (phase === 'rest') return session.status === 'finished' && session.winner === side ? 'victory' : 'idle';
    const selected = round?.actions[side];
    if (phase === 'impact' && (round?.directDamage?.[side] || 0) > 0) return 'hit';
    if (selected === 'dodge') return 'walk';
    if (phase === 'windup') return selected === 'stunned' ? 'idle' : 'attack_windup';
    if (interrupted(side)) return 'idle';
    if (phase === 'release') return selected === 'normal_attack' ? 'attack_release' : selected === 'element_attack' || selected === 'ultimate' ? 'skill' : 'idle';
    return 'idle';
  };
  const events = round?.visualEvents?.filter(event => event.phase === phase && event.kind !== 'action') || [];
  const snapshot = phase === 'windup' || phase === 'release' ? timeline.before : session.snapshot;
  return { phase, key: timeline.key, busy: phase !== 'rest', snapshot, events, action, interrupted, round, allowed };
}
