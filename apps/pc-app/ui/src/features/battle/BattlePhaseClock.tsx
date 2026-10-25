import { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';
import type { BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/kit';
import { battleTimeline } from './useBattleAnimation';

/** Only the existing animation has a deadline. Choosing/waiting never gains a fake turn limit. */
export function BattlePhaseClock({ session, endsAt }: { session: BattleSession; endsAt?: number }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!endsAt) return;
    setNow(Date.now());
    const refresh = () => setNow(Date.now());
    const timer = window.setInterval(refresh, 100);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [endsAt]);
  const remaining = endsAt ? Math.max(0, Math.min(battleTimeline.rest, endsAt - now)) : 0;
  const kind = endsAt ? 'animation' : session.status === 'waiting' ? 'waiting' : session.status === 'settling' ? 'settling'
    : ['finished', 'abandoned'].includes(session.status) ? 'complete' : session.pendingAction ? 'pending' : 'choosing';
  const label = kind === 'animation' ? '出招剩余' : kind === 'choosing' ? '选招不限时' : kind === 'pending' ? '等待对手，无选招时限'
    : kind === 'waiting' ? '等待好友加入' : kind === 'settling' ? '正在同步结算' : '对战已结束';
  const value = kind === 'animation' ? `${(Math.ceil(remaining / 100) / 10).toFixed(1)}s` : kind === 'choosing' ? '不限时'
    : kind === 'pending' ? '待对手' : kind === 'waiting' ? '待加入' : kind === 'settling' ? '同步中' : '已结束';
  return <Tooltip><TooltipTrigger asChild><div className="battle-phase-clock" tabIndex={0} role="timer" aria-label={label} aria-live="off" data-phase-kind={kind} data-deadline={endsAt} data-remaining-ms={remaining}>
    <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" className="battle-clock-track"/>{endsAt ? <circle cx="50" cy="50" r="45" className="battle-clock-value" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - remaining / battleTimeline.rest * 100}/> : null}</svg>
    <Clock3 size={17} aria-hidden="true"/><strong>{value}</strong>
  </div></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}
