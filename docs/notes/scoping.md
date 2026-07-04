# Scoping — UI / feature items

Codebase-grounded scope notes for the UI/feature/bug items, keyed by backlog ID.
Each entry: where it lives, current behavior, rough size, and any blocker or open
design question. Sizes: trivial / small / medium / large.

> **Owner decisions received 2026-07-02 (backlog appendix Batch 4)** — the
> recurring blockers below are now resolved; each entry carries its ruling:
> - **Design-decision items (hard rule #8):** owner OK'd building the macro stats
>   screen (M8) and the meso-page rework (P16) **without mockups** (record the
>   rule-8 deviations); back-button condition (P17) decided (option 2 + spawned
>   N4). Fidelity is still checked against fig 2.5 / the day-view header where they
>   exist.
> - **Spec-conflict items:** P18 — **hide the set-type menu affordance only**,
>   leave the drop-set data model dormant (no spec change).

---

## M9 — Macrocycle custom-duration field can't be emptied · **B / small**
`src/app/(app)/cycles/new/CreateMacroForm.tsx`, `customMonths` state (L69),
input L169–187, onChange L176–180. The onChange clamps every keystroke
(`Math.max(1, Math.min(60, Number(e.target.value) || 1))`), so `""` → `0 || 1`
→ forces `1`; the field can never be empty. **Fix:** hold a string in state,
clamp on blur/submit. Three consumers must tolerate an interim empty/NaN: hidden
`duration_months` (L101–105), live `planMacrocycle` (L87), meso-length
auto-suggest `useEffect` (L77–79). **Ready to build.**

## M10 — Show only *unplanned* mesos on macro overview · **wontfix (2026-07-02)**
Owner dropped this: "Leave unplanned mesos there as they are. Drop this idea." The
"MESOCYCLE TIMELINE" (`macro/[macroId]/page.tsx` L191–269) keeps rendering **all**
mesos (matches doc 09's full chronological ledger). Row swept to `archive.md`.

## M8 — Stats unification (meso est-strength; macro 3-way toggle) · **DONE (PR #104, 2026-07-02)**
Shipped: macro page OVERVIEW|BALANCE|PERFORMANCE toggle (`getMacroStats` +
reused BalanceView/StrengthProgressSection); meso side through P16. Tab naming
reconciled to BALANCE (09 2026-07-02 §1). Original scope below for the record.
- "Est-strength under meso Performance" — **already present** in `PerformanceView`
  (`src/components/stats/MesoStatsViews.tsx:252-304`); owner confirmed this is what
  was meant. **Note:** the meso stats surface itself is being reworked by **P16**
  (Overview|Volume|Performance toggle absorbing the standalone MESO STATS button) —
  build M8's meso side *through* P16.
- Macro `OVERVIEW | BALANCE | PERFORMANCE` toggle — **medium–large.** There is **no
  dedicated macro stats screen**; macro stats are 4 static inline tiles
  (`macro/[macroId]/page.tsx:271-292`, `buildMacroStats` in
  `queries/macro.ts:545-602`) and there are no balance/performance rollups at macro
  scope. **Decision (2026-07-02):** owner OK'd **designing this screen without a
  mockup** — record the rule-8 deviation in `docs/PROGRESS.md`, model the layout on
  the meso stats views + the day-view header patterns. Ties into I11/PH37 (the
  Performance-tab content) and R14 (fractional volume for the Balance tab).

## I14 — Unify complete-workout slider resolution · **F / medium**
Both in `src/app/(app)/log/[workoutId]/DayView.tsx`; slider =
`src/components/ui/SnapSlider.tsx`. Complete-workout `CompleteSheet` (L2253–2391),
`SESSION_SLIDERS` L2237–2251 use **max=4 (0–4, 5 points)**; per-exercise
`FeedbackSheet` (L1993–2229) uses **max=10 (0–10, 11 points)** plus discrete
joint-pain (0–3) and days-sore (0–5). **Scope:** raise session sliders to the
0–10 scale — but this touches **persisted values + engine reads + golden tests**
(hard rule #3), so it's not purely cosmetic. **Decision (2026-07-02):** **unify
everything to one 0–10 scale** ("Unify it absolutely") **and rescale existing
persisted data** to match ("Rescale the data appropriately"). So this needs: a
one-time **data migration** rescaling stored session-slider values (0–4 → 0–10,
and any other off-scale fields), the engine reads/golden tests updated for the new
range, and `FeedbackScale.tsx` (currently unused) likely becomes the shared
control. → **ready (medium; includes a migration).**

## I15 / PH42 — Note icon & pencil glyph (these overlap) · **UX / trivial**
`DayView.tsx` `ExerciseBlock` icon row L727–766: order L→R is already **note
(document glyph, L728–750) → history (clock, L751–756) → menu (L757–765)** — so
the "add a note icon left of history" (I15) **already exists**. The unclear icon
(PH42) is the bare Unicode **`✎` edit pencil** shown only when a note exists
(pinned L780–788, session L800–804), low-contrast `text-ink/40`. **Fix:** swap `✎`
for a clearer inline SVG pencil matching the icon-row style; confirm fig 1.1
fidelity. **I15 is likely a no-op (already done); PH42 is the real, ready task.**

## P16 — Meso page rework: toggle + planner-style overview + header actions · **DONE (PR #104, 2026-07-02)**
Shipped as specced below (`MesoHeader.tsx` + `MesoPlanView.tsx` + the toggle;
`/stats` route redirects; ⋮ menu holds edit/save-template/delete; the "VOLUME"
label question resolved to **BALANCE** — 09 2026-07-02 §1). Original scope
below for the record.
`src/app/(app)/cycles/meso/[mesoId]/page.tsx` (`MesoDetailPage`): today a vertical
stack of near-identical `border border-ink/35` rows (EDIT/GO-TO L239–263, MESO
STATS link L271–276 with a **stale "VOLUME" label**, SAVE AS TEMPLATE L277–287,
Share, Delete). **Owner's decided design (verbatim in backlog Batch 4):** rework the
whole meso page to mirror the macro page + day-view patterns —
- **Top-level toggle `OVERVIEW | VOLUME | PERFORMANCE`** (owner's words) that
  **absorbs the standalone MESO STATS button** into the toggle. This is the meso
  home for M8's meso side + I11/PH37. *(Naming note: "VOLUME" is the owner's term
  for what the current meso stats calls the **BALANCE** tab — the muscle-group
  volume/balance view; confirm the final label at build. Doc 09 previously
  "removed the Volume stats tab" — reconcile the wording with 08/09 before
  shipping.)*
- **OVERVIEW becomes a read-only "plan" view** — the meso **planner board rendered
  in non-edit mode** (view the plan + days, not the current button stack).
- **Header styled like the day-view header** (`DayView.tsx` header pattern) for
  consistency, carrying the action affordances:
  - **Calendar button** (like the notes/history button on day view) → drops down a
    calendar view; **days are clickable** → the corresponding **day view** if the
    cycle is active, or the corresponding **plan view** if it's planned.
  - **Share button** gets its own header button alongside calendar.
  - **⋮ menu** (like day view) holds the rest: **Edit** (→ opens the planner board
    in edit mode), **Save as template**, **Delete**.
- **Quick win regardless / independent:** fix the stale "VOLUME" label on the
  current MESO STATS link if this ships incrementally.
**Size:** large — subsumes M8 (meso side) and the meso surface direction from 08/09
(fig 2.5). Record rule-8 deviations (no exact mockup for the reworked header/menu)
in `docs/PROGRESS.md`. → **ready (large; sequence the stats content after R14).**

## P17 — Remove back-button when day dropdown picks a new day · **DONE (PR #104, 2026-07-02)**
Shipped: `/log/[workoutId]` renders no back link. Original scope below.
Back link `src/app/(app)/log/[workoutId]/page.tsx:45-50` (`‹ WORKOUT`); navigator
`DayHeader` in `DayView.tsx` L268–476, day-chip `Link` L432–438. The `/workout`
root has no back button, but navigating to `/log/{workoutId}` **unconditionally**
prepends `‹ WORKOUT`. **Decision:** **option 2** — the day navigator lives inside
the Workout tab; the day view shows **no back button** (selecting a day isn't a
"page" change practically). Owner also surfaced a **new** deep-link concern →
**N4** below (return-to-origin when you deep-link out to "view exercise" and back).
→ **ready.**

## N4 — Back navigation should return to origin (deep-link) · **DONE (PR #104, 2026-07-02)**
Shipped: "View exercise" carries `?from=/log/<id>`; the exercise page
validates the path and points its back control there. Original scope below.
Surfaced in the P17 decision (owner's "option 3" for deep-links). When you click
through the day view to **"view exercise"** (`/exercises/[id]`), the back control
returns to the **exercises list**, not the day view you came from. **Fix:** carry
the originating route (referrer param / client state) so back lands where you came
from. Pairs with P17 (P17 removes the in-tab back button; N4 fixes back for the
genuine deep-link case). → **ready.**

## P18 — Remove the set-type option from the set menu · **UX / trivial · DONE (PR #103, 2026-07-02)**
`DayView.tsx` `SetRow` menu L1439–1443 (Add-below / **Set type** / Skip / Delete);
"Set type" toggles `dropPending` STRAIGHT↔DROP, consumed as `set_type` at log time
(L1272) with a DROP badge (L1405–1409). **Decision:** **hide the menu affordance
only** — leave the `set_type` data model dormant (owner: drop-set UX was never
worked out; may revisit later). Existing DROP badges/data stay intact; just remove
the menu item. Record the deviation in `docs/PROGRESS.md`. → **shipped PR #103**
(menu row hidden; model dormant; PROGRESS 2026-07-02).

## P20 — Live-filter exercise search · **UX / small**
`src/app/(app)/exercises/page.tsx` (`ExercisesPage`): text search is
**server-driven** (`<form method="get">` → `?q=`, L80–90; needs submit/Enter),
while the MUSCLE/EQUIP axes already filter in memory (`exercises.filter(...)`,
L44–48). **Fix:** add a client wrapper that live-filters the loaded list (mirrors
the existing axis pattern). **Open question:** server `q` currently bounds the
equipment chips and the "N OF M" count — pure client filtering changes those
denominators. Minor; **near-ready.**

## P19 — Over/under-prescription marker on logged sets · **F / small**
Logged-set rendering is in `DayView.tsx` `SetRow` (prescription is already in
context for the row). Add a small marker comparing logged vs prescribed
reps/weight. Needs the over/under rule defined (reps? weight? e1RM?). **Mostly
ready**, pending the comparison rule + a mockup glyph.

## PH26 — Settings page cleanup · **UX / small**
`src/app/(app)/more/page.tsx` (`MorePage`): SETTINGS list = Units, Theme, **Match
weight** (L93–101), AI connector, **Export** (L111–120), **Delete account**
(L121–129; subpage already at `more/delete-account`), Sign out, version. **Fix:**
create one sub-page route, move the three rows (match-weight/export/delete), leave
a single Link. New page must also fetch `profile` (auto_match read L100). Confirm
sub-page name/grouping. **Near-ready.**

## PH27 — Template share-code into the New Template button · **F / small**
`src/app/(app)/templates/page.tsx`: "+ NEW" L40–47 is a `<form
action={startScratchDraftAction}>` (opens a planner-board draft, **not** a
new-template form); redeem via `src/components/RedeemForm.tsx` (templates/page.tsx
L64 → `acceptShareCodeAction`, 8-char code). The note wants a tray (blank template
vs enter code) like the create-meso flow. **Open question:** "+ NEW" already
routes through the shared planner draft (`getDraftMeso`); a real new-template
form needs care around shared-draft semantics. Small–medium; **near-ready.**

## PH28 — Profile height entered in cm, ignores units · **B / medium**
`src/app/(app)/more/profile/ProfileEditor.tsx` (+ `more/profile/actions.ts`,
`UnitsToggle.tsx`). Height is **always entered in cm** (`height_cm`, hard-coded
"CENTIMETERS" subtitle L354–356, validated 90–250); display converts cm→ft/in only
when `units !== "kg"` (`formatHeight`, duplicated in ProfileEditor.tsx:61-66 **and**
more/page.tsx:10-15). There is **no `height_unit` column** — height display is keyed
off the weight unit. **Fix:** keep canonical `height_cm` storage; make the input
unit-aware (ft/in when imperial) + dynamic field meta; update **both** copies of
`formatHeight`; adjust validation bounds. **Decision:** imply height unit from
`units` (current model) or add an independent preference (migration + RLS)? →
mostly **ready** if we imply from `units`; **needs-input** if a separate pref.

## PH35 — Application error on auto match weights · **B / small**
Toggle `src/app/(app)/more/AutoMatchToggle.tsx` → `setAutoMatchWeights`
(more/actions.ts:24-34); matching logic `setPlannedSetWeight`
(`src/lib/queries/logging.ts:675-711`). **Likely root cause:** `setPlannedSetWeight`
uses `.single()` (L682–687) and rethrows on no-row/RLS-hidden row; the
`persistPlannedWeight` → `updateSetWeightAction` path in DayView (L1243–1253) calls
it **without** the try/catch that wraps `logSetAction` (L1206–1217), so a throw
hits the Next.js error page. **Repro:** auto-match on → edit a planned (unlogged)
set's weight. Small once reproduced. **Ready to build** (repro + guard the throw /
use `.maybeSingle()`).

## PH36 — Model & increment settings for bodyweight-only exercises · **B/Q / medium**
Needs investigation: how do the engine model and `weight_increment` behave when an
exercise is bodyweight-only (no external load)? Likely interacts with the
per-exercise increment override (I13) and `seedMeso` (null weight). Start by
reproducing with a bodyweight exercise; scope after. **triaged, needs repro.**

## PH34 — Meso-stats "planned sets" off mid-meso · **done (PR #84)**
**Built** (owner ruled autoregulated projection): pure `projectWeekSets`
(`queries/volume-projection.ts`) carries the last materialized week's set count
forward, deload-scaled, for unmaterialized weeks; wired into `buildVolumeMatrix`
(stats) and `get_muscle_group_volume` (MCP, `projected` status) — one definition,
no SQL migration. Original scope below for the record.

Confirmed a real defect rooted in **lazy week materialization**. `startMeso`
(`queries/generation.ts:317-374`) creates microcycle rows for every week but
`workout_exercises` only for week 1; future weeks are generated one at a time by
`generateDay` (`queries/progression.ts:319-374`) **only after the prior week's same
day completes**. So `v_meso_week_sets`
(`supabase/migrations/20260617000003_metric_truth_view_fixes.sql:119-149`, sums
`prescribed_sets` per week×muscle_group) **has no rows for unmaterialized future
weeks**. Two shared surfaces then diverge: `buildVolumeMatrix`/`buildBalance`
(`queries/stats.ts:158-262`) substitute the static planner baseline
(`meso_exercises.initial_sets`, ignores autoregulation) and the Balance "AVG SETS/WEEK
— PLANNED" bar averages logged+planned together; the MCP `get_muscle_group_volume`
(`mcp/tools/read.ts:586-645`) instead reports those weeks `null`/`not_yet_generated`.
That mismatch is the "off from actual when partly complete" symptom and a
CLAUDE.md "one definition of progress" violation. **Decision gate (owner):** what is
"planned" for an unmaterialized week — (a) static planner baseline, (b) an
**autoregulated projection** (needs a batch projector generalizing
`projectNextPrescription`, `progression.ts:926`), or (c) count only materialized weeks
and label the rest "not yet planned"? Then a **new append-only view migration** (+
`security_invoker`/RLS test, hard rules #1/#2) read by **both** `stats.ts` and
`read.ts`. Separate but adjacent: the view credits whole `prescribed_sets` to one
`muscle_group_id` (no fractional 1.0/0.5 per doc 10 §2) — decide whether to fold the
fractional rule in at the same rewrite. → **needs-input**, then medium build.

## PH33 — Scope admin MCP tools private · **F / small · DONE (PR #103, 2026-07-02)**
`src/lib/mcp/tools/index.ts:53-60` registers all surfaces incl.
`registerAdminTools` unconditionally; per-call gate `resolveAdmin`
(`admin.ts:38-46`) throws unless `profile.role === "admin"`, plus RLS
`public.is_admin()`. So admin tools are **denied at invocation** (defense in
depth) but **listable** to everyone. Doc 05 says "hidden/denied" — denied is
satisfied. Hiding from `tools/list` for non-admins is a small cosmetic
improvement, not spec-required. **Decision (2026-07-02):** owner wants them
**admin-only visible** ("not a security thing, but I don't want other clients
really to see them and ask why they cant use them too"). → **shipped PR #103:**
`mcp/visibility.ts` wraps the SDK tools/list handler with a `profiles.role`
filter (per-call `resolveAdmin` denial unchanged).

## I13 — Per-exercise, per-user weight increment · **verify-done**
Shipped 2026-06-21 (PROGRESS.md): `exercise_param_overrides.weight_increment`
(per-user, per-exercise), CUSTOM picker on the Exercise page,
`setIncrementOverrideAction` validates `(0,1000]`, folded into
`params.rounding/increment` via `resolveEffectiveParams`. **Action:** confirm it
fully satisfies the note (per-user isolation, machine-specific steps), then close.

---

# Batch 5 (2026-07-03) — scoped at intake

## N5 — Replace-exercise: first set keeps the old exercise's numbers · **B / trivial-small · DONE (PR #131, 2026-07-03)**
Shipped via the first (lowest-risk) option below: the `SetRow` key now includes
`we.exercise_id`, so a replace remounts the rows and set 1 re-initializes from
the new prescription. Original scope below for the record.
PH38's recurrence, but a **different mechanism** — the PR #84 fix
(`replaceWorkoutExercise` clears `set_weights: {}` on swap,
`src/lib/queries/logging.ts:756,763`) is intact, and the new prescription is
seeded synchronously (`logging.ts:753-762`). The stale value is **retained client
`useState`**: only the "next" row (set 1 of an unstarted exercise) renders
editable state (`DayView.tsx:1336-1337`); sets 2+ are `staticCells` derived from
props every render (`DayView.tsx:1465,1538-1547`) — hence first-set-only.
Neither the card (`key={we.id}`, `DayView.tsx:360` — the WE row id survives a
replace) nor the row (`key={`${setNumber}-${logged?.id ?? "open"}`}`,
`DayView.tsx:1042`) remounts on swap, and the planned-input re-sync effect
(`DayView.tsx:1381-1387`) deps are `[plannedWeight, we.bodyweight]` — both
`null`/unchanged across the swap (no per-set overrides on an unstarted slot), so
it never fires; `prescribedWeight/Reps/exercise_id` aren't in the deps. "Reset to
prescription" fixes it only because the user's manual edit first writes
`set_weights["1"]`, so the clear produces a real `plannedWeight` transition that
finally triggers adoption. **Fix (pick one):** include `we.exercise_id` in the
`SetRow` key (remount on swap — lowest risk), or add it to the re-sync deps
(guard `adoptServerRowState` holds: `edited.current` is false on a fresh swap).

## N6 — Pull-to-refresh · **F / small · DONE (PR #132, 2026-07-03)**
Shipped as scoped: `PullToRefresh` wrapper in `(app)/layout.tsx`, gesture gated
to `scrollY === 0`, `router.refresh()` in a transition, plus
`overscroll-behavior-y: contain`. Original scope below for the record.
Nothing exists (no PTR component, no gesture handler, no
`overscroll-behavior` anywhere). Native pull-to-refresh is gone because the app
runs as an installed standalone PWA (`src/app/layout.tsx:55,59-71`). The shell
has **no dedicated scroll container** — the document scrolls
(`src/app/(app)/layout.tsx:15-22`), and there is no `cycles/layout.tsx`, so **one
shared client component wrapped around `{children}` in `(app)/layout.tsx` covers
the day view and the entire `/cycles/**` tree at once**: touchstart/move/end
gated to `scrollTop === 0`, threshold + spinner, `router.refresh()` inside a
`useTransition` for the pending cue (~60-100 lines). Optionally add
`overscroll-behavior-y: contain` (`src/styles/globals.css:53`) to avoid gesture
conflict.

## N7 — Note-sheet scroll position drifts after keyboard · **UX / small · DONE (PR #131, 2026-07-03)**
Shipped exactly as scoped (`position:fixed` lock + exact restore; paddingRight
compensation and `lockCount` kept). Original scope below for the record.
Root cause: the shared scroll lock never saves/restores `scrollY`.
`src/components/ui/useScrollLock.ts:11-33` only sets `body overflow:hidden` (+
scrollbar padding); on an installed iOS PWA that doesn't pin the offset, so the
soft keyboard (NoteSheet's `<textarea autoFocus>`, `DayView.tsx:1873-1881`)
shifts the document and nothing restores it — `useModalA11y` restores focus with
`preventScroll: true` (`useModalA11y.ts:96`) but not scroll. **Fix in one file
(covers every sheet/menu):** `lock()` captures `window.scrollY` + applies
`position:fixed; top:-scrollY; width:100%` to body; `unlock()` restores and
`window.scrollTo(0, saved)`. Mind the existing `paddingRight` compensation and
the `lockCount` ref-count for stacked overlays.

## N8 — Meso badges: PLANNED badge, checkbox only when complete, mute future · **UX / small · DONE (PR #131, 2026-07-03)**
Shipped on both surfaces (badge in ink = the owner's "white" under the dark
inversion); fig 2.1/2.2 delta recorded in 09 (2026-07-03 entry). Original
scope below for the record.
Meso statuses: `draft|unplanned|planned|active|completed|abandoned`
(`src/lib/types/database.ts:191-197`). **The owner's description (orange CURRENT
badge + checkbox) matches the `/cycles` list page**, `StatusMark`
(`cycles/page.tsx:29-43`): completed = ✓ filled box, active = orange CURRENT
text badge (`:36-41` — the exact style to mirror in white), **everything else
incl. planned = empty checkbox** (`:42`, the offender). `+ PLAN` for unplanned at
`:63-84`; muting today applies to `unplanned` only (`:67,92`). The macro overview
timeline (`macro/[macroId]/page.tsx`) uses a different vocabulary —
`TimelineMark` numbered/dashed boxes + ✓ (`:68-86`), sub-labels DONE/IN
PROGRESS/PLANNED (`:232-241`), muting again unplanned-only (`:247,251-261`).
**Changes:** `/cycles` `StatusMark`: planned → white "PLANNED" text badge
(CURRENT's geometry, `border-ink`/white), checkbox reserved for completed;
widen the muted branch to `planned` + `unplanned` (only active/completed full
ink). **Macro timeline — decided (owner, 2026-07-03 addendum):** keep the
numbered `TimelineMark` vocabulary, but for **planned** mesos swap the
right-side progress bar (`macro/[macroId]/page.tsx:287-295` — today `bg-ink/15`
on future rows) for the white PLANNED badge; adopt the same muting scheme
(widen `:247,251-261` so planned + unplanned mute, only active/completed full
ink). Unplanned timeline rows keep `+ PLAN` (`:265-279`) as is. Check fig 2.x
mockups (rule 8) before build.

## N9 — Macro Performance: muscle-group primary + exercise drill-down · **F / medium · DONE (PR #132, 2026-07-03)**
Shipped as scoped (`contributors[]` on the rollup + new `MuscleStrengthSection`
drill-down; components split so the meso side stayed independent). Original
scope below for the record.
Macro Performance tab renders only `StrengthProgressSection`
(`macro/[macroId]/page.tsx:341-346`; component
`src/components/stats/StrengthProgress.tsx:14-91`): flat per-exercise list (I11)
at `:24-62` — **the part to demote** — and the PH37 muscle-group grid at
`:64-88` — **the part to promote + make expandable**. Data:
`getMacroStats` → `buildStrengthProgress` (`stats.ts:232-245`) →
`rollupMuscleProgress` (`stats.ts:160-191`) which **already iterates the
per-exercise attribution** (`getExerciseMuscleLinks`, `stats.ts:194-223`;
role-weighted 1.0/0.5) but discards it — `MuscleGroupProgress`
(`stats.ts:140-146`) keeps only a count. **Plan:** extend the rollup to carry
`contributors: {exercise_id, name, score_pct, role, sessions}[]` (~20 lines),
then a new expandable macro Performance layout (client expand/collapse,
~60-100 lines). An exercise appearing under several groups is expected
(fractional credit). **Caution:** `StrengthProgressSection` is shared with the
meso tab (`MesoStatsViews.tsx:310`) — branch by scope or split components so the
meso side (N10) is trimmed independently. Ship with N10.

## N10 — Meso Performance: drop top-sets-by-week + across-macro sections · **F / small-medium · DONE (PR #132, 2026-07-03)**
Shipped as scoped; the flagged `keyLifts[0]` → `contextLine` coupling was cut
by re-deriving the meso position from the macro's meso ordering. Original
scope below for the record.
Both in `PerformanceView` (`src/components/stats/MesoStatsViews.tsx:198-336`):
"TOP SET BY WEEK — KEY LIFTS" at `:208-253` (data `buildKeyLifts`,
`stats.ts:483-531`, fed by a dedicated `logged_sets` top-set query+fold,
`stats.ts:658-691`) and "ACROSS MACRO — {lift} EST. 1RM" at `:255-307` (data
block `stats.ts:693-756`, `MacroChartBar` `stats.ts:295-299`). What stays:
`StrengthProgressSection` (`:309-313`) + PRS THIS MESO (`:315-333`). Net
deletion ~150-200 lines. **Coupling caution:** `keyLifts[0]` picks the macro
chart's lead lift (`stats.ts:719-721`) and feeds `mesoPosition`/`contextLine`
(`stats.ts:737,811-817`) — re-derive or drop `contextLine`'s meso-position bit
when retiring `buildKeyLifts`. Ship with N9.

## N11 — Deload sets show ▼ at exactly-prescribed performance · **B / trivial · DONE (PR #131, 2026-07-03)**
Shipped as scoped: marker extracted to pure `day-rules.ts::loggedSetMarker`,
compares at equal RIR when unreported; 6 unit tests. Original scope below for
the record.
Marker memo: `DayView.tsx:1484-1519` (render `:1613-1626`), ±1.5% band. **The
comparison is RIR-asymmetric:** prescription side
`estimateE1rm(prescribedEff, prescribedReps, targetRir, …)` (`:1489-1493`) bakes
in the week's target RIR — on a deload that's `params.deload.target_rir` (~6,
`engine/rules/deload.ts:32`), the largest in the ramp; logged side uses
`logged.rir_reported` (`:1497-1501`) which the quick LOG button always writes as
`null` (`DayView.tsx:1434`) → treated as RIR 0 (`engine/predict.ts:104-118`,
monotonic in RIR). So identical weight+reps yields `loggedE1rm ≪
prescriptionE1rm` → ▼. Deloads maximize the gap; working weeks carry a smaller
version of the same skew. **Fix (1-3 lines):** compare at equal RIR when
unreported — `logged.rir_reported ?? targetRir` on the logged side (or compute
the prescribed side at the same assumed RIR). Consider extracting the memo into
pure `day-rules.ts` so it's unit-testable (it isn't today).

## N12 — Set logging slow; spinner sometimes never resolves · **B / medium · DONE (PR #132, 2026-07-03)**
Shipped: stamp chain → 1 embedded read + conditional flip; gate watermark →
closed-workouts-only (first set no longer busts it); spinner decoupled from the
revalidation commit (action-tracked, 15s watchdog, `ack` + row-remount echo).
`revalidatePath` narrowing (#5) and `select("*")` narrowing (#6) assessed and
deferred with reasons — see `J-performance.md`. Original scope below for the
record. Two compounding halves, both scoped:
- **Latency:** `logSetAction` (`actions.ts:94-136`) → `logSet`
  (`logging.ts:359-452`) does **4 serial SELECTs** (WE→workout→micro→meso stamp
  chain, `:382-405`) before the upsert + a conditional `in_progress` flip
  (`:444-449`) ≈ ~6 sequential round-trips per set; then `revalidatePath` on
  BOTH `/log/{id}` and `/workout` re-runs the page: `getWorkoutDetail` (+
  `select("*")` hot paths) + `ensureFreshPrescriptions`. **The first set of
  every session busts the reconcile gate** — the `in_progress` flip bumps
  `workouts.updated_at`, which is the gate's completed-work watermark
  (`regeneration.ts:441-444,502-514`) → that log pays the full ~8-10-round-trip
  reconcile; later sets still pay the 2-round-trip signature load.
- **Hang:** the spinner is `useTransition` pending (`DayView.tsx:1344-1362`,
  `runLog`) which resolves only when the **revalidation RSC re-render commits
  client-side** — the upsert itself lands early and independently. A stalled
  RSC fetch (or app backgrounded mid-flight) leaves the transition pending
  forever with no timeout/AbortController; navigating away and back re-reads
  fresh state, which is exactly the reported symptom.
- **Levers:** collapse the 4-hop stamp chain to one join; exempt the pure-log
  path's own status flip from the gate watermark (or stamp the signature after
  the flip); narrow `revalidatePath` → tags (J-performance Phase 2 #5) + narrow
  the `getWorkoutDetail` selects (#6); acknowledge the write optimistically
  (clear/decouple the spinner on server-action resolve rather than on
  revalidation commit). Overlaps WS-J — build as a WS-J slice with N1's Phase 2
  deferred items.

---

## I12 — in-app planner UX (scoped 2026-07-03, session 40)

**MCP authoring side shipped** (PROGRESS 2026-07-01); the in-app delta was
scoped this session against the code. Key finding: the MCP tools are thin
wrappers over query-layer helpers (`queries/cycles.ts`, `queries/macro.ts`)
that the app UI mostly doesn't call yet — the remaining work is **pure UI**
over existing, RLS-safe mutations. Gap table (in-app status as of PR #134):

| Operation | Helper (exists) | In-app status |
|---|---|---|
| Create/edit macro, engine, + PLAN a slot, planner board structure editing | — | **full** (figs 2.1–2.8) — richer than MCP |
| Duplicate a meso | `duplicateMesocycle` (cycles.ts:560) | **done (PR #134):** ⋮ menu "Duplicate mesocycle" → new standalone planned meso |
| Sequential-activation gate surfaced proactively | pure `mesoActivationBlock` (generation.ts:266) | **done (PR #134):** StartMesoForm renders disabled + reason (live block / unfinished earlier siblings); server still re-checks |
| Attach a standalone meso into a macro position | `attachMesoToMacro` (macro.ts:487) | **missing** — all creation paths land standalone; `NewCycleButton` copy even steers users to + PLAN instead. Needs a macro+position picker (no mockup figure → needs a 09 delta or owner design input) |
| Seed a macro slot from template/copy | `copyMesoStructure` / `applyTemplateToMeso` | **missing** — + PLAN always opens a blank board; template/copy sources exist only for standalone drafts |
| Add/remove/reorder macro slots directly | `manageMacroSlots` (macro.ts:615) | **indirect only** (EditMacroForm duration/meso-length re-plan); no direct controls on the macro timeline; reorder has no UI at all (no figure → design input) |
| Edit meso header after finalize (name/weeks/RIR/deload/phase) | `updateMesocycleAttrs` (cycles.ts:214) | **missing** — FinalizeSheet sets name+weeks at draft time only; RIR ramp read-only everywhere (no figure → design input) |
| Plan-time volume preview (fractional weekly sets vs landmarks) | aggregation lives in `mcp/tools/authoring.ts:73` — **needs relocation to shared code** first | **missing** — Balance tab needs materialized weeks, so drafts/planned mesos show nothing |

**Built 2026-07-03 (PR #137, owner-authorized design — 09 session-4 entry is
the design of record):** place-into-macro sheet (default placement; explicit
position stays MCP-only), edit-details sheet (`updateMesocycleAttrs` guards),
BLOCKS management on the macro edit page (`manageMacroSlots`), and the
planner-board WEEKLY SETS readout (fold relocated to
`lib/plan/volume-preview.ts` — one counting definition across board / Balance
tab / MCP preview). I12 is closed; seed-slot-from-template/copy was assessed
and left out (duplicate + place composes to the same outcome in two taps).

## Batch 7 items (scoped 2026-07-04, session 42 — 4 parallel passes)

### N14 — Macro muscle-group rollup shows bogus "starting e1RM of 7" · **B / small–medium**

Chain: `getMacroStats` (`src/lib/queries/stats.ts:729-803`) → `getProgressScores`
(`stats.ts:100-126`) → `foldProgressScores` (`stats.ts:61-97`) → `rollupMuscleProgress`
(`stats.ts:170-213`) → `MuscleStrengthSection.tsx:82-90`. `first_e1rm` is the
session-average e1RM of the **single chronologically-first** non-deload session in
the window — no minimum, no outlier guard. A 7-lb value implies one unrepresentative
early session (reps-in-weight-field, technique set, machine-level mis-log) defining
the %-change denominator. Every other strength surface uses `max` (PRs), so the bad
set is invisible elsewhere. **Why it's "nowhere in history":** the history sheet caps
at `.limit(120)` sets (`src/lib/queries/history.ts:84`) — 18 months of macro
truncates the earliest sessions out of view — and history defaults to sets/reps
(bodyweight lifts show effective load, never raw e1RM). **Fix:** robust endpoints in
`foldProgressScores` (median of first/last-N qualifying sessions, or outlier drop vs
the window median); align/lift the history cap so rollup and history agree on what
exists. Small for the pure-fold guard (covered by `stats.test.ts`); medium if adding
server-side data-hygiene detection of the offending sets.

### N16 — "EST. STRENGTH · KEY LIFTS" contradicts the Performance tab · **B / small–medium · related N14**

The tile is the macro **OVERVIEW** stat (`cycles/macro/[macroId]/page.tsx:323-326`),
fed by a **separate bespoke fold** in `buildMacroStats` (`src/lib/queries/macro.ts:844-902`):
first/last per exercise **with deloads included** (never consults
`microcycles.is_deload`), then means the **3 most-logged** exercises — no ≥3-session
qualification, no role weighting. The Performance tab (`getProgressScores`) excludes
deloads and averages all qualifying exercises. A cut whose last logged week is a
deload reads strongly negative (-36.3%) while Performance stays positive — leading
hypothesis. Same single-endpoint fragility as N14, amplified by n=3. **Fix:** delete
the bespoke fold; derive the tile from the qualified pipeline (deload-filtered,
qualifying exercises — top-3 by frequency or the overall mean), one definition with
the Performance tab. Regression test: deload-tail case in `stats.test.ts`.

### N15 — Drill down from macro muscle groups to a scoped exercise history (e1RM-first) · **F / medium · sequence after N14/N16**

Contributor rows in `MuscleStrengthSection.tsx:70-100` are static — not links. The
PH32 flip component exists (`src/components/ExerciseHistoryList.tsx:24-33,71`;
default `flipped=false` = sets/reps) and `HistorySheet`
(`src/components/HistorySheet.tsx:35`) opens on an exercise target — but
`getExerciseHistory` (`history.ts:72-170`) takes only `exerciseId`, unscoped, capped
120 sets. **Build:** (a) contributor rows open `HistorySheet`; (b) optional
`mesoIds`/date-window param threaded `HistorySheet → getExerciseHistoryAction →
getExerciseHistory` (lift the cap within a bounded window); (c) `initialView` prop on
`ExerciseHistoryList` so this entry point defaults to e1RM, tap to flip to sets/reps
(owner wants the inverse of the current default). `HistorySheetTarget.equipment_type`
needs sourcing onto `MuscleGroupContributor` (small extra join).

### N21 — "Realistic" macro targets: audited; hide from both macro views · **Q→D / hide = small · fix = large**

Engine: `planMacrocycle`/`computeTarget` (`src/lib/engine/macro.ts:234-364`), spec
doc 10 §5. Bucket = training-years else self-reported (`macro.ts:89-96`). **Audit
smells:** the strength target is bucket-only — `ageMultiplier`/`sexFactor` apply
**only** to hypertrophy (`macro.ts:345`); hypertrophy flips discontinuously between
FFMI-proximity and training-age-decay models depending on whether body comp is fully
set (`macro.ts:378-388`); cut compounding + separate cap can collapse the low/high
range (`macro.ts:325-326`). All `estimate: true`, informational-only (no
progress-vs-target tracking per spec §5). **Hide (the owner's interim call):** remove
the `REALISTIC TARGET` card (`cycles/macro/[macroId]/page.tsx:182-220` + helpers
`:30-60,127-128`) and the create-flow `YOUR TARGET` card + rationale
(`CreateMacroForm.tsx:227-278,299-301`) — but **keep** `plan.mesoCount`/`plan.phases`
/`durationMonths` (timeline + phase strip depend on them) and leave
`planMacrocycle` + the persisted `target_*` columns in place so re-enabling is a pure
view change. Don't conflate with the N16 tile — separate metric. Correcting the
target engine itself is a later, large item (needs-decision after the hide ships).

### N17 — Planner: edit # of sets per exercise · **F / small**

The model + persistence already exist end-to-end: `meso_exercises.initial_sets`
(schema `20260611000001:240`, 1–20 check) → `ViewFill.initial_sets`
(`PlannerBoard.tsx:80`) → day readout + volume fold (`:639-644,652-656`) → `doSave`
serialises it (`:591-596`) → seeds the engine as the week-1 `initial.sets`
(`src/lib/queries/generation.ts:88-145`); after week 1 the set-progression takes
over. Today it renders read-only ("START n SETS", `PlannerBoard.tsx:789-795`) and is
hardcoded to 3 at pick time (`planGroupExercises(current, ids, 3)`,
`PlannerBoard.tsx:397-403`, `src/lib/planner/groups.ts:78-98`). **Only the UI control
is missing:** −/＋ stepper on each filled row (`:750-806`) with a `setFillSets`
mutator mirroring `updateGroupSlots` (`:350-366`); draft/live path needs a small
server action to write `initial_sets`. Clamp 1–20.

### N18 — RIR ramp in the create panel + per-week RIR · **F / A = small, B = medium-large**

Create's `FinalizeSheet` exposes only NAME+WEEKS; ramp is read-only
(`PlannerBoard.tsx:1117-1214,1189-1191`; `finalizeMesoAction` accepts only
`{meso_id,name,weeks}`, `cycles/actions.ts:201-227`). The Edit-details sheet already
has the full segmented grammar gated pre-start (`MesoHeader.tsx:513-665`).
**Part A (small):** collapsed "advanced" disclosure in `FinalizeSheet` reusing the
Edit-details START/END RIR + deload controls; thread through `finalizeSchema` +
`finalizeDraftMeso`. Defaults stay standard — matches the owner's "deep option, no
badgering". **Part B (medium-large):** per-week independent RIR is **not
representable today** — `microcycles.target_rir` rows are derived at activation by
`rirRamp()` linear interpolation (`src/lib/engine/rules/rir.ts:14-45`;
`generation.ts:391-431`). Needs a `rir_schedule` override column (or materialized
editable micros) consumed by `rirRamp`, a week-by-week editor behind the same
disclosure, and doc-14 fingerprint scoping (per-week RIR edits are the framework's
literal worked example — docs/14:137-149,184). Ship A now; B is its own slice.

### N19 — Archive macros/mesos; never full-delete · **F / medium · HIGH (data-loss surface)**

**Current deletes:** app meso ⋮ → "Delete mesocycle" (`MesoHeader.tsx:394-477`) →
`deleteMesoAction` (`cycles/actions.ts:674-680`) → raw `.delete()`
(`cycles.ts:923-934`) — **cascades logged_sets** (schema `:346-348`), gated only by
an ack checkbox; copy says "permanently deletes … can't be undone". This violates
hard rule #5's spirit; MCP is already history-safe (`write.ts:626-652` refuses when
`loggedSets>0`; macro delete MCP-only, `write.ts:654-688`). Macro has **no** app
delete/archive UI at all. **Build:** nullable `archived_at` on both tables (orthogonal
to lifecycle status — a completed meso stays completed while archived; don't reuse
the macro enum's unused `archived` value) + partial index; archive/unarchive
queries + actions; relabel the meso delete sheet to archive (drop the erase ack);
`deleteMesocycle` survives only for the draft-discard path. Exclude
`archived_at is not null` from: `getCyclesOverview` (`cycles.ts:45-60`),
`listCopyableMesos` (`:395-407`), `getCurrentState` (`:948-960`), `getDraftMeso`
(`:125-139`), place-target lookups, MCP `get_macrocycles`/`get_mesocycle`. Surface:
new deep page `/more/archive` (PH26's sub-page pattern) with view + unarchive.
Macro-side archive action wants the N24 header (soft dependency). Optionally add MCP
`archive_*` tools; keep `delete_*` for truly-empty blocks only.

### N20 — Enter share code in the new-cycle tray · **UX / trivial**

`NewCycleButton` (`cycles/NewCycleButton.tsx`) is link-only; the template tray
already mounts the generic `<RedeemForm/>` (`templates/NewTemplateButton.tsx:47-50`),
and redeem already routes meso codes (`DESTINATION.mesocycle → /cycles/meso/{id}`,
`src/components/RedeemForm.tsx:7-11`; `acceptShareCode` copy-on-accept,
`sharing.ts:142-159`). Drop the same divider + `<RedeemForm/>` into the tray. Ship
with N23's tray work.

### N22 — Exercise page overhaul: real header + surfaced increment · **F+UX / medium**

**Premise check: the increment setting already ships (I13)** —
`ExerciseSettingsMenu` "Load step" sheet behind the bare `⋯`
(`exercises/[exerciseId]/page.tsx:156-162`; `ExerciseSettingsMenu.tsx:36-201`;
`setIncrementOverrideAction`, `exercises/actions.ts:47-84`; table
`exercise_param_overrides`). It feels absent because the trigger is a faint
`text-ink/45` glyph and is **hidden entirely on bodyweight-only lifts**
(`showLoadStep`, page `:119-123`). **Build:** `ExerciseHeader` client component
mirroring `MesoHeader`'s grammar (sticky brand row keeping the N4 `?from=` back
link, title + CUSTOM badge, icon cluster [share][⋮]) on the shared
`AnchoredMenu`/`MenuRow` (`components/ui/AnchoredMenu.tsx` — already the single
implementation). ⋮ rows: Load step (refactor `ExerciseSettingsMenu` to be
menu-driven; show disabled on bodyweight-only rather than vanishing), share
(owned custom only — move `ShareRow` out of the OVERVIEW tab bottom, page
`:302-304`), delete custom exercise (query `deleteCustomExercise` exists,
`exercises.ts:260`; **no app action/UI today** — new action + confirm sheet; or
fold into N19's archive philosophy). No mockup figure → owner-authorized design
delta (09 entry at build time). Rest of page (tabs, bests grid, chart) stays.

### N23 — Exercise sharing end-to-end · **F / small · ship with N22**

**Premise check: sharing already works end-to-end.** `ShareObjectType` includes
`"exercise"` (`sharing.ts:7`); create via `ShareRow` on owned custom exercises
(page `:302-304`); `acceptShareCode` deep-copies via `copyExercise`
(`sharing.ts:121-129,168-227`); codes are untyped random 8-char, redeem is
**kind-agnostic** and routes by stored `object_type` (`RedeemForm.tsx:7-11,27`) —
so a meso code in an "exercise field" already lands on the right page; **no
mismatch failure mode to build**. The create-form copy ("share them from the
exercise page", `NewExerciseForm.tsx:124-127`) is true for owned custom exercises —
the owner likely tested a stock exercise (correctly not shareable,
`sharing.ts:45-46`). **Real gap:** the only `RedeemForm` mount in the app is the
templates tray; exercises `+ NEW` is a bare Link (`ExercisesBrowser.tsx:67-72`).
**Build:** `NewExerciseButton` tray mirroring `NewTemplateButton` (blank exercise /
OR ADD FROM A CODE), swap the Link; N20 adds the cycles tray. Backend: nothing.

### N24 — Macrocycle views adopt the shared header · **UX / medium (small if archive/delete deferred)**

Macro overview header is a one-off (`cycles/macro/[macroId]/page.tsx:143-173`): not
sticky, no icon cluster, no ⋮; the only action is a full-width EDIT MACROCYCLE link
at the bottom of the overview tab (`:340-345`). **Build:** `MacroHeader` mirroring
`MesoHeader` (sticky brand row, title + status badge, ⋮ `AnchoredMenu`): Edit
macrocycle (existing `/edit` route), Edit goals, Archive (needs N19's new action —
ship together or sequence N19 → N24). No share button (macros aren't a
`ShareObjectType`; expanding that is out of scope). After N22+N24 the
day-view/meso/macro/exercise surfaces all share the `AnchoredMenu` header idiom —
adoption, not new infra.

### N25 — Info/help affordances for jargon · **F / medium (primitive small, breadth medium)**

Only two ad-hoc "i" explainers exist, both inside the feedback sheet
(`DayView.tsx:2482-2500` pump, `:2520-2539` workload); no shared primitive, no
glossary, no help pattern in docs 06/08. **Build:** extract `components/ui/InfoDot.tsx`
(17px "i" → BottomSheet or inline expander) backed by one glossary source
`src/lib/glossary.ts` (RIR, e1RM, MEV/MRV, deload, ramp, macro/meso/micro, pump,
workload…); migrate the two existing explainers onto it; sprinkle across the dense
surfaces (day-view target line, meso header ramp/DL, stats tabs, planner volume
readout, create/edit-details sheets, exercise page). Ship primitive + glossary
first, place incrementally. Design note for 06/08: needs a dated 09 delta at build
time (no existing pattern).

### N26 — Day-view set rows +10% · **UX / trivial**

`SetRow` in `DayView.tsx`: `cellBase` `h-[32px] … text-[14px]` (`:1444-1446` →
35px/15px), row container `py-[4px]` (`:1568` → 5px), LOG box `h-[21px] w-[21px]`
(`:1716` → 23px). The `grid-cols-[20px_1fr_1fr_44px]` template appears in **both**
the header row (`:1047`) and set row (`:1568`) — change together to stay aligned.

### N27 — Back link honors origin (meso stats from day view) · **UX / small · generalizes N4**

Producer: day-view ⋮ "Mesocycle stats" → `go(\`/cycles/meso/${mesoId}?view=balance\`)`
(`DayView.tsx:769-771`) with no origin. `MesoHeader`'s back link is hardcoded
`‹ CYCLES` (`MesoHeader.tsx:152-157`). **Fix (mirrors N4 exactly):** append
`&from=/log/${workoutId}` at the producer; meso page validates `from` with the same
`/^\/log\/[A-Za-z0-9-]+$/` guard the exercise page uses
(`exercises/[exerciseId]/page.tsx:55-65`) and passes `backHref`/`backLabel` props
into `MesoHeader`. Audit note: `planned/[week]/[day]/page.tsx:67-72` is the same
hardcode class (currently correct); exercise page is the reference implementation.

### N28 — Sort macros/mesos newest-first · **UX / verify (likely already satisfied) · needs-input**

`getCyclesOverview` already orders macrocycles AND mesocycles `created_at desc`
(`cycles.ts:51,59`) — top-level `/cycles` cards and standalone mesos are already
newest-first; within-macro ordering is intentionally chronological (`orderMesos`,
`cycles.ts:32-39`) and the macro timeline must stay so. **Question for the owner:**
which list looked wrong — or is the ask `start_date`-desc rather than
`created_at`-desc (differs when an older-created cycle starts later)?

### N29 — Template filters in the from-template picker + unified filter UI · **UX+F / picker small, unified medium**

Three divergent surfaces, zero shared components: from-template picker has **search
only** (`cycles/plan/template/page.tsx:35-43`) though `listTemplates` already
supports `{days, emphasis, gender}`; templates page uses URL-driven `<select>`s
(`templates/TemplateFilters.tsx:39-45`); exercises page uses client-state two-axis
chips (`ExercisesBrowser.tsx:84-167`); the planner's exercise picker is a third
variant (`PlannerBoard.tsx:1605-1649`). **Quick win (small):** render
`<TemplateFilters/>` in the picker + thread searchParams into `listTemplates`
(mirrors `templates/page.tsx:25-31,42-55`). **Unified (medium):** shared chip-based
`FilterBar` (the ExercisesBrowser idiom is the sleeker one) with a value/onChange
vs URL-sync adapter, consumed by templates, picker, exercises (and eventually the
planner picker). Keep two-axis AND semantics.

## Items still needing their own scoping pass (not yet researched)
- **PH30** (LLM prescription analysis) — deferred 2026-07-02; see workstream H.

> Pruned 2026-07-03: PH29/PH38 (shipped PR #84), PH31/PH32 (shipped WS-B),
> PH37 (shipped PR #104) — resolutions in `archive.md`.
