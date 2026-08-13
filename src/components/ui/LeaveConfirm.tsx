"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";

/**
 * The app's one discard-confirm (R16; 09-changelog 2026-08-15 session 2 §2).
 *
 * The planner board wrote this sheet first and it stayed the only one, because
 * until Phase 7 it was the only surface that could be navigated out of with
 * staged edits on it. Wave 2 puts a `GuideLink` on nine more such surfaces, so
 * the sheet becomes shared rather than copied — otherwise the app grows a
 * second way of asking the same question and the two drift.
 *
 * Everything is fixed except the sentence that names what is at stake: title,
 * subtitle, the two actions, their order and their weights. `Keep editing`
 * is the quiet one and `DISCARD` wears the accent outline, so the destructive
 * choice is the one you have to mean.
 */
export function LeaveConfirm({
  open,
  body,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  /** the one sentence that changes per surface — what is unsaved, in its own
   *  words ("Your answers haven't been saved…"). */
  body: string;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onKeepEditing}
      title="Discard changes?"
      subtitle="UNSAVED EDITS WILL BE LOST"
    >
      <p className="text-[12.5px] leading-[1.5] text-ink/75">{body}</p>
      <div className="mt-6 flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onKeepEditing}
          className="px-4 py-3 text-[13px] font-semibold text-ink/60"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="border-[1.5px] border-accent px-8 py-3 text-[13px] font-bold tracking-[0.08em] text-accent"
        >
          DISCARD
        </button>
      </div>
    </BottomSheet>
  );
}
