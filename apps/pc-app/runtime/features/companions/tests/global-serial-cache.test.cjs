const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve,dirname,basename}=require('node:path');
const {randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {createGlobalSerialCache}=require('../global-serial-cache.cjs');
const {CompanionsService}=require('../service.cjs');
const {migrateCompanions}=require('../migrations.cjs');
const {createCompanionBackupAdapter}=require('../backup.cjs');
const {BackupManager}=require('../../accounts/backups.cjs');
const {migrations}=require('../../accounts/schema.cjs');
const {checksum}=require('../../accounts/util.cjs');
const {createServices}=require('../../../core/services.cjs');
const owner='serial-original-owner',petId='pet-original-unchanged';
const pet={ownerAccountId:owner,petId,templateId:'big-fish-gentle',name:'原名字',globalSerial:'999999'};
const rows=[{owner_account_id:owner,pet_id:petId,template_id:pet.templateId}];
const registry=(number='7',who=owner,id=petId,revision=3)=>({format:'lingjing.global-serial.readback',version:1,ownerAccountId:who,namespace:'live',revision,pets:[{namespace:'live',ownerAccountId:who,petId:id,templateId:pet.templateId,globalSerial:number}]});
const folder=()=>mkdtempSync(join(tmpdir(),'lingjing-serial-cache-'));
function cleanup(path){assert.equal(dirname(resolve(path)),resolve(tmpdir()));assert.ok(basename(path).startsWith('lingjing-serial-cache-'));rmSync(path,{recursive:true,force:true});}
// Cryptographic fixture for persistence/failure tests, not a claim that Windows
// DPAPI or a native app was exercised. Production uses Electron safeStorage.
function storage(){const key=randomBytes(32);return{isEncryptionAvailable:()=>true,encryptString(text){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),body=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([nonce,cipher.getAuthTag(),body]);},decryptString(bytes){const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');}};}

test('unverified imported metadata, foreign identity and noncanonical numbers cannot assert authority',()=>{
 const cache=createGlobalSerialCache(),before=JSON.stringify(pet);
 assert.equal(cache.project(pet).globalSerial,undefined);assert.equal(JSON.stringify(pet),before);
 for(const invalid of [0,7,'0','01','1e3','+1','1.0',' 1','-1'])assert.throws(()=>cache.accept(owner,registry(invalid),rows,3),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
 assert.throws(()=>cache.accept(owner,registry('7','another-owner'),rows,3),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
 assert.throws(()=>cache.accept(owner,{...registry(),pets:[]},rows,3),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
 assert.throws(()=>cache.accept(owner,{...registry(),revision:2},rows,3),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
 assert.equal(cache.accept(owner,registry('9007199254740993'),rows,3),true);
 assert.equal(cache.project(pet).globalSerial,'9007199254740993');
 assert.equal(cache.accept(owner,{...registry('9007199254740993'),namespace:'qa:current-scenario'},rows,3),false,'historical entry namespace may differ from the current actor scope');
 assert.equal(cache.project({...pet,ownerAccountId:'another-owner'}).globalSerial,undefined);
 assert.equal(cache.project({...pet,templateId:'animal-shiba'}).globalSerial,undefined);
 assert.throws(()=>cache.accept(owner,registry('8'),rows,3),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
 assert.equal(cache.project(pet).globalSerial,'9007199254740993');
});

test('sealed cache survives restart; corrupt/plain files and unavailable encryption return pending',()=>{
 const directory=folder(),safeStorage=storage(),file=join(directory,'global-pet-serials.cache');
 try{
  const first=createGlobalSerialCache({directory,safeStorage});first.accept(owner,registry(),rows,3);
  assert.equal(readFileSync(file).includes(Buffer.from(owner)),false);
  const reopened=createGlobalSerialCache({directory,safeStorage});assert.equal(reopened.project(pet).globalSerial,'7');
  assert.equal(reopened.accept(owner,registry(),rows,3),false);
  writeFileSync(file,JSON.stringify(registry('123456')));
  assert.equal(createGlobalSerialCache({directory,safeStorage}).project(pet).globalSerial,undefined);
  first.accept(owner,registry(),rows,3);const damaged=readFileSync(file);damaged[30]^=1;writeFileSync(file,damaged);
  assert.equal(createGlobalSerialCache({directory,safeStorage}).project(pet).globalSerial,undefined);
  const memory=createGlobalSerialCache({directory,safeStorage:{isEncryptionAvailable:()=>false}});memory.accept(owner,registry(),rows,3);
  assert.equal(memory.project(pet).globalSerial,'7');assert.equal(createGlobalSerialCache({directory,safeStorage:{isEncryptionAvailable:()=>false}}).project(pet).globalSerial,undefined);
 }finally{cleanup(directory);}
});

test('real SQLite, backup restore and actual API/IPC outlets use independent readback and retain original bytes',async()=>{
 const directory=folder(),db=new DatabaseSync(join(directory,'state.sqlite')),safeStorage=storage();
 let feature;
 try{
  migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'original','original','原账号','2026-10-25','2026-10-25');
  const rawService=new CompanionsService({db,uuid:()=>petId.slice(4)}),adopted=rawService.adopt(owner,{actionId:'original-action-unchanged',templateId:pet.templateId,name:'原名字',showOnDesktop:false}).data.pet;
  assert.equal(adopted.petId,petId);
  db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-25',owner);
  const adapter=createCompanionBackupAdapter(db),imported=adapter.export(owner),row=imported.tables.companion_pets[0];
  row.data_json=JSON.stringify({...JSON.parse(row.data_json),globalSerial:'999999'});
  adapter.restore(owner,imported,'replace'); // Actual untrusted backup path.
  const original=JSON.stringify(adapter.export(owner)),archive=join(directory,'original-archive.json');writeFileSync(archive,original);
  const services=createServices({db,legacy:{},paths:{userData:directory},windows:{},safeStorage});services.session.setAdapter({getCurrentUser:()=>({id:owner})});
  const backups=new BackupManager({db,directory:join(directory,'backups'),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
  let includeSerial=false,offline=false;
  const data=adapter.export(owner),body={format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:'2026-10-25T00:00:00.000Z',data:{modules:{companions:{version:1,data}},tables:{}}},envelope={...body,checksum:checksum(body)};
  const remote=()=>({authority:'live',ownerAccountId:owner,revision:3,envelope:structuredClone(envelope),module:{version:1,data:structuredClone(data)},...(includeSerial?{serialRegistry:registry()}: {})});
  services.provide('backups',backups);services.provide('accounts',{identity:who=>({provider:'runtime',subject_id:who}),privateSession:()=>({ownerAccountId:owner,authKind:'supabase'}),cloudInvoke:async(name,input)=>{assert.equal(name,'companions-sync');assert.equal(input.op,'snapshot');if(offline)throw Object.assign(new Error('fixture offline'),{code:'CLOUD_UNAVAILABLE'});return remote();}});
  services.provide('resources',{ready:Promise.resolve()});
  feature=require('../index.cjs').register(services);for(const[name,handler]of Object.entries(feature.commands))services.ipc.handle('companions:'+name,handler);
  const api=services.get('companions'),events=[];services.events.on('companions:changed',event=>events.push(event));
  const backupBefore=JSON.stringify(backups.snapshot(owner).data);
  assert.equal(api.getPet(owner,petId).globalSerial,undefined);assert.equal(api.getDisplayIdentity(owner,petId).instanceNumber,'待同步');
  assert.equal((await services.invoke('companions','get',{petId})).data.globalSerial,undefined);
  includeSerial=true;
  const snapshot=await services.invoke('companions','list');assert.equal(snapshot.ok,true);assert.equal(snapshot.data.pets[0].globalSerial,'7');
  assert.equal(api.listPets(owner)[0].globalSerial,'7');assert.equal(api.getPet(owner,petId).globalSerial,'7');
  assert.equal((await services.invoke('companions','get',{petId})).data.globalSerial,'7');
  assert.equal((await services.invoke('companions','identity',{petId})).data.instanceNumber,'0007');assert.equal(api.getDisplayIdentity(owner,petId).instanceNumber,'0007');
  assert.ok(events.some(e=>e.ownerAccountId===owner),'pure number completion emits owner-bound companions:changed');
  assert.equal(JSON.stringify(adapter.export(owner)),original);assert.equal(readFileSync(archive,'utf8'),original);assert.equal(JSON.stringify(backups.snapshot(owner).data),backupBefore);
  assert.equal(db.prepare('SELECT data_json FROM companion_pets').get().data_json,row.data_json);
  assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE name LIKE '%global_serial%'").get().n,0);
  assert.ok(existsSync(join(directory,'accounts','global-pet-serials.cache')));
  const invalid=remote();invalid.serialRegistry.pets[0].globalSerial='42';assert.throws(()=>api.applyCloudReadback(owner,invalid),{code:'GLOBAL_SERIAL_READBACK_INVALID'});
  assert.equal(api.getPet(owner,petId).globalSerial,'7');assert.equal(JSON.stringify(adapter.export(owner)),original);
  offline=true;assert.equal((await services.invoke('companions','get',{petId})).data.globalSerial,'7');
  feature.dispose();feature=null;
  const restartedCache=createGlobalSerialCache({directory:join(directory,'accounts'),safeStorage}),restartedService=new CompanionsService({db,projectIdentity:restartedCache.project});
  assert.equal(restartedService.readPet(owner,petId).globalSerial,'7');assert.equal(restartedService.readSnapshot(owner).data.pets[0].globalSerial,'7');
  assert.equal(restartedService.requirePet(owner,petId).globalSerial,'999999','raw imported bytes remain untrusted and unchanged');
 }finally{feature?.dispose();db.close();cleanup(directory);}
});
