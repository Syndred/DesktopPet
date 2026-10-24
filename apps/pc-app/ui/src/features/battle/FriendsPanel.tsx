import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Search, Swords, X } from 'lucide-react';
import type { BattleParticipant, BattleSession, DuelInvitation, DuelUser } from '../../../../../../packages/shared-types/src/features/battle';
import { request } from '../../app/bridge';
import { Button, Card, Input } from '../../components/kit';
import { AnimatedList } from '../../components/motion';
import { navigate } from '../../app/navigation';
import { BattlePortrait } from './BattleArena';
import { dateLabel, petName } from './presentation';

export function FriendsPanel({ pet, busy, onSession, run }: { pet?: BattleParticipant; busy: boolean;
  onSession(session: BattleSession): void; run<T>(task: () => Promise<T>): Promise<T | undefined>;
}) {
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<DuelUser[]>([]);
  const [selected, setSelected] = useState<DuelUser | null>(null);
  const [invitations, setInvitations] = useState<{ inbound: DuelInvitation[]; outbound: DuelInvitation[] }>({ inbound: [], outbound: [] });
  const [searched, setSearched] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const loadingInvites = useRef(false);
  const alive = useRef(true);
  const refreshInvitations = useCallback(async () => {
    if (loadingInvites.current) return;
    loadingInvites.current = true;
    try {
      const result = await request<typeof invitations>('battle', 'invitations');
      if (alive.current) { setInvitations(result); setOnlineError(''); }
    } catch (error) { if (alive.current) setOnlineError(error instanceof Error ? error.message : String(error)); }
    finally { loadingInvites.current = false; }
  }, []);
  useEffect(() => {
    alive.current = true;
    void refreshInvitations();
    const timer = window.setInterval(() => { if (!document.hidden) void refreshInvitations(); }, 6000);
    return () => { alive.current = false; window.clearInterval(timer); };
  }, [refreshInvitations]);
  async function search(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const found = await request<DuelUser[]>('battle', 'search', { keyword });
      setUsers(found); setSelected(found[0] || null); setSearched(true);
    });
  }
  async function send(user: DuelUser) {
    if (!pet) return;
    await run(async () => { await request('battle', 'invite', { targetAccount: user.account, petId: pet.petId }); await refreshInvitations(); });
  }
  async function respond(invitation: DuelInvitation, decision: 'accept' | 'reject') {
    await run(async () => {
      const result = await request<{ session: BattleSession | null }>('battle', 'respondInvite', { requestId: invitation.id, decision, petId: pet?.petId });
      if (result.session) onSession(result.session);
      await refreshInvitations();
    });
  }
  const pendingInbound = invitations.inbound.filter(invitation => invitation.status === 'pending');
  const outbound = invitations.outbound.filter(invitation => ['pending', 'accepted'].includes(invitation.status));
  return <div className="battle-friends-layout">
    <Card className="battle-users"><form className="battle-search" onSubmit={search}><label className="sr-only" htmlFor="battle-user-search">搜索账号或用户名</label><Search size={18}/><Input id="battle-user-search" placeholder="搜索账号或用户名…" value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={80}/><Button disabled={busy} type="submit">搜索</Button></form><AnimatedList className="battle-user-list">{users.map(user => <div key={user.id} className={`battle-user ${selected?.id === user.id ? 'selected' : ''}`}><button className="battle-user-select" onClick={() => setSelected(user)}><span className="battle-user-avatar">{[...user.username][0]}</span><span><strong>{user.username}</strong><small>@{user.account}</small></span></button><button className="battle-small-action" onClick={() => void send(user)} disabled={busy || !pet}>发起对战</button></div>)}{!users.length && <p className="muted battle-empty-text">{searched ? '没有找到匹配账号，换个关键词试试。' : '输入账号或昵称，找到想一起切磋的朋友。'}</p>}</AnimatedList><p className="battle-honest-status">搜索结果来自当前联机服务。</p></Card>
    <Card className="battle-friend-detail"><h3>对方信息</h3>{selected ? <><div className="battle-user-heading"><span className="battle-user-avatar">{[...selected.username][0]}</span><div><h2>{selected.username}</h2><span className="muted">@{selected.account}</span></div></div><div className="battle-friend-art"><Swords size={55}/><p>和朋友的伙伴<br/>来一场友好的较量。</p></div><p className="muted">对方进入房间后，会显示实际出战伙伴与五行。</p><Button disabled={busy || !pet} onClick={() => void send(selected)}>发起对战</Button></> : <p className="muted battle-empty-text">选择搜索结果，发出一份约战邀请。</p>}<h3 className="battle-own-title">我方出战伙伴</h3>{pet ? <div className="battle-pet-summary"><BattlePortrait pet={pet} small/><div><strong>{petName(pet)}</strong><p>Lv.{pet.level || 1}</p></div></div> : <p className="muted">请先领养并选择出战伙伴。</p>}</Card>
    <div className="battle-invitations"><Card><div className="battle-section-heading"><h3>待处理邀请 <span>{onlineError ? '—' : pendingInbound.length}</span></h3><button className="battle-text-button" onClick={() => void refreshInvitations()}>刷新</button></div>{onlineError && <div className="battle-online-error" role="status"><p>{onlineError}</p>{/账号|登录/.test(onlineError) ? <Button variant="secondary" onClick={() => navigate('/account')}>前往账号设置</Button> : null}</div>}{pendingInbound.length ? pendingInbound.map(invitation => <div key={invitation.id} className="battle-invitation"><strong>{invitation.fromAccount}</strong><small>{dateLabel(invitation.createdAt)}</small><p>想和你的伙伴切磋一下，一起玩一局吧？</p><div className="battle-two-buttons"><Button disabled={busy || !pet} onClick={() => void respond(invitation, 'accept')}><Check size={15}/>接受</Button><Button disabled={busy} variant="secondary" onClick={() => void respond(invitation, 'reject')}><X size={15}/>婉拒</Button></div></div>) : <p className="muted">{onlineError ? '联网后可查看待处理邀请。' : '暂时没有新的邀请。'}</p>}<h3 className="battle-own-title">我发出的邀请</h3>{outbound.length ? outbound.map(invitation => <div key={invitation.id} className="battle-invitation"><strong>{invitation.toAccount}</strong><span className="battle-invitation-state">{invitation.status === 'accepted' ? '已接受' : '等待回应'}</span><p>{invitation.status === 'accepted' ? `好友已准备好，房间码 ${invitation.roomCode || '待同步'}` : '对方接受后，你可以直接进入同一房间。'}</p>{invitation.status === 'accepted' && invitation.roomCode ? <Button disabled={busy || !pet} onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'joinRoom', { roomCode: invitation.roomCode, petId: pet?.petId, requestId: invitation.id })))}>进入房间</Button> : <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await request('battle', 'cancelInvite', { requestId: invitation.id }); await refreshInvitations(); })}>取消邀请</Button>}</div>) : <p className="muted">{onlineError ? '联网后可查看已发邀请。' : '还没有发出的邀请。'}</p>}</Card>
      <Card className="battle-room-entry"><h3>使用房间码</h3><label htmlFor="battle-room-code">已有房间码，可直接进入</label><Input id="battle-room-code" value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="输入房间码" maxLength={12}/><div className="battle-two-buttons"><Button disabled={busy || !pet || !roomCode.trim()} onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'joinRoom', { roomCode, petId: pet?.petId })))}>加入房间</Button><Button disabled={busy || !pet} variant="secondary" onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'createRoom', { petId: pet?.petId })))}>创建房间</Button></div></Card>
    </div>
  </div>;
}
