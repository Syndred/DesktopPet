import { useEffect, useRef, useState } from 'react';
import type { GardenPlot } from '../../../../../../packages/shared-types/src/features/garden';
import type { Application, Texture } from 'pixi.js';
import backdrop from './assets/garden-terrace-v1.png';
import { cropFrames, foodAtlas } from './art';

/** Pixi owns rendering and shared texture caching. Accessible DOM buttons above
 * the canvas own selection; no custom sprite animation engine or focus changes. */
export function GardenScene({ plots, now }: { plots: GardenPlot[]; now: number }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<{ app: Application; draw: () => void } | null>(null);
  const state = useRef({ plots, now }); state.current = { plots, now };
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false; let cleanup: (() => void) | undefined;
    async function mount() {
      const [pixi] = await Promise.all([import('pixi.js'), import('pixi.js/unsafe-eval')]);
      const app = new pixi.Application();
      if (!host.current || cancelled) return;
      await app.init({ resizeTo: host.current, backgroundAlpha: 0, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), preference: 'webgl', autoStart: false });
      let disposed = false;
      cleanup = () => { if(disposed)return;disposed=true;app.destroy(true, { children: true, texture: false, textureSource: false }); };
      if (cancelled) { cleanup(); return; }
      const [backgroundTexture, atlas] = await Promise.all([pixi.Assets.load<Texture>(backdrop), pixi.Assets.load<Texture>(foodAtlas)]);
      if (cancelled) { cleanup(); return; }
      const background = new pixi.Sprite(backgroundTexture); app.stage.addChild(background);
      const width = atlas.source.width / 4, height = atlas.source.height / 2;
      const textures = Array.from({ length: 8 }, (_, index) => new pixi.Texture({ source: atlas.source, frame: new pixi.Rectangle(index % 4 * width, Math.floor(index / 4) * height, width, height) }));
      const sprites = Array.from({ length: 6 }, () => { const sprite = new pixi.Sprite(textures[5]); sprite.anchor.set(.5,.75); app.stage.addChild(sprite); return sprite; });
      function draw() {
        if (cancelled) return;
        background.width = app.screen.width; background.height = app.screen.height;
        state.current.plots.forEach((plot,index) => {
          const sprite = sprites[index]; if (!sprite) return;
          sprite.visible = Boolean(plot.cropType);
          const mature = plot.maturesAt !== null && state.current.now >= plot.maturesAt;
          sprite.texture = textures[plot.cropType && mature ? cropFrames[plot.cropType] : cropFrames.sprout];
          const normalizedX = index < 3 ? [.275,.525,.798][index] : [.235,.525,.815][index-3];
          sprite.position.set(app.screen.width * normalizedX,app.screen.height * (index < 3 ? .54 : .785));
          const target = app.screen.width * (mature ? .205 : .15); sprite.scale.set(target / width);
        });
        app.renderer.render(app.stage);
      }
      scene.current = { app,draw };
      app.canvas.setAttribute('aria-hidden','true'); host.current?.appendChild(app.canvas);
      const observer = new ResizeObserver(() => { app.resize(); draw(); }); if (host.current) observer.observe(host.current);
      draw();
      cleanup = () => { if(disposed)return;disposed=true;observer.disconnect(); scene.current = null; app.destroy(true,{children:true,texture:false,textureSource:false}); textures.forEach(texture => texture.destroy(false)); };
    }
    void mount().catch(() => { if (!cancelled) setError('菜园插画暂未载入，地块操作仍可使用。'); cleanup?.(); });
    return () => { cancelled = true; cleanup?.(); };
  }, []);
  const signature = plots.map(plot => `${plot.plotId}:${plot.cropType}:${plot.maturesAt !== null && now >= plot.maturesAt}`).join('|');
  useEffect(() => { scene.current?.draw(); }, [signature]);
  return <div ref={host} className="garden-pixi-scene" data-renderer="pixi" style={{ backgroundImage: `url(${backdrop})` }}>{error && <span className="garden-scene-error" role="status">{error}</span>}</div>;
}
