"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Drives a mount + slide-up/down transition for a bottom sheet controlled by
 * an `open` prop. Returns whether to render at all and whether the open
 * (slid-up) styles should be applied. Keeps the node mounted through the exit.
 */
export function useSheetTransition(open: boolean, durationMs = 280) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const t = setTimeout(() => setRender(false), durationMs);
    return () => clearTimeout(t);
  }, [open, durationMs]);
  return { render, shown };
}

/**
 * Bottom sheet (figs 1.4/1.5/2.5/2.7): ink scrim, cream sheet rising from
 * the tab edge behind a 2px ink rule. Square, no rounded grab handle.
 * Slides up on open and down on close (~280ms).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { render, shown } = useSheetTransition(open);
  if (!render) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className={`absolute inset-0 bg-ink/45 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t-2 border-ink bg-bg-base px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6 transition-transform duration-[280ms] ease-out ${shown ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="-mr-3 flex min-h-11 min-w-11 items-center justify-center text-ink/50"
          >
            ✕
          </button>
        </div>
        {subtitle && (
          <p className="label-caps mt-1 text-[10px] font-semibold tracking-[0.14em] text-ink/55">
            {subtitle}
          </p>
        )}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
