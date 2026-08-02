import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assumedRir,
  stampE1rm,
  type E1rmConfig,
} from "@/lib/engine/predict";
import type { EngineParams } from "@/lib/engine";
import type { Database, LoggedSetRow } from "@/lib/types/database";
import { hashParams } from "./params-provenance";

type Client = SupabaseClient<Database>;

/**
 * Stored per-set e1RM restamp (T-N33, owner decision 2026-07-04).
 *
 * `logged_sets.e1rm` is a DERIVED display value stamped at log time under the
 * then-active engine params (`computeSetE1rm` in log/actions.ts). It is not
 * logged truth — the raw weight/reps/RIR are — so when a params activation
 * changes the e1RM model (the `e1rm` block: formula cutoff, RIR offset, …),
 * the stored stamps silently diverge from every live engine estimate. That
 * divergence is exactly what showed the owner "384" in exercise history while
 * the anchor said 367.5 (review doc 2026-07-04 §8.2).
 *
 * On activation, when (and only when) the new version's `e1rm` block differs
 * from the previously active one, every stored stamp is recomputed under the
 * new params and the changed rows rewritten — same recompute rule as log time:
 * `estimateE1rm(weight, reps, assumedRir(rir_reported, slot target_rir),
 * params)`, raw entered weight. Hard rule #5 is not implicated: the amend path
 * (`amendSet`) already treats `e1rm` as an updatable derived column.
 *
 * doc 21 §2 / N71 also makes this the vehicle for a ONE-TIME backfill: the
 * resolution rule itself changed (an unreported set now resolves to its slot's
 * prescribed target RIR instead of stamping as taken to failure), so every
 * historical stamp moves UP once. That pass is driven by the admin-gated
 * `restamp_e1rm` MCP tool rather than by a params activation, since no `e1rm`
 * block value moved.
 *
 * Caveat (documented in the review doc): a version activated BY MIGRATION
 * (e.g. v18) bypasses this hook — prefer the MCP `activate_engine_params`
 * tool when a proposal touches the `e1rm` block.
 */

/** Pure: did the `e1rm` block change between two param sets? A null previous
 *  (no previously active version resolvable) counts as changed — restamping is
 *  idempotent and only writes rows whose value actually moves. */
export function e1rmBlockChanged(
  previous: EngineParams | null,
  next: EngineParams,
): boolean {
  if (!previous) return true;
  return (
    hashParams({ e1rm: previous.e1rm }) !== hashParams({ e1rm: next.e1rm })
  );
}

export type RestampSetRow = Pick<
  LoggedSetRow,
  | "id"
  | "workout_exercise_id"
  | "weight"
  | "reps"
  | "rir_reported"
  | "e1rm"
  | "e1rm_confidence"
>;

/**
 * Pure: recompute each set's e1RM AND its confidence band under `cfg` and return
 * only the rows whose stored stamp differs on either (weight ≤ 0 / reps ≤ 0 ⇒
 * null, matching log time). The confidence bands live in the same `e1rm` block,
 * so a change to that block can move the confidence even when the value holds —
 * both must restamp together. Exported for unit tests; the I/O pager stays thin.
 *
 * doc 21 §2: the RIR each row re-prices at is the shared resolution
 * `rir_reported ?? the slot's prescribed target_rir`, supplied by
 * `targetRirByWe` (the pager resolves it per page). An absent map — or a slot
 * with no prescription — leaves the row on its reported RIR alone, i.e. the
 * pre-doc-21 behavior.
 *
 * doc 21 §6.1 (Phase 2b): the same `stampE1rm` the log/amend site uses, so the
 * measuring band applies identically to a backfill — a set past the band
 * restamps to `null` / `none` rather than to a fabricated estimate.
 */
export function planRestamps<T extends RestampSetRow>(
  rows: T[],
  cfg: E1rmConfig,
  targetRirByWe?: Map<string, number | null>,
): { row: T; e1rm: number | null; e1rm_confidence: string | null }[] {
  const out: {
    row: T;
    e1rm: number | null;
    e1rm_confidence: string | null;
  }[] = [];
  for (const r of rows) {
    const rir = assumedRir(
      r.rir_reported,
      targetRirByWe?.get(r.workout_exercise_id),
    );
    const { e1rm, e1rm_confidence } = stampE1rm(r.weight, r.reps, rir, cfg);
    if (e1rm !== r.e1rm || e1rm_confidence !== r.e1rm_confidence)
      out.push({ row: r, e1rm, e1rm_confidence });
  }
  return out;
}

export interface RestampResult {
  scanned: number;
  updated: number;
}

/**
 * Restamp every stored per-set e1RM under `params` (all users — engine params
 * are global, so the caller passes the SERVICE client). Keyset-paged full-row
 * reads; changed rows are rewritten via chunked PK upserts (the full row is
 * echoed with only `e1rm` replaced, so the write path needs no SQL function).
 * Idempotent: a re-run after the first pass scans and writes nothing.
 */
export async function restampLoggedSetE1rms(
  service: Client,
  params: EngineParams,
  opts?: { pageSize?: number; writeChunk?: number },
): Promise<RestampResult> {
  const pageSize = opts?.pageSize ?? 1000;
  const writeChunk = opts?.writeChunk ?? 500;
  const cfg = params.e1rm;

  let scanned = 0;
  let updated = 0;
  let lastId: string | null = null;
  for (;;) {
    let query = service
      .from("logged_sets")
      .select("*")
      .order("id", { ascending: true })
      .limit(pageSize);
    if (lastId != null) query = query.gt("id", lastId);
    const { data: page, error } = await query;
    if (error) throw error;
    const rows = (page ?? []) as LoggedSetRow[];
    if (rows.length === 0) break;
    scanned += rows.length;
    lastId = rows[rows.length - 1].id;

    // doc 21 §2: resolve the page's slots' prescribed target RIRs — the
    // fallback half of `assumedRir`, so a restamp reproduces exactly what log
    // time would have written for the same row.
    const weIds = [...new Set(rows.map((r) => r.workout_exercise_id))];
    const { data: wes, error: weError } = await service
      .from("workout_exercises")
      .select("id, target_rir")
      .in("id", weIds);
    if (weError) throw weError;
    const targetRirByWe = new Map(
      (wes ?? []).map((w) => [w.id, w.target_rir] as const),
    );

    const changed = planRestamps(rows, cfg, targetRirByWe);
    for (let i = 0; i < changed.length; i += writeChunk) {
      const chunk = changed
        .slice(i, i + writeChunk)
        .map((c) => ({
          ...c.row,
          e1rm: c.e1rm,
          e1rm_confidence: c.e1rm_confidence,
        }));
      const { error: upsertError } = await service
        .from("logged_sets")
        .upsert(chunk, { onConflict: "id" });
      if (upsertError) throw upsertError;
      updated += chunk.length;
    }

    if (rows.length < pageSize) break;
  }
  return { scanned, updated };
}
