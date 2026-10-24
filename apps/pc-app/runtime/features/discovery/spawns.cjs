const {createHash}=require('node:crypto');
const {point,distanceMeters}=require('./coordinates.cjs');
const CATALOG=[
  {templateId:'big-fish-cheerful',name:'小蓝',element:'water',avatar:'✧',description:'活泼开朗，对每一次新的相遇充满好奇。',resourceId:'builtin:lingjing-yuwan-v1',stats:{hp:124,atk:28,def:24,spd:20}},
  {templateId:'blaze-shiba',name:'焰柴',element:'fire',avatar:'柴',description:'热情勇敢，走到哪里都带着满满的元气。',resourceId:'legacy:animateddogshibainu.glb',stats:{hp:118,atk:33,def:20,spd:22}},
  {templateId:'tuxedo-cat',name:'礼帽喵',element:'wood',avatar:'喵',description:'优雅而温柔，珍惜安静陪伴的时光。',resourceId:'legacy:tuxedocatanimated.glb',stats:{hp:130,atk:26,def:26,spd:18}},
  {templateId:'husky',name:'钢狼',element:'metal',avatar:'狼',description:'忠诚的伙伴，喜欢一起探索。',resourceId:'legacy:husky.glb',stats:{hp:136,atk:30,def:30,spd:13}}
];
const CELL_DEGREES=.0006;
function hourKey(now) {return Math.floor(now/3600000);}
/** Game encounters are anchored to fixed world cells, not dragged along with the device. */
function nearbySpawns(position,now=Date.now(),radiusMeters=450) {
  const center=point(position),latCell=Math.floor(center.lat/CELL_DEGREES),lngCell=Math.floor(center.lng/CELL_DEGREES);
  const safeRadius=Math.max(100,Math.min(1000,Number(radiusMeters)||450));
  const lngRange=Math.min(28,Math.ceil(safeRadius/(CELL_DEGREES*111320*Math.max(.1,Math.cos(center.lat*Math.PI/180))))+1);
  const latRange=Math.ceil(safeRadius/(CELL_DEGREES*111320))+1;
  const spawns=[];
  for(let y=latCell-latRange;y<=latCell+latRange;y++) for(let x=lngCell-lngRange;x<=lngCell+lngRange;x++) {
    const id=`wild-${hourKey(now)}-${y}-${x}`;
    const bytes=createHash('sha256').update(id).digest();
    if(bytes[0]>100) continue;
    const p={lat:(y+.5)*CELL_DEGREES,lng:(x+.5)*CELL_DEGREES};
    if(Math.abs(p.lat)>90||Math.abs(p.lng)>180) continue;
    const distance=distanceMeters(center,p); if(distance>safeRadius) continue;
    const species=CATALOG[bytes[1]%CATALOG.length];
    spawns.push({...species,id,wildSerial:`D${bytes.subarray(0,8).toString('hex').toUpperCase()}`,position:p,coordinateSystem:'wgs84',
      rarity:bytes[2]<10 ? 'epic' : bytes[2]<60 ? 'rare' : 'common',
      placeLabel:'附近探索点',placeLabelSource:'game',expiresAt:(hourKey(now)+1)*3600000,distanceMeters:Math.round(distance),source:'game-spawn'});
  }
  return spawns.sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,16);
}
module.exports={CATALOG,nearbySpawns,hourKey};
