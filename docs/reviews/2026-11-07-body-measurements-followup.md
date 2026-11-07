# N96 - automatic entry checks, connector access and 1.3 proposal

Status: implementation under review. The release modal is **proposed, not approved**.
No release registry activation, merge or production promotion is authorized here.

## Capture

Figures 4.13f-g and 4.7b in `design/mockups/body-measurements-entry-review.html`
were rendered before implementation. Complete remains normal document content
after all fields. Cancel is removed; the named X keeps discard protection.
Valid decimal entries check automatically. Invalid/empty entries clear checks.
Manual checkbox toggling remains available. All entered values save, checked
or not, and any nonempty subset is valid.

The existing hard storage boundary remains positive values up to 150 in
(381 cm). Hexadecimal, exponent text and nonnumeric input are not tape entries.
Broad site-specific entry ranges and a change above both 2 in and 20% of the
latest earlier same-site/side reading produce a review prompt. These are typo
heuristics, not clinical ranges, measurement-error bands or growth limits.
The prompt shows the entered value, prior value/date when present, and reason.
Edit values returns focus to the first affected field after the sheet exits.
Save as entered confirms the values and uses the existing atomic save. These
review choices and checkmarks are local state; no new database fields are added.

Local actual-component checks pass at 320/360/390/430px: Complete only at the
document end, no horizontal overflow, automatic checks, hard-invalid validation,
relative typo review, correction focus, dirty X/Keep editing retention and the
release proposal's mobile/light/dark layouts. No page errors. Typecheck and lint pass. All 663 relevant unit/contract cases pass
after the Guide section was shortened to its existing budget; all 203 Guide,
release and link cases pass on the final copy. The temporary
root fixture was restored, and its dev server stopped. Local visual fixtures
do not write data. Disposable local-Supabase CI accounts cover persistence.

## Connector

`get_body_measurements` is registered only when 1.3 is active. It accepts unit
(in/cm, default in), limit (1-120, default 24), and an exclusive before date.
It never accepts a user ID. The existing verified session supplies identity
and a token-bound RLS client; the query also filters by that owner.

The response contains dated sessions/notes, site/side keys, values, previous
dates/values, deltas and day intervals. A comparison uses the earlier same-site
observation **within the returned page**. The first such observation has no
baseline. Missing sites are not filled. Pagination reports has_more/next_before.
The envelope and payload both state the requested length unit; other tool
envelopes still default to pounds. No write tool, engine input or synthesis
is introduced. Tool definitions automatically change the catalog fingerprint.

Unit tests cover auth refusal, strict arguments, owner/token binding, units,
same-side gaps, empty windows, pagination metadata and release gating.
Integration tests use two disposable local accounts and real token-bound RLS
to verify owner isolation, deltas, units and paging. Existing Supabase
[owner-policy guidance](https://supabase.com/docs/guides/database/postgres/row-level-security)
was checked; no new Supabase API or schema change is needed.

## Manual review

The measurement section follows the existing Guide structure. Copy uses short
sentences, one topic at a time, active instructions and consistent action names,
in line with the owner's approximate STE preference and the official
[ASD-STE100 explanation](https://www.asd-ste100.org/faq.html). This is a practical
editorial application, not a certified dictionary/compliance claim.

Code/claims agree on all sites being optional, automatic checks, manual toggles,
unchecked partial saves, unit conversion, hard limits, confirmable typo checks,
X/Complete, corrections/deletion, raw comparisons, CSV and connector access.
Doc 20's weight/waist matrix was corrected: it cannot identify fat/muscle changes
or establish recomposition, and DEXA is not definitive ground truth. Separate
follow-ups retain the scanner-model/physical-machine mismatch and generic
DEXA noise-band accuracy issues without changing those mechanisms here.

## Release proposal and future work

Measurements are the single featured 1.3 entry. The existing assistant tool-list
refresh notice is shorter and visually secondary. The proposal uses the real
modal renderer, states FOR REVIEW / NOT RELEASED, and never acknowledges a
release. Its route requires the explicit nonproduction staged override:
`/more/whats-new/preview`. The normal registry remains 1.2.1.

Approval screenshots are in `design/screenshots/release-1.3-proposal-*.png`.
Signed-in local-Supabase browser tests also archive the proposal and assert no
acknowledgment action. Owner approval remains pending, including clarification
if “tool tips reminder” means a different feature from the staged tool-list notice.

Per-measurement notes remain TODO T-N96a. The [future data-first direction](2026-11-07-body-records-future-direction.md) records the proposed overview context. The future overview is data-first:
dated tape/waist/limb values and deltas beside weight, related strength and DEXA,
with explicit baselines, missingness and uncertainty. No generated verdict,
score, prescription advice or speculative overview implementation in this pass.

Fresh preview and CI results follow after the implementation commit. Hosted
signed-in functionality and physical iOS behavior are not established by the
local visual fixture. The hosted database is shared production; synthetic
persistence tests are restricted to loopback Supabase.

## First CI checkpoint and concrete test correction

UI commit 8ecfc4d is READY at
https://workout-ngcfgtf10-garron-duprees-projects.vercel.app/more/measurements
with the deployment-specific 1.3.0 build override confirmed. The proposal is at
the same host's `/more/whats-new/preview`. Both protected fetches reach app
sign-in (200); this is not hosted signed-in verification.

CI [42395704828](https://github.com/norrag/workout/actions/runs/42395704828)
passes checks, 84 RLS, all 21 integration cases (including the three real
two-account connector cases), and drift. Targeted browser results are
2 passed / 2 failed, so broad smoke did not run. Mobile document flow,
auto-checks, unchecked partial persistence and the real release-proposal
renderer pass directly. The proposal made no acknowledgment action.

The capture case failed at sign-in on both attempts before opening the form.
The typo case's first attempt also failed at sign-in. Its retry exposed a
concrete test-selector mistake: a global role=alert matched both the form
error and Next's empty route announcer. The assertion is now scoped to the
named measurement form; the app's accessible announcer remains intact. No
auth bypass, longer timeout or blind rerun was introduced. The changed test
commit receives fresh CI. Approval PNGs for light/dark/narrow are replaced
with actual signed-in local-Supabase captures, without the dev indicator.
