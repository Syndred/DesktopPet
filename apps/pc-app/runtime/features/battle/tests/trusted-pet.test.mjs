import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {applyCompanionCommand} from '../../companions/cloud-domain.mjs';
import {trustedBattlePet} from '../../../../../../infra/supabase/functions/lingjing-battle/pet.js';
const actor={ownerAccountId:'verified-original-owner',authUserId:randomUUID()},now=Date.now();
async function adopted() {
  const result=await applyCompanionCommand(null,actor.ownerAccountId,'adopt',{actionId:randomUUID(),templateId:'big-fish-gentle',name:'保留五行的伙伴',showOnDesktop:false},now);
  return {envelope:{ownerAccountId:actor.ownerAccountId,data:{modules:{companions:result.module},tables:{}}},pet:result.result.data.pet};
}
test('pure server pet projection: built-in appearance uses the original template element, including a different-element costume',async()=>{
  const f=await adopted(),input={actionId:randomUUID(),petId:f.pet.petId,resourceId:'builtin:lingjing-shiba-v2'};
  const masked=await applyCompanionCommand(f.envelope,actor.ownerAccountId,'appearance',input,now+1),envelope={...f.envelope,data:{modules:{companions:masked.module},tables:{}}};
  const pet=await trustedBattlePet(envelope,actor,f.pet.petId,()=>{throw new Error('Built-in must not read private resource references');});assert.equal(pet.element,'water');assert.equal(pet.resourceId,input.resourceId);assert.equal(pet.petId,f.pet.petId);
});
test('pure server pet projection: only a same-owner/same-Auth verified spritesheet reference permits custom 2D appearance',async()=>{
  const f=await adopted(),id=randomUUID(),input={actionId:randomUUID(),petId:f.pet.petId,resourceId:id};
  const changed=await applyCompanionCommand(f.envelope,actor.ownerAccountId,'appearance',input,now+1,{authorizedResource:{resourceId:id,ownerAccountId:actor.ownerAccountId,kind:'2d'}});
  const envelope={...f.envelope,data:{modules:{companions:changed.module},tables:{}}},reference={auth_user_id:actor.authUserId,owner_account_id:actor.ownerAccountId,resource_id:id,resource_kind:'spritesheet'};
  assert.equal((await trustedBattlePet(envelope,actor,f.pet.petId,async()=>reference)).element,'water');
  for(const invalid of [null,{...reference,owner_account_id:'foreign-owner'},{...reference,auth_user_id:randomUUID()},{...reference,resource_id:randomUUID()},{...reference,resource_kind:'model3d-archive'}])await assert.rejects(trustedBattlePet(envelope,actor,f.pet.petId,async()=>invalid),error=>error.code==='RESOURCE_UNAVAILABLE');
  const corrupt=structuredClone(envelope),row=corrupt.data.modules.companions.data.tables.companion_pets[0],pet=JSON.parse(row.data_json);pet.element='fire';row.data_json=JSON.stringify(pet);
  await assert.rejects(trustedBattlePet(corrupt,actor,f.pet.petId,async()=>reference),error=>error.code==='PET_ELEMENT_MISMATCH');
});
