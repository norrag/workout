"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FetchRetry } from "@/components/ui/FetchRetry";
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
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setEntries(null);
    setFailed(false);
    if (!target) return;
    // catch + stale-guard so a rejected fetch shows RETRY instead of a
    // permanent "Loading…" (R17; mirrors PrescriptionDetailSheet)
    let active = true;
    getExerciseHistoryAction(target.exercise_id)
      .then((e) => {
        if (active) setEntries(e);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [target, attempt]);

  if (!target) return null;

  return (
    <BottomSheet
      open
      onClose={onClose}
      title="History"
      subtitle={`${target.exercise_name.toUpperCase()} — ${target.equipment_type.toUpperCase()}`}
    >
      {failed ? (
        <FetchRetry onRetry={() => setAttempt((a) => a + 1)} />
      ) : entries === null ? (
        <p className="py-4 text-sm text-ink/45">Loading…</p>
      ) : (
        <ExerciseHistoryList entries={entries} />
      )}
    </BottomSheet>
  );
}
