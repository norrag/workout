/**
 * "The set that counts" — the engine's ONE definition of which logged working
 * set represents a session (N89).
 *
 * The load rule prices every advance off this set: `assessPerformance` reduces
 * the previous session's working sets to it, `baseWeight` is its weight, and the
 * load trace's own `hold N lb` / `+N lb` is measured against that. Any layer
 * that tells the lifter what changed "versus last session" has to reduce the
 * session the same way, or it will contradict the trace, the measured anchor,
 * and the history sheet — all three of which are on screen at once.
 *
 * That is exactly what went wrong before this module existed: the quick-read and
 * the coaching facts both used the previous *prescription* as their baseline, so
 * a session the lifter loaded heavier than asked read as "up 10 lb" while the
 * engine's own trace said "hold 40 lb".
 *
 * A leaf on purpose: no imports at all, so the day-view chunk can carry it
 * without dragging the engine's zod schemas into the client bundle.
 */

/** Heaviest working set; ties broken by more reps. Null for an empty list. */
export function bestSet<T extends { weight: number; reps: number }>(
  sets: readonly T[],
): T | null {
  if (sets.length === 0) return null;
  return sets.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a,
  );
}
