import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { reportError } from "@/lib/observability/report";
import type { CatalogRecord, CatalogVariant } from "@/lib/mcp/catalog";

/**
 * N91 — data access for per-connection tool-catalog freshness
 * (`mcp_client_catalog`).
 *
 * Service-role, always scoped by a server-derived `userId` (hard rule 4): the
 * table has no user write policy, and the identity here comes from the verified
 * bearer token, never from a tool argument.
 *
 * Every function in this module is best-effort. Freshness is a *notice*, not a
 * correctness property of anyone's training data — if the table is unreachable
 * the connector must keep answering tool calls exactly as it did before this
 * feature existed. So a read failure returns "cannot tell" and a write failure
 * is reported and swallowed.
 */

export interface CatalogServed {
  fingerprint: string;
  generation: number;
  variant: CatalogVariant;
  toolCount: number;
  clientName?: string | null;
}

/**
 * The outcome of a freshness lookup.
 *
 * `available: false` is NOT the same as "no row", and conflating them would be
 * this feature's worst failure mode. "No row" means an untracked connection,
 * which reads as stale — correct, and the whole point. "Could not read" means
 * the table is unreachable: unapplied migration, outage, missing service key.
 * If that also read as stale, an unapplied migration would warn *every* user,
 * every hour, forever, with no way to clear it — because the write that clears
 * it would be failing too. This repo has shipped code ahead of its migration
 * before (N88/PR #221), so the distinction is load-bearing rather than tidy.
 */
export type CatalogLookup =
  | { available: true; record: CatalogRecord | null }
  | { available: false; record: null };

/** The freshness row for one (user, OAuth client). */
export async function getCatalogRecord(
  userId: string,
  clientId: string,
): Promise<CatalogLookup> {
  try {
    const { data, error } = await createServiceClient()
      .from("mcp_client_catalog")
      .select(
        "catalog_fingerprint, catalog_generation, catalog_variant, listed_at, notified_at",
      )
      .eq("user_id", userId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { available: true, record: null };
    return {
      available: true,
      record: {
        fingerprint: data.catalog_fingerprint,
        generation: data.catalog_generation,
        variant: data.catalog_variant as CatalogVariant | null,
        listedAt: data.listed_at,
        notifiedAt: data.notified_at,
      },
    };
  } catch (err) {
    await reportError("mcp:catalog-read", err, { clientId });
    return { available: false, record: null };
  }
}

/**
 * Record that this connection was served the given catalog.
 *
 * This is the only thing that clears staleness, and it clears it by recording
 * the truth rather than by flipping a flag: after a `tools/list`, what the
 * client holds is what we just sent. `notified_at` is reset to null in the same
 * write — a connection that has been brought current has not been warned about
 * this catalog, so if it ever goes stale again the first call warns immediately
 * instead of waiting out a cooldown left over from the previous generation.
 */
export async function recordCatalogServed(
  userId: string,
  clientId: string,
  served: CatalogServed,
): Promise<void> {
  try {
    const { error } = await createServiceClient()
      .from("mcp_client_catalog")
      .upsert(
        {
          user_id: userId,
          client_id: clientId,
          catalog_fingerprint: served.fingerprint,
          catalog_generation: served.generation,
          catalog_variant: served.variant,
          tool_count: served.toolCount,
          ...(served.clientName ? { client_name: served.clientName } : {}),
          listed_at: new Date().toISOString(),
          notified_at: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,client_id" },
      );
    if (error) throw error;
  } catch (err) {
    await reportError("mcp:catalog-write", err, { clientId });
  }
}

/**
 * Stamp that the stale notice has just been attached for this connection.
 *
 * Upserts rather than updates because the connections that most need the notice
 * are precisely the ones with no row: everything that connected before this
 * table existed. The row it creates carries a null fingerprint — "seen, never
 * observed listing" — which keeps reading as stale until a real `tools/list`
 * fills it in.
 */
export async function recordCatalogNotified(
  userId: string,
  clientId: string,
  clientName?: string | null,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    const { error } = await createServiceClient()
      .from("mcp_client_catalog")
      .upsert(
        {
          user_id: userId,
          client_id: clientId,
          ...(clientName ? { client_name: clientName } : {}),
          notified_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,client_id" },
      );
    if (error) throw error;
  } catch (err) {
    await reportError("mcp:catalog-notify", err, { clientId });
  }
}
