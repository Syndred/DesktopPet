import {digest,cloudSnapshot} from '../../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import {ownedPet,participant,beginTerritoryBattle,advanceTerritoryBattle,applyTerritoryCommand,validateEnvelope} from './domain.mjs';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const kinds={locate:'territoryLocate',challenge:'territoryChallenge',act:'territoryAct',settle:'territorySettle',garrison:'garrison'};
const errorCodes=['ACTION_ID_REUSED','INVALID_ACTION','NOT_PARTICIPANT','CHALLENGE_EXPIRED','CLOUD_GARDEN_NOT_INITIALIZED','SYNC_CONFLICT','REVISION_CONFLICT','ROUND_CONFLICT','TERRITORY_CONFLICT','TERRITORY_NOT_FOUND','TERRITORY_NOT_OWNED','DAILY_INVASIONS_USED','OUT_OF_TERRITORY_RANGE','LOCATION_PERMIT_REQUIRED','LOCATION_STALE','LOCATION_IMPRECISE','INVALID_COORDINATES','ACTOR_OWNER_MISMATCH','OWNER_NOT_MAPPED','ALREADY_OWNED','PET_NOT_OWNED','BATTLE_UNFINISHED','BATTLE_NOT_ACTIVE','INVALID_BATTLE_RECEIPT','INVALID_SETTLEMENT_PROOF','INVALID_SAVE','UNRELATED_SAVE_CHANGED'];
function dbError(error){if(!error)return;const code=errorCodes.find(code=>String(error.message).includes(code))||/LJ_([A-Z_]+)/.exec(error.message)?.[1]||/\b(LOCATION_[A-Z_]+)\b/.exec(error.message)?.[1];fail(code||'TERRITORY_CLOUD_UNAVAILABLE',code||'云端领地请求未完成');}
function actorArguments(actor){
  if(actor?.schemaVersion!==1||actor.authority!=='live'||actor.authKind!=='supabase'||!actor.ownerAccountId||!actor.authUserId||!actor.deviceId||!actor.sessionId)fail('ACTOR_REQUIRED');
  return {p_owner:actor.ownerAccountId,p_actor_uid:actor.authUserId,p_device_id:actor.deviceId,p_actor_session:actor.sessionId};
}
/** Called after08 withActor. The supplied worker client is server-only and only
 * calls narrow internal RPCs. Request data never supplies privileged payloads. */
export function createTerritoryService({actor,worker,awardBattleResult,now=Date.now}){
  const actorArgs=actorArguments(actor),owner=actor.ownerAccountId;
  const rpc=async(name,args)=>{const result=await worker.rpc(name,args);dbError(result.error);return result.data;};
  async function read(input={}){const result=await rpc('runtime_territory_read',{p_owner:owner,p_session_id:input.sessionId||null,p_territory_id:input.territoryId||null});await validateEnvelope(result.envelope,owner);return result;}
  function snapshot(readback){return {...readback,snapshot:{...cloudSnapshot(readback.envelope,owner,readback.serverTime),territories:readback.territories,territoryChallenges:readback.territoryChallenges,remainingInvasions:readback.remainingInvasions}};}
  function location(receiptId){if(typeof receiptId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(receiptId))fail('LOCATION_PERMIT_REQUIRED');}
  return {async handle(body){
    if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_REQUEST');
    for(const key of ['userId','ownerAccountId','sessionToken','actor','winner','reward','envelope','battle','result'])if(Object.hasOwn(body,key))fail('UNTRUSTED_AUTHORITY_FIELD');
    const op=body.op,input=body.input||{};
    if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_REQUEST');
    for(const key of ['winner','battle','reward','envelope','actor','source','territoryBoundary','maxHp','anger'])if(Object.hasOwn(input,key))fail('UNTRUSTED_AUTHORITY_FIELD');
    if(input.sessionOwnerAccountId!==undefined&&input.sessionOwnerAccountId!==owner)fail('SESSION_CHANGED');
    if(op==='snapshot')return snapshot(await read());
    if(op==='session'){if(typeof input.sessionId!=='string'||!input.sessionId)fail('INVALID_SESSION');const value=await read(input);return {session:value.challenge?.battle_json,context:{action:'territory',returnTo:'/garden',resultPath:'/garden',sessionId:input.sessionId,territoryId:value.territory?.id,settled:['settled','superseded'].includes(value.challenge?.status),result:value.challenge?.result_json},...snapshot(value)};}
    const kind=kinds[op];if(!kind)fail('INVALID_TERRITORY_COMMAND');
    if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(input.actionId))fail('INVALID_ACTION');
    const requestHash=await digest({kind,input});
    const prior=await worker.from('runtime_territory_actions').select('kind,request_hash,result_json').eq('owner_account_id',owner).eq('action_id',input.actionId).maybeSingle();dbError(prior.error);
    if(prior.data){if(prior.data.kind!==op||prior.data.request_hash!==requestHash)fail('ACTION_ID_REUSED');return {...prior.data.result_json,replayed:true,readback:snapshot(await read())};}
    const value=await read(input),payload={accountRevision:value.accountRevision};
    if(op==='locate'||op==='challenge'){
      if(body.locationReceiptId!==undefined&&body.locationReceiptId!==input.locationReceiptId)fail('INVALID_REQUEST');
      location(input.locationReceiptId);
    }
    if(op==='challenge'){
      if(!value.territory)fail('TERRITORY_NOT_FOUND');
      if(input.expectedTerritoryRevision!==value.territory.revision)fail('TERRITORY_CONFLICT');
      payload.battle=beginTerritoryBattle(owner,value.envelope,{...value.territory,defender:value.defender},input,now());
    }else if(op==='act'){
      if(!value.challenge)fail('NOT_PARTICIPANT');
      payload.challengeRevision=value.challenge.revision;payload.battle=advanceTerritoryBattle(value.challenge.battle_json,input,now());
    }else if(op==='settle'||op==='garrison'){
      const settled=op==='settle'&&['settled','superseded'].includes(value.challenge?.status);
      const stale=op==='settle'&&value.challenge?.territory_revision!==value.territory?.revision;
      if(!settled&&!stale){
        if(op==='settle'&&value.challenge?.status!=='finished')fail('BATTLE_UNFINISHED');
        if(op==='settle'&&value.challenge.battle_json.winner==='player')location(input.locationReceiptId);
        const applied=await applyTerritoryCommand(value.envelope,owner,kind,input,now(),requestHash,{battle:value.challenge?.battle_json,region:value.territory},{awardBattleResult});
        payload.envelope=applied.envelope;payload.result=applied.result;payload.settledBattle=applied.settledBattle;
        if(op==='garrison')payload.defender=input.petId===null?null:participant(ownedPet(value.envelope,owner,input.petId).pet);
      }
    }
    const result=await rpc('runtime_territory_write',{...actorArgs,p_kind:op,p_action_id:input.actionId,p_request_hash:requestHash,p_input:input,p_payload:payload});
    return {...result,readback:snapshot(await read({sessionId:result.data?.sessionId||input.sessionId,territoryId:result.data?.territoryId||input.territoryId}))};
  }};
}

export function territoryError(error){const code=error?.code||'TERRITORY_CLOUD_UNAVAILABLE';return {status:/ACTOR|PARTICIPANT|OWNER|AUTH|UNTRUSTED|NOT_OWNED|SCENARIO/.test(code)?403:/CONFLICT|REUSED|EXPIRED|STALE/.test(code)?409:/UNAVAILABLE/.test(code)?503:400,body:{ok:false,code,message:error?.code?error.message:'云端领地请求未完成'}};}
