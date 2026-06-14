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
    })
    .default({
      rir_offset: 1.0,
      high_max_eff_reps: 8,
      mod_max_eff_reps: 12,
      high_max_rir: 2,
      mod_max_rir: 3,
    }),

  // §5 profile-personalized macrocycle target + recommended-timeframe engine
  macro_target: z
    .object({
      sex_factor_female: z.number().min(0).max(1),
      career_cap_lb: z.object({
        male: z.number().positive(),
        female: z.number().positive(),
      }),
      career_tau_years: z.number().positive(),
      hypertrophy_pct_bw_month: experienceRanges,
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
      sex_factor_female: 0.5,
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
