// P09 OS-integration subset ONLY. This explicitly authorized check is restricted to
// an ephemeral GitHub Windows runner and the exact app-owned HKCU values below.
// It never logs in, changes other entries, reboots, or claims UI/reboot acceptance.
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('Only an ephemeral GitHub Windows runner is authorized');
const name='com.lingjing.desktop';
const keys=['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'];
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version;
const executable=resolve(config.directories.output,`Lingjing-${version}-portable-x64.exe`),source=resolve('apps/pc-app/runtime/features/accounts/startup.cjs');
assert.ok(existsSync(executable),'Build the real portable SFX first');
const build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
assert.equal(build.sourceCommit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());assert.deepEqual(build.sourceDirtyFiles,[]);
const output=resolve('artifacts/foundation/cloud-engineering/startup-registration',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=join(output,'fresh-profile');mkdirSync(profile);
const read=key=>{
 const subkey=key.slice(5); // Strip HKCU plus its separator.
 const script=`$ErrorActionPreference='Stop'; try { $k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('${subkey}'); if($null -eq $k){[Console]::Write('null');exit 0}; try {$v=$k.GetValue('${name}',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames);if($null -eq $v){[Console]::Write('null')}else{[Console]::Write((@{kind=$k.GetValueKind('${name}').ToString();value=$v}|ConvertTo-Json -Compress))}}finally{$k.Dispose()} }catch{[Console]::Error.Write($_.Exception.Message);exit 1}`;
 const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true});
 return JSON.parse(result.replace(/^\uFEFF/,''));
};
const proof={scope:'P09 partial: actual original host startup controller writes and removes app-owned HKCU startup entry, stable packaged SFX path. No UI account login or reboot.',sourceCommit:build.sourceCommit,controllerSha256:createHash('sha256').update(readFileSync(source)).digest('hex'),name,keys,executable,startedAt:new Date().toISOString()};
let app,mutationAttempted=false;
try{
 proof.before=keys.map(key=>({key,value:read(key)}));assert.ok(proof.before.every(row=>row.value===null),'App-owned startup value already exists: stop without changing it');
 const entry=join(output,'startup-entry.cjs');
 writeFileSync(entry,`const {app,BrowserWindow}=require('electron');app.setAppUserModelId(${JSON.stringify(name)});app.setPath('userData',${JSON.stringify(profile)});const {createLoginItemController,loginItemTarget}=require(${JSON.stringify(source)});globalThis.startupTarget=loginItemTarget({env:{...process.env,PORTABLE_EXECUTABLE_FILE:${JSON.stringify(executable)}}});globalThis.startupController=createLoginItemController(app,()=>globalThis.startupTarget);app.whenReady().then(()=>{const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});void window.loadURL('data:text/html,<title>Isolated startup controller check</title>');});app.on('window-all-closed',()=>{});`);
 const env={...process.env};for(const key of Object.keys(env))if(/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|PET_USER_DATA_DIR$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key))delete env[key];
 app=await electron.launch({args:[entry],cwd:resolve('.'),env});await app.firstWindow();
 proof.target=await app.evaluate(()=>globalThis.startupTarget);assert.equal(resolve(proof.target.path),executable);assert.deepEqual(proof.target.args,[]);
 mutationAttempted=true;
 proof.enabled=await app.evaluate(({app})=>{globalThis.startupController.apply(true,{explicitStartupChange:true});return app.getLoginItemSettings(globalThis.startupTarget);});
 assert.equal(proof.enabled.openAtLogin,true);assert.equal(proof.enabled.executableWillLaunchAtLogin,true);
 const registration=read(keys[0]);assert.ok(registration,'Run registration was not created');
 assert.equal(registration.kind,'String');const command=registration.value;assert.ok(command===`"${executable}"`||command===executable,'Registration must reference only stable outer SFX, without extra arguments');
 proof.registration={command,stableOuterExecutable:true};
 await app.evaluate(()=>globalThis.startupController.apply(false,{explicitStartupChange:true}));
 assert.equal(read(keys[0]),null,'Original controller must remove its Run value');
 proof.controllerDisabled=true;
}catch(error){proof.failure=String(error);process.exitCode=1;}
finally{
 const cleanupErrors=[];
 if(mutationAttempted){
  if(app)try{await app.evaluate(()=>globalThis.startupController.apply(false,{explicitStartupChange:true}));}catch(error){cleanupErrors.push(`controller cleanup: ${String(error)}`);}
  // Initial values were absent. Remove only this exact app-owned residual value,
  // including Windows StartupApproved metadata; never remove a registry key.
  for(const key of keys)try{if(read(key)!==null)execFileSync('reg.exe',['delete',key,'/v',name,'/f'],{windowsHide:true,stdio:'pipe'});}catch(error){cleanupErrors.push(`exact-value cleanup: ${String(error)}`);}
  try{proof.after=keys.map(key=>({key,value:read(key)}));assert.ok(proof.after.every(row=>row.value===null));proof.registryRestored=true;}catch(error){cleanupErrors.push(`cleanup readback: ${String(error)}`);}
 }
 if(app)try{await app.close();}catch(error){cleanupErrors.push(`owned Electron close: ${String(error)}`);}
 proof.cleanupErrors=cleanupErrors;proof.passed=!proof.failure&&cleanupErrors.length===0&&proof.registryRestored===true&&proof.controllerDisabled===true;
 if(!proof.passed)process.exitCode=1;proof.completedAt=new Date().toISOString();writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));
}
