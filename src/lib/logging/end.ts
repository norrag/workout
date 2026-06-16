import type { WorkoutRow } from "@/lib/types/database";

// ---------------------------------------------------------------------------
// Pure decision helpers for ending a workout / mesocycle early (fig 1.1
// options menu, 09 session-5 §9). The IO that uses these lives in
// `src/lib/queries/logging.ts`; keeping the rules here makes them unit-testable.
// ---------------------------------------------------------------------------

/** A workout still "in play" — eligible to be closed when ending early. */
export function isRemainingWorkout(status: WorkoutRow["status"]): boolean {
  return status === "planned" || status === "in_progress";
}

/**
 * Final status for a remaining workout when its session/mesocycle is ended
 * early: `completed` if anything was logged on it, `skipped` if it was
 * untouched. Logged work is never thrown away; an empty day is just skipped.
 */
export function endWorkoutStatus(
  hasLoggedSets: boolean,
): "completed" | "skipped" {
  return hasLoggedSets ? "completed" : "skipped";
}

/**
 * The planned slot numbers to newly mark skipped when skipping the remainder
 * of an exercise: every 1..planned slot that is neither logged nor already
 * skipped. `prescribedSets` is widened to cover anything logged/skipped past
 * it, so a manually-added set still gets resolved.
 */
export function remainingSetNumbers(
  prescribedSets: number,
  loggedSetNumbers: number[],
  alreadySkipped: number[],
): number[] {
  const logged = new Set(loggedSetNumbers);
  const skipped = new Set(alreadySkipped);
  const maxLogged = loggedSetNumbers.length ? Math.max(...loggedSetNumbers) : 0;
  const maxSkipped = alreadySkipped.length ? Math.max(...alreadySkipped) : 0;
  const planned = Math.max(prescribedSets, maxLogged, maxSkipped);
  const out: number[] = [];
  for (let n = 1; n <= planned; n += 1) {
    if (!logged.has(n) && !skipped.has(n)) out.push(n);
  }
  return out;
}
