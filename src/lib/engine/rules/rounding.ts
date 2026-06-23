import type { EngineParams } from "../params";
import type { equipmentTypes } from "../params";

type Equipment = (typeof equipmentTypes)[number];

const FALLBACK_STEP = 5;

/** Round a weight to the loadable step for the equipment, in pounds. */
export function roundToStep(
  weight: number,
  equipment: Equipment,
  params: EngineParams,
): number {
  const step = params.rounding[equipment] ?? FALLBACK_STEP;
  if (step <= 0) return weight;
  return Math.round((Math.round(weight / step) * step) * 100) / 100;
}

/** The load increment for this exercise/user, in pounds. */
export function incrementFor(
  equipment: Equipment,
  experience: "beginner" | "intermediate" | "advanced",
  params: EngineParams,
): number {
  const base = params.increment[equipment] ?? FALLBACK_STEP;
  return base * (params.experience_increment_scale[experience] ?? 1);
}
