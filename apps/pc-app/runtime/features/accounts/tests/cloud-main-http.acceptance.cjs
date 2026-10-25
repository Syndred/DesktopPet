const assert=require('node:assert/strict');
const {randomUUID,randomBytes}=require('node:crypto');const {mkdirSync,readFileSync,writeFileSync}=require('node:fs');
const {join,resolve}=require('node:path');const {execFileSync}=require('node:child_process');const {DatabaseSync}=require('node:sqlite');
const {SupabaseRemote,publicConfig}=require('../supabase-remote.cjs');const {AccountsService}=require('../service.cjs');const {migrations}=require('../schema.cjs');const {checksum}=require('../util.cjs');
const config=publicConfig();assert.equal(new URL(config.url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');
const output=resolve(process.env.ACCOUNTS_CLOUD_HTTP_EVIDENCE||`artifacts/accounts/cloud-main-http-${Date.now()}`);mkdirSync(output,{recursive:true});
const account=`mainqa_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
const evidence={at:new Date().toISOString(),projectRef:'jbvrdmrkwpznbrvteive',sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Actual HTTPS Supabase + production AccountsService/SupabaseRemote + independent SQLite profiles in one Node process. Not Electron or two physical devices.',
 credentialsPersisted:false,checks:[]};
const models=[];
function model(name){
 const directory=join(output,name);mkdirSync(directory,{recursive:true});const db=new DatabaseSync(join(directory,'state.sqlite'));db.exec('PRAGMA foreign_keys=ON');migrations.forEach(m=>db.exec(m.sql));
 const remote=new SupabaseRemote({userData:directory,config});const accounts=new AccountsService({services:{db,paths:{userData:directory,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit(){}}},remote,host:{async apply(){},clear(){},dispose(){}}});
 const result={accounts,db,remote,directory};models.push(result);return result;
}
function pass(name,data){evidence.checks.push({name,data});console.log('PASS',name);writeFileSync(join(output,'progress.json'),JSON.stringify(evidence,null,2));}
async function settings(model,volume){const current=model.accounts.settings();current.document.sync.enabled=true;if(volume!==undefined)current.document.desktop.volume=volume;return model.accounts.saveSettings({...current,actionId:randomUUID()});}
async function sync(model,id=randomUUID()){const owner=model.accounts.requireOwner();model.accounts.sync.enqueue(owner,id);return model.accounts.sync.flush(owner,true);}
async function restore(model){const owner=model.accounts.requireOwner(),preview=await model.accounts.sync.previewCloud(owner);return model.accounts.restoreBackup({previewId:preview.previewId,actionId:randomUUID(),mode:'replace'});}
function reseal(envelope){const{checksum:ignored,...body}=envelope;return{...body,checksum:checksum(body)};}
async function raw(body,device,token){const response=await fetch(`${config.url}/functions/v1/lingjing-save`,{method:'POST',headers:{apikey:config.key,'content-type':'application/json',
 'X-Lingjing-Device-Id':device,...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});return{status:response.status,body:await response.json()};}
(async()=>{
 const a=model('device-a'),b=model('device-b'),c=model('other-account');
 await a.accounts.authenticate({provider:'runtime',account,password,confirmPassword:password,username:'云存档验收甲'},true);
 await b.accounts.authenticate({provider:'runtime',account,password});
 await c.accounts.authenticate({provider:'runtime',account:`${account}_b`,password,confirmPassword:password,username:'云存档验收乙'},true);
 const owner=a.accounts.requireOwner();assert.equal(b.accounts.requireOwner(),owner);assert.notEqual(a.remote.deviceId,b.remote.deviceId);
 assert.equal(a.accounts.privateSession().sessionToken,null);assert.ok(!JSON.stringify(a.accounts.session()).includes(a.remote.active.accessToken));
 pass('actual main-process Auth, same stable owner, distinct device/session, no renderer token',{owner,deviceA:a.remote.deviceId,deviceB:b.remote.deviceId,sessionA:a.remote.active.actor.sessionId,sessionB:b.remote.active.actor.sessionId});
 const anon=await raw({op:'read'},a.remote.deviceId);assert.equal(anon.status,401);
 const fake=await raw({op:'read'},a.remote.deviceId,'eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjF9.Zm9yZ2Vk');assert.equal(fake.status,401);pass('anonymous and forged save HTTP rejected',{anonymous:anon.status,forged:fake.status});
 await settings(a,21);await settings(b,22);const firstId=randomUUID(),first=await sync(a,firstId);assert.equal(first.verified,true);assert.equal(first.revision,1);
 const readB=await b.remote.cloudSave('read',b.accounts.privateSession());assert.equal(readB.envelope.data.modules.settings.data.desktop.volume,21);
 pass('device A CAS receipt independently read by actual device B HTTPS',{actionId:first.actionId,revision:first.revision,checksum:first.checksum});
 const conflictId=randomUUID();b.accounts.sync.enqueue(owner,conflictId);await assert.rejects(b.accounts.sync.flush(owner,true),{code:'SYNC_CONFLICT'});
 const retained=b.db.prepare('select * from account_sync_outbox where action_id=?').get(conflictId);assert.equal(retained.status,'conflict');
 assert.equal(JSON.parse(retained.document).data.modules.settings.data.desktop.volume,22);assert.equal(b.accounts.settings().document.desktop.volume,22);
 pass('stale second-device CAS retains its actual SQLite outbox and local settings',{actionId:conflictId,status:retained.status});
 const restored=await restore(b);assert.equal(b.accounts.settings().document.desktop.volume,21);assert.ok(restored.preservedBackup.filePath);
 assert.equal(JSON.parse(readFileSync(restored.preservedBackup.filePath,'utf8')).data.modules.settings.data.desktop.volume,22);
 await settings(b,22);const second=await sync(b);assert.equal(second.revision,2);assert.equal(second.verified,true);pass('explicit verified cloud restore preserves old file, then advances common CAS',{revision:second.revision,backup:restored.preservedBackup.filePath});
 const ctxC=await c.accounts.requireCloudActor();const cross=await ctxC.client.from('lingjing_saves').select('owner_id').eq('owner_id',owner);assert.equal(cross.error,null);assert.deepEqual(cross.data,[]);
 const direct=await ctxC.client.from('lingjing_saves').delete().eq('owner_id',owner);assert.ok(direct.error);
 await assert.rejects(c.remote.cloudSave('read',c.accounts.privateSession(),{ownerAccountId:owner}),{code:'OWNER_MISMATCH'});pass('real Data API RLS and grants block cross-owner/read/write',{rows:cross.data.length,directWriteCode:direct.error.code});
 const state=await a.remote.cloudSave('read',a.accounts.privateSession());
 const forged=structuredClone(state.envelope);forged.data.modules.garden={version:1,data:{coins:999999}};
 await assert.rejects(a.remote.cloudSave('push',a.accounts.privateSession(),{actionId:randomUUID(),baseRevision:2,envelope:reseal(forged)}),{code:'PROTECTED_STATE_REQUIRES_AUTHORITY'});
 const originalAction=JSON.parse(a.db.prepare('select document from account_sync_outbox where action_id=?').get(firstId).document);originalAction.data.modules.settings.data.desktop.volume=98;
 await assert.rejects(a.remote.cloudSave('push',a.accounts.privateSession(),{actionId:firstId,baseRevision:0,envelope:reseal(originalAction)}),{code:'ACTION_ID_REUSED'});
 assert.equal((await a.remote.cloudSave('read',a.accounts.privateSession())).revision,2);pass('valid checksums cannot forge economic state or reuse an action ID',{headRevision:2});
 const old=structuredClone(state.envelope);old.data.modules.legacy={version:1,data:{pets:[{id:'kept-original-pet-id',level:41}],coins:987654}};
 const archiveId=randomUUID(),archive=await a.remote.cloudSave('archive',a.accounts.privateSession(),{actionId:archiveId,reason:'unverified-local',envelope:reseal(old)});
 assert.equal(archive.promoted,false);const archiveAgain=await a.remote.cloudSave('archive',a.accounts.privateSession(),{actionId:archiveId,reason:'unverified-local',envelope:reseal(old)});assert.equal(archiveAgain.id,archive.id);
 const authority=await a.remote.cloudSave('read',a.accounts.privateSession());assert.equal(authority.revision,2);assert.equal(authority.envelope.data.modules.legacy,undefined);
 pass('actual old-style archive keeps original pet/progress without elevating inventory',{archiveId:archive.id,promoted:false,headRevision:2});
 await restore(a);await settings(a,33);const lostId=randomUUID();a.accounts.sync.enqueue(owner,lostId);const realFetch=a.remote.fetcher;let loseOnce=true;
 a.remote.fetcher=async(url,options)=>{const response=await realFetch(url,options);if(loseOnce&&url.endsWith('/lingjing-save')&&JSON.parse(options.body).op==='push'&&response.ok){loseOnce=false;throw new Error('Controlled lost response AFTER real server commit');}return response;};
 await assert.rejects(a.accounts.sync.flush(owner,true),{code:'CLOUD_UNAVAILABLE'});assert.equal(a.db.prepare('select status from account_sync_outbox where action_id=?').get(lostId).status,'retry');
 a.remote.fetcher=realFetch;const retried=await a.accounts.sync.flush(owner,true);assert.equal(retried.revision,3);assert.equal(retried.verified,true);
 assert.equal((await a.remote.cloudSave('read',a.accounts.privateSession())).revision,3);pass('actual committed response loss retries same prepared action once',{actionId:lostId,revision:3,lossInjectedAfterActualHttpsCommit:true});
 await settings(a,44);const offlineId=randomUUID();a.accounts.sync.enqueue(owner,offlineId);
 a.remote.fetcher=async()=>fetch('https://127.0.0.1:1',{signal:AbortSignal.timeout(3000)}); // Actual refused socket; no JWT is sent to the probe.
 await assert.rejects(a.accounts.sync.flush(owner,true),{code:'CLOUD_UNAVAILABLE'});const retry=a.db.prepare('select * from account_sync_outbox where action_id=?').get(offlineId);assert.equal(retry.status,'retry');
 a.remote.fetcher=realFetch;const recovered=await a.accounts.sync.flush(owner,true);assert.equal(recovered.revision,4);pass('controlled real connection refusal retains SQLite queue and reconnect readback',{actionId:offlineId,statusDuringFailure:retry.status,revision:4,scope:'per-request closed localhost TLS socket; host network was not disabled'});
 const previousProof=a.remote.active;await a.accounts.logout();assert.equal((await a.accounts.signOutPending).confirmed,true);
 const revoked=await raw({op:'read'},a.remote.deviceId,previousProof.accessToken);assert.equal(revoked.status,401);
 const still=await b.accounts.requireCloudActor();assert.equal(still.ownerAccountId,owner);assert.equal((await b.remote.cloudSave('read',b.accounts.privateSession())).revision,4);pass('main logout revokes A while same-account B retains actual cloud access',{a:revoked.status,b:'live'});
 for(const m of models){const dbBytes=readFileSync(join(m.directory,'state.sqlite'));for(const token of [previousProof.accessToken,previousProof.refreshToken])assert.equal(dbBytes.includes(Buffer.from(token)),false);}
 evidence.passed=true;writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_MAIN_HTTP_PASSED',output);
})().catch(error=>{evidence.error={code:error.code,message:error.message};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(error.code||'',error.message);process.exitCode=1;})
 .finally(()=>{for(const m of models){m.accounts.dispose();m.db.close();}});
