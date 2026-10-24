const {point}=require('./coordinates.cjs');
/** Garden and discovery read one territory authority; no client-created ownership. */
class TerritoryMapAdapter {
  constructor(getAuthority,map) {this.getAuthority=getAuthority;this.map=map;}
  listForOwner(input) {return this.getAuthority()?.listForOwner?.(input) || [];}
  getForOwner(input) {return this.getAuthority()?.getForOwner?.(input) || null;}
  gardenBonusForOwner(input) {return this.getAuthority()?.gardenBonusForOwner?.(input) || 0;}
  nearby(ownerAccountId,fix) {
    const authority=this.getAuthority();
    if(!authority?.listNearby || fix?.source!=='os') return {available:false,items:[]};
    const result=authority.listNearby({ownerAccountId,position:point(fix),coordinateSystem:'wgs84',radiusMeters:1000});
    if(result?.then) return {available:false,items:[]};
    const records=Array.isArray(result) ? result : result?.data || [];
    const items=[];
    for(const record of records) {
      if(!record?.territoryId || !Array.isArray(record.boundary) || record.boundary.length<3 || record.boundary.length>1000) continue;
      try {
        const boundary=record.boundary.map(point),mapBoundary=boundary.map(p=>this.map.project(p));
        items.push({territoryId:String(record.territoryId),name:String(record.name || '附近领地'),ownerAccountId:record.ownerAccountId || null,owned:record.ownerAccountId===ownerAccountId,
          revision:record.revision,boundary,mapBoundary,coordinateSystem:'wgs84',bonusMultiplier:record.bonusMultiplier || 1});
      } catch { /* Invalid authority geometry is omitted, not drawn at an invented location. */ }
    }
    return {available:true,items};
  }
}
module.exports={TerritoryMapAdapter};
