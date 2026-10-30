// Engineering-only real React/JSDOM with controlled IPC; no native or cloud claims.
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),argument=process.argv.find(a=>a.startsWith('--jsdom='))?.slice(8);
const {JSDOM}=require(argument||'jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/',pretendToBeVisual:true});
for(const key of ['window','document','HTMLElement','HTMLFormElement','HTMLInputElement','HTMLSelectElement','HTMLOptionElement','DocumentFragment','Element','Node','MutationObserver','Event','MouseEvent','CustomEvent','getComputedStyle'])globalThis[key]=key==='getComputedStyle'?dom.window.getComputedStyle.bind(dom.window):dom.window[key];
globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const output=resolve('artifacts/foundation/cloud-engineering/settingsReadDom');mkdirSync(output,{recursive:true});const bundle=join(output,'tests.mjs');
await build({entryPoints:['apps/pc-app/ui/tests/settings-read.regressions.jsx'],outfile:bundle,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',loader:{'.css':'empty'}});
try{const {runTests}=await import(pathToFileURL(bundle).href);const checks=await runTests();const proof={scope:'Real SettingsPage and session hook with synthetic controlled IPC; no native/cloud/account activity',passed:checks.length===5&&checks.every(c=>c.passed),checks};writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;}finally{dom.window.close();}
