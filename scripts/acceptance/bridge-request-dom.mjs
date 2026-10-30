// Engineering-only real React/JSDOM with controlled IPC; no native or cloud claims.
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),argument=process.argv.find(a=>a.startsWith('--jsdom='))?.slice(8);
const {JSDOM}=require(argument||'jsdom');
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/'});
for(const key of ['window','document','HTMLElement','Element','Node','MutationObserver','Event'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
const output=resolve('artifacts/foundation/cloud-engineering/bridgeRequestDom');mkdirSync(output,{recursive:true});const bundle=join(output,'tests.mjs');
await build({entryPoints:['apps/pc-app/ui/tests/bridge-request.regressions.jsx'],outfile:bundle,bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic'});
try{const {runTests}=await import(pathToFileURL(bundle).href);const checks=await runTests();const proof={scope:'Real React useFeatureRequest with synthetic in-memory IPC; no native/cloud/account activity',passed:checks.length===6&&checks.every(c=>c.passed),checks};writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));if(!proof.passed)process.exitCode=1;}finally{dom.window.close();}
