const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const{DatabaseSync}=require('node:sqlite');
const profile='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/790f5b6d-a900-4c6f-bb3f-e32237136ed1/cloud-a',owner='account:99efc8c1-c420-47f3-9a5c-91aa302d5630';
if(fs.existsSync(path.join(profile,'.lingjing-qa-profile.json')))throw Error('Ordinary original CloudA must have no QA marker');
const quote=x=>'"'+x.replaceAll('"','""')+'"';const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const excluded=new Set(['account_login_sessions','conversation_credentials','account_legacy_data']);
const report={at:new Date().toISOString(),profile,owner,label:process.argv[2],readOnly:true,queryOnly:true,credentialValuesRead:false,vaultValuesRead:false,ordinaryProfileNoMarker:true,digests:{},rowHashes:{},tables:{},deviceId:JSON.parse(fs.readFileSync(path.join(profile,'accounts/device.json'),'utf8')).deviceId,safeFilesMetadata:[]};
for(const relative of ['accounts/verified-session.bin','accounts/login-hint.json']){const file=path.join(profile,relative);if(fs.existsSync(file)){const s=fs.statSync(file);report.safeFilesMetadata.push({relative,bytes:s.size,mtime:s.mtime.toISOString(),birthtime:s.birthtime.toISOString()});}}
const detailed=new Set(['account_settings','account_sync_state','account_sync_outbox','account_sync_sources','account_sync_baselines','account_sync_checkpoints','account_backup_receipts','lingjing_resource_preferences','lingjing_resource_preference_state','lingjing_resource_preference_cache','lingjing_resource_preference_outbox','companion_pets','companion_accounts']);
const db=new DatabaseSync(path.join(profile,'lingjing.sqlite'),{readOnly:true});try{
 db.exec('PRAGMA query_only=ON; BEGIN');
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 for(const t of names){const count=db.prepare('SELECT count(*) n FROM '+quote(t)).get().n;if(excluded.has(t)){report.digests[t]={count,method:'sensitive-table-count-only'};continue;}
  const columns=db.prepare('PRAGMA table_info('+quote(t)+')').all().map(c=>c.name).filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const rows=db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(t)).all();const normalized=rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));report.digests[t]={count,sha256:hash(normalized)};report.rowHashes[t]=normalized.map(hash);if(detailed.has(t)||t.startsWith('battle_'))report.tables[t]=rows;
 }
 report.identity=db.prepare('SELECT owner_account_id,provider,subject_id FROM account_identities').all();db.exec('COMMIT');
}finally{db.close();}
const output=path.join(__dirname,'cloudA-flow-'+report.label+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,at:report.at,deviceId:report.deviceId,identity:report.identity,tables:Object.keys(report.digests).length,pets:report.tables.companion_pets?.map(p=>({owner:p.owner_account_id,id:p.pet_id})),settings:report.tables.account_settings?.map(s=>({owner:s.owner_account_id,revision:s.revision,document:s.document})),sync:report.tables.account_sync_state,outboxMetadata:report.tables.account_sync_outbox?.map(r=>({owner:r.owner_account_id,actionId:r.action_id,baseRevision:r.base_revision,checksum:r.checksum,status:r.status,attempts:r.attempts,lastError:r.last_error,createdAt:r.created_at,verifiedAt:r.verified_at})),backupReceiptCount:report.tables.account_backup_receipts?.length,battleTableCounts:Object.fromEntries(Object.keys(report.digests).filter(k=>k.startsWith('battle_')).map(k=>[k,report.digests[k].count]))}));
