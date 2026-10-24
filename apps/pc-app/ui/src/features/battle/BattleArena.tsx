import { useEffect, useRef, useState } from 'react';
import { ChevronRight, LogOut, MoveRight, RefreshCw, ScrollText, X } from 'lucide-react';
import type { BattleActor, BattleParticipant, BattleRulesProfile, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import type { CharacterResource, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { request } from '../../app/bridge';
import { AppDialog, Button, Card, ScrollArea } from '../../components/kit';
import { useAppMotion } from '../../components/motion';
import { navigate } from '../../app/navigation';
import { ResourceStage } from '../resources/ResourceStage';
import { ResourcePortrait } from '../resources/ResourcePortrait';
import { elements, modeLabels, petName, roundLines, statusLabel } from './presentation';
import { BattleMoves, ElementMark } from './BattleMoves';

const fallback2d = (pet: BattleParticipant) => pet.element === 'water' ? 'builtin:lingjing-yuwan-v2' : 'builtin:lingjing-shiba-v2';
async function resolve2d(petId: string, resourceId: string) {
  const result = await request<{ resource: CharacterResource }>('resources', 'resolve', { petId, resourceId, context: 'battle', action: 'idle' });
  if (result.resource.kind !== 'spritesheet') throw new Error('本版仅显示 2D 角色');
  // Metadata remains owner-scoped; Pixi Assets shares the underlying textures.
  return result.resource;
}

/** Reuses the resource service and Pixi AnimatedSprite stage used by companions. */
export function BattlePortrait({ pet, facing = 'right', small = false, action = 'idle', playing = true }: {
  pet: BattleParticipant; facing?: 'left' | 'right'; small?: boolean; action?: ResourceAction; playing?: boolean;
}) {
  const [resource, setResource] = useState<CharacterResource | null>(null);
  const [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const resourceId = (pet.resource?.kind === '2d' ? pet.resource.resourceId : pet.appearance2d || pet.resourceRef) || fallback2d(pet);
  useEffect(() => {
    let alive = true;
    setResource(null); setError('');
    resolve2d(pet.petId, resourceId).then(value => {
      if (alive) setResource(value);
    }).catch(() => { if (alive) setError('2D 角色资源暂未就绪'); });
    return () => { alive = false; };
  }, [pet.petId, pet.element, resourceId]);
  return <div className={`battle-portrait ${small ? 'small' : ''} element-${pet.element}`} data-pet-id={pet.petId} data-resource-id={resource?.id} data-2d-only="true" data-animating={!small && playing && motionAllowed}>
    {resource && small ? <ResourcePortrait resource={resource} framing="portrait" className="battle-sprite-thumb" label={petName(pet)}/> : resource ? <ResourceStage resource={resource} petId={pet.petId} context="battle" action={action} facing={facing} playing={playing} motionEnabled={motionAllowed}/> : <span className="battle-asset-state" role="status">{error || '正在唤醒伙伴…'}</span>}
  </div>;
}

export function CombatantStatus({ pet, actor, rules, enemy = false }: { pet: BattleParticipant; actor: BattleActor; rules: BattleRulesProfile; enemy?: boolean }) {
  const element = elements[actor.element] || elements.water;
  return <div className={`combatant-status ${enemy ? 'enemy' : ''}`} data-element={actor.element}><BattlePortrait pet={pet} small/>
    <div className="combatant-bars"><div className="combatant-title"><strong>{petName(pet)}</strong><span>Lv.{String(pet.level || 1).padStart(2, '0')} · <ElementMark element={actor.element} size={11}/>{element.label}</span></div>
      <div className="battle-meter-row"><span>生命</span><progress aria-label={`${petName(pet)}生命`} max={actor.maxHp} value={actor.hp}/><b>{actor.hp}/{actor.maxHp}</b></div>
      <div className="battle-meter-row anger"><span>怒气</span><progress aria-label={`${petName(pet)}怒气`} max={rules.maxAnger} value={actor.anger}/><b>{actor.anger}/{rules.maxAnger}</b></div>
      <div className="battle-statuses">{actor.statuses.map(status => <span key={status.type}>{statusLabel(status)}</span>)}</div>
    </div>
  </div>;
}

export const battleActionAnimation = (action: string): ResourceAction => action === 'ultimate' || action === 'element_attack' ? 'skill' : action === 'normal_attack' ? 'attack' : action === 'dodge' ? 'walk' : 'idle';
export function BattleArena({ session, rules, busy, onAct, onSync, onLeave, onReport, syncedAt, onRetry, party = [] }: {
  session: BattleSession; rules: BattleRulesProfile; busy: boolean; onAct(action: BattleActionType): void; onSync(): void;
  onLeave(): void; onReport(): void; onRetry(): void; syncedAt?: string; party?: BattleParticipant[];
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement | null>(null);
  const logTrigger = useRef<HTMLButtonElement | null>(null);
  const motionAllowed = useAppMotion();
  const [pose, setPose] = useState<{ player: ResourceAction; enemy: ResourceAction }>({ player: 'idle', enemy: 'idle' });
  const animatedRound = useRef(`${session.id}:${session.snapshot.round}`);
  const current = session.rounds.at(-1);
  const complete = ['finished', 'abandoned'].includes(session.status);
  const waiting = session.status === 'waiting';
  useEffect(() => {
    const key = `${session.id}:${current?.round ?? 0}`;
    const rest = { player: complete && session.winner === 'player' ? 'victory' : 'idle', enemy: complete && session.winner === 'enemy' ? 'victory' : 'idle' } as const;
    if (!current || !motionAllowed || animatedRound.current === key) { animatedRound.current = key; setPose(rest); return; }
    animatedRound.current = key;
    setPose({ player: 'idle', enemy: 'idle' });
    const start = window.requestAnimationFrame(() => setPose({ player: battleActionAnimation(current.actions.player), enemy: battleActionAnimation(current.actions.enemy) }));
    const hit = window.setTimeout(() => setPose({ player: current.damageTaken.player > 0 ? 'hit' : 'idle', enemy: current.damageTaken.enemy > 0 ? 'hit' : 'idle' }), 650);
    const idle = window.setTimeout(() => setPose({ player: complete && session.winner === 'player' ? 'victory' : 'idle', enemy: complete && session.winner === 'enemy' ? 'victory' : 'idle' }), 1150);
    return () => { window.cancelAnimationFrame(start); window.clearTimeout(hit); window.clearTimeout(idle); };
  }, [session.id, current?.round, motionAllowed, complete, session.winner]);
  const companions = [session.player, ...party.filter(pet => pet.petId !== session.player.petId)].slice(0, 4);
  const closeLeave = () => { setLeaveOpen(false); window.setTimeout(() => leaveTrigger.current?.focus(), 0); };
  const closeLogs = () => { setLogsOpen(false); window.setTimeout(() => logTrigger.current?.focus(), 0); };
  const advantageChain = ['metal', 'wood', 'earth', 'water', 'fire'];
  const advantage = advantageChain[(advantageChain.indexOf(session.player.element) + 1) % 5] === session.enemy.element ? '属性克制' : advantageChain[(advantageChain.indexOf(session.enemy.element) + 1) % 5] === session.player.element ? '属性受制' : modeLabels[session.mode];
  return <div className="battle-live-layout">
    <section className="battle-arena" aria-label="当前对战">
      <div className="battle-arena-viewport">
        <div className="battle-arena-top">
          <CombatantStatus pet={session.player} actor={session.snapshot.player} rules={rules}/>
          <div className="battle-round-number"><span>{complete ? '对战结束' : waiting ? '等待好友' : `第 ${session.snapshot.round + 1} 回合`}</span><strong>{String(complete ? session.snapshot.round : session.snapshot.round + 1).padStart(2, '0')}</strong><small className="battle-affinity"><ElementMark element={session.player.element}/>{advantage}<ElementMark element={session.enemy.element}/></small></div>
          <CombatantStatus pet={session.enemy} actor={session.snapshot.enemy} rules={rules} enemy/>
        </div>
        <div className="battle-stage" data-round={current?.round || 0}><BattlePortrait pet={session.player} action={pose.player}/><BattlePortrait pet={session.enemy} action={pose.enemy} facing="left"/></div>
        <div className="battle-arena-message" role="status" aria-live="polite">{complete ? session.status === 'abandoned' ? '已离开对战，回合记录已保存' : session.winner === 'player' ? '并肩获胜，每一步都值得记住。' : '每一次并肩，都是成长。' : waiting ? '分享房间码，等待约好的好友进入。' : session.pendingAction ? `第 ${session.pendingAction.roundNo} 回合行动已锁定${session.pendingAction.uncertain ? '，等待确认' : '，等待对方行动'}` : '选择本回合行动，与伙伴并肩出战。'}</div>
      </div>
      {complete ? <div className="battle-complete-actions"><Button onClick={onReport}>查看战报与结算 <MoveRight size={16}/></Button></div> : <BattleMoves session={session} rules={rules} busy={busy} onAct={onAct}/>}
    </section>
    <aside className="battle-live-sidebar">
      <Card className="battle-side-panel">
        <section className="battle-party-section">
          <div className="battle-side-heading"><h3>出战伙伴</h3><Button variant="ghost" className="battle-text-link" onClick={() => navigate('/companions')}>更多 <ChevronRight size={12}/></Button></div>
          <div className="battle-party-grid">{companions.map((pet, index) => <div key={pet.petId} className={index === 0 ? 'chosen' : ''}><BattlePortrait pet={pet} small/><strong>{petName(pet)}</strong><small>Lv.{String(pet.level || 1).padStart(2, '0')}</small></div>)}</div>
          <p className="battle-authority-label">{session.mode === 'friend' ? '好友房间' : session.mode === 'training' ? '本机训练 · 电脑对手' : '本机挑战'} · 标准生命 {rules.maxHp}</p>
          {session.room && <div className="battle-room-summary"><span>房间码 <strong>{session.room.room_code}</strong></span><small>{syncedAt ? `已核对 ${new Date(syncedAt).toLocaleTimeString('zh-CN')}` : '等待同步'}</small></div>}
        </section>
        <section className="battle-current-log">
          <div className="battle-side-heading"><h3>回合记录</h3><Button variant="ghost" className="battle-text-link" onClick={event => { logTrigger.current = event.currentTarget; setLogsOpen(true); }} disabled={!session.rounds.length}>查看全部 <ChevronRight size={12}/></Button></div>
          {current ? <><p className="battle-log-round">第 {current.round} 回合</p><ScrollArea className="battle-live-log-scroll"><ol>{roundLines(current, session.player, session.enemy).slice(0, 3).map((line, index) => <li key={index}><span className="battle-log-mark"><ScrollText size={13}/></span><span>{line}</span></li>)}<li className="battle-log-anger"><span className="battle-log-mark"><ElementMark element={session.player.element}/></span><span>{petName(session.player)}怒气 {current.angerAfter?.player ?? session.snapshot.player.anger}/{rules.maxAnger}</span></li></ol></ScrollArea></> : <p className="battle-log-empty">行动结算后，伤害、怒气与异常状态会记在这里。</p>}
        </section>
        <div className="battle-side-actions">
          {session.pendingAction?.uncertain && <Button variant="secondary" disabled={busy} onClick={onRetry}>重试原回合行动</Button>}
          {session.room && !complete && <Button variant="ghost" className="battle-sync-button" disabled={busy} onClick={onSync}><RefreshCw size={14}/>同步 / 恢复</Button>}
          {!complete && <Button variant="secondary" className="battle-leave-button" onClick={event => { leaveTrigger.current = event.currentTarget; setLeaveOpen(true); }} disabled={busy}><LogOut size={18}/>离开对战</Button>}
        </div>
      </Card>
      {logsOpen && <AppDialog title="本场回合记录" onClose={closeLogs}><Card className="battle-round-dialog"><div className="battle-side-heading"><h2>本场回合记录</h2><Button variant="ghost" aria-label="关闭回合记录" onClick={closeLogs}><X size={18}/></Button></div><ScrollArea className="battle-all-rounds">{session.rounds.map(round => <section key={round.round}><h3>第 {round.round} 回合</h3><ol>{roundLines(round, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></section>)}</ScrollArea></Card></AppDialog>}
      {leaveOpen && <AppDialog title="确认离开对战" onClose={closeLeave} busy={busy}><Card className="battle-leave-confirm"><h2>现在离开这场对战？</h2><p>{session.mode === 'friend' ? '离开会通知服务器结束本场对战。' : '离开后会保存当前回合记录。'}</p><div className="battle-two-buttons"><Button variant="secondary" autoFocus onClick={closeLeave}>继续对战</Button><Button variant="danger" disabled={busy} onClick={() => { setLeaveOpen(false); onLeave(); }}>确认离开</Button></div></Card></AppDialog>}
    </aside>
  </div>;
}
