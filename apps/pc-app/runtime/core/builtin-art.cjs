const { join, dirname } = require('node:path');
const { existsSync } = require('node:fs');

async function registerBuiltinArt(services) {
  const manifest = join(services.paths.assets, 'illustrations/yuwan-character-v1.json');
  if (!services.get('resources') || !existsSync(manifest)) return;
  const { parseCharacterFile } = require('../features/resources/parser.cjs');
  const { ResourcesRepository } = require('../features/resources/repository.cjs');
  const repository = new ResourcesRepository(services.db);
  const id = 'builtin:lingjing-yuwan-v1';
  if (repository.hasGlobal(id)) return;
  const parsed = await parseCharacterFile(manifest);
  const resource = { ...parsed.resource, id, origin: 'builtin', revision: 0, importedAt: '2026-10-24T12:10:00.000Z', provenance: { ...parsed.resource.provenance, status: 'project-original' } };
  repository.transaction(() => repository.insert(null, resource, [...parsed.files.keys()].map(key => [key, join(dirname(manifest), key)])));
}
module.exports = { registerBuiltinArt };
