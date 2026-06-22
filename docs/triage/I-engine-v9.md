# Workstream I — Engine v9 cleanup (retire the legacy increment path)

Covers **PR26** (added in Notes v2) and pulls in the engine follow-ups
**T-A3** (legacy fallback), **T-A5** (volume ramp), and **PH36** (bodyweight
settings). Grounded in a read-only code investigation; file:line refs throughout.

> **Correction to session 1:** the active engine is **already v9**
> (`supabase/migrations/20260619000001_engine_params_v9_rep_window.sql`, the
> active row has `weight_selection: "rep_window"`, `reps_predict.min_confidence:
> "low"`). The "legacy increment" code path still *exists* as a fallback but is
> **not** the configured default. The user's note asks to remove it; this doc
> scopes that.

## The note (PR26)

> "From what I understand the legacy increment path … is keeping as a fall back.
> This legacy model probably shouldn't be present at all, however we need to
> understand where and how it's still used … I think the only remaining use case
> might be how bodyweight only and bodyweight loadable exercises are handled.
> We should consider these … and probably roll them into the v9 model so that
> everything is handled cleanly."

## Key finding — the real trigger is "no anchor", not the config

`prescribe` chooses the modern rep-window path only when **all** of
(`src/lib/engine/index.ts:199-203`):

```ts
const useRepWindow =
  params.weight_selection === "rep_window" &&
  anchor != null &&
  goalWindow != null &&
  confidenceAtLeast(anchor.confidence, params.reps_predict.min_confidence);
```

Otherwise it runs the legacy `increment`/`progression_style` block
(`index.ts:236-304`). Under the shipped v9 config:
- `weight_selection` is `rep_window` (not `increment`) → condition (a) never trips.
- `min_confidence` is `"low"`, so `confidenceAtLeast` is satisfied by *any*
  non-null anchor → the **silent confidence fallback (T-A3) effectively never
  fires** in production (only if an admin raises `min_confidence`).
- **`anchor == null` is therefore the dominant — almost the only — way the legacy
  path is reached.**

What makes the anchor null:
- **Bodyweight-only exercises — always.** `logged_sets.weight` is `numeric not
  null check (weight >= 0)` (`20260611000001_initial_schema.sql:348`); bodyweight
  sets log `weight = 0`, and the anchor query filters `.gt("weight", 0)`
  (`src/lib/queries/logging.ts:65`) → **no rows → no anchor, permanently.**
- First-ever logging of an exercise / swap-in with no logged history yet.
- (Sparse/stale history rarely kills it — one recent set still anchors.)

So **the legacy path is, in practice, the bodyweight + cold-start path.** You
cannot delete it without first giving the engine a real no-anchor / bodyweight
model.

## Bodyweight is the hard case (and needs a data-model change, not just a branch)

- **No `is_bodyweight` / `loadable` / `load_type` flag exists.** The only signal
  is `exercises.equipment_type`; the library distinguishes `'bodyweight only'`
  vs `'bodyweight loadable'` (`20260615000006_replace_exercise_library.sql`), but
  `toEngineEquipment` collapses **both** into one `bodyweight` engine bucket
  (`src/lib/engine/params.ts:33-35`). The engine literally can't tell a weighted
  pull-up from a bodyweight one.
- **At weight 0 the rep-window math is undefined** — `estimateE1rm` returns null
  for `weight <= 0` (`e1rm.ts:41`); `predictRepsAtWeight` / `weightForRepsAtRir`
  early-return null (`reps.ts:68,88`). The legacy path "works" only by doing
  `weight = 0 + increment` (`index.ts:249`) — i.e. trying to **add external load
  to a bodyweight movement** — or holding 0.
- **Bodyweight-loadable** (weighted pull-ups/dips) logs only the *added* weight,
  so it anchors and runs rep-window — but the engine reasons as if the added
  weight were the whole load (ignores bodyweight base), so e1RM and the rep↔weight
  inversion are systematically wrong (not a legacy-path issue per se).

**Open product question:** for bodyweight-only, progress purely on **reps at
fixed load**? And do we want to fold the user's bodyweight into the set's
effective load (for loadable variants and e1RM honesty)?

## What would be lost if the legacy path were deleted today

| Behavior | rep-window covers it? | v9 needs |
|----------|----------------------|----------|
| No-anchor progression (weight + increment off actuals) | No (needs an anchor) | **Yes — a cold-start model** |
| Bodyweight-only (weight=0) | No (math null at 0) | **Yes — biggest gap; reps-at-fixed-load + a bodyweight flag** |
| `reps_first` (+1 rep at held load) | Yes for anchored lifts (`index.ts:217-221`) | only inside the no-anchor model |
| `hold` for cut/maintain | Anchor reprices instead (arguably better) | replacement for *unanchored* cut/maintain |
| −10% big-miss back-off (`regression_pct`) | No — rep-window leans on the *falling anchor* | **Decide:** explicit cold-start regression vs anchor-only (documented) |

## engine_params to retire vs keep

- **Drop (legacy-only):** `progression_style`, `increment`,
  `experience_increment_scale`, `regression_pct`; collapse `weight_selection` and
  `grading` to single values. (Note the **schema** default
  `weight_selection: "increment"` at `params.ts:147` exists for back-compat
  parsing of pre-v9 rows — removing the field means *migrating* old rows, not just
  changing the default.)
- **Keep (shared / path-independent):** `rounding`, `small_miss_reps`, all
  `e1rm.*`, `rep_window`, `reps_predict`, and the feedback/volume/deload/meso/macro
  blocks.

## Test debt (do before changing behavior)

- `prescribe.test.ts` runs through the legacy path by default
  (`helpers.ts` `baseInputs.strengthAnchor: null`) — must be re-pointed.
- `rep-window.test.ts:148-161` explicitly asserts the increment fallback — update.
- `regeneration.test.ts:158` (legacy replay parity) and `golden-meso.test.ts`
  (any unanchored fixture exercise) will shift.
- **There is no weight=0 / bodyweight prescribe test today** — add one first.

## Recommended sequencing (proposed; needs owner sign-off)

1. **Decide the bodyweight data model** (a first-class flag or split the two
   bodyweight equipment buckets; +how loadable should anchor). → **needs-input.**
2. **Build the v9 no-anchor / cold-start prescription model** (incl. bodyweight
   reps-at-fixed-load) behind the existing branch, with a new weight=0 test.
3. **Decide the big-miss back-off** policy (explicit vs anchor-only). → **needs-input.**
4. **Delete the legacy block + retire its params** (new engine_params version;
   migrate old rows); update the test suite.
5. (Separately) **T-A5** — graded MEV→MAV→MRV volume ramp + MRV-stop auto-deload,
   or amend doc 10 to the ±1 model.

## Spawned sub-tasks (add to backlog)

| ID | Title | Type | Status |
|----|-------|------|--------|
| T-I1 | Decide bodyweight data model (flag vs split buckets; loadable anchoring; store bodyweight-in-set?) | D | needs-input |
| T-I2 | Build v9 no-anchor/cold-start prescription model incl. bodyweight reps-at-fixed-load (+ weight=0 test) | F | blocked on T-I1 |
| T-I3 | Decide big-miss back-off policy in the v9 model (explicit regression vs anchor-only) | D | needs-input |
| T-I4 | Delete legacy increment block + retire legacy-only params (new engine_params version, migrate old rows, update tests) | F | blocked on T-I2 |

> **PH36** (bodyweight model/increment settings) and **T-A3** (confidence
> fallback) are subsumed here: PH36 is the bodyweight half of T-I1/T-I2; T-A3 is
> moot under shipped config and folds into the cleanup at T-I4.
