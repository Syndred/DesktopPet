// Read-only verification on a saved isolated profile. Never modifies or migrates it.
const Database=require('better-sqlite3');
function readCaptureLedger(file,petId,encounterId) {
  const db=new Database(file,{readonly:true,fileMustExist:true});
  try {
    const row=db.prepare('SELECT owner_account_id,data_json FROM discovery_captures WHERE pet_id=? AND encounter_id=?').get(petId,encounterId);
    if(!row)throw new Error('No matching saved capture');
    const owner=row.owner_account_id,capture=JSON.parse(row.data_json);
    const count=(table,extra='',args=[])=>db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE owner_account_id=?${extra}`).get(owner,...args).n;
    return {ownerAccountId:owner,captures:count('discovery_captures'),ownedInstances:count('companion_pets',' AND pet_id=?',[petId]),memories:count('discovery_memory_tags',' AND pet_id=?',[petId]),reports:count('battle_reports_v2'),petId:capture.petId,resourceId:capture.resourceId,validation:capture.validation};
  } finally {db.close();}
}
if(require.main===module) {
  const [file,petId,encounterId]=process.argv.slice(2);
  if(!file||!petId||!encounterId)throw new Error('Expected database path, petId and encounterId');
  console.log(JSON.stringify(readCaptureLedger(file,petId,encounterId)));
}
module.exports={readCaptureLedger};
