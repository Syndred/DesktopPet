const { convertPoint } = require('./coordinates.cjs');
const PROVIDERS={
  osm:{id:'osm',name:'OpenStreetMap',coordinateSystem:'wgs84',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxZoom:19},
  tencent:{id:'tencent',name:'腾讯地图',coordinateSystem:'gcj02',attribution:'腾讯地图',attributionUrl:'https://map.qq.com/',maxZoom:18},
  google:{id:'google',name:'Google Maps',coordinateSystem:'wgs84',attribution:'Google Maps',attributionUrl:'https://maps.google.com/',maxZoom:19}
};
class MapAdapter {
  constructor({providerId='osm',providers={}}={}) { this.providers={...PROVIDERS,...providers}; this.providerId=this.providers[providerId] ? providerId : 'osm'; }
  setProvider(id) {
    if(!this.providers[id]) return {ok:false,error:{code:'MAP_PROVIDER_UNSUPPORTED',message:'不支持的地图服务'}};
    this.providerId=id; return {ok:true,map:this.snapshot()};
  }
  snapshot() {const p=this.providers[this.providerId]; return {...p,available:Boolean(p.tileUrl),providers:Object.values(this.providers).map(v=>({id:v.id,name:v.name,available:Boolean(v.tileUrl)}))};}
  project(p,from='wgs84') { return convertPoint(p,from,this.providers[this.providerId].coordinateSystem); }
  projectPins(pins) {return pins.map(p=>({...p,position:this.project(p.position),coordinateSystem:this.providers[this.providerId].coordinateSystem}));}
}
module.exports={MapAdapter,PROVIDERS};
