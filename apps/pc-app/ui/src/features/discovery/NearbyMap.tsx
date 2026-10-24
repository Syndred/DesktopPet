import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Crosshair, Flag, PawPrint, RefreshCw } from 'lucide-react';
import { Map as LibreMap, Marker, NavigationControl, AttributionControl, addProtocol, type GeoJSONSource, type StyleSpecification } from 'maplibre-gl';
import { circle } from '@turf/circle';
import type { FeatureCollection, Polygon } from 'geojson';
import { request } from '../../app/bridge';
import { Button } from '../../components/ui';
import type { DiscoverySnapshot, WildSpawn } from '../../../../../../packages/shared-types/src/features/discovery';
import { ResourcePortrait } from './ResourcePortrait';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre owns tiles, projection, gestures and camera movement. This protocol
// only routes visible tile requests through the existing main-process cache.
addProtocol('lingjing-raster', async (parameters, controller) => {
  const match = parameters.url.match(/^lingjing-raster:\/\/osm\/(\d+)\/(\d+)\/(\d+)$/);
  if (!match) throw new Error('Invalid map tile');
  if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const tile = await request<{ dataUrl: string }>('discovery', 'tile', { z: Number(match[1]), x: Number(match[2]), y: Number(match[3]) });
  if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return { data: Uint8Array.from(atob(tile.dataUrl.split(',')[1]), value => value.charCodeAt(0)).buffer };
});
const empty: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: [] };
function mapStyle(state: DiscoverySnapshot): StyleSpecification {
  return { version: 8, sources: {
    osm: { type: 'raster', tiles: ['lingjing-raster://osm/{z}/{x}/{y}'], tileSize: 256, attribution: state.map.attribution, maxzoom: state.map.maxZoom },
    accuracy: { type: 'geojson', data: empty }, territories: { type: 'geojson', data: empty }
  }, layers: [
    { id: 'base', type: 'raster', source: 'osm', paint: { 'raster-opacity': .86, 'raster-saturation': -.2 } },
    { id: 'territories', type: 'fill', source: 'territories', paint: { 'fill-color': ['case', ['get', 'owned'], '#6592f7', '#e6a16e'], 'fill-opacity': .16 } },
    { id: 'territory-lines', type: 'line', source: 'territories', paint: { 'line-color': ['case', ['get', 'owned'], '#5682ee', '#e29c67'], 'line-width': 2, 'line-dasharray': [2, 2] } },
    { id: 'accuracy', type: 'fill', source: 'accuracy', paint: { 'fill-color': '#6394ff', 'fill-opacity': .15 } },
    { id: 'accuracy-line', type: 'line', source: 'accuracy', paint: { 'line-color': '#7fa8ff', 'line-width': 1 } }
  ] };
}
export function NearbyMap({ state, selectedId, onSelect, mini = false }: { state: DiscoverySnapshot; selectedId?: string; onSelect?: (spawn: WildSpawn) => void; mini?: boolean }) {
  const host = useRef<HTMLDivElement>(null), map = useRef<LibreMap | null>(null), latest = useRef(state), selection = useRef(onSelect);
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  latest.current = state; selection.current = onSelect;
  const center = state.mapLocation, canRender = Boolean(center && state.map.available);
  useEffect(() => {
    if (!host.current || !canRender || !center) return;
    setReady(false); setError('');
    const instance = new LibreMap({ container: host.current, style: mapStyle(latest.current), center: [center.lng, center.lat], zoom: mini ? 14 : 16.8,
      minZoom: 11, maxZoom: state.map.maxZoom, attributionControl: false, interactive: !mini, dragRotate: false, pitchWithRotate: false,
      renderWorldCopies: false, fadeDuration: 0, maxTileCacheSize: 64 });
    map.current = instance;
    instance.addControl(new AttributionControl({ compact: false, customAttribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>' }), 'bottom-right');
    if (!mini) instance.addControl(new NavigationControl({ showCompass: true }), 'top-right');
    instance.on('load', () => setReady(true));
    instance.on('error', () => setError('部分底图暂时无法加载，可稍后重试。'));
    const observer = new ResizeObserver(() => instance.resize()); observer.observe(host.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; };
  }, [canRender, state.map.id, mini, retry]);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready || !center) return;
    const shape = circle([center.lng, center.lat], state.location.fix?.accuracyMeters || 1, { units: 'meters', steps: 48 });
    (instance.getSource('accuracy') as GeoJSONSource)?.setData(shape);
    const features: FeatureCollection<Polygon> = { type: 'FeatureCollection', features: state.territories.map(t => {
      const ring = t.mapBoundary.map(p => [p.lng, p.lat]); ring.push([...ring[0]]);
      return { type: 'Feature', properties: { id: t.territoryId, name: t.name, owned: t.owned }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }) };
    (instance.getSource('territories') as GeoJSONSource)?.setData(features);
    if(instance.getCenter().distanceTo([center.lng,center.lat])>2000) instance.jumpTo({center:[center.lng,center.lat]});
    const current = document.createElement('span'); current.className = `discovery-my-location ${state.location.mode === 'demo' ? 'demo' : ''}`;
    const locationMarker = new Marker({ element: current }).setLngLat([center.lng, center.lat]).addTo(instance);
    return () => { locationMarker.remove(); };
  }, [ready, center?.lat, center?.lng, state.location.mode, state.location.fix?.accuracyMeters, state.territories]);
  useEffect(() => {
    const instance = map.current; if (!instance || !ready || mini) return;
    const entries: Array<{ marker: Marker; root: Root }> = [];
    for (const spawn of state.spawns.slice(0, 8)) {
      const element = document.createElement('div'), root = createRoot(element);
      element.className = `discovery-marker ${spawn.id === selectedId ? 'selected' : ''}`;
      root.render(<button className="discovery-pin-button" aria-label={`${spawn.name}，距离 ${spawn.distanceMeters} 米`} aria-pressed={spawn.id === selectedId} data-spawn-id={spawn.id} onClick={() => selection.current?.(spawn)}><ResourcePortrait resourceId={spawn.resourceId} instanceId={spawn.id} compact/><span className="discovery-marker-tail"/></button>);
      const p = spawn.mapPosition || spawn.position;
      entries.push({ marker: new Marker({ element, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(instance), root });
    }
    return () => { for (const entry of entries) { entry.marker.remove(); queueMicrotask(() => entry.root.unmount()); } };
  }, [ready, mini, selectedId, state.spawns]);
  return <div className={`discovery-map ${mini ? 'mini' : ''}`} data-map-engine="maplibre-gl" data-map-ready={ready} aria-label={mini ? '相遇位置小地图' : '附近探索地图'}>
    <div className="discovery-map-canvas" ref={host}/>
    {!canRender ? <div className="discovery-map-empty"><Crosshair size={30}/><strong>{center ? '当前底图尚未配置' : '让相遇，从这里开始。'}</strong><span>{center ? '请选择已配置的地图服务。' : '获取系统位置，或明确进入演示模式。'}</span></div> : null}
    {!mini ? <><div className="discovery-map-legend"><PawPrint size={16}/>可相遇伙伴 <Flag size={15}/>领地</div><div className="discovery-map-controls"><Button variant="ghost" aria-label="地图回到当前位置" onClick={() => { if (center) map.current?.easeTo({ center: [center.lng, center.lat], duration: 0 }); }}><Crosshair size={19}/></Button><Button variant="ghost" aria-label="重新加载底图" onClick={() => setRetry(v => v + 1)}><RefreshCw size={17}/></Button></div>{error ? <span className="discovery-map-error" role="status">{error}</span> : null}</> : null}
  </div>;
}
