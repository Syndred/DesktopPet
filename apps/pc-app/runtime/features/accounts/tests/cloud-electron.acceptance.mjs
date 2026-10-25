import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';import {randomUUID,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
const root=resolve('.'),output=resolve(`artifacts/accounts/cloud-electron-${Date.now()}`);mkdirSync(output,{recursive:true});
const account=`nativeqa_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
const evidence={at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Two actual Electron44 processes on one Windows host, isolated profiles, production TypeScript main/preload and React renderer, actual Supabase HTTPS. Not two physical machines.',
 credentialsPersisted:'Windows safeStorage ciphertext only; no password or token in evidence',checks:[],errors:[]};
const models=[];let activeA,activeB;
function pass(name,data){evidence.checks.push({name,data});console.log('PASS',name);writeFileSync(join(output,'progress.json'),JSON.stringify(evidence,null,2));}
const invoke=async(model,command,payload={},expectOk=true)=>{
 const result=await model.page.evaluate(({command,payload})=>window.lingjing.invoke('accounts',command,payload),{command,payload});
 if(expectOk)assert.equal(result.ok,true,`${result.code}: ${result.message}`);return expectOk?result.data:result;
};
async function launch(name){
 const profile=join(output,name);mkdirSync(profile,{recursive:true});const env={...process.env,PET_USER_DATA_DIR:profile};
 for(const key of ['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','LINGJING_PUBLIC_CONFIG','LINGJING_SUPABASE_URL','LINGJING_SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])delete env[key];
 const app=await electron.launch({args:[resolve('apps/pc-app/runtime/features/accounts/tests/native-cloud.fixture.cjs')],cwd:root,env});
 const page=await app.firstWindow();page.setDefaultTimeout(30_000);page.on('pageerror',error=>evidence.errors.push({profile:name,message:error.message}));
 await page.waitForFunction(()=>Boolean(window.lingjing));await page.evaluate(()=>{location.hash='#/account';});
 await app.evaluate(({BrowserWindow},name)=>{const win=BrowserWindow.getAllWindows()[0];win.setSize(1280,844);win.setTitle(`灵境 · 真实云端验收 ${name}`);},name);
 const model={app,page,profile,name,pid:app.process().pid,closed:false};models.push(model);return model;
}
async function close(model){if(model&&!model.closed){model.closed=true;await model.app.close();}}
async function login(model,register=false){
 const {page}=model;await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();
 assert.equal((await invoke(model,'session')).defaultProvider,'runtime');
 if(register){await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill('真实云端验收');}
 await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill(password);
 if(register)await page.getByLabel('确认密码',{exact:true}).fill(password);
 await page.getByRole('checkbox',{name:'保持登录',exact:true}).check();
 await page.getByRole('button',{name:register?'创建账号 →':'登录进入 →',exact:true}).click();
 await page.locator('.app-shell:not(.is-auth)').waitFor();await page.evaluate(()=>{location.hash='#/account';});
 await page.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();
 return invoke(model,'session');
}
async function settings(model,volume){const old=await invoke(model,'settingsGet');old.document.sync.enabled=true;old.document.desktop.volume=volume;
 return invoke(model,'settingsSave',{document:old.document,revision:old.revision,actionId:randomUUID()});}
async function restore(model){const preview=await invoke(model,'cloudPreview');return invoke(model,'backupRestore',{previewId:preview.previewId,mode:'replace',actionId:randomUUID()});}
async function vaultProof(model){return model.app.evaluate(({safeStorage})=>{
 const services=globalThis.__accountsCloudAcceptanceServices,accounts=services.get('accounts'),fs=globalThis.__accountsCloudAcceptanceRequire('node:fs'),crypto=globalThis.__accountsCloudAcceptanceRequire('node:crypto');
 const bytes=fs.readFileSync(accounts.vault.file),saved=accounts.vault.load(),proof=JSON.parse(saved.proof),active=accounts.remote.active;
 return{available:safeStorage.isEncryptionAvailable(),file:accounts.vault.file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
  encryptedNotPlaintext:!bytes.includes(Buffer.from(active.accessToken))&&!bytes.includes(Buffer.from(active.refreshToken)),
  matchesCurrentSession:proof.actor.sessionId===active.actor.sessionId&&proof.accessToken===active.accessToken&&proof.refreshToken===active.refreshToken,
  deviceId:proof.actor.deviceId,sessionId:proof.actor.sessionId,owner:proof.actor.ownerAccountId};
 });}
try{
 activeA=await launch('device-a');activeB=await launch('device-b');assert.notEqual(activeA.pid,activeB.pid);
 const a=await login(activeA,true),b=await login(activeB);assert.equal(a.persistence,'secure');assert.equal(b.persistence,'secure');assert.equal(a.currentUser.id,b.currentUser.id);
 const native=await activeA.app.evaluate(({app})=>({electron:process.versions.electron,node:process.versions.node,userData:app.getPath('userData')}));assert.equal(native.electron,'44.9.3');
 pass('actual separate Electron processes log in to same HTTPS account without kicking each other',{pidA:activeA.pid,pidB:activeB.pid,owner:a.currentUser.id,native});
 const va=await vaultProof(activeA),vb=await vaultProof(activeB);assert.notEqual(va.deviceId,vb.deviceId);assert.notEqual(va.sessionId,vb.sessionId);
 assert.ok(va.encryptedNotPlaintext&&vb.encryptedNotPlaintext&&va.matchesCurrentSession&&vb.matchesCurrentSession);pass('two Windows safeStorage vaults keep device-specific sessions encrypted',{a:va,b:vb});
 await settings(activeA,31);await settings(activeB,42);
 const first=await invoke(activeA,'syncNow',{actionId:randomUUID()});assert.equal(first.personalVerified,true);
 const cloudB=await activeB.app.evaluate(async()=>{const a=globalThis.__accountsCloudAcceptanceServices.get('accounts');const row=await a.remote.cloudSave('read',a.privateSession());return{revision:row.revision,checksum:row.checksum,volume:row.envelope.data.modules.settings.data.desktop.volume,modules:Object.keys(row.envelope.data.modules)};});
 assert.equal(cloudB.volume,31);assert.equal(cloudB.revision,first.revision);pass('rendered application A saves, application B independently reads matching actual cloud receipt',{first,cloudB});
 evidence.fullSaveVerified=first.verified===true;evidence.authorityPending=first.requiresAuthority===true;
 const conflict=await invoke(activeB,'syncNow',{actionId:randomUUID()},false);assert.equal(conflict.code,'SYNC_CONFLICT');assert.equal((await invoke(activeB,'settingsGet')).document.desktop.volume,42);
 const restored=await restore(activeB);assert.equal((await invoke(activeB,'settingsGet')).document.desktop.volume,31);assert.ok(restored.preservedBackup.filePath);
 assert.equal(JSON.parse(readFileSync(restored.preservedBackup.filePath,'utf8')).data.modules.settings.data.desktop.volume,42);
 await settings(activeB,43);const second=await invoke(activeB,'syncNow',{actionId:randomUUID()});assert.equal(second.revision,first.revision+1);
 pass('real IPC conflict preserves B state; explicit cloud restore keeps original backup before next CAS',{conflict:conflict.code,backup:restored.preservedBackup.filePath,revision:second.revision});
 const sdk=await activeB.app.evaluate(async()=>{
  const accounts=globalThis.__accountsCloudAcceptanceServices.get('accounts'),first=await accounts.requireCloudActor(),client=first.client,prior=accounts.remote.active.accessToken;
  const before=await client.from('lingjing_accounts').select('owner_id');if(before.error)throw new Error(before.error.code);
  await accounts.remote.refresh(accounts.remote.active);await client.realtime.setAuth();
  const after=await client.from('lingjing_accounts').select('owner_id');if(after.error)throw new Error(after.error.code);
  const next=await accounts.requireCloudActor();return{sameClient:client===next.client,rotated:prior!==accounts.remote.active.accessToken,
   realtimeTokenMatches:client.realtime.accessTokenValue===accounts.remote.active.accessToken,owner:after.data[0].owner_id,channelCount:client.getChannels().length};
 });assert.ok(sdk.sameClient&&sdk.rotated&&sdk.realtimeTokenMatches);assert.ok((await vaultProof(activeB)).matchesCurrentSession);
 pass('real Auth rotation updates same SDK Data API and Realtime token plus encrypted vault',{...sdk,privateChannelReconnectVerified:false});
 await restore(activeA);await settings(activeA,54);
 await activeA.app.evaluate(()=>{const remote=globalThis.__accountsCloudAcceptanceServices.get('accounts').remote;remote.__acceptanceFetch=remote.fetcher;remote.fetcher=()=>fetch('https://127.0.0.1:1',{signal:AbortSignal.timeout(2000)});});
 const refused=await invoke(activeA,'syncNow',{actionId:randomUUID()},false);assert.equal(refused.code,'CLOUD_UNAVAILABLE');assert.ok((await invoke(activeA,'syncStatus')).pending>0);
 const beforeRestart=await vaultProof(activeA),oldPid=activeA.pid;await close(activeA);activeA=await launch('device-a');
 await activeA.page.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();
 const resumed=await invoke(activeA,'session');assert.equal(resumed.currentUser.id,a.currentUser.id);assert.equal(resumed.persistence,'secure');
 const afterRestart=await vaultProof(activeA);assert.equal(afterRestart.deviceId,beforeRestart.deviceId);assert.equal(afterRestart.sessionId,beforeRestart.sessionId);assert.notEqual(activeA.pid,oldPid);
 const retried=await invoke(activeA,'syncRetry');assert.equal(retried.personalVerified,true);assert.equal(retried.revision,second.revision+1);assert.equal((await invoke(activeA,'settingsGet')).document.desktop.volume,54);
 pass('real Electron restart resumes encrypted session and durable queue after controlled connection refusal',{oldPid,newPid:activeA.pid,deviceId:afterRestart.deviceId,sessionId:afterRestart.sessionId,revision:retried.revision,scope:'per-request closed TLS socket; host network was not disabled'});
 for(const model of [activeA,activeB]){await model.page.evaluate(()=>{location.hash='#/account';});await model.page.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();await model.page.screenshot({path:join(output,`${model.name}.png`)});}
 const secretBoundary=await activeA.app.evaluate(()=>{const a=globalThis.__accountsCloudAcceptanceServices.get('accounts'),text=JSON.stringify(a.session()),fs=globalThis.__accountsCloudAcceptanceRequire('node:fs');
  const matches=[a.remote.active.accessToken,a.remote.active.refreshToken];const bytes=fs.readFileSync(a.services.db.name);
  return{sessionExcludesTokens:matches.every(t=>!text.includes(t)),sqliteExcludesTokens:matches.every(t=>!bytes.includes(Buffer.from(t)))};});
 assert.ok(secretBoundary.sessionExcludesTokens&&secretBoundary.sqliteExcludesTokens);pass('actual public session and SQLite omit access/refresh tokens',secretBoundary);
 await invoke(activeA,'logout');const signedOut=await activeA.app.evaluate(async()=>await globalThis.__accountsCloudAcceptanceServices.get('accounts').signOutPending);assert.equal(signedOut.confirmed,true);
 const bAlive=await activeB.app.evaluate(async()=>{const a=globalThis.__accountsCloudAcceptanceServices.get('accounts'),actor=await a.requireCloudActor();return{owner:actor.ownerAccountId,revision:(await a.remote.cloudSave('read',a.privateSession())).revision};});assert.equal(bAlive.owner,a.currentUser.id);
 await close(activeA);activeA=await launch('device-a');await activeA.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();assert.equal((await invoke(activeA,'session')).currentUser,null);
 pass('logout A revokes its real session, restart stays signed out, B remains active',bAlive);
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_ELECTRON_PASSED',output);
}catch(error){evidence.error={message:error.message};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(error.message);process.exitCode=1;}
finally{for(const model of models)await close(model);for(const name of ['device-a','device-b']){
 const dbFile=join(output,name,'lingjing.sqlite');try{const db=new DatabaseSync(dbFile,{readOnly:true});const counts=db.prepare('select status,count(*) count from account_sync_outbox group by status').all();writeFileSync(join(output,`${name}-sqlite-readback.json`),JSON.stringify({counts},null,2));db.close();}catch{} }
}
