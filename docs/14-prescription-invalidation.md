# 14 — Prescription Freshness: dependency tracking & recompute (design)

Status: **design, not yet built (2026-06-20).** Authoritative design for how stored
prescriptions stay correct when any of their inputs change. It supersedes the
narrower "invalidate on increment edit" sketch and **redesigns the
`params_version` staleness gate** (PR on branch `…version-check…`) into one
general framework; that gate becomes a single special case (§9). Engine intent
lives in [04-feedback-engine.md](04-feedback-engine.md),
[10-metrics-spec.md](10-metrics-spec.md), and
[13-reps-prescription-unification.md](13-reps-prescription-unification.md). When a
slice lands, fold amendments into those and update [PROGRESS.md](PROGRESS.md).

---

## 1. The problem, stated correctly

A prescription (`workout_exercises.prescribed_weight/reps/sets`, `target_rir`) is a
**cached derived value**: the output of the pure engine `prescribe(inputs, params)`
(and `seedMeso` for cold starts). It is computed and frozen at one moment — meso
seed, or the week N→N+1 advance — and then displayed for days.

It becomes **wrong** the instant any input that fed it changes and is not
recomputed. The inputs come from many places, at many scopes:

| Source of change | Scope it affects | Examples |
|---|---|---|
| `engine_params` activation | **global** (all users) | tuning, rep windows, increments, deload |
| Exercise param override | **user × exercise** | editable weight increment (future: rep window, rounding, RIR cap) |
| Profile edit | **user** | experience level, units |
| Macrocycle goal change | **macrocycle** (its mesos) | hypertrophy ↔ strength ↔ cut ↔ maintain |
| Mesocycle config edit | **mesocycle** | RIR ramp, weeks, deload flag |
| Logged history / feedback | **user × exercise** | (today: handled by the generation flow, §6.4) |

This is the classic **cache-invalidation problem**, and it is foundational: the app
will keep growing inputs (preferences, goals, profile facts), and each new one must
not require re-solving correctness from scratch. The wrong fix is to bolt a bespoke
"flag the affected rows" path onto each new source — that is N fragile contracts,
each of which can forget a case and silently show stale numbers. We want **one
framework** where:

1. a stored prescription **declares what it depends on**,
2. staleness is **derived from the actual current inputs** (so it cannot be
   "forgotten"),
3. only the **precisely affected** prescriptions recompute, **lazily** and as
   **lightly** as possible.

---

## 2. Principles

- **Pull, not push.** Don't make each source hunt down and flag affected rows.
  Instead, each prescription carries a **signature of the inputs that produced it**;
  on read we compare it to the inputs as they are *now*. A mismatch means stale.
  This is self-correcting: a source literally cannot forget to invalidate, because
  staleness is computed from the live inputs, not from anyone remembering to mark a
  flag.
- **The signature is derived from the engine's own inputs**, so it can never drift
  from what the engine actually consumes (§3). Adding an input the engine reads
  automatically extends the signature — you can't have a dependency the framework
  doesn't see.
- **Cheap to check, precise to recompute.** The check is a hash compare over a few
  cheap reads; the expensive `prescribe()` replay runs only for rows that actually
  diverged.
- **Lazy.** Recompute happens when prescriptions are read for display, not eagerly
  on every mutation. Nothing recomputes until someone looks.
- **Immutable history is sacred** (hard rule #5). Only `planned`, not-yet-started
  prescriptions with no logged set are ever rewritten. Logged sets, manual
  `set_weights`, and started/completed workouts are never touched.
- **Engine stays pure** (hard rule #3). All resolution and hashing live in the
  query layer; the engine still takes one resolved `EngineInputs` + `EngineParams`.

---

## 3. Model: inputs split into *config* and *derived*

`EngineInputs` (see `src/lib/engine/types.ts`) divides cleanly:

- **Config inputs** — cheap to re-resolve, and the things a *source* changes:
  `exercise.equipmentType`, `user.{experienceLevel,units}`, `goalType`,
  `week.{targetRir,isDeload}`, `previous` (the prior week's prescription),
  `initial` (plan cold-start defaults), and the **engine_params token** (its
  `version` / `params_hash`). Plus per-user/per-exercise **overrides** (the new
  increment, etc.) resolved into *effective params*.
- **Derived inputs** — require reading logged history, so they are *expensive* and
  are **excluded from the cheap check**: `actualSets`, `exerciseFeedback`,
  `workoutFeedback`, `muscleGroupWeeklySets`, `weekPeak`, `strengthAnchor`.

The freshness **signature (fingerprint)** is a canonical hash of the **config
projection** of the inputs:

```
dep_fingerprint = sha(canonical({ ...configProjection(inputs), paramsToken }))
```

`configProjection` is a **denylist** (everything in `EngineInputs` *except* the
known derived fields). Denylist, not allowlist, on purpose: a newly added config
input is included by default, so the failure mode is "we recompute a bit too
eagerly," never "we silently miss a change." (See §6.4 for why derived inputs are
safe to omit.)

> **One resolver, used at both write and check.** The only correctness requirement
> is that the config projection is built the *same way* when a prescription is
> written and when its freshness is checked. So factor a single pure
> `resolveConfigInputs(scope) → ConfigInputs` (a refactor of today's
> `buildEngineInputs`); generation builds `EngineInputs = resolveConfigInputs(...) +
> deriveHistory(...)`, and the freshness check calls `resolveConfigInputs(...)`
> alone. A golden test asserts `configProjection(buildEngineInputs(x)) ===
> resolveConfigInputs(x)` so the two routes can never drift.

---

## 4. Storage

`workout_exercises` gains one column:

```sql
alter table public.workout_exercises
  add column dep_fingerprint text;   -- null = never stamped → always recompute
```

That single column **replaces** the `params_version` gate (§9). The engine_params
version is folded into the fingerprint via `paramsToken`. (Keep `params_version`
only if useful for human-readable audit; it is no longer the gate.)

The audit trail stays in `engine_decisions`. Generalize it so **seeds record a
decision too** (today only advances do), giving a uniform replay source for
recompute (§6.2). Store the resolved dependency component values in the decision's
`provenance` jsonb — so `explain_prescription` can show *why* a number was chosen
and *what input changed* on a recompute.

No new bookkeeping table is needed for the common case: the fingerprint hashes
input **values**, read from the rows that already own them
(`profiles`, the override table, `macrocycles`, `mesocycles`/`microcycles`,
`engine_params`). There is no separate "revision registry" to keep in sync, and no
trigger discipline to forget.

---

## 5. The freshness check (read path)

A single function, called wherever prescriptions are read for display (the Workout
tab, the planned Day View, the meso planner) — not bolted to one page:

```ts
// reconcilePrescriptions(service, userId, { mesocycleId }) → { recomputed: number }
```

Steady-state cost for one meso:

1. resolve the cheap config dimensions once, batched: active `engine_params`
   version (cached), the user's `profile`, the meso's `macro` goal, the meso's
   microcycle RIR ramp (already loaded for the page), and the **override rows for
   this user × the meso's exercises** (one indexed read).
2. for each open prescription, build its `ConfigInputs` from that batch and hash →
   **expected** fingerprint. (Pure, in-memory.)
3. compare to the stored `dep_fingerprint`.
   - **all match → done.** No decision lookup, no anchor recompute, instant.
   - **some differ → recompute exactly those** (§6), in **week order** so a changed
     `previous` propagates to the next week within the one pass.

That is one extra indexed read (overrides) over what the page already loads, plus
in-memory hashing — the lightest check that is still complete.

> **Optional Tier-0 fast path (only if profiling demands it).** Maintain a scalar
> `prescription_epoch` per user (bumped by DB triggers on the source tables) and a
> global epoch (bumped on `engine_params` activation); store `(global,user)` epoch
> on each prescription. If both match the current epochs, skip step 1 entirely.
> This trades trigger machinery for removing ~one read; **not recommended for v1** —
> the fingerprint check is already cheap, and triggers reintroduce a discipline the
> pull model exists to avoid. Documented so the option is on record.

---

## 6. Recompute

### 6.1 What recompute does

For each diverged prescription, in week order:

1. **Resolve effective params** = global active params **+** the user×exercise
   override merged in (pure `resolveEffectiveParams`; the engine stays pure).
2. **Rebuild inputs**: config from `resolveConfigInputs` (current), derived from
   live history (`getExerciseE1rmAnchors`, logged sets of the source week, etc.) —
   so a config-triggered recompute also picks up the latest anchors for free.
3. **Run the engine** (`prescribe`, or `seedMeso` for a week-1/cold row — dispatch
   on the decision `kind`, §6.2).
4. **Write back** `prescribed_*`, `target_rir`, `notes`, and the **new
   `dep_fingerprint`**; append an `engine_decisions` row stamped with the params
   version/hash, the dependency component values, and a "recomputed: {reason}"
   provenance.
5. **Preserve manual intent**: per-set `set_weights` overrides are left untouched
   (they sit on top of the prescription; "reset to prescription" clears them
   separately). Logged sets and started/completed work are out of scope by
   construction.

### 6.2 Uniform replay source (normalize seeds)

Recompute should not need bespoke logic per write origin. Record an
`engine_decisions` row for **seeds** as well as advances, tagged `kind: "seed" |
"advance"`, carrying the inputs that produced the prescription. Then recompute is
always "re-run the engine of `kind` on the stored config inputs, with current
effective params + refreshed derived inputs." User-added slots
(`addWorkoutExercises`) likewise record a `kind: "seed"` decision. This removes the
current special-case where seed rows have no decision and so can't be replayed.

### 6.3 Self-healing for un-recomputable rows

If a row's stored inputs can't be replayed (corrupt/invalid), restamp its
fingerprint to the **current** expected value and move on — never loop. This is
*not* a permanent lie (the flaw of a monotonic version stamp): if any of its inputs
change again, the expected fingerprint changes again and the row is re-attempted.
It self-heals on the next real change.

### 6.4 Why derived (history) inputs are omitted from the check

Future prescriptions are (re)generated from a **completed** source week; an open
prescription's `previous` and derived inputs come from immutable, completed work,
so they don't drift under the user mid-view. Live history therefore doesn't need to
*trigger* a freshness check — the generation flow already owns "new history → next
week's numbers." And because recompute (§6.1 step 2) always refreshes anchors,
whenever a *config* change does trigger a recompute, it incorporates the latest
history anyway. If we ever want history edits to invalidate already-generated
weeks, add a cheap `history_token` (e.g. max `updated_at` of the source week's
logged sets) as one more config dimension — the framework extends without
redesign.

---

## 7. Adding a new source — the reusable contract

This is the whole point: a new input must be a **small, mechanical** addition, not a
correctness redesign. To add any source of change:

1. **Make the value part of the engine's resolved inputs** — either an
   `EngineInputs` field or an *effective-params* override. (You were going to do
   this anyway; the engine can't use what it can't see.)
2. **Resolve it in `resolveConfigInputs`** (and, if it's an override,
   `resolveEffectiveParams`). Because the fingerprint is the config projection of
   the inputs, this **automatically** puts it in the signature — no separate
   "invalidate" wiring.
3. **Done.** On the source's next mutation, the live value differs from what the
   stored fingerprints encode, the read-path check sees the mismatch, and exactly
   the affected prescriptions recompute on next view.

Worked mappings:

| Source | Step 1–2 | What gets recomputed |
|---|---|---|
| **Engine params** activation | already a fingerprint token (`version`/hash) | every user's open prescriptions (global) |
| **Increment override** (user×exercise) | new override table → `resolveEffectiveParams` | that user's open rows **for that exercise** |
| **Profile** (experience/units) | already in `user` inputs | that user's open rows (all exercises) |
| **Macro goal** | already in `goalType` | open rows under that macro's mesos |
| **Meso config** (RIR ramp/weeks) | already in `week.*` + `previous` | that meso's open rows |

No source needs to know what a `workout_exercise` is. **Scope falls out of the
fingerprint automatically** — an increment edit only changes the fingerprint of
rows for that exercise, so only those recompute, even though the check ran over the
whole meso.

> **Eager option (optional, per source).** Pure-lazy refresh-on-view is correct and
> lightest. If a particular change should feel instant *before* the user navigates
> (rare), the source may additionally call `reconcilePrescriptions(userId,
> { mesocycleId })` right after its mutation — the *same* function, just invoked
> early. It is an optimization, never a correctness requirement, and it cannot
> diverge from the lazy path because it is the lazy path.

---

## 8. Invariants (carried from the hard rules)

- **No edits to logged history** (#5): only `planned`, not-yet-started rows with no
  logged set are rewritten; `set_weights` and logged sets untouched.
- **Engine pure** (#3): resolution + hashing are query-layer; every behavior change
  keeps a unit/golden test (incl. the projection-equivalence test in §3).
- **RLS, default deny** (#1): the override table is `user_id = auth.uid()`; the
  reconcile runs service-side, scoped to the owner.
- **Audit intact:** every recompute appends an `engine_decisions` row (now incl.
  seeds) with dependency provenance — one definition of progress, shared with MCP.
- **Idempotent & cheap:** after a recompute the rows carry the current fingerprint,
  so the next check matches and short-circuits; steady-state reads stay instant.
- **Append-only migrations** (#2): the column add, the override table, and the
  `engine_decisions.kind` addition ship as new migrations with RLS tests.

---

## 9. What this replaces / transition

- **`params_version` gate → `dep_fingerprint`.** The single-scalar gate modeled
  exactly one input (global params) and could not see per-user/per-exercise change;
  it also had to "stamp even un-recomputed rows current" to avoid re-scanning,
  which made non-global changes undiscoverable. The fingerprint subsumes it
  (params version is one component) and self-heals (§6.3), so that wart is gone.
  Migration: add `dep_fingerprint`, backfill by computing it from each open row's
  latest decision inputs; retire the `params_version` read-gate (keep the column
  for audit only, or drop it).
- **Workout-tab-only reconcile → read-path reconcile.** Move the check into the
  prescription read/query layer so every surface that displays prescriptions gets
  fresh numbers, not just the Workout tab.
- **Seed rows with no decision → uniform decisions** (§6.2), so recompute has one
  replay path.

---

## 10. Mechanisms to retire on cutover

Once freshness is automatic, self-correcting, and runs on the read path, several
mechanisms that exist *only* to paper over the old "prescriptions silently go stale"
gap become dead weight. Removing them is part of the work, not a follow-up — a
half-migrated state (both the old manual machinery and the new framework live) is
the worst of both. Each line below is **remove** unless marked otherwise.

**MCP tools** (`src/lib/mcp/tools/admin.ts` + its registry/tests):

- `regenerate_planned_prescriptions` — **remove.** Its entire job is "after
  `activate_engine_params`, manually re-run the engine on planned rows behind the
  active version and write them back." The read-path reconcile now does this for
  every input change, automatically, with no manual step. The two-step
  `plan_token`/`confirm_token` dry-run→apply dance and its `regenPlanToken` machinery
  go with it.
- `catch_up_generation` — **remove the manual tool, keep the underlying gap-heal.**
  Important distinction: this heals **missing days** (a *generation* gap), which is a
  **separate concern** the freshness framework does **not** cover — do not delete the
  on-load `catchUpMesoGeneration` auto-heal. The MCP tool is only a redundant manual
  trigger for that auto-heal (already redundant before this design); retire the tool,
  leave the auto-heal in the read path alongside the freshness check.
- `replay_decisions` — **keep.** Read-only pure replay/inspection for engine
  debugging; writes nothing. It complements the framework (the recompute is, in
  effect, an audited replay) and is the right tool to preview what a recompute would
  produce.
- `simulate_prescriptions` — **keep.** Read-only what-if; an inspection surface, not a
  correctness mechanism.
- `activate_engine_params` / `propose_engine_params` / `discard_engine_params` /
  `list_engine_params` / `get_engine_params` — **keep.** These are the *source* of the
  global change; activation simply moves the `engine_params` token that feeds the
  fingerprint. No manual "now go regenerate" follow-up is needed anymore — note that
  in `activate_engine_params`' description (drop the "then run
  regenerate_planned_prescriptions" guidance).

**Internal query code** (`src/lib/queries/regeneration.ts`, `progression.ts`,
`generation.ts`, `app/(app)/workout/page.tsx`):

- `reconcileMesoPlan` (the Workout-tab-only reconcile) — **replace** with the
  read-path `reconcilePrescriptions`; remove the page-level call in
  `workout/page.tsx` in favor of the shared read-path integration (§5).
- `getRegenerablePlannedDecisions` (candidate gathering keyed off
  `decision.params_version < active`) — **remove**; superseded by fingerprint-keyed
  selection.
- `regenPlanToken`, `withRecomputedAnchors`, `anchorKey` — **remove / absorb.** The
  token gating dies with the admin apply tool; anchor re-resolution folds into the
  unified recompute's derived-input refresh (§6.1 step 2).
- `planRegeneration` / `applyRegeneration` — **reshape, don't delete.** Their core —
  replay stored inputs through the engine, classify changed vs unchanged, write back
  + append an audited decision — is exactly the recompute; keep the logic, re-home it
  under the fingerprint-driven `reconcilePrescriptions`, drop the version-diff framing.
- The branch's `workout_exercises.params_version` **gate logic** (and the
  `getPlannedWorkoutIds`/stale-scan/bulk-stamp helpers added with it) — **remove**;
  `dep_fingerprint` replaces it.

**Schema** (new append-only migrations — never edit applied ones, #2):

- `workout_exercises.params_version` column — **drop** (the audit trail lives on
  `engine_decisions.params_version`, which stays). Keeping an unused column only
  invites confusion; if a debugging reason surfaces, keep it but stop reading it.
- `engine_decisions.params_version` / `params_hash` — **keep** (audit), now joined by
  the dependency-component provenance (§4).

**Tests/docs:** drop the `regenerate_planned_prescriptions` / `catch_up_generation`
admin-tool tests and the `regenPlanToken` tests; reshape `regeneration.test.ts`
around the fingerprint recompute; prune the matching PROGRESS.md / doc references so
the record shows one mechanism, not two.

> Sequencing note: tools and code are removed in the **same** phase that lands their
> replacement (§11), so `main` never carries both the manual machinery and the
> framework at once.

---

## 11. Build phases

1. **Framework, params-only (no behavior change).** Add `dep_fingerprint`;
   factor `resolveConfigInputs` + `configProjection` + `computeDepFingerprint`
   (pure, golden-tested); stamp it at every write; `reconcilePrescriptions` uses the
   fingerprint on the read path; backfill migration. **Same PR retires:** the
   `params_version` gate + its helpers, `getRegenerablePlannedDecisions` /
   `regenPlanToken`, the `regenerate_planned_prescriptions` and `catch_up_generation`
   MCP tools (keep the gap-heal), and the dropped column (§10). Equivalent behavior
   to today, but general — and with no leftover manual machinery.
2. **Normalize decisions** (§6.2): record seed/user-add decisions with `kind`;
   unify the recompute dispatcher.
3. **First per-user override — editable increment.** Override table (RLS + tests),
   `resolveEffectiveParams`, increment editor on the Exercise page (transcribe the
   mockup first — CLAUDE.md #8). Recompute scopes to the exercise automatically.
4. **Backfill the rest into the contract** as they arise (profile already flows;
   macro goal already flows; meso config already flows) — verify each with a test
   that a change recomputes the right rows and nothing else.
5. **(Optional) history token / Tier-0 epoch** only if a real need or profiling
   appears.
