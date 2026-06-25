/**
 * Imperial unit helpers. The app records and displays weight exclusively in
 * pounds and height in feet + inches; height is stored canonically as
 * `height_in` (whole inches). These helpers format/parse at the display and
 * input boundary only.
 */

const IN_PER_FT = 12;

/** A stored canonical height (inches) rendered as feet′inches″. Null ⇒ null. */
export function formatHeight(heightIn: number | null): string | null {
  if (heightIn == null) return null;
  const totalIn = Math.round(heightIn);
  return `${Math.floor(totalIn / IN_PER_FT)}′${totalIn % IN_PER_FT}″`;
}

/** Split a canonical inches height into whole feet + inches for editing. */
export function inchesToFeetInches(heightIn: number): {
  feet: number;
  inches: number;
} {
  const totalIn = Math.round(heightIn);
  return { feet: Math.floor(totalIn / IN_PER_FT), inches: totalIn % IN_PER_FT };
}

/** Build a canonical inches height from feet + inches. */
export function feetInchesToInches(feet: number, inches: number): number {
  return feet * IN_PER_FT + inches;
}

/**
 * Weights are never shown or entered finer than half a pound. Snapping at the
 * display boundary keeps engine outputs clean (no 19.92 lb); the stored numbers
 * keep finer precision, the UI just shows the step.
 */
export function roundWeight(value: number): number {
  return Math.round(value * 2) / 2;
}

/** A weight snapped to 0.5 and stringified without a trailing ".0" (20, 22.5). */
export function formatWeight(value: number): string {
  const r = roundWeight(value);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * A prescription as one clean line for display/verification, e.g.
 * "110 lb × 8 reps · 3 sets · 2 RIR". A null weight (the T-I5 manual-seed
 * deferral: no confident data, awaiting a user-entered start) reads "Unseeded".
 * Each component is omitted when null, so it degrades gracefully. Pure.
 *
 * `rirIsFloor` renders the RIR as a minimum ("4+ RIR"). A deload decouples the
 * light load from the RIR target (doc 04 §6): the working reps at ≈55% of peak
 * leave *at least* the target in reserve, not exactly it, so "4 RIR" would
 * misrepresent the triple. The floor form keeps weight × reps × RIR honest.
 */
export function formatPrescription(
  weight: number | null,
  reps: number | null,
  sets: number | null,
  targetRir: number | null,
  rirIsFloor = false,
): string {
  if (weight == null && reps == null) return "Unseeded";
  const load = weight == null ? "—" : `${formatWeight(weight)} lb`;
  const parts = [reps == null ? load : `${load} × ${reps} reps`];
  if (sets != null) parts.push(`${sets} ${sets === 1 ? "set" : "sets"}`);
  if (targetRir != null) parts.push(`${targetRir}${rirIsFloor ? "+" : ""} RIR`);
  return parts.join(" · ");
}
