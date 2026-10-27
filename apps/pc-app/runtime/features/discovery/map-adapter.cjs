const { convertPoint } = require('./coordinates.cjs');
const PROVIDERS={
  osm:{id:'osm',name:'OpenStreetMap',coordinateSystem:'wgs84',attribution:'© OpenStreetMap contributors',attributionUrl:'https://www.openstreetmap.org/copyright',tileUrl:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxZoom:19,minZoom:11,maxNativeZoom:19,tileMime:'image/png',tileExtension:'png',cacheNamespace:'osm-standard-png-v1'},
  'nasa-gibs-bluemarble':{id:'nasa-gibs-bluemarble',name:'NASA Blue Marble（历史影像）',coordinateSystem:'wgs84',attribution:'NASA GIBS / MODIS Blue Marble',attributionUrl:'https://nasa-gibs.github.io/gibs-api-docs/',tileUrl:'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',maxZoom:19,minZoom:2,initialZoom:8,maxNativeZoom:8,tileMime:'image/jpeg',tileExtension:'jpeg',cacheNamespace:'nasa-bluemarble-nextgeneration-googlemaps-level8-jpeg-v1',imageryNotice:'2004 年历史卫星影像，非街道地图。原生最高 8 级；继续放大不增加地面细节。'},
  tencent:{id:'tencent',name:'腾讯地图',coordinateSystem:'gcj02',attribution:'腾讯地图',attributionUrl:'https://map.qq.com/',maxZoom:18},
  google:{id:'google',name:'Google Maps',coordinateSystem:'wgs84',attribution:'Google Maps',attributionUrl:'https://maps.google.com/',maxZoom:19}
};
class MapAdapter {
  constructor({providerId='osm',providers={}}={}) { this.providers={...PROVIDERS,...providers}; this.providerId=Object.hasOwn(this.providers,providerId) ? providerId : 'osm'; }
  setProvider(id) {
    if(!Object.hasOwn(this.providers,id)) return {ok:false,error:{code:'MAP_PROVIDER_UNSUPPORTED',message:'不支持的地图服务'}};
    this.providerId=id; return {ok:true,map:this.snapshot()};
  }
  snapshot() {const p=this.providers[this.providerId]; return {...p,available:Boolean(p.tileUrl),providers:Object.values(this.providers).map(v=>({id:v.id,name:v.name,available:Boolean(v.tileUrl)}))};}
  project(p,from='wgs84') { return convertPoint(p,from,this.providers[this.providerId].coordinateSystem); }
  projectPins(pins) {return pins.map(p=>({...p,position:this.project(p.position),coordinateSystem:this.providers[this.providerId].coordinateSystem}));}
}
module.exports={MapAdapter,PROVIDERS};
