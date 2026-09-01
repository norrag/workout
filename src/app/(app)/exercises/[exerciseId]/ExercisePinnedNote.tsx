"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { PencilGlyph } from "@/components/ui/PencilGlyph";
import { setPinnedNoteAction } from "@/app/(app)/exercises/actions";

/**
 * Pinned (exercise-level) note on the Exercise page (09 §8). Shows the note
 * with an inline pencil; tapping opens a sheet to edit or clear it. The pinned
 * note is the cross-workout, exercise-wide note — session notes live in history.
 */
export function ExercisePinnedNote({
  exerciseId,
  initial,
}: {
  exerciseId: string;
  initial: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(initial ?? "");
  const [, startSaving] = useTransition();
  const body = note.trim();

  const save = () => {
    startSaving(async () => {
      await setPinnedNoteAction({ exercise_id: exerciseId, body: body || null });
    });
    setOpen(false);
  };

  return (
    <>
      {initial ? (
        <div className="mt-4 flex items-start justify-between gap-2 border-l-2 border-ink py-1.5 pl-2.5 text-[11.5px] leading-normal text-ink/75">
          <span>
            <span className="font-bold tracking-[0.08em]">PINNED — </span>
            {initial}
          </span>
          <button
            type="button"
            aria-label="edit pinned note"
            onClick={() => {
              setNote(initial);
              setOpen(true);
            }}
            className="-my-1 shrink-0 px-1.5 py-1 text-ink-muted"
          >
            <PencilGlyph />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setNote("");
            setOpen(true);
          }}
          className="mt-4 text-[10px] font-semibold tracking-[0.12em] text-ink/45"
        >
          + PIN A NOTE
        </button>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={initial ? "Edit pinned note" : "Pin a note"}
        subtitle="SHOWN ON THIS EXERCISE IN EVERY WORKOUT"
      >
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          rows={3}
          autoFocus
          className="min-h-16 w-full border-[1.5px] border-ink bg-paper px-3 py-2.5 text-[13px] leading-normal text-ink placeholder:text-ink/40 focus:outline-none"
          placeholder="e.g. cambered bar, strict form, underhand grip"
        />
        <div className="mt-4 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!body && !initial}
            onClick={save}
            className="bg-ink px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-40"
          >
            {!body && initial ? "CLEAR" : "SAVE"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
