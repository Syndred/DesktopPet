const { atomic, CompanionError } = require('./service.cjs');
const tables = ['companion_accounts', 'companion_pets', 'companion_actions', 'companion_legacy_archive', 'companion_interactions', 'companion_capture_receipts'];
const stop = message => { throw new CompanionError('OWNER_MIGRATION_REQUIRED', message); };

/** Trusted main-only adapter. A verified alias can move a pre-Accounts save into
 * its canonical namespace; two independently changed saves are never combined. */
function createCompanionOwnerMigration(services, changed) {
  const db = services.db;
  function migrate(input) {
    const source = input?.sourceOwnerAccountId, target = input?.targetOwnerAccountId;
    const identity = services.get('accounts')?.identity(target);
    if (!identity || services.session.getOwnerAccountId() !== target || identity.provider !== input.provider || identity.subject_id !== input.subjectId || input.subjectId !== source || source === target) stop('伙伴归属迁移需要当前账号的已验证身份');
    const alias = db.prepare("SELECT 1 FROM account_aliases WHERE owner_account_id=? AND subject_id=? AND provider=? AND evidence='legacy-id'").get(target, source, input.provider);
    if (!alias || db.prepare('SELECT 1 FROM account_identities WHERE subject_id=? AND provider<>?').get(source, input.provider)) stop('旧伙伴归属存在歧义，原始记录已保留');
    const prior = db.prepare('SELECT target_owner_account_id FROM companion_identity_imports WHERE source_owner_account_id=?').get(source);
    if (prior) { if (prior.target_owner_account_id !== target) stop('旧伙伴已关联另一身份'); return { ok: true, duplicate: true }; }
    const original = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} WHERE owner_account_id=?`).all(source)]));
    if (!original.companion_accounts.length) return { ok: true, imported: 0 };
    return atomic(db, () => {
      const current = db.prepare('SELECT * FROM companion_accounts WHERE owner_account_id=?').get(target);
      const currentPets = db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=?').all(target).map(row => JSON.parse(row.data_json));
      const pristine = (!current || current.revision <= 1) && currentPets.every(pet => pet.source === 'legacy' && pet.revision === 1)
        && ['companion_actions','companion_interactions','companion_capture_receipts'].every(table => !db.prepare(`SELECT 1 FROM ${table} WHERE owner_account_id=? LIMIT 1`).get(target));
      if (!pristine) stop('新旧伙伴存档都有独立进度，已完整保留，不能自动覆盖或拼接');
      const rewrite = value => {
        if (Array.isArray(value)) return value.map(rewrite);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key,item]) => [key, key === 'ownerAccountId' && item === source ? target : rewrite(item)]));
        return value;
      };
      for (const table of [...tables].reverse()) db.prepare(`DELETE FROM ${table} WHERE owner_account_id=?`).run(target);
      for (const table of tables) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
        const insert = db.prepare(`INSERT INTO ${table}(${columns.join(',')}) VALUES(${columns.map(() => '?').join(',')})`);
        for (const row of original[table]) {
          const next = { ...row, owner_account_id: target };
          if (table === 'companion_accounts') next.legacy_imported_at ||= new Date().toISOString();
          for (const key of ['data_json','result_json']) if (typeof next[key] === 'string') next[key] = JSON.stringify(rewrite(JSON.parse(next[key])));
          insert.run(...columns.map(column => next[column]));
        }
      }
      db.prepare('INSERT INTO companion_identity_imports VALUES(?,?,?,?)').run(source, target, JSON.stringify(original), new Date().toISOString());
      changed(target); return { ok: true, imported: original.companion_pets.length };
    });
  }
  function ensure(target) {
    const identity = services.get('accounts')?.identity(target);
    if (!identity || services.session.getOwnerAccountId() !== target) return;
    const aliases = db.prepare("SELECT subject_id,provider FROM account_aliases WHERE owner_account_id=? AND evidence='legacy-id'").all(target);
    for (const alias of aliases) if (alias.subject_id !== target && db.prepare('SELECT 1 FROM companion_accounts WHERE owner_account_id=?').get(alias.subject_id)) migrate({ sourceOwnerAccountId: alias.subject_id, targetOwnerAccountId: target, provider: alias.provider, subjectId: alias.subject_id });
  }
  return { migrate, ensure };
}
module.exports = { createCompanionOwnerMigration };
