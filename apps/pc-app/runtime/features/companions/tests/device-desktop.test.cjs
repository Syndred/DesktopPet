const {test}=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {CompanionsService}=require('../service.cjs');
const {createCompanionBackupAdapter}=require('../backup.cjs');
const {DeviceDesktop}=require('../device-desktop.cjs');
function fixture(initial){
  const db=openDatabase(':memory:'),owner='device-desktop-owner';migrate(db,'companions',require('../migrations.cjs').migrations);
  const service=new CompanionsService({db}),backup=createCompanionBackupAdapter(db);
  if(initial)backup.restore(owner,initial,'replace');else service.adopt(owner,{templateId:'big-fish-gentle',name:'设备伙伴',showOnDesktop:false,actionId:'original-cloud-pet'});
  const device=new DeviceDesktop({db,getPet:(who,id)=>service.requirePet(who,id),listPets:who=>service.snapshot(who).data.pets,enabled:who=>who===owner});
  const pet=service.snapshot(owner).data.pets[0];device.capture(owner);return {db,owner,service,backup,device,pet,close:()=>db.close()};
}
test('LOCAL SQLite: dragging and changing local desktop controls never change cloud-owned pet rows, revisions or economy receipts',()=>{
  const f=fixture();try{
    const before=f.backup.export(f.owner),revision=f.pet.revision;
    for(let index=0;index<100;index++)f.device.update(f.owner,{actionId:`move-${index}`,petId:f.pet.petId,position:{x:index,y:100+index,displayId:'local-display'}});
    f.device.update(f.owner,{actionId:'visible-scale',petId:f.pet.petId,visible:true,scale:1.4,behavior:'follow',expectedRevision:revision});
    assert.deepEqual(f.backup.export(f.owner),before);const projected=f.device.project(f.service.requirePet(f.owner,f.pet.petId));
    assert.equal(projected.revision,revision);assert.equal(projected.desktop.position.x,99);assert.equal(projected.desktop.scale,1.4);assert.equal(projected.desktop.visible,true);
    assert.equal(f.db.prepare('SELECT count(*) n FROM companion_device_actions').get().n,101);
  }finally{f.close();}
});
test('LOCAL SQLite: two clients retain independent layouts when they read the same authoritative pet',()=>{
  const a=fixture(),b=fixture(a.backup.export(a.owner));try{
    const originalB=b.device.project(b.pet).desktop;
    a.device.update(a.owner,{actionId:'device-a-layout',petId:a.pet.petId,visible:true,scale:1.7,position:{x:900,y:600,displayId:'display-a'}});
    b.backup.restore(b.owner,a.backup.export(a.owner),'replace');
    assert.deepEqual(b.device.project(b.service.requirePet(b.owner,b.pet.petId)).desktop,originalB);
    assert.equal(a.device.project(a.service.requirePet(a.owner,a.pet.petId)).desktop.position.x,900);
  }finally{a.close();b.close();}
});
test('LOCAL SQLite: an original desktop action replays once and rejects reuse for different data',()=>{
  const f=fixture();try{
    const input={actionId:'one-device-action',petId:f.pet.petId,visible:true};f.device.update(f.owner,input);
    assert.equal(f.device.update(f.owner,input).duplicate,true);
    assert.throws(()=>f.device.update(f.owner,{...input,visible:false}),{code:'ACTION_ID_REUSED'});
    const result=f.device.recallAll(f.owner,'one-recall');assert.deepEqual(result.data.recalled,[f.pet.petId]);
    assert.deepEqual(f.device.recallAll(f.owner,'one-recall').data,result.data);
  }finally{f.close();}
});
test('LOCAL SQLite: device backups restore layout only and reject gameplay fields or another owner',()=>{
  const f=fixture();try{
    const adapter=f.device.backup(),before=f.backup.export(f.owner);f.device.update(f.owner,{actionId:'large',petId:f.pet.petId,scale:2});
    const save=adapter.export(f.owner);adapter.validate(save,f.owner);f.device.update(f.owner,{actionId:'small',petId:f.pet.petId,scale:.5});adapter.restore(f.owner,save);
    assert.equal(f.device.project(f.pet).desktop.scale,2);assert.deepEqual(f.backup.export(f.owner),before);
    assert.throws(()=>f.device.update(f.owner,{actionId:'forged-economy',petId:f.pet.petId,experience:999}),{code:'INVALID_INPUT'});
    assert.throws(()=>adapter.validate(save,'other-owner'),{code:'INVALID_INPUT'});
  }finally{f.close();}
});
