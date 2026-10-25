const COLUMNS=['action_id','session_id','command_json','result_json'];
const JOURNAL_COLUMNS=[...COLUMNS,'legacy_row_json'];
// Exactly the cloudCommand call sites in BattleFeatureService. Direct reject /
// cancel HTTP requests do not create a durable command record here.
const TYPES=new Set(['training-start','training-leave','invite','create','join','leave']);
const ACTIONS=new Set(['normal_attack','element_attack','dodge','ultimate']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===expected.toSorted().join(',');
const rowBytes=row=>JSON.stringify(Object.fromEntries(COLUMNS.map(key=>[key,row[key]])));
const sameRow=(row,saved)=>{const before=parse(saved);return keys(before,COLUMNS)&&COLUMNS.every(key=>row[key]===before[key]);};
const string=value=>typeof value==='string'&&value.length>0&&value.length<=160;
function commandInput(type,input){
  const shapes={'training-start':['petId','enemyElement'],'training-leave':['sessionId'],invite:['targetAccount'],create:['petId'],join:['roomCode','petId'],leave:['roomId']};
  return TYPES.has(type)&&keys(input,shapes[type])&&Object.values(input).every(string)&&(type!=='training-start'||['metal','wood','earth','water','fire'].includes(input.enemyElement));
}

function transportRow(row,sessions,owner){
  const command=parse(row.command_json),result=row.result_json===null?null:parse(row.result_json);
  if(keys(command,['type','input'])&&typeof command.type==='string'&&command.type.startsWith('cloud:')&&commandInput(command.type.slice(6),command.input)&&row.session_id===row.action_id)return !result?.session||(result.session.context?.authority==='supabase'&&result.session.context.cloudUserId===owner);
  const session=sessions.get(row.session_id);
  return session?.context?.authority==='supabase'&&session.context.cloudUserId===owner&&['training','friend'].includes(session.mode)
    &&Number.isSafeInteger(session.snapshot?.round)
    &&keys(command,['action','roundNo'])&&ACTIONS.has(command.action)&&Number.isSafeInteger(command.roundNo)&&command.roundNo>0
    &&command.roundNo<=session.snapshot.round+1
    &&(row.result_json===null||keys(result,['sessionId','revision','resolvedRound'])&&result.sessionId===session.id&&Number.isSafeInteger(result.revision)&&result.revision>0&&Number.isSafeInteger(result.resolvedRound)&&result.resolvedRound>=command.roundNo&&result.resolvedRound<=session.snapshot.round
      ||keys(result,['sessionId','supersededBy','reason'])&&result.sessionId===session.id&&string(result.supersededBy)&&result.supersededBy!==row.action_id&&result.reason==='server-locked-original');
}

/** Additive upgrade: the old action row and both raw JSON strings stay intact.
 * Only recognized cloud transport records gain a byte-bound local journal map.
 * Unknown/offline/business records remain in the protected snapshot. */
function upgradeTransportJournal(db,owner){
  // Garden may hold a lazy BattleStore without installing the battle module.
  // Inspect schema metadata only until both old tables and migration002 exist.
  const schema=db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('battle_action_receipts','battle_sessions','battle_transport_journal')").get();
  if(schema.count!==3)return;
  const owners=owner?[owner]:db.prepare('SELECT DISTINCT owner_account_id FROM battle_action_receipts').all().map(row=>row.owner_account_id);
  const insert=db.prepare(`INSERT OR IGNORE INTO battle_transport_journal(owner_account_id,${JOURNAL_COLUMNS.join(',')},projection_origin) VALUES(${Array(2+JOURNAL_COLUMNS.length).fill('?').join(',')})`);
  for(const currentOwner of owners){
    const sessions=new Map(db.prepare('SELECT id,data_json FROM battle_sessions WHERE owner_account_id=?').all(currentOwner).map(row=>[row.id,parse(row.data_json)]));
    for(const row of db.prepare(`SELECT ${COLUMNS.join(',')} FROM battle_action_receipts WHERE owner_account_id=?`).all(currentOwner))if(transportRow(row,sessions,currentOwner))insert.run(currentOwner,...COLUMNS.map(key=>row[key]),rowBytes(row),'upgrade');
  }
}

function cloudActions(data,owner,db){
  const mapped=new Map(data.transportJournal.map(row=>[row.action_id,row]));
  const sessions=new Map(data.sessions.map(row=>[row.id,parse(row.data_json)]));
  return data.actions.filter(row=>{
    const journal=mapped.get(row.action_id),origin=parse(journal?.legacy_row_json);
    if(!journal||!sameRow(row,journal.legacy_row_json)||!transportRow(origin,sessions,owner))return true;
    // The serialized marker alone grants no projection privilege. Only the
    // local upgrade or the verified authority-readback path can seal this row.
    const seal=db.prepare('SELECT legacy_row_json,projection_origin FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
    return !seal||!['upgrade','readback'].includes(seal.projection_origin)||seal.legacy_row_json!==journal.legacy_row_json;
  });
}

module.exports={COLUMNS,JOURNAL_COLUMNS,parse,rowBytes,sameRow,transportRow,upgradeTransportJournal,cloudActions};
