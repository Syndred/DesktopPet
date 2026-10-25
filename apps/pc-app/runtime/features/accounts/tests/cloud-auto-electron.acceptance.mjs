import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';import{randomUUID,randomBytes}from'node:crypto';
import{mkdirSync,readFileSync,writeFileSync}from'node:fs';import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';import{DatabaseSync}from'node:sqlite';
const root=resolve('.'),output=resolve(`artifacts/accounts/cloud-auto-electron-${Date.now()}`);mkdirSync(output,{recursive:true});
const account=`autoqa_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
const evidence={at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Actual production Electron main/preload/React UI, two separate Windows processes and isolated profiles, real Supabase HTTPS; same host, not two physical machines',
 automaticTask:'Unmodified production30-second interval; verifier never calls runAutomaticSync, syncRetry or syncNow after initial baseline setup',checks:[],errors:[]};
let a,b,owner;const models=[];
function pass(name,data){evidence.checks.push({name,data});writeFileSync(join(output,'progress.json'),JSON.stringify(evidence,null,2));console.log('PASS',name);}
async function call(model,command,payload={}){const r=await model.page.evaluate(({command,payload})=>window.lingjing.invoke('accounts',command,payload),{command,payload});assert.equal(r.ok,true,`${command}: ${r.code} ${r.message}`);return r.data;}
async function waitFor(name,probe,timeout=105_000){const end=Date.now()+timeout;do{const r=await probe();if(r)return r;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<end);throw new Error(`Timed out: ${name}`);}
async function launch(name){
 const profile=join(output,name),env={...process.env,PET_USER_DATA_DIR:profile};mkdirSync(profile,{recursive:true});
 for(const key of ['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','LINGJING_PUBLIC_CONFIG','LINGJING_SUPABASE_URL','LINGJING_SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])delete env[key];
 const app=await electron.launch({args:[resolve('apps/pc-app/runtime/features/accounts/tests/native-cloud.fixture.cjs')],env,cwd:root}),page=await app.firstWindow();page.setDefaultTimeout(30_000);
 page.on('pageerror',error=>evidence.errors.push({profile:name,message:error.message.replaceAll(password,'<redacted>')}));
 await page.waitForFunction(()=>Boolean(window.lingjing));await page.evaluate(()=>{location.hash='#/account';});
 const model={app,page,name,profile,pid:app.process().pid};models.push(model);return model;
}
async function close(model){if(model&&!model.closed){model.closed=true;await model.app.close();}}
async function login(model,register=false){
 const {page}=model;await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();if(register){await page.getByRole('tab',{name:'注册',exact:true}).click();await page.getByLabel('用户名',{exact:true}).fill('自动云同步验收');}
 await page.getByLabel('账号',{exact:true}).fill(account);await page.getByLabel('密码',{exact:true}).fill(password);if(register)await page.getByLabel('确认密码',{exact:true}).fill(password);
 await page.getByRole('checkbox',{name:'保持登录',exact:true}).check();await page.getByRole('button',{name:register?'创建账号 →':'登录进入 →',exact:true}).click();
 await page.locator('.app-shell:not(.is-auth)').waitFor();await page.evaluate(()=>{location.hash='#/account';});await page.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();return call(model,'session');
}
async function edit(model,volume){const prefs=await call(model,'settingsGet');prefs.document.desktop.volume=volume;prefs.document.sync.enabled=true;return call(model,'settingsSave',{...prefs,actionId:randomUUID()});}
async function restore(model){const p=await call(model,'cloudPreview');return call(model,'backupRestore',{previewId:p.previewId,actionId:randomUUID(),mode:'replace'});}
async function offline(model,enabled){await model.app.evaluate((_electron,enabled)=>{const remote=globalThis.__accountsCloudAcceptanceServices.get('accounts').remote;
 if(enabled){remote.__acceptanceFetch=remote.fetcher;remote.fetcher=()=>fetch('https://127.0.0.1:1',{signal:AbortSignal.timeout(2000)});}else remote.fetcher=remote.__acceptanceFetch;
},enabled);}
function disk(model){const db=new DatabaseSync(join(model.profile,'lingjing.sqlite'),{readOnly:true});try{
 db.exec('PRAGMA query_only=ON');const row=db.prepare('SELECT * FROM account_sync_state WHERE owner_account_id=?').get(owner),settings=JSON.parse(db.prepare('SELECT document FROM account_settings WHERE owner_account_id=?').get(owner).document);
 return{revision:row?.cloud_revision,checksum:row?.last_checksum,volume:settings.desktop.volume,syncEnabled:settings.sync.enabled,quickCheck:db.prepare('PRAGMA quick_check').get().quick_check,
  outbox:db.prepare('SELECT action_id,base_revision,status,last_error FROM account_sync_outbox WHERE owner_account_id=? ORDER BY created_at').all(owner),
  pets:db.prepare('SELECT pet_id FROM companion_pets WHERE owner_account_id=? ORDER BY pet_id').all(owner).map(row=>row.pet_id)};
}finally{db.close();}}
async function head(model,id){return model.app.evaluate(async(_electron,id)=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts'),r=await x.remote.cloudSave('read',x.privateSession(),id?{actionId:id}:{});
 return{revision:r.revision,checksum:r.checksum,actionId:r.actionId,volume:r.envelope.data.modules.settings.data.desktop.volume,dataChecksum:x.sync.dataChecksum(r.envelope.data,x.requireOwner())};
},id);}
async function clean(model,revision,volume){const s=await call(model,'syncStatus'),d=disk(model);return s.cloudRevision===revision&&!s.running&&!s.pending&&!s.localChanged&&!s.unverifiedLocal&&!s.privacyRedactions&&d.volume===volume?{status:s,disk:d}:false;}
async function convergence(revision,volume){return waitFor(`both actual SQLite profiles at${revision}/${volume}`,async()=>{const [aa,bb]=await Promise.all([clean(a,revision,volume),clean(b,revision,volume)]);return aa&&bb?{a:aa,b:bb}:false;});}
async function vault(model){return model.app.evaluate(({safeStorage})=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts'),fs=globalThis.__accountsCloudAcceptanceRequire('node:fs'),saved=x.vault.load(),p=JSON.parse(saved.proof),bytes=fs.readFileSync(x.vault.file);
 return{available:safeStorage.isEncryptionAvailable(),deviceId:p.actor.deviceId,sessionId:p.actor.sessionId,owner:p.actor.ownerAccountId,matchesCurrent:p.accessToken===x.remote.active.accessToken&&p.refreshToken===x.remote.active.refreshToken,
  encrypted:!bytes.includes(Buffer.from(p.accessToken))&&!bytes.includes(Buffer.from(p.refreshToken))};});}
try{
 a=await launch('device-a');b=await launch('device-b');const sa=await login(a,true),sb=await login(b);owner=sa.currentUser.id;
 assert.notEqual(a.pid,b.pid);assert.equal(sb.currentUser.id,owner);const va=await vault(a),vb=await vault(b);assert.notEqual(va.sessionId,vb.sessionId);assert.ok(va.encrypted&&vb.encrypted&&va.matchesCurrent&&vb.matchesCurrent);
 pass('real two-process same-account sessions and Windows encrypted vaults',{owner,pidA:a.pid,pidB:b.pid,a:va,b:vb});
 const adopted=await a.page.evaluate(async input=>{const r=await window.lingjing.invoke('companions','adopt',input);if(!r.ok)throw new Error(r.code);return r.data;},{actionId:randomUUID(),templateId:'big-fish-gentle',name:'自动同步伙伴',showOnDesktop:false});
 assert.ok(adopted.pet.petId);await b.app.evaluate(async()=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts');await x.cloudInvoke('garden-sync',{op:'snapshot'});});await restore(a);await restore(b);
 await edit(a,30);const seed=await call(a,'syncNow',{actionId:randomUUID()});assert.equal(seed.verified,true);await restore(b);assert.ok(disk(b).pets.includes(adopted.pet.petId));
 pass('real legal cloud pet and garden plus explicit initial full confirmed baseline',{petId:adopted.pet.petId,revision:seed.revision});
 // From here on, uploads/retries/adoption must be triggered only by the actual
 // production interval. Read-only probes and personal settings edits do no sync.
 await edit(a,31);const normal=await convergence(seed.revision+1,31),normalHead=await head(b);assert.equal(normal.a.disk.checksum,normalHead.checksum);assert.equal(normal.b.disk.checksum,normalHead.checksum);
 const normalAction=normal.a.disk.outbox.find(row=>row.base_revision===seed.revision&&row.status==='verified');assert.match(normalAction.action_id,/^auto:/);
 pass('normal personal settings edit auto-enqueues/uploads and B actually applies without any sync click',{action:normalAction,cloud:normalHead,...normal});
 await offline(b,true);await edit(b,42);const dirty=await waitFor('B durable offline original automatic action',()=>{const row=disk(b).outbox.find(row=>row.base_revision===normalHead.revision&&row.status==='retry');return row;});
 await edit(a,43);await waitFor('A automatically saves next personal version',async()=>await clean(a,normalHead.revision+1,43));await offline(b,false);
 const conflict=await waitFor('B detects actual CAS conflict and keeps its local dirty state',async()=>{const s=await call(b,'syncStatus'),d=disk(b);return s.conflicts===1&&d.volume===42?{status:s,disk:d}:false;});
 assert.equal(conflict.disk.revision,normalHead.revision);assert.equal(conflict.disk.outbox.find(row=>row.action_id===dirty.action_id).status,'conflict');
 await b.page.getByLabel('版本冲突',{exact:true}).waitFor();await b.page.screenshot({path:join(output,'device-b-dirty-conflict.png')});
 pass('dirty B is never silently overwritten; its exact original automatic action stays conflicted',{original:dirty,...conflict});
 const recovery=await restore(b);assert.equal(JSON.parse(readFileSync(recovery.preservedBackup.filePath)).data.modules.settings.data.desktop.volume,42);
 await convergence(normalHead.revision+1,43);pass('explicit conflict recovery retains dirty42 backup and restores the chosen cloud version',{backup:recovery.preservedBackup.filePath,revision:normalHead.revision+1});
 await offline(a,true);await edit(a,54);const original=await waitFor('A offline edit becomes a durable original automatic action',()=>disk(a).outbox.find(row=>row.base_revision===normalHead.revision+1&&row.status==='retry'));
 const source=await a.app.evaluate((_electron,id)=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts'),s=x.db.prepare('SELECT original_checksum,original_document FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(x.requireOwner(),id);return{checksum:s.original_checksum,volume:JSON.parse(s.original_document).data.modules.settings.data.desktop.volume};},original.action_id);
 const beforeRestart=await vault(a),oldPid=a.pid;await close(a);a=await launch('device-a');await a.page.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();const afterRestart=await vault(a);
 assert.notEqual(a.pid,oldPid);assert.equal(afterRestart.sessionId,beforeRestart.sessionId);assert.equal(afterRestart.deviceId,beforeRestart.deviceId);
 pass('A original automatic offline action and encrypted session survive actual process restart',{original,source,oldPid,newPid:a.pid,beforeRestart,afterRestart,scope:'controlled per-request closed TLS socket; host network not disabled'});
 const expected=normalHead.revision+2,final=await convergence(expected,54),cloud=await head(b,original.action_id);
 assert.equal(cloud.revision,expected);assert.equal(cloud.volume,54);assert.equal(cloud.actionId,original.action_id);
 for(const model of [a,b]){
  const d=disk(model),s=await call(model,'syncStatus');assert.equal(d.checksum,cloud.checksum);assert.equal(d.quickCheck,'ok');assert.ok(d.pets.includes(adopted.pet.petId));assert.equal(d.syncEnabled,true);
  const local=await model.app.evaluate(()=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts');return x.sync.dataChecksum(x.backups.snapshot(x.requireOwner()).data,x.requireOwner());});assert.equal(local,cloud.dataChecksum);
  const status=model.page.getByLabel('存档状态',{exact:true});await waitFor('actual subscribed UI version and status',async()=>await status.getAttribute('data-cloud-revision')===String(expected)&&await status.getByLabel('已同步',{exact:true}).isVisible());
  assert.equal(await model.page.getByRole('switch',{name:'开启存档同步',exact:true}).getAttribute('aria-checked'),'true');
  await model.app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.show();win.focus();});await model.page.screenshot({path:join(output,`${model.name}-converged.png`)});
  writeFileSync(join(output,`${model.name}-sqlite-final.json`),JSON.stringify({queryOnly:true,...d,status:s,localDataChecksum:local},null,2));
 }
 const verified=disk(a).outbox.find(row=>row.action_id===original.action_id);assert.equal(verified.status,'verified');assert.equal(verified.base_revision,original.base_revision);
 const retainedSource=await a.app.evaluate((_electron,id)=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts');return x.db.prepare('SELECT original_checksum FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(x.requireOwner(),id).original_checksum;},original.action_id);assert.equal(retainedSource,source.checksum);
 pass('production timer retries the same A action then B automatically converges in actual UI, SQLite and full cloud checksum',{originalAction:verified,cloud,...final,originalSourcePreserved:true,uiReloadedByVerifier:false});
 await call(a,'logout');const signedOut=await a.app.evaluate(async()=>await globalThis.__accountsCloudAcceptanceServices.get('accounts').signOutPending);assert.equal(signedOut.confirmed,true);assert.equal((await head(b)).revision,expected);
 await close(a);a=await launch('device-a');await a.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();assert.equal((await call(a,'session')).currentUser,null);
 pass('actual A logout/restart remains signed out while converged B remains active',{revision:expected});
 assert.deepEqual(evidence.errors,[]);evidence.passed=true;evidence.finalBothLocalConverged=true;evidence.finalRevision=expected;evidence.finalChecksum=cloud.checksum;evidence.manualSyncCommandsAfterSetup=0;
 writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_AUTO_ELECTRON_PASSED',output);
}catch(error){const safe=value=>String(value).replaceAll(password,'<redacted-qa-password>');evidence.error={message:safe(error.message),stack:safe(error.stack)};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(evidence.error.message);process.exitCode=1;}
finally{for(const model of models)await close(model);}
