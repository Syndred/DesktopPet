import { useEffect, useState } from 'react';
import { request } from '../../app/bridge';
import { useAppMotion } from '../../components/motion';
import { ResourceStage } from '../resources/ResourceStage';
import { resourceAssetUrl } from '../resources/client';
import type { ResourceDisplay, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import yuwanSheet from '../../../../runtime/assets/illustrations/yuwan-sprites-v1.png';

/** Large actors reuse resources' PixiJS stage; map/list portraits use one static
 * atlas frame, so they do not allocate a WebGL context for every nearby pin. */
export function ResourcePortrait({ resourceId, instanceId, compact = false, animate = true, victory = false, action, facing = 'right' }: {
  resourceId: string; instanceId: string; compact?: boolean; animate?: boolean; victory?: boolean; action?: ResourceAction; facing?: 'left' | 'right';
}) {
  const [display, setDisplay] = useState<ResourceDisplay | null>(null), [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const selectedAction = action || (victory ? 'victory' : 'idle');
  useEffect(() => {
    let active = true; setDisplay(null); setError('');
    // Resolve metadata once per identity. ResourceStage selects the current clip;
    // each battle pose must not tear down Pixi and open a fresh WebGL context.
    void request<ResourceDisplay>('resources', 'resolve', { resourceId, petId: instanceId, context: 'battle', action: 'idle' }).then(value => {
      if (!active) return;
      if (value.resource.kind !== 'spritesheet') { setError('这位伙伴暂未提供 2D 形象'); return; }
      setDisplay(value);
    }).catch(() => { if (active) setError('2D 形象暂未载入'); });
    return () => { active = false; };
  }, [resourceId, instanceId]);
  const sheet = display?.resource.sheet;
  const frame = display?.clip?.frames?.[0] || 0;
  const projectBuiltin = resourceId === 'builtin:lingjing-yuwan-v1';
  const atlas = display?.resource.atlas;
  const frameName = display?.clip?.frameNames?.[0] || atlas?.animations[display?.clip?.name || '']?.[0] || Object.keys(atlas?.frames || {})[0];
  const atlasFrame = atlas?.frames[frameName];
  return <div className={`discovery-resource-portrait ${compact ? 'compact' : ''}`} role="img" aria-label="伙伴的 2D 形象" data-appearance="2d" data-resource-id={resourceId}>
    {display && !compact && animate ? <ResourceStage className="discovery-character-stage" resource={display.resource} petId={instanceId} context="battle" action={selectedAction} facing={facing} playing={motionAllowed}/>
      : display && compact && display.resource.thumbnailAsset ? <img className="discovery-atlas-thumbnail" src={resourceAssetUrl(display.resource.id, display.resource.thumbnailAsset)} alt=""/>
      : display && atlas && atlasFrame && !atlasFrame.rotated && !(projectBuiltin && compact && sheet) ? <svg className="discovery-atlas-thumbnail" viewBox={`${atlasFrame.frame.x} ${atlasFrame.frame.y} ${atlasFrame.frame.w} ${atlasFrame.frame.h}`} aria-hidden="true"><image href={resourceAssetUrl(display.resource.id, display.resource.entryAsset)} width={atlas.meta.size.w} height={atlas.meta.size.h}/></svg>
      : display && atlasFrame?.rotated ? <ResourceStage className="discovery-character-stage" resource={display.resource} petId={instanceId} context="battle" action={selectedAction} playing={false}/>
      : display && sheet ? <div className="discovery-sheet-thumbnail" style={{
        backgroundImage: `url("${resourceAssetUrl(display.resource.id, display.resource.entryAsset)}")`,
        backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
        backgroundPosition: `${sheet.columns > 1 ? (frame % sheet.columns) / (sheet.columns - 1) * 100 : 0}% ${sheet.rows > 1 ? Math.floor(frame / sheet.columns) / (sheet.rows - 1) * 100 : 0}%`
      }}/>
      : projectBuiltin ? <div className="discovery-sheet-thumbnail" style={{ backgroundImage: `url("${yuwanSheet}")`, backgroundSize: '400% 200%', backgroundPosition: '0% 0%' }}/>
      : <span className="discovery-resource-unavailable" role="status">{error || '正在载入 2D 形象…'}</span>}
  </div>;
}
