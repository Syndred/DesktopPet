import assert from 'node:assert/strict';
import {createBattleHandler} from './handler.ts';
import {createBattleAuthority} from './authority.ts';
import type {ActorContext} from '../_shared/lingjing-auth.ts';
import {getBattleRules,BATTLE_CORE_VERSION} from '../_shared/battle-core.js';

// Scripted boundary tests only. Transaction/RLS behavior uses the actual08 SQL
// in the separate PGlite checks; this file does not claim live Auth or HTTPS.
const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'10000000-0000-4000-8000-000000000001',ownerAccountId:'original-owner',deviceId:'20000000-0000-4000-8000-000000000001',sessionId:'30000000-0000-4000-8000-000000000001',account:'original',username:'原账号'};
function query(data:unknown) {
  const value={select(){return value;},eq(){return value;},limit(){return value;},order(){return Promise.resolve({data,error:null});},maybeSingle(){return Promise.resolve({data,error:null});}};return value;
}
Deno.test('SCRIPTED cached friend command still enters the transaction guard with the verified device and SID',async()=>{
  const calls:Record<string,unknown>[]=[],id='cached-command-original',target={owner_id:'target-owner',auth_user_id:'40000000-0000-4000-8000-000000000001',account:'target'};
  const cached={owner_account_id:actor.ownerAccountId,operation:'invite',input_json:{request:{targetOwnerId:target.owner_id},account:actor.account,target},result_json:{request:{id:'a-cached-invitation'}}};
  const admin={from:(name:string)=>query(name==='lingjing_accounts'?target:cached),rpc:(_name:string,input:Record<string,unknown>)=>{calls.push(input);return Promise.resolve({data:null,error:{message:'LJ_SESSION_REVOKED'}});}};
  const deps={admin:admin as unknown as ActorContext['client'],resolvePet:async()=>{throw new Error('Cached command must not reread mutable pet metadata');},settle:async()=>({}),training:async()=>({})};
  const handler=createBattleHandler(deps),context={...actor,client:{}} as ActorContext;
  await assert.rejects(handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({op:'send_duel_request',targetAccount:target.account,actionId:id})}),context),(error:{code?:string;status?:number})=>error.code==='SESSION_REVOKED'&&error.status===401);
  assert.equal(calls.length,1);assert.equal(calls[0].p_device,actor.deviceId);assert.equal(calls[0].p_session,actor.sessionId);assert.deepEqual(calls[0].p_input,cached.input_json);
});
Deno.test('SCRIPTED existing settlement receipt is reauthorized by the same SQL guard instead of bypassing it',async()=>{
  const calls:Record<string,unknown>[]=[],room={id:'50000000-0000-4000-8000-000000000001',last_resolved_round:0,rules_version:getBattleRules().id,core_version:BATTLE_CORE_VERSION};
  const admin={from:()=>query({pet_id:'original-pet',result_json:{already:'saved'}}),rpc:(_name:string,input:Record<string,unknown>)=>{calls.push(input);return Promise.resolve({data:null,error:{message:'LJ_DEVICE_SESSION_REQUIRED'}});}};
  const context={...actor,client:{from:()=>query([])}} as unknown as ActorContext,authority=createBattleAuthority(admin as unknown as ActorContext['client']);
  await assert.rejects(authority.settle(context,room,'original-pet'),(error:{code?:string;status?:number})=>error.code==='DEVICE_SESSION_REQUIRED'&&error.status===401);
  assert.equal(calls.length,1);assert.equal(calls[0].p_device,actor.deviceId);assert.equal(calls[0].p_session,actor.sessionId);assert.deepEqual(calls[0].p_fragments,{});
});

Deno.test('SCRIPTED invitation list uses the guarded server projection and preserves null legacy deadlines',async()=>{
  const calls:{name:string;input:Record<string,unknown>}[]=[],created='2026-10-25T00:00:00Z',deadline='2026-10-25T00:05:00Z';
  const row={id:'50000000-0000-4000-8000-000000000002',from_auth_uid:'40000000-0000-4000-8000-000000000001',to_auth_uid:actor.authUserId,from_user_id:'other-owner',to_user_id:actor.ownerAccountId,from_account:'other',to_account:actor.account,created_at:created,updated_at:created,room_id:null};
  const admin={rpc:(name:string,input:Record<string,unknown>)=>{calls.push({name,input});return Promise.resolve({data:{serverNow:deadline,invitations:[{...row,status:'expired',expires_at:deadline},{...row,id:'50000000-0000-4000-8000-000000000003',status:'pending',expires_at:null}]},error:null});}};
  const handler=createBattleHandler({admin:admin as unknown as ActorContext['client'],resolvePet:async()=>{throw new Error('Listing must not resolve a pet');},settle:async()=>({}),training:async()=>({})});
  const response=await handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({op:'list_duel_requests'})}),{...actor,client:{}} as ActorContext);
  const body=await response.json();
  assert.equal(calls.length,1);assert.equal(calls[0].name,'lingjing_battle_list_invites');
  assert.deepEqual(calls[0].input,{p_actor:actor.authUserId,p_owner:actor.ownerAccountId,p_device:actor.deviceId,p_session:actor.sessionId});
  assert.deepEqual(body.data.inbound.map((item:{status:string;expiresAt:string|null})=>[item.status,item.expiresAt]),[['expired',deadline],['pending',null]]);
  assert.equal(body.data.inbound[0].createdAt,created);assert.equal(body.data.inbound[0].updatedAt,created);
  assert.equal(body.data.inbound[0].from_auth_uid,undefined);assert.deepEqual(body.data.outbound,[]);
});

Deno.test('SCRIPTED atomic expiry rejection is mapped to an explicit conflict code',async()=>{
  const admin={from:()=>query(null),rpc:()=>Promise.resolve({data:null,error:{message:'INVITE_EXPIRED'}})};
  const handler=createBattleHandler({admin:admin as unknown as ActorContext['client'],resolvePet:async(_actor,petId)=>({ownerId:actor.ownerAccountId,petId,name:'原伙伴',resourceId:'builtin:lingjing-yuwan-v2',element:'water',level:1}),settle:async()=>({}),training:async()=>({})});
  await assert.rejects(handler(new Request('https://example.invalid',{method:'POST',body:JSON.stringify({op:'create_room',requestId:'50000000-0000-4000-8000-000000000004',petId:'original-pet',actionId:'accept-expiry-original'})}),{...actor,client:{}} as ActorContext),(error:{code?:string;status?:number})=>error.code==='INVITE_EXPIRED'&&error.status===409);
});
