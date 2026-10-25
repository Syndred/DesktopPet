// SCRIPTED Edge boundary fixtures only. Actual SQL/ACL/READ ONLY semantics are
// covered by serial-views-sql.test.mjs. No provider Auth or live HTTP is claimed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createBattleHandler} from './handler.ts';
import type {ActorContext} from '../_shared/lingjing-auth.ts';

const caller={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'10000000-0000-4000-8000-000000000001',ownerAccountId:'original-owner',deviceId:'20000000-0000-4000-8000-000000000001',sessionId:'30000000-0000-4000-8000-000000000001',account:'original',username:'原账号'};
const roomId='abcdef01-0000-4000-8000-000000000001';
const rawRoom={id:roomId,host_auth_uid:caller.authUserId,host_user_id:caller.ownerAccountId,host_pet_id:'same-original-pet',guest_auth_uid:'40000000-0000-4000-8000-000000000001',guest_user_id:'peer-owner',guest_pet_id:'same-original-pet',invited_auth_uid:null,status:'abandoned',revision:1,last_resolved_round:0};
const metadata={format:'lingjing.battle.serial-views',version:1,ownerAccountId:caller.ownerAccountId,namespace:'live',rooms:[{roomId,roomRevision:'9007199254740993',participants:[{side:'guest',ownerAccountId:'peer-owner',petId:'same-original-pet',templateId:'animal-wood-deer',globalSerial:'900719925474099312345678901234567890'}]}]};
const checksum=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unexpected=()=>{throw new Error('Unexpected write or unrelated lookup');};
const query=(data:unknown)=>{
 const result={select(){return result;},eq(){return result;},order(){return result;},limit(){return result;},maybeSingle(){return result;},
  then(resolve:(value:unknown)=>unknown){return Promise.resolve({data,error:null}).then(resolve);}};
 return result;
};
const request=(input:unknown)=>new Request('https://fixture.invalid',{method:'POST',body:JSON.stringify(input)});
const emptyDeps={resolvePet:unexpected,settle:unexpected,training:unexpected};
const context={...caller,client:{from:(table:string)=>table==='lingjing_battle_rooms'?query(rawRoom):table==='lingjing_battle_rounds'?query([]):unexpected()}} as unknown as ActorContext;
const core={room:{id:roomId,host_user_id:caller.ownerAccountId,host_pet_id:'same-original-pet',guest_user_id:'peer-owner',guest_pet_id:'same-original-pet',status:'abandoned',revision:1,last_resolved_round:0,authority:'live',protocolVersion:2},rounds:[],pendingAction:null};

Deno.test('SCRIPTED display batch uses only the current verified actor and one readonly RPC',async()=>{
 const calls:unknown[]=[];
 const admin={from:unexpected,rpc:(name:string,input:unknown)=>{calls.push({name,input});return Promise.resolve({data:metadata,error:null});}} as unknown as ActorContext['client'];
 const handler=createBattleHandler({...emptyDeps,admin});
 const response=await handler(request({op:'get_display_metadata',roomIds:[roomId.toUpperCase()]}),context);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,data:metadata});
 const {account:_account,username:_username,...actor}=caller;
 void _account;void _username;
 assert.deepEqual(calls,[{name:'lingjing_battle_serial_views',input:{p_actor:actor,p_room_ids:[roomId]}}]);
 assert.ok(!JSON.stringify(calls).includes('client'));
});

Deno.test('SCRIPTED display batches reject duplicates, oversized arrays, foreign actor/owner/pet fields before RPC',async()=>{
 const handler=createBattleHandler({...emptyDeps,admin:{from:unexpected,rpc:unexpected} as unknown as ActorContext['client']});
 for(const extra of[
  {roomIds:[]},{roomIds:null},{roomIds:['bad']},{roomIds:[roomId,roomId.toUpperCase()]},{roomIds:Array(21).fill(roomId)},
  {roomIds:[roomId],petId:'foreign'},{roomIds:[roomId],targetOwner:'foreign'},{roomIds:[roomId],namespace:'live'},
  {roomIds:[roomId],ownerAccountId:'foreign'},{roomIds:[roomId],actor:caller},
 ])await assert.rejects(handler(request({op:'get_display_metadata',...extra}),context),(error:{code?:string;status?:number})=>error.status===400&&['INVALID_COMMAND','LEGACY_IDENTITY_REJECTED'].includes(error.code||''));
});

Deno.test('SCRIPTED dedicated display read retains exact member, session and scope refusal without fake success',async()=>{
 for(const [code,status]of [['ROOM_FORBIDDEN',403],['SESSION_REVOKED',401],['GLOBAL_SERIAL_SCOPE_REVOKED',403],['GLOBAL_SERIAL_SCOPE_CONFLICT',403],['unexpected-db-error',503]] as const){
  const admin={from:unexpected,rpc:()=>Promise.resolve({data:null,error:{message:'LJ_'+code}})} as unknown as ActorContext['client'];
  const handler=createBattleHandler({...emptyDeps,admin});
  await assert.rejects(handler(request({op:'get_display_metadata',roomIds:[roomId]}),context),(error:{code?:string;status?:number})=>error.status===status&&error.code===(status===503?'BATTLE_CLOUD_UNAVAILABLE':code));
 }
});

Deno.test('SCRIPTED snapshots add only independent metadata, preserve original room data and never expose Auth UID',async()=>{
 const before=checksum(rawRoom),admin={from:unexpected,rpc:()=>Promise.resolve({data:metadata,error:null})} as unknown as ActorContext['client'];
 const response=await createBattleHandler({...emptyDeps,admin})(request({op:'get_room',roomId}),context);
 const payload=await response.json();assert.equal(response.status,200);assert.deepEqual(payload,{ok:true,data:{...core,displayMetadata:metadata}});
 assert.equal(checksum(rawRoom),before);assert.ok(!JSON.stringify(payload).includes('auth_uid'));assert.ok(!JSON.stringify(payload).includes(caller.authUserId));
});

Deno.test('SCRIPTED already committed leave replay stays successful when display RPC fails; receipt JSON/hash never changes',async()=>{
 const logical={roomId},stored=Object.freeze({room:{...rawRoom},untouched:'original-result-bytes'}),input=Object.freeze({request:logical,roomId});
 const cached=Object.freeze({owner_account_id:caller.ownerAccountId,operation:'leave_room',input_json:input,result_json:stored});
 const before=checksum(cached),calls:{name:string;input:unknown}[]=[];
 const admin={from:(name:string)=>name==='lingjing_battle_commands'?query(cached):unexpected(),rpc:(name:string,args:unknown)=>{
  calls.push({name,input:args});return Promise.resolve(name==='lingjing_battle_command'?{data:stored,error:null}:{data:null,error:{message:'LJ_GLOBAL_SERIAL_SCOPE_REVOKED'}});
 }} as unknown as ActorContext['client'];
 const response=await createBattleHandler({...emptyDeps,admin})(request({op:'leave_room',roomId,actionId:'original-action-01'}),context);
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,data:{...core,displayMetadata:null}});assert.equal(checksum(cached),before);
 assert.equal(calls.length,2);assert.equal(calls[0].name,'lingjing_battle_command');
 assert.deepEqual(calls[0].input,{p_actor:caller.authUserId,p_owner:caller.ownerAccountId,p_device:caller.deviceId,p_session:caller.sessionId,p_op:'leave_room',p_action_id:'original-action-01',p_input:input});
 assert.equal(calls[1].name,'lingjing_battle_serial_views');assert.ok(!JSON.stringify(stored).includes('displayMetadata'));
});

Deno.test('SCRIPTED successful settlement receipt remains byte-identical when display lookup fails or succeeds',async()=>{
 const receipt=Object.freeze({roomId,petId:'same-original-pet',actionId:'original-settlement-action',experience:20,duplicate:true}),before=checksum(receipt);
 for(const fail of[true,false]){
  const events:string[]=[],admin={from:unexpected,rpc:()=>{events.push('display');return Promise.resolve(fail?{data:null,error:{message:'metadata-network-failure'}}:{data:metadata,error:null});}} as unknown as ActorContext['client'];
  const response=await createBattleHandler({...emptyDeps,admin,settle:async()=>{events.push('settle');return receipt;}})(request({op:'claim_battle_settlement',roomId,petId:'same-original-pet'}),context);
  assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,data:{...receipt,displayMetadata:fail?null:metadata}});
  assert.deepEqual(events,['settle','display']);assert.equal(checksum(receipt),before);assert.ok(!Object.hasOwn(receipt,'displayMetadata'));
 }
});
