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
 * The increment override replaces the per-equipment BASE increment for this
 * exercise's equipment in the user's units — the same value `engine_params.increment`
 * holds, so the engine's `experience_increment_scale` still composes on top exactly
 * as it does for the global default. A null/absent override returns the params
 * unchanged (and, by the fingerprint contract, produces the identical fingerprint a
 * pre-phase-3 row carried — so adding the override surface churns nothing).
 *
 * Note (honest scope): under the active v9 params (`weight_selection: "rep_window"`)
 * the engine prices loads off the strength anchor, not the increment, so this
 * override changes a prescribed NUMBER only on the legacy increment path (the
 * cold-start / no-or-low-confidence-anchor fallback, or a params row set to
 * `increment`). It always changes the dependency fingerprint, so the row always
 * participates in (and re-stamps through) the read-path reconcile.
 */
export function resolveEffectiveParams(
  params: EngineParams,
  override: ExerciseParamOverride | null | undefined,
  equipment: EquipmentType,
  units: "kg" | "lb",
): EngineParams {
  const increment = override?.weightIncrement;
  if (increment == null) return params;
  const base = params.increment[equipment] ?? { kg: 2.5, lb: 5 };
  return {
    ...params,
    increment: {
      ...params.increment,
      [equipment]: { ...base, [units]: increment },
    },
  };
}
