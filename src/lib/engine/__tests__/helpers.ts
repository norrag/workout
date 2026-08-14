import type { EngineInputs } from "../types";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../params";
import liveParams from "../live-params.json";

/**
 * The v11 params: DEFAULT (v10) plus the four gated behaviors from the
 * standalone-prescription investigation (2026-06-23) turned on — Brzycki ≤10 /
 * Epley >10, low-confidence session down-weighting, anchor-seed, rep-consistent
 * hold, and require-both dampening. Mirrors `20260624000001_engine_params_v11`.
 */
export const V11_PARAMS: EngineParams = {
  ...DEFAULT_ENGINE_PARAMS,
  e1rm: {
    ...DEFAULT_ENGINE_PARAMS.e1rm,
    brzycki_max_eff_reps: 10,
    session_value_confidence_weights: { high: 1, moderate: 0.6, low: 0.3 },
  },
  seed_from_anchor: true,
  hold_rep_consistent: true,
  session_dampen_require_both: true,
};

/** v12 = v11 plus the two rep-window refinements (climb on performed reps; bound
 *  to the target window). Mirrors `20260624…_engine_params_v12`. */
export const V12_PARAMS: EngineParams = {
  ...V11_PARAMS,
  climb_on_performed_reps: true,
  bound_to_target_window: true,
};

/** v14 = v12 plus the prior-peak seed retirement (T-I5, owner ruling 2026-06-25):
 *  no fabricated peak seed — precedence is confident anchor → user initial_* →
 *  unseeded. Mirrors `20260625000001_engine_params_v14`. (v13 is a throwaway test
 *  row in the hosted DB only — no migration; skipped.) */
export const V14_PARAMS: EngineParams = {
  ...V12_PARAMS,
  retire_prior_peak_seed: true,
};

/** v15 = v14 plus anchor-based deload selection (owner ruling 2026-06-25): the
 *  deload picks its load from the strength anchor to land window-centered reps at
 *  a higher recovery RIR (≈6), the same model as a working week — instead of the
 *  legacy load_pct-of-peak heuristic. Mirrors `…_engine_params_v15`. */
export const V15_PARAMS: EngineParams = {
  ...V14_PARAMS,
  deload_anchor_rir: true,
  deload: { ...V14_PARAMS.deload, target_rir: 6 },
};

/** v16 = v15 plus the bodyweight load-type model (T-I2): bodyweight movements price
 *  on effective load and progress on reps / the rep-window in effective space.
 *  Mirrors `20260626000003_engine_params_v16_bodyweight_model`. */
export const V16_PARAMS: EngineParams = {
  ...V15_PARAMS,
  bodyweight_model: true,
};

/** v17 = v16 plus the joint-pain hard gate on set counts (R8, doc 10 §3 step 0):
 *  pain ≥ pain_gate vetoes set additions; pain ≥ pain_cut_gate cuts a set and
 *  suggests substitution. Mirrors `20260701000001_engine_params_v17_pain_set_gate`. */
export const V17_PARAMS: EngineParams = {
  ...V16_PARAMS,
  pain_cut_gate: 3,
};

/** v18 = v17 with the session-dampen thresholds rescaled onto the unified 0–10
 *  slider scale (I14: fatigue ≥ 3-of-4 → ≥ 8-of-10; performance ≤ 1-of-4 →
 *  ≤ 3-of-10; stored data rescaled round(x × 2.5) in the same migration).
 *  Mirrors `20260702000004_i14_session_feedback_scale`. */
export const V18_PARAMS: EngineParams = {
  ...V17_PARAMS,
  session_fatigue_dampen_threshold: 8,
  session_performance_dampen_threshold: 3,
};

/** v19 = v18 plus the R24 hold-week pair: the Option-A rep climb advances only
 *  on a real RIR step (top-out reset stays unconditional), and a pure hold
 *  absorbs sub-step anchor-decay drift instead of repricing down. Mirrors
 *  `20260705000001_engine_params_v19_hold_week`. */
export const V19_PARAMS: EngineParams = {
  ...V18_PARAMS,
  climb_requires_rir_step: true,
  hold_week_anchor_deadband: true,
};

/** v20 = v19 plus the prescribed-progression block (doc 16 Phase 1): earned-step
 *  overload (`A* = A + δ` off the measured anchor, full-compliance earn gate in
 *  e1RM space) + macro-rate pacing, always-on status-coded `progression` trace.
 *  Mirrors `20260709000001_engine_params_v20_prescribed_progression`. */
export const V20_PARAMS: EngineParams = {
  ...V19_PARAMS,
  progression: {
    mode: "earned_step",
    step: "min",
    min_confidence: "moderate",
    compliance_band: 0.015,
    cadence: "microcycle",
    pacing: "macro_rate",
    rate_source: "band",
    band_position: 0.5,
    goal_rate_factor: {
      strength: 1.0,
      hypertrophy: 0.75,
      gain: 0.75,
      cut: 0.0,
      maintain: 0.0,
    },
    miss_rearm_sessions: 2,
    max_gap_days: 10,
    peak_week: "skip",
    max_pct_per_step: 0.05,
  },
};

/** v21 = v20 plus the doc 17 §2 macro-target correction (N21): strength-path
 *  personalization — `strength_sex_factor` 1/1 with its own age-taper floor —
 *  and hypertrophy continuity through a BMI-band body-fat proxy. Mirrors
 *  `20260710000002_engine_params_v21_macro_target`. */
export const V21_PARAMS: EngineParams = {
  ...V20_PARAMS,
  macro_target: {
    ...V20_PARAMS.macro_target,
    bf_proxy_pct: {
      male: { lean: 10, average: 16, high_bf: 25 },
      female: { lean: 18, average: 26, high_bf: 35 },
    },
    strength_sex_factor: { male: 1, female: 1 },
    age_taper_floor_strength: 0.7,
  },
};

/** v22 = v21 with the pacer's rate source flipped from the calendar bucket to
 *  the personalized `planMacrocycle` band (doc 17 Phase R3, N37).
 *
 *  **Rolled back.** v23 is built on v21, not on this — so v22 is a branch of
 *  the ladder rather than a step in it, and the flip returns at v24 reading the
 *  N43-corrected band. Kept because decisions recorded while it was active
 *  replay against it. **Hosted-only: no migration exists.** */
export const V22_PARAMS: EngineParams = {
  ...V21_PARAMS,
  progression: { ...V21_PARAMS.progression!, rate_source: "plan" },
};

/** v23 = **v21** plus the two-component strength-rate model (doc 17 §2.7, N43):
 *  an additive neural + FFM-coupled rate that supersedes the calendar bucket
 *  wherever an FFMI can be read. Note the base: v22's flip was rolled back, so
 *  `rate_source` is back to `"band"` here. Mirrors
 *  `20260712000001_engine_params_v23_strength_model`. */
export const V23_PARAMS: EngineParams = {
  ...V21_PARAMS,
  macro_target: {
    ...V21_PARAMS.macro_target,
    strength_model: {
      enabled: true,
      neural_n0: { low: 3, high: 5 },
      neural_floor: { low: 0.1, high: 0.4 },
      neural_tau_years: 0.5,
      ffm_coupling_k: 1,
      undermuscled_unbank: 0.5,
      rate_ceiling_pct_month: 8,
    },
  },
};

/** v24 = v23 with `rate_source` flipped to `"plan"` — the v22 flip re-applied
 *  over the N43-corrected band it should have been reading in the first place
 *  (doc 17 Phase R / N37). **Hosted-only: no migration exists.** */
export const V24_PARAMS: EngineParams = {
  ...V23_PARAMS,
  progression: { ...V23_PARAMS.progression!, rate_source: "plan" },
};

/** v25 = v24 plus the self-gating envelope loop (doc 17 §7, N36): demand-side
 *  outcomes move `band_position` within bounds, and a data-poor user
 *  short-circuits to 0.5 until two qualifying completed mesos exist.
 *  **Hosted-only: no migration exists.** */
export const V25_PARAMS: EngineParams = {
  ...V24_PARAMS,
  progression: {
    ...V24_PARAMS.progression!,
    envelope: {
      enabled: true,
      lookback_mesos: 3,
      max_age_days: 180,
      min_decisions: 8,
      min_history_mesos: 2,
      step: 0.1,
      dwell_mesos: 1,
      raise: {
        earn_rate: 0.7,
        max_miss_ratio: 0.2,
        pacer_trips: 2,
        over_share: 0.25,
      },
      lower: { miss_ratio: 0.5, throttle_trips: 2, workload_firings: 3 },
    },
  },
};

/** v26 = v25 plus the doc 21 §6.1 measuring band: past `max_measuring_rir` a
 *  set is priced but not measured (no stamp, no anchor contribution, no
 *  strength surface). Mirrors `20260802000003_engine_params_v26_measuring_band`.
 *  8 was the pre-doc-21 `target_rir` ceiling, so nothing that could exist
 *  before the exercise-level lever became non-measuring — which is why the
 *  activation restamp moved nothing.
 *
 *  **Corrected 2026-08-14 (N87).** This was built on `V20_PARAMS` with a note
 *  claiming the v21–v25 deltas were orthogonal. They are not: the row this
 *  fixture claims to mirror carries the macro-target correction, the strength
 *  model, `rate_source: "plan"` and the envelope block. The old shape hashed to
 *  something no stored row has ever had. */
export const V26_PARAMS: EngineParams = {
  ...V25_PARAMS,
  e1rm: { ...V25_PARAMS.e1rm, max_measuring_rir: 8 },
};

/** v27 = v26 with the measuring cutoff tightened to 5 and the deload target
 *  RIR raised 6 → 8, so that both historical 6-RIR deload work and future
 *  8-RIR deload work sit **above** the cutoff and are excluded from strength
 *  anchors. The two move together on purpose — that coupling is the whole
 *  point of the version, and it is what `live-params.test.ts` pins.
 *  **Hosted-only: no migration exists.** */
export const V27_PARAMS: EngineParams = {
  ...V26_PARAMS,
  deload: { ...V26_PARAMS.deload, target_rir: 8 },
  e1rm: { ...V26_PARAMS.e1rm, max_measuring_rir: 5 },
};

/**
 * **The version this repository believes production is running**, and the
 * fixture that materializes it.
 *
 * Activations happen out-of-band — `propose_engine_params` → `replay_decisions`
 * → `activate_engine_params`, run from an MCP client, with no PR and no commit
 * anywhere in the loop. So the repo cannot learn about an activation by itself;
 * it has to be told, here. Two things then hold it honest:
 *
 *   - `live-params.test.ts` asserts that `LIVE_PARAMS` really is the top of the
 *     ladder, that the live golden uses it, and — the load-bearing one — that
 *     its canonical hash equals `LIVE_PARAMS_HASH`. That last check makes a
 *     hand-written fixture provably byte-identical to the stored row rather
 *     than approximately right, which is how the old V26 drifted unnoticed.
 *   - `npm run db:check` compares this constant to the hosted active version
 *     and **warns** (never fails) when they differ. A stale ladder weakens the
 *     tests; it does not break production, so it must not block a PR.
 *
 * **After activating a version: add its fixture, bump these two constants, and
 * run `npm run db:check` to confirm the warning clears.** The hash is printed
 * by `get_engine_params` as `params_hash`.
 */
export const LIVE_PARAMS_VERSION = liveParams.version;
export const LIVE_PARAMS_HASH = liveParams.hash;
export const LIVE_PARAMS: EngineParams = V27_PARAMS;

export function baseInputs(
  overrides: Partial<EngineInputs> = {},
): EngineInputs {
  return {
    exercise: { equipmentType: "barbell", loadType: "external" },
    user: { experienceLevel: "intermediate" },
    goalType: "gain",
    week: { targetRir: 2, isDeload: false },
    bodyweight: null,
    previous: { weight: 100, reps: 8, sets: 3, targetRir: 3 },
    actualSets: [
      { setNumber: 1, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
      { setNumber: 2, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
      { setNumber: 3, weight: 100, reps: 8, rirReported: 3, isWarmup: false },
    ],
    exerciseFeedback: { jointPain: 0, pump: 5, workload: 5 },
    workoutFeedback: { overallFatigue: 1, effortRating: 2, performanceRating: 3 },
    muscleGroupWeeklySets: 10,
    weekPeak: null,
    initial: null,
    strengthAnchor: null,
    ...overrides,
  };
}
