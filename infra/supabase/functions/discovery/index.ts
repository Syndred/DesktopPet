// Deployment is explicit. No production migration/deployment is performed by this feature.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import authority from "../../../../apps/pc-app/runtime/features/discovery/server-authority.cjs";

const { createAuthorityHandler } = authority;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const check = (result: { error?: { message: string } | null }) => { if (result.error) throw Object.assign(new Error("云端探索数据暂不可用"), { code: "CLOUD_STORAGE_UNAVAILABLE" }); return result; };
async function one(table: string, filters: Record<string, string>) {
  let query = client.from(table).select("*"); for (const [key, value] of Object.entries(filters)) query = query.eq(key, value);
  const result = await query.maybeSingle(); check(result); return result.data;
}
const handler = createAuthorityHandler({
  async authenticate(payload: { userId?: string; sessionToken?: string }) {
    if (!payload.userId || !payload.sessionToken) return null;
    const row = await one("runtime_accounts", { id: payload.userId, session_token: payload.sessionToken }); return row?.id || null;
  },
  store: {
    async ownedPet(owner: string, petId: string) { const row = await one("runtime_discovery_battle_profiles", { owner_account_id: owner, pet_id: petId }); return row ? { petId: row.pet_id, element: row.element } : null; },
    async findPermit(owner: string, spawnId: string) { const row = await one("runtime_discovery_permits", { owner_account_id: owner, spawn_id: spawnId }); return row?.data_json || null; },
    async getPermit(owner: string, id: string) { const row = await one("runtime_discovery_permits", { owner_account_id: owner, id }); return row?.data_json || null; },
    async reserve(permit: { id: string; owner: string; spawn: { id: string }; status: string }) {
      const result = await client.from("runtime_discovery_permits").upsert({ id: permit.id, owner_account_id: permit.owner, spawn_id: permit.spawn.id, data_json: permit }, { onConflict: "owner_account_id,spawn_id", ignoreDuplicates: true }); check(result);
      const row = await one("runtime_discovery_permits", { owner_account_id: permit.owner, spawn_id: permit.spawn.id }); return row.data_json;
    },
    async getCapture(owner: string, permitId: string) { const row = await one("runtime_discovery_captures", { owner_account_id: owner, permit_id: permitId }); return row?.data_json || null; },
    async getAction(owner: string, actionId: string) { const row = await one("runtime_discovery_actions", { owner_account_id: owner, action_id: actionId }); return row?.data_json || null; },
    async advance(owner: string, permitId: string, actionId: string, action: string, expectedRound: number, battle: unknown) {
      const result = await client.rpc("advance_runtime_discovery_battle", { p_owner: owner, p_permit: permitId, p_action_id: actionId, p_action: action, p_expected_round: expectedRound, p_battle: battle }); check(result); return result.data;
    },
    async claim(receipt: { id: string; owner: string; permitId: string }) {
      const result = await client.rpc("claim_runtime_discovery_capture", { p_owner: receipt.owner, p_permit: receipt.permitId, p_receipt: receipt }); check(result); return result.data;
    }
  }
});
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "仅支持 POST" } }, { status: 405, headers: cors });
  try {
    const payload = await request.json(); const data = await handler(payload);
    return Response.json({ ok: true, data }, { headers: cors });
  } catch (error) {
    return Response.json({ ok: false, error: { code: error.code || "DISCOVERY_ERROR", message: error.message || "探索服务暂不可用" } }, { status: 400, headers: cors });
  }
});
