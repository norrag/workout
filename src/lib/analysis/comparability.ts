/**
 * Analysis comparability (12 §Stage 3) — pure, deterministic interpretation
 * helpers that make single-exercise e1RM analysis compare *like with like*.
 *
 * Why this exists (12 "Why" + Stage 3): driving the connector as a coach
 * surfaced a false stall — Dumbbell Curl read `declining −18%, stalled` because
 * the lone "latest" session happened to be the lighter of two day-slots, the
 * lifetime best was set in a different (cut) phase, and that light set was a
 * low-confidence high-rep estimate. The fix is comparability, not a new metric:
 *   1. rolling window instead of a single latest read (kills the light-slot
 *      artifact),
 *   2. phase awareness — segment / caveat across a cut↔bulk boundary
 *      (decision #2: goal_type is the segmenting dimension),
 *   3. e1RM confidence — down-weight low-confidence (high-rep / high-RIR)
 *      points in best & trend ([10] §1 already specs the bands),
 *   4. matched comparison across mesos keyed on prescribed RIR (decision #2).
 *
 * The engine still owns every prescribed number; this is read/interpretation
 * only. Honesty guardrails ([10] §9): e1RM stays an estimate/trend, confidence
 * is presented as a band not new precision, cross-phase reads are caveated.
 */

import { estimateE1rm, type EngineParams, type E1rmConfidence } from "@/lib/engine";

// --- inputs ----------------------------------------------------------------

/** One logged working set, the raw material for a session's e1RM. */
export interface SessionSet {
  weight: number;
  reps: number;
  /** reported reps-in-reserve, or null (unknown ⇒ low confidence) */
  rir: number | null;
}

/**
 * One training session for an exercise, already tagged with the comparability
 * dimensions: the block's goal (phase) and the week's prescribed RIR. e1RM and
 * its confidence are the session's representative top set (see pickSessionE1rm).
 */
export interface ExerciseSession {
  performed_on: string;
  mesocycle_id: string;
  meso_name: string;
  /** macro goal: hypertrophy | strength | cut | maintain — the phase key */
  goal_type: string;
  /** the microcycle's prescribed target RIR for matched-intent comparison */
  target_rir: number | null;
  e1rm: number | null;
  confidence: E1rmConfidence | null;
  top_weight: number | null;
  top_reps: number | null;
  top_rir: number | null;
  working_sets: number;
  /**
   * Stage 5 (session-order / fatigue-position) comparability dimensions:
   * - `day_number`: the meso day-slot this session sits in (`workouts.day_number`).
   *   A movement that occupies two day-slots (e.g. the curl on Day 1 at 25 lb and
   *   Day 3 at 20 lb) is a sawtooth when pooled but two clean series when split.
   * - `session_position`: the movement's 1-based ordinal within its session (1 =
   *   trained first). Lets analysis tell "first movement, fresh" from "4th, fatigued."
   * - `session_size`: how many exercises were trained that session (the denominator
   *   for the position, e.g. "3rd of 6").
   * All nullable: a session with no resolvable day/order leaves them null.
   */
  day_number: number | null;
  day_label: string | null;
  session_position: number | null;
  session_size: number | null;
}

// --- confidence weighting ([10] §1) ----------------------------------------

export type Trend = "improving" | "plateau" | "declining" | "insufficient_data";

/**
 * Relative trust per e1RM confidence band — a low-confidence point (a high-rep
 * or far-from-failure set) is weaker evidence than a heavy near-failure one, so
 * it is *down-weighted*, never dropped (still shown, with a band). [10] §1.
 * Module constants, not engine_params: these are read-side display weights, not
 * a prescription tunable (consistent with the Stage 2 fractional-weight call).
 */
export const CONFIDENCE_WEIGHT: Record<E1rmConfidence, number> = {
  high: 1,
  moderate: 0.6,
  low: 0.25,
};

const CONFIDENCE_RANK: Record<E1rmConfidence, number> = {
  high: 3,
  moderate: 2,
  low: 1,
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The session's representative e1RM: the strongest set within the *most
 * trustworthy* confidence tier present (prefer a high-confidence set over a
 * bigger low-confidence number — a 20×11 set is weaker evidence than a 35×8
 * one, [10] §1). Returns the chosen set's load/reps/rir so a coach can see what
 * the estimate rests on. Pure; null when no set yields an estimate.
 */
export function pickSessionE1rm(
  sets: SessionSet[],
  params: EngineParams,
): {
  value: number;
  confidence: E1rmConfidence;
  top_weight: number;
  top_reps: number;
  top_rir: number | null;
} | null {
  const ests = sets
    .map((s) => ({ s, est: estimateE1rm(s.weight, s.reps, s.rir, params) }))
    .filter((x): x is { s: SessionSet; est: NonNullable<typeof x.est> } => x.est != null);
  if (ests.length === 0) return null;

  for (const tier of ["high", "moderate", "low"] as E1rmConfidence[]) {
    const inTier = ests.filter((x) => x.est.confidence === tier);
    if (inTier.length === 0) continue;
    const best = inTier.reduce((a, b) => (b.est.value > a.est.value ? b : a));
    return {
      value: round1(best.est.value),
      confidence: best.est.confidence,
      top_weight: best.s.weight,
      top_reps: best.s.reps,
      top_rir: best.s.rir,
    };
  }
  return null;
}

// --- phase segmentation (decision #2) --------------------------------------

export interface PhaseSegment {
  goal_type: string;
  sessions: number;
  first_e1rm: number | null;
  best_e1rm: number | null;
  latest_e1rm: number | null;
  span: { from: string; to: string };
}

/**
 * Split an ordered (oldest → newest) session series into contiguous runs of the
 * same goal_type — each a "phase" (e.g. a bulk, then a cut). Raw lifetime change
 * that crosses these boundaries is not like-with-like; segmenting lets analysis
 * report each block on its own terms. Pure.
 */
export function segmentPhases(sessions: ExerciseSession[]): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  let run: ExerciseSession[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const e1rms = run.map((s) => s.e1rm).filter((v): v is number => v != null);
    segments.push({
      goal_type: run[0].goal_type,
      sessions: run.length,
      first_e1rm: e1rms[0] ?? null,
      best_e1rm: e1rms.length > 0 ? Math.round(Math.max(...e1rms)) : null,
      latest_e1rm: e1rms.length > 0 ? Math.round(e1rms[e1rms.length - 1]) : null,
      span: { from: run[0].performed_on, to: run[run.length - 1].performed_on },
    });
  };
  for (const s of sessions) {
    if (run.length > 0 && s.goal_type !== run[run.length - 1].goal_type) {
      flush();
      run = [];
    }
    run.push(s);
  }
  flush();
  return segments;
}

// --- rolling, confidence-aware trend ---------------------------------------

export interface ComparableProgress {
  /** goal of the most-recent block these sessions analyse */
  goal_type: string | null;
  /** estimable sessions in the current phase */
  sessions: number;
  first_e1rm: number | null;
  best_e1rm: number | null;
  /** recent representative: max over the trailing window, low-conf down-weighted */
  rolling_e1rm: number | null;
  latest_e1rm: number | null;
  change_pct: number | null;
  trend: Trend;
  stalled: boolean;
  confidence_mix: Record<E1rmConfidence, number>;
}

/**
 * Down-weighted best over a set of sessions: prefer the best estimate among
 * high/moderate-confidence sessions; fall back to low-confidence only when
 * that's all there is (so a single big low-confidence number can't define the
 * "best" a trend is judged against). Returns the raw e1RM value (rounded by
 * the caller). [10] §1.
 */
function weightedBest(points: { e1rm: number; confidence: E1rmConfidence }[]): number | null {
  if (points.length === 0) return null;
  const trusted = points.filter((p) => p.confidence !== "low");
  const pool = trusted.length > 0 ? trusted : points;
  return Math.max(...pool.map((p) => p.e1rm));
}

export interface AnalyzeProgressOpts {
  /** trailing sessions that define the "recent" representative (default 3) */
  window?: number;
  /** % band that keeps noise from reading as progress / decline (default 1.5) */
  tolerancePct?: number;
}

/**
 * Headline progress for the *current phase*: the trailing run of sessions
 * sharing the latest session's goal_type. Trend is driven by a rolling
 * representative (the trustworthy max over the trailing window) versus the
 * phase best — never a single latest read — so the alternating-day-slot
 * sawtooth and a one-off light session no longer read as a decline. Pure.
 */
export function analyzeComparableProgress(
  sessions: ExerciseSession[],
  opts: AnalyzeProgressOpts = {},
): ComparableProgress {
  const window = opts.window ?? 3;
  const tol = opts.tolerancePct ?? 1.5;

  // current phase = the trailing run sharing the latest session's goal_type
  const estimable = sessions.filter(
    (s): s is ExerciseSession & { e1rm: number; confidence: E1rmConfidence } =>
      s.e1rm != null && s.confidence != null,
  );
  const empty: ComparableProgress = {
    goal_type: estimable[estimable.length - 1]?.goal_type ?? null,
    sessions: 0,
    first_e1rm: null,
    best_e1rm: null,
    rolling_e1rm: null,
    latest_e1rm: null,
    change_pct: null,
    trend: "insufficient_data",
    stalled: false,
    confidence_mix: { high: 0, moderate: 0, low: 0 },
  };
  if (estimable.length === 0) return empty;

  const phaseGoal = estimable[estimable.length - 1].goal_type;
  const phase: typeof estimable = [];
  for (let i = estimable.length - 1; i >= 0; i--) {
    if (estimable[i].goal_type !== phaseGoal) break;
    phase.unshift(estimable[i]);
  }

  const confidence_mix: Record<E1rmConfidence, number> = { high: 0, moderate: 0, low: 0 };
  for (const s of phase) confidence_mix[s.confidence] += 1;

  const points = phase.map((s) => ({ e1rm: s.e1rm, confidence: s.confidence }));
  const firstRaw = points[0].e1rm;
  const latestRaw = points[points.length - 1].e1rm;
  const best = weightedBest(points)!;

  // rolling representative: trustworthy max over the trailing window
  const recent = points.slice(Math.max(0, points.length - window));
  const rolling = weightedBest(recent)!;
  // everything before the window — a new recent best over it is real progress
  const prior = points.slice(0, Math.max(0, points.length - window));
  const priorBest = weightedBest(prior);

  const firstR = Math.round(firstRaw);
  const latestR = Math.round(latestRaw);
  const rollingR = Math.round(rolling);
  const bestR = Math.round(best);
  const tolFactor = 1 + tol / 100;

  let trend: Trend;
  if (points.length < 2) {
    trend = "insufficient_data";
  } else if (rolling < best * (1 - tol / 100)) {
    // the recent peak sits meaningfully below the phase best → genuine decline
    trend = "declining";
  } else if (priorBest == null) {
    // R9: with ≤ window points the rolling max IS the phase best (the branch
    // above can never fire) and there is no prior baseline, so every short
    // phase used to read "improving" — even a strict decline. Until a
    // baseline exists, read the trend within the window: latest vs first.
    trend =
      latestRaw < firstRaw * (1 - tol / 100)
        ? "declining"
        : latestRaw > firstRaw * tolFactor
          ? "improving"
          : "plateau";
  } else if (rolling <= priorBest * tolFactor) {
    // recent peak fails to clear the prior peak → plateau
    trend = "plateau";
  } else {
    trend = "improving";
  }

  const change_pct =
    firstR > 0 ? Math.round(((rollingR - firstR) / firstR) * 1000) / 10 : null;

  return {
    goal_type: phaseGoal,
    sessions: phase.length,
    first_e1rm: firstR,
    best_e1rm: bestR,
    rolling_e1rm: rollingR,
    latest_e1rm: latestR,
    change_pct,
    trend,
    stalled: trend === "plateau" || trend === "declining",
    confidence_mix,
  };
}

// --- matched-RIR comparison across mesos (decision #2) ---------------------

export interface MatchedRirComparison {
  target_rir: number;
  current: { meso_name: string; goal_type: string; e1rm: number; performed_on: string };
  previous: { meso_name: string; goal_type: string; e1rm: number; performed_on: string };
  delta_pct: number | null;
  /** set when the two blocks differ in goal (cut↔bulk etc.) — caveat the read */
  cross_phase: boolean;
}

/**
 * Compare the current meso's top sets against the previous meso's *at the same
 * prescribed RIR* (decision #2: W·D doesn't survive unequal lengths/intent;
 * prescribed RIR is the alignment key). For each RIR both blocks share, take the
 * best e1RM logged at that RIR in each and report the matched delta, flagged
 * cross_phase when the goals differ. Pure; empty when there isn't a clean pair.
 */
export function matchedRirComparison(sessions: ExerciseSession[]): MatchedRirComparison[] {
  const estimable = sessions.filter(
    (s): s is ExerciseSession & { e1rm: number } => s.e1rm != null && s.target_rir != null,
  );
  if (estimable.length === 0) return [];

  // mesos in the order they were last trained (newest last)
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of estimable) {
    if (!seen.has(s.mesocycle_id)) {
      seen.add(s.mesocycle_id);
      order.push(s.mesocycle_id);
    }
  }
  if (order.length < 2) return [];
  const currentId = order[order.length - 1];
  const previousId = order[order.length - 2];

  const bestAtRir = (mesoId: string) => {
    const map = new Map<number, ExerciseSession & { e1rm: number }>();
    for (const s of estimable) {
      if (s.mesocycle_id !== mesoId || s.target_rir == null) continue;
      const cur = map.get(s.target_rir);
      if (!cur || s.e1rm > cur.e1rm) map.set(s.target_rir, s);
    }
    return map;
  };
  const cur = bestAtRir(currentId);
  const prev = bestAtRir(previousId);

  const out: MatchedRirComparison[] = [];
  for (const [rir, c] of [...cur.entries()].sort((a, b) => a[0] - b[0])) {
    const p = prev.get(rir);
    if (!p) continue;
    const cE = Math.round(c.e1rm);
    const pE = Math.round(p.e1rm);
    out.push({
      target_rir: rir,
      current: {
        meso_name: c.meso_name,
        goal_type: c.goal_type,
        e1rm: cE,
        performed_on: c.performed_on,
      },
      previous: {
        meso_name: p.meso_name,
        goal_type: p.goal_type,
        e1rm: pE,
        performed_on: p.performed_on,
      },
      delta_pct: pE > 0 ? Math.round(((cE - pE) / pE) * 1000) / 10 : null,
      cross_phase: c.goal_type !== p.goal_type,
    });
  }
  return out;
}

// --- per-day-slot series + fatigue position (Stage 5) ----------------------

export interface DaySlotProgress {
  /** the meso day-slot this series occupies (`workouts.day_number`) */
  day_number: number;
  day_label: string | null;
  sessions: number;
  /** typical performed ordinal of the movement on this day (1 = trained first) */
  avg_position: number | null;
  progress: ComparableProgress;
}

/**
 * Split an exercise's sessions by the day-slot they occupy and analyse each
 * slot on its own terms (Stage 5). A movement that sits in two day-slots — the
 * Dumbbell Curl on Day 1 (25 lb) and Day 3 (20 lb) — is an alternating sawtooth
 * when pooled, but keyed on day_number each slot is a clean, like-with-like
 * series (the Day-1 slot reads flat, not declining). Only day-slots with at
 * least `minSessions` estimable sessions are returned, ordered by day_number.
 * Pure; the per-slot trend reuses the same rolling/phase/confidence logic.
 */
export function analyzeByDaySlot(
  sessions: ExerciseSession[],
  opts: AnalyzeProgressOpts & { minSessions?: number } = {},
): DaySlotProgress[] {
  const minSessions = opts.minSessions ?? 2;
  const byDay = new Map<number, ExerciseSession[]>();
  for (const s of sessions) {
    if (s.day_number == null) continue;
    const cur = byDay.get(s.day_number) ?? [];
    cur.push(s);
    byDay.set(s.day_number, cur);
  }
  const out: DaySlotProgress[] = [];
  for (const [day_number, group] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const estimable = group.filter((s) => s.e1rm != null);
    if (estimable.length < minSessions) continue;
    const positions = group
      .map((s) => s.session_position)
      .filter((p): p is number => p != null);
    out.push({
      day_number,
      day_label: group.find((s) => s.day_label != null)?.day_label ?? null,
      sessions: estimable.length,
      avg_position:
        positions.length > 0
          ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10
          : null,
      progress: analyzeComparableProgress(group, opts),
    });
  }
  return out;
}

export interface FatiguePositionSummary {
  /** sessions for which a performed ordinal is known */
  sessions: number;
  /** mean ordinal within the session (1 = trained first) */
  avg_position: number | null;
  min_position: number | null;
  max_position: number | null;
  /** mean number of exercises in those sessions — the position's denominator */
  avg_session_size: number | null;
  /**
   * The movement sits at a *variable* depth across sessions (ordinal spread ≥ 2).
   * A set logged late in a session is pre-fatigued, so a lower e1RM there is not
   * strictly comparable to one logged fresh — when this is set, treat a dip as a
   * position artifact to rule out, not an automatic regression.
   */
  varies: boolean;
}

/**
 * Summarise where in the session this movement is trained (Stage 5). Drives the
 * fatigue-position caveat: an accessory done 5th some weeks and 2nd others
 * shouldn't read as a regression on the later-position weeks. Pure; empty-safe.
 */
export function fatiguePosition(sessions: ExerciseSession[]): FatiguePositionSummary {
  const positioned = sessions.filter(
    (s): s is ExerciseSession & { session_position: number } => s.session_position != null,
  );
  if (positioned.length === 0) {
    return {
      sessions: 0,
      avg_position: null,
      min_position: null,
      max_position: null,
      avg_session_size: null,
      varies: false,
    };
  }
  const positions = positioned.map((s) => s.session_position);
  const sizes = positioned
    .map((s) => s.session_size)
    .filter((n): n is number => n != null);
  const min = Math.min(...positions);
  const max = Math.max(...positions);
  const avg = positions.reduce((a, b) => a + b, 0) / positions.length;
  return {
    sessions: positioned.length,
    avg_position: Math.round(avg * 10) / 10,
    min_position: min,
    max_position: max,
    avg_session_size:
      sizes.length > 0
        ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10
        : null,
    varies: max - min >= 2,
  };
}

// --- helpers reused by the tool --------------------------------------------

/** Distinct goal_types present in the (estimable) series, oldest → newest. */
export function phaseGoals(sessions: ExerciseSession[]): string[] {
  const out: string[] = [];
  for (const s of sessions) if (!out.includes(s.goal_type)) out.push(s.goal_type);
  return out;
}

/** Confidence rank for sorting/threshold logic (high=3 … low=1). */
export function confidenceRank(c: E1rmConfidence): number {
  return CONFIDENCE_RANK[c];
}
