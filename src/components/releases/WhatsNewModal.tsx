"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { FloatingDialog } from "@/components/ui/FloatingDialog";
import { useSetLogQueue } from "@/components/logging/SetLogQueueProvider";
import { ReleaseEntryList, releaseDateLabel } from "./ReleaseEntryList";
import { suppressWhatsNew, type ActiveWorkoutStatus } from "@/lib/version";
import type { Release } from "@/content/releases/types";
import { acknowledgeReleases } from "@/app/(app)/more/actions";

/**
 * What's New (doc 23 §6; 09-changelog 2026-08-06 owner amendment).
 *
 * A centered menu-card modal establishes the interruption as a release notice,
 * not another in-task editor. It shows only each release's curated highlights;
 * More → What's new remains the complete durable record.
 */
export function WhatsNewModal({
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

  const highlights = [...releases]
    .reverse()
    .flatMap((release) => release.entries);
  const suppressed = suppressWhatsNew({
    pathname,
    workoutStatus,
    queuePending: pending > 0,
  });
  const open = !dismissed && !suppressed && highlights.length > 0;

  const acknowledge = useCallback(() => {
    setDismissed(true);
    startTransition(() => {
      void acknowledgeReleases();
    });
  }, []);

  // Following either a feature link or the complete-notes link acknowledges
  // the release; it must not be waiting when the reader returns.
  useEffect(() => {
    if (!open) return;
    const onNavigate = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (target) acknowledge();
    };
    document.addEventListener("click", onNavigate, true);
    return () => document.removeEventListener("click", onNavigate, true);
  }, [acknowledge, open]);

  if (highlights.length === 0) return null;

  const newest = releases[releases.length - 1];
  const oldest = releases[0];
  const span =
    releases.length === 1
      ? newest.version
      : `${oldest.version} – ${newest.version}`;

  return (
    <FloatingDialog
      open={open}
      onClose={acknowledge}
      label="What's new in WORKOUT"
    >
      <div className="h-[3px] bg-accent" aria-hidden />
      <header className="shrink-0 px-5 pt-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-caps flex items-center gap-2 text-[10px] font-bold text-accent">
              <span aria-hidden>■</span>
              New version released
            </p>
            <h2 className="mt-2 text-[26px] font-extrabold leading-[1.05] tracking-[-0.025em]">
              What&apos;s new in WORKOUT
            </h2>
          </div>
          <button
            type="button"
            onClick={acknowledge}
            aria-label="Close release notes"
            className="-mr-3 -mt-2 flex min-h-11 min-w-11 items-center justify-center text-xl text-ink-muted"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink/70">
          <span className="font-bold text-ink">Version {span}</span> is here.
          {newest.headline ? ` ${newest.headline}.` : ""} Here are the
          highlights.
        </p>
        <p className="mt-1 text-[9.5px] font-semibold tracking-[0.1em] text-ink/45">
          {releaseDateLabel(newest.date)}
        </p>
      </header>

      <div className="mx-5 mt-4 min-h-0 overflow-y-auto overscroll-contain border-t-[1.5px] border-ink sm:mx-6">
        <div className="pb-1">
          <ReleaseEntryList entries={highlights} />
        </div>
      </div>

      <footer className="shrink-0 border-t border-ink/20 px-5 pb-5 pt-4 sm:px-6 sm:pb-6">
        <Link
          href="/more/whats-new"
          className="flex min-h-11 w-full items-center justify-between border border-ink/35 px-3.5 text-[10px] font-bold tracking-[0.11em] text-ink"
        >
          <span>VIEW ALL RELEASE NOTES</span>
          <span aria-hidden>›</span>
        </Link>

        <button
          type="button"
          onClick={acknowledge}
          className="mt-3 min-h-12 w-full bg-ink px-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base"
        >
          GOT IT
        </button>
      </footer>
    </FloatingDialog>
  );
}
