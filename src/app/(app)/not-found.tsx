"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Not-found boundary for the app segment (R19). Without this, every
 * `notFound()` (a deleted workout, meso, or exercise reached by a stale link)
 * dead-ends on Next's unstyled default with no tab bar. Rendering inside the
 * (app) layout keeps the navigation, and the ledger card offers the way back.
 *
 * The Workout tab links to sessionStorage's `lastWorkoutId`; deleting that
 * meso leaves the pointer dangling, so the tab itself could land here on every
 * tap. Landing on a 404 is exactly the signal the pointer is stale — clear it
 * so the tab falls back to `/workout` (the current day).
 */
export default function AppNotFound() {
  useEffect(() => {
    sessionStorage.removeItem("lastWorkoutId");
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-full max-w-sm border-[1.5px] border-ink p-6">
        <div className="text-[10px] font-bold tracking-[0.14em] text-ink/55">
          NOT FOUND
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          This page doesn&apos;t exist anymore — it may have belonged to a
          cycle that was removed.
        </p>
        <Link
          href="/workout"
          className="mt-5 block w-full border-[1.5px] border-ink py-3 text-xs font-bold tracking-[0.12em]"
        >
          GO TO WORKOUT
        </Link>
      </div>
    </div>
  );
}
