"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GuideLink, guideHref } from "@/components/ui/GuideLink";
import { LeaveConfirm } from "@/components/ui/LeaveConfirm";
import type { GuideLinkTarget } from "@/lib/guide-links";

/**
 * A `GuideLink` on a surface that is holding unsaved input — doc 22 Phase 7c,
 * the owner's acceptance of [`22e`](../../../docs/22e-link-placement-audit.md)
 * §5. Design pass: 09-changelog 2026-08-15 session 2 §1.
 *
 * Wave 1 could not place a link on the Feedback, Effort target, Workout
 * Complete, Load step or Edit details sheets, because a `GuideLink` navigates
 * and navigating out of a sheet holding sliders discards them (earn test E4).
 * This is that exclusion lifted, not waived: while `dirty`, the tap opens the
 * app's discard-confirm first and only `DISCARD` leaves.
 *
 * **Why the guard is at the link and not at the document.** §5 named
 * `useNavigationGuard` because it was the tool that existed. It is the right
 * tool for a *page*, where the tab bar, the header and the back button are all
 * live exits, and wave 2 uses it there. Inside a sheet none of them are: the
 * scrim covers the page, so this link is the only navigation the surface
 * offers, and intercepting the one anchor is exactly sufficient. It is also
 * strictly cheaper — no document listener and, more to the point, **no history
 * sentinel planted on the day view's hot path**, which is what extending that
 * hook to mid-workout sheets would have meant.
 *
 * A pristine surface renders the plain link and no confirm ever appears: there
 * is nothing to lose, so there is nothing to ask.
 */
export function GuardedGuideLink({
  to,
  from,
  rule = false,
  className = "",
  dirty,
  body,
}: {
  to: GuideLinkTarget;
  from?: string;
  rule?: boolean;
  className?: string;
  /** whether the surface is currently holding input a navigation would drop */
  dirty: boolean;
  /** the confirm's one variable sentence — what is unsaved, in its own words */
  body: string;
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  return (
    <>
      {/* `display: contents` — the interceptor must not become a box in the
          layout, or a guarded link would sit differently from a plain one */}
      <span
        className="contents"
        onClickCapture={(e) => {
          if (!dirty) return;
          // let a modified click (new tab) through: the sheet's state survives
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          if (!(e.target as Element | null)?.closest?.("a[href]")) return;
          e.preventDefault();
          e.stopPropagation();
          setAsking(true);
        }}
      >
        <GuideLink to={to} from={from} rule={rule} className={className} />
      </span>
      <LeaveConfirm
        open={asking}
        body={body}
        onKeepEditing={() => setAsking(false)}
        onDiscard={() => router.push(guideHref(to, from))}
      />
    </>
  );
}
