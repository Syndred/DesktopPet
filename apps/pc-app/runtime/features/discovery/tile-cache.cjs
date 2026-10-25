const {mkdir,readFile,writeFile,stat}=require('node:fs/promises');
const {join}=require('node:path');
class TileCache {
  constructor(root,{fetcher=fetch}={}) {this.root=root;this.fetcher=fetcher;this.pending=new Map();this.active=0;this.queue=[];}
  async acquire() {if(this.active<6) this.active++;else await new Promise(resolve=>this.queue.push(resolve));}
  release() {const next=this.queue.shift();if(next) next();else this.active--;}
  async get(provider,z,x,y) {
    if(provider.id!=='osm') throw Object.assign(new Error('该底图尚未配置'),{code:'MAP_NOT_CONFIGURED'});
    if(![z,x,y].every(Number.isInteger)||z<2||z>19||x<0||y<0||x>=2**z||y>=2**z) throw Object.assign(new Error('地图瓦片坐标无效'),{code:'MAP_TILE_INVALID'});
    const key=`${provider.id}/${z}/${x}/${y}`,cached=this.pending.get(key); if(cached) return cached;
    if(this.pending.size>64) throw Object.assign(new Error('地图正在加载，请稍后重试'),{code:'MAP_BUSY'});
    const task=this.read(provider,z,x,y).finally(()=>this.pending.delete(key)); this.pending.set(key,task);return task;
  }
  async read(provider,z,x,y) {
    const folder=join(this.root,provider.id,String(z),String(x)),file=join(folder,`${y}.png`);
    try {const info=await stat(file); if(Date.now()-info.mtimeMs<7*86400000) return {dataUrl:`data:image/png;base64,${(await readFile(file)).toString('base64')}`,cached:true};} catch { /* first visit */ }
    const url=provider.tileUrl.replace('{z}',String(z)).replace('{x}',String(x)).replace('{y}',String(y));
    let response;
    await this.acquire();
    try {response=await this.fetcher(url,{headers:{'User-Agent':'LingjingDesktop/0.1 (nearby exploration map)'},signal:AbortSignal.timeout(12000)});} catch {throw Object.assign(new Error('底图暂时无法连接，请检查网络'),{code:'MAP_UNAVAILABLE'});}
    finally {this.release();}
    if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png')) throw Object.assign(new Error('底图暂不可用，请稍后重试'),{code:'MAP_UNAVAILABLE'});
    const bytes=Buffer.from(await response.arrayBuffer()); if(bytes.length>1024*1024) throw Object.assign(new Error('地图瓦片过大'),{code:'MAP_TILE_INVALID'});
    await mkdir(folder,{recursive:true}); await writeFile(file,bytes);
    return {dataUrl:`data:image/png;base64,${bytes.toString('base64')}`,cached:false};
  }
}
module.exports={TileCache};
