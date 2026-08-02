import type { EngineParams, EquipmentType } from "./params";

/**
 * Per-user × exercise engine overrides (doc 14 phase 3, §6.1 step 1). The first
 * tunable is the editable weight increment — the per-set load jump for one lift,
 * in the user's units. Future overrides (rep window, rounding, RIR cap — doc 14
 * §1) extend this shape and merge the same way.
 */
export interface ExerciseParamOverride {
  /** per-set weight increment for this exercise, in pounds (> 0). */
  weightIncrement: number | null;
}

/**
 * Merge a per-user × exercise override into the GLOBAL engine params, producing
 * the EFFECTIVE params the engine runs under for that one exercise (doc 14 §6.1).
 * Pure (hard rule #3): the engine still takes one resolved `EngineParams`; this is
 * the query-layer-facing resolver, kept beside the engine so generation, recompute,
 * and the freshness check all fold the override the same way.
 *
 * The weight increment is the exercise's **loadable step** — the smallest jump you
 * can actually put on the bar/stack. That step is what the engine rounds EVERY
 * prescribed weight to, in EVERY path (`roundToStep` reads `params.rounding`): the
 * meso seed, the anchor cold-start, and the rep-window advance. So the override
 * sets `params.rounding` for this exercise's equipment — that is what makes "I lift
 * this in 25s" actually produce loads in 25s, seed or advance. (T-I4 retired the
 * legacy `increment` / `experience_increment_scale` progression jump, so the
 * override no longer touches `params.increment` — nothing reads it.)
 *
 * A null/absent override returns the params unchanged (and, by the fingerprint
 * contract, produces the identical fingerprint a pre-phase-3 row carried — so the
 * override surface churns nothing for the rows that don't have one).
 */
export function resolveEffectiveParams(
  params: EngineParams,
  override: ExerciseParamOverride | null | undefined,
  equipment: EquipmentType,
): EngineParams {
  const step = override?.weightIncrement;
  if (step == null) return params;
  return {
    ...params,
    // the loadable step every prescription rounds to (load is priced off the
    // strength anchor and rounded to this step)
    rounding: {
      ...params.rounding,
      [equipment]: step,
    },
    // N67: a deliberately-set increment is a statement about how THIS lift's
    // load moves, so the lattice indexes off what the lifter actually entered
    // rather than off absolute multiples of the step — 88 lb with a 10 lb step
    // steps to 98 / 78, not 90 / 80. Scoped to overridden exercises: on the
    // equipment defaults (5 lb) the entered load is almost always already on
    // the grid, and phasing every lift's lattice would be a silent global
    // change. A global switch is still available by activating a params
    // version that sets `rounding_origin` itself.
    rounding_origin: params.rounding_origin ?? "last_entered",
  };
}
