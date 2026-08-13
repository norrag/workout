"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { GLOSSARY, type GlossaryEntry, type GlossaryKey } from "@/lib/glossary";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { useModalA11y } from "@/components/ui/useModalA11y";

/**
 * The anchored glossary card, and everything that positions it — extracted from
 * `InfoDot` unchanged when N81's inline term became its second trigger
 * (09-changelog 2026-08-15 session 3 §1).
 *
 * The app's definition grammar has two **term-level** members: a trailing
 * circled `i` beside a label (`InfoDot`, N25) and a dotted-underlined run inside
 * a sentence (`InlineTerm`, N81). They differ only in what the reader taps —
 * same copy from `src/lib/glossary.ts`, same card, same placement, same
 * dismissal. So the card lives here and the triggers are thin, which is what
 * keeps them from drifting into two ways of saying the same thing.
 *
 * Placement: below the trigger, flipping above when it would not fit; clamped to
 * the viewport. Safe inside sheets — the scroll lock refcounts and Escape only
 * closes the top-most overlay.
 */

const WIDTH = 264;

export interface GlossaryCard {
  /** the term's copy, so a trigger can label itself from the same source */
  entry: GlossaryEntry;
  open: boolean;
  toggle: () => void;
  /** put this on the trigger element — the card is positioned against it */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** the scrim + card, or nothing while closed. Render it after the trigger. */
  card: ReactNode;
}

export function useGlossaryCard(term: GlossaryKey): GlossaryCard {
  const entry = GLOSSARY[term];
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useModalA11y(open, cardRef, () => setOpen(false));
  useScrollLock(open);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const trigger = triggerRef.current;
      const card = cardRef.current;
      if (!trigger || !card) return;
      const t = trigger.getBoundingClientRect();
      const h = card.offsetHeight;
      const margin = 8;
      const belowTop = t.bottom + 6;
      const fitsBelow = belowTop + h <= window.innerHeight - margin;
      const top = fitsBelow ? belowTop : Math.max(margin, t.top - 6 - h);
      let left = t.left + t.width / 2 - WIDTH / 2;
      left = Math.min(
        Math.max(margin, left),
        window.innerWidth - WIDTH - margin,
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  return {
    entry,
    open,
    toggle: () => setOpen((v) => !v),
    triggerRef,
    card: open ? (
      <>
        <div
          className="fixed inset-0 z-40 bg-ink/35"
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <div
          ref={cardRef}
          role="dialog"
          aria-label={entry.label}
          tabIndex={-1}
          style={{
            top: pos?.top ?? 0,
            left: pos?.left ?? 0,
            width: WIDTH,
            visibility: pos ? "visible" : "hidden",
          }}
          className="fixed z-50 border-[1.5px] border-ink bg-bg-base px-4 py-3.5 shadow-menu focus:outline-none"
        >
          <div className="label-caps text-[10px] font-bold tracking-[0.14em]">
            {entry.label}
          </div>
          <div className="mt-1.5 text-xs leading-[1.55] text-ink/80">
            {entry.body}
          </div>
        </div>
      </>
    ) : null,
  };
}
