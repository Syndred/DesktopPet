import { type ActorContext, LingjingAuthError } from '../_shared/lingjing-auth.ts';
import { canonical, sha256 } from '../_shared/lingjing-json.ts';
import roster from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json' with {type:'json'};
import { BattleRuntimeService, getBattleRules, BATTLE_CORE_VERSION } from '../_shared/battle-core.js';
import { friendSession } from './projection.js';
import { companionDocument, prepareBattleSettlement } from './settlement.js';
import type { TrustedBattlePet } from './handler.ts';

type Row=Record<string,any>;
function fail(code:string,status=400):never {throw new LingjingAuthError(code,status);}
function sqlCode(error:unknown) {
  const message=String((error as Row)?.message||'');
  return /(?:LJ_)?(SYNC_CONFLICT|ROUND_CONFLICT|ACTION_ID_REUSED|BATTLE_IN_PROGRESS|PET_OWNER_MISMATCH|PET_ROOM_MISMATCH|ROOM_FORBIDDEN|BATTLE_UNFINISHED|INVALID_SETTLEMENT_PROOF)/.exec(message)?.[1]||'BATTLE_CLOUD_UNAVAILABLE';
}
async function must(query:PromiseLike<{data:any;error:any}>) {const {data,error}=await query;if(error)fail(sqlCode(error),503);return data;}
export function createBattleAuthority(admin:ActorContext['client']) {
  async function head(actor:ActorContext) {
    const saved=await must(actor.client.from('lingjing_saves').select('revision,envelope').eq('owner_id',actor.ownerAccountId).maybeSingle());
    if(!saved?.envelope)fail('CLOUD_COMPANIONS_NOT_INITIALIZED',409);
    const {checksum,...body}=saved.envelope;
    if(body.ownerAccountId!==actor.ownerAccountId||body.provenance?.mode!=='live'||body.identity?.provider!=='runtime'||body.identity?.subjectId!==actor.ownerAccountId||checksum!==await sha256(canonical(body)))fail('INVALID_CLOUD_SAVE');
    return saved as {revision:number;envelope:Row};
  }
  async function resolvePet(actor:ActorContext,petId:string):Promise<TrustedBattlePet> {
    const {envelope}=await head(actor),{tables}=companionDocument(envelope,actor.ownerAccountId);
    const matches=tables.companion_pets.filter((row:Row)=>row.pet_id===petId);if(matches.length!==1)fail('PET_NOT_FOUND',404);
    const row=matches[0];let pet:Row;try{pet=JSON.parse(row.data_json);}catch{fail('INVALID_CLOUD_SAVE');}
    if(pet.ownerAccountId!==actor.ownerAccountId||pet.petId!==petId||pet.revision!==row.revision||pet.templateId!==row.template_id||pet.resource?.kind!=='2d'||!Number.isSafeInteger(pet.growth?.level)||pet.growth.level<1)fail('PET_OWNER_MISMATCH',403);
    if(!roster.characters.some(value=>value.resourceId===pet.resource.resourceId&&value.element===pet.element))fail('RESOURCE_UNAVAILABLE',409);
    return {ownerId:actor.ownerAccountId,petId,name:pet.name,resourceId:pet.resource.resourceId,element:pet.element,level:pet.growth.level};
  }
  async function settleGame(actor:ActorContext,mode:'friend'|'training',id:string,petId:string,build:(reward:Row)=>Promise<Row>) {
    const sourceTable=mode==='friend'?'lingjing_battle_settlements':'lingjing_battle_training_settlements';
    const prior=await must(admin.from(sourceTable).select('pet_id,result_json').eq('owner_account_id',actor.ownerAccountId).eq(mode==='friend'?'room_id':'session_id',id).maybeSingle());
    if(prior?.result_json) {if(prior.pet_id!==petId)fail('PET_ROOM_MISMATCH',403);return {...prior.result_json,duplicate:true};}
    for(let attempt=0;attempt<4;attempt++) {
      const saved=await head(actor),initial=await build({});
      if(initial.status!=='finished'||!initial.winner)fail('BATTLE_UNFINISHED',409);
      if(initial.player.petId!==petId)fail('PET_ROOM_MISMATCH',403);
      const {reward,fragments}=await prepareBattleSettlement({envelope:saved.envelope,owner:actor.ownerAccountId,session:initial});
      const result=await admin.rpc('lingjing_battle_settle_authority',{p_actor:actor.authUserId,p_owner:actor.ownerAccountId,p_mode:mode,p_id:id,p_pet:petId,p_base_revision:saved.revision,p_fragments:fragments,p_reward:reward});
      if(!result.error)return result.data as Row;
      const code=sqlCode(result.error);if(code!=='SYNC_CONFLICT')fail(code,/FORBIDDEN|MISMATCH/.test(code)?403:503);
    }
    fail('SYNC_CONFLICT',409);
  }
  async function settle(actor:ActorContext,room:Row,petId:string) {
    const rounds=await must(actor.client.from('lingjing_battle_rounds').select('*').eq('room_id',room.id).order('round_no')) as Row[];
    if(rounds.length!==room.last_resolved_round||rounds.some((row,index)=>row.round_no!==index+1))fail('BATTLE_HISTORY_INCOMPLETE',409);
    return settleGame(actor,'friend',room.id,petId,async reward=>friendSession(room,rounds,actor.ownerAccountId,reward));
  }
  async function trainingRow(actor:ActorContext,id:string) {
    const row=await must(actor.client.from('lingjing_battle_training').select('*').eq('id',id).eq('owner_account_id',actor.ownerAccountId).maybeSingle());
    if(!row)fail('BATTLE_NOT_FOUND',404);return row as Row;
  }
  async function trainingState(actor:ActorContext,row:Row) {
    const session={...row.session_json,revision:row.revision};
    if(row.status==='finished') {
      const proof=await settleGame(actor,'training',row.id,row.pet_id,async reward=>({...session,reward}));
      return {session:{...session,reward:proof.reward,reportId:session.id},proof};
    }
    return {session};
  }
  async function training(actor:ActorContext,input:Row):Promise<Row> {
    const op=input.op,owner=actor.ownerAccountId;
    if(op==='get_active_training') {
      let row=await must(actor.client.from('lingjing_battle_training').select('*').eq('owner_account_id',owner).eq('status','active').maybeSingle());
      if(!row)row=await must(actor.client.from('lingjing_battle_training').select('*').eq('owner_account_id',owner).eq('status','finished').order('updated_at',{ascending:false}).limit(1).maybeSingle());
      return row?trainingState(actor,row):{session:null};
    }
    if(op==='get_training')return trainingState(actor,await trainingRow(actor,String(input.sessionId).replace(/^battle-/,'')));
    const actionId=input.actionId;if(typeof actionId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9:_-]{7,127}$/.test(actionId))fail('INVALID_COMMAND');
    const logical=op==='start_training'?{operation:'start',petId:input.petId,enemyElement:input.enemyElement}:{operation:op==='training_action'?'action':'leave',sessionId:input.sessionId,...(op==='training_action'?{action:input.action,roundNo:input.roundNo}:{})};
    const prior=await must(admin.from('lingjing_battle_training_commands').select('session_id,input_json').eq('owner_account_id',owner).eq('action_id',actionId).maybeSingle());
    if(prior){if(canonical(prior.input_json)!==canonical(logical))fail('ACTION_ID_REUSED',409);return trainingState(actor,await trainingRow(actor,prior.session_id));}
    let id:string,session:Row,revision=0;
    if(op==='start_training') {
      const pet=await resolvePet(actor,input.petId),opponent=roster.characters.find(value=>value.element===input.enemyElement);
      if(!opponent)fail('INVALID_ELEMENT');id=crypto.randomUUID();const now=new Date().toISOString(),engine=new BattleRuntimeService();
      session={id:`battle-${id}`,mode:'training',status:'active',startedAt:now,updatedAt:now,player:{petId:pet.petId,petName:pet.name,element:pet.element,level:pet.level,resourceRef:pet.resourceId,appearance2d:pet.resourceId,resource:{resourceId:pet.resourceId,kind:'2d'}},enemy:{petId:`training-${opponent.element}`,petName:opponent.name,element:opponent.element,level:1,resourceRef:opponent.resourceId,appearance2d:opponent.resourceId,resource:{resourceId:opponent.resourceId,kind:'2d'}},snapshot:engine.reset({playerElement:pet.element,enemyElement:opponent.element}),rounds:[],winner:null,pendingAction:null,historyComplete:true,rules:getBattleRules(),context:{authority:'supabase',cloudUserId:owner,coreVersion:BATTLE_CORE_VERSION}};
    } else {
      if(!['training_action','leave_training'].includes(op))fail('UNSUPPORTED_OP');
      id=String(input.sessionId).replace(/^battle-/,'');const row=await trainingRow(actor,id);revision=row.revision;session=structuredClone(row.session_json);
      if(row.rules_version!==getBattleRules().id||row.core_version!==BATTLE_CORE_VERSION)fail('BATTLE_RULES_UNSUPPORTED',409);
      if(session.status!=='active')fail('BATTLE_NOT_ACTIVE',409);
      if(op==='training_action') {
        if(!['normal_attack','element_attack','dodge','ultimate'].includes(input.action)||!Number.isSafeInteger(input.roundNo)||input.roundNo!==session.snapshot.round+1)fail('ROUND_CONFLICT',409);
        const engine=new BattleRuntimeService();engine.restore(session.snapshot);const result=engine.act(input.action);
        session.snapshot=result.state;session.rounds.push({...result.roundResult,state:result.state});session.winner=result.roundResult.winner;
        if(session.winner){session.status='finished';session.endedAt=new Date().toISOString();session.reportId=session.id;}
      } else {session.status='abandoned';session.endedAt=new Date().toISOString();session.reportId=session.id;}
      session.updatedAt=new Date().toISOString();
    }
    const result=await admin.rpc('lingjing_battle_training_command',{p_actor:actor.authUserId,p_owner:owner,p_id:id,p_action_id:actionId,p_input:logical,p_revision:revision,p_session:session});
    if(result.error)fail(sqlCode(result.error),409);
    return trainingState(actor,result.data);
  }
  return {resolvePet,settle,training};
}
