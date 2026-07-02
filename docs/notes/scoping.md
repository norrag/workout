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

## M8 — Stats unification (meso est-strength; macro 3-way toggle) · **decided → ready**
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

## P16 — Meso page rework: toggle + planner-style overview + header actions · **UX / large · decided 2026-07-02**
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

## P17 — Remove back-button when day dropdown picks a new day · **UX / small · decided 2026-07-02**
Back link `src/app/(app)/log/[workoutId]/page.tsx:45-50` (`‹ WORKOUT`); navigator
`DayHeader` in `DayView.tsx` L268–476, day-chip `Link` L432–438. The `/workout`
root has no back button, but navigating to `/log/{workoutId}` **unconditionally**
prepends `‹ WORKOUT`. **Decision:** **option 2** — the day navigator lives inside
the Workout tab; the day view shows **no back button** (selecting a day isn't a
"page" change practically). Owner also surfaced a **new** deep-link concern →
**N4** below (return-to-origin when you deep-link out to "view exercise" and back).
→ **ready.**

## N4 — Back navigation should return to origin (deep-link) · **UX / small · new 2026-07-02**
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

## Items still needing their own scoping pass (not yet researched)
- **I12** (mesocycle management under a macrocycle) — **MCP authoring side shipped**
  (PROGRESS 2026-07-01, branch `claude/mcp-mesocycle-creation-i4nica`): day-level
  meso building, macro placement/attach, header edit, duplicate, slot management,
  gated sequential activation, volume preview. Remaining scope is the **in-app**
  planner UX for the same operations.
- **PH29** (page-switch slowness + double-label glitch) — perf/UX; needs repro +
  a look at the app-shell label/loading animation.
- **PH38** (first sets/reps wrong on switch-exercise) — bug; needs repro; likely
  related to the swap-in seeding path (see A: PR24).
- **PH30** (LLM prescription analysis), **P21** (soreness-at-0-days rule),
  **PH31/PH32** (e1RM storage + tap-to-flip), **PH37** (aggregate gains) — see
  workstreams B/C/H. (**PH34** now scoped above.)
