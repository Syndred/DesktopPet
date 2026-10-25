import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Heart, House } from 'lucide-react';
import type { CompanionPet } from '../../../../../../packages/shared-types/src/features/companions';
import { usePath } from '../../app/navigation';
import { Button } from '../../components/ui';
import { CompanionPortrait } from './CompanionPortrait';
import { actionId, companionsRequest } from './client';
import { companionIdentity } from './identity';
import './desktop.css';

/** Production desktop route: shared React components + resources' Pixi Assets/AnimatedSprite renderer. */
export function DesktopCompanion() {
  const path = usePath(); const petId = path.slice('/desktop/'.length);
  const [pet, setPet] = useState<CompanionPet | null>(null); const [message, setMessage] = useState('');
  const visual = useRef<HTMLDivElement>(null); const drag = useRef(false); const hit = useRef(false); const lastMove = useRef(0);
  const input = useCallback((action: string, point?: { screenX: number; screenY: number }) => companionsRequest('desktopInput', { petId, action, ...point }), [petId]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    document.documentElement.classList.add('cp-desktop-document');
    return () => document.documentElement.classList.remove('cp-desktop-document');
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => { try { const data = await companionsRequest<CompanionPet>('get', { petId }); if (active) { setPet(data); document.title = `灵境 · ${companionIdentity(data).roleName} · ${data.petId}`; } } catch (error) { if (active) setMessage(error instanceof Error ? error.message : '伙伴正在返回灵境'); } };
    void load(); const unsubscribe = window.lingjing.subscribe('companions:changed', () => { void load(); });
    return () => { active = false; unsubscribe(); };
  }, [petId]);
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const bounds = visual.current?.getBoundingClientRect(); if (!bounds) return;
      const inside = drag.current || (event.target as Element)?.closest('button') || (event.clientX > bounds.left + bounds.width * .15 && event.clientX < bounds.right - bounds.width * .15 && event.clientY > bounds.top + bounds.height * .08 && event.clientY < bounds.bottom);
      if (Boolean(inside) !== hit.current) { hit.current = Boolean(inside); void input(hit.current ? 'hit' : 'miss').catch(() => {}); }
      if (drag.current && performance.now() - lastMove.current > 20) { lastMove.current = performance.now(); void input('drag-move', { screenX: event.screenX, screenY: event.screenY }).catch(() => {}); }
    };
    const leave = () => { if (!drag.current) { hit.current = false; void input('miss').catch(() => {}); } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [input]);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return; drag.current = true; event.currentTarget.setPointerCapture(event.pointerId);
    void input('drag-start', { screenX: event.screenX, screenY: event.screenY }).catch(() => { drag.current = false; });
  };
  const end = async (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return; drag.current = false;
    const point = { screenX: event.screenX, screenY: event.screenY }; const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
    try { await input('drag-move', point); await input('drag-end'); } catch (error) { setMessage(error instanceof Error ? error.message : '位置仍待确认，请回到灵境重新连接'); }
  };
  if (!pet) return null;
  const identity = companionIdentity(pet);
  return <main className={`cp-desktop-surface ${pet.desktop.behavior === 'sleep' ? 'is-sleeping' : ''}`} data-pet-id={petId} data-resource-id={pet.resource.resourceId} data-element={pet.element} aria-label={`${identity.roleName}的桌面伙伴`}>
    <div className="cp-desktop-tools"><Button variant="secondary" aria-label={`摸摸${identity.roleName}`} onClick={async () => { try { await companionsRequest('interact', { actionId: actionId(), petId }); setMessage('感受到你的陪伴啦'); } catch (error) { setMessage(error instanceof Error ? error.message : '稍后再试'); } }}><Heart size={15}/></Button><Button variant="secondary" aria-label={`收回${identity.roleName}`} onClick={async () => { try { await companionsRequest('desktop', { actionId: actionId(), petId, visible: false }); } catch (error) { setMessage(error instanceof Error ? error.message : '收回操作仍待确认'); } }}><House size={15}/></Button></div>
    <div className="cp-desktop-visual" ref={visual} onPointerDown={start} onPointerUp={end} onPointerCancel={end}><CompanionPortrait ownerAccountId={pet.ownerAccountId} petId={petId} resource={pet.resource} name={identity.roleName} animate action={pet.desktop.behavior === 'sleep' ? 'sleep' : ['wander', 'follow'].includes(pet.desktop.behavior) ? 'walk' : 'idle'}/></div>
    <span className="cp-desktop-name" title={identity.historicalNickname ? `历史昵称：${identity.historicalNickname}` : undefined}><strong>{identity.roleName}{pet.desktop.behavior === 'sleep' ? ' · 休息中' : ''}</strong><code data-instance-number={identity.instanceNumber}>编号 {identity.instanceNumber}</code></span>
    {message && <div className="cp-desktop-message" role="status">{message}</div>}
  </main>;
}
