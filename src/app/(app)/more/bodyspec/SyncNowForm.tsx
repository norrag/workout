"use client";

import { useState, useTransition } from "react";
import { syncBodySpecAction } from "./actions";

/** On-demand pull (09-changelog 2026-07-11 §2). Outcome copy is transient;
 *  the durable record is the row's LAST SYNCED / error line, re-read on the
 *  revalidate that follows the action. */
export function SyncNowForm() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const { error, imported } = await syncBodySpecAction();
            setMessage(
              error ??
                (imported > 0
                  ? `Imported ${imported} scan${imported === 1 ? "" : "s"}.`
                  : "Up to date — no new scans."),
            );
          })
        }
        className="block w-full border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em] disabled:opacity-50"
      >
        {pending ? "SYNCING…" : "SYNC NOW"}
      </button>
      {message && !pending && (
        <p className="mt-2 text-[10px] font-medium tracking-[0.08em] text-ink/55">
          {message.toUpperCase()}
        </p>
      )}
    </div>
  );
}
