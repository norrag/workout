# Triage log

Append a dated entry whenever a session moves work. Newest first.

## 2026-06-25 — Session 6: WS-I kickoff — T-I1 decided + T-I5 built (gated)

Owner reviewed Workstream I in light of the current engine state (corrected the
stale "active = v9" framing: live active is now **v12**, after v10 imperial, v11
standalone fixes, v12 rep-window round 2; the S1 anchor seed and S3/S5 fixes are
already live but **layered in front of** the still-present prior-peak branch, so all
of WS-I was still unbuilt). Confirmed v13 is a throwaway test row (disregard).

- **T-I1 — bodyweight model DECIDED (owner).** Recorded in `I-engine-v9.md`
  ("Decision: bodyweight model"). Three load types: **bodyweight-only** (profile
  bodyweight as a read-only prefilled load, cue the user, progress on reps only);
  **bodyweight-loadable** (effective load = bodyweight + added; bodyweight used in
  the calc but not shown; narrow + under-tested); **bodyweight-assisted** (negative
  weight = bodyweight − assist; same engine math; UI for entry/display deferred +
  documented if the library has no assisted exercises yet). Implies a first-class
  **load-type** column and **user bodyweight as an engine input**. Unblocks T-I2.
- **T-I5 — prior-peak seed retirement BUILT (gated, inactive).** New
  `retire_prior_peak_seed` `.optional()` param; `seedMeso` skips the
  `priorPeak × meso_seed_backoff_pct` branch when set, so seed precedence becomes
  **confident anchor → user `initial_*` → unseeded (null weight, prompt the user)**.
  Shipped as **engine_params v14, INACTIVE** (`20260625000001`), byte-identical to
  v12 plus the flag — pre-v14 rows parse unchanged (hash/replay/fingerprint
  untouched, guarded). `meso_seed_backoff_pct` is **left in the schema** (removing it
  would flip historical rows non-replayable); its removal + row migration stays in
  **T-I4**. Activation is the manual post-replay step (manual-operations.md). Tests:
  seed on/off matrix in `standalone-prescription.test.ts` + v14 hash guard in
  `params-provenance.test.ts`. Suite green (522), typecheck + lint clean.
- **Flagged for activation:** "unseeded" (null weight) becomes a more common live
  state — verify the planner/day view renders it as a "enter a starting weight"
  prompt (not blank/0) before activating. Engine produces the deferral; the surface
  should invite the manual seed.
- **Auditability follow-on (owner ask, → O1).** Two parts. (1) Confirmed the
  invariant "every open decision gets re-stamped to the new version on a bump, even
  when output is unchanged" already holds: `workout_exercises.params_version` advances
  on every reconcile confirmation (changed/unchanged/self-healed), and the day-view
  page runs the reconcile on every load — so it's current by view time. Lazy (on
  view) is sufficient; no eager sweep built (owner agreed). (2) **Built** the
  prescription audit reveal: the exercise `…` dropdown in the day view now has a
  "Prescription detail" row → a sheet showing decision **kind**, **verified as of
  Vx** (row stamp) vs **computed under Vy** (latest decision), and the rationale +
  trace — so a no-op version bump is visibly confirmed ("re-verified under Vx,
  unchanged since Vy"). `queries/audit.ts` + action + `PrescriptionDetailSheet`.
  Rule #8 deviation (no mockup) recorded in PROGRESS; admin-gating is an easy
  follow-up if version/kind shouldn't be user-facing.

## 2026-06-25 — Owner ruling: retire the prior-peak seed; no fabricated prescriptions

While reviewing a `replay_decisions(v12)` diff, the owner saw the "Calf Machine
seed 175×20 → 180×20" line and challenged it. Investigation (run against live
data + the branch engine) showed the diff was **not** a v12 effect: it's an old
v10 *seed* whose stored inputs carry `strengthAnchor: null` (recorded before S1),
so replay correctly fell through to the legacy `priorPeak × back-off` branch,
which carries `priorPeak.reps = 20` verbatim. The 175→180 move was the **20 lb
per-exercise increment override** (set 2026-06-24) folded into rounding by replay —
a config artifact, not engine behavior. S1's anchor seed is wired in
`generation.ts` but **hasn't run in prod** (zero seed decisions at v11).

**Decision recorded (binding):** the `priorPeak × back-off` seed and the no-anchor
*fabrication* fallback are **fundamentally broken and retired at the next
opportunity** (`T-I5`). Principle: a prescription is not produced at any cost — use
real data when available; when there isn't enough, **defer to a manual user seed**
(the user enters their own starting point), never fabricate. Seed precedence =
**confident anchor → user `initial_*` → unseeded/prompt.** This also decides `T-A4`/
`T-I3` (anchor-only; **no** hidden big-miss back-off; retire `regression_pct`).

- Recorded in [`I-engine-v9.md`](./I-engine-v9.md) (decision + principle + seed
  precedence; new `T-I5`; updated the "what would be lost" table and T-I2/T-I3),
  [`A-engine-metrics.md`](./A-engine-metrics.md) (PR25 + T-A4/T-A6 notes),
  [`backlog.md`](./backlog.md) (T-I5 + verbatim ruling + T-A4/T-I3 status), and the
  [standalone-prescription investigation](../reviews/2026-06-23-standalone-prescription-investigation.md)
  (S1 amendment: the fallback is retired, not kept).
- **No code changed this session** — documentation/decision only. T-I5 is `ready`
  and sequences ahead of / with the WS-I legacy-path deletion (T-I4).

## 2026-06-23 — Session 5: Workstream B — e1RM audit & exposure (PH31 + PH32)

Owner picked the next slice = **Workstream B** and made the two scoping calls:
store the **RIR-aware engine e1RM** per set (not raw Epley), and ship **PH31 + PH32
together**. Existing stats screens/views were left on their current raw-Epley
numbers — this slice only *adds* the engine value (keeps us out of the broader
T-A1 reconciliation).

- **PH31 — store + expose per-set e1RM.**
  - Migration `20260623130000_logged_set_e1rm.sql`: nullable `logged_sets.e1rm`,
    column comment, **backfill** of all historical working sets via the same
    formula (rir_offset read from the active engine_params row). RLS unchanged
    (policies are column-agnostic, owner-scoped).
  - Write path: `logSetAction`/`amendSetAction` compute the value with the
    engine's `estimateE1rm` (effective reps = reps + rir·offset) from active
    params and store it; amend recomputes. `logSet` input + `amendSet` patch
    gained `e1rm`; `LoggedSetRow` + the insert `Defaulted` set updated.
  - MCP: `get_exercise_history` now returns a per-session `e1rm` (session best),
    with an honesty caveat in the dataQuality note (estimate/trend, null on
    bodyweight, distinct from the view's raw-Epley e1RM).
- **PH32 — tap-to-flip history view.** `ExerciseHistoryList` gained a list-wide
  `flipped` state: tap any row to flip every row between `weight × reps` and the
  session-best `e1RM`, with a quick `metric-fade` (reduced-motion → instant);
  default on load is sets/reps. The session-note reveal moved onto its own note
  icon button so the row tap is unambiguously the flip. Bodyweight/null → "—".
- **Pure helper + tests:** extracted `sessionBestE1rm` (max over non-null,
  null-if-none) and unit-tested it; updated the three `HistoryEntry` fixtures and
  added an `e1rm` assertion to the MCP formatter test. Engine `estimateE1rm`
  already covers the bodyweight=0→null and Epley-fallback cases the backfill
  relies on. Green: typecheck, lint, **489 tests** (+3).
- **Deploy note:** the migration must be applied to the live DB **with** the code
  deploy — inserts write `e1rm`, so deploying code ahead of the column would break
  set logging. Not applied to live in this session (feature branch only).

## 2026-06-22 — Session 4: real PH35 cause (RLS recursion) + slices 1 & 2 in one PR

Owner asked to ship slice 1 + slice 2 + PH35 together, and flagged that PH35 was
**still crashing** (the toast caught it but the setting still wouldn't save), the
pencil was still too small, and the P19 under-marker should sit on the bottom
corner.

- **PH35 — found the actual root cause by inspecting the live DB.** The error
  boundary + toggle guards (session 3) only *caught* the failure. Reproduced the
  real error against production: **`42P17 infinite recursion detected in policy`**
  on `profiles` — `profiles_update_own`'s WITH CHECK queries `profiles` inside a
  `profiles` policy, so *every* regular-user profile UPDATE fails (auto-match,
  units, profile edits, onboarding). Latent since the initial schema; surfaced
  after Postgres began enforcing recursion detection. Fix
  (`20260622220627_fix_profiles_update_recursion.sql`): read the role via a
  SECURITY DEFINER helper that bypasses RLS, preserving the anti-escalation guard.
  **Applied to the live project** and verified (normal update OK, escalation
  BLOCKED 42501). Added an RLS test for a benign owner update.
- **Slice 2 polish:** P19 under-marker now sits on the bottom corner (over stays
  top); P19/PH27/PH28 otherwise as session 3.
- **Slice 1 shipped:** PH42 (legible +20% SVG pencil, absorbs I15), P20 (client
  `ExercisesBrowser` live-filter), PH26 (`/more/account` sub-page).
- Green: typecheck, lint, 486 unit tests.

## 2026-06-22 — Session 3: identify the clean slices; ship PH35 (real fix) + slice 2

- **Identified the independent (no open-question / no-larger-dependency) items.**
  Slice 1 (build-now, clean): **PH42**, **P20**, **PH26**. Slice 2 (one small
  decision away, now answered by owner): **P19**, **PH28**, **PH27**. Owner
  corrections folded in: **PR #61 is merged but PH35 still crashes**; **I13**
  confirmed merged (close); **I15** is the same icon as PH42 (illegible, not
  missing) → folds into PH42; **M8** meso est-strength is present but the owner
  wants its *meaning* clarified and has a broader meso/macro stats redesign in
  mind → back to needs-input.
- **Shipped PH35 + slice 2 in one PR** (branch `claude/nifty-darwin-xiwnxe`),
  typecheck + lint green, **486 tests** passing (+5 new `units` tests):
  - **PH35** — found the real cause: there was **no error boundary** in the
    `(app)` segment, so any rejected server action inside an optimistic toggle's
    transition rendered Next's raw "application error". Added
    `src/app/(app)/error.tsx` and made `AutoMatchToggle` / `UnitsToggle` revert +
    toast on failure (and ignore no-op clicks). PR #61's data-path guard stays.
  - **P19** — `▲`/`▼` over/under marker on logged sets in `SetRow`, compared by
    **e1RM** (per owner), ±1.5% on-target band, no marker without a prescription.
  - **PH27** — `NewTemplateButton` tray (blank template → planner, or add from a
    share code); redeem form moved off the page into the tray.
  - **PH28** — new `src/lib/units.ts` (consolidates `formatHeight` + cm↔ft/in);
    unit-aware height in `ProfileEditor` and onboarding; **onboarding reordered**
    so units is chosen first (deviation from 08 §4 recorded in PROGRESS.md).
- **Next:** slice 1 (PH42, P20, PH26) is still queued and fully clean.

## 2026-06-22 — Session 2: reconcile Notes v2, scope the v9 cleanup, ship two bug fixes

- **Reconciled the backlog with Notes v2.** Owner pruned items session 1 resolved
  and added two. Removed as resolved: S4, S5, I13, I15, PR22–PR25 (kept with
  `resolved (removed in v2)`). Added **S8** (engine add/remove sets/reps — answered
  by existing S7/S4 research) and **PR26** (retire the legacy increment path → v9).
- **Corrected a session-1 error:** the active engine is **already v9**
  (`weight_selection: rep_window`, `min_confidence: low`), not v8. This makes the
  T-A3 "silent confidence fallback" essentially moot in production — the legacy
  path is reached via **no anchor** (bodyweight-only + cold start), not confidence.
- **Scoped PR26** into [`I-engine-v9.md`](./I-engine-v9.md) via a code investigation:
  the legacy path is the de-facto bodyweight/cold-start path; bodyweight needs a
  real data-model change (no `is_bodyweight` flag today; `weight=0` makes the
  rep-window math null; both bodyweight equipment buckets collapse to one). Spawned
  T-I1–T-I4.
- **Shipped two bug fixes** (the queued first slice), with `typecheck` + `lint`
  green and all **481 tests passing**:
  - **M9** — `CreateMacroForm` custom-duration field now holds a string and clamps
    on blur, so it can be emptied and retyped.
  - **PH35** — `setPlannedSetWeight` uses `.maybeSingle()` + no-ops on a missing
    row; `persistPlannedWeight` routes through `runLog` (try/catch + toast) instead
    of the unguarded `commit`, so an auto-match write failure can't trip the
    app-error page. (Exact on-device trigger unconfirmed; this removes the crash
    surface + the most likely cause — flagged for device verify.)

### Next session — suggested starting point
- The big open cluster is **needs-input decisions** (T-A1/2/4/6/7/8, T-I1/3, plus
  M10/P16/P17/P18/PH28/PH30/PH33). Walking these with the owner unblocks the most
  work. The v9 cleanup (WS I) is the largest engine effort and starts with T-I1.

## 2026-06-22 — Session 1: set up the triage system, parse + first-pass triage

- Imported the Notes doc (2026-06-22) and parsed **42 distinct items** across 6
  source sections into [`backlog.md`](./backlog.md), preserving verbatim text.
- Established the sub-process, status/type legends, and 8 workstreams in
  [`README.md`](./README.md).
- Ran codebase research to scope the **UI/feature** cluster; findings recorded
  per item in [`scoping.md`](./scoping.md). Key outcomes:
  - **I13** (per-user weight increment) — already shipped 2026-06-21; needs only
    a verification pass, not new work.
  - **M8** "est-strength under meso Performance tab" — **already present**; the
    real ask is the *macro* 3-way toggle, which has no mockup yet (design
    decision needed, hard rule #8).
  - **I15** (note icon left of history) — that icon **already exists**; overlaps
    with **PH42** (the *edit* pencil glyph `✎` is the unclear one).
  - **M9** (custom-duration backspace) and **PH35** (match-weights crash) have
    confirmed root causes and are small, ready-to-build fixes.
  - Several items (**M10**, **P16**, **P17**, **P18**, **PH28**) carry open
    design questions flagged for the owner before implementation.
- Ran codebase research on the **engine/metrics** cluster (A) — see
  [`A-engine-metrics.md`](./A-engine-metrics.md).

### Next session — suggested starting point
- Review `scoping.md` + `A-engine-metrics.md` answers and confirm the open
  design questions (collected under workstream **H**).
- Then knock out the two clean bug fixes (**M9**, **PH35**) as a first
  vertical slice.
