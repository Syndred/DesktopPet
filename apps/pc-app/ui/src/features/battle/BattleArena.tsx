import { useEffect, useRef, useState, type ComponentType } from 'react';
import { createElement } from 'react';
import { Flame, MoveRight, RefreshCw, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import type { BattleActor, BattleParticipant, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { BattleActionType } from '../../../../../../packages/shared-types/src/battle';
import { request } from '../../app/bridge';
import { Button, Card } from '../../components/ui';
import { actionLabels, elements, modeLabels, petName, roundLines, statusLabel } from './presentation';

const sharedStages = import.meta.glob('../resources/ResourceStage.tsx');
// Resolve the same resource reference as companions. Model files are never copied into battle.
export function BattlePortrait({ pet, facing = 'right', small = false }: { pet: BattleParticipant; facing?: 'left' | 'right'; small?: boolean }) {
  const [asset, setAsset] = useState<{ url?: string; kind?: string; clip?: string; warning?: string; scale?: number; resource?: any; Stage?: ComponentType<any> } | null>(null);
  const resourceId = pet.resourceRef || pet.resource?.resourceId || (pet.model ? `legacy:${pet.model.split(/[\\/]/).pop()?.toLowerCase()}` : '');
  useEffect(() => {
    if (small || !resourceId) return;
    let alive = true;
    request<any>('resources', 'resolve', { petId: pet.petId, resourceId, context: 'battle', action: 'idle', facing })
      .then(async resolved => {
        if (!alive) return;
        const resource = resolved.resource;
        const kind = resource?.kind;
        const key = resource?.entryAsset;
        const url = resolved.url || resource?.url || (key ? `lingjing-resource://asset/${encodeURIComponent(resource.id)}/${key.split('/').map(encodeURIComponent).join('/')}` : undefined);
        const module = sharedStages['../resources/ResourceStage.tsx'] ? await sharedStages['../resources/ResourceStage.tsx']() as { ResourceStage: ComponentType<any> } : null;
        if (!module && kind === 'model3d') await import('@google/model-viewer');
        if (alive) setAsset({ url, kind, clip: resolved.clip?.name, scale: resolved.calibration?.scale, warning: resolved.warning, resource, Stage: module?.ResourceStage });
      }).catch(() => { if (alive) setAsset(null); });
    return () => { alive = false; };
  }, [pet.petId, resourceId, facing, small]);
  const element = elements[pet.element] || elements.water;
  return <div className={`battle-portrait ${small ? 'small' : ''} element-${pet.element}`}>
    {asset?.Stage && asset.resource ? <asset.Stage resource={asset.resource} petId={pet.petId} context="battle" action="idle" facing={facing}/> : asset?.url && asset.kind === 'model3d' ? createElement('model-viewer', {
      src: asset.url, alt: petName(pet), autoplay: true, 'animation-name': asset.clip,
      'camera-orbit': facing === 'right' ? '35deg 80deg auto' : '-35deg 80deg auto',
      'interaction-prompt': 'none', 'shadow-intensity': '0', exposure: '1',
      style: { width: '100%', height: '100%', transform: `scale(${asset.scale || 1})` }
    }) : <><span className="battle-sigil" aria-hidden="true">{element.symbol}</span><span className="battle-monogram">{[...petName(pet)][0]}</span></>}
    {!small && !asset?.url ? <span className="battle-resource-label">{resourceId ? '角色资源暂未加载' : `${element.label}系伙伴`}</span> : null}
  </div>;
}

export function CombatantStatus({ pet, actor, enemy = false }: { pet: BattleParticipant; actor: BattleActor; enemy?: boolean }) {
  const element = elements[actor.element] || elements.water;
  return <div className={`combatant-status ${enemy ? 'enemy' : ''}`}>
    <div className="combatant-title"><strong>{petName(pet)}</strong><span>Lv.{String(pet.level || 1).padStart(2, '0')} · {element.label}</span></div>
    <div className="battle-meter-row"><span>生命</span><progress aria-label={`${petName(pet)}生命`} max={actor.maxHp} value={actor.hp}/><b>{actor.hp}/{actor.maxHp}</b></div>
    <div className="battle-meter-row anger"><span>怒气</span><progress aria-label={`${petName(pet)}怒气`} max={100} value={actor.anger}/><b>{actor.anger}/100</b></div>
    <div className="battle-statuses">{actor.statuses.map(status => <span key={status.type}>{statusLabel(status)}</span>)}</div>
  </div>;
}

const moves = [
  { action: 'normal_attack', icon: Swords, description: '打断属性攻击' },
  { action: 'element_attack', icon: Flame, description: '克制闪避 · 附加五行效果' },
  { action: 'dodge', icon: Shield, description: '躲开普攻 · 首次可免费' },
  { action: 'ultimate', icon: Zap, description: '必定命中 · 回复 20 生命' }
] as const;

export function BattleArena({ session, busy, onAct, onSync, onLeave, onReport, syncedAt, onRetry }: {
  session: BattleSession; busy: boolean; onAct(action: BattleActionType): void; onSync(): void;
  onLeave(): void; onReport(): void; onRetry(): void; syncedAt?: string;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const current = session.rounds.at(-1);
  const complete = ['finished', 'abandoned'].includes(session.status);
  const waiting = session.status === 'waiting';
  useEffect(() => { if (leaveOpen) cancel.current?.focus(); }, [leaveOpen]);
  return <div className="battle-live-layout">
    <section className="battle-arena" aria-label="当前对战">
      <div className="battle-arena-top"><CombatantStatus pet={session.player} actor={session.snapshot.player}/><div className="battle-round-number"><span>{complete ? '对战结束' : waiting ? '等待好友' : `第 ${session.snapshot.round + 1} 回合`}</span><strong>{String(session.snapshot.round).padStart(2, '0')}</strong><small>{modeLabels[session.mode]}</small></div><CombatantStatus pet={session.enemy} actor={session.snapshot.enemy} enemy/></div>
      <div className="battle-stage"><BattlePortrait pet={session.player}/><div className="battle-vs">✧<span>VS</span>✧</div><BattlePortrait pet={session.enemy} facing="left"/></div>
      <div className="battle-arena-message" role="status" aria-live="polite">{complete ? session.status === 'abandoned' ? '已离开对战，回合记录已保存' : session.winner === 'player' ? '并肩获胜，每一步都值得记住。' : '这次的经历，会成为下一次的力量。' : waiting ? '分享房间码，或等待已约好的好友进入。' : session.pendingAction ? `第 ${session.pendingAction.roundNo} 回合行动已锁定${session.pendingAction.uncertain ? '，正在等待确认' : '，等待对方行动'}` : '选择本回合行动，与伙伴并肩出战。'}</div>
      {complete ? <div className="battle-complete-actions"><Button onClick={onReport}>查看战报与结算 <MoveRight size={16}/></Button></div> : <div className="battle-moves">{moves.map(move => {
        const disabled = busy || waiting || Boolean(session.pendingAction) || (move.action === 'ultimate' && session.snapshot.player.anger < 50) || (move.action === 'dodge' && session.snapshot.player.freeDodgeUsed && session.snapshot.player.anger <= 0);
        return <button key={move.action} className={`battle-move ${move.action}`} disabled={disabled} onClick={() => onAct(move.action)}><move.icon size={26}/><strong>{actionLabels[move.action]}</strong><small>{move.description}</small><span>{move.action === 'ultimate' ? `${session.snapshot.player.anger}/50 怒气` : move.action === 'dodge' ? session.snapshot.player.freeDodgeUsed ? '消耗最多 20 怒气' : '首次免费' : '无需冷却'}</span></button>;
      })}</div>}
    </section>
    <aside className="battle-live-sidebar"><Card><h3>本场伙伴</h3><div className="battle-pet-summary"><BattlePortrait pet={session.player} small/><div><strong>{petName(session.player)}</strong><p>Lv.{session.player.level || 1} · {elements[session.player.element].label}</p></div></div>{session.room ? <div className="battle-room-summary"><span>房间码</span><strong>{session.room.room_code}</strong><small>{syncedAt ? `已核对 ${new Date(syncedAt).toLocaleTimeString('zh-CN')}` : '等待同步'}</small><Button variant="secondary" disabled={busy} onClick={onSync}><RefreshCw size={15}/> 同步 / 恢复</Button></div> : <p className="muted">{session.mode === 'training' ? '本机训练对手，由原战斗规则执行。' : '本机挑战，结算结果交回来源页面。'}</p>}</Card>
      <Card className="battle-current-log"><h3>回合记录 <Sparkles size={16}/></h3>{current ? <><p className="muted">第 {current.round} 回合</p><ol>{roundLines(current, session.player, session.enemy).map((line, index) => <li key={index}>{line}</li>)}</ol></> : <p className="muted">行动结算后，伤害、怒气与异常状态会记在这里。</p>}</Card>
      {session.pendingAction?.uncertain ? <Button variant="secondary" disabled={busy} onClick={onRetry}>重试原回合行动</Button> : null}
      {!complete && <Button variant="secondary" onClick={() => setLeaveOpen(true)} disabled={busy}>离开对战</Button>}
      {leaveOpen ? <div className="battle-leave-confirm" role="alertdialog" aria-label="确认离开对战" onKeyDown={event => { if (event.key === 'Escape') setLeaveOpen(false); }}><p>{session.mode === 'friend' ? '离开会通知服务器结束本场对战。' : '离开后会保存当前回合记录。'}</p><Button variant="danger" disabled={busy} onClick={() => { setLeaveOpen(false); onLeave(); }}>确认离开</Button><button ref={cancel} className="button button-secondary" onClick={() => setLeaveOpen(false)}>继续对战</button></div> : null}
    </aside>
  </div>;
}
