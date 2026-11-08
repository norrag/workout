# N96 - measurement actions at the page end

The latest owner clarification explicitly requires Complete/Cancel at the end
of the page, visible after scrolling through the fields. It supersedes the
fixed-bar interpretation in the earlier layout review. The existing rows are
generally liked; this is a correction to placement and control sizing, not an
acceptance of the earlier anchored actions. Batch 44 preserves the exact text.

Figure 4.13e in `design/mockups/body-measurements-page-flow.html` was prepared
and rendered before implementation, per hard rule 8.

## Actual workout comparison

Rendered the real DayView twice inside the actual app shell geometry and
BottomNav, with fictional workout data: an incomplete workout for cell style
comparison and an all-sets-logged workout to expose COMPLETE WORKOUT. That
action is inline content after exercises. It is absent at top/middle and
visible at the page end. Tape now follows that placement without adopting
the workout's completion gate.

The logger replaces the ledger inside AppShell. Window/document scrolling
handles the fields and actions. Complete/Cancel are the final form content,
with static positioning and no fixed/sticky ancestor. No portal, separate
scroller, footer reservation, viewport tracker or body lock remains. The
header uses DayHeader's sticky grammar and the actual BottomNav remains.
Closing restores the ledger scroll position and the log button's focus.

| Viewport width | Workout and tape cell widths | Cell height / text |
| --- | --- | --- |
| 320 | 70 | 35 / 15 |
| 360 | 90 | 35 / 15 |
| 390 | 105 | 35 / 15 |
| 430 | 125 | 35 / 15 |

Date is now **160 x 35px**. IN/CM is **88 x 35px**. Shared Input and
SegmentedControl expose opt-in compact sizing; other forms retain defaults.
All 12 sites and 23px checkbox visuals remain; Complete saves every entered
reading regardless of local checks. One site is enough; blank sites are skipped.

## Local results

Actual-component Playwright checks pass at 320/360/390/430 x 740:

Typecheck, lint and all 336 targeted unit/Guide/release/navigation/day-rule
tests pass with the staged flag. The source and browser tests pass Prettier.

- Actions outside the viewport at top/middle and fully visible at the end,
  above BottomNav. Document-space action position stays constant while scrolling.
- No fixed/sticky action ancestors or internal field scroller; no horizontal
  overflow. A 768px viewport retains the 512px main / 480px form cap.
- Date/unit exact dimensions, shared workout cell computed styles and checkbox
  dimensions. All sites remain visible; landmark chevrons disclose explanations.
- Checklist validation/focus, edit reset, unit conversion, Next through every
  field to the note, 500-character note and dirty Cancel/Keep editing retention.
- Empty submission validation appears at the end, while an invalid checkbox
  puts its error beside that row. A short 320 x 400 viewport retains normal flow.
- Dark theme and themed Delete/Keep session cancellation. No page errors.

Fictional runtime captures are in `design/screenshots/body-measurements-flow-*`;
the 390px top/middle/end captures and actual workout completion are preserved.
The temporary auth-free root fixture was restored before commit; its dev server
was stopped. That fixture made no database writes. Actual persistence and
confirmed deletion are exercised by the disposable local-Supabase CI scenarios.
The mobile E2E case now asserts the document-flow contract and saves three
unchecked readings with nine blank sites.

## Deployment and verification boundaries

Fresh immutable preview and terminal CI results are recorded after the UI
commit below. Keep package/registry at 1.2.1; the staged manifest remains 1.3.0
and preserves the connector entry. Use only the deployment-specific public
1.3.0 override. No new migration or production health-data write in this pass.
The previously approved hosted additive migration remains in the shared
production database; Preview does not imply database isolation.

Hosted signed-in save/delete and physical iOS keyboard/zoom behavior remain
unverified. The existing root viewport policy is unchanged. A READY deployment
or protected HTTP response at app sign-in is not signed-in UI verification.
N84's independently reproduced main-branch navigation flakiness stays open;
do not inflate waits or conflate a passing rerun with a fix. PR #265 stays draft
and unmerged; no production frontend promotion.


## Deployed page-flow checkpoint

READY page-flow preview: https://workout-ih75aupc9-garron-duprees-projects.vercel.app/more/measurements
UI `157d26f51bdf147e0edfc2a7008ca3264a67422d`; deployment-specific public 1.3.0 override confirmed.
CI [42390170021](https://github.com/norrag/workout/actions/runs/42390170021)
is terminal success on attempt 1: checks, 84 RLS, 18 integration and drift pass.
Both targeted tape cases pass without retries and pass directly again in smoke.
Full smoke: 9 passed, 2 flaky, 0 failed/skipped. BodySpec Keep current (line 176)
and progression sign-in (line 217) pass on retry; N84 remains open.
Hosted signed-in and physical iOS remain unverified; no merge/promotion.

Deployment `dpl_9q8C7wLieTifFinE2t3z3FsEwyfk` is READY, target Preview
(null), with the exact UI SHA above. Actual build events contain
`NEXT_PUBLIC_RELEASE_OVERRIDE=1.3.0 npm run build`; no persistent environment
change. Protected measurement fetch returns HTTP 200 at app sign-in, with the
existing maximum-scale=1 viewport. This is not signed-in save verification.
Production remains READY at `aed94cedcf7ec94c81e4f480f5db686b60e9d084`
(deployment `dpl_D1Qd93s21sHMp5b4mjPLXMq38e4i`). Shared hosted schema
unchanged in this pass. Keep this immutable preview through docs-only commits.

Linux checks: 2,175 unit tests plus 12 built service-worker guards pass; the
pre-build guard skip is the existing one. Targeted capture and mobile cases
pass in 4.423s/4.348s with no retries. Their archived report contains 12 mobile
shots; 390px top/end and 320px middle were visually inspected. Actual local
account persistence, correction, CSV and themed Keep/Delete all pass. Full
smoke passes measurement cases directly again (4.1s/4.3s).

The two broad-suite flakes match previously investigated N84 surfaces:
BodySpec UPDATE PROFILE? remains after KEEP CURRENT for 15s; progression
waits 90s at sign-in for /workout. Both pass retry 1. Prior unchanged-main
controls reproduce these transition/navigation classes; see the controlled
[comparison](2026-11-06-body-measurements-ci.md). This run retained only the
targeted artifact: the full smoke artifact step uses failure(), so retry-only
flakes have logs but no downloadable trace here. Do not claim a newly observed
HTTP redirect timing or a root cause from those logs. No concrete tape regression
was found; no speculative app change, inflated waits, auth bypass or rerun-to-green.

[Actual-component scroll comparison](../design/reviews/body-measurements-page-flow.html)
preserves local top/middle/end/workout/dark captures. Final docs-only CI is
reported in delivery; it does not change the pinned UI. Draft PR #265 remains
unmerged. Its description update is separately blocked by automatic approval
review pending explicit publication approval; branch docs and preview are current.
