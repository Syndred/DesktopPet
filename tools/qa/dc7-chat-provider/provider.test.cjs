/* eslint-disable @typescript-eslint/no-require-imports -- Pure/in-memory preparation checks; no listener or profile. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const provider = require('./provider.cjs');
const binding = () => ({ sourceCommit: provider.SOURCE, exeSha256: 'a'.repeat(64), asarSha256: 'b'.repeat(64),
  ownerAccountId: 'qa-only-fixture-owner', petId: 'qa-only-fixture-pet', connectionScope: 'pet', qaOnly: true,
  providerSlotWasEmpty: true, syntheticMessagesOnly: true, freshQaOwner: false, preservationCheckpoint: 'in-memory-synthetic-checkpoint' });
const session = () => ({ ...provider.makeSession(binding(), '00000000-0000-4000-8000-000000000001'), port: 0 });
function request(active, changes = {}) {
  const body = Buffer.from(JSON.stringify({ model: active.model, stream: true, messages: [{ role: 'user', content: 'PRIVATE-SYNTHETIC-CONTENT-MUST-NOT-BE-LOGGED' }] }));
  return Object.assign(Readable.from([body]), { method: 'POST', url: '/v1/chat/completions', socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:0', 'content-type': 'application/json', authorization: `Bearer ${active.dummyKey}` } }, changes);
}
function response() {
  const result = new EventEmitter(); result.parts = []; result.headersSent = false; result.destroyed = false;
  result.writeHead = (status, headers) => { result.status = status; result.headers = headers; result.headersSent = true; };
  result.flushHeaders = () => {};
  result.write = value => { result.parts.push(value); return true; };
  result.end = value => { if (value) result.parts.push(value); result.writableFinished = true; result.emit('finish'); };
  result.destroy = () => { result.destroyed = true; result.emit('close'); };
  return result;
}
async function invoke(mode, changes = {}, wait = async () => {}) {
  const active = session(), output = response(), audit = [];
  await provider.createHandler(active, () => mode, entry => audit.push(entry), wait)(request(active, changes), output);
  return { active, output, audit, body: output.parts.join('') };
}
test('imports cannot start a listener; session fixtures honestly retain null process/port fields', t => {
  t.mock.method(http, 'createServer', () => { throw new Error('LISTENER_FORBIDDEN_IN_PREPARATION'); });
  t.mock.method(http.Server.prototype, 'listen', () => { throw new Error('LISTENER_FORBIDDEN_IN_PREPARATION'); });
  delete require.cache[require.resolve('./cli.cjs')]; require('./cli.cjs');
  const prepared = provider.makeSession(binding()); assert.equal(prepared.pid, null); assert.equal(prepared.port, null); assert.equal(prepared.status, 'not_started');
});
test('unfilled bindings and unsafe global scope are rejected; no previous credentials are accepted in binding data', () => {
  const template = require('./binding.example.json'); assert.throws(() => provider.validateBinding(template));
  assert.throws(() => provider.validateBinding({ ...binding(), connectionScope: 'account' }));
  assert.throws(() => provider.validateBinding({ ...binding(), connectionScope: 'pet-and-account' }));
  assert.equal(provider.validateBinding({ ...binding(), connectionScope: 'account', globalSlotReadOnlyConfirmedEmpty: true }).connectionScope, 'account');
  assert.equal(provider.validateBinding({ ...binding(), connectionScope: 'pet-and-account', freshQaOwner: true }).connectionScope, 'pet-and-account');
  const clean = provider.validateBinding({ ...binding(), apiKey: 'DO-NOT-KEEP-A-KEY' }); assert.equal(Object.hasOwn(clean, 'apiKey'), false);
});
test('accept exactly this run dummy bearer; reject other credentials, duplicate auth, origin and non-loopback routes', () => {
  const active = session(); provider.validateEnvelope(request(active), active);
  for (const header of [undefined, 'Bearer sk-not-a-real-key', `Bearer ${active.dummyKey}-wrong`, `bearer ${active.dummyKey}`]) assert.equal(provider.acceptedDummy(header, active), false);
  assert.throws(() => provider.validateEnvelope(request(active, { headersDistinct: { authorization: ['one', 'two'] } }), active));
  assert.throws(() => provider.validateEnvelope(request(active, { socket: { remoteAddress: '192.0.2.1' } }), active));
  assert.throws(() => provider.validateEnvelope(request(active, { url: '/v1/chat/completions?key=not-accepted' }), active));
  const forged = request(active); forged.headers.origin = 'https://example.invalid'; assert.throws(() => provider.validateEnvelope(forged, active));
});
test('request inspection returns counts only, requires the frozen model and bounds the incoming body', () => {
  const active = session(), input = { model: active.model, messages: [{ role: 'system', content: 'private-fixture-persona' }, { role: 'user', content: 'private-fixture-message' }] };
  const summary = provider.inspectBody(Buffer.from(JSON.stringify(input)), active);
  assert.equal(summary.messageCount, 2); assert.equal(Object.hasOwn(summary, 'messages'), false); assert.equal(JSON.stringify(summary).includes('private'), false);
  assert.throws(() => provider.inspectBody(Buffer.from(JSON.stringify({ ...input, model: 'unapproved-model' })), active));
  assert.throws(() => provider.inspectBody(Buffer.alloc(provider.MAX_BODY + 1), active));
});
test('slow stream is explicit simulated OAI SSE with individual code points and a proper finish', async () => {
  const result = await invoke('stream'); assert.equal(result.output.status, 200); assert.match(result.body, /data: \[DONE\]/u);
  const events = result.body.split('\n\n').filter(line => line.startsWith('data: {')).map(line => JSON.parse(line.slice(6)));
  const pieces = events.flatMap(event => event.choices[0].delta.content ?? []);
  assert.ok(pieces.length > 14); assert.ok(pieces.every(piece => Array.from(piece).length === 1));
  assert.ok(pieces.join('').startsWith(provider.PREFIX)); assert.equal(events.at(-1).choices[0].finish_reason, 'stop');
  assert.equal(JSON.stringify(result.audit).includes('PRIVATE-SYNTHETIC'), false); assert.equal(JSON.stringify(result.audit).includes(result.active.dummyKey), false);
});
test('hold cancellation records only closure metadata and never writes a terminal success', async () => {
  const active = session(), output = response(), audit = []; let waits = 0;
  await provider.createHandler(active, () => 'hold', event => audit.push(event), async () => { if (++waits === 15) output.destroy(); })(request(active), output);
  assert.equal(output.destroyed, true); assert.equal(output.parts.join('').includes('[DONE]'), false);
  assert.ok(audit.some(event => event.reason === 'client_closed')); assert.equal(audit.some(event => event.reason === 'complete'), false);
});
test('truncation/disconnect and explicit HTTP failures are distinguishable and redact all input', async () => {
  for (const mode of ['truncate', 'disconnect']) { const result = await invoke(mode); assert.equal(result.body.includes('[DONE]'), false); assert.ok(result.body.includes('data: ')); }
  for (const [mode, status] of [['http401', 401], ['http429', 429], ['http503', 503]]) {
    const result = await invoke(mode); assert.equal(result.output.status, status); assert.equal(result.body.includes(result.active.dummyKey), false); assert.equal(result.body.includes('PRIVATE-SYNTHETIC'), false);
  }
  const refused = await invoke('stream', { headers: { host: '127.0.0.1:0', 'content-type': 'application/json', authorization: 'Bearer DO-NOT-LOG-THIS-HEADER' } });
  assert.equal(refused.output.status, 401); assert.equal(JSON.stringify(refused).includes('DO-NOT-LOG-THIS-HEADER'), false);
});
test('JSON fallback is explicit simulated content; audit cannot accept arbitrary user/header text even in metadata slots', async () => {
  const json = await invoke('json'); assert.ok(JSON.parse(json.body).choices[0].message.content.startsWith(provider.PREFIX));
  const safe = provider.auditRecord({ event: 'request_accepted', mode: 'DO-NOT-LOG', code: 'DO-NOT-LOG', reason: 'DO-NOT-LOG', authorization: 'DO-NOT-LOG', body: 'DO-NOT-LOG', messageCount: 2 });
  assert.equal(JSON.stringify(safe).includes('DO-NOT-LOG'), false); assert.equal(safe.messageCount, 2);
});
