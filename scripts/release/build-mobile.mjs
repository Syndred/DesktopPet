import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir, nowIso, resolvePathFromEnvOrDefault, writeJson } from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const artifactsDir = resolvePathFromEnvOrDefault("ARTIFACTS_DIR", join(rootDir, "artifacts"));

const sourceReadme = join(rootDir, "apps", "mobile-app", "README.md");
const outputDir = join(artifactsDir, "mobile");
ensureDir(outputDir);

const output = {
  platform: "mobile",
  builtAt: nowIso(),
  sourceReadme,
  sourceReadmeBytes: Buffer.byteLength(readFileSync(sourceReadme, "utf8")),
  buildTargets: ["android", "ios-testflight"]
};

writeJson(join(outputDir, "mobile-build.json"), output);
console.log("Mobile build artifact generated:", join(outputDir, "mobile-build.json"));

