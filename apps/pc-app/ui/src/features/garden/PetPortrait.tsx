import type { GardenPet } from '../../../../../../packages/shared-types/src/features/garden';
import { CompanionPortrait } from '../companions/CompanionPortrait';

/** Companion UI owns resource lookup, shared atlas thumbnails and invalidation. */
export function PetPortrait({ pet }: { pet: GardenPet }) {
  const resourceId = pet.resource?.resourceId;
  if (resourceId) return <CompanionPortrait petId={pet.petId} name={pet.name} resource={{resourceId,kind:'2d'}} />;
  const preview = pet.resource?.previewUrl || pet.resource?.thumbnail;
  return preview ? <img src={preview} alt="" /> : <span className="garden-builtin-art" style={{backgroundImage:"url('./illustrations/yuwan-sprites-v1.png')"}} />;
}
