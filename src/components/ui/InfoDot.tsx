"use client";

import { useEffect, useRef, useState } from "react";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { useModalA11y } from "@/components/ui/useModalA11y";

const WIDTH = 264;

/**
 * N25: the app-wide "what does this mean" affordance — the circled-"i"
 * trigger grammar from the feedback-sheet explainers, opening an anchored
 * glossary card (scrim + square bordered card, AnchoredMenu placement:
 * below the trigger, flipping above when it wouldn't fit). Copy comes
 * exclusively from src/lib/glossary.ts so every surface explains a term
 * with the same words. Safe inside sheets — the scroll lock refcounts and
 * Escape only closes the top-most overlay.
 */
export function InfoDot({
  term,
  small = false,
  className = "",
}: {
  term: GlossaryKey;
  /** 14px trigger for dense meta lines (default 17px). */
  small?: boolean;
  className?: string;
}) {
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`What is ${entry.label}?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
      {open && (
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
      )}
    </>
  );
}
