/**
 * Pure day-view rules, extracted so they're unit-testable and so every surface
 * reads ONE definition (the CompleteSheet totals once disagreed with the header
 * progress bar over skipped sets — R19).
 */

// zod-free leaf modules only — this module rides in the day view's client
// chunk, which must never pull the engine barrel (WS-J bundle split);
// rules/progression.ts is kept zod-free precisely so the marker can share
// the earn gate's comparison without regressing the split
import { estimateE1rm, type E1rmConfig } from "@/lib/engine/predict";
import {
  effectiveLoad,
  isBodyweightLoad,
  type LoadType,
} from "@/lib/engine/load";
import { setComplianceMarker } from "@/lib/engine/rules/progression";

/**
 * The slice of a logged exercise the set-progress math needs.
 *
 * N68: `pending_set_numbers` are sets the write queue is still carrying — the
 * lifter performed and logged them, the server just hasn't echoed them back
 * yet. They count as logged for everything the lifter LOOKS at (which row is
 * active, the progress bar, whether the exercise reads as done), and are
 * simply absent for callers that don't pass them, which is every caller
 * reading server state alone.
 */
export type SetProgressExercise = {
  status: string;
  prescribed_sets: number | null;
  skipped_set_numbers: number[];
  sets: { set_number: number }[];
  pending_set_numbers?: number[];
};

/** Every set number this exercise counts as logged — server rows plus the
 *  queue's outstanding ones, deduped (a queued set whose echo has landed is in
 *  both). */
export function loggedSetNumbers(we: SetProgressExercise): Set<number> {
  return new Set([
    ...we.sets.map((s) => s.set_number),
    ...(we.pending_set_numbers ?? []),
  ]);
}

/** Planned slot count, widened to cover any logged/skipped beyond it. */
export function plannedSetCount(we: SetProgressExercise): number {
  const logged = loggedSetNumbers(we);
  const maxLogged = logged.size ? Math.max(...logged) : 0;
  const maxSkipped = we.skipped_set_numbers.length
    ? Math.max(...we.skipped_set_numbers)
    : 0;
  return Math.max(we.prescribed_sets ?? 1, maxLogged, maxSkipped);
}

/** Every planned slot resolved (logged or skipped), or the whole exercise skipped. */
export function exerciseDone(we: SetProgressExercise): boolean {
  if (we.status === "skipped") return true;
  const planned = plannedSetCount(we);
  const logged = loggedSetNumbers(we);
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
  const loggedSets = exercises.reduce(
    (n, we) => n + loggedSetNumbers(we).size,
    0,
  );
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
 * - `prescription-reset` (N13) — the row's planned-weight override was
 *   CLEARED ("Reset to prescription"): always adopt. The reset is explicit
 *   user intent, and the row it must land on is precisely the one whose edit
 *   made the reset option appear — the typed-in-row guard that protects
 *   against background fan-outs was silently swallowing the reset on set 1
 *   (sets 2+ are prop-derived and always reset).
 */
export function adoptServerRowState(
  change: "own-logged-set" | "planned-input" | "prescription-reset",
  hasUncommittedEdits: boolean,
): boolean {
  if (change === "own-logged-set") return true;
  if (change === "prescription-reset") return true;
  return !hasUncommittedEdits;
}

/**
 * P19 → doc 16 §5.3: whether a logged set landed over / met / under its
 * prescription, compared by e1RM so it accounts for both the reps hit and the
 * RIR left in reserve (more reps OR closer to failure ⇒ over). Loads arrive as
 * EFFECTIVE loads — the caller resolves bodyweight arithmetic (prescription
 * against the current bodyweight, the logged set against the bodyweight
 * captured on that set).
 *
 * Both sides must be estimated at the SAME RIR when the set's RIR wasn't
 * reported (the quick LOG path always logs null): the prescription bakes in
 * the week's target RIR, and letting an unreported RIR default to 0 made an
 * exactly-as-prescribed set read as a big miss — worst on deloads, where the
 * target RIR is the largest in the ramp (N11).
 *
 * A pure delegation to the engine's `setComplianceMarker` — the SAME
 * comparison the earn gate scores each working set with, so the ▲/met/▼
 * markers, the gate, and grading cannot diverge (doc 16 §2.5, made
 * structural). The band is params-fed (`progression.compliance_band`,
 * absorbing the old module-local `MARKER_BAND`; `complianceBand(params)`
 * supplies the ±1.5% default while the block is absent).
 *
 * Returns `met` for in-band — a positive state under the progression model
 * (it is what earning looks like); null stays reserved for not-comparable
 * (no prescription, non-working load).
 */
export function loggedSetMarker(args: {
  prescribedEffectiveWeight: number | null;
  prescribedReps: number | null;
  loggedEffectiveWeight: number | null;
  loggedReps: number;
  /** reported reps-in-reserve, or null when the set was quick-logged */
  loggedRir: number | null;
  targetRir: number;
  /** shared set-level e1RM band — `complianceBand(params)` (doc 16 §5.3) */
  band: number;
  e1rmCfg: E1rmConfig;
}): "over" | "met" | "under" | null {
  return setComplianceMarker(args);
}

/**
 * The e1RM the stored prescription itself implies — `prescribed weight × reps
 * @ the week's target RIR`, priced on effective load for bodyweight movements
 * (N44; the same arithmetic the detail sheet's PRESCRIBED IMPLIES line shows).
 * Null when the row carries no comparable prescription.
 */
export function impliedPrescriptionE1rm(args: {
  prescribedWeight: number | null;
  prescribedReps: number | null;
  targetRir: number;
  loadType: LoadType;
  bodyweight: number | null;
  e1rmCfg: E1rmConfig;
}): number | null {
  if (args.prescribedWeight == null || args.prescribedReps == null) return null;
  const eff = isBodyweightLoad(args.loadType)
    ? effectiveLoad(args.loadType, args.prescribedWeight, args.bodyweight)
    : args.prescribedWeight;
  if (eff == null || eff <= 0) return null;
  return (
    estimateE1rm(eff, args.prescribedReps, args.targetRir, args.e1rmCfg)?.value ??
    null
  );
}

/**
 * N56: the e1RM basis an UNLOGGED set row prices its cells and weight-edit
 * re-derivations against — the GRADED ask, not the live measurement:
 *
 *   1. the recorded target `A*` (a `stepped` decision's prescription-basis
 *      anchor, doc 16 §5.2) — the earned lead;
 *   2. else the stored prescription's own implied e1RM (hold / paced /
 *      not-earned rows) — the number the earn gate and the ▲/met/▼ markers
 *      score every working set against;
 *   3. else the measured anchor — only when the row has no prescription to be
 *      faithful to (a cold slot).
 *
 * Before this rule the fallback for non-stepped rows was the LIVE measured
 * anchor, so another session landing mid-week (the other weekly day-slot)
 * silently re-priced the displayed reps away from the stored prescription —
 * the day view showed an ask that the earn gate would score `under` (the
 * N56 field report: stored 250×9@2, screen 250×8 off the moved anchor).
 * Display, markers, and the gate must read ONE definition of the ask.
 */
export function prescriptionBasisE1rm(args: {
  /** recorded `A*` from the row's latest `stepped` decision, when any */
  prescriptionAnchor: number | null;
  prescribedWeight: number | null;
  prescribedReps: number | null;
  targetRir: number;
  loadType: LoadType;
  bodyweight: number | null;
  /** the live recency-weighted measured anchor (doc 11) — last resort */
  measuredAnchor: number | null;
  e1rmCfg: E1rmConfig;
}): number | null {
  return (
    args.prescriptionAnchor ??
    impliedPrescriptionE1rm(args) ??
    args.measuredAnchor
  );
}
