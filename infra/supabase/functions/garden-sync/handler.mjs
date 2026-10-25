import {applyCloudCommand,cloudSnapshot,digest,emptyGarden,gardenDocument} from '../../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
const fail=(code,message=code)=>{throw Object.assign(new Error(message),{code});};
const codes=['ACTION_ID_REUSED','SYNC_CONFLICT','ACTOR_OWNER_MISMATCH','INVALID_ACTION','INVALID_SAVE','UNRELATED_SAVE_CHANGED','UNRELATED_PET_CHANGED','PET_NOT_OWNED'];
function check(error){if(error){const code=codes.find(code=>error.message?.includes(code))||/LJ_([A-Z_]+)/.exec(error.message)?.[1];fail(code||'GARDEN_CLOUD_UNAVAILABLE');}}
export function createGardenService({actor,worker,now=Date.now}){
  if(actor?.schemaVersion!==1||actor.authority!=='live'||actor.authKind!=='supabase'||!actor.ownerAccountId||!actor.authUserId||!actor.deviceId||!actor.sessionId)fail('ACTOR_REQUIRED');
  const owner=actor.ownerAccountId,args={p_owner:owner,p_actor_uid:actor.authUserId,p_device_id:actor.deviceId,p_actor_session:actor.sessionId};
  async function read(){
    const value=await worker.from('lingjing_saves').select('revision,envelope').eq('owner_id',owner).maybeSingle();check(value.error);
    if(!value.data)return {revision:0,envelope:{format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:new Date(now()).toISOString(),data:{modules:{},tables:{}}}};
    const {checksum,...document}=value.data.envelope;
    if(document.ownerAccountId!==owner||checksum!==await digest(document))fail('CLOUD_CHECKSUM_MISMATCH');
    return value.data;
  }
  async function commit(saved,kind,input){
    const hash=await digest({kind,input});
    const previous=await worker.from('lingjing_garden_operations').select('request_hash,response_json').eq('owner_account_id',owner).eq('action_id',input.actionId).maybeSingle();check(previous.error);
    if(previous.data){if(previous.data.request_hash!==hash)fail('ACTION_ID_REUSED');return {...previous.data.response_json,replayed:true};}
    const applied=applyCloudCommand(saved.envelope,owner,kind,input,now(),hash);
    if(!applied.changed)return {actionId:input.actionId,requestHash:hash,accountRevision:saved.revision,result:applied.result,replayed:true};
    const {checksum,...document}=applied.envelope;void checksum;applied.envelope.checksum=await digest(document);
    const result=await worker.rpc('runtime_garden_commit_authoritative',{...args,p_action_id:input.actionId,p_request_hash:hash,p_base_revision:saved.revision,p_envelope:applied.envelope,p_result:applied.result});check(result.error);return result.data;
  }
  async function ensure(){
    for(let attempt=0;attempt<3;attempt++){
      const saved=await read();
      if(saved.envelope.data.modules.garden!==undefined&&gardenDocument(saved.envelope,owner).garden_accounts.length)return saved;
      // This initializer creates no pets and never imports local stock/history.
      if(saved.envelope.data.modules.garden===undefined)saved.envelope.data.modules.garden=emptyGarden(owner);
      try{await commit(saved,'initialize',{actionId:'cloud-garden-initialize:v1',expectedRevision:0});return await read();}
      catch(error){if(error.code!=='SYNC_CONFLICT'||attempt===2)throw error;}
    }
  }
  const snapshot=saved=>({snapshot:cloudSnapshot(saved.envelope,owner,now()),envelope:saved.envelope,accountRevision:saved.revision});
  return {async handle(body){
    if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_REQUEST');
    for(const key of ['userId','ownerAccountId','sessionToken','actor','winner','reward','envelope','battle','result'])if(Object.hasOwn(body,key))fail('UNTRUSTED_AUTHORITY_FIELD');
    const {op,command,input}=body;
    if(op==='snapshot')return snapshot(await ensure());
    // Economic rewards commit inside their trusted domain transaction.
    if(op!=='command'||!['plant','harvest','craft','feed'].includes(command))fail('INVALID_GARDEN_COMMAND');
    if(!input||typeof input!=='object'||Array.isArray(input))fail('INVALID_REQUEST');
    for(const key of ['ownerAccountId','userId','winner','battle','reward','envelope','actor','growth','effects','quantityDelta'])if(Object.hasOwn(input,key))fail('UNTRUSTED_AUTHORITY_FIELD');
    if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(input.actionId))fail('INVALID_ACTION');
    const saved=await ensure(),receipt=await commit(saved,command,input);
    return {...receipt,readback:snapshot(await read())};
  }};
}
