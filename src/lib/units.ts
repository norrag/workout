import type { Units } from "@/lib/types/database";

/**
 * Measurement system (PH28). The user's weight unit doubles as their system:
 * `lb` ⇒ imperial (height shown/entered in feet + inches), `kg` ⇒ metric
 * (height in centimeters). Height is always stored canonically as `height_cm`;
 * these helpers convert at the display/input boundary only.
 */
export function isImperial(units: Units | string | null | undefined): boolean {
  return units === "lb";
}

const CM_PER_IN = 2.54;
const IN_PER_FT = 12;

/** A stored canonical height (cm) rendered in the user's system. Null ⇒ null. */
export function formatHeight(
  heightCm: number | null,
  units: Units | string | null | undefined,
): string | null {
  if (heightCm == null) return null;
  if (!isImperial(units)) return `${heightCm} CM`;
  const totalIn = Math.round(heightCm / CM_PER_IN);
  return `${Math.floor(totalIn / IN_PER_FT)}′${totalIn % IN_PER_FT}″`;
}

/** Split a canonical cm height into whole feet + inches for editing. */
export function cmToFeetInches(heightCm: number): {
  feet: number;
  inches: number;
} {
  const totalIn = Math.round(heightCm / CM_PER_IN);
  return { feet: Math.floor(totalIn / IN_PER_FT), inches: totalIn % IN_PER_FT };
}

/** Build a canonical cm height from feet + inches, rounded to the nearest cm. */
export function feetInchesToCm(feet: number, inches: number): number {
  return Math.round((feet * IN_PER_FT + inches) * CM_PER_IN);
}
