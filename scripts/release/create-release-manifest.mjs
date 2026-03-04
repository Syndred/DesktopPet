import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ensureDir,
  nowIso,
  parseArg,
  resolvePathFromEnvOrDefault,
  writeJson
} from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const artifactsDir = resolvePathFromEnvOrDefault("ARTIFACTS_DIR", join(rootDir, "artifacts"));
const releasesDir = resolvePathFromEnvOrDefault("RELEASES_DIR", join(rootDir, "releases"));
const stateDir = resolvePathFromEnvOrDefault("STATE_DIR", join(rootDir, "release-state"));

const versionArg = parseArg("version");
const envVersion = process.env.RELEASE_VERSION;
const version = versionArg || envVersion || `dev-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}`;

const signaturesPath = join(artifactsDir, "signatures", "signatures.json");
if (!existsSync(signaturesPath)) {
  throw new Error(`missing signatures file: ${signaturesPath}`);
}

const signatures = JSON.parse(readFileSync(signaturesPath, "utf8"));
const manifest = {
  version,
  generatedAt: nowIso(),
  artifactsDir,
  signatures
};

const releaseDir = join(releasesDir, version);
ensureDir(releaseDir);
ensureDir(stateDir);

writeJson(join(releaseDir, "manifest.json"), manifest);
writeJson(join(stateDir, "current.json"), {
  version,
  switchedAt: nowIso()
});

console.log("Release manifest generated:", join(releaseDir, "manifest.json"));

