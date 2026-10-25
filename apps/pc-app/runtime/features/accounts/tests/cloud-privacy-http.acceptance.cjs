const assert=require('node:assert/strict');const {randomUUID,randomBytes}=require('node:crypto');
const {mkdirSync,writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');const {execFileSync}=require('node:child_process');
const {SupabaseRemote}=require('../supabase-remote.cjs');const {cloudProjection}=require('../cloud-projection.cjs');const {checksum}=require('../util.cjs');const {defaultSettings}=require('../settings.cjs');
const output=resolve(`artifacts/accounts/cloud-privacy-http-${Date.now()}`);mkdirSync(output,{recursive:true});
const remote=new SupabaseRemote({userData:join(output,'profile')}),marker=`FAKE_BYOK_PRIVACY_PROBE_NOT_A_REAL_KEY_${randomUUID()}`;
const evidence={at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Actual Supabase HTTPS + independent Data API readback, synthetic non-secret marker only, no real BYOK used',checks:[]};
const pass=(name,data)=>{evidence.checks.push({name,data});console.log('PASS',name);};
function seal(body){return{...body,checksum:checksum(body)};}
(async()=>{
 const password=`Aa9!${randomBytes(20).toString('base64url')}`,user=await remote.register(`privacyqa_${Date.now().toString(36)}`,password,'隐私边界验收');
 const session={id:user.id,ownerAccountId:user.id,authKind:'supabase',cloudProof:user.proof};remote.setCurrentUser(session);
 const body={format:'lingjing-account-save',version:1,ownerAccountId:user.id,identity:{provider:'runtime',subjectId:user.id},provenance:{mode:'live'},createdAt:new Date().toISOString(),
  data:{modules:{settings:{version:1,data:defaultSettings()},legacy:{version:1,data:{nested:{apiKey:marker}}}},tables:{}}};
 const attackCases=[{apiKey:marker},{encryptedSecret:marker},{openai_api_key:marker},JSON.stringify({apiKey:marker}),JSON.stringify(JSON.stringify({nested:{encrypted_secret:marker}}))];
 for(let i=0;i<attackCases.length;i++){
  body.data.modules.legacy.data={nested:attackCases[i]};
  await assert.rejects(remote.cloudSave('archive',session,{actionId:randomUUID(),reason:'unverified-local',envelope:seal(body)}),{code:'SAVE_CONTAINS_SECRET'});
 }
 pass('actual HTTPS rejects direct, camelCase, nested and double-serialized credential keys',{rejected:attackCases.length});
 body.data.modules.settings.data.metadata=JSON.stringify({nested:{providerApiKey:marker},note:'keep safe value'});
 body.data.tables.companion_legacy_archive={schema:[{name:'owner_account_id'},{name:'source_json'}],rows:[{owner_account_id:user.id,source_json:JSON.stringify({encryptedSecret:marker})}]};
 const original=seal(body),unchanged=JSON.stringify(original),projected=cloudProjection(original);
 assert.equal(JSON.stringify(original),unchanged);assert.ok(!JSON.stringify(projected.envelope).includes(marker));assert.notEqual(projected.sourceChecksum,projected.projectedChecksum);
 const archiveAction=randomUUID(),receipt=await remote.cloudSave('archive',session,{actionId:archiveAction,reason:'unverified-local',envelope:projected.envelope});assert.equal(receipt.promoted,false);
 const actor=await remote.cloudContext(session);const persisted=await actor.client.from('lingjing_save_archives').select('checksum,envelope').eq('action_id',archiveAction).single();
 assert.equal(persisted.error,null);assert.equal(persisted.data.checksum,projected.projectedChecksum);assert.ok(!JSON.stringify(persisted.data).includes(marker));
 assert.equal(persisted.data.envelope.data.modules.legacy,undefined);assert.equal(persisted.data.envelope.data.tables.companion_legacy_archive,undefined);
 pass('safe projection independently read from actual cloud archive omits all markers and raw blobs',{sourceChecksum:projected.sourceChecksum,cloudProjectionChecksum:projected.projectedChecksum,exclusions:projected.excluded,originalCloudComplete:false,archiveId:receipt.id});
 const personal=structuredClone(projected.envelope);personal.data.tables={};const result=await remote.cloudSave('push',session,{actionId:randomUUID(),baseRevision:0,envelope:seal(Object.fromEntries(Object.entries(personal).filter(([key])=>key!=='checksum')))});
 const head=await actor.client.from('lingjing_saves').select('checksum,envelope').single();assert.equal(head.error,null);assert.ok(!JSON.stringify(head.data).includes(marker));assert.equal(head.data.checksum,result.checksum);
 pass('actual personal CAS remains usable and independent head read contains no marker',{revision:result.revision,checksum:result.checksum});
 evidence.passed=true;writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log('CLOUD_PRIVACY_HTTP_PASSED',output);
})().catch(error=>{evidence.error={code:error.code,message:error.message};writeFileSync(join(output,'failure.json'),JSON.stringify(evidence,null,2));console.error(error.code||'',error.message);process.exitCode=1;}).finally(()=>remote.dispose());
