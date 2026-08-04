import type { MicrocycleRow, WorkoutRow } from "@/lib/types/database";

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
 * N74 — the week boundary. Completing a day of week N generates its week-N+1
 * counterpart immediately, so that day exists (and is deep-linkable from the
 * cycles grid) while week N is still open. A `pending` week is one whose
 * predecessor has not closed: viewable in full, never loggable, because the
 * engine's autoregulation prices week N+1 off the WHOLE of week N — its
 * session feedback and its weekly set volume. The advance job flips the week
 * to `active` the moment its predecessor closes, so this gate opens exactly
 * when the basis becomes complete.
 *
 * Out-of-order training WITHIN a week is deliberately unaffected: progression
 * is day-slot keyed (week N+1 day D advances from week N day D), so the order
 * days are completed in is irrelevant to every engine input.
 */
export function isWeekLocked(status: MicrocycleRow["status"]): boolean {
  return status === "pending";
}

/**
 * N74 — which terminal state an open day is eligible for. A day with logged
 * sets is *completed* (hard rule #5: logged work is never discarded, and
 * skipping it would drop real sets out of every weekly rollup); an untrained
 * day is *skipped*, which is what lets a week close when the user simply
 * didn't train a session. An already-closed day is neither.
 */
export function dayCloseOption(
  status: WorkoutRow["status"],
  hasLoggedSets: boolean,
): "skip" | "end" | null {
  if (!isRemainingWorkout(status)) return null;
  return hasLoggedSets ? "end" : "skip";
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
