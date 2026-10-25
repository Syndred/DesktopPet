// Deployed HTTPS server acceptance through real production Electron/main Auth.
// Position is explicitly synthetic and requires coordinator-only scenario grants.
// No fake Auth, HTTP, NPC, victory, pet registration, inventory or SQL writes.
import {_electron as electron} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('.'),output=resolve(`artifacts/cloud-discovery/live-game-${Date.now()}`),scenarioId='cloud-discovery-03';
const resume=process.env.LINGJING_CLOUD_GAME_RESUME?resolve(process.env.LINGJING_CLOUD_GAME_RESUME):null,profileBase=resume||output;
const previous=resume?JSON.parse(readFileSync(process.env.LINGJING_CLOUD_GAME_CHECKPOINT||join(resume,'evidence.json'),'utf8')):null;
mkdirSync(output,{recursive:true});
const publicConfig=resolve(process.env.LINGJING_PUBLIC_CONFIG||'config/lingjing-cloud-public.json');
const proof={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
  build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),projectRef:'jbvrdmrkwpznbrvteive',scenarioId,
  productionMain:true,registryObserver:true,syntheticPosition:true,physicalPositionAcceptance:false,physicalSecondDevice:false,
  realAuth:true,realHttps:true,rawCoordinatesSaved:false,tokensOrPasswordsSaved:false,actors:[],checks:[],attempts:[],errors:[]};
if(resume){proof.resumeFrom=resume;proof.previousAcceptance=previous?.capture?{sourceCommit:previous.sourceCommit,checks:previous.checks,capture:previous.capture,error:previous.error}:null;}
const apps=[],bootstrap=join(output,'production-observer.cjs');let account=`cg03_${Date.now()}`,password=`CloudGame-${randomUUID()}!`;
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2)+'\n');
const phase=(name,details={})=>{writeFileSync(join(output,'progress.json'),JSON.stringify({phase:name,at:new Date().toISOString(),...details},null,2)+'\n');console.log(JSON.stringify({phase:name,...details}));};
writeFileSync(bootstrap,`const requireProbe=require,core=require(${JSON.stringify(join(root,'apps/pc-app/runtime/core/services.cjs'))}),create=core.createServices;
let registry;
core.createServices=(...args)=>{registry=create(...args);return registry;};
global.__cloudGameProbe=async({op,...args})=>{
 await new Promise(setImmediate);const s=registry;await s.get('accounts').ready;
 if(op==='actor'){const c=await s.get('cloudActor').requireActor();return{actor:c.actor,electron:process.versions.electron,qaProfile:Boolean(s.get('qaScenario'))};}
 if(op==='invoke')return s.get('cloudActor').invoke(args.name,args.body);
 if(op==='prove'){
  const c=await s.get('cloudActor').requireActor(),{CloudLocationProofs}=requireProbe(${JSON.stringify(join(root,'apps/pc-app/runtime/features/discovery/cloud-location.cjs'))});
  const signer=new CloudLocationProofs({authority:{getActor:async()=>c.actor,invoke:(op,input)=>c.invoke('discovery',{...input,op})},
    getFix:()=>({...args.fix,timestampMs:Date.now()}),safeStorage:s.safeStorage,userData:s.paths.userData});
  return signer.prove(args.purpose,args.reference||'');
 }
 if(op==='keepCredentials')return s.safeStorage.encryptString(JSON.stringify(args.credentials)).toString('base64');
 if(op==='openCredentials')return JSON.parse(s.safeStorage.decryptString(requireProbe('node:fs').readFileSync(args.path)));
 if(op==='inspectSqlite'){
  const c=await s.get('cloudActor').requireActor(),owner=c.ownerAccountId;
  return{owner,pets:s.db.prepare('select pet_id from companion_pets where owner_account_id=? order by pet_id').all(owner),captures:s.db.prepare('select pet_id,data_json from discovery_captures where owner_account_id=?').all(owner).map(row=>({petId:row.pet_id,battleId:JSON.parse(row.data_json).battleId})),memories:s.db.prepare('select pet_id,count(*) count from discovery_memory_tags where owner_account_id=? group by pet_id').all(owner)};
 }
 if(op==='readbackThroughProduct'){
  let restored;
  for(let attempt=0;attempt<3;attempt++){
   const preview=await s.invoke('accounts','cloudPreview');if(!preview.ok)throw Object.assign(new Error(preview.message),{code:preview.code});
   restored=await s.invoke('accounts','backupRestore',{previewId:preview.data.previewId,actionId:requireProbe('node:crypto').randomUUID(),mode:'replace'});
   if(restored.ok)break;if(restored.code!=='SAVE_CHANGED'||attempt===2)throw Object.assign(new Error(restored.message),{code:restored.code});
  }
  return{...await global.__cloudGameProbe({op:'inspectSqlite'}),restore:{restored:restored.data.restored,mode:restored.data.mode,preservedBeforeRestore:Boolean(restored.data.preservedBackup)},localRestoreScope:'Actual accounts cloudPreview/backupRestore IPC and registered adapters/resource hydration; before-restore archive preserved'};
 }
 if(op==='readbackToFreshSqlite'){
  const c=await s.get('cloudActor').requireActor(),head=await c.invoke('lingjing-save',{op:'read'}),owner=c.ownerAccountId,unit=head.envelope.data.modules.companions;
  const api=s.get('companions').backupAdapter;api.validate(unit.data,owner);
  const before=api.export(owner),pristine=before.identityImports.length===0&&Object.entries(before.tables).every(([name,rows])=>name==='companion_accounts'||rows.length===0)&&before.tables.companion_accounts.every(row=>Object.values(JSON.parse(row.selections_json)).every(id=>id===null));
  if(pristine)requireProbe('node:fs').writeFileSync(requireProbe('node:path').join(s.paths.userData,'before-cloud-readback-'+Date.now()+'.json'),JSON.stringify(before,null,2),{flag:'wx'});
  const tables=head.envelope.data.tables,db=s.db;
  db.transaction(()=>{api.restore(owner,unit.data,pristine?'replace':'merge');for(const name of ['discovery_encounters','discovery_actions','discovery_captures','discovery_memory_tags']){
   const record=tables[name];if(!record)throw Error('Missing discovery projection');
   const columns=db.prepare('PRAGMA table_info('+name+')').all().map(({name,type,notnull,pk,dflt_value})=>({name,type,notnull,pk,dflt_value}));
   if(JSON.stringify(columns)!==JSON.stringify(record.schema))throw Error('Projection schema mismatch');
   const names=columns.map(c=>c.name),insert=db.prepare('INSERT OR IGNORE INTO '+name+'('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+')');
   for(const row of record.rows){if(row.owner_account_id!==owner)throw Error('Foreign projection');insert.run(...names.map(k=>row[k]));}
  }})();
  return{owner,revision:head.revision,pets:db.prepare('select pet_id,template_id,revision,data_json from companion_pets where owner_account_id=? order by pet_id').all(owner).map(r=>{const p=JSON.parse(r.data_json);return{petId:r.pet_id,resourceId:p.resource.resourceId,experience:p.growth.experience,originBattleId:p.origin.battleId};}),
    captures:db.prepare('select pet_id,data_json from discovery_captures where owner_account_id=?').all(owner).map(r=>({petId:r.pet_id,battleId:JSON.parse(r.data_json).battleId,validation:JSON.parse(r.data_json).validation})),
    memories:db.prepare('select pet_id,count(*) count from discovery_memory_tags where owner_account_id=? group by pet_id').all(owner),
    localRestoreScope:'Dedicated empty-profile test harness calls actual02 backup adapter and imports actual03 generic projection. Production automatic restore/UI integration is separate.'};
 }
 throw Error('Unknown probe operation');
};
requireProbe(${JSON.stringify(join(root,'apps/pc-app/dist/main/index.cjs'))});\n`);
async function main(client,op,args={}){const reply=await client.app.evaluate(async(_electron,input)=>{try{return{ok:true,data:await global.__cloudGameProbe(input)};}catch(e){return{ok:false,code:e.code||'PROBE_FAILED',message:e.message};}},{op,...args});if(!reply.ok)throw Object.assign(new Error(reply.code+': '+reply.message),{code:reply.code});return reply.data;}
const invoke=(client,name,body)=>main(client,'invoke',{name,body});
async function launch(label,register=false){
 const env={...process.env,PET_USER_DATA_DIR:join(profileBase,label),LINGJING_PUBLIC_CONFIG:publicConfig};
 for(const key of['ELECTRON_RUN_AS_NODE','PET_RUNTIME_DATA_FILE','LINGJING_QA_SCENARIO','LINGJING_CONTROLLED_LOCATION','LINGJING_BATTLE_QA','LINGJING_LEGACY_AUTH'])delete env[key];
 const app=await electron.launch({args:[bootstrap],cwd:root,env});apps.push(app);const page=await app.firstWindow();page.on('pageerror',e=>proof.errors.push(e.message));await page.waitForFunction(()=>Boolean(window.lingjing));
 const client={app,page,label};
 if(resume&&label==='device-a'){const saved=await main(client,'openCredentials',{path:join(resume,'credentials.secure')});account=saved.account;password=saved.password;}
 const existing=await page.evaluate(()=>window.lingjing.invoke('accounts','session'));
 if(!existing.data?.currentUser){
  const result=await page.evaluate(input=>window.lingjing.invoke('accounts',input.register?'register':'login',{provider:'runtime',account:input.account,password:input.password,confirmPassword:input.password,username:'探索云端验收',rememberSession:true}),{register:register&&!resume,account,password});assert.equal(result.ok,true,JSON.stringify(result));
 }
 const identity=await main(client,'actor');assert.equal(identity.actor.account,account);assert.equal(identity.electron,'44.9.3');assert.equal(identity.qaProfile,false);client.actor=identity.actor;proof.actors.push({label,...identity});return client;
}
const fixAt=position=>({...position,accuracyMeters:5,coordinateSystem:'wgs84',source:'simulated',provider:'qa-discovery',scenarioId});
async function prove(client,purpose,reference,position){return main(client,'prove',{purpose,reference,fix:fixAt(position)});}
async function waitForGrant(client){const deadline=Date.now()+15*60*1000;while(Date.now()<deadline){try{await prove(client,'discover','',{lat:31.2,lng:121.4});return;}catch(e){if(!/REAL_LOCATION_REQUIRED/.test(e.message))throw e;}await new Promise(done=>setTimeout(done,10000));}throw Error('Coordinator-only QA grant not available within bounded wait');}
async function rejected(client,body,codes,label){try{await invoke(client,'discovery',body);assert.fail(label+' accepted');}catch(e){assert.ok(codes.some(code=>e.message.includes(code)),label+': '+e.message);proof.checks.push({label,rejected:true});}}
try{
 const a=await launch('device-a',true),b=await launch('device-b');assert.equal(a.actor.ownerAccountId,b.actor.ownerAccountId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);assert.notEqual(a.actor.sessionId,b.actor.sessionId);
 writeFileSync(join(output,'credentials.secure'),Buffer.from(await main(a,'keepCredentials',{credentials:{account,password}}),'base64'));proof.tokensOrPasswordsSaved='Only Windows safeStorage encrypted test credentials in ignored artifacts; no plaintext or tokens in evidence';
 let pet;
 if(previous?.originalPetId){const restored=await invoke(a,'companions-sync',{op:'snapshot'});pet=JSON.parse(restored.module.data.tables.companion_pets.find(row=>row.pet_id===previous.originalPetId).data_json);}
 else{const adopted=await invoke(a,'companions-sync',{op:'command',command:'adopt',input:{actionId:'cloud-game-adopt-'+randomUUID(),templateId:'big-fish-gentle',name:'规范云端出战伙伴',showOnDesktop:false}});pet=adopted.result.data.pet;}
 const garden=await invoke(a,'garden-sync',{op:'snapshot'});assert.ok(garden.envelope.data.modules.garden);proof.originalPetId=pet.petId;
 const targets=proof.actors.map(({label,actor})=>({label,authUserId:actor.authUserId,ownerAccountId:actor.ownerAccountId,deviceId:actor.deviceId,scenarioId}));
 writeFileSync(join(output,'grant-request.json'),JSON.stringify({testOnly:true,scenarioId,ttl:'up to2hours',targets},null,2)+'\n');save();phase('awaiting-coordinator-qa-grants',{output,targets});
 await waitForGrant(a);await waitForGrant(b);phase('grants-verified');
 const deploymentDeadline=Date.now()+5*60*1000;while(!(await invoke(a,'discovery',{op:'protocol'})).wildAuthority){if(Date.now()>=deploymentDeadline)throw Error('Wild authority checkpoint not deployed');phase('awaiting-wild-authority-deployment');await new Promise(done=>setTimeout(done,10000));}
 const existingPermits=resume?await invoke(a,'discovery',{op:'permits'}):[],pending=existingPermits.find(p=>p.id===previous?.capture?.permitId)||existingPermits.find(p=>p.petId===pet.petId&&['active','won'].includes(p.status));
 const discovery=await prove(a,'discover','',{lat:31.2,lng:121.4}),nearby=await invoke(a,'discovery',{op:'nearby',proofId:discovery.id});const spawn=pending?.spawn||nearby.spawns.find(p=>p.element==='fire');assert.ok(spawn);proof.fixtureCoordinateHash=createHash('sha256').update(spawn.position.lat+','+spawn.position.lng).digest('hex');
 let won,permit;
 for(let attempt=0;attempt<3;attempt++){
  if(attempt===0&&pending)permit={id:pending.id,sessionId:pending.sessionId,expiresAt:pending.expiresAt};
  else{const beginProof=await prove(a,'begin',spawn.id,spawn.position),input={op:'reserve',spawnId:spawn.id,petId:pet.petId,proofId:beginProof.id,actionId:'cloud-reserve-'+randomUUID()};permit=await invoke(a,'discovery',input);assert.deepEqual(await invoke(b,'discovery',input),permit);}
  let session=await invoke(b,'discovery',{op:'session',permitId:permit.id});
  if(session.status==='finished'){won=session;proof.attempts.push({permitId:permit.id,battleId:session.id,winner:session.winner,rounds:session.snapshot.round,reward:session.reward});break;}
  await rejected(b,{op:'confirm',permitId:permit.id,proofId:randomUUID(),name:'还不能收服',actionId:'early-'+randomUUID()},['VICTORY_REQUIRED'],'early capture refused');
  const first={op:'act',permitId:permit.id,action:'normal_attack',expectedRound:session.snapshot.round+1,actionId:'cloud-same-action-'+randomUUID()};
  const replay=await Promise.all([invoke(a,'discovery',first),invoke(b,'discovery',first)]);assert.deepEqual(replay[0],replay[1]);session=replay[0];proof.checks.push({label:'same-owner concurrent same action returns one identical committed round',passed:true});
  if(session.status==='active'){
   const round=session.snapshot.round+1,collision=await Promise.allSettled([invoke(a,'discovery',{op:'act',permitId:permit.id,action:'normal_attack',expectedRound:round,actionId:'cloud-race-a-'+randomUUID()}),invoke(b,'discovery',{op:'act',permitId:permit.id,action:'dodge',expectedRound:round,actionId:'cloud-race-b-'+randomUUID()})]);
   assert.equal(collision.filter(x=>x.status==='fulfilled').length,1);assert.ok(collision.find(x=>x.status==='rejected'));session=await invoke(b,'discovery',{op:'session',permitId:permit.id});assert.equal(session.snapshot.round,round);proof.checks.push({label:'different same-round actions commit only one transition',passed:true});
  }
  for(let turns=0;turns<80&&session.status==='active';turns++){
   phase('wild-round',{attempt:attempt+1,round:session.snapshot.round+1,permitId:permit.id});
   session=await invoke(b,'discovery',{op:'act',permitId:permit.id,action:session.snapshot.player.anger>=session.rules.ultimateAnger?'ultimate':'normal_attack',expectedRound:session.snapshot.round+1,actionId:'cloud-turn-'+randomUUID()});
  }
  assert.equal(session.status,'finished');assert.equal(session.reward.applied,true);proof.attempts.push({permitId:permit.id,battleId:session.id,winner:session.winner,rounds:session.snapshot.round,reward:session.reward});save();
  if(session.winner==='player'){won=session;break;}
 }
 assert.ok(won,'No capture without a natural authoritative victory within bounded attempts');
 const captureProof=await prove(b,'capture',permit.id,spawn.position),confirmation={op:'confirm',permitId:permit.id,proofId:captureProof.id,name:'跨端同一新伙伴',actionId:'cloud-capture-'+randomUUID()};
 const confirmed=await Promise.all([invoke(b,'discovery',confirmation),invoke(b,'discovery',confirmation)]);assert.equal(confirmed[0].petId,confirmed[1].petId);const capture=confirmed[0];assert.equal(capture.petId,'pet-'+permit.id);assert.equal(capture.validation,'simulated');assert.equal(capture.scenarioId,scenarioId);
 const duplicate=await invoke(a,'discovery',{...confirmation,name:'重复确认不能改名',proofId:randomUUID(),actionId:'cloud-duplicate-'+randomUUID()});assert.equal(duplicate.petId,capture.petId);assert.equal(duplicate.name,capture.name);
 const readB=await invoke(b,'discovery',{op:'captures'});assert.equal(readB.filter(p=>p.permitId===permit.id).length,1);proof.capture={petId:capture.petId,battleId:capture.battleId,permitId:permit.id,validation:capture.validation,scenarioId:capture.scenarioId,resourceId:capture.resourceId,templateId:capture.templateId};
 const deviceC=await launch('fresh-device-c');assert.equal(deviceC.actor.ownerAccountId,a.actor.ownerAccountId);assert.notEqual(deviceC.actor.deviceId,a.actor.deviceId);const cRead=await invoke(deviceC,'discovery',{op:'captures'});assert.equal(cRead.find(p=>p.permitId===permit.id).petId,capture.petId);
 const local=await main(deviceC,'readbackThroughProduct');assert.equal(local.captures.find(p=>p.petId===capture.petId).battleId,won.id);assert.equal(local.memories.find(p=>p.pet_id===capture.petId).count,1);assert.ok(local.pets.some(p=>p.pet_id===capture.petId));assert.equal(local.restore.preservedBeforeRestore,true);proof.newDeviceSqlite=local;
 await deviceC.app.close();const reopened=await launch('fresh-device-c');const reopenedCloud=await invoke(reopened,'discovery',{op:'captures'});assert.equal(reopenedCloud.find(p=>p.permitId===permit.id).petId,capture.petId);proof.restartCloudReadback=true;proof.restartSqlite=await main(reopened,'inspectSqlite');assert.equal(proof.restartSqlite.captures.length,1);assert.equal(proof.restartSqlite.captures[0].petId,capture.petId);assert.equal(proof.restartSqlite.memories.find(p=>p.pet_id===capture.petId).count,1);
 const head=await invoke(b,'lingjing-save',{op:'read'}),tables=head.envelope.data.modules.companions.data.tables,stored=JSON.parse(tables.companion_pets.find(p=>p.pet_id===pet.petId).data_json);assert.equal(stored.growth.experience,proof.attempts.reduce((n,p)=>n+p.reward.experience,0));
 assert.equal(tables.companion_pets.length,2);assert.equal(tables.companion_capture_receipts.length,1);assert.equal(head.envelope.data.modules.garden.data.tables.garden_reward_receipts.filter(p=>p.source==='battle').length,proof.attempts.length);
 proof.checks.push({label:'capture/companion/memory/reward uniqueness, new device and restart retain server petId',passed:true});assert.deepEqual(proof.errors,[]);proof.passed=true;proof.productAutomaticRestoreOrBattleScreenVerified=false;phase('passed',{capture:proof.capture,output});
}catch(error){proof.passed=false;proof.error=error.message;phase('failed',{message:error.message,output});throw error;}
finally{for(const app of apps.reverse())await app.close().catch(()=>{});save();writeFileSync(resolve('artifacts/cloud-discovery/latest-live-game.json'),JSON.stringify({...proof,output},null,2)+'\n');}
