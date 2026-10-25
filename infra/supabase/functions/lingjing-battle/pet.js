import { listBuiltinTemplates, canonicalBuiltinId } from '../../../../apps/pc-app/runtime/features/companions/instance.mjs';
import { companionDocument } from './settlement.js';
const fail=code=>{throw Object.assign(new Error(code),{code});};
/** Protected companion data determines the instance/template/element. A custom
 * appearance needs07's service-verified owner reference, never the client-writable
 * resource_packages index. No formula or companion state is changed here. */
export async function trustedBattlePet(envelope,actor,petId,verifiedReference) {
  const {tables}=companionDocument(envelope,actor.ownerAccountId),rows=tables.companion_pets.filter(row=>row.pet_id===petId);
  if(rows.length!==1)fail('PET_NOT_FOUND');const row=rows[0];let pet;
  try{pet=JSON.parse(row.data_json);}catch{fail('INVALID_CLOUD_SAVE');}
  if(!pet||pet.ownerAccountId!==actor.ownerAccountId||pet.petId!==petId||pet.revision!==row.revision||pet.templateId!==row.template_id||pet.resource?.kind!=='2d'||!Number.isSafeInteger(pet.growth?.level)||pet.growth.level<1)fail('PET_OWNER_MISMATCH');
  const templates=listBuiltinTemplates(),template=templates.find(value=>value.templateId===pet.templateId);
  if(!template||pet.element!==template.element)fail('PET_ELEMENT_MISMATCH');
  const resourceId=canonicalBuiltinId(pet.resource.resourceId),builtin=templates.some(value=>value.resource.resourceId===resourceId);
  if(!builtin) {
    if(typeof resourceId!=='string'||!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(resourceId))fail('RESOURCE_UNAVAILABLE');
    const reference=await verifiedReference(resourceId);
    if(!reference||reference.auth_user_id!==actor.authUserId||reference.owner_account_id!==actor.ownerAccountId||typeof reference.resource_id!=='string'||reference.resource_id.toLowerCase()!==resourceId.toLowerCase()||reference.resource_kind!=='spritesheet')fail('RESOURCE_UNAVAILABLE');
  }
  return {ownerId:actor.ownerAccountId,petId,name:pet.name,resourceId,element:template.element,level:pet.growth.level};
}
