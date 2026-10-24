import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createAccountsHandler } from "./handler.ts";

Deno.serve(createAccountsHandler(() => {
  const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Service configuration unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}));
