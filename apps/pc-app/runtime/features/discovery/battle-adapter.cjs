const {BattleRuntimeService,getBattleRules}=require('../../services/battle-runtime.cjs');
/** Retired compatibility helper for archived fixtures. Production DiscoveryService
 * requires the registered battle feature and never instantiates this fallback. */
class LegacyWildBattleAdapter {
  begin({pet,spawn,battleId}) {
    const engine=new BattleRuntimeService(); engine.reset({playerElement:pet.element,enemyElement:spawn.element});
    return {battleId,petId:pet.petId,engineState:structuredClone(engine.session),view:engine.snapshot(),rounds:[],winner:null,finished:false,adapter:'battle-runtime',rules:getBattleRules()};
  }
  act(battle,action) {
    if(!['normal_attack','element_attack','dodge','ultimate'].includes(action)) throw Object.assign(new Error('无效的战斗操作'),{code:'BATTLE_INVALID_ACTION'});
    if(battle.finished) throw Object.assign(new Error('本次挑战已结束'),{code:'BATTLE_FINISHED'});
    const engine=new BattleRuntimeService(); engine.session=structuredClone(battle.engineState);
    const result=engine.act(action);
    return {...battle,rules:battle.rules || getBattleRules(),engineState:structuredClone(engine.session),view:result.state,rounds:[...battle.rounds,{action,...result.roundResult}],
      winner:result.roundResult.winner || null,finished:Boolean(result.roundResult.winner),lastRound:result};
  }
}
function fromFeatureSession(session) {
  return {battleId:session.id,petId:session.player.petId,view:session.snapshot,
    rounds:session.rounds.map(round=>({...round,action:round.actions.player})),winner:session.winner || null,
    finished:session.status==='finished' || session.status==='abandoned',adapter:'battle-feature',externalStatus:session.status,rules:session.rules || getBattleRules()};
}
class RegisteredWildBattleAdapter {
  constructor(api,invoke) {this.api=api;this.invoke=invoke;}
  begin({ownerAccountId,pet,spawn,actionId,encounterId,scenario}) {
    return fromFeatureSession(this.api.beginWildChallenge({ownerAccountId,petId:pet.petId,actionId,challenge:{id:spawn.id,spawnId:spawn.id,expiresAt:spawn.expiresAt,
      origin:'discovery',encounterId,scenario,returnPath:`/discovery/encounter/${encounterId}`,
      opponent:{petId:spawn.id,petName:spawn.name,element:spawn.element,resourceRef:spawn.resourceId}}}));
  }
  read(owner,battleId) {return fromFeatureSession(this.api.getOutcome({ownerAccountId:owner,sessionId:battleId}).session);}
  async act(battle,action,actionId) {
    const result=await this.invoke('act',{sessionId:battle.battleId,action,actionId,expectedRound:battle.view.round+1});
    if(!result.ok) throw Object.assign(new Error(result.message),{code:result.code});
    return fromFeatureSession(result.data);
  }
  async cancel(battle) {const result=await this.invoke('leave',{sessionId:battle.battleId}); if(!result.ok) throw Object.assign(new Error(result.message),{code:result.code});}
}
module.exports={LegacyWildBattleAdapter,RegisteredWildBattleAdapter,fromFeatureSession};
