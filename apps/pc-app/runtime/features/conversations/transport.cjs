/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { ConversationError, fail } = require("./errors.cjs");
const MAX_RESPONSE_CHARS = 32000;
const MAX_WIRE_BYTES = 2 * 1024 * 1024;

function normalizeConnection(value) {
  if (!value || !["deepseek", "openai", "openai_compatible"].includes(value.provider)) fail("INVALID_INPUT");
  let url;
  try { url = new URL(value.baseUrl); } catch { fail("CONNECTION_INVALID"); }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || value.baseUrl.length > 512) fail("CONNECTION_INVALID");
  const model = typeof value.model === "string" ? value.model.trim() : "";
  if (!model || model.length > 200 || [...model].some(char => char.codePointAt(0) < 32)) fail("INVALID_INPUT");
  const contextChars = value.contextChars ?? 24000;
  const maxOutputTokens = value.maxOutputTokens ?? 512;
  if (!Number.isInteger(contextChars) || contextChars < 12000 || contextChars > 48000 ||
      !Number.isInteger(maxOutputTokens) || maxOutputTokens < 64 || maxOutputTokens > 4096) fail("INVALID_INPUT");
  return { provider: value.provider, baseUrl: url.href.replace(/\/+$/, ""), model, contextChars, maxOutputTokens };
}

// AI SDK owns provider serialization, SSE parsing, stream lifecycle and JSON
// completion parsing. Our adapter owns security, bounds and stable public errors.
async function requestCompletion({ connection, apiKey, messages, signal, onDelta = () => {}, timeoutMs = 90000 }) {
  const { streamText, generateText } = await import("ai");
  const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
  const timedSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = AbortSignal.any([signal, timedSignal]);
  let text = "";
  let cachedJsonResponse = null;
  let streamError = null;
  let guardFailure = null;
  function append(delta) {
    if (combinedSignal.aborted) fail(signal.aborted ? "CANCELLED" : "TIMEOUT");
    if (text.length + delta.length > MAX_RESPONSE_CHARS) fail("RESPONSE_TOO_LARGE");
    text += delta;
    if (delta) onDelta(text);
  }
  const settings = { name: connection.provider, baseURL: connection.baseUrl, apiKey };
  const model = createOpenAICompatible({ ...settings, fetch: async (url, init) => {
    const response = await fetch(url, { ...init, redirect: "error", signal: combinedSignal });
    let bytes = 0;
    const bounded = response.body?.pipeThrough(new TransformStream({ transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_WIRE_BYTES) {
        guardFailure = new ConversationError("RESPONSE_TOO_LARGE"); controller.error(guardFailure); return;
      }
      controller.enqueue(chunk);
    } }));
    const guarded = new Response(bounded, { status: response.status, statusText: response.statusText, headers: response.headers });
    if (response.ok && response.headers.get("content-type")?.includes("application/json")) {
      // Some compatible endpoints ignore stream:true. Reuse this exact response
      // through the SDK's JSON parser, without making a second billable request.
      cachedJsonResponse = guarded;
      throw new Error("NON_STREAMING_RESPONSE");
    }
    return guarded;
  } }).chatModel(connection.model);
  const instructions = messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
  const options = { model, ...(instructions ? { instructions } : {}), messages: messages.filter(message => message.role !== "system"), maxOutputTokens: connection.maxOutputTokens, maxRetries: 0,
    abortSignal: combinedSignal, telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false } };
  try {
    let finishReason;
    const result = streamText({ ...options, onError: ({ error }) => { streamError = error; } });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") append(part.text);
      if (part.type === "error") streamError = part.error;
      if (part.type === "finish") finishReason = part.finishReason;
    }
    if (cachedJsonResponse) {
      const response = cachedJsonResponse; cachedJsonResponse = null;
      const jsonModel = createOpenAICompatible({ ...settings, fetch: async () => response }).chatModel(connection.model);
      const generated = await generateText({ ...options, model: jsonModel });
      append(generated.text); finishReason = generated.finishReason; streamError = null;
    }
    if (streamError) throw streamError;
    if (!finishReason || finishReason === "error" || finishReason === "unknown") fail("INVALID_RESPONSE");
    if (!["stop", "length"].includes(finishReason)) fail("PROVIDER_REJECTED");
    if (!text.trim()) fail("EMPTY_RESPONSE");
    return text.trim();
  } catch (error) {
    if (signal.aborted) fail("CANCELLED");
    if (timedSignal.aborted) fail("TIMEOUT");
    if (guardFailure) throw guardFailure;
    if (error instanceof ConversationError) throw error;
    // Never forward SDK errors: APICallError may contain URL, request and body.
    const code = error?.statusCode ?? error?.cause?.statusCode;
    if (code) fail(code === 401 || code === 403 ? "PROVIDER_AUTH" : code === 429 ? "RATE_LIMITED" :
      code >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED");
    if (text && streamError) fail("INVALID_RESPONSE");
    if (["AI_TypeValidationError", "AI_JSONParseError", "AI_NoOutputGeneratedError"].includes(error?.name)) fail("INVALID_RESPONSE");
    fail("NETWORK_ERROR");
  } finally {
    if (cachedJsonResponse) {
      try { await cachedJsonResponse.body?.cancel(); } catch { /* Already closed. */ }
    }
  }
}
module.exports = { normalizeConnection, requestCompletion, MAX_RESPONSE_CHARS };
