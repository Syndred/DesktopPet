// Legacy full-save compatibility only. Production refresh uses domain caches and personal records.
const {test,afterEach}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');const {randomUUID}=require('node:crypto');const Database=require('better-sqlite3');
const syncFs=require('node:fs');
const {createClient}=require('@supabase/supabase-js');const {AccountsService}=require('../service.cjs');const {SupabaseRemote}=require('../supabase-remote.cjs');
const {checksum}=require('../util.cjs');const {migrations}=require('../schema.cjs');
const {ResourcesService}=require('../../resources/service.cjs'),{migrations:resourceMigrations}=require('../../resources/repository.cjs');
const {ResourceCloudSync}=require('../../resources/cloud-sync.cjs'),{buildPackage}=require('../../resources/cloud-packages.cjs');
const {canonical,hash,manifestPath,chunkPath,CHUNK_BYTES,BUCKET}=require('../../resources/cloud-contract.cjs');
const {createResourceBackupAdapter}=require('../../../core/resource-backup.cjs');
const {migrateCompanions}=require('../../companions/migrations.cjs'),{CompanionsService}=require('../../companions/service.cjs'),{createCompanionBackupAdapter}=require('../../companions/backup.cjs');
const fixtures=[];const owner='old-resource-owner',uid='10000000-0000-4000-8000-000000000001';
const seal=envelope=>{const {checksum:discard,...body}=envelope;return{...body,checksum:checksum(body)};};
const result=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
async function fixture(){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lingjing-hydration-guard-'));
 const f={directory,objects:new Map(),references:[],actions:[],preferences:[],requests:[],changed:null};
 const makeLocal=async name=>{const root=path.join(directory,name);await fs.mkdir(root);const db=new Database(path.join(root,'state.sqlite'));
  migrations.forEach(m=>db.exec(m.sql));resourceMigrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  const resources=new ResourcesService({db,storageRoot:path.join(root,'managed'),seedBuiltin:false});await resources.seed();return{root,db,resources};};
 f.a=await makeLocal('source');f.b=await makeLocal('target');fixtures.push(f);
 const provider=async(input,options={})=>{
  const url=new URL(String(input)),name=url.pathname.split('/').pop();f.requests.push({path:url.pathname,query:url.search});await f.beforeRequest?.(url);
  if(url.pathname.includes('/storage/v1/object/')){const key=decodeURIComponent(url.pathname.split(`/${BUCKET}/`)[1]),bytes=f.objects.get(key);return bytes?new Response(bytes,{status:200,headers:{'content-type':'application/octet-stream'}}):new Response('{}',{status:404});}
  let rows=name==='lingjing_resource_references'?f.references:name==='lingjing_save_actions'?f.actions:name==='lingjing_resource_preferences'?f.preferences:null;
  if(rows){for(const[key,value]of url.searchParams)if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));return new Response(JSON.stringify(rows),{status:200,headers:{'content-type':'application/json'}});}
  const body=JSON.parse(options.body);
  if(name==='lingjing-auth'){
   if(body.op==='login'){
    const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:owner,authUserId:uid,deviceId:options.headers['X-Lingjing-Device-Id'],sessionId:randomUUID(),account:'alice',username:'资源守卫验证'};
    f.bundle={actor,currentUser:{id:owner,authKind:'supabase',authUserId:uid,account:'alice',username:actor.username},tokens:{deviceId:actor.deviceId,sessionId:actor.sessionId,accessToken:'protocol-unit-only',refreshToken:'twelve_chars',expiresAt:Date.now()/1000+3600}};
   }return result(body.op==='login'?f.bundle:{actor:f.bundle.actor});
  }
  if(name==='lingjing-save'&&body.op==='read')return result(f.cloud);
  throw Error('Unexpected simulated provider operation');
 };
 f.remote=new SupabaseRemote({userData:f.b.root,config:{url:'https://protocol.example.invalid',key:'sb_publishable_protocol_unit_only'},fetcher:provider});
 f.accounts=new AccountsService({services:{db:f.b.db,paths:{userData:f.b.root,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit(){}}},remote:f.remote,host:{async apply(){},clear(){},dispose(){}}});
 await f.accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
 const settings=f.accounts.settings();settings.document.sync.enabled=true;settings.document.desktop.volume=10;await f.accounts.saveSettings({...settings,actionId:randomUUID()});
 const client=createClient('https://protocol.example.invalid','sb_publishable_protocol_unit_only',{accessToken:async()=>f.remote.active?.accessToken,global:{fetch:provider}});
 f.cloudSync=new ResourceCloudSync({service:f.b.resources,getActor:async()=>({...f.remote.active.actor,client}),onChanged:(o,id)=>f.changed?.(o,id)});
 const map=new Map([['resources',f.b.resources],['resourceCloud',f.cloudSync]]);f.accounts.backups.register(createResourceBackupAdapter({db:f.b.db,get:name=>map.get(name)}));
 f.pets=new CompanionsService({db:f.b.db});const adopted=f.pets.adopt(owner,{actionId:randomUUID(),templateId:'big-fish-gentle',name:'旧外观伙伴',showOnDesktop:false});f.petId=adopted.data.pet.petId;
 f.accounts.backups.register(createCompanionBackupAdapter(f.b.db));
 f.package=async(label,sourceClient=f.a)=>{
  const source=path.join(directory,label);await fs.mkdir(source);const base=path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya');
  const descriptor=JSON.parse(await fs.readFile(path.join(base,'character.json'),'utf8'));descriptor.character.name=label;
  await fs.writeFile(path.join(source,'character.json'),JSON.stringify(descriptor));await fs.copyFile(path.join(base,'sprites.png'),path.join(source,'sprites.png'));
  const imported=await sourceClient.resources.importFile(owner,path.join(source,'character.json'));return f.publish(await buildPackage(sourceClient.resources,owner,uid,imported.resource.id));
 };
 f.publish=async packet=>{const m=packet.manifest;
  f.objects.set(manifestPath(uid,m.resourceId,packet.digest),packet.bytes);
  for(const file of m.files){const bytes=await fs.readFile(packet.locations.get(file.key));for(const[index,part]of file.chunks.entries())f.objects.set(chunkPath(uid,m.resourceId,packet.digest,file.sha256,index,part.sha256),bytes.subarray(index*CHUNK_BYTES,index*CHUNK_BYTES+part.size));}
  const actionId=`resources:${m.resourceId}:${packet.digest}`,row={auth_user_id:uid,owner_account_id:owner,resource_id:m.resourceId,manifest_sha256:packet.digest,content_hash:m.contentHash,
   manifest_path:manifestPath(uid,m.resourceId,packet.digest),manifest_bytes:packet.bytes.length,total_bytes:m.totalBytes,resource_kind:'spritesheet',authority_action_id:actionId,authority_revision:1,authority_checksum:'a'.repeat(64)};
  f.references.push(row);f.actions.push({owner_id:owner,action_id:actionId,kind:'authority',revision:1,checksum:row.authority_checksum});
  return{...packet,row,reference:{authUserId:uid,resourceId:m.resourceId,manifestSha256:packet.digest,contentHash:m.contentHash,manifestPath:row.manifest_path,manifestBytes:row.manifest_bytes,totalBytes:m.totalBytes,kind:'spritesheet'}};
 };
 f.module=(refs,prefs=[])=>({version:2,data:{format:'lingjing-resource-references',ownerAccountId:owner,references:refs.map(p=>p.reference).sort((a,b)=>a.resourceId.localeCompare(b.resourceId)||a.manifestSha256.localeCompare(b.manifestSha256)),preferences:prefs}});
 f.old=await f.package('原有资源',f.b);f.originalNativeDocument=f.b.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(f.old.manifest.resourceId).document_json;
 assert.notEqual(f.originalNativeDocument,canonical(f.old.manifest.document));await f.cloudSync.hydrateReferences(owner,f.module([f.old]));
 const record=f.b.resources.getRecord(owner,f.old.manifest.resourceId),document={calibration:record.calibration,actions:record.actions};
 const prefAction=`resource-pref:${randomUUID()}`;f.prefRow={owner_account_id:owner,auth_user_id:uid,resource_id:record.id,revision:1,document,authority_action_id:prefAction};
 f.preferences.push(f.prefRow);f.actions.push({owner_id:owner,action_id:prefAction,kind:'authority',revision:1,checksum:'b'.repeat(64)});
 f.pref=await f.cloudSync.preferences.read(owner,record.id);f.cloudSync.preferences.apply(owner,f.pref,{force:true});
 const preference={resourceId:record.id,revision:1,...document};
 f.base=f.accounts.backups.snapshot(owner);f.base.data.modules['character-resources']=f.module([f.old],[preference]);f.base=seal(f.base);
 f.accounts.sync.acceptAuthoritativeReadback(owner,{envelope:f.base,cloudRevision:1});f.actions.push({owner_id:owner,action_id:'baseline-fixture',kind:'authority',revision:1,checksum:f.base.checksum,envelope:f.base});
 f.next=await f.package('新增资源');let next=structuredClone(f.base);next.data.modules['character-resources']=f.module([f.old,f.next],[preference]);
 const petRow=next.data.modules.companions.data.tables.companion_pets[0],pet=JSON.parse(petRow.data_json);pet.resource.resourceId=f.next.manifest.resourceId;pet.revision++;pet.updatedAt=new Date().toISOString();petRow.revision=pet.revision;petRow.updated_at=pet.updatedAt;petRow.data_json=JSON.stringify(pet);
 next.data.modules.companions.data.tables.companion_accounts[0].revision++;
 f.cloud={revision:2,envelope:seal(next)};f.cloud.checksum=f.cloud.envelope.checksum;
 return f;
}
afterEach(async()=>{for(const f of fixtures.splice(0)){f.accounts?.dispose();f.a.db.close();f.b.db.close();const target=path.resolve(f.directory);
 assert.equal(path.dirname(target),path.resolve(os.tmpdir()));assert.ok(path.basename(target).startsWith('lingjing-hydration-guard-'));await fs.rm(target,{recursive:true,force:true});}});

test('production07 + BackupManager with real SQLite / simulated HTTPS provider: new private resource hydration must allow atomic full-save adoption',async()=>{
 const f=await fixture(),before=f.accounts.backups.dataChecksum(owner);const restored=await f.accounts.sync.reconcile(f.accounts.requireOwner());
 assert.equal(restored.applied,true);assert.notEqual(f.accounts.backups.dataChecksum(owner),before);
 assert.equal(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
 assert.equal(f.b.db.prepare('SELECT cloud_revision FROM account_sync_state').get().cloud_revision,2);
 assert.equal(f.accounts.sync.status(owner).localChanged,false);
 const received=await f.b.resources.assetFile(owner,f.next.manifest.resourceId,'sprites.png');assert.equal(hash(await fs.readFile(received)),f.next.manifest.files.find(x=>x.key==='sprites.png').sha256);
 assert.ok(f.requests.some(row=>row.path.includes('/chunks/')));assert.ok(restored.preservedBackup.filePath);
 assert.equal(f.b.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(f.old.manifest.resourceId).document_json,f.originalNativeDocument);
});

test('production07 + real SQLite: verified resource/pref pump before reconcile may precede the companion appearance update',async()=>{
 const f=await fixture();f.prefRow.revision=2;f.prefRow.document=structuredClone(f.prefRow.document);f.prefRow.document.calibration.desktop.scale=1.4;
 const expected={resourceId:f.prefRow.resource_id,revision:2,...f.prefRow.document};f.cloud.envelope.data.modules['character-resources'].data.preferences=[expected];f.cloud.envelope=seal(f.cloud.envelope);f.cloud.checksum=f.cloud.envelope.checksum;
 await f.cloudSync.hydrateReferences(owner,f.cloud.envelope.data.modules['character-resources']);
 f.cloudSync.preferences.apply(owner,await f.cloudSync.preferences.read(owner,f.prefRow.resource_id));
 assert.equal(f.accounts.sync.status(owner).localChanged,true);assert.notEqual(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
 const restored=await f.accounts.sync.reconcile(f.accounts.requireOwner());assert.equal(restored.applied,true);assert.equal(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
 assert.equal(f.b.resources.getRecord(owner,f.prefRow.resource_id).calibration.desktop.scale,1.4);assert.equal(f.accounts.sync.status(owner).localChanged,false);
 assert.equal(f.b.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(f.old.manifest.resourceId).document_json,f.originalNativeDocument);
});

test('production07 may append only the new exact manifest import to an existing native import without rewriting its original JSON',async()=>{
 const f=await fixture(),sourceCloud=new ResourceCloudSync({service:f.a.resources,getActor:f.cloudSync.getActor});
 await sourceCloud.hydrateReferences(owner,f.module([f.old]));await f.a.resources.importFile(owner,path.join(f.directory,'原有资源','character.json'));
 const updated=await f.publish(await buildPackage(f.a.resources,owner,uid,f.old.manifest.resourceId));assert.notEqual(updated.digest,f.old.digest);
 f.cloud.envelope.data.modules['character-resources']=f.module([f.old,f.next,updated],f.cloud.envelope.data.modules['character-resources'].data.preferences);
 f.cloud.envelope=seal(f.cloud.envelope);f.cloud.checksum=f.cloud.envelope.checksum;
 assert.equal((await f.accounts.sync.reconcile(f.accounts.requireOwner())).applied,true);
 const rows=f.b.db.prepare('SELECT import_id FROM lingjing_resource_imports WHERE resource_id=? ORDER BY import_id').all(f.old.manifest.resourceId).map(row=>row.import_id);
 assert.deepEqual(rows,updated.manifest.imports.map(row=>row.import_id).sort());
 assert.equal(f.b.db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(f.old.manifest.resourceId).document_json,f.originalNativeDocument);
});

test('production07 safe file repair may rebind an existing registry only to its verified restore plan while preserving original bytes',async()=>{
 const f=await fixture();let preserved,triggered=false;
 f.beforeRequest=async url=>{if(triggered||!url.pathname.endsWith('/lingjing_resource_references'))return;triggered=true;
  const file=f.b.db.prepare("SELECT file_path FROM lingjing_resource_files WHERE resource_id=? AND asset_key='sprites.png'").get(f.old.manifest.resourceId).file_path;
  preserved=file+'.original-qa';const root=await fs.realpath(f.b.resources.storageRoot);
  for(const candidate of [file,preserved]){const relative=path.relative(root,await fs.realpath(path.dirname(candidate))+'/'+path.basename(candidate));assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative));}
  await fs.rename(file,preserved);
 };
 assert.equal((await f.accounts.sync.reconcile(f.accounts.requireOwner())).applied,true);assert.equal(triggered,true);
 assert.equal(hash(await fs.readFile(preserved)),f.old.manifest.files.find(file=>file.key==='sprites.png').sha256);
 const registered=f.b.db.prepare("SELECT file_path FROM lingjing_resource_files WHERE resource_id=? AND asset_key='sprites.png'").get(f.old.manifest.resourceId).file_path;
 assert.match(registered,/restore-[0-9a-f-]{36}/);assert.notEqual(registered,preserved);
});

test('real SQLite upgrade: accounts008 preserves existing007 rows and recovers the exact old immutable cloud document',async()=>{
 const f=await fixture(),db=new Database(':memory:');try{
  for(const m of migrations.filter(m=>m.id!=='accounts-008-confirmed-cloud-document'))db.exec(m.sql);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'alice','alice','原昵称','2020','2020');
  const before=f.b.db.prepare('SELECT owner_account_id,cloud_revision,envelope_checksum,data_checksum,personal_checksum,protected_checksum FROM account_sync_baselines').get();
  db.prepare('INSERT INTO account_sync_baselines VALUES(?,?,?,?,?,?)').run(...Object.values(before));
  db.exec(migrations.find(m=>m.id==='accounts-008-confirmed-cloud-document').sql);
  const upgraded=db.prepare('SELECT * FROM account_sync_baselines').get();assert.equal(upgraded.cloud_document,null);delete upgraded.cloud_document;assert.deepEqual(upgraded,before);
 }finally{db.close();}
 await f.cloudSync.hydrateReferences(owner,f.cloud.envelope.data.modules['character-resources']);
 f.b.db.exec('UPDATE account_sync_baselines SET cloud_document=NULL');
 assert.equal((await f.accounts.sync.reconcile(f.accounts.requireOwner())).applied,true);
 assert.ok(f.requests.some(row=>row.path.endsWith('/lingjing_save_actions')&&row.query.includes(encodeURIComponent(f.base.checksum))));
 assert.equal(JSON.parse(f.b.db.prepare('SELECT cloud_document FROM account_sync_baselines').get().cloud_document).checksum,f.cloud.checksum);
});

test('production07 preparation never admits user edits, extra imports/files, unverified proof or any pending action',async t=>{
 for(const kind of ['existing-resource','preference','existing-import','extra-import','extra-file','file-bytes','file-registry','missing-proof','personal','companion','account-pending','preference-pending'])await t.test(kind,async()=>{
  const f=await fixture();let triggered=false;
  f.changed=(_owner,id)=>{if(id!==f.next.manifest.resourceId||triggered)return;triggered=true;
   const db=f.b.db;
   if(kind==='existing-resource'){const row=db.prepare('SELECT document_json FROM lingjing_resources WHERE resource_id=?').get(f.old.manifest.resourceId),doc=JSON.parse(row.document_json);doc.name='本机编辑';db.prepare('UPDATE lingjing_resources SET document_json=? WHERE resource_id=?').run(JSON.stringify(doc),f.old.manifest.resourceId);}
   if(kind==='preference')db.prepare('UPDATE lingjing_resource_preferences SET revision=revision+1 WHERE owner_account_id=?').run(owner);
   if(kind==='existing-import')db.prepare('UPDATE lingjing_resource_imports SET source_filename=? WHERE resource_id=?').run('本机修改来源',f.old.manifest.resourceId);
   if(kind==='extra-import'){const row=db.prepare('SELECT * FROM lingjing_resource_imports WHERE resource_id=? LIMIT 1').get(id);db.prepare('INSERT INTO lingjing_resource_imports VALUES(?,?,?,?,?,?)').run(randomUUID(),id,owner,'额外本机来源',row.provenance_json,row.imported_at);}
   if(['extra-file','file-bytes','file-registry'].includes(kind)){
    const row=db.prepare("SELECT * FROM lingjing_resource_files WHERE resource_id=? AND asset_key='sprites.png'").get(id);
    if(kind==='file-bytes'){const bytes=syncFs.readFileSync(row.file_path);bytes[bytes.length-1]^=255;syncFs.writeFileSync(row.file_path,bytes);}
    else{const other=path.join(f.b.resources.storageRoot,'unplanned.png');syncFs.copyFileSync(row.file_path,other);
     if(kind==='extra-file')db.prepare('INSERT INTO lingjing_resource_files VALUES(?,?,?)').run(id,'extra.png',other);
     else db.prepare("UPDATE lingjing_resource_files SET file_path=? WHERE resource_id=? AND asset_key='sprites.png'").run(other,id);}
   }
   if(kind==='missing-proof')db.prepare('DELETE FROM lingjing_resource_cloud_receipts WHERE resource_id=?').run(id);
   if(kind==='personal'){const settings=JSON.parse(db.prepare('SELECT document FROM account_settings WHERE owner_account_id=?').get(owner).document);settings.desktop.volume=77;db.prepare('UPDATE account_settings SET document=? WHERE owner_account_id=?').run(JSON.stringify(settings),owner);}
   if(kind==='companion'){const row=db.prepare('SELECT data_json FROM companion_pets WHERE pet_id=?').get(f.petId),pet=JSON.parse(row.data_json);pet.name='本机伙伴改名';db.prepare('UPDATE companion_pets SET data_json=? WHERE pet_id=?').run(JSON.stringify(pet),f.petId);}
   if(kind==='account-pending')db.prepare("INSERT INTO account_sync_outbox(owner_account_id,action_id,base_revision,checksum,document,status,created_at) VALUES(?,?,?,?,?,'pending',?)").run(owner,'original-pending-action',1,f.base.checksum,JSON.stringify(f.base),'2020');
   if(kind==='preference-pending')db.prepare('INSERT INTO lingjing_resource_preference_outbox(owner_account_id,resource_id,local_revision,action_id,document_json,created_at) VALUES(?,?,?,?,?,?)').run(owner,f.old.manifest.resourceId,1,randomUUID(),canonical(f.prefRow.document),'2020');
  };
  await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),error=>['SAVE_CHANGED','RESOURCE_BACKUP_INVALID','RESOURCE_REFERENCE_CONFLICT'].includes(error.code));assert.equal(triggered,true);
  assert.equal(f.b.db.prepare('SELECT cloud_revision FROM account_sync_state').get().cloud_revision,1);
  assert.notEqual(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
  if(kind==='personal')assert.equal(f.accounts.settings().document.desktop.volume,77);
  if(kind==='account-pending'){const row=f.b.db.prepare('SELECT * FROM account_sync_outbox').get();assert.equal(row.action_id,'original-pending-action');assert.equal(row.base_revision,1);assert.equal(row.document,JSON.stringify(f.base));}
 });
});

test('resource pump admission still rejects pre-existing user preferences, unknown private imports and unrelated companion edits',async t=>{
 for(const kind of ['preference','unknown-import','companion'])await t.test(kind,async()=>{
  const f=await fixture();await f.cloudSync.hydrateReferences(owner,f.cloud.envelope.data.modules['character-resources']);
  if(kind==='preference')f.b.db.prepare('UPDATE lingjing_resource_preferences SET revision=revision+1 WHERE owner_account_id=?').run(owner);
  if(kind==='unknown-import'){const packet=await f.package('未核验本机导入');await f.b.resources.importFile(owner,path.join(f.directory,'未核验本机导入','character.json'));assert.ok(packet.manifest.resourceId);}
  if(kind==='companion'){const row=f.b.db.prepare('SELECT data_json FROM companion_pets WHERE pet_id=?').get(f.petId),pet=JSON.parse(row.data_json);pet.name='保留本机改名';f.b.db.prepare('UPDATE companion_pets SET data_json=? WHERE pet_id=?').run(JSON.stringify(pet),f.petId);}
  await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),error=>['SAVE_CHANGED','SYNC_REMOTE_CONFLICT'].includes(error.code));
  assert.equal(f.b.db.prepare('SELECT cloud_revision FROM account_sync_state').get().cloud_revision,1);
  assert.notEqual(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
 });
});

test('real production hydration rejects logout and same-owner new SID during actual SDK chunk reads',async t=>{
 for(const kind of ['logout','new-SID'])await t.test(kind,async()=>{
  const f=await fixture();let triggered=false;f.beforeRequest=async url=>{if(triggered||!url.pathname.includes(f.next.digest+'/chunks/'))return;triggered=true;
   if(kind==='logout')await f.accounts.logout();else await f.accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
  };
  await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()));assert.equal(triggered,true);
  assert.equal(f.b.db.prepare('SELECT cloud_revision FROM account_sync_state').get().cloud_revision,1);
  assert.notEqual(f.pets.requirePet(owner,f.petId).resource.resourceId,f.next.manifest.resourceId);
 });
});

test('007 upgrade never guesses or accepts a damaged immutable baseline after independent resource pump',async()=>{
 const f=await fixture();await f.cloudSync.hydrateReferences(owner,f.cloud.envelope.data.modules['character-resources']);
 f.b.db.exec('UPDATE account_sync_baselines SET cloud_document=NULL');const row=f.actions.find(row=>row.action_id==='baseline-fixture');row.envelope=structuredClone(row.envelope);row.envelope.data.modules.settings.data.desktop.volume=99;row.envelope=seal(row.envelope);
 await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),{code:'SYNC_READBACK_MISMATCH'});
 assert.equal(f.b.db.prepare('SELECT cloud_document FROM account_sync_baselines').get().cloud_document,null);assert.equal(f.accounts.settings().document.desktop.volume,10);
});
