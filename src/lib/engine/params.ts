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

// loadable step / progression jump per equipment, expressed per unit so lb
// users get real plate math (lb is the app default)
const perEquipmentStep = z.record(
  z.enum(equipmentTypes),
  z.object({ kg: z.number().min(0), lb: z.number().min(0) }),
);

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
