import { RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import type { GardenTerritory } from '../../../../../../packages/shared-types/src/features/garden';
import type { DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
import { NearbyMap } from '../discovery/NearbyMap';
import { useDiscovery } from '../discovery/use-discovery';

/** Discovery owns the map engine, subscriptions and foreground-location policy.
 * Territory selection stays in the accessible list beside the shared map. */
export function TerritoryMap({ territories, owner, onLocated }: { territories: GardenTerritory[]; owner?: string; onLocated: () => Promise<unknown> }) {
  const {data, error, pending, run} = useDiscovery();
  const mapped = territories.map(territory=>({
    territoryId:territory.id,name:territory.name,ownerAccountId:territory.ownerAccountId,
    owned:territory.ownerAccountId===owner,boundary:territory.boundary||[],
    mapBoundary:territory.mapBoundary||territory.boundary||[],revision:territory.revision,
    bonusMultiplier:territory.captureMultiplier
  })).filter(territory=>territory.mapBoundary.length>=3);
  async function locate(){
    const result = await run<DiscoverySnapshot>('locate');
    if(result) await onLocated();
  }
  return <div className="garden-map garden-shared-map" aria-label="领地现实地图">
    {data ? <NearbyMap state={{...data,territories:mapped}} onSelect={()=>{window.location.hash='/discovery';}}/> : <div className="garden-map-empty" role="status">正在打开附近地图…</div>}
    <Button variant="secondary" className="garden-map-locate" disabled={pending} onClick={()=>{void locate();}}><RefreshCw size={14}/>{pending?'正在定位…':'获取系统位置'}</Button>
    {error && <span className="garden-map-status" role="alert">{error}</span>}
  </div>;
}
