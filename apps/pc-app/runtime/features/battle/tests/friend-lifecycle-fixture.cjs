// Typed scripted wire only. SQLite, OnlineDuelService, battle core, settlement
// preparation, BackupManager and AccountSync are the production implementations.
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {createServices}=require('../../../core/services.cjs');
const {CompanionsService}=require('../../companions/service.cjs');
const {GardenService}=require('../../garden/service.cjs');
const {createCompanionBackupAdapter}=require('../../companions/backup.cjs');
const {createGardenBackupAdapter}=require('../../garden/backup.cjs');
const {createBattleBackupAdapter}=require('../backup.cjs');
const {BackupManager}=require('../../accounts/backups.cjs');
const {AccountSync}=require('../../accounts/sync.cjs');
const {BattleFeatureService}=require('../service.cjs');
const {checksum,canonical}=require('../../accounts/util.cjs');
const clone=value=>JSON.parse(JSON.stringify(value));
const fail=code=>{throw Object.assign(new Error(code),{code});};
async function fixture(){
 const base=mkdtempSync(join(tmpdir(),'lingjing-friend-lifecycle-'));
 const core=await import(pathToFileURL(join(__dirname,'../../../../../../infra/supabase/functions/lingjing-battle/room-core.js')).href);
 const {friendSession}=await import(pathToFileURL(join(__dirname,'../../../../../../infra/supabase/functions/lingjing-battle/projection.js')).href);
 const {prepareBattleSettlement}=await import(pathToFileURL(join(__dirname,'../../../../../../infra/supabase/functions/lingjing-battle/settlement.js')).href);
 const users=[],invites=new Map(),rooms=new Map(),commands=new Map(),proofs=new Map(),calls=[],interrupt=new Set();
 const stamp=()=>new Date().toISOString();
 function once(user,op,input,change){const key=user.owner+'|'+op+'|'+input.actionId,hash=checksum(input),prior=commands.get(key);if(prior){assert.equal(prior.hash,hash,'Original action ID must retain its exact request');return prior.value;}const value=change();commands.set(key,{hash,value});return value;}
 const dto=request=>({...request,...(request.roomId?{roomCode:rooms.get(request.roomId).room.room_code,roomStatus:rooms.get(request.roomId).room.status}:{})});
 const snapshot=state=>({room:clone(state.room),rounds:clone(state.rounds),pendingAction:null});
 function createRoom(user,input){
  let request;if(input.requestId){request=invites.get(input.requestId);if(!request||request.toUserId!==user.owner||!['pending','accepted'].includes(request.status))fail('INVITE_UNAVAILABLE');}
  const roomId=request?.roomId||randomUUID();if(rooms.has(roomId))return roomId;
  const pet=user.ownedPet(input.petId);assert.ok(pet);const initial=core.initialRoomState(pet.element,'water');
  const room={id:roomId,room_code:roomId.replaceAll('-','').slice(0,10).toUpperCase(),host_user_id:user.owner,guest_user_id:null,host_account:user.account,guest_account:null,host_pet_id:pet.petId,guest_pet_id:null,host_pet_name:pet.name,guest_pet_name:null,host_resource_id:pet.resource.resourceId,guest_resource_id:null,host_pet_level:1,guest_pet_level:null,host_element:pet.element,guest_element:null,status:'waiting',current_round:1,last_resolved_round:0,revision:1,winner_side:null,rules_version:core.RULES_VERSION,core_version:core.BATTLE_CORE_VERSION,invitation_id:request?.id||null,invited_user_id:request?.fromUserId||null,created_at:stamp(),updated_at:stamp(),authority:'live',protocolVersion:2};
  for(const side of ['host','guest']){const actor=initial[side==='host'?'player':'enemy'];room[side+'_hp']=actor.hp;room[side+'_anger']=actor.anger;room[side+'_statuses']=[];room[side+'_free_dodge_used']=false;}
  rooms.set(roomId,{room,rounds:[],pending:new Map()});if(request){request.status='accepted';request.roomId=roomId;}return roomId;
 }
 async function wire(user,name,input){
  calls.push({owner:user.owner,name,input:clone(input)});
  if(name==='lingjing-save'){assert.equal(input.op,'read');return input.actionId?user.receipts.get(input.actionId):user.head;}
  assert.equal(name,'lingjing-battle');const {op}=input;let data;
  if(op==='search_accounts')data={users:users.filter(peer=>peer.account.includes(input.keyword)).map(peer=>({id:peer.owner,account:peer.account,username:peer.account}))};
  else if(op==='list_duel_requests')data={inbound:[...invites.values()].filter(r=>r.toUserId===user.owner).map(dto),outbound:[...invites.values()].filter(r=>r.fromUserId===user.owner).map(dto)};
  else if(op==='send_duel_request'){const id=once(user,op,input,()=>{const peer=users.find(peer=>peer.account===input.targetAccount);assert.ok(peer);const id=randomUUID();invites.set(id,{id,fromUserId:user.owner,toUserId:peer.owner,fromAccount:user.account,toAccount:peer.account,status:'pending',roomId:null,roomCode:null,roomStatus:null,createdAt:stamp(),updatedAt:stamp()});return id;});data={request:dto(invites.get(id))};}
  else if(op==='create_room')data=snapshot(rooms.get(once(user,op,input,()=>createRoom(user,input))));
  else if(op==='respond_duel_request'||op==='cancel_duel_request'){const request=invites.get(input.requestId);assert.ok(request);once(user,op,input,()=>{if(op==='cancel_duel_request')request.status='cancelled';else if(input.decision==='reject')request.status='rejected';else assert.equal(request.status,'accepted');return request.id;});data={request:dto(request)};}
  else if(op==='join_room'){const state=[...rooms.values()].find(s=>s.room.room_code===input.roomCode);assert.ok(state);once(user,op,input,()=>{const pet=user.ownedPet(input.petId);assert.ok(pet);Object.assign(state.room,{guest_user_id:user.owner,guest_account:user.account,guest_pet_id:pet.petId,guest_pet_name:pet.name,guest_resource_id:pet.resource.resourceId,guest_pet_level:1,guest_element:pet.element,status:'active'});return state.room.id;});data=snapshot(state);}
  else if(op==='get_active_room'){const state=[...rooms.values()].find(s=>['waiting','active'].includes(s.room.status)&&[s.room.host_user_id,s.room.guest_user_id].includes(user.owner));data=state?snapshot(state):{room:null,rounds:[],pendingAction:null};}
  else if(op==='get_active_training')data={session:null};
  else if(op==='get_room')data=snapshot(rooms.get(input.roomId)||[...rooms.values()].find(s=>s.room.room_code===input.roomCode));
  else if(op==='submit_action'){const state=rooms.get(input.roomId),room=state.room,side=room.host_user_id===user.owner?'host':'guest';once(user,op,input,()=>{assert.equal(input.roundNo,room.current_round);state.pending.set(side,input.action);if(state.pending.size===2){const result=core.resolveRoomRound(room,state.pending.get('host'),state.pending.get('guest')),roundNo=room.current_round;state.rounds.push({room_id:room.id,round_no:roundNo,host_action:result.actions.host,guest_action:result.actions.guest,round_result:result});for(const role of ['host','guest']){room[role+'_hp']=result.hp_after[role];room[role+'_anger']=result.anger_after[role];room[role+'_statuses']=result.statuses_after[role];room[role+'_free_dodge_used']=result.free_dodge_used[role];}room.last_resolved_round=roundNo;room.current_round++;room.revision++;room.winner_side=result.winner_side;room.status=result.winner_side?'finished':'active';room.updated_at=stamp();state.pending.clear();}return true;});data={...snapshot(state),accepted:true,waiting:room.last_resolved_round<input.roundNo};}
  else if(op==='leave_room'){const state=rooms.get(input.roomId);once(user,op,input,()=>{state.room.status='abandoned';state.room.updated_at=stamp();return true;});data=snapshot(state);}
  else if(op==='claim_battle_settlement'){
   const key=user.owner+'|'+input.roomId;if(!proofs.has(key)){const state=rooms.get(input.roomId);assert.equal(state.room.status,'finished');const session=friendSession(state.room,state.rounds,user.owner,{}),prepared=await prepareBattleSettlement({envelope:user.head.envelope,owner:user.owner,session}),body=clone(user.head.envelope);delete body.checksum;for(const [id,fragment]of Object.entries(prepared.fragments))body.data.modules[id]=fragment.module;body.createdAt=stamp();const envelope={...body,checksum:checksum(body)},actionId='battle-authority:friend:'+input.roomId,head={revision:user.head.revision+1,checksum:envelope.checksum,envelope,actionId};user.head=head;user.receipts.set(actionId,head);const report=JSON.parse(prepared.fragments.battle.module.data.reports.find(r=>r.id===session.id).data_json);proofs.set(key,{owner_account_id:user.owner,room_id:input.roomId,pet_id:input.petId,action_id:prepared.reward.actionId,experience:prepared.reward.experience,won:prepared.reward.won,reward:prepared.reward,report,authority:{actionId,revision:head.revision,checksum:head.checksum}});}data=clone(proofs.get(key));
  }else fail('UNSUPPORTED_SCRIPTED_OP');
  if(interrupt.delete(user.owner+'|'+op))fail('SCRIPTED_RESPONSE_LOST');return clone(data);
 }
 function open(user){
  const db=openDatabase(join(base,user.label+'.sqlite'));for(const [id,file]of [['accounts','schema'],['companions','migrations'],['garden','migrations'],['battle','migrations']]){const module=require(`../../${id}/${file}.cjs`);migrate(db,id,module.migrations||module);}
  if(!db.prepare('SELECT 1 FROM account_identities WHERE owner_account_id=?').get(user.owner)){const now=stamp();db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(user.owner,'runtime',user.owner,user.account,user.account,user.account,now,now);}
  user.db=db;user.companions=new CompanionsService({db});if(!user.pet){user.pet=user.companions.adopt(user.owner,{actionId:'original-adoption',templateId:user.label==='A'?'big-fish-gentle':'animal-shiba',name:'原伙伴'+user.label,showOnDesktop:false}).data.pet;user.other=user.companions.adopt(user.owner,{actionId:'other-adoption',templateId:'big-fish-gentle',name:'保留伙伴'+user.label,showOnDesktop:false}).data.pet;user.companions.select(user.owner,{actionId:'original-selection',petId:user.pet.petId,slot:'battlePetId'});}
  new GardenService({db}).snapshot({ownerAccountId:user.owner});const backups=new BackupManager({db,directory:join(base,user.label+'-backups'),getIdentity:owner=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(owner)});user.adapter=createBattleBackupAdapter(db);for(const adapter of[createCompanionBackupAdapter(db),createGardenBackupAdapter(db),user.adapter])backups.register(adapter);user.backups=backups;
  if(!user.head){const {checksum:discard,...body}=backups.snapshot(user.owner);void discard;body.data=backups.cloudData(body.data,user.owner);const envelope={...body,checksum:checksum(body)};user.head={revision:1,checksum:envelope.checksum,envelope};}
  const identity={id:user.owner,ownerAccountId:user.owner,provider:'runtime',authKind:'supabase',deviceId:user.device,sessionId:user.sid,account:user.account};
  user.sync=new AccountSync({db,backups,remote:{enabled:true,authKind:'supabase',cloudSave:async(op)=>{assert.equal(op,'read');return user.head;}},getSession:()=>identity,getSettings:()=>({document:{sync:{enabled:true}}})});if(!db.prepare('SELECT 1 FROM account_sync_state WHERE owner_account_id=?').get(user.owner))user.sync.acceptAuthoritativeReadback(user.owner,{envelope:user.head.envelope,cloudRevision:1});
  const client={functions:{invoke:async()=>{throw Error('Scripted typed invoker required');}},realtime:{setAuth:async()=>{},disconnect(){}},channel:()=>({state:'joined',on(){return this;},subscribe(fn){fn('SUBSCRIBED');return this;}}),removeChannel:async()=>{}};
  user.ownedPet=id=>user.companions.snapshot(user.owner).data.pets.find(pet=>pet.petId===id);
  const services=createServices({db,legacy:{},paths:{userData:base}});services.session.setAdapter({getCurrentUser:()=>identity});services.provide('accounts',{getOwnerAccountId:()=>user.owner,privateSession:()=>identity,sync:user.sync});services.provide('backups',backups);services.provide('companions',{getPet:(owner,id)=>user.companions.snapshot(owner).data.pets.find(pet=>pet.petId===id),listPets:owner=>user.companions.snapshot(owner).data.pets,getSelections:owner=>user.companions.selections(owner),select:(owner,input)=>user.companions.select(owner,input)});services.provide('cloudActor',{requireActor:async()=>({schemaVersion:1,authority:'live',authKind:'supabase',authUserId:user.uid,ownerAccountId:user.owner,deviceId:user.device,sessionId:user.sid,url:'https://scripted-battle.invalid',client,invoke:(name,input)=>wire(user,name,input)})});user.services=services;user.service=new BattleFeatureService(services);
  user.call=(command,input={})=>user.service[command](input,{ownerAccountId:user.owner});
 }
 for(const label of ['A','B']){const user={label,owner:'account:'+randomUUID(),account:'scripted-'+label,uid:randomUUID(),device:randomUUID(),sid:randomUUID(),receipts:new Map()};users.push(user);open(user);}
 return {base,users,invites,rooms,commands,calls,interrupt,clone,canonical,async restart(user){user.service.dispose();user.db.close();open(user);},close(){for(const user of users){user.service.dispose();user.db.close();}}};
}
module.exports={fixture};
