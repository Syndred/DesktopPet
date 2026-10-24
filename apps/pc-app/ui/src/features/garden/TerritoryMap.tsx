import { useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { GardenTerritory } from '../../../../../../packages/shared-types/src/features/garden';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { NearbyMap } from '../discovery/NearbyMap';
import { useDiscovery } from '../discovery/use-discovery';

/** Discovery owns the map engine, subscriptions and foreground-location policy.
 * Territory selection stays in the accessible list beside the shared map. */
export function TerritoryMap({ territories, owner, onLocated, simulated=false }: { territories: GardenTerritory[]; owner?: string; onLocated: () => Promise<unknown>; simulated?:boolean }) {
  const {data, error, pending, run} = useDiscovery();
  const locating = useRef(false);
  const [reading,setReading]=useState(false);
  const mapped = territories.map(territory=>({
    territoryId:territory.id,name:territory.name,ownerAccountId:territory.ownerAccountId,
    owned:territory.ownerAccountId===owner,boundary:territory.boundary||[],
    mapBoundary:territory.mapBoundary||territory.boundary||[],revision:territory.revision,
    bonusMultiplier:territory.captureMultiplier
  })).filter(territory=>territory.mapBoundary.length>=3);
  const ring=simulated?mapped[0]?.mapBoundary:undefined;
  // A map viewport is not a location fix and cannot authorize capture/challenge.
  const scenarioCenter=ring?{lat:ring.reduce((sum,point)=>sum+point.lat,0)/ring.length,lng:ring.reduce((sum,point)=>sum+point.lng,0)/ring.length}:null;
  async function locate(){
    if(locating.current || document.hidden)return;
    locating.current=true;setReading(true);
    try {
      if(simulated){await onLocated();return;}
      // The shared hook maintains continuous leases only on discovery routes.
      // Territory uses the same public policy for this explicit foreground read.
      const lease=await window.lingjing.invoke('discovery','setExploring',{active:true}).catch(()=>null);
      if(!lease?.ok)return;
      const result = await run<DiscoverySnapshot>('locate');
      if(result) await onLocated();
    } finally {
      locating.current=false;setReading(false);
      // A navigation to discovery hands control to its own mounted hook.
      if(!simulated&&!/^#\/discovery(?:\/|$|\?)/.test(window.location.hash))await window.lingjing.invoke('discovery','setExploring',{active:false}).catch(()=>{});
    }
  }
  return <div className="garden-map garden-shared-map" aria-label="领地现实地图">
    {data ? <NearbyMap state={{...data,mapLocation:data.mapLocation||scenarioCenter,territories:mapped}} onSelect={()=>{window.location.hash='/discovery';}}/> : <div className="garden-map-empty" role="status">正在打开附近地图…</div>}
    <Button variant="secondary" className="garden-map-locate" disabled={pending||reading} onClick={()=>{void locate();}}><RefreshCw size={14}/>{pending||reading?'正在定位…':simulated?'查看演练领地':'获取系统位置'}</Button>
    {error && <span className="garden-map-status" role="alert">{error}</span>}
  </div>;
}
