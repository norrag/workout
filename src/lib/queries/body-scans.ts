import type { SupabaseClient } from "@supabase/supabase-js";
import type { BodyScanRow, Database } from "@/lib/types/database";
import type { BodyScanImport } from "@/lib/bodyspec/convert";

type Client = SupabaseClient<Database>;

/**
 * doc 15 §2.2 (N34 Phase 5a) — the imported scan log. Plain owner-scoped
 * reads/writes through the session client (RLS); re-syncs are idempotent
 * upserts on (user_id, provider, provider_result_id).
 */

export async function getBodyScans(
  supabase: Client,
  userId: string,
): Promise<BodyScanRow[]> {
  const { data, error } = await supabase
    .from("body_scans")
    .select("*")
    .eq("user_id", userId)
    .order("scanned_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getBodyScan(
  supabase: Client,
  userId: string,
  scanId: string,
): Promise<BodyScanRow | null> {
  const { data, error } = await supabase
    .from("body_scans")
    .select("*")
    .eq("user_id", userId)
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** provider_result_ids already imported — the sync skips these (a stored
 *  scan's canonical columns never silently change under the user). */
export async function getStoredResultIds(
  supabase: Client,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("body_scans")
    .select("provider_result_id")
    .eq("user_id", userId)
    .eq("provider", "bodyspec");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.provider_result_id));
}

export async function upsertBodyScan(
  supabase: Client,
  userId: string,
  scan: BodyScanImport,
): Promise<void> {
  const { error } = await supabase.from("body_scans").upsert(
    {
      user_id: userId,
      ...scan,
      regions: scan.regions as BodyScanRow["regions"],
      percentiles: scan.percentiles as BodyScanRow["percentiles"],
      raw: scan.raw as BodyScanRow["raw"],
    },
    { onConflict: "user_id,provider,provider_result_id" },
  );
  if (error) throw error;
}

/** The user's newest scan — the only one the profile-update proposal ever
 *  considers (doc 15 §2.3; 5b). */
export async function getNewestBodyScan(
  supabase: Client,
  userId: string,
): Promise<BodyScanRow | null> {
  const { data, error } = await supabase
    .from("body_scans")
    .select("*")
    .eq("user_id", userId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Record the proposal's resolution on the scan (5b): 'applied' after the
 * profile write + bodyweight_log append succeed, 'dismissed' on keep-current.
 * Guarded to unresolved rows so a double-submit can't restamp either way.
 */
export async function resolveScanProposal(
  supabase: Client,
  userId: string,
  scanId: string,
  resolution: "applied" | "dismissed",
): Promise<void> {
  const stamp = new Date().toISOString();
  const { error } = await supabase
    .from("body_scans")
    .update(
      resolution === "applied"
        ? { profile_applied_at: stamp }
        : { profile_dismissed_at: stamp },
    )
    .eq("user_id", userId)
    .eq("id", scanId)
    .is("profile_applied_at", null)
    .is("profile_dismissed_at", null);
  if (error) throw error;
}

/** The disconnect purge (doc 15 §2.3): imported third-party health data is
 *  the user's to remove. Logged training history is untouched. */
export async function deleteAllBodyScans(
  supabase: Client,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from("body_scans")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "bodyspec");
  if (error) throw error;
}
