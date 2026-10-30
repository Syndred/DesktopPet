import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const { JSDOM } = require(process.argv.find(a => a.startsWith('--jsdom='))?.slice(8) || 'jsdom');
const mockMap = `export const setWorkerUrl=()=>{},addProtocol=()=>{};
export class Map { constructor(options){this.events={};this.container=options.container;this.container.append(document.createElement('canvas'));if(window.mapMode==='constructor')throw Error('WebGL2 unavailable');window.maps.push(this);} addControl(){if(window.mapMode==='control')throw Error('control');} on(name,fn){if(window.mapMode==='listener')throw Error('listener');this.events[name]=fn;} remove(){window.removed++;this.container.replaceChildren();} getSource(){return {setData(){}};} getCenter(){return {lat:30,lng:120,distanceTo:()=>0};} resize(){} }
export class Marker{setLngLat(){return this;}addTo(){return this;}remove(){}}
export class LngLat{};export class NavigationControl{};export class AttributionControl{};`;
const bundle = await build({ entryPoints:[path.join(root,'apps/pc-app/ui/tests/nearby-map-failure.regressions.jsx')], bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:path.join(root,'apps/pc-app/ui/tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'map-test-boundaries',setup(build){
  build.onResolve({filter:/^(maplibre-gl|maplibre-gl\/.*)$/},args=>({path:args.path,namespace:'map-mock'}));
  build.onLoad({filter:/.*/,namespace:'map-mock'},args=>({contents:args.path==='maplibre-gl'?mockMap:args.path.includes('?worker')?'export default "local-worker";':'',loader:'js'}));
  build.onResolve({filter:/^\.\/ResourcePortrait$/},()=>({path:'portrait',namespace:'stub'}));
  build.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const ResourcePortrait=()=>null;',loader:'js'}));
}}] });
const dom = new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost',pretendToBeVisual:true,runScripts:'outside-only'});
dom.window.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => dom.window.setTimeout(() => this.port1.onmessage?.(), 0) }; } };
dom.window.ResizeObserver=class{observe(){if(dom.window.mapMode==='observer')throw Error('observe');}disconnect(){dom.window.disconnected++;}};
try { dom.window.eval(bundle.outputFiles[0].text); console.log(JSON.stringify(await dom.window.runMapTests())); } finally { dom.window.close(); }
