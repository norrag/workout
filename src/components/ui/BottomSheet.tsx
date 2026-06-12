"use client";

import type { ReactNode } from "react";

/**
 * Bottom sheet (figs 1.4/1.5/2.5/2.7): ink scrim, cream sheet rising from
 * the tab edge behind a 2px ink rule. Square, no rounded grab handle.
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/45"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto border-t-2 border-ink bg-bg-base px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-6"
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-extrabold tracking-[-0.02em]">
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
