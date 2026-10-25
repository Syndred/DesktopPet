const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {pathToFileURL}=require('node:url');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {createServices}=require('../../../core/services.cjs');
const {CompanionsService}=require('../../companions/service.cjs');
const {GardenService}=require('../../garden/service.cjs');
const {createCompanionBackupAdapter}=require('../../companions/backup.cjs');
const {createGardenBackupAdapter}=require('../../garden/backup.cjs');
const {createBattleBackupAdapter}=require('../backup.cjs');
const {BattleFeatureService}=require('../service.cjs');
const {BackupManager}=require('../../accounts/backups.cjs');
const {AccountSync}=require('../../accounts/sync.cjs');
const {checksum}=require('../../accounts/util.cjs');
const {createSession,executeRound,getBattleRules}=require('../../../services/battle-runtime.cjs');

const clone=value=>JSON.parse(JSON.stringify(value));
function completedSession(pet,mode,at){
  const state=createSession(pet.element,'fire'),rounds=[];let winner;
  do{const result=executeRound(state,'normal_attack','normal_attack');rounds.push({...result,state:clone(state)});winner=result.winner;assert.ok(rounds.length<40);}while(!winner);
  const id=mode==='friend'?'online-report-friend':'battle-report-training';
  const player={petId:pet.petId,petName:pet.name,element:pet.element,level:pet.growth.level,appearance2d:pet.resource.resourceId};
  return {id,mode,status:'finished',startedAt:new Date(at).toISOString(),endedAt:new Date(at+1000).toISOString(),updatedAt:new Date(at+1000).toISOString(),player,enemy:{...player,petId:'opponent-'+mode,element:'fire'},snapshot:clone(state),rounds,winner,pendingAction:null,historyComplete:true,rules:getBattleRules(),context:{authority:'supabase',cloudUserId:pet.ownerAccountId},reportId:id,...(mode==='friend'?{room:{id:'report-friend'}}:{})};
}
async function fixture(){
  const directory=mkdtempSync(join(tmpdir(),'lingjing-cloud-report-version-')),db=openDatabase(join(directory,'shared.sqlite')),owner='runtime-cloud-report-fixture';
  for(const [id,file]of [['accounts','schema'],['companions','migrations'],['garden','migrations'],['battle','migrations']]){const module=require(`../../${id}/${file}.cjs`);migrate(db,id,module.migrations||module);}
  const now=new Date().toISOString();db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'reports','reports','战报兼容回归',now,now);
  const companions=new CompanionsService({db}),pet=companions.adopt(owner,{actionId:'original-adoption',templateId:'big-fish-gentle',name:'原始出战伙伴',showOnDesktop:false}).data.pet;
  companions.adopt(owner,{actionId:'other-original-adoption',templateId:'big-fish-gentle',name:'另一位原始伙伴',showOnDesktop:false});
  const garden=new GardenService({db});garden.snapshot({ownerAccountId:owner});
  const companionBackup=createCompanionBackupAdapter(db),gardenBackup=createGardenBackupAdapter(db),battle=createBattleBackupAdapter(db);
  const backups=new BackupManager({db,directory,getIdentity:value=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(value)});
  for(const adapter of[companionBackup,gardenBackup,battle])backups.register(adapter);
  const seal=data=>{const {checksum:discard,...body}=backups.snapshot(owner);void discard;body.data=data;return {...body,checksum:checksum(body)};};
  let envelope=seal(backups.cloudData(backups.snapshot(owner).data,owner));
  const {prepareBattleSettlement}=await import(pathToFileURL(join(__dirname,'../../../../../../infra/supabase/functions/lingjing-battle/settlement.js')).href);
  for(const [index,mode]of ['training','friend'].entries()){
    // Actual shared settlement preparation builds both growth/seed ledgers and
    // the strict cloud v1 fragment. This fixture never calls live Auth/HTTPS.
    const session=completedSession(pet,mode,Date.now()+index*2000),prepared=await prepareBattleSettlement({envelope,owner,session});
    const data=clone(envelope.data);for(const [id,fragment]of Object.entries(prepared.fragments))data.modules[id]=fragment.module;envelope=seal(data);
  }
  backups.validate(envelope,owner);companionBackup.restore(owner,envelope.data.modules.companions.data,'replace');gardenBackup.restore(owner,envelope.data.modules.garden.data,'replace');battle.restoreCloud(owner,envelope.data.modules.battle.data,'replace',db,{kind:'verified-cloud-preview',ownerAccountId:owner,revision:3,checksum:envelope.checksum});
  let head={revision:3,checksum:envelope.checksum,envelope};const requests=[],session={id:owner,ownerAccountId:owner,provider:'runtime',authKind:'supabase',sessionId:'fixture-session',deviceId:'fixture-device',account:'reports'};
  const read=async(name,input)=>{requests.push({name,...input});assert.equal(name,'lingjing-save');assert.equal(input.op,'read');return head;};
  const sync=new AccountSync({db,backups,remote:{enabled:true,authKind:'supabase',cloudSave:async op=>{assert.equal(op,'read');return head;}},getSession:()=>session,getSettings:()=>({document:{sync:{enabled:true}}})});
  sync.acceptAuthoritativeReadback(owner,{envelope,cloudRevision:3});
  const services=createServices({db,legacy:{},paths:{userData:directory}});services.session.setAdapter({getCurrentUser:()=>session});
  services.provide('accounts',{getOwnerAccountId:()=>owner,privateSession:()=>session,sync});services.provide('backups',backups);services.provide('companions',companions);services.provide('cloudActor',{requireActor:async()=>({invoke:read})});
  const service=new BattleFeatureService(services);service.online.invoke=async op=>{assert.ok(['get_active_room','get_active_training'].includes(op));return op==='get_active_room'?{room:null}:{session:null};};
  for(const command of ['overview','listReports','getReport'])services.ipc.handle(`battle:${command}`,(input,context)=>service[command](input,context));
  const snapshot=()=>Object.fromEntries(['companion_pets','companion_actions','garden_items','garden_actions','garden_reward_receipts','garden_ledger','battle_sessions','battle_action_receipts','battle_reward_receipts','battle_transport_journal'].map(table=>[table,db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(owner)]));
  return {db,owner,battle,backups,sync,services,envelope,requests,snapshot,get head(){return head;},set head(value){head=value;},close(){service.dispose();db.close();}};
}

test('real shared SQLite / scripted cloud: local battle v2 reads mixed training/friend cloud v1 through public overview and reports without changing XP, seeds or authority checkpoint',async()=>{
  const f=await fixture();try{
    assert.equal(f.battle.version,2);assert.deepEqual(f.battle.versions,[1]);assert.equal(f.envelope.data.modules.battle.version,1);assert.equal(f.sync.status(f.owner).localChanged,false);
    const before=f.snapshot(),cloudChecksum=f.envelope.checksum;
    assert.equal(before.battle_reward_receipts.length,2);assert.equal(before.garden_reward_receipts.length,2);
    assert.ok(before.companion_pets.some(row=>JSON.parse(row.data_json).growth.experience>0));
    assert.ok(before.garden_reward_receipts.every(row=>JSON.parse(row.result_json).quantity===2));
    f.db.prepare('DELETE FROM battle_reports_v2 WHERE owner_account_id=?').run(f.owner);assert.equal(f.sync.status(f.owner).localChanged,true);
    const overview=await f.services.invoke('battle','overview');assert.equal(overview.ok,true);assert.equal(overview.data.session,null);assert.equal(overview.data.reports.length,2);assert.deepEqual(overview.data.reports.map(report=>report.mode).sort(),['friend','training']);
    for(const row of f.envelope.data.modules.battle.data.reports){const report=await f.services.invoke('battle','getReport',{reportId:row.id});assert.equal(report.ok,true);assert.deepEqual(report.data,JSON.parse(row.data_json));}
    const reports=await f.services.invoke('battle','listReports');assert.equal(reports.ok,true);assert.equal(reports.data.length,2);
    assert.deepEqual(f.snapshot(),before);assert.equal(f.sync.status(f.owner).localChanged,false);assert.equal(f.sync.status(f.owner).cloudRevision,3);assert.equal(f.envelope.checksum,cloudChecksum);
    assert.deepEqual(f.db.prepare('SELECT id,session_id,data_json,ended_at FROM battle_reports_v2 WHERE owner_account_id=? ORDER BY id').all(f.owner),f.envelope.data.modules.battle.data.reports.toSorted((a,b)=>a.id.localeCompare(b.id)));
    assert.equal(f.requests.length,2);assert.ok(f.requests.every(request=>request.op==='read'));
  }finally{f.close();}
});

test('real shared SQLite / scripted cloud: unknown versions, local-v2 envelopes and v1 journal forgeries fail before changing report cache or economy',async()=>{
  const f=await fixture();try{
    const before=f.snapshot(),cache=f.db.prepare('SELECT * FROM battle_reports_v2').all(),valid=f.head;
    for(const kind of ['unknown-version','valid-local-v2','forged-v2-without-journal','forged-v1-with-journal']){
      const envelope=clone(valid.envelope),module=envelope.data.modules.battle;
      if(kind==='unknown-version')module.version=99;
      if(kind==='valid-local-v2'){module.version=2;module.data.transportJournal=[];f.battle.validateModule(module,f.owner);}
      if(kind==='forged-v2-without-journal')module.version=2;
      if(kind==='forged-v1-with-journal')module.data.transportJournal=[];
      const {checksum:discard,...body}=envelope;void discard;envelope.checksum=checksum(body);f.head={...valid,envelope,checksum:envelope.checksum};
      const result=await f.services.invoke('battle','overview');assert.equal(result.ok,false,kind);assert.ok(['INVALID_BATTLE_BACKUP','BACKUP_MODULE_UNSUPPORTED'].includes(result.code),`${kind}: ${result.code}`);
      assert.deepEqual(f.snapshot(),before,kind);assert.deepEqual(f.db.prepare('SELECT * FROM battle_reports_v2').all(),cache,kind);
    }
    f.head=valid;assert.equal(f.sync.status(f.owner).localChanged,false);assert.equal(f.sync.status(f.owner).cloudRevision,3);
  }finally{f.close();}
});
