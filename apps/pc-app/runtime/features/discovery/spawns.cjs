const {createHash}=require('node:crypto');
const {point,distanceMeters}=require('./coordinates.cjs');
const {listTemplates}=require('../companions/templates.cjs');
function canonicalCatalog(templates=listTemplates()) {
  return templates.filter(template=>['2d','spritesheet'].includes(template.resource?.kind)&&template.resource.resourceId&&template.baseStats)
    .map(template=>({templateId:template.templateId,name:template.name,element:template.element,description:template.description,resourceId:template.resource.resourceId,stats:{...template.baseStats}}))
    .sort((a,b)=>a.templateId<b.templateId?-1:a.templateId>b.templateId?1:0);
}
const CATALOG=canonicalCatalog();
const CELL_DEGREES=.0006;
function hourKey(now) {return Math.floor(now/3600000);}
/** Game encounters are anchored to fixed world cells, not dragged along with the device. */
function nearbySpawns(position,now=Date.now(),radiusMeters=450,templates) {
  const catalog=canonicalCatalog(templates);if(!catalog.length)return [];
  const revision=createHash('sha256').update(JSON.stringify(catalog.map(item=>[item.templateId,item.element,item.resourceId,...['hp','atk','def','spd'].map(key=>item.stats[key])]))).digest('hex').slice(0,10);
  const center=point(position),latCell=Math.floor(center.lat/CELL_DEGREES),lngCell=Math.floor(center.lng/CELL_DEGREES);
  const safeRadius=Math.max(100,Math.min(1000,Number(radiusMeters)||450));
  const lngRange=Math.min(28,Math.ceil(safeRadius/(CELL_DEGREES*111320*Math.max(.1,Math.cos(center.lat*Math.PI/180))))+1);
  const latRange=Math.ceil(safeRadius/(CELL_DEGREES*111320))+1;
  const spawns=[];
  for(let y=latCell-latRange;y<=latCell+latRange;y++) for(let x=lngCell-lngRange;x<=lngCell+lngRange;x++) {
    // A canonical template/resource change creates a new encounter generation;
    // saved encounters retain their original identity and can still be resumed.
    const id=`wild-2d-v2-${revision}-${hourKey(now)}-${y}-${x}`;
    const bytes=createHash('sha256').update(id).digest();
    if(bytes[0]>100) continue;
    const p={lat:(y+.5)*CELL_DEGREES,lng:(x+.5)*CELL_DEGREES};
    if(Math.abs(p.lat)>90||Math.abs(p.lng)>180) continue;
    const distance=distanceMeters(center,p); if(distance>safeRadius) continue;
    const species=catalog[bytes[1]%catalog.length];
    spawns.push({...species,id,wildSerial:`D${bytes.subarray(0,8).toString('hex').toUpperCase()}`,position:p,coordinateSystem:'wgs84',
      rarity:bytes[2]<10 ? 'epic' : bytes[2]<60 ? 'rare' : 'common',
      placeLabel:'附近探索点',placeLabelSource:'game',expiresAt:(hourKey(now)+1)*3600000,distanceMeters:Math.round(distance),source:'game-spawn'});
  }
  return spawns.sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,16);
}
module.exports={CATALOG,canonicalCatalog,nearbySpawns,hourKey};
