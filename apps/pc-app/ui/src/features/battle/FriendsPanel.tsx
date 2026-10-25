import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Search, Swords, X } from 'lucide-react';
import type { BattleSession, DuelInvitation, DuelInvitationAttempt, DuelUser } from '../../../../../../packages/shared-types/src/features/battle';
import { request } from '../../app/bridge';
import { Button, Card, Input } from '../../components/kit';
import { AnimatedList } from '../../components/motion';
import { navigate } from '../../app/navigation';
import { BattlePortrait } from './BattleArena';
import { dateLabel } from './presentation';
import type { BattleOwnedPet } from './useBattleSession';

export function FriendsPanel({ pet, busy, onSession, run }: { pet?: BattleOwnedPet; busy: boolean;
  onSession(session: BattleSession): void; run<T>(task: () => Promise<T>): Promise<T | undefined>;
}) {
  const [keyword, setKeyword] = useState('');
  const [users, setUsers] = useState<DuelUser[]>([]);
  const [selected, setSelected] = useState<DuelUser | null>(null);
  const [invitations, setInvitations] = useState<{ inbound: DuelInvitation[]; outbound: DuelInvitation[] }>({ inbound: [], outbound: [] });
  const [unconfirmed, setUnconfirmed] = useState<DuelInvitationAttempt[]>([]);
  const [searched, setSearched] = useState(false);
  const [onlineError, setOnlineError] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const loadingInvites = useRef(false);
  const alive = useRef(true);
  const refreshInvitations = useCallback(async () => {
    if (loadingInvites.current) return;
    loadingInvites.current = true;
    try {
      const [pending, result] = await Promise.allSettled([
        request<DuelInvitationAttempt[]>('battle', 'pendingInvitations').then(value => { if (alive.current) setUnconfirmed(value); }),
        request<typeof invitations>('battle', 'invitations').then(value => { if (alive.current) setInvitations(value); }),
      ]);
      if (alive.current) {
        const failure = result.status === 'rejected' ? result.reason : pending.status === 'rejected' ? pending.reason : null;
        setOnlineError(failure ? failure instanceof Error ? failure.message : String(failure) : '');
      }
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
  async function send(targetAccount: string, retry?: DuelInvitationAttempt) {
    if (!pet) return;
    await run(async () => {
      try { await request('battle', 'invite', { actionId: retry?.actionId ?? crypto.randomUUID(), targetAccount, allowResend: retry?.allowResend ?? false, petId: pet.petId }); }
      finally { await refreshInvitations(); }
    });
  }
  async function respond(invitation: DuelInvitation, decision: 'accept' | 'reject') {
    await run(async () => {
      try {
        const result = await request<{ session: BattleSession | null }>('battle', 'respondInvite', { requestId: invitation.id, decision, petId: pet?.petId });
        if (result.session) onSession(result.session);
      } finally { await refreshInvitations(); }
    });
  }
  const pendingInbound = invitations.inbound.filter(invitation => invitation.status === 'pending');
  const inbound = invitations.inbound.filter(invitation => ['pending', 'expired'].includes(invitation.status));
  const outbound = invitations.outbound.filter(invitation => ['pending', 'accepted', 'expired'].includes(invitation.status));
  return <div className="battle-friends-layout">
    <Card className="battle-users"><form className="battle-search" onSubmit={search}><label className="sr-only" htmlFor="battle-user-search">搜索账号或用户名</label><Search size={18}/><Input id="battle-user-search" placeholder="搜索账号或用户名…" value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={80}/><Button disabled={busy} type="submit">搜索</Button></form><AnimatedList className="battle-user-list">{users.map(user => <div key={user.id} className={`battle-user ${selected?.id === user.id ? 'selected' : ''}`}><button className="battle-user-select" onClick={() => setSelected(user)}><span className="battle-user-avatar">{[...user.username][0]}</span><span><strong>{user.username}</strong><small>@{user.account}</small></span></button><button className="battle-small-action" onClick={() => void send(user.account)} disabled={busy || !pet}>发起对战</button></div>)}{!users.length && <p className="muted battle-empty-text">{searched ? '未找到玩家' : '选择玩家'}</p>}</AnimatedList></Card>
    <Card className="battle-friend-detail"><h3>对方信息</h3>{selected ? <><div className="battle-user-heading"><span className="battle-user-avatar">{[...selected.username][0]}</span><div><h2>{selected.username}</h2><span className="muted">@{selected.account}</span></div></div><div className="battle-friend-art" role="img" aria-label="好友对战"><Swords size={55}/></div><Button disabled={busy || !pet} onClick={() => void send(selected.account)}>发起对战</Button></> : <p className="muted battle-empty-text">选择玩家</p>}<h3 className="battle-own-title">我方出战伙伴</h3>{pet ? <div className="battle-pet-summary"><BattlePortrait pet={pet} small/><div className="min-w-0"><strong>{pet.displayIdentity.roleName}</strong><p className="[overflow-wrap:anywhere]">编号 {pet.displayIdentity.instanceNumber}</p><p>Lv.{pet.level || 1}</p></div></div> : <p className="muted">请先领养并选择出战伙伴。</p>}</Card>
    <div className="battle-invitations"><Card>
      <div className="battle-section-heading"><h3>待处理邀请 <span>{onlineError ? '—' : pendingInbound.length}</span></h3><button className="battle-text-button" onClick={() => void refreshInvitations()}>刷新</button></div>
      <p className="muted">新邀请 5 分钟有效，以服务器判定为准。</p>
      {onlineError && <div className="battle-online-error" role="status"><p>{onlineError}</p>{/账号|登录/.test(onlineError) ? <Button variant="secondary" onClick={() => navigate('/account')}>前往账号设置</Button> : null}</div>}
      {unconfirmed.length ? <div><h3 className="battle-own-title">发送结果待确认</h3>{unconfirmed.map(attempt => <div key={attempt.actionId} className="battle-invitation grid min-w-0 gap-2">
        <strong className="[overflow-wrap:anywhere]">{attempt.targetAccount}</strong><small>原请求已保留，可重试确认发送结果。</small>
        <div className="battle-two-buttons"><Button disabled={busy || !pet} onClick={() => void send(attempt.targetAccount, attempt)}>重试原请求</Button><Button disabled={busy || !pet} variant="secondary" onClick={() => void send(attempt.targetAccount)}>重新发送</Button></div>
        <small>重新发送会保留原请求；仍有效的邀请不会延长有效期。</small>
      </div>)}</div> : null}
      {inbound.length ? inbound.map(invitation => <div key={invitation.id} className="battle-invitation grid min-w-0 gap-2">
        <strong className="[overflow-wrap:anywhere]">{invitation.fromAccount}</strong><small>{dateLabel(invitation.createdAt)}</small>
        {invitation.status === 'expired' ? <p role="status">邀请已过期，请对方重新发起。</p> : <>
          <InvitationDeadline invitation={invitation}/>
          <div className="battle-two-buttons"><Button disabled={busy || !pet} onClick={() => void respond(invitation, 'accept')}><Check size={15}/>接受</Button><Button disabled={busy} variant="secondary" onClick={() => void respond(invitation, 'reject')}><X size={15}/>婉拒</Button></div>
        </>}
      </div>) : <p className="muted">{onlineError ? '联网后可查看待处理邀请。' : '暂时没有新的邀请。'}</p>}
      <h3 className="battle-own-title">我发出的邀请</h3>
      {outbound.length ? outbound.map(invitation => <div key={invitation.id} className="battle-invitation grid min-w-0 gap-2">
        <strong className="[overflow-wrap:anywhere]">{invitation.toAccount}</strong><span className="battle-invitation-state">{invitation.status === 'accepted' ? '已接受' : invitation.status === 'expired' ? '已过期' : '等待回应'}</span>
        {invitation.status === 'pending' ? <InvitationDeadline invitation={invitation}/> : null}
        {invitation.status === 'accepted' ? <p>#{invitation.roomCode || '—'}</p> : null}
        {invitation.status === 'expired' ? <Button disabled={busy || !pet} onClick={() => void send(invitation.toAccount)}>重新发起</Button>
          : invitation.status === 'accepted' && invitation.roomCode ? <Button disabled={busy || !pet} onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'joinRoom', { roomCode: invitation.roomCode, petId: pet?.petId, requestId: invitation.id })))}>进入房间</Button>
            : <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await request('battle', 'cancelInvite', { requestId: invitation.id }); await refreshInvitations(); })}>取消邀请</Button>}
      </div>) : <p className="muted">{onlineError ? '联网后可查看已发邀请。' : '还没有发出的邀请。'}</p>}
    </Card>
      <Card className="battle-room-entry"><h3>使用房间码</h3><label className="sr-only" htmlFor="battle-room-code">房间码</label><Input id="battle-room-code" value={roomCode} onChange={event => setRoomCode(event.target.value.toUpperCase())} placeholder="输入房间码" maxLength={12}/><div className="battle-two-buttons"><Button disabled={busy || !pet || !roomCode.trim()} onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'joinRoom', { roomCode, petId: pet?.petId })))}>加入房间</Button><Button disabled={busy || !pet} variant="secondary" onClick={() => void run(async () => onSession(await request<BattleSession>('battle', 'createRoom', { petId: pet?.petId })))}>创建房间</Button></div></Card>
    </div>
  </div>;
}

function InvitationDeadline({ invitation }: { invitation: DuelInvitation }) {
  return <small>{invitation.expiresAt ? `有效至 ${dateLabel(invitation.expiresAt)}，以服务器判定为准。` : '旧版邀请未设置有效期，按原规则处理。'}</small>;
}
