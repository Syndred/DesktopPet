import { useEffect, useState } from 'react';
import { Info, RefreshCw, Swords, UsersRound } from 'lucide-react';
import type { ElementType } from '../../../../../../packages/shared-types/src/battle';
import type { BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { request } from '../../app/bridge';
import { navigate, usePath } from '../../app/navigation';
import { Button, Card, EmptyState, ErrorNotice, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { BattlePortrait } from './BattleArena';
import { BattleScreen } from './BattleScreen';
import { FriendsPanel } from './FriendsPanel';
import { ReportsPanel } from './ReportsPanel';
import { elements, modeLabels } from './presentation';
import { useBattleSession } from './useBattleSession';
import './battle.css';

function BattleLobby() {
  const path = usePath();
  const tab = path.startsWith('/battle/reports') ? 'reports' : path.startsWith('/battle/friends') ? 'friends' : 'training';
  const reportId = path.startsWith('/battle/reports/') ? decodeURIComponent(path.slice('/battle/reports/'.length)) : undefined;
  const controller = useBattleSession();
  const { data, session, error, busy, run, reload } = controller;
  const [petId, setPetId] = useState(''), [enemyElement, setEnemyElement] = useState<ElementType>('fire');
  useEffect(() => { if (data) setPetId(previous => data.pets.some(pet => pet.petId === previous) ? previous : data.selectedPetId || data.pets[0]?.petId || ''); }, [data]);
  const pet = data?.pets.find(pet => pet.petId === petId);
  const start = async () => {
    const next = await run(() => request<BattleSession>('battle', 'startTraining', { petId, enemyElement, actionId: crypto.randomUUID() }));
    if (next) navigate(`/battle/session/${encodeURIComponent(next.id)}`);
  };
  return <div className="battle-page"><PageHeader title={tab === 'reports' ? '战报' : '对战中心'}/>
    <Tabs value={tab} onValueChange={value => navigate(value === 'friends' ? '/battle/friends' : value === 'reports' ? '/battle/reports' : '/battle')}><TabsList className="battle-tabs" aria-label="对战方式">{[{ id: 'training', label: '训练' }, { id: 'friends', label: '好友对战' }, { id: 'reports', label: '战报' }].map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList><TabsContent value={tab}>
      <ErrorNotice message={error}/>{!data ? <EmptyState title={error ? '暂时无法打开对战' : '正在准备…'} action={<Button onClick={() => void run(reload)}><RefreshCw size={16}/>重试</Button>}/>
        : tab === 'reports' ? <ReportsPanel rules={data.rules} reports={data.reports} selectedId={reportId} busy={busy} onSelect={id => navigate(`/battle/reports/${encodeURIComponent(id)}`)} onBack={() => navigate('/battle')}
          onAgain={report => { void run(async () => { await request('battle', 'selectPet', { petId: report.player.petId, actionId: crypto.randomUUID() }); navigate(report.mode === 'friend' ? '/battle/friends' : '/battle'); }); }}
          onRetry={id => void run(async () => { await request('battle', 'retrySettlement', { sessionId: id }); await reload(); })}/>
        : session ? <Card className="space-y-4 p-5" aria-label="已保留的对局"><div><h2 className="font-semibold">当前对局已保留</h2><p className="muted">可继续{modeLabels[session.mode]}，或查看历史战报。</p></div><Button onClick={() => navigate(`/battle/session/${encodeURIComponent(session.id)}`)}><Swords size={18}/>{session.status === 'finished' || session.status === 'abandoned' ? '查看对局' : '继续本场'}</Button></Card>
        : !data.pets.length ? <EmptyState title="选择一位伙伴" action={<Button onClick={() => navigate('/companions/adopt')}>领养</Button>}/>
          : <><Card className="battle-party-picker"><strong>出战伙伴</strong><Select value={petId} onValueChange={selected => { setPetId(selected); void run(async () => { await request('battle', 'selectPet', { petId: selected, actionId: crypto.randomUUID() }); }); }} disabled={busy}><SelectTrigger aria-label="选择出战伙伴" className="battle-pet-select data-[size=default]:h-auto min-h-8 flex-1 min-w-0! whitespace-normal *:data-[slot=select-value]:line-clamp-none *:data-[slot=select-value]:block *:data-[slot=select-value]:min-w-0 *:data-[slot=select-value]:text-left"><SelectValue/></SelectTrigger><SelectContent position="popper" className="max-w-[calc(100vw-32px)]">{data.pets.map(pet => <SelectItem key={pet.petId} value={pet.petId}><span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">{pet.displayIdentity.roleName} · 编号 {pet.displayIdentity.instanceNumber} · Lv.{pet.level || 1} · {elements[pet.element].label}</span></SelectItem>)}</SelectContent></Select></Card>
            {tab === 'friends' ? <FriendsPanel pet={pet} busy={busy} run={run} onSession={next => navigate(`/battle/session/${encodeURIComponent(next.id)}`)}/>
              : <div className="battle-training-layout"><Card className="battle-training-card"><div className="battle-training-visual">{pet ? <BattlePortrait pet={pet}/> : null}<div><h2>训练</h2><TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" aria-label="训练规则"><Info size={17}/></Button></TooltipTrigger><TooltipContent>生命 {data.rules.maxHp} · 普攻 {data.rules.baseDamage.normal_attack} · 属性 {data.rules.baseDamage.element_attack} · 大招 {data.rules.ultimateAnger} 怒气</TooltipContent></Tooltip></TooltipProvider></div></div>
                <div className="battle-training-start"><label htmlFor="battle-training-element">对手</label><Select value={enemyElement} onValueChange={value => setEnemyElement(value as ElementType)}><SelectTrigger id="battle-training-element" aria-label="训练对手五行" className="battle-enemy-select"><SelectValue/></SelectTrigger><SelectContent position="popper">{Object.entries(elements).map(([key, value]) => <SelectItem key={key} value={key}>{value.label} · {data.opponents?.find(pet => pet.element === key)?.petName || '待就绪'}</SelectItem>)}</SelectContent></Select><Button disabled={busy || !pet} onClick={() => void start()}><Swords size={18}/>开始</Button></div></Card>
                <Card className="battle-training-aside"><UsersRound size={32}/><h2>好友对战</h2><Button variant="secondary" onClick={() => navigate('/battle/friends')}><UsersRound size={17}/>约战</Button></Card></div>}
          </>}
    </TabsContent></Tabs>
  </div>;
}
function BattlePage() {
  const path = usePath();
  return path.startsWith('/battle/session/') ? <BattleScreen key={path} sessionId={decodeURIComponent(path.slice('/battle/session/'.length))}/> : <BattleLobby/>;
}
export default { id: 'battle', title: '对战中心', routes: [
  { path: '/battle', title: '对战中心', component: BattlePage }, { path: '/battle/friends', title: '好友对战', component: BattlePage },
  { path: '/battle/session/:sessionId', title: '对战', component: BattlePage }, { path: '/battle/reports', title: '战报', component: BattlePage },
  { path: '/battle/reports/:reportId', title: '战报回顾', component: BattlePage }
] };
