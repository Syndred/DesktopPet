// P09 default-profile readback only. Fresh GitHub Windows runner, real ordinary SFX.
// No profile override, login, registration, registry mutation, or reboot.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import WebSocket from 'ws';
import { chromium } from 'playwright';
const require = createRequire(import.meta.url);
assert.ok(process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true', 'Ephemeral GitHub Windows only');
const config = JSON.parse(readFileSync('scripts/release/electron-builder.pc.json'));
const version = JSON.parse(readFileSync('package.json')).version;
const executable = resolve(config.directories.output, `Lingjing-${version}-portable-x64.exe`);
const build = JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const harnessCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const expectedSource=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)||process.env.PACKAGE_SOURCE||harnessCommit;
assert.equal(build.sourceCommit,expectedSource);
if(expectedSource!==harnessCommit){
 const reuse=JSON.parse(readFileSync('artifacts/qa/native-continuation/package-reuse.json'));
 assert.equal(reuse.harnessCommit,harnessCommit);assert.equal(reuse.packageSourceCommit,expectedSource);
 assert.equal(reuse.productPathsUnchanged,true);assert.equal(reuse.auditReceiptVerified,true);assert.equal(reuse.runtimeClosureVerified,true);
 assert.equal(reuse.executableSha256,createHash('sha256').update(readFileSync(executable)).digest('hex'));
}
assert.deepEqual(build.sourceDirtyFiles, []); assert.ok(existsSync(executable));
const output = resolve('artifacts/foundation/cloud-engineering/default-profile', `run-${Date.now()}`); mkdirSync(output, { recursive: true });
const proof = { scope: 'P09 ordinary actual SFX default profile readback; no account or OS startup mutation', sourceCommit: build.sourceCommit, executable, startedAt: new Date().toISOString(), stages: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const stage = name => { proof.stages.push({ name, at: new Date().toISOString() }); save(); console.log(name); };
const keys = new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432']);
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => keys.has(key.toUpperCase())));
const ps = source => JSON.parse(execFileSync('powershell.exe', ['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+source, 'utf16le').toString('base64')], {encoding:'utf8',windowsHide:true,timeout:10000}).replace(/^\uFEFF/,''));
async function port() { const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p; }
async function poll(read, accept, label) { for(let i=0;i<100;i++){const v=await read();if(accept(v))return v;await new Promise(r=>setTimeout(r,300));}throw Error(label); }
let child, runtimePid, socket, browser; let sequence=0;const pending=new Map();
async function evaluate(expression) { const id=++sequence;const response=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('Owned inspector timeout'));},10000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});if(response.exceptionDetails)throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);return response.result?.value; }
try {
  // Electron appData, before app.ready and before any project/profile startup.
  const temp=realpathSync.native(mkdtempSync(join(realpathSync.native(tmpdir()),'lingjing-path-read-'))), probe=join(temp,'probe.cjs');
  writeFileSync(probe,"const {app}=require('electron');console.log(JSON.stringify({pid:process.pid,appData:app.getPath('appData')}));app.exit(0);",{flag:'wx'});
  const raw=execFileSync(require('electron'),[probe],{env,encoding:'utf8',timeout:15000});
  const paths=JSON.parse(raw.split(/\r?\n/).find(line=>line.startsWith('{')));assert.ok(paths.pid>0);
  const appData=realpathSync.native(paths.appData), expected=join(appData,'Lingjing');
  const packageName=JSON.parse(readFileSync('package.json')).name; // Reuse gate proves this product file is unchanged.
  const names=[...new Set(['Lingjing','qingpet-desktop-runtime','qingpet-lord-3d',packageName,config.productName].filter(Boolean))];
  assert.ok(names.every(name=>!/[\\/]|\.\./.test(name)), 'Unexpected package name path');
  proof.preflight={appData,expected,candidates:names.map(name=>({path:join(appData,name),exists:existsSync(join(appData,name))}))};
  assert.ok(proof.preflight.candidates.every(row=>!row.exists), 'Existing default/legacy directory: stop without reading or changing it');stage('default-and-legacy-paths-absent');
  const nodePort=await port();let browserPort=await port();while(browserPort===nodePort)browserPort=await port();
  child=spawn(executable,[`--inspect=127.0.0.1:${nodePort}`,`--remote-debugging-port=${browserPort}`],{env,windowsHide:true,stdio:'ignore'});
  let launchError;child.on('error',error=>{launchError=error;});proof.launcherPid=child.pid;
  const owner=await poll(async()=>{if(launchError)throw launchError;return ps(`$c=Get-NetTCPConnection -LocalPort ${nodePort} -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq '127.0.0.1'}|Select-Object -First 1;if($null -eq $c){'null';exit};$ids=@();$p=[int]$c.OwningProcess;for($n=0;$n -lt 12 -and $p -gt 0;$n++){$ids+=$p;if($p -eq ${child.pid}){break};$r=Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId -Filter "ProcessId=$p";if($null -eq $r){break};$p=[int]$r.ParentProcessId};@{pid=[int]$c.OwningProcess;chain=$ids}|ConvertTo-Json -Compress`);},Boolean,'Owned SFX inspector port absent');
  assert.ok(owner.chain.includes(child.pid),'Inspector PID does not descend from this SFX launcher');runtimePid=owner.pid;proof.ownership=owner;stage('owned-runtime-pid-confirmed');
  const targets=await (await fetch(`http://127.0.0.1:${nodePort}/json/list`,{signal:AbortSignal.timeout(2000)})).json();
  const endpoint=targets.find(row=>row.webSocketDebuggerUrl)?.webSocketDebuggerUrl;assert.equal(new URL(endpoint).hostname,'127.0.0.1');
  socket=new WebSocket(endpoint);socket.on('message',bytes=>{const reply=JSON.parse(bytes);const request=pending.get(reply.id);if(!request)return;pending.delete(reply.id);clearTimeout(request.timer);reply.error?request.reject(Error(reply.error.message)):request.resolve(reply.result);});
  await new Promise((r,j)=>{const timer=setTimeout(()=>j(Error('Inspector open timeout')),5000);socket.once('open',()=>{clearTimeout(timer);r();});socket.once('error',j);});
  const identity=await evaluate('({pid:process.pid,override:process.env.PET_USER_DATA_DIR||null,qa:process.env.LINGJING_QA_SCENARIO||null,portable:process.env.PORTABLE_EXECUTABLE_FILE||null})');
  assert.equal(identity.pid,runtimePid);assert.equal(identity.override,null);assert.equal(identity.qa,null);assert.equal(realpathSync.native(identity.portable).toLowerCase(),realpathSync.native(executable).toLowerCase());
  const actual=await poll(async()=>{try{return await evaluate(`(()=>{const r=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {app}=r('electron');return {pid:process.pid,ready:app.isReady(),appData:app.getPath('appData'),userData:app.getPath('userData')}})()`);}catch{return null;}},value=>value?.ready,'Ordinary SFX app not ready');
  assert.equal(actual.pid,runtimePid);assert.equal(realpathSync.native(actual.userData).toLowerCase(),realpathSync.native(expected).toLowerCase());
  assert.equal(realpathSync.native(actual.appData).toLowerCase(),appData.toLowerCase());proof.actual={...actual,...identity};stage('default-profile-exact-readback');
  await poll(async()=>{try{return await (await fetch(`http://127.0.0.1:${browserPort}/json/list`,{signal:AbortSignal.timeout(500)})).json();}catch{return[];}},rows=>rows.some(row=>row.type==='page'),'Owned renderer missing');
  const browserOwner=ps(`$c=Get-NetTCPConnection -LocalPort ${browserPort} -State Listen -ErrorAction Stop|Where-Object {$_.LocalAddress -eq '127.0.0.1'}|Select-Object -First 1;@{pid=[int]$c.OwningProcess}|ConvertTo-Json -Compress`);
  assert.equal(browserOwner.pid,runtimePid,'Browser CDP must belong to the OS-verified owned runtime');proof.browserOwner=browserOwner;
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${browserPort}`);
  const page=await poll(async()=>browser.contexts().flatMap(c=>c.pages()).find(p=>p.url().includes('/app.asar/')&&p.url().includes('/ui/index.html')),Boolean,'Ordinary SFX login page absent');
  await page.waitForFunction(()=>Boolean(window.lingjing),null,{timeout:15000});
  const receipts=await page.evaluate(async()=>({session:await window.lingjing.invoke('accounts','session',{}),info:await window.lingjing.invoke('app','info',{})}));
  assert.equal(receipts.session.ok,true);assert.equal(receipts.session.data.currentUser,null);assert.equal(receipts.session.data.scenario,null);assert.equal(receipts.info.data.build.sourceCommit,build.sourceCommit);
  proof.loggedOut=true;proof.passed=true;stage('ordinary-login-without-qa-confirmed');
}catch(error){proof.passed=false;proof.failure=String(error);process.exitCode=1;}
finally {
  if(socket?.readyState===WebSocket.OPEN && proof.actual)try{await evaluate(`(()=>{const r=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');setTimeout(()=>r('electron').app.quit(),20);return true;})()`);await new Promise(r=>setTimeout(r,1000));}catch{}
  socket?.close();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Closing owned inspector'));}pending.clear();
  if(browser)await Promise.race([browser.close().catch(()=>{}),new Promise(r=>setTimeout(r,3000))]);
  // Only the OS-verified runtime and our own launcher; never broad image-name kill.
  proof.cleanup=[];
  for(const pid of [...new Set([runtimePid,child?.pid].filter(Boolean))]){
    let alive=true;
    const exists=()=>{try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}};
    try{
      alive=exists();if(alive)try{execFileSync('taskkill',['/PID',String(pid),'/T','/F'],{timeout:10000,windowsHide:true,stdio:'ignore'});}catch(error){if(exists())throw error;}
      for(let attempt=0;attempt<30&&(alive=exists());attempt++)await new Promise(r=>setTimeout(r,100));
      alive=exists();proof.cleanup.push({pid,exited:!alive});if(alive)throw Error('Owned process exit not confirmed');
    }catch(error){proof.cleanup.push({pid,error:String(error)});proof.passed=false;process.exitCode=1;}
  }
  proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify({output,passed:proof.passed,failure:proof.failure}));
}
