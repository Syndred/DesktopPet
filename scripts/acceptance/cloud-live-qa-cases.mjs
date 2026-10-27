// Business-only live QA cases. Holder owns credentials, registration, device binding,
// scope/grant validation and normal UI login. This module never receives secrets.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';

export async function runCloudLiveQaCases({models,expectedActors,relaunch,assertActive,scenario,runId,output}){
 assert.equal(typeof assertActive,'function');assert.equal(typeof relaunch,'function');assert.match(runId,/^[a-zA-Z0-9_-]{8,100}$/);
 assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);assert.notEqual(expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId);
 assert.equal(new Set(Object.values(expectedActors).map(a=>a.deviceId)).size,3);
 mkdirSync(output,{recursive:true});const file=join(output,'live-business-evidence.json'),intentFile=join(output,'live-business-intents.json');
 const ids=existsSync(intentFile)?JSON.parse(readFileSync(intentFile)): {runId,scenario,owners:{a:expectedActors.a.ownerAccountId,b:expectedActors.b.ownerAccountId},adoptA:randomUUID(),adoptB:randomUUID(),refresh:randomUUID()};
 assert.equal(ids.runId,runId);assert.equal(ids.scenario,scenario);assert.deepEqual(ids.owners,{a:expectedActors.a.ownerAccountId,b:expectedActors.b.ownerAccountId});
 if(!existsSync(intentFile))writeFileSync(intentFile,JSON.stringify(ids,null,2),{flag:'wx'});
 const proof={runId,scenario,scope:'Live dedicated QA owners only. S02 covers synthetic pets/persona/memory, not all game domains. S06 uses a disclosed local transport-error injection, never a fabricated remote success.',cases:[],startedAt:new Date().toISOString(),passed:false};
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
 const safeCodes=new Set(['ERR_ASSERTION','READBACK_TIMEOUT','REVISION_CONFLICT','RECORD_CONFLICT','CLOUD_UNAVAILABLE','CLOUD_SAVE_PENDING','SESSION_CHANGED','PET_NOT_FOUND','QA_SCOPE_DENIED','QA_GRANT_EXPIRED','QA_GRANT_REQUIRED','ACTION_ID_REUSED','ACTION_ID_CONFLICT','TimeoutError','AssertionError']);
 const summaryError=error=>({code:safeCodes.has(error?.code)?error.code:safeCodes.has(error?.name)?error.name:'CASE_FAILED',detail:'Case did not meet its scoped checks; raw upstream error omitted.'});

 async function active(){await assertActive();for(const role of ['a','a2','b']){const x=await models[role].call('accounts','session');assert.equal(x.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(x.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(x.currentUser?.authKind,'supabase');assert.equal(x.dataMode,'live');}}
 async function call(role,feature,command,payload={}){await active();return models[role].call(feature,command,payload);}
 async function raw(role,feature,command,payload={}){await active();return models[role].page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});}
 async function until(read,test,label){const start=Date.now();let last;while(Date.now()-start<25000){await assertActive();last=await read();if(test(last))return last;await new Promise(r=>setTimeout(r,350));}const e=Error(label);e.code='READBACK_TIMEOUT';throw e;}
 async function step(id,coverage,work){await active();const row={id,coverage,status:'running',at:new Date().toISOString()};proof.cases.push(row);save();try{Object.assign(row,await work());row.status='passed-scoped';}catch(error){row.status='failed';row.error=summaryError(error);throw error;}finally{row.completedAt=new Date().toISOString();save();}}
 const snap=(role,petId)=>call(role,'conversations','snapshot',petId?{petId}:{});
 const refresh=role=>call(role,'accounts','syncNow',{actionId:ids.refresh});
 async function route(role,path){await active();const page=models[role].page;await page.evaluate(path=>{location.hash='#'+path;},path);const current=page.locator(`.app-page-motion[data-route-key="${path}"][data-current-route="true"]`);await current.waitFor({timeout:15000});await current.locator('h1').first().waitFor({timeout:15000});return current;}
 async function adopt(role,id){const result=await raw(role,'companions','adopt',{actionId:id,templateId:'animal-wood-deer',name:'云端专用验收',showOnDesktop:false});if(!result.ok){const error=Error('Adoption result not confirmed. Original intent retained; do not substitute a new actionId.');error.code=result.code;throw error;}const pet=result.data.pet;assert.equal(pet.ownerAccountId,expectedActors[role].ownerAccountId);return pet;}
 let petA,petB,profileWinner,memoryContent=`QA-${runId}-记忆`,faultInstalled=false;
 async function removeFault(){if(!faultInstalled)return null;const result=await models.a.main(()=>{const state=globalThis.__liveQaRecordFault;if(!state)return null;state.prototype.request=state.original;const result={attempts:state.attempts,blocked:state.blocked};delete globalThis.__liveQaRecordFault;return result;});faultInstalled=false;return result;}
 try{
  await active();
  await step('S01','Public owner/device manifest check and one synthetic cloud username update; second normal logged-in app confirms remote readback',async()=>{
   const before=await call('a','accounts','session'),username=`QA${runId.slice(0,12)}甲`;
   let reply={ok:true,data:{currentUser:before.currentUser}};if(before.currentUser.username!==username){assert.ok(!ids.profileSubmitted,'Profile result uncertain: independent readback required, never resubmit automatically');ids.profileSubmitted=true;writeFileSync(intentFile,JSON.stringify(ids,null,2));reply=await raw('a','accounts','profileSave',{username,revision:before.currentUser.revision});}
   // This command has no idempotency key. Even a lost response must not be resent.
   models.a2=await relaunch('a2');await active();const remote=await call('a2','accounts','session');
   assert.equal(remote.currentUser.username,username,'Independent normal login did not confirm profile update');
   assert.ok(remote.currentUser.revision>=before.currentUser.revision);
   if(reply.ok&&before.currentUser.username!==username)assert.ok(reply.data.currentUser.revision>before.currentUser.revision);
   return {owner:remote.currentUser.id,devices:Object.values(expectedActors).map(x=>({owner:x.ownerAccountId,deviceId:x.deviceId})),independentUsernameMatched:true,replyConfirmed:reply.ok,replyCode:reply.ok?null:safeCodes.has(reply.code)?reply.code:'CASE_FAILED',localRevisionBefore:before.currentUser.revision,localRevisionAfter:reply.ok?reply.data.currentUser.revision:null};
  });
  await step('S02','Partial: one new own pet, persona and memory synchronize to same-owner second device using normal cloud read paths; game domains not covered',async()=>{
   petA=await adopt('a',ids.adoptA);await until(async()=>{await refresh('a2');return call('a2','companions','list');},x=>x.pets.some(p=>p.petId===petA.petId),'Second device did not see original pet');
   const before=await snap('a',petA.petId),persona=`QA-${runId}-温柔简洁`;
   if(before.profile.persona!==persona)await call('a','conversations','profile.save',{petId:petA.petId,profile:{...before.profile,persona},revision:before.profile.revision});
   // A single save only; if its reply is uncertain, no new memory ID is invented.
   let memoryReply={ok:false,code:'PREVIOUS_INTENT_READBACK'};if(!ids.memorySubmitted){ids.memorySubmitted=true;writeFileSync(intentFile,JSON.stringify(ids,null,2));memoryReply=await raw('a','conversations','memory.save',{petId:petA.petId,memory:{content:memoryContent}});}
   await refresh('a');const remote=await until(()=>snap('a2',petA.petId),x=>x.profile.persona===persona&&x.memories.filter(m=>m.content===memoryContent).length===1,'Second device persona/memory readback incomplete');
   assert.equal(remote.accountId,expectedActors.a.ownerAccountId);profileWinner=remote.profile;
   return {owner:remote.accountId,petId:petA.petId,memoryId:remote.memories.find(m=>m.content===memoryContent).id,profileRevision:remote.profile.revision,memoryReplyConfirmed:memoryReply.ok,uncovered:['battle records','territory','inventory','all-domain preference sync']};
  });
  await step('A11','Partial live QA owner isolation: distinct owner cannot see A pet/persona/memory; own pet is absent from A. No old production or populated battle-history claims',async()=>{
   const beforeA=await snap('a2',petA.petId),foreign=await call('b','companions','list');assert.ok(!foreign.pets.some(p=>p.petId===petA.petId));
   const denied=await raw('b','companions','get',{petId:petA.petId});assert.equal(denied.ok,false);assert.equal(denied.code,'PET_NOT_FOUND','Transport/permission failures do not prove owner isolation');
   const foreignChat=await raw('b','conversations','snapshot',{petId:petA.petId});if(foreignChat.ok){assert.equal(foreignChat.data.accountId,expectedActors.b.ownerAccountId);assert.notEqual(foreignChat.data.petId,petA.petId);assert.ok(!(foreignChat.data.memories||[]).some(m=>m.content===memoryContent));}else assert.equal(foreignChat.code,'PET_NOT_FOUND','Unrelated remote failure does not prove private chat isolation');
   petB=await adopt('b',ids.adoptB);const aPets=await call('a2','companions','list');assert.ok(!aPets.pets.some(p=>p.petId===petB.petId));assert.deepEqual((await snap('a2',petA.petId)).memories,beforeA.memories);
   return {ownerA:expectedActors.a.ownerAccountId,ownerB:expectedActors.b.ownerAccountId,petA:petA.petId,petB:petB.petId,foreignReadDenied:denied.code,uncovered:['same-device user swap','populated battle/message history','desktop preferences']};
  });
  await step('S04','Same original persona revision submitted from two devices: winner persists and stale write cannot silently overwrite',async()=>{
   const a=await snap('a',petA.petId),other=await snap('a2',petA.petId);assert.equal(a.profile.revision,other.profile.revision);
   const base=structuredClone(a.profile),winner=`QA-${runId}-CAS胜出`,loser=`QA-${runId}-CAS旧版本`;
   await call('a','conversations','profile.save',{petId:petA.petId,profile:{...base,persona:winner},revision:base.revision});
   const stale=await raw('a2','conversations','profile.save',{petId:petA.petId,profile:{...base,persona:loser},revision:base.revision});assert.equal(stale.ok,false,'Stale original revision must not succeed');assert.ok(['REVISION_CONFLICT','RECORD_CONFLICT'].includes(stale.code),'Only explicit revision/record conflict proves CAS; network/grant failure is not a pass');
   const remote=await until(()=>snap('a',petA.petId),x=>x.profile.persona===winner,'CAS winner was overwritten');const second=await snap('a2',petA.petId);assert.equal(second.profile.persona,winner);assert.ok(remote.profile.revision>base.revision);profileWinner=remote.profile;
   return {petId:petA.petId,originalRevision:base.revision,winnerRevision:remote.profile.revision,staleCode:stale.code,conflictLayer:stale.code==='REVISION_CONFLICT'?'local revision gate after authoritative refresh':'remote record CAS',serverCasProven:stale.code==='RECORD_CONFLICT',winnerReadbackBothApps:true,uncovered:['offline divergent edits and manual preserved-record resolution']};
  });
  await step('S06','Simulated precise records transport failure before server receipt; original outbox action retried through normal UI refresh and independently appears exactly once',async()=>{
   assert.ok(!ids.faultMemorySubmitted,'Existing uncertain fault-memory intent: do not create another memory');
   await refresh('a');const state=await call('a','accounts','syncStatus');assert.equal(state.pending,0,'Do not inject fault around unrelated pending writes');
   await models.a.main((_electron,deviceId)=>{
    const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
    const {SupabaseRemote}=req(process.resourcesPath+'/app.asar/apps/pc-app/runtime/features/accounts/supabase-remote.cjs');const prototype=SupabaseRemote.prototype;
    if(globalThis.__liveQaRecordFault)throw Error('Fault hook already installed');
    const fault={prototype,original:prototype.request,deviceId,blocking:true,blocked:0,attempts:[]};globalThis.__liveQaRecordFault=fault;
    prototype.request=async function(name,body,...opaque){if(this.deviceId===deviceId&&name==='lingjing-records'&&body?.op==='write'){fault.attempts.push({actionId:body.actionId,blocked:fault.blocking});if(fault.blocking){fault.blocked++;const error=Error('Dedicated QA simulated transport failure');error.code='CLOUD_UNAVAILABLE';throw error;}}return fault.original.call(this,name,body,...opaque);};
   },expectedActors.a.deviceId);faultInstalled=true;
   const content=`QA-${runId}-单次失败重试`;
   ids.faultMemorySubmitted=true;writeFileSync(intentFile,JSON.stringify(ids,null,2));
   const failed=await raw('a','conversations','memory.save',{petId:petA.petId,memory:{content}});assert.equal(failed.ok,false);assert.equal(failed.code,'CLOUD_SAVE_PENDING');
   const failedState=await until(()=>call('a','accounts','syncStatus'),x=>x.pending>0&&!x.running,'Fault must leave a visible pending operation and end busy');assert.ok(failedState.pending>0);
   const observed=await models.a.main(()=>{const fault=globalThis.__liveQaRecordFault;fault.blocking=false;return {blocked:fault.blocked,attempts:[...fault.attempts]};});assert.ok(observed.blocked>=1&&observed.blocked<=6,'Unexpected retry storm');assert.equal(new Set(observed.attempts.map(x=>x.actionId)).size,1);
   // Normal account refresh flushes the existing durable outbox; never save again.
   await route('a','/account');const button=models.a.page.getByRole('button',{name:'刷新云端数据',exact:true});await button.click();await until(()=>button.isEnabled(),Boolean,'Refresh busy did not end');
   const verified=await until(()=>snap('a2',petA.petId),x=>x.memories.filter(m=>m.content===content).length===1,'Retried original memory did not reach second app exactly once');
   const after=await call('a','accounts','syncStatus');assert.equal(after.pending,0);assert.equal(Boolean(after.running),false);const retried=await removeFault();assert.ok(retried.attempts.some(x=>!x.blocked));assert.equal(new Set(retried.attempts.map(x=>x.actionId)).size,1,'Retry must reuse the exact original durable actionId');
   return {petId:petA.petId,originalOutboxActionId:observed.attempts[0].actionId,blockedAttempts:observed.blocked,verifiedRetryAttempts:retried.attempts.filter(x=>!x.blocked).length,memoryId:verified.memories.find(m=>m.content===content).id,secondDeviceCount:1,networkFault:'local pre-server request exception; no fabricated remote reply',uncovered:['actual physical disconnect','response lost after server commit']};
  });
  proof.passed=true;
 }catch(error){proof.error=summaryError(error);proof.passed=false;}
 finally{try{const recovered=await removeFault();if(recovered)proof.faultRestored=true;}catch(error){proof.faultCleanupError=summaryError(error);proof.passed=false;}proof.completedAt=new Date().toISOString();save();}
 return proof;
}
