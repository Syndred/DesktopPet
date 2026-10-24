// Runs behind the existing runtime-account authentication, never with renderer owner IDs.
const {randomUUID}=require('node:crypto');
const {nearbySpawns}=require('./spawns.cjs');
const {geofence}=require('./coordinates.cjs');
const {LegacyWildBattleAdapter}=require('./battle-adapter.cjs');
function reject(code,message) {throw Object.assign(new Error(message),{code});}
function checkedFix(fix,spawn,now) {const check=geofence(fix,spawn.position,100,now); if(!check.ok) reject(check.code,check.message); return check;}
function createAuthorityHandler({authenticate,store,now=Date.now}) {
  const battle=new LegacyWildBattleAdapter();
  return async payload=>{
    const owner=await authenticate(payload);
    if(!owner) reject('AUTH_REQUIRED','登录已失效，请重新登录');
    if(payload.op==='reserve') {
      const spawn=nearbySpawns(payload.fix,now()).find(s=>s.id===payload.spawnId);
      if(!spawn) reject('SPAWN_EXPIRED','附近伙伴已刷新');
      checkedFix(payload.fix,spawn,now());
      // The server derives the player's element from a synchronized owned instance.
      const pet=await store.ownedPet(owner,payload.petId);
      if(!pet) reject('CLOUD_PET_NOT_SYNCED','出战伙伴尚未同步到云端，请先完成账号同步');
      const previous=await store.findPermit(owner,spawn.id);
      if(previous) {
        if(previous.status==='captured') reject('SPAWN_ALREADY_CAPTURED','这位伙伴已经加入');
        if(previous.petId!==pet.petId) reject('PERMIT_CONFLICT','这场挑战已经使用另一位出战伙伴');
        return {id:previous.id,expiresAt:previous.expiresAt};
      }
      const permitId=randomUUID();
      const permit={id:permitId,owner,spawn,petId:pet.petId,playerElement:pet.element,createdAt:now(),expiresAt:now()+30*60*1000,status:'reserved',
        battle:battle.begin({pet,spawn,battleId:permitId})};
      const saved=await store.reserve(permit);
      if(saved.petId!==pet.petId) reject('PERMIT_CONFLICT','这场挑战已经使用另一位出战伙伴');
      return {id:saved.id,expiresAt:saved.expiresAt};
    }
    if(payload.op==='act') {
      if(typeof payload.actionId!=='string'||!payload.actionId.trim()||payload.actionId.length>180) reject('ACTION_ID_REQUIRED','需要有效操作编号');
      const permit=await store.getPermit(owner,payload.permitId);
      if(!permit||permit.expiresAt<now()) reject('PERMIT_INVALID','云端挑战凭据无效或已过期');
      const previous=await store.getAction(owner,payload.actionId);
      if(previous) {
        if(previous.permitId!==permit.id||previous.action!==payload.action) reject('ACTION_ID_CONFLICT','操作编号已用于其他请求');
        return previous.result;
      }
      if(payload.expectedRound!==permit.battle.view.round+1) reject('ROUND_CONFLICT','回合已更新，请先同步');
      const next=battle.act(permit.battle,payload.action);
      // Atomic compare-and-swap in the backing store also handles concurrent requests.
      return store.advance(owner,permit.id,payload.actionId,payload.action,payload.expectedRound,next);
    }
    if(payload.op==='confirm') {
      const permit=await store.getPermit(owner,payload.permitId);
      if(!permit||permit.spawn.id!==payload.spawnId) reject('PERMIT_INVALID','找不到云端挑战凭据');
      const existing=await store.getCapture(owner,permit.id);
      if(existing) return {...existing,duplicate:true};
      if(permit.expiresAt<now()) reject('ENCOUNTER_EXPIRED','云端挑战凭据已过期');
      const check=checkedFix(payload.fix,permit.spawn,now());
      // Enemy actions are random. Verify the server's persisted battle, never replay
      // client actions with fresh randomness or accept a renderer-supplied winner.
      const state=permit.battle;
      if(!state.finished||state.winner!=='player') reject('VICTORY_REQUIRED','云端未验证到挑战胜利');
      return store.claim({id:randomUUID(),permitId:permit.id,owner,spawnId:permit.spawn.id,distanceMeters:check.compensatedDistanceMeters,capturedAt:now()});
    }
    reject('INVALID_COMMAND','不支持的探索操作');
  };
}
module.exports={createAuthorityHandler};
