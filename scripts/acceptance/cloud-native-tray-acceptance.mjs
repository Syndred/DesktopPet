// Short actual Windows SFX QA-startup gate before long offline acceptance.
// No registration, login, economic commands, fixture pets or production account.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true','Disposable GitHub Windows runner only');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/qa/native-tray',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-qa-tray-'))),runId=randomUUID();
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const offlineEnvironment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(offlineEnvironment,{LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'N04 close to tray, actual owned tray icon/context-menu open and exit; fresh offline QA portable SFX, no login. No direct callbacks or internal menu popup.',sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false;const pids=new Set();const redact=value=>String(value);const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked=(proof.offlineBlocked||[]);proof.offlineBlocked.push(await model.main(()=>globalThis.__qaPreflightOfflineBlocked).catch(()=>({observation:'unavailable'})));await model.stop();}if(uncertain)throw Error('Launch outcome/PID unknown; keep temporary profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; keep temporary profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'qaPreflight-qa',environment:offlineEnvironment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal((await model.call('accounts','session')).scenario?.runId,runId);await model.main(({session})=>{
  globalThis.__qaPreflightOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};
  const denied=kind=>{globalThis.__qaPreflightOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};
  const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
  for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
  for(const name of['node:net','node:tls']){const mod=process.getBuiltinModule(name);for(const method of['connect','createConnection'])if(typeof mod[method]==='function')mod[method]=()=>denied('node');}
  process.getBuiltinModule('node:http2').connect=()=>denied('node');
  const fetchOriginal=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__qaPreflightOfflineBlocked.fetch++;return Promise.reject(Object.assign(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'),{code:'OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'}));}return fetchOriginal.call(this,input,...args);};
  if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
  session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__qaPreflightOfflineBlocked.chromium++;callback({cancel:true});});
 });}

const native=payload=>{const stdout=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',resolve('scripts/acceptance/native-owned-tray.ps1')],{input:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:20000});return stdout.trim()?JSON.parse(stdout.trim()):null;};
let cursor,identity;
async function trayAction(action){
 const getBounds=async()=>{const info=await model.call('app','info');assert.equal(info.runtime.tray.active,true);return model.main(({screen},bounds)=>screen.dipToScreenRect(null,bounds),info.runtime.tray.bounds);};
 const args={...identity,action,allowOverflow:true,trayBounds:await getBounds(),screenshot:join(output,`${action}-owned-menu.png`)};
 let result=native(args);proof.actions.push(result);save();assert.equal(result.passed,true,result.error);
 if(result.needsFreshTrayBounds){await new Promise(r=>setTimeout(r,250));result=native({...args,allowOverflow:false,trayBounds:await getBounds()});proof.actions.push(result);save();assert.equal(result.passed,true,result.error);}
 assert.ok(result.icon&&result.menu,'Actual icon and menu input receipts required');return result;
}
try{
 proof.apiSelftest=native({action:'selftest'});assert.equal(proof.apiSelftest.passed,true);assert.equal(proof.apiSelftest.osInputPerformed,false);save();
 await launch();assert.equal((await model.call('accounts','session')).currentUser,null);
 cursor=native({action:'read'});proof.actions=[];
 identity=await model.main(({BrowserWindow},url)=>{const rows=BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL()===url);if(rows.length!==1)throw Error('Exact main window required');const w=rows[0],b=w.getNativeWindowHandle();return {id:w.id,processId:process.pid,windowHandle:(b.length===8?b.readBigInt64LE():BigInt(b.readInt32LE())).toString()};},model.page.url());
 const state=()=>model.main(({BrowserWindow},id)=>{const w=BrowserWindow.fromId(id);return {visible:w?.isVisible(),destroyed:!w||w.isDestroyed()};},identity.id);
 await model.page.getByRole('button',{name:'收起到托盘',exact:true}).click();
 proof.hidden=await pollState(state,x=>!x.visible&&!x.destroyed,{timeoutMs:5000,label:'Close UI did not hide owned main'});
 const opened=await trayAction('open');proof.reopened=await pollState(state,x=>x.visible&&!x.destroyed,{timeoutMs:5000,label:'Physical tray menu did not reopen main'});
 await model.page.screenshot({path:join(output,'reopened-main.png'),timeout:10000});
 const exited=await trayAction('exit');assert.equal(exited.explorerPid,opened.explorerPid);
 // The Node inspector can hold process exit until its debugger disconnects.
 // Detach only this driver's WS; no app quit command, browser close or kill.
 proof.inspectorDetach=await model.detachInspector();
 proof.exitPidObservations=[];
 proof.exitedNaturally=await pollState(()=>{const rows=[...pids].map(pid=>({pid,alive:alive(pid)}));proof.exitPidObservations.push({at:new Date().toISOString(),rows});return rows;},rows=>rows.every(x=>!x.alive),{timeoutMs:10000,intervalMs:500,label:'Physical Exit menu did not stop owned app naturally after inspector detach'});
 assert.equal(alive(exited.explorerPid),true);proof.explorerPreserved=true;proof.passed=true;
}catch(error){proof.error=String(error);proof.passed=false;process.exitCode=1;}
finally{
 try{native({action:'release'});proof.independentMouseRelease=true;}catch(error){proof.releaseError=String(error);proof.passed=false;process.exitCode=1;}
 if(cursor)try{native({action:'restore',point:cursor});proof.cursorRestored=true;}catch(error){proof.cursorRestoreError=String(error);proof.passed=false;process.exitCode=1;}
 try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=String(error);proof.passed=false;process.exitCode=1;}
 try{if(!proof.ownedProcessStopped)throw Error('Temporary profile retained: PID exit unconfirmed');assert.equal(dirname(resolve(profile)),resolve(realpathSync.native(tmpdir())));assert.ok(basename(profile).startsWith('lingjing-qa-tray-'));rmSync(profile,{recursive:true,force:true});proof.profileRemoved=true;}catch(error){proof.cleanupError=String(error);proof.passed=false;process.exitCode=1;}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify(proof,null,2));
}
