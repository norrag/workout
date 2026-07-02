/**
 * Pure day-view rules, extracted so they're unit-testable and so every surface
 * reads ONE definition (the CompleteSheet totals once disagreed with the header
 * progress bar over skipped sets — R19).
 */

/** The slice of a logged exercise the set-progress math needs. */
export type SetProgressExercise = {
  status: string;
  prescribed_sets: number | null;
  skipped_set_numbers: number[];
  sets: { set_number: number }[];
};

/** Planned slot count, widened to cover any logged/skipped beyond it. */
export function plannedSetCount(we: SetProgressExercise): number {
  const maxLogged = we.sets.length
    ? Math.max(...we.sets.map((s) => s.set_number))
    : 0;
  const maxSkipped = we.skipped_set_numbers.length
    ? Math.max(...we.skipped_set_numbers)
    : 0;
  return Math.max(we.prescribed_sets ?? 1, maxLogged, maxSkipped);
}

/** Every planned slot resolved (logged or skipped), or the whole exercise skipped. */
export function exerciseDone(we: SetProgressExercise): boolean {
  if (we.status === "skipped") return true;
  const planned = plannedSetCount(we);
  const logged = new Set(we.sets.map((s) => s.set_number));
  const skipped = new Set(we.skipped_set_numbers);
  for (let n = 1; n <= planned; n += 1) {
    if (!logged.has(n) && !skipped.has(n)) return false;
  }
  return true;
}

/**
 * Day set totals (fig 1.1/1.3/1.5): the denominator excludes skipped exercises
 * and skipped set slots, so "n / m" reads the same in the header progress bar
 * and the Workout Complete sheet.
 */
export function daySetTotals(exercises: SetProgressExercise[]): {
  loggedSets: number;
  totalSets: number;
} {
  const loggedSets = exercises.reduce((n, we) => n + we.sets.length, 0);
  const totalSets = exercises
    .filter((we) => we.status !== "skipped")
    .reduce((n, we) => {
      const planned = plannedSetCount(we);
      const skipped = we.skipped_set_numbers.filter((s) => s <= planned).length;
      return n + Math.max(0, planned - skipped);
    }, 0);
  return { loggedSets, totalSets };
}

/**
 * R13: may a set row adopt a server-driven change over its current cell values?
 *
 * - `own-logged-set` — this row's logged set changed (a log/unlog/amend
 *   confirmation echoing back): always adopt; it IS the row's own state.
 * - `planned-input` — a background write changed the row's planned inputs
 *   (an auto-match fan-out or a persisted weight edit landing via
 *   `set_weights`, or a bodyweight edit): adopt only while the row has no
 *   uncommitted typing. Once the user has typed in the row, their explicit
 *   values outrank the fan-out — resyncing here is what silently overwrote
 *   reps mid-entry and let wrong reps get logged.
 */
export function adoptServerRowState(
  change: "own-logged-set" | "planned-input",
  hasUncommittedEdits: boolean,
): boolean {
  if (change === "own-logged-set") return true;
  return !hasUncommittedEdits;
}
