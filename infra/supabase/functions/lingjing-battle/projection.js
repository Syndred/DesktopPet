import { getBattleRules, BATTLE_CORE_VERSION } from '../_shared/battle-core.js';

const peer = side => side === 'host' ? 'guest' : 'host';
const statuses = (values, side) => (values || []).map(value => ({...value, ...(value.sourceId ? {sourceId:value.sourceId === side ? 'player' : 'enemy'} : {})}));
const pair = (value, side) => ({player:value?.[side] ?? 0, enemy:value?.[peer(side)] ?? 0});
export function roomSnapshot(room, side, round) {
  const rules=getBattleRules(),result=round?.round_result;
  const actor=(role,prefix)=>({id:role,element:room[`${prefix}_element`],hp:result?.hp_after?.[prefix] ?? room[`${prefix}_hp`],maxHp:rules.maxHp,anger:result?.anger_after?.[prefix] ?? room[`${prefix}_anger`],freeDodgeUsed:result?.free_dodge_used?.[prefix] ?? room[`${prefix}_free_dodge_used`],statuses:statuses(result?.statuses_after?.[prefix] ?? room[`${prefix}_statuses`],side)});
  return {round:round?.round_no ?? room.last_resolved_round,player:actor('player',side),enemy:actor('enemy',peer(side))};
}
export function projectRound(room, side, round) {
  const result=round.round_result,state=roomSnapshot(room,side,round);
  return {round:round.round_no,actions:{player:round[`${side}_action`],enemy:round[`${peer(side)}_action`]},damageTaken:pair(result.damage_taken,side),directDamage:pair(result.direct_damage,side),dotDamageEvents:{player:result.dot_damage_events?.[side]||[],enemy:result.dot_damage_events?.[peer(side)]||[]},healEvents:{player:result.heal_events?.[side]||[],enemy:result.heal_events?.[peer(side)]||[]},hpAfter:pair(result.hp_after,side),angerAfter:pair(result.anger_after,side),statusesAfter:{player:state.player.statuses,enemy:state.enemy.statuses},winner:result.winner_side ? result.winner_side===side ? 'player':'enemy':null,notes:result.notes||[],state};
}
export function friendSession(room, rounds, owner, reward) {
  const side=room.host_user_id===owner?'host':room.guest_user_id===owner?'guest':null;
  if(!side)throw Object.assign(new Error('ROOM_FORBIDDEN'),{code:'ROOM_FORBIDDEN'});
  const combatant=prefix=>({petId:room[`${prefix}_pet_id`],petName:room[`${prefix}_pet_name`],element:room[`${prefix}_element`],level:room[`${prefix}_pet_level`]||1,appearance2d:room[`${prefix}_resource_id`],resourceRef:room[`${prefix}_resource_id`],resource:{resourceId:room[`${prefix}_resource_id`],kind:'2d'}});
  const {host_auth_uid:_host,guest_auth_uid:_guest,invited_auth_uid:_invited,...safe}=room;
  return {id:`online-${room.id}`,mode:'friend',status:room.status,startedAt:room.created_at,endedAt:room.updated_at,updatedAt:room.updated_at,player:combatant(side),enemy:combatant(peer(side)),side,room:{...safe,authority:'live',protocolVersion:2},snapshot:roomSnapshot(room,side),rounds:rounds.map(round=>projectRound(room,side,round)),winner:room.winner_side===side?'player':room.winner_side?'enemy':null,pendingAction:null,historyComplete:rounds.length===room.last_resolved_round,rules:getBattleRules(),context:{authority:'supabase',cloudUserId:owner,coreVersion:BATTLE_CORE_VERSION},reward,reportId:`online-${room.id}`};
}
export function reportFor(session) {
  return Object.fromEntries(['id','mode','status','winner','player','enemy','startedAt','endedAt','rounds','reward','historyComplete','context','rules'].map(key=>[key,session[key]]).concat([['sessionId',session.id]]));
}
/** Canonical battle backup adapter projection. Only this session is upserted;
 * all previous server-backed battles and reports remain in the protected fragment. */
export function battleFragment(envelope, session, actions=[]) {
  const previous=envelope.data?.modules?.battle;
  if(previous && (previous.version!==1 || !['sessions','actions','reports','rewards'].every(key=>Array.isArray(previous.data?.[key]))))throw Object.assign(new Error('INVALID_CLOUD_SAVE'),{code:'INVALID_CLOUD_SAVE'});
  const data=structuredClone(previous?.data||{sessions:[],actions:[],reports:[],rewards:[]});
  const upsert=(key,id,value)=>{const index=data[key].findIndex(row=>row[id]===value[id]);if(index<0)data[key].push(value);else data[key][index]=value;data[key].sort((a,b)=>String(a[id])<String(b[id])?-1:1);};
  upsert('sessions','id',{id:session.id,room_id:session.room?.id||null,status:session.status,data_json:JSON.stringify(session),revision:session.revision||1,updated_at:session.updatedAt||session.endedAt});
  upsert('reports','id',{id:session.id,session_id:session.id,data_json:JSON.stringify(reportFor(session)),ended_at:session.endedAt});
  upsert('rewards','session_id',{session_id:session.id,action_id:session.reward.actionId,pet_id:session.player.petId,data_json:JSON.stringify(session.reward)});
  for(const action of actions)upsert('actions','action_id',{action_id:action.action_id,session_id:session.id,command_json:JSON.stringify({action:action.action_type,roundNo:action.round_no}),result_json:JSON.stringify({sessionId:session.id,revision:session.revision||1,resolvedRound:action.round_no})});
  return {module:{version:1,data},tables:{}};
}
