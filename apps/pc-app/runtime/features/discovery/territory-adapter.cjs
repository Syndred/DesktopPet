const {point,distanceMeters}=require('./coordinates.cjs');
const {booleanPointInPolygon}=require('@turf/boolean-point-in-polygon');
const {polygon}=require('@turf/helpers');
function contains(fix,boundary) {
  const ring=boundary.map(p=>[p.lng,p.lat]);ring.push([...ring[0]]);
  return booleanPointInPolygon([fix.lng,fix.lat],polygon([ring]));
}
/** Garden and discovery read one territory authority; no client-created ownership. */
class TerritoryMapAdapter {
  constructor(getAuthority,map) {this.getAuthority=getAuthority;this.map=map;}
  listForOwner(input) {return this.getAuthority()?.listForOwner?.(input) || [];}
  getForOwner(input) {return this.getAuthority()?.getForOwner?.(input) || null;}
  gardenBonusForOwner(input) {return this.getAuthority()?.gardenBonusForOwner?.(input) || 0;}
  nearby(ownerAccountId,fix) {
    const authority=this.getAuthority();
    if((!authority?.listNearby && !authority?.listForOwner) || fix?.source!=='os') return {available:false,items:[]};
    const result=authority.listNearby ? authority.listNearby({ownerAccountId,position:point(fix),coordinateSystem:'wgs84',radiusMeters:1000}) : authority.listForOwner({ownerAccountId});
    if(result?.then) return {available:false,items:[]};
    const records=Array.isArray(result) ? result : result?.data || [];
    const items=[];
    for(const record of records) {
      const id=record?.territoryId || record?.id;
      if(!id || !Array.isArray(record.boundary) || record.boundary.length<3 || record.boundary.length>1000) continue;
      try {
        const boundary=record.boundary.map(point),mapBoundary=boundary.map(p=>this.map.project(p));
        if(!contains(fix,boundary) && !boundary.some(p=>distanceMeters(fix,p)<=1000)) continue;
        items.push({territoryId:String(id),name:String(record.name || '附近领地'),ownerAccountId:record.ownerAccountId || null,owned:record.ownerAccountId===ownerAccountId,
          revision:record.revision,boundary,mapBoundary,coordinateSystem:'wgs84',bonusMultiplier:record.captureMultiplier || record.bonusMultiplier || 1,provenance:record.provenance || 'authority'});
      } catch { /* Invalid authority geometry is omitted, not drawn at an invented location. */ }
    }
    return {available:true,items};
  }
  captureContext(ownerAccountId,fix) {
    const territory=this.nearby(ownerAccountId,fix).items.find(item=>item.owned && contains(fix,item.boundary));
    return territory ? {territoryId:territory.territoryId,captureMultiplier:territory.bonusMultiplier,territoryRevision:territory.revision} : {territoryId:null,captureMultiplier:1};
  }
}
module.exports={TerritoryMapAdapter,contains};
