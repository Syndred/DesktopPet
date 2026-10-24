const { join, dirname } = require('node:path');
const { existsSync } = require('node:fs');

async function registerBuiltinArt(services) {
  const manifest = join(services.paths.assets, 'illustrations/yuwan-character-v1.json');
  if (!services.get('resources') || !existsSync(manifest)) return;
  services.get('resources').addBuiltinAssetRoot(dirname(manifest));
  const { parseCharacterFile } = require('../features/resources/parser.cjs');
  const { ResourcesRepository } = require('../features/resources/repository.cjs');
  const repository = new ResourcesRepository(services.db);
  const id = 'builtin:lingjing-yuwan-v1';
  if (repository.hasGlobal(id)) {
    // App installations may move; bind immutable built-in keys to this package.
    const update = services.db.prepare('UPDATE lingjing_resource_files SET file_path=? WHERE resource_id=? AND asset_key=?');
    for (const row of repository.files('builtin', id)) update.run(join(dirname(manifest), row.asset_key), id, row.asset_key);
    return;
  }
  const parsed = await parseCharacterFile(manifest);
  const resource = { ...parsed.resource, id, origin: 'builtin', revision: 0, importedAt: '2026-10-24T12:10:00.000Z', provenance: { ...parsed.resource.provenance, status: 'project-original' } };
  repository.transaction(() => repository.insert(null, resource, [...parsed.files.keys()].map(key => [key, join(dirname(manifest), key)])));
}
module.exports = { registerBuiltinArt };
