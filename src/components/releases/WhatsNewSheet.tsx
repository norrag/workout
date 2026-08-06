"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSetLogQueue } from "@/components/logging/SetLogQueueProvider";
import { ReleaseEntryList, releaseDateLabel } from "./ReleaseEntryList";
import { suppressWhatsNew, type ActiveWorkoutStatus } from "@/lib/version";
import type { Release } from "@/content/releases/types";
import { acknowledgeReleases } from "@/app/(app)/more/actions";

/**
 * What's New (doc 23 §6 / O2; 09-changelog 2026-08-06 §1, fig 4.7).
 *
 * A sheet requiring an explicit dismiss, not a banner: a banner is easy to
 * ignore, which defeats the point, and §6.4 already guarantees the sheet only
 * ever interrupts *between* sessions. It reuses `BottomSheet` — the same scrim,
 * rule and slide the rest of the app uses — and the same `ReleaseEntryList` the
 * version history renders, so an entry reads identically in both places (§8).
 *
 * Everything about *whether* to show is decided elsewhere: the server resolved
 * which releases are pending (T2 — a stale bundle would compare against a stale
 * constant), and `suppressWhatsNew` decides whether this moment is the right
 * one. This component owns only the presentation and the acknowledgment.
 */
export function WhatsNewSheet({
  releases,
  workoutStatus,
}: {
  releases: Release[];
  workoutStatus: ActiveWorkoutStatus | null;
}) {
  const pathname = usePathname() ?? "/";
  const { pending } = useSetLogQueue();
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const suppressed = suppressWhatsNew({
    pathname,
    workoutStatus,
    queuePending: pending > 0,
  });
  const open = !dismissed && !suppressed && releases.length > 0;

  // one release block, once: after acknowledgment the durable copy is
  // More → What's new (§8), so nothing re-opens this within the session
  const acknowledge = () => {
    setDismissed(true);
    startTransition(() => {
      void acknowledgeReleases();
    });
  };

  // tapping a link is an acknowledgment too — the user has engaged with the
  // release, and the sheet must not be waiting for them when they come back
  useEffect(() => {
    if (!open) return;
    const onNavigate = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (target) acknowledge();
    };
    document.addEventListener("click", onNavigate, true);
    return () => document.removeEventListener("click", onNavigate, true);
  }, [open]);

  if (releases.length === 0) return null;

  const newest = releases[releases.length - 1];
  const oldest = releases[0];
  const span =
    releases.length === 1
      ? newest.version
      : `${oldest.version} – ${newest.version}`;

  return (
    <BottomSheet
      open={open}
      onClose={acknowledge}
      title={newest.headline ?? "What's new"}
      subtitle={
        <>
          <span className="numeral">{span}</span> ·{" "}
          {releaseDateLabel(newest.date)}
        </>
      }
    >
      {/* accumulated releases read as one block, newest first (T4) */}
      <ReleaseEntryList
        entries={[...releases].reverse().flatMap((r) => r.entries)}
      />
      <button
        type="button"
        onClick={acknowledge}
        className="mt-6 w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
      >
        GOT IT
      </button>
    </BottomSheet>
  );
}
