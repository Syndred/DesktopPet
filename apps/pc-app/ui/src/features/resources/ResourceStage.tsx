import { useEffect, useRef, useState } from 'react';
import type { Texture as PixiTexture } from 'pixi.js';
import type { CharacterResource, ResourceAction, ResourceClip, ResourceContext } from '../../../../../../packages/shared-types/src/features/resources';
import { resourceAssetUrl } from './client';
import { resolveResourceCalibration, resolveResourceClip, resourceTransform } from './display';
import './resources.css';

type StageStatus = { state: 'loading' | 'ready' | 'error'; message?: string };
type StatusCallback = (status: StageStatus) => void;
function SpriteStage({ resource, clip, url, playing, onStatus }: { resource: CharacterResource; clip: ResourceClip | null; url: string; playing: boolean; onStatus: StatusCallback }) {
  const host = useRef<HTMLDivElement>(null);
  const statusCallback = useRef(onStatus); statusCallback.current = onStatus;
  const { width = 1, height = 1, columns = 1 } = resource.sheet ?? {};
  const frames = clip?.frames?.join(',') ?? '0';
  const fps = clip?.fps ?? 8, loop = clip?.loop ?? true;
  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    statusCallback.current({ state: 'loading' });
    async function mount() {
      // This static-sync polyfill removes Pixi's need for eval; CSP remains strict.
      const [pixi] = await Promise.all([import('pixi.js'), import('pixi.js/unsafe-eval')]);
      const { Application, Assets, AnimatedSprite, Texture, Rectangle } = pixi;
      const element = host.current;
      if (cancelled || !element) return;
      const app = new Application();
      await app.init({ resizeTo: element, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
      if (cancelled) { app.destroy(true); return; }
      cleanup = () => { app.destroy(true, { children: true, texture: false, textureSource: false }); };
      const source = await Assets.load<PixiTexture>(url);
      if (cancelled) return;
      const textures = frames.split(',').map(Number).map(index => new Texture({ source: source.source, frame: new Rectangle((index % columns) * width, Math.floor(index / columns) * height, width, height) }));
      const sprite = new AnimatedSprite(textures);
      sprite.anchor.set(0.5);
      sprite.animationSpeed = fps / 60; sprite.loop = loop;
      app.stage.addChild(sprite);
      element.appendChild(app.canvas);
      app.canvas.setAttribute('aria-label', `${resource.name} · 2D 动画`);
      const resize = () => {
        sprite.position.set(app.screen.width / 2, app.screen.height / 2);
        sprite.scale.set(Math.min(app.screen.width * 0.8 / width, app.screen.height * 0.82 / height));
      };
      const observer = new ResizeObserver(resize); observer.observe(element); resize();
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const updatePlaying = () => {
        if (playing && !document.hidden && !reducedMotion.matches) { sprite.play(); app.ticker.start(); }
        else { sprite.stop(); app.renderer.render(app.stage); app.ticker.stop(); }
      };
      document.addEventListener('visibilitychange', updatePlaying); reducedMotion.addEventListener('change', updatePlaying);
      updatePlaying();
      cleanup = () => {
        observer.disconnect(); document.removeEventListener('visibilitychange', updatePlaying); reducedMotion.removeEventListener('change', updatePlaying);
        // These per-instance frame views can be freed; the shared Assets texture source stays alive.
        sprite.stop(); app.destroy(true, { children: true, texture: false, textureSource: false });
        for (const texture of textures) texture.destroy(false);
      };
      statusCallback.current({ state: 'ready' });
    }
    void mount().catch(error => { if (!cancelled) { console.warn('[resources:spritesheet]', error); cleanup?.(); cleanup = undefined; statusCallback.current({ state: 'error', message: '精灵图无法载入或显卡暂不支持，请重试。' }); } });
    return () => { cancelled = true; cleanup?.(); };
  }, [url, resource.name, width, height, columns, frames, fps, loop, playing]);
  return <div className="resource-sprite-host" ref={host} data-renderer="pixi" />;
}

interface ModelElement extends HTMLElement {
  availableAnimations: string[]; animationName: string; play(options?: { repetitions?: number }): void; pause(): void;
}
function ModelStage({ name, url, clip, playing, yaw, pitch, onStatus }: { name: string; url: string; clip: ResourceClip | null; playing: boolean; yaw: number; pitch: number; onStatus: StatusCallback }) {
  const host = useRef<HTMLDivElement>(null), viewer = useRef<ModelElement | null>(null);
  const current = useRef({ clip, playing, yaw, pitch }); current.current = { clip, playing, yaw, pitch };
  const statusCallback = useRef(onStatus); statusCallback.current = onStatus;
  const [loadedVersion, setLoadedVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    statusCallback.current({ state: 'loading' });
    void import('@google/model-viewer').then(() => {
      if (cancelled || !host.current) return;
      const element = document.createElement('model-viewer') as ModelElement;
      element.setAttribute('src', url); element.setAttribute('alt', name);
      element.setAttribute('camera-controls', ''); element.setAttribute('disable-pan', '');
      element.setAttribute('interaction-prompt', 'none'); element.setAttribute('shadow-intensity', '0.5');
      element.setAttribute('environment-image', 'neutral'); element.setAttribute('exposure', '1.1');
      element.setAttribute('camera-orbit', '35deg 78deg 110%'); element.setAttribute('field-of-view', '32deg');
      const onLoad = () => { window.clearTimeout(timer); if (!cancelled) { statusCallback.current({ state: 'ready' }); setLoadedVersion(value => value + 1); } };
      const onError = () => { if (!cancelled) statusCallback.current({ state: 'error', message: '模型或贴图无法载入，原有导入记录仍保留。' }); };
      const timer = window.setTimeout(() => { if (!cancelled && !element.hasAttribute('loaded')) statusCallback.current({ state: 'error', message: '模型载入超时，请检查贴图或重新尝试。' }); }, 30000);
      element.addEventListener('load', onLoad); element.addEventListener('error', onError);
      host.current.appendChild(element); viewer.current = element;
      remove = () => { window.clearTimeout(timer); element.removeEventListener('load', onLoad); element.removeEventListener('error', onError); element.remove(); viewer.current = null; };
    }).catch(() => { if (!cancelled) statusCallback.current({ state: 'error', message: '3D 显示组件暂时不可用。' }); });
    return () => { cancelled = true; remove?.(); };
  }, [url, name]);
  useEffect(() => {
    const element = viewer.current; if (!element) return;
    const value = current.current;
    element.setAttribute('orientation', `0deg ${value.pitch}deg ${value.yaw}deg`);
    const requested = value.clip?.name;
    element.animationName = requested && element.availableAnimations.includes(requested) ? requested : element.availableAnimations[0] ?? '';
    const play = () => {
      if (value.playing && !document.hidden && element.animationName && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) element.play({ repetitions: value.clip?.loop ? Infinity : 1 });
      else element.pause();
    };
    play(); document.addEventListener('visibilitychange', play);
    return () => document.removeEventListener('visibilitychange', play);
  }, [loadedVersion, clip, playing, yaw, pitch]);
  return <div className="resource-model-host" ref={host} data-renderer="model-viewer" />;
}

export interface ResourceStageProps {
  resource: CharacterResource;
  petId: string;
  context?: ResourceContext;
  action?: ResourceAction;
  facing?: 'left' | 'right';
  playing?: boolean;
  assetUrl?: (resourceId: string, assetKey: string) => string;
  className?: string;
}
/** Shared appearance adapter for previews, independent companion windows and battle actors. */
export function ResourceStage({ resource, petId, context = 'desktop', action = 'idle', facing = 'right', playing = true, assetUrl = resourceAssetUrl, className = '' }: ResourceStageProps) {
  const [status, setStatus] = useState<StageStatus>({ state: 'loading' });
  const [retry, setRetry] = useState(0);
  const { clip, fallback } = resolveResourceClip(resource, action);
  const calibration = resolveResourceCalibration(resource, context, facing);
  const url = assetUrl(resource.id, resource.entryAsset);
  return <div className={`resource-stage ${className}`} data-resource-id={resource.id} data-pet-id={petId} data-action={action} data-clip={clip?.name ?? 'static'} data-fallback={fallback} data-status={resource.availability === 'ready' ? status.state : 'error'}>
    {resource.availability === 'ready' ? <div className="resource-stage-transform" style={{ transform: resourceTransform(calibration, resource.kind) }} key={`${resource.id}:${retry}`}>
      {resource.kind === 'spritesheet'
        ? <SpriteStage resource={resource} clip={clip} url={url} playing={playing} onStatus={setStatus} />
        : <ModelStage name={resource.name} url={url} clip={clip} playing={playing} yaw={calibration.yawDeg} pitch={calibration.pitchDeg} onStatus={setStatus} />}
    </div> : null}
    {resource.availability !== 'ready' || status.state === 'error' ? <div className="resource-stage-notice" role="status"><span className="resource-empty-star">✧</span><strong>{resource.availability === 'missing' ? '资源文件已缺失' : '暂时无法显示此角色'}</strong><p>{status.message || '资源与导入记录已保留，可重新导入完整文件。'}</p>{resource.availability === 'ready' ? <button type="button" onClick={() => { setStatus({ state: 'loading' }); setRetry(value => value + 1); }}>重新载入</button> : null}</div> : status.state === 'loading' ? <span className="resource-loading" role="status">正在唤醒角色…</span> : null}
    {fallback && status.state === 'ready' ? <span className="resource-fallback">{clip ? '该动作未提供 · 正在播放待机' : '静态模型 · 未提供动画'}</span> : null}
  </div>;
}
export default ResourceStage;
