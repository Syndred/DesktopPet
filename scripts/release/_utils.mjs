import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

export function writeJson(path, data) {
  ensureDir(dirname(path));
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

export function listFilesRecursively(baseDir) {
  const result = [];
  for (const entry of readdirSync(baseDir)) {
    const fullPath = join(baseDir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      result.push(...listFilesRecursively(fullPath));
    } else {
      result.push(fullPath);
    }
  }
  return result;
}

export function sha256File(path) {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

export function parseArg(name, fallback = undefined) {
  const full = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (!full) return fallback;
  return full.slice(name.length + 3);
}

export function resolvePathFromEnvOrDefault(envKey, defaultPath) {
  return resolve(process.env[envKey] || defaultPath);
}

