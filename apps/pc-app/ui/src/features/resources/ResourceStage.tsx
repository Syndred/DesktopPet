import { useEffect, useRef, useState } from 'react';
import type { Application, AnimatedSprite, Spritesheet, SpritesheetData, Texture } from 'pixi.js';
import type { CharacterResource, ResourceAction, ResourceContext } from '../../../../../../packages/shared-types/src/features/resources';
import { resourceAssetUrl } from './client';
import { resolveResourceCalibration, resolveResourceClip, resourceTransform } from './display';
import './resources.css';

type SheetEntry = { promise: Promise<Spritesheet>; users: number; lastUse: number; url: string };
const sharedSheets = new Map<string, SheetEntry>();
type StageStatus = { state: 'loading' | 'ready' | 'error'; message?: string };
interface Engine { app: Application; sprite: AnimatedSprite; update(): void }

export interface ResourceStageProps {
  resource: CharacterResource;
  petId: string;
  context?: ResourceContext;
  action?: ResourceAction;
  facing?: 'left' | 'right';
  playing?: boolean;
  motionEnabled?: boolean;
  assetUrl?: (resourceId: string, assetKey: string) => string;
  className?: string;
}
/** Pixi owns atlas parsing, texture cropping, animation frames, playback and rendering. */
export function ResourceStage({ resource, petId, context = 'desktop', action = 'idle', facing = 'right', playing = true, motionEnabled = true, assetUrl = resourceAssetUrl, className = '' }: ResourceStageProps) {
  const host = useRef<HTMLDivElement>(null), engine = useRef<Engine | null>(null);
  const [status, setStatus] = useState<StageStatus>({ state: 'loading' }), [retry, setRetry] = useState(0);
  const { clip, fallback } = resolveResourceClip(resource, action);
  const calibration = resolveResourceCalibration(resource, context, facing);
  const current = useRef({ clip, calibration, playing, motionEnabled }); current.current = { clip, calibration, playing, motionEnabled };
  const url = assetUrl(resource.id, resource.entryAsset), cacheKey = `${url}:${resource.contentHash}`;
  useEffect(() => {
    if (resource.kind !== 'spritesheet' || resource.availability !== 'ready' || !resource.atlas || !host.current) return;
    const element = host.current, atlas = resource.atlas;
    let cancelled = false, destroy: (() => void) | undefined, acquired: SheetEntry | undefined;
    setStatus({ state: 'loading' });
    async function mount() {
      const [pixi] = await Promise.all([import('pixi.js'), import('pixi.js/unsafe-eval')]);
      if (cancelled) return;
      acquired = sharedSheets.get(cacheKey);
      if (!acquired) {
        const entry: SheetEntry = { users: 0, lastUse: Date.now(), url, promise: (async () => {
          const texture = await pixi.Assets.load<Texture>(url);
          const sheet = new pixi.Spritesheet({ texture, data: atlas as SpritesheetData, cachePrefix: `${resource.id}:` });
          await sheet.parse(); return sheet;
        })() };
        sharedSheets.set(cacheKey, entry); acquired = entry;
        void entry.promise.catch(() => { if (sharedSheets.get(cacheKey) === entry) sharedSheets.delete(cacheKey); });
      }
      acquired.users++; acquired.lastUse = Date.now();
      const sheet = await acquired.promise;
      if (cancelled) return;
      const app = new pixi.Application();
      await app.init({ width: element.clientWidth || 200, height: element.clientHeight || 240, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: 'webgl' });
      if (cancelled) { app.destroy(true); return; }
      const first = Object.values(sheet.textures)[0];
      const sprite = new pixi.AnimatedSprite({ textures: [first], autoPlay: false });
      const maxWidth = Math.max(...Object.values(sheet.textures).map(texture => texture.trim?.width ?? texture.orig.width)), maxHeight = Math.max(...Object.values(sheet.textures).map(texture => texture.trim?.height ?? texture.orig.height));
      let selectedClip = '';
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
      // Foundation's Motion wrapper owns the app/system policy; this only bridges it to Pixi.
      const motionBoundary = element.closest('[data-motion]');
      app.stage.addChild(sprite); element.appendChild(app.canvas);
      app.canvas.setAttribute('aria-label', `${resource.name} · 2D 动画`);
      const recordFrame = (frame: number) => {
        element.dataset.frame = String(frame);
        element.dataset.frameTexture = String(sprite.texture.uid);
        const region = sprite.texture.frame;
        element.dataset.textureFrame = [region.x,region.y,region.width,region.height].join(',');
        const trim = sprite.texture.trim ?? {x:0,y:0,width:sprite.texture.orig.width,height:sprite.texture.orig.height};
        element.dataset.contentBounds = JSON.stringify({x:sprite.x+(trim.x-sprite.anchor.x*sprite.texture.orig.width)*sprite.scale.x,y:sprite.y+(trim.y-sprite.anchor.y*sprite.texture.orig.height)*sprite.scale.y,width:trim.width*sprite.scale.x,height:trim.height*sprite.scale.y,canvasWidth:app.screen.width,canvasHeight:app.screen.height});
      };
      sprite.onFrameChange = recordFrame;
      const update = () => {
        const value = current.current, selected = value.clip?.name ?? '';
        if (selected !== selectedClip) { sprite.stop(); sprite.textures = sheet.animations[selected] ?? [first]; selectedClip = selected; sprite.gotoAndStop(0); }
        sprite.anchor.set(value.calibration.anchorX ?? 0.5, value.calibration.anchorY ?? 0.85);
        sprite.position.set(app.screen.width / 2, app.screen.height * 0.83);
        sprite.scale.set(Math.min(app.screen.width * 0.78 / maxWidth, app.screen.height * 0.78 / maxHeight));
        sprite.animationSpeed = (value.calibration.fps || value.clip?.fps || 8) / 60; sprite.loop = value.clip?.loop ?? true;
        if (value.playing && value.motionEnabled && !document.hidden && !reduced.matches && motionBoundary?.getAttribute('data-motion') !== 'reduced') { sprite.play(); app.ticker.start(); }
        else { sprite.stop(); app.renderer.render(app.stage); app.ticker.stop(); }
        recordFrame(sprite.currentFrame);
      };
      const resize = () => { app.renderer.resize(element.clientWidth || 200, element.clientHeight || 240); update(); };
      const observer = new ResizeObserver(resize); observer.observe(element);
      const policyObserver = new MutationObserver(update);
      if (motionBoundary) policyObserver.observe(motionBoundary, { attributes: true, attributeFilter: ['data-motion'] });
      document.addEventListener('visibilitychange', update); reduced.addEventListener('change', update);
      engine.current = { app, sprite, update }; update();
      element.dataset.textureKey = cacheKey; element.dataset.textureSource = String(first.source.uid); recordFrame(sprite.currentFrame);
      destroy = () => { observer.disconnect(); policyObserver.disconnect(); document.removeEventListener('visibilitychange', update); reduced.removeEventListener('change', update); sprite.stop(); engine.current = null; app.destroy(true, { children: true, texture: false, textureSource: false }); };
      setStatus({ state: 'ready' });
    }
    void mount().catch(error => { if (!cancelled) { console.warn('[resources:2d-atlas]', error); destroy?.(); destroy = undefined; setStatus({ state: 'error', message: '图集无法载入，请检查图片与帧信息后重试。' }); } });
    return () => {
      cancelled = true; destroy?.();
      if (acquired) { acquired.users--; acquired.lastUse = Date.now(); }
      // Keep a small warm atlas cache; never free textures used by another instance.
      if (sharedSheets.size > 8) {
        const unused = [...sharedSheets.entries()].filter(([, entry]) => entry.users === 0).sort(([, a],[, b]) => a.lastUse - b.lastUse);
        for (const [key, entry] of unused.slice(0, sharedSheets.size - 8)) {
          sharedSheets.delete(key); void entry.promise.then(sheet => sheet.destroy(false), () => {});
        }
      }
    };
  }, [url, cacheKey, resource.id, resource.name, resource.kind, resource.availability, retry]);
  useEffect(() => { engine.current?.update(); }, [clip, calibration.anchorX, calibration.anchorY, calibration.fps, playing, motionEnabled]);
  const unsupported = resource.kind !== 'spritesheet';
  return <div className={`resource-stage ${className}`} data-resource-id={resource.id} data-pet-id={petId} data-action={action} data-clip={clip?.name ?? 'idle'} data-fallback={fallback} data-status={unsupported || resource.availability !== 'ready' ? 'error' : status.state}>
    {!unsupported && resource.availability === 'ready' ? <div className="resource-stage-transform" style={{ transform: resourceTransform(calibration, 'spritesheet') }}><div className="resource-sprite-host" ref={host} data-renderer="pixi-spritesheet" /></div> : null}
    {unsupported || resource.availability !== 'ready' || status.state === 'error' ? <div className="resource-stage-notice" role="status"><strong>{unsupported ? '请选择 2D 角色资源' : '暂时无法显示此角色'}</strong><p>{status.message || '历史记录与文件已保留；本版仅显示 2D 图集角色。'}</p>{!unsupported && resource.availability === 'ready' ? <button type="button" onClick={() => setRetry(value => value + 1)}>重新载入</button> : null}</div> : status.state === 'loading' ? <span className="resource-loading" role="status">正在唤醒角色…</span> : null}
    {fallback && status.state === 'ready' ? <span className="resource-fallback">该动作未提供 · 正在播放待机</span> : null}
  </div>;
}
export default ResourceStage;
