/* eslint-disable @typescript-eslint/no-require-imports -- Account-scoped legacy data migration. */
const { createHash } = require('node:crypto');
const { createConversationBackupAdapter } = require('./backup.cjs');
const { ConversationError } = require('./errors.cjs');
const digest = value => createHash('sha256').update(value).digest('hex');
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 160 && !value.includes('\0');
const content = value => typeof value === 'string' && value.trim().length > 0 && !value.includes('\0');
const timestamp = value => {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 100000000000 ? value : 0;
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
};

/** Read only the already owner-mapped archive supplied by accounts. Never scan
 * renderer localStorage, guess an account from a name, or import a legacy key. */
function buildLegacyConversationImport({ db, owner, pets, store, unassignedPetId = null }) {
  if (unassignedPetId !== null && !pets.some(pet => pet.petId === unassignedPetId)) throw new ConversationError('PET_NOT_FOUND');
  const adapter = createConversationBackupAdapter({db});
  const envelope = adapter.export(owner);
  for (const name of Object.keys(envelope.tables)) envelope.tables[name] = [];
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_legacy_data'").get();
  const archive = exists ? db.prepare('SELECT document FROM account_legacy_data WHERE owner_account_id=?').get(owner) : null;
  if (!archive) return { envelope, preview:{sourceHash:null,messages:0,memories:0,profiles:0,unresolved:0,unassigned:0,unknownDates:0,alreadyImported:false,pets:[],samples:[]} };
  const sourceHash = digest(archive.document);
  let source;
  try { source = JSON.parse(archive.document); } catch { throw new ConversationError('LEGACY_CORRUPT'); }
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new ConversationError('LEGACY_CORRUPT');
  const petNames = new Map(pets.map(pet => [pet.petId,pet.name]));
  const messages = envelope.tables.conversation_messages, memories = envelope.tables.conversation_memories, profiles = envelope.tables.conversation_profiles;
  let unresolved = 0, unassigned = 0, unknownDates = 0;
  const messageIds = new Set(), memoryIds = new Set(), profilePets = new Set();
  const petFor = (row, inherited) => {
    const value = row?.petId ?? row?.pet_id ?? inherited;
    if (id(value) && petNames.has(value)) return value;
    if (value == null || value === '') { unassigned++; return unassignedPetId; }
    return null;
  };
  function addMessages(rows, inherited, ref) {
    if (!Array.isArray(rows)) return;
    let previous = null;
    rows.forEach((row,index) => {
      const location = `${ref}:${index}`;
      if (!row || typeof row !== 'object' || !['user','assistant'].includes(row.role)) { unresolved++; previous=null; return; }
      const pet = petFor(row,inherited), body = row.content ?? row.text;
      if (!pet || !content(body) || body.length > 32000) { unresolved++;previous=null;return; }
      const messageId = id(row.id) ? row.id : `legacy-${digest(JSON.stringify([owner,sourceHash,location,pet,row.role]))}`;
      if (messageIds.has(messageId)) return;
      messageIds.add(messageId);
      const originalAction = row.actionId ?? row.action_id;
      const action = id(originalAction) ? originalAction : row.role === 'assistant' && previous?.role === 'user' && previous.pet === pet
        ? previous.action : `legacy-${digest(JSON.stringify([owner,sourceHash,location,pet,'turn']))}`;
      const created = timestamp(row.createdAt ?? row.created_at);
      if (!created) unknownDates++;
      const rawStatus = row.status;
      const interrupted = ['pending','streaming'].includes(rawStatus);
      const status = row.role === 'user' ? 'complete' : interrupted ? 'cancelled' : ['complete','failed','cancelled'].includes(rawStatus) ? rawStatus : 'complete';
      const next = {id:messageId,owner_account_id:owner,pet_id:pet,action_id:action,role:row.role,content:body,status,
        error_code:interrupted ? 'INTERRUPTED' : status === 'cancelled' ? 'CANCELLED' : status === 'failed' ? 'INTERRUPTED' : null,
        provider:null,model:null,attempt:Number.isSafeInteger(row.attempt) && row.attempt > 0 ? row.attempt : 1,
        created_at:created,updated_at:timestamp(row.updatedAt ?? row.updated_at) || created};
      const prior = db.prepare('SELECT * FROM conversation_messages WHERE id=?').get(messageId);
      if (prior && prior.owner_account_id === owner && prior.pet_id === pet && prior.role === row.role && prior.content === body)
        messages.push(Object.fromEntries(envelope.schema.conversation_messages.split('|').map(field=>[field,prior[field]])));
      else messages.push(next);
      previous = {pet,action,role:row.role};
    });
  }
  function addMemories(rows,inherited,ref) {
    if (!Array.isArray(rows)) return;
    rows.forEach((input,index) => {
      const row = typeof input === 'string' ? {content:input} : input;
      const pet = row && petFor(row,inherited), body = row?.content ?? row?.text;
      if (!pet || !content(body) || body.length > 1000) { unresolved++;return; }
      const memoryId = id(row.id) ? row.id : `legacy-${digest(JSON.stringify([owner,sourceHash,ref,index,pet,'memory']))}`;
      const memoryKey = JSON.stringify([pet,memoryId]); if (memoryIds.has(memoryKey)) return;memoryIds.add(memoryKey);
      const created = timestamp(row.createdAt ?? row.created_at);
      const prior = db.prepare('SELECT * FROM conversation_memories WHERE owner_account_id=? AND pet_id=? AND id=?').get(owner,pet,memoryId);
      memories.push(prior?.content === body ? {...prior} : {id:memoryId,owner_account_id:owner,pet_id:pet,content:body,revision:1,created_at:created,updated_at:timestamp(row.updatedAt ?? row.updated_at)||created});
    });
  }
  function addProfile(row,inherited) {
    const body = row?.persona;
    if (typeof body !== 'string' || !body.length) return;
    const pet = petFor(row,inherited);
    if (!pet || body.length > 2000 || body.includes('\0')) { unresolved++;return; }
    if (profilePets.has(pet)) return;profilePets.add(pet);
    const current = store.getProfile(owner,pet);
    profiles.push({owner_account_id:owner,pet_id:pet,persona:body,reply_style:current.replyStyle,memory_enabled:+current.memoryEnabled,
      pause_while_chatting:+current.pauseWhileChatting,use_override:+current.useOverride,revision:current.revision+(current.persona === body ? 0 : 1),updated_at:timestamp(row.updatedAt ?? row.updated_at)});
  }
  addMessages(source.messages,null,'messages');addMessages(source.chatHistory,null,'chatHistory');addMemories(source.memories,null,'memories');
  if (Array.isArray(source.chats) && source.chats.every(chat=>!Array.isArray(chat?.messages))) addMessages(source.chats,null,'chats');
  else if (Array.isArray(source.chats)) source.chats.forEach((chat,index) => {
    if (chat && Array.isArray(chat.messages)) {addMessages(chat.messages,chat.petId ?? chat.pet_id,`chats:${index}:messages`);addMemories(chat.memories,chat.petId ?? chat.pet_id,`chats:${index}:memories`);addProfile(chat,chat.petId ?? chat.pet_id);}
    else addMessages([chat],null,`chats:${index}`);
  });
  else if (source.chats && typeof source.chats === 'object') for (const [pet,rows] of Object.entries(source.chats)) addMessages(rows,pet,`chats:${pet}`);
  if (Array.isArray(source.pets)) source.pets.forEach((pet,index) => {
    const petId = pet?.petId ?? pet?.id;addMessages(pet?.messages,petId,`pets:${index}:messages`);addMessages(pet?.chatHistory,petId,`pets:${index}:chatHistory`);
    addMemories(pet?.memories,petId,`pets:${index}:memories`);addProfile(pet,petId);
  });
  if (Array.isArray(source.profiles)) source.profiles.forEach(row => addProfile(row,null));
  adapter.validate(envelope,owner);
  const seenPets = [...new Set([...messages,...memories,...profiles].map(row=>row.pet_id))];
  return {envelope,preview:{sourceHash,messages:messages.length,memories:memories.length,profiles:profiles.length,unresolved,unassigned,unknownDates,
    alreadyImported:Boolean(db.prepare('SELECT 1 FROM conversation_legacy_imports WHERE owner_account_id=? AND source_hash=?').get(owner,sourceHash)),
    pets:seenPets.map(petId=>({petId,name:petNames.get(petId)})),samples:messages.slice(0,5).map(row=>({petId:row.pet_id,role:row.role,content:row.content.slice(0,120)}))}};
}

function importLegacyConversations(options) {
  const {db,owner,sourceHash,includeSettings=true} = options;
  const built = buildLegacyConversationImport(options);
  if (!sourceHash || built.preview.sourceHash !== sourceHash) throw new ConversationError('REVISION_CONFLICT');
  if (!includeSettings) {built.envelope.tables.conversation_profiles=[];built.envelope.tables.conversation_memories=[];}
  if (!built.envelope.tables.conversation_messages.length && !built.envelope.tables.conversation_memories.length && !built.envelope.tables.conversation_profiles.length)
    throw new ConversationError('LEGACY_EMPTY');
  const adapter = createConversationBackupAdapter({db,get:()=>({hasActive:()=>Boolean(options.hasActive)})});
  db.exec('SAVEPOINT conversation_legacy_import');
  try {
    adapter.restore(owner,built.envelope,'merge');
    const result={...built.preview,imported:true,includeSettings,memories:includeSettings ? built.preview.memories : 0,profiles:includeSettings ? built.preview.profiles : 0};
    db.prepare('INSERT INTO conversation_legacy_imports VALUES(?,?,?,?) ON CONFLICT(owner_account_id,source_hash) DO UPDATE SET result=excluded.result,imported_at=excluded.imported_at')
      .run(owner,sourceHash,JSON.stringify(result),Date.now());
    db.exec('RELEASE SAVEPOINT conversation_legacy_import');return result;
  } catch(error) {db.exec('ROLLBACK TO SAVEPOINT conversation_legacy_import');db.exec('RELEASE SAVEPOINT conversation_legacy_import');throw error;}
}
module.exports = {buildLegacyConversationImport,importLegacyConversations};
