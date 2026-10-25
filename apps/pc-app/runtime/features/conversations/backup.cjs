/* eslint-disable @typescript-eslint/no-require-imports -- Shared SQLite archive adapter. */
const { normalizeConnection } = require('./transport.cjs');

// This version-1 wire shape is deliberately compatible with existing full saves.
// Only these fields travel; local SQLite cursors and all credential blobs stay here.
const fields = {
  conversation_profiles: ['owner_account_id','pet_id','persona','reply_style','memory_enabled','pause_while_chatting','use_override','revision','updated_at'],
  conversation_connections: ['owner_account_id','scope','scope_id','provider','base_url','model','context_chars','max_output_tokens','revision','updated_at'],
  conversation_messages: ['id','owner_account_id','pet_id','action_id','role','content','status','error_code','provider','model','attempt','created_at','updated_at'],
  conversation_memories: ['id','owner_account_id','pet_id','content','revision','created_at','updated_at'],
  conversation_preferences: ['owner_account_id','selected_pet_id']
};
const names = Object.keys(fields);
const primary = {
  conversation_profiles: ['pet_id'], conversation_connections: ['scope','scope_id'],
  conversation_messages: ['id'], conversation_memories: ['pet_id','id'], conversation_preferences: ['owner_account_id']
};
const schema = Object.fromEntries(names.map(name => [name, fields[name].join('|')]));
const fail = (message, code = 'CONVERSATION_BACKUP_INVALID') => { throw Object.assign(new Error(message), { code }); };
const text = (value, max, empty = false) => typeof value === 'string' && value.length <= max && (empty || value.length > 0) && !value.includes('\0');
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const key = (name, row) => JSON.stringify(primary[name].map(field => row[field]));
const equal = (a, b, keys) => keys.every(field => a[field] === b[field]);
const interrupted = row => ['pending','streaming'].includes(row.status) ? { ...row, status:'cancelled', error_code:'INTERRUPTED' } : { ...row };

/** Merge two observed message orders without inventing timestamps or changing IDs.
 * Shared IDs act as anchors, so importing an old prefix cannot append it after a
 * newer local tail. Concurrent disjoint turns use a deterministic tie break.
 * Contradictory observed orders are a conflict, never a silent reorder. */
function mergeOrder(local, incoming, rows) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const next = new Map(rows.map(row => [row.id, new Set()]));
  const degree = new Map(rows.map(row => [row.id, 0]));
  for (const sequence of [local, incoming]) {
    for (let index = 1; index < sequence.length; index++) {
      const from = sequence[index - 1].id, to = sequence[index].id;
      if (!next.get(from).has(to)) { next.get(from).add(to); degree.set(to, degree.get(to) + 1); }
    }
  }
  const compare = (a, b) => byId.get(a).created_at - byId.get(b).created_at || (a < b ? -1 : a > b ? 1 : 0);
  const ready = [...degree].filter(([, count]) => count === 0).map(([id]) => id).sort(compare);
  const ordered = [];
  while (ready.length) {
    const id = ready.shift(); ordered.push(byId.get(id));
    for (const target of next.get(id)) {
      degree.set(target, degree.get(target) - 1);
      if (degree.get(target) === 0) { ready.push(target); ready.sort(compare); }
    }
  }
  if (ordered.length !== rows.length) fail('两端聊天顺序有冲突，请选择要恢复的版本。', 'CONVERSATION_ORDER_CONFLICT');
  return ordered;
}

function mergeMessage(previous, incoming) {
  if (!equal(previous, incoming, ['id','owner_account_id','pet_id','action_id','role','created_at'])) fail('消息编号与原归属不一致。');
  if (equal(previous, incoming, fields.conversation_messages.filter(field => field !== 'updated_at')))
    return { ...previous, updated_at:Math.max(previous.updated_at, incoming.updated_at) };
  if (previous.role === 'assistant') {
    // A single known generation may progress from a partial prefix to a terminal
    // result; a retry may advance one attempt after a failed/cancelled attempt.
    const progress = previous.attempt === incoming.attempt && previous.status !== 'complete' &&
      incoming.status === 'complete' && incoming.content.startsWith(previous.content) &&
      equal(previous, incoming, ['provider','model']);
    const retry = ['failed','cancelled'].includes(previous.status) && incoming.attempt === previous.attempt + 1;
    if (progress || retry) return incoming;
    if (previous.attempt > incoming.attempt) return previous;
  }
  fail('两端有不同的聊天内容，请保留备份后选择要恢复的版本。', 'CONVERSATION_MERGE_CONFLICT');
}

function createConversationBackupAdapter(services) {
  const db = services.db;
  const findMessage = db.prepare('SELECT * FROM conversation_messages WHERE id=?');
  const findTurn = db.prepare('SELECT id FROM conversation_messages WHERE owner_account_id=? AND pet_id=? AND action_id=? AND role=?');
  let transactionId = 0;
  function validate(data, owner) {
    if (!data || data.ownerAccountId !== owner || !data.tables ||
      Object.keys(data.tables).sort().join('|') !== [...names].sort().join('|') ||
      !data.schema || Object.keys(data.schema).sort().join('|') !== [...names].sort().join('|') ||
      names.some(name => data.schema[name] !== schema[name])) fail('聊天存档归属或字段版本不兼容。');
    for (const name of names) {
      const rows = data.tables[name], seen = new Set(), turns = new Set();
      if (!Array.isArray(rows) || rows.length > 50000) fail('聊天存档记录数量无效。');
      for (const row of rows) {
        if (!row || Object.keys(row).sort().join('|') !== [...fields[name]].sort().join('|') || row.owner_account_id !== owner ||
          Object.values(row).some(value => value !== null && !['string','number'].includes(typeof value))) fail('聊天存档含无效字段或归属。');
        if (Object.values(row).some(value => typeof value === 'number' && !integer(value))) fail('聊天存档数字无效。');
        const id = key(name, row); if (seen.has(id)) fail('聊天存档包含重复编号。'); seen.add(id);
        if (name !== 'conversation_connections' && name !== 'conversation_preferences' && !text(row.pet_id,160)) fail('伙伴编号无效。');
        if (name === 'conversation_profiles' && (!text(row.persona,2000,true) || !['natural','warm','playful','detailed'].includes(row.reply_style) ||
          !['memory_enabled','pause_while_chatting','use_override'].every(field => [0,1].includes(row[field])) || !integer(row.revision) || !integer(row.updated_at))) fail('伙伴人设无效。');
        if (name === 'conversation_connections') {
          if (!['account','pet'].includes(row.scope) || (row.scope === 'account' ? row.scope_id !== '' : !text(row.scope_id,160))) fail('模型连接归属无效。');
          try { normalizeConnection({provider:row.provider,baseUrl:row.base_url,model:row.model,contextChars:row.context_chars,maxOutputTokens:row.max_output_tokens}); }
          catch { fail('模型连接配置无效。'); }
        }
        if (name === 'conversation_preferences' && !text(row.selected_pet_id,160)) fail('聊天选择无效。');
        if (name === 'conversation_memories' && (!text(row.id,160) || !text(row.content,1000) || !integer(row.revision,1) ||
          !integer(row.created_at) || !integer(row.updated_at))) fail('伙伴记忆无效。');
        if (name === 'conversation_messages') {
          if (!text(row.id,160) || !text(row.action_id,160) || !['user','assistant'].includes(row.role) ||
            !['complete','pending','streaming','failed','cancelled'].includes(row.status) || !text(row.content,32000,true) ||
            !integer(row.attempt,1) || !integer(row.created_at) || !integer(row.updated_at) ||
            (row.error_code !== null && !text(row.error_code,160)) || (row.provider !== null && !['deepseek','openai','openai_compatible'].includes(row.provider)) ||
            (row.model !== null && !text(row.model,200))) fail('聊天消息内容无效。');
          const turn = JSON.stringify([row.pet_id,row.action_id,row.role]);
          if (turns.has(turn)) fail('一次对话包含重复角色消息。'); turns.add(turn);
          const prior = findMessage.get(row.id);
          if (prior && !equal(prior,row,['owner_account_id','pet_id','action_id','role','created_at'])) fail('消息编号已属于其他账号或伙伴。');
          const existingTurn = findTurn.get(owner,row.pet_id,row.action_id,row.role);
          if (existingTurn && existingTurn.id !== row.id) fail('对话编号与消息编号不一致。');
        }
      }
    }
  }
  function exportData(owner) {
    const tables = Object.fromEntries(names.map(name => [name, db.prepare(`SELECT ${fields[name].join(',')} FROM ${name}
      WHERE owner_account_id=? ORDER BY ${name === 'conversation_messages' ? 'sequence' : primary[name].join(',')}`).all(owner).map(row => ({...row}))]));
    tables.conversation_messages = tables.conversation_messages.map(interrupted);
    const data = { ownerAccountId:owner, schema:{...schema}, tables }; validate(data,owner); return data;
  }
  function restore(owner, data, mode) {
    validate(data,owner);
    if (!['merge','replace'].includes(mode)) fail('聊天恢复方式无效。');
    if (services.get?.('conversations')?.hasActive(owner)) fail('伙伴正在回复，请先停止回复后再恢复聊天存档。','CONVERSATION_BUSY');
    const savepoint = `conversation_archive_${++transactionId}`;
    db.exec(`SAVEPOINT ${savepoint}`);
    try {
      const localMessages = db.prepare('SELECT * FROM conversation_messages WHERE owner_account_id=? ORDER BY sequence').all(owner).map(interrupted);
      const incomingMessages = data.tables.conversation_messages.map(interrupted);
      const merged = new Map(localMessages.map(row => [row.id,row]));
      for (const row of incomingMessages) merged.set(row.id, mode === 'merge' && merged.has(row.id) ? mergeMessage(merged.get(row.id),row) : row);
      const ordered = mode === 'replace' ? incomingMessages : mergeOrder(localMessages,incomingMessages,[...merged.values()]);
      // Keep every device's credential vault even if the cloud has no connection.
      // Endpoint matching is exact; an old key cannot be sent to a new host.
      db.prepare(`DELETE FROM conversation_credentials WHERE owner_account_id=? AND (scope,scope_id,provider,base_url) IN
        (SELECT scope,scope_id,provider,base_url FROM conversation_connections WHERE owner_account_id=? AND encrypted_key IS NULL)`).run(owner,owner);
      db.prepare(`INSERT INTO conversation_credentials
        SELECT owner_account_id,scope,scope_id,provider,base_url,encrypted_key,updated_at
        FROM conversation_connections WHERE owner_account_id=? AND encrypted_key IS NOT NULL
        ON CONFLICT(owner_account_id,scope,scope_id,provider,base_url) DO UPDATE SET encrypted_key=excluded.encrypted_key,updated_at=excluded.updated_at`).run(owner);
      for (const name of names.filter(name => name !== 'conversation_messages')) {
        if (mode === 'replace') db.prepare(`DELETE FROM ${name} WHERE owner_account_id=?`).run(owner);
        for (const source of data.tables[name]) {
          const row = {...source};
          const where = ['owner_account_id',...primary[name].filter(field => field !== 'owner_account_id')];
          const prior = db.prepare(`SELECT * FROM ${name} WHERE ${where.map(field=>`${field}=?`).join(' AND ')}`).get(...where.map(field=>row[field]));
          if (prior && mode === 'merge') {
            if (name === 'conversation_preferences') continue;
            if (!equal(prior,row,fields[name].filter(field=> !['revision','updated_at'].includes(field))))
              fail('两端有不同的人设、记忆或连接，请保留备份后选择要恢复的版本。','CONVERSATION_MERGE_CONFLICT');
            row.revision = Math.max(prior.revision,row.revision); row.updated_at = Math.max(prior.updated_at,row.updated_at);
          }
          const columns = [...fields[name]];
          if (name === 'conversation_connections') {
            columns.push('encrypted_key');
            row.encrypted_key = db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=? AND scope=? AND scope_id=? AND provider=? AND base_url=?')
              .get(owner,row.scope,row.scope_id,row.provider,row.base_url)?.encrypted_key ?? null;
          }
          const identityFields = new Set(['owner_account_id',...primary[name]]);
          const update = columns.filter(field=>!identityFields.has(field)).map(field=>`${field}=excluded.${field}`);
          db.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')}) ON CONFLICT DO ${update.length ? 'UPDATE SET '+update.join(',') : 'NOTHING'}`)
            .run(...columns.map(field=>row[field]));
        }
      }
      db.prepare('DELETE FROM conversation_messages WHERE owner_account_id=?').run(owner);
      const insert = db.prepare(`INSERT INTO conversation_messages(${fields.conversation_messages.join(',')}) VALUES(${fields.conversation_messages.map(()=>'?').join(',')})`);
      for (const row of ordered) insert.run(...fields.conversation_messages.map(field=>row[field]));
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (error) { db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); db.exec(`RELEASE SAVEPOINT ${savepoint}`); throw error; }
  }
  return { id:'conversations',version:1,tables:[...names,'conversation_legacy_imports'],export:exportData,validate,restore };
}
module.exports = { createConversationBackupAdapter, mergeOrder };
