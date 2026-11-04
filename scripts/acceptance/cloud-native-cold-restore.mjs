// Actual native Windows same-path cold-baseline restore in a fresh offline QA profile.
// Always uses owned native file dialogs. This is partial synthetic evidence,
// never ordinary cross-profile, live-cloud, or full-case P05/R05/C12 acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,realpathSync,renameSync,existsSync,rmSync,lstatSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename,relative,isAbsolute,sep} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {createNativeDialogScope,nativeWindowHandleDecimal,driveNativeFileDialog} from './native-file-dialog.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url),{MARKER,SCENARIO}=require('../../apps/pc-app/runtime/core/qa-scenario.cjs'),{checksum}=require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const nativeDialog=true; // This flow never substitutes a dialog result.
if(nativeDialog)assert.equal(process.env.GITHUB_ACTIONS,'true','Native UI is authorized only on disposable GitHub runners');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')),version=JSON.parse(readFileSync('package.json')).version,build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json'));
const executable=resolve(option('executable')||join(config.directories.output,`Lingjing-${version}-portable-x64.exe`)),expectedSource=option('source')||build.sourceCommit;
assert.equal(process.platform,'win32');assert.match(expectedSource,/^[a-f0-9]{40}$/);
const output=resolve('artifacts/qa/native-cold-restore',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-cold-restore-'))),runId=randomUUID(),secret=`Qa-${randomUUID()}!`,account=`qa_backup_${runId.slice(0,8)}`;
writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:SCENARIO,runId,isolated:true,profilePath:realpathSync.native(profile),createdAt:new Date().toISOString()}),{flag:'wx'});
const offlineConfig=join(profile,'offline-public.json');writeFileSync(offlineConfig,'{}',{flag:'wx'});
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI']);
const environment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(environment,{PET_USER_DATA_DIR:profile,LINGJING_QA_SCENARIO:SCENARIO,LINGJING_PUBLIC_CONFIG:offlineConfig});
const proof={scope:'Same-path empty-baseline cold recovery of a synthetic offline identity in an audited Windows SFX. Not cross-profile/cloud recovery or a whole acceptance case.',dialogMode:'native-win32-exact-standard-chain',nativeDialogs:[],sourceCommit:expectedSource,compiledFingerprint:build.compiledFingerprint,exeSha256:await sha256(executable),full98Passed:false,nativeFilePickerExercised:false,liveCloudExercised:false,cases:[],passed:false,startedAt:new Date().toISOString()};
let model,uncertain=false,owner,petId,resourceId;const pids=new Set();const redact=value=>String(value).split(secret).join('[redacted]');
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const within=(root,file)=>{const rel=relative(realpathSync(root),realpathSync(file));assert.ok(rel&&rel!=='..'&&!rel.startsWith('..\\')&&!rel.startsWith('../')&&!isAbsolute(rel),'Fixture path must remain within exact temporary profile');return file;};
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
async function stop(){if(model){proof.offlineBlocked??=[];proof.offlineBlocked.push(await model.main(()=>globalThis.__backupOfflineBlocked).catch(()=>({observation:'unavailable'})));await model.stop();}if(uncertain)throw Error('Owned process or native-save outcome requires investigation; retain profile');proof.pidChecks=await pollState(()=>[...pids].map(pid=>({pid,alive:alive(pid)})),rows=>rows.every(row=>!row.alive),{timeoutMs:10000,intervalMs:200,label:'Owned process still alive; retain profile'});model=null;}
async function launch(){uncertain=true;model=await launchPortableSession({executable,profile,expectedSource,label:'cold-restore-offline-qa',environment});for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)pids.add(pid);uncertain=false;
 assert.equal((await model.call('accounts','session')).scenario?.runId,runId);assert.equal(model.info.build.compiledFingerprint,build.compiledFingerprint);
 await model.main(({session})=>{globalThis.__backupOfflineBlocked={node:0,fetch:0,websocket:0,chromium:0};const denied=kind=>{globalThis.__backupOfflineBlocked[kind]++;throw Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN');};const local=value=>{try{const host=typeof value==='string'||value instanceof URL?new URL(String(value)).hostname:value?.hostname||value?.host||'localhost';return ['localhost','127.0.0.1','::1','[::1]'].includes(String(host).split(':').length===2?String(host).split(':')[0]:String(host));}catch{return false;}};
 for(const name of['node:http','node:https']){const mod=process.getBuiltinModule(name);for(const method of['request','get']){const original=mod[method];mod[method]=function(input,...args){if(!local(input))return denied('node');return original.call(this,input,...args);};}}
 const originalFetch=globalThis.fetch;globalThis.fetch=function(input,...args){if(!local(input?.url||input)){globalThis.__backupOfflineBlocked.fetch++;return Promise.reject(Error('OFFLINE_QA_REMOTE_NETWORK_FORBIDDEN'));}return originalFetch.call(this,input,...args);};
 if(globalThis.WebSocket){const Original=globalThis.WebSocket;globalThis.WebSocket=class extends Original{constructor(url,...args){if(!local(url))denied('websocket');super(url,...args);}};}
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>{globalThis.__backupOfflineBlocked.chromium++;callback({cancel:true});});});}
async function shot(name){await model.page.screenshot({path:join(output,`${name}.png`),fullPage:true,timeout:10000});return `${name}.png`;}
async function step(id,coverage,fn){const row={id,coverage,status:'running',fullCasePassed:false,at:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await fn());row.status='partial-engineering-passed';}catch(error){row.status='failed';row.error=redact(error);process.exitCode=1;throw error;}finally{save();}}
async function accountPage(){const page=model.page;await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类',exact:true}).getByRole('link',{name:'账号与云端',exact:true}).click();await page.waitForFunction(()=>location.hash==='#/account');await page.getByRole('button',{name:'导出本地备份',exact:true}).waitFor();}
// Public AccountUser.authKind is optional and only identifies Supabase; local
// authKind exists on the PRIVATE session, never this public IPC response.
function assertOfflineQaSession(session){
 assert.equal(session.defaultProvider,'local');assert.equal(session.dataMode,'simulated');
 assert.equal(session.currentUser?.provider,'local');assert.equal(session.currentUser?.dataMode,'simulated');
 assert.equal(session.currentUser?.authKind,undefined);assert.equal(session.currentUser?.authUserId,undefined);
 assert.equal(session.scenario?.id,SCENARIO);assert.equal(session.scenario?.runId,runId);
 assert.equal(session.scenario?.provenance,'simulated');assert.equal(session.scenario?.isolated,true);
 assert.ok(session.currentUser.id.startsWith(`qa:${runId}:local-`));assert.equal(session.persistence,'memory');
}
async function register(name){const page=model.page;await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill('离线备份验收');await page.locator('input[autocomplete="username"]').fill(name);await page.getByLabel('密码',{exact:true}).fill(secret);await page.getByLabel('确认密码',{exact:true}).fill(secret);await page.getByRole('button',{name:'创建账号 →',exact:true}).click();await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();const session=await model.call('accounts','session');assertOfflineQaSession(session);return session.currentUser.id;}
// No fallback: a native ownership/UIA/business failure fails this run. The main
// BrowserWindow is selected by exact inspected page URL, never first-window guess.
async function selectFile(kind,title,file,trigger,verifyUi){
 const identity=await model.main(({BrowserWindow},url)=>{
  const matches=BrowserWindow.getAllWindows().filter(w=>!w.isDestroyed()&&w.webContents.getURL()===url);
  if(matches.length!==1)throw Error('Unique owned main BrowserWindow not found');
  const win=matches[0];win.show();win.focus();
  return {pid:process.pid,exe:process.execPath,handle:Array.from(win.getNativeWindowHandle()),windowId:win.id};
 },model.page.url());
 assert.equal(identity.pid,model.runtime.pid);
 const row={kind,title,windowId:identity.windowId,status:'running'};proof.nativeDialogs.push(row);save();
 // Observe the REAL save result without replacing it. Never inspect files outside
 // this fixture; a closed native dialog is not proof that the expected export exists.
 const observationId=kind==='save'?randomUUID():null;
 if(observationId)await model.main(({dialog},id,title)=>{
  if(globalThis.__nativeBackupSaveObserver)throw Error('NATIVE_SAVE_OBSERVER_ALREADY_PRESENT');
  const original=dialog.showSaveDialog,observer={id,original,invocations:0,result:null};
  observer.wrapper=async function(...args){
   const matched=args[args.length-1]?.title===title;
   if(matched)observer.invocations++;
   try{const result=await original.apply(this,args);if(matched)observer.result={canceled:result.canceled===true,filePath:typeof result.filePath==='string'?result.filePath:null};return result;}
   catch(error){if(matched)observer.result={failed:true};throw error;}
  };
  globalThis.__nativeBackupSaveObserver=observer;dialog.showSaveDialog=observer.wrapper;
 },observationId,title);
 async function observeSave(){
  if(!observationId)return;
  row.saveObservation=await model.main((_electron,id)=>{const observer=globalThis.__nativeBackupSaveObserver;if(observer?.id!==id)throw Error('NATIVE_SAVE_OBSERVER_ID_MISMATCH');return {invocations:observer.invocations,result:observer.result};},observationId);
  const classify=path=>{if(typeof path!=='string')return 'no-path';if(resolve(path).toLowerCase()===resolve(file).toLowerCase())return 'exact-expected';const rel=relative(resolve(profile),resolve(path));return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)?'owned-profile':'outside-owned-profile-not-read';};
  if(row.saveObservation.result)row.saveObservation.result.pathScope=classify(row.saveObservation.result.filePath);
  const observed=row.saveObservation.result;
  if(row.saveObservation.invocations!==1||!observed||observed.failed||(!observed.canceled&&observed.pathScope!=='exact-expected')){uncertain=true;row.saveOutcomeRequiresInvestigation=true;}
  row.backupReceiptsObserved=(await model.call('accounts','backupList')).map(receipt=>({id:receipt.id,reason:receipt.reason,filePath:receipt.filePath,createdAt:receipt.createdAt,pathScope:classify(receipt.filePath)}));
  row.uiFeedbackObserved=await model.page.locator('.ac-feedback [role="status"], .ac-feedback [role="alert"]').allTextContents();row.uiFeedbackObserved=row.uiFeedbackObserved.slice(0,4).map(text=>text.slice(0,500));
 }
 try{
  Object.assign(row,await driveNativeFileDialog({scope:dialogScope,kind,filePath:file,ownerPid:identity.pid,ownerWindowHandle:nativeWindowHandleDecimal(identity.handle),ownerExecutablePath:identity.exe,expectedTitle:title,expectedSha256:kind==='open'?digest(readFileSync(file)):undefined},trigger,async fileEvidence=>{
   await verifyUi();return {verified:true,observed:'production UI outcome plus exact selected file bytes',sha256:fileEvidence.sha256};
  }));row.status='native-picker-and-ui-verified';proof.nativeFilePickerExercised=true;
 }catch(error){row.status='failed';row.error=redact(error);row.evidence=error.nativeDialogEvidence;
  if(String(error).includes('Exact native-dialog helper exit was not confirmed'))uncertain=true;
  throw error;
 }finally{
  if(observationId){
   try{await observeSave();}catch{row.saveObservationError='READ_ONLY_SAVE_OBSERVATION_FAILED';uncertain=true;row.saveOutcomeRequiresInvestigation=true;}
   try{await model.main(({dialog},id)=>{const observer=globalThis.__nativeBackupSaveObserver;if(observer?.id!==id)throw Error('NATIVE_SAVE_OBSERVER_ID_MISMATCH');if(dialog.showSaveDialog!==observer.wrapper)throw Error('NATIVE_SAVE_OBSERVER_REPLACED');dialog.showSaveDialog=observer.original;delete globalThis.__nativeBackupSaveObserver;},observationId);}catch{row.saveObserverCleanupError='SAVE_OBSERVER_RESTORE_FAILED';uncertain=true;}
  }
  save();
 }
}
async function preview(file){await selectFile('open','选择灵境账号备份',file,()=>model.page.getByRole('button',{name:'恢复本地备份',exact:true}).click(),()=>model.page.getByRole('dialog',{name:'预览恢复内容',exact:true}).waitFor());}
async function cancelPreview(){await model.page.getByRole('dialog',{name:'预览恢复内容',exact:true}).getByRole('button',{name:'取消',exact:true}).click();await model.page.getByRole('dialog',{name:'预览恢复内容',exact:true}).waitFor({state:'hidden'});}
async function confirm(mode){const dialog=model.page.getByRole('dialog',{name:'预览恢复内容',exact:true});await dialog.getByRole('combobox',{name:'恢复方式',exact:true}).click();await model.page.getByRole('option',{name:mode==='replace'?'恢复到此备份版本':'合并，保留本机现有记录',exact:true}).click();await dialog.getByRole('button',{name:'确认恢复',exact:true}).click();await model.page.locator('.ac-feedback [role="status"]').filter({hasText:'恢复完成，原存档已备份。'}).waitFor();await dialog.waitFor({state:'hidden'});}
async function state(){return model.main(({app},expectedProfile)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),path=process.getBuiltinModule('node:path');if(path.resolve(app.getPath('userData'))!==path.resolve(expectedProfile))throw Error('Profile mismatch');const db=new(req('better-sqlite3'))(path.join(expectedProfile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});try{db.pragma('query_only=ON');const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE 'lingjing_resource%' OR name LIKE 'companion%' OR name LIKE 'conversation%' OR name IN ('account_settings','account_actions','account_backup_receipts')) ORDER BY name").all();return Object.fromEntries(names.map(({name})=>[name,db.prepare('SELECT * FROM "'+name+'" ORDER BY rowid').all()]));}finally{db.close();}},profile);}
function authored(s){return Object.fromEntries(Object.entries(s).filter(([name])=>name.startsWith('lingjing_resource')&&!name.includes('_cloud_')&&!name.includes('_preference_')||name==='lingjing_resource_preferences'||name.startsWith('companion')||name.startsWith('conversation')));}
function envelope(file){within(profile,file);const value=JSON.parse(readFileSync(file,'utf8')),{checksum:expected,...body}=value;assert.equal(checksum(body),expected);assert.equal(value.ownerAccountId,owner);assert.equal(value.provenance.mode,'simulated');assert.equal(value.provenance.runId,runId);return value;}
function packOf(value){const pack=value.data.modules['character-resources']?.data.resources.find(row=>row.row.resource_id===resourceId);assert.ok(pack,'Original resource ID must remain in backup');return pack;}
function assertFiles(pack){const h=createHash('sha256');for(const file of [...pack.files].sort((a,b)=>a.key.localeCompare(b.key))){const bytes=Buffer.from(file.bytes,'base64');assert.equal(digest(bytes),file.sha256);h.update(file.key).update('\0').update(bytes);}assert.equal(h.digest('hex'),pack.row.content_hash);assert.equal(JSON.parse(pack.row.document_json).contentHash,pack.row.content_hash);}

// Keep the original absolute QA path and original marker bytes. No marker,
// owner, account, run ID, backup provenance or active session is rewritten.
let dialogScope=createNativeDialogScope({profile,runId});
let files=dialogScope.directory;
let preservedContainer=null,seedBytes=null,preservedProof=null;
const markerBytes=readFileSync(join(profile,MARKER));
const publicConfigBytes=readFileSync(offlineConfig);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const logical=s=>Object.fromEntries(Object.entries(authored(s)).map(([table,rows])=>[
  table,rows.map(row=>table==='lingjing_resource_files'?Object.fromEntries(Object.entries(row).filter(([key])=>key!=='file_path')):row).map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
]));
async function login(){
  const page=model.page;
  await page.getByRole('tab',{name:'登录',exact:true}).click();
  await page.locator('input[autocomplete="username"]').fill(account);
  await page.getByLabel('密码',{exact:true}).fill(secret);
  await page.getByRole('button',{name:'登录进入 →',exact:true}).click();
  await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();
  const session=await model.call('accounts','session');assertOfflineQaSession(session);
  assert.equal(session.currentUser.id,owner);
}
async function logout(){
  await accountPage();
  await model.page.getByRole('button',{name:'退出登录',exact:true}).click();
  await model.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();
  assert.equal((await model.call('accounts','session')).currentUser,null);
}
async function route(path){
  await model.page.evaluate(value=>{location.hash='#'+value;},path);
  await model.page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`).waitFor();
}
async function identityCounts(){
  return model.main(({app},expected)=>{
    const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');
    if(fs.realpathSync.native(app.getPath('userData')).toLowerCase()!==expected.toLowerCase())throw Error('WRONG_PROFILE');
    const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
    const db=new(req('better-sqlite3'))(path.join(expected,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
    try{
      db.pragma('query_only=ON');
      const count=table=>db.prepare('SELECT count(*) n FROM "'+table+'"').get().n;
      return {identities:count('account_identities'),cloudLinks:count('account_cloud_links'),
        loginSessions:count('account_login_sessions'),conversationCredentials:count('conversation_credentials'),
        identitiesLocal:db.prepare("SELECT count(*) n FROM account_identities WHERE provider='local'").get().n,
        vaultExists:fs.existsSync(path.join(expected,'accounts','verified-session.bin'))};
    }finally{db.close();}
  },profile);
}
function assertEmptyBusiness(snapshot){
  const emptyTables=['companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts','conversation_messages','conversation_memories','conversation_profiles','conversation_connections','conversation_credentials','lingjing_resource_imports','lingjing_resource_preferences'];
  for(const table of emptyTables)assert.equal(snapshot[table].length,0,`Seed must have no authored ${table}`);
  assert.equal(snapshot.lingjing_resources.filter(row=>row.owner_account_id!==null).length,0);
  for(const row of snapshot.companion_accounts){assert.equal(row.revision,0);assert.ok(Object.values(JSON.parse(row.selections_json)).every(value=>value===null));}
}
function assertStoppedDatabase(){
  for(const suffix of ['-wal','-shm']){
    const file=join(profile,'lingjing.sqlite'+suffix);
    assert.ok(!existsSync(file)||lstatSync(file).size===0,'A live SQLite sidecar cannot be copied');
  }
  assert.equal(existsSync(join(profile,'accounts','verified-session.bin')),false,'Never copy a session vault');
}


function assertNoSecretFields(value){
  const forbidden=/(^|_)(password|password_hash|api_key|encrypted_key|encrypted_secret|proof_hash|secret|session_token|access_token|refresh_token|credential)(_|$)/i;
  const visit=item=>{
    if(Array.isArray(item))item.forEach(visit);
    else if(item&&typeof item==='object')for(const [key,child] of Object.entries(item)){assert.ok(!forbidden.test(key),'Forbidden backup field: '+key);visit(child);}
    else if(typeof item==='string'&&/^[\[{]/.test(item.trim())){let nested;try{nested=JSON.parse(item);}catch{}if(nested)visit(nested);}
  };
  visit(value);
}
function assertEmptyProtection(value){
  const resources=value.data.modules['character-resources'].data;
  assert.equal(resources.resources.length,0);assert.equal(resources.imports.length,0);assert.equal(resources.preferences.length,0);
  assert.equal(value.data.modules.companions.data.identityImports.length,0);
  for(const [name,rows] of Object.entries(value.data.modules.companions.data.tables)){
    if(name==='companion_accounts')for(const row of rows){assert.equal(row.revision,0);assert.ok(Object.values(JSON.parse(row.selections_json)).every(item=>item===null));}
    else assert.equal(rows.length,0,'Protection has unexpected '+name);
  }
  const conversations=value.data.modules.conversations.data;
  for(const [name,rows] of Object.entries(conversations.tables)){
    if(name==='conversation_preferences')assert.ok(rows.every(row=>row.selected_pet_id===null));
    else assert.equal(rows.length,0,'Protection has unexpected '+name);
  }
}

function inspectStoppedSeed(file){
  assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());
  const Database=require('better-sqlite3'),db=new Database(file,{readonly:true,fileMustExist:true});
  try{
    db.pragma('query_only=ON');assert.equal(db.pragma('quick_check',{simple:true}),'ok');
    const identities=db.prepare('SELECT owner_account_id,provider FROM account_identities').all();
    assert.deepEqual(identities,[{owner_account_id:owner,provider:'local'}]);
    assert.deepEqual(db.prepare('SELECT * FROM account_qa_profile').all(),[{singleton:1,profile_id:runId,scenario_id:SCENARIO}]);
    for(const table of ['account_login_sessions','account_cloud_links','conversation_credentials'])
      assert.equal(db.prepare('SELECT count(*) n FROM "'+table+'"').get().n,0);
    return true;
  }finally{db.close();}
}
function assertPreservedSource(){
  assert.ok(preservedProof);assert.equal(lstatSync(preservedProof.directory).isSymbolicLink(),false);
  assert.equal(digest(readFileSync(join(preservedProof.directory,'lingjing.sqlite'))),preservedProof.populatedSha256);
  assert.equal(digest(readFileSync(preservedProof.backupFile)),preservedProof.backupSha256);
  for(const item of preservedProof.resources){
    const rel=relative(preservedProof.directory,realpathSync(item.file));
    assert.ok(rel&&!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));
    assert.equal(digest(readFileSync(item.file)),item.sha256);
  }
}

async function assertRestored(snapshot,resourceBytes){
  const actual=await state();
  assert.deepEqual(logical(actual),logical(snapshot));
  const list=await model.call('companions','list');assert.ok(list.pets.some(pet=>pet.petId===petId));
  for(const row of actual.lingjing_resource_files.filter(row=>row.resource_id===resourceId)){
    within(profile,row.file_path);assert.deepEqual(readFileSync(row.file_path),resourceBytes[row.asset_key]);
  }
  assert.equal(actual.lingjing_resource_files.filter(row=>row.resource_id===resourceId).length,Object.keys(resourceBytes).length);
  await route('/settings/ai');
  assert.equal(await model.page.locator(`.cv-partners button[data-pet-id="${petId}"]`).getAttribute('aria-pressed'),'true');
  await model.page.getByText('冷恢复测试记忆：喜欢山林',{exact:true}).waitFor();
  const snap=await model.call('conversations','snapshot');
  assert.equal(snap.petId,petId);assert.equal(snap.memories.length,1);
  assert.equal(snap.memories[0].id,snapshot.conversation_memories[0].id);
  assert.equal(snap.memories[0].content,'冷恢复测试记忆：喜欢山林');
  return actual;
}
try{
  await step('seed-empty-same-path','New UI-created simulated identity; logged-out empty database baseline only',async()=>{
    await launch();owner=await register(account);
    assertEmptyBusiness(await state());
    await logout();
    const counts=await identityCounts();
    assert.deepEqual(counts,{identities:1,cloudLinks:0,loginSessions:0,conversationCredentials:0,identitiesLocal:1,vaultExists:false});
    assertEmptyBusiness(await state());
    await stop();assertStoppedDatabase();
    assert.equal(inspectStoppedSeed(join(profile,'lingjing.sqlite')),true);
    seedBytes=readFileSync(join(profile,'lingjing.sqlite'));
    return {emptyBusinessDomains:true,counts,seedSha256:digest(seedBytes),activeSessionCopied:false};
  });
  await launch();await login();
  const pet=(await model.call('companions','adopt',{actionId:randomUUID(),templateId:'animal-wood-deer',name:'冷恢复原ID',showOnDesktop:false})).pet;
  petId=pet.petId;
  await route('/settings/ai');
  await model.page.locator(`.cv-partners button[data-pet-id="${petId}"]`).click();
  await model.page.getByRole('button',{name:'添加记忆',exact:true}).click();
  const memoryDialog=model.page.getByRole('dialog');
  await memoryDialog.getByRole('textbox',{name:'记忆内容',exact:true}).fill('冷恢复测试记忆：喜欢山林');
  await memoryDialog.getByRole('button',{name:'保存记忆',exact:true}).click();
  await memoryDialog.waitFor({state:'hidden'});
  await pollState(()=>model.call('conversations','snapshot'),value=>value.memories.some(row=>row.content==='冷恢复测试记忆：喜欢山林'));
  const assetSource=resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya');
  const sample=join(files,'owned-pack');mkdirSync(sample);
  const resourceBytes={};
  for(const name of ['character.json','sprites.png']){
    resourceBytes[name]=readFileSync(join(assetSource,name));writeFileSync(join(sample,name),resourceBytes[name],{flag:'wx'});
  }
  // Follow the visible category rather than assuming an internal resource route.
  await model.page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();
  await model.page.getByRole('navigation',{name:'设置分类',exact:true}).getByRole('link',{name:'角色资源',exact:true}).click();
  await model.page.locator('.resources-preview:visible').waitFor();
  await selectFile('open','导入 2D 角色资源',join(sample,'character.json'),
    ()=>model.page.getByRole('button',{name:'选择文件并导入',exact:true}).click(),
    ()=>model.page.getByText('2D 角色导入成功，可以预览与校准动作。',{exact:true}).waitFor());
  const imports=(await model.call('resources','list')).filter(row=>row.origin==='import');
  assert.equal(imports.length,1);resourceId=imports[0].id;
  await model.page.locator(`.resources-preview:visible .resource-stage[data-resource-id="${resourceId}"][data-status="ready"] canvas`).waitFor();
  await model.page.getByRole('switch',{name:'水平翻转',exact:true}).click();
  await model.page.getByRole('button',{name:'保存动作与显示设置',exact:true}).click();
  await model.page.getByText('2D 动作与显示设置已保存。',{exact:true}).waitFor();
  await accountPage();
  const exported=join(files,'cold-source.lingjing.json');
  let originalBytes,sourceState,original;
  await step('native-source-export','Real native save of new pet, memory and resource bytes, before cold reset',async()=>{
    await selectFile('save','导出灵境账号备份',exported,
      ()=>model.page.getByRole('button',{name:'导出本地备份',exact:true}).click(),
      ()=>model.page.locator('.ac-feedback [role="status"]').filter({hasText:'备份已导出。'}).waitFor());
    originalBytes=readFileSync(exported);original=envelope(exported);assertFiles(packOf(original));
    assert.equal(originalBytes.includes(Buffer.from(secret)),false);assertNoSecretFields(original.data);
    sourceState=await state();assert.equal(sourceState.conversation_memories.length,1);
    assert.equal(sourceState.conversation_credentials.length,0);
    return {backupSha256:digest(originalBytes),petId,resourceId,memoryId:sourceState.conversation_memories[0].id,
      resourceSha256:Object.fromEntries(Object.entries(resourceBytes).map(([key,value])=>[key,digest(value)])),screenshot:await shot('source-export')};
  });
  await step('cold-same-path-reset','Preserve populated profile intact, reopen unchanged empty seed at the original exact QA path',async()=>{
    await logout();await stop();assertStoppedDatabase();
    const populatedSha256=digest(readFileSync(join(profile,'lingjing.sqlite')));
    preservedContainer=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-cold-preserved-')));
    const preserved=join(preservedContainer,'populated');
    assert.equal(existsSync(preserved),false);assert.equal(lstatSync(profile).isSymbolicLink(),false);
    renameSync(profile,preserved);
    assert.equal(digest(readFileSync(join(preserved,'lingjing.sqlite'))),populatedSha256);
    preservedProof={directory:preserved,populatedSha256,backupFile:join(preserved,relative(profile,exported)),backupSha256:digest(originalBytes),resources:sourceState.lingjing_resource_files.filter(row=>row.resource_id===resourceId).map(row=>({key:row.asset_key,file:join(preserved,relative(profile,row.file_path)),sha256:digest(resourceBytes[row.asset_key])}))};
    assertPreservedSource();
    mkdirSync(profile);
    writeFileSync(join(profile,MARKER),markerBytes,{flag:'wx'});
    writeFileSync(offlineConfig,publicConfigBytes,{flag:'wx'});
    writeFileSync(join(profile,'lingjing.sqlite'),seedBytes,{flag:'wx'});
    assert.equal(digest(readFileSync(join(profile,'lingjing.sqlite'))),digest(seedBytes));
    assert.deepEqual(readFileSync(join(profile,MARKER)),markerBytes);
    assert.equal(inspectStoppedSeed(join(profile,'lingjing.sqlite')),true);
    dialogScope=createNativeDialogScope({profile,runId});files=dialogScope.directory;
    for(const row of sourceState.lingjing_resource_files.filter(row=>row.resource_id===resourceId))assert.equal(existsSync(row.file_path),false,'Old active imported resource bytes must be absent');
    await launch();assert.equal((await model.call('accounts','session')).currentUser,null);await login();
    assertEmptyBusiness(await state());assert.equal((await model.call('companions','list')).pets.length,0);
    assert.equal((await model.call('resources','list')).filter(row=>row.origin==='import').length,0);
    const counts=await identityCounts();assert.equal(counts.cloudLinks,0);assert.equal(counts.conversationCredentials,0);assert.equal(counts.vaultExists,false);
    return {sameAbsoluteProfile:true,originalMarkerByteIdentical:true,seedByteIdentical:true,
      populatedProfilePreserved:true,populatedSha256,businessEmptyBeforeImport:true,oldResourcePathsAbsent:true,crossProfile:false};
  });
  const coldBackup=join(files,'cold-source-copy.lingjing.json');
  writeFileSync(coldBackup,originalBytes,{flag:'wx'});assert.equal(digest(readFileSync(coldBackup)),digest(originalBytes));
  await step('native-cold-restore','Native open, visible preview and explicit replace confirmation from empty state',async()=>{
    await accountPage();const prior=(await model.call('accounts','backupList')).map(row=>row.id);
    await preview(coldBackup);await confirm('replace');
    await assertRestored(sourceState,resourceBytes);
    assert.deepEqual((await model.call('accounts','settingsGet')).document,original.data.modules.settings.data);
    const receipts=(await model.call('accounts','backupList')).filter(row=>!prior.includes(row.id)&&row.reason==='before-restore');
    assert.equal(receipts.length,1);const protection=envelope(receipts[0].filePath);
    assertEmptyProtection(protection);
    assert.ok(!JSON.stringify(protection.data).includes(petId));
    assert.ok(!JSON.stringify(protection.data).includes(sourceState.conversation_memories[0].id));
    assert.equal(digest(readFileSync(coldBackup)),digest(originalBytes));
    return {sameIds:true,resourceBytesFromBackup:true,emptyProtectionVerified:true,protectionChecksum:protection.checksum,
      screenshot:await shot('cold-restored-memory')};
  });
  await step('normal-restart-readback','Normal logout, app stop, fresh launch and normal login retain restored records and native resource rendering',async()=>{
    const before=logical(await state());await logout();await stop();await launch();
    assert.equal((await model.call('accounts','session')).currentUser,null);await login();
    assert.deepEqual(logical(await assertRestored(sourceState,resourceBytes)),before);
    await model.page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();
    await model.page.getByRole('navigation',{name:'设置分类',exact:true}).getByRole('link',{name:'角色资源',exact:true}).click();
    await model.page.locator(`.resource-card[data-resource-id="${resourceId}"]`).click();
    await model.page.locator(`.resources-preview:visible .resource-stage[data-resource-id="${resourceId}"][data-status="ready"] canvas`).waitFor();
    const counts=await identityCounts();assert.equal(counts.cloudLinks,0);assert.equal(counts.conversationCredentials,0);assert.equal(counts.vaultExists,false);
    return {sameOwner:true,samePetAndMemoryIds:true,resourceRenderReady:true,noCloudLinks:true,screenshot:await shot('restart-resource-ready')};
  });
  assertPreservedSource();proof.preservedSourceUnchangedAfterRestore=true;
  assert.equal(proof.nativeDialogs.length,3);
  assert.ok(proof.nativeDialogs.every(row=>row.status==='native-picker-and-ui-verified'));
  proof.uncovered=['ordinary same-owner second profile','cloud authentication/sync','original historical database','full P05/R05/C12'];
  proof.additionalFullCasesPassed=0;
  proof.passed=proof.cases.length===5&&proof.cases.every(row=>row.status==='partial-engineering-passed');
}catch(error){proof.error=redact(error);proof.passed=false;process.exitCode=1;if(model)await shot('failure').catch(()=>{});}
finally{
  seedBytes=null;
  try{await stop();proof.ownedProcessStopped=true;}catch(error){proof.stopError=redact(error);proof.passed=false;process.exitCode=1;}
  try{
    assert.ok(proof.ownedProcessStopped,'Retain synthetic files until every owned PID is confirmed stopped');
    for(const [directory,prefix] of [[profile,'lingjing-cold-restore-'],[preservedContainer,'lingjing-cold-preserved-']]){
      if(!directory)continue;
      assert.equal(dirname(resolve(directory)),realpathSync.native(tmpdir()));assert.ok(basename(directory).startsWith(prefix));
      rmSync(directory,{recursive:true,force:true});
    }
    proof.syntheticProfilesRemoved=true;
  }catch(error){proof.cleanupError=redact(error);proof.passed=false;process.exitCode=1;}
  proof.completedAt=new Date().toISOString();save();console.log(JSON.stringify(proof,null,2));
}
