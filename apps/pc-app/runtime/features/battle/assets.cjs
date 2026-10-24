const { join } = require("node:path");
const SHIBA_RESOURCE = "builtin:lingjing-battle-shiba-v1";
const YUWAN_RESOURCE = "builtin:lingjing-battle-yuwan-v1";
function appearance2d(pet = {}) {
  if (["builtin:lingjing-yuwan-v1", "builtin:fat-fish-v1"].includes(pet.resource?.resourceId)) return YUWAN_RESOURCE;
  if (pet.resource?.kind === "2d" && pet.resource.resourceId) return pet.resource.resourceId;
  if (pet.appearance2d) return pet.appearance2d;
  return pet.element === "water" ? YUWAN_RESOURCE : SHIBA_RESOURCE;
}
async function registerBattleArt(services) {
  const resources = services.get("resources");
  if (!resources?.repository || !resources.addBuiltinAssetRoot) return false;
  const repository = resources.repository;
  // Reuse the existing resource parser/repository and Pixi stage; no battle-specific animation engine.
  const { parseCharacterFile } = require("../resources/parser.cjs");
  for (const [id, folder] of [[SHIBA_RESOURCE, "shiba-v1"], [YUWAN_RESOURCE, "yuwan-v1"]]) {
    const root = join(__dirname, "assets", folder);
    resources.addBuiltinAssetRoot(root);
    if (repository.hasGlobal(id)) {
      const update = services.db.prepare("UPDATE lingjing_resource_files SET file_path=? WHERE resource_id=? AND asset_key=?");
      for (const row of repository.files("builtin", id)) update.run(join(root, row.asset_key), id, row.asset_key);
      continue;
    }
    const parsed = await parseCharacterFile(join(root, "character.json"));
    const resource = { ...parsed.resource, id, origin: "builtin", revision: 0,
      importedAt: "2026-10-24T00:00:00.000Z", provenance: { ...parsed.resource.provenance, status: "project-original" } };
    repository.transaction(() => repository.insert(null, resource, [...parsed.files.keys()].map(key => [key, join(root, key)])));
  }
  return true;
}
module.exports = { registerBattleArt, appearance2d, SHIBA_RESOURCE, YUWAN_RESOURCE };
