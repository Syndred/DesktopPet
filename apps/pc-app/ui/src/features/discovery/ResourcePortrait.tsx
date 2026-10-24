import { useEffect, useState } from 'react';
import { request } from '../../app/bridge';
import { ResourceStage } from '../resources/ResourceStage';
import { resourceAssetUrl } from '../resources/client';
import type { ResourceDisplay, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import yuwanSheet from '../../../../runtime/assets/illustrations/yuwan-sprites-v1.png';

/** Large actors reuse resources' PixiJS stage; map/list portraits use one static
 * atlas frame, so they do not allocate a WebGL context for every nearby pin. */
export function ResourcePortrait({ resourceId, instanceId, compact = false, animate = true, victory = false, action }: {
  resourceId: string; instanceId: string; compact?: boolean; animate?: boolean; victory?: boolean; action?: ResourceAction;
}) {
  const [display, setDisplay] = useState<ResourceDisplay | null>(null), [error, setError] = useState('');
  const selectedAction = action || (victory ? 'victory' : 'idle');
  useEffect(() => {
    let active = true; setDisplay(null); setError('');
    void request<ResourceDisplay>('resources', 'resolve', { resourceId, petId: instanceId, context: 'battle', action: selectedAction }).then(value => {
      if (!active) return;
      if (value.resource.kind !== 'spritesheet') { setError('这位伙伴暂未提供 2D 形象'); return; }
      setDisplay(value);
    }).catch(() => { if (active) setError('2D 形象暂未载入'); });
    return () => { active = false; };
  }, [resourceId, instanceId, selectedAction]);
  const sheet = display?.resource.sheet;
  const frame = display?.clip?.frames?.[0] || 0;
  const projectBuiltin = resourceId === 'builtin:lingjing-yuwan-v1';
  return <div className={`discovery-resource-portrait ${compact ? 'compact' : ''}`} role="img" aria-label="伙伴的 2D 形象" data-appearance="2d">
    {display && !compact && animate ? <ResourceStage className="discovery-character-stage" resource={display.resource} petId={instanceId} context="battle" action={selectedAction} playing/>
      : display && sheet ? <div className="discovery-sheet-thumbnail" style={{
        backgroundImage: `url("${resourceAssetUrl(display.resource.id, display.resource.entryAsset)}")`,
        backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
        backgroundPosition: `${sheet.columns > 1 ? (frame % sheet.columns) / (sheet.columns - 1) * 100 : 0}% ${sheet.rows > 1 ? Math.floor(frame / sheet.columns) / (sheet.rows - 1) * 100 : 0}%`
      }}/>
      : projectBuiltin ? <div className="discovery-sheet-thumbnail" style={{ backgroundImage: `url("${yuwanSheet}")`, backgroundSize: '400% 200%', backgroundPosition: '0% 0%' }}/>
      : <span className="discovery-resource-unavailable" role="status">{error || '正在载入 2D 形象…'}</span>}
  </div>;
}
