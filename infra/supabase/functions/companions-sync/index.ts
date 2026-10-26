import { withActor,readJson,jsonResponse,createAdminClient,LingjingAuthError,assertActorOwner,uuid } from '../_shared/lingjing-auth.ts';
import { applyCompanionCommand,companionUnit,validateCommand } from '../../../../apps/pc-app/runtime/features/companions/cloud-domain.mjs';
const fail=(code:string,status=400):never=>{throw new LingjingAuthError(code,status);};
function problem(error:{code?:string;message?:string}):never{
  const code=/LJ_([A-Z_]+)/.exec(error.message||'')?.[1]||(/^[A-Z_]+$/.test(error.code||'')?error.code:'')||'COMPANION_CLOUD_UNAVAILABLE';
  return fail(code,code==='RATE_LIMITED'?429:/CONFLICT|ACTION_ID/.test(code)?409:/AUTH|SESSION|DEVICE/.test(code)?401:/OWNER/.test(code)?403:/NOT_FOUND|RESOURCE_UNAVAILABLE/.test(code)?404:/INVALID|CHECKSUM|LIMIT/.test(code)?400:503);
}
Deno.serve(withActor(async(request,actor)=>{
  const body=await readJson(request,64*1024);
  if(body.ownerAccountId!==undefined)assertActorOwner(actor,body.ownerAccountId);
  if(Object.keys(body).some(key=>!['op','command','input','baseRevision','ownerAccountId'].includes(key)))fail('INVALID_REQUEST');
  const {data:head,error}=await actor.client.from('lingjing_saves').select('action_id,revision,checksum,envelope').eq('owner_id',actor.ownerAccountId).maybeSingle();
  if(error)problem(error);
  if(body.op==='snapshot'){
    try{
      const worker=createAdminClient();
      const {data:serialRegistry,error:serialError}=await worker.rpc('lingjing_global_serial_owned',{p_actor:actor,p_expected_revision:head?.revision||0});
      // Numbering is a separately authorized display projection. A revoked QA
      // numbering scope must not hide an otherwise authorized owner's pets.
      // Keep every allocator/actor guard intact and never invent serial values.
      const serialCode=serialError?/LJ_([A-Z_]+)/.exec(serialError.message||'')?.[1]:undefined;
      if(serialError&&serialCode!=='GLOBAL_SERIAL_SCOPE_REVOKED')problem(serialError);
      return jsonResponse({ok:true,data:{ownerAccountId:actor.ownerAccountId,revision:head?.revision||0,envelope:head?.envelope||null,
        module:{version:1,data:companionUnit(head?.envelope,actor.ownerAccountId,Date.now())},
        ...(serialError?{serialRegistryError:serialCode}:{serialRegistry}),authority:'live'}});
    }catch(error){problem(error as {code?:string;message?:string});}
  }
  if(body.op!=='command'||typeof body.command!=='string')fail('INVALID_REQUEST');
  try{validateCommand(body.command,body.input);}catch(error){problem(error as {code?:string;message?:string});}
  if(body.baseRevision!==undefined&&(!Number.isSafeInteger(body.baseRevision)||(body.baseRevision as number)<0))fail('INVALID_REQUEST');
  let authorizedResource;
  if(body.command==='appearance'){
    const id=(body.input as Record<string,unknown>).resourceId;
    if(typeof id!=='string')return fail('INVALID_INPUT');
    if(uuid(id)){
      // Only a service-verified package registered in the protected save can
      // authorize appearance. The client-writable upload index is insufficient.
      const {data:resource,error:resourceError}=await actor.client.from('lingjing_resource_references').select('resource_id,owner_account_id,resource_kind').eq('auth_user_id',actor.authUserId).eq('owner_account_id',actor.ownerAccountId).eq('resource_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(resourceError)problem(resourceError);
      if(resource?.resource_kind==='spritesheet')authorizedResource={resourceId:id,ownerAccountId:actor.ownerAccountId,kind:'2d'};
    }
  }
  try{
    const prepared=await applyCompanionCommand(head?.envelope||null,actor.ownerAccountId,body.command,body.input,Date.now(),{authorizedResource});
    if(prepared.changed&&body.baseRevision!==undefined&&body.baseRevision!== (head?.revision||0))fail('SYNC_CONFLICT',409);
    const worker=createAdminClient();
    const {data:receipt,error:commitError}=await worker.rpc('lingjing_commit_companion_command',{p_actor:actor,p_command:body.command,p_input:body.input,p_module:prepared.module,p_expected_revision:head?.revision||0});
    if(commitError)problem(commitError);
    if(!receipt?.envelope||!receipt?.result?.ok)fail('COMPANION_RECEIPT_INVALID',503);
    return jsonResponse({ok:true,data:{...receipt,ownerAccountId:actor.ownerAccountId,authority:'live'}});
  }catch(error){problem(error as {code?:string;message?:string});}
}));
