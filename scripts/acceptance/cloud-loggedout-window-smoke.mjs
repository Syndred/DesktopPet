// Actual portable fresh-profile window/single-instance checks. No account registration,
// QA grant, real-user profile, business command or OS preference/startup write.
import { spawn, execFileSync } from 'node:child_process';
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
const cleanEnv=profile=>{const env={...process.env,PET_USER_DATA_DIR:profile};for(const key of Object.keys(env))if(/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key))delete env[key];return env;};
const currentSession=async page=>{const result=await page.evaluate(()=>window.lingjing.invoke('accounts','session',{}));assert.equal(result.ok,true);assert.equal(result.data.currentUser,null);assert.equal(result.data.scenario,null);return result.data;};
let duplicate;
try {
 proof.primary=await verifyPortableDefaultConfig({executable,expectedSource:build.sourceCommit,output,inspect:async({page,main,info,profile})=>{
  await currentSession(page);assert.equal(info.runtime.tray.active,true);
  const targetUrl=page.url();
  const native=()=>main(({BrowserWindow},targetUrl)=>{const matches=BrowserWindow.getAllWindows().filter(win=>win.webContents.getURL()===targetUrl);if(matches.length!==1)throw Error('Expected one exact owned main window');const win=matches[0];return {id:win.id,visible:win.isVisible(),destroyed:win.isDestroyed(),minimized:win.isMinimized()};},targetUrl);
  const before=await native();assert.equal(before.visible,true);
  await page.getByRole('button',{name:'收起到托盘',exact:true}).click();
  const hidden=await pollState(native,row=>!row.visible&&!row.destroyed,{timeoutMs:5000,label:'Actual owned main window did not hide to tray'});assert.equal(page.isClosed(),false);
  proof.checks.push({id:'N04-hide-to-tray',passed:true,before,hidden,rendererVisibility:await page.evaluate(()=>document.visibilityState),physicalTrayClick:false});
  duplicate=spawn(executable,[],{env:cleanEnv(profile),windowsHide:true,stdio:'ignore'});
  const exit=await new Promise((resolveExit,reject)=>{const timer=setTimeout(()=>reject(Error('Duplicate portable process did not exit within 20 seconds')),20000);duplicate.once('error',error=>{clearTimeout(timer);reject(error);});duplicate.once('exit',(code,signal)=>{clearTimeout(timer);resolveExit({code,signal});});});
  assert.equal(exit.code,0);const recalled=await pollState(native,row=>row.visible&&!row.destroyed&&row.id===before.id,{timeoutMs:5000,label:'Same-profile secondary process did not recall original native window'});
  assert.equal(page.context().pages().filter(p=>p.url().includes('/ui/index.html')).length,1);await currentSession(page);
  proof.checks.push({id:'N05-same-profile-secondary-exit-and-primary-recall',passed:true,exit,recalled,mainWindows:1,existingPetWindowCoverage:false});
  const secondaryRoot=join(output,'independent-profile');mkdirSync(secondaryRoot);
  proof.independent=await verifyPortableDefaultConfig({executable,expectedSource:build.sourceCommit,output:secondaryRoot,inspect:async({page:second,profile:secondProfile})=>{
   assert.notEqual(secondProfile,profile);assert.notEqual(second.context().browser(),page.context().browser());
   await currentSession(second);await currentSession(page);assert.equal(page.isClosed(),false);
   assert.equal(second.context().pages().filter(p=>p.url().includes('/ui/index.html')).length,1);
   return {independentProfile:true,loggedOut:true};
  }});
  proof.checks.push({id:'N05-different-fresh-profile-independent-window',passed:true});
  return {sameProfileActivation:true,distinctProfileIsolation:true,loggedOut:true};
 }});
 for(const ordinary of [proof.primary,proof.independent]){
  const db=new(require('better-sqlite3'))(join(ordinary.profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
  try{db.pragma('query_only = ON');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.equal(db.prepare('SELECT count(*) n FROM account_identities').get().n,0);}finally{db.close();}
 }
 proof.checks.push({id:'fresh-profile-databases-integrity-and-zero-accounts',passed:true,profiles:2});proof.passed=true;
}catch(error){proof.passed=false;proof.failure=String(error);process.exitCode=1;}
finally{
 if(duplicate?.exitCode===null&&duplicate.pid)try{execFileSync('taskkill',['/PID',String(duplicate.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}
 proof.completedAt=new Date().toISOString();writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}
