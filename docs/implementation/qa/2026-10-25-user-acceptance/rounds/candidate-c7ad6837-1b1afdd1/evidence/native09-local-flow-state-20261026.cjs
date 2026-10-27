const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const profile='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/6ff8e38f-9f2b-4872-8747-1fb00bd81655/local-a';
const db=new DatabaseSync(path.join(profile,'lingjing.sqlite'),{readOnly:true});
const tables=['account_settings','discovery_actions','discovery_captures','discovery_encounters','discovery_memory_tags','companion_capture_receipts','battle_sessions','battle_action_receipts','battle_reports_v2','battle_reward_receipts','companion_accounts','companion_pets','companion_actions','garden_territory_attempts','garden_territory_challenges','garden_territory_logs','garden_territory_records','garden_garrisons','garden_accounts','garden_actions','garden_reward_receipts','garden_plots','garden_items','garden_ledger','conversation_profiles','conversation_preferences','conversation_messages','conversation_memories'];
const report={at:new Date().toISOString(),profile,label:process.argv[2],provenance:'original path-bound local unified-battle scenario, explicitly simulated location and local authority',readOnly:true,queryOnly:true,credentialValuesRead:false,tables:{},digests:{}};
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
try{
 db.exec('PRAGMA query_only=ON; BEGIN');
 for(const table of tables){
  const columns=db.prepare('PRAGMA table_info("'+table+'")').all().map(c=>c.name).filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const rows=db.prepare('SELECT '+columns.map(c=>'"'+c+'"').join(',')+' FROM "'+table+'"').all();
  report.tables[table]=rows;
  report.digests[table]={count:rows.length,sha256:crypto.createHash('sha256').update(JSON.stringify(rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))))).digest('hex')};
 }
 db.exec('COMMIT');
}finally{db.close();}
const output=path.join(__dirname,'local-flow-'+report.label+'-20261026.json');
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
const parse=row=>JSON.parse(row.data_json||'{}');
console.log(JSON.stringify({output,at:report.at,petCount:report.tables.companion_pets.length,encounters:report.tables.discovery_encounters.map(r=>({id:r.encounter_id,status:r.status,revision:r.revision,spawn:parse(r).spawn?.id,battle:parse(r).battle?.battleId,expiresAt:parse(r).spawn?.expiresAt})),battles:report.tables.battle_sessions.map(r=>({id:r.id,status:r.status,mode:parse(r).mode,round:parse(r).snapshot?.round,winner:parse(r).winner})),captures:report.tables.discovery_captures,territoryCounts:Object.fromEntries(Object.entries(report.digests).filter(([t])=>t.startsWith('garden_territory')||t==='garden_garrisons').map(([t,v])=>[t,v.count])),selections:report.tables.companion_accounts.map(r=>JSON.parse(r.selections_json))},null,2));
