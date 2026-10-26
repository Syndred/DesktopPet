/* eslint-disable @typescript-eslint/no-require-imports -- Electron runtime uses CommonJS. */
const {checksum,transaction}=require('../accounts/util.cjs');
const fail=message=>{throw Object.assign(new Error(message),{code:'INVALID_INPUT'});};
function validated(value){
  if(!value||typeof value.visible!=='boolean'||!['wander','quiet','follow','sleep'].includes(value.behavior)||!Number.isFinite(value.scale)||value.scale<0.5||value.scale>2)fail('桌面设置无效。');
  const p=value.position;if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>100000||Math.abs(p.y)>100000||p.displayId!=null&&(typeof p.displayId!=='string'||p.displayId.length>100))fail('桌面位置无效。');
  return {visible:value.visible,behavior:value.behavior,scale:value.scale,position:{x:Math.round(p.x),y:Math.round(p.y),displayId:p.displayId||null}};
}
class DeviceDesktop {
  constructor({db,getPet,listPets,enabled}){this.db=db;this.getPet=getPet;this.listPets=listPets;this.enabled=enabled;}
  capture(owner){if(!this.enabled(owner)||this.db.prepare('SELECT 1 FROM companion_device_initialization WHERE owner_account_id=?').get(owner))return;
    transaction(this.db,()=>{for(const pet of this.listPets(owner))this.db.prepare('INSERT OR IGNORE INTO companion_device_desktop VALUES(?,?,?,?,?)').run(owner,pet.petId,JSON.stringify(validated(pet.desktop)),0,Date.now());
      this.db.prepare('INSERT OR IGNORE INTO companion_device_initialization VALUES(?,?)').run(owner,Date.now());});
  }
  project(pet){if(!this.enabled(pet.ownerAccountId))return pet;
    const row=this.db.prepare('SELECT document_json FROM companion_device_desktop WHERE owner_account_id=? AND pet_id=?').get(pet.ownerAccountId,pet.petId);
    const desktop=row?JSON.parse(row.document_json):{visible:false,behavior:'quiet',scale:1,position:{...pet.desktop.position}};
    return {...pet,desktop};
  }
  update(owner,input){
    if(!this.enabled(owner))fail('请先登录对应账号。');
    if(typeof input.actionId!=='string'||input.actionId.length<1||input.actionId.length>200||Object.keys(input).some(name=>!['actionId','petId','expectedRevision','visible','behavior','scale','position'].includes(name)))fail('桌面设置请求无效。');
    this.capture(owner);const original=this.getPet(owner,input.petId),digest=checksum(input);
    return transaction(this.db,()=>{
      const prior=this.db.prepare('SELECT * FROM companion_device_actions WHERE owner_account_id=? AND action_id=?').get(owner,input.actionId);
      if(prior){if(prior.input_hash!==digest)throw Object.assign(new Error('操作编号已用于其他设置。'),{code:'ACTION_ID_REUSED'});return {...JSON.parse(prior.result),duplicate:true};}
      const pet=this.project(original),patch=Object.fromEntries(['visible','behavior','scale','position'].filter(name=>input[name]!==undefined).map(name=>[name,input[name]]));
      if(!Object.keys(patch).length)fail('未提供桌面修改。');const desktop=validated({...pet.desktop,...patch});
      this.db.prepare(`INSERT INTO companion_device_desktop VALUES(?,?,?,1,?) ON CONFLICT(owner_account_id,pet_id) DO UPDATE SET document_json=excluded.document_json,revision=companion_device_desktop.revision+1,updated_at=excluded.updated_at`)
        .run(owner,input.petId,JSON.stringify(desktop),Date.now());
      const result={ok:true,data:{pet:{...pet,desktop}},revision:pet.revision};
      this.db.prepare('INSERT INTO companion_device_actions VALUES(?,?,?,?,?)').run(owner,input.actionId,digest,JSON.stringify(result),Date.now());return result;
    });
  }
  migrateIntent(owner,input){
    this.capture(owner);
    const prior=this.db.prepare('SELECT revision FROM companion_device_desktop WHERE owner_account_id=? AND pet_id=?').get(owner,input.petId);
    const latest=this.db.prepare("SELECT result FROM companion_device_actions WHERE owner_account_id=? AND json_extract(result,'$.data.pet.petId')=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(owner,input.petId);
    if(prior?.revision>0&&!JSON.parse(latest?.result||'null')?.legacyDesktopMigration)return {applied:false,reason:'newer-device-settings'};
    const result=this.update(owner,input);
    this.db.prepare('UPDATE companion_device_actions SET result=? WHERE owner_account_id=? AND action_id=?').run(JSON.stringify({...result,legacyDesktopMigration:true}),owner,input.actionId);
    return {applied:true,actionId:input.actionId};
  }
  recallAll(owner,actionId){return transaction(this.db,()=>{this.capture(owner);const digest=checksum({command:'recall-all'}),prior=this.db.prepare('SELECT * FROM companion_device_actions WHERE owner_account_id=? AND action_id=?').get(owner,actionId);
    if(prior){if(prior.input_hash!==digest)throw Object.assign(new Error('操作编号已用于其他设置。'),{code:'ACTION_ID_REUSED'});return {...JSON.parse(prior.result),duplicate:true};}
    const pets=this.listPets(owner).map(pet=>this.project(pet)).filter(pet=>pet.desktop.visible);
    for(const pet of pets)this.update(owner,{actionId:`${actionId}:${pet.petId}`,petId:pet.petId,visible:false});
    const result={ok:true,data:{recalled:pets.map(pet=>pet.petId)}};this.db.prepare('INSERT INTO companion_device_actions VALUES(?,?,?,?,?)').run(owner,actionId,digest,JSON.stringify(result),Date.now());return result;});}
  backup(){return {id:'device-desktop',version:1,tables:['companion_device_desktop','companion_device_actions','companion_device_initialization'],
    // Revision zero only pins an unchanged legacy layout already present in the
    // original companion archive. Export actual device edits, not read-cache initialization.
    export:owner=>({ownerAccountId:owner,pets:this.db.prepare('SELECT pet_id,document_json FROM companion_device_desktop WHERE owner_account_id=? AND revision>0 ORDER BY pet_id').all(owner).map(row=>({petId:row.pet_id,desktop:JSON.parse(row.document_json)}))}),
    validate:(data,owner)=>{if(data?.ownerAccountId!==owner||!Array.isArray(data.pets)||data.pets.length>10000)fail('桌面设置备份无效。');const ids=new Set();for(const row of data.pets){if(typeof row.petId!=='string'||!row.petId||ids.has(row.petId))fail('桌面伙伴编号无效。');ids.add(row.petId);validated(row.desktop);}},
    restore:(owner,data)=>{for(const pet of data.pets)this.db.prepare('INSERT INTO companion_device_desktop VALUES(?,?,?,1,?) ON CONFLICT(owner_account_id,pet_id) DO UPDATE SET document_json=excluded.document_json,revision=companion_device_desktop.revision+1,updated_at=excluded.updated_at').run(owner,pet.petId,JSON.stringify(validated(pet.desktop)),Date.now());}
  };}
}
module.exports={DeviceDesktop};
