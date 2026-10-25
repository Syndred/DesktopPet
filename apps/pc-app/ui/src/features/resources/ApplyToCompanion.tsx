import { useCallback, useEffect, useState } from 'react';
import type { CharacterResource } from '../../../../../../packages/shared-types/src/features/resources';
import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { request } from '../../app/bridge';
import { Button } from '../../components/ui';
import { UserRound } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { companionIdentity } from '../companions/identity';
import './binding.css';

export function ApplyToCompanion({ resource, disabled }: { resource: CharacterResource; disabled: boolean }) {
  const [pets, setPets] = useState<CompanionPet[]>([]);
  const [petId, setPetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    const data = await request<CompanionsSnapshot>('companions', 'list');
    setPets(data.pets);
    setPetId(current => data.pets.some(pet => pet.petId === current) ? current : data.pets[0]?.petId || '');
  }, []);
  useEffect(() => {
    let active = true;
    void request<CompanionsSnapshot>('companions', 'list').then(data => {
      if (active) { setPets(data.pets); setPetId(data.pets[0]?.petId || ''); }
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => window.lingjing.subscribe('companions:changed', () => { void reload().catch(() => {}); }), [reload]);
  const pet = pets.find(p => p.petId === petId);
  const identity = pet ? companionIdentity(pet) : null;
  const targetLabel = identity ? `${identity.roleName}（编号 ${identity.instanceNumber}）` : '伙伴';
  return <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="应用给伙伴" disabled={disabled}><UserRound size={12} />应用给伙伴</Button></PopoverTrigger><PopoverContent className="resource-metadata-popover"><section className="resource-binding" aria-label="应用角色形象">
    {!pets.length ? <p>先<a href="#/companions/adopt">领养一位伙伴</a>，就能为它使用这个形象。</p> : <>
    <label>给哪位伙伴使用？<Select value={petId} disabled={busy} onValueChange={value => { setPetId(value); setMessage(''); }}><SelectTrigger className="resource-companion-trigger" aria-label="应用形象的伙伴"><SelectValue /></SelectTrigger><SelectContent className="resource-companion-options" position="popper">{pets.map(p => {
      const display = companionIdentity(p);
      return <SelectItem className="resource-companion-option" value={p.petId} key={p.petId} textValue={`${display.roleName} 编号 ${display.instanceNumber}`}><span className="resource-companion-label"><strong>{display.roleName}</strong><code>编号 {display.instanceNumber}</code></span></SelectItem>;
    })}</SelectContent></Select></label>
    <Button className="resource-companion-apply" variant="secondary" disabled={disabled || busy || !pet} onClick={async () => {
      if (!pet) return;
      setBusy(true); setMessage('');
      try {
        await request('companions', 'appearance', { petId, resourceId: resource.id, expectedRevision: pet.revision, actionId: crypto.randomUUID() });
        setMessage(`已应用给${targetLabel}。`); await reload();
      } catch (error) { setMessage(error instanceof Error ? error.message : '应用形象失败，请重试。'); await reload().catch(() => {}); }
      finally { setBusy(false); }
    }}>{busy ? '正在应用…' : `应用给${targetLabel}`}</Button>
    {message && <p role="status">{message}</p>}</>}
  </section></PopoverContent></Popover>;
}
