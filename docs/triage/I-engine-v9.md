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

## Decision (2026-06-25) — no fabricated prescriptions; retire the prior-peak back-off seed

> **Owner ruling, binding for this workstream.** The legacy
> "prior-peak × back-off" meso seed (`seedMeso`'s `priorPeak` branch,
> `index.ts:551-569`) is **fundamentally broken and must never be used again, for
> any reason.** It is to be **retired at the next possible opportunity.** The same
> ruling extends to the legacy no-anchor *progression* fabrication: the engine must
> not invent a number when it lacks the data to compute an honest one.

**The principle.** The goal of a prescription is **not to emit a number at any
cost** — it is to use real data, when available, to train the user as effectively
as possible. When there genuinely isn't enough data to compute an honest starting
point, the engine must **defer to the user** (let them enter their own starting
weight/reps — a manual seed) rather than fabricate data or emit bad numbers. A
missing-but-honest prescription beats a present-but-wrong one.

**Why the prior-peak seed is broken** (full root-cause in
[`docs/reviews/2026-06-23-standalone-prescription-investigation.md`](../reviews/2026-06-23-standalone-prescription-investigation.md)
§1–2): it backs the *weight* off 7.5% but carries `prescribed_reps =
priorPeak.reps` **verbatim**, so week 1 escapes the rep window entirely (the live
"calf machine 175×20" / "leg curl 130×30" seeds). It reads `v_exercise_prs`
per-column maxes — a `(best_weight, best_reps)` set the user never performed
(pre-S2). It never re-prices through the rep window the rest of the engine uses.
S1 (v11) added the anchor-aware seed *in front of* it but **deliberately left it as
the fallback** — this decision removes that fallback.

**The decided seed precedence** (replaces the `priorPeak` branch):

1. **Confident recency anchor** → rep-window seed (S1, `seed_anchor`): load for the
   window's `target_low` at week-1 RIR, reps = bounded predictor. *This is the only
   data-derived seed path.*
2. **Else → the user's own planner-board `initial_*`** (`meso_exercises.initial_weight/
   reps/sets`) — a manual seed the user controls. No back-off, no fabrication.
3. **Else (no anchor, no initial) → do not fabricate.** Leave the slot unseeded and
   prompt the user to enter a starting point. Never compute a load from a peak set,
   a per-column max, or a low-confidence anchor.

This is `T-I5` below, and it tightens the answers to `T-I2`/`T-I3`: the "no-anchor /
cold-start model" is, for the *no-data* case, **manual-seed deferral, not a
fabrication model** (the genuine-data sub-case — bodyweight reps-at-fixed-load — is
still real work under T-I2; see T-I1). It also closes the policy question in `T-A4`/
`T-I3`: there is **no hidden big-miss back-off** — a falling anchor handles
under-performance, and where there's no anchor there's no prescription to back off.

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

### Decision (2026-06-25) — bodyweight model (T-I1, owner)

Binding direction for the three load types. Resolves T-I1; sequences T-I2.

- **Bodyweight-only** (push-ups, unweighted pull-ups, etc.). The set's effective
  load **is the user's profile bodyweight.** Prefill the weight field with the
  profile bodyweight and make it **read-only**, with a visible cue to the user that
  the load is their bodyweight (not an editable number). The engine cannot add
  external load, so **the only progression axis is reps** — keep progressing reps in
  the normal logical way (the rep-window climb already does this; it just needs a
  real, non-zero load to anchor on instead of `weight = 0`).
- **Bodyweight-loadable** (weighted pull-ups/dips). Effective load = **profile
  bodyweight + the added external weight.** The bodyweight component is used in the
  **progression/e1RM calculation** but **does not need to be shown to the user** —
  they just enter the added weight as today. Bodyweight is ~static short-term; the
  reason to include it at all is that over the **medium/long term it drifts** for
  some users, and the metrics should track real load. This is a **narrow slice** of
  exercises and is **under-tested** — approach it this way but treat it as lower
  confidence.
- **Bodyweight-assisted** (assisted pull-up/dip machine — counterweight *reduces*
  effective bodyweight). Engine-side, handle like loadable but with a **negative**
  added weight (effective load = bodyweight − assist), so the same math covers it.
  The **UI for entry/display** of an assist value needs its own design (it is not
  "add weight"). **If the library has no assisted exercises yet, defer the build and
  document it** — but design the load-type model so a negative/assist value drops in
  later without rework.

**Implications for the data model (T-I1 build, → T-I2):**
- A first-class **load type** is needed (`external` | `bodyweight_only` |
  `bodyweight_loadable` | `bodyweight_assisted`) rather than inferring from
  `equipment_type` — `toEngineEquipment` currently collapses the two bodyweight
  buckets and can't represent assisted at all.
- The engine needs the **user's bodyweight** as an input to compute effective load
  for all three bodyweight types. Bodyweight is a profile value that **drifts**, so
  treat it as a *derived* engine input (like the anchor) — excluded from the
  freshness fingerprint, refreshed on recompute — OR capture the bodyweight on the
  logged set at log time for historical honesty. **Open sub-question for T-I2:**
  store bodyweight-on-set vs. read live profile weight (affects e1RM reproducibility
  of past sets). Bodyweight-only display is read-only prefilled; loadable/assisted
  hide the bodyweight component and surface only the added/assist value.
- `weight = 0` stops being the bodyweight signal; the rep-window math then has a
  real load to anchor on, which is what unblocks deleting the legacy no-anchor path.

## What would be lost if the legacy path were deleted today

| Behavior | rep-window covers it? | v9 needs |
|----------|----------------------|----------|
| No-anchor progression (weight + increment off actuals) | No (needs an anchor) | **Decided (2026-06-25): nothing — do not fabricate. No anchor ⇒ defer to the user's `initial_*` / manual seed, else unseeded.** |
| Bodyweight-only (weight=0) | No (math null at 0) | **Yes — biggest *genuine-data* gap; reps-at-fixed-load + a bodyweight flag (T-I1/T-I2)** |
| `reps_first` (+1 rep at held load) | Yes for anchored lifts (`index.ts:217-221`) | covered by the anchored path; not needed unanchored |
| `hold` for cut/maintain | Anchor reprices instead (arguably better) | covered by the anchored path; not needed unanchored |
| −10% big-miss back-off (`regression_pct`) | No — rep-window leans on the *falling anchor* | **Decided (2026-06-25): anchor-only. No explicit back-off; retire `regression_pct`.** |

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

## Recommended sequencing (updated 2026-06-25)

0. **T-I5 — retire the prior-peak seed. ✅ DONE (gated, v14 INACTIVE).** Independent
   of the bodyweight work; shipped first as the clean, decided slice.
1. **Decide the bodyweight data model.** ✅ **Decided (2026-06-25)** — see "Decision:
   bodyweight model" above (load type; bodyweight as effective load; assisted =
   negative; assisted UI/build deferred if no such exercises yet).
2. **Build the v9 no-anchor / cold-start prescription model** (incl. bodyweight
   reps-at-fixed-load) behind the existing branch, with a new weight=0 test. **← next.**
3. **Decide the big-miss back-off** policy. ✅ **Decided: anchor-only.**
4. **Delete the legacy block + retire its params** (new engine_params version;
   migrate old rows — incl. finally dropping `meso_seed_backoff_pct`); update tests.
5. (Separately) **T-A5** — graded MEV→MAV→MRV volume ramp + MRV-stop auto-deload,
   or amend doc 10 to the ±1 model.

## Spawned sub-tasks (add to backlog)

| ID | Title | Type | Status |
|----|-------|------|--------|
| T-I1 | Decide bodyweight data model (load type; bodyweight as effective load; assisted = negative) | D | **decided (2026-06-25) — see "Decision: bodyweight model" above; sequences T-I2** |
| T-I2 | Build v9 no-anchor/cold-start prescription model incl. bodyweight reps-at-fixed-load (+ weight=0 test) | F | blocked on T-I1 build (load-type column + bodyweight-as-load); no-data case decided: manual-seed deferral, no fabrication |
| T-I3 | Decide big-miss back-off policy in the v9 model (explicit regression vs anchor-only) | D | **decided (2026-06-25): anchor-only; no hidden back-off** |
| T-I4 | Delete legacy increment block + retire legacy-only params (new engine_params version, migrate old rows, update tests) | F | blocked on T-I2 |
| T-I5 | **Retire the prior-peak × back-off meso seed** (`seedMeso` `priorPeak` branch); seed precedence = confident anchor → user `initial_*` → unseeded/prompt. | F | **DONE (2026-06-25, gated) — `retire_prior_peak_seed` flag; engine_params v14 INACTIVE; activate after replay diff. `meso_seed_backoff_pct` left for T-I4.** |

> **PH36** (bodyweight model/increment settings) and **T-A3** (confidence
> fallback) are subsumed here: PH36 is the bodyweight half of T-I1/T-I2; T-A3 is
> moot under shipped config and folds into the cleanup at T-I4.
