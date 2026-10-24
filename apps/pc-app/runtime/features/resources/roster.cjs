const path = require('node:path');
const catalog = require('./assets/roster-v2/catalog.json');
const { parseCharacterFile, ResourceError } = require('./parser.cjs');
const ROOT = path.join(__dirname, 'assets/roster-v2');

/** Only explicit historical built-in IDs are aliases. Imported IDs and model paths are untouched. */
function canonicalResourceId(id) { return Object.hasOwn(catalog.legacyAliases, id) ? catalog.legacyAliases[id] : id; }
function listRosterDefinitions() { return JSON.parse(JSON.stringify(catalog.characters)); }
function listRosterTemplates() {
  return catalog.characters.map(({ templateId, name, category, element, description, resourceId }) => ({
    templateId, name, category, element, description, resource: { resourceId, kind: '2d' },
  }));
}
/** Parse every real asset before one transaction registers the collection. No old rows are deleted. */
async function registerRoster(service) {
  const parsed = [];
  for (const entry of catalog.characters) {
    const manifest = path.join(ROOT, entry.manifest), pack = await parseCharacterFile(manifest);
    service.addBuiltinAssetRoot(path.dirname(manifest));
    parsed.push({ entry, manifest, pack });
  }
  const repository = service.repository;
  repository.transaction(() => {
    for (const { entry, manifest, pack } of parsed) {
      if (repository.hasGlobal(entry.resourceId)) {
        const previous = repository.get('builtin', entry.resourceId);
        if (previous.contentHash !== pack.resource.contentHash) throw new ResourceError('BUILTIN_VERSION_CONFLICT', '内置形象内容已改变，请使用新的资源版本 ID');
        const update = repository.db.prepare('UPDATE lingjing_resource_files SET file_path=? WHERE resource_id=? AND asset_key=?');
        for (const key of pack.files.keys()) update.run(path.join(path.dirname(manifest), key), entry.resourceId, key);
        continue;
      }
      const resource = { ...pack.resource, id: entry.resourceId, origin: 'builtin', revision: 0, importedAt: catalog.createdAt, provenance: { ...pack.resource.provenance, status: 'project-original' } };
      repository.insert(null, resource, [...pack.files.keys()].map(key => [key, path.join(path.dirname(manifest), key)]));
    }
  });
  return parsed.map(({ entry }) => entry.resourceId);
}

module.exports = { ROOT, catalog, canonicalResourceId, listRosterDefinitions, listRosterTemplates, registerRoster };
