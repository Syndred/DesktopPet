import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {startInvitationSqlBridge} from './qa-invitation-sql-bridge.mjs';
const runId=randomUUID(),token=randomBytes(32).toString('hex'),directory=mkdtempSync(join(tmpdir(),'invitation-sql-contract-'));
const actors=['a','b'].map(role=>({owner:`qa:${runId}:${role}`,account:`contract_${role}`,username:`Contract ${role}`,pet:{ownerAccountId:`qa:${runId}:${role}`,petId:`pet-${role}`,appearance2d:'builtin:lingjing-yuwan-v2',petName:'Test',element:'water'}}));
let bridge;
try{
 bridge=await startInvitationSqlBridge({runId,token,directory});for(const a of actors)await bridge.registerActor(a);
 async function invoke(a,op,input={}){const response=await fetch(bridge.endpoint,{method:'POST',headers:{'content-type':'application/json','x-qa-run':runId,'x-qa-token':token},body:JSON.stringify({op,...input,userId:a.owner,userAccount:a.account,username:a.username,sessionToken:`qa:${runId}:${a.owner}`})});const value=await response.json();return{status:response.status,...value,data:value.data??value};}
 assert.equal((await invoke({...actors[0],owner:'foreign'},'list_duel_requests')).code,'QA_BOUNDARY_REJECTED');
 assert.equal((await invoke(actors[0],'submit_action')).code,'QA_BOUNDARY_REJECTED');
 assert.equal((await invoke(actors[0],'search_accounts',{keyword:"' OR 1=1 --"})).data.users.length,0);
 const found=await invoke(actors[0],'search_accounts',{keyword:actors[1].account});assert.equal(found.data.users.length,1);
 const actionId=randomUUID(),invite=(await invoke(actors[0],'send_duel_request',{actionId,targetAccount:actors[1].account})).data.request;
 assert.equal(Date.parse(invite.expiresAt)-Date.parse(invite.createdAt),300000);assert.deepEqual((await invoke(actors[0],'send_duel_request',{actionId,targetAccount:actors[1].account})).data.request,invite);
 const cancelled=await invoke(actors[0],'cancel_duel_request',{actionId:`cancel:${invite.id}`,requestId:invite.id});assert.equal(cancelled.data.request.status,'cancelled');
 const rejected=await invoke(actors[1],'create_room',{actionId:`accept:${invite.id}`,requestId:invite.id,petId:actors[1].pet.petId});assert.equal(rejected.code,'INVITE_CONFLICT');assert.equal(rejected.status,409);
 assert.deepEqual((await bridge.inspect()).counts,{rooms:0,rounds:0,settlements:0});
 console.log(JSON.stringify({stage:'cancel-and-boundary-contract',passed:true}));
 if(process.argv.includes('--natural-expiry')){
  const second=(await invoke(actors[0],'send_duel_request',{actionId:randomUUID(),targetAccount:actors[1].account})).data.request;
  assert.equal(Date.parse(second.expiresAt)-Date.parse(second.createdAt),300000);console.log(JSON.stringify({stage:'natural-expiry-wait',createdAt:second.createdAt,expiresAt:second.expiresAt}));
  while(Date.now()<=Date.parse(second.expiresAt)+100)await new Promise(r=>setTimeout(r,Math.min(5000,Date.parse(second.expiresAt)+101-Date.now())));
  const list=await invoke(actors[1],'list_duel_requests');assert.equal(list.data.inbound.find(x=>x.id===second.id).status,'expired');
  const before=await bridge.inspect(),input={actionId:`accept:${second.id}`,requestId:second.id,petId:actors[1].pet.petId};
  for(let n=0;n<2;n++)assert.equal((await invoke(actors[1],'create_room',input)).code,'INVITE_EXPIRED');
  const after=await bridge.inspect();assert.deepEqual(after.counts,{rooms:0,rounds:0,settlements:0});assert.deepEqual(after.invitations,before.invitations);assert.deepEqual(after.commands,before.commands);
  assert.ok(Number(after.clock)>=Date.parse(second.expiresAt));console.log(JSON.stringify({stage:'natural-expiry-contract',passed:true,createdAt:second.createdAt,expiresAt:second.expiresAt,observedAt:Number(after.clock),unchanged:true}));
 }
}finally{if(bridge)await bridge.close();rmSync(directory,{recursive:true,force:true});}
