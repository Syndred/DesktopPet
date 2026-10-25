// Directed reproduction using copies of the designated failed SFX profiles.
// Originals are only read/hashed. No Auth, provider, cloud write or UI is used.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const Database=require('better-sqlite3');
const {createBattleBackupAdapter}=require('../backup.cjs'),{BattleStore}=require('../store.cjs');
const {checksum}=require('../../accounts/util.cjs');
const source=fs.realpathSync(process.argv[2]);
const originalEvidence=JSON.parse(fs.readFileSync(path.join(source,'evidence.json'),'utf8'));
assert.equal(originalEvidence.sourceCommit,'2e13487f73396ebad981ff703b4377f403e214e0');assert.equal(originalEvidence.actualPortable,true);assert.equal(originalEvidence.passed,false);
const output=path.resolve('artifacts/battle',`journal-upgrade-${Date.now()}`);fs.mkdirSync(output,{recursive:true});
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const md5=text=>createHash('md5').update(text).digest('hex');
const files=Object.fromEntries(['A','B'].map(name=>[name,path.join(source,name,'lingjing.sqlite')])),before=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,hash(file)]));
const originalB=new Database(files.B,{readonly:true,fileMustExist:true});originalB.pragma('query_only=ON');
const baseline=originalB.prepare('SELECT cloud_revision,cloud_document FROM account_sync_baselines').get(),cloud=JSON.parse(baseline.cloud_document),expected=cloud.data.modules.battle,owner=cloud.ownerAccountId;assert.equal(baseline.cloud_revision,68);assert.equal(expected.version,1);assert.equal(expected.data.actions.length,0);originalB.close();
const results=[];
for(const name of ['A','B']){
  const wal=files[name]+'-wal';assert.ok(!fs.existsSync(wal)||fs.statSync(wal).size===0,'Copy only the closed original profiles; never discard a live WAL');
  const target=path.join(output,name+'.sqlite');fs.copyFileSync(files[name],target);const db=openDatabase(target);
  try{
    const rows=db.prepare('SELECT action_id,session_id,command_json,result_json FROM battle_action_receipts WHERE owner_account_id=?').all(owner),rawBefore=checksum(rows);
    const gameBefore=Object.fromEntries(['battle_sessions','battle_reports_v2','battle_reward_receipts'].map(table=>[table,db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(owner)]));
    migrate(db,'battle',require('../migrations.cjs'));const adapter=createBattleBackupAdapter(db),store=new BattleStore(db),local=adapter.export(owner),projection=adapter.cloudModule(owner,{version:2,data:local});
    assert.equal(checksum(projection),checksum(expected));assert.equal(local.actions.length,name==='A'?21:0);assert.equal(local.transportJournal.length,name==='A'?21:0);assert.equal(checksum(local.actions),rawBefore);
    if(name==='A'){
      const last=rows.find(row=>JSON.parse(row.command_json).roundNo===20),session=store.session(owner,last.session_id);store.resolve(owner,last.action_id,{...session,revision:999});
      assert.equal(store.action(owner,last.action_id).result.revision,999);assert.equal(checksum(adapter.cloudModule(owner,{version:2,data:adapter.export(owner)})),checksum(expected));assert.equal(checksum(adapter.export(owner).actions),rawBefore);
      const first=rows.find(row=>JSON.parse(row.command_json).roundNo===1),edited=JSON.stringify({...JSON.parse(first.result_json),unconfirmedBusinessEdit:true});db.prepare('UPDATE battle_action_receipts SET result_json=? WHERE owner_account_id=? AND action_id=?').run(edited,owner,first.action_id);assert.notEqual(checksum(adapter.cloudModule(owner,{version:2,data:adapter.export(owner)})),checksum(expected));db.prepare('UPDATE battle_action_receipts SET result_json=? WHERE owner_account_id=? AND action_id=?').run(first.result_json,owner,first.action_id);
    }
    for(const [table,rowsBefore]of Object.entries(gameBefore))assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(owner),rowsBefore);
    results.push({device:name,owner,originalActions:rows.length,journalRows:local.transportJournal.length,cloudActions:projection.data.actions.length,projectionSha256:checksum(projection),originalActionRowsSha256:rawBefore,originalActionsUnchanged:true,sessionReportRewardRowsUnchanged:true,sessionRawMd5:md5(expected.data.sessions[0].data_json),reportRawMd5:md5(expected.data.reports[0].data_json),rewardRawMd5:md5(expected.data.rewards[0].data_json)});
  }finally{db.close();}
}
for(const name of ['A','B'])assert.equal(hash(files[name]),before[name]);
const proof={at:new Date().toISOString(),scope:'directed copies of actual failed SFX SQLite; local incremental upgrade and projection only, no live provider test',sourceFailure:path.basename(source),sourceCommit:originalEvidence.sourceCommit,sourceHashes:before,originalFilesUnchanged:true,cloudReadComparison:'Independent current rev69 SELECT has same session/report/reward MD5 as original B rev68; latest legal companion visibility command does not alter these rows',results,postCheckpointResolveDoesNotChangeCloudProjection:true,modifiedBusinessRowRemainsProtected:true,passed:true};
fs.writeFileSync(path.join(output,'evidence.json'),JSON.stringify(proof,null,2));console.log(JSON.stringify({passed:true,output,originalFilesUnchanged:true,devices:results.map(({device,originalActions,journalRows,cloudActions})=>({device,originalActions,journalRows,cloudActions}))}));
