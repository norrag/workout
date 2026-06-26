# Workstream J — Performance & efficiency (PH43)

> **Status: directional / not scheduled.** Owner flagged perceived speed but is
> not ready to execute. This file captures the analysis + a phased, **measure-first**
> plan so it isn't lost. It also lines up with the still-open Phase 7 "performance
> pass" in `docs/07-implementation-plan.md` / `docs/PROGRESS.md`.

## The owner's questions (PH43)

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

### Phase 0 — Measure (do first)
- Add `@next/bundle-analyzer` behind `ANALYZE=true` in `next.config.ts`; capture
  per-route JS for `/log/[workoutId]`, `/cycles/.../plan`, `/exercises`. Confirm
  `src/lib/engine/*` is in the `DayView` chunk.
- Slow-query baseline from Supabase (`get_advisors`, `get_logs`); watch anchor reads
  on meso load.
- Record numbers in `docs/PROGRESS.md` + a perf review doc so before/after is auditable.
- Note: the whole `(app)/` group is dynamically rendered (the `auth.getUser()` cookie
  read in `src/app/(app)/layout.tsx` opts out of static caching) — expected for an
  authed app; don't chase static caching.

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

### Phase 2 — Server load, egress & caching
- **Scope the anchor query.** `getExerciseE1rmAnchors` (`src/lib/queries/anchors.ts`)
  reads the user's *entire* `logged_sets` history per meso load, then filters. Push
  the exercise-id filter + `recency_weeks` window into the SQL `WHERE`/index range.
  Biggest egress/compute reduction on the read path.
- **Narrow revalidation:** `revalidatePath('/workout')` + `'/log/{id}'` in
  `log/actions.ts` → `revalidateTag` with per-meso/per-workout tags.
- Audit request-scoped `cache()` use (already on `getActiveEngineParams`).
- Keep views live; only revisit `v_meso_summary` / `v_exercise_overview` (deep-join
  CTEs) if Phase 0 logs flag them — add a covering index before materializing.

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
- Independent of PH44/PH45 (those are engine-correctness, not performance).
