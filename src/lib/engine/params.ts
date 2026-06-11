import { z } from "zod";

export const equipmentTypes = [
  "barbell",
  "smith",
  "dumbbell",
  "machine",
  "cable",
  "bodyweight",
  "other",
] as const;

export const experienceLevels = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export const goalTypes = ["cut", "gain", "maintain"] as const;

const perEquipment = z.record(z.enum(equipmentTypes), z.number().min(0));

/**
 * Schema for `engine_params.params`. A bad row can never be activated:
 * admin tooling and the engine itself both parse with this schema.
 */
export const engineParamsSchema = z.object({
  // base weight increment per equipment type, in kg
  increment_kg: perEquipment,
  // weights for lb users step in increments scaled by this factor (2.5kg -> 5lb)
  lb_increment_factor: z.number().positive().default(2),
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
  strain_volume_threshold: z.number().int().min(0).max(3),
  fatigue_volume_threshold: z.number().int().min(0).max(3),
  pump_low_threshold: z.number().int().min(0).max(3),
  // a set is added only when pump >= set_add_pump_min and fatigue <= set_add_fatigue_max
  set_add_pump_min: z.number().int().min(0).max(3),
  set_add_fatigue_max: z.number().int().min(0).max(3),
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
  // weights are rounded to this step per equipment, in kg
  rounding_kg: perEquipment,
});

export type EngineParams = z.infer<typeof engineParamsSchema>;

/** v1 defaults — mirrors the `engine_params` version 1 row in supabase/seed.sql */
export const DEFAULT_ENGINE_PARAMS: EngineParams = engineParamsSchema.parse({
  increment_kg: {
    barbell: 2.5,
    smith: 2.5,
    dumbbell: 2.0,
    machine: 2.5,
    cable: 2.5,
    bodyweight: 2.5,
    other: 2.5,
  },
  lb_increment_factor: 2,
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
  strain_volume_threshold: 2,
  fatigue_volume_threshold: 2,
  pump_low_threshold: 1,
  set_add_pump_min: 3,
  set_add_fatigue_max: 0,
  min_sets: 2,
  max_sets_per_exercise: 6,
  mg_set_ceiling: 20,
  session_fatigue_dampen_threshold: 3,
  session_performance_dampen_threshold: 1,
  deload: { load_pct: 0.55, set_pct: 0.5, target_rir: 4 },
  meso_seed_backoff_pct: 0.925,
  rounding_kg: {
    barbell: 2.5,
    smith: 2.5,
    dumbbell: 2.0,
    machine: 2.5,
    cable: 2.5,
    bodyweight: 2.5,
    other: 2.5,
  },
});
