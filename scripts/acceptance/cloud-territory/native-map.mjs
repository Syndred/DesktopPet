import assert from 'node:assert/strict';

export async function inspectBasemap({models,evidence,save,pass,invoke,snapshot,capture}) {
  evidence.map={passed:false,clients:[],scope:'native composited pixels after MapLibre idle/all tiles; normal viewport zoom controls; no location or world mutation'};
  evidence.passed=false;save();
  for(const model of models){
    const before=await snapshot(model);
    const locationBefore=(await invoke(model,'discovery','snapshot')).location;
    await model.page.bringToFront();await model.page.evaluate(()=>{location.hash='#/garden';});
    await model.page.locator('.garden-layout').waitFor();await model.page.locator('[aria-label="云端已确认"]').waitFor();
    const map=model.page.locator('.garden-shared-map .discovery-map');
    const idle=()=>model.page.waitForFunction(()=>{const m=document.querySelector('.garden-shared-map .discovery-map');return m?.getAttribute('data-map-idle')==='true'&&m.getAttribute('data-map-tiles-complete')==='true'&&Number(m.getAttribute('data-map-loaded-tiles'))>0;},{},{timeout:45_000});
    const inspect=async()=>{
      await idle();
      const view=await map.evaluate(el=>{const r=el.getBoundingClientRect();return {innerWidth,rect:{x:r.x,y:r.y,width:r.width,height:r.height},background:getComputedStyle(el).backgroundColor,zoom:Number(el.getAttribute('data-map-zoom')),lat:Number(el.getAttribute('data-map-center-lat')),lng:Number(el.getAttribute('data-map-center-lng')),idle:el.getAttribute('data-map-idle'),tilesComplete:el.getAttribute('data-map-tiles-complete'),loadedTiles:Number(el.getAttribute('data-map-loaded-tiles'))};});
      return model.app.evaluate(async({BrowserWindow,nativeImage},view)=>{
        const load=globalThis.__accountsCloudAcceptanceRequire,fs=load('node:fs'),path=load('node:path'),crypto=load('node:crypto');
        const profile=globalThis.__accountsCloudAcceptanceServices.paths.userData;
        const z=Math.round(view.zoom+1),n=2**z,x=Math.floor((view.lng+180)/360*n),phi=view.lat*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(phi))/Math.PI)/2*n);
        const tileFile=path.join(profile,'cache','discovery','tiles','osm',String(z),String(x),`${y}.png`),tile=fs.readFileSync(tileFile),source=nativeImage.createFromBuffer(tile),sourceBytes=source.toBitmap(),sourcePalette=new Map();
        const rgb=(bytes,i)=>[bytes[i+2],bytes[i+1],bytes[i]],key=color=>color.join(',');
        for(let i=0;i<sourceBytes.length;i+=4){if(sourceBytes[i+3]<250)continue;const k=key(rgb(sourceBytes,i));sourcePalette.set(k,(sourcePalette.get(k)||0)+1);}
        const colors=[...sourcePalette.entries()].sort((a,b)=>b[1]-a[1]),mainColors=colors.slice(0,16).map(([color])=>color.split(',').map(Number));
        const image=await BrowserWindow.getAllWindows()[0].capturePage(),size=image.getSize(),bytes=image.toBitmap(),scale=size.width/view.innerWidth,r=view.rect,palette=new Map();
        const background=(view.background.match(/[\d.]+/g)||[]).slice(0,3).map(Number),distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
        let samples=0,sourceMatchedPixels=0,nonBackgroundPixels=0;
        // The center position dot and map controls/legend are excluded. At the
        // wide view the owned polygon is tiny; its tint cannot prove basemap.
        for(let py=Math.ceil((r.y+r.height*.18)*scale);py<(r.y+r.height*.72)*scale;py+=2)for(let px=Math.ceil((r.x+r.width*.1)*scale);px<(r.x+r.width*.75)*scale;px+=2){
          if(Math.hypot(px-(r.x+r.width*.5)*scale,py-(r.y+r.height*.5)*scale)<40*scale)continue;
          const offset=(py*size.width+px)*4,color=rgb(bytes,offset),k=key(color);samples++;palette.set(k,(palette.get(k)||0)+1);
          if(mainColors.some(target=>distance(color,target)<8))sourceMatchedPixels++;
          if(distance(color,background)>8)nonBackgroundPixels++;
        }
        const renderedColors=[...palette.entries()].sort((a,b)=>b[1]-a[1]);
        return {view,sourceTile:{file:tileFile,url:`https://tile.openstreetmap.org/${z}/${x}/${y}.png`,sha256:crypto.createHash('sha256').update(tile).digest('hex'),bytes:tile.length,size:source.getSize(),opaqueColors:sourcePalette.size,dominantColors:colors.slice(0,5)},nativePixels:{samples,sourceMatchedPixels,nonBackgroundPixels,nonDominantPixels:samples-(renderedColors[0]?.[1]||0),uniqueColors:palette.size,dominantColors:renderedColors.slice(0,5)}};
      },view);
    };
    const original=await inspect();save();
    await capture(model,`cloud-garden-map-initial-${model.index?'b':'a'}`,true);
    // The acceptance coordinates are deliberately in an isolated rural QA
    // world. Broaden only the map viewport to separate raster from territory tint.
    for(let count=0;Number(await map.getAttribute('data-map-zoom'))>11.01&&count<7;count++){
      const previous=Number(await map.getAttribute('data-map-zoom'));
      await map.locator('.maplibregl-ctrl-zoom-out').click();
      await model.page.waitForFunction(previous=>Number(document.querySelector('.garden-shared-map .discovery-map')?.getAttribute('data-map-zoom'))<previous-.2,previous);
      await idle();
    }
    const wide=await inspect();
    assert.ok(wide.view.zoom<=11.01);assert.equal(wide.view.idle,'true');assert.equal(wide.view.tilesComplete,'true');
    assert.ok(wide.nativePixels.sourceMatchedPixels>wide.nativePixels.samples*.6,JSON.stringify({reason:'Native map must actually paint the source raster, not merely load it',wide}));
    assert.ok(wide.nativePixels.nonBackgroundPixels>wide.nativePixels.samples*.6);
    assert.ok(wide.sourceTile.opaqueColors>1&&wide.nativePixels.uniqueColors>24&&wide.nativePixels.nonDominantPixels>100,'A textured OSM viewport must show actual native road/terrain pixels');
    assert.ok(Math.abs(wide.view.lat-original.view.lat)<.000001&&Math.abs(wide.view.lng-original.view.lng)<.000001,'Only viewport zoom changed');
    const after=await snapshot(model);assert.deepEqual(after.items,before.items);assert.deepEqual(after.pets,before.pets);assert.deepEqual(after.plots,before.plots);assert.deepEqual(after.territories,before.territories);
    assert.deepEqual((await invoke(model,'discovery','snapshot')).location,locationBefore);
    const result={index:model.index,initial:original,wide,cause:original.sourceTile.opaqueColors===1?'original high-zoom OSM tile itself is a single land color at this synthetic rural coordinate; owned-region fill tints it blue':'original source has multiple colors; all current tiles/idle and composited raster pixels verified',locationState:locationBefore,locationUnchanged:true,worldAndEconomyUnchanged:true};
    evidence.map.clients.push(result);save();
    pass(`cloud-garden-${model.index?'b':'a'}:actual-basemap-painted`,{zoom:wide.view.zoom,sourceTileColors:wide.sourceTile.opaqueColors,nativeColors:wide.nativePixels.uniqueColors,nativeTexturePixels:wide.nativePixels.nonDominantPixels,nativeSourceMatchedPixels:wide.nativePixels.sourceMatchedPixels,samples:wide.nativePixels.samples,originalSourceTileColors:original.sourceTile.opaqueColors});
    await capture(model,`cloud-garden-${model.index?'b':'a'}`,true);
  }
  evidence.map.passed=true;evidence.map.completedAt=new Date().toISOString();
  if(evidence.failure){evidence.resolvedIncidents||=[];evidence.resolvedIncidents.push(evidence.failure);delete evidence.failure;}
  evidence.passed=true;save();
}
