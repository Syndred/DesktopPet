import { useCallback, useEffect, useState } from 'react';
import type { CharacterResource } from '../../../../../../packages/shared-types/src/features/resources';
import type { CompanionPet, CompanionsSnapshot } from '../../../../../../packages/shared-types/src/features/companions';
import { request } from '../../app/bridge';
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
  if (!pets.length) return <div className="resource-binding"><p>先<a href="#/companions/adopt">领养一位伙伴</a>，就能为它使用这个形象。</p></div>;
  return <section className="resource-binding" aria-label="应用角色形象">
    <label>给哪位伙伴使用？<select aria-label="应用形象的伙伴" value={petId} disabled={busy} onChange={event => { setPetId(event.target.value); setMessage(''); }}>{pets.map(p => <option value={p.petId} key={p.petId}>{p.name} · {p.serial}</option>)}</select></label>
    <button type="button" disabled={disabled || busy || !pet} onClick={async () => {
      if (!pet) return;
      setBusy(true); setMessage('');
      try {
        await request('companions', 'appearance', { petId, resourceId: resource.id, expectedRevision: pet.revision, actionId: crypto.randomUUID() });
        setMessage(`已为${pet.name}应用形象，成长和聊天记录继续保留。`); await reload();
      } catch (error) { setMessage(error instanceof Error ? error.message : '应用形象失败，请重试。'); await reload().catch(() => {}); }
      finally { setBusy(false); }
    }}>{busy ? '正在应用…' : `应用给${pet?.name || '伙伴'}`}</button>
    {message && <p role="status">{message}</p>}
  </section>;
}
