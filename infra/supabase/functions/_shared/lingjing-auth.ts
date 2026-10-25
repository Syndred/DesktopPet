import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.98.0";

export type LingjingActor = Readonly<{
  schemaVersion: 1; authority: "live"; authKind: "supabase";
  authUserId: string; ownerAccountId: string; deviceId: string; sessionId: string;
  account: string; username: string;
}>;
export type ActorContext = LingjingActor & { readonly client: SupabaseClient };
export class LingjingAuthError extends Error {
  constructor(public code: string, public status = 401) { super(code); }
}
export const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function namedKey(dictionary: string): string {
  try { const value = JSON.parse(Deno.env.get(dictionary) || "{}"); return typeof value.default === "string" ? value.default : ""; }
  catch { throw new LingjingAuthError("CLOUD_CONFIG_UNAVAILABLE", 503); }
}
/** Hosted Edge injects plural JSON dictionaries for modern keys. Singular and
 * legacy names are compatibility fallbacks, never preferred over a modern key. */
export function supabasePublicConfig() {
  const url = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  const key = namedKey("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url.startsWith("https://") || !key || key.startsWith("sb_secret_")) throw new LingjingAuthError("CLOUD_CONFIG_UNAVAILABLE", 503);
  return { url, key };
}
export function createAdminClient() {
  const { url } = supabasePublicConfig();
  const key = namedKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!key || key.startsWith("sb_publishable_")) throw new LingjingAuthError("CLOUD_CONFIG_UNAVAILABLE", 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-lingjing-device-id" };
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
export function authError(error: unknown) {
  if (error instanceof LingjingAuthError) return jsonResponse({ ok: false, code: error.code, message: error.status === 401 ? "请重新登录。" : error.status === 403 ? "无权访问此存档。" : error.status === 413 ? "请求超出大小限制。" : "请求未完成。" }, error.status);
  return jsonResponse({ ok: false, code: "CLOUD_UNAVAILABLE", message: "云端请求未完成。" }, 503);
}
export function assertActorOwner(actor: LingjingActor, owner: unknown) {
  if (owner !== actor.ownerAccountId) throw new LingjingAuthError("OWNER_MISMATCH", 403);
}
export function assertDifferentPlayers(first: LingjingActor, secondOwner: string) {
  if (first.ownerAccountId === secondOwner) throw new LingjingAuthError("SAME_ACCOUNT_PLAYERS", 403);
}
export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try {
    if (reader) for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new LingjingAuthError("REQUEST_TOO_LARGE", 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(size); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch (error) { if (error instanceof LingjingAuthError) throw error; throw new LingjingAuthError("INVALID_REQUEST", 400); }
}

/** Never accepts a supplied userId/owner, legacy single token, or service key.
 * Fresh getUser verifies the JWT; the actor RPC checks auth.sessions revocation,
 * the canonical text owner, device/session binding, and anonymous-user exclusion.
 * user_metadata is never an authorization source. client stays server-only. */
export async function requireActor(request: Request, options: { registerDevice?: boolean; deviceLabel?: string } = {}): Promise<ActorContext> {
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization);
  const deviceId = request.headers.get("x-lingjing-device-id")?.toLowerCase();
  if (!match || match[1].length > 32768) throw new LingjingAuthError("AUTH_REQUIRED");
  if (!uuid(deviceId)) throw new LingjingAuthError("DEVICE_REQUIRED");
  const { url, key: publishable } = supabasePublicConfig();
  const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization, "X-Lingjing-Device-Id": deviceId } } });
  const verified = await client.auth.getUser(match[1]);
  if (verified.error || !verified.data.user || verified.data.user.is_anonymous) throw new LingjingAuthError("AUTH_INVALID");
  let claims;
  try { claims = JSON.parse(atob(match[1].split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))); } catch { throw new LingjingAuthError("AUTH_INVALID"); }
  if (claims.sub !== verified.data.user.id || claims.role !== "authenticated" || claims.iss !== `${url.replace(/\/$/,"")}/auth/v1`
    || !uuid(claims.session_id) || !Number.isFinite(claims.exp) || claims.exp <= Date.now()/1000
    || !(claims.aud === "authenticated" || Array.isArray(claims.aud) && claims.aud.includes("authenticated"))) throw new LingjingAuthError("AUTH_INVALID");
  const operation = options.registerDevice ? "lingjing_register_device" : "lingjing_actor_context";
  const { data, error } = await client.rpc(operation, { p_device_id: deviceId, ...(options.registerDevice ? { p_label: options.deviceLabel || "Windows PC" } : {}) });
  if (error) {
    const code = /LJ_([A-Z_]+)/.exec(error.message)?.[1] || "AUTH_INVALID";
    throw new LingjingAuthError(code);
  }
  if (data?.schemaVersion !== 1 || data.authority !== "live" || data.authKind !== "supabase"
    || data.authUserId !== verified.data.user.id || data.deviceId !== deviceId || data.sessionId !== claims.session_id
    || typeof data.ownerAccountId !== "string" || !data.ownerAccountId || data.ownerAccountId.length > 160) throw new LingjingAuthError("ACTOR_INVALID");
  // Accidental JSON serialization cannot include the SDK's Authorization header.
  return Object.freeze(Object.defineProperty({ ...data }, "client", { value: client, enumerable: false, writable: false })) as ActorContext;
}

export function withActor(handler: (request: Request, actor: ActorContext) => Promise<Response>): (request: Request) => Promise<Response> {
  return async request => {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "POST") return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    try { return await handler(request, await requireActor(request)); } catch (error) { return authError(error); }
  };
}
