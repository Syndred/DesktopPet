const { randomUUID } = require("node:crypto");
const { readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const { invariant } = require("./errors.cjs");
const { checksum, canonical, writeNew, transaction, actionId } = require("./util.cjs");
const { validateSettings } = require("./settings.cjs");
const { createLegacyBackupAdapter } = require("./legacy.cjs");

const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const identifier = value => {
  invariant(typeof value === "string" && /^[a-z][a-z0-9_]*$/i.test(value), "INVALID_BACKUP_TABLE", "存档表名无效。");
  return `"${value}"`;
};
const secretColumn = /(^|_)(password|password_hash|api_key|secret|session_token|access_token|refresh_token|credential)(_|$)/i;

function liveTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .filter(({ name }) => !name.startsWith("account_") && /^[a-z][a-z0-9_]*$/i.test(name))
    .map(({ name }) => ({ name, columns: db.prepare(`PRAGMA table_info(${identifier(name)})`).all() }))
    .filter(({ columns }) => columns.some(c => c.name === "owner_account_id"));
}
function tableSchema(columns) { return columns.map(c => ({ name: c.name, type: c.type, notnull: c.notnull, pk: c.pk, dflt_value: c.dflt_value })); }
function encodeCell(value) {
  if (value instanceof Uint8Array) return { $binary: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return { $integer: value.toString() };
  return value;
}
function decodeCell(value) {
  if (value && typeof value === "object" && typeof value.$binary === "string") return Buffer.from(value.$binary, "base64");
  if (value && typeof value === "object" && /^-?\d+$/.test(value.$integer || "")) return BigInt(value.$integer);
  invariant(value === null || ["string", "number"].includes(typeof value), "INVALID_BACKUP", "存档字段类型无效。");
  return value;
}

/** Automatically covers each feature's owner_account_id tables on the shared connection.
 * Tables containing secrets are excluded and visibly reported; custom adapters can override tables. */
class BackupManager {
  constructor({ db, directory, getIdentity }) {
    this.db = db; this.directory = directory; this.getIdentity = getIdentity;
    this.adapters = new Map(); this.previews = new Map();
    this.register(createLegacyBackupAdapter(db));
    this.register({
      id: "settings", version: 1,
      export: owner => {
        const row = db.prepare("SELECT document FROM account_settings WHERE owner_account_id=?").get(owner);
        return row ? JSON.parse(row.document) : null;
      },
      validate: data => { if (data !== null) validateSettings(data); },
      restore: (owner, data, mode) => {
        if (data === null) return;
        const exists = db.prepare("SELECT revision FROM account_settings WHERE owner_account_id=?").get(owner);
        if (exists && mode === "merge") return;
        db.prepare(`INSERT INTO account_settings VALUES(?,?,?,?) ON CONFLICT(owner_account_id)
          DO UPDATE SET revision=account_settings.revision+1,document=excluded.document,updated_at=excluded.updated_at`)
          .run(owner, (exists?.revision || 0) + 1, JSON.stringify(validateSettings(data)), new Date().toISOString());
      }
    });
  }
  register(adapter) {
    invariant(adapter?.id && Number.isInteger(adapter.version) && ["export", "validate", "restore"].every(k => typeof adapter[k] === "function"),
      "INVALID_BACKUP_ADAPTER", "存档适配器不完整。");
    invariant(!this.adapters.has(adapter.id), "DUPLICATE_BACKUP_ADAPTER", "存档适配器已注册。");
    this.adapters.set(adapter.id, adapter);
    return () => this.adapters.delete(adapter.id);
  }
  snapshot(owner) {
    const identity = this.getIdentity(owner);
    invariant(identity, "LOGIN_REQUIRED", "请先登录。");
    return transaction(this.db, () => {
      const modules = {}, tables = {}, excluded = [];
      for (const [id, adapter] of this.adapters) {
        const data = adapter.export(owner, this.db);
        invariant(!data?.then, "ASYNC_BACKUP_ADAPTER", "存档读取适配器必须同步执行。");
        adapter.validate(data, owner, this.db);
        modules[id] = { version: adapter.version, data };
      }
      const claimed = new Set([...this.adapters.values()].flatMap(a => a.tables || []));
      for (const table of liveTables(this.db)) {
        if (claimed.has(table.name)) continue;
        if (table.columns.some(c => secretColumn.test(c.name))) { excluded.push(table.name); continue; }
        const rows = this.db.prepare(`SELECT * FROM ${identifier(table.name)} WHERE owner_account_id=?`).all(owner);
        tables[table.name] = {
          schema: tableSchema(table.columns), rows: rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, encodeCell(v)])))
        };
      }
      const body = { format: "lingjing-account-save", version: 1, ownerAccountId: owner,
        identity: { provider: identity.provider, subjectId: identity.subject_id },
        createdAt: new Date().toISOString(), data: { modules, tables }, excluded };
      return { ...body, checksum: checksum(body) };
    });
  }
  dataChecksum(owner) { return checksum(this.snapshot(owner).data); }
  validate(envelope, owner) {
    invariant(envelope?.format === "lingjing-account-save" && envelope.version === 1, "BACKUP_VERSION_UNSUPPORTED", "备份版本不兼容，请使用匹配版本的灵境。");
    const { checksum: digest, ...body } = envelope;
    invariant(typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest) && checksum(body) === digest, "BACKUP_CHECKSUM_MISMATCH", "备份完整性校验失败。");
    invariant(body.ownerAccountId === owner, "BACKUP_OWNER_MISMATCH", "此备份属于其他账号，请先登录对应账号。");
    const identity = this.getIdentity(owner);
    invariant(identity && body.identity?.provider === identity.provider && body.identity?.subjectId === identity.subject_id,
      "BACKUP_OWNER_MISMATCH", "备份身份与当前账号不一致。");
    invariant(body.data?.modules && body.data?.tables && typeof body.data.modules === "object" && !Array.isArray(body.data.modules)
      && typeof body.data.tables === "object" && !Array.isArray(body.data.tables), "INVALID_BACKUP", "备份内容不完整。");
    for (const [id, module] of Object.entries(body.data.modules)) {
      const adapter = this.adapters.get(id);
      invariant(adapter && module?.version === adapter.version, "BACKUP_MODULE_UNSUPPORTED", `无法恢复模块 ${id}，请安装对应模块版本。`);
      adapter.validate(module.data, owner, this.db);
    }
    const available = new Map(liveTables(this.db).map(t => [t.name, t]));
    for (const [name, table] of Object.entries(body.data.tables)) {
      const live = available.get(name);
      invariant(live && !live.columns.some(c => secretColumn.test(c.name)) && checksum(table?.schema) === checksum(tableSchema(live.columns)),
        "BACKUP_SCHEMA_MISMATCH", `模块 ${name} 的数据版本不兼容。`);
      invariant(Array.isArray(table.rows), "INVALID_BACKUP", "备份记录无效。");
      const keys = live.columns.map(c => c.name).sort().join("|");
      for (const row of table.rows) {
        invariant(row && Object.keys(row).sort().join("|") === keys && row.owner_account_id === owner,
          "BACKUP_OWNER_MISMATCH", "备份中包含归属不匹配或无效的记录。");
        Object.values(row).forEach(decodeCell);
      }
    }
    invariant(Buffer.byteLength(canonical(envelope)) <= MAX_BACKUP_BYTES, "BACKUP_TOO_LARGE", "备份超过 25 MB 限制。");
    return envelope;
  }
  save(owner, filePath, reason = "export") {
    const snapshot = this.snapshot(owner);
    const id = randomUUID();
    const file = filePath || join(this.directory, `${reason}-${Date.now()}-${id}.lingjing.json`);
    // 'wx' refuses to overwrite an existing file, including a previous backup.
    writeNew(file, JSON.stringify(snapshot, null, 2));
    this.db.prepare("INSERT INTO account_backup_receipts VALUES(?,?,?,?,?,?)")
      .run(id, owner, snapshot.checksum, file, reason, new Date().toISOString());
    return { id, filePath: file, checksum: snapshot.checksum, excluded: snapshot.excluded };
  }
  preview(owner, file) {
    invariant(statSync(file).size <= MAX_BACKUP_BYTES, "BACKUP_TOO_LARGE", "备份超过 25 MB 限制。");
    let envelope;
    try { envelope = JSON.parse(readFileSync(file, "utf8")); } catch { invariant(false, "INVALID_BACKUP", "无法读取备份文件。"); }
    this.validate(envelope, owner);
    const id = randomUUID();
    const currentChecksum = this.dataChecksum(owner);
    // Bound retained imports; preview payloads never contain paths selected by the renderer.
    for (const [key, value] of this.previews) if (value.expiresAt < Date.now()) this.previews.delete(key);
    invariant(this.previews.size < 8, "TOO_MANY_PREVIEWS", "待恢复预览过多，请稍后重试。");
    this.previews.set(id, { owner, envelope, currentChecksum, expiresAt: Date.now() + 10 * 60 * 1000 });
    return { previewId: id, checksum: envelope.checksum, currentChecksum, createdAt: envelope.createdAt,
      modules: Object.keys(envelope.data.modules), tables: Object.entries(envelope.data.tables).map(([name, t]) => ({ name, count: t.rows.length })),
      excluded: envelope.excluded || [] };
  }
  restore(owner, { previewId, actionId: inputActionId, mode = "merge" }) {
    const id = actionId(inputActionId);
    const previous = this.db.prepare("SELECT kind,input_hash,result FROM account_actions WHERE owner_account_id=? AND action_id=?").get(owner, id);
    const inputHash = checksum({ previewId, mode });
    if (previous) {
      invariant(previous.kind === "restore" && previous.input_hash === inputHash, "ACTION_ID_REUSED", "操作标识已用于其他请求。");
      return { ...JSON.parse(previous.result), duplicate: true };
    }
    const preview = this.previews.get(previewId);
    invariant(preview && preview.owner === owner && preview.expiresAt > Date.now(), "BACKUP_PREVIEW_EXPIRED", "恢复预览已过期，请重新选择备份。");
    invariant(mode === "merge" || mode === "replace", "INVALID_RESTORE_MODE", "恢复方式无效。");
    this.validate(preview.envelope, owner);
    invariant(this.dataChecksum(owner) === preview.currentChecksum, "SAVE_CHANGED", "存档在预览后发生变化，请重新预览。");
    const preserved = this.save(owner, null, "before-restore");
    const result = transaction(this.db, () => {
      const { modules, tables } = preview.envelope.data;
      const names = Object.keys(tables);
      const ordered = [], visiting = new Set(), visited = new Set();
      const visit = name => {
        if (visited.has(name)) return;
        invariant(!visiting.has(name), "BACKUP_RELATION_CYCLE", "存档表存在循环关系，需要专用恢复适配器。");
        visiting.add(name);
        for (const fk of this.db.prepare(`PRAGMA foreign_key_list(${identifier(name)})`).all()) if (names.includes(fk.table)) visit(fk.table);
        visiting.delete(name); visited.add(name); ordered.push(name);
      };
      names.forEach(visit);
      if (mode === "replace") for (const name of [...ordered].reverse()) {
        this.db.prepare(`DELETE FROM ${identifier(name)} WHERE owner_account_id=?`).run(owner);
      }
      for (const [moduleId, data] of Object.entries(modules)) {
        const value = this.adapters.get(moduleId).restore(owner, data.data, mode, this.db);
        invariant(!value?.then, "ASYNC_BACKUP_ADAPTER", "存档恢复适配器必须同步执行。");
      }
      for (const name of ordered) {
        const table = tables[name];
        if (!table.rows.length) continue;
        const columns = table.schema.map(c => c.name);
        const query = this.db.prepare(`INSERT INTO ${identifier(name)}
          (${columns.map(identifier).join(",")}) VALUES(${columns.map(() => "?").join(",")})${mode === "merge" ? " ON CONFLICT DO NOTHING" : ""}`);
        for (const row of table.rows) query.run(...columns.map(c => decodeCell(row[c])));
      }
      const restored = { restored: true, mode, preservedBackup: preserved, checksum: this.dataChecksum(owner) };
      this.db.prepare("INSERT INTO account_actions VALUES(?,?,?,?,?,?)")
        .run(owner, id, "restore", inputHash, JSON.stringify(restored), new Date().toISOString());
      return restored;
    });
    this.previews.delete(previewId);
    return result;
  }
  list(owner) {
    return this.db.prepare("SELECT id,checksum,file_path AS filePath,reason,created_at AS createdAt FROM account_backup_receipts WHERE owner_account_id=? ORDER BY created_at DESC LIMIT 30").all(owner);
  }
}
module.exports = { BackupManager, MAX_BACKUP_BYTES };
