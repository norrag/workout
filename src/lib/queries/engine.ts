import type { SupabaseClient } from "@supabase/supabase-js";
import { engineParamsSchema, type EngineParams } from "@/lib/engine";
import type { Database } from "@/lib/types/database";

type Client = SupabaseClient<Database>;

/**
 * The single active `engine_params` row, schema-validated. Throws if none
 * is active or the row fails the schema — a malformed param set must never
 * silently fall back.
 */
export async function getActiveEngineParams(
  supabase: Client,
): Promise<{ version: number; params: EngineParams }> {
  const { data, error } = await supabase
    .from("engine_params")
    .select("version, params")
    .eq("is_active", true)
    .single();
  if (error) throw error;
  return { version: data.version, params: engineParamsSchema.parse(data.params) };
}
