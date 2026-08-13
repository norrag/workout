"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useModalA11y } from "@/components/ui/useModalA11y";
import { useScrollLock } from "@/components/ui/useScrollLock";

function useDialogTransition(open: boolean, durationMs = 160) {
  const [render, setRender] = useState(open);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (open) {
      setRender(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const id = setTimeout(() => setRender(false), durationMs);
    return () => clearTimeout(id);
  }, [durationMs, open]);

  return { render, shown };
}

/**
 * Centered modal card derived from the anchored-menu treatment: bordered
 * ledger paper, the house offset shadow, and a quiet ink scrim. Unlike a
 * bottom sheet it floats clear of every viewport edge and fades into place.
 */
export function FloatingDialog({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const { render, shown } = useDialogTransition(open);
  const panelRef = useRef<HTMLDivElement>(null);

  useScrollLock(render);
  useModalA11y(render, panelRef, onClose);

  if (!render) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      onTouchStart={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
    >
      <div
        className={`absolute inset-0 bg-ink/35 transition-opacity duration-150 motion-reduce:transition-none ${
          shown ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[calc(100dvh-2rem)] w-full max-w-[440px] flex-col overflow-hidden overscroll-contain border-[1.5px] border-ink bg-bg-base shadow-menu transition-[opacity,transform] duration-150 ease-out focus:outline-none motion-reduce:transition-none ${
          shown
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-1 scale-[0.985] opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
