import { useEffect, useState } from 'react';
import { ArrowLeft, Heart } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { AppPresence, useAppMotion } from '../../components/motion';
import { Dialog, DialogTrigger } from '../../components/ui/dialog';
import { navigate } from '../../app/navigation';
import type { BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import type { ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import type { DiscoveryAction, DiscoveryPet, DiscoverySnapshot, WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import { BattleMoves } from '../battle/BattleMoves';
import { battleActionAnimation } from '../battle/BattleArena';
import { ResourcePortrait } from './ResourcePortrait';
import { CaptureDialog } from './CaptureDialog';
import { actionId, type useDiscovery } from './use-discovery';
import { elements } from './presentation';
import lake from './assets/wild-lake-v1.png';

/** Only project the persisted encounter for the shared command cards. The battle
 * feature remains the owner of combat state, rules, actions and settlement. */
function battleSession(encounter: WildEncounter, pet?: DiscoveryPet): BattleSession {
  return {
    id: encounter.battle.battleId, mode: 'wild', revision: encounter.revision,
    status: encounter.status === 'challenging' ? 'active' : encounter.status === 'cancelled' ? 'abandoned' : 'finished',
    startedAt: new Date(encounter.createdAt).toISOString(),
    player: { petId: encounter.petId, petName: pet?.name || '出战伙伴', element: encounter.battle.view.player.element, level: pet?.level, appearance2d: pet?.resource.resourceId },
    enemy: { petId: encounter.spawn.id, petName: encounter.spawn.name, element: encounter.spawn.element, level: 1, appearance2d: encounter.spawn.resourceId },
    snapshot: encounter.battle.view, rounds: encounter.battle.rounds, winner: encounter.battle.winner, rules: encounter.battle.rules
  };
}

function useEncounterPose(encounter: WildEncounter) {
  const motionAllowed = useAppMotion();
  const current = encounter.battle.rounds.at(-1);
  const round = current?.round, playerAction = current?.actions.player, enemyAction = current?.actions.enemy;
  const playerDamage = current?.damageTaken.player || 0, enemyDamage = current?.damageTaken.enemy || 0;
  const complete = encounter.battle.finished, winner = encounter.battle.winner;
  const [pose, setPose] = useState<{ player: ResourceAction; enemy: ResourceAction }>({ player: 'idle', enemy: 'idle' });
  useEffect(() => {
    const settled = { player: complete && winner === 'player' ? 'victory' : 'idle', enemy: complete && winner === 'enemy' ? 'victory' : 'idle' } as const;
    if (!round || !motionAllowed) { setPose(settled); return; }
    setPose({ player: battleActionAnimation(playerAction || ''), enemy: battleActionAnimation(enemyAction || '') });
    const hit = window.setTimeout(() => setPose({ player: playerDamage > 0 ? 'hit' : 'idle', enemy: enemyDamage > 0 ? 'hit' : 'idle' }), 650);
    const idle = window.setTimeout(() => setPose(settled), 1150);
    return () => { window.clearTimeout(hit); window.clearTimeout(idle); };
  }, [encounter.encounterId, round, playerAction, enemyAction, playerDamage, enemyDamage, motionAllowed, complete, winner]);
  return pose;
}

export function EncounterView({ encounter, state, pending, run }: { encounter: WildEncounter; state: DiscoverySnapshot; pending: boolean; run: ReturnType<typeof useDiscovery>['run'] }) {
  const [inviting, setInviting] = useState(false), pet = state.pets.find(p => p.petId === encounter.petId);
  const pose = useEncounterPose(encounter), session = battleSession(encounter, pet), rules = encounter.battle.rules;
  const act = (action: DiscoveryAction) => void run('act', { encounterId: encounter.encounterId, action, expectedRevision: encounter.revision, actionId: actionId() });
  const leave = async () => { if (await run('cancel', { encounterId: encounter.encounterId, actionId: actionId() })) navigate('/discovery'); };
  return <Dialog open={inviting} onOpenChange={open => { if(!pending)setInviting(open); }}><div className="discovery-encounter"><Button variant="ghost" className="discovery-back" onClick={() => navigate('/discovery')}><ArrowLeft size={16}/>返回地图，保留挑战进度</Button><header className="discovery-heading"><span>附近探索 / 野外挑战</span><h1>和伙伴一起，向新的相遇出发。</h1><p>{encounter.status === 'won' ? '挑战胜利，新伙伴正在等待你的邀请。' : encounter.status === 'lost' ? '这次还差一点，休息一下再出发。' : '先切磋一下，再邀请她加入吧。'}</p></header>
    <div className="discovery-encounter-grid"><section className="discovery-arena" style={{ backgroundImage: `url("${lake}")` }}>
      <div className="discovery-combatants">{(['player', 'enemy'] as const).map(side => { const c = encounter.battle.view[side], name = side === 'player' ? pet?.name || '出战伙伴' : encounter.spawn.name; return <div className="discovery-health" key={side}><strong>{name}<span>{elements[c.element]}</span></strong><small>{c.hp} / {c.maxHp}</small><progress value={c.hp} max={c.maxHp} aria-label={`${name}生命值`}/><small>怒气 {c.anger} / {rules.maxAnger}</small></div>; })}</div>
      <span className="discovery-round">{encounter.battle.finished ? '挑战结束' : `第 ${encounter.battle.view.round + 1} 回合`}</span>
      <div className="discovery-arena-characters">{pet ? <ResourcePortrait resourceId={pet.resource.resourceId} instanceId={pet.petId} action={pose.player}/> : null}<ResourcePortrait resourceId={encounter.spawn.resourceId} instanceId={encounter.spawn.id} action={pose.enemy} facing="left"/></div>
      <p className="discovery-rules-caption">{rules.label} · 生命归一为 {rules.maxHp}，养成属性保留</p>
      {encounter.status === 'challenging' ? <BattleMoves session={session} rules={rules} busy={pending} onAct={act}/> : <div className="discovery-battle-ended">{encounter.status === 'won' ? <DialogTrigger asChild><Button disabled={pending}><Heart size={18}/>邀请成为伙伴</Button></DialogTrigger> : <span>挑战已结束 · 本次未收服</span>}</div>}
    </section><Card className="discovery-round-log"><h3>回合记录</h3>{encounter.battle.rounds.length ? encounter.battle.rounds.slice(-7).map(round => <div key={round.round}><small>第 {round.round} 回合</small><p>对方受伤 {round.damageTaken.enemy} · 我方受伤 {round.damageTaken.player}</p></div>) : <p>等待第一回合。</p>}<Button variant="ghost" disabled={pending || encounter.status === 'captured'} onClick={() => void leave()}>{encounter.status === 'won' ? '放弃本次邀请' : '离开这次遭遇'}</Button></Card></div>
    <AppPresence>{inviting ? <CaptureDialog key={encounter.encounterId} encounter={encounter} state={state} pending={pending} run={run} close={() => setInviting(false)}/> : null}</AppPresence>
  </div></Dialog>;
}
