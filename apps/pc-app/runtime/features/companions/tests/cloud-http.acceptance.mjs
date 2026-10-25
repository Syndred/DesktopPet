import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {listBuiltinTemplates} from '../instance.mjs';
const require=createRequire(import.meta.url),{SupabaseRemote,publicConfig,decodeProof}=require('../../accounts/supabase-remote.cjs'),{checksum}=require('../../accounts/util.cjs');
// Coordinator-run REAL HTTPS verifier. Requires two explicitly designated test
// accounts in an ignored credentials file; never writes tokens/passwords/logins
// to evidence. Node processes are not Electron or two physical machines.
const credentialsFile=process.env.LINGJING_COMPANION_VERIFY_CREDENTIALS;
assert.ok(credentialsFile,'Set LINGJING_COMPANION_VERIFY_CREDENTIALS to coordinator-owned ignored JSON');
const credentials=JSON.parse(readFileSync(credentialsFile,'utf8'));assert.equal(credentials.testOnly,true);
assert.ok(credentials.a?.account&&credentials.a?.password&&credentials.b?.account&&credentials.b?.password);
const config=publicConfig();assert.ok(config);assert.equal(new URL(config.url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');
async function login(profile,credential){mkdirSync(profile,{recursive:true});const remote=new SupabaseRemote({userData:profile,config}),user=await remote.login(credential.account,credential.password),session={...user,ownerAccountId:user.id,cloudProof:user.proof};remote.setCurrentUser(session);return{remote,session,actor:decodeProof(user.proof).actor};}
const snapshot=c=>c.remote.invoke(c.session,'companions-sync',{op:'snapshot'});
const pets=s=>s.module.data.tables.companion_pets.map(row=>JSON.parse(row.data_json));
if(process.argv[2]==='--read-child'){
  const client=await login(resolve(process.argv[3]),credentials.a),state=await snapshot(client),ids=JSON.parse(process.argv[4]);
  console.log(JSON.stringify({pid:process.pid,actor:client.actor,revision:state.revision,pets:pets(state).filter(pet=>ids.includes(pet.petId))}));
  process.exit(0);
}
const root=resolve('artifacts/companions');mkdirSync(root,{recursive:true});const output=mkdtempSync(join(root,'real-cloud-')),runId=randomUUID(),short=runId.slice(0,8);
const evidence={at:new Date().toISOString(),runId,output,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),kind:'real-HTTPS-with-Accounts-SupabaseRemote',project:'jbvrdmrkwpznbrvteive',physicalSecondDevice:false,electronAcceptance:false,checks:[]};
let a,b,other;
const record=(name,detail={})=>evidence.checks.push({name,...detail});
const action=()=>`companion-verify-${randomUUID()}`;
async function command(c,kind,input,baseRevision){
  const receipt=await c.remote.invoke(c.session,'companions-sync',{op:'command',command:kind,input,...(baseRevision===undefined?{}:{baseRevision})});
  assert.equal(receipt.authority,'live');assert.equal(receipt.ownerAccountId,c.actor.ownerAccountId);assert.equal(receipt.actionId,'companions:'+input.actionId);assert.equal(receipt.result.ok,true);
  const independent=await (c===a?b:a).remote.invoke((c===a?b:a).session,'lingjing-save',{op:'read',actionId:receipt.actionId});
  assert.equal(independent.checksum,receipt.checksum);assert.equal(independent.revision,receipt.revision);
  return receipt;
}
async function denied(operation,codes){let caught;try{await operation();}catch(error){caught=error;}assert.ok(caught,'Expected a denied request');assert.ok(codes.includes(caught.code),`Unexpected denial ${caught.code}`);return{code:caught.code,status:caught.httpStatus};}
try{
  a=await login(join(output,'client-a'),credentials.a);b=await login(join(output,'client-b'),credentials.a);other=await login(join(output,'other-account'),credentials.b);
  assert.equal(a.actor.ownerAccountId,b.actor.ownerAccountId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);assert.notEqual(a.actor.sessionId,b.actor.sessionId);assert.notEqual(a.actor.ownerAccountId,other.actor.ownerAccountId);evidence.actors=[a.actor,b.actor,other.actor];
  const start=await snapshot(a),firstInput={actionId:action(),templateId:'big-fish-gentle',name:'云鱼甲'+short,showOnDesktop:false};
  const first=await command(a,'adopt',firstInput,start.revision),firstPet=first.result.data.pet;
  const duplicate=await command(b,'adopt',firstInput,start.revision);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.result.data.pet.petId,firstPet.petId);
  const second=await command(b,'adopt',{actionId:action(),templateId:firstInput.templateId,name:'云鱼乙'+short,showOnDesktop:false},(await snapshot(b)).revision),secondPet=second.result.data.pet;
  assert.notEqual(firstPet.petId,secondPet.petId);assert.equal(firstPet.templateId,secondPet.templateId);record('Two authenticated device IDs share stable owner, independent same-template pets and one adoption receipt',{petIds:[firstPet.petId,secondPet.petId],firstAction:first.actionId});
  const shared=await snapshot(a),current=pets(shared).find(pet=>pet.petId===firstPet.petId);
  const race=await Promise.allSettled([command(a,'rename',{actionId:action(),petId:firstPet.petId,expectedRevision:current.revision,name:'并发甲'+short},shared.revision),command(b,'rename',{actionId:action(),petId:firstPet.petId,expectedRevision:current.revision,name:'并发乙'+short},shared.revision)]);
  assert.equal(race.filter(result=>result.status==='fulfilled').length,1);const loser=race.find(result=>result.status==='rejected');assert.ok(['SYNC_CONFLICT','REVISION_CONFLICT'].includes(loser.reason.code));record('Real HTTPS concurrent stale revision permits one rename and preserves the winning state',{denied:loser.reason.code});
  for(const[slot,petId]of[['chatPetId',firstPet.petId],['battlePetId',secondPet.petId],['guardPetId',firstPet.petId]])await command(a,'select',{actionId:action(),petId,slot});
  let state=await snapshot(b),chosen=pets(state).find(pet=>pet.petId===firstPet.petId);
  await command(a,'desktop',{actionId:action(),petId:chosen.petId,expectedRevision:chosen.revision,position:{x:-1270,y:260,displayId:'original-cloud-monitor'},behavior:'quiet',scale:1.25,visible:false});
  state=await snapshot(b);chosen=pets(state).find(pet=>pet.petId===firstPet.petId);assert.deepEqual(chosen.desktop.position,{x:-1270,y:260,displayId:'original-cloud-monitor'});
  await command(b,'appearance',{actionId:action(),petId:chosen.petId,expectedRevision:chosen.revision,resourceId:listBuiltinTemplates()[1].resource.resourceId});
  state=await snapshot(a);chosen=pets(state).find(pet=>pet.petId===firstPet.petId);const touchInput={actionId:action(),petId:chosen.petId,expectedRevision:chosen.revision};
  const touched=await command(a,'interact',touchInput);assert.equal(touched.result.data.pet.growth.affinity,chosen.growth.affinity+1);assert.equal(touched.result.data.pet.growth.experience,chosen.growth.experience);
  assert.equal((await command(b,'interact',touchInput)).duplicate,true);
  await denied(()=>command(b,'interact',{actionId:action(),petId:chosen.petId,expectedRevision:touched.result.data.pet.revision}),['RATE_LIMITED']);record('Independent selections, original desktop coordinates, builtin2D appearance and server-clock interaction replay read back on both devices');
  const growthDenied=await denied(()=>a.remote.invoke(a.session,'companions-sync',{op:'command',command:'adopt',input:{...firstInput,actionId:action(),growth:{experience:999}}}),['INVALID_INPUT']);
  const foreign=await denied(()=>other.remote.invoke(other.session,'companions-sync',{op:'command',command:'rename',input:{actionId:action(),petId:firstPet.petId,name:'不应串号'}}),['PET_NOT_FOUND']);
  const ownerSpoof=await denied(()=>other.remote.invoke(other.session,'companions-sync',{op:'snapshot',ownerAccountId:a.actor.ownerAccountId}),['OWNER_MISMATCH']);
  await denied(()=>a.remote.invoke(a.session,'companions-sync',{op:'command',command:'appearance',input:{actionId:action(),petId:firstPet.petId,resourceId:randomUUID()}}),['RESOURCE_UNAVAILABLE']);
  record('Client growth injection, foreign pet/owner and unverified custom appearance are denied',{growthDenied,foreign,ownerSpoof});
  const head=await a.remote.invoke(a.session,'lingjing-save',{op:'read'}),forged=structuredClone(head.envelope),row=forged.data.modules.companions.data.tables.companion_pets.find(row=>row.pet_id===firstPet.petId),pet=JSON.parse(row.data_json);pet.growth.experience=999;row.data_json=JSON.stringify(pet);const{checksum:old,...body}=forged;void old;forged.checksum=checksum(body);
  const protectedWrite=await denied(()=>a.remote.invoke(a.session,'lingjing-save',{op:'push',actionId:action(),baseRevision:head.revision,envelope:forged}),['PROTECTED_STATE_MISMATCH','PROTECTED_STATE_REQUIRES_AUTHORITY']);record('Valid-checksum full-save growth forgery is denied by08 protected CAS',protectedWrite);
  const child=JSON.parse(execFileSync(process.execPath,[fileURLToPath(import.meta.url),'--read-child',join(output,'client-b'),JSON.stringify([firstPet.petId,secondPet.petId])],{encoding:'utf8',windowsHide:true,env:process.env}));
  assert.notEqual(child.pid,process.pid);assert.equal(child.actor.deviceId,b.actor.deviceId);assert.equal(child.actor.ownerAccountId,a.actor.ownerAccountId);assert.equal(child.pets.length,2);assert.deepEqual(child.pets.find(pet=>pet.petId===firstPet.petId).desktop.position,{x:-1270,y:260,displayId:'original-cloud-monitor'});
  const final=await snapshot(a),selection=JSON.parse(final.module.data.tables.companion_accounts[0].selections_json);assert.deepEqual(selection,{chatPetId:firstPet.petId,battlePetId:secondPet.petId,guardPetId:firstPet.petId});
  evidence.processes=[process.pid,child.pid];evidence.final={ownerAccountId:a.actor.ownerAccountId,revision:final.revision,pets:pets(final).filter(pet=>[firstPet.petId,secondPet.petId].includes(pet.petId)),selections:selection};record('Separate restarted Node process retains device identity and reads the same original pet IDs/history; other device remains usable');
  for(const authorization of[undefined,'Bearer forged.token.value']){const response=await fetch(config.url+'/functions/v1/companions-sync',{method:'POST',headers:{apikey:config.key,'Content-Type':'application/json','X-Lingjing-Device-Id':randomUUID(),...(authorization?{Authorization:authorization}:{})},body:JSON.stringify({op:'snapshot'})});const deniedBody=await response.json();assert.equal(response.status,401);assert.ok(['AUTH_REQUIRED','AUTH_INVALID'].includes(deniedBody.code));}record('Deployed companion route denies anonymous and forged JWT requests');
  evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failure={code:error.code||'ASSERTION_FAILED',status:error.httpStatus,message:error.message};process.exitCode=1;}
finally{if(a&&b)try{const context=await a.remote.cloudContext(a.session);await context.client.rpc('lingjing_revoke_device',{p_device_id:b.actor.deviceId});}catch{}for(const c of[a,other])if(c)await c.remote.signOut(c.session).catch(()=>{});writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,passed:evidence.passed,checks:evidence.checks,failure:evidence.failure}));}
