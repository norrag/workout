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

The latest owner clarification supersedes the fixed-bar behavior in 4.13a-d.
Figures **4.13f-g**, design/mockups/body-measurements-entry-review.html,
precede the latest automatic-check / typo-review correction. Figure 4.13e
keeps authority over document flow; 4.13f-g remove its Cancel action.
The page shares actual DayView cell classes and LogCheckbox:
35px cells, 15px values, 23px squares and 10px gaps. Widths match workout
weight/reps cells at every viewport. Landmark chevrons reveal cues only;
no sites are hidden. Date, units and notes use existing shared controls.

Checkmarks are local. Valid decimal entries check automatically; invalid or
empty entries clear their mark. Manual toggling and unit conversion preserve
the current local checklist choice. Complete saves **all entered values, checked or not**; blanks
are skipped. There is no all-sites/all-checked gate, per-row write or queue.
Errors retain input. The X asks before discarding dirty entries. Delete session
uses the themed BottomSheet, Keep session and destructive-outline DELETE.

The logger replaces the ledger inside the existing app shell. The document
scrolls, with no form scroller, portal, fixed action bar or body lock. Complete
is the last action in the form: below the fold at top/middle,
visible at the end above the existing tab bar. Its placement matches the
actual DayView's inline COMPLETE WORKOUT action, while partial save stays
independent of checkmarks. The header follows DayHeader's sticky grammar.
Date is 160 x 35px; units are 88 x 35px. Shared controls expose an opt-in compact
size; their existing default dimensions are unchanged. Next follows every
field and scrolls the next input into view. The app's 512px cap, bottom padding,
N47 body-position and root zoom policy remain intact. Errors appear beside
the affected checkbox row or at the form end; saved input survives failures.
See [page-flow evidence](reviews/2026-11-07-body-measurements-page-flow.md).

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


### Historical fixed-bar checkpoint - superseded by 4.13e

READY review preview: https://workout-873r403rx-garron-duprees-projects.vercel.app/more/measurements
pinned to ebffc809c6bf3d05be682feea6142b1db1fc436b, public 1.3.0 build override.
CI 42386443416 passes checks, 84 RLS, 18 integration, drift and both targeted
measurement cases without retries. Full smoke: 7 passed, 1 failed, 3 flaky;
N84 remains open. Capture retries after a pre-form sign-in timeout; mobile
passes directly. Hosted signed-in and physical iOS checks remain unverified.
No merge/promotion. [Detailed evidence](reviews/2026-11-07-body-measurements-layout.md).


### Current document-flow checkpoint - 2026-11-07

READY page-flow preview: https://workout-ih75aupc9-garron-duprees-projects.vercel.app/more/measurements
UI `157d26f51bdf147e0edfc2a7008ca3264a67422d`; deployment-specific public 1.3.0 override confirmed.
CI [42390170021](https://github.com/norrag/workout/actions/runs/42390170021)
is terminal success on attempt 1: checks, 84 RLS, 18 integration and drift pass.
Both targeted tape cases pass without retries and pass directly again in smoke.
Full smoke: 9 passed, 2 flaky, 0 failed/skipped. BodySpec Keep current (line 176)
and progression sign-in (line 217) pass on retry; N84 remains open.
Hosted signed-in and physical iOS remain unverified; no merge/promotion.
[Detailed evidence](reviews/2026-11-07-body-measurements-page-flow.md).


## Latest owner amendment - 2026-11-07

Cancel is removed. A valid decimal number checks automatically. Empty/invalid
entries clear checks; the X keeps discard protection. Positive values up to
150 in remain the hard boundary. Broad per-site ranges and changes above both
2 in and 20% of the latest earlier same-site value prompt review. These are
entry-error heuristics, not clinical ranges or biological limits. Edit values
returns to the field; Save as entered permits legitimate unusual measurements.
Neither requires every site or checkmark.

The staged read-only MCP tool returns owner-scoped measurements and same-site
deltas with dates, units, intervals and explicit within-page baselines. No new
schema or writes. The proposed 1.3 modal makes measurements the flagship and
the existing tool-list notice minor. Its staged-only preview cannot acknowledge
a release; screenshots await owner approval. Per-site notes and data-first
overview context remain future work. [Evidence](reviews/2026-11-07-body-measurements-followup.md).


### N96 follow-up verification checkpoint - 2026-11-07

READY review preview: https://workout-ngcfgtf10-garron-duprees-projects.vercel.app/more/measurements
Release proposal: same host /more/whats-new/preview (not approved or released).
UI pinned to 8ecfc4d5affcbff823f599a99b2c4fee70b9e0ae; deployment-specific
public 1.3.0 build override confirmed. Corrected test/document head is
7dda88c0ecf620b35d8708d120dbedeace004dbf with identical application source.
CI 42396673985 is terminal success on attempt 1: 2,189 unit tests, 12 built
guards, 84 RLS, 21 integration and drift pass. Full smoke: 13 direct passes.
Targeted cases: 3 direct passes / 1 pre-form sign-in retry; all flows pass.
N84 stays open. Real signed-in local-Supabase tests cover partial save,
correction/confirmation, export/deletion, modal non-acknowledgment and two-owner
connector isolation. Hosted signed-in and physical iOS remain unverified.
No schema change, production health-data write, merge or promotion.
Detailed evidence: docs/reviews/2026-11-07-body-measurements-followup.md.

### Release proposal: narrow-screen review - 2026-11-07

The owner approved the 390px light/dark proposal designs, then requested a
less tall narrow layout. Figure 4.7c and [the narrow review](reviews/2026-11-07-release-modal-narrow.md)
record this bounded correction. Capture, storage and connector behavior are
unchanged. Narrow revision approval remains pending; no release or merge.


### 2026-11-08 verification continuation

The sign-in hydration defect is corrected without changing capture or the
announcement design. Fresh signed-in loopback tests directly verify persisted
save/correction/deletion and mobile document flow. N84 navigation can still
stall without hydration errors. Hosted sign-in/save/delete is blocked by preview
protection and remains unverified. [Current evidence](reviews/2026-11-08-navigation-hydration.md)
records the exact commit, READY preview and limits. Wider modal designs approved;
narrow revision pending. Draft #265 stays unmerged.

### Owner amendment - regular modal and release readiness, 2026-11-08

The narrow modal is rejected. The approved regular smaller-type 4.7b design is
restored at every width, with ordinary internal scrolling; no new narrow variant.
All test failures must be corrected before calling this release-ready. Do not
merge until owner approval. The [future-work proposal and roadmap](reviews/2026-11-08-body-records-roadmap.md)
expands T-N96d with evidence, source contracts, phases and acceptance criteria.
It is planning only; the current release remains monthly capture and read access.

### Verified release-candidate code checkpoint - 2026-11-08

The supported navigation correction is verified at UI 7fffacb; CI 42440446611
passes every job. Broad mobile smoke is 42/42 across three fresh repetitions,
with retries disabled. All four targeted tape cases and four sign-in regressions
pass directly; checks, drift, 84 RLS and 21 integration pass. The regular modal
PNG files match the approved light/dark assets byte for byte. No narrow variant
is active. [Full correction and evidence](reviews/2026-11-08-navigation-queue.md).
Hosted signed-in save/delete and physical iOS remain unverified; protection is
preserved and no hosted test data was created. The prepared detailed PR body
requires approval after automatic review denied publication. Final documentation
CI is reported at delivery. Draft #265 is not merged; package/registry remain
1.2.1 and the feature remains staged 1.3.0. Owner approval is required to release.

Final-head check: e58b8f2 / CI 42440932857 has 39/42 broad passes; three macrocycle
text assertions also match hidden streamed content outside the active main.
Navigation, tape, checks/drift/RLS/integration pass. Assertions are now scoped to
the active main without reducing their requirements or enabling retries. The
[queue record](reviews/2026-11-08-navigation-queue.md)
records the evidence; final corrected-head CI is reported at delivery.

The next check (b9409a0 / CI 42441481966) is 41/42: macrocycle passes; one workout
input matches a hidden streamed duplicate. A consistent visible-control policy
now corrects the same class across the suite. Expected values, strict matching,
hidden metadata and persistence checks remain. No application change. Final-head
CI follows at delivery; see the queue review for the complete qualification.

## Owner amendment: MCP logging and backlog imports (2026-11-08)

The owner requests new and backdated measurements through MCP. The bounded
`import_body_measurements` exception appends facts, not training plans. It never
replaces existing sessions. A batch of 1–100 explicit dates uses one transaction;
identical retries skip existing dates, while a different note, unit or reading
on an existing date rejects the entire batch. Use the previewed update tool to correct that date.

The default is a no-write preview. `commit:true` saves the reviewed values.
Optional `confirm_unusual_values:true` acknowledges the same typo heuristics as
the app. History and candidate dates are compared chronologically, by site/side.
Missing dates or readings are never invented. Explicit local UTC offset controls
today at the MCP boundary; SQL permits tomorrow UTC to accommodate world time zones.
Units convert to canonical inches rounded to four decimals. The database assigns
IDs and derives the owner from auth.uid(); invoker RLS and grants still apply.
The per-owner import lock serializes repeat imports; unique date constraints and
row locks protect app-write races. Preview is advisory; commit revalidates.
Audit contains an argument hash and count, never raw measurements or notes.

No production data writes are part of development. New migration must pass CI
and be applied before activating the 1.4 tool. User authorized release on completion.


## Owner amendment: MCP measurement corrections and deletion (2026-11-09)

The owner authorized `update_body_measurements` and `delete_body_measurements`,
deployed within the existing version. Both are owner-scoped exceptions to
draft-only planning: they change tape facts only, never training or other body
data. Default preview is read-only. Commits require the unmodified canonical
`expected_session` from a fresh preview; changed records reject atomically.

Updates preserve omitted fields. A supplied readings array replaces the whole
site list, and preview lists removed sites. Units are explicit or retain the
recorded unit; changing unit alone preserves physical readings. Date conflicts
reject. Shared date/value validation and unusual-value review still apply.

Deletion targets one session, including its readings. The assistant must show
the exact preview and obtain action-time confirmation of permanent deletion
before setting both `commit:true` and `confirm_delete:true`. There is no bulk
delete or undo. Missing/foreign IDs are indistinguishable errors, never success.
The invoker RPC locks the owner row, checks the snapshot, and commits atomically.
No actual user data was modified during verification.
