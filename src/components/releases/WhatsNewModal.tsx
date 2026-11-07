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
  proposal = false,
}: {
  releases: Release[];
  workoutStatus: ActiveWorkoutStatus | null;
  /** Review-only rendering; never marks any release seen. */
  proposal?: boolean;
}) {
  const pathname = usePathname() ?? "/";
  const { pending } = useSetLogQueue();
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  const highlights = [...releases]
    .reverse()
    .flatMap((release) => release.entries);
  const hasFeatured = highlights.some((entry) => entry.featured);
  const suppressed = suppressWhatsNew({
    pathname,
    workoutStatus,
    queuePending: pending > 0,
  });
  const open = !dismissed && !suppressed && highlights.length > 0;

  const acknowledge = useCallback(() => {
    setDismissed(true);
    if (proposal) return;
    startTransition(() => {
      void acknowledgeReleases();
    });
  }, [proposal]);

  // Following either a feature link or the complete-notes link acknowledges
  // the release; it must not be waiting when the reader returns.
  useEffect(() => {
    if (!open || proposal) return;
    const onNavigate = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest("a");
      if (target) acknowledge();
    };
    document.addEventListener("click", onNavigate, true);
    return () => document.removeEventListener("click", onNavigate, true);
  }, [acknowledge, open, proposal]);

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
      narrowGutters={hasFeatured}
    >
      <div className="h-[3px] bg-accent" aria-hidden />
      <header
        className={`shrink-0 px-5 pt-4 sm:px-6 ${hasFeatured ? "max-[374px]:px-4 max-[374px]:pt-3" : ""}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="label-caps flex items-center gap-2 text-[10px] font-bold text-accent">
              <span aria-hidden>■</span>
              {proposal ? "New version preview" : "New version released"}
            </p>
            <h2
              className={`mt-2 text-[26px] font-extrabold leading-[1.05] tracking-[-0.025em] ${hasFeatured ? "max-[374px]:text-[22px]" : ""}`}
            >
              What&apos;s new in WORKOUT
            </h2>
          </div>
          <button
            type="button"
            onClick={acknowledge}
            aria-label="Close release notes"
            className="-mr-3 -mt-2 flex min-h-11 min-w-11 items-center justify-center text-xl text-ink/50"
          >
            ×
          </button>
        </div>

        <p
          className={`mt-3 text-sm leading-relaxed text-ink/70 ${hasFeatured ? "max-[374px]:text-xs max-[374px]:leading-normal" : ""}`}
        >
          <span className="font-bold text-ink">
            {proposal ? "Proposed version" : "Version"} {span}
          </span>
          {proposal ? "." : " is here."}
          {newest.headline ? ` ${newest.headline}.` : ""}
          <span className={hasFeatured ? "max-[374px]:hidden" : undefined}>
            {" Here are the highlights."}
          </span>
        </p>
        <p className="mt-1 text-[9.5px] font-semibold tracking-[0.1em] text-ink/45">
          {proposal
            ? "FOR REVIEW · NOT RELEASED"
            : releaseDateLabel(newest.date)}
        </p>
      </header>

      <div
        className={`mx-5 mt-4 min-h-0 overflow-y-auto overscroll-contain border-t-[1.5px] border-ink sm:mx-6 ${hasFeatured ? "max-[374px]:mx-4 max-[374px]:mt-3" : ""}`}
      >
        <div className="pb-1">
          <ReleaseEntryList entries={highlights} announcement />
        </div>
      </div>

      <footer
        className={`shrink-0 border-t border-ink/20 px-5 pb-5 pt-4 sm:px-6 sm:pb-6 ${hasFeatured ? "max-[374px]:flex max-[374px]:items-stretch max-[374px]:gap-2 max-[374px]:px-4 max-[374px]:pb-4 max-[374px]:pt-3" : ""}`}
      >
        <Link
          href="/more/whats-new"
          className={`flex min-h-11 w-full items-center justify-between border border-ink/35 px-3.5 text-[10px] font-bold tracking-[0.11em] text-ink ${hasFeatured ? "max-[374px]:flex-1 max-[374px]:px-2" : ""}`}
        >
          <span>VIEW ALL RELEASE NOTES</span>
          <span aria-hidden>›</span>
        </Link>

        <button
          type="button"
          onClick={acknowledge}
          className={`mt-3 min-h-12 w-full bg-ink px-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base ${hasFeatured ? "max-[374px]:mt-0 max-[374px]:min-h-11 max-[374px]:w-20 max-[374px]:shrink-0 max-[374px]:whitespace-nowrap max-[374px]:px-2" : ""}`}
        >
          GOT IT
        </button>
      </footer>
    </FloatingDialog>
  );
}
