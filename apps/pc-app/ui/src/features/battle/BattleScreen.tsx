import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Flag, FlaskConical, Heart, MapPin, RefreshCw, Swords, UsersRound } from 'lucide-react';
import { request } from '../../app/bridge';
import { navigate } from '../../app/navigation';
import { AppDialog, Button, Card, EmptyState, ErrorNotice, Input, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/kit';
import { BattleArena } from './BattleArena';
import { useBattleSession } from './useBattleSession';
import { modeLabels } from './presentation';
import './battle.css';
import './battle-v3.css';

/** The only live battlefield, regardless of the feature which created its session. */
export function BattleScreen({ sessionId, returnTo }: { sessionId: string; returnTo?: string }) {
  const controller = useBattleSession(sessionId);
  const { data, session, context, error, busy, syncedAt } = controller;
  const [capturing, setCapturing] = useState(false), [name, setName] = useState('');
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0, behavior: 'instant' }); }, [sessionId]);
  const exploring = session?.mode === 'wild' || session?.mode === 'territory';
  useEffect(() => {
    if (!exploring) return;
    void window.lingjing?.invoke('discovery', 'setExploring', { active: true });
    return () => { void window.lingjing?.invoke('discovery', 'setExploring', { active: false }); };
  }, [exploring]);
  if (!data || !session) return <div className="battle-page"><ErrorNotice message={error}/><EmptyState title={error ? '暂时无法打开对战' : '正在准备战场…'} action={<Button onClick={() => void controller.run(controller.reload)}><RefreshCw size={16}/>重试</Button>}/></div>;
  const rules = session.rules || data.rules;
  const ModeIcon = session.mode === 'friend' ? UsersRound : session.mode === 'wild' ? MapPin : session.mode === 'territory' ? Flag : Swords;
  const simulated = session.context?.authority === 'simulated';
  const back = returnTo || context?.returnTo || '/battle';
  const settle = async () => {
    const result = await controller.run(() => request<{ resultPath?: string }>('battle', 'settleContext', {
      sessionId, actionId: `context:${sessionId}`, ...(context?.action === 'capture' ? { name: name || context.name } : {})
    }));
    if (result) { setCapturing(false); if (result.resultPath) navigate(result.resultPath); else await controller.reload(); }
  };
  const settlement = context?.action && session.status === 'finished' && (context.action === 'territory' || session.winner === 'player')
    ? <Button disabled={busy || context.settled} onClick={() => { if (context.action === 'capture') { setName(context.name || session.enemy.petName); setCapturing(true); } else void settle(); }}>
      {context.action === 'capture' ? <Heart size={18}/> : session.winner === 'player' ? <Flag size={18}/> : <Check size={18}/>}{context.settled ? '已确认' : context.action === 'capture' ? '收服' : session.winner === 'player' ? '占领' : '确认结果'}
    </Button> : undefined;
  return <div className="battle-page battle-screen" data-battle-screen="shared-v1" data-battle-layout="v3" data-battle-mode={session.mode} data-authority={String(session.context?.authority || 'local')} data-session-id={session.id}>
    <TooltipProvider><header className="battle-screen-toolbar"><Tooltip><TooltipTrigger asChild><Button variant="ghost" aria-label="返回" onClick={() => navigate(back)}><ArrowLeft size={20}/></Button></TooltipTrigger><TooltipContent>返回</TooltipContent></Tooltip>
      <h1>对战</h1><Tooltip><TooltipTrigger asChild><span tabIndex={0} className="battle-mode-mark" aria-label={modeLabels[session.mode]}><ModeIcon size={18}/></span></TooltipTrigger><TooltipContent>{modeLabels[session.mode]}</TooltipContent></Tooltip>
      {simulated ? <Tooltip><TooltipTrigger asChild><span className="battle-scenario-mark" tabIndex={0} aria-label="隔离模拟场景"><FlaskConical size={17}/></span></TooltipTrigger><TooltipContent>隔离模拟场景 · {String(session.context?.scenarioId || '')}</TooltipContent></Tooltip> : null}
    </header></TooltipProvider>
    <ErrorNotice message={error}/><BattleArena session={session} rules={rules} busy={busy} syncedAt={syncedAt}
      onAct={action => void controller.act(action)} onSync={() => void controller.sync()} onRetry={() => void controller.retryAction()}
      onLeave={() => void controller.leave()} onReport={() => navigate(`/battle/reports/${encodeURIComponent(session.reportId || session.id)}`)} settlementActions={settlement}/>
    {capturing ? <AppDialog title="收服伙伴" onClose={() => { if (!busy) setCapturing(false); }} busy={busy}><Card className="battle-capture-dialog"><h2>收服伙伴</h2><label htmlFor="battle-capture-name">昵称</label><Input id="battle-capture-name" value={name} onChange={event => setName(event.target.value)} maxLength={24}/><div className="battle-two-buttons"><Button variant="secondary" onClick={() => setCapturing(false)} disabled={busy}>取消</Button><Button onClick={() => void settle()} disabled={busy || !name.trim()}><Heart size={16}/>确认</Button></div></Card></AppDialog> : null}
  </div>;
}
