import type { EngineParams, EquipmentType } from "./params";

/**
 * Per-user × exercise engine overrides (doc 14 phase 3, §6.1 step 1). The first
 * tunable is the editable weight increment — the per-set load jump for one lift,
 * in the user's units. Future overrides (rep window, rounding, RIR cap — doc 14
 * §1) extend this shape and merge the same way.
 */
export interface ExerciseParamOverride {
  /** per-set weight increment for this exercise, in the user's units (> 0). */
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
 * meso seed, the anchor cold-start, the rep-window advance, and the legacy advance.
 * So the override sets `params.rounding` for this exercise's equipment/units — that
 * is what makes "I lift this in 25s" actually produce loads in 25s, seed or advance.
 *
 * It also sets the legacy `params.increment` (the +step progression jump used only
 * on the no-anchor fallback path, `weight_selection: "increment"`) to the same
 * value, so the user's step is honoured there too. `increment` composes with
 * `experience_increment_scale`; `rounding` (a physical step) does not — it is used
 * literally, which is what the user means by the loadable step.
 *
 * A null/absent override returns the params unchanged (and, by the fingerprint
 * contract, produces the identical fingerprint a pre-phase-3 row carried — so the
 * override surface churns nothing for the rows that don't have one).
 */
export function resolveEffectiveParams(
  params: EngineParams,
  override: ExerciseParamOverride | null | undefined,
  equipment: EquipmentType,
  units: "kg" | "lb",
): EngineParams {
  const step = override?.weightIncrement;
  if (step == null) return params;
  const baseIncrement = params.increment[equipment] ?? { kg: 2.5, lb: 5 };
  const baseRounding = params.rounding[equipment] ?? { kg: 2.5, lb: 5 };
  return {
    ...params,
    // the loadable step every prescription rounds to (the one that matters under
    // the active rep_window params, where load is priced off the strength anchor)
    rounding: {
      ...params.rounding,
      [equipment]: { ...baseRounding, [units]: step },
    },
    // the legacy +step jump (no-anchor fallback / increment mode), kept in sync
    increment: {
      ...params.increment,
      [equipment]: { ...baseIncrement, [units]: step },
    },
  };
}
