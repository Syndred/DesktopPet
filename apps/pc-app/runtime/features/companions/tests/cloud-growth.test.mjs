import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { awardBattleResult } from '../cloud-growth.mjs';
import { battleGrowthEffect } from '../growth.mjs';
// Local reducer conformance only: identities and battle results are fixtures,
// never deployed Auth/authority or physical-device acceptance.
const require=createRequire(import.meta.url);
const { CompanionsService }=require('../service.cjs');
const { migrateCompanions }=require('../migrations.cjs');
const { createCompanionBackupAdapter }=require('../backup.cjs');
const { migrations }=require('../../accounts/schema.cjs');
const { BackupManager }=require('../../accounts/backups.cjs');
const { checksum }=require('../../accounts/util.cjs');
const owner='original-owner-with-cloud-save',now=1792896000000;
const seal=envelope=>{const{checksum:old,...body}=envelope;void old;return{...body,checksum:checksum(body)};};
function fixture(moduleFormat=true,ownerAccountId=owner){
  const owner=ownerAccountId;
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-growth-')),db=new DatabaseSync(join(folder,'save.sqlite'));
  db.exec('PRAGMA foreign_keys=ON');migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'original','original','原账号','2026-10-24','2026-10-24');
  const service=new CompanionsService({db,now:()=>new Date(now)}),adapter=createCompanionBackupAdapter(db);
  service.importLegacyInventory(owner,{pets:[{id:'original-archived-animal',name:{zh:'原始历史动物'},model:'retained.glb',chats:[{id:'preserved-message'}]}]});
  const pets=['原鱼一号','原鱼二号'].map((name,index)=>service.adopt(owner,{actionId:'adopt-'+index,templateId:'big-fish-gentle',name,showOnDesktop:false}).data.pet);
  service.applyGrowthInTransaction(owner,{actionId:'original-progress',petId:pets[0].petId,effect:{experience:90}});
  service.updateDesktop(owner,{actionId:'original-position',petId:pets[0].petId,position:{x:-777,y:180,displayId:'old-monitor'},behavior:'quiet'});
  for(const[slot,pet]of[['chatPetId',pets[0]],['battlePetId',pets[1]],['guardPetId',pets[0]]])service.select(owner,{actionId:'selection-'+slot,slot,petId:pet.petId});
  const backups=new BackupManager({db,directory:folder,getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
  if(moduleFormat)backups.register(adapter);
  return{db,folder,service,adapter,backups,pets,close(){db.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('companion-cloud-growth-'));rmSync(folder,{recursive:true,force:true});}};
}
const input=(envelope,petId,sessionId='verified-server-battle',won=true)=>({envelope,ownerAccountId:owner,petId,sessionId,won,mode:'territory',actionId:`battle:${sessionId}:${owner}`,now});
const unit=(f,envelope)=>envelope.data.modules.companions?.data||f.adapter.fromLegacyTables(envelope.data.tables,owner);

test('160-character original owner retains its long battle receipt through shared growth and actual SQLite backup restore',async()=>{
  const longOwner='o'.repeat(160),sessionId='s'.repeat(51),actionId=`battle:${sessionId}:${longOwner}`;
  assert.ok(actionId.length>200);
  for(const moduleFormat of[true,false]){
    const f=fixture(moduleFormat,longOwner),target=fixture(true,longOwner);
    try{
      const original=f.backups.snapshot(longOwner),petId=f.pets[0].petId;
      const request={...input(original,petId,sessionId),ownerAccountId:longOwner,actionId};
      const awarded=await awardBattleResult(request),data=awarded.envelope.data.modules.companions?.data||f.adapter.fromLegacyTables(awarded.envelope.data.tables,longOwner);
      f.adapter.validate(data,longOwner);target.adapter.restore(longOwner,data,'replace');
      assert.deepEqual(target.adapter.export(longOwner),data);
      const receipt=target.db.prepare('SELECT action_id FROM companion_actions WHERE owner_account_id=? AND action_id=?').get(longOwner,actionId);
      assert.equal(receipt.action_id,actionId);assert.equal(target.service.requirePet(longOwner,petId).ownerAccountId,longOwner);
      assert.equal(target.service.requirePet(longOwner,petId).growth.level,2);
      assert.equal((await awardBattleResult({...request,envelope:awarded.envelope})).reward.duplicate,true);
      for(const invalid of['x'.repeat(513),'invalid\u0000receipt']){
        await assert.rejects(()=>awardBattleResult({...request,actionId:invalid}),error=>error.code==='INVALID_INPUT');
        const corrupt=structuredClone(data);corrupt.tables.companion_actions[0].action_id=invalid;
        assert.throws(()=>target.adapter.validate(corrupt,longOwner),error=>error.code==='COMPANION_BACKUP_INVALID');
      }
      await assert.rejects(()=>awardBattleResult({...request,ownerAccountId:'o'.repeat(201)}),error=>error.code==='INVALID_INPUT');
    }finally{f.close();target.close();}
  }
});

test('cloud award uses the same SQLite growth rule, levels exactly one instance and preserves raw history, positions and independent selections',async()=>{
  const f=fixture();try{
    const baseline=f.backups.snapshot(owner),before=structuredClone(baseline),request=input(baseline,f.pets[0].petId);
    const awarded=await awardBattleResult(request);assert.deepEqual(baseline,before);
    const local=f.service.applyGrowthInTransaction(owner,{actionId:request.actionId,petId:request.petId,effect:battleGrowthEffect(true)}).data.pet;
    const cloud=unit(f,awarded.envelope);f.adapter.validate(cloud,owner);
    assert.deepEqual(JSON.parse(cloud.tables.companion_pets.find(row=>row.pet_id===request.petId).data_json),local);
    assert.equal(awarded.reward.previousExperience,90);assert.equal(awarded.reward.currentExperience,10);assert.equal(awarded.reward.currentLevel,2);
    for(const name of['companion_legacy_archive','companion_interactions','companion_capture_receipts'])assert.deepEqual(cloud.tables[name],before.data.modules.companions.data.tables[name]);
    assert.equal(cloud.tables.companion_accounts[0].selections_json,before.data.modules.companions.data.tables.companion_accounts[0].selections_json);
    assert.deepEqual(cloud.tables.companion_pets.filter(row=>row.pet_id!==request.petId),before.data.modules.companions.data.tables.companion_pets.filter(row=>row.pet_id!==request.petId));
    assert.deepEqual(awarded.envelope,seal(awarded.envelope));
    const second=fixture();try{second.adapter.restore(owner,cloud,'replace');assert.deepEqual(second.service.requirePet(owner,request.petId),local);}finally{second.close();}
  }finally{f.close();}
});
test('new and complete legacy formats retain exact replay receipts; original local growth receipt is recognized instead of awarding again',async()=>{
  for(const moduleFormat of[true,false]){
    const f=fixture(moduleFormat);try{
      const source=f.backups.snapshot(owner),request=input(source,f.pets[0].petId);
      const first=await awardBattleResult(request),again=await awardBattleResult({...request,envelope:first.envelope,now:now+90000});
      assert.equal(again.reward.duplicate,true);assert.deepEqual(again.envelope,first.envelope);
      f.service.applyGrowthInTransaction(owner,{actionId:request.actionId,petId:request.petId,effect:battleGrowthEffect(true)});
      const oldReceipt=f.backups.snapshot(owner),reused=await awardBattleResult({...request,envelope:oldReceipt});
      assert.equal(reused.reward.duplicate,true);assert.deepEqual(reused.envelope,oldReceipt);
      f.adapter.validate(unit(f,first.envelope),owner);
      const lost=await awardBattleResult(input(first.envelope,request.petId,'second-authoritative-battle',false));
      const pet=JSON.parse(unit(f,lost.envelope).tables.companion_pets.find(row=>row.pet_id===request.petId).data_json);
      assert.equal(pet.growth.experience,15);assert.equal(pet.growth.winsTotal,1);assert.equal(lost.reward.experience,5);
    }finally{f.close();}
  }
});
test('session/owner/pet/result binding, whole-unit format and checksum reject invalid awards without mutating the source',async()=>{
  const f=fixture();try{
    const baseline=f.backups.snapshot(owner),request=input(baseline,f.pets[0].petId),first=await awardBattleResult(request),kept=structuredClone(first.envelope);
    for(const changed of[{won:false},{petId:f.pets[1].petId},{mode:'friend'}])await assert.rejects(()=>awardBattleResult({...request,envelope:first.envelope,...changed}),error=>error.code==='ACTION_ID_CONFLICT');
    await assert.rejects(()=>awardBattleResult({...request,actionId:'another-request-id'}),error=>error.code==='INVALID_BATTLE_ACTION');
    await assert.rejects(()=>awardBattleResult({...request,ownerAccountId:'other-owner',actionId:'battle:verified-server-battle:other-owner'}),error=>error.code==='BACKUP_OWNER_MISMATCH');
    await assert.rejects(()=>awardBattleResult({...request,experience:999}),error=>error.code==='INVALID_INPUT');
    const corrupt=structuredClone(baseline);corrupt.createdAt='modified';await assert.rejects(()=>awardBattleResult({...request,envelope:corrupt}),error=>error.code==='BACKUP_CHECKSUM_MISMATCH');
    const doubled=structuredClone(baseline);doubled.data.tables.companion_pets={schema:[],rows:[]};await assert.rejects(()=>awardBattleResult({...request,envelope:seal(doubled)}),error=>error.code==='INVALID_CLOUD_SAVE');
    const incomplete=structuredClone(baseline);delete incomplete.data.modules.companions.data.tables.companion_capture_receipts;await assert.rejects(()=>awardBattleResult({...request,envelope:seal(incomplete)}),error=>error.code==='INVALID_CLOUD_SAVE');
    assert.deepEqual(first.envelope,kept);
  }finally{f.close();}
});
