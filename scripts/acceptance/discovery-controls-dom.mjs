// Engineering-only real React/JSDOM checks; not native acceptance or production clock injection.
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),argument=process.argv.find(a=>a.startsWith('--jsdom='))?.slice(8);
const {JSDOM}=require(argument||'jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/#/discovery'});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','Event','MouseEvent','CustomEvent','getComputedStyle'])globalThis[key]=key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
const output=resolve('artifacts/foundation/cloud-engineering/discoveryControlsDom');mkdirSync(output,{recursive:true});const bundle=join(output,'tests.mjs');
await build({entryPoints:['apps/pc-app/ui/tests/discovery-controls.regressions.jsx'],outfile:bundle,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'non-business-rendering-boundaries',setup(b){b.onResolve({filter:/^\.\/NearbyMap$|^\.\/ResourcePortrait$|components\/motion$/},args=>({path:args.path,namespace:'render-stub'}));b.onLoad({filter:/.*/,namespace:'render-stub'},args=>({contents:args.path.endsWith('NearbyMap')?'export const NearbyMap=()=>null':args.path.endsWith('ResourcePortrait')?'export const ResourcePortrait=()=>null':'export const motionTokens={duration:0,exit:0};export const AnimatedList=({children})=>children;',loader:'jsx'}));}}]});
try{const {runTests}=await import(pathToFileURL(bundle).href);const checks=await runTests();const proof={scope:'Real discovery hooks/controls DOM with controlled IPC, time and non-business rendering boundaries; not native/GPS/cloud',passed:checks.length===10&&checks.every(c=>c.passed),checks};writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;}finally{dom.window.close();}
