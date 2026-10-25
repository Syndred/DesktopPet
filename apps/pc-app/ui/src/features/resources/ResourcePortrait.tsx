import { FileImage } from 'lucide-react';
import type { CharacterResource } from '../../../../../../packages/shared-types/src/features/resources';
import { resourceAssetUrl } from './client';
import { resolveResourcePortrait } from './display';
import './portrait.css';

export function ResourcePortrait({ resource, assetUrl=resourceAssetUrl, framing='portrait', className='', decorative=false, label }: {
  resource: CharacterResource;
  assetUrl?: (id:string,key:string)=>string;
  framing?: 'portrait'|'full';
  className?: string;
  decorative?: boolean;
  label?: string;
}) {
  const view=resolveResourcePortrait(resource,framing);
  if(!view || resource.availability!=='ready')return <FileImage className={`resource-portrait-unavailable ${className}`} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${resource.name}形象暂不可用`} />;
  return <svg className={`resource-portrait ${className}`} data-resource-id={resource.id} data-frame={view.frameName} data-framing={framing} viewBox={view.viewBox} preserveAspectRatio="xMidYMid slice" role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label ?? `${resource.name}头像`}>
    <image href={assetUrl(resource.id,view.assetKey)} width={view.imageWidth} height={view.imageHeight} transform={view.imageTransform} />
  </svg>;
}
