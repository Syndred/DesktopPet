const { EventEmitter } = require('node:events');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { readdirSync, existsSync } = require('node:fs');
const { migrate } = require('./database.cjs');

const ORDER = ['accounts', 'resources', 'companions', 'battle', 'garden', 'discovery', 'conversations'];
function appError(code, message) { return Object.assign(new Error(message), { code }); }

function createServices({ db, legacy, paths, windows, safeStorage }) {
  const registry = new Map();
  const commands = new Map();
  const bus = new EventEmitter();
  let sessionAdapter;
  const services = {
    db, database: db, legacy, paths, windows, safeStorage,
    session: {
      setAdapter(adapter) { sessionAdapter = adapter; },
      getCurrentUser() { return sessionAdapter ? sessionAdapter.getCurrentUser() : legacy.runtimeDataStore.getAuthSession()?.currentUser ?? null; },
      getOwnerAccountId() { return services.session.getCurrentUser()?.id ?? null; },
      requireOwner() {
        const owner = services.session.getOwnerAccountId();
        if (!owner) throw appError('AUTH_REQUIRED', '请先登录账号。');
        return owner;
      }
    },
    provide(name, value) {
      if (registry.has(name)) throw appError('DUPLICATE_SERVICE', `服务已注册：${name}`);
      registry.set(name, value);
      return value;
    },
    get(name) { return registry.get(name); },
    events: { emit: (name, value) => bus.emit(name, value), on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); } },
    ipc: { handle(name, handler, options = {}) {
      if (commands.has(name)) throw appError('DUPLICATE_COMMAND', `重复命令：${name}`);
      commands.set(name, { handler, public: options.public === true });
    } },
    async invoke(feature, command, payload = {}, requestId = randomUUID()) {
      const entry = commands.get(`${feature}:${command}`);
      if (!entry) return { ok: false, code: 'COMMAND_UNAVAILABLE', message: '该功能尚未注册。' };
      try {
        const ownerAccountId = entry.public ? (services.session.getOwnerAccountId() || '') : services.session.requireOwner();
        const value = await entry.handler(payload, { ownerAccountId, requestId });
        if (!entry.public && services.session.getOwnerAccountId() !== ownerAccountId) return { ok: false, code: 'SESSION_CHANGED', message: '账号已切换，请重新打开此页面。' };
        if (value && typeof value === 'object' && typeof value.ok === 'boolean') {
          if (!value.ok) return { ...value, code: value.code || 'ACTION_FAILED', message: value.message || value.error || '操作未完成。' };
          return value;
        }
        return { ok: true, data: value };
      } catch (error) {
        // Domain/provider exceptions can carry request headers or BYOK details.
        // Keep logs useful without serializing the exception or renderer payload.
        console.error(`[${feature}:${command}]`, { requestId, code: error.code || 'INTERNAL_ERROR', name: error.name || 'Error' });
        return { ok: false, code: error.code || 'INTERNAL_ERROR', message: error.message || '操作未完成。' };
      }
    }
  };
  return services;
}

function discoverFeatures(root, services) {
  const features = [];
  const directories = existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter(x => x.isDirectory()).map(x => x.name) : [];
  directories.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  for (const id of directories) {
    const path = join(root, id, 'index.cjs');
    if (!existsSync(path)) continue;
    const imported = require(path);
    const feature = imported.default || imported.feature || imported;
    if (feature.id !== id || typeof feature.register !== 'function') throw appError('INVALID_FEATURE', `无效模块入口：${id}`);
    migrate(services.db, id, feature.migrations);
    const result = feature.register(services) || {};
    for (const [command, handler] of Object.entries(result.commands || {})) {
      services.ipc.handle(`${id}:${command}`, handler, { public: feature.publicCommands?.includes(command) });
    }
    features.push({ id, commands: Object.keys(result.commands || {}), dispose: result.dispose });
  }
  return features;
}
module.exports = { createServices, discoverFeatures, appError };
