# Repo review — 2026-07-01 (owner-requested, full-surface)

**Charter (owner):** review the repo for issues and opportunities for significant,
impactful improvements — performance, usability, UI/UX, streamlining, fixes,
anything — regardless of ambition; check against the open notes; fold findings
into the notes area.

**Method:** five parallel domain reviews (engine/analysis, data layer/DB/RLS,
UI/app routes, MCP/API/middleware/PWA, cross-cutting tooling), each briefed on
the live backlog + workstream J so already-tracked items were excluded. Findings
below were verified against the actual code (the engine findings by executing
`prescribe()`/`seedMeso()`; the DB findings against the latest state of each
policy/view across all migrations; CI against the real GitHub Actions runs).
The highest-severity claims were independently re-verified by the orchestrating
session.

**Tracking:** every finding is filed as backlog item **R1–R25** in
[`../notes/backlog.md`](../notes/backlog.md). This doc is the scoping/evidence
record for those IDs. Items the review surfaced that were *already tracked*
(bundle/caching work → WS-J; planner draft-path acknowledgment → WS-J Phase A #1;
`v_exercise_overview.best_e1rm` raw-Epley → T-A1; per-set tracking type → doc 07
Phase "design-v2 reconciliation", open) are **not** re-filed.

**Suggested attack order** (severity × leverage): R1 + R8 first (small diffs,
worst consequences) → R2 (revives the guardrails everything else relies on) →
R17 + R16 (the two field-usability failure modes) → R3 + R4 (write integrity) →
R20 (observability, makes every later fix verifiable in prod).

---

## 1 · Security & data integrity (→ workstream K)

### R1 — Share redemption is a cross-user copy primitive · HIGH
`shares_grantee_accept` (`supabase/migrations/20260611000001_initial_schema.sql:577-578`)
is `for update using (grantee_id = auth.uid()) with check (grantee_id = auth.uid())`
— row-level only, so a grantee may rewrite **any column** of a share row they're
grantee on, including `object_id`/`object_type` (no later migration touches shares
policies). `acceptShareCode` (`src/lib/queries/sharing.ts:102-141`) runs on the
**service client**, allows re-accept by the same grantee (the only "used" check is
`accepted_at && grantee_id !== granteeId`), and `copyExercise`/`copyTemplate`/
`copyMesocycle` fetch the object by id with RLS bypassed and **never verify
`source.user_id === share.owner_id`**. Exploit: redeem any code → UPDATE that
share's `object_id` to a victim's mesocycle/template/exercise uuid via PostgREST →
re-submit the code → the service role copies the victim's plan/notes into your
account. (Mitigated only by uuid unguessability — uuids leak via share/MCP
surfaces.) **Fix:** constrain the grantee update to `grantee_id`/`accepted_at`
(column-level grant, trigger, or split policy) **and** have `acceptShareCode`
assert the copied object is owned by `share.owner_id`. Add the missing `shares`
RLS tests (none exist).

### R2 — The guardrails are dead: clean-DB migrations broken + stale RLS suite + CI red and not required · HIGH
Two independent breaks, one effect — **hard rule #1's enforcement gate has never
run in CI**:
- **Migrations don't apply to a clean DB** (documented, unfixed, in
  `docs/deployment/manual-operations.md:63-77` since 2026-06-20): `is_admin()` is
  created at `20260611000001_initial_schema.sql:20` referencing `public.profiles`,
  created at line 37; `rls_auto_enable()` is `revoke`d in `20260620000001/2` but
  never created in any migration (hosted-only — itself a hard-rule-#2 violation).
  CI's `rls-tests` job fails at `supabase start`; the 32 RLS tests are **skipped**.
- **The RLS tests are stale anyway:** `tests/rls/rls.test.ts:105-113` updates
  `profiles.units`, dropped in `20260623120000_imperial_units_only.sql`;
  `rls.test.ts:491` expects active `engine_params.version === 5`, but migrations
  end at v10-active (v11–v16 ship inactive; the *live* DB is v16 — the suite and
  the hosted DB have diverged from the migration chain).
- **Every GitHub Actions run #228–239 (incl. `main`) concludes `failure`** and PRs
  #92/#93 merged over it — checks are not required, and permanently-red CI trains
  merges to ignore it.

**Fix:** reconcile the initial migration ordering (move `is_admin()` after
`create table public.profiles` — end-state identical, hosted unaffected), commit
`rls_auto_enable()` per the runbook's own fix table, repair the two stale
assertions, then make both CI jobs **required checks**. Unblocks R21's
integration tests (needs a bootable local stack).

### R3 — Plan/param writes are non-atomic; MCP authoring can trigger destructive half-applies; missing uniqueness lets races duplicate data · HIGH
Three write paths half-apply, and the newest MCP surface (PR #92 / I12) can drive
one of them from model input:
- **`saveMesoPlan` deletes the whole board, then re-inserts sequentially with no
  transaction** (`src/lib/queries/cycles.ts:804-874`). Any insert failure after
  the delete leaves the plan wiped or half-written — and for an **active** meso an
  empty plan makes `regenerateOpenWorkouts` delete every open workout. Reachable
  from MCP: `edit_mesocycle add_day` doesn't dedupe muscle groups (two entries
  resolving to the same `muscle_group_id` — e.g. "Chest"/"chest", case-insensitive
  map at `src/lib/mcp/tools/write.ts:64-77` → duplicate `EditGroup`s at
  `src/lib/mcp/tools/edit.ts:242-269`) → violates `unique (meso_day_id,
  muscle_group_id)` **after** the delete. `create_mesocycle`'s `days` path shares
  the dup-group hole plus: no duplicate-`day_number` check, no `exercise_id`
  existence check (unlike `edit_mesocycle`'s, `edit.ts:546-559`), and no zod `max`
  on `groups`/`exercises` arrays (`write.ts:142-161`) so >10 exercises trips the
  DB check mid-save. Model retries multiply orphaned drafts.
- **`startMeso` is non-retryable** (`src/lib/queries/generation.ts:366-431`):
  microcycles insert first, meso flips `active` last; a mid-loop failure leaves a
  `planned` meso whose retry hits `unique (mesocycle_id, week_number)` —
  permanently unstartable, no cleanup path.
- **`generateDay` can leave a poisoned empty day** (`src/lib/queries/progression.ts:319-371`):
  workout inserted, then exercises/decisions; failure after the first insert
  leaves an empty `planned` day that `planCatchUp` (`:450-451`) forever treats as
  generated — the gap never heals.
- **`activateEngineParams` deactivate-then-activate** (`src/lib/queries/engine-admin.ts:151-176`,
  reachable via MCP `activate_engine_params`): if the second statement fails, NO
  active row exists → `getActiveEngineParams` (`generation.ts:247-257`, `.single()`)
  throws on **every page/generation path app-wide** and `v_exercise_prs` (cross
  join on the active row) returns zero rows for everyone, until manually repaired.
- **Missing unique constraints:** `workouts` lacks `unique (microcycle_id,
  day_number)` while generation is read-then-insert (`progression.ts:736-751`) —
  a double-tapped completion racing `catchUpMesoGeneration` creates two week-N+1
  workouts, double-counted in `v_meso_week_sets`/`v_meso_summary`. `logged_sets`
  lacks `unique (workout_exercise_id, set_number)`; a retried `logSet` server
  action double-logs set N (`src/lib/queries/logging.ts:359-436` inserts blindly).

**Fix:** validate everything *before* the destructive step (dedupe groups per day,
dup day_numbers, exercise existence, per-group caps mirroring
`MAX_SLOTS_PER_GROUP`); move the four flows into single-transaction Postgres
functions (or write-then-swap for `saveMesoPlan`, single-statement swap for
params); add both unique constraints with `on conflict` handling at the insert
sites (append-only migration).

### R4 — Plan regeneration can cascade-delete logged history · HIGH
`regenerateOpenWorkouts` deletes any `planned` workout whose day left the plan
(`src/lib/queries/generation.ts:517-523`) and any removed `workout_exercises`
(`:579-589`) **without checking for logged sets** — unlike `removeWorkoutExercise`
(`logging.ts:703-720`), which counts first. `logged_sets` FK-cascades from both
(`20260611000001:338-345`). The `status === "planned"` guard is porous because
`logSet` writes the set **before** flipping the workout `in_progress`, in a
separate statement whose error is **silently discarded** (`logging.ts:429-433`) —
so a workout with logged sets can genuinely still be `planned` when a plan save
regenerates, and hard rule #5 ("no deletes of logged history") is breached by
cascade. Same silent-swallow pattern on `completeWorkout`'s per-exercise status
updates (`logging.ts:1335-1342`). **Fix:** exclude workouts/exercises with logged
sets from both delete branches (one `in` query, same pattern as
`removeWorkoutExercise`); check + surface the status-flip error (or make it
atomic with the insert).

### R5 — Completion lock is bypassable and asymmetric; child INSERT policies skip parent ownership · MED
`20260615000002_completion_lock.sql` locks only `logged_sets` (update/delete) and
`exercise_feedback`, but: (a) `workouts_all_own` (`20260611000001:299-300`) lets
the owner flip a completed workout back to `in_progress` via PostgREST, re-opening
every locked set; (b) `workout_exercises_all_own` never locks — `prescribed_*`,
`status`, `set_weights` on **completed** workouts stay editable, and those are
exactly what the engine reads as `previous` (`progression.ts:110-115`;
`regeneration.ts:609-622`) and what `v_meso_week_sets` counts; (c)
`workout_feedback_all_own` never locks — the session dampener is editable after
the advance ran; (d) `logged_sets_insert_own` allows inserting new sets into a
**completed** workout; (e) `exercise_feedback_update_in_progress`'s WITH CHECK is
only `user_id = auth.uid()`, so a row can be re-pointed at a locked/arbitrary
`workout_exercise_id`. Separately, child-table INSERT policies
(`microcycles`/`workouts`/`logged_sets`/`exercise_feedback`) don't validate the
FK'd parent is owned by the inserter (FK checks bypass RLS); reads stay safe, but
`exercise_feedback`'s `unique (workout_exercise_id)` lets an attacker who learns a
victim's workout_exercise uuid **squat the feedback slot**, permanently blocking
the victim's own feedback insert. **Fix:** gate `workouts` status transitions
(forbid completed→in_progress), add in-progress checks to the
workout_exercises/workout_feedback update policies and the logged_sets INSERT,
and add parent-ownership EXISTS checks to the child INSERT policies (as
`workout_exercises`/`meso_day_groups` already do).

### R6 — Workout dates & week rollups are computed in UTC, not user-local time · MED · needs-input
Date-only stamps use UTC "today": micro/meso `start_date`
(`src/lib/queries/generation.ts:363,375,427`, `progression.ts:768`), macro
`start_date` (`src/lib/mcp/tools/write.ts:123`), create-macro `today`
(`src/app/(app)/cycles/new/page.tsx:69`). DB views cast in UTC:
`performed_at::date` and `date_trunc('week', …)` (`20260611000001:649,668`,
`20260626000001:38`). No timezone on profiles; six divergent `shortDate` copies
(some noon-anchored, some not). For a US-timezone user **any workout logged after
~5–8 PM local lands on tomorrow's date** in history, PR dates, and week-boundary
rollups — "one definition of progress" systematically shifted for evening lifters.
**Needs the owner's call on the canonical rule** (profile timezone vs
client-supplied local date at write time), then fix the casts (`AT TIME ZONE`) and
consolidate date formatting into one `src/lib/dates.ts`.

### R7 — Service worker caches authenticated pages/RSC ~24h with no purge on sign-out · MED
`src/app/sw.ts:13-19` uses Serwist's `defaultCache` verbatim → NetworkFirst caches
same-origin documents/RSC payloads (and `/api/` GETs) in CacheStorage. (a) On
network failure the app silently serves day-old prescriptions — online-only by
design (hard rule #9), nothing marks the view stale; (b) after sign-out the
previous user's rendered pages remain in CacheStorage and can be served to the
next user of a shared device offline (`signOut` clears nothing,
`src/app/(auth)/actions.ts:70-74`). **Fix:** trim `runtimeCaching` to static
assets only, or clear caches on sign-out + show an offline interstitial instead of
stale content. (Sits beneath WS-J's `staleTimes` client-cache work — different
layer, different bug.)

---

## 2 · Engine & analysis correctness (→ workstream G unless noted)

### R8 — Joint-pain gate does not gate set additions: pain 3/3 still adds a set · HIGH
`modulateFromFeedback` (`src/lib/engine/rules/feedback.ts:26-52`): `painGated`
only blocks load; `setDelta` is computed with **no reference to jointPain**.
Verified by execution: `{jointPain: 3, pump: 8, workload: 2}` → sets 3 → 4,
rationale "joint pain 3/3: load increase blocked; … set added". Doc 10 §3 step 0
(the one signal labeled a **hard safety gate**): "`joint_pain ≥ 2` → never add
sets; `= 3` → −1 to −2 sets or suggest substitution, regardless of the rest."
Also no −sets response to pain 3 exists at all, and no test covers pain × set-add
(the property test only asserts no *load* increase). Distinct from T-A5 (ramp/
MRV-stop): even under the current ±1 model the pain gate must veto additions.
**Fix:** pain check first — `jointPain ≥ pain_gate` forces `setDelta ≤ 0`;
`jointPain ≥ 3` forces `setDelta = -1` + substitution note; table-driven tests.

### R9 — `analyzeComparableProgress`: any phase with ≤ window sessions reads "improving", even a strict decline · MED
`src/lib/analysis/comparability.ts:265-289` — with ≤ `window` (3) estimable
sessions, `recent` = all points so `rolling = best` (declining branch
unreachable) and `prior` is empty so the plateau branch is skipped → `trend:
"improving"`. Verified: e1RMs `[120, 110, 100]` → "improving", `change_pct: 0`.
Every phase start (each goal change resets the phase) spends its first sessions
asserting "improving" no matter what — on the MCP surface built to kill false
trend reads. **Fix:** `priorBest == null` → return `insufficient_data`/`plateau`,
or compare latest vs first; add short-phase declining tests.

### R10 — Replay re-runs seed decisions without `inputs.bodyweight` → every bodyweight-lift seed diffs spuriously · MED
`src/lib/mcp/tools/admin.ts:201-217` — the `kind === "seed"` branch calls
`seedMeso(…, { goalType, anchor })`, omitting `bodyweight`, which the stored
inputs carry (`src/lib/queries/fingerprint.ts:130-158`) and which `seedMeso`
needs under the live v16 `bodyweight_model` (`src/lib/engine/index.ts:575-588`).
Verified: a `bodyweight_loadable` seed with a confident anchor but no
`opts.bodyweight` returns the deferred null-weight prescription. Replaying any
candidate params over a user with pull-ups/dips reports all their seeds as
`changed` — corrupting the diff that doc 04 calls "the primary tuning loop".
**Fix:** pass `bodyweight: parsed.data.bodyweight`; add a replay test with a
bodyweight seed decision.

### R11 — Reconcile's unbounded `engine_decisions` fetch silently truncates at the PostgREST row cap → open rows re-seeded off the prior-meso peak · MED
`src/lib/queries/regeneration.ts:640-656` fetches **all** decisions for every
open row (no limit/pagination — `coaching.ts:18-67` documents this exact
`max-rows` hazard). Decisions accumulate per row per recompute/params-bump; past
~1000 the oldest drop, an open row whose only decision is old is misclassified as
decision-less (`:722`) and **backfilled as a seed** (`:924-985`), discarding its
real in-meso progression and permanently re-recording it as `kind:"seed"`.
Distinct from the tracked anchor `limit(600)` item (WS-J). **Fix:** latest-per-row
fetch (`distinct on` RPC or per-row limit), or cap decisions per row.

### R12 — Custom bodyweight exercises are permanently modeled as external load; MCP create/search under-validate · MED
`createCustomExercise` (`src/lib/queries/exercises.ts:97-123`) never sets
`load_type`; the column defaults to `'external'` NOT NULL
(`20260626000002:40-41`), and `coerceLoadType` prefers a valid stored value — so
a custom exercise created with `equipment_type: "bodyweight"` gets **wrong
effective-load/e1RM math forever** (affects the in-app form AND MCP). Plus MCP
boundary gaps (hard rule #6): `create_custom_exercise` takes `equipment_type:
z.string().min(1)` cast `as EquipmentType` (`src/lib/mcp/tools/write.ts:374-408`;
app form uses a strict enum) → bad value = raw Postgres check-constraint error;
same loose string on `search_exercises.equipment` (`read.ts:747-767`);
`muscle_groups` allows duplicates → unique violation **after** the exercise row
insert → orphan exercise with no muscles. **Fix:** derive `load_type` from
equipment on insert (`toEngineLoadType`), zod-enum the equipment vocabulary,
dedupe muscle groups. Consider a backfill migration for existing custom
bodyweight exercises.

### R13 — SetRow re-sync effect clobbers in-progress typing after background weight writes / auto-match · MED
The resync effect (`src/app/(app)/log/[workoutId]/DayView.tsx:1469-1475`) resets
both `weight` and `reps` (and clears `repsManual`) whenever `plannedWeight` or
`we.bodyweight` changes. Blurring the weight cell persists via
`updateSetWeightAction` (`:1491-1504`); when revalidation lands ~0.5–2s later,
`set_weights` changes and the effect overwrites whatever reps the user typed in
the meantime — tap LOG without noticing and wrong reps get logged. With
auto-match ON, logging set 1 rewrites `set_weights` on every other row, so typing
anywhere else in the exercise gets clobbered too. (Client-side cousin of the
shipped N3.) **Fix:** skip the reset while the row has uncommitted user edits
(`edited`/`repsManual` refs already exist) or sync only fields that differ from
the last server value.

### R24 — Engine guardrails & nits (batch) · LOW
- **No cross-field invariants in `engineParamsSchema`** (`params.ts:263-279`):
  nothing enforces `min ≤ target_low ≤ target_high ≤ max` (inverted window makes
  the Option-A clamp degenerate) or `min_sets ≤ max_sets_per_exercise`. Doc 04
  requires "a param-schema test so a bad row can never be activated" — the gate
  checks shape, not semantics. Add `.superRefine` + tests.
- **`e1rmFactor` non-monotonic for any tuned `brzycki_max_eff_reps` > 10**
  (`predict.ts:56-67`): above 10, Brzycki > Epley, so a cutoff >10 puts a
  downward jump in k(effReps) — verified with cutoff 14: asking for **more reps
  prescribes a heavier load**, breaking the bisection's monotonicity premise.
  Latent (default 10 = the crossing) but one `activate_engine_params` away.
  Constrain the param ≤ 10 or blend continuously; add a monotonicity property
  test for non-default values.
- **No-anchor "hold" silently moves the held load** (`index.ts:363-380`):
  rationale composes from the pre-rounding weight, then rounds — 27.5 lb on a
  5-lb step prescribes **30 lb** with "Hold 27.5 lb…". A fabricated +step on the
  path whose whole point (T-I3/T-I5 rulings) is never inventing numbers; also
  triggered by increment-override changes. Skip `roundToStep` on the hold path.
- **Stale `retire_prior_peak_seed` contract** (`params.ts:206-223` says "ABSENT ⇒
  legacy peak-backoff seed"; `index.ts:623-649` deleted the branch outright).
  Fix the comment; consider replay classifying pre-retirement seed decisions as
  expected-changed instead of polluting diff counts.
- **Option-A climb reprices the load *down* on RIR-hold weeks** (`index.ts:314-327`):
  `targetReps = prevReps + 1` every week regardless of whether the ramp stepped;
  on a ramp-hold week (…2→2…) the user sees "−5 lb, +1 rep" mid-meso — a lateral
  move that reads as regression. Design nit (doc 13 §8 leaves the schedule open)
  — flag for the owner; fix would be advancing `targetReps` only when RIR steps.

### R14 — Volume counting is primary-only, not the locked fractional 1.0/0.5 rule · MED · needs-input (→ workstream C)
`v_meso_week_sets` attributes each set solely to
`workout_exercises.muscle_group_id` (`20260617000003:119-143`); `buildBalance`
(`stats.ts:241-276`), `get_muscle_balance` MEV/MAV/MRV assertions
(`coaching.ts:548-566`), and the engine's `muscleGroupWeeklySets` ceiling input
(`progression.ts:158-170`) all consume those primary-only counts. Doc 10 §2
(locked, [EVIDENCED]) requires 1.0 per primary **+ 0.5 per secondary** via
`exercise_muscle_groups.role` — so secondary delts/triceps/hamstrings volume from
compounds is invisible: false "below MEV" calls, overly permissive MRV/ceiling
checks. Only `classifyDayEmphasis` implements the fractional rule. Also the doc
10 §8 params `volume.direct/indirect/counting_max_rir/warmups_count` are absent
from the schema — the RIR ≤ 4 "hard set" counting rule is implemented nowhere.
Distinct from T-A5 (ramp/MRV-stop decision). **Owner call:** count fractionally
(view join on `exercise_muscle_groups` + landmark reconciliation — changes every
Balance number the owner is used to) or amend doc 10 to the primary-only
simplification. Informs I11/PH37/M8 (WS C).

---

## 3 · Client resilience & UX (→ workstreams E, D)

### R17 — Sheet writes fail destructively: typed input destroyed, then the error page claims "Nothing was lost" · HIGH (→ E)
`NoteSheet.save()` fires `commit(...)` then `onClose()` synchronously
(`DayView.tsx:1894-1938`); `FeedbackSheet` save likewise (`:2546-2561`);
`CompleteSheet.finish()` awaits `completeWorkoutAction` with no try/catch
(`:2624-2634`). All `log/actions.ts` actions **throw** on failure; a throw inside
`startTransition` escapes to `(app)/error.tsx`, which unmounts the page — typed
note text, the three session sliders, workout notes all local state → gone — then
displays "Nothing was lost — try again" (`error.tsx:31`), which is false. The
correct pattern (rollback + toast) already exists (`runLog`, `DayView.tsx:1454-1465`;
`AutoMatchToggle.tsx:26-33`) but isn't applied to sheet writes or the ~12
fire-and-forget menu ops (move/add set/skip/replace/remove) — any transient gym
network failure blanks the whole day view. Related smaller holes, same theme:
fetch-on-open sheets have no error path (a rejected fetch = permanent "Loading…"
— `HistorySheet.tsx:30`, ReplaceSheet `DayView.tsx:2026`, AddExerciseSheet
`:2147`; `PrescriptionDetailSheet.tsx:62-83` already does it right); and
`saveMesoAsTemplateAction` redirects to `?error=template` which **no page reads**
(`cycles/actions.ts:237`) — silent failure. **Fix:** route every `commit()` write
through the `runLog`-style try/catch + toast; keep sheets open (or reopen with
state) on failure; copy the PrescriptionDetailSheet fetch pattern; surface the
template error param; fix the error-page copy.

### R16 — PlannerBoard staged edits are one failed save or one stray navigation from total loss · MED (→ D)
`doSave` (`PlannerBoard.tsx:556-582`) awaits `saveMesoPlanAction` with no
try/catch — failure throws to the error boundary, remounts the board,
reinitializes `workDays` from props (`:207`), silently discarding the entire
staged session. The `dirty` flag only guards the CANCEL button (`:865`); browser
back, the `‹` header link, and BottomNav taps discard everything with no confirm.
(Distinct from WS-J Phase-A #1, which is about *acknowledging* draft mutations —
ship them together.) **Fix:** catch the save failure in-sheet (keep `workDays`,
show retry); guard navigation while `dirty` (popstate/beforeunload + intercept).
Note R3 fixes the server half of the same flow (the wipe); this is the client half.

### R18 — Modal surfaces have no focus management/Escape/trap; core tap targets far below minimum; pinch-zoom disabled · MED (→ E)
- Zero `Escape`/keydown handling on any overlay; focus never moved in on open nor
  restored on close; background not inert — keyboard/SR users tab straight through
  the "modal" into hidden content (`BottomSheet.tsx:58-95` has
  `role="dialog" aria-modal` and nothing else; `AnchoredMenu` `DayView.tsx:1238-1313`
  is `role="menu"` with no `menuitem`/arrow nav; `CompleteSheet` `:2637-2728` has
  no role at all). This is the app's primary interaction pattern. One shared fix
  in `BottomSheet`/`AnchoredMenu`.
- The LOG checkbox is 21×21px (`LogCheckbox.tsx:74-80`; the wrapper claiming
  "≥44px tap target" at `DayView.tsx:1710-1711` is not clickable) — below WCAG
  2.2's 24px floor on the most-tapped control in the app; per-set ⋮ ≈20×10px
  (`DayView.tsx:1607-1615`); planner ▲▼ 14×20px (`PlannerBoard.tsx:717-734`).
- `maximumScale: 1` (`app/layout.tsx:43-44`) disables pinch-zoom app-wide — real
  WCAG 1.4.4 harm with a 9–11px tracked-caps type scale (Android/PWA respect it).
This scopes doc 07's open Phase-7 "accessibility audit of the logging flow".

### R19 — Small UX defect sweep · LOW (→ E)
- **No `not-found.tsx` anywhere** — 10+ `notFound()` call sites dead-end on
  Next's unstyled default with no tab bar. Concrete trigger: BottomNav links the
  Workout tab to sessionStorage's `lastWorkoutId` (`BottomNav.tsx:36-39,55`); end
  that meso and **the Workout tab itself lands on a raw 404**. Add an
  `(app)/not-found.tsx` ledger card + clear the stale pointer.
- **CompleteSheet totals contradict the header progress math** (`DayView.tsx:2616-2620`
  vs `:254-264`): skipped sets excluded from the header denominator but not the
  sheet's — 100% header, "2 / 4" sheet, same session.
- **Meso-detail SAVE AS TEMPLATE missed the Phase-A SubmitButton sweep**
  (`cycles/meso/[mesoId]/page.tsx:282-291`) — plain submit, no pending state.

---

## 4 · MCP / PWA robustness (→ workstreams D, K)

### R15 — A second concurrently-active mesocycle is possible; the sequential-activation invariant only covers same-macro siblings · MED (→ D)
`startMeso` gates only when `meso.macrocycle_id` is set, and `mesoActivationBlock`
checks siblings of that one macro (`generation.ts:266-327`). A standalone planned
meso — or one in a different macro — activates while another block is live; no DB
single-active constraint exists. `getCurrentState` then silently picks the
newest-created active meso (`cycles.ts:1026-1033`), so the in-flight block
vanishes from `get_current_state`/the Workout tab. The `activate_mesocycle` tool
description overstates the guarantee (`authoring.ts:381-389`), so an agent will
assume it's safe with `confirm="activate"`. The in-app path shares the hole; MCP
triggers it unattended. **Fix:** block activation while *any* of the user's mesos
is active (or explicit takeover arg) + partial unique index
`mesocycles (user_id) where status='active'`.

### R25 — MCP robustness polish (batch) · LOW (→ K)
- **Audit-write failure inverts the result of a committed mutation:** every write
  tool runs the mutation then `await recordMcpWrite(...)` which throws
  (`audit.ts:22-29`) → wrapper returns `isError` (`tools/index.ts:22-44`) for a
  *successful* write; an agent retries and duplicates drafts. Log loudly, return
  success.
- **Two error contracts:** domain failures as `{ ok:false, error }` in a normal
  envelope vs thrown → `isError` + `{ code, message, detail }` (`envelope.ts:120-160`);
  converge. And `withErrorHandling` wraps only `registerTool` — `registerResource`
  handlers (`resources.ts:26-65`) can throw raw Postgrest objects, reintroducing
  the `[object Object]` serialization the wrapper was built to kill.
- **`MCP_JWT_AUDIENCE` enablement has no home:** the audience-binding fix is
  opt-in (`auth.ts:83-88`, `docs/14-security-audit.md:235`) but
  `manual-operations.md` never mentions it — until set, any project-issued user
  JWT is a valid MCP bearer. Add the runbook step.
- **Tool-surface streamlining (46 tools):** `preview_mesocycle_volume`'s
  `mesocycle_id` mode duplicates `get_muscle_balance`'s landmark read; macro
  placement spans four tools; `list_engine_params` ⊂ `get_engine_params`.
  Consolidating cuts ~4–5 tools and reduces agent tool-choice errors.

---

## 5 · Delivery guardrails & observability (→ workstream L)

### R20 — Zero production error observability; the failure modes the app is designed around vanish silently · HIGH
No error reporting anywhere (`SENTRY_DSN` listed as pending in
`manual-operations.md:53`; nothing reads it; Phase 7 observability unchecked).
Meanwhile the riskiest paths swallow: reconcile failure → `return null`
(`regeneration.ts:1160` — persistent failure = **silently stale prescriptions**);
seed-decision recording failure → `return 0` (`seed-decisions.ts:122`); week
generation after completion → friendly fallback copy (`log/actions.ts:699,736`);
MCP tool errors never logged server-side (`envelope.ts`); the only client
boundary just `console.error`s. Also **no `global-error.tsx` and no `(auth)`
error boundary** — render errors there hit Next's raw screen. **Fix:** wire
Sentry (or Vercel error monitoring) for server actions, route handlers, MCP, and
a root `global-error.tsx` (the natural capture point); route the deliberate
degrade-gracefully catches through one `reportError()` helper so they degrade
*loudly*.

### R21 — Coverage gaps where regressions corrupt user plans · MED
- **The Playwright e2e suite does not exist** — no config, no test files,
  `@playwright/test` not in devDependencies; `npm run test:e2e` fails with
  "playwright: not found", yet `docs/02-architecture.md:94` claims "Playwright
  smoke on `main`" and CLAUDE.md lists the command. Add the dep + config + one
  smoke (sign-in → log a workout incl. feedback → complete) on local Supabase in
  CI, or remove the dead script.
- **No automated integration coverage of the write-pipeline I/O:** queries-layer
  tests are deliberately pure-helper-only (headers in `progression.test.ts`,
  `macro.test.ts`, `sharing.test.ts` defer to a *manual* "hosted-DB smoke");
  `generation.ts` (activate/seed) and `logging.ts` have **no test files at all**.
  The CI rls-tests job already boots local Supabase (once R2 lands) — add a
  `tests/integration/` pass covering activate/seed → log → complete → generate
  round-trips.
- **No golden meso under the production configuration:** the only full-meso
  simulation (`golden-meso.test.ts:29-64`) runs `strengthAnchor: null` under
  v10-shaped defaults, while production runs v16 (rep-window +
  `climb_on_performed_reps` + `bound_to_target_window` + `deload_anchor_rir` +
  `bodyweight_model`). Doc 04 §Testing explicitly requires golden fixtures; the
  interaction of the anchored behaviors is uncovered. Add a v16-shaped fixture
  with a simulated lifter whose logged sets feed `recencyWeightedE1rm` week to
  week.

### R22 — Env vars unvalidated at boot: misconfiguration = request-time 500s from inside @supabase/ssr · LOW
Non-null assertions in `supabase/server.ts:10-11`, `client.ts:6-7`,
`middleware.ts:26-27`; only the service key gets a real check. CI builds with
placeholders (`ci.yml:12-13`), so a missing/typo'd Vercel var passes build and
fails opaquely on every request. Small `src/lib/env.ts` zod schema imported by
the factories + a build-time assert for `NEXT_PUBLIC_*`.

### R23 — Repo hygiene batch · LOW
- **Two unused-but-live server actions** — `reorderGroupExercisesAction`
  (`cycles/actions.ts:398`) and `saveProfileDetails`
  (`more/profile/actions.ts:54`) are `"use server"` POST endpoints shipped to
  production with no caller. Delete first (attack/maintenance surface).
- Dead exports: `listMacrocycles` (`cycles.ts:75`), `setExerciseStatus`
  (`logging.ts:689`), `confidenceRank` (`comparability.ts:505`), engine barrel
  over-exports; six unused UI components (`Card`, `MenuCard`/`MenuItem`,
  `FeedbackScale`, `NumberStepper` — which carries a stale-closure hold-to-repeat
  bug (`NumberStepper.tsx:36-43`), `RirBadge`, `WeekTrack`).
- **`v_muscle_group_volume` is dead code** with a fixed UTC-Monday week boundary
  and no fractional counting — retire the view (append-only migration) before
  someone reads it as truth.
- Dep nits: `@next/bundle-analyzer@^16` vs `next@^15`; `tsx` documented but not a
  devDep; `vitest.config.ts` includes nonexistent `tests/unit/**`; no
  dependabot/renovate. Consider `knip`/`ts-prune` in CI to hold the line.

---

## Verified-clean areas (for the record)

- **Engine purity** (no I/O/clock/randomness), `macro.ts`, `load.ts`,
  `rules/bodyweight.ts`, `rounding.ts`, `volume.ts`, `classification.ts`,
  `summary.ts` — consistent with spec, well covered; suite 588 green.
- **Zod discipline** at server-action + MCP-arg boundaries (the gaps are only the
  R12 items); **service-role call sites** all scope by server-derived userId.
- **MCP auth**: alg pinning, role guard, issuer check, escalation-proof admin
  gating, no tool takes user_id, delete tools refuse logged history; OAuth
  consent flow (CSRF, safeRedirect) solid; middleware public paths; rate limiter.
- **Design-system compliance**: palette token-pure, square corners, no hype copy;
  destructive flows confirmed; shared-view rule holds (only drift =
  the dead `v_muscle_group_volume`, → R23).
- **CI `checks` job content, eslint, tsconfig strict, security headers** all
  solid — the gap is R2 (rls-tests job + required checks), not the content.
- **Units**: lb-only discipline clean end to end.
