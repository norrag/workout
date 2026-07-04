"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { isScrollLocked } from "@/components/ui/useScrollLock";

/**
 * PullToRefresh (N6) — the installed standalone PWA has no native
 * pull-to-refresh, so the app shell provides one. Wrapped once around the
 * `(app)` layout's children: the document is the scroll container and there is
 * no cycles sub-layout, so this single wrapper covers the day view and every
 * /cycles page at once.
 *
 * Gesture: armed only when the pull starts at the very top of the page
 * (`scrollY === 0`); dragging down reveals a square indicator with resistance;
 * releasing past the threshold runs `router.refresh()` inside a transition —
 * the indicator shows the LogCheckbox travelling-gap spinner until the fresh
 * server payload commits. Anywhere mid-page the gesture is inert and no state
 * updates run.
 */

const THRESHOLD = 70; // px of (resisted) pull that arms the refresh
const MAX_PULL = 96;
const RESISTANCE = 2.5;

function RefreshGlyph({ spinning, armed }: { spinning: boolean; armed: boolean }) {
  return (
    <svg viewBox="0 0 21 21" className="h-[18px] w-[18px]" aria-hidden>
      <rect
        x="1.5"
        y="1.5"
        width="18"
        height="18"
        fill={armed && !spinning ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        pathLength={100}
        className={spinning ? "log-checkbox-gap" : undefined}
      />
    </svg>
  );
}

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    // N32: never arm while an overlay holds the body lock — the lock's
    // position:fixed zeroes window.scrollY, so every drag on an open sheet
    // read as "at the top" and pulled the page behind the scrim (and a long
    // enough drag fired router.refresh() mid-interaction).
    startY.current =
      window.scrollY <= 0 && !refreshing && !isScrollLocked()
        ? e.touches[0].clientY
        : null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null) return;
    if (window.scrollY > 0) {
      // the page scrolled instead — this touch is a scroll, not a pull
      startY.current = null;
      setPull(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    setPull(dy > 0 ? Math.min(Math.round(dy / RESISTANCE), MAX_PULL) : 0);
  };

  const onTouchEnd = () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !refreshing) {
      startRefresh(() => router.refresh());
    }
    setPull(0);
  };

  const open = refreshing || pull > 0;
  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div
        aria-hidden={!open}
        style={{ height: refreshing ? 44 : pull }}
        className={`flex items-end justify-center overflow-hidden text-ink/70 ${
          pull > 0 ? "" : "transition-[height] duration-200"
        }`}
      >
        <div className="flex items-center gap-2 pb-2.5">
          <RefreshGlyph spinning={refreshing} armed={pull >= THRESHOLD} />
          <span
            role={refreshing ? "status" : undefined}
            className="text-[9px] font-semibold tracking-[0.14em]"
          >
            {refreshing
              ? "REFRESHING"
              : pull >= THRESHOLD
                ? "RELEASE TO REFRESH"
                : "PULL TO REFRESH"}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}
