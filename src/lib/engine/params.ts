import { z } from "zod";

export const equipmentTypes = [
  "barbell",
  "smith",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "bands",
  "kettlebell",
  "other",
] as const;

export type EquipmentType = (typeof equipmentTypes)[number];

/**
 * Normalize a stored `exercises.equipment_type` to the canonical step bucket the
 * engine prices loads in. The exercise library stores equipment verbatim from the
 * user's import (a wider vocabulary — e.g. "smith machine", "freemotion",
 * "bodyweight loadable"), but the engine only knows the buckets in
 * `equipmentTypes`. Each extra label maps to the bucket with the same loadable
 * step, so progression math is unchanged; unknown values fall back to "other"
 * (the engine's FALLBACK_STEP). Pure.
 */
export function toEngineEquipment(raw: string): EquipmentType {
  if ((equipmentTypes as readonly string[]).includes(raw)) {
    return raw as EquipmentType;
  }
  switch (raw) {
    case "smith machine":
      return "smith";
    case "bodyweight only":
    case "bodyweight loadable":
      return "bodyweight";
    case "machine assistance":
      return "machine";
    case "freemotion":
      return "cable";
    default:
      return "other";
  }
}

export const experienceLevels = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

// per-set engine goals that drive prescribe(). Widened (doc 13 §9.1) so the
// engine can tell strength from hypertrophy and pick a rep window per goal;
// `gain` is retained as a back-compat alias of `hypertrophy` (older stored
// decisions / engine_params rows still parse and behave identically).
export const goalTypes = [
  "cut",
  "gain",
  "strength",
  "hypertrophy",
  "maintain",
] as const;

// long-term macrocycle goal vocabulary (figs 2.2/2.3, doc 09/10). Distinct
// from the per-set `goalTypes` that drive `prescribe()`: a macrocycle carries
// one of these; the engine maps them to per-meso phases + per-set bias.
export const macroGoalTypes = [
  "hypertrophy",
  "strength",
  "cut",
  "maintain",
] as const;

// mesocycle phases the macrocycle engine spreads across positions (10 §5)
export const phaseNames = [
  "accumulation",
  "intensification",
  "peak",
] as const;

// loadable step / progression jump per equipment, in pounds — the app records
// and prescribes exclusively in imperial units.
const perEquipmentStep = z.record(
  z.enum(equipmentTypes),
  z.number().min(0),
);

// a [low, high] range; low/high tunables seeded from 10-metrics-spec.md
const rangeTuple = z.tuple([z.number(), z.number()]);
const experienceRanges = z.object({
  beginner: rangeTuple,
  intermediate: rangeTuple,
  advanced: rangeTuple,
});

/**
 * Schema for `engine_params.params` (version 2 — pivot feedback shape).
 * A bad row can never be activated: admin tooling and the engine itself
 * both parse with this schema.
 */
export const engineParamsSchema = z.object({
  // DEPRECATED (T-I4): the legacy increment/regression progression was retired. These
  // fields are RETAINED in the schema so every historical engine_params row still
  // parses to a complete materialization (preserving `is_replayable` / params_hash —
  // removing them would flip all pre-T-I4 rows non-replayable). No engine code reads
  // `increment`, `experience_increment_scale`, `progression_style`, or `regression_pct`
  // any more; progression is anchor-only (rep-window + bodyweight; hold without an
  // anchor).
  increment: perEquipmentStep,
  experience_increment_scale: z.record(
    z.enum(experienceLevels),
    z.number().positive(),
  ),
  progression_style: z.record(
    z.enum(goalTypes),
    z.enum(["load_first", "reps_first", "hold"]),
  ),
  // missed reps by <= this margin => hold; more => regress
  small_miss_reps: z.number().int().min(0),
  // DEPRECATED (T-I4): the big-miss back-off is retired (anchor-only). Retained for
  // historical-row parsing; no code reads it.
  regression_pct: z.number().min(0.5).max(1),
  // joint_pain >= pain_gate blocks load increases
  pain_gate: z.number().int().min(1).max(3),
  // workload slider (0–10, 5 = "just right") anchors set-count changes
  workload_high: z.number().int().min(6).max(10),
  workload_low: z.number().int().min(0).max(4),
  // a set is added only when workload <= workload_low and pump corroborates
  set_add_pump_min: z.number().int().min(0).max(10),
  // pump <= pump_low with on-target workload flags exercise selection
  pump_low: z.number().int().min(0).max(10),
  min_sets: z.number().int().min(1),
  max_sets_per_exercise: z.number().int().min(1),
  mg_set_ceiling: z.number().int().min(1),
  // session-level dampening. Bounds widened 4 → 10 with I14 (the session
  // sliders were unified onto the per-exercise 0–10 scale; v18 carries the
  // rescaled thresholds 8/3). Old rows (3/1 on the 0–4 scale) stay valid —
  // they are read only for replaying their own 0–4-scale stored inputs.
  session_fatigue_dampen_threshold: z.number().int().min(0).max(10),
  session_performance_dampen_threshold: z.number().int().min(0).max(10),
  deload: z.object({
    load_pct: z.number().min(0.3).max(0.9),
    set_pct: z.number().min(0.3).max(1),
    // a deload sits well short of failure; the bound allows a genuine recovery
    // RIR (≈6) for anchor-based deload selection, not just the legacy ≤5.
    target_rir: z.number().int().min(3).max(8),
  }),
  // DEPRECATED (T-I4 / T-I5): the prior-peak × back-off meso seed is retired.
  // Retained for historical-row parsing; no code reads it.
  meso_seed_backoff_pct: z.number().min(0.7).max(1),
  // weights are rounded to this loadable step per equipment, in pounds
  rounding: perEquipmentStep,

  // ----- doc 13: rep-window prescription (param-gated, decision 8) -----------
  // Added with `.default()` (legacy = the v8-equivalent increment/reps path) so
  // pre-v9 rows parse to today's behavior; v9 + DEFAULT_ENGINE_PARAMS select the
  // new modes. Switching back is an engine_params activation, not a redeploy.

  // how the prescribed weight is chosen: `increment` = legacy +step on actuals;
  // `rep_window` = pick the weight that lands reps in the goal's window at the
  // target RIR, from the strength anchor (doc 13 §2, §9.2).
  weight_selection: z.enum(["rep_window", "increment"]).default("increment"),
  // how performance is graded: `reps` = legacy rep-delta; `rir` = infer achieved
  // RIR and compare to target (overshooting intensity is a hold, never a regress).
  grading: z.enum(["rir", "reps"]).default("reps"),

  // ----- standalone-prescription investigation (2026-06-23) — all gated --------
  // Each is `.optional()` so every pre-v11 row parses byte-identically (no change
  // to its canonical materialization, so `is_replayable`/`params_hash` and the
  // freshness fingerprint are untouched) and the engine falls back to the prior
  // behavior. v11 turns them on; activation is manual, after a replay diff.

  // §S1: seed week 1 of a meso from the recency strength anchor exactly the way a
  // mid-meso swap-in already does (rep-window weight for the window's low rep at
  // the start RIR), instead of carrying the prior-peak rep count verbatim. ABSENT
  // / false ⇒ legacy peak-backoff seed. Only takes effect with `weight_selection
  // = rep_window` and a confident anchor; falls back to plan/peak values otherwise.
  seed_from_anchor: z.boolean().optional(),
  // §S5: when a load increase is blocked (pain gate or session dampener) in
  // rep-window mode, keep the held prescription internally consistent — hold the
  // load and let reps follow the Option-A schedule (the held effective workload),
  // instead of clamping the anchor predictor to the window ceiling and emitting a
  // `weight × reps @ RIR` triple whose implied RIR contradicts the target. ABSENT
  // / false ⇒ legacy clamp-to-window behavior.
  hold_rep_consistent: z.boolean().optional(),
  // §S5: de-blunt the session dampener. ABSENT / false ⇒ legacy OR (a single
  // fatigue ≥ threshold OR performance ≤ threshold dampens). true ⇒ require BOTH a
  // high-fatigue AND a poor-performance signal before dampening, so a fatigued-but-
  // strong session still progresses.
  session_dampen_require_both: z.boolean().optional(),

  // ----- standalone-prescription investigation, round 2 (v12) — all gated -------
  // Same `.optional()` discipline (absent ⇒ prior behavior, no fingerprint churn).

  // §v12 #1: drive the rep-window rep-climb off what was actually PERFORMED — the
  // MINIMUM working-set reps (classic double progression advances only when every
  // set reaches the top of the window) — not the previous *prescription*. ABSENT /
  // false ⇒ legacy climb off `previous.reps` (which bumps the load even when the
  // top set was prescribed but missed). Falls back to the prescription when there
  // are no logged working sets.
  climb_on_performed_reps: z.boolean().optional(),
  // §v12 #2: when rounding the anchor-chosen load leaves predicted reps above the
  // window's TARGET high (not just the hard max), prefer the next loadable step up
  // — but only when it keeps reps at/above the target low; otherwise keep the
  // lighter load (the genuine coarse-increment buffer). Symmetric below target low.
  // ABSENT / false ⇒ legacy nudge only at the hard [min,max] bounds, so a load that
  // predicts 13–14 is left there even when one step lands squarely in 8–12.
  bound_to_target_window: z.boolean().optional(),

  // ----- R24 — hold-week reprice-down (owner concern 2026-07-02) — both gated ---
  // Same `.optional()` discipline (absent ⇒ prior behavior, no fingerprint churn).

  // §R24a: advance the Option-A rep climb only on a week where the target RIR
  // actually stepped down. Doc 13 §9.2's premise is "+1 rep BECAUSE the ramp
  // dropped −1 RIR" (constant effective reps ⇒ held load); on a ramp-hold week
  // (e.g. the 3→2→2→1 default's 2→2) the unconditional +1 broke that invariant
  // and repriced the load DOWN mid-meso — a lateral "−5 lb, +1 rep" move that
  // reads as regression. Gated: reps hold when the RIR holds (with
  // `climb_on_performed_reps`, demonstrated extra reps still advance the climb).
  // The top-of-window reset stays unconditional — topping the window earns the
  // load step regardless of the ramp (doc 10 double progression). ABSENT / false
  // ⇒ legacy unconditional +1.
  climb_requires_rir_step: z.boolean().optional(),
  // §R24b: on a pure hold week (no RIR step, no rep advance, no top-out) the
  // reprice should return the previously handled load — but the recency anchor
  // decays between sessions, so an identical hold can price a hair lower in week
  // N+1 than week N (most visible on cut/maintain blocks meant to preserve
  // strength). When set, an anchor-drift shortfall of LESS than one loadable
  // step is absorbed (hold the handled load); a fall of a full step or more is
  // real signal (demonstrated regression moves the anchor further than decay
  // can) and passes through. ABSENT / false ⇒ legacy raw reprice.
  hold_week_anchor_deadband: z.boolean().optional(),

  // ----- WS-I / T-I5 — retire the prior-peak meso seed (owner ruling 2026-06-25) ---
  // Same `.optional()` discipline (absent ⇒ prior behavior, no fingerprint churn).
  //
  // Retire the legacy `priorPeak × meso_seed_backoff_pct` meso seed: it backs the
  // weight off but carries `priorPeak.reps` VERBATIM (escaping the rep window) and
  // reads a per-column-max set the user never performed — a fabricated seed (full
  // root-cause in the 2026-06-23 standalone-prescription investigation). The owner
  // ruled it fundamentally broken and never to be used again: a prescription is not
  // emitted at any cost — use real data when present, else defer to the user.
  //
  // The seed precedence is: confident recency anchor (seed_from_anchor) → the
  // user's own plan `initial_*` (a manual seed) → UNSEEDED (null weight, prompt
  // the user). Nothing is ever fabricated from a peak set. NOTE (R24): the
  // legacy branch itself was DELETED from seedMeso when this shipped — the flag
  // is now inert either way and retained only so historical rows parse with an
  // unchanged materialization (`is_replayable`/`params_hash`); ABSENT/false no
  // longer resurrects the prior-peak seed.
  // The param `meso_seed_backoff_pct` is left in the schema (historical rows still
  // carry it, so removing it would flip them non-replayable); its actual removal +
  // row migration is T-I4, where the whole legacy block is retired together.
  retire_prior_peak_seed: z.boolean().optional(),

  // ----- deload: anchor-based load selection (owner ruling 2026-06-25) ----------
  // Same `.optional()` discipline (absent ⇒ legacy load_pct deload, no fingerprint
  // churn). Replaces the "load_pct of peak + carry the peak reps + state a fixed
  // RIR" deload — which produced an internally inconsistent triple (the carried
  // reps at ≈55% of peak leave far more than the stated RIR in reserve) — with the
  // SAME rep-window weight selection a working week uses, just at the higher deload
  // target RIR (`deload.target_rir`) and centered in the goal's rep window. The
  // load is chosen from the strength anchor so prescribed reps = predicted reps at
  // the deload RIR by construction; the live logging predictor then agrees with the
  // prescription instead of re-deriving an exploded rep count from the light load.
  // Only takes effect with `weight_selection = rep_window` and a confident anchor;
  // falls back to the legacy load_pct deload otherwise. ABSENT / false ⇒ legacy.
  deload_anchor_rir: z.boolean().optional(),

  // ----- WS-I / T-I2 — bodyweight load-type model (owner ruling 2026-06-25) ------
  // Same `.optional()` discipline (absent ⇒ prior behaviour, no fingerprint churn).
  //
  // true ⇒ the engine reads each exercise's load type (`exercise.loadType`) and the
  // lifter's bodyweight (`user.bodyweight`) and prices bodyweight movements on their
  // EFFECTIVE load — bodyweight (only), bodyweight + added (loadable), bodyweight −
  // assist (assisted) — instead of collapsing them to `weight = 0`. A weight-0
  // bodyweight set then anchors and progresses (reps at a fixed bodyweight load for
  // bodyweight_only; the rep-window in effective space for loadable/assisted, with
  // rounding applied to the entered added/assist value). This is the last reason the
  // legacy increment path survives; retiring that path is the follow-on T-I4.
  // ABSENT / false ⇒ bodyweight collapses to the `bodyweight` equipment bucket and
  // the weight-0 → null-anchor → legacy path, exactly as today.
  bodyweight_model: z.boolean().optional(),

  // ----- R8 — joint-pain hard gate on set counts (doc 10 §3 step 0) -------------
  // Same `.optional()` discipline (absent ⇒ prior behavior, no fingerprint churn).
  //
  // Doc 10 labels joint pain the ONE hard safety gate, but pain only ever blocked
  // LOAD increases (`pain_gate`); `setDelta` was computed with no reference to
  // pain, so pain 3/3 with an easy workload + strong pump still ADDED a set.
  // PRESENT ⇒ step 0 runs first: pain ≥ `pain_gate` vetoes any set addition, and
  // pain ≥ `pain_cut_gate` cuts a set and suggests substitution — regardless of
  // workload/pump. ABSENT ⇒ legacy: joint pain never modulates set counts
  // (pre-v17 rows replay byte-identically). v17 sets it to 3 (the scale's "high").
  pain_cut_gate: z.number().int().min(1).max(3).optional(),

  // ----- doc 16 — prescribed progression (earned-step overload + macro-rate
  // pacing), v20. Same `.optional()` discipline: the WHOLE block absent ⇒ every
  // output, fingerprint, and trace byte-identical to today (doc 16 §2.7). While
  // present with `mode: "earned_step"`, the engine leads the prescribed demand by
  // one earned quantum off the measured anchor (`A* = A + δ`), gated on full
  // compliance (§3.4), metered by the governors (§3.5), and always disclosed by a
  // status-coded `progression` trace step (§3.6). The measured e1RM pipeline is
  // untouched — the prescription target leads; only performance moves the record
  // (T-I5). v20 ships the block INACTIVE.
  progression: z
    .object({
      // absent block / "off" ⇒ current behavior. The only active mode is
      // `earned_step`; `off` exists so an activated row can disable the feature
      // without deleting the block (keeping its tunables visible).
      mode: z.enum(["earned_step", "off"]),
      // the quantum δ (§3.2): "min" = min(one loadable step, one rep at held
      // load) in e1RM space — the smallest honest step the exercise can express;
      // "increment"/"rep" force one axis.
      step: z.enum(["min", "increment", "rep"]).default("min"),
      // earn-gate anchor floor (§3.4). MUST open at `moderate`: `high` requires
      // ≤8 effective reps, and compliant hypertrophy sets pin at ~11 — a `high`
      // floor is provably inert for the flagship goal.
      min_confidence: z.enum(["high", "moderate", "low"]).default("moderate"),
      // the shared set-level e1RM comparison band (§5.3): earn gate, ▲/met/▼
      // markers, and grading read this ONE tunable (absorbed the day view's
      // module-local MARKER_BAND = 0.015; the UI consumes it via
      // `complianceBand()` since Phase 3).
      compliance_band: z.number().min(0).max(0.2).default(0.015),
      // at most one step per exercise per microcycle (mirrors how the RIR ramp
      // steps); "session" is the aggressive-novice setting (multiplies by
      // training frequency).
      cadence: z.enum(["microcycle", "session"]).default("microcycle"),
      // macro-rate pacer (§3.5): absent / "off" ⇒ cadence-only. The rate meters
      // WHEN earned steps are offered; only performance mints them (budget,
      // never quota — §2.4).
      pacing: z.enum(["macro_rate", "off"]).optional(),
      // "band" = macro_target.strength_pct_month keyed by the profile's
      // experience bucket; "plan" (doc 17 §3, N37) swaps in the personalized
      // planMacrocycle rate — the caller-derived `planStrengthRate` input —
      // degrading to "band" (never unpaced) when none is assembled. The flip
      // to "plan" is the Phase-R v22 micro-bump.
      rate_source: z.enum(["band", "plan"]).default("band"),
      // where in the band the pacer targets: 0 = floor, 1 = top. The Phase-3
      // envelope loop writes this same knob at meso boundaries (§4).
      band_position: z.number().min(0).max(1).default(0.5),
      // × the sourced rate, per goal. 0 disables the earn gate for that goal
      // (cut/maintain hold strength honestly per R24 — one mechanism, no
      // separate booleans). hypertrophy/gain 0.75 is a HEURISTIC pending the
      // Phase-R research pass (doc 16 §4).
      goal_rate_factor: z
        .record(z.enum(goalTypes), z.number().min(0))
        .default({
          strength: 1.0,
          hypertrophy: 0.75,
          gain: 0.75,
          cut: 0.0,
          maintain: 0.0,
        }),
      // after ≥2 consecutive earned-then-missed cycles, this many fully
      // compliant sessions re-arm the step (miss throttle, §3.5)
      miss_rearm_sessions: z.number().int().min(1).default(2),
      // staleness gate (§3.4): no earn when the source session is older than
      // this (after a layoff, first reproduce the old anchor)
      max_gap_days: z.number().positive().default(10),
      // "skip" ⇒ no step at target RIR 0 (0 RIR is a ceiling, not a PR slot)
      peak_week: z.enum(["skip", "step"]).default("skip"),
      // cap on the REALIZED (post-rounding) ask as a fraction of the measured
      // anchor (§3.3) — a coarse plate jump on a light lift is skipped (`paced`),
      // never insisted on
      max_pct_per_step: z.number().positive().max(0.5).default(0.05),
      // ----- doc 17 §7 (N36) — the envelope loop. ABSENT ⇒ off: callers
      // assemble no `bandPosition` input and the pacer reads the fixed
      // `band_position` above — byte-identical to pre-envelope behavior.
      // PRESENT + enabled ⇒ the per-user position is a pure fold over the
      // trailing completed mesos' demand-side outcomes (rules/envelope.ts):
      // boundary steps bounded (|Δ| ≤ 0.25 binding, whatever `step` says),
      // minimum dwell, clamp [0, 1]; inputs are demand-side ONLY — never the
      // measured rate. Performance moves the position within the band, never
      // the band (doc 17 principle 4). Every threshold below is PROVISIONAL
      // pending the field-data fit (v20 active + a few real mesos through
      // get_progression_history) — the block ships in no applied params row
      // until the fit lands (manual-operations runbook).
      envelope: z
        .object({
          // `false` lets an activated row switch the loop off without
          // deleting the block (tunables stay visible) — the `mode: "off"`
          // pattern one level down.
          enabled: z.boolean().default(true),
          // how many trailing COMPLETED mesos the fold may consume; older
          // boundaries age out and the position regresses to the default
          lookback_mesos: z.number().int().min(1).max(6).default(3),
          // hard age bound on the lookback (the return-from-absence decay:
          // after this long away, the position is the default again)
          max_age_days: z.number().positive().default(180),
          // a meso with fewer status-coded decisions than this is no
          // evidence — its boundary steps nothing
          min_decisions: z.number().int().min(1).default(8),
          // per-boundary step size; MAX_BOUNDARY_STEP (0.25) binds above it
          step: z.number().min(0).max(0.25).default(0.1),
          // boundaries a new position must hold before the next move;
          // 1 = held exactly one meso (the doc 17 §7 minimum)
          dwell_mesos: z.number().int().min(1).default(1),
          // up-pressure: consistently earning + answering, AND the pacer
          // actually bound (or the athlete beat prescriptions outright)
          raise: z
            .object({
              earn_rate: z.number().min(0).max(1).default(0.7),
              max_miss_ratio: z.number().min(0).max(1).default(0.2),
              pacer_trips: z.number().int().min(1).default(2),
              over_share: z.number().min(0).max(1).default(0.25),
            })
            .default({
              earn_rate: 0.7,
              max_miss_ratio: 0.2,
              pacer_trips: 2,
              over_share: 0.25,
            }),
          // down-pressure: asks going unanswered, or the throttle/workload
          // gates firing repeatedly — down wins over up (conservative)
          lower: z
            .object({
              miss_ratio: z.number().min(0).max(1).default(0.5),
              throttle_trips: z.number().int().min(1).default(2),
              workload_firings: z.number().int().min(1).default(3),
            })
            .default({
              miss_ratio: 0.5,
              throttle_trips: 2,
              workload_firings: 3,
            }),
        })
        .optional(),
    })
    .optional(),

  // within `rir_tolerance` RIR of target ⇒ on track; a gap beyond
  // `rir_regress_gap` is flagged in the rationale (the falling anchor, not a
  // fixed −%, carries genuine regression — doc 13 §4.3).
  rir_tolerance: z.number().min(0).default(1),
  rir_regress_gap: z.number().min(0).default(2),
  // productive rep window per goal (doc 13 §9.1): target_low..high is the
  // double-progression band; min..max are the hard bounds the prescribed reps
  // stay inside. Keyed by the widened goal vocabulary; `gain` mirrors
  // `hypertrophy`. Resolved in prescribe() from the macrocycle goal.
  rep_window: z
    .record(
      z.enum(goalTypes),
      z.object({
        target_low: z.number().int().positive(),
        target_high: z.number().int().positive(),
        min: z.number().int().positive(),
        max: z.number().int().positive(),
      }),
    )
    .default({
      hypertrophy: { target_low: 8, target_high: 12, min: 6, max: 15 },
      gain: { target_low: 8, target_high: 12, min: 6, max: 15 },
      strength: { target_low: 3, target_high: 5, min: 2, max: 6 },
      cut: { target_low: 8, target_high: 12, min: 6, max: 15 },
      maintain: { target_low: 8, target_high: 12, min: 6, max: 15 },
    }),
  // below this confidence, don't reprice off a shaky anchor — hold the plan
  // (doc 13 decision 6). `low` (the default) reprices on almost any signal,
  // matching the "lean aggressive" call; the session-average anchor (§9.3)
  // already tempers a single fluke set.
  reps_predict: z
    .object({
      min_confidence: z.enum(["high", "moderate", "low"]),
    })
    .default({ min_confidence: "low" }),

  // ----- metric blocks (10-metrics-spec.md §8) -------------------------------
  // Added with `.default()` so the active v2 row (which predates them) still
  // parses; an explicit v3 row seeds the values for admin tuning.

  // §1 estimated 1RM: effective-reps + Epley/Brzycki average + confidence
  e1rm: z
    .object({
      rir_offset: z.number().min(0),
      high_max_eff_reps: z.number().int().positive(),
      mod_max_eff_reps: z.number().int().positive(),
      high_max_rir: z.number().int().min(0),
      mod_max_rir: z.number().int().min(0),
      // recency-weighted strength anchor (doc 11): each historical set's e1RM is
      // weighted by 0.5^(ageDays / halflife) × confidence, so the live reps
      // predictor tracks current form and legitimately drops when performance
      // dips (e.g. on a cut). Tunable like everything else.
      recency_halflife_days: z.number().positive().default(30),
      // strength-anchor selection (doc 13 decision 4 + §9.3). `mean` is the
      // legacy recency-weighted average; `best` the recency-weighted single max
      // set; `session_best` (the locked default) takes the recency-weighted best
      // set then averages every working set from *that session* — robust to one
      // blow-out set. Defaulted to `mean` here so a pre-v9 row keeps its old live
      // predictor; the v9 row + DEFAULT_ENGINE_PARAMS select `session_best`.
      anchor_method: z
        .enum(["session_best", "best", "mean"])
        .default("mean"),
      // §S3 (standalone-prescription investigation 2026-06-23). Brzycki tracks
      // Epley to ~10 reps then inflates increasingly above it, so a high-rep
      // burnout (e.g. 100×30) drives a 2–4× e1RM blow-up. The rule: Brzycki only
      // for effective reps ≤ this, Epley alone above it (drop the average outside
      // the band where they agree). `.optional()` — ABSENT on every pre-v11 row,
      // so those parse byte-identically (replayability preserved) and the engine
      // falls back to the legacy `>= 36` Epley-only cutoff. v11 sets it to 10.
      // Capped at 10 (R24): the curves cross at ~10 effective reps; above it
      // Brzycki > Epley, so a higher cutoff puts a DOWNWARD jump in k(effReps)
      // at the switch — breaking the monotonicity the rep-prediction bisection
      // and the closed-form inverse both assume (verified: cutoff 14 made
      // asking for more reps prescribe a heavier load). Every stored row is 10.
      brzycki_max_eff_reps: z.number().positive().max(10).optional(),
      // §S3: down-weight low-confidence sets in the `session_best` anchor *value*
      // (not just its label). A 20–30-rep burnout should contribute little to the
      // strength anchor. ABSENT ⇒ equal-weight session mean (legacy). v11 seeds
      // {high:1, moderate:0.6, low:0.3} (mirrors the legacy `mean` CONF_WEIGHT).
      session_value_confidence_weights: z
        .object({
          high: z.number().min(0),
          moderate: z.number().min(0),
          low: z.number().min(0),
        })
        .optional(),
    })
    .default({
      rir_offset: 1.0,
      high_max_eff_reps: 8,
      mod_max_eff_reps: 12,
      high_max_rir: 2,
      mod_max_rir: 3,
      recency_halflife_days: 30,
      anchor_method: "mean",
    }),

  // §5 profile-personalized macrocycle target + recommended-timeframe engine
  macro_target: z
    .object({
      sex_factor_female: z.number().min(0).max(1),
      // hypertrophy rate decays continuously with training age (front-loaded,
      // research-grounded): rate(T) = base × e^(−T/tau). Replaces the old
      // discrete buckets + hard career-cap clamp, which flattened the per-macro
      // target across durations for near-cap lifters (the "static" bug).
      hypertrophy_base_pct_bw_month: z
        .object({ low: z.number().positive(), high: z.number().positive() })
        .default({ low: 1.0, high: 1.5 }),
      hypertrophy_decay_tau_years: z.number().positive().default(5),
      // proximity-to-potential model (v5, primary when body fat is known): the
      // rate is driven by how far the lifter is below their genetic ceiling
      // (FFMI), not calendar training age — gains stay fast for an undermuscled
      // lifter regardless of how long ago they started. rate = floor + (base −
      // floor)·(1 − developedFraction). Falls back to the decay model above when
      // body fat / height are missing.
      hypertrophy_floor_pct_bw_month: z
        .object({ low: z.number().min(0), high: z.number().min(0) })
        .default({ low: 0.04, high: 0.09 }),
      // normalized FFMI (height-adjusted to 1.83 m) ceiling + untrained baseline
      ffmi_ceiling: z
        .object({ male: z.number().positive(), female: z.number().positive() })
        .default({ male: 25, female: 21.5 }),
      ffmi_untrained: z
        .object({ male: z.number().positive(), female: z.number().positive() })
        .default({ male: 18.5, female: 14.5 }),
      // a single macro can't claim more than this fraction of remaining potential
      proximity_macro_cap_frac: z.number().positive().max(1).default(0.6),
      // cut leanness bands by body-fat % (preferred over the BMI proxy)
      cut_bf_thresholds: z
        .object({
          male: z.object({ high: z.number(), lean: z.number() }),
          female: z.object({ high: z.number(), lean: z.number() }),
        })
        .default({ male: { high: 20, lean: 12 }, female: { high: 30, lean: 22 } }),
      // deprecated (kept for back-compat parsing of older rows; unused since v4)
      career_cap_lb: z
        .object({ male: z.number().positive(), female: z.number().positive() })
        .default({ male: 40, female: 20 }),
      career_tau_years: z.number().positive().default(3),
      hypertrophy_pct_bw_month: experienceRanges.default({
        beginner: [1.0, 1.5],
        intermediate: [0.5, 1.0],
        advanced: [0.25, 0.5],
      }),
      strength_pct_month: experienceRanges,
      strength_cap_total_pct: z.object({
        beginner: z.number().positive(),
        intermediate: z.number().positive(),
        advanced: z.number().positive(),
      }),
      cut_pct_bw_week: z.object({
        high_bf: rangeTuple,
        average: rangeTuple,
        lean: rangeTuple,
      }),
      cut_bmi_high: z.number().positive(),
      cut_bmi_lean: z.number().positive(),
      // realistic cap on total loss in one macro (fraction of bodyweight) — the
      // weekly rate also compounds on the shrinking bodyweight so long cuts
      // decelerate instead of extrapolating linearly to absurd totals.
      cut_cap_pct_bw: z.number().positive().max(1).default(0.25),
      age_taper: z.boolean(),
      age_taper_start: z.number().positive(),
      age_taper_per_year: z.number().min(0),
      age_taper_floor: z.number().min(0).max(1),
      // ----- doc 17 §2 / v21 — target-engine correction (N21) — all gated -----
      // Each is `.optional()` (the v11+ discipline): ABSENT on every pre-v21 row,
      // so those parse/hash byte-identically and planMacrocycle falls back to the
      // prior behavior. v21 seeds them; activation is doc 17 Phase R2.
      //
      // Strength-path sex factor. Relative 1RM gains are ~sex-equal (Roberts
      // 2020; Refalo 2025; doc 10 §5), so the default is {1.0, 1.0} — a DISTINCT
      // param from the hypertrophy `sex_factor_female` (0.7), which models
      // lean-mass fraction and must never be reused for strength.
      strength_sex_factor: z
        .object({ male: z.number().min(0), female: z.number().min(0) })
        .optional(),
      // Strength-path age taper floor: the existing age_taper slope applies to
      // the strength band, but bottoms out higher than the hypertrophy 0.6 —
      // neural adaptation is preserved with age (Peterson 2010, ACSM 2009).
      // ABSENT ⇒ no age taper on the strength path (legacy).
      age_taper_floor_strength: z.number().min(0).max(1).optional(),
      // Hypertrophy-continuity proxy (doc 17 §2.2): when height + bodyweight
      // are present but body-fat % is not, run the FFMI proximity model on a
      // representative bf% for the profile's BMI leanness band instead of
      // flipping to the training-age decay — completing the bf% field then
      // moves the rate continuously, never discontinuously. Values are
      // mid-band representative bf% consistent with `cut_bf_thresholds`.
      // ABSENT ⇒ legacy decay fallback whenever bf% is unknown.
      bf_proxy_pct: z
        .object({
          male: z.object({
            lean: z.number().min(2).max(70),
            average: z.number().min(2).max(70),
            high_bf: z.number().min(2).max(70),
          }),
          female: z.object({
            lean: z.number().min(2).max(70),
            average: z.number().min(2).max(70),
            high_bf: z.number().min(2).max(70),
          }),
        })
        .optional(),
      // ----- doc 17 §2.7 / v23 — two-component strength-rate model (N43) -----
      // The strength-path analogue of the N21 hypertrophy correction
      // (docs/reviews/2026-07-11-strength-rate-model-research.md §4). ABSENT on
      // every pre-v23 row ⇒ parse/hash byte-identical and `strengthRateBand`
      // falls back to the v21 bucket band × sex/age (legacy). PRESENT + enabled
      // ⇒ whenever body composition can be read, the calendar-bucketed band is
      // replaced by an ADDITIVE model:
      //   strengthRate%/mo = neural(trainingAge) + k × hypertrophyRate_FFM
      // — a decaying neural/skill term (large near zero training age, small
      // floor for the experienced; Balshaw 2017, Moritani/deVries 1979,
      // Pearcey 2021) plus the N21 FFMI-proximity hypertrophy rate re-expressed
      // as %/mo of FFM and coupled ~1:1 (allometric FFM exponent × trained-
      // muscle amplification; Bamman 2007). Both terms are bands; the sum then
      // takes the SAME strength sex factor + age taper as v21 and is clamped to
      // `rate_ceiling_pct_month`. Degrades to the bucket band when body comp is
      // missing (no FFMI → hypertrophic term uncomputable), mirroring how the
      // hypertrophy path degrades to training-age decay.
      strength_model: z
        .object({
          // `false` lets an activated row disable the model without deleting
          // the block (tunables stay visible) — the `mode: "off"` pattern.
          enabled: z.boolean().default(true),
          // neural/skill term N0·e^(−effectiveYears/τ) + floor, a decaying
          // BAND. N0 ≈ {3, 5} %/mo at zero training age; floor ≈ {0.1, 0.4}
          // %/mo — non-zero because cortical/spinal plasticity continues into
          // chronic training (Pearcey 2021). Its argument is EFFECTIVE training
          // age (see `undermuscled_unbank`); τ in years (≈0.5 = 6 mo).
          neural_n0: z.object({ low: z.number().min(0), high: z.number().min(0) }),
          neural_floor: z.object({
            low: z.number().min(0),
            high: z.number().min(0),
          }),
          neural_tau_years: z.number().positive(),
          // FFM-scaled hypertrophic coupling k (research §2.5): the allometric
          // FFM exponent (~0.8–1.1) × trained-muscle amplification (~1.1–1.3)
          // nets ≈1.0 [HEURISTIC, defensible band 0.8–1.3]. A single tunable.
          ffm_coupling_k: z.number().min(0),
          // "un-bank" (research §4 guardrail): discount EFFECTIVE training age
          // toward `trainingYears × undermuscled_unbank` when realized FFM is
          // low (developed fraction → 0), because FFMI 16.7 after 13 calendar
          // years is itself evidence of ineffective training and neural gains
          // are effective-practice-specific, not calendar-specific. 1 = no
          // discount; <1 raises the neural residual for a long-calendar-age but
          // undermuscled lifter. HEURISTIC. Default 1 (off) in the schema; v23
          // seeds a modest 0.5.
          undermuscled_unbank: z.number().min(0).max(1).default(1),
          // total-rate ceiling (%/mo) — clamps the genuine-novice corner so a
          // very light / high-bf beginner can't project past plausible rates.
          rate_ceiling_pct_month: z.number().positive(),
        })
        .optional(),
      recommend_target_lb: z.object({
        male: z.number().positive(),
        female: z.number().positive(),
      }),
      recommend_strength_total_pct: z.number().positive(),
      recommend_cut_bw_pct: z.number().positive(),
      recommend_min_months: z.number().int().positive(),
      recommend_max_months: z.number().int().positive(),
      present: z.enum(["conservative_end", "range"]),
    })
    .default({
      sex_factor_female: 0.7,
      hypertrophy_base_pct_bw_month: { low: 1.0, high: 1.5 },
      hypertrophy_decay_tau_years: 5,
      hypertrophy_floor_pct_bw_month: { low: 0.04, high: 0.09 },
      ffmi_ceiling: { male: 25, female: 21.5 },
      ffmi_untrained: { male: 18.5, female: 14.5 },
      proximity_macro_cap_frac: 0.6,
      cut_bf_thresholds: { male: { high: 20, lean: 12 }, female: { high: 30, lean: 22 } },
      career_cap_lb: { male: 40, female: 20 },
      career_tau_years: 3,
      hypertrophy_pct_bw_month: {
        beginner: [1.0, 1.5],
        intermediate: [0.5, 1.0],
        advanced: [0.25, 0.5],
      },
      strength_pct_month: {
        beginner: [4, 8],
        intermediate: [1.5, 3],
        advanced: [0.5, 1.5],
      },
      strength_cap_total_pct: { beginner: 60, intermediate: 30, advanced: 15 },
      cut_pct_bw_week: {
        high_bf: [1.0, 1.5],
        average: [0.5, 1.0],
        lean: [0.25, 0.5],
      },
      cut_bmi_high: 27,
      cut_bmi_lean: 22,
      cut_cap_pct_bw: 0.25,
      age_taper: true,
      age_taper_start: 40,
      age_taper_per_year: 0.02,
      age_taper_floor: 0.6,
      recommend_target_lb: { male: 8, female: 4 },
      recommend_strength_total_pct: 10,
      recommend_cut_bw_pct: 8,
      recommend_min_months: 2,
      recommend_max_months: 12,
      present: "conservative_end",
    }),

  // §5 phase spread across mesocycle positions
  phase_plan: z
    .object({
      order: z.array(z.enum(phaseNames)).min(1),
      accumulation_fraction: z.number().min(0).max(1),
    })
    .default({ order: [...phaseNames], accumulation_fraction: 0.6 }),

  // §6 key lifts = most-logged exercises across the macro
  key_lifts: z
    .object({
      n: z.number().int().positive(),
      selection: z.enum(["frequency"]),
    })
    .default({ n: 5, selection: "frequency" }),

  // §6 aggregated strength trend ("est. strength"): the macro/meso rollup folds
  // each lift's per-session e1RM into a recent-vs-baseline change using two
  // symmetric rolling windows (best of the most-recent `window_sessions` vs best
  // of the earliest `window_sessions`). This replaces the volatile first→last
  // fold that let a fresh block's light opening session define the endpoint.
  // A lift needs `min_sessions` non-deload sessions to be scored. `tolerance_pct`
  // is the dead-band inside which the per-lift trend reads "holding".
  //
  // `.optional()` (the post-v10 discipline): ABSENT on every stored row, so the
  // canonical materialization / `params_hash` of each historical engine_params
  // version is byte-unchanged (replayability preserved) and the stats fall back
  // to `DEFAULT_STRENGTH` (engine/strength.ts). These are read-model stats, not
  // a prescription tunable, so they never touch replay; a future version can
  // seed them explicitly for admin tuning via propose_engine_params.
  strength: z
    .object({
      window_sessions: z.number().int().positive(),
      min_sessions: z.number().int().positive(),
      tolerance_pct: z.number().min(0),
    })
    .optional(),

  // §2 weekly-set volume landmarks (MEV / MAV_high / MRV). The dose-response
  // band (~10–20 hard sets/muscle/week) is evidenced; the per-muscle numbers
  // are heuristic RP/Israetel starting points (10 §2/§8 — tunable, not gospel).
  // Stored as `[MEV, MAV_high, MRV]` direct-equivalent weekly sets for an
  // *intermediate*; `experience_scale` shifts the whole band by training level
  // (beginners start lower with a lower ceiling). Keyed by the app's
  // muscle-group names (spec's "delts" → "shoulders"). Added with `.default()`
  // so rows predating it still parse; an admin can tune via propose_engine_params.
  volume: z
    .object({
      landmarks: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])),
      experience_scale: z.object({
        beginner: z.number().positive(),
        intermediate: z.number().positive(),
        advanced: z.number().positive(),
      }),
      // §2 fractional counting weights (R14): a working set credits `direct`
      // to each of the exercise's primary muscles and `indirect` to each
      // secondary (`exercise_muscle_groups.role`). Optional with the v11–v17
      // `.optional()` discipline so every stored row stays byte-replayable;
      // absent ⇒ the doc-10 defaults 1.0 / 0.5 (see `volumeCountingWeights`).
      // The §2 hard-set rule companions (`counting_max_rir` = 4,
      // `warmups_count` = false) are enforced structurally in the shared
      // volume view (`v_meso_week_muscle_sets` — warmups filtered, hard sets
      // = rir_reported ≤ 4 or unreported) rather than carried here: a param
      // the SQL cannot read would silently diverge from the numbers actually
      // served. Changing those two means a view migration.
      direct: z.number().positive().optional(),
      indirect: z.number().min(0).optional(),
    })
    .default({
      landmarks: {
        back: [10, 22, 25],
        chest: [8, 20, 22],
        quads: [8, 18, 20],
        hamstrings: [6, 16, 20],
        glutes: [4, 16, 20],
        shoulders: [8, 20, 26],
        biceps: [6, 20, 26],
        triceps: [6, 18, 24],
        calves: [6, 16, 20],
        abs: [4, 16, 25],
      },
      experience_scale: { beginner: 0.7, intermediate: 1.0, advanced: 1.1 },
    }),
})
  // ----- R24: cross-field invariants ------------------------------------------
  // Doc 04 requires the schema gate to make a bad row unactivatable, but shape
  // checks alone let semantic nonsense through — an inverted rep window turns
  // the Option-A clamp degenerate, and min_sets > max_sets_per_exercise makes
  // clampSets contradictory. Verified before shipping: every stored
  // engine_params row (v1–v18, hosted) satisfies these, so historical rows
  // keep parsing and replaying byte-identically.
  .superRefine((p, ctx) => {
    if (p.min_sets > p.max_sets_per_exercise) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["min_sets"],
        message: `min_sets (${p.min_sets}) must be ≤ max_sets_per_exercise (${p.max_sets_per_exercise})`,
      });
    }
    for (const [goal, w] of Object.entries(p.rep_window)) {
      if (!w) continue;
      if (!(w.min <= w.target_low && w.target_low <= w.target_high && w.target_high <= w.max)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rep_window", goal],
          message: `rep_window.${goal} must satisfy min ≤ target_low ≤ target_high ≤ max (got ${w.min}/${w.target_low}/${w.target_high}/${w.max})`,
        });
      }
    }
  });

export type EngineParams = z.infer<typeof engineParamsSchema>;

/** v2 defaults — mirrors the active `engine_params` row (version 2). */
export const DEFAULT_ENGINE_PARAMS: EngineParams = engineParamsSchema.parse({
  increment: {
    barbell: 5,
    smith: 5,
    dumbbell: 5,
    machine: 5,
    cable: 5,
    bodyweight: 5,
    bands: 10,
    kettlebell: 9,
    other: 5,
  },
  experience_increment_scale: {
    beginner: 1.5,
    intermediate: 1.0,
    advanced: 0.5,
  },
  progression_style: {
    gain: "load_first",
    hypertrophy: "load_first",
    strength: "load_first",
    cut: "hold",
    maintain: "hold",
  },
  small_miss_reps: 2,
  regression_pct: 0.9,
  pain_gate: 2,
  workload_high: 8,
  workload_low: 3,
  set_add_pump_min: 6,
  pump_low: 2,
  min_sets: 2,
  max_sets_per_exercise: 6,
  mg_set_ceiling: 20,
  session_fatigue_dampen_threshold: 3,
  session_performance_dampen_threshold: 1,
  deload: { load_pct: 0.55, set_pct: 0.5, target_rir: 4 },
  meso_seed_backoff_pct: 0.925,
  rounding: {
    barbell: 5,
    smith: 5,
    dumbbell: 5,
    machine: 5,
    cable: 5,
    bodyweight: 5,
    bands: 10,
    kettlebell: 9,
    other: 5,
  },
  // doc 13 v9: the new rep-window prescription + RIR grading + session-best
  // anchor are the active defaults; the schema keeps legacy fallbacks so older
  // engine_params rows still parse to the increment path.
  e1rm: {
    rir_offset: 1.0,
    high_max_eff_reps: 8,
    mod_max_eff_reps: 12,
    high_max_rir: 2,
    mod_max_rir: 3,
    recency_halflife_days: 30,
    anchor_method: "session_best",
  },
  weight_selection: "rep_window",
  grading: "rir",
  rir_tolerance: 1,
  rir_regress_gap: 2,
  rep_window: {
    hypertrophy: { target_low: 8, target_high: 12, min: 6, max: 15 },
    gain: { target_low: 8, target_high: 12, min: 6, max: 15 },
    strength: { target_low: 3, target_high: 5, min: 2, max: 6 },
    cut: { target_low: 8, target_high: 12, min: 6, max: 15 },
    maintain: { target_low: 8, target_high: 12, min: 6, max: 15 },
  },
  reps_predict: { min_confidence: "low" },
});
