# Scoping — UI / feature items

Codebase-grounded scope notes for the UI/feature/bug items, keyed by backlog ID.
Each entry: where it lives, current behavior, rough size, and any blocker or open
design question. Sizes: trivial / small / medium / large.

> Two recurring blockers to settle with the owner before building:
> - **Design-decision items (hard rule #8):** macro stats screen (M8), meso
>   `PLAN|STATS` toggle (P16), back-button condition (P17) have **no mockup**.
> - **Spec-conflict items:** removing the set-type affordance (P18) touches a
>   documented per-set tracking-type feature (doc 09).

---

## M9 — Macrocycle custom-duration field can't be emptied · **B / small**
`src/app/(app)/cycles/new/CreateMacroForm.tsx`, `customMonths` state (L69),
input L169–187, onChange L176–180. The onChange clamps every keystroke
(`Math.max(1, Math.min(60, Number(e.target.value) || 1))`), so `""` → `0 || 1`
→ forces `1`; the field can never be empty. **Fix:** hold a string in state,
clamp on blur/submit. Three consumers must tolerate an interim empty/NaN: hidden
`duration_months` (L101–105), live `planMacrocycle` (L87), meso-length
auto-suggest `useEffect` (L77–79). **Ready to build.**

## M10 — Show only *unplanned* mesos on macro overview · **UX / small**
`src/app/(app)/cycles/macro/[macroId]/page.tsx` (`MacroOverviewPage`),
"MESOCYCLE TIMELINE" L191–269 renders **all** mesos by `status`; unplanned rows
already have an inline `+ PLAN` form (L234–248). Filtering to
`status === "unplanned"` is small. **Open design question:** this conflicts with
09's intended full chronological ledger — is the timeline being *replaced* by a
"what's left to plan" list, or do we add a separate list? → **needs-input.**

## M8 — Stats unification (meso est-strength; macro 3-way toggle) · **mixed**
- "Est-strength under meso Performance" — **already present** in `PerformanceView`
  (`src/components/stats/MesoStatsViews.tsx:252-304`). Meso stats today is a
  2-way `BALANCE | PERFORMANCE` control (`.../meso/[mesoId]/stats/page.tsx:70-87`).
  → effectively **done**; confirm it's what the note meant.
- Macro `OVERVIEW | BALANCE | PERFORMANCE` toggle — **medium–large.** There is **no
  dedicated macro stats screen**; macro stats are 4 static inline tiles
  (`macro/[macroId]/page.tsx:271-292`, `buildMacroStats` in
  `queries/macro.ts:545-602`) and there are no balance/performance rollups at macro
  scope. **Blocker:** no mockup figure exists ("there is no 4.3") → **needs-input**
  (design decision per rule #8). Ties into workstream C.

## I14 — Unify complete-workout slider resolution · **F / medium**
Both in `src/app/(app)/log/[workoutId]/DayView.tsx`; slider =
`src/components/ui/SnapSlider.tsx`. Complete-workout `CompleteSheet` (L2253–2391),
`SESSION_SLIDERS` L2237–2251 use **max=4 (0–4, 5 points)**; per-exercise
`FeedbackSheet` (L1993–2229) uses **max=10 (0–10, 11 points)** plus discrete
joint-pain (0–3) and days-sore (0–5). **Scope:** raise session sliders to the
0–10 scale — but this touches **persisted values + engine reads + golden tests**
(hard rule #3), so it's not purely cosmetic. **Open question:** unify everything
to one scale, or just the three session sliders? Note: `FeedbackScale.tsx` exists
but is unused. → **needs-input on scope, then ready.**

## I15 / PH42 — Note icon & pencil glyph (these overlap) · **UX / trivial**
`DayView.tsx` `ExerciseBlock` icon row L727–766: order L→R is already **note
(document glyph, L728–750) → history (clock, L751–756) → menu (L757–765)** — so
the "add a note icon left of history" (I15) **already exists**. The unclear icon
(PH42) is the bare Unicode **`✎` edit pencil** shown only when a note exists
(pinned L780–788, session L800–804), low-contrast `text-ink/40`. **Fix:** swap `✎`
for a clearer inline SVG pencil matching the icon-row style; confirm fig 1.1
fidelity. **I15 is likely a no-op (already done); PH42 is the real, ready task.**

## P16 — Meso overview buttons monotonous → overview/stats toggle · **UX / medium**
`src/app/(app)/cycles/meso/[mesoId]/page.tsx` (`MesoDetailPage`): a vertical stack
of near-identical `border border-ink/35` rows (EDIT/GO-TO L239–263, MESO STATS
link L271–276 with a **stale "VOLUME" label**, SAVE AS TEMPLATE L277–287, Share,
Delete). A `PLAN | STATS` segmented pattern already exists in stats/page.tsx.
**Open question:** 08/09 specify the meso surface should be the **planner board
with a `PLAN | STATS` toggle (fig 2.5)** — the current standalone detail page
diverges. Confirm whether to implement the documented toggle. → **needs-input.**
Quick win regardless: fix the stale "VOLUME" label.

## P17 — Remove back-button when day dropdown picks a new day · **UX / small**
Back link `src/app/(app)/log/[workoutId]/page.tsx:45-50` (`‹ WORKOUT`); navigator
`DayHeader` in `DayView.tsx` L268–476, day-chip `Link` L432–438. The `/workout`
root has no back button, but navigating to `/log/{workoutId}` **unconditionally**
prepends `‹ WORKOUT`; it's route-determined, and the server component can't tell
how you arrived. **Open question — pick one:** (1) drop the back link entirely
(loses it for deep-links), (2) keep navigator links inside the `/workout` tab, or
(3) pass a param/client state. → **needs-input.**

## P18 — Remove the set-type option from the set menu · **UX / small**
`DayView.tsx` `SetRow` menu L1439–1443 (Add-below / **Set type** / Skip / Delete);
"Set type" toggles `dropPending` STRAIGHT↔DROP, consumed as `set_type` at log time
(L1272) with a DROP badge (L1405–1409). **Blocker:** per-set tracking type is a
**documented feature (doc 09)** — removing the data model conflicts with spec.
Most likely the note wants only the **menu affordance hidden**, not the column
dropped. Confirm + record deviation in `docs/PROGRESS.md`. → **needs-input** (then
trivial).

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

## PH34 — Meso-stats "planned sets" off mid-meso · **Q→B / medium · needs-input**
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

## PH33 — Scope admin MCP tools private · **F / small (optional)**
`src/lib/mcp/tools/index.ts:53-60` registers all surfaces incl.
`registerAdminTools` unconditionally; per-call gate `resolveAdmin`
(`admin.ts:38-46`) throws unless `profile.role === "admin"`, plus RLS
`public.is_admin()`. So admin tools are **denied at invocation** (defense in
depth) but **listable** to everyone. Doc 05 says "hidden/denied" — denied is
satisfied. Hiding from `tools/list` for non-admins is a small cosmetic
improvement, not spec-required. → **needs-input** (is listing-visibility actually
a problem?) — likely **low priority / near-wontfix.**

## I13 — Per-exercise, per-user weight increment · **verify-done**
Shipped 2026-06-21 (PROGRESS.md): `exercise_param_overrides.weight_increment`
(per-user, per-exercise), CUSTOM picker on the Exercise page,
`setIncrementOverrideAction` validates `(0,1000]`, folded into
`params.rounding/increment` via `resolveEffectiveParams`. **Action:** confirm it
fully satisfies the note (per-user isolation, machine-specific steps), then close.

---

## Items still needing their own scoping pass (not yet researched)
- **I12** (mesocycle management under a macrocycle) — large; needs a design pass.
- **PH29** (page-switch slowness + double-label glitch) — perf/UX; needs repro +
  a look at the app-shell label/loading animation.
- **PH38** (first sets/reps wrong on switch-exercise) — bug; needs repro; likely
  related to the swap-in seeding path (see A: PR24).
- **PH30** (LLM prescription analysis), **P21** (soreness-at-0-days rule),
  **PH31/PH32** (e1RM storage + tap-to-flip), **PH37** (aggregate gains) — see
  workstreams B/C/H. (**PH34** now scoped above.)
