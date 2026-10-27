const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const qa = path.resolve(__dirname, '../../..');
const profile = 'C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/6ff8e38f-9f2b-4872-8747-1fb00bd81655/local-a';
const owner = 'qa:f3455e84-59a1-4edb-9b77-975ff32dc45c:local-02a70478-bf19-41d6-8937-ea7c261b579f';
const marker = JSON.parse(fs.readFileSync(path.join(profile, '.lingjing-qa-profile.json'), 'utf8'));
if (path.resolve(marker.profilePath) !== path.resolve(profile) || marker.scenario !== 'unified-battle' || marker.runId !== 'f3455e84-59a1-4edb-9b77-975ff32dc45c') throw new Error('Original profile binding mismatch');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k,canonical(v)])) : value;
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
const normalizeRows = rows => rows.map(canonical).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const prior = JSON.parse(fs.readFileSync(path.join(__dirname,'m01-local-discovery-territory-protected-before-native-entry.json'),'utf8'));
const db = new DatabaseSync(path.join(profile,'lingjing.sqlite'), {readOnly:true});
const report = { format:'lingjing.native09.resume-readonly.v1', at:new Date().toISOString(), profile, owner, marker, label:process.argv[2] || 'before-restart', readonly:true, queryOnly:true, credentialsRead:false, productAction:false, groups:{}, tables:{}, priorComparisons:{} };
try {
  db.exec('PRAGMA query_only=ON');
  for (const group of ['discoveryTerritory','business','chat','resources']) {
    report.groups[group] = {};
    for (const table of Object.keys(prior[group])) {
      if (table === 'credentialCount') continue;
      if (!/^[a-z0-9_]+$/.test(table)) throw new Error('Unexpected table');
      const columns = table === 'conversation_connections' ? Object.keys(prior.chat.conversation_connections[0]) : db.prepare(`PRAGMA table_info("${table}")`).all().map(c=>c.name).filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
      const rows = db.prepare(`SELECT ${columns.map(c=>'"'+c+'"').join(',')} FROM "${table}"`).all();
      report.groups[group][table] = rows;
      report.tables[table] = {count:rows.length, sha256:digest(normalizeRows(rows))};
      const comparisonRows = table === 'garden_territory_records' || table === 'lingjing_resources' ? rows.filter(row=>row.owner_account_id===owner) : rows;
      report.priorComparisons[table] = digest(normalizeRows(comparisonRows)) === digest(normalizeRows(prior[group][table]));
    }
  }
  report.settings = db.prepare('SELECT * FROM account_settings WHERE owner_account_id=?').all(owner);
  report.qaProfile = db.prepare('SELECT * FROM account_qa_profile').all();
  report.identity = db.prepare('SELECT owner_account_id,provider FROM account_identities').all();
  report.credentialCount = db.prepare('SELECT count(*) AS n FROM conversation_credentials').get().n;
  report.pets = report.groups.business.companion_pets.map(row => ({id:row.pet_id || row.id, revision:row.revision, data:JSON.parse(row.data_json)}));
  report.account = report.groups.business.companion_accounts;
  report.activeBattles = report.groups.business.battle_sessions.filter(row => !['finished','abandoned','cancelled'].includes(row.status)).map(row => ({id:row.id,status:row.status,data:JSON.parse(row.data_json)}));
} finally { db.close(); }
const out = path.join(__dirname,`native09-resume-${report.label}-20261026.json`);
fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,at:report.at,identity:report.identity,qaProfile:report.qaProfile,settings:report.settings,pets:report.pets.map(p=>({id:p.id,revision:p.revision,templateId:p.data.templateId,desktop:p.data.desktop,appearance:p.data.appearance2d})),activeBattles:report.activeBattles.map(b=>({id:b.id,status:b.status,round:b.data.snapshot?.round})),account:report.account,priorComparisons:report.priorComparisons,tableCounts:Object.fromEntries(Object.entries(report.tables).map(([k,v])=>[k,v.count]))},null,2));
if (report.label === 'before-restart') {
  const cases = JSON.parse(fs.readFileSync(path.join(qa,'cases.json'),'utf8'));
  const groups = [
    {key:'local-existing-ui',ids:['C08','T01','M01','M04','M05','M06','G01','G02','G03','G04','P03','P08'],boundary:'Original LocalA only; real UI with explicitly simulated location; guard/occupation require natural availability; partial coverage stays pending.'},
    {key:'cloud-auth-or-grant',ids:['A08','A11','A12','C11','C12','B10','S02','S04','S05','M07'],boundary:'Fresh Root/08 identity-bound protocol and/or renewed exact grant before dependent actions; no old v2/claims.'},
    {key:'human-or-environment',ids:['A04','A05','A06','A14','A15','M03','D05','D09','N04','P09','C09'],boundary:'No new identity/profile to replace existing data. Password/terms/GPS/multiple displays/tray/startup constraints recorded separately; no boundary bypass.'},
    {key:'prepared-fix-native-retest',ids:['D01','T06','I01','P01','A13','B09','C03','R06'],boundary:'Original failures retained; prepared patches require integrated exact new candidate and targeted real UI retest.'}
  ];
  const remaining=cases.cases.filter(c=>c.status!=='passed');
  const fixed={format:'lingjing.native09.fixed-remaining-gaps.v1',at:report.at,coordinatorThreadId:'01a1759f-d666-75d1-81dc-e757e748d221',nativeThreadId:'01a1759f-4253-7ef0-bf83-44a87c0a16e8',runId:cases.activeRound.runId,counts:Object.fromEntries([...new Set(cases.cases.map(c=>c.status))].map(s=>[s,cases.cases.filter(c=>c.status===s).length])),groups:groups.map(g=>({...g,cases:g.ids.map(id=>{const c=remaining.find(c=>c.id===id);if(!c)throw Error(id);return {id,title:c.title,status:c.status};})})),restartPlan:{instances:1,profile,candidate:cases.activeRound.executable,scenario:marker.scenario,debugPort:57215,newProfile:false,cloudAOpened:false,credentialsRead:false,grantActions:false,baseline:out,firstAction:'Bind actual new Main/window from fresh inventory; confirm preserved original account/pets/battles before route navigation.'}};
  const classified=groups.flatMap(g=>g.ids);
  if(classified.length!==remaining.length||new Set(classified).size!==remaining.length||remaining.some(c=>!classified.includes(c.id)))throw Error('Gap list coverage mismatch');
  const gapOut=path.join(__dirname,'native09-fixed-remaining-gaps-20261026.json');
  fs.writeFileSync(gapOut,JSON.stringify(fixed,null,2)+'\n');
  console.log(JSON.stringify({gapOut,remaining:remaining.length,coverageExact:true}));
}
