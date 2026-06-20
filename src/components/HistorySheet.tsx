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

  // `target` is a fresh object literal from the parent on every render, so key
  // the fetch off the stable exercise id — not the object identity — to avoid a
  // refetch on every parent re-render. Guard against stale/late responses (fast
  // exercise switches) and a thrown action leaving the sheet stuck on "Loading…".
  const targetId = target?.exercise_id ?? null;
  useEffect(() => {
    if (!targetId) {
      setEntries(null);
      return;
    }
    let ignore = false;
    setEntries(null);
    getExerciseHistoryAction(targetId)
      .then((d) => {
        if (!ignore) setEntries(d);
      })
      .catch(() => {
        if (!ignore) setEntries([]);
      });
    return () => {
      ignore = true;
    };
  }, [targetId]);

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
        <ExerciseHistoryList key={target.exercise_id} entries={entries} />
      )}
    </BottomSheet>
  );
}
