import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabasePublicEnv } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Service-role client. This is the ONLY module allowed to read
 * SUPABASE_SERVICE_ROLE_KEY (CLAUDE.md hard rule 4) — deliberately kept out of
 * the shared env schema for that reason. Every call site must scope queries by
 * an explicit, server-derived user id — never trust input.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  const { url } = supabasePublicEnv();
  return createSupabaseClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
