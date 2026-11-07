import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleSlash, Droplets, Flame, Footprints, Heart, Mountain, ShieldAlert, Snowflake, Sprout, Zap, type LucideIcon } from 'lucide-react';
import type { BattleRulesProfile, BattleStatus, BattleVisualEvent } from '../../../../../../packages/shared-types/src/features/battle';
import type { ElementType } from '../../../../../../packages/shared-types/src/battle';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/kit';
import { statusLabel, statusLabels } from './presentation';

const statusMarks: Record<string, { Icon: LucideIcon; element: ElementType }> = {
  burn: { Icon: Flame, element: 'fire' },
  freeze: { Icon: Snowflake, element: 'water' },
  parasite: { Icon: Sprout, element: 'wood' },
  vulnerability: { Icon: ShieldAlert, element: 'metal' },
  petrify: { Icon: Mountain, element: 'earth' },
  dampen: { Icon: Droplets, element: 'water' }
};

export function BattleStatusList({ statuses, rules }: { statuses: BattleStatus[]; rules: BattleRulesProfile }) {
  if (!statuses.length) return null;
  return <div className="battle-statuses" aria-label="持续状态">
    {statuses.map(status => {
      const mark = statusMarks[status.type];
      const Icon = mark?.Icon ?? CircleAlert;
      const label = statusLabel(status);
      const effect = mark && status.type !== 'freeze' ? rules.elementEffects?.[mark.element]?.description : undefined;
      return <Tooltip key={status.type}>
        <TooltipTrigger asChild><span className="battle-status-chip" tabIndex={0} aria-label={label} data-battle-status={status.type} data-tone={mark?.element}>
          <Icon size={16} aria-hidden="true"/><strong>{statusLabels[status.type] || status.type}</strong>
          <b>×{status.stacks || 1}</b><small>余{status.duration}回合</small>
        </span></TooltipTrigger>
        <TooltipContent>{label}{effect ? <div>{effect}</div> : null}</TooltipContent>
      </Tooltip>;
    })}
  </div>;
}

function describeFeedback(event: BattleVisualEvent) {
  const mark = event.status ? statusMarks[event.status] : undefined;
  const status = event.status ? statusLabels[event.status] || '持续效果' : '持续效果';
  switch (event.kind) {
    case 'heal': return event.status === 'ultimate'
      ? { Icon: Heart, tone: 'ultimate', label: '大招回血', value: `+${event.amount}` }
      : { Icon: mark?.Icon ?? Heart, tone: mark?.element ?? 'wood', label: event.status ? `${status}回血` : '回血', value: `+${event.amount}` };
    case 'status': return { Icon: mark?.Icon ?? CircleAlert, tone: mark?.element, label: status, value: `×${event.stacks || 1}` };
    case 'dot': return { Icon: mark?.Icon ?? CircleAlert, tone: mark?.element, label: status, value: `−${event.amount}` };
    case 'anger': return { Icon: mark?.Icon ?? Zap, tone: 'water', label: '降怒', value: event.status === 'dampen' ? `−${event.amount}` : event.amount == null ? undefined : `余${event.amount}` };
    case 'dodge': return { Icon: Footprints, tone: 'water', label: '闪避成功' };
    case 'interrupt': return { Icon: CircleSlash, tone: 'earth', label: '施法打断' };
    default: return { Icon: undefined, tone: 'damage', label: '受击', value: `−${event.amount}` };
  }
}

export function BattleFeedback({ events, roundKey, motionAllowed }: { events: BattleVisualEvent[]; roundKey: string; motionAllowed: boolean }) {
  return <div className="battle-feedback-stack" role="status" aria-live="polite">
    <AnimatePresence>{events.map(event => {
      const { Icon, tone, label, value } = describeFeedback(event);
      return <motion.span key={`${roundKey}:${event.id}`} className={`battle-hit-feedback ${event.kind}`} data-event-kind={event.kind}
        data-event-id={event.id} data-effect={event.status} data-tone={tone}
        initial={motionAllowed ? { opacity: 0, y: 10 } : false}
        animate={motionAllowed ? { opacity: 1, y: 0 } : undefined}
        exit={motionAllowed ? { opacity: 0, y: -10 } : undefined} transition={{ duration: .2 }}>
        {Icon ? <Icon size={17} aria-hidden="true"/> : null}<span>{label}</span>{value ? <b>{value}</b> : null}
      </motion.span>;
    })}</AnimatePresence>
  </div>;
}
