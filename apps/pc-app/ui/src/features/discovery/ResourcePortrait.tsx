import { useEffect, useState } from 'react';
import { request } from '../../app/bridge';
import { useAppMotion } from '../../components/motion';
import { ResourceStage } from '../resources/ResourceStage';
import { ResourcePortrait as CanonicalPortrait } from '../resources/ResourcePortrait';
import type { ResourceDisplay, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';

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
  return <div className={`discovery-resource-portrait ${compact ? 'compact' : ''}`} role="img" aria-label="伙伴的 2D 形象" data-appearance="2d" data-resource-id={resourceId}>
    {display && !compact && animate ? <ResourceStage className="discovery-character-stage" resource={display.resource} petId={instanceId} context="battle" action={selectedAction} facing={facing} playing={motionAllowed}/>
      : display ? <CanonicalPortrait resource={display.resource} framing={compact ? 'portrait' : 'full'} className="discovery-atlas-thumbnail" decorative/>
      : <span className="discovery-resource-unavailable" role="status">{error || '正在载入 2D 形象…'}</span>}
  </div>;
}
