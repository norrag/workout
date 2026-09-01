"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { useModalA11y } from "@/components/ui/useModalA11y";

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
  fullHeight = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** small caps line under the title — a node so callers can link part of it
   * (N32: the history sheet links the exercise name to its page) */
  subtitle?: ReactNode;
  /**
   * Rise to (nearly) the whole screen — a pinned header, a scrollable middle
   * (children manage their own `flex-1 min-h-0` region), and a pinned footer.
   * Used for the planner exercise picker (better visibility).
   */
  fullHeight?: boolean;
  children: ReactNode;
}) {
  const { render, shown } = useSheetTransition(open);
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(render);
  // Escape closes, focus moves in on open / back to the opener on close, and
  // Tab stays inside while open (R18)
  useModalA11y(render, panelRef, onClose);
  if (!render) return null;
  // overscroll-contain: the panel's scroll must never chain to the page (N32)
  const panelClass = fullHeight
    ? "absolute inset-x-0 bottom-0 top-[max(1rem,env(safe-area-inset-top))] flex flex-col border-t-2 border-ink bg-bg-base px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6"
    : "absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain border-t-2 border-ink bg-bg-base px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6";
  return (
    <div
      className="fixed inset-0 z-50"
      // N32: sheet gestures are the sheet's own — without this they bubble
      // (through the React tree) into page-level touch handlers like
      // PullToRefresh, which read them as page gestures
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div
        className={`absolute inset-0 bg-ink/45 transition-opacity duration-200 ${shown ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`${panelClass} focus:outline-none transition-transform duration-[280ms] ease-out ${shown ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-[26px] font-extrabold tracking-[-0.02em]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="-mr-3 flex min-h-11 min-w-11 items-center justify-center text-ink-muted"
          >
            ✕
          </button>
        </div>
        {subtitle && (
          <p className="label-caps mt-1 text-[10px] font-semibold tracking-[0.14em] text-ink-muted">
            {subtitle}
          </p>
        )}
        <div className={fullHeight ? "mt-5 flex min-h-0 flex-1 flex-col" : "mt-5"}>
          {children}
        </div>
      </div>
    </div>
  );
}
