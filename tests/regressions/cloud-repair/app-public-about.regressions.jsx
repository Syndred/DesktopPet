import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import App from '../../../apps/pc-app/ui/src/app/App';
// Only the lazy route registry and animation wrapper are replaced by the runner. App, route resolution,
// authentication gate, navigation, bridge hooks and real About/AppVersion stay real.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root,host,loggedIn,listeners;
const check=(value,message)=>{if(!value)throw Error(message);};
const info={version:'0.1.8',platform:'win32',runtime:{arch:'x64',electron:'44.9.3',node:'24.22.1'},build:{sourceCommit:'fixture-source-commit',sourceDirtyFiles:[]},support:{packaged:true,logsAvailable:false,automaticUpdates:false}};
async function mount(path,signedIn=false,loading=false){loggedIn=signedIn;listeners=new Map();window.location.hash=path;window.lingjing={window:{minimize(){},maximize(){},close(){}},subscribe(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn);},async invoke(feature,command){if(feature==='app'&&command==='info')return {ok:true,data:info};if(feature==='accounts'&&command==='session'){if(loading)return new Promise(()=>{});return {ok:true,data:{currentUser:loggedIn?{id:'fixture-user'}:null}};}throw Error(`Unexpected IPC ${feature}/${command}`);}};host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(createElement(App)));await act(async()=>{await new Promise(resolve=>setTimeout(resolve,180));});}
async function route(path){await act(async()=>{window.location.hash=path;window.dispatchEvent(new HashChangeEvent('hashchange'));await new Promise(resolve=>setTimeout(resolve,180));});await act(async()=>{await new Promise(resolve=>setTimeout(resolve,80));});}
async function clickLink(text){const link=[...host.querySelectorAll('a')].find(x=>x.textContent.includes(text));check(link,`Missing link ${text}`);await act(async()=>{link.click();await new Promise(resolve=>setTimeout(resolve,1));});await route(window.location.hash.slice(1));}
async function cleanup(){await act(async()=>root?.unmount());host?.remove();root=null;}
const has=text=>host.textContent.includes(text);
const cases=[
 ['session loading does not prevent public About from displaying version information',async()=>{await mount('/settings/about',false,true);check(has('关于与本地诊断')&&has('灵境 0.1.8'),'Public About must not depend on authentication readiness');}],
 ['logged-out exact About route reaches real public About instead of auth',async()=>{await mount('/settings/about');check(has('关于与本地诊断'),'Actual App gate swallowed public About route');check(!has('Fixture account gate'),'About must not render account gate');}],
 ['logged-out business and other settings remain gated',async()=>{await mount('/settings');check(has('Fixture account gate'),'Settings was exposed without authentication');await route('/companions');check(has('Fixture account gate')&&!has('Fixture business page'),'Business route bypassed authentication');for(const path of ['/settings/privacy','/settings/ai','/chat','/resources']){await route(path);check(has('Fixture account gate'),path+' bypassed authentication');}}],
 ['unknown paths and About-like prefixes do not bypass authentication',async()=>{await mount('/settings/about/private');check(has('Fixture account gate'),'Prefix match improperly exposed an unknown route');await route('/unknown');check(has('Fixture account gate'),'Unknown route bypassed authentication');}],
 ['signed-in business routing and primary navigation remain available',async()=>{await mount('/companions',true);check(has('Fixture business page')&&!has('Fixture account gate'),'Signed-in business route was changed');check(host.querySelector('[aria-label="主导航"]'),'Signed-in navigation disappeared');}],
 ['public version link reaches About and return-to-settings restores auth gate',async()=>{await mount('/account');check(has('Fixture account gate'),'Auth entry missing');await clickLink('关于与诊断');check(has('关于与本地诊断'),'Version About link is not reachable through App');await clickLink('返回设置');check(has('Fixture account gate')&&!has('关于与本地诊断'),'Returning to protected settings must gate again');}]
];
window.runHookRegressions=async()=>{const result=[];for(const [name,run]of cases){try{await run();result.push({name,passed:true});}catch(error){result.push({name,passed:false,error:error.stack||String(error),causes:error.errors?.map(e=>e.stack||String(e))});}finally{await cleanup();}}return result;};
