// Actual portable fresh-profile window/single-instance checks. No account registration,
// QA grant, real-user profile, business command or OS preference/startup write.
import { spawn, execFile, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { verifyPortableDefaultConfig } from './portable-config-smoke.mjs';
import { pollState } from './poll-state.mjs';
const require=createRequire(import.meta.url), config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json'));
const version=JSON.parse(readFileSync('package.json')).version, build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(config.directories.output,`Lingjing-${version}-portable-x64.exe`);
const output=resolve('artifacts/foundation/cloud-engineering/loggedout-windows',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const proof={scope:'Fresh logged-out actual portable Windows. N04 hide and second-instance activation partial; N05 same/different profile empty-account subset. No physical tray click or existing pets.',sourceCommit:build.sourceCommit,startedAt:new Date().toISOString(),checks:[]};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const stage=name=>{proof.stages ||= [];proof.stages.push({at:new Date().toISOString(),name});save();console.log(JSON.stringify({stage:name}));};
// Read only this harness process's descendants. Never inspect command lines,
// credentials, other applications, or use these observations as an ownership bypass.
let observationPending=null;
async function observeOwnedLaunch(){
 if(process.platform!=='win32')return;
 const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$all=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,ExecutablePath);$ids=@(${process.pid});$owned=@();for($n=0;$n -lt 8;$n++){$next=@($all|Where-Object {$ids -contains [int]$_.ParentProcessId -and $ids -notcontains [int]$_.ProcessId});if($next.Count -eq 0){break};foreach($p in $next){$ids += [int]$p.ProcessId;$owned += $p}};$rows=@($owned|Where-Object {$_.Name -notmatch '^(powershell|pwsh|conhost)'}|ForEach-Object {@{pid=[int]$_.ProcessId;parentPid=[int]$_.ParentProcessId;name=$_.Name;path=$_.ExecutablePath}});$ports=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue|Where-Object {$ids -contains [int]$_.OwningProcess -and ($_.LocalAddress -eq '127.0.0.1' -or $_.LocalAddress -eq '::1')}|ForEach-Object {@{pid=[int]$_.OwningProcess;port=[int]$_.LocalPort;address=$_.LocalAddress}});@{processes=$rows;loopbackListeners=$ports}|ConvertTo-Json -Depth 4 -Compress`;
 try{const stdout=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:4000},(error,stdout)=>error?reject(error):resolve(stdout)));const value=JSON.parse(stdout.replace(/^\uFEFF/,''));proof.launchObservations ||= [];proof.launchObservations.push({at:new Date().toISOString(),...value});proof.launchObservations=proof.launchObservations.slice(-16);save();}catch(error){proof.observationError=error.code||error.name;save();}
}
const cleanEnv=profile=>{const env={...process.env,PET_USER_DATA_DIR:profile};for(const key of Object.keys(env))if(/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key))delete env[key];return env;};
const currentSession=async page=>{const result=await page.evaluate(()=>window.lingjing.invoke('accounts','session',{}));assert.equal(result.ok,true);assert.equal(result.data.currentUser,null);assert.equal(result.data.scenario,null);return result.data;};
let duplicate;
const observationTimer=setInterval(()=>{if(!observationPending)observationPending=observeOwnedLaunch().finally(()=>{observationPending=null;});},5000);
try {
 stage('primary-launch-start');
 proof.primary=await verifyPortableDefaultConfig({executable,expectedSource:build.sourceCommit,output,inspect:async({page,main,info,profile})=>{
  stage('primary-inspector-and-renderer-ready');
  await currentSession(page);assert.equal(info.runtime.tray.active,true);
  const targetUrl=page.url();
  const native=()=>main(({BrowserWindow},targetUrl)=>{const matches=BrowserWindow.getAllWindows().filter(win=>win.webContents.getURL()===targetUrl);if(matches.length!==1)throw Error('Expected one exact owned main window');const win=matches[0];return {id:win.id,visible:win.isVisible(),destroyed:win.isDestroyed(),minimized:win.isMinimized()};},targetUrl);
  const before=await native();assert.equal(before.visible,true);
  await page.getByRole('button',{name:'收起到托盘',exact:true}).click();
  const hidden=await pollState(native,row=>!row.visible&&!row.destroyed,{timeoutMs:5000,label:'Actual owned main window did not hide to tray'});assert.equal(page.isClosed(),false);
  proof.checks.push({id:'N04-hide-to-tray',passed:true,before,hidden,rendererVisibility:await page.evaluate(()=>document.visibilityState),physicalTrayClick:false});save();
  await main(({app})=>{globalThis.__lifecycleSecondInstance=[];globalThis.__lifecycleSecondInstanceListener=()=>globalThis.__lifecycleSecondInstance.push({at:Date.now()});app.on('second-instance',globalThis.__lifecycleSecondInstanceListener);return true;});
  proof.duplicateBudget={sfxLaunchAndExitMs:60000,reason:'The observed primary SFX needed 24.7 seconds before inspector/renderer; NSIS extracts before launching Electron. This is the same 60s SFX readiness ceiling as the driver, not a relaxed singleton result.'};
  stage('same-profile-duplicate-start');
  duplicate=spawn(executable,[],{env:cleanEnv(profile),windowsHide:true,stdio:'ignore'});
  const exit=await new Promise((resolveExit,reject)=>{const timer=setTimeout(()=>reject(Error('Duplicate SFX extraction/launch/exit did not complete within the existing 60-second SFX budget')),60000);duplicate.once('error',error=>{clearTimeout(timer);reject(error);});duplicate.once('exit',(code,signal)=>{clearTimeout(timer);resolveExit({code,signal});});});
  assert.equal(exit.code,0);const secondInstance=await main(({app})=>{app.removeListener('second-instance',globalThis.__lifecycleSecondInstanceListener);return globalThis.__lifecycleSecondInstance;});assert.equal(secondInstance.length,1,'Production app must actually receive exactly one second-instance event');const recalled=await pollState(native,row=>row.visible&&!row.destroyed&&row.id===before.id,{timeoutMs:5000,label:'Same-profile secondary process did not recall original native window'});
  assert.equal(page.context().pages().filter(p=>p.url().includes('/ui/index.html')).length,1);await currentSession(page);
  proof.checks.push({id:'N05-same-profile-secondary-exit-and-primary-recall',passed:true,exit,recalled,secondInstance,mainWindows:1,existingPetWindowCoverage:false});save();
  stage('same-profile-duplicate-complete');
  const secondaryRoot=join(output,'independent-profile');mkdirSync(secondaryRoot);
  stage('independent-profile-launch-start');
  proof.independent=await verifyPortableDefaultConfig({executable,expectedSource:build.sourceCommit,output:secondaryRoot,inspect:async({page:second,profile:secondProfile})=>{
   stage('independent-profile-inspector-and-renderer-ready');
   assert.notEqual(secondProfile,profile);assert.notEqual(second.context().browser(),page.context().browser());
   await currentSession(second);await currentSession(page);assert.equal(page.isClosed(),false);
   assert.equal(second.context().pages().filter(p=>p.url().includes('/ui/index.html')).length,1);
   return {independentProfile:true,loggedOut:true};
  }});
  proof.checks.push({id:'N05-different-fresh-profile-independent-window',passed:true});save();
  return {sameProfileActivation:true,distinctProfileIsolation:true,loggedOut:true};
 }});
 for(const ordinary of [proof.primary,proof.independent]){
  const db=new(require('better-sqlite3'))(join(ordinary.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
  try{db.pragma('query_only = ON');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.equal(db.prepare('SELECT count(*) n FROM account_identities').get().n,0);}finally{db.close();}
 }
 proof.checks.push({id:'fresh-profile-databases-integrity-and-zero-accounts',passed:true,profiles:2});proof.passed=true;save();
}catch(error){proof.passed=false;proof.failure=String(error);process.exitCode=1;}
finally{
 clearInterval(observationTimer);
 if(observationPending)await observationPending;
 if(duplicate?.exitCode===null&&duplicate.pid)try{execFileSync('taskkill',['/PID',String(duplicate.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
 proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify(proof,null,2));
}
