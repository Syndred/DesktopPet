/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { ConversationError, fail } = require("./errors.cjs");
const MAX_RESPONSE_CHARS = 32000;
const MAX_WIRE_CHARS = 2 * 1024 * 1024;

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

// Retains the existing OpenAI-compatible Chat Completions protocol in main.
// Never exposes provider error bodies (which can echo credentials or prompts).
async function requestCompletion({ connection, apiKey, messages, signal, onDelta = () => {}, timeoutMs = 90000 }) {
  const timedSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = AbortSignal.any([signal, timedSignal]);
  let reader;
  let text = "";
  let wireChars = 0;
  let finished = false;
  function append(delta) {
    if (typeof delta !== "string") fail("INVALID_RESPONSE");
    if (text.length + delta.length > MAX_RESPONSE_CHARS) fail("RESPONSE_TOO_LARGE");
    text += delta;
    if (delta) onDelta(text);
  }
  function event(frame) {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    if (data.trim() === "[DONE]") { finished = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { fail("INVALID_RESPONSE"); }
    if (value.error) fail("PROVIDER_REJECTED");
    const choice = value.choices?.[0];
    if (choice?.delta?.content != null) append(choice.delta.content);
    if (choice?.finish_reason && !["stop", "length"].includes(choice.finish_reason)) fail("PROVIDER_REJECTED");
  }
  try {
    const body = { model: connection.model, messages, stream: true,
      ...(connection.provider === "openai" ? { max_completion_tokens: connection.maxOutputTokens } :
        { max_tokens: connection.maxOutputTokens }) };
    const response = await fetch(`${connection.baseUrl}/chat/completions`, {
      method: "POST", redirect: "error", signal: combinedSignal,
      headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      await response.body?.cancel();
      fail(response.status === 401 || response.status === 403 ? "PROVIDER_AUTH" :
        response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "PROVIDER_REJECTED");
    }
    if (!response.body) fail("INVALID_RESPONSE");
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    const streaming = (response.headers.get("content-type") || "").includes("text/event-stream");
    let buffer = "";
    while (!finished) {
      const chunk = await reader.read();
      if (chunk.done) { buffer += decoder.decode(); break; }
      const value = decoder.decode(chunk.value, { stream: true });
      wireChars += value.length;
      if (wireChars > MAX_WIRE_CHARS) fail("RESPONSE_TOO_LARGE");
      buffer += value;
      if (streaming) {
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer)) && !finished) {
          event(buffer.slice(0, boundary.index));
          buffer = buffer.slice(boundary.index + boundary[0].length);
        }
      }
    }
    if (streaming) {
      if (buffer.trim() && !finished) event(buffer);
      // A disconnected stream with partial text must remain retryable, not successful.
      if (!finished) fail("INVALID_RESPONSE");
    } else {
      let value;
      try { value = JSON.parse(buffer); } catch { fail("INVALID_RESPONSE"); }
      if (value.error) fail("PROVIDER_REJECTED");
      append(value.choices?.[0]?.message?.content ?? "");
    }
    if (!text.trim()) fail("EMPTY_RESPONSE");
    return text.trim();
  } catch (error) {
    if (signal.aborted) fail("CANCELLED");
    if (timedSignal.aborted) fail("TIMEOUT");
    if (error instanceof ConversationError) throw error;
    fail("NETWORK_ERROR");
  } finally {
    try { await reader?.cancel(); } catch { /* Already closed or aborted. */ }
    reader?.releaseLock();
  }
}
module.exports = { normalizeConnection, requestCompletion, MAX_RESPONSE_CHARS };
