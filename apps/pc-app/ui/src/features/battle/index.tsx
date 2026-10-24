import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, RefreshCw, Sparkles, Swords, UsersRound } from 'lucide-react';
import type { BattleActionType, ElementType } from '../../../../../../packages/shared-types/src/battle';
import type { BattleParticipant, BattleReport, BattleSession } from '../../../../../../packages/shared-types/src/features/battle';
import { request } from '../../app/bridge';
import { navigate, usePath } from '../../app/navigation';
import { Button, Card, EmptyState, ErrorNotice, PageHeader, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/kit';
import { BattleArena, BattlePortrait } from './BattleArena';
import { FriendsPanel } from './FriendsPanel';
import { ReportsPanel } from './ReportsPanel';
import { elements, petName } from './presentation';
import './battle.css';

type Overview = { pets: BattleParticipant[]; selectedPetId?: string; session: BattleSession | null; reports: BattleReport[]; online: { enabled: boolean } };
function BattlePage() {
  const path = usePath();
  const tab = path.startsWith('/battle/reports') ? 'reports' : path.startsWith('/battle/friends') ? 'friends' : 'training';
  const pathSessionId = path.startsWith('/battle/session/') ? decodeURIComponent(path.slice('/battle/session/'.length)) : undefined;
  const reportId = path.startsWith('/battle/reports/') ? decodeURIComponent(path.slice('/battle/reports/'.length)) : undefined;
  const [data, setData] = useState<Overview | null>(null);
  const [session, setSession] = useState<BattleSession | null>(null);
  const [petId, setPetId] = useState('');
  const [enemyElement, setEnemyElement] = useState<ElementType>('wood');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState('');
  const processing = useRef(false);
  const syncing = useRef(false);
  const actionRetry = useRef<{ actionId: string; action: BattleActionType; sessionId: string } | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = generation.current;
    const value = await request<Overview>('battle', 'overview');
    if (version !== generation.current) return;
    setData(value); setSession(value.session); setPetId(previous => value.pets.some(pet => pet.petId === previous) ? previous : value.selectedPetId || value.pets[0]?.petId || '');
    if (pathSessionId) {
      const current = await request<BattleSession>('battle', 'snapshot', { sessionId: pathSessionId });
      if (version === generation.current) setSession(current);
    }
  }, [pathSessionId]);
  useEffect(() => {
    const version = ++generation.current;
    let alive = true;
    reload().catch(error => { if (alive && version === generation.current) setError(error.message); });
    const unsubscribe = window.lingjing?.subscribe('app:session', () => { generation.current++; setData(null); setSession(null); actionRetry.current = null; void reload().catch(error => setError(error.message)); });
    return () => { alive = false; generation.current++; unsubscribe?.(); };
  }, [reload]);
  async function run<T,>(task: () => Promise<T>): Promise<T | undefined> {
    if (processing.current) return;
    processing.current = true; setBusy(true); setError('');
    try { return await task(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { processing.current = false; setBusy(false); }
  }
  const sessionId = session?.id;
  const shouldSync = session?.mode === 'friend' && ['waiting', 'active'].includes(session.status);
  const sync = useCallback(async () => {
    if (!sessionId || syncing.current || processing.current) return;
    syncing.current = true;
    try {
      const value = await request<BattleSession>('battle', 'sync', { sessionId });
      setSession(value); setSyncedAt(new Date().toISOString()); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { syncing.current = false; }
  }, [sessionId]);
  useEffect(() => {
    if (!shouldSync) return;
    let timer: number | undefined;
    const unsubscribe = window.lingjing?.subscribe('battle:online', value => {
      const event = value as { type?: string };
      if (['room-updated', 'round-updated', 'realtime-status'].includes(event.type || '')) {
        window.clearTimeout(timer); timer = window.setTimeout(() => void sync(), 350);
      }
    });
    const poll = window.setInterval(() => { if (!document.hidden) void sync(); }, 2500);
    const reconnect = () => { void sync(); };
    window.addEventListener('online', reconnect);
    void sync();
    return () => { unsubscribe?.(); window.clearInterval(poll); window.clearTimeout(timer); window.removeEventListener('online', reconnect); };
  }, [shouldSync, sync]);
  const pet = data?.pets.find(pet => pet.petId === petId);
  async function act(action: BattleActionType) {
    if (!session) return;
    await run(async () => {
      const previous = actionRetry.current;
      const attempt = previous?.sessionId === session.id && previous.action === action ? previous : { actionId: crypto.randomUUID(), action, sessionId: session.id };
      actionRetry.current = attempt;
      try {
        const result = await request<BattleSession>('battle', 'act', { ...attempt, expectedRound: session.snapshot.round + 1 });
        setSession(result); actionRetry.current = null;
      } catch (error) {
        // Always show the durable pending action after an ambiguous response.
        setSession(await request<BattleSession>('battle', 'snapshot', { sessionId: session.id }));
        throw error;
      }
    });
  }
  function showReport() {
    if (session) navigate(`/battle/reports/${encodeURIComponent(session.reportId || session.id)}`);
  }
  return <div className="battle-page"><PageHeader eyebrow={tab === 'reports' ? '对战中心 / 最近战报' : '对战中心 / 和伙伴一起成长'} title={tab === 'reports' ? '每一次并肩，都值得记住。' : tab === 'friends' ? '找位朋友，切磋一下。' : '和伙伴，并肩出战。'} description={tab === 'reports' ? '留住每个回合的选择，下一次一起做得更好。' : '培养默契，研究五行，在陪伴中一起变强。'} action={<span className="battle-header-badge"><Sparkles size={16}/> 五行 · 回合 · 陪伴</span>}/>
    <Tabs value={tab} onValueChange={value => navigate(value === 'friends' ? '/battle/friends' : value === 'reports' ? '/battle/reports' : '/battle')}><TabsList className="battle-tabs" aria-label="对战方式">{[{ id: 'training', label: '训练', path: '/battle' }, { id: 'friends', label: '好友对战', path: '/battle/friends' }, { id: 'reports', label: '最近战报', path: '/battle/reports' }].map(item => <TabsTrigger key={item.id} value={item.id}>{item.label}</TabsTrigger>)}</TabsList><TabsContent value={tab}>
    <ErrorNotice message={error}/>
    {!data ? <EmptyState title={error ? '暂时还不能开启对战' : '正在打开对战中心…'} description={error || '读取伙伴、房间与战报。'} action={<Button onClick={() => void run(reload)}><RefreshCw size={16}/>重新读取</Button>}/> : tab === 'reports' ? <ReportsPanel reports={data.reports} selectedId={reportId} busy={busy} onSelect={id => navigate(`/battle/reports/${encodeURIComponent(id)}`)} onBack={() => navigate('/battle')} onAgain={report => { void run(async () => { await request('battle', 'selectPet', { petId: report.player.petId, actionId: crypto.randomUUID() }); navigate(report.mode === 'friend' ? '/battle/friends' : '/battle'); }); }} onRetry={id => void run(async () => { await request('battle', 'retrySettlement', { sessionId: id }); await reload(); })}/> : session ? <BattleArena party={data.pets} session={session} busy={busy} onAct={action => void act(action)} onRetry={() => void run(async () => setSession(await request<BattleSession>('battle', 'retryAction', { sessionId: session.id })))} onSync={() => void sync()} syncedAt={syncedAt} onLeave={() => void run(async () => { setSession(await request<BattleSession>('battle', 'leave', { sessionId: session.id })); })} onReport={showReport}/> : <>
      <Card className="battle-party-picker"><div><strong>本次出战伙伴</strong><small>每只伙伴独立成长</small></div><label className="sr-only" htmlFor="battle-pet-choice">选择出战伙伴</label><Select value={petId} onValueChange={selected => { setPetId(selected); void run(async () => { await request('battle', 'selectPet', { petId: selected, actionId: crypto.randomUUID() }); }); }} disabled={busy}><SelectTrigger id="battle-pet-choice" aria-label="选择出战伙伴" className="battle-pet-select"><SelectValue placeholder="选择出战伙伴"/></SelectTrigger><SelectContent className="battle-select-content" position="popper">{data.pets.map(pet => <SelectItem key={pet.petId} value={pet.petId}>{petName(pet)} · Lv.{pet.level || 1} · {elements[pet.element].label}</SelectItem>)}</SelectContent></Select><Button variant="ghost" onClick={() => navigate('/companions')}>伙伴详情 <ChevronRight size={16}/></Button></Card>
      {!data.pets.length ? <EmptyState title="还没有可出战的伙伴" description="先去领养一只伙伴，再回来一起练习。" action={<Button onClick={() => navigate('/companions/adopt')}>前往领养</Button>}/> : tab === 'friends' ? <FriendsPanel pet={pet} busy={busy} run={run} onSession={setSession}/> : <div className="battle-training-layout"><Card className="battle-training-card"><div className="battle-training-visual">{pet && <BattlePortrait pet={pet}/>}<div><span className="battle-training-eyebrow">一起练习，一起成长</span><h2>从一个回合，<br/>培养属于你们的默契。</h2><p>熟悉普通攻击、属性攻击和闪避，<br/>积攒怒气，找到大招的时机。</p></div></div><div className="battle-training-start"><label htmlFor="battle-training-element">训练对手五行</label><Select value={enemyElement} onValueChange={value => setEnemyElement(value as ElementType)}><SelectTrigger id="battle-training-element" aria-label="训练对手五行" className="battle-enemy-select"><SelectValue/></SelectTrigger><SelectContent className="battle-select-content" position="popper">{Object.entries(elements).map(([key, value]) => <SelectItem key={key} value={key}>{value.label}系 · {value.hint}</SelectItem>)}</SelectContent></Select><Button disabled={busy || !pet} onClick={() => void run(async () => setSession(await request<BattleSession>('battle', 'startTraining', { petId, enemyElement, actionId: crypto.randomUUID() })))}><Swords size={18}/>开始训练</Button></div><small className="battle-honest-status">本机训练，使用现有战斗规则与电脑对手。</small></Card><Card className="battle-training-aside"><UsersRound size={32}/><h2>也可以，约位朋友。</h2><p className="muted">搜索账号、发出邀请，在同一房间里实时切磋。</p><Button variant="secondary" onClick={() => navigate('/battle/friends')}>前往好友对战 <ChevronRight size={16}/></Button><div className="battle-element-chain">金 → 木 → 土 → 水 → 火 → 金</div><p className="muted">克制伤害 ×1.2，被克制 ×0.8。</p></Card></div>}
    </>}
    </TabsContent></Tabs><details className="battle-rules"><summary>五行与行动说明</summary><div><p>普通攻击 10、属性攻击 12；伤害受五行与状态影响。普通攻击打断属性攻击，闪避躲开普攻，属性攻击克制闪避。</p><p>大招需 50 怒气，消耗 50，必定命中；基础伤害为普攻的 2 倍，并回复 20 生命。闪避首次免费，之后需要怒气；成功闪避普攻返还 30 怒气。</p><p>火附加燃烧，木附加寄生，金附加易伤，土附加迟钝，水令对方怒气减半。持续效果可叠加至 5 层，记录中会显示剩余回合。</p></div></details>
  </div>;
}

export default { id: 'battle', title: '对战中心', routes: [
  { path: '/battle', title: '对战中心', component: BattlePage },
  { path: '/battle/friends', title: '好友对战', component: BattlePage },
  { path: '/battle/session/:sessionId', title: '进行中的对战', component: BattlePage },
  { path: '/battle/reports', title: '最近战报', component: BattlePage },
  { path: '/battle/reports/:reportId', title: '战报回顾', component: BattlePage }
] };
