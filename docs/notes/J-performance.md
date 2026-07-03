# Workstream J — Performance & efficiency (N1)

> **Status: in-progress (2026-06-30).** Scheduled after the PR-#84 bug sweep. This
> file captures the analysis + a phased, **measure-first** plan. It also lines up
> with the still-open Phase 7 "performance pass" in `docs/07-implementation-plan.md`
> / `docs/PROGRESS.md`.

## North star (owner, 2026-06-30): snappy = always acknowledge input

The owner's binding definition of "snappy" — the bar this workstream is judged
against:

> **Every user interaction on every surface must be visually acknowledged the
> instant it happens.** The moment the user taps/clicks/submits, *something* must
> visibly change — a pressed state, a spinner, a skeleton, an optimistic update, a
> disabled control, a nav pending cue. The user must **never** be left wondering
> "is it loading, or did I mis-tap?" while the result resolves.

Key reframing: **responsiveness ≠ instantaneous data.** A surface can take time to
load real data and still be "snappy" *as long as the action was acknowledged* and a
placeholder/loading state is shown. So the work has two distinct tracks, and the
acknowledgment track is the **primary** lens:

1. **Interaction acknowledgment (primary).** Audit *every* interactive surface;
   guarantee an immediate visual response on every tap. Patterns: route-level
   `loading.tsx` skeletons, `useLinkStatus`/transition pending cues, `useTransition`
   + disabled/spinner on every server-action button, `useOptimistic` for the daily
   logging loop, instant sheet/modal open, `active:` press states. A shared
   `PendingButton`/nav-progress helper to fix many gaps at once.
2. **Real load-time reduction (secondary, supports the above).** Strategic caching
   (prefetch, `revalidateTag`, request-scoped `cache()`, stable-read data cache),
   client bundle/render wins (code-split the engine, memoize the predictor), and
   query-scope fixes (the anchor query) — so the placeholder window is as short as
   possible. The measure-first analysis below still drives this track.

Priority by frequency: the **daily logging loop** (set logging, day/week
navigation, feedback, complete-workout) is HIGHEST; rarely-touched settings lowest.

Definition of done: no app surface leaves a perceptible dead gap between an
interaction and a visible response; load times are demonstrably reduced where the
measurement flags them.

## The owner's questions (N1)

1. How much heavy lifting is on the front-end vs the backend/DB?
2. Would moving more work into DB/edge functions (thinner UI client) help?
3. What can decrease load times / increase efficiency?
4. What can decrease server load / keep compute + data-transfer cost minimal?
5. Other structural / refactoring observations.

## Key finding (reframes the premise)

The backend **already** does the heavy lifting, and does it well:

- **Stats/aggregation** live in SQL views (`v_meso_summary`, `v_meso_week_sets`,
  `v_exercise_overview`, `v_macro_summary`, …), de-fan-out'd 2026-06-17 to count
  each fact once. The client only renders pre-computed numbers
  (`MesoStatsViews.tsx`) — no client-side stats recompute.
- **The progression engine** (`src/lib/engine/`, pure TS) runs **server-side** for
  generation (`queries/generation.ts`), week-advance (`queries/progression.ts`),
  and freshness recompute (`queries/regeneration.ts`).
- **Prescription freshness** reconciles server-side on read (doc 14), short-circuiting
  on a fingerprint match.
- Data access is batched (`Promise.all`), mostly column-selective, N+1-free (Maps),
  and indexed (39 indexes on the hot paths).

So **moving compute to Supabase Edge Functions is not the win** — it relocates
compute, not reduces it, and complicates the RLS/service-role model (hard rules
#3/#4). The engine **must stay pure TS** (hard rule #3), so it can't move into
plpgsql. The real wins are on the **client bundle/render path** plus a few
**query-scope/caching** fixes. There is currently **no measurement** (no bundle
analyzer, no Sentry, Phase 7 perf pass unstarted) — so measure first.

### Direct answers
1. **Split:** DB does aggregation + all generation/progression math. The only
   meaningful client compute is the *read-only live rep predictor* in `DayView`
   (`predictRepsAtWeight`, a 40-iteration bisection) — cost is bundle weight +
   un-memoized re-runs, not the math.
2. **Move to edge/DB?** No material benefit; keep the engine local for the predictor
   (instant feedback) but stop shipping it in the initial bundle.
3. **Load times:** code-split the two monoliths + engine, stream with Suspense,
   memoize/debounce the predictor.
4. **Server load / cost:** scope the global anchor query (biggest egress waste),
   narrow `revalidatePath` → `revalidateTag`, keep views live but watch deep-join ones.
5. **Other:** `DayView` (~2,473 lines) and `PlannerBoard` (~1,620 lines) are monoliths
   — re-render scope + maintainability; add observability so wins are provable.

## Phased plan

### Phase 0 — Measure + audit (do first)
- **Interaction-acknowledgment audit (primary).** Enumerate every interactive
  surface; classify each as ACKNOWLEDGED vs GAP (dead time after a tap), with the
  fix pattern per gap, ranked by daily-loop frequency. This punch list drives Phase A.
- Add `@next/bundle-analyzer` behind `ANALYZE=true` in `next.config.ts` **(done
  2026-06-30)**; capture per-route JS for `/log/[workoutId]`, `/cycles/.../plan`,
  `/exercises`. Confirm `src/lib/engine/*` is in the `DayView` chunk.
- Slow-query baseline from Supabase (`get_advisors`, `get_logs`); watch anchor reads
  on meso load.
- Record numbers in `docs/PROGRESS.md` + a perf review doc so before/after is auditable.
- Note: the whole `(app)/` group is dynamically rendered (the `auth.getUser()` cookie
  read in `src/app/(app)/layout.tsx` opts out of static caching) — expected for an
  authed app; don't chase static caching.

### Phase 0 baseline — measured 2026-06-30

`ANALYZE=true npm run build` (treemaps in `.next/analyze/`). First Load JS per route:

- **Shared baseline: 104 kB** (all routes) — two vendor chunks (47.7 kB + 54.2 kB).
  Reasonable for Next 15 + Supabase; not the problem.
- **Heaviest: `/workout` and `/log/[workoutId]` = 142 kB** (~38 kB over baseline) —
  the DayView + engine. The route-specific `Size` is tiny (133 B), so the weight is
  a shared chunk these routes pull in. This is the **only** meaningful bundle target;
  the engine code-split (Phase 1) should shave most of the ~38 kB off this path.
- `/cycles/meso/[mesoId]/plan` (PlannerBoard) = 118 kB (+14 kB); everything else
  104–112 kB (lean — leave alone).

**Takeaway (measure-first paid off):** the bundle is not the headline. Rank the
**server reconcile gate** (query audit #1) and the **interaction-acknowledgment**
track above the code-split. Engine code-split is worth doing but is a secondary,
single-route (~38 kB) win, not the cause of "feels slow."

### Phase A — Interaction acknowledgment (primary track, runs first)

**Shipped 2026-06-30 (return-to-tab + nav).** From owner feedback that the Workout tab
reloads everything + resets to the current day on every tap, and the page-switch label
still ghosted:
- **Client Router Cache on** — `experimental.staleTimes { dynamic: 120, static: 300 }`
  (`next.config.ts`). Returning to a previously-viewed `/workout`/`/log/[id]` within the
  window is served from the client cache: instant, scroll restored, no server round-trip.
  Owner-chosen 2-min window; own edits bust the cache via `revalidatePath`, so only rare
  out-of-band prescription changes can be briefly stale (self-heal). Biggest lever for the
  "switch back to where I was" feel; literal keep-alive assessed + rejected (major
  rearchitecture for ~the same result).
- **Workout tab returns to the last-viewed day** — `DayView` stamps a session-scoped
  `lastWorkoutId` (active meso only); `BottomNav` links the Workout tab there and treats
  `/log/*` as the Workout section.
- **Nav label glitch removed** — stripped the `animate-pulse` loading animation (ghosts on
  mobile); the ■ marker moves to the tapped tab optimistically (instant, no animation).
- `setIncrementOverrideAction` also revalidates `/log/[workoutId]` so an override edit isn't
  stale on a cached day.

**Audit verdict (2026-06-30):** the app is broadly disciplined — the daily logging
loop (set logging via `LogCheckbox`, weight/reps edit, all bottom sheets/menus open
synchronously, `CompleteSheet`, every `useActionState` form, optimistic toggles) is
**already well-acknowledged; do not touch.** Gaps cluster in three patterns:

**Architecture note that scopes the work:** `(app)/loading.tsx` is the default
Suspense fallback for the whole group, so plain `<Link>` route navigations *do*
paint a skeleton on commit (acknowledged). The genuinely-dead case is **same-route
`?param=` changes** — Next keeps the old UI mounted with no fallback. That's the
top-value gap.

> **⚠ Disproved in the field (owner, 2026-07-03 — backlog Batch 5, folded into
> N1).** The owner reports 1-2 second dead gaps after tapping pages — worst on
> the cycles page + subpages — with no visual acknowledgment, to the point of
> doubting the tap and tapping again. Bar restated: **every page tap must
> IMMEDIATELY switch and show animated placeholders until data loads**; the
> workout day view is the only page doing this correctly today. So the
> assumption above (Link navs paint the shared fallback on commit) does not
> hold on device — likely because "on commit" is gated on the server response
> for dynamically-rendered routes rather than firing on tap. **Next Phase-A
> action:** reproduce on device, establish why the fallback isn't painting
> (loading.tsx placement per route segment vs the group-level one; Next
> partial-prerender/prefetch of the loading shell; transition semantics), then
> ship per-route `loading.tsx` skeletons for `/cycles`, `/cycles/macro/[id]`,
> `/cycles/meso/[id]` + the other tabs, mirroring `DayViewSkeleton` (pulls
> Phase 3's streaming item forward). Related discrete defect: **N12** (set-log
> latency + hanging spinner) — scoped in `scoping.md` § N12; build with this
> workstream's deferred #5/#6 caching items.

Ranked gaps:
1. **PlannerBoard draft-path mutations** (`PlannerBoard.tsx:234` discards `isPending`;
   steppers/reorder/remove) — on a *draft* meso these `commit()` with no optimistic
   update and no pending, so the number/row freezes. (Editing-mode path is already
   optimistic — mirror it into the draft branch.) **HIGH**
2. **PlannerBoard SAVE CHANGES** (`:964`→`doSave :577`) — pending discarded, sheet
   stays open dead. **HIGH**
3. **OVERVIEW|HISTORY tab** (`exercises/[exerciseId]/page.tsx:176`) — `<Link ?tab=>`
   server round-trip, highlight only flips after response, no skeleton. Both views are
   pure + already server-fetched → **convert to client state** (kills the round-trip).
   **MED**
4. **BALANCE|PERFORMANCE tab** (`cycles/meso/[mesoId]/stats/page.tsx:65`) — same as #3,
   same fix (`BalanceView`/`PerformanceView` are pure). **MED**
5. **END WORKOUT / END MESOCYCLE** confirm (`DayView.tsx:613` discards pending) — dead
   button on a destructive action. **MED**
6. **TemplateFilters** selects (`TemplateFilters.tsx:44`) — `router.replace` re-query,
   stale list, `/templates` has no `loading.tsx`. Wrap in `useTransition` + dim. **LOW**
7–12. **Plain `<form action>` submits lacking pending** (ProfileEditor save/remove,
   DeleteMeso, blank-template, SAVE-AS-TEMPLATE/DISCARD-DRAFT, SIGN OUT) → a shared
   `<SubmitButton>`. **LOW**
13–14. Missing `active:` press states on bespoke tappable rows/links. **LOW**

Shared helpers (fix many at once):
- **`<SubmitButton>`** reading `useFormStatus()` (disabled + pending label) → 7–12.
- **Capture the discarded `isPending`** from the recurring `const [, startX] =
  useTransition()` and thread to disabled/dimming → 1, 2, 5.
- **Client-state segmented toggle** (or `useTransition`+`useLinkStatus` `TabLink`) → 3, 4.
- **`active:bg-ink/5` press utility** on bespoke rows → 13, 14.
- **`/templates/loading.tsx`** skeleton → 6.

**Shipped 2026-06-30 (Phase A slice 1):**
- **#3, #4 (dead tab toggles) — done.** New reusable `SegmentedTabs`
  (`components/ui/SegmentedTabs.tsx`): server-rendered panels, instant client-state
  switch, no refetch. Wired into the exercise OVERVIEW|HISTORY page and the meso-stats
  BALANCE|PERFORMANCE page; `?tab=`/`?view=` still seed the initial panel for deep-links.
- **#5 (END WORKOUT / END MESOCYCLE) — done.** Captured the discarded `ending` flag →
  disabled + "ENDING…".
- **#2 (PlannerBoard SAVE CHANGES) — done.** Captured `pending`; the confirm button
  shows "SAVING…"/disabled and the sheet self-closes when the save resolves.
- **#7–12 (plain `<form action>` submits) — done.** New `SubmitButton`
  (`components/ui/SubmitButton.tsx`, `useFormStatus`) on SAVE AS TEMPLATE, DISCARD
  DRAFT, DELETE meso, blank-template, SIGN OUT.

**Deferred to a focused follow-up (tracked):**
- **#1 (PlannerBoard draft-path optimistic) — HIGH but risky.** Making the draft
  steppers/reorder/remove optimistic touches the planner's draft mutation + revalidation
  semantics (which already have subtle sheet/active-day edge cases); warrants isolated
  review + the verify skill rather than riding in a broad slice.
- **#6 (TemplateFilters stale list).** The native `<select>` already updates its value
  instantly (the tap *is* acknowledged); the proper stale-list dim needs page-level state.
  Low value.
- **#13–14 press-state sweep.** Broad, low individual value.

### Phase 1 — Client bundle & render (highest leverage)
- **Code-split the engine off the initial path.** Split the predictor into a tiny
  module (`e1rm.ts` + `reps.ts` only) or `dynamic()`-import it so `engine/index.ts`
  / `macro.ts` / rules stay server-only. Verify `prescribe`/`seedMeso` leave the
  client chunk.
- **Lazy-load secondary UI** (history sheet, audit sheet, add-exercise/replacement
  menus, feedback sheets in `DayView`; drag/add surfaces in `PlannerBoard`) via
  `next/dynamic`.
- **Memoize + debounce the predictor** (`useMemo` keyed on weight/RIR/anchor/params;
  ~150–200ms debounce on the weight input; `DayView.tsx` ~line 1209).
- **Memoize derived counts** (`loggedSets`, `totalSets`, progress reduces).
- **Extract `ExerciseBlock` into a `React.memo` subcomponent** with narrowed props
  so logging one set doesn't re-render the whole day tree.

**Shipped 2026-07-01 (Phase 1 slice, PR #93).** `/log/[workoutId]` + `/workout`
**142 → 125 kB** First Load JS (−17 kB gz). What the chunk fingerprinting showed: the
~24 kB engine delta was mostly **zod itself** (12.7 kB gz) — pulled in because
`reps.ts`/`e1rm.ts` run `engineParamsSchema.parse` inside every exported
function — plus the params/schema layer (4.7 kB gz).
- **`engine/predict.ts`** — zod-free predictor core (type-only imports), keyed on
  the validated `params.e1rm` slice. `e1rm.ts`/`reps.ts` unchanged public APIs =
  parse-then-delegate wrappers (boundary validation intact, hard rule #6);
  `predict.test.ts` asserts core ≡ wrapper outputs + a **static import guard**
  (no runtime `zod`/`./params` import in `predict.ts`/`load.ts` — the bundle win
  can't silently regress). Server bonus: `recencyWeightedE1rm` parses once per
  anchor build, not once per historical sample.
- **DayView** leaf-imports `engine/predict`+`engine/load`; macro forms leaf-import
  `engine/macro`; the engine barrel is server-only on the client paths.
- **Measure-first corrections to this phase's plan:** (a) the weight-input
  *debounce* was moot — the predictor fires on **blur**, not per keystroke; the
  actual render-path waste was a zod parse per engine call per row per render
  (future-row predictions + P19 markers recompute every render). Fixed by the
  zod-free core + per-row `useMemo` on both. (b) `ExerciseBlock` already existed
  as a subcomponent; the work was `React.memo` + converting DayView's inline
  closures to stable id/exercise-taking `useCallback`s (functional updates) so
  one block's menu/typing no longer re-renders every other block.
- **Lazy sheets:** `HistorySheet` + `PrescriptionDetailSheet` via `next/dynamic`
  (both render null until opened; no exit-animation risk).
- **Not taken (recorded):** splitting the in-file DayView sheets
  (Note/Replace/Add/Feedback/Complete) out of the 16.6 kB-gz route chunk — file
  surgery, modest return; PlannerBoard lazy-loading — deferred to ride with the
  tracked draft-path acknowledgment rework, not this slice. `/cycles/new` +
  `/cycles/macro/edit` stay ~127 kB: their forms legitimately run
  `planMacrocycle` (zod-validated inputs) client-side for the live preview.

### Phase 2 — Server load, egress & caching (ranked from the measured audit, 2026-06-30)
Ranked server-side wins from the Phase 0 query/caching audit (Supabase advisors +
code). Build order: #1 → #3/#4 → #8 → #6/#7 → migrations (#2/#9/#10).

1. **Gate the reconcile (THE "feels slow" cause).** `ensureFreshPrescriptions`
   (`regeneration.ts:386`, called from `workout/page.tsx:39`) runs the full
   multi-query reconcile + `catchUpMesoGeneration` on **every** workout-tab open —
   ~6–9 serial round-trips before first render — even when nothing is stale (the
   fingerprint short-circuit is per-row, *inside* the work). Add a cheap **meso-level
   staleness pre-check** (stored meso fingerprint / `min(params_version)` across open
   rows vs active `engine_params.version` + meso-config hash) and return early on a
   match. *Needs an append-only migration* (e.g. `mesocycles.reconcile_fingerprint`).
2. **`v_exercise_overview` is `SECURITY DEFINER`** (advisor **ERROR**, bypasses
   per-user RLS). Recreate `WITH (security_invoker = true)`; verify RLS still filters.
   *Migration.* (Security fix surfaced by the perf audit.)
3. **Anchor query: global `.limit(600)`, not per-exercise + unbounded age.**
   `anchors.ts:46`. The exercise-id filter is *already* in SQL and index-backed
   (`logged_sets_user_exercise_idx`) — **correction to the old plan: there is no
   `recency_weeks` window and the filter is not done in memory.** The waste is the
   *global* row cap (can starve older exercises on a multi-exercise day) + no age
   floor. Fix = a `performed_at >= now − N×halflife` date floor (recency decays to
   negligible past ~4 half-lives), using the existing index range. No new index.
4. **Anchor query does 2 extra serial round-trips** (`anchors.ts:70-89`: workout
   status, then `target_rir`). Batch/parallelize; compounds because the anchor call
   runs inside both `getWorkoutDetail` and the reconcile.
5. **Over-broad revalidation:** `revalidatePath('/workout')`+`'/log/{id}'` on ~30 log
   mutations → `revalidateTag` with `workout:{id}`/`meso:{id}` tags (pays off after #7
   makes reads cacheable).
6. **`select("*")` on hot paths** (`getWorkoutDetail` `logged_sets`/`workout_exercises`,
   `logging.ts:134,175`) → narrow column lists. Low risk, additive.
7. **No `unstable_cache` on static reference reads** — `muscle_groups` (re-fetched in
   6+ paths) + the *global* exercise library. Wrap with a long TTL + a tag busted only
   by library edits; keep per-user overlays live.
8. **Double `engine_params` read per open:** `getActiveEngineParams` is request
   `cache()`d but keyed on the client arg, so the page's `createClient()` and the
   reconcile's service client are two misses. Pass the resolved `{version,params}` into
   the reconcile, or key the cache on user.
9. **Unindexed FK `exercise_param_overrides.exercise_id`** (advisor INFO; on the
   reconcile path). Add the index. *Migration.*
10. **RLS init-plan:** `exercise_param_overrides_all_own` re-evaluates `auth.uid()`
    per row → wrap as `(select auth.uid())`. *Migration.* (Only this one table flagged;
    the other 30+ are already optimized — confirms the "backend is fine" premise.)

Cleared by the audit (do NOT touch): anchor hot-path indexes exist + are correct;
`v_meso_summary`/`v_meso_week_sets`/`v_exercise_history` raised no perf advisor (leave
live, don't pre-materialize); engine-stays-pure is not a bottleneck.

**Shipped 2026-06-30 (Phase 2 slice):**
- **#1 (reconcile gate) — done.** `mesocycles.last_reconcile_sig` (migration
  `20260630000001`, **applied live**). `loadMesoStaleInputs` + pure `mesoStaleSignature`
  (`regeneration.ts`): a cheap ~2-round-trip signature of every meso-global fingerprint
  input (params version, RIR ramp, macro goal, profile experience, override/exercise/
  completed-work watermarks). Gate at the top of `reconcilePrescriptions` skips the full
  ~8-10-round-trip pass (both gap-heal + freshness) on a match; stamps the start-signature
  on success. Conservatism proven by `reconcile-gate.test.ts` (each input flip busts the
  hash). Null stamp ⇒ one full reconcile on first open of each existing meso, then it
  engages. Validated `loadMesoStaleInputs` against live schema/data.
- **#8 (double params read) — done.** `ensureFreshPrescriptions`/`reconcilePrescriptions`
  take an optional pre-resolved `{version,params}`; both the Workout and Log pages resolve
  it once (request-cached with the predictor read) and pass it in — the reconcile's service
  client no longer re-reads `engine_params`.
- **#4 (serial anchor round-trips) — done.** `anchors.ts`: the completed-workout filter +
  the `target_rir` lookup (+ bodyweight load-type lookup) now run in one `Promise.all`
  (3 serial → 1 parallel round-trip); `target_rir` resolved for the harmless superset of
  all fetched WEs. Result byte-identical.
- **#3 (anchor recency date floor) — REJECTED after live verification.** A 4-half-life
  (120-day) `performed_at` floor would have dropped the anchor **entirely** for ~56% of
  (user,exercise) pairs whose latest set is >120 days old (live check), because recency
  weighting is *relative* — an old exercise still yields a valid anchor the predictor
  uses. Dropping it forces cold-start where real data exists, against the "use real data
  when available" ruling. Egress is already bounded by `.limit(600)`. Kept a code comment
  so it isn't re-added.
- **Cheap migrations — done 2026-06-30** (`20260630000002_advisor_cleanup.sql`, applied +
  verified live): #2 `v_exercise_overview` → `security_invoker` (cleared the linter **ERROR**;
  verified an authenticated user sees only their own rows, 0 foreign), #9 FK index on
  `exercise_param_overrides(exercise_id)`, #10 RLS init-plan wrap `auth.uid()` →
  `(select auth.uid())`. Left intentionally: the `current_profile_role`/`is_admin`
  SECURITY DEFINER **function** WARNs (anti-recursion RLS helpers; return only the caller's
  own role/admin status), the leaked-password toggle (dashboard-only), and the unused-index /
  `shares` multi-policy INFO/WARN noise (dropping/rewriting riskier than the benefit).
- **Still deferred:** #5/#6/#7 caching (`revalidateTag` + `unstable_cache` stable reads +
  `select` narrowing — need tagging first). The engine code-split off the `/log` client
  bundle shipped 2026-07-01 (see Phase 1).

### Phase 3 — Streaming & structural cleanup (optional)
- Suspense streaming on heavy server pages using `DayViewSkeleton`.
- Decompose `DayView` / `PlannerBoard` into feature modules.
- Nav `prefetch` hints for common tab hops.

## Out of scope / rejected
- Engine in Supabase Edge Functions or plpgsql (hard rule #3; no net reduction).
- Offline sync / static caching of authed pages (hard rule #9; dynamic auth layout).

## Verification (when built)
- `ANALYZE=true npm run build` shows engine bulk left the `DayView` chunk + route JS
  dropped vs baseline.
- `npm run test` (engine golden + query suites stay green — predictor split must not
  change outputs), `npm run typecheck`, `npm run lint`.
- Manual log on `/log/[workoutId]`: prediction still correct, no per-keystroke jank.
- Re-pull `get_advisors` / `get_logs`: anchor read row counts down, no new slow queries.

## Cross-refs
- Relates to PH29 (page-switch slowness/flicker — Suspense/streaming overlaps).
- Independent of N2/N3 (those are engine-correctness, not performance).
