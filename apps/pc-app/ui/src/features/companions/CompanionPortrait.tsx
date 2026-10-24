import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { useAppMotion } from '../../components/motion';
import type { CompanionResourceRef } from '../../../../../../packages/shared-types/src/features/companions/index';
import type { ResourceDisplay, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { ResourceStage } from '../resources/ResourceStage';
import { ResourcePortrait } from '../resources/ResourcePortrait';
import { resourceAssetUrl } from '../resources/client';
import { useCompanionPlayback } from './useCompanionPlayback';
import '../../app/types';

let resourcesVersion = 0;
let stopResourcesListener: (() => void) | undefined;
const resourceListeners = new Set<() => void>();
function subscribeResources(listener: () => void) {
  resourceListeners.add(listener);
  stopResourcesListener ||= window.lingjing?.subscribe('resources:changed', () => {
    resourcesVersion += 1;
    for (const notify of resourceListeners) notify();
  });
  return () => { resourceListeners.delete(listener); if (!resourceListeners.size) { stopResourcesListener?.(); stopResourcesListener = undefined; } };
}
const getResourcesVersion = () => resourcesVersion;

/** The resources module owns drawing, calibration and action fallback. */
export function CompanionPortrait({ ownerAccountId, petId, resource, name, animate = false, framing = 'full', action: defaultAction = 'idle' }: { ownerAccountId?: string; petId: string; resource: CompanionResourceRef; name: string; animate?: boolean; framing?: 'portrait' | 'full'; action?: ResourceAction }) {
  const [display, setDisplay] = useState<ResourceDisplay | null>(null);
  const [error, setError] = useState('');
  const motionAllowed = useAppMotion();
  const playback = useCompanionPlayback(ownerAccountId, petId, resource.resourceId, animate);
  const action = playback || defaultAction;
  // AnimatedSprite changes clips itself. Keep its shared atlas/GPU stage mounted
  // across transient actions; only static thumbnails need a resolved frame.
  const displayAction = animate ? 'idle' : action;
  const playing = animate && motionAllowed;
  const version = useSyncExternalStore(subscribeResources, getResourcesVersion);
  const clipId = useId();
  useEffect(() => {
    let active = true; setDisplay(null); setError('');
    if (resource.kind !== '2d') { setError('原始记录已保留'); return; }
    void window.lingjing.invoke<ResourceDisplay>('resources', 'resolve', { resourceId: resource.resourceId, petId, context: 'desktop', action: displayAction }).then(result => {
      if (!active) return;
      if (result.ok) { if (result.data.resource.kind !== 'spritesheet') setError('请选择 2D 角色资源'); else if (result.data.resource.availability !== 'ready') setError('角色文件需要检查'); else setDisplay(result.data); }
      else setError(result.message || '角色资源暂不可用');
    }).catch(() => { if (active) setError('角色资源暂不可用'); });
    return () => { active = false; };
  }, [petId, resource.resourceId, resource.kind, displayAction, version]);
  const sheet = display?.resource.sheet;
  // Static list thumbnails share the resource image, without one GPU context per card.
  const thumbnail = !animate && display?.resource.kind === 'spritesheet' && sheet && display.resource.availability === 'ready';
  const frame = display?.clip?.frames?.[0] || 0;
  return <div className="cp-portrait" aria-label={`${name}的形象`} role="img">
    {error ? <div className="cp-resource-error"><span>✧</span><small>{error}</small></div> : !display ? <span className="cp-resource-loading" aria-label="加载角色">✧</span> : framing === 'portrait' ? <ResourcePortrait resource={display.resource} framing="portrait" className="size-full" decorative/> : thumbnail ? <svg className="cp-sheet-thumbnail size-full" viewBox={`0 0 ${sheet.width} ${sheet.height}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs><clipPath id={clipId}><rect width={sheet.width} height={sheet.height}/></clipPath></defs>
      <image href={resourceAssetUrl(display.resource.id, display.resource.entryAsset)} width={sheet.width * sheet.columns} height={sheet.height * sheet.rows} x={-(frame % sheet.columns) * sheet.width} y={-Math.floor(frame / sheet.columns) * sheet.height} clipPath={`url(#${clipId})`}/>
    </svg> : <ResourceStage petId={petId} resource={display.resource} context="desktop" action={action} playing={playing}/>}
  </div>;
}
