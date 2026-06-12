"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// canon tab bar — docs/08-design-decisions.md §2
const items = [
  { href: "/workout", label: "Workout" },
  { href: "/cycles", label: "Cycles" },
  { href: "/templates", label: "Templates" },
  { href: "/exercises", label: "Exercises" },
  { href: "/more", label: "More" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t-2 border-ink bg-bg-base pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg">
        {items.map(({ href, label }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`label-caps flex min-h-12 items-center justify-center px-1 text-[9px] ${
                  active ? "font-bold text-ink" : "font-medium text-ink/45"
                }`}
              >
                {active && <span aria-hidden>■&nbsp;</span>}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
