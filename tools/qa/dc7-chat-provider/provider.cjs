/* eslint-disable @typescript-eslint/no-require-imports -- Standalone QA helper; Node built-ins only. */
const { createHash, randomUUID, timingSafeEqual } = require('node:crypto');
const SOURCE = 'dc7aee379d0fb241e5c4bd4bf43101fa1a85a678';
const MODES = Object.freeze(['stream', 'hold', 'truncate', 'disconnect', 'http401', 'http429', 'http503', 'empty', 'json']);
const MAX_BODY = 256 * 1024;
const PREFIX = '【模拟验收 / DC7】';
class InputError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
function requireValue(condition, code) { if (!condition) throw new InputError(code); }
function validateBinding(value) {
  requireValue(value && typeof value === 'object', 'BINDING_REQUIRED');
  for (const key of ['ownerAccountId', 'petId']) requireValue(typeof value[key] === 'string' && value[key].length > 2 && value[key].length <= 160 && !/[<>\r\n\0]/u.test(value[key]), 'EXPLICIT_QA_ID_REQUIRED');
  requireValue(value.sourceCommit === SOURCE, 'CANDIDATE_SOURCE_MISMATCH');
  for (const key of ['exeSha256', 'asarSha256']) requireValue(typeof value[key] === 'string' && /^[a-f0-9]{64}$/u.test(value[key]), 'FROZEN_ARTIFACT_HASH_REQUIRED');
  requireValue(['pet', 'account', 'pet-and-account'].includes(value.connectionScope), 'CONNECTION_SCOPE_REQUIRED');
  requireValue(value.qaOnly === true && value.providerSlotWasEmpty === true && value.syntheticMessagesOnly === true, 'QA_PRESERVATION_CONFIRMATION_REQUIRED');
  requireValue(value.connectionScope === 'pet' || value.freshQaOwner === true || value.globalSlotReadOnlyConfirmedEmpty === true, 'GLOBAL_REQUIRES_EMPTY_QA_SLOT');
  requireValue(typeof value.preservationCheckpoint === 'string' && value.preservationCheckpoint.trim().length > 2, 'PRESERVATION_CHECKPOINT_REQUIRED');
  return Object.freeze({ sourceCommit: SOURCE, ownerAccountId: value.ownerAccountId, petId: value.petId,
    exeSha256: value.exeSha256, asarSha256: value.asarSha256, connectionScope: value.connectionScope,
    qaOnly: true, providerSlotWasEmpty: true, syntheticMessagesOnly: true, freshQaOwner: value.freshQaOwner === true,
    globalSlotReadOnlyConfirmedEmpty: value.globalSlotReadOnlyConfirmedEmpty === true,
    preservationCheckpoint: value.preservationCheckpoint });
}
function makeSession(binding, runId = randomUUID()) {
  const checked = validateBinding(binding);
  requireValue(/^[a-f0-9-]{36}$/u.test(runId), 'INVALID_RUN_ID');
  const tag = createHash('sha256').update(JSON.stringify([checked.ownerAccountId, checked.petId, runId])).digest('hex').slice(0, 12);
  return { format: 'lingjing.simulated-chat-provider', version: 1, runId, binding: checked,
    model: `模拟验收-DC7-${tag}`, dummyKey: `qa-only-simulated-${runId}`, pid: null, port: null, baseUrl: null,
    status: 'not_started', simulatedUpstream: true, externalModelSuccess: false };
}
function acceptedDummy(header, session) {
  if (typeof header !== 'string' || !session.dummyKey.startsWith('qa-only-simulated-')) return false;
  const expected = Buffer.from(`Bearer ${session.dummyKey}`), actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function validateEnvelope(request, session) {
  if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress)) throw new InputError('LOOPBACK_ONLY', 403);
  if (request.method !== 'POST' || request.url !== '/v1/chat/completions') throw new InputError('ROUTE_NOT_ALLOWED', 404);
  if (request.headers.host !== `127.0.0.1:${session.port}` || request.headers.origin) throw new InputError('HOST_NOT_ALLOWED', 403);
  const duplicateAuth = request.headersDistinct?.authorization?.length > 1;
  if (duplicateAuth || !acceptedDummy(request.headers.authorization, session)) throw new InputError('DUMMY_AUTH_REJECTED', 401);
  if (!/^application\/json(?:;|$)/iu.test(request.headers['content-type'] ?? '')) throw new InputError('JSON_REQUIRED', 415);
}
function inspectBody(bytes, session) {
  if (bytes.length > MAX_BODY) throw new InputError('REQUEST_TOO_LARGE', 413);
  let value; try { value = JSON.parse(bytes.toString('utf8')); } catch { throw new InputError('INVALID_JSON'); }
  requireValue(value && value.model === session.model, 'SIMULATED_MODEL_REQUIRED');
  requireValue(value.stream === undefined || typeof value.stream === 'boolean', 'INVALID_STREAM_FLAG');
  requireValue(Array.isArray(value.messages) && value.messages.length > 0 && value.messages.length <= 128, 'INVALID_MESSAGES');
  let contentChars = 0;
  for (const message of value.messages) {
    requireValue(message && ['system', 'developer', 'user', 'assistant'].includes(message.role), 'INVALID_MESSAGE_ROLE');
    const content = typeof message.content === 'string' ? message.content : Array.isArray(message.content) ? message.content.map(part => {
      requireValue(part?.type === 'text' && typeof part.text === 'string', 'TEXT_ONLY'); return part.text;
    }).join('') : null;
    requireValue(content !== null, 'TEXT_ONLY'); contentChars += content.length;
  }
  // The original body/messages/header values never enter audit or return data.
  return Object.freeze({ stream: value.stream !== false, messageCount: value.messages.length, contentChars, bytes: bytes.length });
}
function auditRecord(value) {
  const record = {};
  if (['request_accepted', 'response_end', 'response_closed', 'request_rejected'].includes(value.event)) record.event = value.event;
  if (typeof value.requestId === 'string' && /^sim-[0-9]+$/u.test(value.requestId)) record.requestId = value.requestId;
  if (MODES.includes(value.mode)) record.mode = value.mode;
  if (['client_closed', 'simulated_disconnect', 'simulated_truncate', 'complete'].includes(value.reason)) record.reason = value.reason;
  if (['LOOPBACK_ONLY', 'ROUTE_NOT_ALLOWED', 'HOST_NOT_ALLOWED', 'DUMMY_AUTH_REJECTED', 'JSON_REQUIRED', 'INVALID_JSON',
    'REQUEST_TOO_LARGE', 'SIMULATED_MODEL_REQUIRED', 'INVALID_STREAM_FLAG', 'INVALID_MESSAGES', 'INVALID_MESSAGE_ROLE',
    'TEXT_ONLY', 'CONTROL_MODE_INVALID', 'HELPER_ERROR'].includes(value.code)) record.code = value.code;
  for (const key of ['status', 'bytes', 'messageCount', 'contentChars', 'deltas']) if (Number.isSafeInteger(value[key]) && value[key] >= 0) record[key] = value[key];
  return { at: new Date().toISOString(), ...record };
}
function replyText(mode) { return `${PREFIX}这是本机协议夹具逐字回传，供应商为模拟；本次模式 ${mode}。`; }
function chunk(model, requestId, content, finish = false) {
  return `data: ${JSON.stringify({ id: requestId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model,
    choices: [{ index: 0, delta: finish ? {} : { content }, finish_reason: finish ? 'stop' : null }] })}\n\n`;
}
function jsonReply(model, requestId) { return { id: requestId, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model,
  choices: [{ index: 0, message: { role: 'assistant', content: replyText('json') }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }; }
function sendError(response, status) {
  if (response.destroyed || response.headersSent) return;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(status === 429 ? { 'retry-after': '1' } : {}) });
  response.end(JSON.stringify({ error: { message: `${PREFIX}本机模拟请求被拒绝。`, type: 'simulated_upstream_error', code: `SIMULATED_HTTP_${status}` } }));
}
async function readBody(request) {
  const chunks = []; let count = 0;
  for await (const data of request) { count += data.length; if (count > MAX_BODY) throw new InputError('REQUEST_TOO_LARGE', 413); chunks.push(data); }
  return Buffer.concat(chunks);
}
function createHandler(session, readMode, audit = () => {}, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  let sequence = 0;
  return async (request, response) => {
    const requestId = `sim-${++sequence}`; let mode, summary, deltas = 0, ended = false, serverDrop = false, closed = false;
    const record = value => audit(auditRecord({ requestId, ...value }));
    response.once('close', () => { closed = true; if (!ended) record({ event: 'response_closed', mode, deltas, reason: serverDrop ? 'simulated_disconnect' : 'client_closed' }); });
    try {
      validateEnvelope(request, session);
      summary = inspectBody(await readBody(request), session);
      mode = readMode(); requireValue(MODES.includes(mode), 'CONTROL_MODE_INVALID');
      record({ event: 'request_accepted', mode, ...summary });
      const errorStatus = { http401: 401, http429: 429, http503: 503 }[mode];
      if (errorStatus) { ended = true; sendError(response, errorStatus); record({ event: 'response_end', mode, status: errorStatus }); return; }
      if (mode === 'json' || !summary.stream) {
        ended = true; response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        response.end(JSON.stringify(jsonReply(session.model, requestId))); record({ event: 'response_end', mode, status: 200 }); return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-simulated-upstream': 'true' });
      response.flushHeaders();
      const letters = Array.from(replyText(mode));
      const limit = ['hold', 'truncate', 'disconnect'].includes(mode) ? 14 : letters.length;
      if (mode !== 'empty') for (const letter of letters.slice(0, limit)) {
        if (closed || response.destroyed) return; response.write(chunk(session.model, requestId, letter)); deltas++;
        await wait(140);
      }
      if (closed || response.destroyed) return;
      if (mode === 'hold') {
        const deadline = Date.now() + 100000;
        while (!closed && !response.destroyed && Date.now() < deadline) await wait(100);
        if (!closed && !response.destroyed) { serverDrop = true; response.destroy(); }
        return;
      }
      if (mode === 'disconnect') { serverDrop = true; response.destroy(); return; }
      ended = true;
      if (mode !== 'truncate') response.write(chunk(session.model, requestId, '', true) + 'data: [DONE]\n\n');
      response.end(); record({ event: 'response_end', mode, status: 200, deltas, reason: mode === 'truncate' ? 'simulated_truncate' : 'complete' });
    } catch (error) {
      ended = true; const status = error instanceof InputError ? error.status : 500;
      record({ event: 'request_rejected', status, code: error instanceof InputError ? error.code : 'HELPER_ERROR' }); sendError(response, status);
    }
  };
}
module.exports = { SOURCE, MODES, MAX_BODY, PREFIX, InputError, validateBinding, makeSession, acceptedDummy, validateEnvelope,
  inspectBody, auditRecord, chunk, jsonReply, replyText, createHandler };
