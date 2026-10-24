const { createHash, randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");
const { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync, existsSync } = require("node:fs");
const { dirname } = require("node:path");
const { invariant } = require("./errors.cjs");

function canonical(value) {
  invariant(value !== undefined && !["function", "symbol", "bigint"].includes(typeof value)
    && !(typeof value === "number" && !Number.isFinite(value)), "NON_JSON_DOCUMENT", "存档包含不能保存的字段类型。");
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  invariant(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    "NON_JSON_DOCUMENT", "存档适配器需返回普通 JSON 数据。");
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function checksum(value) { return createHash("sha256").update(canonical(value)).digest("hex"); }
// SQL table rows are sets: query plans may return them in a different order.
// Specialized message/history arrays keep their order and remain significant.
function saveDataChecksum(data) {
  const sortRows = rows => [...rows].sort((a,b) => { const left=canonical(a),right=canonical(b); return left < right ? -1 : left > right ? 1 : 0; });
  const modules = { ...data.modules };
  const garden = modules.garden;
  if (garden?.data?.tables) modules.garden = { ...garden, data: { ...garden.data,
    tables: Object.fromEntries(Object.entries(garden.data.tables).map(([name,rows]) => [name, sortRows(rows)])) } };
  const tables = Object.fromEntries(Object.entries(data.tables).map(([name,table]) => [name, { ...table, rows: sortRows(table.rows) }]));
  return checksum({ ...data, modules, tables });
}
function atomicWrite(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomBytes(8).toString("hex")}.tmp`;
  const fd = openSync(temp, "wx", 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temp, file);
}
function writeNew(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const fd = openSync(file, "wx", 0o600);
  try { writeFileSync(fd, data); fsyncSync(fd); } finally { closeSync(fd); }
}
function archiveOnce(file, data) { if (!existsSync(file)) writeNew(file, data); return file; }
function transaction(db, fn) {
  const savepoint = `accounts_${randomBytes(6).toString("hex")}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const value = fn();
    invariant(!value?.then, "ASYNC_TRANSACTION", "事务适配器必须同步执行。");
    db.exec(`RELEASE ${savepoint}`);
    return value;
  } catch (error) { db.exec(`ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`); throw error; }
}
function accountName(value) {
  const v = typeof value === "string" ? value.trim() : "";
  invariant(v.length >= 3 && v.length <= 32 && !/\s/.test(v), "INVALID_ACCOUNT", "账号需为 3–32 个字符，不能含空格。");
  return v;
}
function username(value) {
  const v = typeof value === "string" ? value.trim() : "";
  invariant(v.length >= 2 && v.length <= 24, "INVALID_USERNAME", "用户名需为 2–24 个字符。");
  return v;
}
function password(value) {
  // Retain the legacy account protocol's trim rule; do not silently change old credentials.
  const v = typeof value === "string" ? value.trim() : "";
  invariant(v.length >= 6 && v.length <= 64, "INVALID_PASSWORD", "密码需为 6–64 个字符。");
  return v;
}
function hashPassword(value) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(value, salt, 64).toString("hex")}`;
}
function verifyPassword(value, hash) {
  if (typeof hash !== "string") return false;
  let expected, actual;
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    expected = Buffer.from(hash, "hex");
    actual = createHash("sha256").update(value).digest();
  } else {
    const pieces = hash.split("$");
    if (pieces.length !== 3 || pieces[0] !== "scrypt" || !/^[a-f0-9]{32}$/.test(pieces[1]) || !/^[a-f0-9]{128}$/.test(pieces[2])) return false;
    expected = Buffer.from(pieces[2], "hex"); actual = scryptSync(value, pieces[1], 64);
  }
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function actionId(value) {
  invariant(typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(value), "INVALID_ACTION_ID", "操作标识无效，请重试。");
  return value;
}
function publicIdentity(row) {
  if (!row) return null;
  return { id: row.owner_account_id, subjectId: row.subject_id, ownerAccountId: row.owner_account_id, provider: row.provider,
    account: row.account, username: row.username, revision: row.profile_revision,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
module.exports = { saveDataChecksum, canonical, checksum, atomicWrite, writeNew, archiveOnce, transaction,
  accountName, username, password, hashPassword, verifyPassword, actionId, publicIdentity };
