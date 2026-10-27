const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAppSupport } = require('../../../apps/pc-app/runtime/core/app-support.cjs');
function fixture(options = {}) {
  const calls = [];
  const service = createAppSupport({ app: { isPackaged: true, getPath: name => ({ logs: '/fixture/logs', exe: '/fixture/executable' })[name] },
    shell: { openPath: async target => { calls.push(['open', target]); return options.openError || ''; }, showItemInFolder: target => calls.push(['reveal', target]) },
    platform: 'win32', launcher: () => ({ path: 'C:\\Apps\\Lingjing.exe' }), exists: () => true, ...options });
  return { service, calls };
}
test('support reports verified outer launcher, not temporary Electron child; contains no identity or credentials', () => {
  const { service } = fixture(); const info = service.info();
  assert.equal(info.executablePath, 'C:\\Apps\\Lingjing.exe'); assert.equal(info.automaticUpdates, false);
  assert.deepEqual(Object.keys(info).sort(), ['automaticUpdates', 'executablePath', 'logsAvailable', 'logsPath', 'packaged'].sort());
});
test('actions use only host-derived paths and do not upload or execute commands', async () => {
  const { service, calls } = fixture(); await service.openLogs({ path: '/untrusted' }); service.showExecutable({ path: '/untrusted' });
  assert.deepEqual(calls, [['open', '/fixture/logs'], ['reveal', 'C:\\Apps\\Lingjing.exe']]);
});
test('unavailable outer launcher and missing logs fail without shell calls', async () => {
  const { service, calls } = fixture({ launcher: () => null, exists: () => false });
  assert.equal(service.info().executablePath, null); assert.equal(service.info().logsAvailable, false);
  await assert.rejects(service.openLogs(), { code: 'LOGS_UNAVAILABLE' }); assert.throws(() => service.showExecutable(), { code: 'LAUNCHER_UNAVAILABLE' }); assert.deepEqual(calls, []);
});
test('OS open failure is reported, never claimed as success', async () => {
  await assert.rejects(fixture({ openError: 'private operating system error' }).service.openLogs(), { code: 'OPEN_LOGS_FAILED' });
});
test('development mode never reports Node/Electron binary as installed program', () => {
  for (const platform of ['win32', 'linux']) { const { service } = fixture({ platform, app: { isPackaged: false, getPath: () => '/fixture/logs' } }); assert.equal(service.info().executablePath, null); }
});
