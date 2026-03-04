import { join, relative } from "node:path";

import {
  ensureDir,
  listFilesRecursively,
  resolvePathFromEnvOrDefault,
  sha256File,
  writeJson
} from "./_utils.mjs";

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const artifactsDir = resolvePathFromEnvOrDefault("ARTIFACTS_DIR", join(rootDir, "artifacts"));
const outputDir = join(artifactsDir, "signatures");

ensureDir(outputDir);

const files = listFilesRecursively(artifactsDir).filter(
  (path) => !path.includes(`${join("artifacts", "signatures")}`) && path.endsWith(".json")
);

const signatures = files.map((path) => ({
  file: relative(artifactsDir, path).replaceAll("\\", "/"),
  sha256: sha256File(path)
}));

writeJson(join(outputDir, "signatures.json"), {
  generatedAt: new Date().toISOString(),
  signatures
});

console.log("Artifact signatures generated:", join(outputDir, "signatures.json"));

