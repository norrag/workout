"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// canon tab bar — docs/08-design-decisions.md §2
const items = [
  { href: "/workout", label: "Workout" },
  { href: "/cycles", label: "Cycles" },
  { href: "/templates", label: "Templates" },
  { href: "/exercises", label: "Exercises" },
  { href: "/more", label: "More" },
] as const;

/**
 * Tracks whether *any* tab navigation is in flight. `usePathname()` only updates
 * once a navigation commits, so during a transition the previous tab is still
 * `active` while the tapped tab is `pending` — without this, both render the ■
 * position marker at once (the "double layer label" glitch, PH29). When a nav is
 * pending we suppress the still-active source tab's cue and let the tapped tab
 * own the marker, so exactly one ■ is ever on screen.
 */
const NavPendingContext = createContext<{
  anyPending: boolean;
  report: (href: string, pending: boolean) => void;
}>({ anyPending: false, report: () => {} });

/**
 * Inner label — must live under <Link> so useLinkStatus can report the pending
 * transition for that link. A tapped tab marks itself immediately (the ■ cue +
 * a pulse) so navigation acknowledges the tap before the next route renders.
 */
function NavLabel({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  const { pending } = useLinkStatus();
  const { anyPending, report } = useContext(NavPendingContext);

  useEffect(() => {
    report(href, pending);
  }, [href, pending, report]);

  // While a navigation is in flight, the tapped (pending) tab owns the marker;
  // the previous tab's active cue is held back until the route commits.
  const isCurrent = active && !anyPending;
  const marked = pending || isCurrent;
  return (
    <span
      className={`label-caps flex min-h-12 items-center justify-center px-1 text-[9px] ${
        isCurrent
          ? "font-bold text-ink"
          : pending
            ? "animate-pulse font-medium text-ink"
            : "font-medium text-ink/45"
      }`}
    >
      {marked && <span aria-hidden>■&nbsp;</span>}
      {label}
    </span>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [pendingHrefs, setPendingHrefs] = useState<Record<string, boolean>>({});

  const report = useCallback((href: string, pending: boolean) => {
    setPendingHrefs((prev) => {
      if (Boolean(prev[href]) === pending) return prev;
      return { ...prev, [href]: pending };
    });
  }, []);

  const anyPending = useMemo(
    () => Object.values(pendingHrefs).some(Boolean),
    [pendingHrefs],
  );
  const ctx = useMemo(() => ({ anyPending, report }), [anyPending, report]);

  return (
    <NavPendingContext.Provider value={ctx}>
      <nav className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-bg-base pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto flex max-w-lg">
          {items.map(({ href, label }) => {
            const active = pathname?.startsWith(href) ?? false;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  prefetch
                  aria-current={active ? "page" : undefined}
                  className="block"
                >
                  <NavLabel href={href} active={active} label={label} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </NavPendingContext.Provider>
  );
}
