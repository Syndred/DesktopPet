import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());

const requiredFiles = [
  "scripts/desktop/run-electron.cjs",
  "apps/pc-app/runtime/main.cjs",
  "apps/pc-app/runtime/preload.cjs",
  "apps/pc-app/runtime/services/battle-runtime.cjs",
  "apps/pc-app/runtime/assets/models/Fox.glb",
  "apps/pc-app/runtime/assets/models/CesiumMan.glb",
  "apps/pc-app/runtime/package.json",
  "apps/pc-app/runtime/renderer/index.html",
  "apps/pc-app/runtime/renderer/renderer.mjs",
  "apps/pc-app/runtime/renderer/styles.css"
];

for (const file of requiredFiles) {
  const fullPath = join(root, file);
  if (!existsSync(fullPath)) {
    throw new Error(`missing runtime file: ${file}`);
  }
}

const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (!packageJson.scripts["dev:pc"]) {
  throw new Error("missing script: dev:pc");
}

if (!packageJson.scripts["start:pc"]) {
  throw new Error("missing script: start:pc");
}

console.log("PC runtime smoke passed.");
