/**
 * Pure joint-pain attribution (fig 1.4 revision, 2026-07-21).
 *
 * Joint pain is collected once a muscle group closes, but it is stored per
 * exercise so the engine's pain gate (doc 10 §3 step 0) lands on the exercise
 * that actually hurt — not merely whichever one happened to close the group.
 * The feedback card lets the lifter pin the pain to the performed exercise(s)
 * that caused it (multi-select, optional); an empty selection with real pain
 * reported defaults to attributing it to every performed exercise in the group.
 *
 * This resolves the write plan: the level for the group-closing exercise's own
 * row plus the level (or a clear) for each other performed exercise. Extracted
 * so it is unit-testable without a database and shares ONE definition with the
 * server action.
 */
export function resolveJointPainAttribution(input: {
  /** the group-closing exercise this feedback row anchors on */
  closerId: string;
  /** reported pain LEVEL 0–3, or null when the group section wasn't shown */
  jointPain: number | null;
  /** performed exercises the lifter pinned the pain to; empty → default to all */
  painExerciseIds: string[] | null;
  /** every performed exercise in the group (candidates for attribution) */
  groupExerciseIds: string[] | null;
}): {
  /** joint pain for the closer's own row */
  closerPain: number | null;
  /** joint pain (level, or null to clear) for each other performed exercise */
  others: { id: string; jointPain: number | null }[];
} {
  const { closerId, jointPain } = input;
  // the closer is always a candidate; dedupe against the passed group ids
  const performed = new Set<string>([
    closerId,
    ...(input.groupExerciseIds ?? []),
  ]);
  const painReported = jointPain != null && jointPain > 0;
  const selection = input.painExerciseIds ?? [];
  // real pain with no explicit choice → attribute to every performed exercise
  const attributed = new Set<string>(
    painReported ? (selection.length > 0 ? selection : [...performed]) : [],
  );

  const closerPain =
    jointPain == null
      ? null
      : !painReported
        ? jointPain // None (0) records as "no pain reported" on the closer
        : attributed.has(closerId)
          ? jointPain
          : null; // reported but attributed away → clear the closer

  const others: { id: string; jointPain: number | null }[] = [];
  for (const id of performed) {
    if (id === closerId) continue;
    others.push({
      id,
      jointPain: painReported && attributed.has(id) ? jointPain : null,
    });
  }
  return { closerPain, others };
}
