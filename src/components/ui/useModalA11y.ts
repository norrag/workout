"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Focusable descendants, skipping anything display:none'd. */
export function focusablesIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

// Overlays can stack (a sheet over a menu); only the top-most one may claim
// Escape, otherwise one keypress would close the whole stack.
const stack: symbol[] = [];

/**
 * The keyboard/focus contract every modal overlay owes (R18) — sheets and
 * menus alike had none of it, so keyboard and screen-reader users tabbed
 * straight through the scrim into the inert page behind:
 *
 * - move focus into the panel on open (the panel itself, or its first
 *   focusable when `initialFocus: "first"` — menus focus their first item);
 * - keep Tab cycling inside the panel while it's open;
 * - close on Escape (top-most overlay only);
 * - hand focus back to the element that opened it on close.
 *
 * The panel needs `tabIndex={-1}` so it can take focus itself.
 */
export function useModalA11y(
  active: boolean,
  panelRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  opts?: { initialFocus?: "panel" | "first" },
) {
  const initialFocus = opts?.initialFocus ?? "panel";
  // latest close handler without re-arming the effect every render
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const panel = panelRef.current;
    if (!panel) return;

    const id = Symbol("overlay");
    stack.push(id);
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const target =
      initialFocus === "first" ? (focusablesIn(panel)[0] ?? panel) : panel;
    target.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (stack[stack.length - 1] !== id) return;
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = focusablesIn(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const current = document.activeElement;
      if (current instanceof Node && !panel.contains(current)) {
        // focus escaped (or never entered) — pull it back in
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (current === first || current === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      const i = stack.indexOf(id);
      if (i !== -1) stack.splice(i, 1);
      opener?.focus({ preventScroll: true });
    };
  }, [active, panelRef, initialFocus]);
}
