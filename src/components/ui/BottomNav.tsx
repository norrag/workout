"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/today", label: "Today" },
  { href: "/cycles", label: "Cycles" },
  { href: "/insights", label: "Insights" },
  { href: "/exercises", label: "Library" },
  { href: "/settings", label: "Settings" },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-border-subtle bg-bg-surface pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto flex max-w-lg justify-around">
        {items.map(({ href, label }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`label-caps flex min-h-12 min-w-14 flex-col items-center justify-center px-2 text-[11px] font-semibold ${
                  active ? "text-accent" : "text-text-secondary"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
