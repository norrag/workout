/**
 * Load-type model (WS-I / T-I2, owner ruling 2026-06-25) — pure.
 *
 * An exercise's *load type* says how the engine turns the number the user enters
 * into the **effective load** the strength math (e1RM, anchor, rep-window) reasons
 * about. Bodyweight movements have a load even when the user enters nothing (their
 * bodyweight), so collapsing them to `weight = 0` made them un-anchorable and
 * forced the legacy increment path (the only remaining reason that path survives —
 * see `docs/notes/I-engine-v9.md`).
 *
 *   external             effective = entered                 (today's behaviour)
 *   bodyweight_only      effective = bodyweight              (entered ignored; load is fixed)
 *   bodyweight_loadable  effective = bodyweight + entered    (entered = added external weight)
 *   bodyweight_assisted  effective = bodyweight − entered    (entered = assistance removed)
 *
 * `entered` is whatever the user logs / the engine prescribes as the set's weight:
 * the external load, the *added* weight, or the *assistance* amount. For
 * `bodyweight_only` there is nothing to enter — the displayed load is the
 * bodyweight itself (a read-only prefill). The bodyweight component is excluded
 * from the freshness fingerprint (it is a drifting, derived input — doc 14 §3);
 * it is captured on the logged set at log time for historical e1RM honesty (#4).
 */

export const loadTypes = [
  "external",
  "bodyweight_only",
  "bodyweight_loadable",
  "bodyweight_assisted",
] as const;

export type LoadType = (typeof loadTypes)[number];

/** Bodyweight types whose effective load folds in the lifter's bodyweight. */
export function isBodyweightLoad(loadType: LoadType): boolean {
  return loadType !== "external";
}

/**
 * Map a stored `exercises.equipment_type` to its load type. The first-class
 * `exercises.load_type` column is the source of truth (backfilled by migration);
 * this is the backfill rule + a fallback for rows/inputs lacking the column.
 *  - "bodyweight only"     → bodyweight_only
 *  - "bodyweight loadable" → bodyweight_loadable
 *  - "machine assistance"  → bodyweight_assisted (counterweight reduces effective BW)
 *  - everything else       → external
 */
export function toEngineLoadType(equipmentRaw: string): LoadType {
  switch (equipmentRaw) {
    case "bodyweight only":
      return "bodyweight_only";
    case "bodyweight loadable":
      return "bodyweight_loadable";
    case "machine assistance":
      return "bodyweight_assisted";
    default:
      return "external";
  }
}

/**
 * Resolve an exercise's load type from the stored `exercises.load_type` column,
 * falling back to deriving it from `equipment_type` when the column is null/unknown
 * (rows not yet backfilled). The column is the source of truth.
 */
export function coerceLoadType(
  storedLoadType: string | null | undefined,
  equipmentRaw: string,
): LoadType {
  if (
    storedLoadType != null &&
    (loadTypes as readonly string[]).includes(storedLoadType)
  ) {
    return storedLoadType as LoadType;
  }
  return toEngineLoadType(equipmentRaw);
}

/**
 * The effective load the strength math uses, from the entered weight + the
 * lifter's bodyweight. Returns null when a bodyweight type has no known
 * bodyweight (nothing to anchor on — the caller defers to a manual seed).
 * Effective load is floored at 0 (assistance never makes the effective load
 * negative — at full assistance the movement is unloaded).
 */
export function effectiveLoad(
  loadType: LoadType,
  entered: number,
  bodyweight: number | null,
): number | null {
  switch (loadType) {
    case "external":
      return entered;
    case "bodyweight_only":
      return bodyweight;
    case "bodyweight_loadable":
      return bodyweight == null ? null : bodyweight + entered;
    case "bodyweight_assisted":
      return bodyweight == null ? null : Math.max(0, bodyweight - entered);
  }
}

/**
 * The inverse: the value the user enters / the engine prescribes as the set's
 * weight, given a target effective load + the lifter's bodyweight. Added weight
 * (loadable) and assistance (assisted) are floored at 0 — you cannot prescribe
 * negative plates or negative assistance. For `bodyweight_only` the displayed
 * load is the bodyweight itself (there is nothing to enter); returns null when a
 * bodyweight type has no known bodyweight.
 */
export function enteredForEffective(
  loadType: LoadType,
  effective: number,
  bodyweight: number | null,
): number | null {
  switch (loadType) {
    case "external":
      return effective;
    case "bodyweight_only":
      return bodyweight;
    case "bodyweight_loadable":
      return bodyweight == null ? null : Math.max(0, effective - bodyweight);
    case "bodyweight_assisted":
      return bodyweight == null ? null : Math.max(0, bodyweight - effective);
  }
}
