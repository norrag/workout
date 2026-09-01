"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// canon tab bar — docs/08-design-decisions.md §2. `match` is the set of path
// prefixes that count as "on this tab" (the Workout tab owns "/" — where the
// middleware serves the day view for signed-in users — plus `/workout` and the
// `/log/[id]` day view). "/" is matched exactly, not as a prefix.
const items = [
  { id: "/workout", label: "Workout", match: ["/", "/workout", "/log"] },
  { id: "/cycles", label: "Cycles", match: ["/cycles"] },
  { id: "/templates", label: "Templates", match: ["/templates"] },
  { id: "/exercises", label: "Exercises", match: ["/exercises"] },
  { id: "/more", label: "More", match: ["/more"] },
] as const;

/**
 * Canon tab bar. The active tab carries the ■ position marker + bold ink; the tap
 * is acknowledged INSTANTLY by optimistically moving the marker to the tapped tab
 * (no pulse/loading animation on the label — that ghosts on mobile and is handled
 * by the destination's own loading skeleton). The optimistic marker clears once the
 * route commits.
 *
 * The Workout tab links to the last active-meso day viewed this session (WS-J), so
 * returning to it lands where you left off rather than resetting to the current day;
 * with the client Router Cache that return is instant and scroll-restored.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [tapped, setTapped] = useState<string | null>(null);
  const [workoutHref, setWorkoutHref] = useState("/workout");

  // resolve the Workout tab's target from the session pointer (DayView stamps it).
  // Re-read after each navigation so it tracks the latest viewed day.
  useEffect(() => {
    const last = sessionStorage.getItem("lastWorkoutId");
    setWorkoutHref(last ? `/log/${last}` : "/workout");
  }, [pathname]);

  const committed =
    items.find((i) =>
      i.match.some((m) =>
        m === "/" ? pathname === "/" : pathname?.startsWith(m),
      ),
    )?.id ?? null;

  // clear the optimistic override once the committed route reaches the tapped tab
  useEffect(() => {
    if (tapped && tapped === committed) setTapped(null);
  }, [tapped, committed]);

  const activeId = tapped ?? committed;

  return (
    // transform-gpu: keep the bar on its own compositor layer so WebKit
    // re-anchors it independently after visual-viewport churn (keyboard
    // open/close in the installed PWA) — N47 hardening alongside the
    // useScrollLock rework that removed the stale-viewport trigger itself
    <nav className="fixed inset-x-0 bottom-0 transform-gpu border-t-2 border-ink bg-bg-base pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const href = item.id === "/workout" ? workoutHref : item.id;
          const active = activeId === item.id;
          return (
            <li key={item.id} className="flex-1">
              <Link
                href={href}
                prefetch
                onClick={() => setTapped(item.id)}
                aria-current={active ? "page" : undefined}
                className="block"
              >
                <span
                  className={`label-caps flex min-h-12 items-center justify-center px-1 text-[9px] ${
                    // an inactive tab is still a destination someone has to be
                    // able to read: `ink/45` put the app's primary navigation
                    // at 2.9:1 on cream, the worst contrast on any screen
                    active ? "font-bold text-ink" : "font-medium text-ink-muted"
                  }`}
                >
                  {active && <span aria-hidden>■&nbsp;</span>}
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
