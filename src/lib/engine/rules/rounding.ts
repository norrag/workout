import type { EngineParams } from "../params";
import type { equipmentTypes } from "../params";

type Equipment = (typeof equipmentTypes)[number];

const FALLBACK_STEP = 5;

/** The shape `latticeOrigin` needs off `EngineInputs` — kept structural so this
 *  leaf never imports the inputs schema (and never pulls zod into the day view's
 *  client chunk through `day-rules.ts`). */
export interface LatticeOriginInputs {
  actualSets?: {
    setNumber: number;
    weight: number;
    isWarmup: boolean;
    sequenceIndex?: number | null;
  }[];
  previous?: { weight: number | null } | null;
  weekPeak?: { weight: number | null } | null;
  initial?: { weight: number | null } | null;
  seedEarn?: {
    actualSets: {
      setNumber: number;
      weight: number;
      isWarmup: boolean;
      sequenceIndex?: number | null;
    }[];
  } | null;
}

/**
 * Round a weight to the loadable step for the equipment, in pounds.
 *
 * `origin` is the lattice PHASE (N67): with no origin the stops are absolute
 * multiples of the step (…, 80, 90, 100 for a 10 lb step); with one they are
 * `origin ± k × step`, so a lifter who actually put 88 lb on the machine gets
 * 78 / 88 / 98 rather than being snapped back onto a grid they never lift on.
 * `latticeOrigin` resolves it from the inputs; null ⇒ the absolute grid, which
 * is byte-identical to the pre-N67 behavior.
 */
export function roundToStep(
  weight: number,
  equipment: Equipment,
  params: EngineParams,
  origin?: number | null,
): number {
  const step = params.rounding[equipment] ?? FALLBACK_STEP;
  if (step <= 0) return weight;
  const base = origin != null && Number.isFinite(origin) ? origin : 0;
  return (
    Math.round((base + Math.round((weight - base) / step) * step) * 100) / 100
  );
}

/** The last working load the lifter actually entered in a set of logged sets. */
function lastEnteredIn(
  sets: LatticeOriginInputs["actualSets"],
): number | null {
  if (!sets || sets.length === 0) return null;
  const working = sets.filter((s) => !s.isWarmup && s.weight > 0);
  if (working.length === 0) return null;
  // most recent = highest recorded sequence, falling back to set number (the
  // engine is clockless; `sequenceIndex` is the caller's stable ordering)
  const best = working.reduce((a, b) =>
    (b.sequenceIndex ?? b.setNumber) >= (a.sequenceIndex ?? a.setNumber) ? b : a,
  );
  return best.weight;
}

/**
 * The load lattice's origin (N67) — "index the increment off the last weight the
 * user entered". Only resolved when the effective params ask for it
 * (`rounding_origin: "last_entered"`, which `resolveEffectiveParams` sets for an
 * exercise carrying a per-exercise increment override); otherwise null, and every
 * rounding path keeps the absolute grid it has always used.
 *
 * Priority is "closest to something the lifter actually typed":
 *   1. this cycle's logged working sets (the advance route);
 *   2. the seed route's earn context — the prior meso's final working session;
 *   3. the load they were last prescribed and handled (`previous`), then the
 *      meso peak, then the plan's starting weight (cold start).
 * All of these are already DERIVED inputs (doc 14 §3 denylist) or config the
 * fingerprint already covers, so the lattice adds no new freshness dependency.
 */
export function latticeOrigin(
  inputs: LatticeOriginInputs,
  params: EngineParams,
): number | null {
  if ((params.rounding_origin ?? "absolute") !== "last_entered") return null;
  const entered =
    lastEnteredIn(inputs.actualSets) ??
    lastEnteredIn(inputs.seedEarn?.actualSets) ??
    inputs.previous?.weight ??
    inputs.weekPeak?.weight ??
    inputs.initial?.weight ??
    null;
  return entered != null && entered > 0 ? entered : null;
}

// `incrementFor` (the legacy +step / experience-scaled progression jump) was
// retired with the legacy increment path in T-I4. The `increment` and
// `experience_increment_scale` params remain in the schema for historical-row
// parsing only; no code reads them.
