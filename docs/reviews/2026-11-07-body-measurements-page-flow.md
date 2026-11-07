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
