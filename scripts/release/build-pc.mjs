import { readdirSync } from "node:fs";
import { join } from "node:path";

import { ensureDir, nowIso, resolvePathFromEnvOrDefault, writeJson } from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const artifactsDir = resolvePathFromEnvOrDefault("ARTIFACTS_DIR", join(rootDir, "artifacts"));

const sourceDir = join(rootDir, "apps", "pc-app", "src");
const outputDir = join(artifactsDir, "pc");
ensureDir(outputDir);

const sourceFiles = readdirSync(sourceDir).filter((name) => name.endsWith(".ts"));
const output = {
  platform: "pc",
  builtAt: nowIso(),
  sourceDir,
  sourceFileCount: sourceFiles.length,
  sourceFiles
};

writeJson(join(outputDir, "pc-build.json"), output);
console.log("PC build artifact generated:", join(outputDir, "pc-build.json"));

