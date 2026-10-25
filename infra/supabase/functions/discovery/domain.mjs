// Thin transaction adapters.02 owns the actual instance/growth factory;05 owns
// seed policy/inventory reducer. None of these functions writes or commits.
import {companionUnit,normalizeCompanionRows,createCompanionInstance,listBuiltinTemplates,awardBattleResult,applyCloudCommand,gardenDocument,gardenCatalog} from './_generated/runtime.mjs';
import {canonical,requireValue} from './protocol.mjs';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const companionFragment=(data)=>({module:{version:1,data:normalizeCompanionRows(data)},tables:{},petIds:data.tables.companion_pets.map(row=>row.pet_id)});
export async function awardBattle({actor,envelope,session,now}){
  const owner=actor.ownerAccountId;
  requireValue(session.status==='finished'&&['player','enemy'].includes(session.winner)&&session.context?.cloudAuthority==='discovery','VICTORY_REQUIRED');
  const award=await awardBattleResult({envelope,ownerAccountId:owner,petId:session.player.petId,sessionId:session.id,won:session.winner==='player',mode:'wild',actionId:`battle:${session.id}:${owner}`,now});
  requireValue(award.reward.applied&&award.reward.petId===session.player.petId,'CLOUD_REWARD_ADAPTER_REQUIRED');
  const tables=gardenDocument(award.envelope,owner),old=tables.garden_reward_receipts.find(row=>row.source==='battle'&&row.receipt_id===session.id);
  let working=award.envelope,seeds;
  if(old)seeds=JSON.parse(old.result_json);
  else{
    const input={actionId:`wild-seeds:${session.id}`,source:'battle',receiptId:session.id};
    const crops=Object.keys(gardenCatalog.CROPS),hash=await digest({source:'battle',receipt:session.id}),cropId=crops[parseInt(hash.slice(0,8),16)%crops.length];
    const reward=applyCloudCommand(working,owner,'reward',input,now,await digest({kind:'reward',input}),undefined,{ownerAccountId:owner,id:session.id,source:'battle',cropId});
    working=reward.envelope;seeds=reward.result.data;
  }
  return{reward:{...award.reward,seeds},fragments:{companions:companionFragment(companionUnit(working,owner,now)),garden:{module:working.data.modules.garden,tables:{}}}};
}
export async function createCapture({actor,envelope,capture,instance,now}){
  const owner=actor.ownerAccountId,data=companionUnit(envelope,owner,now),tables=data.tables;
  const template=listBuiltinTemplates().find(value=>value.templateId===capture.templateId);
  requireValue(template&&template.resource.resourceId===capture.resourceId&&template.element===capture.element,'INVALID_CAPTURE_RECEIPT');
  requireValue(capture.ownerAccountId===owner&&capture.petId===instance.petId&&instance.origin?.cloudReceiptId===capture.id,'INVALID_CAPTURE_RECEIPT');
  const old=tables.companion_capture_receipts.find(row=>row.battle_id===capture.battleId&&row.wild_pet_id===instance.origin.wildPetId);
  if(old){const row=tables.companion_pets.find(row=>row.pet_id===old.pet_id);requireValue(row&&old.pet_id===capture.petId,'INVALID_CAPTURE_RECEIPT');return{pet:JSON.parse(row.data_json),fragments:{companions:companionFragment(data)}};}
  requireValue(!tables.companion_pets.some(row=>row.pet_id===capture.petId),'INVALID_CAPTURE_RECEIPT');
  const input={actionId:capture.actionId,templateId:template.templateId,name:capture.name,showOnDesktop:false,origin:instance.origin};
  const timestamp=new Date(now).toISOString();
  const pet=createCompanionInstance({ownerAccountId:owner,template,input,source:'capture',petId:capture.petId,createdAt:timestamp,count:tables.companion_pets.length});
  tables.companion_pets.push({owner_account_id:owner,pet_id:pet.petId,template_id:pet.templateId,revision:pet.revision,data_json:JSON.stringify(pet),created_at:pet.createdAt,updated_at:pet.updatedAt});
  tables.companion_capture_receipts.push({owner_account_id:owner,battle_id:capture.battleId,wild_pet_id:instance.origin.wildPetId,pet_id:pet.petId});
  const account=tables.companion_accounts[0];account.revision++;requireValue(Number.isSafeInteger(account.revision),'INVALID_CAPTURE_RECEIPT');
  const result={ok:true,data:{pet,selections:JSON.parse(account.selections_json)},revision:account.revision,duplicate:false};
  tables.companion_actions.push({owner_account_id:owner,action_id:capture.actionId,operation:'capture',request_hash:await digest(input),result_json:JSON.stringify(result),created_at:timestamp});
  return{pet,fragments:{companions:companionFragment(data)}};
}
