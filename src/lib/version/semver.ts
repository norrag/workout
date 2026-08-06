// doc 23 §4.1 — MAJOR.FEATURE.FIX. The shape is semver's; the meaning is
// audience-defined (there is no public API), so the digits are named for who
// they concern rather than for compatibility. Pure, no dependency (§1.2).

export interface ParsedVersion {
  /** the product model itself changed */
  major: number;
  /** anything a user would notice */
  feature: number;
  /** nothing a user would notice */
  fix: number;
}

const PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parse, or `null` when the string is not a version. */
export function tryParse(version: string): ParsedVersion | null {
  const m = PATTERN.exec(version);
  if (!m) return null;
  return { major: Number(m[1]), feature: Number(m[2]), fix: Number(m[3]) };
}

/** Parse, throwing with the offending string named. */
export function parse(version: string): ParsedVersion {
  const parsed = tryParse(version);
  if (!parsed) throw new Error(`not a version: "${version}"`);
  return parsed;
}

export function format(v: ParsedVersion): string {
  return `${v.major}.${v.feature}.${v.fix}`;
}

/**
 * -1 / 0 / 1, comparing numerically per digit — so `1.10.0` is above `1.9.0`,
 * which a string comparison would get backwards.
 */
export function compare(a: string, b: string): -1 | 0 | 1 {
  const x = parse(a);
  const y = parse(b);
  for (const key of ["major", "feature", "fix"] as const) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1;
  }
  return 0;
}

export type VersionStep =
  | "major"
  | "feature"
  | "fix"
  | "same"
  | "backwards"
  /** advanced a digit without resetting the ones to its right (§4.1) */
  | "malformed";

/**
 * Which digit `next` advances relative to `prev`, or how it fails to. Used by
 * the §5.3 registry invariants: a `fix` release may only advance the third
 * digit, a `feature` only the second (zeroing the third), a `major` only the
 * first (zeroing both).
 */
export function step(prev: string, next: string): VersionStep {
  const a = parse(prev);
  const b = parse(next);
  if (compare(next, prev) < 0) return "backwards";
  if (compare(next, prev) === 0) return "same";
  if (b.major > a.major)
    return b.feature === 0 && b.fix === 0 ? "major" : "malformed";
  if (b.feature > a.feature) return b.fix === 0 ? "feature" : "malformed";
  return "fix";
}
