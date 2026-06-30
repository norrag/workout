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

**Audit verdict (2026-06-30):** the app is broadly disciplined — the daily logging
loop (set logging via `LogCheckbox`, weight/reps edit, all bottom sheets/menus open
synchronously, `CompleteSheet`, every `useActionState` form, optimistic toggles) is
**already well-acknowledged; do not touch.** Gaps cluster in three patterns:

**Architecture note that scopes the work:** `(app)/loading.tsx` is the default
Suspense fallback for the whole group, so plain `<Link>` route navigations *do*
paint a skeleton on commit (acknowledged). The genuinely-dead case is **same-route
`?param=` changes** — Next keeps the old UI mounted with no fallback. That's the
top-value gap.

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
