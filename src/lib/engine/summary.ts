/**
 * Autoregulation summary composer — the fig 1.5 copy ("Feedback recorded.
 * W3 targets recalculated — Hack Squat +5 lb, Cable Pushdown +1 set. Ramp
 * holds at 1 RIR next week."). Pure string composition over decisions the
 * generation job already made; no exclamation marks (design voice).
 */

export interface SummaryDelta {
  exerciseName: string;
  previousWeight: number | null;
  previousSets: number;
  nextWeight: number | null;
  nextSets: number;
  // reps move on the rep-window path (load held, reps climb the range — doc 13
  // §9.4); surfaced when the weight is unchanged so it doesn't read as a no-op.
  previousReps?: number | null;
  nextReps?: number | null;
}

export interface SummaryContext {
  /** the week that was generated (N+1) */
  nextWeekNumber: number;
  nextTargetRir: number;
  nextIsDeload: boolean;
  /** the completed week's target RIR, for the ramp line */
  currentTargetRir: number;
  units: "kg" | "lb";
  deltas: SummaryDelta[];
}

const MAX_CLAUSES = 3;

export function composeAutoregulationSummary(ctx: SummaryContext): string {
  if (ctx.nextIsDeload) {
    return (
      `Feedback recorded. W${ctx.nextWeekNumber} is the deload — ` +
      `loads pulled back from peak at ${ctx.nextTargetRir}+ RIR. Recover.`
    );
  }

  const clauses: string[] = [];
  for (const d of ctx.deltas) {
    const weightDelta =
      d.previousWeight != null && d.nextWeight != null
        ? round2(d.nextWeight - d.previousWeight)
        : 0;
    const setDelta = d.nextSets - d.previousSets;
    const repDelta =
      d.previousReps != null && d.nextReps != null
        ? d.nextReps - d.previousReps
        : 0;
    if (weightDelta !== 0) {
      clauses.push(
        `${d.exerciseName} ${signed(weightDelta)} ${ctx.units}`,
      );
    } else if (repDelta !== 0) {
      // load held, reps walk the window (Option-A week)
      clauses.push(`${d.exerciseName} reps ${d.previousReps} to ${d.nextReps}`);
    } else if (setDelta !== 0) {
      clauses.push(
        `${d.exerciseName} ${signed(setDelta)} ${Math.abs(setDelta) === 1 ? "set" : "sets"}`,
      );
    }
  }

  const shown = clauses.slice(0, MAX_CLAUSES);
  const overflow = clauses.length - shown.length;
  const changes =
    clauses.length === 0
      ? "all targets hold"
      : shown.join(", ") + (overflow > 0 ? ` and ${overflow} more` : "");

  const ramp =
    ctx.nextTargetRir === ctx.currentTargetRir
      ? `Ramp holds at ${ctx.nextTargetRir} RIR next week.`
      : `Ramp moves to ${ctx.nextTargetRir} RIR next week.`;

  return `Feedback recorded. W${ctx.nextWeekNumber} targets recalculated — ${changes}. ${ramp}`;
}

/** The end-of-meso variant: there is no next week to recalculate. */
export function composeMesoCompleteSummary(mesoName: string): string {
  return `Feedback recorded. That closes ${mesoName} — plan the next meso from Cycles.`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
