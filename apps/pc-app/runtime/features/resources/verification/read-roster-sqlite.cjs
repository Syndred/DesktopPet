// Read-only acceptance snapshot; run with the Electron Node ABI in an isolated profile.
const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const {catalog}=require('../roster.cjs');
const db=new Database(path.join(path.resolve(process.argv[2]),'lingjing.sqlite'),{readonly:true});
try {
  const ids=catalog.characters.map(c=>c.resourceId), marks=ids.map(()=>'?').join(',');
  const records=db.prepare(`SELECT resource_id,document_json FROM lingjing_resources WHERE resource_id IN (${marks})`).all(...ids).map(row=>{
    const resource=JSON.parse(row.document_json);
    return {resourceId:row.resource_id,name:resource.name,element:catalog.characters.find(entry=>entry.resourceId===row.resource_id)?.element,contentHash:resource.contentHash,calibration:resource.calibration,actions:resource.actions,atlas:resource.atlas};
  });
  const evidence={at:new Date().toISOString(),canonicalResources:records,
    canonicalPreferences:db.prepare(`SELECT resource_id,calibration_json,actions_json,revision FROM lingjing_resource_preferences WHERE resource_id IN (${marks})`).all(...ids),
    retainedHistoricalBuiltins:db.prepare("SELECT resource_id FROM lingjing_resources WHERE owner_account_id IS NULL AND resource_id NOT IN ("+marks+")").all(...ids),
    retainedImports:db.prepare('SELECT import_id,resource_id,source_filename,imported_at FROM lingjing_resource_imports').all(),
    counts:db.prepare('SELECT count(*) AS allResourceRows,sum(owner_account_id IS NULL) AS globalRows FROM lingjing_resources').get(),
    canonicalPets:db.prepare('SELECT data_json FROM companion_pets').all().map(row=>JSON.parse(row.data_json)).filter(pet=>ids.includes(pet.resource?.resourceId)).map(({petId,templateId,name,element,resource,revision})=>({petId,templateId,name,element,resource,revision})),
    companionSelections:db.prepare('SELECT selections_json FROM companion_accounts').all().map(row=>JSON.parse(row.selections_json))};
  fs.writeFileSync(path.resolve(process.argv[3]),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({canonical:records.length,historical:evidence.retainedHistoricalBuiltins.length,imports:evidence.retainedImports.length,counts:evidence.counts}));
}finally{db.close();}
