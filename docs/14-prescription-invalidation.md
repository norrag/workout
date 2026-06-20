# 14 — Prescription Invalidation & Represcribe (design)

Status: **design, not yet built (2026-06-20).** It changes no behavior by itself —
it is the artifact to build the editable-increment feature (and future per-user
tunables) against. Builds on the on-load reconcile
([PROGRESS.md](PROGRESS.md), `reconcileMesoPlan`) and the regeneration machinery
in `src/lib/queries/regeneration.ts`. Engine intent lives in
[04-feedback-engine.md](04-feedback-engine.md),
[10-metrics-spec.md](10-metrics-spec.md), and
[13-reps-prescription-unification.md](13-reps-prescription-unification.md). When a
slice lands, fold the relevant amendment into those and update PROGRESS.md.

## 1. Problem

Prescriptions are **precomputed and stored** on `workout_exercises`
(`prescribed_weight/reps/sets`, `target_rir`). The engine only (re)writes them at
two moments: meso seed (`startMeso`) and the week N→N+1 advance (`generateDay`).
A stored prescription therefore goes **stale** whenever any input that fed
`prescribe()` drifts from what produced it. The inputs are:

1. **Global `engine_params`** — the active tuning row. Changes via admin
   activation; affects every user.
2. **The user's logged history → strength anchors** — refreshed automatically by
   the recompute itself (`getExerciseE1rmAnchors`), so it needs no separate
   signal.
3. **Per-user, per-exercise parameter overrides** *(new — the motivating case)* —
   e.g. an editable **weight increment** the user sets per exercise (kept unique
   to the user, like a pinned note). Future siblings: a custom rep window, an RIR
   cap, a loadable rounding step, a per-exercise progression style.

The on-load reconcile already keeps (1) and (2) correct cheaply: each prescription
stamps the `engine_params.version` it was computed under
(`workout_exercises.params_version`), and `reconcileMesoPlan` recomputes any
planned, not-yet-started row whose stamp is behind the active version, then stamps
it current — so steady-state loads are instant and a new version propagates on the
next open.

**The gap (3):** a per-user override edit does **not** move the global version, so
the `params_version`-vs-active gate can never detect it. A row computed under the
old increment stays stamped at the *current* active version and reads as "current"
forever. We need a staleness signal that is **per-user, per-exercise**, not just
global — and it must be robust and reusable, because the increment is only the
first of several per-user tunables.

> This is the limitation flagged when the version gate shipped: the reconcile
> stamps even un-recomputed rows (seeds, "unchanged", invalid-source) to the active
> version to keep the gate closed, so `params_version < active` cannot, by itself,
> rediscover a row whose *non-global* input later changed. §4 resolves it.

## 2. Goals & non-goals

**Goals**
- One **invalidation primitive** any feature can call to mark the right
  prescriptions stale — hard to misuse, scoped, and audited.
- The recompute reuses the existing reconcile/regeneration path (no second engine
  entry point), keeps the engine **pure**, and never touches started/logged work.
- Steady-state loads stay **instant** (the cheap gate is unchanged for the common
  case).
- Generalizes beyond increment to any per-user/per-exercise engine tunable.

**Non-goals**
- Building the increment editor UI or its storage in this doc (that is the first
  consuming slice; §6 lists the steps).
- Retuning the engine's progression behavior — only *which params* it sees per
  (user, exercise) changes; the math is unchanged.
- Offline/admin surfaces (out of scope per CLAUDE.md).

## 3. Two kinds of staleness, one gate

Generalize the gate's meaning rather than adding a parallel one. A planned,
not-yet-started prescription is **current** iff

```
params_version IS NOT NULL  AND  params_version >= active_version
```

Everything else needs represcribe. The reconcile gate already shipped as exactly
`params_version IS NULL OR params_version < active`, so:

- **Global change** (engine_params activation) — handled as today: every row's
  stamp falls behind the new active version.
- **Targeted change** (a per-user override edit) — the mutation **explicitly sets
  `params_version = NULL`** on the affected planned rows. `NULL` becomes the
  universal *"invalidate me"* marker, independent of the global version, and the
  next reconcile picks it up.

No new column, no new scan, no second gate. `NULL` is the precise "these specific
rows" signal; the global version stays the coarse "everyone" signal.

## 4. The mechanism

### 4.1 Invalidation primitive (reusable)

A single query-layer function — the canonical, documented, tested way to mark
prescriptions stale. Every feature that changes an engine input calls it; nothing
else writes `params_version = NULL`.

```ts
// src/lib/queries/regeneration.ts (or a sibling represcribe.ts)
/**
 * Mark a user's OPEN prescriptions (planned, not-yet-started, no logged set) for
 * represcribe on the next reconcile, by clearing their params_version stamp.
 * The universal invalidation primitive: any per-user input change the engine
 * consumes (an exercise increment edit, a future per-user tunable) calls this for
 * the affected scope. Scoped to the owner; never touches in-progress / completed /
 * skipped work, logged sets, or manual set_weights. Returns rows invalidated.
 */
export async function invalidatePlannedPrescriptions(
  service: Client,
  userId: string,
  scope: { exerciseId?: string; mesocycleId?: string } = {},
): Promise<number>;
```

It updates `workout_exercises.params_version = NULL` where the row is owned by
`userId`, sits on a `planned` workout, matches the optional `exerciseId` /
`mesocycleId` scope, and has no logged set. For the increment feature:
`invalidatePlannedPrescriptions(service, userId, { exerciseId })` right after the
override is saved.

### 4.2 Per-user override resolution (keeps the engine pure)

Overrides live in their own per-user, per-exercise table, mirroring
`exercise_notes` (RLS `user_id = auth.uid()`, index on `(user_id, exercise_id)`):

```sql
-- shape to pin down with the first consuming slice
create table public.exercise_param_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  weight_increment numeric,        -- null = use the engine default
  -- room for future per-exercise tunables (rep window, rir cap, rounding step…)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);
```

The engine stays a pure function of one resolved `EngineParams` (hard rule #3).
Resolution is a **pure** query-layer merge:

```ts
// src/lib/engine/params.ts (pure) — global params + one override → effective params
export function resolveEffectiveParams(
  global: EngineParams,
  override: ExerciseParamOverride | null,
  equipment: EngineEquipment,
): EngineParams;
```

The increment override maps onto the engine tunable(s) it represents — the legacy
`params.increment[equipment]` and/or the rep-window loadable `params.rounding[equipment]`
(decide and document which when the slice lands; see `src/lib/engine/index.ts`
§3). Every site that calls `prescribe()` for a user's exercise — `generateDay`,
the seed builders, and the regeneration replay — resolves effective params first;
all other call sites are unaffected because no override means
`resolveEffectiveParams` returns `global` unchanged.

### 4.3 Recompute path — candidates keyed off the row marker

This is the **one substantive change** the mechanism requires, and it must land
**with** the first feature that uses overrides — never before (see §5).

`getRegenerablePlannedDecisions` today gathers candidates as planned rows whose
**latest decision** `params_version < activeVersion`, then replays the stored
decision inputs through `prescribe(inputs, activeGlobalParams)`. Two changes:

1. **A row with `params_version IS NULL` is always a candidate**, regardless of its
   decision's version. So the gathering predicate becomes "the *row* is behind"
   (`we.params_version IS NULL OR we.params_version < active`), not "the *decision*
   is behind." This is what lets a targeted, no-global-bump invalidation actually
   recompute. (The stored decision inputs — logged sets, feedback — are still the
   replay source; only the resolved *params* differ.)
2. **Replay under effective params**, anchor- *and* override-rebuilt:
   `prescribe(inputs, resolveEffectiveParams(activeGlobal, override, equipment))`.
   The new increment flows in through the effective params, so the replay produces
   the new numbers and `planRegeneration` classifies the row `changed`.

After applying, the reconcile stamps every still-behind open row
`params_version = active` exactly as today (a `NULL` row recomputed under an
unchanged global version still lands at `active` — correct, it is now consistent
with the active version *and* current overrides). The audit `engine_decisions` row
is appended as today, with the override value recorded in `provenance` (§4.4).

### 4.4 Provenance & a future fingerprint backstop

Explicit invalidation (push) is cheap but relies on every mutation calling the
primitive. To keep the system auditable and drift detectable:

- **Provenance (do now, with the slice):** record the override values used in the
  decision's `provenance` jsonb (the column already exists) so
  `explain_prescription` and audits show *why* a number was chosen and under which
  override.
- **Fingerprint (future hardening, optional):** store a cheap
  `inputs_fingerprint` (hash of the override-relevant params slice) on the row as a
  backstop the reconcile could verify lazily, or admin tooling could scan to catch
  a missed invalidation. Documented as a later option, not required for v1 — the
  primitive + tests are the v1 guarantee.

## 5. Sequencing & safety

The pieces are **interdependent — do not ship the invalidation primitive alone.**
With today's reconcile, nulling a row whose decision is already at the active
version makes the recompute *skip* it (candidate gathering keys off the decision
version) while the closing bulk-stamp still re-stamps it `active` — so the row
would be marked current **without being recomputed under the new override**:
silently wrong. The candidate-gathering change in §4.3 is the precondition.

Therefore the first vertical slice ships these together:
override table + resolution → recompute keyed off the row marker → the
invalidation primitive → the increment editor that calls it.

## 6. Build checklist (first slice — editable increment)

1. **Migration:** `exercise_param_overrides` (RLS `user_id = auth.uid()`,
   default-deny, `(user_id, exercise_id)` index + RLS tests in the same PR —
   hard rule #1). Append-only.
2. **Engine:** pure `resolveEffectiveParams(global, override, equipment)` +
   golden/unit test that an override changes only the increment-driven output.
3. **Queries:** resolve effective params in `generateDay`, the seed builders
   (`buildDayExerciseRows`), and the regeneration replay; change
   `getRegenerablePlannedDecisions` to gather on the **row** marker and replay
   under effective params; record override provenance.
4. **Primitive:** `invalidatePlannedPrescriptions(service, userId, scope)`; call
   it from the override-save action.
5. **UI:** increment editor on the Exercise page (per CLAUDE.md, transcribe the
   mockup before building); default shown, edit persists per-user, "reset to
   default" clears the override and invalidates.
6. **Tests:** primitive scope (planned/no-logged only, owner-scoped); reconcile
   recomputes a `NULL`-marked row with no global bump; idempotent re-run is a
   no-op; started/completed/logged rows untouched.

## 7. Invariants (carried from the hard rules)

- **No edits to logged history** (#5): invalidation and recompute touch only
  `planned`, not-yet-started rows with no logged set; `set_weights` overrides and
  all logged sets are never touched.
- **Engine stays pure** (#3): override resolution is query-layer; the engine sees
  one resolved `EngineParams`. Every behavior change keeps a unit/golden test.
- **RLS, default deny** (#1): the override table is `user_id = auth.uid()`; the
  primitive runs service-side scoped to `userId`.
- **Audit trail intact:** every recompute appends an `engine_decisions` row, now
  carrying the override provenance — one definition of progress.
- **Idempotent & cheap:** after a represcribe the rows are stamped current, so the
  next reconcile short-circuits at the gate; steady-state loads stay instant.
