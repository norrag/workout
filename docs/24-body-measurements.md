# 24 — Monthly body measurements

Status: owner correction under review, 2026-11-07. Staged for **1.3.0**.

## Scope and precedence

The owner's current request is monthly tape capture **inside WORKOUT**, under
More below BodySpec. This supersedes doc 20's topology and phase sequencing
only for this bounded slice. N66's larger companion (daily scale capture,
Apple Health, smoothing, synthesis, a second shell) stays deferred. Doc 20's
privacy, transparency, no-composite and engine boundaries still apply.

Phase 0 is recorded before implementation: `docs/design/mockups/body-measurements.html`,
figures **4.12–4.15**, extending 4.4/4.5. Follow the existing light/dark/system
tokens; do not copy the old prototype's exploratory dark styling.

## Capture and review

More → Body measurements opens a quiet ledger: one session per date, optional
note, IN/CM display and entry. All 12 sites are visible in upper/lower groups.
Every site is optional; any nonempty subset can be saved. Prior readings are
dated hints, never prefilled as new observations.

The owner rejected the prior mobile pass. Figures **4.13c–d** in
design/mockups/body-measurements-workout.html supersede 4.13a–b before code.
The full-screen logger shares actual DayView cell classes and LogCheckbox:
35px cells, 15px values, 23px squares and 10px gaps. Widths match workout
weight/reps cells at every viewport. Landmark chevrons reveal cues only;
no sites are hidden. Date, units and notes use existing shared controls.

Checkmarks are a local checklist. Editing clears a mark; unit conversion
preserves it. Complete saves **all entered values, checked or not**; blanks
are skipped. There is no all-sites/all-checked gate, per-row write or queue.
Errors retain input. Dirty Cancel asks before discarding. Delete session
uses the themed BottomSheet, Keep session and destructive-outline DELETE.

FullScreenEntry renders in a body portal. Its action bar is position:fixed
at the visible viewport bottom, flush to the sides, with safe-area padding
only. It reserves its measured height, including validation messages, outside
the scrolling fields. Viewport resize/scroll tracks keyboard geometry; Next
follows all fields. Inner content retains the 512px app cap. Existing sheet
layout is restored; N47 body-position and root zoom policy are unchanged.
See [actual-component comparison](reviews/2026-11-07-body-measurements-layout.md).

The save response carries the committed canonical session. The ledger keeps that
confirmed result visible through a late render carrying the prior snapshot;
fresh server data replaces it. This state is transient and starts only after the
database acknowledgment. The route forces dynamic reads and stores nothing in
browser storage.

Latest compares two explicitly dated sessions. Only matched sites are subtracted;
missing sites have no delta. History follows one site and side through dated raw
readings, with the interval and count visible. No interpolated observations,
composition estimates, fat/muscle labels, or causal claims. Context links point
to existing cycles and BodySpec surfaces; they do not duplicate strength metrics.
Small differences are accompanied by a plain tape-variation caveat, without
inventing an individual measurement-error threshold.

## Data and privacy

Three additive tables: `measurement_sites` (stock landmark/side vocabulary),
`measurement_sessions` (owner, date, input unit, note, timestamps), and
`measurements` (session/owner composite FK, site key, canonical inches).
Site rows include side in the stable key, so an unpaired NULL cannot bypass a
uniqueness constraint. New stock sites are rows, not columns. Custom sites and
protocol editing are deferred to the companion.

All tables have RLS. Sites are authenticated-read-only. Session and reading
policies are owner-only, including WITH CHECK on updates; a composite FK makes
cross-owner session attachment impossible. The save RPC is SECURITY INVOKER,
derives identity from auth.uid(), and replaces one session's readings in one
transaction. App queries use the authenticated client, never a service key.
No MCP write surface, analytics payload, browser persistence or engine input
is introduced. Account deletion cascades; the tape ledger provides a dedicated
CSV export. Reads remain online, saves are foreground writes.

## Release and verification

Keep package/registry at 1.2.1. Gate the More row, route and mutations on literal
`releaseActive("1.3.0")`; append the staged note and preserve existing entries.
Preview via `NEXT_PUBLIC_RELEASE_OVERRIDE=1.3.0` in Preview only. No production
promotion or release registry entry in this PR.

Verify pure unit/date/comparison rules, atomic replace/rollback, all RLS operations
(anonymous, owner, other user, forged ownership), UI save/edit/history/unit switching,
and both themes. Hosted has no Supabase development branch as of this inspection;
Vercel Preview does not imply database isolation. Apply the additive migration only
after local/CI policy tests pass and record its actual status in the runbook.

Hosted migration applied after renewed Supabase confirmation on 2026-11-06,
recorded as `20261106202459_body_measurements`. This is the existing production
database, not a preview branch. Structural verification confirmed all three
tables, 12 stock sites, RLS policies, ownership FKs, authenticated-only grants
and SECURITY INVOKER execution. Security advisors added no measurement findings.

At application commit `d66b853`, Linux CI run `42286972237` passed unit/build
checks, all 84 RLS and 18 integration tests, and the targeted measurement E2E.
The full smoke suite passed measurements again but retained N84's pre-existing
BodySpec navigation timeout (line 141). Hosted migration drift passed after apply.
The READY preview is pinned to that commit with the deployment-specific 1.3.0
override. Its protected measurement URL reaches app sign-in; a hosted signed-in
save has not been verified. Browser navigation failed, then Computer Use stopped
because it could not verify the active browser URL to enforce access rules. No
owner's health records or synthetic production readings were used. The local
disposable-account E2E covers the complete write/read flow.
The draft PR is #265; no merge or production frontend promotion occurred.

Browser failure attribution is investigated in
[the controlled main/feature comparison](reviews/2026-11-06-body-measurements-ci.md).
It reproduces the shared fast-redirect/pending-UI failure on unchanged main;
the measurement flow passes, while N84 remains a repository release blocker.
