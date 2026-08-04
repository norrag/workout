"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retryWeekGenerationAction } from "./actions";

/**
 * The Workout tab's stalled state (N74).
 *
 * An ACTIVE mesocycle always has a next workout — the advance job closes week N
 * and activates week N+1 as the final day is logged, and the final week flips
 * the meso to `completed`. So an active meso with no next workout is never a
 * normal resting state: generation failed and the user is stuck, with no action
 * in the app that moves them.
 *
 * This previously rendered as "Every workout this week is logged. Next week's
 * targets generate when the engine runs." — which reads as reassurance, and is
 * false in exactly the case it appears: the engine already ran, and threw. Two
 * users sat on that sentence for two days in Aug 2026 while an unapplied
 * migration took out the advance job.
 *
 * No mockup figure covers this state (fig 1.1 has no failure variant), so it is
 * built from the 08 §5 vocabulary — dashed border for a not-yet-materialized
 * thing, tracked all-caps label, ink (never accent — the panel is not a current
 * position or a selection). Recorded in docs/PROGRESS.md per hard rule 8.
 */
export function StalledWeek({ mesoId }: { mesoId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);

  const retry = () =>
    startTransition(async () => {
      setError(null);
      try {
        const res = await retryWeekGenerationAction({ meso_id: mesoId });
        setRetried(true);
        if (res.ok) router.refresh();
        else setError(res.error);
      } catch {
        setRetried(true);
        setError("Couldn't reach the server — check your connection.");
      }
    });

  return (
    <div className="mt-5 border-[1.5px] border-dashed border-ink/40 p-4">
      <div className="text-[10px] font-bold tracking-[0.14em] text-ink/55">
        NEXT WEEK NOT BUILT
      </div>
      <p className="mt-2.5 text-sm leading-relaxed text-ink/70">
        This week is fully logged, but next week&apos;s targets haven&apos;t
        been generated. That is a fault on our side — your logged history is
        safe and nothing has been lost.
      </p>
      {error && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink">{error}</p>
      )}
      {retried && !error && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink/70">
          Still nothing to show. The problem has been reported.
        </p>
      )}
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        className="mt-4 block w-full bg-ink py-4 text-center text-[13px] font-bold tracking-[0.12em] text-bg-base disabled:opacity-50"
      >
        {pending ? "BUILDING…" : "TRY AGAIN"}
      </button>
    </div>
  );
}
