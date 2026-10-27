const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');const{DatabaseSync}=require('node:sqlite');
const profile='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/790f5b6d-a900-4c6f-bb3f-e32237136ed1/cloud-b-second-device-native',owner='account:e1c9004a-2b10-4ff0-8d9e-b338d49ad3d6';
if(fs.existsSync(path.join(profile,'.lingjing-qa-profile.json')))throw Error('Ordinary B2 must have no QA marker');
const quote=x=>'"'+x.replaceAll('"','""')+'"';const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const excluded=new Set(['account_login_sessions','conversation_credentials','account_legacy_data']);
const report={at:new Date().toISOString(),profile,owner,label:process.argv[2],readOnly:true,queryOnly:true,credentialValuesRead:false,vaultValuesRead:false,ordinaryProfileNoMarker:true,digests:{},tables:{},deviceId:JSON.parse(fs.readFileSync(path.join(profile,'accounts/device.json'),'utf8')).deviceId};
const detailed=new Set(['account_settings','account_sync_state','account_sync_outbox','account_sync_sources','account_sync_baselines','account_sync_checkpoints','lingjing_resource_preferences','lingjing_resource_preference_state','lingjing_resource_preference_cache','lingjing_resource_preference_outbox','companion_pets','companion_accounts']);
const db=new DatabaseSync(path.join(profile,'lingjing.sqlite'),{readOnly:true});try{
 db.exec('PRAGMA query_only=ON; BEGIN');
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 for(const t of names){const count=db.prepare('SELECT count(*) n FROM '+quote(t)).get().n;if(excluded.has(t)){report.digests[t]={count,method:'sensitive-table-count-only'};continue;}
  const columns=db.prepare('PRAGMA table_info('+quote(t)+')').all().map(c=>c.name).filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const rows=db.prepare('SELECT '+columns.map(quote).join(',')+' FROM '+quote(t)).all();const normalized=rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));report.digests[t]={count,sha256:crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex')};if(detailed.has(t))report.tables[t]=rows;
 }
 report.identity=db.prepare('SELECT owner_account_id,provider,subject_id FROM account_identities').all();db.exec('COMMIT');
}finally{db.close();}
const output=path.join(__dirname,'cloudB2-flow-'+report.label+'-20261026.json');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,at:report.at,deviceId:report.deviceId,identity:report.identity,tables:Object.keys(report.digests).length,pets:report.tables.companion_pets?.map(p=>p.pet_id),settings:report.tables.account_settings?.map(s=>({owner:s.owner_account_id,revision:s.revision})),sync:report.tables.account_sync_state,prefState:report.tables.lingjing_resource_preference_state,prefOutbox:report.tables.lingjing_resource_preference_outbox}));
