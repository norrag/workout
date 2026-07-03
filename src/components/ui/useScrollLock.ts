"use client";

import { useEffect } from "react";

// Module-level reference count so several overlays open at once (e.g. a sheet
// over a menu) don't restore scrolling until the last one closes.
let lockCount = 0;
let savedScrollY = 0;
let savedPosition = "";
let savedTop = "";
let savedWidth = "";
let savedOverflow = "";
let savedPaddingRight = "";

function lock() {
  if (lockCount === 0 && typeof document !== "undefined") {
    const body = document.body;
    // compensate for the disappearing scrollbar so the layout doesn't jump
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    savedScrollY = window.scrollY;
    savedPosition = body.style.position;
    savedTop = body.style.top;
    savedWidth = body.style.width;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
    // position:fixed (not just overflow:hidden) pins the scroll offset: on an
    // installed iOS PWA the soft keyboard shifts an overflow-hidden document
    // and nothing puts it back, so dismissing a note sheet landed the page
    // lower than where the user started (N7). The body is offset by the saved
    // scroll so the content doesn't visually jump while locked.
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbar > 0) {
      const current = parseFloat(getComputedStyle(body).paddingRight) || 0;
      body.style.paddingRight = `${current + scrollbar}px`;
    }
  }
  lockCount += 1;
}

function unlock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && typeof document !== "undefined") {
    const body = document.body;
    body.style.position = savedPosition;
    body.style.top = savedTop;
    body.style.width = savedWidth;
    body.style.overflow = savedOverflow;
    body.style.paddingRight = savedPaddingRight;
    // restore the exact pre-lock position (position:fixed zeroed it)
    window.scrollTo(0, savedScrollY);
  }
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
