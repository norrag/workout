"use client";

import { useState, useTransition } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { disconnectBodySpecAction } from "./actions";

/**
 * Disconnect with the doc 15 §2.3 posture: tokens are always destroyed;
 * imported scans are purged only when asked. Confirmed via BottomSheet —
 * the End-macrocycle confirm weight (09-changelog 2026-07-11 §2).
 */
export function DisconnectPanel({ scanCount }: { scanCount: number }) {
  const [open, setOpen] = useState(false);
  const [purgeScans, setPurgeScans] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="mt-7 border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
        DISCONNECT
      </div>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink/80">
        Disconnecting destroys the stored access tokens. Imported scans stay
        unless you choose to delete them — your logged training history is
        never touched either way.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 block w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
      >
        DISCONNECT BODYSPEC
      </button>

      <BottomSheet
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Disconnect BodySpec"
        subtitle="TOKENS ARE DESTROYED"
      >
        <label className="flex items-center gap-3 border border-ink/30 p-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={purgeScans}
            onChange={(e) => setPurgeScans(e.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          <span>
            Also delete the {scanCount} imported scan{scanCount === 1 ? "" : "s"}
          </span>
        </label>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen(false)}
            className="flex-1 border-[1.5px] border-ink/40 py-3 text-center text-xs font-bold tracking-[0.12em] text-ink/70 disabled:opacity-50"
          >
            CANCEL
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await disconnectBodySpecAction({ purgeScans });
                setOpen(false);
              })
            }
            className="flex-1 border-[1.5px] border-ink bg-ink py-3 text-center text-xs font-bold tracking-[0.12em] text-bg-base disabled:opacity-50"
          >
            {pending ? "DISCONNECTING…" : "DISCONNECT"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
