"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FetchRetry } from "@/components/ui/FetchRetry";
import { ExerciseHistoryList } from "@/components/ExerciseHistoryList";
import type { HistoryPage } from "@/lib/queries/history";
import { getExerciseHistoryAction } from "@/app/(app)/log/actions";

export interface HistorySheetTarget {
  exercise_id: string;
  exercise_name: string;
  /** subtitle context — omitted by scoped callers that pass scope_label */
  equipment_type?: string;
  /** N15: restrict history to these mesocycles (the Performance drill-down) */
  meso_ids?: string[];
  /** N15: subtitle context naming the scope, e.g. "THIS MACROCYCLE" */
  scope_label?: string;
  /** N15: open on the e1RM view (inverts the PH32 sets/reps default) */
  e1rm_first?: boolean;
}

/** History sheet (fig 3.2) — fetches on open; shared by day view, picker,
 * and the Performance drill-down (N15: meso-scoped, e1RM-first). */
export function HistorySheet({
  target,
  onClose,
}: {
  target: HistorySheetTarget | null;
  onClose: () => void;
}) {
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setPage(null);
    setFailed(false);
    if (!target) return;
    // catch + stale-guard so a rejected fetch shows RETRY instead of a
    // permanent "Loading…" (R17; mirrors PrescriptionDetailSheet)
    let active = true;
    getExerciseHistoryAction(target.exercise_id, undefined, target.meso_ids)
      .then((p) => {
        if (active) setPage(p);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [target, attempt]);

  if (!target) return null;

  const context = target.scope_label ?? target.equipment_type ?? "";

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="History"
      subtitle={`${target.exercise_name.toUpperCase()}${context ? ` — ${context.toUpperCase()}` : ""}`}
    >
      {failed ? (
        <FetchRetry onRetry={() => setAttempt((a) => a + 1)} />
      ) : page === null ? (
        <p className="py-4 text-sm text-ink/45">Loading…</p>
      ) : (
        <ExerciseHistoryList
          key={target.exercise_id}
          entries={page.entries}
          exerciseId={target.exercise_id}
          nextCursor={page.nextCursor}
          mesoIds={target.meso_ids}
          initialFlipped={target.e1rm_first}
        />
      )}
    </BottomSheet>
  );
}
