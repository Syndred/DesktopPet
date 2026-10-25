const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
const source='C:/Users/Administrator/Desktop/project/DesktopPet',run=path.join(source,'artifacts/cloud-upgrade/2026-10-25/final-portable-uTajxg');
const req=p=>require(path.join(source,'apps/pc-app/runtime',p));
const {BackupManager}=req('features/accounts/backups.cjs'),{AccountSync}=req('features/accounts/sync.cjs'),{checksum,saveDataChecksum}=req('features/accounts/util.cjs');
const {ResourcesService}=req('features/resources/service.cjs'),{ResourceCloudSync}=req('features/resources/cloud-sync.cjs');
const owner='account:470a41d4-3cf7-4a7d-8b1e-32e276d2a719',evidence=JSON.parse(fs.readFileSync(path.join(run,'evidence.json'))),captures={};
const hashFile=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report={at:new Date().toISOString(),sourceCommit:evidence.sourceCommit,executableSha256:evidence.executableSha256,originalRun:run,queryOnly:true,noRemoteWrites:true,selectionActionId:evidence.selectionActionId,clients:{}};
for(const name of ['A','B']){
 const profile=path.join(run,name),file=path.join(profile,'lingjing.sqlite'),before=hashFile(file),db=new DatabaseSync(file,{readOnly:true});db.exec('PRAGMA query_only=ON');
 const resources=new ResourcesService({db,storageRoot:path.join(profile,'character-resources'),seedBuiltin:false});
 const cloud=new ResourceCloudSync({service:resources,getActor(){throw Error('Read-only diagnostic forbids network');}}),map=new Map([['resources',resources],['resourceCloud',cloud]]);
 const backups=new BackupManager({db,directory:path.join(profile,'accounts/backups'),getIdentity:id=>db.prepare('SELECT owner_account_id,provider,subject_id FROM account_identities WHERE owner_account_id=?').get(id)});
 backups.register(req('core/resource-backup.cjs').createResourceBackupAdapter({db,get:key=>map.get(key)}));
 for(const [id,factory]of [['companions','createCompanionBackupAdapter'],['battle','createBattleBackupAdapter'],['garden','createGardenBackupAdapter']])backups.register(req(`features/${id}/backup.cjs`)[factory](db));
 backups.register(req('features/conversations/backup.cjs').createConversationBackupAdapter({db}));
 const sync=new AccountSync({db,backups,remote:{enabled:true,authKind:'supabase'},getSession:()=>({ownerAccountId:owner,provider:'runtime',authKind:'supabase'}),getSettings:()=>({document:JSON.parse(db.prepare('SELECT document FROM account_settings WHERE owner_account_id=?').get(owner).document)})});
 const baseline=db.prepare('SELECT * FROM account_sync_baselines WHERE owner_account_id=?').get(owner),envelope=JSON.parse(baseline.cloud_document),current=backups.snapshot(owner);backups.validate(envelope,owner);
 captures[name]={current:sync.cloudView(current.data,owner),baseline:sync.cloudView(envelope.data,owner)};
 report.clients[name]={status:sync.status(owner),state:db.prepare('SELECT * FROM account_sync_state WHERE owner_account_id=?').get(owner),baseline:{revision:baseline.cloud_revision,checksum:baseline.envelope_checksum,data:baseline.data_checksum,personal:baseline.personal_checksum,protected:baseline.protected_checksum,envelopeValid:true,derived:sync.fingerprints(envelope.data,owner)},current:sync.fingerprints(current.data,owner),
  outbox:db.prepare('SELECT action_id,base_revision,checksum,status,attempts,last_error,created_at,verified_at FROM account_sync_outbox WHERE owner_account_id=? ORDER BY created_at').all(owner),
  sources:db.prepare('SELECT action_id,authority_pending,cloud_excluded,archive_reason,prepared_at FROM account_sync_sources WHERE owner_account_id=?').all(owner),
  companionReadback:db.prepare("SELECT action_id,kind,input_hash,result,created_at FROM account_actions WHERE owner_account_id=? AND action_id='companions:verified-head'").get(owner),
  selectionIntent:db.prepare("SELECT action_id,kind,input_hash,json_extract(result,'$.status') status,json_extract(result,'$.baseRevision') base_revision,json_extract(result,'$.sentAt') sent_at,json_extract(result,'$.verifiedAt') verified_at,json_extract(result,'$.result.cloud') cloud FROM account_actions WHERE owner_account_id=? AND action_id=?").get(owner,'companions:'+evidence.selectionActionId),
  quickCheck:db.prepare('PRAGMA quick_check').get().quick_check};
 db.close();report.clients[name].originalDatabaseSha256Before=before;report.clients[name].originalDatabaseSha256After=hashFile(file);report.clients[name].originalDatabaseHashUnchanged=before===report.clients[name].originalDatabaseSha256After;
}
const moduleHash=(id,module)=>module&&saveDataChecksum({modules:{[id]:module},tables:{}});
const diffModules=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a.modules),...Object.keys(b.modules)])].map(id=>[id,{left:moduleHash(id,a.modules[id]),right:moduleHash(id,b.modules[id]),equal:moduleHash(id,a.modules[id])===moduleHash(id,b.modules[id])}]));
const tableDifferences=(a,b)=>Object.fromEntries(Object.keys(a).map(name=>{const keys={companion_accounts:'owner_account_id',companion_pets:'pet_id',companion_actions:'action_id',companion_legacy_archive:'legacy_pet_id',companion_interactions:'pet_id',companion_capture_receipts:'capture_id'},key=keys[name];const left=a[name],right=b[name],rows=key?left.filter(row=>!right.some(other=>row[key]===other[key]&&checksum(row)===checksum(other))):left;return[name,{leftCount:left.length,rightCount:right.length,equal:moduleHash('companions',{version:1,data:{tables:{[name]:left}}})===moduleHash('companions',{version:1,data:{tables:{[name]:right}}}),changedKeys:rows.map(row=>({id:row[key],operation:row.operation,createdAt:row.created_at}))}];}));
report.comparison={baseline73To74:diffModules(captures.A.baseline,captures.B.baseline),currentAAfterCleanupToConfirmed74:diffModules(captures.A.current,captures.B.baseline),companionCleanupDiff:tableDifferences(captures.A.current.modules.companions.data.tables,captures.B.baseline.modules.companions.data.tables),remotePersonalUnchanged:report.clients.A.baseline.derived.personal===report.clients.B.baseline.derived.personal,
 currentPersonalEdited:report.clients.A.current.personal!==report.clients.B.baseline.derived.personal,note:'Original failure was at head74. Current A includes the later finally hide action/head75; that protected cleanup difference is not attributed to the failure.'};
const destination='artifacts/accounts/authority-personal-race/read-only.json';fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2));
console.log(JSON.stringify({destination,...report},null,2));
