const {test}=require('node:test');
const assert=require('node:assert/strict');
const {OnlineDuelService}=require('../../../services/online-duel-service.cjs');
const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:'10000000-0000-4000-8000-000000000001',ownerAccountId:'old-owner-text',deviceId:'20000000-0000-4000-8000-000000000001',sessionId:'30000000-0000-4000-8000-000000000001',account:'unit-user',username:'单元检查'};
test('retired transport: old constructor URL/key/function options cannot create a client or activate password identity',async()=>{
  const online=new OnlineDuelService({supabaseUrl:'http://retired.invalid:8000',supabaseAnonKey:'retired-key',functionName:'duel-online'});online.setCurrentUser({id:'archive-owner',sessionToken:'archive-only'});
  assert.equal(online.client,null);assert.equal(online.getStatus().enabled,false);assert.equal(online.getStatus().authKind,'unavailable');assert.equal(online.supabaseUrl,null);assert.equal(online.functionName,'lingjing-battle');assert.equal(Object.hasOwn(online,'supabaseAnonKey'),false);assert.equal(Object.hasOwn(online.currentUser,'sessionToken'),false);
  for(const method of ['registerAccount','loginAccount','updateAccount'])assert.equal(online[method],undefined);await assert.rejects(online.invoke('get_room',{roomId:'old-room'}),{code:'CLOUD_AUTH_UNAVAILABLE'});
});
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
test('SCRIPTED SDK lifecycle: callback auth is retained and a coded shared-invoker revocation closes the channel',async()=>{
  const f=fixture(),args=[];f.transport.accessToken='must-not-pin-this-token';f.client.realtime.setAuth=async(...input)=>{args.push(input);};
  await f.online.createRoom({actionId:'callback-mode-original',petId:'pet'});assert.ok(args.length>=2);assert.ok(args.every(input=>input.length===0));
  f.transport.invoke=async()=>{throw Object.assign(new Error('revoked'),{code:'SESSION_REVOKED'});};
  await assert.rejects(f.online.invoke('get_room',{roomId:f.room.id}),error=>error.code==='SESSION_REVOKED');assert.equal(f.online.channel,null);assert.equal(f.online.getStatus().actor,null);assert.ok(f.state.disconnects>0);
});
test('SCRIPTED SDK lifecycle: a real-sync path replaces a closed private channel after socket reconnect without changing the room or pending action',async()=>{
  const f=fixture();await f.online.createRoom({actionId:'reconnect-original-room',petId:'pet'});const old=f.online.channel;old.state='closed';
  const value=await f.online.syncRoom({roomId:f.room.id});assert.equal(old.removed,true);assert.notEqual(f.online.channel,old);assert.equal(f.online.channel.state,'joined');assert.equal(f.online.channel.name,`lingjing:battle:${f.room.id}`);assert.equal(value.pendingAction.actionId,'original-action');assert.deepEqual(f.online.channel.config,{config:{private:true}});
});

test('SCRIPTED SDK lifecycle: overlapping readbacks replace a disconnected subscription once and never remove its replacement',async()=>{
  const f=fixture();await f.online.createRoom({actionId:'concurrent-reconnect',petId:'pet'});const old=f.online.channel;old.state='leaving';
  let release,removes=0;f.client.removeChannel=channel=>{removes++;assert.equal(channel,old);return new Promise(resolve=>{release=()=>{channel.removed=true;resolve();};});};
  const first=f.online.syncRoom({roomId:f.room.id}),second=f.online.syncRoom({roomId:f.room.id});
  for(let n=0;n<20&&!release;n++)await new Promise(resolve=>setImmediate(resolve));assert.ok(release);release();
  const results=await Promise.all([first,second]);assert.equal(removes,1);assert.equal(f.channels.length,2);assert.equal(f.online.channel,f.channels[1]);assert.equal(f.online.channel.removed,undefined);assert.equal(f.online.channel.state,'joined');assert.ok(results.every(value=>value.pendingAction.actionId==='original-action'));
});

test('actual installed SDK lifecycle: disconnect teardown cannot retain the old room topic; unrelated subscriptions survive (no network/Auth)',async()=>{
  const {createClient}=require('@supabase/supabase-js');
  const client=createClient('https://offline-sdk-test.supabase.co','sb_publishable_offline_lifecycle_only',{accessToken:async()=>null});
  try {
    const topic='lingjing:battle:40000000-0000-4000-8000-000000000001',old=client.channel(topic,{config:{private:true}}),other=client.channel('lingjing:unrelated-feature',{config:{private:true}});
    // Execute the actual SDK teardown used by disconnect, without opening a socket.
    old.teardown();assert.equal(old.state,'closed');assert.deepEqual(old.bindings,{});
    await new OnlineDuelService().removeRoomChannel(client,old);
    assert.equal(client.getChannels().includes(old),false);assert.equal(client.getChannels().includes(other),true);assert.notEqual(client.channel(topic,{config:{private:true}}),old);
  } finally {await client.removeAllChannels();}
});

test('SIMULATED loopback only: explicit QA adapter owns scenario identity and pet facts without a Supabase fallback client',async()=>{
  const {mkdtempSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto');
  const {startQaDuelServer}=require('./qa-duel-server.cjs'),{createQaOnline}=require('../qa-adapter.cjs');
  const runId=randomUUID(),token=randomUUID(),server=await startQaDuelServer({runId,token,directory:mkdtempSync(join(tmpdir(),'battle-qa-retirement-'))});
  try{const online=createQaOnline({runId,token,endpoint:server.endpoint});online.setCurrentUser({id:'qa-fixture-owner',account:'qa-fixture'});await online.createRoom({actionId:randomUUID(),petId:'qa-pet',petElement:'water',petName:'隔离水伴'});assert.equal(online.client,null);assert.equal(online.getStatus().authKind,'isolated-qa');assert.equal(online.room.host_element,'water');assert.equal(online.room.host_user_id,'qa-fixture-owner');assert.equal(server.state.provenance,'simulated');assert.equal(server.state.operations[0].userId,'qa-fixture-owner');}finally{await server.close();}
});
