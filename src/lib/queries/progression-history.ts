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

// ---------------------------------------------------------------------------
// doc 16 §8.3 / §10 Phase 4 — the audit AGGREGATE over recorded decisions.
//
// Everything below is read-side only: it summarizes the status-coded
// `progression` trace steps the engine already persists (earn/miss/skip mix,
// governor firings, `vanished` share for increment sizing, prescribed vs
// measured trailing gain). Nothing here feeds back into prescriptions — the
// only sanctioned feedback path is the §8.2 derived input above (and, later,
// the Phase-3 envelope). Surfaced exclusively through the admin-gated
// `get_progression_history` MCP tool (hard rule 9: no admin UI); the
// `v_progression_events` view stays unbuilt until a stats screen wants it.
// ---------------------------------------------------------------------------

/** The status-coded step exactly as recorded in the decision output (§3.6). */
export interface ProgressionAuditStep {
  status?: string;
  governor?: string;
  predicate?: string;
  deltaTarget?: number | null;
  deltaRealized?: number | null;
  targetAnchor?: number;
  detail?: string;
}

/** One recorded decision, widened from the §8.2 derivation event with the
 *  audit-only fields (full step, measured anchor, identity for display). */
export interface ProgressionAuditEvent extends ProgressionDecisionEvent {
  decisionId: string;
  kind: string;
  workoutId: string | null;
  createdAt: string;
  /** the recency-weighted MEASURED anchor recorded in the decision inputs —
   *  the performance side of the §8.3 prescribed-vs-measured comparison */
  measuredAnchor: number | null;
  anchorConfidence: string | null;
  auditStep: ProgressionAuditStep | null;
}

/** Widen a stored decision row into a `ProgressionAuditEvent`. Tolerant of
 *  pre-v20 rows exactly like `toProgressionEvent` (which it builds on). */
export function toProgressionAuditEvent(
  row: {
    id: string;
    kind: string;
    workout_id: string | null;
    microcycle_id: string | null;
    created_at: string;
    inputs: Record<string, unknown>;
    output: Record<string, unknown>;
  },
  params: EngineParams,
): ProgressionAuditEvent {
  const base = toProgressionEvent(row, params);
  const anchor = (
    row.inputs as {
      strengthAnchor?: { value?: number; confidence?: string } | null;
    }
  ).strengthAnchor;
  const trace = (row.output as { trace?: ({ rule?: string } & ProgressionAuditStep)[] })
    .trace;
  const step = trace?.find((s) => s.rule === PROGRESSION_RULE) ?? null;
  return {
    ...base,
    decisionId: row.id,
    kind: row.kind,
    workoutId: row.workout_id,
    createdAt: row.created_at,
    measuredAnchor: typeof anchor?.value === "number" ? anchor.value : null,
    anchorConfidence: anchor?.confidence ?? null,
    auditStep: step
      ? {
          status: step.status,
          governor: step.governor,
          predicate: step.predicate,
          deltaTarget: step.deltaTarget ?? null,
          deltaRealized: step.deltaRealized ?? null,
          targetAnchor: step.targetAnchor,
          detail: step.detail,
        }
      : null,
  };
}

/** First→last gain over a chronological value series. */
export interface ProgressionGain {
  first: number;
  last: number;
  gainPct: number;
  /** normalized to %/30 days — the same span floor as the pacer's trailing
   *  rate (`MIN_RATE_SPAN_DAYS`), so the two read comparably */
  gainPctPer30d: number;
  spanDays: number;
  points: number;
}

function gainOver(points: { atMs: number; value: number }[]): ProgressionGain | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const spanDays = (last.atMs - first.atMs) / DAY_MS;
  if (spanDays <= 0 || first.value <= 0) return null;
  const gainPct = (last.value / first.value - 1) * 100;
  return {
    first: first.value,
    last: last.value,
    gainPct: round2(gainPct),
    gainPctPer30d: round2(gainPct * (30 / Math.max(spanDays, MIN_RATE_SPAN_DAYS))),
    spanDays: Math.round(spanDays * 10) / 10,
    points: points.length,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The §8.3 per-exercise summary. */
export interface ProgressionAuditSummary {
  /** decisions carrying a status-coded progression step */
  decisions: number;
  statusCounts: Record<"stepped" | "vanished" | "paced" | "not_earned", number>;
  /** `paced` decisions by the governor that declined the earned step (§3.5,
   *  incl. the realized-ask rule's `max_pct_per_step`) */
  governorFirings: Record<string, number>;
  /** `not_earned` decisions by the FIRST failing gate predicate (§3.4) */
  gateFailures: Record<string, number>;
  /** vanished / (stepped + vanished) — §8.3's increment-sizing signal: a high
   *  share means the exercise's loadable step can't express the earned δ */
  vanishedShare: number | null;
  /** stepped asks answered by the NEXT decision's source-session compliance
   *  (the same pairing the miss throttle reads) */
  earnedThenMet: number;
  earnedThenMissed: number;
  /** stepped asks whose answer is unknowable (stepless follow-up row) */
  earnedUnanswered: number;
  /** the newest decision is a stepped ask still awaiting its session */
  openAsk: boolean;
  /** trailing prescribed-e1RM gain (demand side; deloads excluded) */
  prescribedGain: ProgressionGain | null;
  /** trailing measured-anchor gain (performance side; deloads excluded) —
   *  prescribed leading measured by ~one quantum is the design working */
  measuredGain: ProgressionGain | null;
}

/** Pure (exported for unit tests): fold one exercise's chronological audit
 *  events into the §8.3 summary. */
export function aggregateProgressionEvents(
  events: ProgressionAuditEvent[],
): ProgressionAuditSummary {
  const statusCounts = { stepped: 0, vanished: 0, paced: 0, not_earned: 0 };
  const governorFirings: Record<string, number> = {};
  const gateFailures: Record<string, number> = {};
  let decisions = 0;
  for (const e of events) {
    const s = e.auditStep;
    if (!s?.status) continue;
    decisions += 1;
    if (s.status in statusCounts) {
      statusCounts[s.status as keyof typeof statusCounts] += 1;
    }
    if (s.status === "paced" && s.governor) {
      governorFirings[s.governor] = (governorFirings[s.governor] ?? 0) + 1;
    }
    if (s.status === "not_earned" && s.predicate) {
      gateFailures[s.predicate] = (gateFailures[s.predicate] ?? 0) + 1;
    }
  }
  const asks = statusCounts.stepped + statusCounts.vanished;

  // decision k's source session performed the ask decision k−1 made — the
  // exact pairing the miss throttle folds (deriveProgressionHistory above)
  let earnedThenMet = 0;
  let earnedThenMissed = 0;
  let earnedUnanswered = 0;
  for (let i = 1; i < events.length; i++) {
    if (events[i - 1].auditStep?.status !== "stepped") continue;
    const answered = sourceComplied(events[i]);
    if (answered === true) earnedThenMet += 1;
    else if (answered === false) earnedThenMissed += 1;
    else earnedUnanswered += 1;
  }

  const series = events.filter((e) => !e.isDeload);
  const prescribedGain = gainOver(
    series
      .filter((e) => e.prescribedE1rm != null && e.prescribedE1rm > 0)
      .map((e) => ({ atMs: e.createdAtMs, value: e.prescribedE1rm! })),
  );
  const measuredGain = gainOver(
    series
      .filter((e) => e.measuredAnchor != null && e.measuredAnchor > 0)
      .map((e) => ({ atMs: e.createdAtMs, value: e.measuredAnchor! })),
  );

  return {
    decisions,
    statusCounts,
    governorFirings,
    gateFailures,
    vanishedShare: asks > 0 ? round2(statusCounts.vanished / asks) : null,
    earnedThenMet,
    earnedThenMissed,
    earnedUnanswered,
    openAsk: events[events.length - 1]?.auditStep?.status === "stepped",
    prescribedGain,
    measuredGain,
  };
}
