import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
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
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null); const [busy, setBusy] = useState(false);
  const surface = useRef<HTMLElement>(null); const menuElement = useRef<HTMLDivElement>(null); const inFlight = useRef(false); const generation = useRef(0); const mounted = useRef(true);
  const visual = useRef<HTMLDivElement>(null); const drag = useRef(false); const hit = useRef(false); const lastMove = useRef(0);
  const input = useCallback((action: string, point?: { screenX: number; screenY: number }) => companionsRequest('desktopInput', { petId, action, ...point }), [petId]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    mounted.current = true; document.documentElement.classList.add('cp-desktop-document');
    return () => { mounted.current = false; document.documentElement.classList.remove('cp-desktop-document'); };
  }, []);
  useEffect(() => {
    let active = true; let loadVersion = 0;
    const load = async () => { const version = ++loadVersion; try { const data = await companionsRequest<CompanionPet>('get', { petId }); if (active && version === loadVersion) { setPet(data); document.title = `灵境 · ${companionIdentity(data).roleName}`; } } catch (error) { if (active && version === loadVersion) { setPet(null); setMenu(null); setMessage(error instanceof Error ? error.message : '伙伴正在返回灵境'); } } };
    generation.current += 1; setPet(null); setMenu(null); setMessage('');
    void load(); const unsubscribe = window.lingjing.subscribe('companions:changed', () => { void load(); });
    const sessionUnsubscribe = window.lingjing.subscribe('app:session', () => { generation.current += 1; setPet(null); setMenu(null); setMessage(''); void load(); });
    return () => { active = false; generation.current += 1; unsubscribe(); sessionUnsubscribe(); };
  }, [petId]);
  useEffect(() => { generation.current += 1; setMenu(null); }, [pet?.ownerAccountId, pet?.petId]);
  useEffect(() => {
    if (!menu) return;
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); } };
    const outside = (event: globalThis.PointerEvent) => { if (!menuElement.current?.contains(event.target as Node)) setMenu(null); };
    document.addEventListener('keydown', key); document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('keydown', key); document.removeEventListener('pointerdown', outside); };
  }, [menu]);
  useLayoutEffect(() => {
    if (!menu || !surface.current || !menuElement.current) return;
    const bounds = surface.current.getBoundingClientRect(), size = menuElement.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(menu.x, bounds.width - size.width)), y = Math.max(0, Math.min(menu.y, bounds.height - size.height));
    if (x !== menu.x || y !== menu.y) setMenu({ x, y });
    menuElement.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [menu]);
  const perform = async (command: 'interact' | 'desktop') => {
    if (inFlight.current || !pet || pet.petId !== petId) return;
    inFlight.current = true; setBusy(true); setMenu(null); const version = generation.current;
    try { await companionsRequest(command, { actionId: actionId(), petId, ...(command === 'desktop' ? { visible: false } : {}) }); if (version === generation.current && command === 'interact') setMessage('感受到你的陪伴啦'); }
    catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : command === 'desktop' ? '收回操作仍待确认' : '稍后再试'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const bounds = visual.current?.getBoundingClientRect(); if (!bounds) return;
      const inside = drag.current || menuElement.current?.contains(event.target as Node) || (event.target as Element)?.closest('button') || (event.clientX > bounds.left + bounds.width * .15 && event.clientX < bounds.right - bounds.width * .15 && event.clientY > bounds.top + bounds.height * .08 && event.clientY < bounds.bottom);
      if (Boolean(inside) !== hit.current) { hit.current = Boolean(inside); void input(hit.current ? 'hit' : 'miss').catch(() => {}); }
      if (drag.current && performance.now() - lastMove.current > 20) { lastMove.current = performance.now(); void input('drag-move', { screenX: event.screenX, screenY: event.screenY }).catch(() => {}); }
    };
    const leave = () => { if (!drag.current) { hit.current = false; void input('miss').catch(() => {}); } };
    document.addEventListener('pointermove', move); document.addEventListener('pointerleave', leave);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerleave', leave); };
  }, [input]);
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return; setMenu(null); drag.current = true; event.currentTarget.setPointerCapture(event.pointerId);
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
  return <main ref={surface} onContextMenu={event => { event.preventDefault(); if (drag.current || !surface.current) return; const bounds = surface.current.getBoundingClientRect(); setMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top }); }} className={`cp-desktop-surface ${pet.desktop.behavior === 'sleep' ? 'is-sleeping' : ''}`} data-pet-id={petId} data-resource-id={pet.resource.resourceId} data-element={pet.element} aria-label={`${identity.roleName}的桌面伙伴，编号 ${identity.instanceNumber}`}>
    <div className="cp-desktop-tools"><Button variant="secondary" disabled={busy} aria-label={`摸摸${identity.roleName}`} onClick={() => void perform('interact')}><Heart size={15}/></Button><Button variant="secondary" disabled={busy} aria-label={`收回${identity.roleName}`} onClick={() => void perform('desktop')}><House size={15}/></Button></div>
    {menu && <div ref={menuElement} className="cp-desktop-context-menu" role="menu" aria-label="桌面伙伴操作" style={{ left: menu.x, top: menu.y }}>
      <Button role="menuitem" disabled={busy} aria-label={`摸摸${identity.roleName}`} onClick={() => void perform('interact')}><Heart size={15}/>摸摸</Button>
      <Button role="menuitem" disabled={busy} aria-label={`收回${identity.roleName}`} onClick={() => void perform('desktop')}><House size={15}/>收回</Button>
    </div>}
    <div className="cp-desktop-visual" ref={visual} onPointerDown={start} onPointerUp={end} onPointerCancel={end}><CompanionPortrait ownerAccountId={pet.ownerAccountId} petId={petId} resource={pet.resource} name={identity.roleName} animate action={pet.desktop.behavior === 'sleep' ? 'sleep' : ['wander', 'follow'].includes(pet.desktop.behavior) ? 'walk' : 'idle'}/></div>
    {message && <div className="cp-desktop-message" role="status">{message}</div>}
  </main>;
}
