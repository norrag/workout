/**
 * Envelope loop — the demand-side band-position fold (doc 17 §7, N36) — pure.
 *
 * The macro layer's rate band is the ENVELOPE; `band_position` is where within
 * it the pacer targets (0 = floor, 1 = top). This module owns the update rule
 * that slides the position from demand-side outcomes: a pure, clockless fold
 * over the trailing completed mesos' recorded `engine_decisions`, evaluated by
 * the caller wherever the other derived inputs are assembled. Performance
 * never modifies the envelope itself (doc 17 principle 4) — no goal, band, or
 * rate table moves; only the position within [0, 1].
 *
 * Shape fixed by doc 16 §4 + the architecture record §3.3: updates land at
 * MESO BOUNDARIES only (the fold consumes completed mesos, so its value is
 * constant for the whole meso being generated), each boundary step is bounded
 * (|Δ| ≤ 0.25 — `MAX_BOUNDARY_STEP`, binding over any tuned `step`), a minimum
 * dwell holds a new position before the next move, and the result clamps to
 * [0, 1]. Inputs are demand-side outcomes ONLY (earn rate, earned-then-missed
 * ratio, throttle trips, workload-gate firings, `over`/beat share) — never the
 * measured strength rate: measurement grades the contract (doc 17 §4), it
 * does not steer the pacer.
 *
 * Residence (architecture record §3.3): the position is a per-USER derived
 * input — `EngineInputs.bandPosition`, doc-14 §3 treatment (fingerprint-
 * denylisted, recorded in each decision's `inputs`, replayed frozen) — not a
 * stored column. `progression.band_position` (params) stays the default /
 * starting value, and the fixed value while the loop is off. Bounded-lookback
 * forgetting is the return-from-absence decay: as completed mesos age out of
 * the window, the position regresses to the default.
 *
 * The loop is SELF-GATING per user (doc 17 §7, owner amendment 2026-07-12):
 * until `min_history_mesos` qualifying completed mesos (≥ `min_decisions`
 * status-coded decisions each) sit inside the lookback window, the fold
 * short-circuits to the tunable `band_position` default. Activation is
 * therefore a single global act — every user's loop kicks in automatically
 * when (and only while) their own history supports it; nothing per-user to
 * remember to enable. The step/threshold values are PROVISIONAL starting
 * points refined from field data via the monitor/refit runbook loop; the
 * block ships absent ⇒ byte-identical.
 */
import type { EngineParams } from "../params";

/** doc 17 §7 — the binding per-boundary bound. `envelope.step` is the tuned
 *  size; this constant caps it whatever the params say. */
export const MAX_BOUNDARY_STEP = 0.25;

/**
 * One completed meso's demand-side outcome aggregates, oldest→newest — the
 * fold's entire view of the world. Assembled by the caller from recorded
 * decisions (queries/envelope.ts) at the grain `aggregateProgressionEvents`
 * already folds, summed across the meso's exercises.
 */
export interface EnvelopeMesoOutcome {
  /** decisions carrying a status-coded progression step (working weeks) */
  decisions: number;
  /** decisions whose earn gate passed: `stepped` + `vanished` + `paced` */
  earned: number;
  /** stepped asks answered by the next decision's source-session compliance */
  earnedThenMet: number;
  earnedThenMissed: number;
  /** `paced` by the miss throttle (§3.5) */
  throttleTrips: number;
  /** `paced` by the rate pacer — the athlete earning faster than the metered
   *  rate, the loop's up-pressure signal */
  pacerTrips: number;
  /** `not_earned` by the workload predicate (hot workload / feedback set cut) */
  workloadFirings: number;
  /** share of comparable working sets marked `over` their prescribed set
   *  (§5.3 shared comparison); null when nothing was comparable */
  overShare: number | null;
}

export type EnvelopeParams = NonNullable<
  NonNullable<EngineParams["progression"]>["envelope"]
>;

/** Whether the envelope loop is live: progression mode active, block present,
 *  and not switched off. Absent/off ⇒ callers assemble nothing and the pacer
 *  reads the fixed params `band_position` — byte-identical to today. */
export function envelopeActive(params: EngineParams): boolean {
  const p = params.progression;
  return (
    p?.mode === "earned_step" && p.envelope != null && p.envelope.enabled
  );
}

/**
 * The fold: trailing completed-meso outcomes (chronological) → the band
 * position the next meso's decisions consume. Deterministic and clockless —
 * same outcomes, same position (replay-exact); the caller bounds the window
 * by count AND age (`lookback_mesos` / `max_age_days`), and the slice here is
 * the defensive belt. Null while the loop is off.
 */
export function deriveBandPosition(
  outcomes: EnvelopeMesoOutcome[],
  params: EngineParams,
): number | null {
  if (!envelopeActive(params)) return null;
  const p = params.progression!;
  const env = p.envelope!;
  const window = outcomes.slice(-env.lookback_mesos);

  // per-user data-sufficiency short-circuit: too little qualifying history
  // in the window ⇒ the tunable default, and the loop takes over
  // automatically once the user's own evidence accrues (or degrades back
  // when it ages out).
  const qualifying = window.filter((o) => o.decisions >= env.min_decisions);
  if (qualifying.length < env.min_history_mesos) {
    return round3(p.band_position);
  }

  let position = p.band_position;
  let dwellRemaining = 0;
  for (const meso of window) {
    if (dwellRemaining > 0) {
      dwellRemaining -= 1;
      continue;
    }
    const step = boundaryStep(meso, env);
    if (step === 0) continue;
    position = clamp01(position + step);
    // dwell counts boundaries: 1 (default) = free to move at the very next
    // boundary — the position held exactly one meso, the doc 17 §7 minimum.
    dwellRemaining = env.dwell_mesos - 1;
  }
  return round3(position);
}

/**
 * One boundary's step, from that meso's outcomes alone. Down-pressure wins
 * over up-pressure (conservative: never raise the ask off ambiguous
 * evidence); a meso with too few decisions is no evidence at all.
 */
export function boundaryStep(
  o: EnvelopeMesoOutcome,
  env: EnvelopeParams,
): number {
  if (o.decisions < env.min_decisions) return 0;
  const size = Math.min(env.step, MAX_BOUNDARY_STEP);
  const answered = o.earnedThenMet + o.earnedThenMissed;
  const missRatio = answered > 0 ? o.earnedThenMissed / answered : null;

  // down: the athlete is not answering the asks, or the throttle/workload
  // gates keep firing — pace lower in the band.
  if (
    (missRatio != null && missRatio >= env.lower.miss_ratio) ||
    o.throttleTrips >= env.lower.throttle_trips ||
    o.workloadFirings >= env.lower.workload_firings
  ) {
    return -size;
  }

  // up: consistently earning AND answering, with real up-pressure — the rate
  // pacer held earned steps back, or the athlete beat prescriptions outright.
  // Without up-pressure a raise is invisible anyway (the pacer never bound).
  const earnRate = o.earned / o.decisions;
  if (
    earnRate >= env.raise.earn_rate &&
    (missRatio == null || missRatio <= env.raise.max_miss_ratio) &&
    (o.pacerTrips >= env.raise.pacer_trips ||
      (o.overShare != null && o.overShare >= env.raise.over_share))
  ) {
    return size;
  }
  return 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
