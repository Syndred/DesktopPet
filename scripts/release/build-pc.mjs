import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

import { ensureDir, nowIso, resolvePathFromEnvOrDefault, writeJson } from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const artifactsDir = resolvePathFromEnvOrDefault("ARTIFACTS_DIR", join(rootDir, "artifacts"));

const sourceDir = join(rootDir, "apps", "pc-app");
const outputDir = join(artifactsDir, "pc");
ensureDir(outputDir);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)]);
}
const sourceFiles = ['ui/src', 'runtime/main', 'runtime/preload'].flatMap(path => filesUnder(join(sourceDir, path)));
sourceFiles.push(join(rootDir, 'electron.vite.config.ts'), join(rootDir, 'package.json'), join(sourceDir, 'ui/index.html'));
const digest = createHash('sha256');
for (const path of sourceFiles.sort()) digest.update(path).update(readFileSync(path));
const fingerprint = digest.digest('hex');
const distDir = join(sourceDir, 'dist');
const stamp = join(distDir, '.build-fingerprint');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
  execFileSync(process.execPath, [join(rootDir, 'node_modules/electron-vite/bin/electron-vite.js'), 'build'], { cwd: rootDir, stdio: 'inherit' });
  writeFileSync(stamp, fingerprint);
}
const bundleFiles = filesUnder(distDir).filter(path => !path.endsWith('.build-fingerprint')).map(path => ({
  path: path.slice(rootDir.length + 1).replaceAll('\\', '/'),
  bytes: readFileSync(path).length,
  sha256: createHash('sha256').update(readFileSync(path)).digest('hex')
}));
const output = {
  platform: "pc",
  kind: 'electron-vite-bundle',
  builtAt: nowIso(),
  sourceDir,
  sourceFileCount: sourceFiles.length,
  sourceFiles,
  fingerprint,
  bundleFiles,
  windowsExecutableCommand: 'npm run package:pc:win'
};

writeJson(join(outputDir, "pc-build.json"), output);
console.log("PC build artifact generated:", join(outputDir, "pc-build.json"));

