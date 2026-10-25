import { withActor, requireActor, readJson, jsonResponse, LingjingAuthError, createAdminClient, uuid } from '../_shared/lingjing-auth.ts';
import { verifyPackage,indexFields,indexTable,referenceTable } from './package.ts';
import {preferenceCommand} from './preferences.ts';
const receiptFields='resource_id,manifest_sha256,authority_action_id,authority_revision,authority_checksum';
const summary=(row:Record<string,unknown>)=>({resourceId:row.resource_id,manifestSha256:row.manifest_sha256,authorityActionId:row.authority_action_id,revision:row.authority_revision,checksum:row.authority_checksum,duplicate:true});
Deno.serve(withActor(async(request,actor)=>{
  const body=await readJson(request,4096);
  if(body.op==='preferences')return preferenceCommand(request,actor,body);
  if(!['publish','read'].includes(String(body.op))||!uuid(body.resourceId)||typeof body.manifestSha256!=='string'||!/^[0-9a-f]{64}$/.test(body.manifestSha256))throw new LingjingAuthError('INVALID_REQUEST',400);
  const prior=await actor.client.from(referenceTable).select(receiptFields).eq('owner_account_id',actor.ownerAccountId).eq('auth_user_id',actor.authUserId).eq('resource_id',body.resourceId).eq('manifest_sha256',body.manifestSha256).maybeSingle();
  if(prior.error)throw new LingjingAuthError('RESOURCE_REFERENCES_UNAVAILABLE',503);
  if(prior.data&&body.op==='read')return jsonResponse({ok:true,data:summary(prior.data)});
  if(body.op==='read')throw new LingjingAuthError('RESOURCE_REFERENCE_NOT_FOUND',404);
  if(!prior.data){
    const indexed=await actor.client.from(indexTable).select(indexFields).eq('owner_account_id',actor.ownerAccountId).eq('auth_user_id',actor.authUserId).eq('resource_id',body.resourceId).eq('manifest_sha256',body.manifestSha256).maybeSingle();
    if(indexed.error||!indexed.data)throw new LingjingAuthError('RESOURCE_PACKAGE_NOT_FOUND',404);
    // All object reads use the actual user's private Storage permissions, not a service key.
    await verifyPackage(actor.client,indexed.data,actor.ownerAccountId,actor.authUserId);
  }
  const confirmed=await requireActor(request);
  if(confirmed.ownerAccountId!==actor.ownerAccountId||confirmed.authUserId!==actor.authUserId||confirmed.sessionId!==actor.sessionId)throw new LingjingAuthError('AUTH_INVALID',401);
  // Only verified package identifiers reach this service-only atomic authority transaction.
  const admin=createAdminClient();
  const committed=await admin.rpc('lingjing_register_resource_receipt',{p_owner_id:actor.ownerAccountId,p_auth_user_id:actor.authUserId,p_resource_id:body.resourceId,p_manifest_sha256:body.manifestSha256,p_device_id:actor.deviceId,p_actor_session:actor.sessionId});
  if(committed.error){const code=/LJ_([A-Z_]+)/.exec(committed.error.message)?.[1]||'RESOURCE_REGISTRATION_UNAVAILABLE';throw new LingjingAuthError(code,503);}
  return jsonResponse({ok:true,data:committed.data});
}));
