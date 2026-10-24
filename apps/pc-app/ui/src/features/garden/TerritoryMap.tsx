import { useEffect, useState, type ComponentType } from 'react';
import { LocateFixed, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { GardenTerritory } from '../../../../../../packages/shared-types/src/features/garden';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
interface MapBridge { invoke<T>(feature: string, command: string, payload?: unknown): Promise<{ ok: true; data: T } | { ok: false; message: string }> }
type SharedMap = ComponentType<Record<string, unknown>>;
const mapModules = import.meta.glob('../discovery/NearbyMap.tsx');
const api = () => (window as unknown as { lingjing: MapBridge }).lingjing;
/** Reuse discovery's official map component and its configured provider. Garden
 * owns territory selection and rules; it does not implement a second map engine. */
export function TerritoryMap({ territories, owner, onLocated }: { territories: GardenTerritory[]; owner?: string; onLocated: () => Promise<unknown> }) {
  const [state, setState] = useState<DiscoverySnapshot | null>(null);
  const [Map, setMap] = useState<SharedMap | null>(null);
  const [error, setError] = useState(''); const [locating, setLocating] = useState(false);
  useEffect(() => {
    let live = true;
    const load = mapModules['../discovery/NearbyMap.tsx'];
    if (load) void load().then(module => { if(live) setMap(() => (module as {NearbyMap:SharedMap}).NearbyMap); }).catch(() => { if(live) setError('附近地图组件尚未就绪'); });
    void api().invoke<DiscoverySnapshot>('discovery','snapshot').then(result=>{if(!live)return;if(result.ok)setState(result.data);else setError(result.message);}).catch(()=>{if(live)setError('附近地图服务暂不可用');});
    return()=>{live=false;};
  },[]);
  async function locate(){
    if(locating)return;setLocating(true);setError('');
    try{
      const result=await api().invoke<DiscoverySnapshot>('discovery','locate');
      if(!result.ok)throw new Error(result.message);
      setState(result.data);await onLocated();
    }catch(failure){setError(failure instanceof Error?failure.message:'无法获取系统位置');}
    finally{setLocating(false);}
  }
  return <div className="garden-map garden-shared-map" aria-label="领地现实地图">
    {Map && state ? <Map state={{...state,territories:territories.map(territory=>({territoryId:territory.id,name:territory.name,ownerAccountId:territory.ownerAccountId,owned:territory.ownerAccountId===owner,boundary:territory.boundary||[],mapBoundary:territory.mapBoundary||territory.boundary||[],revision:territory.revision,bonusMultiplier:territory.captureMultiplier})).filter(territory=>territory.mapBoundary.length>=3)}} onSelect={()=>{window.location.hash='/discovery';}}/> : <div className="garden-map-empty"><LocateFixed size={38}/><h2>给附近的风景，留一个位置。</h2><p>{error||'与附近探索共用真实地图和系统位置。'}</p><a href="#/discovery">打开附近探索 →</a></div>}
    <Button variant="secondary" className="garden-map-locate" disabled={locating} onClick={()=>{void locate();}}><RefreshCw size={14}/>{locating?'正在定位…':'获取系统位置'}</Button>
    {error && Map && <span className="garden-map-status" role="alert">{error}</span>}
  </div>;
}
