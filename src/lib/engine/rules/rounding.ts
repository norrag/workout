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

// `incrementFor` (the legacy +step / experience-scaled progression jump) was
// retired with the legacy increment path in T-I4. The `increment` and
// `experience_increment_scale` params remain in the schema for historical-row
// parsing only; no code reads them.
