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

  useEffect(() => {
    if (!target) {
      setEntries(null);
      return;
    }
    getExerciseHistoryAction(target.exercise_id).then(setEntries);
  }, [target]);

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
