import { Clock3, Droplets, Feather, Flame, Footprints, Gem, Leaf, LockKeyhole, Mountain, Sparkles, Waves, Zap, type LucideIcon } from 'lucide-react';
import type { BattleActionType, ElementType } from '../../../../../../packages/shared-types/src/battle';
import type { BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { actionLabels, elements } from './presentation';

const elementIcons: Record<ElementType, LucideIcon> = { metal: Gem, wood: Leaf, earth: Mountain, water: Droplets, fire: Flame };
export function ElementMark({ element, size = 14 }: { element: ElementType; size?: number }) {
  const Icon = elementIcons[element];
  return <Icon size={size} style={{ color: elements[element].color }} aria-hidden="true"/>;
}
const moves = [
  { action: 'normal_attack', icon: Feather, description: '打断属性攻击' },
  { action: 'element_attack', icon: Waves, description: '附加五行效果' },
  { action: 'dodge', icon: Footprints, description: '躲开普通攻击' },
  { action: 'ultimate', icon: Zap, description: '必定命中 · 治疗' }
] as const;

/** A command card keeps the real action, its availability and its cost in one place. */
export function BattleMoves({ session, rules, busy, onAct }: { session: BattleSession; rules: BattleRulesProfile; busy: boolean; onAct(action: BattleActionType): void }) {
  const actor = session.snapshot.player;
  const waiting = session.status === 'waiting';
  const selected = session.pendingAction?.action || session.rounds.at(-1)?.actions.player;
  return <TooltipProvider><div className="battle-moves" aria-label="选择本回合行动">
    {moves.map(move => {
      const lackingAnger = move.action === 'ultimate' && actor.anger < rules.ultimateAnger;
      const exhaustedDodge = move.action === 'dodge' && actor.freeDodgeUsed && actor.anger <= 0;
      const disabled = busy || waiting || Boolean(session.pendingAction) || lackingAnger || exhaustedDodge;
      const reason = busy ? '正在出招' : waiting ? '等待好友' : session.pendingAction ? '行动已锁定' : lackingAnger ? `需要至少 ${rules.ultimateAnger} 怒气` : exhaustedDodge ? '需要怒气' : move.action === 'element_attack' ? rules.elementEffects?.[actor.element]?.description || move.description : move.description;
      const status = move.action === 'ultimate' ? `${actor.anger}/${rules.ultimateAnger}` : move.action === 'dodge' ? actor.freeDodgeUsed ? `≤${rules.dodgeMaxCost}` : '0' : String(rules.baseDamage[move.action]);
      const Icon = move.action === 'element_attack' ? elementIcons[actor.element] : move.icon;
      return <Tooltip key={move.action}><TooltipTrigger asChild><span className="battle-move-tooltip" aria-label={`${actionLabels[move.action]}：${reason}`} tabIndex={disabled ? 0 : -1}>
        <Button variant="ghost" aria-label={actionLabels[move.action]} className={`battle-move ${move.action} element-${actor.element}`} aria-pressed={selected === move.action} disabled={disabled} onClick={() => onAct(move.action)}>
          <span className="battle-skill-art" aria-hidden="true"><Sparkles className="battle-skill-glint size-3"/><Icon className="battle-skill-icon size-8"/></span>
          <span className="battle-skill-copy"><strong>{actionLabels[move.action]}</strong><small>{move.action === 'element_attack' ? rules.elementEffects?.[actor.element]?.label || elements[actor.element].label : move.action === 'normal_attack' ? '打断' : move.action === 'dodge' ? '回避' : '必中 · 回复'}</small></span>
          <span className="battle-skill-status">{move.action === 'ultimate' && <progress aria-label="大招怒气准备" value={Math.min(actor.anger, rules.ultimateAnger)} max={rules.ultimateAnger}/>}<span>{session.pendingAction ? <LockKeyhole size={12}/> : busy || waiting ? <Clock3 size={12}/> : move.action === 'ultimate' || move.action === 'dodge' ? <Zap size={12}/> : <Icon size={12}/>} {status}</span></span>
        </Button>
      </span></TooltipTrigger><TooltipContent>{reason}</TooltipContent></Tooltip>;
    })}
  </div></TooltipProvider>;
}
