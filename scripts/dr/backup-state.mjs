import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { ensureDir, nowIso, parseArg, writeJson } from "../release/_utils.mjs";

const rootDir = resolve(process.env.ROOT_DIR || process.cwd());
const backupDir = resolve(process.env.BACKUP_DIR || join(rootDir, "backups"));
const label = parseArg("label", `backup-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`);
const targetDir = join(backupDir, label);

const sources = [
  join(rootDir, "releases"),
  join(rootDir, "release-state"),
  join(rootDir, "infra/supabase/migrations")
];

ensureDir(targetDir);

const copied = [];
for (const source of sources) {
  if (!existsSync(source)) continue;
  const dest = join(targetDir, source.slice(rootDir.length + 1).replaceAll("\\", "/"));
  ensureDir(dest);
  cpSync(source, dest, { recursive: true });
  copied.push({
    source,
    destination: dest
  });
}

writeJson(join(targetDir, "backup-metadata.json"), {
  createdAt: nowIso(),
  rootDir,
  label,
  copied
});

console.log("Backup completed:", targetDir);

