const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const Database=require('better-sqlite3');
const {ResourcesService}=require('../service.cjs');
const {migrations}=require('../repository.cjs');
const {ResourceCloudSync}=require('../cloud-sync.cjs');
const {hash,canonical,validateManifest,BUCKET}=require('../cloud-contract.cjs');
const {packageHash,buildPackage}=require('../cloud-packages.cjs');
const {storageFixture}=require('./storage-http-fixture.cjs');
const ROOT=path.resolve(__dirname,'../../../../../..');
const OWNER='runtime:preserved-old-subject';
const UID='11111111-1111-4111-8111-111111111111';
const OTHER='22222222-2222-4222-8222-222222222222';
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(ROOT,'artifacts/resources/cloud-'));
  const http=await storageFixture(),clients=[];
  t.after(async()=>{for(const c of clients)if(c.db.open)c.db.close();await http.close();});
  async function local(name,uid=UID,owner=OWNER){
    const root=path.join(directory,name);await fs.mkdir(root,{recursive:true});
    const db=new Database(path.join(root,'lingjing.sqlite'));for(const m of migrations)db.exec(m.sql);
    const service=new ResourcesService({db,storageRoot:path.join(root,'managed'),seedBuiltin:false});await service.seed();
    const actor={schemaVersion:1,authority:'simulated',authKind:'fixture',ownerAccountId:owner,authUserId:uid,deviceId:randomUUID(),sessionId:randomUUID()};
    const client=http.client(uid,actor.deviceId);actor.client=client;
    const local={root,db,service,actor,cloud:new ResourceCloudSync({service,getActor:async()=>actor,protocolFixture:true})};clients.push(local);return local;
  }
  const source=path.join(directory,'original');await fs.mkdir(source);
  for(const file of ['character.json','sprites.png'])await fs.copyFile(path.join(ROOT,'apps/pc-app/runtime/features/resources/assets/roster-v2/qingya',file),path.join(source,file));
  async function reopen(original){original.db.close();const db=new Database(path.join(original.root,'lingjing.sqlite'));const service=new ResourcesService({db,storageRoot:path.join(original.root,'managed'),seedBuiltin:false});await service.seed();const reopened={...original,db,service};reopened.cloud=new ResourceCloudSync({service,getActor:async()=>reopened.actor,protocolFixture:true});clients.push(reopened);return reopened;}
  return {directory,http,local,reopen,source};
}
test('actual official SDK protocol: A upload, distinct-client B hydrate preserves IDs/history and independent same-content imports',async t=>{
  const f=await fixture(t),a=await f.local('a'),b=await f.local('b');
  const imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  const localImport=await b.service.importFile(OWNER,path.join(f.source,'character.json'));
  const id=imported.resource.id;assert.notEqual(id,localImport.resource.id);
  await b.service.save(OWNER,{resourceId:localImport.resource.id,expectedRevision:0,calibration:{desktop:{scale:1.3},battle:{}},actions:localImport.resource.actions});
  a.cloud.enqueue(OWNER,randomUUID(),[id]);const upload=await a.cloud.flush(OWNER);assert.equal(upload.verified.length,1);assert.equal(upload.errors.length,0);
  const restored=await b.cloud.pull(OWNER);assert.equal(restored.restored[0].resourceId,id);
  const resource=await b.service.get(OWNER,id);assert.equal(resource.contentHash,imported.resource.contentHash);assert.equal(resource.availability,'ready');
  assert.equal((await b.service.get(OWNER,localImport.resource.id)).calibration.desktop.scale,1.3);
  assert.equal(b.db.prepare('select count(*) n from lingjing_resources').get().n,2);
  assert.equal(b.db.prepare('select count(*) n from lingjing_resource_imports where resource_id=?').get(id).n,1);
  await b.cloud.pull(OWNER);assert.equal(b.db.prepare('select count(*) n from lingjing_resource_imports').get().n,2);
  const originalPng=await fs.readFile(path.join(f.source,'sprites.png')),receivedPng=await fs.readFile(await b.service.assetFile(OWNER,id,'sprites.png'));assert.equal(hash(originalPng),hash(receivedPng));
  assert.equal(new ResourceCloudSync({service:a.service,getActor:()=>a.actor}).status(OWNER).lastVerifiedAt,null,'A fixture verification must never become a production cloud receipt');
  // Explicit local HTTP fixture denial, not a claim that deployed Supabase RLS was tested.
  const c=await f.local('other',OTHER,'runtime:other');assert.equal((await c.cloud.pull('runtime:other')).restored.length,0);
  const denied=await c.actor.client.storage.from(BUCKET).download(f.http.state.rows[0].manifest_path);assert(denied.error);
});
test('production adapter rejects a simulated actor/HTTP client before any transfer',async t=>{
  const f=await fixture(t),a=await f.local('a'),imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  const production=new ResourceCloudSync({service:a.service,getActor:async()=>a.actor});production.enqueue(OWNER,randomUUID(),[imported.resource.id]);
  const result=await production.flush(OWNER);assert.equal(result.verified.length,0);assert.equal(result.errors[0].code,'RESOURCE_CLOUD_AUTH_REQUIRED');assert.equal(f.http.state.requests.length,0);assert.equal(a.cloud.status(OWNER).dataMode,'simulated');
});
test('verified old owner aliases keep their original owner text in the immutable package without rewriting local history',async t=>{
  const f=await fixture(t),a=await f.local('a'),imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.db.exec('create table account_aliases(provider text,subject_id text,owner_account_id text)');a.db.prepare('insert into account_aliases values(?,?,?)').run('runtime','legacy-original-subject',OWNER);
  a.db.prepare('update lingjing_resources set owner_account_id=? where resource_id=?').run('legacy-original-subject',imported.resource.id);
  a.db.prepare('update lingjing_resource_imports set owner_account_id=? where resource_id=?').run('legacy-original-subject',imported.resource.id);
  const packet=await buildPackage(a.service,OWNER,UID,imported.resource.id);
  assert.equal(packet.manifest.sourceOwnerAccountId,'legacy-original-subject');assert.equal(packet.manifest.imports[0].source_owner_account_id,'legacy-original-subject');assert.equal(packet.manifest.ownerAccountId,OWNER);
  assert.equal(a.db.prepare('select owner_account_id from lingjing_resources where resource_id=?').get(imported.resource.id).owner_account_id,'legacy-original-subject');
});
test('lost upload receipt survives reopen and resumes immutable chunks with independent readback',async t=>{
  const f=await fixture(t),a=await f.local('a'),imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.cloud.enqueue(OWNER,randomUUID(),[imported.resource.id]);f.http.state.failAfterWrite=true;
  const interrupted=await a.cloud.flush(OWNER);assert.equal(interrupted.verified.length,0);assert.equal(interrupted.pending,1);
  const frozen=a.db.prepare('select manifest_sha256,status from lingjing_resource_cloud_outbox').get();assert.equal(frozen.status,'retry');assert(frozen.manifest_sha256);
  const restarted=await f.reopen(a);const retry=await restarted.cloud.flush(OWNER,{force:true});
  assert.equal(retry.verified.length,1);assert.equal(retry.verified[0].manifestSha256,frozen.manifest_sha256);assert.equal(f.http.state.rows.length,1);
  assert.equal(restarted.db.prepare('select status from lingjing_resource_cloud_outbox').get().status,'verified');
});
test('offline intent is durable before Auth and session switch never applies a downloaded package',async t=>{
  const f=await fixture(t),a=await f.local('a'),b=await f.local('b');const imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.cloud.enqueue(OWNER,randomUUID(),[imported.resource.id]);f.http.state.offline=true;
  assert.equal((await a.cloud.flush(OWNER)).verified.length,0);assert.equal(a.cloud.status(OWNER).lastVerifiedAt,null);f.http.state.offline=false;await a.cloud.flush(OWNER,{force:true});
  const cloud=new ResourceCloudSync({service:b.service,protocolFixture:true,getActor:async()=>{if(f.http.state.requests.some(r=>r.method==='GET'&&r.path.includes('/chunks/')))return {...b.actor,ownerAccountId:'runtime:switched'};return b.actor;}});
  await assert.rejects(()=>cloud.pull(OWNER));assert.equal(b.db.prepare('select count(*) n from lingjing_resources').get().n,0);
});
test('tampered manifest/size/path and credential-bearing descriptors fail before publication',async t=>{
  const f=await fixture(t),a=await f.local('a');const imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  const pack=await buildPackage(a.service,OWNER,UID,imported.resource.id);
  for(const mutate of [m=>m.files[0].key='../escaped.json',m=>m.files[0].size++,m=>m.authUserId=OTHER,m=>m.document.provenance.apiKey='do-not-upload']){
    const bad=structuredClone(pack.manifest);mutate(bad);assert.throws(()=>validateManifest(bad,{owner:OWNER,uid:UID}));
  }
  const descriptor=JSON.parse(await fs.readFile(path.join(f.source,'character.json'),'utf8'));descriptor.character.apiKey='fixture-credential';
  await fs.writeFile(path.join(f.source,'character.json'),JSON.stringify(descriptor));const secret=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.cloud.enqueue(OWNER,randomUUID(),[secret.resource.id]);const result=await a.cloud.flush(OWNER);assert.equal(result.errors[0].code,'RESOURCE_CONTAINS_CREDENTIALS');assert.equal(f.http.state.objects.size,0);
});
test('historical GLB archive is readable/restorable but never appears in 2D list or import',async t=>{
  const f=await fixture(t),a=await f.local('a'),b=await f.local('b'),id=randomUUID(),directory=path.join(a.service.storageRoot,id);await fs.mkdir(directory);
  const binary=Buffer.alloc(5*1024*1024,7),raw=JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:binary.length}],images:[]}),json=Buffer.from(raw.padEnd(Math.ceil(raw.length/4)*4,' ')),bytes=Buffer.alloc(28+json.length+binary.length);bytes.write('glTF');bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(binary.length,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);binary.copy(bytes,28+json.length);
  const filename=path.join(directory,'old.glb');await fs.writeFile(filename,bytes);const contentHash=await packageHash(new Map([['old.glb',filename]]));
  const document={id,name:'旧角色档案',kind:'model3d',origin:'import',contentHash,entryAsset:'old.glb',importedAt:new Date().toISOString(),provenance:{source:'legacy fixture',license:'owned'}};
  a.service.repository.insert(OWNER,document,[['old.glb',filename]]);
  assert.equal(a.service.listArchived(OWNER)[0].id,id);assert.equal((await a.service.list(OWNER)).length,0);await assert.rejects(()=>a.service.importFile(OWNER,filename),{code:'TWO_D_ONLY'});
  a.cloud.enqueue(OWNER,randomUUID(),[id]);assert.equal((await a.cloud.flush(OWNER)).verified.length,1);await b.cloud.pull(OWNER);
  assert.equal(b.service.listArchived(OWNER)[0].id,id);assert.equal((await b.service.list(OWNER)).length,0);assert.equal(await fs.readFile(filename,'hex'),bytes.toString('hex'));
});
test('interrupted new-client download resumes verified disk chunks after reopening SQLite',async t=>{
  const f=await fixture(t),a=await f.local('a'),b=await f.local('b'),imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.cloud.enqueue(OWNER,randomUUID(),[imported.resource.id]);await a.cloud.flush(OWNER);
  const job=a.db.prepare('select manifest_json from lingjing_resource_cloud_outbox').get(),manifest=JSON.parse(job.manifest_json),png=manifest.files.find(file=>file.key==='sprites.png'),descriptor=manifest.files.find(file=>file.key==='character.json');
  f.http.state.failDownloadKey=png.sha256;await assert.rejects(()=>b.cloud.pull(OWNER));
  assert.equal(b.db.prepare('select count(*) n from lingjing_resources').get().n,0);
  const descriptorReads=f.http.state.requests.filter(r=>r.method==='GET'&&r.path.includes('/chunks/'+descriptor.sha256)).length;
  const reopened=await f.reopen(b);f.http.state.failDownloadKey=null;assert.equal((await reopened.cloud.pull(OWNER)).restored[0].verified,true);
  assert.equal(f.http.state.requests.filter(r=>r.method==='GET'&&r.path.includes('/chunks/'+descriptor.sha256)).length,descriptorReads);
});
test('corrupt downloaded bytes are never registered and preserve an existing missing local reference',async t=>{
  const f=await fixture(t),a=await f.local('a'),b=await f.local('b'),imported=await a.service.importFile(OWNER,path.join(f.source,'character.json'));
  a.cloud.enqueue(OWNER,randomUUID(),[imported.resource.id]);await a.cloud.flush(OWNER);f.http.state.corruptDownloadKey='/chunks/';
  await assert.rejects(()=>b.cloud.pull(OWNER),{code:'RESOURCE_CLOUD_HASH_MISMATCH'});assert.equal(b.db.prepare('select count(*) n from lingjing_resources').get().n,0);
  assert.equal(b.db.prepare('select status from lingjing_resource_cloud_downloads').get().status,'retry');f.http.state.corruptDownloadKey=null;assert.equal((await b.cloud.pull(OWNER)).restored.length,1);
});
