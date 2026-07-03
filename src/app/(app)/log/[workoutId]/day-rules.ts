/**
 * Pure day-view rules, extracted so they're unit-testable and so every surface
 * reads ONE definition (the CompleteSheet totals once disagreed with the header
 * progress bar over skipped sets — R19).
 */

// zod-free predictor core only — this module rides in the day view's client
// chunk, which must never pull the engine barrel (WS-J bundle split)
import { estimateE1rm, type E1rmConfig } from "@/lib/engine/predict";

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

/** On-target band for the P19 marker: within ±1.5% e1RM shows no marker. */
const MARKER_BAND = 0.015;

/**
 * P19: whether a logged set landed above or below its prescription, compared
 * by e1RM so it accounts for both the reps hit and the RIR left in reserve
 * (more reps OR closer to failure ⇒ above). Loads arrive as EFFECTIVE loads —
 * the caller resolves bodyweight arithmetic (prescription against the current
 * bodyweight, the logged set against the bodyweight captured on that set).
 *
 * Both sides must be estimated at the SAME RIR when the set's RIR wasn't
 * reported (the quick LOG path always logs null): the prescription bakes in
 * the week's target RIR, and letting an unreported RIR default to 0 made an
 * exactly-as-prescribed set read as a big miss — worst on deloads, where the
 * target RIR is the largest in the ramp (N11).
 *
 * Returns null when the set is on-target (within the band) or either side
 * can't be estimated (no prescription, non-working load).
 */
export function loggedSetMarker(args: {
  prescribedEffectiveWeight: number | null;
  prescribedReps: number | null;
  loggedEffectiveWeight: number | null;
  loggedReps: number;
  /** reported reps-in-reserve, or null when the set was quick-logged */
  loggedRir: number | null;
  targetRir: number;
  e1rmCfg: E1rmConfig;
}): "over" | "under" | null {
  const {
    prescribedEffectiveWeight,
    prescribedReps,
    loggedEffectiveWeight,
    loggedReps,
    loggedRir,
    targetRir,
    e1rmCfg,
  } = args;
  const prescriptionE1rm =
    prescribedEffectiveWeight != null &&
    prescribedEffectiveWeight > 0 &&
    prescribedReps != null
      ? (estimateE1rm(prescribedEffectiveWeight, prescribedReps, targetRir, e1rmCfg)
          ?.value ?? null)
      : null;
  const loggedE1rm =
    loggedEffectiveWeight != null && loggedEffectiveWeight > 0
      ? (estimateE1rm(
          loggedEffectiveWeight,
          loggedReps,
          loggedRir ?? targetRir,
          e1rmCfg,
        )?.value ?? null)
      : null;
  if (prescriptionE1rm == null || loggedE1rm == null || prescriptionE1rm <= 0)
    return null;
  if (loggedE1rm > prescriptionE1rm * (1 + MARKER_BAND)) return "over";
  if (loggedE1rm < prescriptionE1rm * (1 - MARKER_BAND)) return "under";
  return null;
}
