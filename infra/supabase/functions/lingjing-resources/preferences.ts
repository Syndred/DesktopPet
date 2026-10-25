import {type ActorContext,uuid,LingjingAuthError,requireActor,createAdminClient,jsonResponse} from '../_shared/lingjing-auth.ts';
import {canonical} from '../_shared/lingjing-json.ts';
import {verifyPackage,indexFields,referenceTable} from './package.ts';
import {createPreferenceValidators} from '../../../../apps/pc-app/runtime/features/resources/preferences.mjs';
import catalog from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json' with {type:'json'};
import yuwan from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/yuwan/character.json' with {type:'json'};
import xiaolan from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/xiaolan/character.json' with {type:'json'};
import fantuan from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/fantuan/character.json' with {type:'json'};
import shiba from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/shiba/character.json' with {type:'json'};
import hatcat from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/hatcat/character.json' with {type:'json'};
import xiaohu from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/xiaohu/character.json' with {type:'json'};
import qingya from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json' with {type:'json'};
import yantuan from '../../../../apps/pc-app/runtime/features/resources/assets/roster-v2/yantuan/character.json' with {type:'json'};
const builtinManifests={yuwan,xiaolan,fantuan,shiba,hatcat,xiaohu,qingya,yantuan};
function invalid():never {throw new LingjingAuthError('RESOURCE_PREFERENCE_INVALID',422);}
const object=(v:unknown):v is Record<string,unknown>=>Boolean(v)&&typeof v==='object'&&!Array.isArray(v);
const validators=createPreferenceValidators((code:string)=>{throw new LingjingAuthError(code,422);});
export function validatePreferenceDocument(document:unknown,clips:{name:string}[]){
  if(!object(document))invalid();
  if(!object(document.calibration)||!object(document.actions))invalid();
  const normalized={calibration:validators.calibrations(document.calibration),actions:validators.actionMap(document.actions,clips,true)};
  if(canonical(normalized)!==canonical(document))invalid();return normalized;
}
export async function preferenceCommand(request:Request,actor:ActorContext,body:Record<string,unknown>){
  if(Object.keys(body).some(key=>!['op','resourceId','actionId','baseRevision','document'].includes(key))||typeof body.resourceId!=='string'||!uuid(body.actionId)||!Number.isSafeInteger(body.baseRevision)||(body.baseRevision as number)<0)invalid();
  let clips:{name:string}[];
  const builtin=catalog.characters.find(row=>row.resourceId===body.resourceId);
  if(builtin){
    const manifest=builtinManifests[builtin.id as keyof typeof builtinManifests];
    clips=Object.keys(manifest.animations).map(name=>({name}));
  }else{
    if(!uuid(body.resourceId))invalid();
    const indexed=await actor.client.from(referenceTable).select(indexFields).eq('owner_account_id',actor.ownerAccountId).eq('auth_user_id',actor.authUserId).eq('resource_id',body.resourceId).eq('resource_kind','spritesheet').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(indexed.error||!indexed.data)throw new LingjingAuthError('RESOURCE_REFERENCE_REQUIRED',404);
    const verified=await verifyPackage(actor.client,indexed.data,actor.ownerAccountId,actor.authUserId);
    if(!Array.isArray(verified.document.clips))invalid();
    clips=verified.document.clips as {name:string}[];
  }
  const document=validatePreferenceDocument(body.document,clips);
  const current=await requireActor(request);
  if(current.ownerAccountId!==actor.ownerAccountId||current.authUserId!==actor.authUserId||current.sessionId!==actor.sessionId)throw new LingjingAuthError('AUTH_INVALID',401);
  const response=await createAdminClient().rpc('lingjing_set_resource_preferences',{p_owner:actor.ownerAccountId,p_uid:actor.authUserId,p_device:actor.deviceId,p_sid:actor.sessionId,p_resource_id:body.resourceId,p_action_id:body.actionId,p_base_revision:body.baseRevision,p_document:document});
  if(response.error){const code=/LJ_([A-Z_]+)/.exec(response.error.message)?.[1]||'RESOURCE_PREFERENCE_UNAVAILABLE';throw new LingjingAuthError(code,/CONFLICT|ACTION_ID/.test(code)?409:/AUTH|SESSION|DEVICE|OWNER/.test(code)?401:503);}
  return jsonResponse({ok:true,data:response.data});
}
