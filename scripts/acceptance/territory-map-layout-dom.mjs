// Real CSS computed-style contract, not a browser/native layout pass.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const dependency=process.argv.find(a=>a.startsWith('--jsdom='))?.slice(8);
assert.ok(dependency,'Use the pinned isolated discovery-dom-deps JSDOM');
const {JSDOM}=require(dependency);
const garden=readFileSync('apps/pc-app/ui/src/features/garden/garden.css','utf8');
const map=readFileSync('node_modules/maplibre-gl/dist/maplibre-gl.css','utf8');
const dom=new JSDOM('<div class="garden-feature"><div class="garden-map garden-shared-map"><div class="maplibregl-ctrl-top-right"><div class="maplibregl-ctrl maplibregl-ctrl-group"><button class="maplibregl-ctrl-zoom-in">+</button></div></div><button class="garden-map-locate">查看演练领地</button></div></div>');
try{
 const style=dom.window.document.createElement('style');style.textContent=map+'\n'+garden;dom.window.document.head.append(style);
 const computed=selector=>dom.window.getComputedStyle(dom.window.document.querySelector(selector));
 const locate=computed('.garden-map-locate'),root=computed('.maplibregl-ctrl-top-right'),group=computed('.maplibregl-ctrl-group'),zoom=computed('.maplibregl-ctrl-zoom-in');
 assert.equal(locate.position,'absolute');assert.equal(root.position,'absolute');assert.equal(root.right,'0px');assert.equal(locate.top,'12px');assert.equal(locate.right,'56px');
 const controlWidth=parseFloat(zoom.width),rightMargin=parseFloat(group.marginRight),locateRight=parseFloat(locate.right);
 assert.equal(controlWidth,29);assert.equal(rightMargin,10);
 // Derived from the actual pinned MapLibre CSS, irrespective of map width.
 const gap=locateRight-(controlWidth+rightMargin);
 assert.ok(gap>=16,'Location control must leave the full zoom column uncovered');
 assert.ok(12-(controlWidth+rightMargin)<0,'Old right12 layout must be detected as overlapping');
 for(const mapWidth of [320,480,640])assert.ok(mapWidth-locateRight>200,'Keep usable horizontal space at compact map sizes');
 console.log(JSON.stringify({passed:true,scope:'Computed real stylesheet/derived horizontal separation; native center hit remains required',zoomWidth:controlWidth,rightMargin,gap}));
}finally{dom.window.close();}
