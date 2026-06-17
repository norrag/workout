"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

// canon tab bar — docs/08-design-decisions.md §2
const items = [
  { href: "/workout", label: "Workout" },
  { href: "/cycles", label: "Cycles" },
  { href: "/templates", label: "Templates" },
  { href: "/exercises", label: "Exercises" },
  { href: "/more", label: "More" },
] as const;

/**
 * Inner label — must live under <Link> so useLinkStatus can report the pending
 * transition for that link. A tapped tab marks itself immediately (the ■ cue +
 * a pulse) so navigation acknowledges the tap before the next route renders.
 */
function NavLabel({ active, label }: { active: boolean; label: string }) {
  const { pending } = useLinkStatus();
  const marked = active || pending;
  return (
    <span
      className={`label-caps flex min-h-12 items-center justify-center px-1 text-[9px] ${
        active
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
  return (
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
                <NavLabel active={active} label={label} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
