"use client";

import { useState, useTransition } from "react";
import { applyScanToProfileAction, dismissScanProposalAction } from "./actions";
import type { ScanProfileProposal } from "@/lib/queries/body-comp";
import { shortDate } from "@/lib/dates";

/**
 * The post-sync profile-update proposal (doc 15 §2.3; 09-changelog 2026-07-11
 * 5b §1): measurement proposes, the user confirms — no sync ever mutates the
 * profile. Either resolution is per-scan and permanent; the revalidate that
 * follows the action removes the card.
 */
export function ProposalCard({ proposal }: { proposal: ScanProfileProposal }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (input: { scan_id: string }) => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      const { error } = await action({ scan_id: proposal.scanId });
      setError(error);
    });

  return (
    <div className="mt-6 border-[1.5px] border-ink p-4">
      <div className="text-[10px] font-bold tracking-[0.14em]">
        SCAN {shortDate(proposal.scannedAt)} — UPDATE PROFILE?
      </div>
      <div className="mt-2">
        {proposal.weightLb != null && (
          <ProposalRow
            label="BODYWEIGHT"
            proposed={`${proposal.weightLb} LB`}
            current={
              proposal.currentBodyweight != null
                ? `${proposal.currentBodyweight} LB`
                : null
            }
          />
        )}
        {proposal.bodyFatPct != null && (
          <ProposalRow
            label="BODY FAT"
            proposed={`${proposal.bodyFatPct}%`}
            current={
              proposal.currentBodyFatPct != null
                ? `${proposal.currentBodyFatPct}%`
                : null
            }
          />
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(applyScanToProfileAction)}
          className="flex-1 border-[1.5px] border-ink bg-ink py-2.5 text-center text-[10px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-50"
        >
          APPLY TO PROFILE
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(dismissScanProposalAction)}
          className="flex-1 border-[1.5px] border-ink py-2.5 text-center text-[10px] font-bold tracking-[0.12em] disabled:opacity-50"
        >
          KEEP CURRENT
        </button>
      </div>
      {error && !pending && (
        <p className="mt-2 text-[10px] font-medium tracking-[0.08em] text-ink-muted">
          {error.toUpperCase()}
        </p>
      )}
    </div>
  );
}

function ProposalRow({
  label,
  proposed,
  current,
}: {
  label: string;
  proposed: string;
  current: string | null;
}) {
  return (
    <div className="flex items-center justify-between border-b border-ink/15 py-2.5">
      <div className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted">
        {label}
      </div>
      <div className="numeral text-sm">
        {proposed}
        {current != null && (
          <span className="text-[10px] text-ink/45"> · NOW {current}</span>
        )}
      </div>
    </div>
  );
}
