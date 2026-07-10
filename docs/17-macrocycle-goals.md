# 17 — Macrocycle goal layer: targets, pacing, closeout, outcome (build spec)

**Status: authoritative build spec** (2026-07-10). Consolidates the
macro-goals architecture record
([`docs/reviews/2026-07-10-macrocycle-goals-architecture.md`](./reviews/2026-07-10-macrocycle-goals-architecture.md),
PR #166) with the owner's ratifications and three post-#166 facts: the
**est-strength rework** (PR #157 — `strengthTrend` rollup, key-lifts fold
retired, doc 10 §6), the **BodySpec build unblock** (PR #167 — doc 15 §8:
self-service OAuth registration verified live; Phases 1–3 buildable today in
the private deployment), and the **macro closeout decision** (owner,
2026-07-10: close naturally when every meso completes, or by an explicit
"End macrocycle" that irrevocably skips open work — mirroring the
workout/meso closeout family; **not** end-date-driven). Where this doc
conflicts with the architecture record, **this doc wins**; where it touches
prescribed progression, [doc 16](./16-prescribed-progression.md) keeps its
authority (this doc only schedules its two deferred rows, N36/N37).
Implementation proceeds in new sessions, **one phase per PR** (§9), the
doc-16 pattern.

**Backlog spine:** N21 (Phase 1) → N37 (Phase 2) → N40 (Phase 3) → N41
(Phase 4) → N34 (Phase 5, parallelizable from day one) → N36 (Phase 6,
field-data-gated) → Phase R (owner-gated activations). N38/N39 stay on the
doc-16 spine, untouched here.

---

## 1. Principles (each is binding)

1. **The engine-facing product of the macro layer is one number** — the
   expected monthly strength rate (a band) — plus two per-goal lookups
   (`goal_rate_factor`, `rep_window`). Mass-denominated targets never drive
   prescriptions (doc 15 §3.3); they are informational and outcome-graded.
2. **Budget, never quota** (doc 16 principle 4). The macro rate meters when
   earned steps are offered; only performance mints them. No macro
   consideration ever touches quantum size, entitlement, or the measured
   anchor.
3. **The stored target is the contract; the live target is the estimate.**
   `macrocycles.target_*`/`rate_*` are written at create and rewritten only
   by an explicit goals edit (a conscious re-contract); display surfaces may
   recompute live from the current profile, but **grading always uses the
   contract**.
4. **Performance never modifies the envelope.** Outcomes move
   `band_position` within [0,1] (Phase 6) and inform the *human* at close
   and at the next create; they never widen a band, rewrite a goal, or tune
   a rate table per-user.
5. **Derive, don't duplicate.** Cross-boundary state (pacing history,
   position, observed rate, retrospective) is derived on read from the
   permanent record (`engine_decisions`, logged sets, contract snapshots) —
   fingerprint-excluded, replay-recorded per doc 14 §3. New mutable per-user
   state needs this doc amended first.
6. **Measure honestly, per goal.** Strength outcomes grade in-app via the
   doc-10 §6 est-strength rollup; mass outcomes grade **only** against
   measured body data (bodyweight series / DEXA) and say **"not measured"**
   otherwise — never proxy-graded (doc 10 §9).
7. **Absent ⇒ byte-identical.** Every engine touch ships param-gated and
   inactive; v21 activation moves fingerprints via `paramsToken` exactly as
   v20 did (intended v-bump semantics).

## 2. Phase 1 — target-engine correction (N21, `engine_params` v21 inactive)

### 2.1 Strength path personalization

`computeTarget`'s strength branch (`src/lib/engine/macro.ts:285-302`) gains
the same modifier chain the hypertrophy path already has, with
strength-specific parameters:

```
rate_band = strength_pct_month[bucket]
          × strengthSexFactor(sex)        // NEW param strength_sex_factor
          × ageMultiplierStrength(age)    // existing taper, strength floor
```

- `strength_sex_factor` defaults `{ female: 1.0, male: 1.0 }` — relative 1RM
  gains are ~sex-equal (Roberts 2020; Refalo 2025; doc 10 §5 already states
  it). A distinct param from the hypertrophy `sex_factor_female = 0.7`,
  which models lean-mass fraction and must not be reused.
- Age taper: apply the existing `age_taper` (start 40, 0.02/yr) with a
  **strength-specific floor** `age_taper_floor_strength` (default **0.7** >
  the hypertrophy 0.6 — preserved neural adaptation; Peterson 2010, ACSM
  2009). Both endpoints of the band scale; compounding and
  `strength_cap_total_pct` behavior unchanged.
- `recommendDuration`'s strength branch uses the same personalized band
  (`macro.ts:428-435` currently reads the raw band).

### 2.2 Hypertrophy continuity

`hypertrophyRate` (`macro.ts:373-396`) flips between FFMI-proximity and
training-age decay on `bodyFatPct` presence; completing one field jumps the
rate. Fix: when height + bodyweight are present but body-fat is absent,
**proxy a conservative body-fat from the existing BMI bands** (the
`leannessBand` BMI thresholds, `macro.ts:398-414`, mapped to a
representative bf% per band — new param
`bf_proxy_pct: { lean: …, average: …, high_bf: … }` per sex) and run the
**proximity model on the proxy**, so the decay path is reserved for profiles
missing height/bodyweight entirely and the remaining-potential cap applies
on both sides of the bf% toggle. Acceptance is a **continuity golden**:
entering a bf% equal to the proxy moves the rate by ≈ 0; entering a
different bf% moves it proportionally, never discontinuously.

### 2.3 Cut-band guard

When `cut_cap_pct_bw` binds the high endpoint (`macro.ts:324-326`), the low
endpoint currently clamps to the same cap and the band collapses. Fix:
**proportional rescale** — if `high_raw > cap`, set `high = cap` and
`low = low_raw × (cap / high_raw)`. Parameterless, preserves the band's
relative width, no behavior change when the cap doesn't bind.

### 2.4 The personalized strength rate is exposed goal-independently

`MacroPlan` gains **`strengthRatePctMonth: { low, high }`** — the §2.1
personalized band, computed for **every** goal (it depends only on profile),
alongside the goal-denominated `perMonthRate` (unchanged, still the display
band). This is the field the Phase-2 pacer consumes: a hypertrophy macro
paces the *strength* dimension at `goal_rate_factor 0.75`, so the pacer's
source rate must be strength-denominated regardless of the macro's goal —
`perMonthRate` (lb/mo for mass goals) is the wrong carrier. **The
architecture record §2.3 is amended accordingly** (it said "expose
`perMonthRate`"; the exposure is this new dedicated field).

### 2.5 Contract snapshot + profile hygiene

- **Persist the plan inputs beside the plan outputs.** Migration adds
  `macrocycles.plan_inputs jsonb` (nullable); `createMacrocycleWithMesos`
  and `updateMacrocycle` (`src/lib/queries/macro.ts:97-169, 249-389`) stamp
  the resolved `MacroProfile` + params version whenever they write
  `target_*`. Explains any contract later ("set when you were 205 lb / 22%
  bf"); no read path depends on it in this phase.
- **`profiles.birthdate`** (nullable `date`) added alongside `age`;
  `profileToMacroProfile` derives age from birthdate when present, falling
  back to the static int. Onboarding/profile UI swaps the field; no
  backfill (single-user deployment — the owner re-saves once).
- **Doc 10 §5 amendments in this PR:** strength personalization params; the
  strength target restated as measured by the §6 est-strength rollup
  (the "% on key lifts" wording predates PR #157 — key lifts are retired
  from measurement); the hypertrophy proxy params.

### 2.6 Ship shape

`engine_params` **v21, applied inactive** (append-only migration), carrying
the new `macro_target` params. `planMacrocycle` is display/pacer-layer (no
stored prescriptions read it yet), but the params version still rides
`paramsToken`, so activation is the doc-14 v-bump. Replay diff + activation
are Phase R.

*Tests:* strength personalization goldens (60 F beginner ≠ 18 M beginner
post-fix; sex-equal at default factors; floor binds for high ages);
continuity golden (§2.2); cut proportional-rescale golden (band never
collapses; cap non-binding ⇒ byte-identical); `strengthRatePctMonth` present
for all four goals; v20-params (block absent) ⇒ byte-identical `MacroPlan`;
snapshot stamped at create + goals-edit (and not on unrelated edits);
birthdate-derived age preferred, int fallback.

## 3. Phase 2 — `rate_source: "plan"` pacer branch (N37)

- **Derived input.** `EngineInputs` gains
  `planStrengthRate: { low: number, high: number } | null` — assembled by
  the caller at the same sites as `progressionHistory`
  (generation/advance/recompute/replay), by evaluating the pure
  `planMacrocycle(profile, resolvedGoal)` in the queries layer and reading
  `strengthRatePctMonth`. Doc-14 treatment: **denylisted from the
  fingerprint** (it depends on bodyweight/bf%/age, none of which are config
  dimensions — a bodyweight edit must not churn open rows), **recorded in
  decision `inputs`** for replay, write/check parity test like `seedEarn`.
- **Pacer branch.** `pacerTargetRate` (`rules/progression.ts:388-398`):
  `rate_source === "plan"` and `planStrengthRate != null` ⇒
  `lerp(planStrengthRate, band_position) × goal_rate_factor[goal]`;
  otherwise today's bucket band. **Degradation is always toward `"band"`,
  never unpaced.** `band_position` and the factor compose identically under
  either source (so Phase 6 is source-agnostic).
- **Standalone mesos** evaluate `planMacrocycle` under `engineGoal(null)` →
  hypertrophy — pure, no macro row needed (one code path).
- **The flip itself is Phase R**, not this PR: v21 ships
  `rate_source: "band"`; a micro-bump (v22) flips to `"plan"` after the
  owner reviews the Phase-2 replay diff.

*Tests:* pacer arithmetic under `"plan"` vs `"band"` at fixed
`band_position`/factors; null plan rate ⇒ band fallback byte-identical;
fingerprint unchanged by plan-rate presence (denylist test); replay
reproduces the recorded rate frozen; standalone-meso assembly; goal
denomination (hypertrophy macro paces on the strength band × 0.75, never
lb/mo).

## 4. Phase 3 — macrocycle closeout + retrospective (N40)

### 4.1 Close transitions (owner-decided semantics)

Mirrors the workout → mesocycle closeout family one level up
(`endWorkout` / `endMesocycle`, `src/lib/queries/logging.ts:1394-1506`):

- **Natural close.** Wherever a meso reaches `completed` (final-week close
  in the week-advance path, `queries/progression.ts:690-698`, and
  `endMesocycle`), if it belongs to a macro and **every positioned sibling
  is terminal** (`completed`/`abandoned`), set the macro `status =
  'completed'`. Unbuilt placeholder blocks don't count as open work — a
  macro whose real mesos are all done closes naturally; the placeholders
  are recorded in the retrospective as "not built".
- **Explicit close — `endMacrocycle`.** For every non-terminal meso, in
  position order: any logged work ⇒ `endMesocycle` it (skip open sets/
  workouts, close micros, `completed`); never started ⇒ `abandoned`.
  Placeholders are abandoned likewise. Then the macro goes `completed`.
  **Irrevocable** — same confirm-dialog weight as ending a meso; logged
  history is never touched (hard rule 5). Surface: the macro header `⋮`
  menu ("End macrocycle"). No MCP write tool in this phase (the meso
  closeout has none either); revisit on demand.
- **Completed macros freeze:** `updateMacrocycle` refuses goals edits on a
  terminal macro (same rule as completed mesos, `cycles.ts:277`); placement
  of new mesos into it is already blocked by position guards.

### 4.2 Retrospective (derive-on-read, graded against the contract)

One pure fold, shared by the Overview and MCP (the shared-views
convention): `macroRetrospective(contract, strengthRollup,
progressionSummary, adherence, bodyData?)` →

- **Strength verdict** — the PR #157 rollup over the macro span:
  `estStrengthPct` headline + per-muscle changes
  (`getMacroStrength`/`volumeWeightedStrengthTotal`,
  `src/lib/queries/stats.ts:324-400`) against the **contract band**
  (`target_low/high` for strength-goal macros; for mass-goal macros the
  strength row is informational — factor-0.75/0 pacing means strength was
  never the promise). Verdict vocabulary: `within band` / `above band` /
  `below band` / `insufficient data` (< `strength.min_sessions` qualifying
  lifts) — never letter grades; estimate-vs-estimate copy per doc 10 §9.
- **Demand-side summary** — the `aggregateProgressionEvents` fold
  (`queries/progression-history.ts:427-488`) over the user's own decisions
  in the macro span, aggregate grain only: earn/miss mix, how often the
  pacer bound (rate-limited vs entitlement-limited), `vanished` share.
  (User-facing product summary of the user's own data under RLS — hard
  rule 9 governs engine *tuning/inspection*, which stays admin-MCP.)
- **Adherence + volume** — the existing tiles, restated at close.
- **Mass verdict** — **only when measured data brackets the macro**: a
  bodyweight series (Phase 4) and/or DEXA scans (Phase 5, LSC bands,
  same-machine flags). Otherwise the row renders "not measured" with the
  pointer to what would measure it. Never proxy-graded (principle 6).

Rendered on the macro Overview once `status = 'completed'` (replacing the
"to date" framing), and returned by `get_macrocycle_summary` as a
`retrospective` block. **Hard-rule-8 gate:** no mockup figure exists for a
completed-macro Overview, the retrospective card, or the End-macrocycle
dialog — the phase starts with the 09-changelog entry + mockup pass.

*Tests:* natural close fires only when the last real meso closes (mixed
placeholder fixture); `endMacrocycle` matrix (logged → completed via the
meso path, untouched → abandoned, history untouched, statuses terminal);
frozen-macro edit refusal; retrospective fold goldens (verdict per band
position, insufficient-data, mass "not measured" without body data);
Overview + MCP read one fold (parity test); e2e: end-macro flow → completed
Overview renders the retrospective.

## 5. Phase 4 — bodyweight series + create-flow priming (N41)

- **`bodyweight_log`** migration: `user_id, measured_on date, weight
  numeric > 0, source text check in ('manual','profile','dexa') default
  'manual', created_at`; unique `(user_id, measured_on, source)` (latest
  same-day manual entry wins on read); owner-only RLS + RLS tests in the
  same migration (hard rule 1).
- **Writers:** the profile bodyweight edit appends (`source: 'profile'`) —
  an explicit user action, so a direct write, not a proposal; a quick-entry
  affordance (More page / profile sheet — 09 entry + mockup pass first);
  Phase 5's DEXA sync appends `source: 'dexa'` points.
- **Readers:** the Phase-3 retrospective's mass verdict (points within a
  ±14-day tolerance of the macro's span endpoints ⇒ measured Δbw vs the
  contract band); an "as of" freshness label wherever profile bodyweight
  displays. `profiles.bodyweight` remains the engine/profile input —
  the log is measurement substrate (macro layer only, doc 15 §3.3 boundary
  applies to it identically).
- **Create-flow priming (the §4-carry affordance):** the create engine card
  (fig 2.3) gains one display-only line when a prior completed macro
  exists: the athlete's measured strength rate over that block
  (`strengthTrend` headline normalized to %/mo) beside the model band —
  *"model band 1.5–3%/mo · your last block measured 1.9%/mo"*. **Never
  blended into the target** (principle 4); 09 entry for the card amendment.

*Tests:* RLS (cross-user deny); append-on-profile-edit; same-day
resolution; retrospective flips from "not measured" to a graded Δbw with a
bracketing fixture; tolerance windows; priming line renders only with a
completed prior macro and never alters `MacroPlan` numbers.

## 6. Phase 5 — BodySpec DEXA phase-in (N34; parallelizable)

Per doc 15 §5, unblocked by §8 (self-service OIDC dynamic client
registration verified; refresh tokens supported; private single-user
deployment). Three PRs:

- **5a — connect + import.** Register the app's own OAuth clients (one per
  environment; persist each `registration_access_token` in the env secret
  store; record in `manual-operations.md`). `external_connections` +
  `body_scans` migrations (RLS + tests, `raw jsonb` per §2.2), PKCE flow
  (`offline_access` scope), zod-validated import + unit conversion, full
  backfill, More → integration screen (09 entry + figure). **First login
  verifies the §8.3 residual** (`ext_api_token` audience risk) before
  anything else builds on it; fallback = the old Phase-0 email with a
  concrete question.
- **5b — enrich + view.** Post-sync profile-update **proposal** (bodyweight,
  bf% — consented, never silent; appends `bodyweight_log` `source:'dexa'`
  on accept), `v_body_comp_history`, composition trend on the macro page,
  **bracketed-scan mass verdicts** slotting into the Phase-3 retrospective
  (≥2 same-machine scans bracketing the span; LSC noise bands ~1.5–2 lb
  lean; quarterly-cadence copy), percentile display.
- **5c — engine + MCP.** Measured bf%/FFM feeding `planMacrocycle` through
  the existing profile path (with the v21 correction — measured values ride
  the same `bodyFatPct` input; a later refinement may pass measured FFM
  directly), RMR context copy on cut/gain macros, MCP `get_body_composition`
  over the same view, comparability guardrail copy.

Non-goals unchanged (doc 15): no booking, no webhooks, no nutrition, no
automatic engine writes from scans; scans inform **targets and verdicts,
never prescriptions**.

## 7. Phase 6 — envelope loop (N36; gated on field data)

As fixed in the architecture record §3.3 (residence) + doc 16 §4 (shape):

- **Residence:** per-user **derived** `band_position` — a pure, clockless
  fold over the trailing ~2–3 mesos of `engine_decisions`, evaluated at
  seed time; `progression.band_position` (params) becomes the
  default/starting value and the fixed value while the loop is off. No new
  table; fingerprint-excluded, recorded in decision `inputs` (replay-exact;
  position history reconstructible from the decisions that consumed it).
- **Update rule:** at meso boundaries only, bounded steps (|Δ| ≤ 0.25),
  minimum dwell one meso, clamp [0,1]; inputs are **demand-side outcomes**
  (earn rate, earned-then-missed ratio, throttle trips, workload-gate
  firings, `over`/beat share) — never the measured rate. Thresholds are
  **fit from field data**: v20 active + a few real mesos read through
  `get_progression_history` (doc 16 §8.3). Bounded-lookback forgetting is
  the return-from-absence decay.
- **Params:** `progression.envelope` block (`.optional()`, off ⇒
  byte-identical), shipped inactive in a params bump after the rule is fit.

*Tests:* loop-off byte-identical; bounded movement + dwell + clamp goldens;
worst-case (broken outer loop pins band floor/top — both defensible
programs); replay determinism on recorded positions; source-agnostic
composition with Phase 2 (`"band"` and `"plan"` both lerp the derived
position).

## 8. Phase R — owner-gated activations (runbook, not code)

Sequenced entries in `docs/deployment/manual-operations.md`, in dependency
order:

1. **Activate v20** (already prepared — the doc 16 Phase R runbook; still
   pending as of this writing). Everything demand-side (pacer field data,
   Phase 6) waits on this.
2. **v21 review + activation** (after Phase 1): replay diff via
   `simulate_prescriptions`/`replay_decisions` (targets are display/pacer
   layer, so the diff is expected ≈ empty on prescriptions — assert that),
   then activate. **Re-enable the target cards** (PR #140 made it a pure
   view change) as a small code PR after activation, transcribing figs
   2.2/2.3 per hard rule 8.
3. **Flip `rate_source` to `"plan"`** (after Phase 2): v22 micro-bump +
   replay diff review (paced/skip mix shifts, no entitlement change) →
   activate.
4. **Monitor** via `get_engine_decisions` (rule/status filter) +
   `get_progression_history` (earn/miss/paced mix, `vanished` share) —
   the same instruments that later fit Phase 6.

## 9. Implementation plan (one phase per PR)

| PR | phase | blocked by | notes |
|---|---|---|---|
| 1 | §2 v21 target correction + contract snapshot + birthdate | — | migration inactive; doc 10 §5 amendments ride along |
| 2 | §3 plan-rate pacer branch | PR 1 | flip itself deferred to R3 |
| 3 | §4 closeout + retrospective | — (soft: PR 1 for `plan_inputs` explainability; grading uses the existing `target_*`) | starts with the 09/mockup pass |
| 4 | §5 bodyweight series + priming | PR 3 (retrospective rows) | small |
| 5a–5c | §6 DEXA phase-in | — (5b's verdict rows want PR 3) | **parallelizable from day one**; 5a's first login resolves the §8.3 residual |
| 6 | §7 envelope loop | v20 active + field data + PR 1 | params bump ships inactive |
| R1–R4 | §8 activations | as listed | owner steps, runbook |

Every phase lands green with its params/blocks absent (byte-identical),
carries its own tests (hard rule 3), updates its backlog row + `log.md` in
the same PR (notes protocol), and records itself in `PROGRESS.md`. UI
touches transcribe mockups or add 09 entries first (hard rule 8).

## 10. Cross-doc effects at build time

- **Doc 10 §5** — Phase-1 amendments (§2.5): strength personalization
  params, est-strength-denominated strength targets, bf-proxy params.
- **Doc 10 §6/§8** — unchanged (PR #157 already landed the est-strength
  rework this doc grades with).
- **Doc 15** — Phase 5 records the §8.3 verification outcome; §3.2's
  verdict lands as a Phase-3 retrospective row (5b).
- **Doc 16** — untouched; N36/N37 build phases point back to its §4/§6.
- **Architecture record (2026-07-10)** — superseded where amended here
  (notably §2.3's plan-rate carrier → `strengthRatePctMonth`, §3.4's
  end-date nudge → the owner's closeout semantics, §3.2/§4.3c's key-lift
  references → the strengthTrend rollup).
- **`docs/notes/`** — N21/N34/N36/N37/N40/N41 rows point here; N42 archived
  (merged with PR #157).
