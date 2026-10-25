import { type ActorContext, LingjingAuthError, readJson, jsonResponse, uuid } from '../_shared/lingjing-auth.ts';
import { resolveRoomRound } from './room-core.js';

type Db = ActorContext['client'];
export type TrustedBattlePet = Readonly<{ownerId:string;petId:string;name:string;resourceId:string;element:string}>;
export type BattleDependencies = {
  /** Service client is confined to authority RPCs / verified directory and pending-choice reads. */
  admin: Db;
  /** Must read a protected authority fragment, never an unverified client/import envelope. */
  resolvePet(actor:ActorContext,petId:string):Promise<TrustedBattlePet>;
};
type Row = Record<string, any>;
const table={rooms:'lingjing_battle_rooms',invites:'lingjing_battle_invites',actions:'lingjing_battle_actions',rounds:'lingjing_battle_rounds',commands:'lingjing_battle_commands',members:'lingjing_battle_members'};
const moves=new Set(['normal_attack','element_attack','dodge','ultimate']);
const elements=new Set(['metal','wood','earth','water','fire']);
const denied=new Set(['ROOM_FORBIDDEN','INVITE_FORBIDDEN','SELF_DUEL_FORBIDDEN','PET_OWNER_MISMATCH','PET_ROOM_MISMATCH','ACTOR_OWNER_MISMATCH','TARGET_OWNER_MISMATCH']);
const conflicts=new Set(['ACTION_ID_REUSED','ACTION_LOCKED','INVITE_CONFLICT','INVITE_ALREADY_RECEIVED','ROOM_FULL','ROOM_NOT_WAITING','ROUND_CONFLICT','BATTLE_IN_PROGRESS','BATTLE_UNFINISHED','BATTLE_RULES_UNSUPPORTED']);
const codeOf=(error:unknown)=>{
  const message=String((error as {message?:string})?.message||'');
  for(const code of [...denied,...conflicts,'INVALID_COMMAND','ACTIONS_REQUIRED','BATTLE_RULES_MISMATCH'])if(message.includes(code))return code;
  if(message.includes('lingjing_battle_one_active_'))return 'BATTLE_IN_PROGRESS';
  if(message.includes('lingjing_battle_pending_pair'))return 'INVITE_ALREADY_RECEIVED';
  return 'BATTLE_CLOUD_UNAVAILABLE';
};
function fail(code:string,status?:number):never {throw new LingjingAuthError(code,status||(denied.has(code)?403:conflicts.has(code)?409:400));}
const text=(value:unknown,max=160)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail('INVALID_COMMAND');return value.trim();};
const identifier=(value:unknown)=>{if(!uuid(value))fail('INVALID_COMMAND');return value;};
const integer=(value:unknown,min=1,max=1000000)=>{if(!Number.isSafeInteger(value)||Number(value)<min||Number(value)>max)fail('INVALID_COMMAND');return Number(value);};
const canonical=(value:unknown):string=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`:JSON.stringify(value);
const inviteDto=(row:Row,room?:Row)=>({id:row.id,fromUserId:row.from_user_id,toUserId:row.to_user_id,fromAccount:row.from_account,toAccount:row.to_account,status:row.status,roomId:row.room_id,roomCode:room?.room_code||null,roomStatus:room?.status||null,createdAt:row.created_at,updatedAt:row.updated_at});
function roomDto(row:Row):Row {
  const {host_auth_uid:_host,guest_auth_uid:_guest,invited_auth_uid:_invited,...safe}=row;
  return {...safe,authority:'live',protocolVersion:2};
}
async function must<T>(operation:PromiseLike<{data:T;error:any}>):Promise<T> {const result=await operation;if(result.error)fail(codeOf(result.error),503);return result.data;}

export function createBattleHandler(deps:BattleDependencies) {
  const rpc=async(name:string,input:Row)=>{
    const result=await deps.admin.rpc(name,input);
    if(result.error){const code=codeOf(result.error);fail(code,denied.has(code)?403:conflicts.has(code)?409:503);}
    return result.data as Row;
  };
  const pet=async(actor:ActorContext,id:string)=>{
    const value=await deps.resolvePet(actor,id);
    if(value.ownerId!==actor.ownerAccountId||value.petId!==id||!elements.has(value.element)||!value.resourceId||!value.name)fail('PET_OWNER_MISMATCH');
    return value;
  };
  async function roomFor(actor:ActorContext,input:Row) {
    let query=actor.client.from(table.rooms).select('*');
    if(input.roomId)query=query.eq('id',identifier(input.roomId));else query=query.eq('room_code',text(input.roomCode,12).toUpperCase());
    const row=await must(query.maybeSingle()) as Row|null;
    if(!row)fail('ROOM_FORBIDDEN');
    if(!((row.host_auth_uid===actor.authUserId&&row.host_user_id===actor.ownerAccountId)||(row.guest_auth_uid===actor.authUserId&&row.guest_user_id===actor.ownerAccountId)))fail('ROOM_FORBIDDEN');
    return row;
  }
  async function command(actor:ActorContext,op:string,actionId:unknown,logical:Row,build:()=>Promise<Row>) {
    const id=text(actionId,128);if(!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(id))fail('INVALID_COMMAND');
    // Resolve a lost response before re-reading mutable pet names/resources. Logical input is
    // immutable; server-derived presentation metadata changing cannot create a second command.
    const cached=await must(deps.admin.from(table.commands).select('owner_account_id,operation,input_json,result_json').eq('actor_auth_uid',actor.authUserId).eq('action_id',id).maybeSingle()) as Row|null;
    if(cached){if(cached.owner_account_id!==actor.ownerAccountId||cached.operation!==op||canonical(cached.input_json?.request)!==canonical(logical))fail('ACTION_ID_REUSED');if(cached.result_json)return cached.result_json as Row;}
    return rpc('lingjing_battle_command',{p_actor:actor.authUserId,p_owner:actor.ownerAccountId,p_op:op,p_action_id:id,p_input:{...await build(),request:logical}});
  }
  async function resolved(actor:ActorContext,initial:Row) {
    let room=initial;
    for(let attempt=0;attempt<3;attempt++) {
      if(room.status!=='active')return room;
      const actions=await must(deps.admin.from(table.actions).select('actor_side,action_type').eq('room_id',room.id).eq('round_no',room.current_round)) as Row[];
      const host=actions.find(row=>row.actor_side==='host')?.action_type,guest=actions.find(row=>row.actor_side==='guest')?.action_type;
      if(!host||!guest)return room;
      const result=resolveRoomRound(room,host,guest);
      const value=await deps.admin.rpc('lingjing_battle_commit_round',{p_room:room.id,p_round:room.current_round,p_revision:room.revision,p_host_action:host,p_guest_action:guest,p_result:result});
      if(!value.error)return value.data.room as Row;
      if(codeOf(value.error)!=='ROUND_CONFLICT')fail(codeOf(value.error),503);
      room=await roomFor(actor,{roomId:room.id});
    }
    fail('ROUND_CONFLICT');
  }
  async function snapshot(actor:ActorContext,input:Row) {
    // Also finishes a round whose two immutable choices were persisted before an Edge crash.
    const room=await resolved(actor,await roomFor(actor,input));
    let query=actor.client.from(table.rounds).select('*').eq('room_id',room.id).order('round_no',{ascending:false}).limit(input.roundsLimit?integer(input.roundsLimit,1,50):20);
    if(input.beforeRound)query=query.lt('round_no',integer(input.beforeRound));
    const rounds=await must(query) as Row[];
    const pending=room.status==='active'?await must(deps.admin.from(table.actions).select('action_id,action_type,round_no').eq('room_id',room.id).eq('round_no',room.current_round).eq('actor_auth_uid',actor.authUserId).eq('owner_account_id',actor.ownerAccountId).maybeSingle()) as Row|null:null;
    return {room:roomDto(room),rounds:rounds.sort((a,b)=>a.round_no-b.round_no),pendingAction:pending?{actionId:pending.action_id,action:pending.action_type,roundNo:pending.round_no,uncertain:false}:null};
  }
  async function invitations(actor:ActorContext) {
    const rows=await must(actor.client.from(table.invites).select('*').order('created_at',{ascending:false}).limit(100)) as Row[];
    const ids=rows.map(row=>row.room_id).filter(Boolean);
    // A reserved invitee cannot read a room before joining. Only return code/status for
    // that accepted invitation, without exposing the other player's actor statistics.
    const rooms=ids.length?await must(deps.admin.from(table.rooms).select('id,room_code,status,host_auth_uid,guest_auth_uid,invited_auth_uid').in('id',ids)) as Row[]:[];
    const dto=(row:Row)=>{const room=rooms.find(room=>room.id===row.room_id&&(room.host_auth_uid===actor.authUserId||room.guest_auth_uid===actor.authUserId||room.invited_auth_uid===actor.authUserId));return inviteDto(row,room);};
    return {inbound:rows.filter(row=>row.to_user_id===actor.ownerAccountId).map(dto),outbound:rows.filter(row=>row.from_user_id===actor.ownerAccountId).map(dto)};
  }
  return async(request:Request,actor:ActorContext):Promise<Response>=>{
    const input=await readJson(request,16*1024),op=text(input.op,40);
    if(['userId','ownerAccountId','sessionToken','actor','authUserId'].some(key=>Object.hasOwn(input,key)))fail('LEGACY_IDENTITY_REJECTED',400);
    let data:unknown;
    if(op==='search_accounts') {
      const keyword=text(input.keyword??input.query,64),pattern=`%${keyword.toLowerCase().replace(/[\\%_]/g,'\\$&')}%`,limit=input.limit?integer(input.limit,1,20):20;
      if(keyword.length<2)fail('SEARCH_TOO_SHORT');
      const base=()=>deps.admin.from('lingjing_accounts').select('owner_id,account,username').eq('status','active').neq('owner_id',actor.ownerAccountId).limit(limit);
      const [accounts,names]=await Promise.all([must(base().ilike('account_key',pattern)),must(base().ilike('username',pattern))]);
      const found=new Map<string,Row>();for(const row of [...accounts as Row[],...names as Row[]])found.set(row.owner_id,{id:row.owner_id,account:row.account,username:row.username});data={users:[...found.values()].slice(0,limit)};
    } else if(op==='list_duel_requests') data=await invitations(actor);
    else if(op==='get_room') data=await snapshot(actor,input);
    else if(op==='get_active_room') {
      const member=await must(actor.client.from(table.members).select('room_id').eq('active',true).maybeSingle()) as Row|null;
      data=member?await snapshot(actor,{roomId:member.room_id,roundsLimit:50}):{room:null,rounds:[],pendingAction:null};
    } else if(op==='send_duel_request') {
      const account=text(input.targetAccount,32);
      const target=await must(deps.admin.from('lingjing_accounts').select('owner_id,auth_user_id,account').eq('account_key',account.toLowerCase()).eq('status','active').maybeSingle()) as Row|null;
      if(!target)fail('ACCOUNT_NOT_FOUND',404);if(target.owner_id===actor.ownerAccountId||target.auth_user_id===actor.authUserId)fail('SELF_DUEL_FORBIDDEN');
      const result=await command(actor,'invite',input.actionId,{targetOwnerId:target.owner_id},async()=>({account:actor.account,target:{authUid:target.auth_user_id,ownerId:target.owner_id,account:target.account}}));
      data={request:inviteDto(result.request)};
    } else if(op==='cancel_duel_request'||op==='respond_duel_request'&&input.decision==='reject') {
      const id=identifier(input.requestId),operation=op==='cancel_duel_request'?'cancel_invite':'reject_invite';
      const result=await command(actor,operation,input.actionId,{requestId:id},async()=>({requestId:id}));data={request:inviteDto(result.request)};
    } else if(op==='create_room'||op==='respond_duel_request'&&input.decision==='accept') {
      const requestId=input.requestId?identifier(input.requestId):undefined;
      // The existing orchestration creates the reserved room then confirms acceptance. Re-read
      // that same accepted invitation rather than creating a second room or requiring new pet data.
      if(requestId&&op==='respond_duel_request') {
        const existing=await must(actor.client.from(table.invites).select('*').eq('id',requestId).eq('to_auth_uid',actor.authUserId).maybeSingle()) as Row|null;
        if(!existing)fail('INVITE_FORBIDDEN');
        if(existing.status==='accepted'&&existing.room_id){const state=await snapshot(actor,{roomId:existing.room_id});return jsonResponse({ok:true,data:{request:inviteDto(existing,state.room),...state}});}
      }
      const petId=text(input.petId),operation=requestId?'accept_invite':'create_room';
      const result=await command(actor,operation,input.actionId,{petId,...(requestId?{requestId}: {})},async()=>({account:actor.account,pet:await pet(actor,petId),...(requestId?{requestId}: {})}));
      const state=await snapshot(actor,{roomId:result.room.id});data={...state,...(result.request?{request:inviteDto(result.request,state.room)}:{})};
    } else if(op==='join_room') {
      const code=text(input.roomCode,12).toUpperCase(),petId=text(input.petId);if(!/^[A-Z0-9]{6,12}$/.test(code))fail('INVALID_COMMAND');
      const result=await command(actor,'join_room',input.actionId,{roomCode:code,petId},async()=>({account:actor.account,roomCode:code,pet:await pet(actor,petId)}));data=await snapshot(actor,{roomId:result.room.id});
    } else if(op==='submit_action') {
      const roomId=identifier(input.roomId),roundNo=integer(input.roundNo),action=text(input.action,24);if(!moves.has(action))fail('INVALID_COMMAND');
      await roomFor(actor,{roomId});await command(actor,'submit_action',input.actionId,{roomId,roundNo,action},async()=>({roomId,roundNo,action}));
      const state=await snapshot(actor,{roomId,roundsLimit:1});data={...state,round:state.rounds.find(row=>row.round_no===roundNo)||null,accepted:true,waiting:state.room.last_resolved_round<roundNo};
    } else if(op==='leave_room') {
      const roomId=identifier(input.roomId);await roomFor(actor,{roomId});await command(actor,'leave_room',input.actionId,{roomId},async()=>({roomId}));data=await snapshot(actor,{roomId});
    } else if(op==='claim_battle_settlement') {
      const roomId=identifier(input.roomId),petId=text(input.petId);await roomFor(actor,{roomId});
      data=await rpc('lingjing_battle_claim_settlement',{p_actor:actor.authUserId,p_owner:actor.ownerAccountId,p_room:roomId,p_pet:petId});
    } else fail('UNSUPPORTED_OP',400);
    return jsonResponse({ok:true,data});
  };
}
