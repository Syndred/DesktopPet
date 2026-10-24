import type { CropId } from '../../../../../../packages/shared-types/src/features/garden';
import atlas from './assets/garden-food-atlas-v1.png';
export const foodAtlas = atlas;
export const cropFrames = { carrot: 0, tomato: 1, berry: 2, rice: 3, cooked_rice: 4, sprout: 5, seeds: 6, soil: 7 };
/** Static food illustrations from one original transparent production atlas. */
export function CropArt({ crop, growing = false, className = '' }: { crop: CropId | 'cooked_rice' | 'sprout' | 'seeds' | 'soil'; growing?: boolean; className?: string }) {
  const frame = growing ? cropFrames.sprout : cropFrames[crop];
  return <span className={`garden-crop-art ${className}`} aria-hidden="true"><span style={{ backgroundImage: `url(${atlas})`, backgroundPosition: `${frame % 4 * 100 / 3}% ${frame > 3 ? 100 : 0}%` }} /></span>;
}
