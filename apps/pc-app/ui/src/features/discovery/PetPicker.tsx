import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Button } from '../../components/ui';
import { Check } from 'lucide-react';
import type { DiscoveryPet } from '../../../../../../packages/shared-types/src/features/discovery';
import { elements, twoDimensional } from './presentation';
import { ResourcePortrait } from './ResourcePortrait';
export function PetPicker({ pets, value, onChange, disabled = false }: { pets: DiscoveryPet[]; value?: string; onChange: (id: string) => void; disabled?: boolean }) {
  const available = pets.filter(pet => twoDimensional(pet.resource?.kind));
  const selected = available.find(pet => pet.petId === value);
  const cards = [...(selected ? [selected] : []), ...available.filter(pet => pet.petId !== selected?.petId)].slice(0, 3);
  return <div className="discovery-pet-picker"><div className="discovery-picker-heading"><span id="discovery-pet-label">当前挑战伙伴</span>
    <Select value={value || ''} onValueChange={onChange} disabled={disabled || !available.length}>
      <SelectTrigger aria-labelledby="discovery-pet-label" aria-label="当前挑战伙伴"><SelectValue placeholder={available.length ? '选择出战伙伴' : '请先领养一位 2D 伙伴'}/></SelectTrigger>
      <SelectContent>{available.map(pet => <SelectItem key={pet.petId} value={pet.petId}>{pet.name} · Lv.{pet.level} · {elements[pet.element]}</SelectItem>)}</SelectContent>
    </Select>
    </div><div className="discovery-pet-cards" role="group" aria-label="出战伙伴快捷选择">{cards.map(pet => <Button variant="ghost" key={pet.petId} className="discovery-pet-card" aria-pressed={pet.petId === value} disabled={disabled} onClick={() => onChange(pet.petId)}>
      <ResourcePortrait resourceId={pet.resource.resourceId} instanceId={pet.petId} compact/><span><strong>{pet.name}</strong><small>Lv.{pet.level} · {elements[pet.element]}</small></span>{pet.petId === value ? <em><Check size={10}/>当前</em> : null}
    </Button>)}</div>
  </div>;
}
