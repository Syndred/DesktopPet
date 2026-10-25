const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateIpcRequest, desktopEventAllowed } = require('../../apps/pc-app/runtime/core/ipc-guard.cjs');
const request = (feature = 'companions', command = 'get', payload = { petId: 'pet-a' }) => ({ feature, command, payload });

test('IPC accepts data only and bounds encoded bytes, depth, feature and prototypes', () => {
  assert.equal(validateIpcRequest(request()), null);
  for (const input of [null, [], request('electron'), request('app', 'info', []), request('app', 'info', { call() {} }),
    request('app', 'info', JSON.parse('{"__proto__":{"polluted":true}}')), request('app', 'info', { text: '字'.repeat(700000) })]) assert.equal(validateIpcRequest(input), 'INVALID_REQUEST');
  const cycle = {}; cycle.self = cycle; assert.equal(validateIpcRequest(request('app', 'info', cycle)), 'INVALID_REQUEST');
  let deep = {}; for (let n = 0; n < 30; n++) deep = { deep }; assert.equal(validateIpcRequest(request('app', 'info', deep)), 'INVALID_REQUEST');
});
test('desktop windows can operate only their bound pet and the small required capability set', () => {
  assert.equal(validateIpcRequest(request(), 'pet-a'), null);
  assert.equal(validateIpcRequest(request('resources', 'resolve', { petId: 'pet-a', resourceId: 'appearance' }), 'pet-a'), null);
  assert.equal(validateIpcRequest(request('accounts', 'settingsGet', {}), 'pet-a'), null);
  for (const input of [request('companions', 'get', { petId: 'pet-b' }), request('companions', 'rename'), request('accounts', 'logout', {}), request('battle', 'act', {})]) assert.equal(validateIpcRequest(input, 'pet-a'), 'WINDOW_SCOPE_VIOLATION');
});
test('desktop event stream excludes chat and other pet actions', () => {
  assert.equal(desktopEventAllowed('conversations:chunk', {}, 'pet-a'), false);
  assert.equal(desktopEventAllowed('companions:action', { petId: 'pet-b' }, 'pet-a'), false);
  assert.equal(desktopEventAllowed('companions:action', { petId: 'pet-a' }, 'pet-a'), true);
  assert.equal(desktopEventAllowed('accounts:behavior', {}, 'pet-a'), true);
});
