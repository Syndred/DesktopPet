import { cpSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { nowIso, parseArg, writeJson } from "../release/_utils.mjs";

const rootDir = resolve(process.env.ROOT_DIR || process.cwd());
const backupDir = resolve(process.env.BACKUP_DIR || join(rootDir, "backups"));
const label = parseArg("label");

if (!label) {
  throw new Error("missing --label=<backupLabel>");
}

const sourceDir = join(backupDir, label);
if (!existsSync(sourceDir)) {
  throw new Error(`backup not found: ${sourceDir}`);
}

const entries = readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
for (const entry of entries) {
  const source = join(sourceDir, entry.name);
  const dest = join(rootDir, entry.name);
  cpSync(source, dest, { recursive: true });
}

writeJson(join(rootDir, "release-state", "last-restore.json"), {
  restoredAt: nowIso(),
  label
});

console.log("Restore completed from:", sourceDir);

