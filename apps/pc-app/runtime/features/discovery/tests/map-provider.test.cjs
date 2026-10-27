const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,rm,readdir}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {MapAdapter,PROVIDERS}=require('../map-adapter.cjs');
const {TileCache,loadMapTile}=require('../tile-cache.cjs');
const png=Buffer.from('89504e470d0a1a0a00000000','hex'),jpeg=Buffer.from('ffd8ffe00010','hex');
const response=(url,bytes,mime)=>({ok:true,url,headers:new Headers({'content-type':mime}),body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}})});
async function fixture(t,fetcher){const root=await mkdtemp(join(tmpdir(),'map-provider-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return {root,cache:new TileCache(root,{fetcher})};}
test('OSM stays default; NASA is explicit historical imagery with native z8 and independent projection',()=>{
 const map=new MapAdapter();assert.equal(map.snapshot().id,'osm');assert.equal(map.snapshot().initialZoom,undefined);
 assert.equal(map.setProvider('nasa-gibs-bluemarble').ok,true);const p=map.snapshot();assert.equal(p.maxNativeZoom,8);assert.equal(p.maxZoom,19);assert.equal(p.initialZoom,8);assert.match(p.imageryNotice,/2004.*非街道/);assert.equal(p.tileMime,'image/jpeg');
 assert.deepEqual(map.project({lat:31,lng:121}),{lat:31,lng:121});assert.equal(map.setProvider('__proto__').ok,false);assert.equal(map.setProvider('constructor').ok,false);
});
test('fixed NASA endpoint preserves WMTS row/column and JPEG cache separate from OSM PNG',async t=>{
 const calls=[];const {cache,root}=await fixture(t,async(url,options)=>{calls.push({url,options});const nasa=url.includes('nasa.gov');return response(url,nasa?jpeg:png,nasa?'image/jpeg':'image/png');});
 const a=await cache.get(PROVIDERS['nasa-gibs-bluemarble'],8,214,104);assert.match(a.dataUrl,/^data:image\/jpeg;base64,/);
 assert.equal(calls[0].url,'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/8/104/214.jpeg');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.credentials,'omit');
 assert.equal((await cache.get(PROVIDERS['nasa-gibs-bluemarble'],8,214,104)).cached,true);
 const b=await cache.get(PROVIDERS.osm,8,214,104);assert.match(b.dataUrl,/^data:image\/png;base64,/);assert.equal(calls.length,2);assert.equal((await readdir(root)).length,2);
});
test('reject out-of-native-range, arbitrary provider/URL before any request',async t=>{
 let calls=0;const {cache}=await fixture(t,async()=>{calls++;throw Error('must not fetch');});
 for(const [p,z,x,y] of [[PROVIDERS['nasa-gibs-bluemarble'],9,0,0],[PROVIDERS.osm,20,0,0],[{...PROVIDERS.osm,tileUrl:'https://example.org/{z}'},2,0,0],[{id:'__proto__'},2,0,0],[PROVIDERS.osm,2,-1,0]]) await assert.rejects(cache.get(p,z,x,y));
 assert.equal(calls,0);
});
test('reject redirect response, MIME mismatch, invalid image; never fallback provider',async t=>{
 for(const kind of ['redirect','mime','bytes']){let calls=0;const {cache}=await fixture(t,async url=>{calls++;return response(kind==='redirect'?'https://example.org/tile':url,kind==='bytes'?Buffer.from('not-an-image'):jpeg,kind==='mime'?'image/png':'image/jpeg');});await assert.rejects(cache.get(PROVIDERS['nasa-gibs-bluemarble'],2,1,1));assert.equal(calls,1);}
});
test('same tile requests deduplicate and source switch cannot return old tile into new map',async t=>{
 let release,calls=0;const gate=new Promise(resolve=>release=resolve);const {cache}=await fixture(t,async url=>{calls++;await gate;return response(url,png,'image/png');});
 const map=new MapAdapter();const one=loadMapTile(map,cache,{providerId:'osm',z:2,x:1,y:1});const two=cache.get(map.snapshot(),2,1,1);map.setProvider('nasa-gibs-bluemarble');release();assert.equal((await one).code,'MAP_PROVIDER_CHANGED');await two;assert.equal(calls,1);
 const stale=await loadMapTile(map,cache,{providerId:'osm',z:2,x:1,y:1});assert.equal(stale.code,'MAP_PROVIDER_CHANGED');assert.equal(calls,1);
});
test('six-request bound includes response-body reads, not just response headers',async t=>{
 let release,started=0,active=0,maximum=0;const bodyGate=new Promise(resolve=>release=resolve);
 const {cache}=await fixture(t,async url=>{started++;active++;maximum=Math.max(maximum,active);return {ok:true,url,headers:new Headers({'content-type':'image/jpeg'}),body:new ReadableStream({async start(controller){await bodyGate;active--;controller.enqueue(jpeg);controller.close();}})};});
 const tasks=Array.from({length:7},(_,x)=>cache.get(PROVIDERS['nasa-gibs-bluemarble'],3,x,1));
 for(let i=0;i<50 && started<6;i++) await new Promise(resolve=>setImmediate(resolve));
 assert.equal(started,6);assert.equal(active,6);release();await Promise.all(tasks);assert.equal(started,7);assert.equal(maximum,6);assert.equal(cache.active,0);assert.equal(cache.pending.size,0);
});

test('missing length does not permit unbounded body; aborted body frees the slot',async t=>{
 let cancelled=false,reads=0;const {cache}=await fixture(t,async url=>({ok:true,url,headers:new Headers({'content-type':'image/jpeg'}),body:new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(600000));},cancel(){cancelled=true;}})}));
 await assert.rejects(cache.get(PROVIDERS['nasa-gibs-bluemarble'],2,1,1),e=>e.code==='MAP_TILE_INVALID');assert.equal(cancelled,true);assert.ok(reads<=3);assert.equal(cache.active,0);assert.equal(cache.pending.size,0);
});
test('truncated response stream is a clear failure without fallback or slot leak',async t=>{
 const {cache}=await fixture(t,async url=>({ok:true,url,headers:new Headers({'content-type':'image/jpeg'}),body:new ReadableStream({start(controller){controller.enqueue(jpeg);controller.error(Error('truncated'));}})}));
 await assert.rejects(cache.get(PROVIDERS['nasa-gibs-bluemarble'],2,1,1),e=>e.code==='MAP_UNAVAILABLE');assert.equal(cache.active,0);
});

test('headers rejected before reading still cancel the response body',async t=>{
 for(const kind of ['mime','redirect','length']){let cancelled=false;const {cache}=await fixture(t,async url=>({ok:true,url:kind==='redirect'?'https://example.org/blocked':url,headers:new Headers({'content-type':kind==='mime'?'text/html':'image/jpeg',...(kind==='length'?{'content-length':'1048577'}:{})}),body:new ReadableStream({cancel(){cancelled=true;}})}));await assert.rejects(cache.get(PROVIDERS['nasa-gibs-bluemarble'],2,1,1));assert.equal(cancelled,true);assert.equal(cache.active,0);}
});
