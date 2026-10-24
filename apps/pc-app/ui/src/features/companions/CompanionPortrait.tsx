import { useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { MotionConfigContext, useReducedMotion } from 'motion/react';
import type { CompanionResourceRef } from '../../../../../../packages/shared-types/src/features/companions/index';
import type { ResourceDisplay, ResourceAction } from '../../../../../../packages/shared-types/src/features/resources';
import { ResourceStage } from '../resources/ResourceStage';
import { resourceAssetUrl } from '../resources/client';
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
export function CompanionPortrait({ petId, resource, name, animate = false, action = 'idle' }: { petId: string; resource: CompanionResourceRef; name: string; animate?: boolean; action?: ResourceAction }) {
  const [display, setDisplay] = useState<ResourceDisplay | null>(null);
  const [error, setError] = useState('');
  const { reducedMotion } = useContext(MotionConfigContext);
  const systemReducedMotion = useReducedMotion();
  const playing = animate && reducedMotion !== 'always' && !systemReducedMotion;
  const version = useSyncExternalStore(subscribeResources, getResourcesVersion);
  const [spriteRuntimeReady, setSpriteRuntimeReady] = useState(false);
  useEffect(() => {
    if (!animate || resource.kind !== '2d') return;
    let active = true;
    // Pixi's CSP adapter uses static uniform synchronization instead of new Function.
    void import('pixi.js/unsafe-eval').then(() => { if (active) setSpriteRuntimeReady(true); })
      .catch(() => { if (active) setError('2D 显示组件加载失败'); });
    return () => { active = false; };
  }, [animate, resource.kind]);
  useEffect(() => {
    let active = true; setDisplay(null); setError('');
    if (resource.kind !== '2d') { setError('原始记录已保留'); return; }
    void window.lingjing.invoke<ResourceDisplay>('resources', 'resolve', { resourceId: resource.resourceId, petId, context: 'desktop', action }).then(result => {
      if (!active) return;
      if (result.ok) { if (result.data.resource.kind !== 'spritesheet') setError('请选择 2D 角色资源'); else if (result.data.resource.availability !== 'ready') setError('角色文件需要检查'); else setDisplay(result.data); }
      else setError(result.message || '角色资源暂不可用');
    }).catch(() => { if (active) setError('角色资源暂不可用'); });
    return () => { active = false; };
  }, [petId, resource.resourceId, resource.kind, action, version]);
  const sheet = display?.resource.sheet;
  // Static list thumbnails share the resource image, without one GPU context per card.
  const thumbnail = !animate && display?.resource.kind === 'spritesheet' && sheet && display.resource.availability === 'ready';
  const frame = display?.clip?.frames?.[0] || 0;
  return <div className="cp-portrait" aria-label={`${name}的形象`} role="img">
    {error ? <div className="cp-resource-error"><span>✧</span><small>{error}</small></div> : !display ? <span className="cp-resource-loading" aria-label="加载角色">✧</span> : thumbnail ? <div className="cp-sheet-thumbnail" style={{
      backgroundImage: `url("${resourceAssetUrl(display.resource.id, display.resource.entryAsset)}")`,
      backgroundSize: `${sheet.columns * 100}% ${sheet.rows * 100}%`,
      backgroundPosition: `${sheet.columns > 1 ? frame % sheet.columns / (sheet.columns - 1) * 100 : 0}% ${sheet.rows > 1 ? Math.floor(frame / sheet.columns) / (sheet.rows - 1) * 100 : 0}%`
    }}/> : display.resource.kind === 'spritesheet' && !spriteRuntimeReady ? <span className="cp-resource-loading">✧</span> : <ResourceStage petId={petId} resource={display.resource} context="desktop" action={action} playing={playing}/>}
  </div>;
}
