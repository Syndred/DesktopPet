import { useId } from 'react';
import { Clock3, Droplets, Feather, Flame, Footprints, Gem, Leaf, LockKeyhole, Mountain, Sparkles, Star, Waves, Zap, type LucideIcon } from 'lucide-react';
import type { BattleActionType, ElementType } from '../../../../../../packages/shared-types/src/battle';
import type { BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { actionLabels, elements } from './presentation';
import './battle.css';

const elementIcons: Record<ElementType, LucideIcon> = { metal: Gem, wood: Leaf, earth: Mountain, water: Droplets, fire: Flame };
export function ElementMark({ element, size = 14 }: { element: ElementType; size?: number }) {
  const Icon = elementIcons[element];
  return <Icon size={size} data-element={element} style={{ color: elements[element].color }} aria-hidden="true"/>;
}
const moves = [
  { action: 'normal_attack', icon: Feather, description: '打断属性攻击' },
  { action: 'element_attack', icon: Waves, description: '附加五行效果' },
  { action: 'dodge', icon: Footprints, description: '躲开普通攻击' },
  { action: 'ultimate', icon: Zap, description: '必定命中 · 治疗' }
] as const;

/** One presentation source for the live command bar and read-only pet details. */
export function getBattleMovePresentation(element: ElementType, rules: BattleRulesProfile) {
  return moves.map(move => {
    const effect = move.action === 'element_attack' ? rules.elementEffects?.[element] : undefined;
    const detail = move.action === 'ultimate' ? `需要 ${rules.ultimateAnger} 怒气，消耗 ${rules.ultimateCost}，基础伤害 ${rules.baseDamage[move.action]}，恢复 ${rules.ultimateHeal} 生命` : move.action === 'dodge' ? `零怒气可免费一次；有怒气时最多消耗 ${rules.dodgeMaxCost}${rules.dodgeRefund == null ? '' : `；成功躲开普攻返还 ${rules.dodgeRefund} 怒气`}` : `基础伤害 ${rules.baseDamage[move.action]}`;
    return { action: move.action, label: actionLabels[move.action], Icon: move.action === 'element_attack' ? elementIcons[element] : move.icon,
      caption: effect?.label || (move.action === 'element_attack' ? elements[element].label : move.action === 'normal_attack' ? '打断' : move.action === 'dodge' ? '回避' : '必中 · 回复'),
      description: `${effect?.description || move.description}；${detail}`,
      summaryValue: move.action === 'ultimate' ? String(rules.ultimateCost) : move.action === 'dodge' ? `≤${rules.dodgeMaxCost}` : String(rules.baseDamage[move.action]) };
  });
}
type MovePresentation = ReturnType<typeof getBattleMovePresentation>[number];
function SkillContent({ move }: { move: MovePresentation }) {
  const Icon = move.Icon;
  return <><span className="battle-skill-art" aria-hidden="true"><Sparkles className="battle-skill-glint size-3"/><Icon className="battle-skill-icon size-8"/></span><span className="battle-skill-copy"><strong>{move.label}</strong><small>{move.caption}</small></span></>;
}

/** Information only: no session, readiness state or battle commands are created. */
export function BattleSkillSummary({ element, rules, compact = false }: { element: ElementType; rules: BattleRulesProfile; compact?: boolean }) {
  return <TooltipProvider delayDuration={250}><div className={`battle-moves battle-skill-summary ${compact ? 'is-compact' : ''}`} data-presentation="battle-shared-v1" data-element={element} aria-label="伙伴技能">
    {getBattleMovePresentation(element, rules).map(move => <Tooltip key={move.action}><TooltipTrigger asChild><Button type="button" variant="ghost" className={`battle-move ${move.action} element-${element}`} data-action={move.action} aria-label={`${move.label}技能说明`}><SkillContent move={move}/><span className="battle-skill-status"><span>{move.action === 'ultimate' || move.action === 'dodge' ? <Zap size={12}/> : <move.Icon size={12}/>} {move.summaryValue}</span></span></Button></TooltipTrigger><TooltipContent>{move.description}</TooltipContent></Tooltip>)}
  </div></TooltipProvider>;
}

const commandOrder: BattleActionType[] = ['ultimate', 'normal_attack', 'element_attack', 'dodge'];
const commandLabels = { normal_attack: '攻击', element_attack: '属性', dodge: '闪避', ultimate: '大招' };
const commandHints = { normal_attack: '打断属性', element_attack: '无法闪避', dodge: '闪避攻击', ultimate: '必中 · 回复' };

/** The same real commands in a compact, floating group. No presentation timer submits a move. */
export function BattleMoves({ session, rules, busy, onAct }: { session: BattleSession; rules: BattleRulesProfile; busy: boolean; onAct(action: BattleActionType): void }) {
  const descriptionId = useId();
  const actor = session.snapshot.player;
  const waiting = session.status === 'waiting';
  const selected = session.pendingAction?.action || session.rounds.at(-1)?.actions.player;
  const presentations = getBattleMovePresentation(actor.element, rules);
  const charge = Math.max(0, Math.min(actor.anger, rules.ultimateAnger));
  const fraction = rules.ultimateAnger > 0 ? charge / rules.ultimateAnger : 1;
  return <TooltipProvider><div className="battle-moves battle-command-group" aria-label="选择本回合行动">
    {commandOrder.map(action => {
      const move = presentations.find(value => value.action === action)!;
      const lackingAnger = move.action === 'ultimate' && actor.anger < rules.ultimateAnger;
      const exhaustedDodge = move.action === 'dodge' && actor.freeDodgeUsed && actor.anger <= 0;
      const dodgeCost = Math.min(actor.anger, rules.dodgeMaxCost);
      const disabled = busy || session.status !== 'active' || Boolean(session.pendingAction) || lackingAnger || exhaustedDodge;
      const reason = busy ? '正在出招' : waiting ? '等待好友' : session.status === 'settling' ? '正在结算' : session.status !== 'active' ? '对战已结束' : session.pendingAction ? '行动已锁定' : lackingAnger ? `需要至少 ${rules.ultimateAnger} 怒气` : exhaustedDodge ? '需要怒气' : move.action === 'dodge' ? `${move.description}；本次消耗 ${dodgeCost} 怒气` : move.description;
      const ultimate = move.action === 'ultimate', ready = ultimate && !lackingAnger;
      const Icon = ultimate ? Star : move.Icon;
      const reasonId = `${descriptionId}-${move.action}`;
      return <Tooltip key={move.action}><TooltipTrigger asChild><span className="battle-command-tooltip" aria-label={disabled ? `${actionLabels[move.action]}：${reason}` : undefined} aria-describedby={disabled ? reasonId : undefined} tabIndex={disabled ? 0 : -1}>
        <Button type="button" variant="ghost" aria-label={actionLabels[move.action]} aria-describedby={reasonId} data-action={move.action} data-ready={ultimate ? ready : undefined} className={`battle-move battle-command ${move.action} element-${actor.element}`} aria-pressed={selected === move.action} disabled={disabled} onClick={() => onAct(move.action)}>
          <span className="battle-command-orb">
            {ultimate ? <svg className="battle-charge-ring" viewBox="0 0 100 100" role="progressbar" aria-label="大招怒气准备" aria-valuemin={0} aria-valuemax={rules.ultimateAnger} aria-valuenow={charge} aria-valuetext={`${Math.round(fraction * 100)}%，${actor.anger}/${rules.ultimateAnger} 怒气`}><circle className="battle-ring-track" cx="50" cy="50" r="46"/><circle className="battle-ring-value" cx="50" cy="50" r="46" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - fraction * 100}/></svg> : null}
            <Icon className="battle-command-icon" aria-hidden="true"/>
            {ultimate ? <><span className="battle-charge-percent" aria-hidden="true">{Math.round(fraction * 100)}%</span><Sparkles className="battle-command-glint" aria-hidden="true"/></> : null}
            {session.pendingAction?.action === move.action ? <LockKeyhole className="battle-command-lock" size={14} aria-hidden="true"/> : busy || waiting ? <Clock3 className="battle-command-lock" size={14} aria-hidden="true"/> : null}
          </span><span className="battle-command-label">{commandLabels[move.action]}</span>
        </Button>
        <span className="sr-only" id={reasonId}>{reason}</span>
      </span></TooltipTrigger><TooltipContent className="battle-command-hint" sideOffset={10}>{commandHints[move.action]}</TooltipContent></Tooltip>;
    })}
  </div></TooltipProvider>;
}
