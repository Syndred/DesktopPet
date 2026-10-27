const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const profile='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/790f5b6d-a900-4c6f-bb3f-e32237136ed1/cloud-a';
const owner='account:99efc8c1-c420-47f3-9a5c-91aa302d5630';
if(fs.existsSync(path.join(profile,'.lingjing-qa-profile.json')))throw Error('Ordinary CloudA must have no QA marker');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const sort=rows=>rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const sensitive=new Set(['account_login_sessions','conversation_credentials','account_legacy_data']);
const report={at:new Date().toISOString(),profile,owner,label:process.argv[2],readOnly:true,queryOnly:true,credentialsRead:false,vaultRead:false,ordinaryProfileNoMarker:true,tables:{},counts:{},safeFilesMetadata:[]};
for(const rel of ['accounts/device.json','accounts/verified-session.bin','accounts/login-hint.json']){
 const file=path.join(profile,rel);if(fs.existsSync(file)){const stat=fs.statSync(file);report.safeFilesMetadata.push({relative:rel,bytes:stat.size,mtime:stat.mtime.toISOString(),birthtime:stat.birthtime.toISOString()});}
}
const db=new DatabaseSync(path.join(profile,'lingjing.sqlite'),{readOnly:true});
try{
 db.exec('PRAGMA query_only=ON; BEGIN');
 const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
 for(const table of names){
  const count=db.prepare('SELECT count(*) n FROM '+quote(table)).get().n;report.counts[table]=count;
  if(sensitive.has(table)){report.tables[table]={count,method:'count-only-sensitive-table'};continue;}
  const cols=db.prepare('PRAGMA table_info('+quote(table)+')').all().map(c=>c.name);
  const safeCols=cols.filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const rows=db.prepare('SELECT '+safeCols.map(quote).join(',')+' FROM '+quote(table)).all();
  report.tables[table]={count,sha256:hash(sort(rows)),excludedColumns:cols.filter(c=>!safeCols.includes(c))};
 }
 report.settings=db.prepare('SELECT owner_account_id,revision,document,updated_at FROM account_settings WHERE owner_account_id=?').all(owner);
 report.pets=db.prepare('SELECT * FROM companion_pets WHERE owner_account_id=? ORDER BY pet_id').all(owner);
 report.selections=db.prepare('SELECT * FROM companion_accounts WHERE owner_account_id=?').all(owner);
 report.identity=db.prepare('SELECT owner_account_id,provider FROM account_identities').all();
 report.queues={};for(const t of ['account_sync_outbox','garden_outbox','lingjing_resource_preference_outbox'])report.queues[t]=db.prepare('SELECT status,count(*) n FROM '+quote(t)+' GROUP BY status').all();
 db.exec('COMMIT');
}finally{db.close();}
const baseline=path.join(__dirname,'native09-cloudA-before-launch-20261026.json');
if(fs.existsSync(baseline)){
 const before=JSON.parse(fs.readFileSync(baseline,'utf8'));
 report.changedTables=Object.keys(report.tables).filter(t=>JSON.stringify(report.tables[t])!==JSON.stringify(before.tables[t]));
 report.settingsExact=JSON.stringify(before.settings)===JSON.stringify(report.settings);
 report.petsExact=JSON.stringify(before.pets)===JSON.stringify(report.pets);
 report.selectionsExact=JSON.stringify(before.selections)===JSON.stringify(report.selections);
}
const out=path.join(__dirname,'native09-cloudA-'+report.label+'-20261026.json');
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({out,at:report.at,tables:Object.keys(report.tables).length,safeFilesMetadata:report.safeFilesMetadata,identity:report.identity,settings:report.settings,petIds:report.pets.map(p=>p.pet_id),queues:report.queues,changedTables:report.changedTables,petsExact:report.petsExact,selectionsExact:report.selectionsExact,settingsExact:report.settingsExact},null,2));
