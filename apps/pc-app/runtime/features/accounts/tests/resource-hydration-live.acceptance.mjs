import {_electron}from'playwright';import assert from'node:assert/strict';import{randomBytes,randomUUID,createHash}from'node:crypto';
import{mkdirSync,readFileSync,writeFileSync,copyFileSync}from'node:fs';import{join,resolve}from'node:path';import{execFileSync}from'node:child_process';import{DatabaseSync}from'node:sqlite';
const root=resolve('.'),output=resolve(`artifacts/accounts/resource-hydration-live-${Date.now()}`);mkdirSync(output,{recursive:true});
const account=`resguard_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
const proof={at:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 scope:'Two actual production Electron processes/profiles, actual Supabase HTTPS private upload and automatic full-save adoption. Same host; main-only production import method selects bundled QA source without a native file dialog. No simulated cloud/provider or SQL-seeded gameplay.',checks:[],errors:[]};
const models=[];let owner,a,b;
const pass=(name,data)=>{proof.checks.push({name,data});writeFileSync(join(output,'progress.json'),JSON.stringify(proof,null,2));console.log('PASS',name);};
async function call(model,feature,command,payload={}){const r=await model.page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});assert.equal(r.ok,true,`${feature}:${command}: ${r.code}`);return r.data;}
async function wait(name,probe,timeout=125000){const end=Date.now()+timeout;do{const value=await probe();if(value)return value;await new Promise(resolve=>setTimeout(resolve,1000));}while(Date.now()<end);throw Error(`Timed out: ${name}`);}
async function launch(name){const profile=join(output,name),env={...process.env,PET_USER_DATA_DIR:profile};mkdirSync(profile,{recursive:true});
 for(const key of['ELECTRON_RUN_AS_NODE','LINGJING_QA_SCENARIO','LINGJING_LEGACY_AUTH','PET_RUNTIME_DATA_FILE','LINGJING_PUBLIC_CONFIG','LINGJING_SUPABASE_URL','LINGJING_SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'])delete env[key];
 const app=await _electron.launch({args:[resolve('apps/pc-app/runtime/features/accounts/tests/native-cloud.fixture.cjs')],cwd:root,env}),page=await app.firstWindow();page.setDefaultTimeout(30000);
 page.on('pageerror',error=>proof.errors.push(error.message.replaceAll(password,'<redacted>')));await page.waitForFunction(()=>Boolean(window.lingjing));await page.evaluate(()=>{location.hash='#/account';});
 const model={app,page,profile,name,pid:app.process().pid};models.push(model);return model;}
async function login(model,register=false){const p=model.page;await p.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();if(register){await p.getByRole('tab',{name:'注册',exact:true}).click();await p.getByLabel('用户名',{exact:true}).fill('资源自动恢复验收');}
 await p.getByLabel('账号',{exact:true}).fill(account);await p.getByLabel('密码',{exact:true}).fill(password);if(register)await p.getByLabel('确认密码',{exact:true}).fill(password);
 await p.getByRole('button',{name:register?'创建账号 →':'登录进入 →',exact:true}).click();await p.locator('.app-shell:not(.is-auth)').waitFor();await p.evaluate(()=>{location.hash='#/account';});
 await p.getByRole('heading',{name:'把每一段陪伴，好好保存。',exact:true}).waitFor();return call(model,'accounts','session');}
async function restore(model){const p=await call(model,'accounts','cloudPreview');return call(model,'accounts','backupRestore',{previewId:p.previewId,mode:'replace',actionId:randomUUID()});}
function disk(model,id,petId){const db=new DatabaseSync(join(model.profile,'lingjing.sqlite'),{readOnly:true});try{db.exec('PRAGMA query_only=ON');const state=db.prepare('SELECT cloud_revision,last_checksum FROM account_sync_state WHERE owner_account_id=?').get(owner),row=db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=? AND owner_account_id=?').get(id,owner),pet=JSON.parse(db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(owner,petId).data_json);
 return{...state,quickCheck:db.prepare('PRAGMA quick_check').get().quick_check,contentHash:row?.content_hash,resourceDocument:row&&JSON.parse(row.document_json),appearance:pet.resource.resourceId,
 imports:db.prepare('SELECT import_id,source_filename FROM lingjing_resource_imports WHERE owner_account_id=? AND resource_id=? ORDER BY import_id').all(owner,id),
 files:db.prepare('SELECT asset_key,file_path FROM lingjing_resource_files WHERE resource_id=? ORDER BY asset_key').all(id).map(file=>({key:file.asset_key,sha256:createHash('sha256').update(readFileSync(file.file_path)).digest('hex')}))};}finally{db.close();}}
try{
 a=await launch('device-a');b=await launch('device-b');const sa=await login(a,true),sb=await login(b);owner=sa.currentUser.id;assert.equal(sb.currentUser.id,owner);assert.notEqual(a.pid,b.pid);
 const pet=await call(a,'companions','adopt',{actionId:randomUUID(),templateId:'big-fish-gentle',name:'新私有外观伙伴',showOnDesktop:false});
 await a.app.evaluate(async()=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts');await x.cloudInvoke('garden-sync',{op:'snapshot'});});await restore(a);await restore(b);
 const settings=await call(a,'accounts','settingsGet');settings.document.sync.enabled=true;await call(a,'accounts','settingsSave',{...settings,actionId:randomUUID()});await call(a,'accounts','syncNow',{actionId:randomUUID()});await restore(b);
 await b.app.evaluate(()=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts'),native=x.sync.reconcile.bind(x.sync);globalThis.__resourceGuardCycles=[];x.sync.reconcile=async(...args)=>{
  const before=x.sync.status(x.requireOwner()),count=x.db.prepare('SELECT count(*) n FROM lingjing_resources WHERE owner_account_id=?').get(x.requireOwner()).n;
  try{const result=await native(...args);globalThis.__resourceGuardCycles.push({revision:before.cloudRevision,dirty:before.localChanged,resourcesBefore:count,applied:result.applied||false,readbackOnly:result.readbackOnly||false});return result;}
  catch(error){globalThis.__resourceGuardCycles.push({revision:before.cloudRevision,dirty:before.localChanged,resourcesBefore:count,code:error.code});throw error;}};});
 pass('actual same-owner dual processes have a clean full baseline before any private resource exists',{owner,pidA:a.pid,pidB:b.pid,petId:pet.pet.petId});
 const source=join(output,'source');mkdirSync(source);const original=resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya');const descriptor=JSON.parse(readFileSync(join(original,'character.json'),'utf8'));descriptor.character.name='真实私有资源守卫';
 writeFileSync(join(source,'character.json'),JSON.stringify(descriptor));copyFileSync(join(original,'sprites.png'),join(source,'sprites.png'));
 const imported=await a.app.evaluate(async(_electron,file)=>{const services=globalThis.__accountsCloudAcceptanceServices,resources=services.get('resources'),accounts=services.get('accounts');await resources.ready;
  const result=await resources.importFile(accounts.requireOwner(),file),row=services.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(result.resource.id),crypto=globalThis.__accountsCloudAcceptanceRequire('node:crypto');
  return{resourceId:result.resource.id,contentHash:result.resource.contentHash,originalDocumentHash:crypto.createHash('sha256').update(row.document_json).digest('hex')};},join(source,'character.json'));
 const uploaded=await call(a,'resources','cloudSync',{actionId:randomUUID(),resourceIds:[imported.resourceId]});if(uploaded.errors)assert.equal(uploaded.errors.length,0);
 const uploadReceipt=await wait('real private resource upload authority receipt',()=>a.app.evaluate((_electron,id)=>{
  const s=globalThis.__accountsCloudAcceptanceServices,x=s.get('accounts');return s.db.prepare("SELECT resource_id,manifest_sha256,authority_action_id,authority_revision,authority_checksum FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND resource_id=? AND data_mode='live' AND authority_revision>0").get(x.requireOwner(),id);
 },imported.resourceId));
 const current=await call(a,'companions','get',{petId:pet.pet.petId});const appearance=await call(a,'companions','appearance',{actionId:randomUUID(),petId:pet.pet.petId,resourceId:imported.resourceId,expectedRevision:current.revision});assert.equal(appearance.pet.resource.resourceId,imported.resourceId);
 const cloud=await a.app.evaluate(async()=>{const x=globalThis.__accountsCloudAcceptanceServices.get('accounts'),r=await x.remote.cloudSave('read',x.privateSession());return{revision:r.revision,checksum:r.checksum};});
 pass('actual HTTPS private resource publication and legal companion appearance commit',{...imported,cloud,uploadReceipt});
 const final=await wait('B normal resource pump/account timer automatically apply private bytes and full companion appearance',async()=>{const s=await call(b,'accounts','syncStatus'),d=disk(b,imported.resourceId,pet.pet.petId);return s.cloudRevision===cloud.revision&&!s.running&&!s.pending&&!s.localChanged&&!s.unverifiedLocal&&d.appearance===imported.resourceId&&d.contentHash===imported.contentHash?{status:s,disk:d}:false;});
 await wait('A strict full checkpoint catches up',async()=>{const s=await call(a,'accounts','syncStatus');return s.cloudRevision===cloud.revision&&!s.running&&!s.pending&&!s.localChanged;});
 const da=disk(a,imported.resourceId,pet.pet.petId),db=disk(b,imported.resourceId,pet.pet.petId);assert.equal(da.last_checksum,cloud.checksum);assert.equal(db.last_checksum,cloud.checksum);assert.equal(da.quickCheck,'ok');assert.equal(db.quickCheck,'ok');
 assert.deepEqual(db.files,da.files);assert.deepEqual(db.imports,da.imports);assert.deepEqual(db.resourceDocument,da.resourceDocument);
 const stillNative=await a.app.evaluate((_electron,id)=>{const s=globalThis.__accountsCloudAcceptanceServices,crypto=globalThis.__accountsCloudAcceptanceRequire('node:crypto');return crypto.createHash('sha256').update(s.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(id).document_json).digest('hex');},imported.resourceId);assert.equal(stillNative,imported.originalDocumentHash);
 const cycles=await b.app.evaluate(()=>globalThis.__resourceGuardCycles);assert.ok(cycles.some(row=>row.applied));assert.ok(!cycles.some(row=>['SAVE_CHANGED','SYNC_REMOTE_CONFLICT'].includes(row.code)));
 const badge=b.page.getByLabel('存档状态',{exact:true});await wait('actual UI subscription shows the adopted revision',async()=>await badge.getAttribute('data-cloud-revision')===String(cloud.revision)&&await badge.getByLabel('已同步',{exact:true}).isVisible());
 await b.page.screenshot({path:join(output,'device-b-account.png')});
 pass('actual B automatic full-save readback matches both query-only SQLite profiles, private file hashes, import IDs and immutable source JSON',{cloud,cycles,a:da,b:db,finalStatus:final.status,nativeSourceDocumentUnchanged:true,manualBSyncAfterSetup:false});
 writeFileSync(join(output,'sqlite-readback.json'),JSON.stringify({a:da,b:db,queryOnly:true},null,2));assert.deepEqual(proof.errors,[]);proof.passed=true;proof.finalBothLocalConverged=true;
 writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log('RESOURCE_HYDRATION_LIVE_PASSED',output);
}catch(error){proof.error={message:String(error.message).replaceAll(password,'<redacted-qa-password>'),stack:String(error.stack).replaceAll(password,'<redacted-qa-password>')};writeFileSync(join(output,'failure.json'),JSON.stringify(proof,null,2));console.error(proof.error.message);process.exitCode=1;}
finally{for(const model of models)await model.app.close().catch(()=>{});}
