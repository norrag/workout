/**
 * doc 21 Phase 6 — how an effort assignment READS.
 *
 * One pure module for every word the app says about a per-slot effort
 * assignment: the eyebrow suffix, the qualitative effort band (§9.4), and the
 * disclosure sentences the prescription strip leads its *why* with (§8). The
 * day view, the planned-day page and the sheet all compose from here, so the
 * lever is described identically wherever it surfaces, and the vocabulary is
 * unit-tested instead of scattered across three components.
 *
 * Client-safe: zod-free, type-only imports, no I/O — it rides the day-view
 * chunk beside `prescription-narrative.ts`, and follows that module's copy
 * system (the program is the actor; second person only for what the lifter
 * actually did; no hype, no exclamation marks).
 *
 * Note on voice: an assignment is AUTHORED — by the athlete in the sheet or by
 * the coach over the connector — so these lines say "this exercise is set to
 * …", never "the program decided". That distinction is the whole point of
 * putting them ABOVE the engine's own reasoning (§8): the engine did not choose
 * this effort level, and no layer beneath may claim it did.
 */

/** The stored rep-position forms (`engine`'s `RepPosition`, structurally). */
export type RepPositionValue = "bottom" | "center" | "top" | number;

/**
 * One slot's resolved effort for one week, as the UI receives it. A superset of
 * `ResolvedSlotEffort` (`queries/slot-effort.ts`) with the one fact the read
 * side adds: whether the resolved RIR still counts as a measurement (§6.1).
 * Structural on purpose — this module must not import the query layer.
 */
export interface SlotEffortView {
  /** the RIR the engine priced against: the assignment, or the week's ramp */
  rir: number;
  /** the slot's own assignment; null ⇒ the ramp is in control */
  assignedRir: number | null;
  /** the week's ramp value — always present, so the default can be shown */
  weekRir: number;
  /** the week's deload flag, for the "default beside the field" copy */
  isDeload: boolean;
  /** the assigned working-set cap for this week, when there is one */
  setCap: number | null;
  /** where in the rep window this slot is priced; null ⇒ the schedule decides */
  repPosition: RepPositionValue | null;
  /** A7 — the stored reason, surfaced wherever the assignment reads */
  reason: string | null;
  /** §6.2 — assigned EASIER than the week it sits in */
  backedOff: boolean;
  /** §6.1 — false ⇒ priced normally, but not treated as a measurement */
  measuring: boolean;
}

/** True when the slot carries anything at all worth disclosing. */
export function hasEffortDisclosure(
  effort: SlotEffortView | null | undefined,
): effort is SlotEffortView {
  return (
    effort != null &&
    (effort.assignedRir != null ||
      effort.setCap != null ||
      effort.repPosition != null)
  );
}

/** An assignment that makes the slot HARDER than its week (§4.1). */
export function isPushedHarder(effort: SlotEffortView): boolean {
  return effort.assignedRir != null && effort.assignedRir < effort.weekRir;
}

/** "the top of the rep window" / "9 reps" — the rep position in prose. */
export function repPositionPhrase(position: RepPositionValue): string {
  if (typeof position === "number")
    return `${position} rep${position === 1 ? "" : "s"}`;
  return `the ${position} of the rep window`;
}

/** `TOP OF WINDOW` / `9 REPS` — the same knob as a tracked-caps suffix. */
export function repPositionLabel(position: RepPositionValue): string {
  if (typeof position === "number") return `${position} REPS`;
  return `${position.toUpperCase()} OF WINDOW`;
}

// ---------------------------------------------------------------------------
// the eyebrow suffix (09-changelog 2026-08-04 session 2)
// ---------------------------------------------------------------------------

/**
 * The ` · SUFFIX` parts for the exercise eyebrow, most important first. Capped
 * at two by the caller's join: the eyebrow states that the slot is off its
 * default, the strip explains it. Empty when nothing is assigned.
 */
export function effortEyebrowParts(
  effort: SlotEffortView | null | undefined,
): string[] {
  if (!hasEffortDisclosure(effort)) return [];
  const parts: string[] = [];
  if (effort.backedOff) parts.push("BACKED OFF");
  else if (isPushedHarder(effort)) parts.push("PUSHED HARDER");
  if (effort.setCap != null) parts.push(`CAPPED ${effort.setCap}`);
  if (effort.repPosition != null)
    parts.push(repPositionLabel(effort.repPosition));
  return parts;
}

/** The eyebrow suffix as one string (`" · BACKED OFF · CAPPED 2"`), or "". */
export function effortEyebrowSuffix(
  effort: SlotEffortView | null | undefined,
  max = 2,
): string {
  const parts = effortEyebrowParts(effort).slice(0, max);
  return parts.length === 0 ? "" : ` · ${parts.join(" · ")}`;
}

// ---------------------------------------------------------------------------
// the qualitative band (§9.4)
// ---------------------------------------------------------------------------

/**
 * The effort clause of the ask, in the athlete's own vocabulary.
 *
 * Inside the measuring band this is the exact phrasing the strip has always
 * used. PAST it (`measuring: false`) the number is replaced by the band — doc
 * 21 §9.4, settled by the owner as the qualitative option. A prescription of
 * "@ 21 RIR" is arithmetically fine and humanly strange: printing it in the
 * quick-read asks the athlete to internalize a number the app itself refuses to
 * treat as a measurement. The number is not hidden — the Engine audit sheet
 * still shows the tuple verbatim — it is simply not what the quick-read says.
 */
export function effortAskPhrase(rir: number, measuring = true): string {
  if (!measuring) return "kept well short of failure";
  if (rir <= 0) return "taken right to failure";
  if (rir === 1) return "stopped 1 rep short of failure";
  return `stopped ${rir} reps short of failure`;
}

/** `LIGHT` past the band, `4 RIR` inside it — the planner slot's meta cell. */
export function effortRirLabel(rir: number, measuring = true): string {
  return measuring ? `${rir} RIR` : "LIGHT";
}

// ---------------------------------------------------------------------------
// the disclosure sentences (§8 — the why leads with these)
// ---------------------------------------------------------------------------

/** "4 reps short of failure" / "failure" — an RIR as the strip says it. */
function rirTarget(rir: number): string {
  if (rir <= 0) return "failure";
  return `${rir} rep${rir === 1 ? "" : "s"} short of failure`;
}

/**
 * The assignment sentence — the FIRST thing the why says when a slot carries an
 * RIR assignment, above every engine-authored line (§8). It names the week's own
 * value too, so the athlete can see what was changed and by how much: an
 * assignment that silently replaces the ramp is exactly the "silent semantics"
 * §4.1 forbids.
 *
 * Past the measuring band it states the band instead of the number, matching the
 * ask (§9.4) — the two lines must never disagree about what is being asked.
 */
export function composeAssignmentLine(
  effort: SlotEffortView,
): string | null {
  const assigned = effort.assignedRir;
  if (assigned == null) return null;
  const weekPart = effort.isDeload
    ? `the deload week's ${rirTarget(effort.weekRir)}`
    : `the week's ${rirTarget(effort.weekRir)}`;
  if (!effort.measuring) {
    return `This exercise is set to run well short of failure this week — deliberately lighter than ${weekPart}.`;
  }
  if (effort.backedOff) {
    return `This exercise is set to ${rirTarget(assigned)} this week, easier than ${weekPart}.`;
  }
  if (isPushedHarder(effort)) {
    return `This exercise is set to ${rirTarget(assigned)} this week, harder than ${weekPart}.`;
  }
  // assigned == week: authored, and identical to the ramp this week
  return `This exercise is set to ${rirTarget(assigned)} this week, which is what ${weekPart} already asks.`;
}

/** A7 — the stored reason, on its own line beneath the assignment. */
export function composeReasonLine(effort: SlotEffortView): string | null {
  const reason = effort.reason?.trim();
  if (!reason) return null;
  const punctuated = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  return `Noted: ${punctuated}`;
}

/**
 * The measuring-band note (§6.1) — why this session will not move the strength
 * numbers. Only when the resolved RIR is past the band; the honest half ("the
 * work still counts") is stated in the same breath, because an exclusion the
 * athlete cannot account for reads as lost data.
 */
export function composeBandLine(effort: SlotEffortView): string | null {
  if (effort.measuring) return null;
  return "Well short of failure by design — this one is priced light, so it is not read as a strength measurement. The sets still count toward volume.";
}

/**
 * The §6.2 comparability note for a backed-off slot that IS still a measurement:
 * the set anchors the program and is genuinely measured, it is simply not
 * comparable with the block around it. (Past the band `composeBandLine` says the
 * stronger thing instead, so the two never both render.)
 */
export function composeComparabilityLine(
  effort: SlotEffortView,
): string | null {
  if (!effort.backedOff || !effort.measuring) return null;
  return "Deliberately easier work is left out of the strength trend for this exercise. The sets still count toward volume.";
}

/** The working-set cap, when one is assigned (A4). */
export function composeSetCapLine(effort: SlotEffortView): string | null {
  if (effort.setCap == null) return null;
  const noun = effort.setCap === 1 ? "1 set" : `${effort.setCap} sets`;
  return `Working sets are capped at ${noun} here — the program can go lower, never higher.`;
}

/** The rep position, when one is assigned (§4.2). */
export function composeRepPositionLine(
  effort: SlotEffortView,
): string | null {
  if (effort.repPosition == null) return null;
  return `Priced at ${repPositionPhrase(effort.repPosition)} rather than wherever the block's rep schedule had reached.`;
}

/** How many effort lines may precede the engine's own why. */
const EFFORT_LINE_BUDGET = 3;

/**
 * The effort disclosure block, in the order the strip renders it: what was
 * assigned, why it was assigned, then at most one consequence line. Ordering is
 * the emphasis — doc 21 §8 requires the authored effort level to be read BEFORE
 * the engine's reasoning, so that no line beneath it (deterministic or
 * coaching) can be mistaken for the program having chosen this effort itself.
 *
 * Empty when the slot is unassigned, which is every slot until someone assigns
 * one — so the strip is byte-identical to Phase 5 for an unassigned plan.
 */
export function composeEffortLines(
  effort: SlotEffortView | null | undefined,
): string[] {
  if (!hasEffortDisclosure(effort)) return [];
  const lines: string[] = [];
  const assignment = composeAssignmentLine(effort);
  if (assignment) lines.push(assignment);
  const reason = composeReasonLine(effort);
  if (reason) lines.push(reason);

  // one consequence, most consequential first: not-a-measurement beats
  // not-comparable beats the two shape levers.
  const consequence =
    composeBandLine(effort) ??
    composeComparabilityLine(effort) ??
    composeSetCapLine(effort) ??
    composeRepPositionLine(effort);
  if (consequence) lines.push(consequence);

  return lines.slice(0, EFFORT_LINE_BUDGET);
}
