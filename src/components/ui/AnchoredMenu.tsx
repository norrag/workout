"use client";

import { useEffect, useRef, useState } from "react";
import { useScrollLock } from "@/components/ui/useScrollLock";
import { focusablesIn, useModalA11y } from "@/components/ui/useModalA11y";

/**
 * Anchored dropdown menu (1.2/1.3 pattern) — scrim + a bordered card placed
 * against its trigger, flipping above when it wouldn't fit below. Extracted
 * from the day view so the meso header (P16) shares one implementation.
 */
export function AnchoredMenu({
  open,
  triggerRef,
  align = "right",
  width = 248,
  label,
  onClose,
  children,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  align?: "left" | "right";
  width?: number;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Escape closes, focus lands on the first row and returns to the trigger on
  // close, Tab stays inside (R18); ↑/↓/Home/End walk the rows per the menu
  // pattern (rows are role="menuitem" via MenuRow)
  useModalA11y(open, cardRef, onClose, { initialFocus: "first" });
  const onMenuKeyDown = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const card = cardRef.current;
    if (!card) return;
    const items = focusablesIn(card).filter(
      (el) => el.getAttribute("role") === "menuitem",
    );
    if (items.length === 0) return;
    e.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? (current + 1 + items.length) % items.length
            : (current - 1 + items.length) % items.length;
    items[next].focus();
  };

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
      const belowTop = t.bottom + 4;
      const fitsBelow = belowTop + h <= window.innerHeight - margin;
      const top = fitsBelow
        ? belowTop
        : Math.max(margin, t.top - 4 - h);
      let left = align === "right" ? t.right - width : t.left;
      left = Math.min(
        Math.max(margin, left),
        window.innerWidth - width - margin,
      );
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, triggerRef, align, width]);

  useScrollLock(open);

  if (!open) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink/35"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={cardRef}
        role="menu"
        aria-label={label}
        onKeyDown={onMenuKeyDown}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          width,
          visibility: pos ? "visible" : "hidden",
        }}
        className="fixed z-50 border-[1.5px] border-ink bg-bg-base shadow-menu"
      >
        {children}
      </div>
    </>
  );
}

export function MenuRow({
  label,
  trailing,
  destructive = false,
  disabled = false,
  onClick,
}: {
  label: string;
  trailing?: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center justify-between border-b border-ink/10 px-4 py-[13px] text-left text-sm last:border-b-0 ${
        destructive
          ? "font-bold text-accent"
          : disabled
            ? "font-semibold text-ink/35"
            : "font-semibold text-ink"
      }`}
    >
      <span>{label}</span>
      {trailing && (
        <span className="text-[10px] font-semibold tracking-[0.1em] text-ink/40">
          {trailing}
        </span>
      )}
    </button>
  );
}
