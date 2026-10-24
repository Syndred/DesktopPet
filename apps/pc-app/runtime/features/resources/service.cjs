const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ResourcesRepository } = require('./repository.cjs');
const { ResourceError, fail, plain, text, provenance, calibrations, actionMap, safeRelative, isWithin, parseCharacterFile, resolveAction } = require('./parser.cjs');

class ResourcesService {
  constructor({ db, storageRoot, legacyModelsDir = path.resolve(__dirname, '../../assets/models'), starterManifest = path.join(__dirname, 'assets/fat-fish/character.json') }) {
    if (!db || !storageRoot) throw new Error('Resources requires the shared database and a managed storage root');
    this.repository = new ResourcesRepository(db);
    this.storageRoot = path.resolve(storageRoot);
    this.legacyModelsDir = path.resolve(legacyModelsDir);
    this.starterManifest = starterManifest;
    this.importTail = Promise.resolve();
    this.builtinAssetRoots = [];
  }
  // Only trusted main-process registration can extend built-in package roots.
  addBuiltinAssetRoot(root) { const resolved = path.resolve(root); if (!this.builtinAssetRoots.includes(resolved)) this.builtinAssetRoots.push(resolved); }
  owner(value) { if (typeof value !== 'string' || !value.trim() || value.length > 200) fail('AUTH_REQUIRED', '请先选择本机存档或登录账号'); return value; }
  async seed() {
    await fs.mkdir(this.storageRoot, { recursive: true });
    const starterId = 'builtin:fat-fish-v1';
    if (!this.repository.hasGlobal(starterId)) {
      const parsed = await parseCharacterFile(this.starterManifest);
      const resource = { ...parsed.resource, id: starterId, origin: 'builtin', revision: 0, importedAt: '2026-10-24T00:00:00.000Z', provenance: { ...parsed.resource.provenance, status: 'project-original' } };
      this.repository.transaction(() => this.repository.insert(null, resource, [...parsed.files.keys()].map(key => [key, path.join(path.dirname(this.starterManifest), key)])));
    }
    let catalog = { models: [] };
    try { catalog = JSON.parse((await fs.readFile(path.join(this.legacyModelsDir, 'catalog.json'), 'utf8')).replace(/^\uFEFF/, '')); } catch { /* A missing catalog must not hide existing files. */ }
    const disk = await fs.readdir(this.legacyModelsDir).catch(() => []);
    const names = new Set([...disk.filter(name => /\.(glb|gltf)$/i.test(name)), ...(catalog.models ?? []).map(item => item.file)]);
    for (const filename of names) {
      if (typeof filename !== 'string' || path.basename(filename) !== filename) continue;
      const id = `legacy:${filename.toLowerCase()}`;
      if (this.repository.hasGlobal(id)) continue;
      const item = (catalog.models ?? []).find(row => row.file === filename);
      const metadata = { author: item?.creator, source: item?.source, license: item?.license, attribution: item?.creator ? `${item.name} — ${item.creator} (${item.license})` : '' };
      let parsed;
      try { parsed = await parseCharacterFile(path.join(this.legacyModelsDir, filename), metadata); }
      catch (error) {
        parsed = { resource: { name: item?.name || filename, kind: 'model3d', contentHash: `legacy:${filename}`, entryAsset: filename, clips: [], actions: actionMap(undefined, []), calibration: calibrations(), provenance: provenance(metadata), warnings: [error.code === 'MISSING_ASSET' ? '历史模型文件缺失，记录已保留' : '历史模型无法解析，记录已保留'], availability: error.code === 'MISSING_ASSET' ? 'missing' : 'invalid' }, files: new Map([[filename, null]]) };
      }
      const resource = { ...parsed.resource, id, name: item?.name || parsed.resource.name, origin: 'legacy', revision: 0, legacyModel: `../assets/models/${filename}`, importedAt: item?.importedAt || '2026-03-08', provenance: { ...parsed.resource.provenance, status: item ? 'recorded' : 'unverified' } };
      this.repository.transaction(() => this.repository.insert(null, resource, [...parsed.files.keys()].map(key => [key, path.join(this.legacyModelsDir, key)])));
    }
  }
  async withAvailability(owner, resource) {
    const paths = this.repository.files(owner, resource.id);
    const readable = await Promise.all(paths.map(row => this.assetFile(owner, resource.id, row.asset_key).then(() => true, () => false)));
    if (readable.some(value => !value)) return { ...resource, availability: 'missing', warnings: [...resource.warnings, '文件已缺失；原有资源与导入记录仍然保留'] };
    return resource;
  }
  async list(owner) {
    this.owner(owner);
    return Promise.all(this.repository.list(owner).map(resource => this.withAvailability(owner, resource)));
  }
  async get(owner, id) { this.owner(owner); return this.withAvailability(owner, this.repository.get(owner, id)); }
  /** Synchronous adapters for callers already inside the shared SQLite transaction. */
  getRecord(owner, id) { this.owner(owner); return this.repository.get(owner, id); }
  resolveLegacyReference(owner, reference) {
    this.owner(owner);
    if (typeof reference !== 'string') return null;
    const value = reference.replaceAll('\\', '/').toLowerCase();
    return this.repository.list(owner).find(resource => resource.id.toLowerCase() === value || resource.legacyModel?.toLowerCase() === value || (resource.origin === 'legacy' && resource.entryAsset.toLowerCase() === value)) ?? null;
  }
  importFile(owner, filePath, metadata = {}) {
    const operation = this.importTail.then(() => this.importValidatedFile(owner, filePath, metadata));
    this.importTail = operation.catch(() => {});
    return operation;
  }
  async importValidatedFile(owner, filePath, metadata = {}) {
    this.owner(owner);
    // Parse all referenced files before creating a managed directory or touching the database.
    const parsed = await parseCharacterFile(filePath, metadata);
    const known = this.repository.findGlobalHash(parsed.resource.contentHash);
    if (known && ['recorded', 'project-original'].includes(known.provenance.status)) {
      const supplied = Object.fromEntries(Object.entries(metadata).filter(([, value]) => typeof value === 'string' && value.trim()));
      parsed.resource.provenance = provenance({ ...known.provenance, ...supplied }, Object.keys(supplied).length ? 'unverified' : known.provenance.status);
      parsed.resource.warnings = parsed.resource.warnings.filter(warning => warning !== '素材许可未确认，请补充作者与许可记录');
      if (/\.(glb|gltf)$/i.test(parsed.sourceFilename)) parsed.resource.name = known.name;
    }
    const duplicate = this.repository.findHash(owner, parsed.resource.contentHash);
    const date = new Date().toISOString();
    if (duplicate) {
      // Re-importing a complete original repairs missing managed copies while retaining IDs and settings.
      for (const [key, bytes] of parsed.files) {
        const destination = this.currentFilePath(duplicate, key, this.repository.file(owner, duplicate.id, key));
        if (!isWithin(this.storageRoot, destination)) fail('UNSAFE_PATH', '原有资源存储目录无效');
        if (await fs.access(destination).then(() => false, () => true)) {
          await fs.mkdir(path.dirname(destination), { recursive: true });
          const parent = await fs.realpath(path.dirname(destination));
          const root = await fs.realpath(this.storageRoot);
          if (!isWithin(root, parent)) fail('UNSAFE_PATH', '资源目录已变更');
          await fs.writeFile(destination, bytes, { flag: 'wx' });
        }
      }
      this.repository.recordImport(owner, { ...duplicate, provenance: parsed.resource.provenance }, parsed.sourceFilename, randomUUID(), date);
      return { resource: await this.withAvailability(owner, duplicate), duplicate: true };
    }
    const id = randomUUID(), target = path.join(this.storageRoot, id);
    if (!isWithin(this.storageRoot, target)) fail('UNSAFE_PATH', '存储目录无效');
    const resource = { ...parsed.resource, id, origin: 'import', revision: 0, importedAt: date };
    await fs.mkdir(target, { recursive: false });
    try {
      const locations = [];
      for (const [key, bytes] of parsed.files) {
        const destination = path.resolve(target, key);
        if (!isWithin(target, destination)) fail('UNSAFE_PATH', '关联文件路径无效');
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, bytes, { flag: 'wx' });
        locations.push([key, destination]);
      }
      this.repository.transaction(() => {
        this.repository.insert(owner, resource, locations);
        this.repository.recordImport(owner, resource, parsed.sourceFilename, randomUUID(), date);
      });
      return { resource, duplicate: false };
    } catch (error) {
      // Only remove this newly allocated UUID directory; user originals are never modified.
      if (isWithin(this.storageRoot, target)) await fs.rm(target, { force: true, recursive: true });
      throw error;
    }
  }
  async save(owner, request) {
    this.owner(owner);
    if (!plain(request) || typeof request.resourceId !== 'string' || !Number.isInteger(request.expectedRevision) || request.expectedRevision < 0) fail('INVALID_REQUEST', '保存参数格式错误');
    const resource = this.repository.get(owner, request.resourceId);
    const saved = this.repository.save(owner, resource.id, request.expectedRevision, calibrations(request.calibration), actionMap(request.actions, resource.clips, true));
    return this.withAvailability(owner, saved);
  }
  async resolve(owner, request) {
    if (!plain(request) || !text(request.petId, 200) || request.petId.length > 200) fail('PET_ID_REQUIRED', '显示资源必须指定独立 petId');
    if (request.context !== undefined && !['desktop', 'battle'].includes(request.context)) fail('INVALID_CONTEXT', '显示场景无效');
    if (request.facing !== undefined && !['left', 'right'].includes(request.facing)) fail('INVALID_FACING', '朝向无效');
    const resource = await this.get(owner, request.resourceId);
    const context = request.context || 'desktop';
    const display = { ...resource.calibration[context] };
    if (request.facing === 'left') display.mirrorX = !display.mirrorX;
    return { resource, petId: request.petId, context, calibration: display, ...resolveAction(resource, request.action) };
  }
  /** Companion native-window adapter, retaining registered URLs instead of leaking local file paths. */
  async resolveForPet(owner, pet) {
    if (this.ready) await this.ready;
    if (!pet || (pet.ownerAccountId && pet.ownerAccountId !== owner)) fail('RESOURCE_NOT_FOUND', '该伙伴不属于当前账号');
    const behavior = pet.desktop?.behavior;
    const action = behavior === 'sleep' ? 'sleep' : ['wander', 'follow'].includes(behavior) ? 'walk' : 'idle';
    const display = await this.resolve(owner, { resourceId: pet.resource?.resourceId, petId: pet.petId, context: 'desktop', action });
    if (display.resource.availability !== 'ready') return null;
    return {
      kind: display.resource.kind === 'model3d' ? 'model' : 'spritesheet',
      url: `lingjing-resource://asset/${encodeURIComponent(display.resource.id)}/${display.resource.entryAsset.split('/').map(encodeURIComponent).join('/')}`,
      sheet: display.resource.sheet, clip: display.clip, calibration: display.calibration, resourceRevision: display.resource.revision,
    };
  }
  async assetFile(owner, id, key) {
    this.owner(owner); safeRelative(key);
    const resource = this.repository.get(owner, id);
    const filePath = this.currentFilePath(resource, key, this.repository.file(owner, id, key));
    const allowed = [this.storageRoot, this.legacyModelsDir, path.dirname(this.starterManifest), ...this.builtinAssetRoots];
    const actual = await fs.realpath(filePath).catch(() => fail('MISSING_ASSET', '资源文件已缺失'));
    const roots = await Promise.all(allowed.map(root => fs.realpath(root).catch(() => path.resolve(root))));
    if (!roots.some(root => isWithin(root, actual))) fail('UNSAFE_PATH', '资源路径已变更或超出允许目录');
    return actual;
  }
  currentFilePath(resource, key, registeredPath) {
    // Immutable asset keys survive an installation or a complete user-data-directory move.
    // The registry is still consulted first; an arbitrary renderer path never becomes a key.
    if (resource.id === 'builtin:fat-fish-v1') return path.resolve(path.dirname(this.starterManifest), key);
    if (resource.origin === 'legacy') return path.resolve(this.legacyModelsDir, key);
    if (resource.origin === 'import') return path.resolve(this.storageRoot, resource.id, key);
    return registeredPath;
  }
  async migrateLegacyCalibration(owner, profiles) {
    this.owner(owner);
    if (!plain(profiles) || Object.keys(profiles).length > 200) fail('INVALID_REQUEST', '旧校准数据无效');
    let migrated = 0;
    for (const [filename, profile] of Object.entries(profiles)) {
      if (!plain(profile)) continue;
      const id = `legacy:${path.basename(filename).toLowerCase()}`;
      let current;
      try { current = this.repository.get(owner, id); } catch { continue; }
      if (current.revision !== 0) continue;
      const clamp = (value, fallback, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
      const convert = mode => ({ scale: clamp(profile[`poseWideScale${mode}`], 1, 0.25, 3), yawDeg: clamp(profile[`${mode.toLowerCase()}OrientationYDeg`], 0, -180, 180), pitchDeg: clamp(profile[`${mode.toLowerCase()}OrientationXDeg`], 0, -90, 90), verticalOffset: 0, mirrorX: false });
      this.repository.save(owner, id, 0, { desktop: convert('Idle'), battle: convert('Battle') }, current.actions); migrated++;
    }
    return { migrated };
  }
}
function toResult(error) {
  return { ok: false, error: { code: error instanceof ResourceError ? error.code : 'RESOURCE_UNAVAILABLE', message: error instanceof ResourceError ? error.message : '资源操作暂时无法完成，请重试', ...(error.details?.revision !== undefined ? { revision: error.details.revision } : {}) } };
}
module.exports = { ResourcesService, toResult };
