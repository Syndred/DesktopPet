import { BattleRuntimeService, executeRound, getBattleRules, BATTLE_CORE_VERSION } from '../_shared/battle-core.js';

export const RULES_VERSION = getBattleRules().id;
export { BATTLE_CORE_VERSION };
const peerRole = value => value === 'host' ? 'player' : value === 'guest' ? 'enemy' : value;
const roomRole = value => value === 'player' ? 'host' : value === 'enemy' ? 'guest' : value;
const statuses = (values, map) => (values || []).map(value => ({...value,...(value.sourceId ? {sourceId:map(value.sourceId)} : {})}));
const pair = values => ({host:values.player,guest:values.enemy});
export function initialRoomState(hostElement, guestElement) {
  const engine=new BattleRuntimeService();return engine.reset({playerElement:hostElement,enemyElement:guestElement});
}
/** DTO adaptation only; no damage, anger, status, winner or reward formula is duplicated. */
export function resolveRoomRound(room, hostAction, guestAction) {
  if(room.rules_version!==RULES_VERSION||room.core_version!==BATTLE_CORE_VERSION)throw Object.assign(new Error('Unsupported battle rules version'),{code:'BATTLE_RULES_UNSUPPORTED'});
  const engine=new BattleRuntimeService();
  const actor=(side,id)=>({id,element:room[`${side}_element`],hp:room[`${side}_hp`],maxHp:getBattleRules().maxHp,anger:room[`${side}_anger`],freeDodgeUsed:room[`${side}_free_dodge_used`],statuses:statuses(room[`${side}_statuses`],peerRole)});
  engine.restore({round:room.last_resolved_round,player:actor('host','player'),enemy:actor('guest','enemy')});
  const result=executeRound(engine.session,hostAction,guestAction),snapshot=engine.snapshot();
  return {round:result.round,rules_version:RULES_VERSION,core_version:BATTLE_CORE_VERSION,actions:pair(result.actions),damage_taken:pair(result.damageTaken),direct_damage:pair(result.directDamage),dot_damage_events:pair(result.dotDamageEvents),heal_events:pair(result.healEvents),hp_after:pair(result.hpAfter),anger_after:pair(result.angerAfter),statuses_after:{host:statuses(result.statusesAfter.player,roomRole),guest:statuses(result.statusesAfter.enemy,roomRole)},free_dodge_used:{host:snapshot.player.freeDodgeUsed,guest:snapshot.enemy.freeDodgeUsed},winner_side:result.winner?roomRole(result.winner):null,notes:result.notes.map(value=>value.replace(/\bplayer\b/g,'host').replace(/\benemy\b/g,'guest'))};
}
