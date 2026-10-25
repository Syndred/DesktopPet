/* eslint-disable @typescript-eslint/no-require-imports -- Actual SDK with in-memory responses/SQLite only; sockets forbidden. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { DatabaseSync } = require('node:sqlite');
const { requestCompletion } = require('../transport.cjs');
const { createConversationsFeature, migrations } = require('../index.cjs');
const PARTIAL = '【模拟验收 / DC7】这是';
const PRIVATE = 'QA017_SYNTHETIC_PRIVATE_INPUT_NEVER_PUBLIC';
const KEY = 'qa017-memory-dummy-not-a-real-key';
const connection = { provider: 'openai_compatible', baseUrl: 'https://qa017-memory.invalid/v1', model: 'qa017-memory', contextChars: 12000, maxOutputTokens: 64 };
const frame = (content, finish = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: content ? { content } : {}, finish_reason: finish }] })}\n\n`;
function memoryResponse(mode, signal) {
  if (mode === 'json') return new Response(JSON.stringify({ id: 'memory-json', object: 'chat.completion', created: 1, model: connection.model,
    choices: [{ index: 0, message: { role: 'assistant', content: '合成内存协议恢复成功' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } });
  if (typeof mode === 'number') return new Response(JSON.stringify({ error: { message: PRIVATE } }), { status: mode, headers: { 'content-type': 'application/json' } });
  let timer, done = false;
  const body = new ReadableStream({
    start(controller) {
      const write = value => controller.enqueue(new TextEncoder().encode(value));
      const broken = () => { if (done) return; done = true; controller.error(new TypeError(PRIVATE, { cause: Object.assign(new Error(PRIVATE), { code: 'UND_ERR_SOCKET' }) })); };
      if (mode === 'reader-empty') { timer = setTimeout(broken, 20); return; }
      if (mode === 'wire-limit') { write(' '.repeat(2 * 1024 * 1024 + 1)); done = true; controller.close(); return; }
      if (mode !== 'empty') write(frame(mode === 'text-limit' ? '字'.repeat(32001) : PARTIAL));
      if (mode === 'reader-partial') { timer = setTimeout(broken, 20); return; }
      if (mode === 'hold') {
        const abort = () => { if (!done) { done = true; controller.error(signal.reason); } };
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); return;
      }
      if (mode !== 'truncate') write(frame('', mode === 'refusal' ? 'content_filter' : 'stop') + 'data: [DONE]\n\n');
      done = true; controller.close();
    },
    cancel() { done = true; clearTimeout(timer); }
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}
function fixture(t, factory) {
  let calls = 0;
  t.mock.method(http.Server.prototype, 'listen', () => { throw new Error('SOCKET_LISTENER_FORBIDDEN'); });
  t.mock.method(net.Socket.prototype, 'connect', () => { throw new Error('NETWORK_CONNECTION_FORBIDDEN'); });
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(String(url), `${connection.baseUrl}/chat/completions`); calls++;
    return factory(init, calls);
  });
  return { get calls() { return calls; } };
}
function run(options = {}) {
  return requestCompletion({ connection, apiKey: KEY, messages: [{ role: 'user', content: PRIVATE }], signal: new AbortController().signal, ...options });
}
async function expectCode(operation, expected) {
  let caught;
  try { await operation(); } catch (error) { caught = error; }
  assert.ok(caught, 'Expected a normalized public error.');
  assert.equal(caught.code, expected); assert.equal(caught.message.includes(PRIVATE), false); assert.equal(caught.message.includes(KEY), false);
  return caught;
}
test('SDK wraps successful HTTP200 reader failure with statusCode200; no network is performed', async t => {
  const f = fixture(t, init => memoryResponse('reader-partial', init.signal));
  const { streamText } = await import('ai'); const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
  const model = createOpenAICompatible({ name: 'memory', baseURL: connection.baseUrl, apiKey: KEY, fetch: (...args) => globalThis.fetch(...args) }).chatModel(connection.model);
  let metadata, text = '';
  const capture = error => { metadata = { name: error.name, statusCode: error.statusCode, causeName: error.cause?.name, nestedCode: error.cause?.cause?.code }; };
  const result = streamText({ model, messages: [{ role: 'user', content: PRIVATE }], maxRetries: 0,
    telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    onError: ({ error }) => capture(error) });
  try { for await (const part of result.fullStream) if (part.type === 'text-delta') text += part.text; }
  catch (error) { capture(error); }
  assert.equal(text, PARTIAL); assert.equal(metadata.statusCode, 200); assert.equal(metadata.name, 'AI_APICallError'); assert.equal(f.calls, 1);
  t.diagnostic(JSON.stringify({ sdkErrorMetadata: metadata, partialChars: text.length, memoryFetchCalls: f.calls }));
});
test('HTTP200 SSE partial reader failure is incomplete response, not provider rejection', async t => {
  const f = fixture(t, init => memoryResponse('reader-partial', init.signal)); const deltas = [];
  const error = await expectCode(() => run({ onDelta: text => deltas.push(text) }), 'INVALID_RESPONSE');
  assert.equal(deltas.at(-1), PARTIAL); assert.equal(error.message, '模型响应不完整或格式不受支持，请重试。'); assert.equal(f.calls, 1);
});
test('HTTP200 reader failure before text remains a network error', async t => {
  fixture(t, init => memoryResponse('reader-empty', init.signal)); await expectCode(() => run(), 'NETWORK_ERROR');
});
test('explicit HTTP401/403/429/4xx/5xx retain their public provider classifications and redaction', async t => {
  let mode; const f = fixture(t, init => memoryResponse(mode, init.signal));
  for (const [status, code] of [[401, 'PROVIDER_AUTH'], [403, 'PROVIDER_AUTH'], [429, 'RATE_LIMITED'], [400, 'PROVIDER_REJECTED'], [422, 'PROVIDER_REJECTED'], [503, 'PROVIDER_UNAVAILABLE'], [504, 'PROVIDER_UNAVAILABLE']]) {
    mode = status; await expectCode(() => run(), code);
  }
  assert.equal(f.calls, 7);
});
test('explicit finish refusal, clean truncation and empty response remain distinct', async t => {
  let mode; fixture(t, init => memoryResponse(mode, init.signal));
  for (const [next, code] of [['refusal', 'PROVIDER_REJECTED'], ['truncate', 'INVALID_RESPONSE'], ['empty', 'EMPTY_RESPONSE']]) {
    mode = next; await expectCode(() => run(), code);
  }
});
test('caller cancellation and timeout retain priority over a successful-response reader error', async t => {
  fixture(t, init => memoryResponse('hold', init.signal)); const caller = new AbortController();
  await expectCode(() => run({ signal: caller.signal, onDelta: () => caller.abort(new DOMException('synthetic cancellation', 'AbortError')) }), 'CANCELLED');
  await expectCode(() => run({ timeoutMs: 25 }), 'TIMEOUT');
});
test('text and wire limits retain priority over HTTP200 wrapper metadata', async t => {
  let mode; fixture(t, init => memoryResponse(mode, init.signal));
  for (const next of ['text-limit', 'wire-limit']) { mode = next; await expectCode(() => run(), 'RESPONSE_TOO_LARGE'); }
});
test('memory SQLite keeps partial text and the same owner/pet/action/assistant while retry advances one attempt', async t => {
  let mode = 'reader-partial'; const f = fixture(t, init => memoryResponse(mode, init.signal));
  const db = new DatabaseSync(':memory:'); for (const migration of migrations) db.exec(migration.sql);
  const owner = 'qa017-memory-owner', petId = 'qa017-memory-pet', actionId = 'qa017-original-action';
  const feature = createConversationsFeature({ db, getSession: () => ({ ownerAccountId: owner, sessionId: 'memory-session' }),
    listPets: requested => [{ ownerAccountId: requested, petId, name: '内存合成伙伴' }],
    secrets: { available: () => true, encrypt: () => 'SIMULATED-CIPHERTEXT', decrypt: () => KEY } });
  t.after(() => { feature.dispose(); db.close(); });
  const configured = await feature.invoke('connection.save', { petId: null, connection, apiKey: KEY, revision: 0 }); assert.equal(configured.ok, true);
  const first = await feature.invoke('send', { petId, actionId, text: PRIVATE }); assert.equal(first.code, 'INVALID_RESPONSE');
  const failed = (await feature.invoke('snapshot', { petId })).data.messages;
  const before = failed.find(row => row.role === 'assistant'); assert.equal(before.content, PARTIAL); assert.equal(before.status, 'failed');
  assert.equal(before.errorCode, 'INVALID_RESPONSE'); assert.equal(before.attempt, 1);
  mode = 'json'; const retry = await feature.invoke('retry', { petId, actionId }); assert.equal(retry.ok, true);
  const restored = (await feature.invoke('snapshot', { petId })).data.messages;
  assert.equal(restored.length, 2); assert.equal(restored.filter(row => row.role === 'user').length, 1); assert.equal(restored.filter(row => row.role === 'assistant').length, 1);
  const after = restored.find(row => row.role === 'assistant'); assert.equal(after.id, before.id); assert.equal(after.actionId, actionId); assert.equal(after.petId, petId);
  assert.equal(after.attempt, 2); assert.equal(after.status, 'complete'); assert.equal(after.errorCode, null);
  assert.equal(restored.find(row => row.role === 'user').id, failed.find(row => row.role === 'user').id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM conversation_messages WHERE owner_account_id=? AND pet_id=? AND action_id=?').get(owner, petId, actionId).n, 2);
  assert.equal(f.calls, 2, 'JSON fallback reuses its response without another request.');
});
