"use client";

/**
 * Inline failure state for a sheet's fetch-on-open (R17): a rejected fetch
 * shows this instead of sitting on "Loading…" forever.
 */
export function FetchRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="py-4">
      <p className="text-sm text-ink-muted">
        Couldn&apos;t load — check your connection.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2.5 border-[1.5px] border-ink px-5 py-2.5 text-[11px] font-bold tracking-[0.1em]"
      >
        RETRY
      </button>
    </div>
  );
}
