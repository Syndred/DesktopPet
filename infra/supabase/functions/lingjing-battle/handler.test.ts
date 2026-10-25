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
