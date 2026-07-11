import type { SupabaseClient } from "@supabase/supabase-js";
import {
  complianceBand,
  deriveBandPosition,
  effectiveLoad,
  envelopeActive,
  setComplianceMarker,
  type EngineInputs,
  type EngineParams,
  type EnvelopeMesoOutcome,
} from "@/lib/engine";
import type { Database } from "@/lib/types/database";
import {
  aggregateProgressionEvents,
  toProgressionAuditEvent,
  type ProgressionAuditEvent,
} from "./progression-history";

/**
 * doc 17 §7 (N36) — the envelope loop's `bandPosition` derived input,
 * assembled from the trailing COMPLETED mesos' recorded `engine_decisions`
 * and folded through the pure update rule (`engine/rules/envelope.ts`).
 *
 * Same doc-14 §3 treatment and leaf-module role as `plan-rate.ts` /
 * `progression-history.ts`: both the seed path (`queries/generation.ts`) and
 * the advance path (`queries/progression.ts`) consume it, and those two
 * cannot import each other. Self-gates: null unless the progression mode is
 * active AND the `progression.envelope` block is present+enabled, so callers
 * that spread it under their existing gates record nothing new and stored
 * decision inputs stay byte-identical while the loop is off (doc 17
 * principle 7).
 *
 * Grain is per USER (architecture record §3.3) — one query per operation, not
 * per exercise. Because only completed mesos feed the fold, the value is
 * constant for the whole meso being generated: evaluating at advance time
 * yields exactly the seed-time position (updates land at meso boundaries
 * only). The swap/backfill paths (slot-prescription, regeneration §7c) omit
 * it exactly as they omit `planStrengthRate` — those decisions pace off the
 * params default, the documented degradation direction.
 */

type Client = SupabaseClient<Database>;

const DAY_MS = 1000 * 60 * 60 * 24;

/** Everything the per-meso aggregation needs from one decision row. */
export type EnvelopeDecisionRow = {
  id: string;
  kind: string;
  workout_id: string | null;
  mesocycle_id: string | null;
  microcycle_id: string | null;
  exercise_id: string | null;
  created_at: string;
  inputs: Record<string, unknown>;
  output: Record<string, unknown>;
};

/**
 * Share of the source session's comparable working sets marked `over` their
 * prescribed set — the §5.3 shared comparison, recomputed from the decision's
 * recorded inputs (one curve, one comparison; doc 16 principle 5).
 */
function overCounts(
  row: EnvelopeDecisionRow,
  params: EngineParams,
): { over: number; comparable: number } {
  const inputs = row.inputs as {
    previous?: {
      weight: number | null;
      reps: number | null;
      targetRir: number;
    } | null;
    actualSets?: {
      weight: number;
      reps: number;
      rirReported?: number | null;
      isWarmup?: boolean;
    }[];
    exercise?: { loadType?: string };
    bodyweight?: number | null;
  };
  const prev = inputs.previous;
  if (!prev || prev.weight == null || prev.reps == null) {
    return { over: 0, comparable: 0 };
  }
  const loadType = (inputs.exercise?.loadType ?? "external") as Parameters<
    typeof effectiveLoad
  >[0];
  const bwModel = (params.bodyweight_model ?? false) && loadType !== "external";
  const effective = (entered: number): number | null =>
    bwModel ? effectiveLoad(loadType, entered, inputs.bodyweight ?? null) : entered;
  const band = complianceBand(params);
  const prescribedEffectiveWeight = effective(prev.weight);
  let over = 0;
  let comparable = 0;
  for (const set of inputs.actualSets ?? []) {
    if (set.isWarmup) continue;
    const marker = setComplianceMarker({
      prescribedEffectiveWeight,
      prescribedReps: prev.reps,
      loggedEffectiveWeight: effective(set.weight),
      loggedReps: set.reps,
      loggedRir: set.rirReported ?? null,
      targetRir: prev.targetRir,
      band,
      e1rmCfg: params.e1rm,
    });
    if (marker == null) continue;
    comparable += 1;
    if (marker === "over") over += 1;
  }
  return { over, comparable };
}

/**
 * Pure (exported for unit tests): fold one completed meso's chronological
 * audit events into its demand-side outcome aggregate. Reuses the §8.3
 * `aggregateProgressionEvents` fold per exercise (the ask→answer pairing must
 * stay per-exercise), then sums to meso grain.
 */
export function aggregateMesoOutcome(
  eventsByExercise: Map<string, ProgressionAuditEvent[]>,
  overTotals: { over: number; comparable: number },
): EnvelopeMesoOutcome {
  const out: EnvelopeMesoOutcome = {
    decisions: 0,
    earned: 0,
    earnedThenMet: 0,
    earnedThenMissed: 0,
    throttleTrips: 0,
    pacerTrips: 0,
    workloadFirings: 0,
    overShare:
      overTotals.comparable > 0
        ? Math.round((overTotals.over / overTotals.comparable) * 100) / 100
        : null,
  };
  for (const events of eventsByExercise.values()) {
    const s = aggregateProgressionEvents(events);
    out.decisions += s.decisions;
    out.earned +=
      s.statusCounts.stepped + s.statusCounts.vanished + s.statusCounts.paced;
    out.earnedThenMet += s.earnedThenMet;
    out.earnedThenMissed += s.earnedThenMissed;
    out.throttleTrips += s.governorFirings["miss_throttle"] ?? 0;
    out.pacerTrips += s.governorFirings["rate_pacer"] ?? 0;
    out.workloadFirings += s.gateFailures["workload"] ?? 0;
  }
  return out;
}

/**
 * Pure (exported for unit tests): chronological decision rows + the set of
 * COMPLETED meso ids → the trailing boundary outcomes, oldest→newest. Only
 * completed mesos are boundaries — the active meso never moves its own
 * position, and abandoned blocks are not evidence the athlete trained
 * through; the trailing window is bounded by count here and by age at the
 * query (`max_age_days`).
 */
export function envelopeOutcomesFromRows(
  rows: EnvelopeDecisionRow[],
  completedMesoIds: Set<string>,
  params: EngineParams,
  lookbackMesos: number,
): EnvelopeMesoOutcome[] {
  // group per meso (chronological by first decision), per exercise within
  const byMeso = new Map<string, EnvelopeDecisionRow[]>();
  for (const row of rows) {
    if (!row.mesocycle_id || !completedMesoIds.has(row.mesocycle_id)) continue;
    const cur = byMeso.get(row.mesocycle_id) ?? [];
    cur.push(row);
    byMeso.set(row.mesocycle_id, cur);
  }

  const outcomes: EnvelopeMesoOutcome[] = [];
  for (const mesoRows of byMeso.values()) {
    const byExercise = new Map<string, ProgressionAuditEvent[]>();
    const overTotals = { over: 0, comparable: 0 };
    for (const row of mesoRows) {
      if (!row.exercise_id) continue;
      const event = toProgressionAuditEvent(row, params);
      const cur = byExercise.get(row.exercise_id) ?? [];
      cur.push(event);
      byExercise.set(row.exercise_id, cur);
      // beat share reads working weeks that actually carried a step
      if (event.auditStep && !event.isDeload) {
        const counts = overCounts(row, params);
        overTotals.over += counts.over;
        overTotals.comparable += counts.comparable;
      }
    }
    outcomes.push(aggregateMesoOutcome(byExercise, overTotals));
  }
  // Map preserves insertion order = chronological (rows arrive ordered);
  // trailing window by count
  return outcomes.slice(-lookbackMesos);
}

/**
 * Assemble the trailing completed-meso outcomes for one user, oldest→newest,
 * bounded by count (`lookback_mesos`) and age (`max_age_days`).
 */
async function getEnvelopeOutcomes(
  client: Client,
  userId: string,
  params: EngineParams,
): Promise<EnvelopeMesoOutcome[]> {
  const env = params.progression!.envelope!;
  const sinceIso = new Date(
    Date.now() - env.max_age_days * DAY_MS,
  ).toISOString();
  const { data, error } = await client
    .from("engine_decisions")
    .select(
      "id, kind, workout_id, mesocycle_id, microcycle_id, exercise_id, created_at, inputs, output",
    )
    .eq("user_id", userId)
    .not("mesocycle_id", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(5000);
  if (error) throw error;
  const rows = (data ?? []) as EnvelopeDecisionRow[];
  if (rows.length === 0) return [];

  const mesoIds = [...new Set(rows.map((r) => r.mesocycle_id!))];
  const { data: mesos, error: mesoError } = await client
    .from("mesocycles")
    .select("id, status")
    .in("id", mesoIds);
  if (mesoError) throw mesoError;
  const completed = new Set(
    (mesos ?? []).filter((m) => m.status === "completed").map((m) => m.id),
  );
  return envelopeOutcomesFromRows(rows, completed, params, env.lookback_mesos);
}

/**
 * The caller-facing derivation: the per-user band position, or null while the
 * loop is off (progression mode inactive, or no/disabled `envelope` block) —
 * callers then omit the input entirely and everything recorded stays
 * byte-identical to today.
 */
export async function getBandPosition(
  client: Client,
  userId: string,
  params: EngineParams,
): Promise<NonNullable<EngineInputs["bandPosition"]> | null> {
  if (!envelopeActive(params)) return null;
  const outcomes = await getEnvelopeOutcomes(client, userId, params);
  return deriveBandPosition(outcomes, params);
}
