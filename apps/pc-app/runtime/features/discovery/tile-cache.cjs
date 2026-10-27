const {mkdir,readFile,writeFile,stat}=require('node:fs/promises');
const {join}=require('node:path');
const {PROVIDERS}=require('./map-adapter.cjs');
// Only these reviewed, fixed endpoints may be used; renderer URLs are never accepted.
function tileProvider(provider) {
  const configured=provider && Object.hasOwn(PROVIDERS,provider.id) && PROVIDERS[provider.id];
  if(!configured?.tileUrl || !['osm','nasa-gibs-bluemarble'].includes(configured.id) || provider.tileUrl!==configured.tileUrl) throw Object.assign(new Error('该底图尚未配置'),{code:'MAP_NOT_CONFIGURED'});
  return configured;
}
function validImage(bytes,mime) {return mime==='image/png' ? bytes.length>=8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.length>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255;}

class TileCache {
  constructor(root,{fetcher=fetch}={}) {this.root=root;this.fetcher=fetcher;this.pending=new Map();this.active=0;this.queue=[];}
  async acquire() {if(this.active<6) this.active++;else await new Promise(resolve=>this.queue.push(resolve));}
  release() {const next=this.queue.shift();if(next) next();else this.active--;}
  async get(provider,z,x,y) {
    provider=tileProvider(provider);
    if(![z,x,y].every(Number.isInteger)||z<2||z>provider.maxNativeZoom||x<0||y<0||x>=2**z||y>=2**z) throw Object.assign(new Error('地图瓦片坐标无效'),{code:'MAP_TILE_INVALID'});
    const key=`${provider.cacheNamespace}/${z}/${x}/${y}`,cached=this.pending.get(key); if(cached) return cached;
    if(this.pending.size>64) throw Object.assign(new Error('地图正在加载，请稍后重试'),{code:'MAP_BUSY'});
    const task=this.read(provider,z,x,y).finally(()=>this.pending.delete(key)); this.pending.set(key,task);return task;
  }
  async read(provider,z,x,y) {
    const folder=join(this.root,provider.cacheNamespace,String(z),String(x)),file=join(folder,`${y}.${provider.tileExtension}`);
    try {const info=await stat(file); if(Date.now()-info.mtimeMs<7*86400000) { const bytes=await readFile(file); if(bytes.length<=1024*1024 && validImage(bytes,provider.tileMime)) return {dataUrl:`data:${provider.tileMime};base64,${bytes.toString('base64')}`,cached:true}; }} catch { /* first visit */ }
    const url=provider.tileUrl.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
    let bytes;
    await this.acquire();
    try {
      const response=await this.fetcher(url,{headers:{'User-Agent':'LingjingDesktop/0.1 (nearby exploration map)'},signal:AbortSignal.timeout(12000),redirect:'error',credentials:'omit'});
      if(!response.ok || response.headers.get('content-type')?.split(';')[0].trim()!==provider.tileMime || (response.url && response.url!==url)) {await response.body?.cancel().catch(()=>{});throw Object.assign(new Error('底图暂不可用，请稍后重试'),{code:'MAP_UNAVAILABLE'});}
      const declared=Number(response.headers.get('content-length'));
      if(declared>1024*1024) {await response.body?.cancel().catch(()=>{});throw Object.assign(new Error('地图瓦片无效或过大'),{code:'MAP_TILE_INVALID'});}
      const reader=response.body?.getReader();
      if(!reader) throw Object.assign(new Error('地图瓦片无效'),{code:'MAP_TILE_INVALID'});
      const chunks=[];let length=0;
      try {
        for(;;){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;
          if(length>1024*1024) throw Object.assign(new Error('地图瓦片无效或过大'),{code:'MAP_TILE_INVALID'});
          chunks.push(Buffer.from(item.value));
        }
      } catch(error) {await reader.cancel().catch(()=>{});throw error;}
      finally {reader.releaseLock();}
      bytes=Buffer.concat(chunks,length);
      if(bytes.length>1024*1024 || !validImage(bytes,provider.tileMime)) throw Object.assign(new Error('地图瓦片无效或过大'),{code:'MAP_TILE_INVALID'});
    } catch(error) {
      if(error?.code==='MAP_TILE_INVALID' || error?.code==='MAP_UNAVAILABLE') throw error;
      throw Object.assign(new Error('底图暂时无法连接，请检查网络'),{code:'MAP_UNAVAILABLE'});
    } finally {this.release();}
    await mkdir(folder,{recursive:true}); await writeFile(file,bytes);
    return {dataUrl:`data:${provider.tileMime};base64,${bytes.toString('base64')}`,cached:false};
  }
}
async function loadMapTile(map,tiles,payload) {
  const provider=map.snapshot();
  const changed=()=>({ok:false,code:'MAP_PROVIDER_CHANGED',message:'底图已切换，请重试'});
  if(payload.providerId!==provider.id) return changed();
  const data=await tiles.get(provider,payload.z,payload.x,payload.y);
  if(map.snapshot().id!==provider.id) return changed();
  return {ok:true,data};
}
module.exports={TileCache,loadMapTile};
