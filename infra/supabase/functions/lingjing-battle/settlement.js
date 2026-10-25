import { awardBattleResult } from '../../../../apps/pc-app/runtime/features/companions/cloud-growth.mjs';
import { applyCloudCommand, digest, emptyGarden } from '../../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import catalog from '../../../../apps/pc-app/runtime/features/garden/catalog.json' with {type:'json'};
import { battleFragment } from './projection.js';

const tables=['companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts'];
export function companionDocument(envelope,owner) {
  const module=envelope.data?.modules?.companions;
  if(module!==undefined && (module.version!==1||module.data?.ownerAccountId!==owner||!Array.isArray(module.data.identityImports)||tables.some(name=>Object.hasOwn(envelope.data?.tables||{},name))||Object.keys(module.data.tables||{}).sort().join()!==[...tables].sort().join()))throw Object.assign(new Error('INVALID_CLOUD_SAVE'),{code:'INVALID_CLOUD_SAVE'});
  const document=module?.data||{ownerAccountId:owner,tables:Object.fromEntries(tables.map(name=>[name,envelope.data?.tables?.[name]?.rows])),identityImports:[]};
  if(tables.some(name=>!Array.isArray(document.tables[name])||document.tables[name].some(row=>row.owner_account_id!==owner)))throw Object.assign(new Error('INVALID_CLOUD_SAVE'),{code:'INVALID_CLOUD_SAVE'});
  return document;
}
/** Pure preparation over a verified protected head and a server-built finished
 * session. HTTP authorization and revision CAS are handled by the caller. */
export async function prepareBattleSettlement({envelope,owner,session,actions=[]}) {
  const sessionId=session.mode==='friend'?session.room.id:session.id,now=Date.parse(session.endedAt),actionId=`battle:${sessionId}:${owner}`;
  const growth=await awardBattleResult({envelope,ownerAccountId:owner,petId:session.player.petId,sessionId,won:session.winner==='player',mode:session.mode,actionId,now});
  const receiptId=sessionId,input={actionId:`battle-seeds:${session.mode}:${sessionId}`,source:'battle',receiptId};
  const seedHash=await digest({source:'battle',receipt:receiptId}),cropIds=Object.keys(catalog.CROPS);
  const verified={ownerAccountId:owner,id:receiptId,source:'battle',cropId:cropIds[parseInt(seedHash.slice(0,8),16)%cropIds.length]};
  const source=structuredClone(growth.envelope);source.data.modules.garden??=emptyGarden(owner);
  const seeds=applyCloudCommand(source,owner,'reward',input,now,await digest({kind:'reward',input}),undefined,verified);
  const reward={...growth.reward,seeds:seeds.result.data},next={...session,reward},companions=companionDocument(seeds.envelope,owner);
  return {reward,session:next,fragments:{companions:{module:{version:1,data:companions},tables:{},petIds:companions.tables.companion_pets.map(row=>row.pet_id)},garden:{module:seeds.envelope.data.modules.garden,tables:{}},battle:battleFragment(seeds.envelope,next,actions)}};
}
