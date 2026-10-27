// Additional business-only cases for the SAME fresh owners/devices held by the
// live QA holder. No registration, credentials, grants, direct cloud SQL or retry
// with replacement IDs. Importing this module performs no work.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync,renameSync,mkdirSync,realpathSync,lstatSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
const {checksum}=createRequire(import.meta.url)('../../apps/pc-app/runtime/features/accounts/util.cjs');

export async function runCloudLiveQaRecordCases({models,expectedActors,relaunch,assertActive,scenario,runId,output}){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(typeof assertActive,'function');assert.equal(typeof relaunch,'function');
 assert.match(runId,/^[a-zA-Z0-9_-]{8,100}$/);
 assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);
 assert.notEqual(expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId);
 assert.equal(new Set(['a','a2','b'].map(k=>expectedActors[k].deviceId)).size,3);
 mkdirSync(output,{recursive:true});
 const prior=JSON.parse(readFileSync(join(output,'live-business-evidence.json'),'utf8'));
 assert.equal(prior.runId,runId);assert.equal(prior.scenario,scenario);assert.equal(prior.passed,true,'Run only after the original business batch succeeded');
 const setup=prior.cases.find(c=>c.id==='S02'&&c.status==='passed-scoped');assert.ok(setup);
 assert.equal(setup.owner,expectedActors.a.ownerAccountId);const petId=setup.petId;assert.ok(typeof petId==='string');
 const intentFile=join(output,'live-record-intents.json'),file=join(output,'live-record-evidence.json');
 // No automatic module replay after uncertain writes. Original intents remain
 // on disk for independent reconciliation; never replace the pet or record ID.
 assert.equal(existsSync(intentFile),false,'Prior record batch exists: reconcile its original intent, do not replay');
 const intent={runId,scenario,owner:setup.owner,petId,refreshActionId:randomUUID(),memorySubmitted:false,personaSubmitted:false};
 const persist=()=>{writeFileSync(intentFile+'.tmp',JSON.stringify(intent,null,2),{mode:0o600});renameSync(intentFile+'.tmp',intentFile);};persist();
 const proof={runId,scenario,scope:'Same two authorized live QA owners and three devices. S03 disclosed exact record-write transport exception; N03 historical cross-device persona-draft subset only.',cases:[],passed:false,startedAt:new Date().toISOString()};
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
 const codes=new Set(['ERR_ASSERTION','REVISION_CONFLICT','RECORD_CONFLICT','CLOUD_SAVE_PENDING','CLOUD_UNAVAILABLE','READBACK_TIMEOUT','QA_SCOPE_DENIED','QA_GRANT_EXPIRED','QA_GRANT_REQUIRED','SESSION_CHANGED','PET_NOT_FOUND']);
 const safeError=e=>({code:codes.has(e?.code)?e.code:'SCOPED_CHECK_FAILED',detail:'Raw upstream error intentionally omitted.'});
 let faultInstalled=false;
 async function active(){await assertActive();for(const role of ['a','a2','b']){const s=await models[role].call('accounts','session');assert.equal(s.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');assert.equal(s.dataMode,'live');}await assertActive();}
 async function call(role,feature,command,payload={}){await active();return models[role].call(feature,command,payload);}
 async function raw(role,feature,command,payload={}){await active();return models[role].page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});}
 async function until(read,test){const start=Date.now();while(Date.now()-start<30000){await active();const x=await read();if(test(x))return x;await new Promise(r=>setTimeout(r,400));}throw Object.assign(Error(),{code:'READBACK_TIMEOUT'});}
 async function step(id,coverage,work){await active();const row={id,coverage,status:'running',fullCasePassed:false};proof.cases.push(row);save();try{Object.assign(row,await work());row.status='passed-scoped';}catch(e){row.status='failed';row.error=safeError(e);throw e;}finally{save();}}
 const snap=role=>call(role,'conversations','snapshot',{petId});
 const refresh=role=>call(role,'accounts','syncNow',{actionId:intent.refreshActionId});
 async function outbox(){await active();return models.a.main(({app},profile,owner)=>{
  const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path'),crypto=process.getBuiltinModule('node:crypto');
  if(fs.realpathSync.native(app.getPath('userData'))!==fs.realpathSync.native(profile))throw Error('Profile mismatch');
  const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
  const db=new(req('better-sqlite3'))(path.join(profile,'lingjing.sqlite'),{readonly:true,fileMustExist:true});
  try{db.pragma('query_only=ON');return db.prepare('SELECT action_id,changes_json,status FROM conversation_cloud_outbox WHERE owner_account_id=? ORDER BY created_at,rowid').all(owner).map(r=>({actionId:r.action_id,changesSha256:crypto.createHash('sha256').update(r.changes_json).digest('hex'),status:r.status,recordIds:JSON.parse(r.changes_json).map(c=>({collection:c.collection,id:c.id}))}));}finally{db.close();}
 },models.a.profile,setup.owner);}
 async function cleanupProbe(role){await models[role].main(async()=>{const s=globalThis.__liveQaPrivateProbe;if(!s)return;s.prototype.cloudContext=s.original;try{if(s.channel&&s.context)await s.context.client.removeChannel(s.channel);}finally{delete globalThis.__liveQaPrivateProbe;}});}
 async function removeFault(){if(!faultInstalled)return;await models.a.main(()=>{const f=globalThis.__liveQaRestartFault;if(f){f.prototype.request=f.original;delete globalThis.__liveQaRestartFault;}});faultInstalled=false;}
 try{
  await step('S03','Exact A-device record-write outage before receipt; readonly durable original outbox hash before restart, normal relaunch then same intent verified and one remote memory. Not physical adapter disconnect.',async()=>{
   await refresh('a');assert.equal((await call('a','accounts','syncStatus')).pending,0);const before=await outbox();assert.ok(before.every(x=>x.status!=='pending'));
   await active();await models.a.main((_electron,deviceId)=>{
    const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {SupabaseRemote}=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs');const prototype=SupabaseRemote.prototype;
    if(globalThis.__liveQaRestartFault||globalThis.__liveQaRecordFault)throw Error('Existing fault must not be replaced');
    const f={prototype,original:prototype.request,deviceId,attempts:[]};globalThis.__liveQaRestartFault=f;
    prototype.request=async function(name,body,...opaque){if(this.deviceId===deviceId&&name==='lingjing-records'&&body?.op==='write'){f.attempts.push(body.actionId);throw Object.assign(Error('Scoped pre-server transport failure'),{code:'CLOUD_UNAVAILABLE'});}return f.original.call(this,name,body,...opaque);};
   },expectedActors.a.deviceId);faultInstalled=true;
   const content=`QA-${runId}-restart-original-outbox`;intent.memorySubmitted=true;intent.memoryContentSha256=createHash('sha256').update(content).digest('hex');persist();
   const reply=await raw('a','conversations','memory.save',{petId,memory:{content}});assert.equal(reply.ok,false);assert.equal(reply.code,'CLOUD_SAVE_PENDING');
   const rows=await outbox(),added=rows.filter(x=>!before.some(b=>b.actionId===x.actionId));assert.equal(added.length,1);assert.equal(added[0].status,'pending');assert.equal(added[0].recordIds.length,1);assert.equal(added[0].recordIds[0].collection,'conversation_memories');
   intent.outbox=added[0];persist();
   const attempts=await models.a.main(()=>globalThis.__liveQaRestartFault.attempts);assert.ok(attempts.length>=1&&attempts.length<=6);assert.deepEqual([...new Set(attempts)],[added[0].actionId]);
   // Keep the fault installed until this exact process is stopped, so no flush
   // can sneak in before restart. Holder handles normal login without secrets.
   await active();models.a=await relaunch('a');faultInstalled=false;await active();
   await refresh('a');const after=await until(outbox,x=>x.some(r=>r.actionId===added[0].actionId&&r.status==='verified'));
   const original=after.find(r=>r.actionId===added[0].actionId);assert.equal(original.changesSha256,added[0].changesSha256);assert.deepEqual(original.recordIds,added[0].recordIds);
   const remote=await until(async()=>{await refresh('a2');return snap('a2');},x=>x.memories.filter(m=>m.content===content).length===1);
   const memory=remote.memories.find(m=>m.content===content);assert.equal(added[0].recordIds[0].id,JSON.stringify([petId,memory.id]));
   return {petId,originalOutboxActionId:original.actionId,originalChangesSha256:original.changesSha256,memoryId:memory.id,afterRestartStatus:original.status,remoteCount:1,blockedAttempts:attempts.length,uncovered:['physical network disconnection','lost response after server commit','independent database receipt query']};
  });
  await step('N03-cross-device-persona-draft','Actual A2 unsaved persona survives A authoritative same-original-revision update; conflict warning and explicit discard adopt latest. Not full N03 multi-page resize.',async()=>{
   await refresh('a2');const base=await snap('a'),other=await snap('a2');assert.equal(base.profile.revision,other.profile.revision);
   const page=models.a2.page;await active();await page.evaluate(()=>{location.hash='#/settings/ai';});await page.locator('.app-page-motion[data-current-route="true"][data-route-key="/settings/ai"]').waitFor({timeout:15000});
   await active();await page.locator(`.cv-partners button[data-pet-id="${petId}"]`).click();const field=page.getByRole('textbox',{name:'性格设定',exact:true});await field.waitFor({timeout:15000});await page.locator(`.cv-persona .cv-pet-scene[data-pet-id="${petId}"]`).waitFor({timeout:15000});await until(()=>page.locator(`.cv-partners button[data-pet-id="${petId}"]`).getAttribute('aria-pressed'),x=>x==='true');await until(()=>field.inputValue(),x=>x===base.profile.persona);
   const draft=`QA-${runId}-未提交草稿`,winner=`QA-${runId}-跨端较新原文`;await active();await field.fill(draft);
   intent.personaSubmitted=true;intent.personaBaseRevision=base.profile.revision;intent.personaWinner=winner;persist();
   await call('a','conversations','profile.save',{petId,profile:{...base.profile,persona:winner},revision:base.profile.revision});
   await until(async()=>{await refresh('a2');return snap('a2');},x=>x.profile.persona===winner&&x.profile.revision>base.profile.revision);
   const discard=page.getByRole('button',{name:'放弃草稿并载入最新人设',exact:true});await until(()=>discard.isVisible(),Boolean);assert.equal(await field.inputValue(),draft,'Remote refresh silently replaced original unsaved draft');
   await active();await discard.click();await until(()=>field.inputValue(),x=>x===winner);const remote=await snap('a');assert.equal(remote.profile.persona,winner);assert.ok(remote.profile.revision>base.profile.revision);
   return {petId,originalRevision:base.profile.revision,winnerRevision:remote.profile.revision,unsavedDraftPreserved:true,explicitDiscardAdoptedLatest:true,uncovered:['multiple-page resize and long-list dialogs','stale draft submit UI conflict resolution']};
  });
  await step('S05','Real B actor owner-mismatch endpoint rejection and exact A-memory RLS read denial with A positive control; finite realtime non-disclosure observation, not universal channel denial.',async()=>{
   const memory=(await snap('a')).memories.find(m=>m.id===setup.memoryId);assert.ok(memory);const recordId=JSON.stringify([petId,memory.id]);
   for(const role of ['a','b']){
    await active();await models[role].main((_electron,expectedOwner)=>{
     const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {SupabaseRemote}=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs');const prototype=SupabaseRemote.prototype;
     if(globalThis.__liveQaPrivateProbe)throw Error('Probe already exists');const state={prototype,original:prototype.cloudContext,context:null,events:0,channel:null,status:null};globalThis.__liveQaPrivateProbe=state;
     prototype.cloudContext=async function(...args){const context=await state.original.apply(this,args);if(context.ownerAccountId===expectedOwner){state.context=context;prototype.cloudContext=state.original;}return context;};
    },expectedActors[role].ownerAccountId);
    // Only a normal application's own read obtains its already-authorized context.
    await call(role,'conversations','snapshot',role==='a'?{petId}:{});
   }
   async function probe(role,op){await active();return models[role].main(async(_electron,op,ownOwner,foreignOwner,recordId,channelName)=>{
    const s=globalThis.__liveQaPrivateProbe,c=s?.context;if(!c||c.ownerAccountId!==ownOwner)throw Error('Exact actor context unavailable');
    if(op==='read'){
     const reply=await c.client.from('lingjing_personal_records').select('owner_id,collection,record_id,revision,document').eq('owner_id',foreignOwner).eq('collection','conversation_memories').eq('record_id',recordId);
     if(reply.error)throw Error('RLS query failed, not a denial proof');
     const crypto=process.getBuiltinModule('node:crypto');return {count:reply.data.length,rows:reply.data.map(r=>({owner:r.owner_id,id:r.record_id,revision:r.revision,documentSha256:crypto.createHash('sha256').update(JSON.stringify(r.document)).digest('hex')}))};
    }
    if(op==='owner-mismatch'){
     try{await c.invoke('companions-sync',{op:'snapshot',ownerAccountId:foreignOwner});return {rejected:false};}catch(error){return {rejected:true,code:error.code==='OWNER_MISMATCH'?error.code:'UNEXPECTED_ERROR',httpStatus:error.httpStatus};}
    }
    if(op==='subscribe'){
     if(s.channel)throw Error('Existing channel');s.channel=c.client.channel(channelName).on('postgres_changes',{event:'*',schema:'public',table:'lingjing_personal_records',filter:`owner_id=eq.${foreignOwner}`},payload=>{if(payload.new?.record_id===recordId||payload.old?.record_id===recordId)s.events++;});
     s.channel.subscribe(status=>{s.status=status;});return {started:true};
    }
    if(op==='state')return {status:s.status,events:s.events};throw Error('Unsupported probe');
   },op,expectedActors[role].ownerAccountId,setup.owner,recordId,`qa-record-boundary:${runId}:${role}`);}
   const positive=await probe('a','read');assert.equal(positive.count,1);assert.equal(positive.rows[0].owner,setup.owner);
   const denied=await probe('b','owner-mismatch');assert.equal(denied.rejected,true);assert.equal(denied.code,'OWNER_MISMATCH');assert.equal(denied.httpStatus,403);
   const negative=await probe('b','read');assert.equal(negative.count,0);
   for(const role of ['a','b']){await probe(role,'subscribe');await until(()=>probe(role,'state'),x=>x.status==='SUBSCRIBED');}
   intent.s05MemoryEditSubmitted=true;intent.s05OriginalMemoryId=memory.id;intent.s05BaseRevision=memory.revision;persist();
   const content=`QA-${runId}-S05-真实私有事件`;await call('a','conversations','memory.save',{petId,memory:{id:memory.id,revision:memory.revision,content}});
   await until(()=>snap('a2'),x=>x.memories.some(m=>m.id===memory.id&&m.content===content));await until(()=>probe('a','state'),x=>x.events>0);
   const untilAt=Date.now()+8000;while(Date.now()<untilAt){await active();assert.equal((await probe('b','state')).events,0);await new Promise(r=>setTimeout(r,400));}
   const finalA=await probe('a','read'),finalB=await probe('b','read');assert.equal(finalB.count,0);const bLocal=await call('b','conversations','snapshot');assert.equal(bLocal.accountId,expectedActors.b.ownerAccountId);assert.ok(!(bLocal.memories||[]).some(m=>m.id===memory.id));assert.ok(!bLocal.pets.some(p=>p.petId===petId));assert.ok(finalA.rows[0].revision>positive.rows[0].revision);
   for(const role of ['a','b'])await cleanupProbe(role);
   return {petId,memoryId:memory.id,knownRecordId:recordId,serverOwnerRejection:denied,positiveControl:positive,afterWritePositiveControl:finalA,foreignReadCount:0,realtimeObservationMs:8000,foreignEvents:0,ownEventPositiveControl:true,uncovered:['universal channel denial','all private collections','same-device owner swap']};
  });
  await step('P05-repeat-original-memory-restore','Normal account export/import and preserved-record adoption UI, same original memory ID and unchanged backup bytes across restore/delete/reimport. File chooser bridge explicitly partial, no native-picker claim.',async()=>{
   const original=(await snap('a')).memories.find(m=>m.id===setup.memoryId);assert.ok(original);const recordId=JSON.stringify([petId,original.id]);
   const directory=join(models.a.profile,`live-record-backup-${runId}`);mkdirSync(directory);const exported=join(directory,'original.lingjing.json');
   function contained(file){const rel=relative(realpathSync.native(models.a.profile),realpathSync.native(file));assert.ok(rel&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')&&!isAbsolute(rel));assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());return file;}
   function readBackup(file){const bytes=readFileSync(contained(file)),value=JSON.parse(bytes),{checksum:expected,...body}=value;assert.equal(checksum(body),expected);assert.equal(value.ownerAccountId,setup.owner);assert.equal(value.provenance.mode,'live');return {bytes,value,sha256:createHash('sha256').update(bytes).digest('hex')};}
   function memoryIn(value){const found=[];function visit(x){if(!x||typeof x!=='object')return;if(x.id===original.id&&x.content!==undefined)found.push(x);for(const child of Object.values(x))visit(child);}visit(value.data.modules.conversations.data);return found;}
   async function account(){await active();await models.a.page.evaluate(()=>{location.hash='#/account';});await models.a.page.locator('.app-page-motion[data-current-route="true"][data-route-key="/account"]').waitFor({timeout:15000});await models.a.page.getByRole('button',{name:'导出本地备份',exact:true}).waitFor({timeout:15000});}
   async function picker(kind,file){await active();if(kind==='open')contained(file);else assert.equal(existsSync(file),false);
    await models.a.main(({dialog},kind,file)=>{if(globalThis.__liveRecordPicker)throw Error('Pending chooser');const method=kind==='save'?'showSaveDialog':'showOpenDialog',original=dialog[method];globalThis.__liveRecordPicker={method,original};globalThis.__liveRecordPickerConsumed=false;dialog[method]=async(...args)=>{const title=kind==='save'?'导出灵境账号备份':'选择灵境账号备份';if(args.at(-1)?.title!==title)throw Error('Unexpected chooser');dialog[method]=original;delete globalThis.__liveRecordPicker;globalThis.__liveRecordPickerConsumed=true;return kind==='save'?{canceled:false,filePath:file}:{canceled:false,filePaths:[file]};};},kind,file);}
   async function consumed(){assert.equal(await models.a.main(()=>globalThis.__liveRecordPickerConsumed),true);}
   await account();await picker('save',exported);intent.backupExportClicked=true;persist();await active();await models.a.page.getByRole('button',{name:'导出本地备份',exact:true}).click();await models.a.page.locator('.ac-feedback [role="status"]').filter({hasText:'备份已导出。'}).waitFor({timeout:15000});await consumed();const saved=readBackup(exported);assert.ok(memoryIn(saved.value).some(m=>m.content===original.content));intent.originalBackupSha256=saved.sha256;persist();
   intent.memoryEditSubmitted=true;persist();await call('a','conversations','memory.save',{petId,memory:{id:original.id,content:`QA-${runId}-修改后原ID`,revision:original.revision}});
   const edited=await until(()=>snap('a2'),x=>x.memories.some(m=>m.id===original.id&&m.content!==original.content));const edit=edited.memories.find(m=>m.id===original.id);assert.ok(edit.revision>original.revision);
   async function restoreAndAdopt(cycle){
    await account();const receipts=(await call('a','accounts','backupList')).map(r=>r.id);await picker('open',exported);await active();await models.a.page.getByRole('button',{name:'恢复本地备份',exact:true}).click();const dialog=models.a.page.getByRole('dialog',{name:'预览恢复内容',exact:true});await dialog.waitFor({timeout:15000});await consumed();
    intent[`restore${cycle}Clicked`]=true;persist();await active();await dialog.getByRole('button',{name:'确认导入',exact:true}).click();await dialog.waitFor({state:'hidden',timeout:20000});await models.a.page.locator('.ac-feedback [role="status"]').filter({hasText:'导入完成，原存档已备份'}).waitFor({timeout:15000});
    const added=(await call('a','accounts','backupList')).filter(r=>!receipts.includes(r.id)&&r.reason==='before-record-import');assert.equal(added.length,1);const protection=readBackup(added[0].filePath);
    if(cycle===1)assert.ok(memoryIn(protection.value).some(m=>m.content===edit.content));else assert.equal(memoryIn(protection.value).length,0,'Second protection must retain pre-restore absence after original delete');
    const records=await call('a','accounts','preservedRecords');const match=records.filter(r=>r.collection==='conversation_memories'&&r.id===recordId&&r.local?.content===original.content);assert.equal(match.length,1,'Same original memory difference must reopen after deletion');
    const collapse=models.a.page.getByRole('button',{name:'收起保留记录',exact:true});if(await collapse.isVisible()){await active();await collapse.click();await models.a.page.locator('section[aria-label="保留的本机记录"]').waitFor({state:'hidden',timeout:15000});}const toggle=models.a.page.getByRole('button',{name:'查看保留记录',exact:true});await toggle.waitFor({timeout:15000});await active();await toggle.click();
    const card=models.a.page.locator('section[aria-label="保留的本机记录"] > section.ac-card').filter({has:models.a.page.getByText(original.content,{exact:true})});await card.waitFor({timeout:15000});assert.equal(await card.count(),1);
    intent[`adoptOriginal${cycle}Clicked`]=true;intent[`restore${cycle}Reason`]=match[0].reason;persist();await active();await card.getByRole('button',{name:'采用原记录',exact:true}).click();
    const after=await until(()=>snap('a2'),x=>x.memories.some(m=>m.id===original.id&&m.content===original.content));assert.deepEqual(readFileSync(exported),saved.bytes);
    return {protectionId:added[0].id,protectionSha256:protection.sha256,reason:match[0].reason,memory:after.memories.find(m=>m.id===original.id)};
   }
   const first=await restoreAndAdopt(1);assert.ok(first.memory.revision>edit.revision);
   intent.memoryDeleteSubmitted=true;persist();await call('a','conversations','memory.delete',{petId,id:original.id,revision:first.memory.revision});await until(()=>snap('a2'),x=>!x.memories.some(m=>m.id===original.id));
   const second=await restoreAndAdopt(2);assert.ok(second.memory.revision>first.memory.revision);assert.notEqual(second.reason,first.reason,'A new restore intent must reopen conflict without changing the original record ID');
   assert.deepEqual(readFileSync(exported),saved.bytes);return {petId,memoryId:original.id,backupSha256:saved.sha256,firstRestore:first,secondRestore:second,originalBackupUnchanged:true,sameOriginalRecordId:true,nativeFilePickerExercised:false};
  });
  proof.definitionBoundary='Frozen original98 contains S01–S06 only; no S07/S08 case IDs were found. No invented mapping.';
  assert.deepEqual(proof.cases.map(x=>x.id),['S03','N03-cross-device-persona-draft','S05','P05-repeat-original-memory-restore']);proof.passed=true;
 }catch(e){proof.error=safeError(e);proof.passed=false;}
 finally{
  const cleanupErrors=[];
  for(const [component,cleanup] of [
   ['record-write-fault',removeFault],
   ['a-private-probe',()=>cleanupProbe('a')],
   ['b-private-probe',()=>cleanupProbe('b')],
   ['owned-file-picker',()=>models.a.main(({dialog})=>{const p=globalThis.__liveRecordPicker;if(p){dialog[p.method]=p.original;delete globalThis.__liveRecordPicker;}})]
  ]){try{await cleanup();}catch(e){cleanupErrors.push({component,...safeError(e)});}}
  if(cleanupErrors.length){proof.cleanupErrors=cleanupErrors;proof.passed=false;}
  proof.completedAt=new Date().toISOString();save();
 }
 return proof;
}
