import type { EngineParams } from "../params";
import type { equipmentTypes } from "../params";

type Equipment = (typeof equipmentTypes)[number];
type Units = "kg" | "lb";

const FALLBACK_STEP = { kg: 2.5, lb: 5 };

/** Round a weight to the loadable step for the equipment, in the user's units. */
export function roundToStep(
  weight: number,
  equipment: Equipment,
  units: Units,
  params: EngineParams,
): number {
  const step = (params.rounding[equipment] ?? FALLBACK_STEP)[units];
  if (step <= 0) return weight;
  return Math.round((Math.round(weight / step) * step) * 100) / 100;
}

/** The load increment for this exercise/user, in the user's units. */
export function incrementFor(
  equipment: Equipment,
  experience: "beginner" | "intermediate" | "advanced",
  units: Units,
  params: EngineParams,
): number {
  const base = (params.increment[equipment] ?? FALLBACK_STEP)[units];
  return base * (params.experience_increment_scale[experience] ?? 1);
}
