// Focused D01/P03 on the audited portable SFX and a fresh offline QA profile.
// UI limit/volume edits; fixture adoption uses normal product IPC. No OS volume changes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.ok(process.platform==='win32'&&process.env.GITHUB_ACTIONS==='true');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/foundation/cloud-engineering/desktopPreferences',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-desktopPreferences-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_desktop_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'D01/P03: actual audited Windows SFX, fresh offline QA pets. Real UI display limits and app volume; native window/renderer policy readback. No OS audio changes, physical loudness or cloud claims.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner;const pids=new Set(),pets=[];const redact=value=>String(value).split(secret).join('[redacted]');const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__desktopPreferencesOfflineBlocked).catch(()=>({observation:'unavailable'})));await model.stop();}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'desktopPreferences-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__desktopPreferencesOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__desktopPreferencesOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const transport=process.getBuiltinModule(name);transport.connect=()=>denied('node');if(transport.createConnection)transport.createConnection=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__desktopPreferencesOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__desktopPreferencesOfflineBlocked.chromium++;callback({cancel:true});});
 });}
async function step(id,coverage,fn){const row={id,coverage,status:'running',startedAt:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='passed-original-scope-offline';}catch(error){row.status='failed';row.error=redact(error);try{await model.page.screenshot({path:join(output,id+'-failed.png'),timeout:10000});}catch{}throw error;}finally{row.completedAt=new Date().toISOString();save();}}
async function route(path){await model.page.evaluate(path=>{location.hash='#'+path;},path);await model.page.waitForFunction(path=>location.hash==='#'+path,path);const current=model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor();await current.locator('h1').first().waitFor();assert.equal(await current.getByText('页面暂时遇到问题',{exact:true}).count(),0);}
async function register(account,password,name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill(name);await page.locator('input[autocomplete="username"]').fill(account);await page.getByLabel('密码',{exact:true}).fill(password);await page.getByLabel('确认密码',{exact:true}).fill(password);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assert.equal(session.dataMode,'simulated');assert.ok(session.currentUser.id.startsWith(`qa:${runId}:`));return session.currentUser.id;}

async function detail(pet){await route('/companions/'+pet.petId);await model.page.getByRole('tab',{name:'外观',exact:true}).click();await model.page.locator('.cp-desktop-controls').waitFor();}
async function visible(pet,wanted){await detail(pet);const toggle=model.page.locator('.cp-desktop-controls').getByRole('switch');await pollState(()=>toggle.isEnabled(),Boolean);if(await toggle.getAttribute('aria-checked')!==String(wanted))await toggle.click();await pollState(()=>model.call('companions','get',{petId:pet.petId}),p=>p.desktop.visible===wanted);await pollState(()=>toggle.isEnabled(),Boolean);}
const inventory=()=>model.main(({BrowserWindow})=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('/desktop.html')).map(w=>({id:w.id,url:w.webContents.getURL(),visible:w.isVisible(),bounds:w.getBounds()})));
async function desktopPage(petId){return pollState(()=>model.pages().find(p=>p.url().endsWith('/desktop/'+encodeURIComponent(petId))),Boolean,{label:'Expected owned pet renderer'});}
async function windows(expected){
 const rows=await pollState(inventory,rows=>rows.filter(r=>r.visible).length===expected,{label:'Actual companion count mismatch'}),shown=rows.filter(r=>r.visible),ids=[];
 for(const row of shown){const pet=pets.find(p=>row.url.endsWith('/desktop/'+encodeURIComponent(p.petId)));assert.ok(pet,'Unknown pet window');ids.push(pet.petId);const page=await desktopPage(pet.petId);await page.locator('.resource-stage[data-status="ready"] canvas').waitFor();const dom=await page.locator('.cp-desktop-surface').evaluate(el=>({petId:el.dataset.petId,resourceId:el.dataset.resourceId,visibleText:el.innerText.trim(),canvasCount:el.querySelectorAll('canvas').length}));assert.equal(dom.petId,pet.petId);assert.equal(dom.resourceId,pet.resource.resourceId);assert.equal(dom.visibleText,'','Desktop should show no visible pet name/number caption');assert.equal(dom.canvasCount,1);row.petId=pet.petId;row.dom=dom;}
 assert.equal(new Set(ids).size,ids.length,'Duplicate pet instances');return shown;
}
async function settings(){await route('/settings');await model.page.getByRole('slider',{name:'音量',exact:true}).waitFor();await pollState(()=>model.page.getByRole('button',{name:'保存设置',exact:true}).isEnabled(),Boolean);}
async function saveSettings(limit,volume){await model.page.getByRole('button',{name:'保存设置',exact:true}).click();await pollState(()=>model.call('accounts','settingsGet'),s=>s.document.desktop.companionLimit===limit&&(volume===undefined||s.document.desktop.volume===volume));await pollState(()=>model.page.getByRole('button',{name:'保存设置',exact:true}).isEnabled(),Boolean);}
async function limit(value){await settings();await model.page.getByRole('combobox',{name:'桌面陪伴数量',exact:true}).click();assert.deepEqual((await model.page.getByRole('option').allTextContents()).map(s=>s.trim()),['1','2','3','4']);await model.page.getByRole('option',{name:String(value),exact:true}).click();await saveSettings(value);const snapshot=await model.call('accounts','settingsGet');assert.equal(snapshot.host.companionLimit,value);return windows(Math.min(value,pets.filter(p=>p.enabled).length));}
async function observePolicy(page){await page.evaluate(()=>{window.__desktopPreferencesPolicies=[];if(!window.__desktopPreferencesOff)window.__desktopPreferencesOff=window.lingjing.subscribe('accounts:behavior',value=>{window.__desktopPreferencesPolicies.push({ownerAccountId:value.ownerAccountId,volume:value.volume,companionLimit:value.companionLimit});if(window.__desktopPreferencesPolicies.length>12)window.__desktopPreferencesPolicies.shift();});});}
async function volume(value){
 await settings();const shown=await windows(4),pages=await Promise.all(shown.map(w=>desktopPage(w.petId)));for(const page of pages)await observePolicy(page);
 const slider=model.page.getByRole('slider',{name:'音量',exact:true});assert.equal(await slider.getAttribute('aria-valuemin'),'0');assert.equal(await slider.getAttribute('aria-valuemax'),'100');await slider.focus();await slider.press(value===100?'End':'Home');await pollState(()=>slider.getAttribute('aria-valuenow'),s=>Number(s)===(value===100?100:0),{label:'Volume Home/End UI did not settle'});if(value!==100)for(let i=0;i<value;i++){await slider.press('ArrowRight');await pollState(()=>slider.getAttribute('aria-valuenow'),s=>Number(s)===i+1);}
 assert.equal(Number(await slider.getAttribute('aria-valuenow')),value);await saveSettings(4,value);
 const policies=[];for(let i=0;i<pages.length;i++){const events=await pollState(()=>pages[i].evaluate(()=>window.__desktopPreferencesPolicies),rows=>rows.some(r=>r.ownerAccountId===owner&&r.volume===value&&r.companionLimit===4),{label:'Actual desktop did not receive saved app volume policy'});policies.push({petId:shown[i].petId,event:events.findLast(r=>r.ownerAccountId===owner&&r.volume===value&&r.companionLimit===4)});}
 return {volume:value,policies,windows:await windows(4),scope:'Application value and actual renderer policy delivery only; no OS audio or acoustic measurement'};
}
try{
 await launch();owner=await register(account,secret,'桌面偏好验收');
 // The known shipped 2D template is used five times; identities remain independent.
 for(let n=0;n<5;n++){const result=await model.call('companions','adopt',{templateId:'animal-wood-deer',name:`偏好验收${n+1}`,showOnDesktop:false,actionId:randomUUID()});pets.push({...result.pet,enabled:false});}
 proof.fixture={owner,petIds:pets.map(p=>p.petId),preparation:'normal product IPC, no SQL injection'};const initial=(await model.call('accounts','settingsGet')).document;
 await step('D01','1–4 native pet windows, overflow, hide/re-show and no visible name/number labels',async()=>{
  await limit(4);const samples=[];for(const pet of pets){await visible(pet,true);pet.enabled=true;samples.push(await windows(Math.min(samples.length+1,4)));}
  const before=await windows(4),hidden=pets.find(p=>p.petId===before[0].petId);await visible(hidden,false);hidden.enabled=false;const afterHide=await windows(4);assert.ok(!afterHide.some(w=>w.petId===hidden.petId));await visible(hidden,true);hidden.enabled=true;const afterShow=await windows(4);
  const limits=[];for(const n of [1,2,3,4])limits.push({limit:n,windows:await limit(n)});
  assert.equal((await model.call('companions','list')).pets.length,5);return {samples,afterHide,afterShow,limits,visibleNamesAndNumbers:false,ariaAccessibilityNamesNotHidden:true};
 });
 await step('P03','App volume 0/100/37 UI/save + actual per-pet policy; native limit 1–4 already verified in same fixture',async()=>{const results=[];for(const n of [0,100,37])results.push(await volume(n));const final=(await model.call('accounts','settingsGet')).document;const strip=d=>{const x=structuredClone(d);delete x.desktop.volume;delete x.desktop.companionLimit;return x;};assert.deepEqual(strip(final),strip(initial),'Unrelated settings changed');return {results,unrelatedSettingsUnchanged:true,noSystemVolumeMutation:true};});
 proof.passed=true;
}catch(error){proof.error=redact(error);proof.passed=false;process.exitCode=1;}
finally{
 try{if(model)for(const p of model.pages())await p.evaluate(()=>{window.__desktopPreferencesOff?.();delete window.__desktopPreferencesOff;}).catch(()=>{});await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}
 try{assert.equal(dirname(profile),realpathSync.native(tmpdir()));assert.ok(basename(profile).startsWith('lingjing-desktopPreferences-'));assert.ok(proof.ownedProcessStopped);rmSync(profile,{recursive:true,force:true});proof.temporaryProfileRemoved=true;}catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,error:proof.error}));
}
