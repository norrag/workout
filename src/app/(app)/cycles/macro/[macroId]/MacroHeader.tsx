"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnchoredMenu, MenuRow } from "@/components/ui/AnchoredMenu";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useToast } from "@/components/ui/Toast";
import { endMacrocycleAction } from "../../actions";

/**
 * N24 — the macrocycle page header, styled after the meso header (P16
 * grammar): sticky brand row, title + status badge, and a ⋮ menu on the
 * shared AnchoredMenu. Completes the header unification — day view, meso,
 * exercise, and macro now share one idiom. Editing (goal, duration, notes,
 * blocks) lives behind ⋮ → Edit macrocycle (the existing /edit route),
 * replacing the full-width EDIT MACROCYCLE link that sat at the bottom of
 * the OVERVIEW tab. No share button — macrocycles aren't shareable.
 *
 * doc 17 §4.1 (N40): ⋮ also carries "End macrocycle" while the macro is
 * active — the meso closeout family one level up, same confirm-dialog weight
 * as ending a meso (09-changelog 2026-07-11).
 */
export function MacroHeader({
  macroId,
  name,
  goalNotes,
  metaLine,
  status,
}: {
  macroId: string;
  name: string;
  /** owner's free-text goal line, shown under the meta row when present */
  goalNotes: string | null;
  metaLine: string;
  status: "active" | "completed" | "archived";
}) {
  const router = useRouter();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [ending, startEnding] = useTransition();
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const iconBtn =
    "flex h-7 w-7 items-center justify-center border border-ink/35";

  // a failed end keeps the confirm sheet open for retry instead of throwing
  // to the error boundary (the R17 pattern)
  const endMacro = () =>
    startEnding(async () => {
      try {
        const res = await endMacrocycleAction({ macro_id: macroId });
        if (res.error) {
          toast(res.error);
          return;
        }
        setConfirmEnd(false);
        router.refresh();
      } catch {
        toast("Couldn't end the macrocycle — check your connection");
      }
    });

  return (
    <div className="sticky top-0 z-20 -mx-4 bg-bg-base px-4 pb-3 pt-2 shadow-[0_8px_16px_-12px_rgba(23,20,15,0.55)]">
      {/* brand row — back link + context (day-view header grammar) */}
      <div className="flex items-center justify-between">
        <Link
          href="/cycles"
          className="text-[10px] font-medium tracking-[0.12em] text-ink-muted"
        >
          ‹ CYCLES
        </Link>
        <div className="label-caps text-[10px] font-medium tracking-[0.1em] text-ink-muted">
          MACROCYCLE
        </div>
      </div>

      {/* title + header actions */}
      <div className="mt-2 flex items-end justify-between gap-3">
        <h1 className="min-w-0 truncate text-[27px] font-extrabold leading-none tracking-[-0.02em]">
          {name}
        </h1>
        <button
          type="button"
          ref={menuBtnRef}
          aria-label="macrocycle options"
          onClick={() => setMenuOpen(true)}
          className={`${iconBtn} shrink-0 text-[15px] leading-none ${menuOpen ? "border-ink bg-ink text-bg-base" : ""}`}
        >
          ⋮
        </button>
      </div>

      {/* meta + status */}
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[10.5px] font-medium tracking-[0.1em] text-ink-muted">
          {metaLine}
        </div>
        {status === "active" ? (
          <div className="shrink-0 border-[1.5px] border-accent px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-accent">
            ACTIVE
          </div>
        ) : (
          <div className="shrink-0 border border-ink/35 px-2 py-1 text-[9px] font-bold tracking-[0.12em] text-ink-muted">
            {status === "completed" ? "COMPLETE" : "ARCHIVED"}
          </div>
        )}
      </div>
      {goalNotes && (
        <div className="mt-1.5 text-[13px] font-semibold text-ink-muted">
          {goalNotes}
        </div>
      )}

      <AnchoredMenu
        open={menuOpen}
        triggerRef={menuBtnRef}
        label="macrocycle options"
        onClose={() => setMenuOpen(false)}
      >
        <div className="border-b border-ink/15 px-4 pb-1.5 pt-2.5 text-[9px] font-bold tracking-[0.14em] text-ink/45">
          MACROCYCLE
        </div>
        {/* goal, duration, notes, and the meso blocks all edit on one page */}
        <MenuRow
          label="Edit macrocycle"
          onClick={() => {
            setMenuOpen(false);
            router.push(`/cycles/macro/${macroId}/edit`);
          }}
        />
        {status === "active" && (
          <MenuRow
            label="End macrocycle"
            destructive
            onClick={() => {
              setMenuOpen(false);
              setConfirmEnd(true);
            }}
          />
        )}
      </AnchoredMenu>

      <BottomSheet
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        title="End macrocycle"
        subtitle="END OPEN BLOCKS · COMPLETE"
      >
        <p className="text-[13px] leading-relaxed text-ink">
          This ends every remaining block: anything with logged work is
          completed (open sets skipped), blocks never started are abandoned.
          Logged history is kept. This can&apos;t be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={() => setConfirmEnd(false)}
            className="px-4 py-3 text-[13px] font-semibold text-ink/60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={endMacro}
            disabled={ending}
            className="bg-accent px-8 py-3.5 text-[13px] font-bold tracking-[0.08em] text-bg-base disabled:opacity-50"
          >
            {ending ? "ENDING…" : "END MACROCYCLE"}
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
