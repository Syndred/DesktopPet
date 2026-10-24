import { useState } from 'react';
import { ArrowLeft, Droplet, Heart, Shield, Sparkles, Swords } from 'lucide-react';
import { Button, Card } from '../../components/ui';
import { navigate } from '../../app/navigation';
import type { DiscoveryAction, DiscoverySnapshot, WildEncounter } from '../../../../../../packages/shared-types/src/features/discovery';
import { ResourcePortrait } from './ResourcePortrait';
import { CaptureDialog } from './CaptureDialog';
import { actionId, type useDiscovery } from './use-discovery';
import { elements } from './presentation';
import lake from './assets/wild-lake-v1.png';
const actions = [{ id: 'normal_attack', title: '普通攻击', detail: '稳定出招', icon: Swords }, { id: 'element_attack', title: '属性攻击', detail: '运用五行克制', icon: Droplet }, { id: 'dodge', title: '闪避', detail: '伺机而动', icon: Shield }, { id: 'ultimate', title: '大招', detail: '需要 50 怒气', icon: Sparkles }] as const;
export function EncounterView({ encounter, state, pending, run }: { encounter: WildEncounter; state: DiscoverySnapshot; pending: boolean; run: ReturnType<typeof useDiscovery>['run'] }) {
  const [inviting, setInviting] = useState(false), pet = state.pets.find(p => p.petId === encounter.petId);
  const act = (action: DiscoveryAction) => void run('act', { encounterId: encounter.encounterId, action, expectedRevision: encounter.revision, actionId: actionId() });
  const leave = async () => { if (await run('cancel', { encounterId: encounter.encounterId, actionId: actionId() })) navigate('/discovery'); };
  return <div className="discovery-encounter"><Button variant="ghost" className="discovery-back" onClick={() => navigate('/discovery')}><ArrowLeft size={16}/>返回地图，保留挑战进度</Button><header className="discovery-heading"><span>附近探索 / 野外挑战</span><h1>和伙伴一起，向新的相遇出发。</h1><p>{encounter.status === 'won' ? '挑战胜利，新伙伴正在等待你的邀请。' : encounter.status === 'lost' ? '这次还差一点，休息一下再出发。' : '先切磋一下，再邀请她加入吧。'}</p></header>
    <div className="discovery-encounter-grid"><section className="discovery-arena" style={{ backgroundImage: `url("${lake}")` }}>
      <div className="discovery-combatants">{(['player', 'enemy'] as const).map(side => { const c = encounter.battle.view[side], name = side === 'player' ? pet?.name || '出战伙伴' : encounter.spawn.name; return <div className="discovery-health" key={side}><strong>{name}<span>{elements[c.element]}</span></strong><small>{c.hp} / {c.maxHp}</small><progress value={c.hp} max={c.maxHp} aria-label={`${name}生命值`}/><small>怒气 {c.anger}</small></div>; })}</div>
      <span className="discovery-round">第 {encounter.battle.view.round} 回合</span>
      <div className="discovery-arena-characters">{pet ? <ResourcePortrait resourceId={pet.resource.resourceId} instanceId={pet.petId} victory={encounter.status === 'won'}/> : null}<ResourcePortrait resourceId={encounter.spawn.resourceId} instanceId={encounter.spawn.id} action={encounter.status === 'lost' ? 'victory' : 'idle'}/></div>
      {encounter.status === 'challenging' ? <div className="discovery-battle-actions">{actions.map(action => <Button variant="ghost" key={action.id} disabled={pending || (action.id === 'ultimate' && encounter.battle.view.player.anger < 50)} onClick={() => act(action.id)}><action.icon size={22}/><span><strong>{action.title}</strong><small>{action.detail}</small></span></Button>)}</div> : <div className="discovery-battle-ended">{encounter.status === 'won' ? <Button disabled={pending} onClick={() => setInviting(true)}><Heart size={18}/>邀请成为伙伴</Button> : <span>挑战已结束 · 本次未收服</span>}</div>}
    </section><Card className="discovery-round-log"><h3>回合记录</h3>{encounter.battle.rounds.length ? encounter.battle.rounds.slice(-7).map(round => <div key={round.round}><small>第 {round.round} 回合</small><p>对方受伤 {round.damageTaken.enemy} · 我方受伤 {round.damageTaken.player}</p></div>) : <p>等待第一回合。</p>}<Button variant="ghost" disabled={pending || encounter.status === 'captured'} onClick={() => void leave()}>{encounter.status === 'won' ? '放弃本次邀请' : '离开这次遭遇'}</Button></Card></div>
    {inviting ? <CaptureDialog encounter={encounter} state={state} pending={pending} run={run} close={() => setInviting(false)}/> : null}
  </div>;
}
