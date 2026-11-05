import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {canonicalPerspective,validateEconomicReadback,validateBattleReadback,validateBattleReportView} from './cloud-live-qa-authority-readback-cases.mjs';
import {friendSession,reportFor} from '../../infra/supabase/functions/lingjing-battle/projection.js';
const require=createRequire(import.meta.url);
const {createBattleDisplayViews}=require('../../apps/pc-app/runtime/features/battle/display-views.cjs');
const {presentReport}=require('../../apps/pc-app/runtime/features/battle/presentation.cjs');
const owner='synthetic-contract-a',peer='synthetic-contract-b',roomId='11111111-1111-4111-8111-111111111111';
const room={id:roomId,status:'finished',winner_side:'host',last_resolved_round:1,created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:01:00Z',host_user_id:owner,guest_user_id:peer,host_pet_id:'contract-pet-a',guest_pet_id:'contract-pet-b',host_pet_name:'A',guest_pet_name:'B',host_resource_id:'animal-deer',guest_resource_id:'animal-deer',host_element:'wood',guest_element:'water',host_hp:100,guest_hp:0,host_anger:10,guest_anger:20,host_free_dodge_used:false,guest_free_dodge_used:false,host_statuses:[],guest_statuses:[]};
const round={room_id:roomId,round_no:1,host_action:'normal_attack',guest_action:'dodge',round_result:{hp_after:{host:100,guest:0},anger_after:{host:10,guest:20},damage_taken:{host:0,guest:100},direct_damage:{host:0,guest:100},statuses_after:{host:[],guest:[]},free_dodge_used:{host:false,guest:false},winner_side:'host'}};
function authority(){const actionId='contract-reward',reward={actionId,petId:room.host_pet_id,experience:20,won:true,applied:true},report=reportFor(friendSession(room,[round],owner,reward));return {source:'normal-authenticated-SDK-RLS-and-action-specific-save',owner,room,rounds:[round],settlements:[{owner_account_id:owner,room_id:roomId,action_id:actionId,won:true,experience:20,result_json:{owner_account_id:owner,action_id:actionId,reward,report}}],reports:[{data_json:JSON.stringify(report)}],rewards:[{action_id:actionId,data_json:JSON.stringify(reward)}]};}
test('both viewer perspectives canonicalize every round including status source and winner',()=>{const a=friendSession(room,[round],owner,{}),b=friendSession(room,[round],peer,{});assert.deepEqual(canonicalPerspective(a.rounds,'host'),canonicalPerspective(b.rounds,'guest'));const value={player:{id:'player',statuses:[{sourceId:'enemy'}]},enemy:{id:'enemy'},winner:'enemy'};assert.deepEqual(canonicalPerspective(value,'guest'),{guest:{id:'guest',statuses:[{sourceId:'host'}]},host:{id:'host'},winner:'host'});});
test('report validates against actual unchanged production projection, not only count or winner',()=>{const a=authority();validateBattleReadback(a,owner,roomId,'contract-reward');const wrong=structuredClone(a),report=JSON.parse(wrong.reports[0].data_json);report.rounds[0].damageTaken.enemy--;wrong.reports[0].data_json=JSON.stringify(report);assert.throws(()=>validateBattleReadback(wrong,owner,roomId,'contract-reward'));});
test('missing history or duplicate settlement/reward cannot pass',()=>{for(const key of['settlements','rewards']){const a=authority();a[key].push(a[key][0]);assert.throws(()=>validateBattleReadback(a,owner,roomId,'contract-reward'));}const a=authority();a.rounds=[];assert.throws(()=>validateBattleReadback(a,owner,roomId,'contract-reward'));});
test('a cached or foreign economy snapshot never qualifies as fresh authority',()=>{const intent={actionId:'existing-action',kind:'feed',requestHash:'a'.repeat(64)},fresh={source:'normal-authenticated-SDK-lingjing-save',owner,revision:4,actions:[{action_id:intent.actionId,kind:intent.kind,request_hash:intent.requestHash}],events:[{action_id:intent.actionId}]};validateEconomicReadback(fresh,owner,[intent]);assert.throws(()=>validateEconomicReadback({...fresh,source:'cached'},owner,[intent]));assert.throws(()=>validateEconomicReadback(fresh,peer,[intent]));assert.throws(()=>validateEconomicReadback(fresh,owner,[{...intent,requestHash:'b'.repeat(64)}]));});
test('original economic action occurrence and event are mandatory',()=>{const intent={actionId:'x',kind:'craft',requestHash:'a'.repeat(64)},row={action_id:'x',kind:'craft',request_hash:intent.requestHash},fresh={source:'normal-authenticated-SDK-lingjing-save',owner,revision:1,actions:[row,row],events:[{action_id:'x'}]};assert.throws(()=>validateEconomicReadback(fresh,owner,[intent]));fresh.actions=[row];fresh.events=[];assert.throws(()=>validateEconomicReadback(fresh,owner,[intent]));});
test('remaining battle readback can omit accepted economy; no unknown/reordered cases',async()=>{const {validateAuthorityReadbackSelection}=await import('./cloud-live-qa-authority-readback-cases.mjs');assert.deepEqual(validateAuthorityReadbackSelection(['B06','B11']),['B06','B11']);assert.deepEqual(validateAuthorityReadbackSelection(['B11']),['B11']);for(const bad of[[],['B11','B06'],['B06','B06'],['unknown']])assert.throws(()=>validateAuthorityReadbackSelection(bad));});

// Production display projection, with synthetic in-process metadata only. No
// client, cloud endpoint, account credentials, desktop or real battle is used.
async function reportView(viewer=owner,{pending=false,originalRoom=room}={}){
 const ownSide=viewer===owner?'host':'guest',won=ownSide===originalRoom.winner_side;
 const reward={actionId:'contract-reward',petId:originalRoom[ownSide+'_pet_id'],experience:won?20:5,won,applied:true};
 const expected=presentReport(reportFor(friendSession(originalRoom,[round],viewer,reward)));
 const participants=[{side:'host',ownerAccountId:owner,petId:originalRoom.host_pet_id,templateId:'animal-white-fox',globalSerial:'7'},
  {side:'guest',ownerAccountId:peer,petId:originalRoom.guest_pet_id,templateId:'animal-wood-deer',globalSerial:'900719925474099312345678901234567890'}];
 const services={session:{getOwnerAccountId:()=>viewer},get:name=>pending?undefined:name==='accounts'?{privateSession:()=>({authKind:'supabase'})}:name==='companions'?{readIdentityPet:(who,petId)=>{assert.equal(who,viewer);const pet=participants.find(entry=>entry.ownerAccountId===who&&entry.petId===petId);return {...pet,name:'Current own nickname'};}}:undefined};
 const views=createBattleDisplayViews({services,prepareOnline:who=>assert.equal(who,viewer),online:{cloudProvider:()=>{},invoke:async(op,input)=>{assert.equal(op,'get_display_metadata');assert.deepEqual(input,{roomIds:[originalRoom.id]});return {format:'lingjing.battle.serial-views',version:1,ownerAccountId:viewer,namespace:'qa:offline-report-contract',rooms:[{roomId:originalRoom.id,roomRevision:'1',participants}]};}}});
 try{return {expected,actual:await views.project(expected,viewer)};}finally{views.dispose();}
}
test('actual production report display views pass for both owners, pending identities and colliding owner-scoped pet IDs',async()=>{
 for(const viewer of[owner,peer])for(const options of[{}, {pending:true}, {originalRoom:{...room,guest_pet_id:room.host_pet_id}}]){
  const {actual,expected}=await reportView(viewer,options),before=structuredClone({actual,expected});
  assert.notDeepEqual(actual,expected,'The old direct comparison rejected the additive production view');
  assert.equal(validateBattleReportView(actual,expected),actual);assert.deepEqual({actual,expected},before,'Comparison never mutates its inputs');
 }
});
test('display comparison retains every business field, including future additions and nested extras',async()=>{
 const {actual,expected}=await reportView();
 const paths=[[],['player'],['enemy'],['context'],['reward'],['rules'],['rounds',0],['rounds',0,'state','player']];
 const at=(value,path)=>path.reduce((entry,key)=>entry[key],value);
 for(const path of paths){
  const extra=structuredClone(actual);at(extra,path).newBusinessField={mustRemain:'exact'};assert.throws(()=>validateBattleReportView(extra,expected),`Unknown extra at ${path}`);
  const future=structuredClone(expected);at(future,path).newBusinessField={mustRemain:'exact'};validateBattleReportView(extra,future);
  at(extra,path).newBusinessField.mustRemain='tampered';assert.throws(()=>validateBattleReportView(extra,future),`Future authority field at ${path}`);
  for(const key of Object.keys(at(expected,path))){const missing=structuredClone(actual);delete at(missing,path)[key];assert.throws(()=>validateBattleReportView(missing,expected),`Missing ${[...path,key]}`);}
 }
 for(const mutate of[value=>value.rounds[0].damageTaken.enemy--,value=>value.rounds[0].state.player.hp--,value=>value.rounds[0].actions.player='dodge',value=>value.rounds[0].winner='enemy',value=>value.reward.experience++,value=>value.context.cloudUserId=peer,value=>value.player.petId='foreign-pet',value=>value.enemy.petId='foreign-pet',value=>{[value.player,value.enemy]=[value.enemy,value.player];}]){const wrong=structuredClone(actual);mutate(wrong);assert.throws(()=>validateBattleReportView(wrong,expected));}
 for(const side of['player','enemy'])for(const key of['displayKind','displayIdentity']){const future=structuredClone(expected);future[side][key]=actual[side][key];assert.throws(()=>validateBattleReportView(actual,future),'A new authority field may not be silently stripped');}
});
test('malformed, missing, foreign and unknown display extensions fail closed on either participant',async()=>{
 const {actual,expected}=await reportView();
 const changes=[value=>delete value.displayKind,value=>delete value.displayIdentity,value=>value.displayKind='practice',value=>value.displayKind='waiting',value=>value.displayIdentity=null,value=>value.displayIdentity=[],value=>value.displayIdentity='identity',
  value=>delete value.displayIdentity.roleName,value=>delete value.displayIdentity.instanceNumber,value=>delete value.displayIdentity.historicalNickname,
  value=>value.displayIdentity.petId='foreign-pet',value=>value.displayIdentity.ownerAccountId=peer,value=>value.displayIdentity.futureField=true,
  value=>value.displayIdentity.roleName='Unrecognized role',value=>value.displayIdentity.roleName={zh:'小狐'},value=>value.displayIdentity.historicalNickname={},
  value=>value.displayIdentity.historicalNickname=value.displayIdentity.roleName,value=>value.futureDisplayField=true];
 for(const number of[7,null,undefined,'','0','0000','7','007','00007','000010000','1e4','-0001',' 0007','0007 ','１２３４'])changes.push(value=>value.displayIdentity.instanceNumber=number);
 for(const side of['player','enemy'])for(const change of changes){const wrong=structuredClone(actual);change(wrong[side]);assert.throws(()=>validateBattleReportView(wrong,expected),`${side}: ${change}`);}
 const wrongPeer=structuredClone(actual);wrongPeer.enemy.displayIdentity=structuredClone(actual.player.displayIdentity);assert.throws(()=>validateBattleReportView(wrongPeer,expected),'Peer identity must retain the original report nickname');
});
test('canonical serial text and legacy peer nicknames retain supported display semantics',async()=>{
 const {actual,expected}=await reportView();
 for(const number of['0001','0999','1000','10000','900719925474099312345678901234567890','待同步']){const value=structuredClone(actual);value.player.displayIdentity.instanceNumber=number;validateBattleReportView(value,expected);}
 for(const name of['青芽',{zh:'历史昵称',en:'Archived nickname'},null]){
  const view=await reportView(owner,{originalRoom:{...room,guest_pet_name:name}});validateBattleReportView(view.actual,view.expected);
 }
});
