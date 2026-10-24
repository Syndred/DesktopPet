const { normalizeConnection } = require('../features/conversations/transport.cjs');
const names = ['conversation_profiles','conversation_connections','conversation_messages','conversation_memories','conversation_preferences'];
const fail = message => { throw Object.assign(new Error(message), { code: 'CONVERSATION_BACKUP_INVALID' }); };

/** Stable message IDs travel between installations. SQLite's local sequence and
 * DPAPI credentials do not: the receiving database allocates its own sequence. */
function createConversationBackupAdapter(services) {
  const db = services.db;
  const columns = Object.fromEntries(names.map(name => [name, db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name).filter(c => !['sequence','encrypted_key'].includes(c))]));
  const schema = Object.fromEntries(names.map(name => [name, columns[name].join('|')]));
  function validate(data, owner) {
    if (!data || data.ownerAccountId !== owner || !data.tables || Object.keys(data.tables).sort().join('|') !== [...names].sort().join('|')) fail('聊天备份归属或结构无效。');
    if (!data.schema || names.some(name => data.schema[name] !== schema[name])) fail('聊天备份字段版本不兼容。');
    for (const name of names) {
      const rows = data.tables[name];
      if (!Array.isArray(rows) || rows.length > 50000) fail('聊天备份记录数量无效。');
      const ids = new Set();
      for (const row of rows) {
        if (!row || Object.keys(row).sort().join('|') !== [...columns[name]].sort().join('|') || row.owner_account_id !== owner || Object.values(row).some(value => value !== null && !['string','number'].includes(typeof value))) fail('聊天备份包含归属不匹配或无效字段。');
        if (Object.values(row).some(value => typeof value === 'number' && !Number.isSafeInteger(value))) fail('聊天备份数字无效。');
        if (name === 'conversation_connections') normalizeConnection({ provider: row.provider, baseUrl: row.base_url, model: row.model, contextChars: row.context_chars, maxOutputTokens: row.max_output_tokens });
        if (name === 'conversation_messages') {
          if (typeof row.id !== 'string' || ids.has(row.id) || !['user','assistant'].includes(row.role) || !['complete','pending','streaming','failed','cancelled'].includes(row.status) || typeof row.content !== 'string' || row.content.length > 32000) fail('聊天消息内容或编号无效。');
          ids.add(row.id);
          const prior = db.prepare('SELECT owner_account_id FROM conversation_messages WHERE id=?').get(row.id);
          if (prior && prior.owner_account_id !== owner) fail('消息编号已属于其他账号。');
        }
      }
    }
  }
  function exportData(owner) {
    return { ownerAccountId: owner, schema, tables: Object.fromEntries(names.map(name => [name, db.prepare(`SELECT ${columns[name].join(',')} FROM ${name} WHERE owner_account_id=?${name === 'conversation_messages' ? ' ORDER BY sequence' : ''}`).all(owner)])) };
  }
  function restore(owner, data, mode) {
    validate(data, owner);
    if (services.get('conversations')?.hasActive(owner)) fail('伙伴正在回复，请先停止回复后再恢复聊天存档。');
    if (mode === 'replace') for (const name of names.filter(name => name !== 'conversation_connections')) db.prepare(`DELETE FROM ${name} WHERE owner_account_id=?`).run(owner);
    for (const name of names) {
      const fields = columns[name];
      if (name === 'conversation_connections') {
        for (const row of data.tables[name]) {
          const prior = db.prepare('SELECT * FROM conversation_connections WHERE owner_account_id=? AND scope=? AND scope_id=?').get(owner,row.scope,row.scope_id);
          if (prior && mode === 'merge') continue;
          const key = prior && prior.provider === row.provider && prior.base_url === row.base_url ? prior.encrypted_key : null;
          db.prepare(`INSERT INTO conversation_connections(${fields.join(',')},encrypted_key) VALUES(${[...fields,'encrypted_key'].map(() => '?').join(',')}) ON CONFLICT(owner_account_id,scope,scope_id) DO UPDATE SET ${fields.filter(field => !['owner_account_id','scope','scope_id'].includes(field)).map(field => `${field}=excluded.${field}`).join(',')},encrypted_key=excluded.encrypted_key`).run(...fields.map(field => row[field]),key);
        }
      } else {
        const insert = db.prepare(`INSERT INTO ${name}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`);
        for (const source of data.tables[name]) {
          const row = { ...source };
          if (name === 'conversation_messages' && ['pending','streaming'].includes(row.status)) { row.status = 'cancelled'; row.error_code = 'INTERRUPTED'; }
          insert.run(...fields.map(field => row[field]));
        }
      }
    }
  }
  return { id:'conversations', version:1, tables:names, export:exportData, validate, restore };
}
module.exports = { createConversationBackupAdapter };
