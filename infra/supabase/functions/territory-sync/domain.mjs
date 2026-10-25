import core from '../_shared/battle-core.generated.mjs';
import {applyCloudCommand,gardenDocument,cloudCompanions,digest,canonical} from '../../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import gardenCatalog from '../../../../apps/pc-app/runtime/features/garden/catalog.json' with {type:'json'};
import roster from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json' with {type:'json'};
const {BattleRuntimeService,getBattleRules}=core;
const fail=(code,message)=>{throw Object.assign(new Error(message||code),{code});};
const copy=value=>structuredClone(value);
export function ownedPet(envelope,owner,petId){
  const row=cloudCompanions(envelope,owner).pets.find(row=>row.pet_id===petId);
  if(!row)fail('PET_NOT_OWNED');const pet=JSON.parse(row.data_json);
  if(pet.ownerAccountId!==owner||pet.petId!==petId||row.revision!==pet.revision||!['metal','wood','earth','water','fire'].includes(pet.element)||!['2d','spritesheet'].includes(pet.resource?.kind)||!pet.resource.resourceId)fail('PET_NOT_OWNED');
  return {row,pet};
}
export function participant(pet){return {petId:pet.petId,petName:pet.name,element:pet.element,level:pet.growth.level,resource:{...pet.resource},resourceRef:pet.resource.resourceId,appearance2d:pet.resource.resourceId};}
export function beginTerritoryBattle(owner,envelope,region,input,now,id=crypto.randomUUID()){
  const player=participant(ownedPet(envelope,owner,input.petId).pet);
  const guardian=roster.characters.find(character=>character.element==='wood');if(!guardian)fail('ELEMENT_ROSTER_MISSING');
  const enemy=region.defender||{petId:`guardian:${region.id}`,petName:guardian.name,element:'wood',level:1,resource:{resourceId:guardian.resourceId,kind:'2d'},resourceRef:guardian.resourceId,appearance2d:guardian.resourceId};
  const engine=new BattleRuntimeService();engine.reset({playerElement:player.element,enemyElement:enemy.element});
  return {id:`battle-territory-${id}`,mode:'territory',status:'active',startedAt:new Date(now).toISOString(),player,enemy,snapshot:engine.snapshot(),rounds:[],winner:null,pendingAction:null,historyComplete:true,rules:getBattleRules(),revision:1,
    context:{authority:'cloud',territoryId:region.id,territoryRevision:region.revision,origin:'garden',returnTo:'/garden',resultPath:'/garden',ownerAccountId:owner},updatedAt:new Date(now).toISOString()};
}
export function advanceTerritoryBattle(battle,input,now){
  if(battle.status!=='active')fail('BATTLE_NOT_ACTIVE');
  if(!['normal_attack','element_attack','dodge','ultimate'].includes(input.action))fail('INVALID_ACTION');
  if(input.expectedRound!==battle.snapshot.round+1)fail('ROUND_CONFLICT');
  const next=copy(battle),engine=new BattleRuntimeService();engine.restore(battle.snapshot);
  // AI selection and all effects execute inside the unchanged canonical engine.
  const result=engine.act(input.action);next.snapshot=result.state;next.rounds.push({...result.roundResult,state:result.state});next.winner=result.roundResult.winner;next.revision++;next.updatedAt=new Date(now).toISOString();
  if(next.winner){next.status='finished';next.endedAt=next.updatedAt;}
  return next;
}
export async function sealEnvelope(envelope){const {checksum,...document}=envelope;void checksum;envelope.checksum=await digest(document);return envelope;}
export async function validateEnvelope(envelope,owner){if(envelope?.ownerAccountId!==owner)fail('OWNER_MISMATCH');const {checksum,...document}=envelope;if(await digest(document)!==checksum)fail('CLOUD_CHECKSUM_MISMATCH');gardenDocument(envelope,owner);}

/** Uses the existing garden reducer for seed credits. Growth is supplied ONLY
 * by02's canonical server companion adapter; never derive a second XP formula.
 * The caller commits the entire resulting envelope with the world row atomically. */
export async function applyTerritoryCommand(source,owner,kind,input,now,requestHash,verified,{awardBattleResult}={}){
  const envelope=copy(source),tables=gardenDocument(envelope,owner),account=tables.garden_accounts[0];if(!account)fail('CLOUD_GARDEN_NOT_INITIALIZED');
  const prior=tables.garden_actions.find(row=>row.action_id===input.actionId);
  if(prior){if(prior.kind!==kind||prior.request_hash!==requestHash)fail('ACTION_ID_REUSED');return {envelope,result:JSON.parse(prior.result_json),changed:false};}
  if(input.sessionOwnerAccountId!==undefined&&input.sessionOwnerAccountId!==owner)fail('SESSION_CHANGED');
  if(input.expectedRevision!==account.revision)fail('REVISION_CONFLICT');
  let resultData,settledBattle,working=envelope;
  if(kind==='territorySettle'){
    const {battle,region}=verified||{};
    if(battle?.status!=='finished'||!['player','enemy'].includes(battle.winner)||battle.context?.authority!=='cloud'||battle.context?.ownerAccountId!==owner||battle.context?.territoryId!==region?.id||battle.context?.territoryRevision!==region?.revision||battle.id!==input.sessionId)fail('INVALID_SETTLEMENT_PROOF');
    ownedPet(working,owner,battle.player.petId);if(typeof awardBattleResult!=='function')fail('COMPANIONS_AUTHORITY_REQUIRED');
    const before=copy(working),award=await awardBattleResult({envelope:working,ownerAccountId:owner,petId:battle.player.petId,sessionId:battle.id,won:battle.winner==='player',mode:'territory',actionId:`battle:${battle.id}:${owner}`,now});
    if(!award?.envelope||!award?.reward?.applied||award.reward.petId!==battle.player.petId)fail('INVALID_GROWTH_RECEIPT');
    working=award.envelope;
    const petRows=value=>cloudCompanions(value,owner).pets.filter(row=>row.pet_id!==battle.player.petId);
    if(JSON.stringify(canonical(petRows(before)))!==JSON.stringify(canonical(petRows(working))))fail('UNRELATED_PET_CHANGED');
    const seedInput={actionId:`territory-seeds:${battle.id}`,source:'battle',receiptId:battle.id};
    const seedHash=await digest({source:'battle',receipt:battle.id});
    const crops=gardenCatalog.CROPS;
    const cropId=Object.keys(crops)[parseInt(seedHash.slice(0,8),16)%Object.keys(crops).length];
    const rewarded=applyCloudCommand(working,owner,'reward',seedInput,now,await digest({kind:'reward',input:seedInput}),undefined,{ownerAccountId:owner,id:battle.id,source:'battle',cropId});working=rewarded.envelope;
    settledBattle={...copy(battle),reward:{...award.reward,seeds:rewarded.result.data}};
    resultData={territoryId:region.id,sessionId:battle.id,won:battle.winner==='player',ownerAccountId:battle.winner==='player'?owner:region.ownerAccountId,territoryRevision:region.revision+1,captureMultiplier:battle.winner==='player'?region.captureMultiplier:1,resultPath:'/garden'};
  }else if(kind==='garrison'){
    const region=verified?.region;if(!region||region.ownerAccountId!==owner)fail('TERRITORY_NOT_OWNED');if(input.expectedTerritoryRevision!==region.revision)fail('TERRITORY_CONFLICT');
    if(input.petId!==null)ownedPet(working,owner,input.petId);
    const guards=gardenDocument(working,owner).garden_garrisons;if(!Array.isArray(guards))fail('INVALID_CLOUD_SAVE');
    for(let i=guards.length-1;i>=0;i--)if(guards[i].territory_id===region.id||(input.petId&&guards[i].pet_id===input.petId))guards.splice(i,1);
    if(input.petId!==null)guards.push({owner_account_id:owner,territory_id:region.id,pet_id:input.petId,territory_revision:region.revision+1,updated_at:now});
    resultData={territoryId:region.id,petId:input.petId,territoryRevision:region.revision+1};
  }else fail('INVALID_TERRITORY_COMMAND');
  const updated=gardenDocument(working,owner);updated.garden_accounts[0].revision++;
  const result={ok:true,data:resultData,revision:updated.garden_accounts[0].revision,replayed:false};
  updated.garden_actions.push({owner_account_id:owner,action_id:input.actionId,kind,request_hash:requestHash,result_json:JSON.stringify(result),created_at:now});
  updated.garden_outbox.push({owner_account_id:owner,action_id:input.actionId,payload_json:JSON.stringify({kind,input,result}),status:'synced',attempts:0,last_error:null,created_at:now});
  working.createdAt=new Date(now).toISOString();await sealEnvelope(working);
  return {envelope:working,result,settledBattle,changed:true};
}
