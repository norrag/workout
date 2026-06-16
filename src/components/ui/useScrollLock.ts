"use client";

import { useEffect } from "react";

// Module-level reference count so several overlays open at once (e.g. a sheet
// over a menu) don't restore scrolling until the last one closes.
let lockCount = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lock() {
  if (lockCount === 0 && typeof document !== "undefined") {
    const body = document.body;
    // compensate for the disappearing scrollbar so the layout doesn't jump
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = body.style.overflow;
    savedPaddingRight = body.style.paddingRight;
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
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

/**
 * Disables background scrolling on the page body while `active` is true (per
 * the request that menus, feedback trays, and any overlay freeze the window
 * behind them). Safe to use from several overlays at once via a ref count.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
