import { withActor, readJson, jsonResponse, createAdminClient, LingjingAuthError } from '../_shared/lingjing-auth.ts';
import { validateChanges } from '../../../../apps/pc-app/runtime/features/conversations/cloud-record-contract.mjs';

Deno.serve(withActor(async (request,actor) => {
  const body=await readJson(request,8*1024*1024);
  const common={p_owner:actor.ownerAccountId,p_uid:actor.authUserId,p_device:actor.deviceId,p_sid:actor.sessionId};
  const admin=createAdminClient();let reply;
  if(body.op==='read') {
    if(Object.keys(body).some(key=>!['op','after','limit'].includes(key)) || !Number.isSafeInteger(body.after??0) || (body.after as number??0)<0 ||
      !Number.isSafeInteger(body.limit??500) || (body.limit as number??500)<1 || (body.limit as number??500)>500)throw new LingjingAuthError('RECORD_INVALID',400);
    reply=await admin.rpc('lingjing_read_personal_records',{...common,p_after:body.after??0,p_limit:body.limit??500});
  } else if(body.op==='write') {
    if(Object.keys(body).some(key=>!['op','actionId','changes'].includes(key)) || typeof body.actionId!=='string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(body.actionId))throw new LingjingAuthError('RECORD_INVALID',400);
    try{validateChanges(actor.ownerAccountId,body.changes);}catch{throw new LingjingAuthError('RECORD_INVALID',400);}
    reply=await admin.rpc('lingjing_write_personal_records',{...common,p_action_id:body.actionId,p_changes:body.changes});
  } else throw new LingjingAuthError('UNSUPPORTED_OP',400);
  if(reply.error){
    const code=/LJ_([A-Z_]+)/.exec(reply.error.message)?.[1]||'RECORD_UNAVAILABLE';
    throw new LingjingAuthError(code,/CONFLICT|ACTION_ID|RECORD_ID/.test(code)?409:/OWNER|PET_OWNER/.test(code)?403:/AUTH|SESSION|DEVICE/.test(code)?401:/INVALID|NOT_FOUND/.test(code)?400:503);
  }
  return jsonResponse({ok:true,data:reply.data});
}));
