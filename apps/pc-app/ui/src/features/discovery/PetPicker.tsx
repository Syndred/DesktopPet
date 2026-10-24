import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import type { DiscoveryPet } from '../../../../../../packages/shared-types/src/features/discovery';
import { elements, twoDimensional } from './presentation';
export function PetPicker({ pets, value, onChange, disabled = false }: { pets: DiscoveryPet[]; value?: string; onChange: (id: string) => void; disabled?: boolean }) {
  const available = pets.filter(pet => twoDimensional(pet.resource?.kind));
  return <div className="discovery-pet-picker"><span id="discovery-pet-label">当前挑战伙伴</span>
    <Select value={value || ''} onValueChange={onChange} disabled={disabled || !available.length}>
      <SelectTrigger aria-labelledby="discovery-pet-label" aria-label="当前挑战伙伴"><SelectValue placeholder={available.length ? '选择出战伙伴' : '请先领养一位 2D 伙伴'}/></SelectTrigger>
      <SelectContent>{available.map(pet => <SelectItem key={pet.petId} value={pet.petId}>{pet.name} · Lv.{pet.level} · {elements[pet.element]}</SelectItem>)}</SelectContent>
    </Select>
  </div>;
}
