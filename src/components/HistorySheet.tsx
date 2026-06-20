"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ExerciseHistoryList } from "@/components/ExerciseHistoryList";
import type { HistoryEntry } from "@/lib/queries/history";
import { getExerciseHistoryAction } from "@/app/(app)/log/actions";

export interface HistorySheetTarget {
  exercise_id: string;
  exercise_name: string;
  equipment_type: string;
}

/** History sheet (fig 3.2) — fetches on open; shared by day view and picker. */
export function HistorySheet({
  target,
  onClose,
}: {
  target: HistorySheetTarget | null;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  // Key the fetch on the exercise id (a primitive), not the `target` object —
  // the day view rebuilds that object on every render, which would otherwise
  // refetch the whole history on each unrelated re-render while the sheet is
  // open. The cancel flag drops a stale response if the target changes mid-flight.
  const exerciseId = target?.exercise_id ?? null;
  useEffect(() => {
    if (!exerciseId) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    setEntries(null);
    getExerciseHistoryAction(exerciseId).then((rows) => {
      if (!cancelled) setEntries(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [exerciseId]);

  if (!target) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="History"
      subtitle={`${target.exercise_name.toUpperCase()} — ${target.equipment_type.toUpperCase()}`}
    >
      {entries === null ? (
        <p className="py-4 text-sm text-ink/45">Loading…</p>
      ) : (
        <ExerciseHistoryList entries={entries} />
      )}
    </BottomSheet>
  );
}
