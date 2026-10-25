const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OnlineDuelService}=require('../../../services/online-duel-service.cjs');
const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'10000000-0000-4000-8000-000000000001',ownerAccountId:'old-owner-text',deviceId:'20000000-0000-4000-8000-000000000001',sessionId:'30000000-0000-4000-8000-000000000001',account:'unit-user',username:'单元检查'};
function fixture() {
  const calls=[],channels=[],state={authCalls:0,disconnects:0};
  const room={id:'40000000-0000-4000-8000-000000000001',host_user_id:actor.ownerAccountId,guest_user_id:'other-owner',room_code:'ABCDEFGHIJ',status:'active',current_round:1,last_resolved_round:0,host_element:'water',guest_element:'fire',host_hp:120,guest_hp:120,host_anger:0,guest_anger:0};
  const client={functions:{invoke:async(name,input)=>{calls.push({name,...input});return state.response||{data:{ok:true,data:{room,rounds:[],pendingAction:{actionId:'original-action',action:'normal_attack',roundNo:1}}},error:null};}},realtime:{setAuth:async()=>{state.authCalls++;},disconnect:()=>{state.disconnects++;}},channel:(name,config)=>{const value={name,config,state:'joined',handlers:[],on(event,filter,handler){this.handlers.push({event,filter,handler});return this;},subscribe(fn){fn('SUBSCRIBED');return this;}};channels.push(value);return value;},removeChannel:async(channel)=>{channel.removed=true;}};
  const transport={url:'https://jbvrdmrkwpznbrvteive.supabase.co',actor,client},online=new OnlineDuelService({cloudProvider:async()=>transport});online.setCurrentUser({id:actor.ownerAccountId,account:actor.account,sessionToken:'legacy-must-not-travel'});
  return {online,transport,client,calls,channels,state,room};
}
test('SCRIPTED SDK boundary only: cloud operations omit legacy identity and untrusted pet facts, keep original actionId and private authorized topic',async()=>{
  const f=fixture();await f.online.createRoom({actionId:'create-original',petId:'pet-original',petElement:'earth',petName:'untrusted',petResourceId:'untrusted'});
  assert.deepEqual(f.calls[0].body,{op:'create_room',actionId:'create-original',petId:'pet-original',requestId:null});
  assert.equal(f.channels[0].name,`lingjing:battle:${f.room.id}`);assert.deepEqual(f.channels[0].config,{config:{private:true}});assert.deepEqual(f.channels[0].handlers.map(value=>value.filter.table),['lingjing_battle_rooms','lingjing_battle_rounds']);assert.ok(f.state.authCalls>=2);
  await f.online.submitAction({action:'normal_attack',roundNo:1,actionId:'original-action',waitForResolution:false});assert.equal(f.calls.at(-1).body.actionId,'original-action');assert.equal(Object.hasOwn(f.calls.at(-1).body,'sessionToken'),false);
  const synced=await f.online.syncRoom();assert.equal(synced.pendingAction.actionId,'original-action');assert.equal(f.online.getStatus().actor.ownerAccountId,actor.ownerAccountId);assert.equal(Object.hasOwn(f.online.getStatus().currentUser,'sessionToken'),false);
});
test('SCRIPTED SDK boundary only: auth owner changes during refresh cannot invoke the old client',async()=>{
  const f=fixture();let release;f.online.cloudProvider=()=>new Promise(resolve=>{release=resolve;});const pending=f.online.invoke('get_room',{roomId:f.room.id});f.online.setCurrentUser({id:'new-owner',account:'next'});release(f.transport);await assert.rejects(pending,error=>error.code==='AUTH_CHANGED');assert.equal(f.calls.length,0);
});
test('SCRIPTED SDK boundary only: HTTP credentials and legacy password ops are refused before network calls',async()=>{
  const f=fixture();f.transport.url='http://47.112.208.97:8000';await assert.rejects(f.online.invoke('get_room',{roomId:f.room.id}),error=>error.code==='CLOUD_HTTPS_REQUIRED');assert.equal(f.calls.length,0);await assert.rejects(f.online.invoke('login_account',{password:'never-send'}),error=>error.code==='USE_SHARED_AUTH_BRIDGE');assert.equal(f.calls.length,0);
});
test('SCRIPTED SDK boundary only: revoked JWT response and logout disconnect/remove channels without exposing tokens',async()=>{
  const f=fixture();await f.online.createRoom({actionId:'create-for-revoke',petId:'pet'});f.state.response={data:{ok:false,code:'SESSION_REVOKED',message:'请重新登录'},error:null};await assert.rejects(f.online.invoke('get_room',{roomId:f.room.id}),error=>error.code==='SESSION_REVOKED');assert.equal(f.online.getStatus().currentUser,null);assert.equal(f.online.getStatus().actor,null);assert.equal(f.online.channel,null);assert.ok(f.channels[0].removed);assert.ok(f.state.disconnects>0);
});
