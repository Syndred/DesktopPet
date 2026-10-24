const { mkdirSync, copyFileSync, existsSync } = require('node:fs');
const { dirname } = require('node:path');
const Database = require('better-sqlite3');

function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS lingjing_migrations (
    id TEXT PRIMARY KEY, feature TEXT NOT NULL, applied_at TEXT NOT NULL
  ); CREATE TABLE IF NOT EXISTS lingjing_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  return db;
}

function migrate(db, feature, migrations = []) {
  for (const migration of migrations) {
    const id = `${feature}:${migration.id}`;
    if (db.prepare('SELECT id FROM lingjing_migrations WHERE id=?').get(id)) continue;
    db.transaction(() => {
      if (migration.sql) db.exec(migration.sql);
      if (migration.up) migration.up(db);
      db.prepare('INSERT INTO lingjing_migrations VALUES(?,?,?)').run(id, feature, new Date().toISOString());
    })();
  }
}

function backupLegacy(file) {
  const backup = `${file}.before-lingjing.bak`;
  if (existsSync(file) && !existsSync(backup)) copyFileSync(file, backup);
  return backup;
}
module.exports = { openDatabase, migrate, backupLegacy };
