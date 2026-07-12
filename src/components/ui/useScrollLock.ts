"use client";

import { useEffect } from "react";

// Module-level reference count so several overlays open at once (e.g. a sheet
// over a menu) don't restore scrolling until the last one closes.
let lockCount = 0;
let savedScrollX = 0;
let savedScrollY = 0;
let savedRootOverflow = "";
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";

let pendingRestoreFrame: number | null = null;
let stopViewportRestore: (() => void) | null = null;

const SCROLLABLE_OVERLAY = "[data-scroll-lock-scrollable]";

function stopPendingRestore() {
  if (pendingRestoreFrame !== null) {
    window.cancelAnimationFrame(pendingRestoreFrame);
    pendingRestoreFrame = null;
  }
  stopViewportRestore?.();
  stopViewportRestore = null;
}

function restoreScrollPosition() {
  window.scrollTo(savedScrollX, savedScrollY);
}

function scheduleScrollRestore() {
  if (pendingRestoreFrame !== null) {
    window.cancelAnimationFrame(pendingRestoreFrame);
  }
  pendingRestoreFrame = window.requestAnimationFrame(() => {
    pendingRestoreFrame = null;
    restoreScrollPosition();
  });
}

function textEntryHasFocus() {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  return (
    active.isContentEditable ||
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    active.tagName === "SELECT"
  );
}

/**
 * iOS changes the visual viewport asynchronously while dismissing its keyboard.
 * If a sheet closes with an input focused, keep reasserting the captured document
 * position only while those resize events are arriving. The quiet/max timers
 * remove the listener promptly so a later user scroll is never pulled backwards.
 */
function restoreThroughKeyboardSettle() {
  const viewport = window.visualViewport;
  const viewportIsShrunk =
    viewport && viewport.height + 1 < document.documentElement.clientHeight;

  restoreScrollPosition();
  scheduleScrollRestore();

  if (!viewport || (!textEntryHasFocus() && !viewportIsShrunk)) return;

  let quietTimer: number | null = null;

  const cleanup = () => {
    viewport.removeEventListener("resize", onResize);
    if (quietTimer !== null) window.clearTimeout(quietTimer);
    window.clearTimeout(maxTimer);
    if (stopViewportRestore === cleanup) stopViewportRestore = null;
  };

  const onResize = () => {
    scheduleScrollRestore();
    if (quietTimer !== null) window.clearTimeout(quietTimer);
    quietTimer = window.setTimeout(cleanup, 160);
  };

  viewport.addEventListener("resize", onResize);
  const maxTimer = window.setTimeout(cleanup, 1200);
  stopViewportRestore = cleanup;
}

function onLockedTouchMove(event: TouchEvent) {
  const target = event.target;
  // The document itself is frozen, but an explicitly marked sheet remains a
  // native scroll region. BottomSheet also uses overscroll containment so a
  // boundary drag cannot chain back into the page.
  if (target instanceof Element && target.closest(SCROLLABLE_OVERLAY)) return;
  event.preventDefault();
}

function lock() {
  if (lockCount === 0 && typeof document !== "undefined") {
    stopPendingRestore();

    const root = document.documentElement;
    const body = document.body;
    // Compensate for the disappearing desktop scrollbar so the layout doesn't
    // jump. On mobile this is zero.
    const scrollbar = window.innerWidth - root.clientWidth;

    savedScrollX = window.scrollX;
    savedScrollY = window.scrollY;
    savedRootOverflow = root.style.overflow;
    savedBodyOverflow = body.style.overflow;
    savedBodyPaddingRight = body.style.paddingRight;

    // N47: never make body position:fixed. In an installed iOS PWA, changing
    // the visual viewport while the keyboard is open can leave descendant fixed
    // elements (the tab bar) bound to that stale, shortened viewport after the
    // body is released. Overflow + a non-passive touch guard freezes the page
    // without changing the fixed-position containing block.
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    document.addEventListener("touchmove", onLockedTouchMove, {
      passive: false,
    });
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && typeof document !== "undefined") {
    const root = document.documentElement;
    const body = document.body;
    root.style.overflow = savedRootOverflow;
    body.style.overflow = savedBodyOverflow;
    body.style.paddingRight = savedBodyPaddingRight;
    document.removeEventListener("touchmove", onLockedTouchMove);
    // N7 + N47: restore the exact pre-lock document coordinate without ever
    // changing body's positioning, and follow the keyboard viewport only until
    // its dismissal animation settles.
    restoreThroughKeyboardSettle();
  }
}

/**
 * Acquires the shared page-scroll lock and returns an idempotent release.
 * Exported so the ref-counting/style-restoration contract can be unit tested
 * independently of React effects.
 */
export function acquireScrollLock(): () => void {
  lock();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unlock();
  };
}

/** Whether any overlay currently holds the page lock. */
export function isScrollLocked(): boolean {
  return lockCount > 0;
}

/**
 * Disables background scrolling while `active` is true and restores the exact
 * pre-overlay document position on release. Safe to share across nested
 * overlays via the module-level reference count.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return acquireScrollLock();
  }, [active]);
}
