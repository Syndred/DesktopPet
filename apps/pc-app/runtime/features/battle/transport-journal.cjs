const COLUMNS=['action_id','session_id','command_json','result_json'];
const JOURNAL_COLUMNS=[...COLUMNS,'legacy_row_json'];
const TYPES=new Set(['training-start','training-leave','invite','create','join','leave','reject','cancel','accept-confirm']);
const ACTIONS=new Set(['normal_attack','element_attack','dodge','ultimate']);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const keys=(value,expected)=>object(value)&&Object.keys(value).sort().join(',')===expected.toSorted().join(',');
const rowBytes=row=>JSON.stringify(Object.fromEntries(COLUMNS.map(key=>[key,row[key]])));
const sameRow=(row,saved)=>{const before=parse(saved);return keys(before,COLUMNS)&&COLUMNS.every(key=>row[key]===before[key]);};
const string=value=>typeof value==='string'&&value.length>0&&value.length<=160;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const subset=(value,allowed)=>object(value)&&Object.keys(value).every(key=>allowed.includes(key));
const ROOM_KEYS='id room_code status host_user_id host_account guest_user_id guest_account host_pet_id guest_pet_id host_pet_level guest_pet_level host_resource_id guest_resource_id invitation_id invited_user_id host_pet_name guest_pet_name host_element guest_element current_round last_resolved_round host_hp guest_hp host_anger guest_anger host_free_dodge_used guest_free_dodge_used host_statuses guest_statuses winner_side created_at updated_at revision rules_version core_version authority protocolVersion'.split(' ');
const SESSION_KEYS='id mode status startedAt endedAt updatedAt player enemy snapshot rounds winner pendingAction historyComplete rules context reward reportId revision side room settlementError'.split(' ');
function ownedRoom(room,owner,petId){
  if(!subset(room,ROOM_KEYS)||!string(room.id)||!['waiting','active','finished','abandoned'].includes(room.status))return false;
  const side=room.host_user_id===owner?'host':room.guest_user_id===owner?'guest':null;
  return Boolean(side&&(!petId||room[`${side}_pet_id`]===petId));
}
function ownedSession(session,owner){return subset(session,SESSION_KEYS)&&session.context?.authority==='supabase'&&session.context.cloudUserId===owner&&['training','friend'].includes(session.mode)&&string(session.id)&&Number.isSafeInteger(session.snapshot?.round);}
function requestResult(result,owner){
  if(result===null)return true;
  if(!subset(result,['ok','resent','retryAfterSeconds','error','request'])||typeof result.ok!=='boolean')return false;
  const invitation=result.request;if(!invitation)return true;
  const fields=['id','fromUserId','fromAccount','toUserId','toAccount','status','roomId','roomCode','roomStatus','createdAt','updatedAt'];
  // Accept both the exact old shape and the optional nullable deadline. Unknown
  // metadata and foreign-owner rows remain protected by the original boundary.
  return (keys(invitation,fields)||keys(invitation,[...fields,'expiresAt'])&&(invitation.expiresAt===null||string(invitation.expiresAt)))
    &&['id','fromUserId','fromAccount','toUserId','toAccount'].every(key=>string(invitation[key]))&&[invitation.fromUserId,invitation.toUserId].includes(owner);
}
function commandInput(type,input){
  const shapes={'training-start':['petId','enemyElement'],'training-leave':['sessionId'],invite:['targetAccount'],create:['petId'],join:['roomCode','petId'],leave:['roomId'],reject:['requestId'],cancel:['requestId'],'accept-confirm':['requestId','roomId','roomCode','roomStatus']};
  const modernInvite=type==='invite'&&keys(input,['targetAccount','allowResend'])&&string(input.targetAccount)&&typeof input.allowResend==='boolean';
  return TYPES.has(type)&&(modernInvite||keys(input,shapes[type])&&Object.values(input).every(string))&&(type!=='training-start'||['metal','wood','earth','water','fire'].includes(input.enemyElement));
}
function sameCommandInput(type,before,after){
  if(!commandInput(type,before)||!commandInput(type,after))return false;
  return JSON.stringify(before)===JSON.stringify(after)||type==='invite'&&keys(before,['targetAccount'])&&keys(after,['targetAccount','allowResend'])&&after.allowResend===false&&before.targetAccount===after.targetAccount;
}

function protocolResult(type,input,result,owner){
  if(result===null)return true;
  if(['invite','reject','cancel','accept-confirm'].includes(type))return requestResult(result,owner);
  if(['training-start','training-leave'].includes(type))return subset(result,['session','proof'])&&ownedSession(result.session,owner)&&result.session.mode==='training'&&(!input.petId||result.session.player?.petId===input.petId)&&(!input.sessionId||result.session.id===input.sessionId)&&(!result.proof||result.proof.owner_account_id===owner&&result.proof.report?.sessionId===result.session.id&&result.proof.reward?.petId===result.session.player?.petId&&[5,20].includes(result.proof.experience));
  if(['create','join'].includes(type))return keys(result,['ok','room','side'])&&result.ok===true&&ownedRoom(result.room,owner,input.petId)&&result.room[`${result.side}_user_id`]===owner;
  return type==='leave'&&subset(result,['room','rounds','pendingAction','hasMore','nextBeforeRound'])&&ownedRoom(result.room,owner)&&result.room.id===input.roomId;
}
function choice(row,command,result,owner){
  if(!keys(command,['type','petId'])||!['invite','accept'].includes(command.type)||!string(command.petId)||row.session_id!==row.action_id||row.action_id!==`${command.type}:${row.action_id.split(':')[1]}`||!uuid(row.action_id.split(':')[1]))return false;
  return result===null||command.type==='accept'&&keys(result,['room'])&&ownedRoom(result.room,owner,command.petId)&&result.room.host_user_id===owner&&result.room.invitation_id===row.action_id.slice(7);
}
const cacheId=id=>`room-cache:${id}`;
function friendCache(session,owner){return ownedSession(session,owner)&&subset(session.context,['authority','cloudUserId','coreVersion'])&&session.mode==='friend'&&session.id===`online-${session.room?.id}`&&ownedRoom(session.room,owner,session.player?.petId)&&!session.reward?.applied;}
function protocolReport(report,id,owner){return subset(report,'id sessionId mode status winner player enemy startedAt endedAt rounds reward historyComplete context rules'.split(' '))&&report.id===id&&report.sessionId===id&&report.mode==='friend'&&report.context?.authority==='supabase'&&report.context.cloudUserId===owner&&!report.reward?.applied;}
function cacheRow(row,owner){const command=parse(row.command_json),result=parse(row.result_json);return keys(command,['type','roomId'])&&command.type==='friend-cache'&&row.action_id===cacheId(row.session_id)&&row.session_id===`online-${command.roomId}`&&subset(result,['session','report'])&&friendCache(result.session,owner)&&result.session.id===row.session_id&&(!result.report||protocolReport(result.report,row.session_id,owner));}
const SESSION_COLUMNS=['id','room_id','status','data_json','revision','updated_at'],REPORT_COLUMNS=['id','session_id','data_json','ended_at'];
function cacheLegacy(row,owner){
  const before=parse(row.legacy_row_json),body=parse(before?.session?.data_json);if(!keys(before,['session','report'])||!keys(before.session,SESSION_COLUMNS)||before.session.id!==row.session_id||!friendCache(body,owner)||before.session.room_id!==body.room.id||before.session.status!==body.status||before.session.updated_at!==body.updatedAt||!Number.isSafeInteger(before.session.revision)||before.session.revision<1)return false;
  return before.report===null||keys(before.report,REPORT_COLUMNS)&&protocolReport(parse(before.report.data_json),row.session_id,owner)&&before.report.ended_at===parse(before.report.data_json).endedAt;
}
function sessionMap(data,owner){const sessions=new Map(data.sessions.map(row=>[row.id,parse(row.data_json)]));for(const row of data.transportJournal||[])if(cacheRow(row,owner)&&!sessions.has(row.session_id))sessions.set(row.session_id,parse(row.result_json).session);return sessions;}

function transportRow(row,sessions,owner){
  const command=parse(row.command_json),result=row.result_json===null?null:parse(row.result_json);
  if(cacheRow(row,owner))return row.legacy_row_json===undefined||row.legacy_row_json===null||cacheLegacy(row,owner);
  if(choice(row,command,result,owner))return true;
  if(keys(command,['type','input'])&&typeof command.type==='string'&&command.type.startsWith('cloud:')&&commandInput(command.type.slice(6),command.input)&&row.session_id===row.action_id)return protocolResult(command.type.slice(6),command.input,result,owner);
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
  const owners=owner?[owner]:db.prepare('SELECT owner_account_id FROM battle_action_receipts UNION SELECT owner_account_id FROM battle_sessions').all().map(row=>row.owner_account_id);
  const insert=db.prepare(`INSERT OR IGNORE INTO battle_transport_journal(owner_account_id,${JOURNAL_COLUMNS.join(',')},projection_origin) VALUES(${Array(2+JOURNAL_COLUMNS.length).fill('?').join(',')})`);
  for(const currentOwner of owners){
    const sessions=new Map(db.prepare('SELECT id,data_json FROM battle_sessions WHERE owner_account_id=?').all(currentOwner).map(row=>[row.id,parse(row.data_json)]));
    for(const row of db.prepare(`SELECT ${COLUMNS.join(',')} FROM battle_action_receipts WHERE owner_account_id=?`).all(currentOwner))if(transportRow(row,sessions,currentOwner))insert.run(currentOwner,...COLUMNS.map(key=>row[key]),rowBytes(row),'upgrade');
    importFriendCaches(db,currentOwner,{sessions:db.prepare(`SELECT ${SESSION_COLUMNS.join(',')} FROM battle_sessions WHERE owner_account_id=?`).all(currentOwner),reports:db.prepare(`SELECT ${REPORT_COLUMNS.join(',')} FROM battle_reports_v2 WHERE owner_account_id=?`).all(currentOwner),rewards:db.prepare('SELECT session_id FROM battle_reward_receipts WHERE owner_account_id=?').all(currentOwner)},'upgrade');
  }
}

function importFriendCaches(db,owner,data,origin=null){
  const rewarded=new Set(data.rewards.map(row=>row.session_id));
  for(const row of data.sessions){const session=parse(row.data_json);if(rewarded.has(row.id)||!friendCache(session,owner))continue;
    const report=data.reports.find(value=>value.session_id===row.id)||null,legacy=JSON.stringify({session:row,report});
    const cache={action_id:cacheId(row.id),session_id:row.id,command_json:JSON.stringify({type:'friend-cache',roomId:session.room.id}),result_json:JSON.stringify({session,...(report?{report:parse(report.data_json)}:{})}),legacy_row_json:legacy};
    if(!cacheRow(cache,owner)||!cacheLegacy(cache,owner))continue;
    db.prepare('INSERT OR IGNORE INTO battle_transport_journal(owner_account_id,action_id,session_id,command_json,result_json,legacy_row_json,projection_origin) VALUES(?,?,?,?,?,?,?)').run(owner,...JOURNAL_COLUMNS.map(key=>cache[key]),origin);
  }
}
function cloudBattle(data,owner,db){
  const caches=new Map(data.transportJournal.filter(row=>cacheRow(row,owner)&&cacheLegacy(row,owner)).map(row=>[row.session_id,row]));
  const keep=(row,kind)=>{const cache=caches.get(kind==='session'?row.id:row.session_id);if(!cache)return true;const seal=db.prepare('SELECT legacy_row_json,projection_origin FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,cache.action_id),before=parse(cache.legacy_row_json)[kind],columns=kind==='session'?SESSION_COLUMNS:REPORT_COLUMNS;return !seal||!['upgrade','readback'].includes(seal.projection_origin)||seal.legacy_row_json!==cache.legacy_row_json||!before||!columns.every(key=>row[key]===before[key]);};
  return {...data,sessions:data.sessions.filter(row=>keep(row,'session')),reports:data.reports.filter(row=>keep(row,'report')),actions:cloudActions(data,owner,db)};
}
function belongsToSession(row,session,owner){
  const command=parse(row.command_json),result=parse(row.result_json);
  if(row.session_id===session.id||command?.type?.startsWith('cloud:')&&result?.session?.id===session.id)return true;
  return choice(row,command,result,owner)&&row.action_id===`${command.type}:${session.room?.invitation_id}`&&command.petId===session.player?.petId;
}

function cloudActions(data,owner,db){
  const mapped=new Map(data.transportJournal.map(row=>[row.action_id,row]));
  const sessions=sessionMap(data,owner);
  return data.actions.filter(row=>{
    const journal=mapped.get(row.action_id),origin=parse(journal?.legacy_row_json);
    if(!journal||!sameRow(row,journal.legacy_row_json)||!transportRow(origin,sessions,owner))return true;
    // The serialized marker alone grants no projection privilege. Only the
    // local upgrade or the verified authority-readback path can seal this row.
    const seal=db.prepare('SELECT legacy_row_json,projection_origin FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
    return !seal||!['upgrade','readback'].includes(seal.projection_origin)||seal.legacy_row_json!==journal.legacy_row_json;
  });
}

module.exports={COLUMNS,JOURNAL_COLUMNS,parse,rowBytes,sameRow,transportRow,upgradeTransportJournal,cloudActions,cloudBattle,cacheId,cacheRow,cacheLegacy,friendCache,importFriendCaches,belongsToSession,sameCommandInput,sessionMap};
