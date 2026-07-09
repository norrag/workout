import type { SupabaseClient } from "@supabase/supabase-js";
import {
  effectiveLoad,
  PROGRESSION_RULE,
  type EngineInputs,
  type EngineParams,
} from "@/lib/engine";
// zod-free e1RM core: the assembly scores each recorded prescription through
// the shared curve without re-parsing the params per row
import { estimateE1rm as estimateE1rmCore } from "@/lib/engine/predict";
import type { Database } from "@/lib/types/database";

/**
 * doc 16 §8.2 — the progression governors' derived lookback input, assembled
 * from recent `engine_decisions` for the user × exercise (same pattern and
 * doc-14 treatment as the strength anchor: recomputed on read, EXCLUDED from
 * the freshness fingerprint, recorded in the decision for replay). History is
 * per user × exercise across meso/macro boundaries by construction (§4).
 *
 * A LEAF module (imports the engine only): both the advance path
 * (`queries/progression.ts`) and the seed path (`queries/generation.ts`)
 * consume it, and those two cannot import each other (progression.ts already
 * imports generation.ts for the active params) — same pattern as
 * `engine-goal.ts`. progression.ts re-exports everything here, so existing
 * importers and tests are untouched.
 */

type Client = SupabaseClient<Database>;

export type ProgressionHistoryInput = NonNullable<
  EngineInputs["progressionHistory"]
>;

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * How far back the pacer's rate memory reaches. The engine compares the
 * TRAILING NORMALIZED rate (%/30 days) against the monthly target; measuring
 * the gain over up to ~90 days is what makes the §3.5 arithmetic come out —
 * one ~3% quantum reads ≥ a 1%/mo advanced target until it is ~90 days old
 * (≈ quarterly), ≥ a 2.25%/mo intermediate target until ~40 days (≈ monthly),
 * and ≥ a 6%/mo beginner target until ~15 days (≈ every other microcycle).
 * A 30-day-hard window would forget every step at the same monthly rate for
 * all buckets.
 */
export const PROGRESSION_LOOKBACK_DAYS = 90;

/** Floor on the normalizing span, so two decisions minutes apart don't read as
 *  an absurd monthly rate off lattice noise. */
const MIN_RATE_SPAN_DAYS = 7;

/** One recorded decision, reduced to what the lookback derivation needs. */
export interface ProgressionDecisionEvent {
  createdAtMs: number;
  microcycleId: string | null;
  /** decisions FOR a deload week are excluded from the rate series */
  isDeload: boolean;
  /** the e1RM the recorded prescription demands (effective load, shared curve) */
  prescribedE1rm: number | null;
  /** the decision's status-coded `progression` trace step, when one exists */
  step: { status?: string; predicate?: string } | null;
}

/** Did this decision's SOURCE session pass the compliance predicate? The gate
 *  names the FIRST failing predicate and compliance is checked first, so any
 *  status other than `not_earned`+`compliance` means the session complied.
 *  Null = unknown (pre-v20 decision, or no compliance context). */
function sourceComplied(e: ProgressionDecisionEvent): boolean | null {
  const s = e.step;
  if (!s?.status) return null;
  if (s.status === "not_earned") {
    if (s.predicate === "compliance") return false;
    if (s.predicate === "no_previous_session") return null;
    return true;
  }
  return true; // stepped | vanished | paced all imply the earn gate passed
}

/**
 * Pure (exported for unit tests): fold a chronological decision stream into
 * the engine's `progressionHistory` derived input.
 *
 * - `earnedThisMicrocycle` — a `stepped` decision already targets the
 *   microcycle being generated (cadence, §3.5). Only realized steps count:
 *   a `vanished` earn claimed nothing and retries (§2.3).
 * - `trailing30dPrescribedGainPct` — prescribed-e1RM gain between the oldest
 *   and newest working decision in the lookback, normalized to %/30 days
 *   (the pacer input). Null when there is nothing to measure.
 * - `consecutiveMissedEarns` — the current run of earned-then-missed cycles
 *   (a `stepped` ask whose next decision records a compliance failure),
 *   reported as 0 once `missRearmSessions − 1` fully-compliant sessions have
 *   followed the last miss (the current session, evaluated in-engine, is the
 *   final one — §3.5 miss throttle).
 */
export function deriveProgressionHistory(
  events: ProgressionDecisionEvent[],
  opts: {
    targetMicrocycleId: string | null;
    missRearmSessions: number;
    nowMs: number;
  },
): ProgressionHistoryInput {
  const earnedThisMicrocycle =
    opts.targetMicrocycleId != null &&
    events.some(
      (e) =>
        e.microcycleId === opts.targetMicrocycleId &&
        e.step?.status === "stepped",
    );

  // trailing prescribed rate, normalized to %/30 days
  const windowStart = opts.nowMs - PROGRESSION_LOOKBACK_DAYS * DAY_MS;
  const series = events.filter(
    (e) =>
      !e.isDeload &&
      e.prescribedE1rm != null &&
      e.prescribedE1rm > 0 &&
      e.createdAtMs >= windowStart,
  );
  let trailing30dPrescribedGainPct: number | null = null;
  if (series.length >= 2) {
    const first = series[0];
    const last = series[series.length - 1];
    const spanDays = (last.createdAtMs - first.createdAtMs) / DAY_MS;
    if (spanDays > 0) {
      const gainPct = (last.prescribedE1rm! / first.prescribedE1rm! - 1) * 100;
      trailing30dPrescribedGainPct =
        Math.round(gainPct * (30 / Math.max(spanDays, MIN_RATE_SPAN_DAYS)) * 100) /
        100;
    }
  }

  // miss throttle: decision k answers the ask made by decision k−1
  const asked = (e: ProgressionDecisionEvent) => e.step?.status === "stepped";
  let lastMissIdx = -1;
  for (let i = events.length - 1; i >= 1; i--) {
    if (asked(events[i - 1]) && sourceComplied(events[i]) === false) {
      lastMissIdx = i;
      break;
    }
  }
  let consecutiveMissedEarns = 0;
  if (lastMissIdx >= 1) {
    // the run of consecutive missed attempts ending at the last miss — a
    // performed (or unknown) attempt breaks it; non-attempt sessions don't
    let run = 0;
    for (let i = lastMissIdx; i >= 1; i--) {
      if (!asked(events[i - 1])) continue;
      if (sourceComplied(events[i]) === false) run += 1;
      else break;
    }
    // re-arm: fully compliant sessions recorded since the miss; the current
    // session's own compliance is the engine's gate, so one fewer is needed here
    let compliantAfter = 0;
    for (let i = lastMissIdx + 1; i < events.length; i++) {
      if (sourceComplied(events[i]) === true) compliantAfter += 1;
    }
    consecutiveMissedEarns =
      run >= 2 && compliantAfter >= opts.missRearmSessions - 1 ? 0 : run;
  }

  return {
    earnedThisMicrocycle,
    trailing30dPrescribedGainPct,
    consecutiveMissedEarns,
  };
}

/** Narrow a stored decision row into a `ProgressionDecisionEvent`. Exported for
 *  unit tests; tolerant of pre-v20 rows (no trace step, partial inputs). */
export function toProgressionEvent(
  row: {
    microcycle_id: string | null;
    created_at: string;
    inputs: Record<string, unknown>;
    output: Record<string, unknown>;
  },
  params: EngineParams,
): ProgressionDecisionEvent {
  const inputs = row.inputs as {
    week?: { isDeload?: boolean };
    exercise?: { loadType?: string };
    bodyweight?: number | null;
  };
  const output = row.output as {
    weight?: number | null;
    reps?: number | null;
    targetRir?: number;
    trace?: { rule?: string; status?: string; predicate?: string }[];
  };
  const step =
    output.trace?.find((s) => s.rule === PROGRESSION_RULE) ?? null;

  let prescribedE1rm: number | null = null;
  const loadType = inputs.exercise?.loadType ?? "external";
  if (output.weight != null && output.reps != null && output.targetRir != null) {
    const load =
      loadType === "external"
        ? output.weight
        : effectiveLoad(
            loadType as Parameters<typeof effectiveLoad>[0],
            output.weight,
            inputs.bodyweight ?? null,
          );
    if (load != null && load > 0) {
      prescribedE1rm =
        estimateE1rmCore(load, output.reps, output.targetRir, params.e1rm)
          ?.value ?? null;
    }
  }

  return {
    createdAtMs: new Date(row.created_at).getTime(),
    microcycleId: row.microcycle_id,
    isDeload: inputs.week?.isDeload === true,
    prescribedE1rm,
    step: step ? { status: step.status, predicate: step.predicate } : null,
  };
}

/**
 * Assemble the `progressionHistory` derived input per exercise from recent
 * `engine_decisions` (doc 16 §8.2). Returns null when the progression mode is
 * inactive — the callers then omit the input entirely, keeping recorded
 * decision inputs byte-identical to today (§2.7).
 */
export async function getProgressionHistories(
  client: Client,
  userId: string,
  exerciseIds: string[],
  targetMicrocycleId: string | null,
  params: EngineParams,
): Promise<Map<string, ProgressionHistoryInput> | null> {
  if (params.progression?.mode !== "earned_step") return null;
  const out = new Map<string, ProgressionHistoryInput>();
  if (exerciseIds.length === 0) return out;

  const nowMs = Date.now();
  const sinceIso = new Date(
    nowMs - PROGRESSION_LOOKBACK_DAYS * DAY_MS,
  ).toISOString();
  const { data, error } = await client
    .from("engine_decisions")
    .select("exercise_id, microcycle_id, created_at, inputs, output")
    .eq("user_id", userId)
    .in("exercise_id", exerciseIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(2000);
  if (error) throw error;

  const byExercise = new Map<string, ProgressionDecisionEvent[]>();
  for (const row of data ?? []) {
    if (!row.exercise_id) continue;
    const cur = byExercise.get(row.exercise_id) ?? [];
    cur.push(toProgressionEvent(row, params));
    byExercise.set(row.exercise_id, cur);
  }
  const missRearmSessions = params.progression.miss_rearm_sessions;
  for (const exerciseId of exerciseIds) {
    out.set(
      exerciseId,
      deriveProgressionHistory(byExercise.get(exerciseId) ?? [], {
        targetMicrocycleId,
        missRearmSessions,
        nowMs,
      }),
    );
  }
  return out;
}

/** doc 16 §3.4 staleness input: days since the source session was performed,
 *  or null when unknown. Clock lives here — the engine stays pure. */
export function daysSincePerformed(performedAt: string | null): number | null {
  if (!performedAt) return null;
  const ms = Date.now() - new Date(performedAt).getTime();
  return ms >= 0 ? ms / DAY_MS : 0;
}
