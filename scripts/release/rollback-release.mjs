import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  nowIso,
  parseArg,
  resolvePathFromEnvOrDefault,
  writeJson
} from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const releasesDir = resolvePathFromEnvOrDefault("RELEASES_DIR", join(rootDir, "releases"));
const stateDir = resolvePathFromEnvOrDefault("STATE_DIR", join(rootDir, "release-state"));

const targetFromArg = parseArg("target");
const targetVersion = targetFromArg || process.env.ROLLBACK_TARGET;
if (!targetVersion) {
  throw new Error("missing rollback target version. pass --target=<version> or ROLLBACK_TARGET");
}

const targetManifest = join(releasesDir, targetVersion, "manifest.json");
if (!existsSync(targetManifest)) {
  throw new Error(`target release not found: ${targetManifest}`);
}

const manifestData = JSON.parse(readFileSync(targetManifest, "utf8"));
writeJson(join(stateDir, "current.json"), {
  version: targetVersion,
  switchedAt: nowIso(),
  rollback: true
});

writeJson(join(stateDir, "last-rollback.json"), {
  targetVersion,
  executedAt: nowIso(),
  manifestVersion: manifestData.version
});

console.log("Rollback complete. Current version:", targetVersion);

