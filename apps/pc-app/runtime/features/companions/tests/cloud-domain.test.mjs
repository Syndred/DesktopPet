import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {applyCompanionCommand,companionUnit} from '../cloud-domain.mjs';
import {listBuiltinTemplates} from '../instance.mjs';
const require=createRequire(import.meta.url),{CompanionsService}=require('../service.cjs'),{migrateCompanions}=require('../migrations.cjs'),{createCompanionBackupAdapter}=require('../backup.cjs');
// Local canonical reducer checks; no Auth or remote mutation is asserted here.
const owner='original-text-owner',now=1792897200000;
const envelope=module=>({ownerAccountId:owner,data:{modules:{companions:module},tables:{}}});
const adopt=(index,showOnDesktop=false)=>({actionId:'cloud-adopt-action-'+index,templateId:'big-fish-gentle',name:'原鱼'+index,showOnDesktop});
test('controlled cloud commands and SQLite use one instance factory and preserve per-pet names, choices, appearance and desktop fields',async()=>{
  const db=new DatabaseSync(':memory:');migrateCompanions(db);let count=0;
  const uuid=()=>`00000000-0000-4000-8000-${String(++count).padStart(12,'0')}`,service=new CompanionsService({db,now:()=>new Date(now),uuid}),adapter=createCompanionBackupAdapter(db);
  service.account(owner);db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run(new Date(now).toISOString(),owner);
  let source=null,cloudCount=0;const cloudUuid=()=>`00000000-0000-4000-8000-${String(++cloudCount).padStart(12,'0')}`;
  try{
    const pets=[];for(let i=0;i<2;i++){const input=adopt(i),result=await applyCompanionCommand(source,owner,'adopt',input,now,{uuid:cloudUuid});pets.push(result.result.data.pet);source=envelope(result.module);assert.deepEqual(result.result.data.pet,service.adopt(owner,input).data.pet);}
    assert.notEqual(pets[0].petId,pets[1].petId);assert.equal(pets[0].templateId,pets[1].templateId);
    const apply=async(command,input,local)=>{const kept=structuredClone(source),result=await applyCompanionCommand(source,owner,command,input,now);assert.deepEqual(source,kept);local(input);source=envelope(result.module);assert.deepEqual(result.module.data,adapter.export(owner));return result;};
    await apply('rename',{actionId:'cloud-rename-action',petId:pets[0].petId,expectedRevision:1,name:'独立的新名字'},input=>service.rename(owner,input));
    await apply('desktop',{actionId:'cloud-desktop-action',petId:pets[0].petId,expectedRevision:2,position:{x:-1111,y:333,displayId:'original-monitor'},behavior:'follow',scale:1.5,visible:true},input=>service.updateDesktop(owner,input));
    for(const[slot,pet]of[['chatPetId',pets[0]],['battlePetId',pets[1]],['guardPetId',pets[0]]])await apply('select',{actionId:'cloud-selection-'+slot,petId:pet.petId,slot},input=>service.select(owner,input));
    await apply('appearance',{actionId:'cloud-appearance-action',petId:pets[0].petId,expectedRevision:3,resourceId:listBuiltinTemplates()[1].resource.resourceId},input=>service.action(owner,'appearance',input,()=>{const pet=service.requirePet(owner,input.petId,input.expectedRevision);pet.resource={resourceId:input.resourceId,kind:'2d'};service.storePet(pet);return{pet,selections:service.selections(owner)};}));
    assert.equal(service.requirePet(owner,pets[1].petId).name,'原鱼1');assert.equal(service.requirePet(owner,pets[0].petId).growth.experience,0);
  }finally{db.close();}
});
test('cloud interaction uses original fixed effect, server clock and per-pet cooldown; retry retains one receipt and other pets remain independent',async()=>{
  let source=null;const pets=[];for(let i=0;i<2;i++){const adopted=await applyCompanionCommand(source,owner,'adopt',adopt(i),now);pets.push(adopted.result.data.pet);source=envelope(adopted.module);}
  const input={actionId:'cloud-touch-action-01',petId:pets[0].petId,expectedRevision:1},first=await applyCompanionCommand(source,owner,'interact',input,now);
  const pet=first.result.data.pet;assert.equal(pet.growth.mood,62);assert.equal(pet.growth.affinity,1);assert.equal(pet.growth.experience,0);
  const replay=await applyCompanionCommand(envelope(first.module),owner,'interact',input,now+100);assert.equal(replay.result.duplicate,true);assert.deepEqual(replay.module,first.module);
  await assert.rejects(()=>applyCompanionCommand(envelope(first.module),owner,'interact',{...input,actionId:'cloud-touch-too-soon',expectedRevision:pet.revision},now+100),error=>error.code==='RATE_LIMITED');
  const other=await applyCompanionCommand(envelope(first.module),owner,'interact',{actionId:'cloud-touch-another-pet',petId:pets[1].petId,expectedRevision:1},now+100);assert.equal(other.result.data.pet.growth.affinity,1);
  const later=await applyCompanionCommand(envelope(other.module),owner,'interact',{...input,actionId:'cloud-touch-later-01',expectedRevision:pet.revision},now+10001);assert.equal(later.result.data.pet.growth.affinity,2);
});
test('caller cannot submit growth, rewards, owner, adopted petId or unverified custom/3D appearances; stale and reused actions fail',async()=>{
  const first=await applyCompanionCommand(null,owner,'adopt',adopt(0),now),source=envelope(first.module),petId=first.result.data.pet.petId,kept=structuredClone(source);
  for(const extra of[{growth:{experience:999}},{ownerAccountId:'foreign'},{petId:'client-picked'},{effect:{wins:1}},{inventory:{food:999}}])await assert.rejects(()=>applyCompanionCommand(null,owner,'adopt',{...adopt(1),...extra},now),error=>error.code==='INVALID_INPUT');
  await assert.rejects(()=>applyCompanionCommand(source,'another-owner','rename',{actionId:'foreign-rename-01',petId,name:'串号'},now),error=>error.code==='OWNER_MISMATCH');
  await assert.rejects(()=>applyCompanionCommand(source,owner,'rename',{actionId:'stale-rename-action',petId,expectedRevision:99,name:'过时'},now),error=>error.code==='REVISION_CONFLICT');
  await assert.rejects(()=>applyCompanionCommand(source,owner,'adopt',{...adopt(0),name:'复用编号'},now),error=>error.code==='ACTION_ID_CONFLICT');
  const appearance={actionId:'custom-appearance-01',petId,resourceId:'11111111-1111-4111-8111-111111111111'};
  for(const authorizedResource of[undefined,{resourceId:appearance.resourceId,ownerAccountId:'foreign',kind:'2d'},{resourceId:appearance.resourceId,ownerAccountId:owner,kind:'3d'}])await assert.rejects(()=>applyCompanionCommand(source,owner,'appearance',appearance,now,{authorizedResource}),error=>error.code==='RESOURCE_UNAVAILABLE');
  const allowed=await applyCompanionCommand(source,owner,'appearance',appearance,now,{authorizedResource:{resourceId:appearance.resourceId,ownerAccountId:owner,kind:'2d'}});assert.equal(allowed.result.data.pet.resource.kind,'2d');assert.deepEqual(source,kept);
});
test('visible range stays within account1-4 limit and lowering the setting does not block unrelated personal changes',async()=>{
  let source=null;for(let i=0;i<3;i++){const next=await applyCompanionCommand(source,owner,'adopt',adopt(i,true),now);source=envelope(next.module);}
  await assert.rejects(()=>applyCompanionCommand(source,owner,'adopt',adopt(3,true),now),error=>error.code==='COMPANION_LIMIT');
  source.data.modules.settings={version:1,data:{desktop:{companionLimit:4}}};const fourth=await applyCompanionCommand(source,owner,'adopt',adopt(3,true),now);source=envelope(fourth.module);source.data.modules.settings={version:1,data:{desktop:{companionLimit:1}}};
  const first=JSON.parse(companionUnit(source,owner,now).tables.companion_pets[0].data_json);const renamed=await applyCompanionCommand(source,owner,'rename',{actionId:'rename-after-limit-01',petId:first.petId,name:'原名字仍能修改'},now);assert.equal(renamed.result.ok,true);
  const recalled=await applyCompanionCommand(envelope(renamed.module),owner,'recall-all',{actionId:'recall-all-action-01'},now);assert.equal(recalled.result.data.recalled.length,4);
});
