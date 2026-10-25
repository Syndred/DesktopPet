const assert=require('node:assert/strict');const {randomUUID,randomBytes}=require('node:crypto');const {mkdirSync,writeFileSync}=require('node:fs');const {resolve,join}=require('node:path');const {execFileSync}=require('node:child_process');
const {SupabaseRemote}=require('../supabase-remote.cjs');const {defaultSettings}=require('../settings.cjs');const {checksum}=require('../util.cjs');
const output=resolve(`artifacts/accounts/cloud-cas-concurrency-${Date.now()}`);mkdirSync(output,{recursive:true});
const a=new SupabaseRemote({userData:join(output,'a')}),b=new SupabaseRemote({userData:join(output,'b')});
const proof={at:new Date().toISOString(),sourceSha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
 kind:'Actual simultaneous HTTPS CAS calls from two independently bound Auth sessions on one host; no production admin credentials or mocked responses',checks:[]};
const pass=(name,data)=>{proof.checks.push({name,data});console.log('PASS',name);};
(async()=>{
 const account=`casqa_${Date.now().toString(36)}`,password=`Aa9!${randomBytes(18).toString('base64url')}`;
 const ua=await a.register(account,password,'并发存档验收'),ub=await b.login(account,password),sa={id:ua.id,cloudProof:ua.proof},sb={id:ub.id,cloudProof:ub.proof};a.setCurrentUser(sa);b.setCurrentUser(sb);
 function envelope(volume){const prefs=defaultSettings();prefs.desktop.volume=volume;const body={format:'lingjing-account-save',version:1,ownerAccountId:ua.id,
  identity:{provider:'runtime',subjectId:ua.id},provenance:{mode:'live'},createdAt:'2026-10-25T00:00:00.000Z',excluded:[],data:{modules:{settings:{version:1,data:prefs}},tables:{}}};return{...body,checksum:checksum(body)};}
 const at=Date.now(),race=await Promise.allSettled([a.cloudSave('push',sa,{actionId:randomUUID(),baseRevision:0,envelope:envelope(10)}),b.cloudSave('push',sb,{actionId:randomUUID(),baseRevision:0,envelope:envelope(20)})]);
 const won=race.filter(r=>r.status==='fulfilled'),lost=race.filter(r=>r.status==='rejected');assert.equal(won.length,1);assert.equal(lost.length,1);assert.equal(lost[0].reason.code,'SYNC_CONFLICT');assert.equal(won[0].value.revision,1);
 pass('two concurrent different actions at same base yield one durable winner',{startedAt:new Date(at).toISOString(),elapsedMs:Date.now()-at,winnerAction:won[0].value.actionId,loserCode:lost[0].reason.code,revision:1});
 const id=randomUUID(),shared=envelope(30),replay=await Promise.all([a.cloudSave('push',sa,{actionId:id,baseRevision:1,envelope:shared}),b.cloudSave('push',sb,{actionId:id,baseRevision:1,envelope:shared})]);
 assert.equal(replay[0].revision,2);assert.equal(replay[1].revision,2);assert.ok(replay.some(r=>r.duplicate===true));assert.equal(replay[0].checksum,replay[1].checksum);
 const readA=await a.cloudSave('read',sa),readB=await b.cloudSave('read',sb);assert.equal(readA.actionId,id);assert.equal(readB.envelope.checksum,shared.checksum);assert.equal(readA.revision,2);
 const actor=await a.cloudContext(sa),rows=await actor.client.from('lingjing_save_actions').select('action_id,revision');assert.equal(rows.error,null);assert.equal(rows.data.length,2);
 pass('simultaneous same action is applied once and independently read by both devices',{actionId:id,revisions:replay.map(r=>r.revision),duplicateFlags:replay.map(r=>!!r.duplicate),storedActionCount:rows.data.length,headChecksum:readA.checksum});
 proof.passed=true;writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log('CLOUD_CAS_CONCURRENCY_PASSED',output);
})().catch(error=>{proof.error={code:error.code,message:error.message};writeFileSync(join(output,'failure.json'),JSON.stringify(proof,null,2));console.error(error.code||'',error.message);process.exitCode=1;}).finally(()=>{a.dispose();b.dispose();});
