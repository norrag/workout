"use client";

import { useState, type ReactNode } from "react";

/**
 * Client-state segmented control (the canon `bg-ink` segmented toggle, 08 §x /
 * figs 3.1/4.x). Replaces in-page `<Link href="?tab=">` toggles whose content was
 * already fully server-fetched: those did a server round-trip on every tap and —
 * because a same-route `?param=` change doesn't trigger the group `loading.tsx`
 * fallback — left the control visually dead until the RSC resolved (perf WS-J,
 * Phase A). Panels are server-rendered and passed in; switching is instant local
 * state, so the tap is acknowledged immediately with no refetch.
 *
 * `initial` seeds the active panel (e.g. from a deep-link `?tab=` the server read),
 * but switching does not write back to the URL — that's the whole point.
 */
export function SegmentedTabs({
  labels,
  panels,
  initial = 0,
  className = "mt-4",
}: {
  labels: string[];
  panels: ReactNode[];
  initial?: number;
  className?: string;
}) {
  const [active, setActive] = useState(
    initial >= 0 && initial < labels.length ? initial : 0,
  );
  return (
    <>
      <div className={`flex border-[1.5px] border-ink ${className}`} role="tablist">
        {labels.map((label, i) => {
          const isActive = active === i;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(i)}
              className={`flex-1 py-2.5 text-center text-[10px] tracking-[0.1em] transition-colors active:bg-ink/10 ${
                isActive
                  ? "bg-ink font-bold text-bg-base"
                  : `font-medium text-ink-muted ${i > 0 ? "border-l border-ink/30" : ""}`
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      {panels[active]}
    </>
  );
}
