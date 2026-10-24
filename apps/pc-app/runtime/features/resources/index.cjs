const fs = require('node:fs/promises');
const path = require('node:path');
const { ResourcesService, toResult } = require('./service.cjs');
const { migrations } = require('./repository.cjs');
const { ResourceError } = require('./parser.cjs');
const CHANNEL = 'lingjing:resources';
const SCHEME = 'lingjing-resource';
const MIME = { '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.bin': 'application/octet-stream', '.ktx2': 'image/ktx2' };

/** Register before app.ready via the public main process. */
function registerResourceScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
}
function installResourceProtocol({ protocol, service, getOwnerAccountId, isTrustedAssetRequest }) {
  protocol.handle(SCHEME, async request => {
    try {
      if (isTrustedAssetRequest && !isTrustedAssetRequest(request)) return new Response(null, { status: 403 });
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 });
      const url = new URL(request.url);
      if (url.hostname !== 'asset' || url.search || url.hash) return new Response(null, { status: 400 });
      const [id, ...parts] = url.pathname.slice(1).split('/').map(decodeURIComponent);
      const owner = service.owner(await getOwnerAccountId());
      const filePath = await service.assetFile(owner, id, parts.join('/'));
      const bytes = request.method === 'HEAD' ? null : await fs.readFile(filePath);
      return new Response(bytes, { headers: { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': request.headers.get('origin') || 'null' } });
    } catch { return new Response(null, { status: 404 }); }
  });
}
/** Adapter with explicit injected capabilities; foundation owns IPC/preload/session wiring. */
async function registerResources({ db, storageRoot, ipcMain, dialog, protocol, getOwnerAccountId, isTrustedSender, getWindow, legacyModelsDir, starterManifest }) {
  if (typeof getOwnerAccountId !== 'function' || typeof isTrustedSender !== 'function') throw new Error('Resources needs a verified owner resolver and trusted sender guard');
  const service = new ResourcesService({ db, storageRoot, legacyModelsDir, starterManifest });
  await service.seed();
  async function dispatch(event, command, payload) {
    try {
      if (!isTrustedSender(event)) throw new ResourceError('UNTRUSTED_SENDER', '此窗口不能访问角色资源');
      const owner = service.owner(await getOwnerAccountId(event));
      let data;
      switch (command) {
        case 'list': data = await service.list(owner); break;
        case 'save': data = await service.save(owner, payload); break;
        case 'resolve': data = await service.resolve(owner, payload); break;
        case 'migrate-legacy-calibration': data = await service.migrateLegacyCalibration(owner, payload); break;
        case 'import': {
          const options = { title: '导入角色资源', properties: ['openFile'], filters: [{ name: '角色包 / 3D 模型', extensions: ['json', 'glb', 'gltf'] }] };
          const window = getWindow?.(event);
          const selected = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
          if (selected.canceled || !selected.filePaths.length) return { ok: true, data: null };
          // Re-check session after a potentially long native dialog.
          if (owner !== await getOwnerAccountId(event)) throw new ResourceError('SESSION_CHANGED', '账号已切换，请重新导入');
          data = await service.importFile(owner, selected.filePaths[0], payload); break;
        }
        default: throw new ResourceError('UNKNOWN_COMMAND', '不支持的资源操作');
      }
      return { ok: true, data, ...(data?.revision !== undefined ? { revision: data.revision } : {}) };
    } catch (error) { return toResult(error); }
  }
  ipcMain.handle(CHANNEL, dispatch);
  // This protocol exposes registered resource keys, never arbitrary filesystem paths.
  installResourceProtocol({ protocol, service, getOwnerAccountId });
  return { service, dispatch, dispose() { ipcMain.removeHandler(CHANNEL); protocol.unhandle(SCHEME); } };
}

/** Foundation FeatureModule contract; migrations use foundation's shared runner. */
function register(services) {
  const { dialog, protocol, BrowserWindow } = require('electron');
  const service = new ResourcesService({ db: services.db, storageRoot: path.join(services.paths.userData, 'character-resources'), legacyModelsDir: path.join(services.paths.assets, 'models') });
  const ready = service.seed();
  // Commands surface seed errors; keep a failed seed from becoming an unhandled rejection.
  void ready.catch(() => {});
  services.provide('resources', service);
  const run = handler => async (payload, context) => {
    try { await ready; return await handler(payload, context); }
    catch (error) { const result = toResult(error); return { ok: false, code: result.error.code, message: result.error.message, ...(result.error.revision !== undefined ? { revision: result.error.revision } : {}) }; }
  };
  const changed = (owner, resource) => services.events.emit('resources:changed', { ownerAccountId: owner, resourceId: resource.id, revision: resource.revision });
  installResourceProtocol({ protocol, service, getOwnerAccountId: () => services.session.getOwnerAccountId(), isTrustedAssetRequest(request) {
    const origin = request.headers.get('origin');
    const renderer = process.env.ELECTRON_RENDERER_URL;
    if (renderer) return origin === new URL(renderer).origin || (request.referrer && new URL(request.referrer).origin === new URL(renderer).origin);
    return (!origin || origin === 'null' || origin === 'file://') && (!request.referrer || request.referrer.startsWith('file:'));
  } });
  return {
    commands: {
      list: run((_payload, context) => service.list(context.ownerAccountId)),
      resolve: run((payload, context) => service.resolve(context.ownerAccountId, payload)),
      save: run(async (payload, context) => { const resource = await service.save(context.ownerAccountId, payload); changed(context.ownerAccountId, resource); return resource; }),
      'migrate-legacy-calibration': run((payload, context) => service.migrateLegacyCalibration(context.ownerAccountId, payload)),
      import: run(async (payload, context) => {
        const options = { title: '导入角色资源', properties: ['openFile'], filters: [{ name: '角色包 / 3D 模型', extensions: ['json', 'glb', 'gltf'] }] };
        const window = BrowserWindow.getFocusedWindow();
        const selected = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
        if (selected.canceled || !selected.filePaths.length) return { ok: true, data: null };
        if (context.ownerAccountId !== services.session.getOwnerAccountId()) throw new ResourceError('SESSION_CHANGED', '账号已切换，请重新导入');
        const result = await service.importFile(context.ownerAccountId, selected.filePaths[0], payload); changed(context.ownerAccountId, result.resource); return result;
      }),
    },
    dispose() { protocol.unhandle(SCHEME); },
  };
}
module.exports = { id: 'resources', CHANNEL, SCHEME, migrations, register, registerResources, registerResourceScheme, installResourceProtocol, ResourcesService };
