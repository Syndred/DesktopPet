import { useEffect, useRef, useState } from 'react';
import { Droplets, MoveRight, RefreshCw, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { BattleActor, BattleParticipant, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import type { CharacterResource, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { request } from '../../app/bridge';
import { AppDialog, Button, Card, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { useAppMotion } from '../../components/motion';
import { ResourceStage } from '../resources/ResourceStage';
import { resourceAssetUrl } from '../resources/client';
import { actionLabels, elements, modeLabels, petName, roundLines, statusLabel } from './presentation';

const fallback2d = (pet: BattleParticipant) => pet.element === 'water' ? 'builtin:lingjing-battle-yuwan-v1' : 'builtin:lingjing-battle-shiba-v1';
const publicResources = new Map<string, Promise<CharacterResource>>();
async function resolve2d(petId: string, resourceId: string) {
  const load = async () => {
    const result = await request<{ resource: CharacterResource }>('resources', 'resolve', { petId, resourceId, context: 'battle', action: 'idle' });
    if (result.resource.kind !== 'spritesheet') throw new Error('本版仅显示 2D 角色');
    return result.resource;
  };
  if (!resourceId.startsWith('builtin:')) return load();
  let cached = publicResources.get(resourceId);
  if (!cached) {
    cached = load().catch(error => { publicResources.delete(resourceId); throw error; });
    publicResources.set(resourceId, cached);
  }
  return cached;
}

/** Reuses the resource service and Pixi AnimatedSprite stage used by companions. */
export function BattlePortrait({ pet, facing = 'right', small = false, action = 'idle', playing = true }: {
  pet: BattleParticipant; facing?: 'left' | 'right'; small?: boolean; action?: ResourceAction; playing?: boolean;
}) {
  const [resource, setResource] = useState<CharacterResource | null>(null);
  const [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const resourceId = pet.appearance2d || (pet.resource?.kind === '2d' ? pet.resource.resourceId : fallback2d(pet));
  useEffect(() => {
    let alive = true;
    setResource(null); setError('');
    resolve2d(pet.petId, resourceId).catch(() => resolve2d(pet.petId, fallback2d(pet))).then(value => {
      if (alive) setResource(value);
    }).catch(() => { if (alive) setError('2D 角色资源暂未就绪'); });
    return () => { alive = false; };
  }, [pet.petId, pet.element, resourceId]);
  const sheet = resource?.sheet;
  return <div className={`battle-portrait ${small ? 'small' : ''} element-${pet.element}`} data-pet-id={pet.petId} data-2d-only="true" data-animating={playing && motionAllowed}>
    {resource && small && sheet ? <span className="battle-sprite-thumb" role="img" aria-label={petName(pet)} style={{
      backgroundImage: `url("${resourceAssetUrl(resource.id, resource.entryAsset)}")`,
      backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`, backgroundPosition: '0 0'
    }}/> : resource ? <ResourceStage resource={resource} petId={pet.petId} context="battle" action={action} facing={facing} playing={playing && motionAllowed}/> : <span className="battle-asset-state" role="status">{error || '正在唤醒伙伴…'}</span>}
  </div>;
}

export function CombatantStatus({ pet, actor, enemy = false }: { pet: BattleParticipant; actor: BattleActor; enemy?: boolean }) {
  const element = elements[actor.element] || elements.water;
  return <div className={`combatant-status ${enemy ? 'enemy' : ''}`}><BattlePortrait pet={pet} small/>
    <div className="combatant-bars"><div className="combatant-title"><strong>{petName(pet)}</strong><span>Lv.{String(pet.level || 1).padStart(2, '0')} · {element.label}</span></div>
      <div className="battle-meter-row"><span>生命</span><progress aria-label={`${petName(pet)}生命`} max={actor.maxHp} value={actor.hp}/><b>{actor.hp}/{actor.maxHp}</b></div>
      <div className="battle-meter-row anger"><span>怒气</span><progress aria-label={`${petName(pet)}怒气`} max={100} value={actor.anger}/><b>{actor.anger}/100</b></div>
      <div className="battle-statuses">{actor.statuses.map(status => <span key={status.type}>{statusLabel(status)}</span>)}</div>
    </div>
  </div>;
}

const moves = [
  { action: 'normal_attack', icon: Swords, description: '打断属性攻击' },
  { action: 'element_attack', icon: Droplets, description: '附加五行效果' },
  { action: 'dodge', icon: Shield, description: '躲开普通攻击' },
  { action: 'ultimate', icon: Zap, description: '必定命中 · 治疗' }
] as const;
export const battleActionAnimation = (action: string): ResourceAction => action === 'ultimate' || action === 'element_attack' ? 'skill' : action === 'normal_attack' ? 'attack' : action === 'dodge' ? 'walk' : 'idle';
export function BattleArena({ session, busy, onAct, onSync, onLeave, onReport, syncedAt, onRetry, party = [] }: {
  session: BattleSession; busy: boolean; onAct(action: BattleActionType): void; onSync(): void;
  onLeave(): void; onReport(): void; onRetry(): void; syncedAt?: string; party?: BattleParticipant[];
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const leaveTrigger = useRef<HTMLButtonElement | null>(null);
  const motionAllowed = useAppMotion();
  const [pose, setPose] = useState<{ player: ResourceAction; enemy: ResourceAction }>({ player: 'idle', enemy: 'idle' });
  const current = session.rounds.at(-1);
  const complete = ['finished', 'abandoned'].includes(session.status);
  const waiting = session.status === 'waiting';
  useEffect(() => {
    if (!current || !motionAllowed) { setPose({ player: 'idle', enemy: 'idle' }); return; }
    setPose({ player: battleActionAnimation(current.actions.player), enemy: battleActionAnimation(current.actions.enemy) });
    const hit = window.setTimeout(() => setPose({ player: current.damageTaken.player > 0 ? 'hit' : 'idle', enemy: current.damageTaken.enemy > 0 ? 'hit' : 'idle' }), 650);
    const idle = window.setTimeout(() => setPose({ player: 'idle', enemy: 'idle' }), 1150);
    return () => { window.clearTimeout(hit); window.clearTimeout(idle); };
  }, [session.id, current?.round, motionAllowed]);
  const companions = [session.player, ...party.filter(pet => pet.petId !== session.player.petId)].slice(0, 4);
  const closeLeave = () => { setLeaveOpen(false); window.setTimeout(() => leaveTrigger.current?.focus(), 0); };
  return <div className="battle-live-layout"><section className="battle-arena" aria-label="当前对战"><div className="battle-arena-viewport">
    <div className="battle-arena-top"><CombatantStatus pet={session.player} actor={session.snapshot.player}/><div className="battle-round-number"><span>{complete ? '对战结束' : waiting ? '等待好友' : `第 ${session.snapshot.round + 1} 回合`}</span><strong>{String(complete ? session.snapshot.round : session.snapshot.round + 1).padStart(2, '0')}</strong><small>{modeLabels[session.mode]}</small></div><CombatantStatus pet={session.enemy} actor={session.snapshot.enemy} enemy/></div>
    <div className="battle-stage"><BattlePortrait pet={session.player} action={pose.player}/><div className="battle-vs"><Sparkles size={24}/><span>VS</span></div><BattlePortrait pet={session.enemy} action={pose.enemy} facing="left"/></div>
    <div className="battle-arena-message" role="status" aria-live="polite">{complete ? session.status === 'abandoned' ? '已离开对战，回合记录已保存' : session.winner === 'player' ? '并肩获胜，每一步都值得记住。' : '每一次并肩，都是成长。' : waiting ? '分享房间码，等待约好的好友进入。' : session.pendingAction ? `第 ${session.pendingAction.roundNo} 回合行动已锁定${session.pendingAction.uncertain ? '，等待确认' : '，等待对方行动'}` : '选择本回合行动，与伙伴并肩出战。'}</div>
    </div>{complete ? <div className="battle-complete-actions"><Button onClick={onReport}>查看战报与结算 <MoveRight size={16}/></Button></div> : <div className="battle-moves">{moves.map(move => {
      const disabled = busy || waiting || Boolean(session.pendingAction) || (move.action === 'ultimate' && session.snapshot.player.anger < 50) || (move.action === 'dodge' && session.snapshot.player.freeDodgeUsed && session.snapshot.player.anger <= 0);
      const reason = busy ? '正在提交行动' : waiting ? '等待好友进入房间' : session.pendingAction ? '本回合行动已锁定，请同步原回合' : move.action === 'ultimate' && session.snapshot.player.anger < 50 ? '需要至少 50 怒气' : move.action === 'dodge' && session.snapshot.player.freeDodgeUsed && session.snapshot.player.anger <= 0 ? '免费闪避已使用，需要怒气' : move.description;
      return <TooltipProvider key={move.action}><Tooltip><TooltipTrigger asChild><span className="battle-move-tooltip" tabIndex={disabled ? 0 : -1}><button className={`battle-move ${move.action}`} disabled={disabled} onClick={() => onAct(move.action)}><move.icon size={27}/><strong>{actionLabels[move.action]}</strong><small>{move.description}</small><span>{move.action === 'ultimate' ? `${session.snapshot.player.anger}/50 怒气` : move.action === 'dodge' ? session.snapshot.player.freeDodgeUsed ? '消耗最多 20 怒气' : '首次免费' : '无需冷却'}</span></button></span></TooltipTrigger><TooltipContent>{reason}</TooltipContent></Tooltip></TooltipProvider>;
    })}</div>}</section>
    <aside className="battle-live-sidebar"><Card><h3>出战伙伴</h3><div className="battle-party-grid">{companions.map((pet, index) => <div key={pet.petId} className={index === 0 ? 'chosen' : ''}><BattlePortrait pet={pet} small/><strong>{petName(pet)}</strong><small>Lv.{pet.level || 1}</small></div>)}</div>{session.room ? <div className="battle-room-summary"><span>房间码</span><strong>{session.room.room_code}</strong><small>{syncedAt ? `已核对 ${new Date(syncedAt).toLocaleTimeString('zh-CN')}` : '等待同步'}</small><Button variant="secondary" disabled={busy} onClick={onSync}><RefreshCw size={15}/>同步 / 恢复</Button></div> : <p className="battle-authority-label">{session.mode === 'training' ? '本机训练 · 电脑对手' : '本机挑战 · 完成后返回来源页面'}</p>}</Card>
    <Card className="battle-current-log"><h3>回合记录 <Sparkles size={16}/></h3>{current ? <><p className="muted">第 {current.round} 回合</p><ol>{roundLines(current, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></> : <p className="muted">行动结算后，伤害、怒气与异常状态会记在这里。</p>}</Card>
    {session.pendingAction?.uncertain ? <Button variant="secondary" disabled={busy} onClick={onRetry}>重试原回合行动</Button> : null}
    {!complete && <Button variant="secondary" onClick={event => { leaveTrigger.current = event.currentTarget; setLeaveOpen(true); }} disabled={busy}>离开对战</Button>}
    {leaveOpen ? <AppDialog title="确认离开对战" onClose={closeLeave} busy={busy}><Card className="battle-leave-confirm"><h2>现在离开这场对战？</h2><p>{session.mode === 'friend' ? '离开会通知服务器结束本场对战。' : '离开后会保存当前回合记录。'}</p><div className="battle-two-buttons"><Button variant="secondary" autoFocus onClick={closeLeave}>继续对战</Button><Button variant="danger" disabled={busy} onClick={() => { setLeaveOpen(false); onLeave(); }}>确认离开</Button></div></Card></AppDialog> : null}
    </aside>
  </div>;
}
