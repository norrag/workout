"use client";

import { type GlossaryKey } from "@/lib/glossary";
import { useGlossaryCard } from "@/components/ui/useGlossaryCard";
import { releaseActive } from "@/lib/version";

/**
 * N25: the app-wide "what does this mean" affordance — the circled-"i"
 * trigger grammar from the feedback-sheet explainers, opening an anchored
 * glossary card. Copy comes exclusively from src/lib/glossary.ts so every
 * surface explains a term with the same words.
 *
 * **Term-level, and it goes beside a LABEL.** Where the term sits inside a
 * sentence instead, the same card is opened by `InlineTerm` (N81); where the
 * question is *why is this number what it is*, that is `GuideLink`, and it
 * navigates (09-changelog 2026-08-15 §1 / session 3 §1). The card itself lives
 * in `useGlossaryCard`, shared with the inline trigger.
 */
export function InfoDot({
  term,
  small = false,
  staged = false,
  className = "",
}: {
  term: GlossaryKey;
  /** 14px trigger for dense meta lines (default 17px). */
  small?: boolean;
  /**
   * doc 23 §9.2 — this dot explains a term that is new in the staged release,
   * so it stays dark until that release lands. Same reasoning as `GuideLink`'s
   * gate: a definition announced by What's New should not have been sitting on
   * the screen for a fortnight, and putting the check in the primitive is what
   * keeps a call site from forgetting it.
   */
  staged?: boolean;
  className?: string;
}) {
  const { entry, open, toggle, triggerRef, card } = useGlossaryCard(term);
  if (staged && !releaseActive("1.1.0")) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        onClick={toggle}
        className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-bold ${
          small
            ? "h-[14px] w-[14px] text-[9px]"
            : "h-[17px] w-[17px] text-[10px]"
        } ${
          open ? "bg-ink text-bg-base" : "border border-ink/50 text-ink/60"
        } ${className}`}
      >
        i
      </button>
      {card}
    </>
  );
}
