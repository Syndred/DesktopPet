import { useEffect, useRef, useState } from 'react';
import type { GardenTerritory } from '../../../../../../packages/shared-types/src/features/garden';
type Point = { lat: number; lng: number };
interface MapState { mapLocation: Point | null; location: { mode: string; fix?: { accuracyMeters: number } }; map: { id: string; available: boolean; attribution: string; attributionUrl: string; maxZoom: number } }
interface MapBridge { invoke<T>(feature: string, command: string, payload?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> }
const api = () => (window as unknown as { lingjing: MapBridge }).lingjing;
function world(point: Point, zoom: number) {
  const size = 256 * 2 ** zoom;
  const rad = Math.max(-85.0511, Math.min(85.0511, point.lat)) * Math.PI / 180;
  return { x: (point.lng + 180) / 360 * size, y: (1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2 * size };
}
function MapTile({ x, y, z, provider }: { x: number; y: number; z: number; provider: string }) {
  const [url, setUrl] = useState(''); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; setUrl(''); setFailed(false);
    void api().invoke<{ dataUrl: string }>('discovery', 'tile', { x, y, z }).then(result => { if (live) { if (result.ok) setUrl(result.data.dataUrl); else setFailed(true); } }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [x, y, z, provider]);
  return url ? <img src={url} alt="" draggable={false} /> : <div className="garden-map-tile-empty">{failed ? '底图暂不可用' : '加载地图…'}</div>;
}
export function TerritoryMap({ territories, selected, owner, onSelect, onLocated }: { territories: GardenTerritory[]; selected?: string; owner?: string; onSelect: (id: string) => void; onLocated: () => Promise<unknown> }) {
  const [state, setState] = useState<MapState | null>(null); const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  const [size, setSize] = useState({ width: 640, height: 360 }); const [zoom, setZoom] = useState(16); const [offset, setOffset] = useState({ x: 0, y: 0 });
  const host = useRef<HTMLDivElement>(null); const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  useEffect(() => {
    let live = true;
    void api().invoke<MapState>('discovery', 'snapshot').then(result => { if (!live) return; if (result.ok) setState(result.data); else setError(result.message); }).catch(() => { if (live) setError('附近地图服务暂不可用'); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) setSize({ width: rect.width, height: rect.height }); });
    if (host.current) observer.observe(host.current); return () => observer.disconnect();
  }, []);
  async function locate() {
    if (locating) return; setLocating(true); setError('');
    try {
      const result = await api().invoke<MapState>('discovery', 'locate');
      if (!result.ok) throw new Error(result.message);
      setState(result.data); setOffset({ x: 0, y: 0 }); await onLocated();
    } catch (failure) { setError(failure instanceof Error ? failure.message : '无法获取系统位置'); }
    finally { setLocating(false); }
  }
  const center = state?.mapLocation;
  const current = center ? world(center, zoom) : null;
  const left = current ? current.x - size.width / 2 - offset.x : 0, top = current ? current.y - size.height / 2 - offset.y : 0;
  const tiles: { x: number; y: number; left: number; top: number }[] = [];
  if (current && state?.map.available) for (let y = Math.floor(top / 256); y <= Math.floor((top + size.height) / 256); y++) for (let x = Math.floor(left / 256); x <= Math.floor((left + size.width) / 256); x++) if (y >= 0 && y < 2 ** zoom) tiles.push({ x: ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom, y, left: x * 256 - left, top: y * 256 - top });
  return <div className="garden-map" ref={host} aria-label="领地现实地图" onPointerDown={event => { if ((event.target as Element).closest('button,a,[role=button]')) return; drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (drag.current) setOffset({ x: drag.current.ox + event.clientX - drag.current.x, y: drag.current.oy + event.clientY - drag.current.y }); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    {current && state?.map.available ? <>
      {tiles.map(tile => <div className="garden-map-tile" key={`${state.map.id}:${zoom}:${tile.x}:${tile.y}`} style={{ left: tile.left, top: tile.top }}><MapTile x={tile.x} y={tile.y} z={zoom} provider={state.map.id} /></div>)}
      <svg className="garden-map-regions" viewBox={`0 0 ${size.width} ${size.height}`} aria-label="领地区域">{territories.map(territory => {
        const boundary = territory.mapBoundary || territory.boundary; if (!boundary?.length) return null;
        const points = boundary.map(point => world(point, zoom));
        const x = points.reduce((sum, point) => sum + point.x, 0) / points.length - left, y = points.reduce((sum, point) => sum + point.y, 0) / points.length - top;
        return <g key={territory.id} role="button" tabIndex={0} aria-label={`${territory.name}，${territory.ownerAccountId === owner ? '我的领地' : territory.ownerAccountId ? '已占领' : '未占领'}`} onClick={() => onSelect(territory.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(territory.id); } }} className={`${territory.ownerAccountId === owner ? 'mine' : 'neutral'} ${selected === territory.id ? 'selected' : ''}`}><polygon points={points.map(point => `${point.x - left},${point.y - top}`).join(' ')} /><text x={x} y={y} textAnchor="middle">⚑ {territory.name}</text></g>;
      })}</svg><span className="garden-map-my-position" style={{ left: current.x - left, top: current.y - top }} title={state.location.mode === 'demo' ? '演示位置' : '系统位置'} />
      <a className="garden-map-attribution" href={state.map.attributionUrl} target="_blank" rel="noreferrer">{state.map.attribution}</a>
    </> : <div className="garden-map-empty"><span>⌖</span><h2>给附近的风景，留一个位置。</h2><p>{error || '获取系统位置后，查看真实地图和附近领地区域。'}</p><button className="garden-primary" disabled={locating} onClick={() => { void locate(); }}>{locating ? '正在定位…' : '获取系统位置'}</button><a href="#/discovery">前往附近探索 →</a></div>}
    {current && <><div className="garden-map-status">{state?.location.mode === 'demo' ? '演示地图 · 无法占领领地' : '系统位置 · 本机领地'}{error && <span role="alert">{error}</span>}</div><div className="garden-map-controls"><button aria-label="刷新系统位置" disabled={locating} onClick={() => { void locate(); }}>⌖</button><button aria-label="放大领地地图" onClick={() => setZoom(value => Math.min(state?.map.maxZoom || 19, value + 1))}>＋</button><button aria-label="缩小领地地图" onClick={() => setZoom(value => Math.max(12, value - 1))}>−</button></div></>}
  </div>;
}
