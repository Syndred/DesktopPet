import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowDown, Check, CircleSlash, Clock3, Flame, Footprints, Gem, Heart, Leaf, LogOut, Mountain, RefreshCw, ScrollText, Trophy, UserRound, X, Zap } from 'lucide-react';
import type { BattleActor, BattleParticipant, BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import type { CharacterResource, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { request } from '../../app/bridge';
import { AppDialog, Button, Card, ScrollArea, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { useAppMotion } from '../../components/motion';
import { ResourceStage } from '../resources/ResourceStage';
import { ResourcePortrait } from '../resources/ResourcePortrait';
import { battleAffinity, elements, petName, roundLines, statusLabel } from './presentation';
import { BattleMoves, ElementMark } from './BattleMoves';
import { BattlePhaseClock } from './BattlePhaseClock';
import { useBattleAnimation } from './useBattleAnimation';

export function BattlePortrait({ pet, facing = 'right', small = false, action = 'idle', playing = true, playbackKey }: {
  pet: BattleParticipant; facing?: 'left' | 'right'; small?: boolean; action?: ResourceAction; playing?: boolean; playbackKey?: string;
}) {
  const [resource, setResource] = useState<CharacterResource | null>(null), [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const unknownPeer = pet.petId === 'waiting-peer';
  const resourceId = pet.resource?.resourceId || pet.appearance2d || pet.resourceRef;
  useEffect(() => {
    let alive = true; setResource(null); setError('');
    if (unknownPeer) return;
    if (!resourceId) { setError('角色资源缺失'); return; }
    void request<{ resource: CharacterResource }>('resources', 'resolve', { petId: pet.petId, resourceId, context: 'battle', action: 'idle' }).then(value => {
      if (value.resource.kind !== 'spritesheet') throw new Error('请选择2D角色');
      if (alive) setResource(value.resource);
    }).catch(() => { if (alive) setError('角色暂未就绪'); });
    return () => { alive = false; };
  }, [pet.petId, resourceId, unknownPeer]);
  if (unknownPeer) return <div className={`battle-portrait ${small ? 'small' : ''}`} data-pet-id={pet.petId} aria-label="对手未加入"><UserRound size={small ? 28 : 70}/></div>;
  return <div className={`battle-portrait ${small ? 'small' : ''} element-${pet.element}`} data-pet-id={pet.petId} data-resource-id={resource?.id} data-facing={facing} data-2d-only="true" data-animating={!small && playing && motionAllowed}>
    {resource && small ? <ResourcePortrait resource={resource} framing="portrait" className="battle-sprite-thumb" label={petName(pet)}/> : resource ? <ResourceStage resource={resource} petId={pet.petId} context="battle" action={action} playbackKey={playbackKey} facing={facing} playing={playing} motionEnabled={motionAllowed}/> : <span className="battle-asset-state" role="status">{error || '…'}</span>}
  </div>;
}
const statusIcons = { burn: Flame, freeze: Zap, parasite: Leaf, vulnerability: Gem, petrify: Mountain };
function StatusIcon({ type }: { type: string }) { const Icon = statusIcons[type as keyof typeof statusIcons] || Zap; return <Icon size={13} aria-hidden="true"/>; }
export function CombatantStatus({ pet, actor, rules, enemy = false, waiting = false }: { pet: BattleParticipant; actor: BattleActor; rules: BattleRulesProfile; enemy?: boolean; waiting?: boolean }) {
  if (pet.petId === 'waiting-peer') return <div className="combatant-status enemy battle-waiting-peer" aria-label={waiting ? '等待好友加入' : '对手未加入'}><UserRound size={34}/>{waiting ? <Clock3 size={17}/> : null}</div>;
  return <div className={`combatant-status ${enemy ? 'enemy' : ''}`} data-element={actor.element}>
    <div className="combatant-identity"><BattlePortrait pet={pet} small facing={enemy ? 'left' : 'right'}/><Tooltip><TooltipTrigger asChild><span className="combatant-level" tabIndex={0} aria-label={`Lv.${pet.level || 1} · ${elements[actor.element].label}系`}>Lv.{String(pet.level || 1).padStart(2, '0')}<ElementMark element={actor.element} size={15}/></span></TooltipTrigger><TooltipContent>{elements[actor.element].label} · {rules.elementEffects?.[actor.element]?.description || elements[actor.element].hint}</TooltipContent></Tooltip></div>
    <div className="combatant-bars"><div className="combatant-title"><strong>{petName(pet)}</strong></div>
      <div className="battle-meter-row"><Heart size={11}/><progress aria-label={`${petName(pet)}生命`} max={actor.maxHp} value={actor.hp}/><b>{actor.hp}/{actor.maxHp}</b></div>
      <div className="battle-meter-row anger"><Zap size={11}/><progress aria-label={`${petName(pet)}怒气`} max={rules.maxAnger} value={actor.anger}/><b>{actor.anger}/{rules.maxAnger}</b></div>
      <div className="battle-statuses">{actor.statuses.map(status => <Tooltip key={status.type}><TooltipTrigger asChild><span className="battle-status-chip" tabIndex={0} aria-label={statusLabel(status)}><StatusIcon type={status.type}/>{(status.stacks || 1) > 1 ? <b>{status.stacks}</b> : null}<small>{status.duration}</small></span></TooltipTrigger><TooltipContent>{statusLabel(status)}</TooltipContent></Tooltip>)}</div>
    </div>
  </div>;
}
export const battleActionAnimation = (action: string): ResourceAction => action === 'ultimate' || action === 'element_attack' ? 'skill' : action === 'normal_attack' ? 'attack' : action === 'dodge' ? 'walk' : 'idle';

export function BattleArena({ session, rules, busy, onAct, onSync, onLeave, onReport, syncedAt, onRetry, settlementActions }: {
  session: BattleSession; rules: BattleRulesProfile; busy: boolean; onAct(action: BattleActionType): void; onSync(): void;
  onLeave(): void; onReport(): void; onRetry(): void; syncedAt?: string; settlementActions?: ReactNode;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false), [logsOpen, setLogsOpen] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement | null>(null), logTrigger = useRef<HTMLButtonElement | null>(null);
  const animation = useBattleAnimation(session);
  const current = session.rounds.at(-1), complete = ['finished', 'abandoned'].includes(session.status);
  const waiting = session.status === 'waiting';
  const unknownPeer = session.enemy.petId === 'waiting-peer';
  const closeLeave = () => { setLeaveOpen(false); window.setTimeout(() => leaveTrigger.current?.focus(), 0); };
  const closeLogs = () => { setLogsOpen(false); window.setTimeout(() => logTrigger.current?.focus(), 0); };
  const affinity = unknownPeer ? null : battleAffinity(session.player.element, session.enemy.element, rules);
  const revealed = complete && !animation.busy;
  const shownRound = animation.busy && animation.round ? animation.round.round : complete ? session.snapshot.round : session.snapshot.round + 1;
  const feedback = session.pendingAction ? session.pendingAction.uncertain ? '待确认' : '已锁定' : waiting ? '等待好友' : revealed ? session.status === 'abandoned' ? '已离开' : session.winner === 'player' ? '胜利' : '惜败' : '';
  return <TooltipProvider><div className="battle-live-layout" data-animation-phase={animation.phase} data-animation-key={animation.key}>
    <section className="battle-arena" aria-label="当前对战">
      <div className="battle-arena-viewport">
        <div className="battle-arena-top"><CombatantStatus pet={session.player} actor={animation.snapshot.player} rules={rules}/>
          <div className="battle-round-number"><span>回合 {shownRound}</span><BattlePhaseClock session={session} endsAt={animation.endsAt}/>{affinity ? <Tooltip><TooltipTrigger asChild><small className="battle-affinity" tabIndex={0} data-direction={affinity.direction} aria-label={affinity.label}><ElementMark element={session.player.element}/><span aria-hidden="true">{affinity.symbol}</span><ElementMark element={session.enemy.element}/></small></TooltipTrigger><TooltipContent>{affinity.label}</TooltipContent></Tooltip> : <small className="battle-affinity unknown" aria-label="对手未加入，克制关系未知">—</small>}</div>
          <CombatantStatus pet={session.enemy} actor={animation.snapshot.enemy} rules={rules} enemy waiting={waiting}/>
        </div>
        <div className="battle-stage" data-round={current?.round || 0}>
          {(['player', 'enemy'] as const).map(side => {
            const direction = side === 'player' ? 1 : -1;
            const dodge = animation.round?.actions[side] === 'dodge';
            const shift = !animation.allowed ? 0 : animation.phase === 'windup' ? -direction * 10 : animation.phase === 'release' ? animation.interrupted(side) ? 0 : direction * (dodge ? -32 : 38) : animation.phase === 'impact' && dodge && !(animation.round?.directDamage?.[side] || 0) ? -direction * 35 : 0;
            return <motion.div key={side} className={`battle-actor-slot ${side}`} data-side={side} animate={{ x: shift }} transition={{ duration: animation.allowed ? .22 : 0, ease: 'easeOut' }}>
              {unknownPeer && side === 'enemy' ? <div className="battle-waiting-actor" aria-label={waiting ? '等待好友加入' : '对手未加入'}><UserRound size={70}/></div> : <BattlePortrait pet={session[side]} action={animation.action(side)} playbackKey={`${animation.key}:${side}:${animation.phase}:${animation.action(side)}`} facing={side === 'enemy' ? 'left' : 'right'}/>}
              <AnimatePresence>{animation.events.filter(event => event.side === side).map(event => <motion.span key={`${animation.key}:${event.id}`} className={`battle-hit-feedback ${event.kind} element-${event.element || session[side].element}`} data-event-kind={event.kind} data-event-id={event.id} initial={{ opacity: 0, y: 8, scale: .85 }} animate={{ opacity: 1, y: -24, scale: 1 }} exit={{ opacity: 0, y: -40 }} transition={{ duration: .2 }}>
                {event.kind === 'status' ? <StatusIcon type={event.status || ''}/> : event.kind === 'dodge' ? <Footprints size={23} aria-label="闪避成功"/> : event.kind === 'interrupt' ? <CircleSlash size={23} aria-label="施法打断"/> : event.kind === 'anger' ? <><Zap size={20}/><ArrowDown size={15}/><span>{event.amount}</span></> : `${event.kind === 'heal' ? '+' : '−'}${event.amount}`}
              </motion.span>)}</AnimatePresence>
            </motion.div>;
          })}
        </div>
        {feedback ? <div className="battle-compact-status" role="status" aria-live="polite">{complete ? <Trophy size={14}/> : <Clock3 size={14}/>} {feedback}</div> : null}
        <BattleMoves session={{...session,snapshot:animation.snapshot}} rules={rules} busy={busy || animation.busy} onAct={onAct}/>
        {complete && !animation.busy ? <div className="battle-complete-actions">{settlementActions}<Button variant="secondary" onClick={onReport}><ScrollText size={17}/>战报</Button></div> : null}
        <section className="battle-current-log" aria-label="回合记录"><div className="battle-side-heading"><h3>回合记录</h3><Button variant="ghost" aria-label="全部回合记录" disabled={!session.rounds.length} onClick={event => { logTrigger.current = event.currentTarget; setLogsOpen(true); }}>全部<ScrollText size={14}/></Button></div>
          <ScrollArea className="battle-live-log-scroll" tabIndex={0} aria-label="滚动查看回合记录">
            {session.rounds.length ? [...session.rounds].reverse().map(round => <section className="battle-log-entry" key={round.round}><h4>回合 {round.round}</h4><ol>{roundLines(round, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></section>) : <div className="battle-log-empty" aria-label="暂无回合"><ScrollText size={22}/><span>—</span></div>}
          </ScrollArea>
        </section>
        <div className="battle-scene-actions">
          {session.room ? <span className="battle-room-summary" aria-label={`房间码 ${session.room.room_code}`}># {session.room.room_code}<Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={syncedAt ? '已同步' : '等待同步'}>{syncedAt ? <Check size={14}/> : <Clock3 size={14}/>}</span></TooltipTrigger><TooltipContent>{syncedAt ? `已同步 ${new Date(syncedAt).toLocaleTimeString('zh-CN')}` : '等待同步'}</TooltipContent></Tooltip></span> : null}
          {session.pendingAction?.uncertain ? <Button variant="secondary" disabled={busy} onClick={onRetry}><RefreshCw size={15}/>重试</Button> : null}
          {session.room && !complete ? <Button variant="ghost" disabled={busy} onClick={onSync} aria-label="同步房间"><RefreshCw size={15}/></Button> : null}
          {!complete ? <Button variant="secondary" className="battle-leave-button" onClick={event => { leaveTrigger.current = event.currentTarget; setLeaveOpen(true); }} disabled={busy}><LogOut size={17}/>离开</Button> : null}
        </div>
      </div>
    </section>
    {logsOpen ? <AppDialog title="回合记录" onClose={closeLogs}><Card className="battle-round-dialog"><div className="battle-side-heading"><h2>回合记录</h2><Button variant="ghost" aria-label="关闭回合记录" onClick={closeLogs}><X size={18}/></Button></div><ScrollArea className="battle-all-rounds">{session.rounds.map(round => <section key={round.round}><h3>第 {round.round} 回合</h3><ol>{roundLines(round, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></section>)}</ScrollArea></Card></AppDialog> : null}
    {leaveOpen ? <AppDialog title="离开对战" onClose={closeLeave} busy={busy}><Card className="battle-leave-confirm"><h2>离开对战？</h2><div className="battle-two-buttons"><Button variant="secondary" autoFocus onClick={closeLeave}>继续</Button><Button variant="danger" disabled={busy} onClick={() => { setLeaveOpen(false); onLeave(); }}>离开</Button></div></Card></AppDialog> : null}
  </div></TooltipProvider>;
}
