"use client";

import { useEffect } from "react";

// Module-level reference count so several overlays open at once (e.g. a sheet
// over a menu) don't restore scrolling until the last one closes.
let lockCount = 0;
let savedScrollY = 0;
let savedBodyOverflow = "";
let savedBodyPaddingRight = "";
let savedHtmlOverscroll = "";
let savedBodyOverscroll = "";

// N47: the lock must NEVER set body{position:fixed; top:-Y}. That toggle —
// interleaved with the soft keyboard's visual-viewport resize on an installed
// iOS PWA — left every position:fixed element bound to a stale viewport after
// release: the tab bar rendered mid-screen, its hit targets were offset so
// taps went dead, and only a relaunch re-anchored it. So the lock now hides
// overflow on the body instead (the value propagates to the viewport, and the
// scroll offset is preserved — nothing moves, nothing needs re-anchoring) and
// backstops the two things position:fixed used to provide:
//  - touch scrolling that older WebKit lets leak through overflow:hidden is
//    blocked by a document-level touchmove guard (below);
//  - the keyboard's focus-reveal can still shift an overflow-hidden document
//    programmatically, so unlock restores the locked scroll position (N7).

/** Elements whose native touch behavior (text-selection drags, control
 * internals) must never be preventDefault-ed by the guard. */
const INTERACTIVE =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** The structural slice of Element the touch-move decision walks — kept
 * separate so the logic is unit-testable without a DOM (vitest runs in node). */
export type TouchChainEl = {
  readonly parentElement: TouchChainEl | null;
  matches(selectors: string): boolean;
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly scrollWidth: number;
  readonly clientWidth: number;
};

/**
 * Whether a touchmove that started on `start` may keep its default behavior
 * while the lock is held: yes inside interactive controls and inside any
 * actually-scrollable element below `stopAt` (overlay scroll regions carry
 * `overscroll-contain`, so allowing them cannot chain to the page). Everything
 * else — the scrim, static overlay chrome — is prevented, so the page behind
 * an overlay can never scroll out from under it.
 */
export function touchMoveAllowed<T extends TouchChainEl>(
  start: T | null,
  stopAt: T | null,
  styleOf: (el: T) => { overflowY: string; overflowX: string },
): boolean {
  for (let el = start; el && el !== stopAt; el = el.parentElement as T | null) {
    if (el.matches(INTERACTIVE)) return true;
    const { overflowY, overflowX } = styleOf(el);
    if (
      ((overflowY === "auto" || overflowY === "scroll") &&
        el.scrollHeight > el.clientHeight) ||
      ((overflowX === "auto" || overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth)
    ) {
      return true;
    }
  }
  return false;
}

function onGuardedTouchMove(e: TouchEvent) {
  // momentum-phase moves are non-cancelable; preventDefault would only warn
  if (!e.cancelable) return;
  const target = e.target instanceof Element ? e.target : null;
  if (touchMoveAllowed(target, document.body, (el) => getComputedStyle(el))) {
    return;
  }
  e.preventDefault();
}

function lock() {
  if (lockCount === 0 && typeof document !== "undefined") {
    const body = document.body;
    const html = document.documentElement;
    // compensate for the disappearing scrollbar so the layout doesn't jump
    const scrollbar = window.innerWidth - html.clientWidth;
    savedScrollY = window.scrollY;
    savedBodyOverflow = body.style.overflow;
    savedBodyPaddingRight = body.style.paddingRight;
    savedHtmlOverscroll = html.style.overscrollBehavior;
    savedBodyOverscroll = body.style.overscrollBehavior;
    body.style.overflow = "hidden";
    // no rubber-banding of the now non-scrollable document at either edge
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
    // capture phase + non-passive so the guard sees every touchmove (React's
    // delegated handlers and stopPropagation happen later, at bubble)
    document.addEventListener("touchmove", onGuardedTouchMove, {
      passive: false,
      capture: true,
    });
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && typeof document !== "undefined") {
    const body = document.body;
    const html = document.documentElement;
    document.removeEventListener("touchmove", onGuardedTouchMove, {
      capture: true,
    });
    body.style.overflow = savedBodyOverflow;
    body.style.paddingRight = savedBodyPaddingRight;
    html.style.overscrollBehavior = savedHtmlOverscroll;
    body.style.overscrollBehavior = savedBodyOverscroll;
    // N7: restore the pre-lock position if the keyboard's focus-reveal (or
    // anything else programmatic) shifted the document while it was locked
    if (window.scrollY !== savedScrollY) window.scrollTo(0, savedScrollY);
  }
}

/**
 * N32: whether any overlay currently holds the body lock. Page-level gesture
 * handlers (PullToRefresh) must check this — drags on an open sheet are the
 * sheet's own and must never arm the pull gesture behind it.
 */
export function isScrollLocked(): boolean {
  return lockCount > 0;
}

/**
 * Disables background scrolling on the page body while `active` is true (per
 * the request that menus, feedback trays, and any overlay freeze the window
 * behind them), and restores the exact scroll position on release (N7).
 * Safe to use from several overlays at once via a ref count.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
