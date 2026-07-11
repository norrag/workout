import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  getBodySpecConnection,
  getFreshBodySpecAccessToken,
  markBodySpecSyncResult,
} from "@/lib/queries/external-connections";
import {
  getStoredResultIds,
  upsertBodyScan,
} from "@/lib/queries/body-scans";
import {
  fetchResultDetail,
  fetchScanSections,
  listAllResults,
  BodySpecApiError,
} from "./api";
import { mapScanToImport } from "./convert";
import { BodySpecReconnectRequired } from "./oauth";

type Client = SupabaseClient<Database>;

export interface BodySpecSyncOutcome {
  imported: number;
  /** results skipped because they carry no composition section */
  nonDexa: number;
  error: string | null;
  /** true ⇒ the connection needs a fresh OAuth login (RECONNECT) */
  reconnectRequired: boolean;
}

function syncErrorMessage(err: unknown): string {
  if (err instanceof BodySpecReconnectRequired) {
    return "Connection expired — reconnect your BodySpec account.";
  }
  if (err instanceof BodySpecApiError) {
    return `BodySpec returned an error (HTTP ${err.status}). Try again later.`;
  }
  return "Sync failed. Try again later.";
}

/**
 * Pull-based sync (doc 15 §2.3): list the account's full result history,
 * import every DEXA result not already stored (first run = full backfill),
 * stamp the outcome on the connection row. Serial + idempotent; already-
 * imported results are never re-fetched, so a stored scan's canonical
 * columns never change under the user.
 */
export async function syncBodySpec(
  supabase: Client,
  userId: string,
): Promise<BodySpecSyncOutcome> {
  const connection = await getBodySpecConnection(supabase, userId);
  if (!connection) {
    return {
      imported: 0,
      nonDexa: 0,
      error: "No BodySpec connection.",
      reconnectRequired: false,
    };
  }

  try {
    const accessToken = await getFreshBodySpecAccessToken(
      userId,
      connection.id,
    );
    const summaries = await listAllResults(accessToken);
    const stored = await getStoredResultIds(supabase, userId);

    let imported = 0;
    let nonDexa = 0;
    // newest first so a mid-backfill failure keeps the most useful scans
    const pending = summaries
      .filter((s) => !stored.has(s.result_id))
      .sort((a, b) => (a.start_time < b.start_time ? 1 : -1));
    for (const summary of pending) {
      const detail = await fetchResultDetail(accessToken, summary.result_id);
      const fetched = await fetchScanSections(accessToken, detail);
      if (!fetched) {
        nonDexa++;
        continue;
      }
      const scan = mapScanToImport({
        providerResultId: detail.result_id,
        startTime: detail.start_time,
        sections: fetched.sections,
        raw: fetched.raw,
      });
      await upsertBodyScan(supabase, userId, scan);
      imported++;
    }

    await markBodySpecSyncResult(supabase, userId, { ok: true });
    return { imported, nonDexa, error: null, reconnectRequired: false };
  } catch (err) {
    const message = syncErrorMessage(err);
    await markBodySpecSyncResult(supabase, userId, {
      ok: false,
      message,
    }).catch(() => undefined);
    return {
      imported: 0,
      nonDexa: 0,
      error: message,
      reconnectRequired: err instanceof BodySpecReconnectRequired,
    };
  }
}
