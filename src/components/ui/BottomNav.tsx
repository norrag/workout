"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// canon tab bar — docs/08-design-decisions.md §2
const items = [
  { href: "/workout", label: "Workout" },
  { href: "/cycles", label: "Cycles" },
  { href: "/templates", label: "Templates" },
  { href: "/exercises", label: "Exercises" },
  { href: "/more", label: "More" },
] as const;

/**
 * Canon tab bar. The active tab carries the ■ position marker + bold ink; the
 * tap is acknowledged INSTANTLY by optimistically moving the marker to the tapped
 * tab (no pulse/loading animation on the label — that ghosts on mobile and is
 * handled by the destination's own loading skeleton instead). The optimistic
 * marker is cleared once the route actually commits.
 */
export function BottomNav() {
  const pathname = usePathname();
  const [tapped, setTapped] = useState<string | null>(null);

  // once the committed route reaches the tapped tab, drop the optimistic override
  useEffect(() => {
    if (tapped && pathname?.startsWith(tapped)) setTapped(null);
  }, [pathname, tapped]);

  const committed =
    items.find((i) => pathname?.startsWith(i.href))?.href ?? null;
  const activeHref = tapped ?? committed;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-bg-base pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label }) => {
          const active = activeHref === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                prefetch
                onClick={() => setTapped(href)}
                aria-current={active ? "page" : undefined}
                className="block"
              >
                <span
                  className={`label-caps flex min-h-12 items-center justify-center px-1 text-[9px] ${
                    active ? "font-bold text-ink" : "font-medium text-ink/45"
                  }`}
                >
                  {active && <span aria-hidden>■&nbsp;</span>}
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
