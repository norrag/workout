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
