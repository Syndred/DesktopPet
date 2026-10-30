import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const require=createRequire(path.join(root,'package.json'));
const {build}=require('esbuild');
const {JSDOM}=require(process.argv.find(a=>a.startsWith('--jsdom='))?.slice(8)||'jsdom');
const baseline=process.argv.find(a=>a.startsWith('--baseline-hook='))?.slice(16);
if(baseline&&!/^[a-f0-9]{7,40}$/.test(baseline))throw Error('Invalid baseline revision');
const plugins=baseline?[{name:'baseline-hook',setup(build){build.onLoad({filter:/features[\\/]discovery[\\/]use-discovery\.ts$/},()=>({contents:execFileSync('git',['show',`${baseline}:apps/pc-app/ui/src/features/discovery/use-discovery.ts`],{cwd:root,encoding:'utf8'}),loader:'ts'}));}}]:[];
const bundle=await build({entryPoints:[path.join(root,'apps/pc-app/ui/tests/discovery-recovery.regressions.jsx')],plugins,bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',tsconfig:path.join(root,'apps/pc-app/ui/tsconfig.json'),define:{'process.env.NODE_ENV':'"development"'}});
const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost/#/discovery',pretendToBeVisual:true,runScripts:'outside-only'});
dom.window.MessageChannel=class{constructor(){this.port1={onmessage:null};this.port2={postMessage:()=>dom.window.setTimeout(()=>this.port1.onmessage?.(),0)};}};
try{dom.window.eval(bundle.outputFiles[0].text);console.log(JSON.stringify(await dom.window.runRecoveryTests()));}finally{dom.window.close();}
