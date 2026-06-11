import type { EngineParams } from "../params";
import type { equipmentTypes } from "../params";

type Equipment = (typeof equipmentTypes)[number];

/** Round a weight to the loadable step for the equipment, in the user's units. */
export function roundToStep(
  weight: number,
  equipment: Equipment,
  units: "kg" | "lb",
  params: EngineParams,
): number {
  const stepKg = params.rounding_kg[equipment] ?? 2.5;
  const step = units === "lb" ? stepKg * params.lb_increment_factor : stepKg;
  if (step <= 0) return weight;
  return Math.round((Math.round(weight / step) * step) * 100) / 100;
}

/** The load increment for this exercise/user, in the user's units. */
export function incrementFor(
  equipment: Equipment,
  experience: "beginner" | "intermediate" | "advanced",
  units: "kg" | "lb",
  params: EngineParams,
): number {
  const baseKg = params.increment_kg[equipment] ?? 2.5;
  const scaled = baseKg * (params.experience_increment_scale[experience] ?? 1);
  return units === "lb" ? scaled * params.lb_increment_factor : scaled;
}
