import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, ArrowRight, Check, CircleSlash, Clock3, Flame, Footprints, Gem, Grid2X2, Heart, Leaf, LogOut, Mountain, RefreshCw, ScrollText, Swords, Trophy, X, Zap } from 'lucide-react';
import type { BattleActor, BattleParticipant, BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import type { CharacterResource, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { request } from '../../app/bridge';
import { AppDialog, Button, Card, ScrollArea, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { useAppMotion } from '../../components/motion';
import { navigate } from '../../app/navigation';
import { ResourceStage } from '../resources/ResourceStage';
import { ResourcePortrait } from '../resources/ResourcePortrait';
import { actionLabels, petName, roundLines, statusLabel } from './presentation';
import { BattleMoves, ElementMark } from './BattleMoves';
import { useBattleAnimation } from './useBattleAnimation';

export function BattlePortrait({ pet, facing = 'right', small = false, action = 'idle', playing = true }: {
  pet: BattleParticipant; facing?: 'left' | 'right'; small?: boolean; action?: ResourceAction; playing?: boolean;
}) {
  const [resource, setResource] = useState<CharacterResource | null>(null), [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const resourceId = pet.resource?.resourceId || pet.appearance2d || pet.resourceRef;
  useEffect(() => {
    let alive = true; setResource(null); setError('');
    if (!resourceId) { setError('角色资源缺失'); return; }
    void request<{ resource: CharacterResource }>('resources', 'resolve', { petId: pet.petId, resourceId, context: 'battle', action: 'idle' }).then(value => {
      if (value.resource.kind !== 'spritesheet') throw new Error('请选择2D角色');
      if (alive) setResource(value.resource);
    }).catch(() => { if (alive) setError('角色暂未就绪'); });
    return () => { alive = false; };
  }, [pet.petId, resourceId]);
  return <div className={`battle-portrait ${small ? 'small' : ''} element-${pet.element}`} data-pet-id={pet.petId} data-resource-id={resource?.id} data-2d-only="true" data-animating={!small && playing && motionAllowed}>
    {resource && small ? <ResourcePortrait resource={resource} framing="portrait" className="battle-sprite-thumb" label={petName(pet)}/> : resource ? <ResourceStage resource={resource} petId={pet.petId} context="battle" action={action} facing={facing} playing={playing} motionEnabled={motionAllowed}/> : <span className="battle-asset-state" role="status">{error || '…'}</span>}
  </div>;
}
const statusIcons = { burn: Flame, freeze: Zap, parasite: Leaf, vulnerability: Gem, petrify: Mountain };
function StatusIcon({ type }: { type: string }) { const Icon = statusIcons[type as keyof typeof statusIcons] || Zap; return <Icon size={13} aria-hidden="true"/>; }
export function CombatantStatus({ pet, actor, rules, enemy = false }: { pet: BattleParticipant; actor: BattleActor; rules: BattleRulesProfile; enemy?: boolean }) {
  return <div className={`combatant-status ${enemy ? 'enemy' : ''}`} data-element={actor.element}><BattlePortrait pet={pet} small/>
    <div className="combatant-bars"><div className="combatant-title"><strong>{petName(pet)}</strong><span>Lv.{String(pet.level || 1).padStart(2, '0')} <ElementMark element={actor.element} size={12}/></span></div>
      <div className="battle-meter-row"><Heart size={11}/><progress aria-label={`${petName(pet)}生命`} max={actor.maxHp} value={actor.hp}/><b>{actor.hp}/{actor.maxHp}</b></div>
      <div className="battle-meter-row anger"><Zap size={11}/><progress aria-label={`${petName(pet)}怒气`} max={rules.maxAnger} value={actor.anger}/><b>{actor.anger}/{rules.maxAnger}</b></div>
      <div className="battle-statuses">{actor.statuses.map(status => <Tooltip key={status.type}><TooltipTrigger asChild><span className="battle-status-chip" tabIndex={0} aria-label={statusLabel(status)}><StatusIcon type={status.type}/>{(status.stacks || 1) > 1 ? <b>{status.stacks}</b> : null}<small>{status.duration}</small></span></TooltipTrigger><TooltipContent>{statusLabel(status)}</TooltipContent></Tooltip>)}</div>
    </div>
  </div>;
}
export const battleActionAnimation = (action: string): ResourceAction => action === 'ultimate' || action === 'element_attack' ? 'skill' : action === 'normal_attack' ? 'attack' : action === 'dodge' ? 'walk' : 'idle';

export function BattleArena({ session, rules, busy, onAct, onSync, onLeave, onReport, syncedAt, onRetry, party = [], settlementActions }: {
  session: BattleSession; rules: BattleRulesProfile; busy: boolean; onAct(action: BattleActionType): void; onSync(): void;
  onLeave(): void; onReport(): void; onRetry(): void; syncedAt?: string; party?: BattleParticipant[]; settlementActions?: ReactNode;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false), [logsOpen, setLogsOpen] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement | null>(null), logTrigger = useRef<HTMLButtonElement | null>(null);
  const animation = useBattleAnimation(session);
  const current = session.rounds.at(-1), complete = ['finished', 'abandoned'].includes(session.status);
  const waiting = session.status === 'waiting';
  const companions = [session.player, ...party.filter(pet => pet.petId !== session.player.petId)].slice(0, 4);
  const closeLeave = () => { setLeaveOpen(false); window.setTimeout(() => leaveTrigger.current?.focus(), 0); };
  const closeLogs = () => { setLogsOpen(false); window.setTimeout(() => logTrigger.current?.focus(), 0); };
  const advantage = rules.advantage?.[session.player.element] === session.enemy.element ? '克制 ×1.2' : rules.advantage?.[session.enemy.element] === session.player.element ? '受制 ×0.8' : '伤害 ×1';
  const feedback = session.pendingAction ? session.pendingAction.uncertain ? '待确认' : '已锁定' : waiting ? '等待好友' : complete ? session.status === 'abandoned' ? '已离开' : session.winner === 'player' ? '胜利' : '惜败' : '';
  return <TooltipProvider><div className="battle-live-layout" data-animation-phase={animation.phase} data-animation-key={animation.key}>
    <section className="battle-arena" aria-label="当前对战">
      <div className="battle-arena-viewport">
        <div className="battle-arena-top"><CombatantStatus pet={session.player} actor={animation.snapshot.player} rules={rules}/>
          <div className="battle-round-number"><span>{complete ? '终局' : '回合'}</span><strong>{String(complete ? session.snapshot.round : session.snapshot.round + 1).padStart(2, '0')}</strong><Tooltip><TooltipTrigger asChild><small className="battle-affinity" tabIndex={0} aria-label={advantage}><ElementMark element={session.player.element}/><ArrowRight size={12}/><ElementMark element={session.enemy.element}/></small></TooltipTrigger><TooltipContent>{advantage}</TooltipContent></Tooltip></div>
          <CombatantStatus pet={session.enemy} actor={animation.snapshot.enemy} rules={rules} enemy/>
        </div>
        <div className="battle-stage" data-round={current?.round || 0}>
          {(['player', 'enemy'] as const).map(side => {
            const direction = side === 'player' ? 1 : -1;
            const dodge = animation.round?.actions[side] === 'dodge';
            const shift = !animation.allowed ? 0 : animation.phase === 'windup' ? -direction * 10 : animation.phase === 'release' ? animation.interrupted(side) ? 0 : direction * (dodge ? -32 : 38) : animation.phase === 'impact' && dodge && !(animation.round?.directDamage?.[side] || 0) ? -direction * 35 : 0;
            return <motion.div key={side} className={`battle-actor-slot ${side}`} data-side={side} animate={{ x: shift }} transition={{ duration: animation.allowed ? .22 : 0, ease: 'easeOut' }}>
              <BattlePortrait pet={session[side]} action={animation.action(side)} facing={side === 'enemy' ? 'left' : 'right'}/>
              <AnimatePresence>{animation.events.filter(event => event.side === side).map(event => <motion.span key={`${animation.key}:${event.id}`} className={`battle-hit-feedback ${event.kind} element-${event.element || session[side].element}`} data-event-kind={event.kind} data-event-id={event.id} initial={{ opacity: 0, y: 8, scale: .85 }} animate={{ opacity: 1, y: -24, scale: 1 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: .2 }}>
                {event.kind === 'status' ? <StatusIcon type={event.status || ''}/> : event.kind === 'dodge' ? <Footprints size={23} aria-label="闪避成功"/> : event.kind === 'interrupt' ? <CircleSlash size={23} aria-label="施法打断"/> : event.kind === 'anger' ? <><Zap size={20}/><ArrowDown size={15}/><span>{event.amount}</span></> : `${event.kind === 'heal' ? '+' : '−'}${event.amount}`}
              </motion.span>)}</AnimatePresence>
            </motion.div>;
          })}
        </div>
        {feedback ? <div className="battle-compact-status" role="status" aria-live="polite">{complete ? <Trophy size={14}/> : <Clock3 size={14}/>} {feedback}</div> : null}
      </div>
      {complete && !animation.busy ? <div className="battle-complete-actions">{settlementActions}<Button variant="secondary" onClick={onReport}><ScrollText size={17}/>战报</Button></div> : <BattleMoves session={session} rules={rules} busy={busy || animation.busy} onAct={onAct}/>}
    </section>
    <aside className="battle-live-sidebar"><Card className="battle-side-panel"><section className="battle-party-section">
      <div className="battle-side-heading"><h3>出战伙伴</h3><Tooltip><TooltipTrigger asChild><Button variant="ghost" aria-label="伙伴列表" onClick={() => navigate('/companions')}><Grid2X2 size={15}/></Button></TooltipTrigger><TooltipContent>伙伴列表</TooltipContent></Tooltip></div>
      <div className="battle-party-grid">{companions.map((pet, index) => <div key={pet.petId} className={index === 0 ? 'chosen' : ''}><BattlePortrait pet={pet} small/><strong>{petName(pet)}</strong><small>Lv.{String(pet.level || 1).padStart(2, '0')}</small></div>)}</div>
      {session.room ? <div className="battle-room-summary"><span># <strong>{session.room.room_code}</strong></span><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={syncedAt ? '已同步' : '等待同步'}>{syncedAt ? <Check size={14}/> : <Clock3 size={14}/>}</span></TooltipTrigger><TooltipContent>{syncedAt ? `已同步 ${new Date(syncedAt).toLocaleTimeString('zh-CN')}` : '等待同步'}</TooltipContent></Tooltip></div> : null}
    </section><section className="battle-current-log"><div className="battle-side-heading"><h3>回合记录</h3><Tooltip><TooltipTrigger asChild><Button variant="ghost" aria-label="全部回合记录" disabled={!session.rounds.length} onClick={event => { logTrigger.current = event.currentTarget; setLogsOpen(true); }}><ScrollText size={16}/></Button></TooltipTrigger><TooltipContent>全部回合</TooltipContent></Tooltip></div>
      {current ? <><p className="battle-log-round">{String(current.round).padStart(2, '0')}</p><ScrollArea className="battle-live-log-scroll"><ol>{(['player', 'enemy'] as const).map(side => <li key={side} className="battle-event-row"><ElementMark element={session[side].element}/><strong>{petName(session[side])}</strong><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={actionLabels[current.actions[side]]}>{current.actions[side] === 'dodge' ? <Footprints size={15}/> : current.actions[side] === 'ultimate' ? <Zap size={15}/> : current.actions[side] === 'element_attack' ? <ElementMark element={session[side].element}/> : <Swords size={15}/>}</span></TooltipTrigger><TooltipContent>{actionLabels[current.actions[side]]}</TooltipContent></Tooltip><span className="battle-log-damage">−{current.damageTaken[side]}</span></li>)}<li className="battle-log-anger"><Zap size={13}/><span>{current.angerAfter?.player ?? session.snapshot.player.anger}/{rules.maxAnger}</span></li></ol></ScrollArea></> : <div className="battle-log-empty" aria-label="暂无回合"><ScrollText size={24}/><span>—</span></div>}
    </section><div className="battle-side-actions">
      {session.pendingAction?.uncertain ? <Button variant="secondary" disabled={busy} onClick={onRetry}><RefreshCw size={15}/>重试</Button> : null}
      {session.room && !complete ? <Button variant="ghost" disabled={busy} onClick={onSync} aria-label="同步房间"><RefreshCw size={15}/></Button> : null}
      {!complete ? <Button variant="secondary" className="battle-leave-button" onClick={event => { leaveTrigger.current = event.currentTarget; setLeaveOpen(true); }} disabled={busy}><LogOut size={17}/>离开</Button> : null}
    </div></Card></aside>
    {logsOpen ? <AppDialog title="回合记录" onClose={closeLogs}><Card className="battle-round-dialog"><div className="battle-side-heading"><h2>回合记录</h2><Button variant="ghost" aria-label="关闭回合记录" onClick={closeLogs}><X size={18}/></Button></div><ScrollArea className="battle-all-rounds">{session.rounds.map(round => <section key={round.round}><h3>第 {round.round} 回合</h3><ol>{roundLines(round, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></section>)}</ScrollArea></Card></AppDialog> : null}
    {leaveOpen ? <AppDialog title="离开对战" onClose={closeLeave} busy={busy}><Card className="battle-leave-confirm"><h2>离开对战？</h2><div className="battle-two-buttons"><Button variant="secondary" autoFocus onClick={closeLeave}>继续</Button><Button variant="danger" disabled={busy} onClick={() => { setLeaveOpen(false); onLeave(); }}>离开</Button></div></Card></AppDialog> : null}
  </div></TooltipProvider>;
}
