"use client";

import { useState } from "react";
import {
  UNRELEASED_ENTRIES,
  UNRELEASED_HEADLINE,
  UNRELEASED_VERSION,
} from "@/content/releases/unreleased";
import { WhatsNewModal } from "./WhatsNewModal";

/** Staging review only. This object never enters RELEASES or What's New gating. */
export function ReleaseProposal() {
  const [revision, setRevision] = useState(0);
  return (
    <>
      <button
        type="button"
        onClick={() => setRevision((value) => value + 1)}
        className="mt-6 min-h-11 w-full border border-ink px-4 text-xs font-bold tracking-[0.12em]"
      >
        VIEW PROPOSED RELEASE NOTES
      </button>
      <WhatsNewModal
        key={revision}
        proposal
        workoutStatus={null}
        releases={[
          {
            version: UNRELEASED_VERSION,
            date: "2026-11-07",
            kind: "feature",
            headline: UNRELEASED_HEADLINE,
            entries: UNRELEASED_ENTRIES.filter((entry) => entry.highlight),
          },
        ]}
      />
    </>
  );
}
