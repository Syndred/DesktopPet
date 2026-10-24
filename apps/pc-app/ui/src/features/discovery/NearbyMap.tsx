import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Minus, Plus, RefreshCw } from 'lucide-react';
import { request } from '../../app/bridge';
import type { DiscoverySnapshot, GeoPoint, WildSpawn } from '../../../../../../packages/shared-types/src/features/discovery';

const SIZE = 256;
function world(point: GeoPoint, zoom: number) {
  const scale = SIZE * 2 ** zoom, lat = Math.max(-85.0511, Math.min(85.0511, point.lat)) * Math.PI / 180;
  return { x: (point.lng + 180) / 360 * scale, y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * scale };
}
function Tile({ z, x, y, version }: { z: number; x: number; y: number; version: number }) {
  const [url, setUrl] = useState(''), [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; setFailed(false); setUrl('');
    void request<{ dataUrl: string }>('discovery', 'tile', { z, x, y }).then(tile => { if (live) setUrl(tile.dataUrl); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [z, x, y, version]);
  return url ? <img draggable={false} src={url} alt=""/> : <div className="discovery-tile-missing">{failed ? '底图暂不可用' : '加载地图…'}</div>;
}
export function NearbyMap({ state, selectedId, onSelect }: { state: DiscoverySnapshot; selectedId?: string; onSelect: (spawn: WildSpawn) => void }) {
  const host = useRef<HTMLDivElement>(null), drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 550 }), [zoom, setZoom] = useState(17), [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tileVersion, setTileVersion] = useState(0);
  const center = state.mapLocation;
  useEffect(() => { const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setSize({ width: rect.width, height: rect.height }); }); if (host.current) observer.observe(host.current); return () => observer.disconnect(); }, []);
  useEffect(() => setOffset({ x: 0, y: 0 }), [state.map.id]);
  const layout = useMemo(() => {
    if (!center) return null;
    const current = world(center, zoom), left = current.x - size.width / 2 - offset.x, top = current.y - size.height / 2 - offset.y;
    const tiles: Array<{ x: number; y: number; tx: number; ty: number }> = [];
    for (let y = Math.floor(top / SIZE); y <= Math.floor((top + size.height) / SIZE); y++) for (let x = Math.floor(left / SIZE); x <= Math.floor((left + size.width) / SIZE); x++) {
      if (y >= 0 && y < 2 ** zoom) tiles.push({ x: ((x % 2 ** zoom) + 2 ** zoom) % 2 ** zoom, y, tx: x * SIZE - left, ty: y * SIZE - top });
    }
    return { tiles, left, top, current };
  }, [center?.lat, center?.lng, zoom, size.width, size.height, offset.x, offset.y]);
  const changeZoom = (amount: number) => { setZoom(z => Math.min(state.map.maxZoom, Math.max(12, z + amount))); setOffset({ x: 0, y: 0 }); };
  const metersPerPixel = center ? Math.cos(center.lat * Math.PI / 180) * 156543.03392 / 2 ** zoom : 1;
  return <div className="discovery-map" ref={host} aria-label="附近探索地图"
    onPointerDown={e => { if ((e.target as HTMLElement).closest('button,a')) return; drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if (drag.current) setOffset({ x: drag.current.ox + e.clientX - drag.current.x, y: drag.current.oy + e.clientY - drag.current.y }); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    {layout && state.map.available ? <>
      {layout.tiles.map(tile => <div className="discovery-tile" key={`${state.map.id}-${zoom}-${tile.x}-${tile.y}`} style={{ left: tile.tx, top: tile.ty }}><Tile z={zoom} x={tile.x} y={tile.y} version={tileVersion}/></div>)}
      {state.territories.length ? <svg className="discovery-territories" width={size.width} height={size.height} aria-label="附近领地边界">{state.territories.map(territory => <polygon key={territory.territoryId} points={territory.mapBoundary.map(p => { const v = world(p, zoom); return `${v.x - layout.left},${v.y - layout.top}`; }).join(' ')} fill={territory.owned ? '#6698fa24' : '#f7a36c24'} stroke={territory.owned ? '#729af1' : '#e7a375'} strokeWidth="2" strokeDasharray="5 4"><title>{territory.name} · {territory.owned ? '我的领地' : territory.ownerAccountId ? '已有归属' : '中立'}</title></polygon>)}</svg> : null}
      <div className="discovery-accuracy" style={{ left: layout.current.x - layout.left, top: layout.current.y - layout.top, width: Math.min(600, (state.location.fix?.accuracyMeters || 0) * 2 / metersPerPixel), height: Math.min(600, (state.location.fix?.accuracyMeters || 0) * 2 / metersPerPixel) }}/>
      <span className={`discovery-my-pin ${state.location.mode === 'demo' ? 'demo' : ''}`} style={{ left: layout.current.x - layout.left, top: layout.current.y - layout.top }} title={state.location.mode === 'demo' ? '演示中心点' : '系统返回的位置'}/>
      {state.spawns.map(spawn => { const position = world(spawn.mapPosition || spawn.position, zoom); return <button className={`discovery-map-pin element-${spawn.element} ${selectedId === spawn.id ? 'selected' : ''} ${spawn.captureState === 'captured' ? 'captured' : ''}`} key={spawn.id} onClick={() => onSelect(spawn)} style={{ left: position.x - layout.left, top: position.y - layout.top }} aria-label={`${spawn.name}，距离 ${spawn.distanceMeters} 米`} aria-pressed={selectedId === spawn.id}>{spawn.avatar}</button>; })}
    </> : <div className="discovery-map-empty"><Crosshair size={38}/><strong>{center ? '当前底图尚未配置' : '让一次相遇，从这里开始。'}</strong><span>{center ? '可切换 OpenStreetMap 继续浏览。' : '点击“获取系统位置”，或明确进入演示模式。'}</span></div>}
    <div className="discovery-map-legend"><span className="discovery-dot"/> {state.location.mode === 'demo' ? '演示中心' : '当前位置'} <span className="discovery-paw">✦</span> 可相遇的伙伴</div>
    <div className="discovery-map-controls"><button aria-label="重新加载底图" onClick={() => setTileVersion(v => v + 1)}><RefreshCw size={18}/></button><button aria-label="地图回到当前位置" onClick={() => setOffset({ x: 0, y: 0 })}><Crosshair size={20}/></button><button aria-label="放大地图" onClick={() => changeZoom(1)}><Plus size={20}/></button><button aria-label="缩小地图" onClick={() => changeZoom(-1)}><Minus size={20}/></button></div>
    {layout ? <a className="discovery-attribution" href={state.map.attributionUrl} target="_blank" rel="noreferrer">{state.map.attribution}</a> : null}
  </div>;
}
