// Actual Electron/IPC/SQLite/DPAPI recovery. The namespaced QA identity and old
// archive fixture are synthetic. No cloud success or model response is simulated.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const { provisionQaProfile }=require('../../accounts/qa-scenario.cjs');
const output=resolve('artifacts/conversations/cloud-recovery',`run-${Date.now()}`);mkdirSync(output,{recursive:true});
const profile=join(output,'qa-profile'),marker=provisionQaProfile(profile);
const credentials={provider:'local',account:'qa_chat_recovery',username:'聊天恢复自验',password:'isolated-recovery-qa',confirmPassword:'isolated-recovery-qa',rememberSession:false};
const env={...process.env,PET_USER_DATA_DIR:profile,LINGJING_QA_SCENARIO:'unified-battle'};delete env.ELECTRON_RUN_AS_NODE;
const baseUrl=await new Promise((done,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(error=>error?reject(error):done(`http://127.0.0.1:${port}/v1`));});});
const backupFile=join(output,'local-save.lingjing.json'),errors=[],checks=[];
let app,page,owner,petOne,petTwo;
async function call(name,command,payload={}) {const result=await page.evaluate(({name,command,payload})=>window.lingjing.invoke(name,command,payload),{name,command,payload});assert.equal(result.ok,true,result.message);return result.data;}
async function waitUntil(predicate,label){const end=Date.now()+12000;while(!await predicate()){if(Date.now()>end)throw Error('Timed out: '+label);await new Promise(done=>setTimeout(done,40));}}
async function launch(register=false){
  app=await electron.launch({args:[resolve('.')],env});page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:844});await page.waitForFunction(()=>Boolean(window.lingjing));
  await call('accounts',register?'register':'login',credentials);
}
async function chat(){await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'聊天',exact:true}).click();await page.getByRole('heading',{name:'聊天',exact:true}).waitFor();}
async function settings(){await page.getByRole('link',{name:'对话设置',exact:true}).click();await page.getByRole('heading',{name:'AI 对话',exact:true}).waitFor();}
async function screenshot(name){await page.evaluate(async()=>{await Promise.all([...document.querySelectorAll('.resource-portrait image')].map(async node=>{const image=new Image();image.src=node.getAttribute('href');await image.decode();}));await Promise.all(document.getAnimations().filter(animation=>Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{})));});await page.screenshot({path:join(output,name),fullPage:true});}
try{
  await launch(true);const session=await call('accounts','session');owner=session.currentUser.id;assert.ok(owner.startsWith(`qa:${marker.runId}:`));
  petOne=(await call('companions','adopt',{templateId:'big-fish-gentle',name:'原伙伴',showOnDesktop:false,actionId:randomUUID()})).pet;
  petTwo=(await call('companions','adopt',{templateId:'big-fish-gentle',name:'同模板第二只',showOnDesktop:false,actionId:randomUUID()})).pet;
  await call('conversations','select',{petId:petOne.petId});
  await call('conversations','connection.save',{petId:null,connection:{provider:'openai_compatible',baseUrl,model:'qa-unavailable-local',contextChars:24000,maxOutputTokens:64},apiKey:'LOCAL-ONLY-QA-KEY',revision:0});
  await app.evaluate((_electron,baseUrl)=>{const original=globalThis.fetch;globalThis.__recoveryAttempts=0;globalThis.fetch=(...args)=>{if(String(typeof args[0]==='string'?args[0]:args[0]?.url).startsWith(baseUrl+'/'))globalThis.__recoveryAttempts++;return original(...args);};},baseUrl);
  await chat();await page.getByLabel('给原伙伴发消息',{exact:true}).fill('QA：实际本机连接失败后的原消息');await page.getByRole('button',{name:'发送',exact:true}).click();
  await waitUntil(async()=>(await call('conversations','snapshot')).messages.at(-1)?.status==='failed','actual local failure');
  await page.getByRole('button',{name:'重新回复',exact:true}).click();
  await waitUntil(async()=>(await call('conversations','snapshot')).messages.at(-1)?.attempt===2 && (await call('conversations','snapshot')).messages.at(-1)?.status==='failed','actual retry');
  const original=(await call('conversations','snapshot')).messages;
  assert.equal(original.length,2);assert.equal(original[1].content,'');assert.equal(original[1].errorCode,'NETWORK_ERROR');
  const networkAttempts=await app.evaluate(()=>globalThis.__recoveryAttempts);assert.equal(networkAttempts,2);
  await app.close();app=null;

  // Fixture construction occurs with Electron stopped and only in the newly
  // provisioned QA profile. It contains user messages, never a fake model reply.
  const fixture={apiKey:'OPAQUE-LEGACY-KEY-NOT-FOR-CLOUD',sessionToken:'OPAQUE-LEGACY-TOKEN-NOT-FOR-CLOUD',messages:[
    {id:'original-old-user-1',petId:petOne.petId,role:'user',content:'QA 合成原档：第一条用户旧记录'},
    {id:'original-old-user-2',petId:petOne.petId,role:'user',content:'QA 合成原档：第二条用户旧记录'},
    {id:original[0].id,petId:petOne.petId,role:'user',content:original[0].content},
    {role:'user',content:'QA：未明确归属的原档记录'}],
    memories:[{id:'original-memory-id',petId:petOne.petId,content:'QA 原档记忆'}],profiles:[{petId:petOne.petId,persona:'QA 原档人设'}]};
  const archive=JSON.stringify(fixture),archiveHash=createHash('sha256').update(archive).digest('hex');
  let db=new DatabaseSync(join(profile,'lingjing.sqlite'));
  db.prepare('INSERT INTO account_legacy_data VALUES(?,?,?,?) ON CONFLICT(owner_account_id) DO UPDATE SET source_hash=excluded.source_hash,document=excluded.document,imported_at=excluded.imported_at').run(owner,archiveHash,archive,new Date().toISOString());db.close();
  await launch();await chat();await settings();
  await page.getByRole('button',{name:'导入旧记录',exact:true}).click();
  await page.locator('.cv-import-counts').getByText('消息 3',{exact:true}).waitFor();
  await screenshot('legacy-preview-1280.png');
  await page.getByRole('dialog').getByRole('button',{name:'导入',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  const imported=await call('conversations','snapshot',{petId:petOne.petId});
  const expectedIds=['original-old-user-1','original-old-user-2',...original.map(row=>row.id)];
  assert.deepEqual(imported.messages.map(row=>row.id),expectedIds);assert.equal(imported.profile.persona,'QA 原档人设');assert.equal(imported.memories[0].id,'original-memory-id');
  assert.equal((await call('conversations','snapshot',{petId:petTwo.petId})).messages.length,0);
  checks.push('Actual AI-settings preview/import prepends original stable IDs before existing history, retains persona/memory, and leaves the same-template second pet untouched.');

  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},backupFile);
  await call('accounts','backupExport');const backup=JSON.parse(readFileSync(backupFile,'utf8'));
  const conversationArchive=backup.data.modules.conversations.data;
  assert.doesNotMatch(JSON.stringify(conversationArchive),/encrypted_key|LOCAL-ONLY-QA-KEY|OPAQUE-LEGACY|access_token|refresh_token|session_token/);
  assert.ok(!backup.data.tables.conversation_credentials);assert.ok(!backup.data.tables.conversation_legacy_imports);
  const wholeSaveLegacyPrivacyPending=JSON.stringify(backup).includes('OPAQUE-LEGACY');
  checks.push('Unified account backup consumes the feature archive; conversation wire data excludes keys/blobs/tokens and device-local credential/import tables.');

  await call('conversations','history.clear',{petId:petOne.petId});
  await page.getByLabel('性格设定',{exact:true}).fill('QA：恢复前未保存的人设草稿');
  await page.getByLabel('API Key',{exact:true}).fill('UNSAVED-KEY-DO-NOT-RESTORE');
  const beforeRestore=await call('conversations','snapshot');const preview=await call('accounts','backupPreview');
  await call('accounts','backupRestore',{previewId:preview.previewId,mode:'replace',actionId:randomUUID()});
  await waitUntil(async()=>await page.getByLabel('性格设定',{exact:true}).inputValue()==='QA 原档人设','same-revision editor reset');
  assert.equal(await page.getByLabel('API Key',{exact:true}).inputValue(),'');
  const restored=await call('conversations','snapshot');assert.ok(restored.sessionRevision>beforeRestore.sessionRevision);
  assert.deepEqual(restored.messages.map(row=>row.id),expectedIds);assert.equal(restored.memories[0].id,'original-memory-id');assert.equal(restored.globalConnection.hasKey,true);
  const stale=await page.evaluate(({petId,revision})=>window.lingjing.invoke('conversations','memory.save',{petId,memory:{content:'过期界面不得写入'},expectedSessionRevision:revision}),{petId:petOne.petId,revision:beforeRestore.sessionRevision});
  assert.equal(stale.code,'SESSION_CHANGED');
  await screenshot('restored-settings-1280.png');
  checks.push('Actual account preview/replace restoration emits a new session epoch, resets same-revision persona/key drafts, restores IDs/order and rejects an old editor write.');
  await app.close();app=null;
  await launch();await chat();await page.setViewportSize({width:1440,height:900});
  await page.getByRole('log',{name:'聊天记录'}).getByText('QA 合成原档：第一条用户旧记录',{exact:true}).waitFor();await screenshot('restored-history-1440.png');
  const restarted=await call('conversations','snapshot');assert.deepEqual(restarted.messages.map(row=>row.id),expectedIds);assert.equal(restarted.globalConnection.hasKey,true);
  assert.equal(await page.evaluate(()=>localStorage.length),0);assert.deepEqual(errors,[]);
  const versions=await app.evaluate(()=>({electron:process.versions.electron,node:process.versions.node,chrome:process.versions.chrome}));
  await app.close();app=null;
  db=new DatabaseSync(join(profile,'lingjing.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
  const raw=db.prepare('SELECT document FROM account_legacy_data WHERE owner_account_id=?').get(owner).document;
  const rows=db.prepare('SELECT id,pet_id,role,status,error_code,attempt FROM conversation_messages WHERE owner_account_id=? ORDER BY sequence').all(owner);
  const cipher=db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=?').get(owner).encrypted_key;
  assert.equal(createHash('sha256').update(raw).digest('hex'),archiveHash);assert.deepEqual(rows.map(row=>row.id),expectedIds);
  const encryptedKeyBytes=Buffer.from(cipher,'base64').length;assert.ok(encryptedKeyBytes>30);db.close();
  checks.push('Actual process restart and read-only SQLite confirm stable IDs/order, original archive bytes, preserved local encrypted key, and empty renderer key storage.');
  const evidence={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),status:'passed',realElectron:true,realCloud:false,versions,
    provenance:{qaIdentity:'simulated namespaced profile',syntheticLegacyFixture:true,modelResponsesSimulated:false,modelTransport:'two actual loopback connection refusals',nativeFilePicker:'test-only file path adapter; OS dialog not claimed'},
    marker,checks,networkAttempts,owner,petIds:[petOne.petId,petTwo.petId],expectedIds,sqliteRows:rows,archiveHash,originalArchivePreserved:true,
    encryptedKeyBytes,rendererErrors:errors,rendererKeyStorage:0,wholeSaveLegacyPrivacyPending,
    externalConditions:['08 live login/full-save CAS and central deployment are required for real HTTPS A/B tests.',...(wholeSaveLegacyPrivacyPending?['Whole-save legacy module retains opaque secret fixture fields; 08 must filter cloud serialization before any real cloud push.']:[])]};
  writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));writeFileSync(resolve('artifacts/conversations/cloud-recovery/latest.txt'),output);
  console.log(JSON.stringify({status:'passed',checks:checks.length,realCloud:false,wholeSaveLegacyPrivacyPending,output}));
}catch(error){writeFileSync(join(output,'failure.json'),JSON.stringify({status:'failed',message:error.message,stack:error.stack,rendererErrors:errors},null,2));throw error;}
finally{if(app)await app.close();}
