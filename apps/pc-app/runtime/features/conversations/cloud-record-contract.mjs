export const fields = Object.freeze({
  conversation_profiles: ['owner_account_id','pet_id','persona','reply_style','memory_enabled','pause_while_chatting','use_override','revision','updated_at'],
  conversation_connections: ['owner_account_id','scope','scope_id','provider','base_url','model','context_chars','max_output_tokens','revision','updated_at'],
  conversation_messages: ['id','owner_account_id','pet_id','action_id','role','content','status','error_code','provider','model','attempt','created_at','updated_at'],
  conversation_memories: ['id','owner_account_id','pet_id','content','revision','created_at','updated_at'],
  conversation_preferences: ['owner_account_id','selected_pet_id']
});
export const primary = Object.freeze({
  conversation_profiles: ['pet_id'], conversation_connections: ['scope','scope_id'],
  conversation_messages: ['id'], conversation_memories: ['pet_id','id'], conversation_preferences: ['owner_account_id']
});
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value,max,empty=false) => typeof value === 'string' && value.length <= max && (empty || value.length > 0) && !value.includes('\0');
const integer = (value,min=0,max=Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const invalid = () => { throw Object.assign(new Error('聊天记录格式无效。'),{code:'RECORD_INVALID'}); };
export function recordId(collection, document) {
  if (!Object.hasOwn(primary,collection) || !object(document)) invalid();
  return JSON.stringify(primary[collection].map(name => document[name]));
}
export function validateRecord(owner, collection, id, document) {
  if (!Object.hasOwn(fields,collection) || !object(document) || document.owner_account_id !== owner || recordId(collection,document) !== id ||
    Object.keys(document).sort().join('|') !== [...fields[collection]].sort().join('|')) invalid();
  const row = document;
  if ('pet_id' in row && !text(row.pet_id,160) || 'selected_pet_id' in row && !text(row.selected_pet_id,160)) invalid();
  if ('revision' in row && !integer(row.revision) || 'updated_at' in row && !integer(row.updated_at) || 'created_at' in row && !integer(row.created_at)) invalid();
  if (collection === 'conversation_profiles' && (!text(row.persona,2000,true) || !text(row.reply_style,32) ||
    ['memory_enabled','pause_while_chatting','use_override'].some(name => ![0,1].includes(row[name])))) invalid();
  if (collection === 'conversation_connections') {
    if (!['account','pet'].includes(row.scope) || !text(row.scope_id,160,row.scope === 'account') || row.scope === 'account' && row.scope_id !== '' ||
      !text(row.provider,80) || !text(row.base_url,2048) || !text(row.model,200) || !integer(row.context_chars,1,1000000) || !integer(row.max_output_tokens,1,1000000)) invalid();
    let url; try { url = new URL(row.base_url); } catch { invalid(); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) invalid();
  }
  if (collection === 'conversation_messages' && (!text(row.id,160) || !text(row.action_id,160) || !text(row.content,1000000,true) ||
    !['user','assistant'].includes(row.role) || !['complete','pending','streaming','failed','cancelled'].includes(row.status) || !integer(row.attempt,1) ||
    ['error_code','provider','model'].some(name => row[name] !== null && !text(row[name],200)))) invalid();
  if (collection === 'conversation_memories' && (!text(row.id,160) || !text(row.content,1000) || !integer(row.revision,1))) invalid();
  return document;
}
export function validateChanges(owner, changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 100) invalid();
  const seen = new Set();
  for (const change of changes) {
    if (!object(change) || !['baseRevision|collection|document|id','baseRevision|beforeId|collection|document|id'].includes(Object.keys(change).sort().join('|')) ||
      !Object.hasOwn(fields,change.collection) || !text(change.id,1024) || !integer(change.baseRevision)) invalid();
    if ('beforeId' in change && (change.collection !== 'conversation_messages' || change.baseRevision !== 0 || change.document === null || !text(change.beforeId,1024) || change.beforeId === change.id)) invalid();
    const key = JSON.stringify([change.collection,change.id]); if (seen.has(key)) invalid(); seen.add(key);
    if (change.document !== null) validateRecord(owner,change.collection,change.id,change.document);
  }
  return changes;
}
