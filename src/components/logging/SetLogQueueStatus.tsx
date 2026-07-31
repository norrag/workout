"use client";

import { useSetLogQueue } from "./SetLogQueueProvider";

/**
 * Queue status strip (N68). Deliberately quiet: a healthy queue drains in
 * milliseconds and says nothing. It speaks only when the lifter would otherwise
 * be misled — sets held because there is no connection, or a write that spent
 * its retries and is parked.
 *
 * Ledger system (08 §1): square corners, tracked caps, ink on paper; the accent
 * marks the one thing that needs attention.
 */
export function SetLogQueueStatus() {
  const { pending, failed, online, retry } = useSetLogQueue();
  const held = pending + failed;
  if (held === 0) return null;
  if (online && failed === 0) return null;

  const label =
    failed > 0
      ? `${failed} SET${failed === 1 ? "" : "S"} DIDN'T SAVE`
      : `${held} SET${held === 1 ? "" : "S"} WAITING FOR A CONNECTION`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[76px] z-40 flex justify-center px-4">
      <div
        role="status"
        className={`label-caps pointer-events-auto flex max-w-lg items-center gap-3 border-[1.5px] bg-paper px-3 py-2 text-[9.5px] font-semibold ${
          failed > 0 ? "border-accent text-ink" : "border-ink/40 text-ink/70"
        }`}
      >
        <span>{label}</span>
        {failed > 0 && (
          <button
            type="button"
            onClick={retry}
            className="border-b border-accent text-[9.5px] font-bold tracking-[0.12em] text-accent"
          >
            TRY AGAIN
          </button>
        )}
      </div>
    </div>
  );
}
