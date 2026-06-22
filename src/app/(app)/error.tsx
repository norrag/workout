"use client";

import { useEffect } from "react";

/**
 * Route-level error boundary for the app segment. Without this, an unhandled
 * error from a server action or render (e.g. a transient failure inside an
 * optimistic toggle's transition) bubbles to Next's raw "application error"
 * fallback and blanks the whole app. This catches it and offers a recoverable
 * ledger card with a retry, so a one-off write failure can never strand the user.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface for diagnostics; the digest ties this to the server log entry.
    console.error("app segment error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-full max-w-sm border-[1.5px] border-ink p-6">
        <div className="text-[10px] font-bold tracking-[0.14em] text-ink/55">
          SOMETHING WENT WRONG
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">
          That action didn&apos;t go through. Nothing was lost — try again.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 w-full border-[1.5px] border-ink py-3 text-xs font-bold tracking-[0.12em]"
        >
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
