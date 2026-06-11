/**
 * Planning-altitude defaults (docs/08-ui-design-corpus.md §4): the meso plan
 * fixes exercises per day; set/rep/weight detail belongs to the week. New
 * slots start at this working-set count and the engine adjusts from feedback.
 */
export const DEFAULT_INITIAL_SETS = 3;

/** The built-in RIR ramp (docs/01-product-spec.md): 3 RIR down to the 0 RIR peak. */
export const RIR_START = 3;
export const RIR_END = 0;
