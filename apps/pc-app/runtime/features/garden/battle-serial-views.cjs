"use strict";
const FORMAT='lingjing.territory.serial-views';
const id=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value);
const ownerId=value=>typeof value==='string'&&value.length>0&&value.length<=160
 &&![...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127);
const namespace=value=>value==='live'||typeof value==='string'&&/^qa:[A-Za-z0-9][A-Za-z0-9:_-]{0,179}$/.test(value);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const identity=(pet,owner,petId)=>pet?.ownerAccountId===owner&&pet.petId===petId
 &&typeof pet.templateId==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_-]{0,199}$/.test(pet.templateId)
 &&typeof pet.globalSerial==='string'&&/^[1-9][0-9]*$/.test(pet.globalSerial)
 ?{ownerAccountId:owner,petId,templateId:pet.templateId,globalSerial:pet.globalSerial}:null;

/** Internal Main-only display projection. Never hydrate, migrate, settle or cache. */
function createTerritorySerialViews(services,cloud){
 const assertOwner=owner=>{if(!ownerId(owner)||services.session.getOwnerAccountId()!==owner)fail('SESSION_CHANGED');};
 const localNamespace=()=>{const scenario=services.get('qaScenario');return scenario?(id(scenario.runId)?`qa:${scenario.runId}`:null):'live';};
 const empty=(owner,requests,scope=null)=>({format:FORMAT,version:1,ownerAccountId:owner,namespace:scope,
  sessions:requests.map(row=>({sessionId:row.sessionId,player:null,enemy:null}))});
 function validate(owner,requests,reply){
  if(reply?.format!==FORMAT||reply.version!==1||reply.ownerAccountId!==owner||!namespace(reply.namespace)
   ||!Array.isArray(reply.sessions)||reply.sessions.length!==requests.length)fail('TERRITORY_SERIAL_VIEW_INVALID');
  const expected=new Map(requests.map(row=>[row.sessionId,row])),seen=new Set(),sessions=[];
  for(const row of reply.sessions){
   const input=expected.get(row?.sessionId);
   if(!input||seen.has(row.sessionId)||Object.keys(row).some(key=>!['sessionId','player','enemy','enemyKind'].includes(key)))fail('TERRITORY_SERIAL_VIEW_INVALID');
   seen.add(row.sessionId);
   const result={sessionId:row.sessionId,player:null,enemy:null};
   for(const side of ['player','enemy']){
    const value=row[side];if(value===null)continue;
    if(!value||Object.keys(value).sort().join(',')!=='globalSerial,ownerAccountId,petId,templateId'
     ||!ownerId(value.ownerAccountId)||value.petId!==input[`${side}PetId`]||side==='player'&&value.ownerAccountId!==owner)fail('TERRITORY_SERIAL_VIEW_INVALID');
    result[side]=identity(value,value.ownerAccountId,value.petId);
    if(!result[side])fail('TERRITORY_SERIAL_VIEW_INVALID');
   }
   if(row.enemyKind!==undefined){
    if(!['guardian','instance'].includes(row.enemyKind)||row.enemyKind==='guardian'&&(result.enemy!==null||!input.enemyPetId.startsWith('guardian:')))fail('TERRITORY_SERIAL_VIEW_INVALID');
    result.enemyKind=row.enemyKind;
   }
   sessions.push(result);
  }
  return{format:FORMAT,version:1,ownerAccountId:owner,namespace:reply.namespace,
   sessions:requests.map(row=>sessions.find(value=>value.sessionId===row.sessionId))};
 }
 function local(owner,requests){
  const view=empty(owner,requests),expectedNamespace=localNamespace();
  for(let index=0;index<requests.length;index++){
   const request=requests[index],result=view.sessions[index];
   const challenge=services.db.prepare('SELECT * FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(owner,request.sessionId);
   const session=cloud.battles.session(owner,request.sessionId),context=session?.context;
   if(!challenge||session?.mode!=='territory'||session.id!==request.sessionId||session.player?.petId!==request.playerPetId
    ||session.enemy?.petId!==request.enemyPetId||context?.territoryId!==challenge.territory_id||context.territoryRevision!==challenge.territory_revision
    ||!['local','simulated'].includes(context.authority)
    ||(context.authority==='simulated'?expectedNamespace!==`qa:${context.scenarioId}`:expectedNamespace!=='live'))continue;
   const logs=services.db.prepare("SELECT old_owner_id FROM garden_territory_logs WHERE owner_account_id=? AND battle_id=? AND territory_id=? AND action='invade'").all(owner,request.sessionId,challenge.territory_id);
   if(logs.length!==1)continue;
   const guardOwner=logs[0].old_owner_id;
   // Local DTOs cannot prove peer namespace; do not probe peer/global pet
   // existence even for classification. Only the original NPC proof suffices.
   if(guardOwner===null&&request.enemyPetId===`guardian:${challenge.territory_id}`)result.enemyKind='guardian';
  }
  return view;
 }
 return{async read({ownerAccountId:owner,sessions:requests}={}){
  assertOwner(owner);
  if(!Array.isArray(requests)||requests.length<1||requests.length>20||new Set(requests.map(row=>row?.sessionId)).size!==requests.length
   ||requests.some(row=>!row||Object.keys(row).sort().join(',')!=='enemyPetId,playerPetId,sessionId'||!id(row.sessionId)||!id(row.playerPetId)||!id(row.enemyPetId)))fail('INVALID_REQUEST');
  if(!cloud.isCloud({ownerAccountId:owner}))return local(owner,requests);
  try{
   const reply=await cloud.request('territory-sync',{op:'serial-views',input:{sessionIds:requests.map(row=>row.sessionId)}},{ownerAccountId:owner});
   assertOwner(owner);return validate(owner,requests,reply);
  }catch(error){assertOwner(owner);throw error;}
 }};
}
module.exports={createTerritorySerialViews};
