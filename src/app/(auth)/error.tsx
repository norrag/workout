"use client";

import { useEffect } from "react";
import {
  boundaryReport,
  postClientError,
} from "@/lib/observability/post-client-error";

/**
 * Route-level error boundary for the auth segment (R20). Sign-in / sign-up /
 * onboarding previously had no boundary at all, so a render or action error
 * there fell through to Next's raw "application error" screen — the worst
 * possible surface for a user who isn't even signed in yet. Same recoverable
 * ledger card as the app segment, reported through the client-error intake.
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("auth segment error", error);
    postClientError(boundaryReport("auth", error));
  }, [error]);

  return (
    <div className="border-[1.5px] border-ink p-6 text-center">
      <div className="text-[10px] font-bold tracking-[0.14em] text-ink-muted">
        SOMETHING WENT WRONG
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink">
        That didn&apos;t go through. Try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 w-full border-[1.5px] border-ink py-3 text-xs font-bold tracking-[0.12em]"
      >
        TRY AGAIN
      </button>
    </div>
  );
}
