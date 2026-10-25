import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {companionIdentity} from '../../companions/display-identity.mjs';
const require=createRequire(import.meta.url);
const {DiscoveryService}=require('../service.cjs');
const {migrateDiscovery}=require('../migrations.cjs');

test('discovery identity projection distinguishes same-template twins and preserves original capture bytes and owner binding',()=>{
  const db=new DatabaseSync(':memory:');migrateDiscovery(db);
  const owner='identity-owner-a',ids=['pet-11111111-0000-4000-8000-000000000001','pet-11111111-0000-4000-8000-000000000002'];
  const pets=ids.map(petId=>({ownerAccountId:owner,petId,templateId:'animal-hat-cat',name:'当前旧昵称',serial:'11111111',element:'metal',resource:{kind:'2d',resourceId:'builtin:lingjing-yuwan-v2'},growth:{level:1},desktop:{visible:false}}));
  const companionBytes=JSON.stringify(pets);
  const service=new DiscoveryService({db,getOwner:()=>owner,getCompanions:()=>({listPets:requested=>requested===owner?pets:[]})});
  for(const [index,petId]of ids.entries())service.repo.putCapture({ownerAccountId:owner,encounterId:'encounter-'+index,petId,actionId:'capture-'+index,name:'捕捉当时的昵称',serial:'SHARED-HISTORICAL-SERIAL',templateId:'animal-hat-cat',resourceId:'historical-resource',capturedAtMs:1000+index,memoryTags:[{id:'memory-'+index,text:'与捕捉当时的昵称初次相遇。'}]});
  const captureBytes=()=>db.prepare('select * from discovery_captures order by encounter_id').all();
  const before=captureBytes();
  try{
    const snapshot=service.snapshotLocal().data;
    const identities=snapshot.pets.map(pet=>companionIdentity(pet));
    assert.deepEqual(identities.map(p=>p.roleName),['礼帽喵','礼帽喵']);
    assert.deepEqual(identities.map(p=>p.instanceNumber),ids);
    assert.notEqual(identities[0].instanceNumber,identities[1].instanceNumber);
    assert.equal(identities[0].historicalNickname,'当前旧昵称');
    for(const capture of snapshot.captures){assert.equal(capture.name,'捕捉当时的昵称');assert.equal(capture.serial,'SHARED-HISTORICAL-SERIAL');assert.equal(capture.memoryTags[0].text,'与捕捉当时的昵称初次相遇。');assert.equal(capture.resourceId,pets[0].resource.resourceId);}
    const foreign={...pets[0],ownerAccountId:'identity-owner-b',resource:{kind:'2d',resourceId:'foreign-resource'}};
    assert.equal(service.captureViews(owner,[foreign,...pets]).find(c=>c.petId===ids[0]).resourceId,pets[0].resource.resourceId);
    assert.equal(service.captureViews('identity-owner-b',pets).length,0);
    assert.deepEqual(captureBytes(),before);assert.equal(JSON.stringify(pets),companionBytes);
  }finally{db.close();}
});

test('unknown historical template keeps its original full id and nickname without guessing from current appearance',()=>{
  const pet={petId:'legacy-full-instance-id-with-original-case',templateId:'old-template-not-in-current-catalog',name:'原档自定义名',resource:{resourceId:'builtin:lingjing-shiba-v2'}};
  assert.deepEqual(companionIdentity(pet),{roleName:'历史伙伴',instanceNumber:pet.petId,historicalNickname:pet.name});
});
