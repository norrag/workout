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

export const goalTypes = ["cut", "gain", "maintain"] as const;

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

// loadable step / progression jump per equipment, expressed per unit so lb
// users get real plate math (lb is the app default)
const perEquipmentStep = z.record(
  z.enum(equipmentTypes),
  z.object({ kg: z.number().min(0), lb: z.number().min(0) }),
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
  // weight increment per equipment type, in each unit
  increment: perEquipmentStep,
  experience_increment_scale: z.record(
    z.enum(experienceLevels),
    z.number().positive(),
  ),
  // how each goal progresses on a met prescription
  progression_style: z.record(
    z.enum(goalTypes),
    z.enum(["load_first", "reps_first", "hold"]),
  ),
  // missed reps by <= this margin => hold; more => regress
  small_miss_reps: z.number().int().min(0),
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
  // session-level dampening
  session_fatigue_dampen_threshold: z.number().int().min(0).max(4),
  session_performance_dampen_threshold: z.number().int().min(0).max(4),
  deload: z.object({
    load_pct: z.number().min(0.3).max(0.9),
    set_pct: z.number().min(0.3).max(1),
    target_rir: z.number().int().min(3).max(5),
  }),
  meso_seed_backoff_pct: z.number().min(0.7).max(1),
  // weights are rounded to this loadable step per equipment, in each unit
  rounding: perEquipmentStep,

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
    })
    .default({
      rir_offset: 1.0,
      high_max_eff_reps: 8,
      mod_max_eff_reps: 12,
      high_max_rir: 2,
      mod_max_rir: 3,
      recency_halflife_days: 30,
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
});

export type EngineParams = z.infer<typeof engineParamsSchema>;

/** v2 defaults — mirrors the active `engine_params` row (version 2). */
export const DEFAULT_ENGINE_PARAMS: EngineParams = engineParamsSchema.parse({
  increment: {
    barbell: { kg: 2.5, lb: 5 },
    smith: { kg: 2.5, lb: 5 },
    dumbbell: { kg: 2.0, lb: 5 },
    machine: { kg: 2.5, lb: 5 },
    cable: { kg: 2.5, lb: 5 },
    bodyweight: { kg: 2.5, lb: 5 },
    bands: { kg: 5.0, lb: 10 },
    kettlebell: { kg: 4.0, lb: 9 },
    other: { kg: 2.5, lb: 5 },
  },
  experience_increment_scale: {
    beginner: 1.5,
    intermediate: 1.0,
    advanced: 0.5,
  },
  progression_style: {
    gain: "load_first",
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
    barbell: { kg: 2.5, lb: 5 },
    smith: { kg: 2.5, lb: 5 },
    dumbbell: { kg: 2.0, lb: 5 },
    machine: { kg: 2.5, lb: 5 },
    cable: { kg: 2.5, lb: 5 },
    bodyweight: { kg: 2.5, lb: 5 },
    bands: { kg: 5.0, lb: 10 },
    kettlebell: { kg: 4.0, lb: 9 },
    other: { kg: 2.5, lb: 5 },
  },
});
