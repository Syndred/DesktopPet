import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Leaf, Pause, Play, Sparkles, Swords, Trophy } from 'lucide-react';
import type { BattleReport, BattleRulesProfile } from '../../../../../../packages/shared-types/src/features/battle';
import { Button, Card, EmptyState, ScrollArea, TooltipProvider } from '../../components/kit';
import { AnimatedList } from '../../components/motion';
import { BattlePortrait, CombatantStatus, battleActionAnimation } from './BattleArena';
import { dateLabel, elements, modeLabels, petName, roundLines, statusLabel } from './presentation';

export function ReportsPanel({ rules, reports, selectedId, onSelect, onAgain, onBack, onRetry, busy }: {
  rules: BattleRulesProfile; reports: BattleReport[]; selectedId?: string; onSelect(id: string): void; onAgain(report: BattleReport): void;
  onBack(): void; onRetry(id: string): void; busy: boolean;
}) {
  const report = reports.find(item => item.id === selectedId) || reports[0];
  const [roundIndex, setRoundIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [lineIndex, setLineIndex] = useState(-1);
  useEffect(() => { setRoundIndex(0); setPlaying(false); setLineIndex(-1); }, [report?.id]);
  const round = report?.rounds[roundIndex];
  const lines = report && round ? roundLines(round, report.player, report.enemy) : [];
  useEffect(() => {
    if (!playing) return;
    if (lineIndex >= lines.length - 1) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setLineIndex(index => index + 1), 750);
    return () => window.clearTimeout(timer);
  }, [playing, lineIndex, lines.length]);
  function selectRound(index: number) { setRoundIndex(index); setPlaying(false); setLineIndex(-1); }
  if (!report) return <EmptyState title="每一场并肩，都会记在这里。" description="完成一场训练、好友或野外挑战，即可查看战报与回合记录。" action={<Button onClick={onBack}>前往对战中心</Button>}/>;
  const won = report.winner === 'player';
  const reward = report.reward;
  return <TooltipProvider delayDuration={300}><div className="battle-reports-layout">
    <Card className="battle-report-list" aria-label="最近战报"><ScrollArea className="battle-reports-scroll"><AnimatedList>{reports.map(item => <button key={item.id} aria-pressed={item.id === report.id} className={`battle-report-item ${item.id === report.id ? 'selected' : ''}`} onClick={() => onSelect(item.id)}><div className="battle-report-mini"><BattlePortrait pet={item.player} small/><BattlePortrait pet={item.enemy} small/></div><div><strong>{petName(item.player)} vs {petName(item.enemy)}</strong><small>{dateLabel(item.endedAt)} · {modeLabels[item.mode] || item.mode}</small></div><span className={`battle-result-tag ${item.winner === 'player' ? 'won' : ''}`}>{item.status === 'abandoned' ? '离开' : item.winner === 'player' ? '胜利' : item.winner === 'enemy' ? '惜败' : '结束'}</span></button>)}</AnimatedList></ScrollArea></Card>
    <section className="battle-report-detail" aria-label="战报详情"><h2 className={`battle-victory ${won ? 'won' : ''}`}><Trophy size={28}/>{report.status === 'abandoned' ? '旅途暂歇，下次再战。' : won ? '✧ 并肩获胜 ✧' : '并肩的每一步，都有收获。'}</h2><div className="battle-result-portraits"><div><BattlePortrait pet={report.player}/><strong>{petName(report.player)}</strong><span>Lv.{report.player.level || 1} · {elements[report.player.element]?.label}</span></div><strong className="battle-result-vs">VS</strong><div><BattlePortrait pet={report.enemy} facing="left"/><strong>{petName(report.enemy)}</strong>{report.enemy.petId !== 'waiting-peer' ? <span>Lv.{report.enemy.level || 1} · {elements[report.enemy.element]?.label}</span> : null}</div></div>
      <Card className="battle-reward-summary"><span><BookOpen size={18}/> {report.rounds.length} 回合</span><span><Sparkles size={18}/> {reward?.applied ? `经验 +${reward.experience}` : reward ? `经验 ${reward.experience} 待结算` : report.legacy ? '历史战报' : '无经验结算'}</span>{reward?.seeds?.quantity ? <span><Leaf size={18}/> 种子 +{reward.seeds.quantity}</span> : null}</Card>
      {reward ? <Card className="battle-experience"><div><strong>{petName(report.player)}经验</strong><span>{reward.applied ? `Lv.${reward.previousLevel || report.player.level || 1} → Lv.${reward.currentLevel || report.player.level || 1}` : reward.pendingReason}</span></div>{reward.applied && reward.currentExperience != null ? <><progress aria-label="结算后经验" max={100} value={reward.currentExperience}/><small>{reward.currentExperience}/100 · 本次 +{reward.experience}</small></> : <Button disabled={busy} variant="secondary" onClick={() => onRetry(report.sessionId)}>重新确认结算</Button>}</Card> : null}
      {report.legacy || report.historyComplete === false ? <p className="battle-history-note">{report.legacy ? '旧版战报保留原始记录，部分生命、怒气或异常状态未被旧版保存。' : '回合历史尚不完整，联网同步后可补齐。'}</p> : null}
      <div className="battle-round-selector" aria-label="选择回合"><button aria-label="上一回合" disabled={roundIndex <= 0} onClick={() => selectRound(roundIndex - 1)}><ChevronLeft size={16}/></button>{report.rounds.map((item, index) => <button key={`${item.round}:${index}`} aria-label={`第 ${item.round} 回合`} aria-pressed={index === roundIndex} className={index === roundIndex ? 'selected' : ''} onClick={() => selectRound(index)}>{item.round}</button>)}<button aria-label="下一回合" disabled={roundIndex >= report.rounds.length - 1} onClick={() => selectRound(roundIndex + 1)}><ChevronRight size={16}/></button></div>
      <h3>第 {round?.round || 0} 回合</h3><ScrollArea className="battle-timeline-scroll"><ol className="battle-replay-timeline" aria-live="polite">{lines.map((line, index) => <li key={index} className={lineIndex === index ? 'current' : ''}><span/>{line}</li>)}</ol></ScrollArea>{!round && <p className="muted">这场对战没有已完成的回合。</p>}
      {round?.notes?.length ? <details className="battle-rule-notes"><summary>查看原始规则日志</summary><ul>{round.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details> : null}
    </section>
    <aside className="battle-report-sidebar"><Card className="battle-replay-card"><h3>回合回顾</h3><div className="battle-replay-scene"><span className="battle-replay-tag">第 {round?.round || 0} 回合</span><BattlePortrait pet={report.player} action={lineIndex >= 0 && round ? battleActionAnimation(round.actions.player) : 'idle'} playing={playing}/><BattlePortrait pet={report.enemy} facing="left" action={lineIndex >= 0 && round ? battleActionAnimation(round.actions.enemy) : 'idle'} playing={playing}/></div>{round?.state ? <><CombatantStatus rules={report.rules || rules} pet={report.player} actor={round.state.player}/><div className="battle-replay-symbol">✧</div><CombatantStatus rules={report.rules || rules} pet={report.enemy} actor={round.state.enemy} enemy/></> : <div className="battle-replay-symbol"><BookOpen size={58}/></div>}<p>按回合记录查看行动、伤害与治疗。</p><Button disabled={!round || !lines.length} onClick={() => { if (playing) setPlaying(false); else { setLineIndex(-1); setPlaying(true); } }}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playing ? '暂停回顾' : '回顾这一回合'}</Button></Card><Card><h3>异常状态</h3>{round?.statusesAfter ? (['player', 'enemy'] as const).map(role => <div key={role} className="battle-report-status"><strong>{petName(report[role])}</strong>{round.statusesAfter![role].length ? round.statusesAfter![role].map(status => <p key={status.type}>{statusLabel(status)}</p>) : <p className="muted">无持续异常</p>}</div>) : <p className="muted">此历史记录未保存异常状态快照。</p>}</Card><Button disabled={busy} onClick={() => onAgain(report)}><Swords size={17}/>再来一局</Button><Button variant="secondary" onClick={onBack}><ArrowLeft size={17}/>返回对战中心</Button></aside>
  </div></TooltipProvider>;
}
