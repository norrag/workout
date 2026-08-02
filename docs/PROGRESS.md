# Build progress

Running log of implementation state against [07-implementation-plan.md](07-implementation-plan.md). Update this file in any PR that moves a phase forward.

## 2026-08-02 (latest) — doc 21 Phase 4: the set lever bites + the rep-position knob (N70)

The second and third levers on a day-slot. Phase 3 made an assignment writable
over MCP; Phase 4 makes the working-set cap actually change a prescription, and
adds the one knob §4.2 kept when it retracted the forced-centering rule.

**The cap is applied ONCE, at the boundary of both prescription routes.**
`engine/index.ts::cappedSets` wraps `prescribe()` and `seedMeso()` rather than
editing each branch's `sets` expression — deload, cold start, seed anchor, rep
window and bodyweight all land on a set count already, and a cap is a statement
about the *result*. That is both the smallest change and the only shape a branch
added later cannot forget. It sits deliberately **outside** the doc-16
progression wrapper: sets play no part in the earn gate or the realized-ask
comparison, so a capped week's progression trace is identical to an uncapped
one's.

**A ceiling, never a floor — and absolute (A2).** `min(sets, cap)`, applied
*after* `clampSets(…, params)`, so an authored cap of 1 wins over
`params.min_sets`: a rehab slot at one set is exactly what the lever is for.
Raising sets stays the plan's job (`set_baseline_sets`), because a lever that
could do both would silently overwrite the volume autoregulation every week it
was set.

**`rep_position` stays a knob, not a rule.** §4.2's correction is untouched:
repricing at a different RIR needs no special case. Unset ⇒ the Option-A climb
schedule decides, byte for byte. Set ⇒ `repsAtPosition` replaces the schedule's
rep choice at the three sites that make one (the working rep-window path and the
two anchor-seed paths), and the existing pricing machinery does the rest — so
"reprice at the top of the window" is a deeper cut *at the same RIR*. Named
positions resolve against the target band; an explicit rep count is clamped to
the window's hard bounds, so a coach can ask for 15s but cannot escape the goal's
window.

**Flat per slot, on purpose.** One `rep_position text` column
(`20260802000004`), not a third week-indexed array: the position is how the
exercise is priced, not an intensity that ramps. The new MCP op
`set_exercise_rep_position` **refuses** `weeks`/`schedule` rather than ignoring
them, so a caller who wanted a per-week position is told the column cannot
express it.

**Freshness is mechanical, one key per lever.** `exerciseSetCap` and
`exerciseRepPosition` join `exerciseRir` in `buildConfigInputs`, each omitted
when its own lever is unassigned — a slot carrying neither hashes exactly as it
did before doc 21 existed. Phase 2's non-obvious recompute guard (a spread cannot
delete a key) now runs per lever, so clearing one assignment can never leave
another replaying off a stale copy.

**One honesty fix on the read side.** `get_current_state` described a slot
carrying only a set cap as "running at an assigned RIR" — quoting the week's own
value as though it had been authored. The RIR sentence now covers only
RIR-assigned slots; caps and positions get their own clause.

*Deliberately not here:* the prescription-strip copy for either lever. The trace
and rationale carry both (and `explain_prescription` surfaces them), but the
deterministic *why* line and the doc-19 facts payload are Phase 6's subject,
along with the rest of the explanation layering and its design pass.

## 2026-08-02 — N73: the set-logging queue's echo rule

Two regressions the N68 queue introduced, reported by the owner. (1) A logged set
fills and advances to the next one, then **reverses for about a second** — set 1
unlogged and active again — before snapping forward once more; *"more often than
not"*. (2) On the last set of an exercise, the set flickered back to unlogged and
a **modified RIR was repeatedly discarded**, reset to the prescribed value.

**Both are one root cause, and it is structural.** The queue retired an op's
optimistic overlay when the server action **resolved**, and only then called
`router.refresh()`. That leaves a window one revalidation round-trip wide with
the overlay already gone and the server render not yet committed — and in that
window the row falls back to server state that does not contain the set. The box
un-ticks, the active set walks backwards, then both snap forward when the render
lands. Nothing about it was mysterious or intermittent underneath: whether a
racing refresh committed inside or outside that window is what varied.

The discarded RIR is the *same window with an edit in it*. The row went editable
mid-flight (it was no longer "pending"), so the lifter could type in it — and the
arriving render then either remounted the row (its key carries `logged.id`) or
resynced it through `adoptServerRowState("own-logged-set", …)`, which adopted
server values unconditionally **and** cleared the row's dirty flag. So the edit
was neither kept nor re-sent: it took several attempts to land because it needed
a gap where no render arrived between typing and blurring.

### The rule: retire on the echo, never on the ack

A landed write now moves to a new **`acked`** status and **keeps its overlay
until a rendered server row contains it**. `reconcile` — fed the day view's rows
from an effect on every render — is the only thing that drops it, and it returns
the same state object when nothing retires, so running it per render is free.
The handoff is atomic because `pendingSetsFor` already suppresses an overlay for
any set number the server render carries: overlay and render swap in one commit
instead of overlapping.

The two op kinds are **deliberately asymmetric**, and that asymmetry is the fix
for the second symptom:

- a **log** is echoed by its set number *existing*;
- an **amend** only by the row carrying the *amended values*. A row still showing
  the old ones is a stale render — fetched before the amend landed — so the op,
  and the local values it protects, must survive it.

Supporting changes:

- **`adoptServerRowState` gains a `writeOutstanding` veto** (R13/N13's rule,
  amended). While a row's own write is outstanding, what is on screen wins over
  any arriving render. The queue is the authority on that, via `hasPendingAmend`.
- **One coalesced, debounced `router.refresh()` per burst** rather than one per
  op. Four sets logged in a row used to queue four full RSC fetches of the day
  view that could commit out of order.
- The provider's `apply` stopped assigning a ref inside a `setState` updater (a
  render-phase side effect React may re-run); the ref is now the synchronously
  updated source of truth the processor already assumed it was.

**An echo watchdog backstops the rule.** An acked op waits on a *render*, not on
the queue, so the processor can never free it. If the refresh meant to fetch that
render never lands — the connection dropped in the moment between the write
landing and the refetch — the row would sit correct-but-uneditable indefinitely,
which is the same shape of wedge the queue exists to prevent. So while anything
is acked the runtime keeps re-asking (every 5s, and on each
`online`/`visibilitychange` wake). It never fires on a healthy round-trip and
stops the moment the last acked op retires.

**The safety valve is kind-aware.** An acked *amend* expires after 30s — dropping
it just lets the row adopt server truth, where it was headed anyway. An acked
*log* **never** expires on a timer: dropping it would retract a statement that is
true and un-tick a box the lifter watched fill, which is precisely the regression
this rule exists to kill. It needs no timer either — it is invisible the moment
any render carries the set number, and `reconcile`, `clearWorkout` (on
completion) and `decodeQueue` (on reload) all collect it.

**Latency is unchanged where it matters:** the tap still advances the row in the
same frame, so perceived latency stays zero. What the ~250 ms debounce bounds is
how long a just-logged row stays uneditable — well inside the owner's ≤1s target.

Recorded in `02 §A5`. Tests: the ping-pong and the discarded-RIR sequences are
both pinned as golden cases in `src/lib/logging/__tests__/queue.test.ts`.

## 2026-08-02 — doc 21 Phase 3: the MCP write surface for exercise-level RIR

[doc 21](21-exercise-level-rir.md) §8 (MCP), on the resolution Phase 2 built.
Phases 2/2b honored an assignment end to end but **nothing could write one** —
this is the surface that makes the lever usable, and per A4 it is the primary
one (the UI stays Phase 6).

### The two ops

`edit_mesocycle` gains `set_exercise_rir` and `set_exercise_sets` — no new tool,
so both inherit its ownership check, planned/active gate, zod validation and
`mcp_write_audit` row. Four value forms per lever, per §8:

| form | writes |
|---|---|
| `rir: 4` | `target_rir = 4` — the whole meso, deload week included |
| `rir: 4, weeks: [3, 4]` | `rir_schedule = [null, null, 4, 4]` |
| `schedule: [null, 5, 4, null]` | that array verbatim |
| `clear: true` | both columns back to null (and the reason with them, if nothing else is assigned) |

`reason` (A7) is orthogonal to all four. `set_exercise_sets` is the same shape
for the working-set cap — deliberately named apart from `set_baseline_sets`,
which seeds week 1 and then hands over to set progression.

### Two pure layers, so nothing half-applies

`queries/slot-effort.ts::planSlotEffortEdit` takes one intent + the slot's
current assignment + the meso's shape and returns the exact column patch or a
sentence; every DB bound is mirrored there, so a caller gets a refusal rather
than a constraint violation. `tools/edit.ts::planEffortEdits` composes a batch
against the week defaults and the already-trained weeks. Both run **before any
write**, so a call mixing structure and assignments cannot land half of it.

### The bug this phase had to fix first

`save_meso_plan` is a wholesale replace — it deletes the meso's days and
re-inserts every slot from a **structure-only** payload. So a plain reorder, in
the app or over MCP, would have wiped every assignment in the meso. `saveMesoPlan`
now snapshots the assignments and re-keys them onto the re-minted rows by
day-slot × exercise (`restoreSlotEffortAssignments`) — the identity
`slotEffortKey` already resolves against, so a surviving slot keeps its
assignment and a removed one loses it. No migration; the RPC payload stays
structure-only. It is also why effort writes in a mixed call run *after* the
structural save, addressing the new ids through that key.

### Guards (§4.1 "no silent semantics")

- **Refusal is week-precise, not day-precise.** The structural day lock is the
  wrong shape here: assigning week 4 is fine on a day whose week-1 session is in
  the books. An op that *names* a week already completed / in progress / skipped
  is refused; a *flat* value is allowed and returns a warning naming the weeks it
  can no longer change.
- **Warnings, not refusals, for intent.** An assignment below the week's ramp is
  reported as "week N runs HARDER than programmed"; a flat value is reported as
  also governing the deload week, with the deload's own default beside it. Week
  defaults come from the **live** ramp (`rirRamp` on the active params), so a
  planned meso with no microcycles yet discloses the same numbers an active one
  does.

### Read-side disclosure — present-only

`get_mesocycle` adds an `effort` block on the slot that carries one;
`get_current_state` adds `effort_assignments` for the live week (resolved value,
the week's own RIR beside it, reason, `backed_off`) plus a sentence in its
summary, so an authored effort level is never narrated as an engine decision.
Both are **omitted entirely** when nothing is assigned — an unassigned plan reads
exactly as it did before the lever existed. `getCurrentState` takes the
disclosure as an opt-in, because the workout page calls it up to three times per
render and has no use for it.

`set_exercise_sets` **ships inert and says so**: the cap is stored, resolved and
disclosed, but no engine path clamps a set count to it until Phase 4, so the
tool description and every assigning write carry a warning pointing at
`set_baseline_sets` for the sets the athlete actually sees.

Tests: 41 new (the value forms, every refusal, reason lifecycle, composition,
the trained-week guard both ways, the deload/hardening warnings, the re-key
across a plan replace, the inert-cap disclosure, and the two read surfaces).
Suite green (1610), typecheck and lint clean. No migration in this phase.

## 2026-08-02 — doc 21 Phase 2 + 2b: exercise-level RIR (plan + engine, and the measuring band)

[doc 21](21-exercise-level-rir.md) §3–§7 (Phase 2) and §6.1 (Phase 2b), built
together because §10 requires it: "§4.3's unbounded ceiling must not reach
production without" the band. Phase 1 (below) fixed the premise underneath both.

### What it does

Assign a target RIR **per exercise, per week**, inside a program. The coach or
the athlete says "this slot runs at RIR 4 for weeks 3 and 4"; the engine
reprices the load to meet that effort; the ramp reasserts itself the moment the
assignment is removed. It replaces the parked coach-override paradigm as the one
mechanism for temporary per-exercise effort management — fatigue management,
rehab, and ordinary programming intent all become the same lever.

### Data model (§3)

`meso_exercises` gains `target_rir`, `rir_schedule`, `set_cap`,
`set_cap_schedule`, `effort_reason`. Grain is day-slot × exercise (A3), modelled
directly on `mesocycles.rir_schedule` (N18-B) including its orphan-clearing rule,
now extended to the per-slot schedules in `updateMesocycleAttrs`. NULL schedule
**elements** are meaningful — `[null, null, 4, 4]` is the headline "weeks 3 and 4
only" case — so the element bound is expressed as containment of the
null-stripped array (CHECK constraints cannot hold subqueries).

`microcycles.target_rir` and `workout_exercises.target_rir` widen **0–8 → 0–30**
(§4.3). What is bounded is not the *ask* but the *measurement* — that is Phase 2b.

RLS is untouched: `meso_exercises_all_own` scopes through `mesocycles.user_id`
for ALL commands with the same WITH CHECK, so new columns are covered by
construction. Proven in `tests/rls` (owner writes them; a non-owner can neither
see nor change them).

### Resolution (§4.1) — absolute

`queries/slot-effort.ts`, pure: `slotRir = rir_schedule[week] ?? target_rir`,
`resolvedRir = slotRir ?? weekRir`. Set wins, unset yields — in **both**
directions, deload weeks included (an assignment below the deload RIR hardens
that week, which is legitimate; the week's own default always travels beside the
resolved value so no surface has to state it silently).

Order is load-bearing: it runs **after** `liveWeekRirUpdates` in the reconcile,
which re-derives an unstarted week's RIR from the ramp. Resolving first would let
the reconcile stomp the assignment on the next read.

### Repricing (§4.2) — one substitution, no new branch

`pricedAtSlotRir` swaps the resolved RIR onto the inputs the pricing path reads,
once, at the entry point. Everything downstream — `weightForRepsAtRir` →
rounding → `boundRepsToWindow` → `predictRepsAtWeight`, plus the deload,
cold-start, bodyweight and seed branches — generalizes untouched. The engine
prices the load *from* reps and RIR, so "265 lb for 1 rep" cannot occur by
construction, and the rule is symmetric: a *lowered* assignment prices up with no
rep-schedule reset (the rejected centered-reps rule would have fired there).

Golden-tested against the owner's §4.2 table at the 342.6 anchor — 223.4 /
218.7 / 214.1 / 209.8 / 205.6 across the 8–12 window at RIR 8, reproduced to the
decimal, with the held 9-rep position landing 219 against the owner's ~215
estimate.

The un-substituted inputs are what the earn gate sees, which is what lets it tell
an eased slot from the week it sits in.

### Engine coupling (§5)

A new `exercise_rir` gate predicate refuses an earn while an assignment **eases**
the slot — without it a rehab week can still mint a step off an anchor held by an
older `moderate` session. A **hardened** slot still earns; that work is measured
like any other. Miss-throttle parity falls out of the placement rather than being
coded twice: the throttle only pairs a `stepped` ask with the next decision's
compliance verdict, and a backed-off week never records `stepped` — exactly how a
deload week already behaves. The predicate sits *after* `sessionCompliance` on
purpose: compliance judges the session already performed, so a genuine miss must
still be named a miss no matter what the upcoming week asks.

### Freshness (§7) — mechanical, and byte-identical when unused

The resolved value enters `buildConfigInputs`, so it is in the config projection,
the fingerprint sees it, and the scope falls out of the hash — an assignment edit
stales exactly that slot's open rows. The assignments join `mesoStaleSignature`
so an assignment-only edit busts the cheap reconcile gate.

Both are **omitted, not null**, when unassigned. `canonicalize` drops undefined,
so every existing fingerprint, recorded decision, and stale signature is
byte-identical and **nothing recomputes on deploy**. One non-obvious consequence
had to be handled explicitly: a spread cannot delete a key, so a replayed advance
whose assignment was *cleared* would carry the stale one forever — the recompute
drops it when the live config omits it. That is what makes "the ramp reasserts
itself the moment the assignment is removed" true.

### Phase 2b — the measuring band (§6.1)

A1 made the prescribed RIR a *measurement* input (`assumedRir = rir_reported ??
target_rir` feeds the stamp and the anchor), so an unbounded ask silently asserts
a strength measurement nobody observed: under Epley each RIR step is worth ~3.3 %
of e1RM, so at RIR 21 the estimate is ~70 % assumption, and the confidence ladder
bottoms out at `low` — a set at RIR 4 and a set at RIR 21 make the same honesty
claim.

`e1rm.max_measuring_rir` (**v26**, 8 per §9.3) draws a hard boundary *below* the
ladder — it answers "is this a measurement at all", not "how precise is it". Past
it a set is priced and performed normally but is not measured: `logged_sets.e1rm`
null, `e1rm_confidence` `'none'` (a new label), dropped from the anchor, excluded
from every strength surface — and **kept** in volume/adherence, because the work
happened (§9.1, confirmed). The exclusion is by construction rather than a filter
each view must remember: the strength views aggregate `logged_sets.e1rm`, and
max/avg ignore nulls.

Gated on the **assumed-RIR component**, not on effective reps: a logged 15-rep
set at RIR 1 is 15 reps of observation, while a 9-rep set at RIR 21 is 9 observed
and 21 asserted. Gating on effective reps would punish honest high-rep work.

The consequence is intended: during a deep back-off the anchor **freezes** at its
last measured value instead of drifting on fiction (both directions are pinned by
tests). A backed-off set *inside* the band still anchors — it is RIR-adjusted and
therefore comparable, and excluding it would make the return prescription jump
straight back to full load.

**One surface needed fixing to make this real.** `v_exercise_prs` was the only
strength view that re-computed e1RM in SQL off `coalesce(rir_reported, 0)`
instead of reading the stamp, so *both* doc-21 rules passed it by — including
§2's shared resolution, i.e. the N71 defect Phase 1 closed everywhere else. It
now reads `logged_sets.e1rm`, keeping the in-view expression only as a fallback
for never-stamped rows (there are none — both backfill migrations covered them),
and excludes `'none'` outright.

### What is live, and what is not

The plan columns and the resolution ship **active**: an assignment written today
is honored end to end (seed, advance, day-view projection, reconcile). There is
**no write surface yet** — that is Phase 3 (MCP `set_exercise_rir` /
`set_exercise_sets`) and Phase 6 (UI + explanation), so in practice the lever is
inert until one of those lands.

`max_measuring_rir` ships **inactive** as **v26**, built on the **active v25**.
Worth recording, because it nearly went wrong: the hosted params chain runs ahead
of `supabase/migrations` — v22, v24 and v25 were admin-MCP micro-bumps with no
committed migration (the v23 file already records that pattern for v22), and
v24/v25 carry `rate_source: "plan"` plus the doc 17 §7 envelope loop. A band row
built on the v23 file would have collided with the real v24 *and* silently
reverted the rate source and the envelope loop when activated. The migration is
now generated from v25's stored materialization and its hash is pinned in
`params-provenance.test.ts`.

8 is the pre-doc-21 `target_rir` ceiling, so no set that can exist today becomes
non-measuring and the activation replay diff is expected empty. Activation is the
usual doc-14 v-bump, recorded in
[deployment/manual-operations.md](deployment/manual-operations.md).

### Applied to production 2026-08-02

All three migrations are live, and **the doc 21 §2 / N71 re-levelling restamp
has now run**: 9 087 e1RM stamps and 5 891 confidence labels moved, average
**+4.80 lb (+4.85 %)**, max +42.5, min 0 — strictly upward, exactly as doc 10
§9.1 predicted. Rollback snapshot in `ops.e1rm_restamp_backup_20260802`. v26 is
present and INACTIVE; the band is not armed yet.

Three things the deploy surfaced, all fixed here:

1. **`restamp_e1rm` had never worked at scale.** It pages 1 000 sets, then
   resolves their slots with one `.in("id", …)`. PostgREST puts that in the
   query string — ~1 000 UUIDs is a ~37 KB URL — so the request 414s and the
   restamp dies. Phase 1 shipped it untested against real volume. The lookup is
   now chunked (200/request, pinned by a test) and the admin tools stringify
   errors through a real `errorMessage` helper instead of `String(e)`, which had
   reported the PostgrestError as the useless `"[object Object]"`. The
   production restamp was therefore run as SQL — verified byte-for-byte against
   `stampE1rm` over all 2 618 distinct `(weight, reps, assumedRir)` combos in
   prod, 0 mismatches.
2. **A repo migration had never been recorded.**
   `20260721000001_restamp_logged_set_e1rm_v11_catchup` was applied to prod as
   raw SQL on 2026-07-21 and never entered the ledger. Harmless as data, but a
   live trap: a later `db push` would have run it *after* the Phase-1 restamp
   and reverted the §2 resolution on every row. Now recorded.
3. **`coaching_prompts.body` disagreed between repo and prod** (12 000 vs
   24 000 chars) — another hosted-only migration that was never committed. A
   fresh environment would have rejected prompts prod accepts. Reconstructed as
   `20260725000002_coaching_prompts_length.sql`, idempotent.

The through-line: **hosted state and `supabase/migrations` had drifted in both
directions**, and every one of these was a silent divergence waiting to bite a
fresh environment or a future push. Worth a standing check at session start.

Full suite green (1569, +77), typecheck + lint clean.

## 2026-08-02 — doc 21 Phase 1: one RIR premise (N71 + N38)

[doc 21](21-exercise-level-rir.md) §2, Phase 1 of six. The feature it unblocks
(exercise-level RIR) is Phase 2; this phase fixes the premise underneath it.

### The defect

The app had **two different RIR assumptions**, and only one of them was right.

| Path | Assumed RIR | Consumers |
|---|---|---|
| Strength anchor (`queries/anchors.ts`) | the set's prescribed `workout_exercises.target_rir` | prescription pricing, day-view predictor, earn gate |
| Stored per-set stamp (`log/actions.ts::computeSetE1rm`) | `logged_sets.rir_reported` — **never written** ⇒ `effectiveReps = reps + 0` | `v_exercise_history.e1rm`/`.best_set_e1rm`, `v_exercise_overview.best_e1rm`, `v_meso_summary.best_e1rm`, `v_exercise_prs`, strength trend, MCP history |

So **every stats surface treated every set as taken to failure** while the
engine's own anchor did not. That is the general form of the 384-vs-367.5
divergence the owner hit in July (2026-07-04 review §8.2).

### The rule

`engine/predict.ts::assumedRir(reported, prescribed)` — `rir_reported ??
target_rir`, one definition, re-exported through the engine barrel and used at
the stamp site (log **and** amend), in the anchor, in
`setComplianceMarker` (which the day-view ▲/■/▼ markers and the earn gate both
read), in the restamp planner, and in exercise history. N71 closes by
construction: the two paths can no longer disagree.

Two guards ride with it, both pinned by tests. **Absence never resolves to 0** —
that is the N11 regression, where an exactly-as-prescribed set read as a big
miss, worst on deloads. And `rir_reported` stays capped **0–10**: past that the
honest report is "no idea", i.e. null.

### Capture (doc 21 §9.2 option (a), N38's other half)

The set grid gains a third value column — `LB · REPS · RIR · LOG` — using the
same input primitive as the other two, **pre-filled with the prescribed target
RIR**. That pre-fill is deliberately a *no-op*: an untouched cell reports
exactly what the server's fallback would have resolved to, so the new column
costs nothing on the hot path and only a *changed* value carries information the
app didn't already have. The two rules are pure and live in `day-rules.ts`
(`captureRirDefault`, `reportedRirFromInput`). No mockup figure exists, so the
hard-rule-8 transcription is recorded in
[09-design-changelog.md](09-design-changelog.md) (2026-08-02), same precedent as
the P19/N35 marker glyphs.

The write queue's `log` op carries `rir_reported`; an op enqueued by the previous
build still decodes and drains (dispatching null) rather than poisoning the
stored queue.

### The backfill, and what it moves

`queries/e1rm-restamp.ts` now resolves each row through `assumedRir`, joining
the page's slots for the fallback. It runs from a new admin-gated MCP tool,
**`restamp_e1rm`** — `activate_engine_params` only restamps when an `e1rm`
*param value* moves, and here the **resolution** changed while every param held.
Idempotent; a second pass writes nothing.

**Every historical e1RM moves up, once** (a set prescribed at RIR 2 gains 2
effective reps, ≈ +6.7 % under Epley at `rir_offset: 1.0`), taking PRs,
`best_e1rm`, key lifts and the strength trend with it. It is a correction, not
progress — the numbers had been under-reporting. Written up in **doc 10 §9.1**;
the doc-11 premise carries an amendment banner.

**The tool has not been run against production** — that is a deliberate
one-command operator step (`restamp_e1rm { confirm: "restamp" }`), so the
re-levelling lands when the owner chooses rather than as a silent side effect of
a deploy. Until it runs, new sets stamp under the new rule and old ones keep
their old stamps.

### Honesty on the surfaces (doc 21 §6.2)

An assumed RIR is a *plan fact*, not an observation, so it is never displayed as
one. Exercise history reports `avg_rir` (assumed), `rir_source`
(`reported` / `assumed` / `mixed`) and `effective_reps` — on the flip line as
`· ~2 RIR · 10 EFF REPS`, with the leading `~` marking the assumed case — and
the MCP history payload says the same in its note.

The `rir` glossary copy changes **meaning**, not just wording: the target is what
to aim for, not what to report.

### Deferred, deliberately

The measuring band (§6.1, `max_measuring_rir`) is Phase 2b. It only becomes
load-bearing once §4.3's unbounded prescription RIR exists, and nothing that can
be logged today (`target_rir ≤ 8`, `rir_reported ≤ 10`) would reach it.

Full suite green (1492, +26), typecheck + lint clean. No migration: every column
this phase writes already existed.

## 2026-07-31 — N67/N68/N69: increment indexing, the set-logging queue, thumb-only sliders

Three field notes, built together. One touches the engine's rounding, one
reverses a hard rule, one is a five-line gesture fix.

### N67 — the increment now indexes off the last weight the lifter entered

A per-exercise increment set `params.rounding[equipment]`
(`resolveEffectiveParams`, doc 14 §6.1) and `roundToStep` snapped every prescribed
load to an **absolute** multiple of it. So a lifter who actually loads a machine
in 88s, with a 10 lb step, got 90 — a weight they cannot put on the machine —
rather than 98. The lattice now has a **phase**:

- `roundToStep(weight, equipment, params, origin)` snaps to `origin ± k × step`.
  No origin ⇒ the absolute grid, byte-identical to before.
- `latticeOrigin(inputs, params)` resolves the origin from inputs the engine
  already had, in order of "closest to something the lifter actually typed": the
  last logged working set → the seed route's earn context (doc 16 §3.7) →
  `previous.weight` → `weekPeak.weight` → the plan's `initial.weight`. Warmups
  and zero-load rows are ignored; a genuinely cold slot has no origin and keeps
  the absolute grid.
- Threaded through every rounding path — `prescribeCore`, the anchor and
  cold-start seeds, `boundRepsToWindow`'s ±one-step nudge, `prescribeDeload`,
  and the bodyweight model's entered-value rounding — so one lift's stops are the
  same set of numbers wherever they are computed.

**Gating, and why there is no params version bump.** A new **optional**
`rounding_origin: "absolute" | "last_entered"` on `engineParamsSchema`, which
`resolveEffectiveParams` sets to `"last_entered"` for an exercise carrying an
increment override. Optional-with-no-default is load-bearing: stored
`engine_params` rows that predate it still parse to a *complete* materialization,
so `is_replayable` and `params_hash` are untouched and an old decision replays on
the absolute lattice exactly as it was computed. Because the origin rides
already-denylisted derived inputs (doc 14 §3), the change adds **no freshness
dependency** — no fingerprint churn, no mass recompute. Scoped to overridden
exercises deliberately: on the 5 lb equipment defaults an entered load is almost
always already on the grid, and phasing every lift's lattice would be a silent
global change. A global switch remains available by activating a version that
sets the key itself.

Two existing tests changed their expected numbers, which is the clearest evidence
the behavior moved: a manual 315 seed with a 25 lb step is now **315** (the
lifter's own number) instead of 325, and a cold start at 184 with a 3 lb custom
step holds **184** instead of snapping to 183 — still distinct from the stock
185, which is what those tests were proving. New coverage in
`engine/__tests__/rounding-origin.test.ts` pins the owner's case directly
(88 → 98 up, 78 down). The `golden-meso` suite is unchanged, confirming
non-overridden rows are untouched.

### N68 — set logging goes through a durable background queue

The reported symptom: *"the set gets logged and the checkbox fills, but the
active set does not move forward… forcing the user to quit and restart the app."*

**The cause is structural, not flakiness.** The checkbox acknowledged on the
server action's response (N12), but `nextSetNumber` was derived from **server
rows alone**. So when the RSC revalidation stalled — a flaky connection, the app
backgrounded mid-flight — the row stayed checked while the next row stayed
`future`: logged, un-advanceable, and only recoverable by relaunching. The write
had landed; the UI had no way to learn it.

The fix takes the write off the interaction path entirely, exactly as the owner
proposed. Surviving a dropped connection is the by-product.

- **`src/lib/logging/queue.ts` — the pure model** (no I/O, no clock; every
  function takes `now`). FIFO with head-of-line blocking so sets land in the
  order they were performed; per-cell coalescing so retyping a weight before the
  write drains produces one write, not two racing ones; capped exponential
  backoff; and **park, never drop** — an op that spends its 8 attempts becomes
  `failed` and is surfaced, because losing a set the lifter watched get checked
  off is the one outcome worse than a slow write.
- **`src/components/logging/SetLogQueueProvider.tsx` — the runtime.**
  `localStorage` persistence (validated on read), one serial processor,
  `router.refresh()` on each settle, and flushes on `online` + `visibilitychange`
  (a backgrounded tab's timers are throttled). Mounted in the `(app)` layout, so
  the queue keeps draining as the lifter navigates and resumes after a relaunch.
- **The day view folds the overlay into its set-state derivation** — the one
  place that decides which row is active. That single change is what removes the
  stuck state. `day-rules.ts` grows an optional `pending_set_numbers` so the
  progress bar, `exerciseDone`, and the feedback prompt all read one definition;
  it is absent for every caller reading server state alone.
- **Only idempotent ops are queued**, because retry is blind: `logSet` upserts on
  `(workout_exercise_id, set_number)` (R3), `amendSet` addresses one immutable set
  id, the planned-weight write is an overwrite. **Unlog and delete stay
  foreground** — a delete renumbers the surviving sets, which would land a queued
  write on the wrong slot, so a queued row's delete menu reads "Still saving…".
- **Completion still gates on server truth.** Completing locks the session in the
  DB and would refuse its own outstanding writes, so `COMPLETE WORKOUT` waits for
  confirmed rows; a fully-logged day mid-drain shows `SAVING THE LAST SETS…`. The
  queue is cleared for a workout once it completes.
- **The status strip is quiet by default** — it speaks only when sets are held
  with no connection or an op has parked (with a TRY AGAIN).
- **Deliberately zod-free.** The module rides the `(app)` layout's client chunk,
  and WS-J keeps zod and the engine barrel out of the day view's bundle; the
  storage boundary uses hand-written guards, and the server actions still
  re-validate with zod on arrival. With zod the day view's first load went
  134 → 150 kB; with hand-rolled guards it is 137 kB.

**This reverses hard rule 9 for the write path** ("no offline sync"), recorded in
`CLAUDE.md`, `01 §F3`, `02 §A5` (rewritten) and `07`. **Reads stay online-only** —
R7's decision not to runtime-cache documents or RSC payloads is still right (a
stale prescription with nothing marking it stale is worse than no page). The
honest limit: this makes the *write* path connection-tolerant, not the app. A
cold start with no connection still cannot render the day view; logging through a
dropout works when the session is already open. Filed as **T-N68a** for an owner
call.

### N69 — sliders drag from the orange thumb only

`SnapSlider` put `onPointerDown`/`onPointerMove` and `touch-none` on the whole
44px track, so on the scrolling feedback sheets (fig 1.4) a scroll attempt both
set the value and swallowed the gesture. Pointer capture now lives on a
transparent 44px wrapper around the 20×28 accent block (the visual is unchanged);
the track ignores pointers entirely and scrolls the page. Keyboard control on the
`role="slider"` container is unchanged.

## 2026-07-25 — N64/N65: one exercise order across both surfaces + share codes that capture what was shared

Two field-reported defects in editing and sharing a mesocycle. No engine change,
no prescribed number moved; one additive migration.

- **N64 — the day view and the cycles view could disagree on exercise order.**
  The order lives in two places (`workout_exercises.position` for the session,
  `meso_exercises.position` for the plan) and each edit path wrote only one of
  them: `regenerateOpenWorkouts` merged a plan edit *structurally* (surviving
  rows kept their old position, new ones appended), so a planner-board or MCP
  `reorder_day` never reached an already-generated week; and the day view's
  move-up/down wrote the session only, so the cycles view — and every copy or
  share, which read the plan — never saw it. New leaf module
  `src/lib/queries/plan-order.ts` is now the single definition and syncs both
  directions (see doc 03 → `workout_exercises` → "One exercise order, two
  surfaces"). A day-view replace/add carries into the plan **only** with
  *"repeat this change on this day in future weeks"* ticked — the same intent
  that already propagates it to later weeks; a session-only edit stays
  session-only, and a completed meso's plan is never rewritten.
- **N64 (second half) — copying a meso flattened its order.** `planMesoCopy`
  renumbered fills group-by-group, so duplicating a meso whose day interleaves
  muscle groups reset it to group-clustered order. Fills now carry a
  `day_position` taken from the source's flat order (falling back to group order
  when the source stored none).
- **N65 — a share code now snapshots the mesocycle.** Redemption read the
  owner's **live** planner board, so what the grantee received was whatever the
  owner's meso happened to hold when the code was typed — and, combined with
  N64, day-view-originated edits were never in the plan to be read at all.
  Migration `20260725000001_share_snapshot` adds `shares.payload jsonb`;
  `createShareCode` builds it server-side from the owner's own rows (re-minting
  an open code refreshes it, so "edit, then share again" hands over the current
  state), and redemption copies from it — with the live read kept as the
  fallback for pre-snapshot codes. The copy also carries `rir_schedule`, which
  it had been silently dropping. **R1 unchanged:** the mesocycle row and every
  referenced exercise are still resolved live and ownership-asserted, so a
  snapshot can never widen what a copy may touch.
- **Tests:** +43 (1434 total) — `plan-order.test.ts` (both sync directions, the
  logged-history and ceiling guards, the completed-meso no-op) and the N65 block
  in `sharing.test.ts` (snapshot capture/refresh, redeem-what-was-shared,
  legacy fallback, R1 still refusing a re-pointed share), on a new shared
  table-backed `fake-client.ts`. Lint + typecheck clean.
- **Deploy note:** `20260725000001` **applied + verified on the live project**
  `juqvbiymmdcggctdqoiq` via MCP (2026-07-25) — additive column, no RLS change,
  `get_advisors` shows nothing new. Codes minted before it landed simply used
  the live-read path in the meantime; no backfill needed.

## 2026-07-24 — N63: deterministic explanation copy system + the three-layer prescription strip (doc 19 §13)

Owner-directed copy + presentation rework of the prescription quick-read: the
deterministic explanation now speaks in the same voice as the coaching layer,
and the strip's three layers (ask / why / coach) read as one ledger. The ask
line is unchanged (owner: "the prescription statement itself is ok"). No engine
change, no migration, no number moved.

- **Copy system (doc 19 §13.1):** seven rules at the head of
  `src/lib/prescription-narrative.ts` — program-as-actor (never "engine"),
  second person only for what the lifter did/reported, cause-then-consequence in
  one sentence, the lifter's own rating vocabulary, one parallel construction
  for every held-weight cause, plain "no conclusion warranted" on thin data, no
  hype. Every composed line rewritten; a test block sweeps **every line the
  module can emit** for banned vocabulary, praise/hype, and sentence shape.
- **Accuracy fixes the pass exposed (§13.2):** `paced` is four governors (doc 16
  §3.5) narrated as one — each now gets its own sentence and its own facts
  `load_reason` (`already_stepped_this_week`, `recent_increases_not_holding`,
  `increases_paused_at_peak_week`, `held_this_session`); and the ramp clarifier
  ("the same numbers, asked harder") is gated to weeks where the numbers really
  do match.
- **Program-intent line (§13.3):** one closing frame sentence on peak / first /
  last weeks, from the same templates the facts payload uses, rendered only when
  the week has room (the §4.4 three-line cap holds).
- **Effort honesty live (§13.4):** `PrescriptionAudit.effortObserved` (pure,
  client-safe `readEffortObserved` over the decision's `inputs.actualSets`) now
  supplies §4.3's gate, which had always fallen through to "inferred".
- **The strip (§13.5, doc 09 2026-07-24):** ask visually primary, why lines with
  air between causes, and the doc-19 §3 **COACH line rendered** under a hairline
  + tracked-caps label — closing the strip half of doc 19 §11 phase 4 (MCP
  `facts` + note-write regeneration remain). **Rule-8 deviation (recorded):**
  still no mockup figure for this strip (pre-existing from N57); the treatment
  is built from the day view's existing light-ledger primitives.

## 2026-07-24 — N61: editable LLM coaching prompt via MCP (doc 18 §11)

The doc-19 coaching **system prompt** becomes editable, versioned admin config —
a wording change is now an MCP call, not a code PR + deploy. Mirrors the
`engine_params` propose/activate loop. Doc 18 §11 documents it (infrastructure);
doc 19 keeps authority over the prompt's content architecture.

- **Storage:** migration `20260724000001_coaching_prompts` — append-only
  versions, single active row (partial-unique index), **admin-only** RLS SELECT
  + writes (tighter than `engine_params` — no client render path needs it),
  atomic `activate_coaching_prompt` RPC. Ships **empty**; the code constant
  `COACHING_SYSTEM_PROMPT` (version 3) stays the permanent fallback. +RLS tests.
  **Not yet applied to hosted prod** — owner-gated, like N58/N60.
- **Resolution + fallback:** `resolveCoachingPrompt` (`explanations.ts`) reads
  the active DB prompt once per burst (byte-stable ⇒ prompt-cache friendly) and
  falls back to the constant on empty table / read error, reporting the error.
  The editor can never take the pipeline down. Both the write-site path and the
  `test_llm_explanation` probe stamp `prompt_version` from the resolved prompt.
- **Query layer:** `src/lib/queries/coaching-prompts.ts` — active/list/get/
  propose/activate/deletion-impact/discard; `nextCoachingPromptVersion` floors
  the counter at `COACHING_PROMPT_VERSION + 1` (= 4) so every DB prompt clears
  the serving cut. Unit-tested.
- **Serving cut:** named const `COACHING_SERVED_MIN_PROMPT_VERSION` replaces the
  literal `3` in `read.ts` + `audit.ts`.
- **Tools (admin-gated, `admin-prompt.ts`):** `get_coaching_prompt` (browse +
  effective active, `include_body` to copy for editing), `propose_coaching_prompt`,
  `activate_coaching_prompt` (confirm-echo; no auto-regenerate), `discard_coaching_prompt`
  (guards active + explanation-referenced). `get_llm_explanation_status` reports
  the effective prompt source (db | code_fallback) + version. Added to the PH33
  visibility roster.
- **Guardrail unchanged:** `postCheckCoaching` runs on every generation
  regardless of prompt text; the deterministic ask + why always render.
- Typecheck + lint clean; full unit suite green (1364).

## 2026-07-23 — prescription explanation v3, phase 3 (doc 19)

Phase 3 — prompt v3 + structured output + the storage delta — shipped as a
separate PR on top of phases 1–2. The LLM re-enters the pipeline, now fenced by
the phase-2 facts + triggers. **Ships in shadow:** generation is gated by
`LLM_EXPLANATIONS`; serving still needs mode=on AND the phase-4 strip flip, so
nothing new renders. The owner voice-reads a regenerated batch via the admin
overwrite loop (`generate_explanations overwrite:true`) before phase 4.

- **Storage (§6.3):** migration `20260723000001_decision_explanations_triggers`
  adds `triggers text[]` (nullable, additive — v1–v2 rows stay valid; the 480
  DB check stays the backstop). **Applied + verified on hosted prod via MCP
  2026-07-23** (column present, ARRAY, nullable). RLS unchanged (per-row, not
  per-column); a round-trip test pins the posture. DB types + `Defaulted` list
  updated.
- **Generation contract (§6.2) — new pure `src/lib/llm/coaching.ts`:** prompt
  v3 (`COACHING_PROMPT_VERSION = 3`, analyst voice, the review's tone
  prohibitions verbatim, the effort-status honesty rule, few-shots rebuilt on
  FACTS payloads incl. an abstention example + the low-confidence "no
  conclusion yet" example); structured JSON output
  `{coaching_context, note_class, abstain}` parsed leniently; extended
  post-check against the facts payload (abstention = success/no row; ≤360;
  every numeral in the facts number set; note-only + non-actionable class ⇒
  discard).
- **Generation path (§7.1):** `generateOne` projects facts + scores triggers,
  **skips the API call entirely when no trigger fires** (the silent majority),
  feeds the facts payload + v3 prompt, parses, post-checks, stores body +
  triggers + `prompt_version 3`. Outcomes gain a `disposition`
  (stored/skipped/abstained/discarded/error); the stored tally counts real
  rows. `probeDecisionExplanation` runs the same v3 path and returns facts +
  triggers + note_class + abstain. Admin tools surface the disposition
  breakdown + the v3 prompt_version. The v2 payload/prompt/post-check in
  `prescription-explainer.ts` are retained as the doc-18 record (with their
  tests) but no longer on the generation path.
- Tests: new `coaching.test.ts`, reworked `explanations.test.ts` to the
  trigger-gated path, RLS triggers round-trip. Full suite green (**1353**),
  typecheck + lint clean.

**Remaining (owner-gated, per doc 19 §11):**
- Phase 4 — flip the strip's coach line on (with its docs/09-logged design
  treatment), the MCP `facts` field on `explain_prescription`, note-write
  regeneration hooks (§7.2); measure a month. **Owner voice-reads a v3 batch
  first** (admin `generate_explanations overwrite:true` in shadow, or
  `test_llm_explanation` on single decisions).
- Phase 5 — the §8 deferred surfaces and §10 spun-off items (T-N60a–f).

## 2026-07-23 — prescription explanation v3, phases 1–2 (doc 19)

Implements the first two of doc 19's five phases — the pure, no-model-risk half
that improves the product on its own. The LLM re-enters only at phase 3, so
nothing here changes a live model surface.

**Phase 1 — seam inversion + Layer-2 hardening (§3, §4).**
- The seam inverts: the deterministic ask + why now ALWAYS render, and a stored
  LLM line is *appended* beneath them (`appendCoaching`) as an additive coach
  line rather than substituted for the composed body. `substituteExplanation`
  is retired. The ask/out-of-band guards carry over: an out-of-band (N33 S4)
  row drops the coach line and keeps its hand-adjusted caveat; an unpriced row
  never carries coaching. `PrescriptionNarrative` gains a `coach` field.
- Serving cut (§3): stored rows are served only at `prompt_version >= 3`, in
  both the day-view audit query (`getPrescriptionAudit`) and MCP
  `explain_prescription`. Nothing serves today (no v3 rows exist) — the safe
  deterministic-only floor — and v1–v2 whole-blob rows age out as decisions
  recompute.
- Layer-2 copy hardening in `prescription-narrative.ts`: §4.1 difficulty
  framing (the paced line reads as a load step *held back*, never "no
  increase"); §4.2 vocabulary pass (program-language throughout; the word
  "engine" now appears only in the Engine audit sheet); §4.3 effort honesty (a
  new `effortStatus` input gates the grade line's effort claim — inferred
  effort is never stated as observed, the safe default); §4.4 suppression tests
  pin the why at ≤3 lines under any trace stack.
- **Rule-8 note:** the strip's `COACH`-line *visual treatment* is deferred to
  phase 4 (it needs a docs/09 design decision, and nothing serves until then).
  The `coach` field is plumbed through the narrative type; the strip does not
  yet render it.

**Phase 2 — facts + triggers, pure (§5, §6.1).**
- `src/lib/llm/explanation-facts.ts` — `(decision, context) → ExplanationFacts`,
  the model's entire v3 worldview, replacing the raw-trace payload. One verdict
  per axis (`pace_status`, `trend_status`, `effort_status`,
  `prescription_change`, `primary_reason`, a single approved `load_reason`, a
  template `program_context`); never a raw trace string, governor name, or a
  pair of rates (v2 failure mode 2 becomes unrepresentable). The §5.1 gates are
  code: a paced step reads ahead-of-pace; a plateau needs ≥4 comparable
  non-deload sessions at moderate+ e1RM confidence AND a flat measured gain, so
  the Bench Press low-confidence case projects `insufficient_data`, not
  `plateau`. The note is the ONE fenced free-text field.
- `src/lib/llm/coaching-triggers.ts` — pure `(facts, signals) → Trigger[]`; an
  empty array ⇒ no API call, no row. Routine mid-block progression with no
  note/pain/modulation produces zero triggers (coaching is a minority of
  decisions). Gates mirror the §6.1 table.
- Wiring (§7.3): `toFactsInputs` adapts the assembled context into the facts +
  trigger inputs (comparability-heavy fields conservative until phase 3/4 wires
  the real assembly — the dry-run never over-claims). `test_llm_explanation`
  returns facts + triggers alongside the v2 payload; `generate_explanations`
  gains `dry_run=true`, reporting the would-trigger rate across a scope with
  zero API calls — the calibration view before the gate flips on.
- Golden tests: `explanation-facts.test.ts` (Hack Squat worked example, Bench
  Press insufficient_data), `coaching-triggers.test.ts` (routine ⇒ no trigger),
  plus the rewritten `prescription-narrative.test.ts`. Full suite green
  (1340), typecheck + lint clean.

**Remaining (owner-gated, per doc 19 §11):**
- Phase 3 — prompt v3 + structured JSON output + the `triggers text[]` storage
  migration + extended post-check + few-shots on facts payloads; generation
  becomes trigger-gated; `EXPLANATION_PROMPT_VERSION` → 3. Owner voice-reads a
  regenerated batch (admin overwrite loop) before phase 4.
- Phase 4 — flip the strip's coach line on (with its docs/09-logged design
  treatment), the MCP `facts` field on `explain_prescription`, note-write
  regeneration hooks (§7.2); measure a month.
- Phase 5 — the §8 deferred surfaces and §10 spun-off items (filed to the notes
  backlog in this PR).

## 2026-07-21 — joint-pain exercise attribution (fig 1.4 revision)

Owner: joint pain was collected once a muscle group closed but stored on the
group-*closing* exercise, so the engine's pain gate (doc 10 §3 step 0) and the
MCP feedback rollup attributed it to whichever exercise happened to be last —
not the one that hurt (e.g. AC-joint pain on bench press mis-attributed to the
incline press that followed it).

- **Feedback card (fig 1.4):** when the group has more than one performed
  exercise and real pain (> None) is reported, a new optional "Which exercise
  caused it?" multi-select lists the group's performed exercises. Select any
  number; an empty selection defaults to attributing the pain to all of them.
  Hidden entirely for None / soreness-only prompts so the card stays clean.
- **Storage:** no schema change — `exercise_feedback.joint_pain` is already
  per-exercise and the engine/rollup already read it per-exercise. The pain
  level now lands on each attributed exercise's row (and clears on the
  deselected ones); pump / workload / soreness stay group-scoped on the closer.
  New `setExerciseJointPain` query touches only `joint_pain` so a sibling's
  soreness/notes survive; `saveFeedbackAction` writes the closer plus the
  attributed siblings.
- **Pure attribution helper:** `src/app/(app)/log/feedback-attribution.ts`
  (`resolveJointPainAttribution`) resolves the write plan; 7 unit tests cover
  single-exercise groups, default-all, pin-away-from-closer, None-clears, and
  the soreness-only path.
- **Rule-8 deviation (recorded):** the "which exercise caused it?" control has
  no mockup figure — it reuses the pain-button / days-sore light-ledger grammar
  (accent = selection, square corners, tracked sublabel). Recorded in the
  09-changelog 2026-07-21 entry.

## 2026-07-21 — N59: catch-up restamp of stored per-set e1RM to the v11+ model

Owner (Batch 21): stored `logged_sets.e1rm` was never restamped after v11
introduced `brzycki_max_eff_reps: 10`. Root cause = the T-N33 restamp hook
(PR #147) only fires when an activation's `e1rm` block differs from the
**previous active** version's, not from the stored stamp; the block changed
exactly once (v10→v11) but v11 shipped inactive before the hook existed, and
every activation since (v11→v25) left the block byte-identical — so it never
re-fired and pre-v11 averaged-formula stamps persisted, inflating e1RM on
sets with effective reps > 10.

- **Migration `20260721000001`** — idempotent one-time catch-up: recompute every
  `logged_sets.e1rm` under the active v11+ model (Epley-only above 10 effective
  reps), computed in **double precision** to match the JS engine's float64
  `Math.round` exactly (exact-decimal rounding diverges on ~10 half-way ties).
  Verified against the real TS `estimateE1rm` over all 1153 prod (weight,
  effReps) combos — 0 mismatches. Confidence bands untouched (unchanged by v11).
- **Applied to hosted prod via MCP (2026-07-21):** 4919 rows across 3 users,
  rollback snapshot in `ops.e1rm_restamp_backup_20260721`, idempotent (second
  pass 0 diffs). Effect: 131/220 user-exercise best-e1RM values corrected
  downward (avg −15.9 lb), concentrated on high-rep/bodyweight lifts; the
  canonical Deadlift 384.2 → 367.5. Restamp policy left as-is — it now catches
  every future `e1rm`-block change since the stamps are caught up. (N59)

## 2026-07-19 — N57/N58: prescription presentation split — quick-read strip + Engine audit; LLM explanation spec'd (doc 18)

Owner (Batch 20): the prescription details panel reads as a debugging panel;
split the presentation into a user-friendly quick-read (deployable now,
deterministic) and a retained, better-organized audit panel — and spec the
LLM-generated explanation as a later drop-in.

- **Quick-read (N57):** pure composer `src/lib/prescription-narrative.ts` —
  an ask line composed from the row alone ("3 sets of 9 at 250 lb, each
  stopped 2 reps short of failure."), then the delta vs last session in
  reps-to-failure language (the RIR ramp explains itself), and a
  **multi-factor why** (owner Batch-20 addendum): feedback-modulation causes
  (pain-capped load, hot-workload set removal, rough-session dampening, set
  adds/vetoes) rendered alongside the doc-16 §3.6 progression state
  (`stepped`/`paced`/`vanished`/`not_earned` + predicate — the paced hold is
  finally visible on the day view, closing N56 §8.5), the earn-gate echo of
  a feedback cause deduplicated, capped at three why-lines, plus the N33-S4
  hand-adjusted caveat and a legacy grade fallback for pre-v20 decisions.
  26 unit tests; the N56 W2·D4 case is the canonical fixture. Revealed per
  exercise by a target-glyph button next to the note button, as a
  notes-style strip (fetch-on-open via `getPrescriptionAuditAction`, ask
  renders instantly); the Engine audit is reached via the ⋮ menu only
  (Batch-20 addendum — the in-strip link was removed).
- **Engine audit (N57):** `PrescriptionDetailSheet` retitled and regrouped
  into a ledger — PRESCRIPTION (tuple + rationale + out-of-band tripwire),
  DECISION (kind/computed-under/verified-as-of + re-verified note),
  EST. STRENGTH (e1RM), TRACE with structural doc-16 §3.6 status labels
  (`PROGRESSION · PACED (RATE_PACER)`). The ⋮-menu raw-rationale row became
  `Engine audit ›`. Plumbing: `readTrace` preserves
  status/governor/predicate; `PrescriptionAudit` gains `previous` (from
  decision inputs) for the delta line. **Rule-8 deviation:** no mockup figure
  exists for the strip or the audit sheet — light-ledger styling, notes-strip
  pattern mirrored; recorded in the 09-changelog 2026-07-19 entry.
- **LLM explanation (N58):** spec'd, not built — `docs/18` (GPT-5.6 Luna,
  payload/output token budgets, decision-id-keyed storage + free
  invalidation, MCP reuse + delivery, ≈$0.001/generation ⇒ ≈$0.25/month at
  measured volume). The strip's `lines` array is the drop-in seam; the
  deterministic composer is the permanent fallback. Batch-20 addendum: §1
  binds the what+why/multi-factor requirement to both versions; §10 adds the
  v2 coaching layer (user notes + progression-history trends, hard targets
  first + brief focus direction, scientific-coach register, ≤480 chars —
  after the v1 MVP proves out).

## 2026-07-19 — N56: deadlift prescription mismatch — code-side investigation + MCP freshness parity

Owner report (Batch 19): the next deadlift session's prescription "does not
match what is shown on screen" (day view W2·D4: 250×8×3 @ 2 RIR). Full
code-side investigation in
`docs/reviews/2026-07-19-deadlift-w2d4-prescription-mismatch.md` — the session
had no live-data access, so the doc pins what the code guarantees (the day
view's numbers are freshness-reconciled on open; stable-params recompute
cannot drift; worked v21 pacer/quantum numbers make the screen self-consistent
as a paced/not-earned hold), ranks the candidate mechanisms, and lists the
`engine_decisions` queries that settle it from a connector-enabled session.

Shipped: **doc 14 §5 freshness parity for MCP** — `explain_prescription` (the
one public tool that reports a specific open prescription) now runs
`ensureFreshPrescriptions` for the caller's active meso before reading the
decision (`freshenActivePrescriptions` in `src/lib/mcp/tools/read.ts`;
degrade-loudly, no-op behind the reconcile gate), so a coaching chat can never
quote a number the app contradicts on next open. +3 tests
(`explain-prescription-freshness.test.ts`): reconcile-before-read with the
resolved active params, skipped with no active meso, hiccup degrades to the
stored numbers without failing the call.

**Resolved same session** (owner enabled the connector; review doc §8): the
stored W2·D4 prescription was 250×9@2 (hold; earned step `paced`), and the
screen's 250×8 came from the day view's unlogged rep cells rendering the LIVE
reps prediction off the measured anchor (a `paced` row carries no recorded
`A*`), which the other day-slot's Jul-15 session had moved 341.7→333.1 — an
**un-earnable displayed ask** (would grade `under` the ±1.5% band). Root-cause
fix shipped in the same PR: `prescriptionBasisE1rm` / `impliedPrescriptionE1rm`
(`day-rules.ts`, pure, +7 tests pinning the field numbers) — unlogged set rows
price their cells and weight-edit re-derivations off the **graded ask**
(recorded `A*` for stepped rows → the stored prescription's own implied e1RM
for holds → measured anchor only when the row has no prescription), and the
Prescription Detail sheet's PRESCRIBED IMPLIES line shares the same helper.
Display, ▲/met/▼ markers, and the earn gate now read one definition of the
ask (doc 16 §5.2 completed for non-stepped rows).

## 2026-07-12 — N53: launch splash regression — branded launch images + first-byte fast path

The HIGH Batch-17 report: "no longer ever seeing the loading splash — just long
black screens." Investigation (scoping.md N53): no code regression — the whole
chain is byte-unchanged since PR #119. The compound cause: (1) the startup PNGs
were **solid** brand background, and in dark appearance `#14110C` is
perceptually identical to the OS-default black they exist to replace, so even a
correctly-applied launch image reads as "black screen"; (2) the July-2 scope
crisis (PR #109) forced a delete+re-add, exactly where iOS re-resolves startup
images version-whimsically (cf. #90 shipping inert until a re-add); (3) the
pre-document window is the LONG one — middleware blocked every first byte on a
network `auth.getUser()` — while the visible `Splash` window is a single warm
auth RTT, a blink. Fixes attack all three:

- **Launch images ARE the splash now:** `gen-ios-splash.mjs` renders the
  `Splash` composition (Archivo-600 tracked logotype + resting activity dots,
  both themes) into all 26 PNGs via the app's own woff2 → glyph outlines →
  sharp (new devDeps: `sharp`, `wawoff2`, `opentype.js` — no font install
  needed). The pre-document window shows the branded splash from the icon tap,
  and the streamed `Splash` takes over seamlessly.
- **First byte no longer waits on auth:** middleware `getUser()` (network RTT
  before any HTML) → `getSession()` (cookie parse; on-demand refresh with
  cookie write-back when expired). Presence-only routing — every (app)
  layout/page still gates with verified `getUser()`, data stays RLS-scoped.
- **One verified auth RTT behind the splash, not two:** new `getRequestAuth`
  (React `cache()`) in `lib/supabase/server.ts`, adopted by `(app)/layout` +
  the Workout tab + the day-view deep link.
- **Silent-failure telemetry:** `LaunchScreenAudit` (root layout) reports a
  device whose CSS dims/dpr match no `IOS_LAUNCH_SCREENS` class — the exact
  mode where iOS silently falls back to black — once per class through the R20
  funnel (new `"launch"` boundary value).
- **Pixel-level guards:** `launch-screens.test.ts` (79 tests) pins
  file-per-class, exact pixel dimensions, brand-bg corners, and **ink pixels in
  the center band** — a solid/black launch image can never ship silently again.

Deploy note: startup images bind at Add-to-Home-Screen — the owner must remove
+ re-add the installed app once after this deploys (manual-operations.md).
Suite 1200 (+79), typecheck + lint + prod build clean. Notes: N53 → done.

## 2026-07-12 — N47: tab bar detach on iOS standalone — scroll-lock rework

The HIGH Batch-17 bug: after a BottomSheet + keyboard session the fixed tab bar
rendered mid-screen with dead taps until relaunch. Root cause per the scoping:
`useScrollLock` toggled `body{position:fixed; top:-Y}` on every overlay
open/close — the documented iOS-standalone trigger for `position:fixed`
elements binding to a stale viewport when interleaved with the soft keyboard's
visual-viewport resize.

- **`useScrollLock` rework:** the lock never touches body position now — body
  `overflow:hidden` (scroll offset preserved, so nothing ever needs
  re-anchoring) + `overscroll-behavior:none`, plus a document-level non-passive
  capture `touchmove` guard covering the touch scrolling older WebKit leaks
  through `overflow:hidden`. The guard's decision walk is a pure exported
  function (`touchMoveAllowed`, `scroll-lock.test.ts`): interactive controls
  and genuinely scrollable overlay regions keep native behavior, scrim/static
  chrome is prevented. N7's exact scroll restore stays as the unlock backstop
  (keyboard focus-reveal can still shift an overflow-hidden document
  programmatically). `isScrollLocked()` semantics unchanged (N32 pull-to-refresh
  guard still applies — `window.scrollY` now stays real while locked).
- **Overscroll containment:** `overscroll-contain` added to the overlay scroll
  regions that could chain to the document (CompleteSheet panel + the two
  fullHeight sheet lists in DayView/PlannerBoard), so guard-allowed inner
  scrolling can never reach the page.
- **Hardening:** `BottomNav` composited on its own layer (`transform-gpu`) so
  WebKit re-anchors it independently after visual-viewport churn.

Verified end-to-end headless (real app + local Supabase, CDP raw-touch drive,
24/24 checks incl. lock-at-depth with `scrollY` un-zeroed, inert scrim drags,
scrolling sheet lists, exact N7 restore, nav re-anchored + alive after the
overlay/keyboard-shaped session). The iOS visual-viewport half of the repro
isn't emulatable headless — owner device pass is the residual. Suite 1121
(+9), typecheck + lint clean. Notes: N47 → done.

## 2026-07-12 — N36: envelope loop goes self-gating on per-user data (doc 17 §7 amendment, PR #184)

Owner note (notes Batch 18): the loop should not wait on a remembered future
"enable" — it should default to the current portion of the band while a user
lacks history, kick in automatically when the data exists, and the
short-circuited position should be tunable. Built exactly that:

- **`progression.envelope.min_history_mesos`** (default 2): `deriveBandPosition`
  short-circuits to the tunable `progression.band_position` default until that
  many qualifying (≥ `min_decisions`) completed mesos sit in the lookback
  window; the gate re-engages symmetrically when history ages out (the same
  return-from-absence decay). Off → short-circuited → modulating is continuous —
  all three pace off the same knob. Block stays `.optional()`; every applied
  params row lacks it ⇒ byte-identical (suite 1112, +5 gate goldens).
- **Doc 17 §7 amended** (self-gating design; the field-data threshold fit is
  demoted from activation gate to a standing monitor/refit) and the
  `manual-operations.md` runbook rewritten as "Activate the envelope loop" —
  propose the defaults bump → replay diff → owner review/activate → monitor +
  refit. Prereqs all cleared (v20 active 2026-07-11; N43's corrected band
  active as v24 2026-07-12), so activation is runnable on demand.

## 2026-07-12 — N43: two-component strength-rate model (engine_params v23, inactive)

Doc 17 Phase 7. The strength-path analogue of the N21/v21 hypertrophy
correction: v21's personalized strength band still buckets by **calendar
training years**, so a long-training but undermuscled lifter (FFMI below the
untrained baseline) is priced at the *advanced* strength floor even as the same
profile's hypertrophy path projects near-novice muscle gain — internally
inconsistent by 2–3×. Built per
[`docs/reviews/2026-07-11-strength-rate-model-research.md`](reviews/2026-07-11-strength-rate-model-research.md)
§4 (evidence + modeling recommendation) and its companion pacing pressure-test.

- **Engine (`src/lib/engine/macro.ts`).** `strengthRateBand` now dispatches:
  when `macro_target.strength_model` is present + enabled **and** body
  composition is readable, the calendar bucket is replaced by the additive
  `strengthRate%/mo = neural(effectiveTrainingAge) + k × hypertrophyRate_FFM`
  (new pure helper `twoComponentStrengthRate`). The hypertrophic term reuses the
  N21 proximity rate re-expressed as %/mo of FFM (÷ fat-free fraction) × coupling
  `k ≈ 1.0`; the neural term is a decaying band `N0·e^(−effYears/τ) + floor`
  (front-loaded, small non-zero floor — Pearcey 2021); the §4 un-bank guardrail
  discounts effective training age when realized FFM is low. The sum takes the
  **same v21 strength sex factor + age taper** and is clamped to a ceiling. When
  no FFMI can be computed it degrades to the v21 bucket band — the strength-path
  mirror of the hypertrophy training-age-decay fallback. Because the dispatch is
  inside `strengthRateBand`, all three call sites (`strengthRatePctMonth`, the
  strength target, `recommendDuration`) get it.
- **Params (`src/lib/engine/params.ts`).** New `macro_target.strength_model`
  block (`enabled`, `neural_n0`, `neural_floor`, `neural_tau_years`,
  `ffm_coupling_k`, `undermuscled_unbank`, `rate_ceiling_pct_month`),
  `.optional()` — absent on every pre-v23 row ⇒ parse/hash byte-identical, v21
  behavior. DEFAULT (v10) unchanged.
- **Migration `20260712000001_engine_params_v23_strength_model.sql`.** v21 +
  `strength_model`, applied **inactive**; full materialization + canonical
  sha256 `ed12c6a0…` (guarded in `params-provenance.test.ts`). v22 was the
  hosted-only `rate_source:"plan"` micro-bump rolled back to v21 this session —
  no committed migration — so this lands as v23.
- **Goldens (`macro.test.ts`, +10).** The research §4 corners: Garron-shaped
  lifter (13 yr, FFMI ≈ 16.7) → **1.36–2.28 %/mo** (intermediate-class, above the
  advanced calendar bucket); a true novice at the same FFMI → **4.36–7.28**
  (beginner — the whole gap is the neural term); advanced FFMI-ceiling lifter →
  **0.14–0.50**; ceiling clamp; un-bank raises a mid-career undermuscled lifter;
  body-comp-missing ⇒ the bucket band byte-identical; `strength_model` absent ⇒
  the v21 band.
- **Docs.** doc 17 §2.7 (new) + §9 Phase-7 row + §10 cross-doc + backlog spine;
  doc 10 §5 strength paragraph + params list; manual-operations Phase-R
  activation entry (activate v23 → review → re-flip `rate_source` to `"plan"`).

Shipped **INACTIVE** (hard rule 3, doc 17 principle 7): the active row stays
v21, so runtime behavior is byte-identical; activation is Phase R (replay diff —
expected ≈ empty on stored prescriptions until `rate_source:"plan"` — then owner
review). Suite 1107 green, lint/typecheck clean. Unblocks N36 (the envelope fit
must run on the corrected band) and N52/N54 (DEXA-copy amendment + target-card
re-enable ride the v23 activation). Notes: N43 → `done (PR #182)`.

## 2026-07-12 — Batch-17 roundup: N44/N45/N48/N49/N50/N51/N54/N55 in one PR

The easy Batch-17 items swept together (the tough ones — N43 v23 band, N46
template editing, N47/N53 device-verification work — stay open). Design deltas
in the [09-changelog 2026-07-12 entry](09-design-changelog.md); notes rows
updated in the same PR.

- **N51 (HIGH bug, engine).** Both seed branches (`seedCore` §S1 anchor seed +
  prescribe's cold-start/swap-in) now route the rounded load through
  `boundRepsToWindow` — nearest-increment rounding landed heavy half the time
  and the hard `[6,15]` clamp let 6–7 reps through an 8–12 target window. The
  helper's signature narrowed to `(…, targetRir, equipmentType, …)` so seed
  contexts without full `EngineInputs` share the exact working-path bound.
  Gated on `bound_to_target_window` like the working path, so pre-v12 params
  rows replay byte-identically (pinned by test). New
  `engine/__tests__/seed-window.test.ts` (worked example: anchor 100 / machine
  step 5 / RIR 3 → old 75×7, new 70×10; sweep asserts in-window across
  anchors; gating pinned both routes). NOTE: code-only fix — stored seed
  prescriptions keep their pre-fix numbers until any fingerprint input changes
  (doc 14 has no engine-code dimension); forward-looking by design.
- **N50 (bug).** `SetRow.staticCells` now includes `readOnly` — completed/
  skipped sessions render logged rows as static text (logged values, marker
  preserved) instead of live inputs whose blur-save the completion-lock RLS
  silently no-ops. `save()` also hard-guards on `readOnly`.
- **N48+N49 (UX).** Day-view `ReplaceSheet`: EQUIP `FilterBar` axis + single-
  select + disabled-until-picked `REPLACE EXERCISE` confirm (was the only
  tap-to-commit picker). `AddExerciseSheet`'s pre-N29 hand-rolled chips folded
  onto `FilterBar` (GROUP + EQUIP axes).
- **N44+N45 (F).** Prescription detail sheet gains the `EST. STRENGTH (e1RM)`
  block: PRESCRIBED IMPLIES (via `estimateE1rm` off the sheet's own fields,
  effective load for bodyweight), TARGET ANCHOR A\* (`prescription_anchor`,
  stepped rows), MEASURED ANCHOR + coordinate. Provenance plumbing:
  `recencyWeightedE1rm` now returns `source` (winning set weight/reps/ageDays/
  sessionKey; the `mean` method reports its highest-value sample) →
  `E1rmAnchor.source` widened in the engine-inputs schema as `.nullish()` (no
  default — stored decision inputs parse byte-identically) → `anchors.ts`
  enriches `performedAt` → `LoggedExercise.e1rm_anchor_source` → sheet.
  `strengthAnchor` is already on the doc-14 §3 derived denylist, so the
  widened shape is fingerprint-neutral (pinned in `fingerprint.test.ts`);
  newly recorded decisions and `explain_prescription` carry the source for
  free. Engine tests: provenance per anchor method + recency-beats-value;
  golden-meso-live anchor shape updated.
- **N54 (owner-decided).** PR #178's target-card JSX reverse-applied (macro
  Overview REALISTIC TARGET; create-flow YOUR TARGET + MODEL BAND row — LAST
  BLOCK MEASURED stays) + the goals-edit YOUR TARGET card (pre-#178) hidden
  for consistency. Pure view change; re-enable rides N43/v23.
- **N55 (trivial).** Create-meso `WEEKS` label suffix now conditional on
  `ramp.deload`, mirroring `MesoHeader`.

Suite 1097 green (+9 over baseline: 5 seed-window, 3 anchor-provenance, 1
widened fingerprint invariance); lint/typecheck clean.

## 2026-07-11 — Macro goals Phase R2 + R3 executed: v21 + v22 active, target cards return (doc 17 §8)

The owner-gated activations on the doc-17 spine, run from a Claude session
with the owner directing. Full replay evidence in
[`manual-operations.md`](deployment/manual-operations.md) (the two struck
sections); the deltas:

- **R2 — v21 activated.** Replay asserted the runbook's expectation exactly:
  0/20 changed on v20-sourced decisions; candidate v21 and candidate v20
  produce identical diff sets over 100 mixed-version sources (the 14 diffs are
  the legacy v19→v20 earned-step delta). Target-layer review via the pure
  engine: the owner's live profile is byte-identical on every goal (age < 40,
  male, bf% present); the §2.1/§2.2 corrections land where designed
  (continuity proxy, age taper with the 0.7 strength floor).
- **R3 — v22 proposed (`propose_engine_params`, base v21 +
  `rate_source: "plan"`) and activated.** Replay byte-identical over all
  recorded decisions (the one recorded `rate_pacer` firing stays paced under
  the tighter band; granted steps had no trailing history to re-judge). The
  forward-looking change is real: the pacer's source band moves from the
  self-reported bucket (intermediate 1.5–3 %/mo) to the training-years
  personalized plan band (advanced 0.5–1.5 %/mo) — pacer target ≈ 1.69 →
  0.75 %/mo for the owner's hypertrophy macro.
- **Target cards restored** (the R2 code follow-up, PR #140's hide lifted):
  fig 2.2 `REALISTIC TARGET` card + fig 2.3 `YOUR TARGET`/rate/rationale,
  re-transcribed with two amendments recorded in the 09 entry — strength
  nouns become est-strength (doc 17 §2.5 / PR #157) and the create-card
  priming line gains its model-band half (the 09 2026-07-11 §3 deferred
  half), sourced from `MacroPlan.strengthRatePctMonth`.
- **Remaining on the spine:** the owner's one-time birthdate re-save
  (non-binding until 40) and the field-data-gated envelope fit (runbook
  section unchanged — ≥ 2–3 real completed mesos under the now-active
  progression engine before the thresholds can be fit).

## 2026-07-11 — Macro goals Phase 6: the envelope loop, mechanism shipped OFF (doc 17 §7, N36)

The last code phase of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md):
the demand-side loop that slides *where within the bounded macro rate band*
the pacer targets. Performance never modifies the envelope (principle 4) —
only the position within [0, 1]. Session context: **v20 is now ACTIVE on
hosted** (verified via MCP — Phase R1 done, the field-data clock started), so
the mechanism ships now and the threshold **fit** stays field-data-gated per
§7's own sequencing.

- **Residence as fixed by the architecture record §3.3:** `band_position`
  becomes a per-user DERIVED input — `EngineInputs.bandPosition`, a pure
  clockless fold over the trailing completed mesos' recorded
  `engine_decisions`. No new table, no write path, no RLS surface; the params
  `progression.band_position` stays the default/starting value and the fixed
  value while the loop is off. Doc-14 §3 treatment: fingerprint-denylisted
  (`DERIVED_INPUT_KEYS`), recorded in each decision's `inputs`, replayed
  frozen (position history reconstructible from the decisions that consumed
  it).
- **Update rule (`engine/rules/envelope.ts`, pure):** boundary steps at
  COMPLETED mesos only (the fold's value is constant for the meso being
  generated), each step bounded — `MAX_BOUNDARY_STEP 0.25` binds over any
  tuned `step` — with `dwell_mesos` hold and clamp [0, 1]; bounded lookback
  (count + `max_age_days`) doubles as the return-from-absence decay. Inputs
  are demand-side ONLY: earn rate, earned-then-missed ratio, miss-throttle
  trips, workload-gate firings, rate-pacer trips + `over`/beat share as the
  up-pressure signals (down wins over up). Never the measured rate.
- **Params (`progression.envelope`, `.optional()`):** ships in the schema with
  PROVISIONAL defaults (raise: earn_rate 0.7 / miss ≤ 0.2 / pacer_trips 2 /
  over_share 0.25; lower: miss ≥ 0.5 / throttle 2 / workload 3; step 0.1,
  lookback 3, dwell 1, min_decisions 8) — **no applied params row carries the
  block** (deliberately no migration: doc 17 §7 ships the bump only after the
  rule is fit), so everything live is byte-identical.
- **Assembly (`queries/envelope.ts`, leaf):** trailing decisions →
  completed-meso boundary outcomes (reusing the §8.3
  `aggregateProgressionEvents` fold per exercise; beat share recomputed
  through the ONE shared `setComplianceMarker` comparison) → fold. Wired at
  the same sites as `planStrengthRate`: meso activation (seed), week advance,
  the projection, recompute/replay (frozen from stored inputs, incl. the
  admin `replay_decisions` seed branch); swaps/backfills omit it exactly as
  they omit the plan rate. Pacer (`pacerTargetRate`) reads
  `inputs.bandPosition ?? params.band_position` — source-agnostic under
  `"band"` and `"plan"`.
- **Tests (+27, suite 1089):** loop-off byte-identity (absent block, disabled
  block, block-present-but-unassembled at both prescribe and seedMeso);
  bounded movement/dwell/clamp goldens incl. the worst-case floor/top pins;
  |Δ| ≤ 0.25 binding; fingerprint invariance (denylist) with write/check
  parity; per-meso aggregation + boundary selection (completed-only,
  trailing window); replay determinism (a recorded floor position replays
  frozen through `recomputeRow`); pacer composition under both rate sources
  and through the seed gate.
- **Runbook:** `manual-operations.md` gains "Fit + activate the envelope
  loop" (accumulate ≥ 2–3 real mesos → fit thresholds from
  `get_progression_history` → propose the micro-bump → replay diff → activate
  → monitor recorded positions); the v20 section now records the activation
  as verified.

With this, doc 17 Phases 1–6 are all built; what remains on the macro-goals
spine is owner-side (Phase R activations + the envelope fit) and the N34
first-connect residual.

## 2026-07-11 — Macro goals Phase 5c: BodySpec DEXA engine + MCP, and the profile body-fat rework (doc 17 §6, doc 15 §5 Phase 3, N34)

The last DEXA build PR, plus the owner's pinned profile note (2026-07-11):
after a scan updated the profile, the estimate bands still rendered with a
stale band lit; the band increments read as arbitrary; no between-band
entry existed.

- **Engine path — deliberately no engine change** (doc 15 §3.1): measured
  bf% rides the existing `bodyFatPct` profile input; the 5b consented apply
  already writes the profile, so `planMacrocycle` (with the v21 correction)
  consumes measured values through the one path. Pinned by a
  mapping-equality test (dexa-sourced ≡ same-value estimate). Passing
  measured FFM directly remains the noted later refinement.
- **Provenance** (migration `20260711000005`): `profiles.body_fat_source`
  (`'estimate'` | `'dexa'`; null legacy). The scan APPLY stamps `'dexa'`;
  the picker/custom entry stamps `'estimate'` (also the override path);
  clearing nulls it. Existing column-agnostic owner RLS covers it (the
  birthdate-migration shape). `get_profile` reports it.
- **Profile body-fat control rework** (fig 4.5; 09 2026-07-11 Phase-5c
  entry): bands normalized to even 5-point steps (`~10 … ~30, 35%+`) with
  exact-match highlighting, a `CUSTOM VALUE` chip → bottom-sheet numeric
  entry (2–70, renders `CUSTOM — 17.5%` when a non-band value holds), and a
  **measured state**: while provenance is `'dexa'` and a BodySpec
  connection exists, the picker gives way to `BODY FAT — MEASURED` (value +
  `SCAN <date>` from the newest applied scan, derived on read) with
  `OVERRIDE WITH AN ESTIMATE`; disconnecting reverts the control to the
  picker (`ProfileEditor` + `setBodyFatEstimateAction`).
- **RMR context** (doc 15 §3.4): `MEASURED RMR` section on cut/hypertrophy
  macro Overviews — the newest scan's Cunningham (FFM-based) estimate,
  stat-grade numeral + honesty footnote; display-only, prescriptions and
  targets never read it; Mifflin never presented as "measured".
- **MCP** — `get_body_composition` over `v_body_comp_history` (shared-view
  rule; same delta/comparability definition as every screen), LSC
  within-noise flags from the one constant set (`queries/body-comp.ts`),
  newest-scan RMR as labeled context, and the doc 15 §6 guardrails shipped
  as a `measurement_guardrails` data block. Doc 05 tool table updated.

Suite green (1062, +5), typecheck + lint clean. Docs: 09 Phase-5c entry,
doc 15 §5 row-3 build note, doc 05, backlog N34 row + log (session 69).
N34's build phases are complete; the §8.3 first-login outcome remains the
owner's step.

## 2026-07-11 — BodySpec connect flow: server-side OAuth round trip (doc 15 §8.5, N34 5a follow-up)

Field fix from the owner's first real connect. From the installed PWA, iOS
runs the BodySpec login in an in-app browser sheet with a separate cookie
jar; the 5a flow kept the PKCE verifier + state in cookies and needed the
Supabase session at the callback, so it could never complete there (the
owner hit Keycloak's "Cookie not found" at the final hop, after login +
consent had already succeeded).

- **Schema** (migration `20260711000004`, **applied + verified on the live
  project via MCP**): `oauth_transactions` — `state` PK / `user_id` /
  `provider` / `code_verifier` / `expires_at` (10-min TTL). Deny-all (RLS,
  no policies, client grants revoked) like the secrets table; RLS test
  block added. Doc 03 updated.
- **Connect** writes the transaction server-side (user id bound from the
  app-context session at flow start); **callback** consumes it single-use
  by `state` — no cookies required at all — then exchanges/verifies/persists
  through service-role call sites scoped to the transaction's user. The
  cookie constants are gone from `bodyspec/oauth.ts`.
- **Response adapts to context:** initiating user's session present →
  original redirect + flash; otherwise (the sheet) → a house-style
  return-to-app interstitial (09 2026-07-11 entry) sharing the same flash
  copy (`more/bodyspec/flash.ts`), never a sign-in bounce. Caught by
  actually driving the built app: the middleware's blanket
  signed-out→/sign-in redirect was intercepting the session-less callback
  before the handler ran — `/api/integrations/bodyspec` joins the
  middleware public paths (both routes manage their own auth; verified
  against the production build: bare callback → 400 interstitial,
  signed-out connect → `/sign-in?redirect=/more/bodyspec`).
- Earlier the same day, migrations `20260711000002`/`03`/`04` were applied
  to the live project via MCP (5a/5b had merged unapplied; the More tab
  errored on the missing tables) — advisors clean, deny-all posture verified.

Suite green (1057), typecheck + lint clean; RLS block rides the CI job.

## 2026-07-11 — Macro goals Phase 5b: BodySpec DEXA enrich + view (doc 17 §6, doc 15 §5 Phase 2, N34)

Sixth build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md)
(second of the three DEXA PRs): the LSC guardrail machinery lands and every
surface 5a deliberately deferred builds on it. Started with the hard-rule-8
pass: 09-changelog entry (2026-07-11, Phase-5b section) for the four
house-style surfaces — no mockup figure exists for any body-composition
surface.

- **Schema** (migration `20260711000003`): `v_body_comp_history` — the
  shared read surface (doc 15 §2.2): per-scan values + deltas vs the
  previous scan + `same_scanner_as_prev` (null on the first scan, **false
  when either model is unknown** — unverifiable ⇒ not comparable, doc 15
  §6.2 rule 2); `security_invoker`, one delta definition for every consumer
  (scan detail, macro page, retrospective, the 5c MCP tool). Plus
  `body_scans.profile_applied_at` / `profile_dismissed_at` — the proposal's
  per-scan resolution (import upserts never touch them, so a re-sync can't
  reset a decision). Doc 03 updated.
- **Consented profile-update proposal** (doc 15 §2.3 — "import is
  mechanical; profile mutation is consented"). `/more/bodyspec` renders a
  card for the **newest unresolved** scan carrying measured weight/bf%:
  APPLY writes `profiles.bodyweight`/`body_fat_pct` (bf% now measured, not
  a band estimate), stamps `bodyweight_updated_at`, and appends the
  scan-day point to `bodyweight_log` **`source: 'dexa'`** — the Phase-4
  series' third writer, exactly as its migration comment promised; KEEP
  CURRENT resolves permanently (never nags). The pure rule
  (`scanProfileProposal`) refuses resolved scans, scans staler than the
  profile's own freshness, and no-op proposals; the server action re-runs
  it so a stale card can't apply anything the rule wouldn't propose.
- **Scan detail — VS PREVIOUS SCAN** (the 5a deferral): lean/fat/weight/bf%
  deltas off the view, sub-LSC deltas stated as `WITHIN MEASUREMENT RANGE`
  (never presented as change), cross-scanner pairs flagged
  `DIFFERENT SCANNER — DELTAS NOT COMPARABLE` and muted.
- **Macro page — BODY COMPOSITION** (doc 15 §3.2): Overview-tab section
  only when ≥ 2 scans fall inside the macro window (±14-day tolerance) —
  per-scan ledger rows + a first→last CHANGE line via the same
  `scanCompForSpan` fold, plus the flat cadence footnote (quarterly-plus;
  lean changes under ~2 lb are noise).
- **Retrospective + MCP** (one fold, parity preserved):
  `macroRetrospective` gains a `composition` block (Δlean/Δfat with
  `withinNoise` flags — informational on every goal, never letter-graded;
  cross-scanner brackets make no claim), and the **mass verdict's DEXA
  fallback** — when the bodyweight series doesn't bracket the logged span
  but ≥ 2 same-machine scans do, measured scan weight grades the contract
  (`measured via DEXA` note); the series stays first when both bracket.
  `get_macrocycle_summary` returns the block snake_cased.
- **LSC constants** (doc 15 §6.1, in `queries/body-comp.ts`): lean/fat
  ~2 lb, bf% ±1 point, quarterly cadence 60 days — all consumers read
  these, none hard-codes a band. Percentile display already landed with 5a
  (scan-detail PERCENTILES section); 5b adds no new percentile surface.
- **Boundaries held:** no engine touch (5c), nothing stored that's
  derivable (the view + folds are derive-on-read; the only new state is
  the two consent stamps), scans still never feed prescriptions or the
  doc-14 fingerprint.
- **Tests** +19 unit (suite 1057 green: bracketing/tolerance goldens,
  cross-scanner + unknown-model flags, LSC within-noise, cadence note,
  DEXA mass fallback incl. the graded retrospective, proposal rule matrix,
  MCP composition parity), +2 RLS blocks (view deltas/flags verified
  against Postgres + cross-user deny; proposal stamps owner-only with the
  resolve guard never restamping), e2e extended (VS PREVIOUS SCAN renders
  in-range copy; the proposal card applies/dismisses and never re-renders).
  Unit/typecheck/lint/build + RLS (local stack) green locally; the
  pre-existing 5a e2e test was confirmed failing on unmodified main in
  this sandbox (Chromium build mismatch — it merged green in CI, which
  installs matching browsers; the new 5b e2e test passes even here).
- **Remaining / external:** the 5a runbook steps still pending owner action
  (register clients, hosted migrations — now `20260711000002` **and**
  `20260711000003` — first real login → §8.3 outcome). 5c (engine + MCP
  read tool) is the last DEXA PR on the doc 17 §6 plan.

## 2026-07-11 — Macro goals Phase 5a: BodySpec DEXA connect + import (doc 17 §6, doc 15 §5 Phase 1, N34)

Fifth build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md)
(first of the three DEXA PRs): a BodySpec account can be connected per-user
via OAuth, the full scan history imports as canonical imperial rows, and the
More tab gains the integration + scan-ledger screens. Started with the
hard-rule-8 pass: 09-changelog entry (2026-07-11, Phase-5a section) for the
three net-new house-style surfaces (More settings row, `/more/bodyspec`
integration screen, scan detail ledger) — no mockup figure exists for any.
Re-verified the live `openapi.json` (still v0.14.3, shapes unchanged since
the doc 15 assessment) before transcribing the zod schemas.

- **Schema** (migration `20260711000002`, RLS + tests in the same PR):
  `external_connections` (status/timestamps/display identity, owner-RLS,
  unique `(user_id, provider)`; delete = disconnect of record),
  `external_connection_secrets` (**deny-all**: RLS with no policies + client
  grants revoked — token material moves only through service-role call sites
  in `queries/external-connections.ts`, explicitly user-scoped, hard rule 4),
  `body_scans` (doc 15 §2.2 canonical columns + `regions`/`percentiles`/
  verbatim `raw` jsonb; unique `(user_id, provider, provider_result_id)` ⇒
  idempotent re-syncs; owner delete allowed — third-party health data, not
  logged training history). Doc 03 updated.
- **OAuth (PKCE, `offline_access`).** `lib/bodyspec/oauth.ts`: S256 PKCE
  against the Keycloak realm; short-lived httpOnly cookies carry
  verifier/state through `/api/integrations/bodyspec/connect` → `/callback`.
  The callback runs the **doc 15 §8.3 first-login verification**
  (`GET /users/me` with the fresh token) *before persisting anything* —
  rejection fails the connect with `api_denied` copy instead of
  half-connecting. Clients are self-registered per environment
  (`scripts/register-bodyspec-client.ts`, human-run — the one-shot
  `registration_access_token` must land in a secret store, not a session
  transcript); runbook section added to `manual-operations.md`
  (`BODYSPEC_CLIENT_ID` env var; screen shows `NOT AVAILABLE IN THIS
  ENVIRONMENT` until set). Token refresh rotates through the service-role
  path; a dead refresh grant marks the row `error` and the screen offers
  RECONNECT (cheap re-connect posture, doc 15 §1.1).
- **Import.** `lib/bodyspec/api.ts` (serial, identity-from-token fetchers;
  paginated full-history backfill) + `schemas.ts` (zod at the boundary,
  lenient on unmapped fields — early-access API) + `convert.ts` (kg→lb /
  cm→in at the import boundary ONLY; pure `mapScanToImport` fold →
  canonical row; RMR matched by formula name; results without a composition
  section skipped as non-DEXA). `lib/bodyspec/sync.ts`: pull-based sync
  (connect backfills inline; SYNC NOW re-pulls) — already-imported results
  are never re-fetched, outcome stamps `last_synced_at`/`last_sync_error`.
- **UI.** More settings row (`SET UP ›` / `CONNECTED` / `RECONNECT ›`);
  `/more/bodyspec` (connect CTA, CONNECTION ledger rows, SYNC NOW,
  disconnect via BottomSheet confirm with an opt-in "also delete imported
  scans" purge — tokens always destroyed, doc 15 §2.3); scan list renders
  whenever scans exist (they persist through a disconnect unless purged);
  `/more/bodyspec/[scanId]` scan ledger (measured-at-scan, composition,
  regions, VAT, BMD, percentiles stated flat, RMR pair). **No deltas,
  trends, or verdicts in 5a** — comparison ships with `v_body_comp_history`
  + LSC guardrails in 5b (doc 15 §6). New `formatMeasuredLb` keeps
  measurement precision (deliberately not the half-pound logging snap).
- **Boundaries held:** no engine touch (5c), no profile mutation (5b's
  consented proposal), scans never feed prescriptions or the doc-14
  fingerprint (doc 15 §2.4/§3.3).
- **Tests** +12 unit (suite 1039 green: conversion goldens off the provider's
  published examples, full-map golden, composition-only degradation, RMR
  matching, RFC 7636 S256 vector, authorization-URL shape, boundary-schema
  leniency), +5 RLS blocks (cross-user deny both tables, secrets deny-all
  even to the owner, disconnect cascade, provider vocabulary, scan upsert
  key + owner purge), new e2e (`bodyspec-integration.spec.ts`: More row →
  unconfigured state → seeded scan list + detail ledger). Unit/typecheck/
  lint/build green locally; RLS + e2e ride the CI local stack as usual.
- **Remaining / external:** the `manual-operations.md` → "BodySpec" steps —
  register clients (①–④), apply `20260711000002` to hosted (⑤), first
  real login resolves the §8.3 residual (⑥; outcome to be recorded in doc
  15 §8.3). 5b (enrich + view + retrospective verdict rows) and 5c
  (engine + MCP) are the next two PRs on the doc 17 §6 plan.

## 2026-07-11 — Macro goals Phase 4: bodyweight series + create-flow priming (doc 17 §5, N41)

Fourth build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md):
the measured bodyweight series lands, giving mass-denominated macro goals
their first honest grade and the create flow its measured-rate context.
Started with the hard-rule-8 pass: 09-changelog entry (2026-07-11, Phase-4
section) for the three net-new house-style surfaces (quick-entry row + sheet,
"as of" freshness labels, the fig-2.3 priming line) — no mockup figure exists
for any of them.

- **Schema.** `bodyweight_log` (migration `20260711000001`): `user_id`,
  `measured_on date`, `weight numeric > 0`, `source
  ('manual'|'profile'|'dexa')`, unique `(user_id, measured_on, source)`;
  owner-only RLS + RLS tests in the same PR (hard rule 1). Same migration
  appends `first_logged_at`/`last_logged_at` (first/last completed session)
  to `v_macro_summary` — the macro's logged span, shared by the retrospective
  and the priming line (one definition). Doc 03 updated.
- **Writers.** Every profile-bodyweight edit appends a `source:'profile'`
  point (profile editor field, day-view BW chip, onboarding — all explicit
  user actions, direct writes); the More-page quick entry appends
  `source:'manual'` points (backdatable; same-day re-entry replaces via
  upsert) and deliberately **never rewrites `profiles.bodyweight`** — the
  scalar stays the engine/profile input (doc 15 §3.3 boundary). Phase 5's
  DEXA sync will append `source:'dexa'`.
- **Readers.** `queries/bodyweight.ts`: pure `resolveDailyBodyweight` (one
  point per day, latest entry wins across sources) + `bodyDeltaForSpan`
  (points within ±14 days of EACH span endpoint, distinct days ⇒ measured
  Δbw). `getMacroOverview` feeds it into `macroRetrospective`'s Phase-3
  `bodyData` seam for mass-denominated contracts, so the completed Overview
  and `get_macrocycle_summary` flip from "not measured" to a graded Δbw off
  the same fold. "As of" freshness labels wherever profile bodyweight
  displays (More profile card, create-engine chip, profile editor — one
  vocabulary).
- **Create-flow priming (fig 2.3).** `getPriorBlockMeasuredRate`: the most
  recently trained completed macro's est-strength headline normalized to
  %/mo over its logged span (`measuredRatePctMonth`, ≥28-day floor), rendered
  as a display-only `LAST BLOCK MEASURED` ledger line on the PLAN card —
  never blended into the target (doc 17 principle 4); nothing feeds
  `planMacrocycle`. The "model band" half of the doc-17 copy joins at Phase
  R2 when the hidden target cards return (N21 ruling). Create-only; the edit
  engine is unchanged.
- **Tests** +12 unit (suite 1027 green: same-day resolution, tolerance
  windows incl. the 14/15-day edge, both-endpoints/distinct-days rules,
  not-measured → graded flip through the real fold, rate normalization +
  span floor), +4 RLS (cross-user deny, source vocabulary, unique key +
  query-layer upsert replace, owner-corrects-a-point), new e2e
  (`bodyweight-quick-entry.spec.ts`: manual entry → replace → profile-edit
  append → freshness labels) + a priming-negative assertion in the closeout
  e2e (completed-but-unlogged block ⇒ no line).

## 2026-07-11 — Macro goals Phase 3: macrocycle closeout + retrospective (doc 17 §4, N40)

Third build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md):
a macrocycle can now end — naturally when its last real block reaches a
terminal state, or by an explicit, irrevocable "End macrocycle" — and a
completed macro's Overview grades the block against the stored goal contract.
**No migration** — `completed` was already in the `macrocycles.status`
vocabulary (no code path ever wrote it); the retrospective is derive-on-read
(doc 17 principle 5). Started with the hard-rule-8 pass: 09-changelog entry
(2026-07-11) for the three net-new house-style surfaces (End-macrocycle menu
row + confirm sheet, retrospective card, `NOT BUILT` placeholder treatment) —
no mockup figure exists for any of them.

- **Close transitions (§4.1).** New leaf `queries/macro-close.ts`:
  `macroClosesNaturally` (every real block `completed`/`abandoned`; unbuilt
  `unplanned` placeholders don't count as open work; an all-placeholder macro
  never self-closes) + `maybeCompleteMacroAfterMeso`, cascaded from both
  meso-terminal sites — the final-week close in the week-advance path
  (`queries/progression.ts`) and `endMesocycle`. Explicit `endMacrocycle`
  (`queries/logging.ts`, beside `endWorkout`/`endMesocycle`): in position
  order, open blocks with logged work close through the `endMesocycle` path
  (open sets skipped, `completed`), never-started blocks and placeholders go
  `abandoned`, then the macro completes. Logged history is never touched
  (hard rule 5). Surface: MacroHeader ⋮ → "End macrocycle" (active macros
  only) → BottomSheet confirm → `endMacrocycleAction`.
- **Freeze (§4.1).** `goalsEditRefusal` (pure): a terminal macro refuses a
  goals edit (re-contract) while rename/notes edits stay allowed — surfaced
  as a form error by `editMacrocycleAction` and a tool error via
  `update_macrocycle_goals`. `attachMesoToMacro` and `manageMacroSlots` now
  refuse a terminal macro (the doc's "already blocked by position guards"
  didn't hold — guards added). The completed Overview drops `+ PLAN`
  (placeholders read `NOT BUILT`) and renders abandoned blocks honestly.
- **Retrospective (§4.2).** Pure `macroRetrospective` fold
  (`queries/macro-retrospective.ts`), assembled in `getMacroOverview` once
  `status = 'completed'` so the Overview page and `get_macrocycle_summary`
  read **one fold**: strength verdict = the est-strength rollup
  (`getMacroStrength`, PR #157) vs the **stored contract** (`target_*` —
  never the live recompute), verdict vocabulary fixed (`within band` /
  `above band` / `below band` / `insufficient data`; the latter on a null
  headline, < `strength.min_sessions` qualifying lifts, or a bandless
  contract); informational on mass-goal macros (factor-0.75/0 pacing —
  strength was never the promise); mass row renders **"not measured"** with
  the pointer copy until measured body data brackets the span (the
  `bodyData` parameter is the Phase-4/5 seam, loss-direction grading
  included) — never proxy-graded; demand aggregate = per-exercise
  `aggregateProgressionEvents` combined by `combineDemandSummaries`
  (earned/paced/held mix, pacer-vs-gate pressure, vanished share; the row is
  absent while the progression mode is inactive); adherence/volume tiles
  restated at close; block-outcome mix (`DONE · ABANDONED · NOT BUILT`).
  MCP: `formatMacroRetrospective` (a pure snake_case renaming of the fold,
  parity-tested) rides `get_macrocycle_summary` with a new top-level
  `status` field.
- **Tests** +24 (suite 1015 green): natural-close matrix (incl. the §4 mixed
  placeholder fixture), `planEndMacrocycle` matrix (logged → completed via
  the meso path, untouched → abandoned, terminal untouched, order
  preserved), freeze refusals, retrospective goldens (verdict per band
  position, boundary-inclusive; insufficient-data rules; mass "not measured"
  without body data + graded with the bracketing seam), demand-combiner
  sums, Overview/MCP parity. New e2e `macrocycle-closeout.spec.ts`: end-macro
  flow through the real UI → COMPLETE badge, retrospective renders
  (INSUFFICIENT DATA verdict, 3 ABANDONED blocks), planning affordances and
  the End row gone.

Remaining / external: none for this phase — Phase 4 (N41 bodyweight series)
slots its mass verdicts into the retrospective's `bodyData` seam; N34 5b
likewise. The doc 17 Phase R activations (v20/v21/v22) remain owner steps.

## 2026-07-10 — Macro goals Phase 2: `rate_source: "plan"` pacer branch (doc 17 §3, N37)

Second build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md):
the macro-rate pacer can now pace against the profile-personalized
`planMacrocycle` strength band instead of the bucket table. **No migration and
no behavior change** — every params row still ships `rate_source: "band"`; the
flip is a v22 micro-bump at doc 17 Phase R3 (runbook added to
`manual-operations.md`) after the owner reviews the replay diff.

- **Derived input.** `EngineInputs.planStrengthRate` (`{low, high} | null`,
  `.nullish()` with no default — pre-existing stored inputs parse
  byte-identically). Doc-14 treatment exactly like `progressionHistory`:
  **denylisted** from the freshness fingerprint (it derives from
  bodyweight/bf%/age — a routine bodyweight edit must not churn open rows),
  recorded in decision `inputs`, replayed **frozen** by the freshness
  recompute and the admin replay.
- **Assembly.** New leaf `queries/plan-rate.ts` —
  `derivePlanStrengthRate(profile, goal, params)` evaluates the pure
  `planMacrocycle` and reads the goal-independent `strengthRatePctMonth`
  (Phase 1's carrier); self-gates null while the progression mode is
  inactive; never throws (unresolvable plan ⇒ null ⇒ band). Wired at the
  same sites as `progressionHistory`: meso activation seed (`SeedCtx`),
  week-advance (`WeekContext`), the read-only projection, seed/advance
  recompute (frozen from stored inputs), admin `replay_decisions`.
  `profileToMacroProfile` moved into the leaf (macro → stats → generation
  would cycle); `macro.ts` re-exports it. Standalone mesos assemble under
  `engineGoal(null)` → hypertrophy — one code path.
- **Pacer branch.** `pacerTargetRate`: `rate_source === "plan"` with a
  non-null plan rate ⇒ `lerp(planStrengthRate, band_position) ×
  goal_rate_factor[goal]`; otherwise the bucket band. Degradation is always
  toward `"band"`, never unpaced; position + factor compose identically
  under either source (Phase 6 stays source-agnostic). `seedMeso` gains the
  matching opt so the seed-route earn shares the same pacer.
- **Tests** +16 (suite 991 green): plan-vs-band pacer arithmetic +
  band_position composition + goal denomination (a hypertrophy macro paces
  on the strength band × 0.75, never lb/mo); null/absent plan rate ⇒
  byte-identical band fallback; plan rate inert under `"band"` and with the
  block absent; fingerprint invariance + write/check parity (advance + seed);
  recompute + admin replay reproduce the recorded rate frozen (and a
  `rate_source` flip diffs honestly); assembly self-gate, standalone path,
  goal independence, never-throws.

Remaining / external: the flip itself — doc 17 Phase R3 (propose v22 with
`rate_source: "plan"` → replay diff → activate), after R1 (v20) and R2 (v21).

## 2026-07-10 — Macro goals Phase 1: v21 target correction + contract snapshot + birthdate (doc 17 §2, N21)

First build slice of [doc 17 — macrocycle goal layer](17-macrocycle-goals.md):
the target-engine correction the 2026-07-09 audit priming scoped, shipped as
engine_params **v21 INACTIVE** (`20260710000002`) — activation is doc 17
Phase R2 (`manual-operations.md`). With the three new gated params absent
(every pre-v21 row) `planMacrocycle` is byte-identical on its pre-existing
fields; the golden fixtures pin it.

- **§2.1 strength-path personalization.** The strength branch gains the
  modifier chain the hypertrophy path already had, with strength-specific
  params: `strength_sex_factor` (default `{male 1, female 1}` — relative 1RM
  gains ~sex-equal; deliberately NOT the hypertrophy 0.7 lean-mass factor)
  × the existing age taper with a strength floor `age_taper_floor_strength`
  (0.7 > hypertrophy 0.6 — preserved neural adaptation). Both endpoints
  scale; compounding + `strength_cap_total_pct` unchanged;
  `recommendDuration` reads the same personalized band (a 60-yr-old is now
  recommended a longer strength block, not the 18-yr-old's).
- **§2.2 hypertrophy continuity.** `bf_proxy_pct` (per sex × leanness band):
  with height + bodyweight but no bf%, the FFMI proximity model runs on the
  BMI band's representative bf% instead of flipping to the training-age
  decay — entering a bf% equal to the proxy moves the target by exactly 0
  (continuity golden); the decay path is reserved for profiles missing
  height/bodyweight. The remaining-potential cap applies on both sides.
- **§2.3 cut-band guard (parameterless).** When `cut_cap_pct_bw` binds the
  high endpoint the low endpoint rescales proportionally
  (`low_raw × cap/high_raw`) instead of clamping onto the cap — a 12-month
  cut now reads e.g. 37–50 lb instead of the collapsed 50–50.
- **§2.4 `MacroPlan.strengthRatePctMonth`.** The personalized strength band,
  computed for EVERY goal (profile-only, unrounded) — the carrier the doc-16
  `rate_source: "plan"` pacer consumes in Phase 2 (a mass-goal macro paces
  the strength dimension; `perMonthRate` is lb/mo there, the wrong field).
- **§2.5 contract snapshot + profile hygiene.** `macrocycles.plan_inputs`
  (migration `20260710000001`): `createMacrocycleWithMesos`/`updateMacrocycle`
  stamp the resolved `MacroProfile` + params version whenever they write
  `target_*`. `updateMacrocycle` now **gates the contract rewrite on a goals
  edit** (`isGoalsEdit` — goal/duration/block-length change; principle 3):
  rename/notes saves no longer silently re-price targets from the current
  profile. `profiles.birthdate` (same migration) replaces the static age as
  the age source — `profileAge` derives it fresh (int fallback, no backfill);
  onboarding + profile UI swap the field (09-changelog 2026-07-10, fig 4.5);
  MCP `get_profile` + the More card read the derived age.
- **Docs:** doc 10 §5 amended (strength personalization params; the strength
  target restated as measured by the §6 est-strength rollup — the "% on key
  lifts" wording predated PR #157; bf-proxy; cut rescale); manual-operations
  gained the Phase R2 activation runbook (replay diff expected ≈ empty on
  prescriptions — targets are display/pacer layer).
- **Tests** (+23, suite 975): strength personalization goldens (legacy
  60F=18M defect pinned, v21 taper/sex-equality/floor-binding, recommended
  duration), continuity golden, cut proportional-rescale golden,
  `strengthRatePctMonth` presence/denomination/fallback, v21 provenance hash
  + DEFAULT-absence hash guards, birthdate-derived age (preferred/fallback/
  invalid), snapshot builder, `isGoalsEdit` matrix.

**Remaining for the macro-goals arc:** doc 17 Phases 2–6 + R (next: §3
plan-rate pacer branch, blocked on this PR; v21 activation + target-card
re-enable at R2).

## 2026-07-09 — Prescribed progression Phase R: activation prep (doc 16 §10, N35)

Phase R of [doc 16 — prescribed progression](16-prescribed-progression.md) is a
**runbook, not code** (§10). It gates the activation of engine_params **v20**
(the earned-step block shipped inactive by Phase 1) on a research pass + a replay
diff + owner review. No engine or app change this slice — only docs and the
applied-inactive migration. Steps (1)+(2) are done; (3)–(5) are owner-gated in
`docs/deployment/manual-operations.md`.

- **Research pass (activation gate) — `goal_rate_factor.hypertrophy` kept 0.75.**
  New evidence doc `docs/reviews/2026-07-09-goal-rate-factor-research.md`
  (doc-10 house style, evidence labels). The factor scales the macro-rate
  pacer's target gain; it is the *residual* (the engine already splits goals by
  rep window). Moderate-load (8–12) → 1RM conversion runs ~0.56–0.73 of
  heavy-load (3–5) in the one head-to-head that isolates rep zone (Schoenfeld
  2016: squat 0.56, bench 0.73), consistent with the load-continuum meta
  (Schoenfeld 2017) and volume-matched trials (Lasevicius 2018, Campos 2002).
  0.75 is the conservative-for-a-*governor* top of that band (the pacer only
  delays, so erring high lets earned performance flow through); collapsing to
  1.0 is contradicted by every source. v20 already carries 0.75 → **no params
  edit**; the finding validates the shipped value.
- **v20 applied INACTIVE + replay diff.** `20260709000001` applied to hosted via
  the Supabase MCP, hash-verified `cb451a02…c90287`; v19 stays active, no user
  change. `replay_decisions` candidate v20: **v19→v20 = 15 source / 11 changed /
  0 errors** (all earned steps on compliant advance/seed working weeks — reprice
  up one quantum or a +1 rep climb), broader 100-decision replay = 80 unchanged
  / 20 changed / 0 errors (unchanged = seeds/deloads/gate-failures,
  byte-identical). This is the owner's pre-activation diff.
- **Runbook + deferred spine.** `manual-operations.md` gained the "Activate
  engine_params v20" section (research ✓ / replay ✓ / owner review / activate via
  admin MCP `activate_engine_params` / monitor). The doc 16 §11 deferred items
  are filed as backlog **N36–N39** (workstream P): envelope loop, `rate_source:
  "plan"` pacer branch, required honest-RIR confirmation, per-exercise
  progression-off override. **N21 primed as the next target**
  (`docs/reviews/2026-07-09-n21-strength-rate-priming.md`): the strength-path fix
  must expose the age/sex-aware per-user rate that `rate_source:"plan"` reads —
  key finding, strength `sexFactor ≈ 1.0`, not the hypertrophy 0.7.

**Remaining / external:** activating v20 (owner review of the replay diff →
`activate_engine_params` → monitor) per `manual-operations.md`. Until then the
earned-step mechanism is dormant and every output is byte-identical to v19.

## 2026-07-09 — Prescribed progression Phase 4: audit aggregate (doc 16 §8.3/§10, N35)

Fourth build slice of [doc 16 — prescribed progression](16-prescribed-progression.md):
the admin-side audit aggregate over the status-coded `progression` trace steps
the engine has recorded since Phase 1. Read-side only — no schema change, no
migration, no engine change; while the v20 block stays INACTIVE no decision
carries a progression step, so the tool honestly reads empty.

- **New admin MCP tool `get_progression_history`** (role-gated, hidden from
  non-admin sessions like the rest of the Slice-4 roster; hard rule 9 — the
  connector is the entire admin interface). Per exercise, over the caller's
  own `engine_decisions` (hard rule 5 — no cross-user identity): the
  earn/miss/skip **status mix** (`stepped | vanished | paced | not_earned`),
  **governor firings** (`paced` by governor — cadence / rate_pacer /
  miss_throttle / peak_week / max_pct_per_step), **gate failures**
  (`not_earned` by first failing predicate), the **`vanished` share** of asks
  (§8.3's increment-sizing signal, feeding the doc 10 §8 finer-increments
  decision), **earned-then-met / missed / unanswered** pairing (each `stepped`
  ask answered by the NEXT decision's source-session compliance — the same
  pairing the miss throttle folds) plus an `open_ask` flag, **trailing
  prescribed vs measured gain** (first→last %/30d-normalized with the pacer's
  7-day span floor, deloads excluded — demand leading measurement by ~one
  quantum is the design visibly working), and a bounded chronological **event
  series** (decision id, W·D coordinate, status/governor/predicate, δ target
  vs realized, target anchor, prescribed e1RM, measured anchor). Args:
  `exercise_id`, `since` (default 180 days), `series_limit`. The prescribed
  side is priced through the ACTIVE params' e1RM curve (`pricing_params_version`
  reported) — the same basis the governors' live lookback uses.
- **Pure fold + widened event** (`queries/progression-history.ts`):
  `toProgressionAuditEvent` (the §8.2 derivation event widened with the full
  recorded step, measured anchor + confidence, identity fields) and
  `aggregateProgressionEvents` — exported for tests, re-exported through
  `queries/progression.ts` like the rest of the module. Fetch + label
  resolution (`queries/engine-admin.ts::getProgressionHistory`) mirrors the
  decision inspector (JSONB containment on the trace rule, ascending, 2000-row
  window with an explicit truncation note).
- **`v_progression_events` NOT built** — doc 16 §10 Phase 4 gates the view on
  a stats screen wanting it; none does (stats stay measured-e1RM everywhere,
  §9). Recorded here as the deliberate deferral, per the shared-views
  convention.
- **Aggregation is read-side only** (§8.3): nothing here feeds back into
  prescriptions — the only sanctioned feedback path remains the §8.2 derived
  input (and, later, the Phase-3-of-the-design envelope loop).
- **Tests** (+9; suite 941): audit-event widening (full step + anchor fields,
  pre-v20 tolerance), status/governor/predicate counting incl. stepless rows,
  `vanished` share, ask-pairing semantics (met / missed / unanswered /
  open-ask; a non-compliance gate failure counts as performed — compliance is
  checked first), gain math (normalization, deload exclusion, two-point
  minimum, 7-day span floor), and the admin roster/gating suites now cover the
  new tool (registration, no `user_id` arg, unauthenticated rejection,
  non-admin visibility filtering).

Remaining per doc 16 §10: Phase R (owner-gated activation incl. the
hypertrophy-factor research pass — runbook, not code). With Phase 4 the
build-out of doc 16 is complete.

## 2026-07-09 — Prescribed progression Phase 3: day-view coupling + three-state markers (doc 16 §10, N35)

Third build slice of [doc 16 — prescribed progression](16-prescribed-progression.md):
the day view now couples to the prescription-basis anchor and the ▲/▼ markers
become the earn gate's comparison made visible. No engine-output change and no
migration — with the v20 block absent (still INACTIVE) no decision ever
records a target, so every fallback path is byte-identical to today.

- **Day read (`queries/logging.ts`).** `LoggedExercise` gains
  `prescription_anchor`: the target `A* = A + δ` from the status-`stepped`
  progression step of the LATEST `engine_decisions` row per workout exercise
  (every reprice — advance, seed, freshness recompute — records a fresh
  decision, so a superseded step can never leak a stale lead). Held /
  pre-v20 / decision-less rows stay null. Read unconditionally (not gated on
  the mode) so the coupling stays honest in the deactivation window, before
  the doc-14 recompute has pulled a stored `A*` prescription through.
- **Live predictor (doc 16 §5.2).** `SetRow`'s `predictRepsAtWeight` prices
  off `prescription_anchor ?? e1rm_anchor` — an athlete-owned weight edit
  re-derives reps faithful to the prescribed target *including the earned
  lead*; without a recorded target it's the measured anchor, today's
  behavior. The measured anchor remains the basis everywhere else (stats,
  PRs, sampling, confidence, grading). Prefill flow-through was already
  automatic (the engine writes the stored prescription; asserted by the e2e).
- **Three-state markers (doc 16 §5.3).** `day-rules.ts::loggedSetMarker` is
  now a pure delegation to the engine's `setComplianceMarker` — the SAME
  comparison the earn gate scores each working set with, so marker, gate, and
  grading cannot diverge (made structural, not conventional). In-band returns
  `met` (a positive state under the progression model) instead of null; null
  stays reserved for not-comparable. The module-local `MARKER_BAND` is gone —
  the band is params-fed (`progression.compliance_band`, default ±1.5% while
  the block is absent) and threaded `DayView → ExerciseBlock → SetRow` as
  `markerBand`. Glyphs: ▲ over (top) / ■ met (centered, 6px) / ▼ under
  (bottom), small ink per the ledger system — house-style like the original
  P19 pair (**rule-8 pass re-verified: no mockup figure exists for the set-row
  marker**); recorded as the 2026-07-09 entry in
  [09-design-changelog.md](09-design-changelog.md). Session-level "progression
  earned" stays disclosed via the existing rationale/audit affordances — no
  new indicator.
- **WS-J bundle guard extended.** `rules/progression.ts` (and its
  `rules/feedback.ts` import) now ride the day view's client chunk; the
  predict-test import guard grew to pin all four leaf modules free of runtime
  zod/params/types/e1rm/reps imports.
- **Tests** (+13; suite 932): day-rules three-state (met on-target incl. the
  N11 deload case, reported-RIR-at-target met, params-fed band absorbs a beat
  into met), marker ⇄ earn-gate agreement fixture (8 scenarios: exact/quick-log
  compliance, rep-short, athlete-owned weight change up, honest grind,
  RIR-at-target, missing set, non-comparable zero-load set, over — the gate's
  compliance row passes exactly when every set marker reads over|met), extended
  bundle guard. New e2e (`tests/e2e/prescribed-progression.spec.ts`): a
  fabricated `stepped` decision (service-role fixture, active params untouched)
  → the earned prescription renders in the row, a weight edit re-derives reps
  off the recorded target (the fixture user has no logged history, so only the
  recorded `A*` can predict), exactly-as-prescribed logs read `met` and a short
  set reads `under`.

Remaining phases per doc 16 §10: Phase 4 (audit aggregate, optional, post
field data), Phase R (owner-gated activation incl. the hypertrophy-factor
research pass).

## 2026-07-09 — Prescribed progression Phase 2: seed route / meso-over-meso carry (doc 16 §10, N35)

Second build slice of [doc 16 — prescribed progression](16-prescribed-progression.md):
the earned-step overload now carries across the deload boundary into the next
meso's seed (the memo's second half). Still **inactive** — no migration in this
phase (v20 already ships the block, INACTIVE); with it absent every seed
output, recorded input, fingerprint, and trace is byte-identical.

- **Engine (`seedMeso`).** The seed path is refactored into an
  anchor-parameterized `seedCore` (bodyweight model → §S1 anchor seed → plan
  `initial` → unseeded, all byte-identical) plus a doc-16 §3.7 wrapper that
  mirrors `prescribe()`'s: the caller supplies the prior meso's final working
  session as an `earn` opt (its prescription + performed sets + feedback) with
  `progressionHistory` and `daysSincePreviousSession`, and the wrapper runs the
  SAME `assessProgression` gate + governors as the advance chain (one
  comparison, one arithmetic — §2.5), re-prices `seedCore` off
  `A* = A + δ` when earned+offered, and applies the shared §3.3 realized-ask
  rule (extracted into `applyRealizedAsk`, used verbatim by both routes:
  `vanished` retains the earn, `max_pct_per_step` paces, `stepped` announces
  the target). Swaps/cold starts pass no context ⇒ `not_earned /
  no_previous_session`; an `isDeload` opt bypasses the wrapper (deloads
  neither earn nor take steps). Exactly one status-coded step per active-mode
  seed. The quantum is priced at the unearned seed's effective point, which
  the Option-A invariant makes the same effective-rep point the advance chain
  prices at — seed-route parity is by construction and pinned by test.
- **Earned-at-close derivation.** New leaf `queries/seed-progression.ts`
  (`getSeedEarnContexts`): per exercise, the most recent COMPLETED WORKING
  session (deload weeks excluded — `chooseEarnSources` pure) within a 90-day
  fetch window, assembled exactly like `generateDay`'s inputs (prescription,
  logged sets, joint pain + group-closing pump/workload, session feedback,
  staleness gap). Cross-meso by construction (§4) — the same lookup serves
  standalone→standalone; the in-engine `max_gap_days` staleness gate is what
  decides whether a carry across the boundary is still honest.
- **Caller plumbing (doc 16 §10 Phase 2 site list).** Meso activation
  (`startMeso`) derives earn contexts + the governors' lookback (keyed to the
  week-1 micro, so a retried activation sees a step an earlier attempt
  recorded — cadence) and threads them through `seedExerciseRow`;
  `regenerateOpenWorkouts` (plan-edit adds) and the slot resolver's cold seed
  (swaps / mid-workout adds) pass no earn context by design, and the slot path
  forwards the week's `isDeload`; the freshness recompute (`recomputeSeed`)
  replays the stored earn context/lookback FROZEN (exactly like the advance
  replay's `progressionHistory`) while the refreshed anchor flows into the
  gate and target arithmetic; the admin `replay_decisions`/
  `simulate_prescriptions` seed branch replays the recorded context so a
  stepped seed reproduces byte-for-byte under the same params. The
  `progressionHistory` assembly moved to the leaf
  `queries/progression-history.ts` (generation ↔ progression cannot import
  each other); `progression.ts` re-exports, so importers/tests are untouched.
- **Doc-14 treatment.** New derived `EngineInputs.seedEarn` (`.nullish()`, no
  default — pre-Phase-2 stored inputs parse byte-identically), added to the
  fingerprint denylist: a mode-active seed's `dep_fingerprint` is
  byte-identical to an inactive one's (pinned), and `seedEngineInputs`/
  `buildSeedInputs` spread the progression fields only when the caller
  assembled them, so recorded inputs stay byte-identical while the mode is
  absent.
- **Tests** (+23; suite 919): seed-route parity with the advance route (same
  context ⇒ same δ, same A*), meso-over-meso golden (block absent: meso N+1
  week 1 byte-identical to meso N week 1 even WITH the earn supplied — the
  fixed point; active: the earn carries across an 8-day deload boundary and
  meso 2 opens above meso 1), staleness cutoff at `max_gap_days` (10 ⇒
  stepped, 11 ⇒ `stale`), incomplete-final-session / low-confidence /
  factor-0 gate cases, cadence + rate-pacer governors on the seed,
  `bodyweight_only` rep-cap vanish + substitution nudge, absent-block
  byte-identity with earn opts supplied, doc-14 fingerprint parity, frozen
  earn-context seed replay (regeneration + admin, incl. the honest diff when
  a candidate removes the block), pre-Phase-2 decision replay, earn-source
  selection.

Remaining phases per doc 16 §10: Phase 3 (day-view target-anchor coupling +
three-state markers, hard-rule-8 mockup pass), Phase 4 (audit aggregate,
optional), Phase R (owner-gated activation incl. the hypertrophy-factor
research pass).

## 2026-07-09 — Prescribed progression Phase 1: engine core + advance chain (doc 16 §10, N35)

First build slice of [doc 16 — prescribed progression](16-prescribed-progression.md)
(earned-step overload + macro-rate pacing). Ships **inactive** (engine_params
v20, `20260709000001`); with the block absent every output, fingerprint, and
trace is byte-identical — pinned by the treadmill golden.

- **Engine.** New pure rule module `src/lib/engine/rules/progression.ts`: the
  §3.4 earn gate (per-set compliance in e1RM space via the shared §5.3
  three-state comparison — `setComplianceMarker`, grinder guard intrinsic; pain
  / dampener / workload / deload / staleness / confidence predicates, first
  failing one named), the §3.5 governors (microcycle cadence, macro-rate pacer
  `lerp(strength_pct_month[bucket], band_position) × goal_rate_factor[goal]`,
  miss throttle, peak-week skip), and the §3.2 quantum
  `δ = min(one loadable step, one rep) in e1RM space`. `prescribe()` threads
  `A* = A + δ` through the existing §9.2 machinery as an anchor-input
  substitution (R24b deadband disabled on the earned pricing run only); the
  §3.3 realized-ask rule runs after rounding (`vanished` retains the earn —
  retry-not-stack; `max_pct_per_step` binds on the realized ask; the
  `bodyweight_only` rep cap carries the substitution nudge). Exactly one
  status-coded `progression` trace step per working prescription while active
  (`stepped | vanished | paced | not_earned` + `deltaTarget`/`deltaRealized`/
  `targetAnchor` payload); grading stays on the measured anchor; no stored
  e1RM is ever bumped (T-I5).
- **Params.** v20 block (`progression`) in `params.ts` under the house
  `.optional()` discipline; `compliance_band` (0.015) absorbs the day view's
  `MARKER_BAND` engine-side (UI consumption is Phase 3). Migration
  `20260709000001_engine_params_v20_prescribed_progression.sql`, append-only,
  INACTIVE, hash-guarded in `params-provenance.test.ts`.
- **Derived inputs (doc 14 §3).** `EngineInputs.progressionHistory`
  (`earnedThisMicrocycle`, `trailing30dPrescribedGainPct` normalized to %/30d,
  `consecutiveMissedEarns`) + `daysSincePreviousSession` — caller-computed,
  excluded from the freshness fingerprint (denylist), recorded in the decision
  for replay. Assembly in `queries/progression.ts`
  (`deriveProgressionHistory`/`toProgressionEvent` pure + one decisions query,
  90-day lookback so the pacer's rate memory delivers the §3.5 cadences),
  wired into `generateDay` (fresh per generated day so same-run backfills see
  earlier steps) and `projectNextPrescription`. Fields are omitted entirely
  while the mode is inactive — recorded inputs stay byte-identical.
- **Audit surface (§8.3).** `get_engine_decisions` gains `rule`/`status`
  filters (JSONB containment on the output trace).
- **Tests** (+49): treadmill golden (fixed point with the block absent; the §7
  worked example verbatim with it active — 145×8@3 → earned 150×9@2 targeting
  203.0 → measured 205.0), gate-arms-per-goal (hypertrophy, gain, strength;
  cut/maintain factor-0 byte-identical), no-compounding + retry-not-stack,
  full gate matrix (each failing predicate ⇒ held output), governor set
  (cadence / pacer arithmetic vs `band_position` / miss throttle / peak week),
  realized-ask bounds, e1RM-space compliance (athlete-owned weight moves up
  and down comply; reported-low-RIR grind fails), trace consistency, replay
  determinism on pre-v20-shaped stored inputs, lookback-derivation unit tests.
- **Docs.** Doc 10 §4 and doc 13 §9.2 gained pointers to doc 16; the stale
  "standalone → gain" comment at the projection path corrected to the
  `engineGoal` hypertrophy default (follow-up 2 §5 housekeeping).

Remaining phases per doc 16 §10: Phase 2 (seed route / meso-over-meso carry),
Phase 3 (day-view target-anchor coupling + three-state markers, hard-rule-8
mockup pass), Phase 4 (audit aggregate, optional), Phase R (owner-gated
activation incl. the hypertrophy-factor research pass).

## 2026-07-08 — Est-strength rework: recent-vs-baseline rolling trend (N42, filed as N36)

Reworked the aggregated "est. strength" metric bottom-up. Root cause of the
owner's "it drops when a new meso starts": a pure first→last two-point delta let
a fresh block's deliberately light RIR-ramp opener become the endpoint and
crater every continuing lift; and the Overview tile (top-3 key-lift mean) was a
different aggregation from the Performance muscle rollup and could disagree.

- **`src/lib/engine/strength.ts`** (new, pure, golden-tested): `strengthTrend`
  scores each lift as best-of-recent-window vs best-of-earliest-window
  (symmetric non-overlapping windows, `engine_params.strength`). `volumeWeightedMean`.
- **`queries/stats.ts` + `macro.ts`**: `foldProgressScores` uses it; the headline
  is now the **volume-weighted mean of the muscle-group rollup** (fractional-set
  weights), shared by the Overview tile and Performance tab — identical by
  construction. `keyLiftStrengthPct` removed.
- **`engine_params.strength` is `.optional()`** (not `.default()`): absent on every
  stored row, so the params canonical hash / replayability is untouched (verified —
  params-provenance suite green); stats fall back to `DEFAULT_STRENGTH`.
- **Confidence persisted**: `logged_sets.e1rm_confidence` (migration
  `20260708000001` + backfill), stamped at log/amend (`log/actions.ts`) and
  restamped on e1rm-block change (`e1rm-restamp.ts`). Auditability.
- **Clarity**: `glossary.ts` rewrites (e1rm now states RIR/effective reps in plain
  words; new `est_strength`, `e1rm_confidence` cards), InfoDots on the macro
  Overview tile + strength sections, and RIR denoted next to the e1RM in the
  history flip view.
- Session value stays the **session average** e1RM (N2 preserved).
- **Rule-8 deviation (recorded):** the history flip view (PH32, no strict mockup)
  now appends `· ~N RIR` to the e1RM read — a minor annotation, owner-requested
  ("denote RIR with the sets/e1rm"). The strength/muscle sections already carry a
  no-mockup rule-8 deviation from N9/M8.

Spec updated: `docs/10-metrics-spec.md` §1/§6/§8. Verified on live data through
`strengthTrend` (Bench −7.3%→−3.8% opener corrected; Machine Chest Supported Row
−32%→−31.7% genuine decline preserved). Full suite green (858), typecheck + lint
clean. Migration not yet applied to the live project (ships with the PR).


## 2026-07-05 — Four backlog closures: N29 FilterBar, N18-B per-week RIR, R24 hold-week, R25 MCP pass (PR #152)

One session, one commit per item:

- **N29 — shared FilterBar.** `components/ui/FilterBar.tsx` generalizes the
  exercise library's two-axis chip grammar (labeled scrolling chip tracks,
  leading ALL reset chip, ✕-to-clear, live count + CLEAR ALL) and replaces the
  three divergent filter UIs: exercises (unchanged behavior; MUSCLE gains the
  ALL chip per the original 3.1 spec), templates tab + from-template picker
  (selects → chips via one shared `TemplateFilterPanel`, URL-driven as before;
  `TemplateFilters.tsx` retired), and the planner exercise picker's equipment
  row. 09 entry "2026-07-05 (session 2)".
- **N18-B — per-week RIR.** `mesocycles.rir_schedule int[]`
  (`20260705000002`): explicit per-working-week RIR superseding the
  `rir_start→rir_end` interpolation; deload week stays engine-owned. Engine
  `rirRamp(schedule?)`; activation + week-1 seed (now ramp-derived, not
  `rir_start`); freshness needed zero new machinery (flows through
  `week.targetRir`, already fingerprinted) beyond adding the column to
  `mesoStaleSignature`; shape edits clear an orphaned schedule. UI: "Set each
  week independently" behind both sheets' ADVANCED disclosure (shared
  `RirScheduleEditor`). MCP create/update accept it; reads surface it. Doc 14
  amendment: the framework's worked example is now the shipped feature.
- **R24 — hold-week reprice-down (remainder closed).** engine_params **v19**
  (`20260705000001`, shipped INACTIVE): `climb_requires_rir_step` (the
  Option-A +1 rep climb only on a real RIR step — kills the "−5 lb, +1 rep"
  lateral move on ramp-hold weeks; top-out reset unconditional) +
  `hold_week_anchor_deadband` (a pure hold absorbs sub-step anchor decay; a
  full-step fall passes through — the cut/maintain preserve-strength answer).
  Ramp-hold goldens pin both param sets. Doc 13 §9.2 amendment.
- **R25 — MCP polish (remainder closed).** Failure contract converged at the
  composition root (`{ok:false}` refusals now also flagged `isError` — one
  signal for both dialects); `place_mesocycle` → `manage_macrocycle_slots`
  action "place"; `list_engine_params` → `get_engine_params` no-arg browse
  (47 → 45 tools); preview vs muscle-balance deliberately kept split with
  cross-referencing lifecycle descriptions; docs/05 drift fixed + new
  Failure-contract section.

**Remaining / external:** ~~apply the two migrations + v19 replay/activate~~
DONE 2026-07-05 in-session: both migrations applied to hosted via the Supabase
MCP; v19 replay over v18-sourced decisions was 0 changed / 0 errors (all 26
are week-1 seeds — the gates live in the advance path); v19 activated via the
admin MCP tool (restamp no-op, e1rm block unchanged).

Green: typecheck, lint, 847 tests (+27 net), production build.

## 2026-07-05 — WS-J Phase 2 closed: reference-data cache (#7), #5 dropped

The last open items of the N1 performance plan's Phase 2 (server load, egress
& caching — [notes/J-performance.md](notes/J-performance.md)) are dispositioned;
the phase is complete (#1–#10 all shipped or rejected with recorded reasons).

- **#7 — cached reference reads.** New `src/lib/queries/reference.ts`: the two
  global datasets (`muscle_groups`, 12 rows; the stock exercise library +
  muscle links, 330 + 352 rows) now serve from the shared Next Data Cache
  (`unstable_cache`, 1 h TTL, `ref:*` tags) instead of hitting Postgres on
  every request — previously re-fetched on every day-view open, planner load,
  template/stats/coaching read, `/exercises` visit, and add-exercise sheet.
  Cache misses read through the service client (cookie-scoped RLS clients
  can't run inside `unstable_cache`) explicitly scoped to global rows
  (`user_id IS NULL`); a static test guards that nothing per-user can enter
  the shared cache. `exercises.ts` merges the user's live custom rows/links
  over the cached stock (`mergeLibrary` + `filterLibraryExercises`, pure,
  SQL-parity tested); `listExercises` / `listPickerExercises` /
  `getAddExerciseCandidates` / `listMuscleGroups` (now zero-arg) plus 7
  hot-path `muscle_groups` fetches converted. Stock-links embed live-verified
  352/352 against the hosted project via PostgREST.
- **#5 — revalidateTag conversion, assessed & dropped.** No log mutation
  touches what #7 cached (stock reference data has no in-app writers), and
  per-user workout reads deliberately stay uncached per doc 14's pull-based
  freshness — so there is no tag to bust; the existing `revalidatePath`
  calls are the correct client Router Cache bust for the user's own edits.
  Full rationale in J-performance.md.

Green: typecheck, lint, 820 tests (+9 reference-library), production build.

## 2026-07-05 — N25 glossary InfoDot + N29 picker filters

Two ready backlog items shipped as one slice (09 entry "2026-07-05 — Glossary
info affordance"):

- **N25 — InfoDot + glossary.** New `src/lib/glossary.ts` — the single copy
  source for in-app jargon (RIR, RIR ramp, deload, e1RM, MEV/MRV, fractional
  set counting, pump, workload, macro/meso/microcycle; copy held to the
  design voice by `glossary.test.ts`: all-caps labels, no exclamation marks,
  card-sized bodies, e1RM framed as an estimate). New
  `components/ui/InfoDot.tsx` — the feedback sheet's circled-"i" grammar
  generalized: tap opens an anchored square glossary card (scrim + 264px
  `border-ink` card, AnchoredMenu placement, `useModalA11y` + refcounted
  scroll lock so it stacks safely over sheets). The two ad-hoc feedback-sheet
  explainers migrated onto it (their inline-expander states deleted; the
  workload explainer no longer auto-expands — recorded as a deliberate delta
  in 09). Wave-1 placements: day-view header TARGET/DELOAD line, meso
  calendar ramp footer, edit-details + finalize-sheet START RIR, planner
  WEEKLY SETS PER MUSCLE + DIRECT·SECONDARY, meso Volume SETS/WEEK, EST.
  STRENGTH header (meso + macro performance), exercise-page EST. 1RM cell.
  Remaining N25 scope (more surfaces) is incremental adoption as screens are
  touched.
- **N29 (picker half) — from-template filters.** The plan-from-template
  picker renders the Templates tab's `TemplateFilters` unchanged (URL-driven;
  search form preserves active filters) and threads days/emphasis/gender into
  `listTemplates`, which already supported them. The FilterBar unification
  half of N29 stays open.

Green: typecheck, lint, 811 tests (+5 glossary), production build. Session
also ran the resume-protocol sweep: N33/T-N33 archived (PR #147 merged).

## 2026-07-05 — N33 + T-N33: engine-mediated slot prescriptions + e1RM restamp on activation

The swap/seed-path provenance investigation
([reviews/2026-07-04-swap-prescription-provenance.md](reviews/2026-07-04-swap-prescription-provenance.md),
doc 14 §6.2 amendment) built out (PR #147). Root defect: `replaceWorkoutExercise`
wrote the incoming exercise's all-time PR raw onto half the prescription tuple —
no engine call, no decision, no fingerprint restamp — so the detail sheet showed
a chimera (245×15·2·6RIR over a V17 deload trace) with a false "re-verified"
line, and the freshness framework kept certifying hand-written numbers (a swap
changes neither the meso stale gate nor the row fingerprint).

- **Slot resolver (S1 + §9 lookback).** New `queries/slot-prescription.ts`:
  swap AND add flow through one resolver that derives the engine kind from the
  data — an **advance** off the most recent same-day-slot instance with logged
  working sets within 2 weeks (`LOOKBACK_WEEKS`; set-less week-(N-1) fallback =
  generation parity), else the doc 14 §6.2 cold seed. Swap-out/swap-back now
  RESTORES the engine prescription (golden test: the owner's exact W5·D2 case
  reproduces 215 lb × 10 @ 6 RIR × 2 sets); a removed-then-re-added exercise
  advances instead of reseeding; a week substituted for equipment reasons still
  advances off the last performed session. Full tuple + rationale written,
  fingerprint stamped, decision recorded (`seed-decisions.ts` generalized to
  carry `kind`/source). Propagated sibling-week swaps each compute under their
  own week context.
- **Exercise-identity replay guard (S2).** The reconcile drops a latest
  decision whose recorded `exercise_id` differs from the row's live one
  (`dropForeignDecisions`) — the row falls into the §7b/§7c backfill instead of
  replaying a foreign decision. §7c itself gained the same §9 lookback
  (`advanceSourceKeys` + set-presence preference).
- **Audit tripwire (S4).** `PrescriptionAudit` now carries the decision's
  output numbers; the detail sheet compares them to the live row and replaces
  the "re-verified — unchanged" inference with an explicit "set outside the
  engine" note on divergence (ink border, not accent — rule 7).
- **T-N33 — stored e1RM restamp on activation.** `queries/e1rm-restamp.ts`:
  when `activate_engine_params` activates a version whose `e1rm` block differs
  from the outgoing one, every `logged_sets.e1rm` stamp is recomputed under the
  new params (same rule as log time) and changed rows rewritten via chunked PK
  upserts on the service client; the tool reports scanned/updated. Caveat: a
  version activated BY MIGRATION bypasses the hook — prefer the MCP tool when a
  proposal touches the `e1rm` block. Golden test: the owner's 245×15 restamps
  384.2 → 367.5 (v11 Brzycki cutoff).
- Green: typecheck, lint, 805 tests (+27), production build.

## 2026-07-04 — N32: history-sheet fixes from N15 field testing

Owner tested the PR #144 drill-down and returned one bug + two changes
(Batch 9 → N32, PR #145). Design of record: the 09 "2026-07-04 (session 5)"
entry.

- **Sheet scroll bug (root cause: N6 × scroll lock).** The scroll lock's
  `position:fixed` zeroes `window.scrollY`, so `PullToRefresh` (N6) armed on
  **every** drag over an open sheet — the pull spacer grew (the page behind
  the scrim visibly moved) and a long drag fired `router.refresh()`
  mid-interaction. Affected every sheet since N6 shipped; first noticed on
  the first long sheet tested after it. Fix at the source: `useScrollLock`
  exports `isScrollLocked()` and `PullToRefresh` never arms while it's true;
  `BottomSheet` panels additionally get `overscroll-contain` and stop touch
  propagation at the overlay root so sheet gestures can never read as page
  gestures.
- **Drill-down default reverted to sets/reps.** The session-4 e1RM-first
  opening is removed (`initialFlipped` prop deleted; targets no longer carry
  `e1rm_first`) — every history entry point opens on sets/reps, tap to flip
  (standard PH32 behavior), per the owner.
- **Exercise-name link.** The history sheet's subtitle exercise name now
  links to `/exercises/{id}` on every entry point; `BottomSheet.subtitle`
  widened from string to ReactNode.
- Green: typecheck, lint, 778 tests, production build.

## 2026-07-04 — Batch-7 build 3: macro header (N24) + scoped history drill-down (N15) + back links (N27) + set-row scale (N26) + start-date sort (N28)

Fourth slot of the Session-42 attack order, folding in the N15 stats slice
and the three small ready items (PR #144). Design of record: the 09
"2026-07-04 (session 4)" entry.

- **N24 — macro header adoption.** New sticky `MacroHeader` client component
  on the shared header grammar (brand row `‹ CYCLES` + `MACROCYCLE`, title +
  `⋮` on the shared `AnchoredMenu`, meta line + ACTIVE/COMPLETE/ARCHIVED
  badge, goal-notes line). "Edit macrocycle" moves into the ⋮ menu (the
  existing `/edit` route already covers goal/duration/notes/blocks),
  replacing the full-width EDIT MACROCYCLE link at the bottom of the
  OVERVIEW tab. Day view / meso / exercise / macro now share one header
  idiom. Route skeleton (`loading.tsx`) updated to mirror it (and sheds the
  stale N21 target-card block).
- **N15 — Performance drill-down to scoped history.** `getExerciseHistory`
  gains an optional `scopeMesoIds` filter (N30's day-grain pagination applies
  inside the scope unchanged), threaded through `getExerciseHistoryAction`
  (zod: uuid array, ≤100) and `ExerciseHistoryList`'s pager. `HistorySheet`
  targets take optional `meso_ids`/`scope_label`/`e1rm_first`; the macro
  Performance tab's muscle-group contributor rows (`MuscleStrengthSection`)
  and the meso tab's ALL EXERCISES rows (`StrengthProgressSection`, now a
  client component) open it scoped to their cycle, **e1RM-first** (tap flips
  to sets/reps — the inverse of the PH32 default, per the owner). MCP
  `get_exercise_history` contract unchanged.
- **N27 — back links honor origin.** Day-view ⋮ → "Mesocycle stats" now
  appends `&from=/log/<workoutId>`; the meso page validates it with the same
  `/^\/log\/[A-Za-z0-9-]+$/` guard the exercise page uses (N4) and passes
  new optional `backHref`/`backLabel` props into `MesoHeader` — back reads
  `‹ WORKOUT` and returns to the workout, defaulting to `‹ CYCLES`
  everywhere else.
- **N26 — set rows +10%.** Day-view value cells 32→35px at 15px type, row
  padding 4→5px, LOG box 21→23px (✓ 12→13px) with the R18 tap target grown
  to 44×35px; set-menu ⋮ and LOG-cell wrappers kept at the new cell height.
  Grid templates untouched (header/row stay in sync).
- **N28 — training-date sort.** `/cycles` top level (macros + standalone
  mesos) now orders by **training start date** desc via pure
  `orderCyclesTopLevel` (`start_date ?? created_at`, `created_at`
  tie-break) — `created_at` was an import-order artifact that rendered
  completed macros oldest-first. Unstarted plans (null `start_date`) sort by
  their fresh `created_at`, keeping a new plan on top. Within-macro order
  (`orderMesos`) untouched per the owner. 3 unit tests.
- Green: typecheck, lint, **778 tests (+3)**, production build.

## 2026-07-04 — N31: planner board replace-in-place

One-defect fix (PR #143). Tapping a filled planner row opened the same
group-wide multi-select picker as an open slot, so a "substitution" appended
the pick at the day's end, kept the original selected, grew the group's
`exercise_slots`, and left an empty slot after manual cleanup.

- `ExercisePicker` gains a **replace mode** (`PickerTarget.replaceFill`):
  single-select seeded with the tapped fill's movement; exercises already
  filling another slot of the group are disabled (`ALREADY IN THIS GROUP`);
  sheet reads "Replace exercise / SWAPS <name> — SAME SLOT & SETS" with a
  `REPLACE EXERCISE` submit, disabled until a different pick. Open-slot taps
  keep the original multi-select.
- The swap preserves the fill's identity — day position, group slot, and
  starting sets. Staged path (planned/active mesos) swaps the working copy
  in place; draft path uses new `replaceSlotAction` → `replaceSlotExercise`,
  a single-row `exercise_id` update with a duplicate guard at the query
  layer (5 unit tests: targeted write, dup refusal, same-pick no-op,
  missing slot, group-less legacy fill).
- Green: typecheck, lint, **775 tests (+5)**, production build.

## 2026-07-04 — Batch-7 build 2: exercise surfaces (N22/N23) + paged full history (N30)

Third slot of the Session-42 attack order, plus the N30 rider (PR #142).

- **N22(a) — exercise page header.** New sticky `ExerciseHeader` client
  component on the meso-header grammar (brand row with the N4 `?from=`-aware
  back link + `LIBRARY` label, title, `[share][⋮]` cluster, meta line +
  CUSTOM badge, shared `AnchoredMenu`). The I13 Load-step sheet is refactored
  to a controlled `LoadStepSheet` driven from the ⋮ menu — and now shows
  *disabled* (`BODYWEIGHT` tag) on bodyweight-only lifts instead of vanishing
  (PH36 intent kept, discoverability fixed). Share moves off the OVERVIEW tab
  into a header share sheet (owned custom only). **New: in-app delete for
  owned custom exercises** — `deleteCustomExerciseAction` mirrors the MCP
  tool's guards exactly (stock refused; logged sets refused — hard rule #5;
  planned/workout references refused), and the confirm sheet pre-explains
  blockers instead of failing.
- **N22(b) — create-exercise rebuild.** `NewExerciseForm` reworked into
  divided ledger sections; bodyweight equipment picks explain their load
  semantics inline (R12 vocabulary); a `LOAD STEP` section (preset chips +
  CUSTOM, `DEFAULT +n lb` derived per equipment from `engine_params.rounding`)
  makes the per-user increment settable **at creation** —
  `createCustomExerciseAction` gains the zod-bounded optional field and
  writes the `exercise_param_overrides` row post-insert. Hidden for
  bodyweight-only equipment (the step is inert there).
- **N22(c) — MCP parity.** `create_custom_exercise` accepts `notes` +
  `weight_increment` (same bounds as the app; increment skipped with an
  explanatory note for bodyweight-only). **New tool `set_exercise_increment`**
  — the first MCP surface for the editable increment on *any* exercise
  (set/clear, per-user override; doc 14 phase 3); doc 05 tool table updated.
- **N23 — new-exercise tray.** `NewExerciseButton` chooser sheet (Blank
  exercise / `OR ADD FROM A CODE` with the kind-agnostic `RedeemForm`)
  replaces the bare `+ NEW` link on the exercises page — the receptacle where
  a user holding an exercise share code actually looks. Backend untouched
  (sharing already worked end-to-end).
- **N30 — full history reachable.** `getExerciseHistory` is cursor-paged:
  over-fetch by one set, trim to whole *calendar days* (`pageSetsByDay`, pure
  + unit-tested — day-grain means identical-timestamp import artifacts can
  never split or duplicate a session across pages), return
  `{ entries, nextCursor }`. `ExerciseHistoryList` appends older pages via an
  IntersectionObserver `LOAD OLDER` row (tappable fallback, retry state);
  the HISTORY tab and `HistorySheet` both inherit it. MCP
  `get_exercise_history` keeps its first-page + lifetime-count contract.
- Rule-8 note: no mockup figures exist for any of these controls — recorded
  as the dated 09 entry "2026-07-04 (session 2)" reusing established grammar.
- Green: typecheck, lint, **770 tests (+7)**, production build.

## 2026-07-04 — Batch-7 build 1: stats trust (N14/N16/N21-hide) + planner & create flow (N17/N18-A/N20)

First two slots of the Session-42 attack order (PR #140).

- **N14 — robust trend endpoints.** `foldProgressScores` collects each
  exercise's non-deload session e1RMs and runs `dropE1rmOutliers` (new pure
  helper, `E1RM_OUTLIER_RATIO = 3`) before taking first→last: sessions more
  than 3× from the window median — either direction — are dropped from the
  endpoints *and* the qualification count. Kills order-of-magnitude mis-logs
  (the 7-lb hack-squat "starting e1RM") while a genuine within-window doubling
  survives. Fewer than 3 sessions → no drop (no median worth trusting; such
  lifts never qualify anyway).
- **N16 — one KEY LIFTS definition.** `buildMacroStats`'s bespoke
  `v_exercise_history` fold (deloads included, no qualification, mean of the
  3 most-logged) is deleted; the OVERVIEW tile now reads
  `getProgressScores` → pure `keyLiftStrengthPct` (top-3 **qualifying** by
  frequency — doc 10 §7 — mean of their %-changes). Tile, Performance tab, and
  MCP `get_macrocycle_summary` now share one number; deload-tail regression
  test pins the −36.3% class of contradiction shut.
- **N21 — realistic targets hidden** (owner's interim call, Batch 7): the
  macro overview `REALISTIC TARGET` card and the create-flow `YOUR TARGET`
  range/per-month rate/rationale are removed from view. `planMacrocycle`
  still runs everywhere (block math), `target_*` columns persist, and the
  create form keeps the meso-count sentence + phase strip under a plain
  `PLAN` label — re-enabling is a pure view change. Target-engine correction
  tracked separately (backlog N21, needs-decision).
- **N17 — planner starting-set stepper.** Filled board rows get a compact
  −/＋ `START SETS` control (the group-slots stepper grammar at row scale);
  `setFillSets` stages in edit mode or writes live on drafts via new
  `updateFillSetsAction` → `updateMesoExerciseSets` (zod 1–20, matching the
  `meso_exercises.initial_sets` check). Pick-time default stays 3.
- **N18-A — RIR ramp at create.** The FinalizeSheet's ramp summary line is a
  collapsed disclosure (EDIT ↔ DONE); expanded it shows the edit-details
  sheet's START/END RIR selectors (end clamped ≤ start) + deload checkbox.
  `finalizeSchema` gains the optional fields with the same bounds + descend
  refine; `finalizeDraftMeso` writes them only when present. Untouched, the
  create flow is byte-identical to before — the owner's "deep option, no
  badgering". Per-week RIR (N18-B) deliberately not attempted.
- **N20 — share-code receptacle in the cycles tray.** `NewCycleButton`'s
  sheet mounts the kind-agnostic `RedeemForm` under `OR ADD FROM A CODE`
  (template-tray pattern) — a meso/template/exercise code entered here routes
  by its stored type.
- Rule-8 note: the stepper, the disclosure, and the tray addition have no
  mockup figures — recorded as a dated 09 entry (2026-07-04) reusing
  established control grammar; the N21 card removals are logged there too.
- Green: typecheck, lint, **763 tests (+9)**, production build.

## 2026-07-03 — N13 first-set reset fix + I12 in-app planner UX completed

Owner session (Batch 6): N1 skeletons confirmed on device; I12 design
authorized ("rework as you see fit"); one new HIGH bug (N13).

- **N13 — reset-to-prescription lands on the first set again.** The R13
  typed-row guard was swallowing the reset echo on the editable row (the
  override CLEARING arrives via the planned-input channel, and nothing
  releases the typed flag on an unlogged row — set 1 is always typed-in
  because typing is what surfaces the reset option). `adoptServerRowState`
  gains a `prescription-reset` class: a plannedWeight value→null transition
  always adopts and clears the flag; null→null (bodyweight edit mid-typing)
  keeps the R13 protection. The N5 swap remount is untouched — both halves of
  the "first set must be right" complaint now covered by explicit rules.
- **I12 — the in-app surface now covers the whole MCP authoring set** (design
  of record: 09 2026-07-03 session 4):
  - *Place into macrocycle* (meso ⋮ menu, standalone planned): sheet rows
    state the exact landing (`FILLS M2` — consumes the slot + inherits its
    phase — or `ADDS AS M5`), computed with the same pure `planMacroPlacement`
    the write path runs; lands on the macro timeline.
  - *Edit details* (meso ⋮ menu, any non-frozen meso): finalize-sheet grammar;
    name always, WEEKS 3–8 + START/END RIR (end clamped ≤ start) + deload
    checkbox only before start; `updateMesocycleAttrs` guards re-checked
    server-side.
  - *BLOCKS* on the macro edit page: ▲▼ reorder on not-yet-started rows (a
    move never crosses a started/completed block), ✕ on open slots only,
    dashed + ADD BLOCK (inherits the macro's block length server-side).
    Applies immediately; caption says so.
  - *WEEKLY SETS PER MUSCLE* on the planner board: live fractional counts
    over the current board state vs the experience-scaled MEV/MRV band;
    out-of-band emphasized in ink (rule 7 — no accent). The R14 fold moved to
    `src/lib/plan/volume-preview.ts` — **client-safe (type-only imports, no
    zod)** so `/plan` holds 121 kB; `previewVolume` (params-backed landmark
    zoning) stays server-side with the MCP tool re-exporting both for its
    existing callers/tests. One counting definition across the board, the
    Balance tab, and `preview_mesocycle_volume`.
  - Deliberately left MCP-only: explicit-position placement, phase editing.
    Seed-a-slot-from-template/copy was assessed and dropped — duplicate +
    place composes to the same outcome.
- Green: typecheck, lint, **754 tests (+1)**, production build (meso page
  +1.4 kB, macro edit +0.9 kB, `/plan` +0.6 kB route JS; `/log` 127 kB
  unchanged).

## 2026-07-03 — R21 coverage (golden v18 · integration · e2e) + N1 per-route skeletons + I12 in-app slices

The next items in the recorded order (PR #134): **R21** — the last full-weight
review item — all three bullets; the **N1 Phase-A escalation** (per-route
skeletons); an **I12 scoping pass + first two in-app slices**.

- **R21 — the coverage gaps are closed.**
  - *Golden meso under the live params* (`engine/__tests__/golden-meso-live.test.ts`):
    the production **v18** shape (helpers' `V18_PARAMS` ≡ the active hosted row)
    simulated over a full 5-week + deload block with a lifter whose logged sets
    feed `recencyWeightedE1rm` week to week. Pins: anchor seed (95 lb off a
    hand-derivable e1RM-132 session_best anchor), the performed-reps climb down
    the ramp **bounded to the gain window's 12**, the **anchor-based RIR-6
    deload** (not legacy 55%-of-peak), and a `bodyweight_loadable` scenario
    (effective-load pricing, added-weight prescription, deload to added 0).
    Every expected row hand-verified before pinning; inline table, no snapshots.
  - *Write-pipeline integration suite* (`tests/integration/write-pipeline.test.ts`,
    `vitest.integration.config.ts`, `npm run test:integration`, riding the CI
    rls-tests job after the policy suite): the real query layer against the real
    schema/RLS/RPCs — createMesocycle → `save_meso_plan` RPC → `startMeso`
    (activation, microcycle/workout seeding, deferred no-history seed with
    fingerprint + params stamps, `kind:"seed"` decisions, and the R15
    second-activation refusal) → `logSet` (embedded-chain stamps, `in_progress`
    flip, R3 upsert convergence on retry) → feedback-then-complete (the RLS
    completion-lock ordering) → `advanceWeekAfterWorkout` (week-2 generation
    prescribed off the logged work, `kind:"advance"` decisions, idempotency,
    microcycle rollover + week-2 activation).
  - *Playwright e2e smoke* (`tests/e2e/smoke.spec.ts`, `playwright.config.ts`,
    new CI `e2e` job): `npm run test:e2e` is real (the doc-02 "Playwright smoke"
    claim is finally true). Mobile-viewport Chromium; fixture seeded through the
    public API; the test signs in through the UI, taps START MESOCYCLE, logs
    both sets (typing a starting weight into the deferred seed), completes the
    auto-prompted feedback sheet, completes the workout, and asserts it lands on
    the engine-generated **W2·D1**. Traces upload on failure.
  - *Sandbox note:* no Docker here, so both stack-backed suites were verified
    through the PR's CI (first run caught a real fixture bug: `weeks: 2` under
    the 3–8 schema check).
- **N1 (WS-J Phase A) — per-route loading skeletons.** Root cause of the 1-2s
  dead nav gaps written up in `J-performance.md`: a `loading.tsx` boundary
  belongs to its segment, and sibling navigations under `(app)` never re-suspend
  the group-level boundary — which is why `/workout` + `/log/[workoutId]` (own
  files) were the only pages acknowledging taps. Nine routes now carry
  layout-mirroring skeletons (`/cycles`, macro, meso — also covers `/stats` —
  planner board, planned day, exercises list + detail, templates, more) in the
  `DayViewSkeleton` grammar; `<Link>` prefetch pulls the shells ahead of the
  RSC data so they paint on tap. Owner to confirm on device.
- **I12 — scoped + first slices.** Full in-app-vs-MCP gap table in
  `scoping.md` § I12 (the query helpers all exist; the delta is pure UI).
  Shipped: **Duplicate mesocycle** in the meso header ⋮ menu
  (`duplicateMesoAction` → `duplicateMesocycle`; settings + board, no loads;
  lands on the copy; `?error=duplicate` line) and the **proactive activation
  gate** — `StartMesoForm` disables START and states the reason up front (live
  block elsewhere / unfinished earlier siblings, computed with the same pure
  `mesoActivationBlock` the server enforces; server re-checks on submit).
  **Rule-8 deviation:** no mockup figure exists for either control; both reuse
  the established menu-row/disabled-button grammar — recorded in 09 (2026-07-03
  session 3). Remaining I12 pieces (attach-into-macro, header edit, slot
  reorder, plan-time volume preview) need design input first.
- Verified: typecheck, lint, **753 unit tests (+2)**, production build (route
  sizes unchanged; `/log` holds 127 kB; the new loading files add no client JS
  of note). The stack-backed suites verify in this PR's CI (`rls-tests` +
  `e2e` jobs — the merge gate).

## 2026-07-03 — N12 + N9 + N10 + N6: set-log latency/hang, Performance-tab reorg, pull-to-refresh

The next slots in the recorded attack order: **N12** (the daily-loop pain, as
the opening WS-J slice), **N9+N10** together, and **N6** riding along. All from
the Batch 5 intake (`docs/notes/backlog.md`).

- **N12 — set logging is fast and the spinner can never hang.** Two halves:
  - *Latency.* `logSet`'s stamp chain (WE → workout → micro → meso, **4 serial
    round-trips in front of every set write**) collapses into ONE embedded
    PostgREST select (FK chain verified unambiguous; embed shape smoke-tested
    against the live REST endpoint — the hand-authored DB types carry no
    relationship metadata, so the result is typed via an explicit cast). The
    `in_progress` flip is skipped once past `planned` (the status rides on the
    same read; the `.eq status` guard keeps a concurrent first-set race
    idempotent). And the **reconcile gate no longer busts on the first set of
    a session**: the gate's completed-work watermark read every workout's
    `updated_at`, so the log's own planned→in_progress flip invalidated the
    signature and that log paid the full ~8-10-round-trip reconcile. The
    watermark timestamp now reads **closed (completed/skipped) workouts only**
    — the only status that feeds a prescription (N3) — while the row count
    still spans all rows (generation/plan edits stay caught). Conservatism
    test extended (`reconcile-gate.test.ts`, +1: the flip must NOT bust).
    Note: the signature's key set changed, so every meso pays one full
    reconcile on its first open after deploy, then the gate re-engages.
  - *Hang.* The LOG box spinner was the row's `useTransition` pending flag,
    which resolves only when the **revalidated RSC tree commits** — a stalled
    revalidation fetch (or the app backgrounded mid-flight) pinned it forever
    even though the write had landed (the reported symptom: navigate away and
    back, and the set shows logged). The spinner now tracks the **server
    action itself** bounded by a 15s watchdog, and the box acknowledges
    checked/unchecked the moment the write confirms (`ack` state; taps are
    ignored in the echo window; the revalidation echo remounts the row via its
    `logged.id` key). A timeout surfaces as the shake + a "safe to try again"
    toast — the R3 upsert makes the retry converge instead of duplicate.
  - *Deferred (assessed, not built):* J-Phase-2 #5 (`revalidatePath` → tags)
    still needs the #7 tagging/caching infra to pay off; #6 (narrow the
    `getWorkoutDetail` `select("*")`s) was measured against the consumed
    columns — `LoggedSetRow`/`WorkoutExerciseRow` are consumed nearly whole by
    the day view, so narrowing buys bytes, not round trips. Recorded in
    `J-performance.md`.
- **N9 — macro Performance tab: muscle-group gain is the primary stat, with
  per-group exercise drill-down.** `rollupMuscleProgress` already iterated the
  per-exercise attribution and discarded it; it now carries
  `contributors[]` (role + score per exercise, best first — an exercise linked
  to several groups appears under each, fractional credit as designed). New
  `MuscleStrengthSection` (client): full-width group rows, ▸/▾ disclosure to
  the contributing exercises (first→last e1RM, sessions, `SECONDARY` marker).
  The flat "ALL EXERCISES" list is **dropped at macro scope** (too many across
  a macro — the owner's call); the meso tab keeps `StrengthProgressSection`
  unchanged. MCP summaries unaffected (they project explicit fields).
- **N10 — meso Performance tab trim.** "TOP SET BY WEEK — KEY LIFTS" and
  "ACROSS MACRO — {lift} EST. 1RM" removed (macro-scope content on a meso
  view): `buildKeyLifts`, the top-set fold, the chart query block and the
  `KeyLift`/`MacroChartBar` types are deleted (~230 lines net). The
  `contextLine`'s `MESO n OF m` position — previously a side effect of the
  chart build via `keyLifts[0]` — is re-derived from the macro's meso ordering
  (and now shows even when no key lift existed). Tab is now: est-strength
  trend + PRS THIS MESO. 09 delta recorded (2026-07-03 session 2).
- **N6 — pull-to-refresh across the app shell.** The installed standalone PWA
  has no native PTR. New `PullToRefresh` client wrapper around the `(app)`
  layout's children (the document is the scroll container; no cycles
  sub-layout — one wrapper covers the day view and all of `/cycles/**`):
  gesture arms only at `scrollY === 0`, resisted pull, release past 70px runs
  `router.refresh()` in a transition with the travelling-gap square as the
  indicator. `overscroll-behavior-y: contain` suppresses Android Chrome's
  native PTR so the gesture can't double-fire.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (751 — +1 gate test, −2
retired `buildKeyLifts` tests), production build with CI env (`/log` +
`/workout` hold at 127 kB first-load; no bundle regression) all green. The
`logSet` embed shape returned HTTP 200 against the live PostgREST endpoint
(anonymous — a bad relationship would 400 regardless of rows). No local stack
in this sandbox: the N12 on-device feel (set-log round-trip + no hung spinner)
and the N6 gesture are flagged for the owner's spot-check.

## 2026-07-03 — N5 + N11 + N7 + N8: Batch-5 quick fixes (day view, scroll lock, meso badges)

The four scoped one-file items from the Batch 5 intake
(`docs/notes/backlog.md`), shipped together per the recorded attack order.

- **N5 — replace-exercise no longer leaves the old exercise's numbers on set 1.**
  PH38's symptom back via a different mechanism: the server side was correct
  (PR #84's `set_weights` clear intact, new prescription seeded synchronously) —
  the stale value was retained client `useState` on the editable "next" row.
  Neither the card key (`we.id`, stable through a replace) nor the row key
  carried the exercise identity, and the planned-input re-sync effect's deps
  (`plannedWeight`, `bodyweight`) don't change across a swap, so nothing
  remounted or re-synced. Fix: the `SetRow` key now includes `we.exercise_id`,
  so a replace remounts the rows and set 1 re-initializes from the new
  prescription (sets 2+ were always prop-derived, hence first-set-only).
- **N11 — deload sets no longer read ▼ at exactly-prescribed performance.**
  The P19 over/under marker was RIR-asymmetric: the prescription side baked in
  the week's target RIR while an unreported logged RIR (the quick LOG path
  always writes `null`) defaulted to 0 effective-rep credit — so identical
  weight+reps read as a big miss, worst on deloads (target RIR ≈ 6, the ramp's
  max; working weeks carried a smaller version of the same skew). The rule now
  compares both sides at the SAME RIR when unreported (`rir_reported ??
  targetRir`), and is extracted to pure
  `day-rules.ts::loggedSetMarker` (previously an untestable inline memo) with
  6 new unit tests incl. the deload regression.
- **N7 — sheets/menus restore the exact scroll position.** The shared
  `useScrollLock` only set body `overflow:hidden`, which does not pin the
  scroll offset on an installed iOS PWA — the soft keyboard shifted the
  document and nothing put it back, so dismissing the note sheet landed the
  page lower than where the user started. The lock now captures `scrollY` and
  applies `position:fixed; top:-scrollY; width:100%`, and the release restores
  the styles and `scrollTo`s the saved offset. One file; covers every
  sheet/menu (all consumers ride the same hook). Scrollbar-padding
  compensation and the stacked-overlay ref count unchanged.
- **N8 — planned-meso badges + future-meso muting** (owner decision, Batch 5 +
  same-day addendum; dated delta in 09 2026-07-03): `/cycles` `StatusMark`
  planned → "PLANNED" text badge in CURRENT's geometry in ink (the checkbox
  vocabulary is reserved for completion), macro timeline planned rows swap the
  right-side progress bar for the same badge (numbered marks stay), and both
  surfaces mute everything that isn't current/completed (names ink/50,
  sublines ink/45; unplanned rows keep `+ PLAN` and their existing muting).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (752, +6), production
build (`/log` first-load 127 kB — `day-rules.ts` imports the zod-free
`engine/predict` core only, so the WS-J bundle split holds) all green. No
local stack in this sandbox: N5 (replace flow) and N7 (installed-iOS-PWA
keyboard behavior) are flagged for the owner's on-device spot-check.

## 2026-07-03 — R25: MCP polish (3 of 4)

The MCP robustness batch (LOW, workstream K) minus the tool-surface
consolidation, which is a deliberate design pass (not mechanical) and stays
open — the backlog row is narrowed to it (plus full error-contract
convergence, which belongs with it).

- **Audit failure no longer inverts a committed write.** Every write tool runs
  `recordMcpWrite` AFTER its mutation commits; the audit insert throwing meant
  the wrapper returned `isError` for a *successful* write — an agent retries
  and duplicates the draft. `recordMcpWrite` now logs loudly
  (`reportError("mcp:audit")`) and returns; the audit trail never outranks the
  truth of the result. New `mcp/__tests__/audit.test.ts` (happy path + both
  failure shapes resolve without throwing).
- **Resource handlers guarded.** `withErrorHandling` only wrapped
  `registerTool`; the three `registerResource` handlers could throw raw
  Postgrest objects and reintroduce the opaque `[object Object]` the wrapper
  was built to kill. New `guardResource` reports the failure and rethrows a
  clean structured message (resources have no `isError` result shape).
- **`MCP_JWT_AUDIENCE` has a runbook home.** The audience binding is opt-in
  (auth.ts), but `manual-operations.md` never mentioned it — until set, ANY
  project-issued user JWT is a valid `/api/mcp` bearer. Added the Vercel step
  (decode the connector token's `aud` → set the var → redeploy → re-run the
  connector test), with the fallback note if `aud` proves generic.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (746, +3) green.

## 2026-07-03 — R24: engine guardrails (4 of 5)

The engine guardrail batch (LOW, workstream G) minus the hold-week
reprice-down bullet, which the owner explicitly parked ("no fix decided yet",
2026-07-02) — the backlog row is narrowed to that remaining investigation.

- **Cross-field param invariants** (`engineParamsSchema.superRefine`):
  per-goal rep_window must satisfy `min ≤ target_low ≤ target_high ≤ max`,
  and `min_sets ≤ max_sets_per_exercise`. Doc 04 requires the schema gate to
  make a bad row unactivatable; shape checks alone let an inverted window
  (degenerate Option-A clamp) through `propose/activate_engine_params`.
  **Replay safety verified first:** a SQL invariant sweep over every hosted
  `engine_params` row (v1–v18) found zero violations, so historical rows keep
  parsing/replaying byte-identically.
- **`brzycki_max_eff_reps` capped ≤ 10.** Above ~10 effective reps Brzycki >
  Epley, so a tuned cutoff > 10 put a DOWNWARD jump in `k(effReps)` at the
  switch — breaking the monotonicity the rep-prediction bisection and the
  closed-form inverse assume (a cutoff of 14 made asking for more reps
  prescribe a HEAVIER load). Every stored row is 10. Property tests pin
  strict monotonicity under the capped cutoff, non-decrease under the legacy
  absent-cutoff rule, and inverse consistency (more reps → strictly lighter).
- **No-anchor hold holds exactly.** The safety-hold branch (T-I3/T-I5:
  never invent numbers) fed the held load through `roundToStep`, so 27.5 lb
  on a 5-lb step prescribed **30** while the rationale read "hold 27.5 lb"
  (negative control: verified the old rounding produces 30). A held load is
  a real, previously-handled weight — it now skips the final rounding.
  Behavior note: stored decisions that rounded a held load will replay as
  `changed` (honest — the stored number was fabricated); open rows heal on
  their next reconcile-triggering input change.
- **Stale retire-flag contract comments fixed** (`params.ts` +
  `seedMeso`'s header): both still said "ABSENT/false ⇒ legacy prior-peak
  back-off seed", but the legacy branch was deleted outright — the flag is
  inert and retained only for historical-row parsing.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (743, +9) green — new
`params-invariants.test.ts` (5 cases incl. accepts-defaults/v17), 3
monotonicity/inverse property tests, the hold-verbatim regression test; the
golden meso trace is unchanged (step-aligned loads are unaffected by the
hold fix).

## 2026-07-03 — R23: repo hygiene batch

The dead-code/config sweep from the review (LOW, workstream L). Migrations
`20260703000002` + `20260703000003` **applied live + verified**.

- **Attack surface first:** the two unused-but-live `"use server"` POST
  endpoints are gone — `reorderGroupExercisesAction` (plus its now-orphaned
  `reorderGroupExercises` query) and `saveProfileDetails` (plus its schema and
  `ProfileFormState`; the per-field `updateProfileField` path is what the UI
  actually uses).
- **Dead exports:** `listMacrocycles` (cycles), `setExerciseStatus` (logging),
  `confidenceRank` + its private rank map (comparability). Engine barrel
  trimmed of 7 over-exports with zero consumers anywhere (`epley`, `brzycki`,
  `loadTypes`, `macroGoalTypes`, `phaseNames`, `macroPlanInputSchema`,
  `macroProfileSchema`) — module-level exports untouched, so internal use and
  relative-import tests are unaffected.
- **Dead components:** `Card`, `MenuCard`/`MenuItem`, `FeedbackScale`,
  `NumberStepper` (which carried the stale-closure hold-to-repeat bug —
  deleted rather than fixed), `RirBadge`, `WeekTrack`.
- **Dead views retired (append-only migrations, both applied live):**
  `v_muscle_group_volume` (`20260703000002`) — never consumed, UTC-Monday
  week boundary, integer counts, no hard-set gate; and `v_meso_week_sets`
  (`20260703000003`) — superseded by the R14 role-grain
  `v_meso_week_muscle_sets`; this resolves root CLAUDE.md's "pending
  retirement with R23" note (line updated). Row types + registry entries
  removed from `database.ts`.
- **Dep/config nits:** `@next/bundle-analyzer` aligned to the next-15 major
  (`^15.5.20`); `tsx` added as a devDep (scripts document `npx tsx`); the
  nonexistent `tests/unit/**` vitest include dropped; `.github/dependabot.yml`
  added (weekly npm minors/patches grouped prod/dev, majors ignored, plus
  github-actions).

### Verified

Scratch-PG16 chain green from zero (62 migrations + seed; both views absent,
`v_meso_week_muscle_sets` intact). `npm run typecheck`, `npm run lint`,
`npm run test` (734) green; production build green;
`npx tsx scripts/macro-engine-matrix.ts` still runs with the pinned devDep.

## 2026-07-03 — R22: environment validated at boot

First of the LOW tail (workstream L — delivery guardrails). The Supabase
client factories read `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` with non-null
assertions; CI builds with placeholders, so a missing or typo'd Vercel var
passed the build and failed opaquely as request-time 500s from inside
`@supabase/ssr`.

- **`src/lib/env.ts` (new).** Zod schema over the public Supabase env
  (hard rule #6 at the config boundary), parsed once per runtime; throws one
  loud error naming EVERY offending var (`missing` / `must be a URL` /
  `must not be empty`). URL trailing slash normalized. All four factories
  (`server`, `client`, `middleware`, `service`) + the MCP auth bridge
  (`mcp/auth.ts`, which had its own duplicate checks) now read through it —
  one definition. `NEXT_PUBLIC_*` stay static member expressions so Next
  still inlines them into client bundles. The service-role key deliberately
  stays out of the schema — hard rule #4 confines it to `service.ts`.
- **Build-time assert (`next.config.ts`).** Fails the build/dev boot when
  either public var is absent, so a Vercel misconfiguration can't ship a
  client that 500s on every request. CI placeholders still pass (the runtime
  schema validates shape, not reachability).

### Verified

6 new unit tests on the pure parse step (valid, placeholder-shape, missing
var named, non-URL named, empty key, both-wrong reports both). Production
build green with CI-style placeholder env; **negative control:** build without
env fails at config load with the named-var error. `npm run typecheck`,
`npm run lint`, `npm run test` (734, +6) green.

## 2026-07-03 — R15: one live block per user

The next item in the repo review's attack order (MED, workstream D). Migration
`20260703000001` **applied live + verified**; advisors show no new lints.

- **The hole.** `startMeso`'s sequential-activation gate only ran when the meso
  had a `macrocycle_id`, and only checked that macro's own siblings — a
  standalone planned meso, or one in a *different* macro, activated while
  another block was live. No DB constraint backed the invariant, and
  `getCurrentState` silently picks the newest-created active meso, so the
  in-flight block vanished from the Workout tab and `get_current_state`. The
  `activate_mesocycle` tool description claimed activation was globally
  sequential, so an agent with `confirm="activate"` would trip this unattended.
- **App gate (user-wide).** `startMeso` now refuses to start while ANY of the
  user's mesos is active — same macro, different macro, or standalone — naming
  the live block in the error. The macro-position sequential gate is unchanged
  behind it. Both the in-app start and MCP `activate_mesocycle` share this
  single choke point.
- **DB guarantee (race-safe).** New partial unique index
  `mesocycles_one_active_per_user on mesocycles (user_id) where
  status='active'` (migration `20260703000001_single_active_meso`) — two
  concurrent activations can't both land; the losing status flip (23505) is
  caught and surfaced as a friendly error. Everything seeded before the flip
  is already retry-safe by design (R3), so finishing the other block and
  re-starting converges. Verified on hosted before shipping: every user has
  at most one active meso, so the index applied cleanly.
- **Tool description** now states the exclusive-activation contract
  ("only ONE active mesocycle — blocked while any block is live") instead of
  overstating the old same-macro guarantee.

### Verified

Scratch-PG16 harness (no Docker in this sandbox): full chain + seed applies
from zero (60 migrations, 26/26 tables RLS-on, 330 stock exercises, index
present); 4-step SQL probe — first activation lands, a second same-user
activation fails 23505 even across macros, another user's activation is
unaffected, completing the live block frees the slot. New RLS-suite test
("single active meso (R15)") runs the same probe in CI. Migration applied
live (hosted index verified, advisors unchanged). `npm run typecheck`,
`npm run lint`, `npm run test` (728) green.

## 2026-07-03 — R11 + R12: reconcile pagination + custom-exercise load-type honesty

The next two items in the repo review's attack order (both MED, workstream G).

- **R11 — reconcile's decision fetch can no longer truncate at the PostgREST
  row cap.** The reconcile fetched **all** decisions for a meso's open rows
  unbounded; decisions accumulate per row per recompute (hosted is at 641 and
  climbing, max 38 per row), so past `max-rows` (1000) the oldest rows silently
  dropped — an open row whose only decision was old was misclassified
  decision-less and **backfilled as a fresh seed off the prior-meso peak**,
  discarding its real in-meso progression. New
  `latestDecisionsByRow(fetchPage, openRowIds)` in
  `src/lib/queries/regeneration.ts`: fixed-size `.range()` pages in a stable
  total order (`created_at desc, id desc` — created_at alone ties within a
  batch insert), first occurrence per row wins (that IS the newest), early
  exit once every open row is resolved. 5 new unit tests incl. the truncation
  regression (a row whose only decision sits beyond page 1 still resolves) and
  the early-exit call-count.
- **R12 — custom bodyweight exercises get honest load-type math; MCP create/
  search boundaries validate (hard rule #6).** `createCustomExercise` never set
  `load_type`, so the column default (`'external'`) stuck forever — wrong
  effective-load/e1RM math for any custom bodyweight movement (`coerceLoadType`
  prefers a valid stored value). Now derives `load_type` via `toEngineLoadType`
  at insert. The create vocabulary (new `src/lib/types/equipment.ts`, shared by
  the app form, its zod action schema, and MCP `create_custom_exercise`) drops
  load-ambiguous bare `"bodyweight"` for the three load-typed labels the stock
  library already uses (`bodyweight only` / `bodyweight loadable` / `machine
  assistance`). MCP `create_custom_exercise.equipment_type` and
  `search_exercises.equipment` are now zod enums (were bare strings cast
  `as EquipmentType` — a bad value surfaced as a raw Postgres check-constraint
  error). Duplicate muscle groups are collapsed via `dedupeMuscleRoles`
  (primary wins) — a dup used to unique-violate AFTER the exercise insert and
  strand an orphan, muscle-less exercise; the link-insert failure path now also
  removes the exercise row instead of stranding it. **No backfill migration:**
  verified live — zero custom exercises and zero bare-`bodyweight` rows exist
  on hosted.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (728, +13) green. No
schema change; engine untouched (`toEngineLoadType` was already the backfill
rule — it's now applied at create time too).

## 2026-07-02 — R9 + R10: analysis-surface honesty fixes

Two small MED items from the review's engine/analysis cluster (workstream G),
both on the MCP admin/coaching surface that exists to keep trend reads honest.

- **R9 — `analyzeComparableProgress` short-phase trend.**
  With ≤ `window` (3) estimable sessions, `recent` covers every point so
  `rolling === best` (the declining branch was unreachable) and `prior` is
  empty (the plateau branch was skipped) — every phase start reported
  `improving`, even a strict decline like `[120, 110, 100]`. Since each goal
  change resets the phase, the first sessions of every phase were structurally
  optimistic. Fix in `src/lib/analysis/comparability.ts`: when there is no
  prior baseline, read the trend within the window — latest vs first,
  tolerance-banded (declining / improving / plateau). Longer phases are
  untouched (same branches as before). A new 4-case trend test in
  `comparability.test.ts` (strict decline, climb, flat, two-point drop); the
  alternating day-slot
  regression (flat series → plateau, never declining) still holds.
- **R10 — `replay_decisions` drops `bodyweight` on seed replays.**
  Stored seed decisions carry the lifter's `bodyweight` in their inputs
  (doc 14 §3 derived input), and `seedMeso` needs it under the live v16
  bodyweight model — but the replay's seed branch didn't pass it, so every
  bodyweight-lift seed replayed as the deferred null-weight prescription and
  diffed as `changed` against ANY candidate params, corrupting the tuning
  loop doc 04 calls primary. One-line fix in `src/lib/mcp/tools/admin.ts`
  (+ rationale comment); regression test in `admin-tools.test.ts` replays a
  v16 bodyweight seed unchanged — **verified failing without the fix** (the
  test also asserts the seed prices a real load, so it can't pass vacuously).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (715, +2) green. No
schema/engine change (both fixes are outside `src/lib/engine/`; stored
decisions replay byte-identically — the fix makes the replay *harness*
faithful, it does not change any engine output).

## 2026-07-02 — R5 + R7: completion-lock hardening + service-worker cache trim

The next two items in the repo review's attack order (both MED, workstream K —
integrity & security hardening). Migration `20260702000006` **applied live +
verified**; advisors show no new lints.

### R5 — the completion lock now covers the whole session surface

`20260702000005` closed the app-side write-integrity holes; this closes the
**RLS-side** ones (docs/reviews/2026-07-01-repo-review.md §R5). Until now the
lock covered only logged_sets/exercise_feedback update+delete: a client could
flip a completed workout back to in_progress (re-opening every locked set),
rewrite `prescribed_*`/`set_weights`/`status` on completed workouts (exactly
what the engine reads as `previous` and what the volume views count), edit the
`workout_feedback` dampener after the engine consumed it, insert new sets into
completed workouts, and — because FK checks bypass RLS — squat a victim's
`exercise_feedback` slot (UNIQUE `workout_exercise_id`) knowing only a uuid.

- **Migration `20260702000006_completion_lock_hardening.sql`** (initplan-
  wrapped quals): workouts update only while planned/in_progress + insert only
  'planned' into an owned microcycle + delete only planned-and-history-free
  (hard rule #5 at the DB layer); workout_exercises insert/update/delete gated
  on an owned open parent (delete also requires an empty slot); logged_sets
  INSERT gated open-parent + slot-must-belong-to-workout; workout_feedback
  bare FOR ALL → full open-parent lock; exercise_feedback INSERT/UPDATE WITH
  CHECK gain the owned-open-parent EXISTS (squat + re-pointing closed; UPDATE
  USING widened to planned|in_progress to match); microcycles no reopening
  completed weeks / insert into owned meso only / delete history-free only.
- **Audit before design:** every authed write path was inventoried
  (queries/actions/MCP, client traced to its creation). The load-bearing
  facts: completion writes (workout_exercises status batch, workout_feedback
  save) land **before** the workout flips — `completeWorkoutAction` even
  documents the expectation; startMeso/regenerateOpenWorkouts touch only
  planned, history-free rows; the week-advance/generation/reconcile paths run
  on the service role (bypass, unaffected); **no app path transitions a
  workout out of completed/skipped**. Nothing legitimate is blocked.
- **Not RLS-expressible transitions** (e.g. in_progress→skipped vs →completed
  matrices) were deliberately not modeled with triggers — the USING gate
  (source must be open) + WITH CHECK (owner) is the whole invariant the app
  relies on.

### R7 — service worker: static assets only, offline interstitial, sign-out purge

`sw.ts` used Serwist's `defaultCache` verbatim, which NetworkFirst-cached
same-origin **documents, RSC payloads, and `/api/` GETs for ~24h**: a dropped
connection silently served day-old prescriptions (the app is online-only —
hard rule #9), and a shared device kept the previous user's rendered pages in
CacheStorage after sign-out.

- **`sw.ts`**: runtime caching now = hashed `/_next/static` (CacheFirst 30d) +
  same-origin static images (SWR 30d — icons, splash) + an explicit
  NetworkOnly catch-all. Verified in the built `public/sw.js`: zero
  `NetworkFirst` handlers, no `pages`/`pages-rsc`/`apis` caches.
- **`/~offline`** (new static route, ledger card, middleware public path,
  precached via `additionalPrecacheEntries`): offline navigations get an
  honest interstitial + RETRY instead of stale content, via Serwist
  `fallbacks` on the document destination.
- **`ClearClientCaches`** (mounted in the `(auth)` layout): every auth-screen
  mount — sign-out lands there, so do expired sessions and a shared device's
  next user — deletes all non-precache CacheStorage caches (kills pages cached
  by previous SW versions) and drops the `lastWorkoutId` session pointer. The
  precache is spared (build assets + the offline fallback only).

### Verified

- Scratch-PG16 chain from zero: green with the new migration (68 policies).
  **29 policy probes** under simulated JWTs: 12 expected 42501 rejections
  (resurrection, fabricated history, foreign-parent inserts, slot squat,
  re-pointing, completed-workout inserts) and every legitimate flow passing —
  completion sequence in app order, planned-day edits, the logSet upsert
  (insert + ON CONFLICT update), pre-flip feedback.
- **9 new RLS suite tests** (`describe("completion-lock hardening (R5)")`) so
  CI enforces the behaviors; existing suite unaffected (its authed writes to
  these tables sit in the unchanged logged_sets update/delete policies).
- **Hosted:** migration applied via MCP; live per-table policy state
  hash-identical to the verified scratch chain (24 policies, same md5); live
  0-row probe — a simulated owner session cannot resurrect their latest
  completed workout but still reads it; security advisors unchanged (only the
  three known, intentional WARNs).
- `npm run typecheck`, `npm run lint`, `npm run test` (713), production build
  green; `/~offline` prerenders static (605 B, 105 kB first load).

## 2026-07-02 — T-R2: hosted perf migration `20260620115322` transcribed into the chain

The last known hosted↔repo drift (found by R2's full end-state diff, filed as
T-R2): the out-of-band hosted migration `20260620115322
perf_rls_initplan_and_fk_indexes` — 56 RLS policies initplan-wrapped
(`auth.uid()`/`auth.role()`/`is_admin()` → scalar subqueries, evaluated once
per query instead of once per row) plus 23 FK covering indexes — existed only
on the hosted project. A clean-DB build (CI `rls-tests`, any future
environment) reproduced the *semantics* but not the *plans*: same policy
decisions, per-row function re-evaluation and unindexed FK scans.

- **`supabase/migrations/20260620115322_perf_rls_initplan_and_fk_indexes.sql`
  (new).** Body transcribed **verbatim** from hosted
  `supabase_migrations.schema_migrations.statements[1]` — fetched base64-encoded
  and decoded, never retyped; md5 `25446aa1f8021cce51116c3cfdbe088d` verified
  identical on both sides (the header documents this; strip it with
  `tail -c +918` to re-verify). Placed at the version hosted recorded, so it
  sorts into its true position: after the 0620 hardening/feature migrations,
  before the 06-22 profiles-recursion fix.
- **Two deliberate time-capsule references** (called out in the file header):
  it wraps `shares_grantee_accept` (dropped later by `20260701000002`, R1) and
  restores the *recursive* `profiles_update_own` WITH CHECK as of 06-20
  (replaced later by `20260622220627`). Replaying them mid-chain is correct —
  it is exactly what hosted lived through, and both are superseded by the same
  later migrations on both sides.
- **No hosted apply, no owner step.** Hosted already has the version row —
  this PR only makes version control tell the truth. No table/column change →
  no type regen; perf-only → no policy gains or loses rows.

### Verified

Scratch-PG16 harness (the R2 approach — no Docker in this sandbox; simulated
Supabase bootstrap: `auth` schema/functions, anon/authenticated/service_role
roles, CLI tracking table, zero default privileges):

- Full chain + `seed.sql` applies from zero with the new file: 26/26 tables
  RLS-on, 330 stock exercises, 56 policies, 105 public indexes.
- **End-state hash parity with hosted:** aggregate md5 over every public
  policy row (table, name, cmd, roles, qual, with_check) and every public
  index definition, computed with the identical query on both databases —
  policies `15f40291…` = hosted, indexes `037f0d6d…` = hosted.
- **Negative control:** the chain re-run *without* the file produces a
  diverging policy hash and exactly 23 fewer indexes (82 vs 105) — the file
  closes precisely the documented drift, nothing else.
- `npm run typecheck`, `npm run lint`, `npm run test` (713) green — SQL-only
  change; CI's `rls-tests` exercises the chain + RLS suite on the PR.

## 2026-07-02 — R20: production error observability — one reportError funnel, error boundaries everywhere, dependency-free Sentry wiring

The review's HIGH observability item (attack order after R3/R4): the failure
modes the app is *designed around* — freshness reconcile returning stored
numbers, week generation deferring to a page-open catch-up, seed-decision
recording skipping rows — all degraded **silently** (`console.error` into a
serverless void), and render errors outside `(app)` hit Next's raw screen.
Now everything degrades *loudly* through one funnel. 07 Phase 7
"Error handling/observability" ticked (DSN setting stays external).

- **`src/lib/observability/`** — the funnel. `reportError(scope, error,
  context)` / `reportEvent(...)`: always emits one structured, greppable
  `console.error` line (Vercel function logs capture these with zero config —
  the floor works before any env var is set), and when **`SENTRY_DSN`** is set
  ships a Sentry **event envelope over plain fetch** (3s timeout, never
  throws/rejects). Deliberately **no Sentry SDK**: the need is server-side
  only, the client bundle is a live WS-J/N1 concern, and the envelope API is
  three JSON lines — `sentry.ts` holds the pure DSN-parse/envelope builders
  (unit-tested wire format), `report.ts` the impure assembly. A malformed or
  missing DSN degrades to console-only.
- **Global server capture** — `src/instrumentation.ts` `onRequestError`
  (Next 15 hook): every unhandled error in server components, actions, route
  handlers, and middleware reports with router kind/route type/path context.
  The deliberate catches report themselves before swallowing (scopes:
  `queries:freshness-reconcile`, `queries:record-seed-decisions`,
  `actions:advance-week:complete|end`, `workout-tab:progression-catch-up`),
  so "stale prescriptions" is now a pageable event, not a mystery.
- **MCP tools** — the composition-root guard (`withErrorHandling`) reports
  `mcp:tool` + tool name server-side before returning the structured
  `toolError` envelope to the model (previously nothing was recorded).
- **Client boundaries** — new root **`global-error.tsx`** (self-contained
  html/body + inline ledger styling — it renders exactly when the root layout
  is gone) and new **`(auth)/error.tsx`** (sign-in/onboarding previously fell
  through to Next's raw screen); `(app)/error.tsx` kept. All three POST
  through `postClientError` → **`/api/client-error`** → the same funnel.
  The route is pre-auth by design (middleware public path — the auth/root
  boundaries must report signed-out), guarded by the same-origin CSRF check +
  a tight zod contract (enum'd boundary, hard length caps, client-side
  truncation to match); junk is a 400, never an event.
- **Verification:** 713 unit tests green (+20: DSN/envelope wire format,
  reporter fetch behavior incl. never-reject + non-2xx + malformed-DSN paths,
  intake schema + boundary-report capping), typecheck, lint, production
  build. **End-to-end against a mock ingest** on the built app: valid report
  → 204 + a correctly-formed envelope (auth query, three-line body, scope
  tag, environment) received; cross-site → 403; junk/oversized → 400; ingest
  down → 204 with the delivery failure itself logged (the reporter can't take
  down the path it reports on).
- External (manual-operations): set `SENTRY_DSN` in Vercel to turn on Sentry
  delivery; until then the structured console floor is live on deploy.

## 2026-07-02 — R3 + R4: write integrity — atomic plan/param writes, race-proof uniques, logged history never cascade-deleted

The review's write-integrity pair (attack order after R17/R16). Four flows
could half-apply, two delete branches could cascade logged history (a hard
rule #5 breach path), and two missing unique keys let retries/races duplicate
data — the live DB already carried 11 duplicated (exercise, set) groups from
logSet retry storms. Migration `20260702000005` **applied live + verified**;
the whole chain + the new RLS tests also verified on a from-scratch local
stack (Docker available in this session — first time the RLS suite ran
pre-push since R2 revived it).

- **R4 — regeneration can no longer delete logged history.**
  `regenerateOpenWorkouts`' two delete branches (planned workout whose day
  left the plan; workout_exercise dropped from the plan) now exclude anything
  carrying a logged set (pure `withoutLoggedHistory` + one `in` query — the
  `removeWorkoutExercise` pattern). The porous-status root cause is closed
  from both ends: `logSet`'s in_progress flip error is **surfaced** (was
  silently discarded — a set-carrying workout could stay `planned`), and
  `completeWorkout`'s per-exercise status updates are batched into two
  error-checked statements (were N fire-and-forget awaits).
- **R3 — the four non-atomic flows:**
  - `saveMesoPlan` → **`save_meso_plan()` DB function** (SECURITY INVOKER,
    one transaction, explicit meso-ownership guard). A failing save now rolls
    back to the pre-save plan — verified by probe (bad day-2 payload leaves
    the day-1 plan intact); an active meso's plan can no longer be wiped.
  - `activateEngineParams` → **`activate_engine_params()`** — deactivate +
    activate in one transaction; a failed activation rolls back the
    deactivation (probe: activating v999 raises, active row unchanged). The
    ZERO-active-params app-wide outage mode is gone.
  - week-N+1 generation → **`insert_generated_day()`** (service-role-only
    EXECUTE): workout + exercises + decisions in one transaction, `on
    conflict do nothing` on the new unique key, and it **adopts + fills an
    empty planned day** — so the "poisoned day" a pre-fix half-apply left is
    healed, not skipped. `planCatchUp`/`advanceWeekAfterWorkout` now treat an
    empty planned counterpart as a gap (`has_exercises` flag; legacy callers
    unchanged). Live DB had 0 poisoned days; none can form now.
  - `startMeso` → **retry-safe** (recorded design deviation from the
    review's suggested single-transaction function: the seed math must stay
    in the pure TS engine — hard rule #3 — so the flow converges by retry
    instead): microcycle ramp upserts on `(mesocycle_id, week_number)`, stale
    extra weeks + ghost week-1 days from an older attempt are pruned (each
    guarded by the logged-history check), fully-seeded days are skipped and
    empty ones adopted. The "permanently unstartable meso" state is gone.
- **Unique keys + retry semantics:** `workouts (microcycle_id, day_number)`
  and `logged_sets (workout_exercise_id, set_number)`. `logSet` is now an
  **upsert** on that key — a retried/double-tapped log converges onto one row
  (newest values win) instead of double-counting volume/PRs.
  `regenerateOpenWorkouts`' new-day insert uses `ignoreDuplicates` (a
  concurrent generation owns the day; skip). **Recorded deviation from hard
  rule #5:** the migration deletes 15 live duplicate rows (26 → 11 in the
  duplicated groups, 10,811 → 10,796 total) — machine-cadence retry
  artifacts (identical values 0.6–2s apart, e.g. six "sets" in 3.7s), kept
  newest per group; they were inflating volume, not recording history.
- **MCP validation before destruction (the reachable trigger, PR #92
  surface):** `create_mesocycle`'s hand-built days path now rejects duplicate
  day_numbers and two names resolving to one muscle group per day (pure
  `validateMesoDayPlan`), checks exercise existence up front (shared
  `findUnknownExerciseIds`, same message as `edit_mesocycle`), and bounds
  exercises (≤10/group) + groups (≤20/day) in zod; a failed plan save deletes
  the just-created empty draft instead of stranding an orphan for the model
  to multiply. `edit_mesocycle add_day` rejects a same-group-twice day inside
  the pure `applyMesoEdits` transform.
- **Verification:** unit suite **693 green (+15)** (new
  `write-integrity.test.ts`, `planCatchUp` poisoned-day cases, `add_day`
  dup-group case), typecheck, lint, production build. **RLS suite 35 green
  (+6)** on a from-scratch local stack (new: `save_meso_plan` owner-only +
  cross-user refusal leaves the plan intact; `activate_engine_params`
  non-admin refusal keeps exactly one active row; `insert_generated_day` not
  callable by authenticated; both unique keys raise 23505). Live probes:
  ownership guard raises for a no-session caller; failed activation leaves
  v18 active; adopt path fills a poisoned day then no-ops on repeat.

## 2026-07-02 — I14: one 0–10 scale for every feedback slider (engine_params v18, ACTIVATED)

The complete-workout session sliders (overall fatigue / effort / performance)
were 0–4 while the per-exercise sliders (pump / workload / soreness) were
0–10. Owner ruling (2026-07-02): "Unify it absolutely. Rescale the data
appropriately to match the new scale." Own PR per the build order — it
carries a data migration.

- **Migration `20260702000004` (applied live + verified).** Three coupled
  moves in ONE transaction: (1) stored `workout_feedback` values rescaled
  `round(x × 2.5)` — 0→0, 1→3, 2→5, 3→8, 4→10 — with the three CHECKs
  widened to 0..10 (verified live: all 28 rows map exactly, counts
  identical); (2) **engine_params v18** = v17 with the session-dampen
  thresholds on the same scale (`session_fatigue_dampen_threshold` 3→8,
  `session_performance_dampen_threshold` 1→3) — the same trip points on the
  rescaled data, so engine behavior is unchanged for equivalent inputs;
  (3) **v18 ACTIVATED in the migration** — a recorded deviation from the
  v11–v17 ship-inactive discipline, because the rescale and the threshold
  flip are inseparable (rescaled data under v17's thresholds would dampen
  every mid-scale session; unrescaled data under v18's would never dampen).
- **Replay unaffected**: historical decisions re-run their own stored 0–4
  inputs against their own stored params row; the widened `.max(10)` bounds
  (params + engine input schema) keep old rows/inputs valid. **Caveat
  (documented):** diffing old decisions *against v18* mixes scales (0–4
  stored inputs vs 0–10 thresholds) and shows spurious dampen diffs — same
  class of artifact as the known R10 bodyweight replay gap; future decisions
  read the rescaled table and are consistent.
- **UI/validation:** `CompleteSheet` sliders drop `max={4}` (inherit the 0–10
  default), defaults 2→5 (the new midpoint); `completeSchema` + engine
  `workoutFeedbackInputSchema` widened to 0–10; MCP `FEEDBACK_SCALES` legend
  updated (also fixed the stale `soreness: "0–3"` entry — storage/UI have
  been 0–10 since 06-16).
- **Tests (hard rule #3): 660 green (+5).** New `session-scale.test.ts`: an
  exhaustive equivalence property (every old 0–4 rating pair classifies
  identically after `round(x × 2.5)` under v18) + the §S5 dampener semantics
  restated on the new scale (fatigued-but-strong reprices up; both-signals
  holds; the 5/5/5 sheet default never dampens). `V18_PARAMS` in the engine
  test helpers; v18 provenance hash guarded in `params-provenance.test.ts`;
  bounds property generators widened to 0–10. DEFAULT (v10) untouched — its
  pinned hash stands.

## 2026-07-02 — WS-C consumers: meso page rework (P16), macro stats tabs (M8), strength trends (I11/PH37) + P17/N4 nav + R6 local-day dates

The consumer half of the Session-31 foundation: every screen the Batch-4
decisions redesigned, on the R14/T-A1/T-A2 metric definitions. Design deltas
recorded as a dated entry in `09-design-changelog.md` (2026-07-02 session 6).
The R6 migration is **applied to live** and probe-verified.

- **I11 — per-exercise est-strength %-change.** `stats.ts` progress scores now
  count their trend points (`sessions` = non-deload sessions with an e1RM) and
  generalize to any meso set (`getProgressScores`); the display rule is the
  owner's **≥3 sessions** (`MIN_PROGRESS_SESSIONS` + `qualifyingScores` —
  excludes subbed-in/inconsistent lifts). Values are the stored engine e1RM
  (undecayed, T-A1), first → last non-deload session (T-A2). Rendered as
  **EST. STRENGTH — ALL EXERCISES** on the meso + macro Performance tabs
  (`components/stats/StrengthProgress.tsx`), with first→last e1RM + session
  count as the sub-label and an honesty footnote (e1RM is an estimate).
  **Live check:** the rule bites — e.g. 18 of 24 exercises qualify in one
  active meso (6 subbed-in excluded), 15 of 17 in another.
- **PH37 — strength by muscle group (meso + macro scopes; all-time dropped
  per owner).** Pure `rollupMuscleProgress`: each qualifying exercise credits
  every linked muscle, weighted by role through the SAME
  `engine_params.volume.direct/indirect` weights the volume counting uses
  (doc 10 §2 — one weighting definition). Rendered under the exercise list on
  both Performance tabs; exposed on MCP `get_mesocycle_summary` +
  `get_macrocycle_summary` as `muscle_group_progress` (+ `sessions` on
  `progress_scores`, macro summary gains macro-scope `progress_scores`) so
  the connector reports the app's numbers.
- **M8 — macro stats unification.** The macro page gains the same
  **OVERVIEW | BALANCE | PERFORMANCE** toggle (owner OK'd building without a
  mockup — **rule-8 deviation**; modeled on the meso stats views + SegmentedTabs
  grammar). BALANCE reuses the 4.1 BalanceView at macro scope: new
  `getMacroStats` concatenates materialized weeks across the macro's mesos
  onto a global week axis (`weightWeekMuscleSets` gained an optional `weekOf`
  remap) and runs the SAME `buildVolumeMatrix`/`buildBalance` folds — no
  cross-meso projection (unbuilt future weeks excluded, footnoted honest).
  The meso side of M8 ships through P16 (below). Meso est-strength under
  Performance confirmed present.
- **P16 — meso page rework (large).** `cycles/meso/[mesoId]` is now a
  **day-view-style sticky header + OVERVIEW | BALANCE | PERFORMANCE toggle**:
  - **Header** (`MesoHeader.tsx`): back link + macro-context caps; title;
    meta line + status badge; the day-view **orange progress bar** showing
    completed workouts over the whole planned week×day grid. Header actions:
    **calendar** (drops down the old page-body RIR/week×day matrix — same
    cell states, days link to `/log/[id]` or the read-only planned route),
    **share** (sheet wrapping the existing ShareRow), and the **⋮ menu**
    (Edit plan/weeks — still locked once history exists, trailing LOCKED;
    Save as template — in-menu pending state, still lands `?error=template`
    on failure; Delete — the old confirm sheet with the logged-history
    acknowledgement, `DeleteMesoButton.tsx` folded in and deleted).
  - **OVERVIEW** = read-only planner board (`MesoPlanView.tsx`): day tabs +
    the flat ordered exercise list (badge · group · equipment · start sets),
    open slots as dashed rows; GO TO W·D / START MESOCYCLE stays on top.
    `getMesoPlan` fills now carry `exercise_equipment` for the sub-labels.
  - **BALANCE / PERFORMANCE** = the meso stats views; the standalone
    `/cycles/meso/[id]/stats` screen is now a **redirect** into the toggle
    (day-view ⋮ menu + Workout-tab resting link repointed). `BalanceView`
    takes the balance block directly so macro can reuse it.
  - **Rule-8 deviation recorded:** no mockup exists for the reworked
    header/menu/read-only board (owner-approved); anchors are the day-view
    header, planner board, and meso stats figures. **Tab naming:** owner said
    "volume" (P16) and "balance" (M8) for the same view — reconciled to
    **BALANCE** on both surfaces (09 2026-06-14 §4 had already retired the
    "Volume" tab name; unification is M8's point). Recorded in 09.
  - `AnchoredMenu`/`MenuRow` extracted from `DayView.tsx` to
    `components/ui/AnchoredMenu.tsx` (shared by the day view + meso header).
- **P17 — day-view back button removed** (owner option 2: the day navigator
  lives inside the Workout tab; selecting a day isn't a page change).
- **N4 — deep-link return-to-origin.** "View exercise" from the day view
  carries `?from=/log/<id>`; the exercise page's back control validates the
  same-app path and returns `‹ WORKOUT` to the originating day view instead
  of the exercises list. Client-state tabs preserve the param.
- **R6 — client-local workout dates + one date-display definition.**
  Migration `20260702000003` (**applied live**): new
  `logged_sets.performed_on date` — the client's calendar day, sent by the
  day view at log time (`localDayIso()` → `logSetAction.performed_on`,
  zod-validated) — and `v_exercise_history` re-bucketed on it, so evening
  sessions stop landing on tomorrow's UTC date in history/PRs/session
  grouping. Pre-R6 rows backfill to their old UTC bucket (true local day is
  unrecoverable; **verified live: 10,821/10,821 rows backfilled, 0 diverging**
  — history reads unchanged until new sets arrive). Amends keep the original
  day. The **6 divergent `shortDate` copies** collapse into `lib/dates.ts`
  (`dateAtLocalNoon`: date-only → local-noon anchor, timestamps → real
  instant in local time): DayView, ExerciseHistoryList, PrescriptionDetailSheet
  (was raw-parse, drift-prone), ExercisesBrowser (was raw-parse `MM/DD/YY` —
  now the ledger `15 JUN '26` format, a deliberate display change),
  ProfileEditor, PlannerBoard. No policy change needed (column add on an
  RLS-enabled table; owner-scoped row policies cover it).
- Green: **655 tests (+11: progress fold/qualifying/rollup, balance scope
  wording, weekOf remap, dates)**, typecheck, lint, production build (`/log`
  unchanged at 126 kB; meso page 6.75 kB route). Engine untouched (the new
  folds are query-layer; weights read the existing params keys).

## 2026-07-02 — metric-definition foundation: fractional volume counting (R14), engine e1RM everywhere (T-A1), deloads out of progress scoring (T-A2) + P18/PH33 quick wins

The Batch-4 owner decisions unblocked the metric-definition work that the
whole WS-C stats/meso rework (I11 / PH37 / M8 / P16) consumes — this ships
that foundation first, per the Session-30 build order. Both migrations
**applied to live** and verified against real data.

- **R14 — fractional 1.0/0.5 volume counting + the RIR≤4 hard-set rule
  (doc 10 §2, previously unimplemented).** New role-grain view
  `v_meso_week_muscle_sets` (migration `20260702000001`) exposes weekly
  planned/logged/**hard**-logged set facts per (meso, week, muscle group,
  **role**), crediting every muscle an exercise links via
  `exercise_muscle_groups` (slot-group fallback for unlinked exercises). The
  1.0/0.5 weights are applied in ONE shared pure fold —
  `engine/volume.ts::fractionalSetCount` + `volumeCountingWeights`, reading
  the new optional `engine_params.volume.direct/indirect` keys (v11+
  `.optional()` discipline: absent ⇒ 1.0/0.5, every stored row stays
  byte-replayable) — consumed by the stats volume matrix + Balance
  (`weightWeekMuscleSets`), the MCP volume/balance tools, the set projection
  (PH34; deload scaling now keeps 1 dp), the planner baseline, the
  `preview_mesocycle_volume` tool, and the **engine's weekly-set ceiling
  input** (`weeklySetsByGroup` in progression/regeneration/standalone paths;
  `EngineInputs.muscleGroupWeeklySets` loosened from `.int()` to fractional —
  a derived input, excluded from freshness fingerprints, so no staleness
  cascade). Balance/matrix cells now show halves (e.g. `7.5`).
  **Verified live:** primary-role counts exactly reproduce the old view's
  totals (43 = 43 on the active meso W1); secondary rows add the
  previously-invisible compound credit; zero all-time sets exceed RIR 4, so
  the hard-set gate changes nothing retroactively.
  **Spec deviation (recorded):** doc 10 §8's `volume.counting_max_rir` /
  `volume.warmups_count` are NOT live engine params — SQL can't read
  versioned params, so both are baked into the view at their doc defaults
  (rir ≤ 4 or unreported; warm-ups never count) and documented on the params
  schema; a param the engine can't honor would silently diverge from the
  numbers actually served. Changing them = a view migration. The old
  `v_meso_week_sets` + dead `v_muscle_group_volume` stay for the
  apply→deploy window; retirement folded into R23.
- **T-A1 — one e1RM system (owner: engine formula everywhere, undecayed for
  stats, decay is prescription-only).** Migration `20260702000002`:
  `v_exercise_overview.best_e1rm` + `v_meso_summary.best_e1rm` now read
  `max(logged_sets.e1rm)` (the stored per-set engine estimate, PH31) instead
  of recomputing raw Epley; `v_exercise_history` gains `best_set_e1rm`
  (session-best per-set engine e1RM) so PR logic compares set-grain engine
  numbers — the meso-stats REP-PR check now uses it instead of the session
  *average* (which understated the prior bar). `getMesoStats`' two inline
  raw-Epley computations read the stored `e1rm`; dead `epleyE1rm` deleted
  from the engine. Raw single-formula Epley now survives nowhere.
  **Verified live:** 219 overview rows, none lost e1RM; engine values average
  ~1.10× raw Epley (effective-reps credit — expected); `best_set_e1rm ≥
  e1rm` on all 4,454 session rows. **Confirmed the 30-day recency half-life
  is MCP-tunable** (`e1rm.recency_halflife_days: 30` present in the active
  v17 params row; `propose_engine_params` edits it) — decay itself untouched,
  still prescription-only (answers PH39).
- **T-A2 — deloads excluded from strength-progress scoring.**
  `getMesoProgressScores` skips sessions in deload microcycles (a
  deliberately light week is recovery, not regression); volume + PR stats
  keep deload work. Denoted in the MCP metric definitions/notes
  (get_mesocycle_summary, get_training_overview).
- **P18 — set-type menu affordance hidden** (owner: drop-set UX never worked
  out). The data model (`set_type`, the DROP marker on logged sets) stays
  dormant for a future drop-set feature.
- **PH33 — admin tools hidden from `tools/list` for non-admins.** New
  `mcp/visibility.ts` wraps the SDK's stock tools/list handler with a
  `profiles.role` filter (visibility only — `resolveAdmin` call-time denial
  remains the boundary; if a future SDK upgrade breaks the capture, it fails
  open to visible-but-denied). Exercised against real SDK internals in
  `visibility.test.ts`.
- **P21 — verified, no change needed:** a "0 days sore" report already
  stores explicit `0` (the picker uses `=== null` gating, so 0 is a real
  recorded value through `saveFeedback` → `exercise_feedback.soreness_days`).
- Green: **644 tests (+15 new: fractional fold, counting weights, role-based
  weekly sets, PH33 visibility)**, typecheck, lint, production build (`/log`
  unchanged at 126 kB).

## 2026-07-02 — R13 + R18 + R19: set-row typing safe from background writes; modal a11y + tap targets; styled 404

Three UI/UX items from the 2026-07-01 review
([R13/R18/R19](reviews/2026-07-01-repo-review.md)) — the day-view logging loop
and its overlays. No engine, schema, or query change.

- **A set row never overwrites typing with a background write (R13).** The
  SetRow re-sync effect reset both cells whenever `set_weights` /
  `bodyweight` changed — so the revalidation from a blur-persisted weight (or
  an auto-match fan-out from logging another set) landed 0.5–2s later and
  silently replaced reps the user was mid-typing; tap LOG without noticing and
  wrong reps got logged. The effect is split: the row's **own logged-set**
  changes (log/unlog/amend echo) always adopt server state; **planned-input**
  changes adopt only while the row has no uncommitted typing (`edited` ref).
  The rule is pure (`day-rules.ts` `adoptServerRowState`) and unit-tested.
  Known tradeoff: a row you've typed in keeps your values over a later
  auto-match/reset-to-prescription fan-out — explicit input wins; what you see
  is what logs.
- **Modal surfaces got the keyboard/focus contract (R18).** New shared
  `useModalA11y` (`components/ui/useModalA11y.ts`): focus moves into the panel
  on open and back to the opener on close, Tab cycles inside, Escape closes
  (top-most overlay only, via a module stack). Wired into `BottomSheet` (all
  ~18 sheets), the bespoke `CompleteSheet` (which also gained its missing
  `role="dialog"`/`aria-modal`), and `AnchoredMenu` — whose rows are now real
  `role="menuitem"`s with ↑/↓/Home/End navigation.
- **Tap targets raised to the WCAG 2.2 floor without visual change (R18).**
  The LOG checkbox (the most-tapped control in the app) was a 21px target: the
  button now fills its 44×32 cell, the 21px box stays the visual. Per-set ⋮
  ~10px → 24×32 (overflows its 20px column into the gaps). Planner ▲▼
  20×14 → 24×24 each, absorbed into row padding via negative margins
  (**rule-8 note:** the arrow glyphs sit ~5px further apart vertically —
  the only visible delta, required to meet the 24px floor).
- **Pinch-zoom cap kept (R18 bullet ruled against, owner 2026-07-02).** The
  review flagged `maximumScale: 1` as WCAG 1.4.4 harm and this PR briefly
  dropped it, but the owner ruled to keep the cap: the app is an installed
  PWA and pinch-zoom breaks the native feel. Reverted in the same PR; the
  ruling is recorded on the viewport config so it isn't re-"fixed".
- **404s land on a ledger card inside the app shell (R19).** New
  `(app)/not-found.tsx` (**rule-8 note:** no mockup exists for a 404 card;
  styled after the `(app)/error.tsx` precedent) — previously 10+ `notFound()`
  sites dead-ended on Next's unstyled default with no tab bar. Landing there
  also clears the session `lastWorkoutId` pointer, closing the loop where the
  Workout tab itself 404'd on every tap after the pointed-at meso was deleted.
- **CompleteSheet totals agree with the header progress bar (R19).** The
  set-progress math (`plannedSetCount`/`exerciseDone` + the skipped-slot-
  excluded totals) moved to pure `day-rules.ts::daySetTotals`, shared by both
  surfaces and unit-tested — the sheet could previously read "2 / 4" under a
  header reading 100% because it ignored skipped set slots.
- Green: 629 tests (+15), typecheck, lint, production build (`/log` first-load
  126 kB, +1 kB for the a11y hook).

## 2026-07-01 — R17 + R16: sheet writes fail soft; planner staged edits survive failure & navigation

The two field-usability failure modes from the 2026-07-01 review
([R17/R16](reviews/2026-07-01-repo-review.md#3--client-resilience--ux)): a
rejected server action inside any sheet's save threw out of the transition to
the `(app)` error boundary, unmounting the page and destroying the typed input
it then claimed was safe ("Nothing was lost"); and one failed save or stray
navigation discarded a whole PlannerBoard staged editing session. No engine,
schema, or query change — client resilience only.

- **Day-view writes can no longer reach the error boundary (R17).**
  - The shared `commit` helper (all ~14 fire-and-forget menu ops: move/add
    set/skip/delete/reset/unskip/remove/replace…) now catches and toasts
    ("That change didn't save — check your connection"). On failure the server
    never changed and no revalidation ran, so the untouched view *is* the
    rollback.
  - **NoteSheet / FeedbackSheet close only after their write lands** (own
    transition, SAVING… label): a failure keeps the sheet open with the typed
    note / slider values intact and toasts. `commit` prop dropped.
  - **CompleteSheet** `finish()` catches: notes + the three session sliders
    survive a failed complete; navigation happens only on success. Same for
    **END WORKOUT / END MESOCYCLE** (confirm sheet stays open on failure) and
    AddExerciseSheet's ADD (selection kept).
  - **Logged-set amends route through `runLog`** (box spinner + shake + toast,
    like logging writes); `edited` stays set on failure so the next blur
    retries.
  - **Fetch-on-open sheets can no longer wedge on "Loading…"**: HistorySheet,
    ReplaceSheet, and AddExerciseSheet get the PrescriptionDetailSheet
    catch + stale-response guard and a shared `FetchRetry` state (new
    `components/ui/FetchRetry.tsx`) with a RETRY button.
  - **SAVE AS TEMPLATE failure is no longer silent**: the meso detail page now
    reads the `?error=template` param the action has always redirected to and
    renders the failure inline; the submit also got the Phase-A `SubmitButton`
    pending treatment (closes that R19 bullet).
  - **`(app)/error.tsx` copy fixed** — no longer claims "Nothing was lost"
    (false whenever local state unmounted); now says re-entry may be needed.
- **PlannerBoard staged edits survive failure and navigation (R16).**
  - `doSave` catches: a failed `saveMesoPlanAction` keeps `workDays` (the whole
    staged session) and the confirm sheet open — SAVE CHANGES is a one-tap
    retry — instead of throwing to the boundary, remounting, and
    reinitializing from props.
  - **New `useNavigationGuard` hook** (`components/ui/useNavigationGuard.ts`):
    while `editing && dirty`, in-app anchor clicks (BottomNav, header links)
    are intercepted in the capture phase, browser back is absorbed via a
    history sentinel, and tab close gets the native beforeunload prompt. All
    routes land in the existing discard-confirm sheet, which now carries the
    intercepted destination ("Discard them and leave?") — DISCARD proceeds,
    Keep editing stays. The pure interception rule (`shouldGuardNavigation`:
    in-app hrefs only; hash/download/new-tab/scheme-qualified pass through) is
    unit-tested.
- Green: 614 tests (+5), typecheck, lint, production build (`/log` first-load
  unchanged at 125 kB).

## 2026-07-01 — R2: guardrails revived — clean-DB migrations fixed, hosted drift reconciled

Hard rule #1's enforcement gate (the CI `rls-tests` job) had never run: the
migration chain could not apply to a clean database, so `supabase start` died
before a single RLS test executed and every Actions run since ~06-20 concluded
red. This slice makes the chain reproduce a working database from zero
(verified end-to-end on a scratch Postgres 16 with a simulated Supabase
bootstrap) and reconciles the out-of-band hosted objects into version control.
Fixes, in chain order:

- **`20260611000001_initial_schema.sql` — `is_admin()` moved after
  `create table public.profiles`.** `LANGUAGE sql` bodies are validated at
  creation, so defining the function before its referenced table aborted the
  very first migration. **Deliberate deviation from hard rule #2** (edited an
  applied migration): reorder only, end-state byte-identical (verified: same
  normalized definition as hosted), hosted unaffected, and no append-only fix
  exists — a later migration cannot un-break an earlier one's failure. This is
  the runbook's own prescribed fix (manual-operations.md, 2026-06-20 entry).
- **`20260611000002_seed_muscle_groups.sql` (new).** The 12 canonical
  muscle-group rows lived only in `seed.sql`, which runs *after* migrations —
  but `20260615000006` joins them to link the 330 stock exercises (silently
  linking zero on a clean DB) and `20260617000002` hard-fails seeding stock
  templates. Same guarded insert as seed.sql; recorded no-op on hosted
  (applied via MCP for tracking).
- **`20260619000002_rls_auto_enable.sql` (new).** `public.rls_auto_enable()` +
  the `ensure_rls` event trigger existed only on hosted (created out-of-band
  ~06-20 — itself the rule-#2 violation the review flagged), yet
  `20260620000001/2` REVOKE on the function → dangling reference on a clean DB.
  Function body transcribed verbatim from hosted `pg_get_functiondef`;
  event-trigger creation guarded (`if not exists`), grants left to the 0620
  migrations (end-state ACL matches hosted exactly: postgres + service_role).
  Applied to hosted via MCP as a recorded no-op.
- **`20260616000001_adherence_rule.sql` → renamed `20260616000004`** (fourth
  break, surfaced by the PR's first CI run): its version prefix collided with
  `20260616000001_exercise_feedback_soreness.sql`, and the CLI's
  `supabase_migrations.schema_migrations` PKs on version — both files applied,
  then the second tracking insert aborted the reset. The scratch harness
  hadn't modeled the tracking table (now it does). 000004 also matches the
  true hosted apply order (soreness → auto-match → per-set → adherence);
  content-safe — the other 0616 files define no views, and the final
  `v_meso_summary`/`v_macro_summary` state was re-verified post-reorder.
- **`20260701000003_table_grants.sql` (new — fifth break, surfaced by the
  suite's first-ever execution):** no migration ever GRANTed on tables; the
  chain silently relied on environment default privileges. Hosted has them
  (postgres-stamped ALL for anon/authenticated/service_role on every table),
  the CI local stack does not → `permission denied for table macrocycles` in
  `beforeAll`, before RLS was even evaluated. The migration reproduces
  hosted's grant posture explicitly (schema usage + ALL on tables/sequences +
  matching default privileges) — **not a loosening**: RLS default-deny remains
  the gate, and functions are deliberately untouched so the 0620 revokes
  stand. Verified on the scratch chain with zero simulated defaults
  (end-state ACLs match hosted; function ACLs unchanged); applied to hosted
  via MCP as a recorded no-op (relacl byte-identical before/after).

**Clean-DB verification** (scratch PG16, roles + `auth.uid()/role()/users`
stub, one transaction per file, then `seed.sql`): all 51 migrations apply
clean; 26/26 tables RLS-enabled; **330 stock exercises with 352 muscle-group
links and 8 stock templates — identical counts to hosted**; single active
`engine_params` v10 (matches the suite's repaired `≥ 10` assertion); the
`ensure_rls` trigger provably auto-enables RLS on a newly created table. The
stale-assertion half of R2 shipped in PR #95.

**Remaining hosted↔repo drift found while diffing (filed as T-R2, not taken
here):** the out-of-band hosted migration `20260620115322
perf_rls_initplan_and_fk_indexes` initplan-wrapped ~54 policies
(`auth.uid()` → `(select auth.uid())`) and added 23 FK indexes that the repo
chain doesn't reproduce — performance-only, no semantic difference.

A sixth, non-migration break surfaced once the suite finally executed
(28/29): the role-escalation test asserted a silent 0-row update, but the
WITH CHECK rejection errors with 42501 — the hosted-verified behavior.
Assertion fixed and strengthened (role re-read after the attempt).

**Outcome: CI fully green on PR #96** — the first successful `rls-tests` run
in the repo's history (29/29 against a from-scratch stack), `checks` green
alongside. Hard rule #1's enforcement gate is live.

**Remaining / external (runbook updated):** make the two CI jobs (`checks`,
`rls-tests`) **required status checks** on `main` — GitHub repo settings, no
MCP surface for it.

## 2026-07-01 — R1 share-redemption lockdown + R8 joint-pain set gate (engine_params v17, ACTIVATED)

The top two items from the 2026-07-01 repo review
([reviews/2026-07-01-repo-review.md](reviews/2026-07-01-repo-review.md)) — small
diffs, worst consequences.

- **R1 — share redemption is no longer a cross-user copy primitive.** Two
  layers, both live:
  - Migration `20260701000002_shares_grantee_lockdown` (**applied**) drops the
    `shares_grantee_accept` policy. RLS can't scope columns, so the policy let a
    grantee rewrite `object_id`/`object_type` on their share row via PostgREST
    and re-submit the code — the service-role copy would then exfiltrate any
    object uuid into their account. No client path updates shares (redemption
    runs on the service client), so the policy had no legitimate consumer.
    Verified live: a simulated grantee UPDATE touches 0 rows; grantee SELECT and
    owner control unchanged.
  - `acceptShareCode` (`queries/sharing.ts`) now asserts every copied object is
    owned by `share.owner_id` (stock exercises excepted) before copying — closing
    the remaining owner-side rewrite surface (`shares_owner_all` lets an owner
    re-point their own share at a victim's uuid). Copy fns take the owner id;
    template/meso fills may only reference stock or the owner's own exercises.
  - Tests: 5 mocked-service `acceptShareCode` ownership tests
    (`sharing.test.ts`) + a new `shares` RLS suite (`tests/rls/rls.test.ts`) —
    grantee can read but not update/delete, owner keeps control, non-parties see
    nothing. (The RLS job itself is still dead pending R2.)
- **R8 — joint pain now gates set counts (doc 10 §3 step 0).** The one hard
  safety gate only ever blocked *load*; `setDelta` ignored pain entirely, so
  pain 3/3 with an easy workload + strong pump **added a set**. New optional
  `pain_cut_gate` param (same `.optional()` gating discipline as
  v11–v16; absent ⇒ legacy, so historical rows replay byte-identically). With it
  present, `modulateFromFeedback` runs the pain check first: pain ≥ `pain_gate`
  (2) vetoes any set addition ("set addition vetoed"); pain ≥ `pain_cut_gate`
  (3) forces a −1 set cut with a substitution suggestion, regardless of
  workload/pump. Tests: table-driven `pain-gate.test.ts` (13 cases incl. legacy
  replay behavior + end-to-end prescribe), a new bounds property invariant (no
  set increase under the gate; a cut at pain 3), v17 hash guard.
- **engine_params v17 shipped and ACTIVATED** (migration `20260701000001`,
  applied; activated via `activate_engine_params` after replay verification).
  Replay: v16-sourced decisions show **zero set-count diffs** (the only 2 diffs
  are the known R10 bodyweight-seed replay artifact, pre-existing); live
  feedback history has pain ≥ 2 only twice and pain 3 never, so activation is
  behaviorally identical on all recorded history and only changes future
  prescriptions when pain ≥ 2 recurs. Open prescriptions re-verify on next view
  via the freshness reconcile (params-version token change).

Suite 609 green (+21), typecheck + lint clean. Backlog rows R1/R8 updated in
[notes/backlog.md](notes/backlog.md).

## 2026-07-01 — WS-J Phase 1: client bundle & render slice

The measured client-side slice of the performance workstream
([notes/J-performance.md](notes/J-performance.md), N1). Headline: the daily-loop
routes **`/log/[workoutId]` + `/workout` drop 142 → 125 kB First Load JS (−17 kB
gz)** — the engine schema layer *and zod itself* leave the client bundle.

- **Zod-free predictor core (`engine/predict.ts`).** The day view's live math
  (`predictRepsAtWeight`, `estimateE1rm`, the §S3 factor/inverse helpers) moved
  into a core module keyed on the validated `engine_params.e1rm` slice, with
  **type-only** imports — no runtime zod. `e1rm.ts`/`reps.ts` keep their exact
  public signatures as parse-then-delegate wrappers, so every server/engine
  caller still validates at the boundary (hard rule #6) and outputs are
  byte-identical (`predict.test.ts` asserts core ≡ wrapped on both param
  generations + a static import guard so the chunk can't silently regress).
  Bonus: `recencyWeightedE1rm` now parses params **once per anchor build**
  instead of once per historical sample.
- **DayView leaf imports** (`engine/predict` + `engine/load` + type-only
  params) — the engine barrel (prescribe/macro/rules/summary) is server-only on
  the logging path. Macro create/edit forms leaf-import `engine/macro` likewise.
- **Render-path cost fixes.** The per-render zod parse per set row is gone by
  construction; the future-row rep prediction (bisection) and the P19
  over/under e1RM markers are `useMemo`ized per row; day-level progress counts
  memoized. **Measure-first correction:** the planned "debounce the weight
  input" was moot — prediction fires on blur, not per keystroke; the real
  per-keystroke cost was re-rendering all blocks, fixed by:
- **`ExerciseBlock` is `React.memo`** with stable id/exercise-taking callbacks
  from `DayView` (functional `setState` updates, no stale closures) — opening a
  menu / typing in one block no longer re-renders every other block's rows.
- **Lazy sheets:** `HistorySheet` + `PrescriptionDetailSheet` load via
  `next/dynamic` (both render null until opened).

Left in place (recorded): the in-file DayView sheets (Note/Replace/Add/Feedback/
Complete) stay in the route chunk — splitting them is file surgery with modest
return (route chunk is 16.6 kB gz total); PlannerBoard untouched (its draft-path
acknowledgment rework is the tracked follow-up and shouldn't ride with this).
Green: 588 tests (+4), typecheck, lint, production build.

## 2026-07-01 — MCP mesocycle/macrocycle authoring (I12)

Closes the connector's authoring gap: the LLM coach could read state and swap
exercises within existing days, but couldn't build a plan **into the macro** the
athlete runs. New/extended MCP write tools (all draft/append, engine still owns
every prescribed number, every write audited, no `user_id` arg):

- **`edit_mesocycle` gains `add_day` / `remove_day`** (pure `applyMesoEdits`
  extended + golden-tested). `add_day` lays down a whole training day at once
  (label/weekday + muscle-group blocks with exercises and starting sets), so an
  empty/placeholder meso builds up to a complete multi-day plan without dozens of
  per-exercise calls. The empty-meso guard now admits `add_day`. Returns the fresh
  plan (new day/slot ids) so chained edits need no re-read (needs-doc #8).
- **`place_mesocycle`** + **`create_mesocycle`/`duplicate_mesocycle` `macrocycle_id`
  option** — author or attach a plan straight into a macro slot. Pure
  `planMacroPlacement` (query `attachMesoToMacro`): fills the earliest `unplanned`
  placeholder by default (absorbing it + inheriting its phase) or inserts at a
  requested position. Rescues orphaned standalone drafts into context.
- **`update_mesocycle`** — edit a meso's own header (name, phase, weeks, deload,
  RIR ramp) in place (`updateMesocycleAttrs`); length/RIR/deload gated to
  not-yet-started mesos, name/phase on any unfinished one.
- **`duplicate_mesocycle`** — one-action clone of settings + board
  (`duplicateMesocycle` over `copyMesoStructure`); loads reseed on activation.
- **`manage_macrocycle_slots`** — add / remove (unplanned only) / reorder slots
  (`manageMacroSlots`).
- **`activate_mesocycle`** — the one real state change: `confirm="activate"` +
  **sequential-within-a-macro gate** (`mesoActivationBlock`, wired into `startMeso`
  so the app respects it too). A future block can't start until every earlier
  block is completed/abandoned and none is active — so **planned mesos are seeded
  from the latest prior-block results, never in advance** (a planned meso holds no
  prescriptions until activation, so gating activation is the whole guarantee).
- **`preview_mesocycle_volume`** — non-persisting weekly-sets-per-muscle vs
  MEV/MAV/MRV projection (pure `weeklySetsByGroup` + `previewVolume`, by-block
  counting matching `v_meso_week_sets`), over an existing meso or a proposed
  `days` spec, so a draft self-checks before commit (needs-doc #7).

Flow: the connector creates unapproved `planned` drafts the athlete opens, edits,
and **approves by activating**. No schema change — all capability rides existing
tables/statuses. New pure-function unit tests (edit day ops, placement, activation
gate, volume preview); suite green (584), typecheck + lint clean. See
[05-mcp-connector.md](05-mcp-connector.md) §Write.

## 2026-06-26 — T-I4: retire the legacy increment model (WS-I complete)

With v16 active, the legacy increment/regression progression is dead in production
(rep-window + bodyweight + cold-start cover every live case), so this removes the code.
**No engine_params version bump, no row migration** — the legacy param *fields* stay in
the schema (deprecated) so every historical row still parses to a complete
materialization (`is_replayable` / `params_hash` unchanged); only the *code* that read
them is deleted.

- **`index.ts prescribe()`** — the legacy `else` (increment on a hit, −`regression_pct`
  on a big miss, `load_first`/`reps_first`/`hold` per `progression_style`) is replaced by
  a **no-anchor safety HOLD**: with no confident anchor, hold the last load and reps and
  never fabricate a step or a back-off (anchor-only, owner ruling T-I3). A dropping target
  RIR is still noted as the progression. Under the active params this branch is a rare
  fallback (every lift with history has an anchor).
- **`index.ts seedMeso()`** — the retired prior-peak × back-off branch is **deleted**
  (it was already gated off since v14). Seed precedence is now strictly: confident anchor
  → the user's plan `initial_*` → unseeded (defer; never fabricate).
- **`rules/rounding.ts`** — `incrementFor` removed; **`effective-params.ts`** no longer
  sets the dead `increment` on an override (only `rounding`, the loadable step);
  **exercise page** computes the increment-editor default from `rounding` instead.
- **Schema (`params.ts`)** — `increment`, `experience_increment_scale`,
  `progression_style`, `regression_pct`, `meso_seed_backoff_pct` marked **DEPRECATED**,
  retained for historical-row parsing only. No code reads them. (Comment-only ⇒
  DEFAULT_ENGINE_PARAMS hash unchanged; provenance tests pass.)
- **Tests re-pointed off the legacy default** (the work that made this its own PR):
  `prescribe.test.ts` (was entirely legacy-path) now tests the no-anchor hold + feedback/
  volume/cold-start; `golden-meso` now a hold+deload golden; `rep-window`, `standalone-
  prescription`, `regeneration`, `admin-tools`, `equipment`, `effective-params` updated to
  the retired-seed / hold behavior. Suite green (549), typecheck + lint + build clean.

**WS-I (PR26 / the v9 engine cleanup) is now complete:** T-I1 (bodyweight model decided),
T-I2 (built + live), T-I3 (anchor-only), T-I4 (legacy retired), T-I5 (prior-peak seed
retired, folded in here). Note: replaying a *pre-rep-window* historical decision now takes
the hold fallback instead of the old increment math — acceptable (the live reconcile uses
the active params; pre-rep-window replay was already largely non-replayable).

## 2026-06-26 (latest) — Group 2 / T-I2: data migration + v16 ACTIVATED (bodyweight model live)

The bodyweight model is now **live** (engine_params **v16 active**, v15 retired). Sequence:

- **Pre-activation audit (read-only).** Per-(user,exercise) check across all bodyweight
  lifts: loadable flagged where `entered ≈/≥ bodyweight` (⇒ logged as TOTAL, not added),
  assisted/only checked separately. Only **2 users** have bodyweight history. Findings:
  every loadable exercise was logged as **total**; assisted entries are valid assist
  amounts (no migration); bodyweight_only ≈ bodyweight (safe, v16 ignores entered).
- **Loadable data migration (one-time, live data — NOT a repo migration).** For the 5
  loadable exercises, rewrote each working set `weight := round((entered − bw_ref)/5)×5`
  (the recovered *added* plate) and `bodyweight := entered − added`, so **effective load
  is preserved exactly** while the stored weight becomes a clean plate. `bw_ref` =
  stored bodyweight except **Slant Board Sit-Up → 150** (owner: weighed ~150 then;
  kg-converted decimals now live harmlessly in the per-set bodyweight). 73 working sets
  across 2 users; assisted / bodyweight_only / external untouched. Verified: effective
  load unchanged on every exercise (Back Raise 153.0/205.5, Dip 195, Pullup 192, Slant
  161.3).
- **Replay (v15→v16, post-migration).** Through the real engine on migrated data: Pushup
  → `bodyweight × 11` (reps progression); Back Raise anchor **379 → 220** (the double-
  count is gone — ≈ v15's 215.5) → `30 lb added × 11` (effective 155); Assisted Dip →
  `50 lb assist × 12` (effective 75). All sane ⇒ safe to activate.
- **Activated v16** (`update engine_params set is_active = (version = 16)`; v15 → inactive).

**Migrations applied to live this session:** 002 (columns + backfill), 003 (v16, now
active). The data migration above is a one-time hosted-data cleanup (specific to existing
rows), intentionally not added to `supabase/migrations/`.

**T-I4 (legacy deletion) — deliberately NOT in this PR.** The legacy increment/regression
path is the default in the engine test harness (7 files build `baseInputs` with
`strengthAnchor: null`; ~38 assertions encode increment/regression/hold behavior;
`prescribe.test.ts` is entirely legacy-path), and the legacy seed feeds historical-row
replay/provenance. Removing it cleanly = re-point the whole suite onto an anchored
default + decide how pre-rep-window decisions replay. That is a substantial standalone
refactor and is unwise to bundle into the UI PR immediately after a live activation — it
ships as its own focused, fully-tested PR. Until then the legacy block is **dead under
v16** (rep-window + bodyweight + cold-start cover every live case), just not yet deleted.

## 2026-06-26 (latest) — Group 2 / T-I2: bodyweight day-view UI + effective-load history flip

The user-facing half of the bodyweight model (the engine + schema shipped in
PR #80; migrations 002/003 applied to the live project this session). Owner rulings
drove it: minimal shift, the user enters only the added/assist load, bodyweight is a
display-only-but-inline-editable chip that writes straight through to the profile
(the day-view value and the profile value are one and the same), and effective load
is surfaced via the history tap-to-flip.

- **Day view (`DayView.tsx`).** Bodyweight exercises get a `BodyweightChip` in the
  header (next to the equipment label): `BW 125 LB` for only, `+ BW 125 LB` for
  loadable, `− BW 125 LB` for assisted — tappable to an inline numeric edit that
  calls `updateBodyweightAction` (→ `profiles.bodyweight`). The set row is unchanged
  for loadable/assisted (the editable cell now *means* added/assist); for
  **bodyweight_only** the weight cell is **read-only** (the load is the bodyweight,
  seeded from the profile and logged as the set weight) and only reps are entered.
  The live reps predictor and the P19 over/under marker now compute on **effective
  load** (the prescription against current bodyweight; a logged set against the
  bodyweight captured on that set).
- **Plumbing.** `LoggedExercise` carries `load_type` + the profile `bodyweight`;
  `getWorkoutDetail` resolves both. `updateBodyweightAction` (zod-validated) writes
  the profile and revalidates the log + workout paths.
- **History flip (#3, `history.ts` + `ExerciseHistoryList.tsx`).** For a bodyweight
  exercise, `getExerciseHistory` computes a session-average **effective load** (reusing
  `sessionAvgE1rm` over each set's effective load from its captured bodyweight), and
  the list's tap-to-flip shows `EFF LOAD` in place of `E1RM` for those lifts. External
  exercises are unchanged (flip still shows e1RM).
- **Gating.** All of this keys off `exercises.load_type` (a real column) and is correct
  whether or not v16 is active; v16 (still INACTIVE) only changes the *prescribed*
  numbers. Build + typecheck + lint clean; suite green (557).
- **Rule #8 deviation:** there is no mockup for bodyweight entry, so this UI is an
  improvised minimal design per the owner's explicit direction (chip + read-only cell +
  flip). Recorded here per the hard-rule-8 process.
- **Remaining before legacy deletion (T-I4):** (1) a read-only **migration-audit** of
  loadable/assisted historical entered weights (the dry run showed users logged *total*,
  not *added* — e.g. Back Raise — so those anchors inflate under v16; migrate
  per-exercise only where the data confirms it, never blindly); (2) **activate v16**
  after a replay diff; (3) delete the legacy increment block + retire its params.

## 2026-06-26 (latest) — Group 2 / T-I2: bodyweight load-type model (gated engine_params v16)

The last reason the legacy increment path survives is bodyweight movements: with no
load-type model they log `weight = 0`, produce no e1RM/anchor, and fall through the
rep-window path to the legacy increment block (`docs/notes/I-engine-v9.md`). T-I2 gives
the engine a first-class load-type model so those lifts price on **effective load**.
Shipped gated as **engine_params v16, INACTIVE** (byte-identical to v15 plus one
`.optional()` flag), so nothing changes live until a deliberate, replay-reviewed
activation.

- **Load-type model (`src/lib/engine/load.ts`, pure).** `LoadType` =
  `external | bodyweight_only | bodyweight_loadable | bodyweight_assisted`;
  `effectiveLoad`/`enteredForEffective` convert between the entered weight and the
  effective load (bodyweight / bodyweight+added / bodyweight−assist); `toEngineLoadType`/
  `coerceLoadType` map the library equipment vocabulary to a load type.
- **Engine (`rules/bodyweight.ts` + `index.ts`/`seedMeso` routing, gated `bodyweight_model`).**
  bodyweight_only progresses on **reps at the fixed bodyweight load**; loadable/assisted
  run the rep-window in **effective space** and round the entered **added/assist** value
  (so plates stay clean even when bodyweight isn't a multiple of the step); assisted is
  the inverse of loadable (negative added). No anchor + no manual seed ⇒ **defer** (null
  weight), never fabricate (owner ruling 2026-06-25). The external path is byte-identical.
- **Inputs (`engine/types.ts`).** `exercise.loadType` (a **config** input — in the
  freshness fingerprint, so changing a load type stales the row) and a top-level
  `bodyweight` (a **derived** input — excluded from the fingerprint like the anchor,
  refreshed from the live profile on recompute). Wired through every EngineInputs builder
  (`fingerprint`/`progression`/`generation`/`logging`/`regeneration`); `loadType` is
  auto-derived from `equipment_type` so callers needn't thread it.
- **Anchor (`queries/anchors.ts`, gated).** Under the flag the anchor prices on effective
  load (joins `exercises.load_type`, uses the per-set captured bodyweight) and stops
  dropping weight-0 bodyweight sets; off ⇒ the exact prior query.
- **Schema (`20260626000002`).** `exercises.load_type` (backfilled from `equipment_type`,
  incl. `machine assistance → bodyweight_assisted`) + `logged_sets.bodyweight` (captured
  at log time by the log action, backfilled from the current profile; locked after
  completion). Column adds on owner-scoped / library tables ⇒ RLS unaffected, no new test
  (per `20260623130000_logged_set_e1rm`). **engine_params v16 INACTIVE** (`20260626000003`,
  hash guarded in `params-provenance.test.ts`).
- **Tests:** `engine/__tests__/bodyweight.test.ts` (load helpers; the three load types;
  reps-progression; defer-when-no-bodyweight / no-data; flag-off gating; seed). Suite green
  (557), typecheck + lint clean.
- **Deferred to the activation PR (documented, not built here):** (1) **DayView UI** — a
  read-only bodyweight prefill + cue for bodyweight_only and an added/assist label for
  loadable/assisted. Deferred because the model ships INACTIVE (no user-visible effect
  until activation) and there is **no mockup for bodyweight entry** (hard rule #8 — to be
  designed before activation). (2) **Effective-load e1RM on the write path** — stored
  `logged_sets.e1rm` for bodyweight sets still uses the raw entered weight; the engine
  anchor computes effective load independently, so this only affects the history *display*
  of bodyweight sets and is a small follow-up. (3) **T-I4** legacy-path deletion, after
  v16 is activated.

## 2026-06-26 (latest) — Group 1: active-workout isolation + session-average e1RM (N3/T-A7/T-A8, N2)

First build group off the notes backlog (`docs/notes/backlog.md`). Two owner-decided
engine-correctness fixes, both in query land + one read-model view; the pure engine is
unchanged.

- **N3 / T-A7 / T-A8 — prescriptions & predictions read previous *completed* workouts
  only (`src/lib/queries/anchors.ts`).** The recency-weighted strength anchor query read
  *all* of a user's working sets, including the in-progress workout's. So the first
  logged set of the current exercise, if it was the recency-weighted best, made the
  session-average anchor (one set logged ⇒ that set *is* the average) snap every
  remaining live prescription onto it — the repricing the owner described (PH40/PH41,
  closes T-A7/T-A8). Fix: after fetching candidate sets, filter to those whose parent
  `workouts.status = 'completed'` (a workout reaches `completed` at the same step
  feedback is captured, `logging.ts completeWorkout`), so the in-progress workout never
  feeds the anchor. Single-point fix at the anchor source ⇒ every consumer (day-view live
  predictor, seed, progression, regeneration) inherits it. **In-progress sets still post
  to history/stats live** (owner: that's fine) — only the anchor (prescription/prediction
  input) excludes them; the current workout becomes canonical for the engine on complete.
  IO change; per the codebase convention (pure helpers unit-tested, data assembly covered
  by integration smoke) no new mock test — verified by typecheck/lint + the full suite.
- **N2 / T-A1 (history-stat half) — session e1RM = average, on the engine formula.** The
  per-session e1RM stat took the session *best* set on *raw single-formula Epley*. Owner
  (N2): average over the session's working sets; (T-A1) unify on the engine's e1RM. Both
  surfaces changed to **average the stored engine per-set e1RM** (`logged_sets.e1rm`,
  PH31 — RIR-aware averaged Epley/Brzycki):
  - `src/lib/queries/history.ts` — `sessionBestE1rm` → `sessionAvgE1rm` (Exercise-page
    history / PH32 flip view); nulls skipped, not counted as zero; rounded to 1 dp.
  - `supabase/migrations/20260626000001_v_exercise_history_avg_e1rm.sql` — `v_exercise_history.e1rm`
    from `max(weight·(1+reps/30))` → `round(avg(logged_sets.e1rm) filter (not warmup), 1)`.
    Drop+recreate (column type double→numeric; CREATE OR REPLACE can't change type). No SQL
    view depends on it (macro/meso summaries derive in the query layer). security_invoker
    preserved; RLS unaffected (reads owner-scoped `logged_sets`). `v_exercise_prs` already
    recomputes on the engine formula (2026-06-24) so PR badges stay coherent and unchanged.
  - Trend consumers (`stats.getMesoProgressScores`, `macro` est-strength, `exercises`
    overview bars) read `e1rm` as a per-session value with no best-set assumption — they
    now read session averages. `comparability.ts`/`pickSessionE1rm` is a separate analysis
    system (already engine-formula, deliberate representative-top-set) — left as-is.
- **Tests:** `exercise-overview.test.ts` — `sessionAvgE1rm` (average vs old max, null
  skipping, 1-dp rounding, bodyweight ⇒ null). Suite green (540), typecheck + lint clean.
- **Deferred to Group 2 (owner rulings recorded, not built here):** store bodyweight on
  the set at log time, uneditable after complete (decision #4); no explicit seed-weight
  prompt — leave weight/reps blank + set the prescription-reasoning copy to invite a
  manual starting point (decision #5).

## 2026-06-25 — Anchor-based deload (engine_params v15)

Owner bug: on a deload week the day-view logging field showed an absurd rep count
(e.g. **32**, the predictor's high-end cap) while the prescription detail showed the
real prescribed reps (e.g. **8**). The disagreement was a *symptom*; the root cause
was that the deload prescription itself is internally inconsistent. The legacy
`prescribeDeload` set the load to `deload.load_pct` (≈55%) of the meso peak, **carried
the peak reps** forward, and stated a fixed `deload.target_rir` (4) — but 8 reps at
≈55% of peak leaves far more than 4 RIR in reserve, so the triple is impossible. The
live predictor (an uncapped reps-to-hit-target-RIR calculator, doc 11) then re-derived
reps from the light load + RIR and exploded toward its rep cap (~32), diverging from
the carried reps.

**An earlier attempt hard-set the display to the prescribed reps** — rejected by the
owner as a band-aid that forces the output without fixing the inconsistent
prescription. Reverted. The correct fix is to **select the deload load the same way a
working week does**: pick the weight that lands window-centered reps at a higher
recovery RIR, from the strength anchor — "the same model as normal, just a higher RIR."

- **Engine (`index.ts`, gated `deload_anchor_rir`).** When set (with
  `weight_selection = rep_window` and a confident anchor), the deload short-circuit
  picks `targetReps` = the goal window's centre (≈10 for hypertrophy 8–12),
  `weight = roundToStep(weightForRepsAtRir(anchor, targetReps, deloadRir))`, bounds
  reps into the window, then sets `reps = predictRepsAtWeight(anchor, weight,
  deloadRir)`. Prescribed reps = predicted reps at the deload RIR **by construction**,
  so the prescription and the logging field agree and the weight × reps @ RIR triple
  is honest (verified by a test asserting `impliedRirAtReps == deloadRir`). Sets are
  still reduced (`set_pct`). Falls back to the legacy `load_pct` deload with no
  confident anchor or when the flag is off.
- **Deload RIR 4 → 6** (`deload.target_rir`), per the owner's "≈6 RIR, give or take,
  for ~10 reps." Required widening the `0–5` RIR bound: engine schemas
  (`week.targetRir`, `prescriptionSchema.targetRir`, `deload.target_rir` → `0–8`) and
  the DB CHECK constraints on `microcycles.target_rir` / `workout_exercises.target_rir`
  (migration `20260625000002`, pure widening, no RLS change).
- **engine_params v15** (`20260625000003`, INACTIVE) = v14 + `deload_anchor_rir:true`
  + `deload.target_rir:6`. `deload_anchor_rir` is `.optional()` so v14/earlier rows
  hash byte-identically (replay/freshness untouched). Activate manually after a
  `replay_decisions` diff (doc 13 §6); the current active row (v14) stays active
  until then. Provenance hash guarded in `params-provenance.test.ts`.
- **Tests:** `engine/__tests__/deload.test.ts` — internal consistency, deload RIR/
  window, lighter-than-working-week + reduced sets, anchor in the rationale, legacy
  fallback (no anchor), and flag-off parity (v14 + DEFAULT keep the load_pct deload).

**Deload RIR now propagates to existing unlogged weeks (live-resolve on reconcile).**
The deload RIR (and the working ramp) are config inputs, but were frozen onto the
microcycle row at meso-build time — so tuning `deload.target_rir` (v15's 4→6) would
never reach an existing meso's still-planned deload week: the freshness check
recomputed the prescription numbers but re-read the stale stored RIR.
`reconcilePrescriptions` now live-resolves each *unlogged* week's `target_rir` from
the active params' `rirRamp` (`liveWeekRirUpdates`, pure + unit-tested) and persists
the drift before the freshness pass, so the affected deload row goes stale and
recomputes at the new RIR. A week is only refreshed when **every** workout in it is
still `planned` — a started/logged week keeps the intensity the user trained (hard
rule #5). With v14 active (deload RIR 4) it's a no-op; the moment v15 is active, the
next day-view load refreshes existing unlogged deloads to 6 (anchor-based) with no
manual backfill. The two ungenerated-week RIR previews now source the deload RIR from
the active engine_params instead of hard-coding `4`. Suite green (539), typecheck +
lint clean.

## 2026-06-25 — Prescription detail: show the prescribed weight × reps

Follow-up to the audit reveal (owner request): the prescription detail sheet now
leads with the live prescribed numbers for verification, baked into the rationale
block — a bold `PRESCRIPTION` line "110 lb × 8 reps · 3 sets · 2 RIR" above the engine
rationale text (and always rendered, so it shows even before a decision is recorded).
A null load (the T-I5 manual-seed deferral) reads "Unseeded". Pure `formatPrescription`
in `units.ts` (unit-tested, degrades gracefully on null components); the numbers are
passed from the day-view `we` row (prescribed_weight/reps/sets + resolved target RIR).
Suite green (526), typecheck + lint clean.

## 2026-06-25 — Prescription audit reveal in the day-view exercise dropdown

Owner auditability request: make the engine_params version and decision kind behind
a prescription viewable from the workout day view, to double-check that open rows are
re-stamped on a version bump (the freshness reconcile advances
`workout_exercises.params_version` on every confirmation — changed OR unchanged — and
the day-view page runs that reconcile on every load, so the stamp is current by the
time it's viewed; confirmed this invariant holds, no engine change needed).

- **`getPrescriptionAudit` (`queries/audit.ts`) + `getPrescriptionAuditAction`.**
  Reads the latest `engine_decisions` row for a workout_exercise (kind,
  params_version, created_at, rationale, trace), RLS-scoped to the owner
  (`engine_decisions` has an owner-or-admin SELECT policy — no service client). The
  stored `output` jsonb is defensively parsed (`readTrace`, unit-tested).
- **`PrescriptionDetailSheet`** (mirrors `HistorySheet`: fetch-on-open `BottomSheet`).
  Shows **decision kind** (SEED / ADVANCE), **VERIFIED AS OF** v{`workout_exercises.params_version`,
  the row stamp passed in client-side}, **COMPUTED UNDER** v{decision version} · date,
  plus the **rationale + trace**. When the row stamp is ahead of the decision version
  (a newer version re-verified the row without changing the numbers — no new decision
  is written), it surfaces "re-verified under Vx — numbers unchanged since Vy", which
  is exactly the audit signal: proof a no-op version bump still verified the row.
- **Day view wiring** (`DayView.tsx`): the prescription/rationale row at the top of
  the exercise `…` dropdown is itself the tap target (a chevron `›` keys it), opening
  the sheet — no extra menu line item. `params_version` already flows to the client
  via the `select("*")` detail spread.
- Tests: `audit.test.ts` (trace coercion + malformed-jsonb defense). Suite green
  (**524**), typecheck + lint clean.
- **Rule #8 deviation (recorded):** this audit/verification surface has **no mockup
  figure** — it's an owner-requested affordance, styled to the light-ledger system
  (tracked all-caps labels, square corners, ink/cream, numerals; no orange). It is
  visible to all users behind the dropdown tap; **gating it to admins is a easy
  follow-up** if the version/kind detail should not be user-facing.

## 2026-06-25 — Retire the prior-peak meso seed (WS-I / T-I5, gated v14)

Workstream I, first build slice. The legacy `priorPeak × meso_seed_backoff_pct` meso
seed (root-caused in the 2026-06-23 standalone-prescription investigation: it backs
the weight off but carries `priorPeak.reps` verbatim off a never-performed
per-column-max set — a fabricated week-1 seed) is **retired**, per the owner ruling
that a prescription is never emitted at any cost: use real data when present, else
defer to the user's own manual seed.

- **`retire_prior_peak_seed` (engine, gated).** New `.optional()` param; `seedMeso`
  skips the prior-peak branch when set. Seed precedence becomes **confident recency
  anchor → the user's plan `initial_*` (manual seed) → UNSEEDED** (null weight, with
  a rationale that prompts the user to enter a starting weight). The S1 anchor seed
  (already live in v12) is unchanged; this only removes the fabrication fallback
  behind it. (`engine/index.ts seedMeso`, `engine/params.ts`.)
- **Honest fallback copy.** When the flag is OFF the cold-start fallback is
  byte-identical (preserves replay); when ON, the rationale distinguishes "starting
  from your planned values" from "not enough confident data — enter a starting
  weight" instead of always claiming "no prior history".
- **engine_params v14, INACTIVE** (`20260625000001_engine_params_v14_retire_prior_peak_seed.sql`).
  v14 = v12 + `retire_prior_peak_seed:true`, full materialization + canonical hash.
  The flag is `.optional()`, so v12/earlier rows parse byte-identically — their hash,
  `is_replayable`, and the doc-14 freshness fingerprint are untouched (guarded in
  `params-provenance.test.ts`). `meso_seed_backoff_pct` is **left in the schema**
  (dropping it would flip historical rows non-replayable); its removal + per-row
  migration is deferred to **T-I4**, where the whole legacy block is retired. A
  throwaway **v13** "deload tuning" row exists in the hosted DB only (no migration,
  owner-flagged test) — unrelated; v14 is the next real version.
- **T-I1 bodyweight model decided** (owner) and recorded in
  `docs/notes/I-engine-v9.md`: bodyweight-only (profile bodyweight as read-only
  load, reps-only progression), bodyweight-loadable (bodyweight + added; bodyweight
  used in calc, not shown), bodyweight-assisted (negative weight; UI deferred if no
  such exercises yet). Unblocks T-I2 (the v9 no-anchor / bodyweight model).
- Tests: seed on/off matrix (anchor / plan-seed / unseeded) in
  `standalone-prescription.test.ts` + v14 hash/replayability guard + "DEFAULT lacks
  the flag" guard in `params-provenance.test.ts`. Full suite green (**522**, +6),
  typecheck + lint clean.

### Remaining / external
- **Apply + activate v14** is a manual post-replay step (see
  `docs/deployment/manual-operations.md`): apply the migration to hosted (inactive),
  run `replay_decisions` for v14 on standalone users, confirm the diff, then flip
  v14 active. Not applied to the live DB in this slice (feature branch only).
- **UI:** activation makes "unseeded" (null prescribed weight) a more common live
  state — verify the planner/day view renders it as a "enter a starting weight"
  prompt rather than blank/0 before activating for real users.

## 2026-06-24 — Rep-window round 2 (v12) + legible prescription version stamp

Follow-up to the v11 standalone-prescription work, from live review of Garron's
W4·D3. Two rep-window engine fixes (gated as **v12, inactive**) plus a freshness
legibility fix (ships active).

- **v12 #1 — climb on PERFORMED reps (`climb_on_performed_reps`).** The Option-A
  rep-climb / window-reset advanced off the previous *prescription* (`previous.reps`),
  so a lift prescribed 12 but performed 11 still reset to the window bottom and bumped
  the load. It now advances off the **minimum working-set reps actually performed**
  (double progression resets only when *every* set reaches the top); falls back to the
  prescription when there are no logged sets. (`engine/index.ts`.)
- **v12 #2 — bound to the TARGET window (`bound_to_target_window`).** `boundRepsToWindow`
  only nudged the load when predicted reps breached the hard `[6,15]` bounds, so a
  rounded load predicting 13–14 was left there even when one loadable step landed in
  `[8,12]` (e.g. High Row `50×14` when `55×10` fit). It now prefers the in-target step,
  keeping the lighter load only when the next step would undershoot `target_low` (the
  genuine coarse-increment buffer), while still enforcing the hard bounds. (`engine/index.ts`.)
  Both flags are `.optional()` (absent ⇒ legacy), shipped in engine_params **v12
  (inactive)** — activate after a replay diff (manual-operations.md).
- **Legible "accurate as of Vx" stamp (`workout_exercises.params_version`,
  `20260624000003`).** doc-14's freshness fingerprint proves a row is accurate under the
  active version but is an opaque hash, and an *unchanged* recompute re-stamps the
  fingerprint without writing a new decision — so the only visible version label was the
  decision's, making fresh rows look stale (this caused real confusion during review). A
  new column records the version each prescription was last computed **or verified-still-
  accurate** under, stamped beside `dep_fingerprint` at every write site (generation, seed,
  recompute) plus a one-time catch-up on the fresh-row short-circuit, so a planned row
  always advertises the latest version it's known-correct under. Backfilled from each row's
  latest decision version; the reconcile advances still-fresh planned rows on next view.
  Additive + nullable; not gated (a correctness/legibility fix). `database.ts` type +
  `Defaulted` updated.
- **Confirmed NOT a bug:** the doc-14 reconcile was working — after v11 activation it
  recomputed every planned row (verified all 15 of Garron's W4·D3 + W5·D1 fingerprints
  match v11). The earlier "stale v9/v10 rows" reading was a misinterpretation of the
  *decision* `params_version` (which only advances on a numeric change); the new column
  removes that ambiguity going forward.
- Tests: `v12-rep-window.test.ts` (#1/#2, each on/off the gate) + v12 hash guard in
  `params-provenance.test.ts`. Full suite green (516), typecheck + lint clean. Both
  migrations applied to hosted (v12 inactive; column backfilled).

## 2026-06-24 — Standalone-prescription fixes: runaway reps & suspect e1RM (S1/S2/S3/S5)

Implements [docs/reviews/2026-06-23-standalone-prescription-investigation.md](reviews/2026-06-23-standalone-prescription-investigation.md)
(closes triage **T-A6**; extends PR22/PR23). The investigation root-caused four
compounding defects behind "prescribed reps in the upper teens–20s + inflated
e1RM" on standalone mesos. All four engine/param behaviors are **param-gated** and
ship in **one new engine_params version (v11), INACTIVE** — activation is the
documented manual step after a replay diff (see manual-operations.md). Every gate
is an `.optional()` param **absent on v10/earlier**, so existing rows parse
byte-identically: v10's canonical hash, `is_replayable`, and the doc-14 freshness
fingerprint are all untouched (asserted in `params-provenance.test.ts`).

- **S3 — tame the e1RM estimator (`e1rm.ts`, `reps.ts`).** New `e1rmFactor()` is
  the single Epley/Brzycki curve shared by the forward estimate AND the inverse
  load-for-reps math, so they can't drift. The §S3 switch: with
  `e1rm.brzycki_max_eff_reps` set, average Epley+Brzycki only ≤ that many effective
  reps and use Epley alone above (Brzycki inflates 2–4× on a 20–30-rep burnout — a
  100×30@3 set was estimating ~555 lb; v11 caps it at ~210, Epley-only). Absent ⇒
  the exact legacy `< 36 ⇒ average` rule. Plus `session_value_confidence_weights`
  down-weights low-confidence burnout sets in the `session_best` anchor *value*
  (not just its label). v11 = `brzycki_max_eff_reps: 10`, weights `{1, 0.6, 0.3}`.
- **S1 — seed week 1 from the strength anchor (`engine/index.ts seedMeso`).** Gated
  by `seed_from_anchor`, `seedMeso` now mirrors `prescribe()`'s `seed_anchor`
  branch: pick the load for the window's `target_low` reps at the start RIR off the
  recency anchor and let reps follow, instead of carrying the prior peak's rep
  count verbatim (the headline runaway: week 1 prescribed `best_reps` one-for-one,
  16–30 reps). Falls back to the legacy peak-backoff / plan-default seed with no
  confident anchor. Anchors are threaded through `startMeso` /
  `regenerateOpenWorkouts` / `addWorkoutExercises` and the recompute seed replay
  (`regeneration.ts`); the anchor query moved to a leaf `anchors.ts` (re-exported
  from `logging.ts`) to avoid a generation↔logging cycle. `strengthAnchor` rides in
  `buildSeedInputs`/`seedEngineInputs` so replay reproduces the seed — it's a
  *derived* key, so the freshness fingerprint is unaffected.
- **S2 — `v_exercise_prs` reports a coherent set (`20260624000001`).** Replaced the
  three independent per-column `max()`es (which fabricated a heaviest-weight ×
  most-reps pair the user never did, then handed it to the seed) with the single
  best-e1RM set via `DISTINCT ON`, and computes `best_e1rm` with the §S3 estimator
  reading `rir_offset` + `brzycki_max_eff_reps` from the active params (so the view
  tracks the engine in lockstep). Validated against live data — Madeline's Seated
  Leg Curl now returns a real 175×14, not 140×30. `security_invoker` preserved.
  **Semantic note:** `best_weight`/`best_reps` are now the best-e1RM set's, not
  independent maxes — still "your best", now coherent; consumers (stats, coaching
  weight_pr fallback, exercises page, copy-meso) display/seed from it unchanged.
- **S5 — rep-consistent hold + de-blunt dampener (`engine/index.ts`,
  `rules/feedback.ts`).** `hold_rep_consistent`: when a gate (pain or session
  dampener) blocks a warranted increase, hold the load AND prescribe the Option-A
  schedule reps (the held *effective workload*), instead of clamping the anchor
  predictor to the window ceiling — which used to emit a `weight × reps @ RIR`
  triple whose implied RIR contradicted the target (the §2.4 `100×15 @2` with an
  implied ~19 RIR). `session_dampen_require_both`: dampen only when BOTH high
  fatigue AND poor performance are reported, so a fatigued-but-strong session (the
  §2.4 fatigue 3 / performance 3) still progresses.
- **Gating / activation.** `20260624000002_engine_params_v11_standalone_fixes.sql`
  inserts v11 **inactive** (v10 stays active). Activate manually after a
  `replay_decisions` / `simulate_prescriptions` diff on Madeline + a couple users
  (doc 13 §6) — runbook step added to manual-operations.md. No logged history is
  ever rewritten (hard rule #5); in-flight open prescriptions refresh through the
  normal freshness/regeneration path once v11 is active.
- **Deferred (recorded, not built):** S4 (per-slot rep ranges) per the
  investigation. The S5 "dampen the *magnitude* of an increase (half-step) rather
  than zeroing it" sub-idea is **not** implemented — it is ill-defined under
  rep-window weight selection (the load comes from the anchor, not a fixed
  increment); require-both delivers the de-blunting cleanly. Noted as a follow-up.
- Tests: new `standalone-prescription.test.ts` (S1/S5, each asserted on AND off the
  gate) + S3 cases in `e1rm.test.ts`/`reps.test.ts` + the v11 hash/replayability
  guard in `params-provenance.test.ts`. Full suite green (507), typecheck + lint clean.

## 2026-06-23 — Per-set e1RM stored & exposed; tap-to-flip history (PH31 + PH32)

Triage Workstream B. Per-set e1RM was only ever computed on read (stats views use
raw single-formula Epley; the engine uses an averaged Epley/Brzycki over effective
reps). PH31 persists the **engine's RIR-aware estimate** with each set for
auditability; PH32 surfaces it via a tap-to-flip history view. The stats views and
their raw-Epley `e1rm` are deliberately left untouched (the two-systems
reconciliation is triage T-A1) — this slice only *adds* the engine value.

- **Schema (`20260623130000_logged_set_e1rm.sql`):** nullable `logged_sets.e1rm`,
  documented column, and a **backfill** of every historical working set using the
  same formula (`effReps = reps + coalesce(rir,0)·rir_offset`; mean of Epley &
  Brzycki, Epley-only ≥36 effReps; `rir_offset` read from the active engine_params
  row). Null for `weight ≤ 0` (bodyweight) / non-working input, matching
  `estimateE1rm`. RLS unchanged — `logged_sets` policies are column-agnostic,
  owner-scoped. **Deploy ordering:** the column must exist before the new code runs
  (inserts write `e1rm`), so the migration applies with the deploy.
- **Write path:** `logSetAction` / `amendSetAction` compute the value from active
  params via the engine's `estimateE1rm` and store it (amend recomputes since
  weight/reps/RIR change). `logSet` input + `amendSet` patch gained `e1rm`;
  `LoggedSetRow` + the insert `Defaulted` set updated in `database.ts`.
- **MCP:** `get_exercise_history` returns a per-session `e1rm` (session best) with
  an honesty caveat in the dataQuality note — an estimate/trend, null on bodyweight,
  distinct from the view's raw-Epley e1RM.
- **UI (`ExerciseHistoryList`):** a list-wide `flipped` state — tap any row to flip
  every row between `weight × reps` and the session-best `e1RM`, quick `metric-fade`
  (reduced-motion → instant), default sets/reps on load. The session-note reveal
  moved onto its own icon button so the row tap is unambiguously the flip;
  bodyweight/null renders "—".
- **Tests:** extracted + unit-tested the pure `sessionBestE1rm` helper (max over
  non-null, null-if-none); updated three `HistoryEntry` fixtures and asserted `e1rm`
  in the MCP formatter test. Engine `estimateE1rm` already covers bodyweight=0→null
  and the Epley fallback the backfill depends on. Green: typecheck, lint, **489
  tests** (+3).

## 2026-06-23 — Removed unit conversion; imperial-only

The imperial/metric unit-conversion work (PH28 + the same-day follow-ups below)
proved trickier than it earned. Reverted the whole feature: the app now records
and displays weight exclusively in **pounds** and height in **inches**. All
existing data was already stored in `lb`, so no weight values change — this is a
structural cleanup plus a height unit conversion. All green (typecheck, lint,
486 tests).

### Done
- **Settings/onboarding.** Dropped the units toggle (`UnitsToggle` deleted, the
  `setUnits` action + `convert_my_weights` rpc removed) and the onboarding UNITS
  step. Height is always entered as feet + inches; bodyweight always labelled LB.
- **Schema (`20260623120000_imperial_units_only.sql`).** Drops `profiles.units`
  and `logged_sets.unit` (every row was already `lb`), converts
  `profiles.height_cm` → `profiles.height_in` (whole inches, `round(cm/2.54)`),
  drops `convert_my_weights(to_unit)`, and rebuilds `v_exercise_overview` without
  the now-gone `unit` column. `macrocycles.target_unit` is **kept** — it stores
  `lb` or `%` and encodes the weight-vs-percentage distinction, not the unit
  choice. Validated against the live DB in a rolled-back transaction (170/185/162
  cm → 67/73/64 in). **Must be applied at deploy time, after the new code is live
  (it drops columns the previous build reads).**
- **Engine params flattened to imperial (`20260623120001_engine_params_v10_imperial.sql`).**
  `increment`/`rounding` go from per-unit `{kg,lb}` objects to a single pound
  value across `params.ts`, `rounding.ts`, `effective-params.ts`, the seed and a
  new active **v10** params row (schema_version bumps to 5). `roundToStep` /
  `incrementFor` / `resolveEffectiveParams` lose their `units` argument; the
  engine inputs drop `user.units` and hard-code `lb` in every rationale string.
  v2–v9 keep their historical `{kg,lb}` bytes and are flagged non-replayable.
- **Display + MCP.** Every `formatWeight`/`formatHeight` call and weight/height
  label is hard-coded to LB / feet-inches; the MCP envelope always reports
  `units: "lb"`; `get_profile` returns `height_in` and drops `units`/
  `bodyweight_unit`; the macro engine keeps its internal kg-based FFMI/BMI physics
  (`lbToKg`/`kgToLb`) but takes `heightIn` and assumes pounds. The prescription
  dependency fingerprint drops `units` (a one-time benign represcribe).
- **units.ts.** Conversion helpers (`isImperial`, cm↔ft/in) removed; kept
  `roundWeight`/`formatWeight` (display snapping) and added imperial `formatHeight`,
  `inchesToFeetInches`, `feetInchesToInches`.

## 2026-06-23 — Unit conversion on switch + measurement-system labels (reverted above)

Follow-ups from field testing the PH28/units work. All green (typecheck, lint,
486 tests).

### Done
- **Unit switch now converts stored data.** Previously flipping `profiles.units`
  changed only the label, so a 159 lb bodyweight read as "159 kg" — which also
  zeroed the macrocycle gain target (FFMI blew past the ceiling). New migration
  `20260623003334_convert_user_weights_on_unit_switch.sql` adds a SECURITY DEFINER
  `convert_my_weights(to_unit)` that converts every weight the caller owns —
  `logged_sets` (weight + per-row unit tag), `profiles.bodyweight`,
  `workout_exercises.prescribed_weight` + `set_weights` jsonb,
  `meso_exercises.initial_weight`, `macrocycles` targets/rates (+`target_unit`),
  and `exercise_param_overrides.weight_increment` — in one transaction, then flips
  the setting. `setUnits` calls it via rpc. Applied + tested live (rolled back):
  159 lb → 72.1 kg, set_weights 245 → 111.1, all user-scoped.
- **Macro gain/loss "→ 0" fixed.** Root cause was the above data inconsistency
  (owner's profile flipped to kg with un-converted lb data). The engine math is
  correct (`toKg(bodyweight, unit)`); converting on switch prevents recurrence.
  Owner profile was corrected back to lb out-of-band.
- **Weights display snapped to 0.5.** New `units.roundWeight`/`formatWeight` snap
  every shown/entered loadable weight to the nearest 0.5 (lb or kg). This kills
  fine decimals (a prescription read 19.92) and — because conversion stores finer
  (0.1) than the display step — makes lb↔kg↔lb toggles round-trip to the same
  value. Applied in the day view inputs/prescriptions, exercise history, exercise
  bests + e1RM bars (also de-hardcoding "LB"→the user's unit there), meso-stats
  cells/bars, and macrocycle target/rate ranges.
- **History weight unit no longer hardcoded.** `ExerciseHistoryList` showed
  ` lb` literally; now uses the set's stored unit (carried through `HistoryEntry`).
- **Measurement-system labels.** The units toggle (More + onboarding) reads
  IMPERIAL / METRIC instead of LB / KG (weight displays elsewhere stay lb/kg).
  Dropped the redundant "MEASUREMENT SYSTEM — HEIGHT FOLLOWS THIS" subtitle and
  the "MATCH WEIGHT · EXPORT · DELETE" subtitle on the Account & data link.

## 2026-06-22 — Triage slices 1 + 2 + the real PH35 fix (profiles RLS recursion)

Field-notes triage (see `docs/notes/`): the genuine PH35 root cause plus slice 1
(PH42, P20, PH26) and slice 2 (P19, PH27, PH28). All green (typecheck, lint, 486
unit tests).

### Done
- **PH35 — auto-match crash, REAL root cause: `profiles` RLS recursion.** PR #61
  guarded the `setPlannedSetWeight` data path and this PR first added an error
  boundary, but the setting still couldn't be saved — confirmed against the live
  DB: **every regular-user UPDATE to `profiles` failed with
  `42P17 infinite recursion detected in policy`**. `profiles_update_own`'s
  WITH CHECK guarded role self-escalation with a subquery on `profiles` *inside* a
  `profiles` policy (present since the initial schema; surfaced once Postgres
  enforced recursion detection). Fix: migration
  `20260622220627_fix_profiles_update_recursion.sql` reads the caller's role via a
  SECURITY DEFINER helper (`current_profile_role()`, bypasses RLS), keeping the
  anti-escalation guard without recursion. **Applied to the live project** and
  verified (normal update OK; role escalation BLOCKED 42501). This broke not just
  auto-match but units, profile edits, and onboarding.
  - Defense-in-depth kept from the first pass: `src/app/(app)/error.tsx`
    (recoverable card; the app had no error boundary) + `AutoMatchToggle` /
    `UnitsToggle` revert-and-toast on a failed write, ignore no-op clicks.
- **P19 — over/under-prescription marker.** Logged sets in `DayView` `SetRow` get
  a small caret, compared **by e1RM** (accounts for reps hit and RIR in reserve),
  ±1.5% on-target band, none without a prescription. Over = `▲` at the top corner,
  under = `▼` at the bottom corner of the reps cell.
- **PH27 — template "+ NEW" tray.** New `NewTemplateButton` chooser sheet (mirrors
  the create-cycle tray): blank template → planner draft, or add from a share
  code. Redeem form moved off the page list into the tray.
- **PH28 — unit-aware height.** New `src/lib/units.ts` consolidates the two
  duplicated `formatHeight` copies + cm↔ft/in conversions. Height enters/displays
  in the user's system (ft/in for lb, cm for kg) in `ProfileEditor` and
  onboarding; storage stays canonical `height_cm`. More "Units" row gained a
  measurement-system subtitle.
- **PH42 — note pencil (slice 1).** Replaced **every** bare `✎` glyph (illegible
  `text-ink/40`, ~11px) with a shared legible inline SVG `PencilGlyph`
  (`components/ui/PencilGlyph.tsx`, 15–16px, matching the icon-row SVGs): exercise
  **history** rows (the one actually visible in the field screenshot), day-view
  pinned/session notes, the exercise-page pinned note, and the planner's
  "EDIT DAY". (This is the I15 item — the icon existed but wasn't legible.)
- **P20 — live exercise search (slice 1).** `exercises/page.tsx` now loads the
  library and renders a client `ExercisesBrowser` that filters by search text **as
  you type** plus both MUSCLE/EQUIP axes instantly (no navigation round-trip).
  Replaces the server `?q=` submit-to-search; filter state is now client-only
  (URL deep-linking of filters dropped — acceptable for instant filtering).
- **PH26 — settings cleanup (slice 1).** New `/more/account` sub-page houses Match
  weight / Export / Delete account; the main More list shows a single
  "Account & data" link in their place.

### Deviations / notes
- **Onboarding step reorder (rule #8).** 08 §4 lists units **last**
  (`name/age/height/bodyweight → experience → equipment → units`). PH28 requires
  the measurement system to be chosen **before** height/bodyweight so those fields
  render in the right system, so the UNITS panel now comes first
  (`units → about you → experience → equipment`). Step count (4) and all panel
  copy are unchanged; only order. Recorded here per rule #8.
- **P19 marker glyph** is house-style (no mockup figure exists for it); kept to a
  small ink `▲`/`▼` per the ledger system (no accent — orange stays reserved for
  position/selection).

## 2026-06-21 — Custom weight increment: free-typed load step on the Exercise page

The editable weight increment (doc 14 phase 3) shipped as a fixed chip picker —
presets (lb: 2.5/5/10/15/25, kg: 1/2.5/5/7.5/10) ∪ the engine default ∪ the
current override. Exercises with an unusual jump the presets don't cover (an odd
machine stack, a 1.25 lb micro-plate pair, a 3.75 kg loadable) had no way in: you
could only pick a preset. This adds a **CUSTOM** affordance to the "Load step"
sheet so any positive step can be entered directly.

This is a **UI-only** change — the persistence path already accepted arbitrary
values end to end. `setIncrementOverrideAction` validates
`z.number().positive().max(1000)`, the `exercise_param_overrides.weight_increment`
column is `numeric check (> 0)`, and `resolveEffectiveParams` folds whatever value
is stored into `params.rounding`/`params.increment`. The picker was the only thing
restricting the input to presets.

### Done

- **CUSTOM chip + inline number field (`ExerciseSettingsMenu.tsx`).** A dashed
  CUSTOM chip (planned/empty affordance per hard rule #7) sits after the preset
  chips; selecting it reveals a `+ [number] {unit}` field (mirrors the
  CreateMacroForm custom-duration pattern). The chips list is now presets ∪ default
  only — a custom override no longer masquerades as a preset chip; instead, opening
  the sheet on an exercise whose override isn't a preset seeds CUSTOM mode with the
  field prefilled. `parseStep` accepts a finite value in `(0, 1000]` (matching the
  action cap); an out-of-range entry shows an inline note and disables SAVE.
  "USE DEFAULT" still clears the override.
- **No schema, query, action, or engine change.** The value flows through the
  existing `setIncrementOverrideAction` → `setExerciseIncrementOverride` →
  fingerprint/reconcile path unchanged, so a custom step makes exactly that
  exercise's open rows go stale on the next read, same as a preset.

### Verified

`npm run typecheck`, `npm run lint` green. No engine/query tests touched (behavior
unchanged below the UI); the existing `exercise-overrides`/`effective-params`/
`fingerprint` suites already cover non-preset increment values.

## 2026-06-21 — Prescription freshness: close the two gaps that left rows stale (doc 14 §5/§6.2/§6.3/§10)

Fixes the regression where a stale prescription could never be brought current.
Two real gaps remained after phases 1–4, both surfaced by a concrete case: **W3·D4**,
a bypassed (never-logged) planned day in an active meso, whose Deadlift increment
edit — and in fact *any* input change — did nothing. Root cause was twofold and the
fix closes both, so the invariant the framework promises ("a stored prescription is
ALWAYS accurate, on every surface, after any change to an input that feeds it") now
actually holds.

### Done

- **Decision-less open rows are no longer skipped — they backfill as seeds
  (`regeneration.ts`, doc 14 §6.2/§6.3).** The read-path reconcile filtered open
  rows to those with a recorded `engine_decisions` row (`latestByWe.has(we.id)`), so
  a pre-phase-2 seed (or any row whose best-effort decision write failed) was skipped
  **forever** — never fingerprinted, never recomputed, permanently frozen. The
  phase-2 assumption that such rows "age out as mesos complete" fails for a
  skipped/bypassed planned day inside a still-active meso (it never completes). The
  reconcile now includes every open, unlogged row; for one with no decision it
  reconstructs a cold-start **seed** from the LIVE plan defaults
  (`meso_exercises.initial_*`, via `getMesoPlan`) + the user's prior peak
  (`v_exercise_prs`) — exactly what generation seeds from — runs the existing
  `recomputeRow(kind:"seed")`, writes the refreshed prescription + `dep_fingerprint`,
  and records a `kind:"seed"` decision so the row is normalized into the framework and
  replays cleanly thereafter. (Because `seedMeso` rounds the backed-off load via
  `roundToStep`, the editable increment override now visibly moves a seeded number,
  which is what the W3·D4 Deadlift case needed.)
- **Freshness runs on EVERY surface that shows prescriptions, not just the Workout
  tab (doc 14 §5/§10).** Extracted `ensureFreshPrescriptions(userId, mesoId)` — the
  single read-path entry point that owns the service client and never throws — and
  call it from both DayView surfaces: the Workout tab (`workout/page.tsx`, refactored
  onto the helper) **and** the `log/[workoutId]` deep link (previously read raw, so a
  day reached by direct navigation never refreshed). The meso-detail / planner /
  planned-day pages render plan structure + RIR, not engine loads, so they need no
  reconcile.
- **The increment override now drives the loadable step (`effective-params.ts`).** The
  weight increment is an exercise's loadable step — the granularity EVERY prescribed
  weight rounds to (`roundToStep` reads `params.rounding`, in the seed, anchor
  cold-start, rep-window advance, and legacy advance paths). `resolveEffectiveParams`
  had folded the override only into `params.increment` (the legacy +step jump, read
  only on the no-anchor fallback), so under the active v9 `rep_window` params it moved
  no prescribed number — it only shifted the fingerprint. This retracts the phase-3
  deviation-(b) "honest scope" claim (it was a bug, not by design). The override now
  sets `params.rounding` (keeping `params.increment` in sync for legacy mode), so
  updating an exercise's increment — even mid-cycle — re-rounds its open prescriptions
  to the new step on the next read, **for seeds and advances alike**. Tests assert an
  anchored rep_window advance and a meso seed both round to the override step
  (`effective-params.test.ts`). `rounding` is used literally (a physical step, no
  `experience_increment_scale`); the legacy `increment` still composes the scale.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (476/476, +2), `npm run build`
all green. New tests (`regeneration.test.ts`) model the backfill reconstruction at
the pure level: a stale decision-less row recomputes to the exact `seedMeso` number,
and the fingerprint the reconcile stamps for it equals the one generation would have
stamped (write/check parity → the backfilled row short-circuits on the next read).
Live-DB diagnosis confirmed the cause: W3·D4's five planned rows all carried
`dep_fingerprint = null` and `decisions = 0`, while every other open day had both.

### Deviations / notes

- **Backfill recompute uses the SEED engine, not advance.** A decision-less row has
  no stored source pointer or derived history to replay an advance from, so it is
  seeded from the prior peak (the always-correct cold-start basis). Once backfilled it
  carries a seed decision and follows the normal seed recompute path forever after.
- **No DB-backed reconcile integration test** (consistent with the codebase's
  no-DB-mock approach): the new logic reuses the already-tested pure `recomputeRow`
  seed path, and the added tests assert the reconstruction + fingerprint parity the
  I/O depends on.
- **Separate engine-semantics point (unchanged here):** under the active v9
  `rep_window` params the increment override does not move an *advance* row's load
  (priced off the strength anchor, phase-3 deviation b); it does move a *seed* row's
  load (rounding step). Either way the reconcile recomputes the row, so the stored
  prescription is correct — freshness is satisfied regardless of whether a given input
  numerically moves a given row.

## 2026-06-20 — Prescription freshness: backfill the already-flowing sources into the contract (doc 14 phase 4)

Implemented [14-prescription-invalidation.md](14-prescription-invalidation.md)
**phase 4** (§7): the verification slice that closes the dependency-fingerprint
framework over its remaining inputs. The sources phase 4 names — **profile**
(experience/units), **macro goal**, and **meso config** (RIR ramp + deload) —
already flow as resolved config dimensions (`user.*`, `goalType`, `week.*`), so the
fingerprint already sees them; nothing new had to be wired. What phase 4 owns is the
**proof** that "scope falls out of the fingerprint" — a change to one source goes
stale for **exactly** its in-scope rows and is byte-identical for every row outside
it. **No schema change, no new code wiring** — tests only. `main` deployable; 474
tests (+9) pass; typecheck / lint / build green.

### Done

- **Source-scoping tests (`fingerprint.test.ts`).** A new `describe` modelling the
  reconcile's per-row check (it resolves the profile once per user, the goal once per
  meso, the week per microcycle, then hashes each open row) — the same shape as the
  phase-3 increment-override scoping test:
  - **Profile** is a UNIVERSAL dimension: an experience-level or units edit moves
    every one of the user's rows across exercises / goals / weeks. Cross-user
    isolation is structural (the reconcile is scoped to one `userId`), reinforced by
    a no-cross-user-collision assertion.
  - **Macro goal** moves only the rows whose goal resolves from that macro: a
    two-meso / two-macro model where re-goaling macro A moves its rows and macro B's
    stay byte-identical (short-circuit), plus "every row under the re-goaled macro
    moves regardless of exercise or week."
  - **Meso config** moves rows per microcycle: a 3-week ramp where re-tuning ONLY
    week 2's RIR moves week-2 rows (and the edited week now aliases the week sharing
    its RIR — fingerprint is a pure function of resolved config), the deload toggle
    moves that week's rows, and cross-meso isolation is structural + non-colliding.
- **Recompute-output tie (`regeneration.test.ts`).** A `recomputeRow` test ties a
  macro-goal change to an actually-repriced prescription: with a strength anchor
  present, re-goaling hypertrophy→strength moves the prescribed reps into the goal's
  rep window (doc 13). The existing week-RIR overlay test already covers meso config
  at the recompute level generically.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (474/474, +9), `npm run build`
all green. The fingerprint scoping is the load-bearing proof (which rows go stale);
the write/check projection parity it relies on is the §3 golden test from phase 1.

### Deviations / notes

- **Scope verification is at the fingerprint level** (pure, like the phase-3 override
  test), not a DB-backed `reconcilePrescriptions` integration test — consistent with
  the codebase's no-DB-mock approach, and the read-path resolution is already
  golden-tested for write/check parity (§3). The reconcile resolves each dimension
  exactly as the tests model (profile per `userId`, goal via `resolveMesoGoal`, week
  per microcycle — see `regeneration.ts`).
- **Cross-user / cross-meso isolation is asserted as non-collision and noted as
  structurally enforced** by the reconcile's `userId` / `mesoId` scoping, since at the
  pure-hash level a different scope is just an independent input (a `fp(x) === fp(x)`
  assertion would be vacuous, so it was avoided).
- **The recompute-output tie is shown for macro goal** (clearly behavioral via the
  rep window); a units/experience recompute-output assertion was omitted as brittle
  (rounding-dependent) — the fingerprint divergence is the proof that profile rows go
  stale, and the engine reflecting the new profile is already exercised generically.
- **Phase 5 (optional) remains**: a history token / Tier-0 epoch, only if a real need
  or profiling appears. Doc 14's framework is otherwise fully built (phases 1–4).

## 2026-06-20 — Prescription freshness: first per-user override, editable increment (doc 14 phase 3)

Implemented [14-prescription-invalidation.md](14-prescription-invalidation.md)
**phase 3** (§7): the first **per-user × exercise** engine override — the editable
weight increment (the per-set load jump for one lift). This proves out the doc-14
"reusable contract": a new input becomes a small, mechanical addition, not a
correctness redesign. The value is resolved into **effective params** at every
generation/recompute site and folded into the prescription's **dependency
fingerprint**, so an increment edit makes exactly that exercise's open rows go stale
on the read path — **scope falls out of the hash**, no bespoke "invalidate" wiring.
One append-only migration (new table + owner-only RLS). `main` deployable; 465 tests
(+12) pass; typecheck / lint / build green.

### Done

- **`exercise_param_overrides` table (migration `20260620000006`).** `user_id ×
  exercise_id → weight_increment` (numeric, `> 0`), `unique (user_id, exercise_id)`,
  owner-only RLS (`user_id = auth.uid()` for all ops), index on `(user_id,
  exercise_id)`, `set_updated_at` trigger. RLS test added (owner-only read + unspoofable
  insert) alongside the exclusions/notes cases.
- **Pure `resolveEffectiveParams` (`engine/effective-params.ts`).** Merges an
  override into the global params' per-equipment increment (in the user's units),
  producing the EFFECTIVE params the engine runs under; the engine signature stays
  `prescribe(EngineInputs, EngineParams)` (hard rule #3). A null/absent override
  returns the params **referentially unchanged** (so a no-override row hashes
  identically to before). Unit-tested incl. the legacy-path number change + no-mutation.
- **Fingerprint token folds the override (`fingerprint.ts`).** `ParamsToken` gained
  optional `incrementOverride`; `paramsTokenFor(version, override?)` OMITS it when
  absent, so existing fingerprints are byte-identical (zero churn) and present it
  moves only that exercise's rows. Golden tests: no-override parity, an override
  moves the hash, two-exercise scoping (only the overridden one diverges).
- **Wired at every write/recompute site.** `seedExerciseRow` (+ `startMeso` /
  `regenerateOpenWorkouts`) and `addWorkoutExercises` resolve the override into
  effective params for `seedMeso` and stamp the override-aware token; `generateDay`
  (advance) and `projectNextPrescription` do the same for `prescribe`; the read-path
  `reconcilePrescriptions` batches the override read with the other config dimensions,
  computes the per-exercise expected fingerprint, and recomputes diverged rows under
  effective params. The recompute decision records `provenance.dependencies.incrementOverride`.
- **Editor on the Exercise page (fig 3.1a `⋯`).** The mockup's header overflow now
  opens a "Load step" bottom sheet — step chips (unit-aware) + "USE DEFAULT" — backed
  by `setIncrementOverrideAction` (zod-validated, revalidates the exercise + workout
  paths). Query layer: `exercise-overrides.ts` (`get*`/`set*`/`clear*`).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (465/465, +12), `npm run build`
all green. The zero-churn guarantee is the `paramsTokenFor` parity test; the scoping
("only the overridden exercise recomputes, nothing else") is the two-exercise
fingerprint test mirroring the reconcile's per-row computation.

### Deviations / notes

- **The override is the BASE increment** (the level `engine_params.increment` sits
  at), so `experience_increment_scale` still composes on top — at the default
  intermediate scale (1.0) the override is the literal step.
- **Under the active v9 params (`weight_selection: "rep_window"`) the engine prices
  loads off the strength anchor, not the increment.** So this override moves a
  prescribed NUMBER only on the legacy increment path (cold-start / no-or-low-
  confidence-anchor fallback, or an `increment` params row). It **always** moves the
  fingerprint, so the row always participates in (and re-stamps through) the reconcile.
- **The recompute decision records the GLOBAL `params_hash`** (the `engine_params` row
  identity) with the override in provenance, not an effective-params hash.
- **Phases 4–5 remain** (backfill the already-flowing sources — profile / macro /
  meso — with targeted recompute-scoping tests; the optional history token / Tier-0
  epoch).

### Remaining / external

- **Apply `20260620000006_exercise_param_overrides.sql` to the hosted DB.** It was
  NOT applied from this session (the remote `apply_migration` was blocked as an
  unauthorized production action). The override reads query this table, so they error
  until it exists on hosted — apply it on deploy (CLI `supabase db push`, dashboard
  SQL editor, or MCP). See [deployment/manual-operations.md](deployment/manual-operations.md).

## 2026-06-20 — Prescription freshness: normalize seed decisions (doc 14 phase 2)

Implemented [14-prescription-invalidation.md](14-prescription-invalidation.md)
**phase 2** (§6.2): **seed** prescriptions now participate in the same read-path
freshness reconcile as week→week **advances**, instead of being silently skipped.
A seed (`seedMeso`: meso activation, open-workout regeneration on a plan edit, or a
slot added mid-workout) is a cached derived value that goes stale exactly like an
advance; phase 1 only recorded a decision for advances, so seed rows had no replay
source. Phase 2 records a `kind`-tagged decision for seeds too and dispatches the
recompute on `kind`. One append-only migration (additive column; existing RLS
covers it; 60 existing rows backfilled to `advance`). `main` deployable; 453 tests
(+16) pass; typecheck / lint / build green.

### Done

- **`engine_decisions.kind` (`'seed' | 'advance'`, migration `20260620000005`,
  applied to hosted).** Default `'advance'` backfills the 60 existing rows (all
  advances). RLS unchanged — additive column, no access change.
- **Seed builders (`fingerprint.ts`).** `seedEngineInputs(config, priorPeak)` wraps
  a resolved `ConfigInputs` into a full seed `EngineInputs` (empty derived shell;
  the prior peak rides in the EXCLUDED `weekPeak` slot, so it is omitted from the
  fingerprint per §6.4). `buildSeedInputs(args)` is the write-side convenience
  (config half through the shared `buildConfigInputs`, so the stamp matches the
  check). A **golden test** asserts `configProjection(buildSeedInputs(x)) ===
  buildConfigInputs(its config half)`, that the fingerprint is invariant to the
  prior peak, and that it moves on each seed config dimension.
- **Seed-decision writer (`seed-decisions.ts`).** `recordSeedDecisions` (pure
  `buildSeedDecisionRows` + a service-client insert; `server-only`) writes the
  `kind:"seed"` audit row. `engine_decisions` has no user-INSERT policy and the seed
  sites run on the user client, so the decision write uses a service client scoped
  to the passed `userId` (hard rule #4). **Best-effort:** a failed write leaves the
  row with its stamped fingerprint but no decision — i.e. skipped by the reconcile,
  exactly the pre-phase-2 behavior — so it never breaks meso start / plan save /
  add-exercise.
- **Stamp + record at every seed site.** `generation.ts` factors `seedExerciseRow`
  (seed one fill → row + fingerprint + inputs/output) and `persistSeededRows`
  (insert, then record decisions by returned id); `startMeso` and
  `regenerateOpenWorkouts` (new days + newly-added exercises) route through it.
  `addWorkoutExercises` (`logging.ts`) does the same inline, modeling the user's
  best as the cold-start `initial` so the prescribed number is unchanged (now
  on-step + replayable).
- **Recompute dispatches on `kind` (`regeneration.ts`).** `recomputeRow` →
  `recomputeAdvance` (`prescribe`, refreshed strength anchor) or `recomputeSeed`
  (`seedMeso`, live config overlaid on the frozen prior-peak basis). The reconcile
  loop reads each decision's `kind`, fetches anchors lazily only for a diverged
  advance, and a recomputed row keeps its origin `kind` on the new decision.
- **Replay honesty (`admin.ts`).** `replay_decisions` re-runs a seed through
  `seedMeso` (not `prescribe`), so a seed no longer diffs spuriously against its
  stored output; `get_engine_decisions` surfaces `kind`. `engineGoal` moved to a
  leaf (`engine-goal.ts`) so generation, the check, and the advance path resolve
  `goalType` identically (the value feeds the fingerprint).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (453/453, +16), `npm run build`
all green. Migration applied to hosted and re-checked (`kind` present; 60 rows →
`advance`). The write/check parity for seeds is the golden test; against live data,
63 planned open rows (48 advances with a decision, 15 pre-phase-2 seeds) — the 15
stay skipped as before, new seeds participate.

### Deviations / notes

- **Seed recompute overlays live *config* but keeps its prior-peak basis frozen.**
  A cold start has no completed source week to refresh from (unlike the advance
  path, which refreshes the anchor), and the prior peak predates the meso, so it is
  immutable relative to a mid-meso config change (§6.4). A units/params/RIR/
  equipment change therefore takes effect on a not-yet-started seed; a brand-new
  same-meso PR does not (it would only matter for a week-1 seed and is an edge case).
- **`addWorkoutExercises` now seeds through `seedMeso`** (best modeled as the
  cold-start `initial`, so **no** peak-backoff). The starting number is the same as
  before, now rounded on-step and replayable; a later recompute may replace the
  "Added during the workout" note with the engine rationale (notes aren't compared).
- **Pre-phase-2 seed rows (15 on hosted) stay skipped** — they carry no decision and
  are not retroactively backfilled; they age out as their mesos complete. New seeds
  participate from creation.
- **Phases 3–5 remain** (per-user editable-increment override + `resolveEffectiveParams`;
  verify profile/macro/meso recompute scoping with targeted tests; optional history
  token / Tier-0 epoch).

## 2026-06-20 — Prescription freshness framework (doc 14 phase 1)

Implemented [14-prescription-invalidation.md](14-prescription-invalidation.md)
**phase 1**: stored prescriptions now stay correct when ANY of their inputs change
(engine params, profile, macro goal, meso config, the upstream week), via a
per-prescription **dependency fingerprint** checked on the read path. This
**replaces** the single-scalar `params_version` staleness gate (doc 14 §9) — which
modeled only global params and, critically, was defined in a migration that was
**never applied to the hosted DB** (so the old `reconcileMesoPlan` gate had been
silently throwing on prod, caught by the Workout page's try/catch). One append-only
migration (additive column; existing RLS covers it). `main` deployable; 437 tests
(+24) pass; typecheck / lint / build green.

### Done

- **Pure framework (`src/lib/queries/fingerprint.ts`).** `configProjection`
  (denylist of the six derived/history fields → the config half of `EngineInputs`),
  `buildConfigInputs` (the single resolver used at BOTH write and check, so the
  projection can never drift), `computeDepFingerprint` (canonical sha256 over the
  config projection + the active-params token). All pure (hard rule #3); hashing
  reuses `params-provenance`. A **golden test** asserts
  `configProjection(buildEngineInputs(x)) === buildConfigInputs(configArgsOf(x))`,
  plus the fingerprint changes on each config dimension (goal / week / previous /
  equipment / profile / params version) and is INVARIANT to derived history (§6.4).
- **Storage (`migration 20260620000004`).** `workout_exercises.dep_fingerprint
  text` (null = never stamped → recompute on next view, self-healing §6.3). Applied
  to hosted. The orphaned, never-applied `..._params_version` migration was removed
  (its column didn't exist anywhere, so this aligns the repo with hosted rather than
  carrying a dead column).
- **Stamp at write (`progression.ts`).** `generateDay` stamps the fingerprint from
  `configProjection(inputs)` + the active version; `buildEngineInputs` now routes
  its config half through the shared `buildConfigInputs` (no behavior change).
- **Read-path reconcile (`reconcilePrescriptions`, `regeneration.ts`).** Replaces
  `reconcileMesoPlan`. Heals generation gaps first (kept `catchUpMesoGeneration`),
  then for each open row WITH a decision re-resolves its config from live state,
  hashes, and compares to the stored fingerprint; diverged rows recompute in **week
  order** (a changed `previous` propagates to the next week in one pass). Recompute
  overlays the live config + a refreshed anchor onto the row's immutable stored
  derived history, runs the pure engine, and writes back the prescription +
  fingerprint + an audited `engine_decisions` row carrying the fingerprint
  transition and the resolved dependency component values; unchanged-but-stale rows
  just re-stamp; un-replayable rows self-heal (§6.3). Pure `recomputeRow` classifier
  unit-tested. Wired into `app/(app)/workout/page.tsx`.
- **Retirement (doc 14 §10).** Removed the `params_version` gate + column (code,
  types, fixtures), `getRegenerablePlannedDecisions` / `regenPlanToken` /
  `withRecomputedAnchors` / `anchorKey` / `planRegeneration` / `applyRegeneration`,
  and the `regenerate_planned_prescriptions` + `catch_up_generation` **MCP tools**
  (the generation gap-heal they fronted survives as the on-load auto-heal;
  `replay_decisions` / `simulate_prescriptions` kept as read-only inspection).
  `activate_engine_params`'s description updated: no manual regenerate step — the
  read-path reconcile propagates a new version automatically.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (437/437), `npm run build` all
green. The write/check equivalence was validated against the **live hosted data**:
for sampled open rows the stored config projection equals the check-time resolution
exactly (the `previous` resolved via the decision's source pointer matches the
stored `previous` byte-for-byte), so the first on-load reconcile stamps fingerprints
without spuriously rewriting prescriptions. Active meso scope: 19 planned rows, 9
checked (have a decision), 10 seeds skipped.

### Deviations / notes

- **Seeds / user-added slots stay unstamped and are skipped** by the check (they
  carry no decision to replay) — exactly today's behavior. Phase 2 (§6.2) normalizes
  them with a `kind:"seed"` decision so they participate.
- **The check loads the latest decision per open row** (for the `previous` source
  pointer + the stored derived history). §5's "no decision lookup in the steady
  state" is left as a phase-2+ optimization; correctness (handles substitutions /
  reorders) was preferred over the extra read.
- **Backfill is lazy** (null → §6.3 self-heal on first view), not an eager migration
  backfill — the live-data check above confirms the first heal stamps rather than
  churns. The §9 decision-inputs backfill remains an available optimization if a
  zero-churn deploy is ever wanted.
- **Phases 2–5 remain** (normalize seed/user-add decisions; the per-user editable
  increment override + `resolveEffectiveParams`; verify profile/macro/meso recompute
  scoping with tests; the optional history token / Tier-0 epoch).

## 2026-06-20 — Security audit (Phase 7 hardening slice 2)

Full state-of-the-art security audit of the whole surface (MCP OAuth resource
server + tools, Supabase Auth/consent flow, middleware + server actions + route
handlers, RLS schema, service-role usage, data-lifecycle flows, client XSS
sinks, service worker, CI, dependencies). Findings + status recorded in
[14-security-audit.md](14-security-audit.md). `main` deployable; no schema
change. Existing 396 tests + 17 new = 413 passing; typecheck/lint/build green.

### Fixed

- **MCP rate-limiter memory-exhaustion DoS (HIGH).** The limiter runs pre-auth
  keyed by `sha256(bearer_token)` and its `prune()` was never called, so a
  unique-token spray grew the `windows` map without bound. `RateLimiter` now
  prunes opportunistically (once/window) and enforces a hard `maxKeys` cap
  (`DEFAULT_MAX_KEYS = 20_000`, override `MCP_RATE_LIMIT_MAX_KEYS`), rejecting
  new keys fail-closed when full. `src/lib/mcp/rate-limit.ts` + `/api/mcp/route.ts`
  (+4 tests).
- **OAuth consent-decision CSRF (HIGH).** `POST /api/oauth/decision` is a
  cookie-authenticated, state-changing route handler and does **not** get Server
  Actions' built-in Origin check. Added `isSameOrigin()`
  (`src/lib/http/same-origin.ts`) — cross-site posts get `403` via
  `Sec-Fetch-Site` / `Origin`-vs-host (+6 tests).
- **MCP token verification hardening (MEDIUM).** `verifyMcpToken` now pins
  algorithms to `["RS256","ES256","EdDSA"]` (RFC 8725), rejects `anon` /
  `service_role` project keys, and enforces `aud` when `MCP_JWT_AUDIENCE` is set
  (RFC 8707, opt-in). `src/lib/mcp/auth.ts` (+8 tests).

### Remaining / external

- **Migrations don't apply to a clean DB (HIGH — human, rule #2).** The
  `rls-tests` CI job has been red on every run: migration `20260611000001`
  aborts because `is_admin()` is defined before `public.profiles` exists
  (`check_function_bodies` validates the body), and `rls_auto_enable()` is
  `revoke`d but never `CREATE`d (out-of-band hosted schema). This disables the
  automated RLS guardrail for hard rule #1. Fixing safely means editing applied
  migrations + reconciling the hosted function body — see
  [deployment/manual-operations.md](deployment/manual-operations.md).
- **Enable `MCP_JWT_AUDIENCE`** once the deployed OAuth token's `aud` is confirmed.
- Audit gaps (rejected destructive ops + admin inspection), cross-user
  regeneration scoping test, `import-history.py` anon-grant rework, redeem
  throttle / share expiry, nonce CSP — all catalogued in 14-security-audit.md.
## 2026-06-20 (latest) — Connector endpoint: ignore misconfigured Vercel alias overrides

Follow-up to the connector-URL fix below. Production still showed a brittle,
deployment-specific endpoint (`https://workout-garron-duprees-projects.vercel.app/api/mcp`)
on `/more/connector` because `NEXT_PUBLIC_APP_URL` is set in Vercel to an
auto-generated `*.vercel.app` alias, and an explicit env value overrode the
canonical fallback. The copyable MCP URL must always be the one durable domain.

### Done

- `src/app/(app)/more/connector/page.tsx`: replaced the raw
  `NEXT_PUBLIC_APP_URL || CANONICAL_APP_URL` resolution with a `resolveOrigin`
  helper. It honors the env override only for durable origins — localhost (dev)
  or a non-`vercel.app` custom domain — and **ignores** any auto-generated
  `*.vercel.app` alias (anything other than the canonical host), falling back to
  `https://workout-zeta-murex.vercel.app`. Unparseable values fall back too. The
  page is now self-correcting regardless of the Vercel env value, so the copied
  endpoint is `https://workout-zeta-murex.vercel.app/api/mcp` on every alias.
- Updated [deployment/mcp-connector-setup.md](deployment/mcp-connector-setup.md)
  env table + troubleshooting row to describe the new alias-ignoring behavior.

### Remaining / external

- **Vercel (human, optional):** correcting `NEXT_PUBLIC_APP_URL` to the canonical
  domain (or unsetting it) is no longer required for the link to be correct, but
  remains the tidy configuration. See
  [manual-operations.md](manual-operations.md).

## 2026-06-20 — Phase 7 hardening slice 1: security pass + data lifecycle

First slice of [07 Phase 7](07-implementation-plan.md) (production hardening).
Covers the parts doable from a Claude session: the security pass (DB advisor
findings, headers, MCP rate limiting, service-role audit) and the data-lifecycle
More-tab rows (CSV export + account deletion). `main` deployable; two
append-only DDL migrations (grants/search_path only — no table/column/RLS-policy
change, so no type regen).

### Done

- **Security headers (`next.config.ts`).** `headers()` now sets
  `Strict-Transport-Security` (2y, preload), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a `Permissions-Policy` denying
  camera/mic/geolocation/FLoC, and `Content-Security-Policy: frame-ancestors
  'none'` on every route. No full CSP yet — Next's inline runtime needs nonces to
  avoid breakage; clickjacking is covered by frame-ancestors + X-Frame-Options.
- **DB function hardening (migrations `20260620000001` + `...0002`, applied to
  hosted).** Cleared the Supabase **security advisor** WARNs: pinned
  `set_updated_at()`'s `search_path` (the one mutable-path finding), and revoked
  the direct PostgREST-RPC `EXECUTE` grant on the pure trigger / event-trigger
  helpers `handle_new_user()` and `rls_auto_enable()` from `anon` +
  `authenticated` (triggers fire regardless of grants — behaviour-preserving).
  Advisor security findings went **8 → 3**. The remaining three are intentional /
  external: `is_admin()` (anon+authenticated) is kept executable because RLS
  policies on `engine_params`/`engine_decisions`/`mcp_write_audit` call it as the
  querying role and it leaks only the caller's own admin status; the
  leaked-password toggle is a dashboard step (see manual-operations). Verified
  `is_admin()` still executable by `authenticated` (admin RLS intact) and the two
  helpers no longer callable by anon/authenticated.
- **MCP rate limiting (`src/lib/mcp/rate-limit.ts` + `/api/mcp/route.ts`).**
  Fixed-window limiter (default 120 req/min, `MCP_RATE_LIMIT` override) keyed by a
  sha256 of the bearer token (IP fallback when unauthenticated); over-limit
  requests get a JSON-RPC `429` with `Retry-After`. Pure `RateLimiter` class with
  an injected clock (+5 tests). Documented caveat: per-instance on serverless (no
  Redis — SSE/Redis is intentionally off per 05 §Transport); caps a single client
  hammering one warm instance, a global limiter would need a shared store later.
- **Service-role usage audit.** Reviewed every `createServiceClient` call site
  (`audit.ts`, `admin.ts` regeneration, `workout`/`log`/`share` actions, and the
  new `deleteAccount`): each derives the user id from the **server session /
  verified token** and passes it explicitly to scoped queries — never from input.
  The one cross-user path (`applyRegeneration`) is the admin-gated tuning tool by
  design. Compliant with hard rule #4.
- **Data lifecycle — CSV export.** The More-tab "Export training data" row is now
  a working `/more/export` download: `buildTrainingExportCsv` streams the user's
  full logged-set history (paginated past the PostgREST 1000-row cap, RLS-scoped,
  no service role) as a flat denormalized CSV (date · meso · week · deload ·
  target RIR · day · exercise · set · type · warmup · weight · unit · reps ·
  reported RIR · notes). Pure RFC-4180 `buildCsv`/`csvEscape` (`src/lib/csv.ts`,
  +5 tests).
- **Data lifecycle — account deletion.** New `/more/delete-account` danger-zone
  page with a **type-DELETE-to-confirm** gate. The server action deletes the auth
  user via the service client (scoped to the caller's own id), which **cascades**
  to every user-owned table (verified against the live FK graph: all reference
  `auth.users` `on delete cascade`), then signs out and redirects to sign-in.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (396/396, +10), `npm run
build` all green. Both migrations applied to hosted and re-checked with
`get_advisors` (8 → 3) and `has_function_privilege`. New routes build
(`/more/delete-account`, `/more/export`). On-device walkthroughs (download the
CSV; delete a throwaway account) are the owner's check.

### Remaining Phase 7 (external / on-device — see manual-operations.md)

- **Enable Supabase leaked-password protection** (Auth dashboard toggle).
- **Observability:** wire Sentry (needs a DSN env var) + structured logging review.
- **Performance/Lighthouse PWA ≥ 90** and the **accessibility audit** on the
  logging flow — both want a real device/CI Lighthouse run, not a sandbox.
- **Production deploy, custom domain, smoke checklist.**
- Final design QA pass against 08 + mockups for empty/edge states.

## 2026-06-20 — Fix the copyable MCP link on `/more/connector`

The AI-connector setup page (`src/app/(app)/more/connector/page.tsx`) showed the
wrong endpoint to copy. It derived the origin from `NEXT_PUBLIC_APP_URL` and,
when that was unset, fell back to the **request host** — so visiting prod via a
deployment-specific or preview alias (`workout-bcohv3it8-…`,
`workout-git-main-…`) surfaced a non-canonical, brittle URL that breaks the
saved connector when that deployment is superseded.

### Done

- Replaced the request-host fallback with a `CANONICAL_APP_URL` constant
  (`https://workout-zeta-murex.vercel.app`). Resolution is now
  `NEXT_PUBLIC_APP_URL` (override for local dev / a future custom domain) ‖ the
  canonical production alias — never the serving host. The copyable endpoint is
  therefore `https://workout-zeta-murex.vercel.app/api/mcp` on every prod alias.
- Dropped the now-unused `next/headers` import; lint + typecheck clean.
- Updated [deployment/mcp-connector-setup.md](deployment/mcp-connector-setup.md):
  concrete canonical domain in Project facts, the env table, the redirect-URL
  step, the test snippets, and the connect step; troubleshooting row reworded
  (deployment-host symptom → correct `NEXT_PUBLIC_APP_URL`).

### Remaining / external

- **Vercel (human):** if `NEXT_PUBLIC_APP_URL` is currently set to a
  non-canonical value for Production/Preview, correct it to
  `https://workout-zeta-murex.vercel.app` (an explicit env value still overrides
  the code fallback). If it's unset, no action needed — the fallback now covers
  it. See [manual-operations.md](deployment/manual-operations.md).

## 2026-06-18 — Connector coaching roadmap Stage 5: session-order / fatigue-position normalization

Fifth and final stage of [12-connector-coaching-roadmap.md](12-connector-coaching-roadmap.md).
Makes single-exercise analysis fair to **where a movement sits** — splitting a
lift's two day-slots so they aren't pooled into a sawtooth, and surfacing the
movement's ordinal within its session so an accessory done late isn't misread as
a regression versus the same lift done fresh. Sharpens Stage 3's defusing of the
Dumbbell Curl false-stall. **Read/interpretation only — no schema, no migration.**

### Pre-build data check (the stage's blocking gate) — resolved

The actual **performed** exercise order is **partially** persisted: live logging
stamps each `logged_sets.performed_at` at log time (distinct per set), but the
backfilled history (`scripts/history-build.sql`) collapses every set in a workout
to one timestamp. The **planned slot order** (`workout_exercises.position`) is,
however, uniformly present for both live and historical sessions, and the
**day-slot** (`workouts.day_number`) is always present. So Stage 5 is a
**surfacing** stage: it derives the session ordinal from the persisted slot
order and keys per-slot series on `day_number` — no capture/view change needed.

### Done

- **Pure analysers (`src/lib/analysis/comparability.ts`).** `analyzeByDaySlot`
  groups an exercise's sessions by `day_number` and runs the Stage-3
  rolling/phase/confidence trend on each slot independently (slots below a
  minimum session count or with a null day are dropped); `fatiguePosition`
  summarises the movement's ordinal within its session (avg/min/max position,
  avg session size) and flags `varies` when the depth spread is ≥ 2 — the
  comparability caveat. Both pure, empty-safe, deterministic.
- **Session reader enrichment (`getExerciseSessions`, `src/lib/queries/coaching.ts`).**
  Each `ExerciseSession` now carries `day_number` + `day_label`
  (`workouts.day_number` → `meso_days.label`) and `session_position` +
  `session_size` (rank of the slot's `workout_exercises.position` within its
  workout, and the session's exercise count). Added `selectAllForIds` (chunks the
  id filter **and** paginates each chunk) so the per-session slot fetch survives
  both the URL-length and row caps for a heavily trained lift.
- **`analyze_exercise_progress` surface (`src/lib/mcp/tools/coaching.ts`).** Adds
  `day_slots` (only when the lift pools across ≥2 slots — each a like-with-like
  per-slot series) and `fatigue_position`, with metric definitions and two new
  honesty notes: read per-slot trends instead of the pooled sawtooth, and treat a
  later-position dip as possible pre-fatigue rather than a regression.
- **Tests (+8 → 361 total).** `analyzeByDaySlot` (two-slot split recovers the
  heavier Day-1 series flat, min-session/null-day filtering, avg position) and
  `fatiguePosition` (stable vs variable depth, empty-safe) in
  `comparability.test.ts`; `formatExerciseAnalysis` surfacing the per-slot split
  + caveat and the single-slot/variable-depth case in `coaching-tools.test.ts`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (361/361) all green. The
acceptance cases hold: the Dumbbell Curl's Day-1 and Day-3 slots report as
distinct series (Day-1 flat, not declining), and a movement trained at variable
session depth carries the fatigue caveat. End-to-end `tools/call` against the
deployed connector is the owner's check once merged.

### Notes / deviations

- **Session ordinal = persisted slot order, not reconstructed wall-clock order.**
  Because backfilled history collapses per-set timestamps, the uniformly-available
  signal is `workout_exercises.position` (the session's intended order), which is
  exactly the "where in the session it sits" the stage targets. Live per-set
  timestamps could refine this in future but aren't required for the acceptance
  cases; no capture change was made (consistent with the stage's read-only scope).
- **`day_slots` is emitted only when a lift occupies ≥2 day-slots** — for a
  single-slot lift the per-slot series equals the headline, so it's omitted to
  keep the payload focused.
- Roadmap [12](12-connector-coaching-roadmap.md) is now fully implemented
  (Stages 1–5 all landed).

## 2026-06-18 — Connector coaching roadmap Stage 4: `edit_mesocycle` write tool

Fourth stage of [12-connector-coaching-roadmap.md](12-connector-coaching-roadmap.md).
Closes the biggest *functional* gap: the write surface was create + delete only,
so "analyze → suggest → apply on approval" had no **apply** step. `edit_mesocycle`
is the first structural write on an existing meso, unlocking agentic rebalancing
(e.g. `get_muscle_balance` flags quads below MEV → add a slot → ramp it forward).
The LLM edits **structure + the week-1 baseline only**; the **engine still owns
every prescribed number** (hard rule #3) and logged history is never touched
(hard rule #5). **No schema, no migration** — it re-saves the planner board through
the existing app query layer.

### Done

- **Pure edit core (`applyMesoEdits`, `src/lib/mcp/tools/edit.ts`).** A neutral,
  I/O-free model of the planner board (days → groups → slot fills) plus a
  transformer that applies a sequence of the five Stage-4 operations and emits a
  fresh `PlanDayInput[]` for `saveMesoPlan`. Pure (no clock/IO/randomness),
  order-sensitive, and **non-mutating** (deep-clones its input). The five
  operations (12 §Stage 4): `add_exercise` (day + muscle-group name + exercise id,
  optional baseline sets — creates the group block if absent), `remove_exercise`
  (by `slot_id`; shrinks the group, drops a group emptied by the removal),
  `swap_exercise` (`slot_id` + new exercise, sets/position preserved),
  `reorder_day` (full day permutation by `slot_id`, validated), and
  `set_baseline_sets` (week-1 baseline on a slot). Day positions are renumbered
  1..n; a group that would exceed the 10-slot cap is rejected.
- **`edit_mesocycle` tool.** Validates with zod (a `discriminatedUnion` over the
  five ops, ≤20 per call), identity from the session (no `user_id` — hard rule #5).
  Server-side business validation: only a **planned or active** meso is editable
  (a `completed`/`abandoned`/`draft`/`unplanned` one is refused); add/swap
  exercise ids must exist & be RLS-visible; muscle-group names resolve via the
  shared `resolveMuscleGroupIds`. **Target rule (decision #1):** for an active
  meso, a day whose **current-week** workout is completed or in progress is
  refused; untouched later days of the current week — and all future weeks — stay
  editable. On success it `saveMesoPlan`s the edited board and, for an active meso,
  runs `regenerateOpenWorkouts` so the engine **ramps the new structure forward**
  into the open (not-started) workouts; completed/in-progress/skipped workouts and
  every logged set are untouched. Records a `mcp_write_audit` row.
- **Tests (`__tests__/edit-tools.test.ts`, +16 → 353 total).** `applyMesoEdits`
  across every operation (add to existing/new group, slot-cap rejection, remove +
  group-drop + gap-close, swap, baseline, reorder + permutation guard),
  composition + touched-day reporting, **purity** (input unchanged), untouched-day
  preservation; tool registration, the no-`user_id` contract, and
  unauthenticated-call rejection. `EDIT_MESOCYCLE` added to the write-tool
  registration suite.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (353/353), `npm run build`
all green. The tool reuses the smoke-tested `saveMesoPlan` + `regenerateOpenWorkouts`
path the app's own `saveMesoPlanAction` uses for active mesos, so the structural
merge / logged-history protection is the proven one. End-to-end `tools/call`
against the deployed connector (edit an active meso → confirm open workouts
re-derive while logged history is intact) is the owner's check once merged.

### Notes / deviations

- **In-place only (the stage's default).** The open question (save-to-template +
  restart for larger restructures) is left to the in-app path; `edit_mesocycle`
  stays bounded to the five operations.
- **Reorder on an *active* meso takes full effect on the plan and on future,
  not-yet-generated weeks; already-generated open workouts keep their current
  exercise order** — `regenerateOpenWorkouts` is a structural *merge* (add/remove
  + keep surviving prescriptions), it doesn't reseed order, consistent with the
  app's own plan-save. Live within-session reordering stays an in-app action. On a
  **planned** meso (no workouts yet) reorder applies in full.
- **`set_baseline_sets` is the week-1 baseline (`meso_exercises.initial_sets`).**
  On an active meso the structural merge keeps each surviving exercise's
  engine-progressed prescription, so changing the baseline only affects
  newly-added slots and future-generated weeks — it never rewrites an
  already-generated week. Documented in the tool copy.
- **Editing normalizes a *touched* group's slot count to its filled slots**
  (an add grows it, a remove drops the open slot); untouched groups/days keep
  their exact structure, so a planned open slot elsewhere survives an unrelated
  edit. Over MCP the model fills slots directly, so this trades the (planner-only)
  open-slot affordance for predictable, fully-filled days.
- Stage 5 (session-order / fatigue-position normalization) remains open and is
  gated on its own data-capture check; it enhances Stage 3 and is independent of
  this stage.

## 2026-06-18 — Connector coaching roadmap Stage 3: analysis comparability

Third stage of [12-connector-coaching-roadmap.md](12-connector-coaching-roadmap.md).
Fixes the false-stall class of bug (the Dumbbell Curl that read `declining −18%,
stalled`) by making single-exercise analysis **compare like with like** — the four
Stage 3 levers, all read/interpretation only (the engine still owns every
prescribed number; honors [10] §9). **No schema, no new tool, no migration.**

### Done

- **Pure comparability analysers (`src/lib/analysis/comparability.ts`).** A new
  neutral module (imported by both the query and MCP layers, so no
  queries→server dependency):
  - `pickSessionE1rm` — a session's representative e1RM is the strongest set in
    the **most trustworthy confidence tier present** (a high-confidence 35×8 beats
    a bigger low-confidence 20×11 number), folding RIR into effective reps via the
    engine's `estimateE1rm` and carrying the [10] §1 band. (#3)
  - `analyzeComparableProgress` — the **headline is the current phase only** (the
    trailing run sharing the latest session's `goal_type`), and trend is driven by
    a **rolling representative** (the trustworthy max over the last N sessions),
    never a single latest read. Kills both the "latest was the light Day-3 slot"
    artifact and the alternating-slot sawtooth. (#1, #2)
  - `segmentPhases` — splits the lifetime series into contiguous `goal_type`
    blocks so each phase reports on its own terms. (#2)
  - `matchedRirComparison` — current vs previous meso compared **at the same
    prescribed target RIR** (decision #2: RIR is the alignment key, not W·D),
    flagged `cross_phase` when the goals differ. (#4)
- **Enriched reader (`getExerciseSessions`, `src/lib/queries/coaching.ts`).**
  Replaces `getExerciseE1rmSeries`: reads `logged_sets` per session (paginated,
  RLS-scoped), computes the RIR-folded confidence-weighted top-set e1RM via the
  engine, and tags each session with its block goal (`macrocycles.goal_type`) and
  prescribed RIR (`microcycles.target_rir`) — the comparability dimensions
  `v_exercise_history` (Epley-only, no RIR/goal/RIR) couldn't supply.
- **Rebuilt `analyze_exercise_progress`.** Now returns `progress` (current-phase
  rolling + confidence trend), `lifetime` (raw endpoints **explicitly flagged when
  they cross a phase**), `phases[]`, and `matched_rir[]`, plus a `confidence_mix`
  in `data_quality` and metric definitions naming each window. The note caveats a
  cross-phase history and an all-low-confidence phase.
- **Tests (+18 → 337 total).** `analysis/__tests__/comparability.test.ts` covers
  tier-preference, phase segmentation, every trend (improving / plateau /
  declining / insufficient), the **sawtooth-not-declining** and **cut→bulk
  segmentation** cases from the roadmap's driving example, low-confidence
  down-weighting, and matched-RIR; `coaching-tools.test.ts` asserts the tool shape.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (337/337), `npm run build` all
green. End-to-end `tools/call` against the deployed connector is the owner's check
once merged.

### Notes / deviations

- **e1RM now folds RIR (Epley·Brzycki average via the engine) in the analysis**,
  where `v_exercise_history`/`v_exercise_overview` stay Epley-only. The tool keeps
  the overview's lifetime `best_e1rm_estimate` for continuity and clarifies in
  `metric_definitions` that the confidence-weighted current-phase best lives on
  `progress` — a deliberate split, not drift.
- **Confidence display weights (1.0/0.6/0.25) are module constants, not
  `engine_params`** — read-side presentation weights, not a prescription tunable,
  consistent with the Stage 2 fractional-weight call. The high/moderate/low
  *bands* themselves remain the engine's `e1rm.*` params.
- **`get_mesocycle_summary.progress_scores` left as-is.** Within a single meso the
  goal_type is constant (phase-awareness moot) and it is the in-app, shared-view
  metric ("one definition of progress"); changing it risks UI drift for little
  gain. Noted as scoped-out rather than silently skipped.
- Stages 4–5 (`edit_mesocycle`, session-order normalization) remain open; Stage 5
  would sharpen the per-slot read this stage already defuses.

## 2026-06-18 — Connector coaching roadmap Stage 2: per-day session classification

Second stage of [12-connector-coaching-roadmap.md](12-connector-coaching-roadmap.md).
Stops the "your low-set days are under-trained" misread when those days are legs
by design (the observed gap: leg days carry fewer sets than upper days). Adds a
deterministic, derived per-day **emphasis** label computed from the [10] §7
fractional-volume PPL map — **context, not a verdict** (12 §2). Read/derived only;
**no schema, no new tool, no new stored column**.

### Done

- **Pure classifier (`src/lib/engine/classification.ts`).** `pplCategory` — the
  canonical [10] §7 push/pull/legs map on the app's seeded muscle-group vocabulary
  (single `shoulders` group → push; traps/forearms → pull; abs/unmapped → null).
  `classifyDayEmphasis(slots)` credits each slot's planned sets fractionally
  (1.0 primary / 0.5 secondary) across the exercise's **own** muscle roles, sums
  per PPL category, and labels the day `legs` / `upper-push` / `upper-pull` /
  `upper` / `full-body` / `unclassified` by dominant share. Pure + deterministic;
  thresholds documented and overridable for tests.
- **One PPL map.** `src/lib/queries/stats.ts` `balanceCategory` now delegates to
  `pplCategory`, so the in-app balance cards and the connector's per-day
  classification share a single definition (no drift).
- **Surfaced in `get_mesocycle`.** Each day carries an `emphasis`
  `{ classification, fractional_sets, total_fractional_sets, dominant }`. The tool
  fetches the exercises' muscle roles (new `getMusclesForExercises` reader,
  `src/lib/queries/exercises.ts`, RLS-scoped) and the description/note frame the
  label as fair-reading context, not judgment.
- **Surfaced in `get_muscle_balance`.** Gains a `days[]` breakdown (per day:
  planned sets + emphasis) via the shared `buildDayEmphasisList`, so "is my volume
  uneven?" distinguishes a lower-set leg day (legs by design) from a genuine
  deficit. The MEV/MAV/MRV deficit read is unchanged — the label only adds context.
- **Tests (+16 → 319 total).** `engine/__tests__/classification.test.ts` covers the
  §7 map and every label (legs / upper-push / upper-pull / upper / full-body /
  unclassified), fractional 0.5 secondary counting, zero/negative-set handling, and
  determinism; `read-tools.test.ts` and `coaching-tools.test.ts` assert the derived
  emphasis surfaces in `get_mesocycle` and `get_muscle_balance`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (319/319), `npm run build` all
green. The classification reuses the §7 map + fractional counting per the stage's
constraints; no schema/migration. End-to-end `tools/call` against the deployed
connector is the owner's check once merged.

### Notes / deviations

- **Fractional weights (1.0/0.5) are module constants, not `engine_params`.** The
  §8 sketch listed `volume.direct/indirect` but the implemented schema never added
  them; `server.ts`/`coaching-guide.ts` already treat 1.0/0.5 as the fixed §7 rule,
  so the classifier matches that rather than inventing a param field (which would be
  a schema/version change out of scope for a read-only stage).
- **Classification uses each exercise's own muscle roles**, not the planner group's
  assigned muscle — the §7-correct attribution, so a movement's true stimulus drives
  the label.
- Stages 3–5 (analysis comparability, `edit_mesocycle`, session-order) remain open;
  this stage is independent of them.

## 2026-06-18 — Connector coaching roadmap Stage 1: paradigm + persona

First stage of [12-connector-coaching-roadmap.md](12-connector-coaching-roadmap.md).
Aligns the assistant with the app's science-based training paradigm so it reasons
*with* the engine instead of second-guessing it, and inherits the [10] §9 honesty
guardrails. Pure docs/instructions distillation — **no schema, no new tool**
(per the stage's stated constraints).

### Done

- **Extended server instructions (`src/lib/mcp/server.ts`, `MCP_INSTRUCTIONS`).**
  Added a compact **training paradigm** section (RIR ramp with 0-RIR as a
  peak-week ceiling, fractional 1.0/0.5 volume counting, MEV→MRV autoregulation,
  deload as a fatigue valve, "suspect comparability before regression") and a
  **coaching stance** block reproducing the §9 guardrails (e1RM is a trend;
  pump/soreness weak/secondary; deloads not a growth booster; push:pull
  advisory; rate-of-gain & landmark numbers heuristic). Reframes per the stage:
  the **client owns tone**, the **server owns domain paradigm + guardrails** —
  explicitly steers off a motivational-trainer voice that overclaims. Points at
  the new resource for depth so the string stays short (<3 KB).
- **New `workout://coaching-guide` resource (`src/lib/mcp/coaching-guide.ts`,
  registered in `resources.ts`).** Long-form markdown distilled from [10] (not
  invented): e1RM + confidence bands, fractional volume, the MEV/MAV/MRV landmark
  table, RIR ramp, the workload→sets autoregulation (joint-pain gate → workload →
  pump nudge → MRV stop), double progression, deload, macro targets, the §9
  guardrails verbatim-in-intent, and a **comparability** section (cross-phase,
  slot pooling, single-latest, confidence) with primary-source citations. Static
  reference text — no user data, so no session resolution.
- **Tests (+8 → 303 total).** `__tests__/server.test.ts` asserts the
  instructions teach the paradigm, carry the guardrails, point at the resource,
  and stay short; `read-tools.test.ts` asserts the coaching-guide resource
  registers, serves `text/markdown` without an auth context, and covers the
  guardrails / landmarks / comparability.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (303/303) green.

### Notes

- Stages 2–5 (per-day classification, analysis comparability, `edit_mesocycle`,
  session-order normalization) remain open; this stage is independent of them.
- The guide deliberately tells the model the landmark/ramp numbers are tunable
  `engine_params` defaults and must be read from the params, not hard-coded into
  advice — consistent with hard rule #3.

## 2026-06-17 (latest) — MCP tooling review: metric-truth view fixes

Response to the external *MCP Tooling Review* — full triage in
[mcp-tooling-review-response.md](mcp-tooling-review-response.md). Every finding
was verified against the code and reproduced read-only against the live project
before changing anything.

### Done

- **P0-1 — `v_meso_summary` join fan-out (metric inflation).** The view joined
  `logged_sets` with `workout_exercises` + `exercise_feedback` +
  `workout_feedback` on the workout grain, so each set was multiplied by
  `(#exercises × #feedback rows)`. This inflated `working_sets` (1104 → **153**)
  and `total_volume` (859k → **138k**) and skewed feedback averages. Migration
  `20260617000003_metric_truth_view_fixes.sql` pre-aggregates set facts and the
  two feedback tables in separate CTEs. Added `working_reps` (true rep sum) to
  the view, `VMesoSummaryRow`, and `get_mesocycle_summary`.
- **P0-2 — `v_meso_week_sets` planned-set fan-out.** `sum(prescribed_sets)` was
  multiplied by logged-set count per exercise (the real cause of "45 planned vs
  15 logged"; both sides already use the same `muscle_group_id` attribution).
  Rewritten to collapse each `workout_exercise` first. Planned now equals logged
  for completed weeks.
- **P1-1 — adherence denominators.** `get_mesocycle_summary` now returns an
  explicit `adherence` object (attended/due vs completed/generated +
  `block_completion_pct`); legacy `adherence_pct` retained.
- **P0-5 (partial) — `compare_mesocycles`.** Added `comparison_basis`, per-block
  `sets_per_workout` / `volume_per_workout` rates, and `warnings[]` for
  active/incomplete, unequal-duration, and deload-mismatch comparisons.
- **P0-4 (partial) — decision linkage.** `get_engine_decisions` now returns
  `exercise_id` + `workout_exercise_id` (already resolved, previously dropped).
- **P2 — macro placeholder names.** Extracted pure `placeholderName()`; auto
  names re-align to position on reconcile (no more "Mesocycle 4" at slot 3 / two
  "Mesocycle 5"s). User-renamed slots untouched.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (229/229) green. Both view
fixes reproduced read-only against the live DB. New tests cover `working_reps`,
dual adherence denominators, compare normalization/warnings, and
`placeholderName`.

### Deferred (need schema/engine work — own PRs; see review-response doc)

P0-3 engine-params immutable snapshots (read-time default-merge breaks
historical reproducibility); P0-4 full decision integrity (persist source +
immutable `logged_set_id`/`sequence_index`, RIR-fallback note, structured
trace); P1-2 chainable `get_mesocycle`; P1-3 replay diagnostics + simulation;
P1-4/P2 common response envelope + cross-tool consistency.

## 2026-06-17 — Responsiveness Slice 2: instant nav skeletons + request dedup

Builds on Slice 1. Makes page switches paint immediately and trims redundant
per-render queries.

### Done

- **Route loading boundaries.** `(app)/loading.tsx` (generic tab skeleton) plus
  DayView-shaped overrides at `(app)/workout/loading.tsx` and
  `(app)/log/[workoutId]/loading.tsx`. Paired with the Slice 1 BottomNav
  prefetch, a tapped tab now paints a skeleton instantly instead of blocking on
  the RSC fetch. New `Skeleton` + `DayViewSkeleton` primitives (square, ink-wash,
  pulse disabled under prefers-reduced-motion).
- **Request-level dedup.** `getActiveEngineParams` wrapped in React `cache()` —
  it was read twice per `/log` and `/workout` render (page + `getWorkoutDetail`).
  Safe: the active params are global and immutable within a request. `getProfile`
  deliberately left uncached (can change mid-request after an update).

### Verified

`npm run typecheck`, `npm run lint`, `npm run build` green.

## 2026-06-17 — Responsiveness Slice 1: set-logging hot path + nav feedback

First slice of a broader speed/responsiveness pass. Goal: every common action
acknowledges the tap **immediately**, and background writes never block the UI.

### Done

- **`LogCheckbox` (`src/components/ui/LogCheckbox.tsx`).** The set LOG control as
  a single 21px square with three states: empty outline → **in-flight perimeter
  spinner** (the outline itself with a gap travelling the perimeter, an animated
  SVG `stroke-dashoffset` with `pathLength=100`) → filled `✓`. Honors
  `prefers-reduced-motion` (gap pulses in place instead of travelling). Brief
  shake + rollback on failure.
- **Background set logging.** `SetRow` now logs via a **per-row `useTransition`**
  so only the tapped box spins; the write is fire-and-forget. **Removed the
  redundant `router.refresh()`** — the server action already `revalidatePath`s,
  so the box resolved via the action's own RSC refresh instead of a *second*
  full `getWorkoutDetail` refetch (13 round-trips + a 600-set e1RM scan) per tap.
  Uncheck uses the same path. On failure the box rolls back (shake) and a quiet
  toast appears.
- **Toast surface (`src/components/ui/Toast.tsx`).** Minimal context provider
  mounted in `(app)/layout.tsx` for non-blocking write failures (online-only, no
  offline outbox, per CLAUDE.md hard rule #9).
- **Nav feedback (`BottomNav`).** Explicit `prefetch` + `useLinkStatus` so a
  tapped tab marks itself (■ cue + pulse) instantly, before the next route paints.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (219/219), `npm run build`
all green.

### Roadmap (later slices, not in this PR)

- Tag-scoped caching so logging a set invalidates only the sets, not the cached
  e1RM anchors; cache the recency-weighted anchors so they aren't recomputed per
  tap. Per-route `loading.tsx` skeletons. Stale-while-revalidate for read-heavy
  stats/history surfaces.

### Deviations

- Logging is **spinner-on-control**, not blind-optimistic: the box shows the
  in-flight spinner until the server confirms, then flips to `✓` (owner's choice).
  This keeps the LOG box honest about persisted state while still acknowledging
  the tap instantly.
## 2026-06-17 (latest) — Feedback batch 2: template filters, multi-slot fix, workout add-exercise, menu cleanup

On-device follow-up to the previous batch. Same branch/PR (#27); `main`
deployable; no schema change.

### Done

- **Template filters.** The templates tab gains a filter bar — **days/week, split
  (emphasis), and intended audience** — alongside search. `listTemplates` takes
  the filters (`TemplateFilters`); the client `TemplateFilters` bar updates the
  URL query so the server page re-queries. A gender filter includes the
  gender-neutral ("any") templates; search preserves the active filters.
- **Multi-slot planner fix.** In the flat board (#2), a group set to N exercises
  now renders **one open-slot row per open slot** (was a single collapsed
  "N slots" row), and picking **fewer** exercises than the configured count
  **no longer shrinks the group** — `setGroupExercises` (staged + live query)
  keeps `exercise_slots = max(picked, configured)`, so the remaining slots stay
  open and fillable.
- **Workout "Add exercise."** New `⋮`-menu action (active workouts) opens a picker
  with **open muscle-group + equipment filters** + search; picks are appended to
  the **bottom** of the day's list (`addWorkoutExercises` → bottom position,
  primary muscle group, prescription seeded from the user's best) and reorder as
  normal. New `getAddExerciseCandidates` query + `addWorkoutExercisesAction`.
- **Workout menu cleanup.** Removed the planner deep-links ("Edit mesocycle" and
  "Edit day") from the workout `⋮` menu — all in-session editing now happens on
  the workout page (add / remove / reorder / replace), consistent with the
  post-log direction. Stats / End workout / End mesocycle remain.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (224/224), `npm run build`
all green. On-device QA of the add-exercise picker, the multi-slot planner flow,
and the template filters is the owner's check.

### Notes

- Removing **"Edit day"** (not just "Edit mesocycle") from the workout menu is a
  deliberate extension of the requested change — both opened the planner, which
  the post-log model moves away from.
- The add-exercise picker is multi-select and appends in selection order; a newly
  added exercise seeds `prescribed_sets = 3` at the user's all-time best, then the
  engine carries it forward like any other slot.

## 2026-06-17 — Feedback batch: templates, flat planner, post-log lock, workout-page propagation, fixes

Seven on-device feedback notes addressed in one vertical slice. `main`
deployable; one append-only data migration (stock templates); no schema change.

### Done

- **#1 Stock template library** (`supabase/migrations/20260617000002_seed_stock_templates.sql`,
  applied to hosted). Eight well-designed stock templates (`templates.user_id` null)
  spanning day counts 2–6, splits (full body, upper/lower, push/pull/legs ×2,
  five-day body-part, upper-emphasis, glute/lower-emphasis), and intended
  audiences (any/male/female). Fully structured in the groups-first shape so each
  opens the planner prefilled. The seed resolves exercises by name **disambiguated
  by the slot's muscle group** (so duplicate names like "Hack Squat" land
  correctly) and is **idempotent** (guarded on a sentinel name). `template_day_groups`
  is unique per (day, muscle group), so a day's repeated group is one group with
  multiple ordered slots.
- **#2 Flat, cross-group planner ordering.** The planner board renders each day as
  one flat ordered list of exercises (muscle-group badge per row) instead of fixed
  group sections; ▲▼ move an exercise **anywhere in the day, across groups** (glute
  → quad → glute is now expressible). `meso_exercises.position` becomes the
  **day-level** order; every writer emits day-wide positions (`saveMesoPlan`, live
  `setGroupExercises` append-after-max, `applyTemplateToMeso`, `copyMesoStructure`,
  MCP `create_mesocycle`); new `reorderDayExercises` powers live draft reordering;
  `getMesoPlan` + generation's `buildDayExerciseRows` sort by it (group + slot
  tie-breaks keep legacy rows clustered → existing mesos unchanged). The order
  flows through generation into the logged workout (DayView is position-ordered)
  and the read-only planned-day preview (now also flat). The EDIT DAY sheet still
  manages groups, slot counts, and group order; open slots render below the list.
- **#3 Post-log meso lock.** The mesocycle summary page hides the EDIT entry point
  once any set is logged (`getMesoDeletionImpact.hasHistory`), with a note that
  edits move to the workout page.
- **#4 Workout-page reorder & substitution propagation.** Reorders on a live
  workout persist and carry forward to the **same training day in later incomplete
  weeks** automatically (match by exercise id; unmatched stay at the end).
  Substituting an exercise gains a **"Repeat this swap on this day in future
  weeks" checkbox** — checked applies to future incomplete same-day workouts,
  unchecked stays local. Logged history is never touched (the replace no-ops where
  sets exist). New helpers `getFutureSiblingWorkoutIds` / `propagateExerciseOrder`
  / `propagateSubstitution` + a pure `reorderToMatch` (unit-tested). New weeks
  still generate from the prior week's workout, so the change also chains forward.
- **#5 Equipment-settings crash.** Legacy `preferred_equipment` values (a pre-pivot
  account stored `free_weights`/`machines`/`cables`) failed the zod enum parse and
  crashed the profile toggle. Sanitised to the canonical vocabulary in both the UI
  (`ProfileEditor`) and `setEquipment`, and cleaned the affected live row.
- **#6 Cycle sort order.** Cycles page lists macros and standalone mesos
  newest-first (`getCyclesOverview` orders by `created_at desc`).
- **#7 New-template button.** Templates `+ NEW` now starts a draft and opens the
  planner board; the planner board gains a **SAVE AS TEMPLATE** action (both draft
  and editing modes) so the planner is the single build-and-save surface.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (224/224, +5 for
`reorderToMatch`), `npm run build` all green. Templates seed applied to hosted and
row counts confirmed (8 templates, 2–6 days, 9–30 exercises each). The flat-order
change is backward compatible: generation/board tie-break by group+slot, so
existing mesos (position = legacy slot_number) keep their current order; only an
explicit reorder/save writes day-wide positions. On-device QA of the planner
flat-list interactions and the workout-page propagation is the owner's check.

### Deviations / notes

- **Templates store group-clustered order** (schema is one muscle group per day,
  multiple ordered slots), so a template can't encode an interleaved cross-group
  order; the flat ordering (#2) is a meso-planner capability. Re-applying a
  template clusters by group, then the user can interleave.
- **#4 propagation reaches already-materialised future weeks**; weeks generated
  later inherit via the prior-week copy, so no extra plumbing into the engine.
  Add/remove of an exercise stays per-workout (only reorder + substitution
  propagate, per the note).
- **#3 leaves the Day-View `⋮` "Edit mesocycle/day" planner links** in place — they
  open the planner, which still allows future-only edits; the note scoped the lock
  to the summary page.

## 2026-06-17 — Phase 6 Slice 4: MCP admin/tuning + replay (Phase 6 complete)

Final Phase 6 slice — the **admin/tuning + replay** surface, role-gated by
`profiles.role = 'admin'`. The MCP connector is now the entire admin interface
(08 §3): inspect decisions → propose a params version → replay real history
against it → review diffs → activate, all in chat, no admin UI, no deploy. One
additive index migration. Same branch/PR; `main` deployable. **Phase 6 done.**

### Done

- **Admin tools (`src/lib/mcp/tools/admin.ts`, `registerAdminTools`).**
  `list_engine_params`, `get_engine_params` (single version or a dot-path **diff**
  of two), `propose_engine_params` (writes a new **inactive** version; `base_version`
  + partial overrides deep-merged, then **`engineParamsSchema`-validated** — a
  malformed set is rejected and can never be activated), `activate_engine_params`
  (requires `confirm_version` to echo `version`; deactivates the current active
  first to respect the single-active partial unique index), `get_engine_decisions`
  (the caller's own decisions, filter by params version / exercise / date), and
  `replay_decisions` (re-run stored decisions against a candidate version, return
  load/reps/sets/RIR diffs — read-only, nothing written). Every tool is gated by
  `resolveAdmin` (denies non-admins); the two writes audit to `mcp_write_audit`.
- **Pure helpers (exported, unit-tested).** `deepMerge` (nested param overrides
  without dropping siblings, no mutation), `diffParams` (differing dot-paths),
  `diffPrescription` (changed prescription fields, ignores rationale prose), and
  `replayDecisions` (re-runs `prescribe(storedInputs, candidateParams)`, counting
  changed/errored — malformed historical inputs are counted as errors, never
  crash the call).
- **Query layer (`src/lib/queries/engine-admin.ts`).** `listEngineParams`,
  `getEngineParamsVersion`, `proposeEngineParams`, `activateEngineParams`,
  `getEngineDecisions`. `engine_params` RLS already gates writes to `is_admin()`,
  so the admin's own token-bound client suffices — **no service role** for tuning;
  service role stays only for the `mcp_write_audit` insert.
- **Migration `20260617000001_engine_decisions_inspector_idx.sql`** (applied to
  hosted): additive index `engine_decisions (user_id, params_version, created_at
  desc)` for the inspector/replay version filter. No table/column/RLS change;
  advisors show no new problematic lints (the index reads "unused" until first
  query, expected; the pre-existing `auth_rls_initplan` WARN is unrelated).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (219/219, +12), `npm run build`
green; migration applied to hosted and the index confirmed present. The replay
path re-runs the **real engine** (`prescribe`) over stored inputs, so a diff is
exactly what would change. End-to-end admin loop against hosted (propose →
replay → activate) is the owner's check with an admin account.

### Deviations

- **Inspector/replay are scoped to the calling admin's own decisions** (no
  `user_id` argument) to keep hard rule #5 absolute. Cross-user admin inspection
  would need a deliberate rule-5 exception; deferred. In practice an admin tunes
  against their own real mesos.
- **`propose_engine_params` takes `base_version` + a partial override** (deep-merged)
  as the ergonomic path, as well as a full params object — either way the result
  is schema-validated before storage.

## 2026-06-17 — Phase 6 Slice 3: MCP write/planning tools (audited drafts)

07 Phase 6 **Slice 3** — the write/planning surface. Seven tools that let the
model propose *structure* while the **engine fills every prescribed number**;
all writes are draft/append, RLS-scoped, and recorded to `mcp_write_audit`. No
deletes of logged history (hard rule #5). Same branch/PR; `main` deployable; no
schema change.

### Done

- **Write tools (`src/lib/mcp/tools/write.ts`, `registerWriteTools`).**
  `create_macrocycle` (engine `planMacrocycle` sizes target/timeframe/meso-count/
  phases + unplanned placeholders), `create_mesocycle` (groups-first → `planned`
  for in-app review; engine sets numbers on activation), `create_template` (from
  an existing meso), `create_custom_exercise`, `update_macrocycle_goals` (engine
  re-plans unplanned slots only; locked mesos + logged history immutable),
  `manage_exclusions` (add/remove by exercise), `log_note` (durable pinned note;
  empty clears). Each validates with zod, resolves identity from the session,
  and returns a friendly `{ ok, … }` result.
- **Audit trail (`src/lib/mcp/audit.ts`).** `recordMcpWrite(userId, tool, args,
  summary)` writes one `mcp_write_audit` row per successful write — tool name, a
  **sha256 hash of the args** (not the raw note text), and a short summary. The
  table has no user-insert policy, so this is the single service-role write site
  (hard rule #4), always with the server-derived `userId`. `hashArgs` is pure +
  unit-tested.
- **Pure `resolveMuscleGroupIds`.** Maps requested muscle-group names → library
  ids (case-insensitive, trimmed), collecting unknowns so a typo fails cleanly
  instead of silently dropping a group. Unit-tested.
- **New query reader.** `removeExclusionByExercise` (exercises.ts) — the MCP
  addresses exclusions by exercise id, not exclusion-row id.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (207/207, +7), `npm run build`
green. Write paths reuse the smoke-tested app query layer (`createMacrocycleWithMesos`/
`saveMesoPlan`/`updateMacrocycle`/`createCustomExercise`/`savePinnedNote`), all
user-scoped through existing RLS; the engine — not the model — fills prescriptions.
End-to-end drafting against hosted (verify a drafted meso surfaces in-app as
`planned`) is the owner's check.

### Deviations

- **`create_mesocycle` drafts a standalone meso** (`macrocycle_id` null) rather
  than filling a macro `position` — cross-entity slot attachment is fragile over
  MCP; the user attaches it to a macro slot in-app. Recorded; revisit if needed.
- **`log_note` is pinned-only.** Session log notes are RLS-gated to the live
  workout (completion lock) and need a `workout_exercise_id` no read tool
  currently surfaces, so the MCP writes the durable pinned note; session notes
  stay an in-workout action.
- **`create_custom_exercise` omits tracking type** — `exercises.tracking_type`
  isn't in the schema yet (09 backlog, deferred), so the column isn't written.
- **No in-app revocation/inspector for the audit log this slice** — the audit
  table is owner-readable; surfacing it is a later UI concern.

## 2026-06-17 — Phase 6 Slice 2b: MCP coaching suite

Completes 07 Phase 6 **Slice 2** — the coaching/analysis tools on top of the
Slice 2a read surface. Six read-only tools giving the model a coach's-eye view,
built on the shared views + the pure engine; no write surface, no migration.
Same branch/PR as 2a; `main` deployable.

### Done

- **Coaching tools (`src/lib/mcp/tools/coaching.ts`, `registerCoachingTools`).**
  `get_training_overview` (one-call snapshot: who + current position + active-meso
  adherence/fatigue + key-lift e1RM trend), `get_recent_sessions` (reverse-chron
  completed workouts with session feedback + notes), `analyze_exercise_progress`
  (e1RM trend + **stall/plateau detection**), `compare_mesocycles` (side-by-side
  rollups, caller order preserved), `get_muscle_balance` (push/pull/legs split +
  per-muscle weekly sets, advisory-only), `get_exercise_affinity` (the
  exercise-selection profile — frequency/recency/loads × pinned note × aggregated
  joint-pain/workload/pump feedback, exclusions respected).
- **Pure `detectStall`** (exported, unit-tested): classifies an e1RM series as
  improving / plateau / declining by comparing the recent window's best against
  the prior best (tolerance-guarded), with `sessions_since_best`. Drives the
  progress analysis without touching the engine.
- **New query-layer readers (`src/lib/queries/coaching.ts`).** `getRecentSessions`,
  `getExerciseAffinity` (the `logged_sets`/`v_exercise_overview` × muscle-groups ×
  notes × feedback rollup), and `getExerciseE1rmSeries` — all RLS-scoped, no
  service role.
- **Honesty guardrails (10 §9).** e1RM/strength labeled estimates everywhere;
  balance is advisory-only and explicitly states MEV/MAV/MRV landmarks are **not
  yet parameterized** (10 §8 remaining), so no per-muscle threshold is asserted;
  pump/soreness framed as secondary.
- **Tests (`__tests__/coaching-tools.test.ts`, +16 → 200 total).** `detectStall`
  across improving/plateau/declining/insufficient/null-handling, every shaper,
  registration of all six tools, the no-`user_id` contract, and
  unauthenticated-call rejection.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (200/200), `npm run build`
green. End-to-end `tools/call` against hosted is the owner's check.

### Deviations

- **`get_muscle_balance` uses the implemented push/pull/legs + per-muscle weekly
  sets** (the same `getMesoStats` balance the in-app screen shows) rather than
  MEV/MAV/MRV landmark comparison — those landmarks aren't in `engine_params` yet
  (10 §8 remaining). The tool says so in its payload, keeping it honest.
- **`get_exercise_affinity` aggregates feedback via `workout_exercises`** (the
  exercise↔feedback join), bounded to the user's trained exercises; capped at 60
  rows per call.

## 2026-06-17 — Phase 6 Slice 2a: MCP read/analysis tools

First half of 07 Phase 6 Slice 2 — the **read/analysis tool surface** for the
MCP connector. Twelve thin, zod-validated read tools wrapping the existing
`src/lib/queries/` layer + one new engine-decision reader; identity always from
the session (hard rule #5), every shape matching the in-app stats views (05
§Data-shape contract). Vertical slice; `main` deployable; no schema change. The
coaching suite (overview/recent-sessions/analyze/compare/balance/affinity) is
Slice 2b, next.

### Done

- **Read tools (`src/lib/mcp/tools/read.ts`, `registerReadTools`).**
  `get_profile`, `get_macrocycles`, `get_mesocycle` (groups-first plan),
  `get_mesocycle_summary` (adherence + volume + est. strength + feedback +
  per-exercise e1RM progress), `get_macrocycle_summary` (fig 2.2 target/timeline/
  stats via `planForMacro`), `get_exercise_history` (both note kinds),
  `get_muscle_group_volume` (planned vs logged sets per group per week),
  `search_exercises` (name/equipment/muscle filter), `search_templates`,
  `get_exercise_notes` (all pinned notes), `get_exclusions`, and
  `explain_prescription`. Each handler resolves identity from the token-bound RLS
  client; pure shaper functions (`formatProfile`/`formatMesoSummary`/… ) are
  exported and unit-tested without I/O, mirroring `formatCurrentState`.
- **New query-layer readers.** `getLatestPrescriptionDecision` (progression.ts) —
  the most recent `engine_decisions` row for one of the user's exercises (walks
  the user's `workout_exercises` → latest decision; RLS-scoped, no service role),
  surfaced by `explain_prescription`. `listAllPinnedNotes` (exercises.ts) — every
  pinned note with exercise names, for `get_exercise_notes`.
- **`workout://profile` resource** alongside `workout://current-cycle`, same
  shape as `get_profile`.
- **Honesty guardrails (10 §9) in copy.** e1RM/strength/targets labeled
  estimates; exclusions flagged "never recommend"; the prescription tool states
  the engine — not the model — owns every number.
- **Tests (`__tests__/read-tools.test.ts`, +24 → 184 total).** Pure-shaper tests
  for all twelve shapers (found/not-found, adherence math, estimate labels, both
  note kinds, custom-exercise flagging, week sorting), registration of every tool
  name, the **no-`user_id`-arg** contract across the whole surface, the profile
  resource, and unauthenticated-call rejection.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (184/184), `npm run build`
green. Tools are read-only over existing RLS-scoped views/queries + the pure
engine; no new write surface, no migration. End-to-end `tools/call` against the
hosted project (per the Slice 1 recipe) is the owner's check once merged.

### Deviations

- **Tool naming:** `get_mesocycle_summary` / `get_macrocycle_summary` (the spec
  lists `get_meso_summary` / `get_macro_summary`) — spelled out to read clearly in
  a client's tool list; constants documented in `read.ts`.
- **Read tools grouped in one `read.ts` module** with per-tool register functions
  + a `registerReadTools` aggregator, rather than one file per tool — keeps the
  twelve thin wrappers reviewable in one place (get-current-state.ts stays its own
  file). Matches the 05 §Module layout `tools/` intent.
- **`search_exercises` equipment is a free `z.string()`** (cast to `EquipmentType`)
  rather than a zod enum — the stored vocabulary has 14 values incl. legacy
  variants; an unmatched value simply returns no rows.

## 2026-06-17 — Phase 6: OAuth consent UI (connector handshake completable)

Builds the app-side **OAuth 2.1 consent flow** the Supabase OAuth server
requires, so an MCP client (Claude) can complete the authorization-code
handshake against WORKOUT. Human dashboard steps were completed by the owner
(OAuth server enabled, Authorization Path `/oauth/consent`, Site URL/redirects);
verified the AS discovery + dynamic client registration are live. `main`
deployable; no schema change.

### Done

- **Consent screen** `src/app/oauth/consent/page.tsx` — Supabase redirects here
  with `authorization_id`; the page requires a signed-in user (else
  `/sign-in?redirect=…` preserving the id), fetches
  `supabase.auth.oauth.getAuthorizationDetails`, and renders a ledger-styled
  consent screen (client name, account, redirect URI, requested scopes with
  plain-language labels) + Deny/Approve. Auto-redirects when already consented;
  graceful states for missing/invalid `authorization_id`.
- **Decision handler** `src/app/api/oauth/decision/route.ts` — POST calls
  `approveAuthorization` / `denyAuthorization` as the signed-in user (no
  `user_id` trusted) and 302s to Supabase's returned client `redirect_url`.
- **Sign-in redirect** — `signIn` honors a **same-origin** `?redirect=` param
  (`safeRedirect` guards against open redirects); the sign-in page carries it as
  a hidden field (Suspense-wrapped `useSearchParams`). Middleware now treats
  `/oauth/consent` + `/api/oauth/decision` as public (they manage their own
  auth and must preserve the id).

### Verified

`typecheck`, `lint`, `test` (160/160), `build` green. Runtime smoke on the built
server: `/oauth/consent` with no id → graceful 200; with an id but no session →
307 to `/sign-in?redirect=…` (id preserved); `/api/oauth/decision` → 400 (no id)
/ 307 to sign-in (no session). Confirmed against hosted Supabase: AS discovery
returns full metadata (incl. `registration_endpoint`) and **dynamic client
registration** returns a `client_id`. Full Claude connect (consent → token →
`get_current_state`) is the owner's end-to-end check (runbook Test C).

### Deviations

- No mockup for the consent screen — house ledger style (recorded).
- A test OAuth client was registered via DCR during the smoke check (harmless).

## 2026-06-16 — Phase 6 Slice 1: MCP transport + auth + get_current_state

First MCP connector slice (07 Phase 6, slice 1). `/api/mcp` is live as a
Streamable-HTTP **resource server** that validates Supabase-issued bearer JWTs
and exposes one grounding read tool. Vertical slice; `main` deployable; no
schema change. Verified end-to-end against the hosted project with a real token.

### Done

- **Deps.** Added `mcp-handler`, `@modelcontextprotocol/sdk`, `jose`.
- **Transport (`src/app/api/mcp/route.ts`).** Stateless Streamable-HTTP at exactly
  `/api/mcp` (Node runtime, `force-dynamic`); SSE disabled (retired from the spec,
  needs Redis). Server name/version + the domain **instructions string** (RIR,
  cycle hierarchy, units, "engine owns the numbers") wired in.
- **Auth bridge (`src/lib/mcp/auth.ts`).** `verifyMcpToken` validates the bearer
  JWT against the project **JWKS** (ES256 confirmed enabled on the hosted project)
  via `jose`, checking issuer `<url>/auth/v1`; identity (`sub`) is stashed in
  `authInfo.extra.userId`. `createMcpRlsClient(token)` forwards the JWT as the
  `Authorization` header so **RLS does per-user scoping** — no `user_id` ever
  crosses the tool boundary (hard rule #5). Missing/invalid token → `undefined`
  → 401.
- **Discovery (`/.well-known/oauth-protected-resource`).** RFC 9728 metadata via
  `protectedResourceHandler`, pointing clients at the Supabase OAuth AS
  (`MCP_AUTH_ISSUER` overrides). Built lazily per request (issuer resolved from
  runtime env, not build time) + CORS `OPTIONS`. The app auth middleware now
  treats `/api/mcp` + the metadata path as public (bearer-auth, not cookie-auth)
  so they aren't redirected to `/sign-in`.
- **Session + tool + resource (`src/lib/mcp/`).** `resolveSession(extra)` →
  `{ userId, token, clientId, scopes, client }` is the single identity-resolution
  point every handler starts from. `get_current_state` (empty input schema) wraps
  the existing `getCurrentState` query → pure `formatCurrentState` shaper
  (active macro→meso→micro→next workout + target RIR + one-line summary).
  `workout://current-cycle` resource returns the same shape. `server.ts` registers
  the surface; `tools/index.ts` is the slice-by-slice registry.
- **More → AI connector (fig 4.4).** Row now links to a new `/more/connector`
  page: intro, the copyable MCP endpoint, how-to-connect steps, and access/
  revocation notes. House ledger style (no specific mockup for the detail screen).
- **Tests (`src/lib/mcp/__tests__/`, +11 → 160 total).** A capture-server harness
  (`fakeAuthInfo`/`fakeExtra`) + tests covering `formatCurrentState` (no meso /
  full active / deload / meso-without-workout), tool+resource registration, the
  empty-input-schema contract, **auth-gating** (unauthenticated and
  no-`sub` calls both throw), and `verifyMcpToken` default-deny. `server-only` is
  aliased to a stub in `vitest.config.ts` so server-tagged modules are testable.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (160/160), `npm run build`
green. **Runtime smoke against the hosted Supabase project:** (1)
`/.well-known/oauth-protected-resource` returns correct metadata; (2) POST
`/api/mcp` with no/invalid token → 401 with a spec-compliant
`WWW-Authenticate: Bearer … resource_metadata=…`; (3) with a real ES256 user JWT,
`tools/list` shows the tool and `tools/call get_current_state` resolves identity
from the token and returns the RLS-scoped state (empty for the fresh test user) as
text + `structuredContent`.

### Setup runbooks added (2026-06-16 follow-up)

Documented the human-only setup in `docs/deployment/`: `mcp-connector-setup.md`
(architecture, enable-OAuth-server steps, env-var table, end-to-end test
recipes) and `manual-operations.md` (standing list of dashboard/secret ops
Claude can't perform). CLAUDE.md now points at both.

**Hosting clarification:** the MCP server is **co-hosted in the same Next.js app**
at `/api/mcp` (not a separate Vercel project, unlike the standalone
`ngs-inventory-mcp` pattern) — deliberate per 05 §Transport (shared query
layer/engine/views, stateless transport, Supabase is the auth server).

**Found while documenting (important):** Supabase's OAuth server requires the
app to host a **consent UI** at the configured Authorization Path
(`/oauth/consent` + `/api/oauth/decision`, via
`supabase.auth.oauth.getAuthorizationDetails/approve/deny`). This is required
app code **not built in Slice 1** — without it the authorization-code handshake
can't complete even once the server is enabled. `@supabase/supabase-js@2.108`
(installed) exposes the methods. Tracked as the immediate next slice.

### Remaining / external (carried to follow-up)

- **Enable Supabase's native OAuth 2.1 Server on the hosted project** — the
  resource-server side (JWKS verify, 401 discovery) is done and works with any
  Supabase-issued JWT, but the AS metadata endpoint
  (`/.well-known/oauth-authorization-server`) currently 404s, so DCR + the
  authorization-code/PKCE handshake a remote client uses to *obtain* a token isn't
  live yet. This is a dashboard toggle, not a code change. Once on, the connect
  flow on `/more/connector` works as written.
- **In-app revocation UI** depends on the OAuth-grants API surfacing connected
  clients; the connector page documents revocation via the client / connected-apps
  for now.
- Slices 2–4 (read/coaching suite, write/planning drafts, admin/tuning + replay)
  per 07 Phase 6.

### Deviations

- **No specific mockup for the AI-connector detail screen** (4.4 only specs the
  row); `/more/connector` is built in the house ledger style.
- A throwaway confirmed auth user was created during the hosted smoke test (no app
  data); harmless orphan, left in place (no service-role delete from this session).

## 2026-06-16 (latest) — Adherence rule: attended/due over working weeks, decided days only

Made the adherence definition correct as a stock rule (migration
`20260616000001_adherence_rule.sql`). The shared summary views now expose
`sessions_attended` (completed) and `sessions_due` (completed|skipped), both over
**working (non-deload) weeks only**; `macro.ts` computes adherence =
attended / due. Consequences:
- **Deload weeks excluded** — a skipped/short deload is never an absence.
- **Future/unstarted days excluded** — `planned`/`in_progress` aren't counted, so a
  meso in progress isn't dinged for days that haven't come up yet (only decided
  days — completed or skipped — count, i.e. days prior to the current one).
- Garron's completed macros read 91–96%; the active macro 88% (reflects only its
  3 real past misses, not the 3 upcoming week-3 days). Views recompute live.

## 2026-06-16 — Imported-history adherence fix (missed working-week days)

The history import only created `completed` workout rows for days that had logged
sets, so `v_macro_summary` / `v_meso_summary` showed **100% adherence** even where
sessions were skipped (workouts_total == sessions_logged). Fix: insert a `skipped`
workout for every planned day (`meso_days`) of a **working (non-deload) week** that
has no workout — deload weeks are left as-logged (their reduced volume is typically
intentional, not a miss). Views recompute live, so stats update immediately.

- Both build scripts now do this as their final step (`history-build.sql`,
  `history-build-standalone.sql`); applied to the live data for both accounts.
- Garron's completed macros now read 92–96% (was 100%); Madeline's mesos likewise.
## 2026-06-16 — Phase 6 (MCP connector) plan locked

Planning session for the MCP connector ahead of implementation in a separate session.
No code yet — this commit records the build decisions in the specs so the next session
launches straight from the docs. `main` unaffected.

### Decisions

- **Auth = Supabase's native OAuth 2.1 Server** as the authorization server (authorization-code
  + PKCE, **dynamic client registration**, JWKS/OIDC discovery, revocation; issues Supabase JWTs
  with `user_id`/`role`/`client_id`). `/api/mcp` becomes a pure **resource server** validating the
  bearer JWT via `mcp-handler`'s `withMcpAuth`, with **RLS doing per-user scoping**; service-role
  reserved for `mcp_write_audit` + admin cross-scope reads. No custom token table. This collapses
  the riskiest slice from "build an OAuth AS" to "verify a JWT + expose protected-resource
  metadata." (05 §Auth.) Requires enabling the OAuth server on the hosted project.
- **Vertical slices** (each deployable): (1) transport+auth+`get_current_state`+test harness,
  (2) full read/analysis + coaching suite, (3) write/planning drafts (audited), (4) admin/tuning +
  replay. (07 Phase 6.)
- **Tool surface expanded for coaching** beyond the original spec list: `get_training_overview`,
  `get_recent_sessions`, `analyze_exercise_progress` (stall/plateau detection), `compare_mesocycles`,
  `get_muscle_balance`, `get_exercise_notes`/`get_exclusions`, and **`get_exercise_affinity`** — an
  exercise-selection profile per muscle group / equipment type combining prior selection (frequency,
  recency, loads/volume) with pinned notes and aggregated session feedback, so advice/planning favor
  proven, well-tolerated movements and avoid flagged ones. All read-only on existing views + the
  pure engine. (05 §Coaching & analysis.)

### Codebase readiness (surveyed)

- `src/lib/mcp/` and `src/app/api/mcp/` do **not** exist yet — Phase 6 is greenfield on top of a
  built app.
- The `src/lib/queries/` layer (~90 fns, all `(client, userId, …)`-shaped) already covers nearly
  every read/write a tool needs; the pure engine (`prescribe`/`seedMeso`/`planMacrocycle`/
  `estimateE1rm`) is fully exported; `mcp_write_audit`/`engine_params`/`engine_decisions` and the
  shared `v_*` views all exist. **Missing data paths:** an `engine_decisions` reader, a param-version
  lister, and the affinity rollup — plus likely one index migration on `engine_decisions`.

### Verified

Docs-only change: `05-mcp-connector.md` (auth approach + coaching/analysis tool tables incl.
`get_exercise_affinity`), `07-implementation-plan.md` (Phase 6 reorganized into slices), this log.

## 2026-06-16 — Unified note sheet (pin checkbox) + Exercise-page pinned-note pencil + MCP notes contract
## 2026-06-16 (latest) — Live reps⇄weight⇄RIR predictor + auto-match-weights setting

Implements [11-workout-engine-explainer.md](11-workout-engine-explainer.md) §6
after design review. Vertical slice; `main` deployable.

### Done

- **Live reps prediction (request #1).** New pure engine module
  `src/lib/engine/reps.ts` — `predictRepsAtWeight` / `impliedRirAtReps` (invert
  the averaged Epley/Brzycki e1RM curve by bisection) + `recencyWeightedE1rm`
  (the strength anchor: each sample's e1RM weighted by
  `0.5^(ageDays/recency_halflife_days) × confidence`, pure — caller supplies
  ageDays). On the Day View, changing a set's weight now re-estimates the reps
  that hit the row's **target RIR** from the user's recent history, until the
  user types their own reps; future rows display the predicted reps at the
  planned weight. New param `e1rm.recency_halflife_days` (default 30 d, engine
  params **v6**). 13 golden/property tests.
- **RIR premise (decision).** No separate per-set RIR capture: the prescribed
  target RIR is the assumed RIR for all e1RM math (the app prescribes RIR and
  trusts the honest log). Anchor recency-weighted so it tracks current form
  (e.g. drops on a cut). Predicted reps = single integer.
- **Auto-match weights (request #3).** New `profiles.auto_match_weights`
  (migration `20260616000002`, off by default), More-tab ON/OFF toggle, and
  propagation of a just-entered weight onto the exercise's **unlogged** sets
  (via `prescribed_weight`; logged history untouched — hard rule #5). Rides the
  existing owner-only profiles RLS; new RLS tests added.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (141/141), `npm run build`
green. No mockup figure exists for these (live predictor is a behavior change,
not a layout change; the toggle mirrors the existing Units control) — the reps
field updates in place with no new chrome, so no pixel deviation to record.
RLS unchanged except the additive column (covered by existing policies).
## 2026-06-16 (latest) — Unified note sheet (pin checkbox) + Exercise-page pinned-note pencil + MCP notes contract

On-device feedback on the notes-model slice: the pinned vs session note should be
**one** entry with a pin toggle, not two menu items. This unifies the UI, adds the
Exercise-page pencil, and records the two-note contract for the MCP. No schema change.

### Done

- **One note, one sheet, a pin checkbox.** The exercise `⋮` menu now has a single
  **Note / Notes** row (was two: pinned + session). It opens a unified sheet with a
  textarea + a **"Pin to this exercise"** checkbox whose helper line states the
  difference plainly: checked → *"Stays on this exercise in every workout."*,
  unchecked → *"Saved with just this session — a note on how it went today."* The
  checkbox decides where the note lands (pinned `exercise_notes` vs session
  `exercise_feedback.notes`).
- **Move between buckets.** Flipping the pin on an existing note **moves** it rather
  than duplicating: pinning a session note clears the session copy; unpinning the
  pinned note demotes it to a session note (new `clearPinnedNote` query +
  `clearPinnedNoteAction`). Empty text clears the note in its bucket. Both display
  bars (PINNED — / NOTE —) keep their inline pencils, which open the same sheet
  pre-targeted to that bucket; the menu row defaults to the session note.
- **Exercise-page pinned-note pencil (parity).** New `ExercisePinnedNote` client
  component on the Exercise page (3.1a): the pinned note shows with an inline pencil
  to edit/clear, and an empty state offers **+ PIN A NOTE**. Saves via a new
  `setPinnedNoteAction` (exercise-scoped; empty unpins). No workout context needed —
  it's the exercise-wide note.
- **MCP notes contract (`docs/05-mcp-connector.md`).** Recorded that the connector
  exposes **both** note kinds and why: the pinned note is durable/general (conditions
  interpretation of the whole history), the session notes are day-to-day signal
  (trend, recovery, adherence). `get_exercise_history` carries both; `log_note` writes
  either kind (drafts/active session only, never completed history). This is the
  understanding the MCP uses to be a stronger partner.

### Recorded deviations

- **Pin defaults off** for a note opened from the menu — a mid-workout note is most
  often a session observation; the checkbox + copy make pinning a deliberate one-tap.
- **Both notes can still coexist** on an exercise (a durable pinned caveat + today's
  observation); the two display bars and pencils manage each independently, while the
  single sheet handles one note at a time per its pin state.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
Still no schema change (session note rides `exercise_feedback`; the pinned note rides
`exercise_notes`); the move/clear paths are user-scoped through existing RLS and the
completion lock. In-browser QA of the unified sheet + Exercise-page pencil pending.

## 2026-06-16 — Notes-model split (09 §8) + options-menu polish (subtle ⋮ · Edit day deep-link)

Follow-up to the options-menu slice (on-device notes). Lands the **notes-model
split** (09 session-5 §8) and two interaction fixes. No schema change — the
session note reuses an existing column; `main` deployable.

### Done

- **Options menu polish.** The Day View header `⋮` is now **borderless** (subtle
  ink-tint, darkens when open) instead of a boxed control. **Edit day** deep-links
  the planner to the **current day** (`/cycles/meso/[id]/plan?day=<n>`): the page
  reads a `day` searchParam and `PlannerBoard` seeds `activeDayId` from the matching
  day (falls back to day 1). Edit mesocycle still opens the board on day 1.
- **Notes model split (09 §8).** Two distinct exercise notes, now cleanly separated:
  - **Pinned note** (cross-workout, already existed via `exercise_notes`) gains an
    **inline pencil** on the pinned-note bar (Day View) for direct editing, and the
    edit sheet now **prefills** the current body; the menu row reads `New/Edit
    pinned note`.
  - **Session log note** (net-new) — a per-session note **saved with that workout's
    exercise log**. Stored in **`exercise_feedback.notes`** (one row per
    workout_exercise) — **no migration**: that table's completion-lock RLS already
    gates update/delete to the active workout, so the note is editable **only in the
    live session** and locks on completion, exactly per §8. New `saveSessionNote`
    query + `saveSessionNoteAction`; a `NOTE —` bar + `SessionNoteSheet` on the Day
    View (menu row `Add/Edit session note`; empty clears it).
  - **History display** — `getExerciseHistory` now carries `session_note`;
    `ExerciseHistoryList` (now a client component) shows a small **✎ note icon** on
    rows that have one and **reveals the note on tap**. Shared by the 3.2 history
    sheet and the Exercise page History tab.

### Recorded deviations

- **Session note reuses `exercise_feedback.notes`** rather than a new
  `workout_exercises.log_note` column (09 §8 offered either). It's per-we, already
  RLS-gated to the active workout (completion lock), and `workout_exercises.notes` is
  already taken by the engine's prescription rationale — so reuse avoids a migration
  and a second lock policy. Pump/workload/joint-pain on the row are preserved (only
  `notes` is written); a feedback-less note inserts a notes-only row.
- **Exercise-page pinned-note inline edit not added** — the §8 pencil affordance is
  on the Day View bar; editing the pinned note from the Exercise page is a minor
  follow-up.
- **Notes rows now live in the exercise `⋮` menu** (not the header options menu) —
  the per-exercise note is an exercise-scoped action; the header menu stays
  whole-workout/meso. This also unblocks the header menu's deferred "notes" items
  conceptually (per-exercise notes are covered; a whole-workout note is separate).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
No schema change; the session note rides the existing `exercise_feedback` table +
completion-lock RLS (logged history untouched). In-browser QA of the pencil/sheet +
history reveal on a device still pending (as for other screens).

## 2026-06-16 — Workout / mesocycle options menu: End workout · End mesocycle (09 session-5 §9)

Lands the **Workout / mesocycle options menu** — the open reconciliation-backlog
item from the 2026-06-15 logging review (09 session-5 §9): a header `⋮` control on
the Day View opening a grouped menu, with the two net-new audited end-early actions.
No schema change; reuses the existing completion + per-set-skip machinery; the pure
engine is untouched. Vertical slice; `main` deployable.

### Done

- **Header `⋮` options menu (fig 1.1).** New `WorkoutOptionsMenu` to the right of the
  date / Target-RIR column, sized to the height of those two rows (per the spec). Opens
  the shared viewport-flipping `AnchoredMenu` with two labelled groups:
  - **MESOCYCLE** — Edit mesocycle (→ planner board `/cycles/meso/[id]/plan`) ·
    Mesocycle stats (→ `/cycles/meso/[id]/stats`) · **End mesocycle** (destructive,
    shown only while the meso is `active`).
  - **WORKOUT** — Edit day (→ planner board) · **End workout** (destructive, shown only
    while the workout is `planned`/`in_progress`).
  Each end action opens a strong-warning confirm `BottomSheet` before running.
- **End workout** (`endWorkout` + `endWorkoutAction`) — skips every still-open set on
  every exercise (reuses `skipRemainingSets`), runs the standard `completeWorkout`
  (exercise statuses, microcycle close), then the same week N→N+1 generation as a normal
  completion (service-role, scoped to the user; a generation failure can't lose the
  early-end). Routes to the next workout if one was generated, else the Workout tab —
  mirroring the Complete sheet.
- **End mesocycle** (`endMesocycle` + `endMesocycleAction`) — for every not-yet-finished
  workout of the meso: skip all open sets, then close it (**completed** if anything was
  logged on it, **skipped** if untouched); then mark every microcycle and the mesocycle
  `completed`. **Logged sets are never modified** — only open planned slots are skipped
  and statuses advance; no week generation runs (the meso is over). Routes to the meso
  detail page.
- **Pure helpers** `src/lib/logging/end.ts` — `isRemainingWorkout(status)`,
  `endWorkoutStatus(hasLoggedSets)`, and `remainingSetNumbers(prescribed, logged,
  skipped)` (the open-slot computation). **+8 unit tests** (136 total).

### Recorded deviations

- **Notes items deferred.** The §9 menu also specs *Mesocycle notes* and *New/Edit
  workout note* rows — both depend on the §8 **notes-model** split (pinned vs session
  note), which is its own backlog slice. Those rows are omitted here rather than stubbed;
  the menu ships with the navigation + end-early items that don't need the notes model.
- **"Add exercise" deferred.** The §9 *Add exercise* row (group-aware picker against the
  live workout) is its own piece of work; not built this slice. Edit day routes to the
  planner board (the planner does not yet deep-link the current day pre-selected —
  acceptable, the day is one tap on the board).
- **No separate in-app audit row.** The spec calls these "audited" queries; like the
  existing `completeWorkout`/`deleteMesocycle`, the end actions are deliberate,
  RLS-scoped, confirm-gated server actions rather than rows in `mcp_write_audit` (that
  table is the MCP write boundary, not in-app actions). Built in the house ledger style
  (the `⋮` control + grouped menu aren't separately mocked).
- **End mesocycle from the Day View** acts on the meso behind the viewed workout; it's
  offered only while that meso is `active`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (136/136), `npm run build` green.
The end helpers are unit-tested; the IO (`endWorkout`/`endMesocycle`) reuses the
smoke-tested `skipRemainingSets`/`completeWorkout` paths and is user-scoped through the
existing `workouts`/`workout_exercises`/`microcycles`/`mesocycles` RLS — logged_sets are
never written, so the completion-lock policy is unaffected. In-browser interaction QA of
the menu + the two confirm flows on a device still pending (as for other screens).

## 2026-06-16 — Planner board bug fixes: sheet stacking, eager day-add, 7-day cap (on-device review)

On-device review of the planner board surfaced three concrete, reproducible
bugs (the prior optimistic-bridge fix didn't cover them). No schema change;
`main` deployable.

### Fixed

- **Stacked day-sheet + group-picker ("two edit-day windows / non-responsive
  window").** Opening **+ ADD MUSCLE GROUP** from the EDIT DAY sheet left the
  day sheet mounted **behind** the picker, so the picker (which looks like the
  day sheet) appeared to "slide up over another window," and on close the stale
  day sheet underneath read as non-responsive. Now it's **single-sheet at a
  time**: opening the picker from the day sheet **closes** the day sheet (after
  persisting its label/weekday) and **reopens** it when the picker closes — but
  only when the picker was opened from the day sheet (a `returnToDaySheet` flag;
  the board's own + ADD MUSCLE GROUP returns to the board).
- **Day-tab `+` then Cancel still added the day.** In editing (staged) mode the
  `+` committed the day to the working copy immediately, so Cancel/✕ didn't undo
  it. The day sheet now distinguishes **DONE** (`onDone` — commit) from
  **Cancel/✕/scrim** (`onCancel`); a just-added, never-confirmed day is tracked
  (`pendingNewDayId`) and **rolled back on cancel** (in both staged and live
  modes; the optimistic draft ghost is cleared too). The button reads **ADD
  DAY** for a new day, **DONE** for an existing one.
- **"Application error" past 7 days.** A week is 7 days — the DB checks
  (`meso_days.day_number ≤ 7`, `mesocycles.days_per_week ≤ 7`) threw once a
  user added an 8th. The day-tab `+` is now **hidden at 7 days** (`atDayLimit`),
  and day numbering picks the **smallest unused 1..7** (`nextDayNumber`) instead
  of `max+1` — so removing then re-adding a day no longer pushes `day_number`
  past 7 (the live `addMesoDay` query got the same fix). `saveMesoPlan` schema
  tightened from `max(14)` to `max(7)` to match the DB.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (128/128), `npm run build`
green. The fixes are planner interaction state + a day-numbering correction
(client + the `addMesoDay` query); RLS unchanged. In-browser re-test of the
three flows on a device recommended to confirm.

## 2026-06-16 — Planner reorder (groups + exercises) + draft add-day sheet fix

Closes the remaining two open items from the 2026-06-16 notes batch ("Not done
yet"): **planner reorder** and the **add-day sheet dismissal** bug. No schema
change; `main` deployable. Vertical slice.

### Done

- **Reorder muscle groups within a day** — up/down (▲▼) move controls on each
  group row in the EDIT DAY sheet (fig 2.5). **Reorder exercises within a
  group** — ▲▼ controls on each filled slot row on the board (replacing the
  decorative `⋮⋮` grip). Both work in **both persistence modes**: staged into
  the local `workDays` copy when editing a planned/active meso (persisted on
  SAVE CHANGES), or a **live position rewrite** on a draft.
- **No migration needed.** `meso_day_groups.position` and
  `meso_exercises.slot_number`/`position` already exist, with **no unique
  constraint** on the ordering columns — so the live reorder is a plain
  index→position rewrite (`reorderDayGroups` / `reorderGroupExercises`,
  scoped to the day/group), no temp-value swap. *(The prior PROGRESS note's
  "no position column" premise was outdated.)*
- **Pure helper** `moveInOrder(ids, id, delta)` (`planner/groups.ts`) — moves
  one item up/down in an id list, no-op (same reference) past either end or for
  an unknown id; drives both modes. **+5 unit tests** (128 total).
- **Draft add-day sheet dismissal fix.** The draft (live) add-day flow set
  `daySetupId` to a brand-new day before revalidation had put it in props, so
  the day-setup sheet briefly had no backing day. `addDay` now seeds an
  **optimistic local day** from the returned insert row (`withPending`) so the
  sheet renders immediately and reconciles (drops the optimistic row) once the
  revalidated props include it — taking `addDay…→revalidate` out of the
  interaction loop without breaking the draft's live persistence / "continue
  editing" guarantee.

### Recorded deviations

- **Reorder is up/down move controls, not pointer/touch drag-and-drop.** The
  notes asked for DnD "ideally"; up/down is the accessible fallback the note
  itself offered, works identically in both persistence modes (no half-working
  DnD across modes), and matches the existing day-view **Move up/down** pattern.
  Square-corner ledger styling preserved.
- **Group reorder lives in the EDIT DAY sheet; exercise reorder is inline on
  the board.** Groups are a day-structure concern (edited in the day sheet);
  exercises are shown as slots on the board, so their ▲▼ sit on the slot rows.
- **Live exercise reorder packs fills to the top slots** (slot_number 1..n in
  the new order) — a cleared mid-group slot moves to the bottom on reorder.
  Acceptable (no logged data here) and arguably tidier.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (128/128), `npm run build`
green. `moveInOrder` is unit-tested; the live reorder writes are user-scoped
through the existing `meso_day_groups`/`meso_exercises` RLS (planning rows only —
no logged history touched). The dismissal fix is client state (optimistic
bridge); code review showed the editing path was already sound (sheet keyed by
`day.id`, balanced scroll-lock). In-browser pixel/interaction QA of the reorder
controls and the draft add-day flow still pending (as for other screens).

## 2026-06-16 — Edit macrocycle (fig 2.3 engine, prefilled + safe re-plan)

Closes the **Edit macrocycle** item teed up in the prior 2026-06-16 notes batch
("Not done yet"). Create-macro existed; the edit surface (rename · goal ·
duration · block length · notes · re-plan/re-phase the meso slots) was the gap.
No schema change; `main` deployable. Vertical slice.

### Done

- **Edit screen** `/cycles/macro/[macroId]/edit` (`EditMacroForm`) — the same
  fig 2.3 create engine, **prefilled** from the macro and recomputing the
  realistic target / per-month rate / meso-count / phase preview live via
  `planMacrocycle`. Adds a **GOAL NOTES** field (optional, edit-only — create
  didn't expose it though the column + action already supported it). The
  `EDIT MACROCYCLE — SOON` placeholder on the Overview (2.2) is now a real link.
- **`updateMacrocycle`** (`queries/macro.ts`) — updates the macro row (name,
  goal, duration, block length, notes, recomputed `target_*`/`rate_*`/
  `recommended_duration_months`/`target_end_date`) then **reconciles the
  unplanned mesocycle slots** to the new plan size. **Locked mesos
  (planned/active/completed/abandoned) and every logged set are never touched** —
  only `unplanned` placeholders are added, removed (surplus trimmed from the
  tail so the earliest open slots survive), or re-phased; positions re-sequence
  contiguously. The final count can never drop below the locked count.
- **Pure decision helpers** — `reconcileMacroSlots` (orderedMesos + target →
  `{ removeIds, addCount }`) and `macroEditImpact` (locked vs unplanned counts,
  surfaced to the form so the re-plan note reads "keeps your N planned/active/
  completed mesocycles; adds/removes M open slots"). **+5 unit tests** (123
  total) covering grow / shrink-from-tail / never-below-locked / no-op.

### Recorded deviations

- **GOAL NOTES on edit only** — the create form omits it (the engine card is the
  focus there); the edit form is the natural place to annotate an existing arc.
  Built in the house ledger style.
- **Re-phasing applies to unplanned slots only** — a planned/active/completed
  meso keeps the phase the user assigned when planning it; only open
  placeholders pick up the recomputed phase spread.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (123/123), `npm run build`
green; the `/cycles/macro/[macroId]/edit` route compiles. The reconcile decision
is a pure unit-tested helper; the surrounding IO (`updateMacrocycle`) is
user-scoped through the existing `macrocycles`/`mesocycles` RLS and guards
deletes to `status = 'unplanned'`. In-browser QA of the edit/re-plan flow on a
real macro still pending (as for other screens).

## 2026-06-16 — Notes batch: scroll-lock, gender, dark mode, feedback-flow revision, planner polish

Worked the 2026-06-16 notes batch. Most items shipped this slice; the larger
ones (full drag-and-drop reorder, edit-macrocycle, and one bug that needs
in-app reproduction) are teed up below as planned work. Vertical slice; `main`
deployable. One `DATA` migration (applied to hosted).

### Done

- **Overlay scroll-lock.** New ref-counted `useScrollLock` hook wired into
  `BottomSheet`, the day-view `AnchoredMenu` (exercise/set menus), and the
  Workout Complete sheet — the page behind any tray/menu/overlay no longer
  scrolls (and the scrollbar gap is compensated so the layout doesn't jump).
- **Exercise history shows the year.** `ExerciseHistoryList` date now reads
  `D MON 'YY` (was day/month only), so older sessions are unambiguous.
- **Move exercise up (day view).** The 1.2 exercise menu gained **Move up**
  alongside **Move down**; the position swap is factored into one
  `moveExercise(delta)` helper + `moveExerciseUpAction`.
- **Edit feedback (active workouts).** The 1.2 menu gained **Edit/Add
  feedback**; the feedback sheet prefills from any saved row and is keyed per
  exercise.
- **Gender captured.** Onboarding step 1 and the profile editor now set
  `profiles.gender` (the column already existed and the macro target engine
  already read it — this was a pure UI gap). 4-way: female / male / other /
  prefer-not.
- **Full-screen exercise picker (planner).** `BottomSheet` gained a
  `fullHeight` mode (pinned header + footer, scrollable middle); the meso
  planner's exercise picker now rises to nearly the whole screen.
- **Discard a draft.** New `discardDraftAction` (guarded to `draft` status, so
  it can never touch a planned/active cycle or logged history) surfaced as
  **DISCARD DRAFT** on both the plan-a-meso entry banner and the draft board.
- **Dark mode (light / dark / system).** A dark ledger palette as
  CSS-custom-property overrides (ink ⇄ cream on warm near-black, lifted accent,
  light menu shadow) under `[data-theme=dark]` / `(prefers-color-scheme:
  dark)[data-theme=system]`; every ink/cream utility adapts with no markup
  changes. Applied to `<html data-theme>` before paint via an inline script
  (default `system`, no flash); `ThemeToggle` in More settings persists to
  `localStorage`. The three hardcoded ink SVG strokes in the day view switched
  to `currentColor`.
- **Feedback-flow revision (DATA).** Migration `20260616000001` adds nullable
  `exercise_feedback.soreness` (0–10) and `soreness_days` (0–5) — applied to
  hosted, no new advisor lints, RLS unchanged. The **first** exercise logged
  for a muscle group now prompts a *recovery check* (soreness from the last
  session of that group + how many days sore) instead of joint pain; **joint
  pain is asked once**, with the group-complete prompt (pump/workload).
  Middle-of-group exercises no longer auto-prompt; a one-exercise group shows
  everything. Soreness rows carry `muscle_group_id` but null pump/workload, so
  the engine's group-feedback guard (pump/workload non-null) ignores them — **no
  engine behavior change** (engine consumption of soreness is a future slice).
- **Planner active-day guard.** The board's "snap active day back to day 1"
  effect no longer fires while a setup/add-groups sheet references a day the
  just-revalidated `days` hasn't caught up to (a latent wedge in the live draft
  path).

### Recorded deviations

- **Gender / theme / discard / soreness controls** are built in the house
  ledger style — none are in the stock mockups (the mockups predate these asks).
- **Joint pain is now group-level** (stored on the closing exercise) rather than
  per-exercise, per the user's explicit "remove the redundancy" request. The
  engine still reads `joint_pain` per exercise; in practice it's now populated on
  the group's last exercise.
- **Theme is a device setting** (localStorage), not a `profiles` column — instant,
  no migration, and the natural home for a per-device preference.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (118/118), `npm run build`
green. Soreness migration applied to hosted and columns re-queried; security
advisors show no new lints. In-browser pixel/interaction QA of the new
surfaces (dark palette, full-screen picker, soreness prompt) still pending, as
for the other screens.

### Not done yet — planned work (from the same notes batch)

- **Planner reorder (muscle groups + exercises).** ✅ **Shipped** in the
  2026-06-16 (latest) entry above. Note: `meso_day_groups` **already had a
  `position` column** (and `meso_exercises.slot_number`), with no unique
  constraint on either — so **no migration was needed**; the prior assumption
  here was wrong. Reorder via up/down move controls (accessible fallback),
  staged in editing mode / live position rewrite on a draft.
- **Edit macrocycle.** ✅ **Shipped** in the 2026-06-16 (latest) entry above —
  `/cycles/macro/[macroId]/edit` + `updateMacrocycle`; reconciles unplanned
  slots only, locked mesos + logged history immutable.
- **Add-day sheet won't dismiss (BUG).** ✅ **Targeted fix shipped** in the
  2026-06-16 (latest) entry above — the draft add-day path now opens the
  day-setup sheet from an **optimistic local day** (the returned insert row)
  instead of waiting on revalidation, removing the `addDay…→revalidate` gap
  that left the sheet without a backing day. Code review showed the editing
  path was already sound (the sheet is keyed by `day.id`, so revalidation
  updates props in place without remount, and scroll-lock is balanced).
  In-browser confirmation on a device still recommended.
## 2026-06-16 (latest) — App icon design handoff wired in (S4 wordmark + slider)

Replaced the placeholder barbell icons with the final **S4** mark from the design
handoff (`design_handoff_app_icon`): the stacked **WORK / OUT** Archivo-800 wordmark
over a single snap-to-stop slider rule (ink track + orange pip at 62%), on cream
`#F4F0E6` — the icon now reads as the product's own slider control.

### Done

- Dropped the production PNGs into `public/icons/`: `icon-192`, `icon-512`,
  `icon-maskable-512` (paper system, full-bleed) plus the new `icon-180` for iOS.
- Wired `icons` into `src/app/layout.tsx` metadata — `apple-touch-icon` (180) and
  explicit `<link rel="icon">` for 192/512. `manifest.webmanifest` already pointed at
  the three icon paths (project `name`/`start_url` kept; not the handoff placeholder).
- Retired `scripts/generate-icons.mjs` — the placeholder generator would clobber the
  real assets if re-run; the design handoff is now the source of truth.
- Stashed the editable master + dark variants under `docs/design/app-icon/`
  (`icon-source.html`, README spec, `icon-512-dark`, `icon-maskable-512-dark`) for
  regeneration. Dark icons not shipped to `public/` — dark mode is out of scope (rule 9).
- No favicon: the wordmark is illegible at 16–32px; deferred per the handoff note.

## 2026-06-16 — Madeline's history imported (16 standalone mesos, 3,696 sets)

Same pipeline as Garron's import, for the second account (Madeline,
`0af27789…`, `docs/data/master_exercise_history_madeline.csv`, 1,533 rows). She
didn't track macrocycles, so every meso is **standalone** (`macrocycle_id` and
`logged_sets.macrocycle_id` NULL — surfaced via `cycles.ts` `standaloneMesos`).

### Done

- Loaded via REST into `public.import_hist`, then ran `scripts/history-build-standalone.sql`
  (the macro-less variant of `history-build.sql`, idempotency-guarded): **16 mesocycles**,
  **87 microcycles**, 108-equiv day plan, **170 workouts**, **1,533 workout_exercises**,
  **3,696 logged_sets** — all `completed`, joined to the shared library via `legacy_id`.
- `scripts/import-history.py` now takes the CSV path as an argument (defaults to Garron's).
- **Verified:** 16/16 mesos standalone, 0 macros, logged-set count == expected, 91 exercises
  in `v_exercise_prs`, all 16 mesos in `v_meso_summary`; 2024-03-21 → 2026-06-11. Garron's
  27 mesos untouched.

## 2026-06-15 — Full training history imported (27 mesos, 6,745 sets)

Imported Garron's complete logged history (`docs/data/master_exercise_history_garron.csv`,
2,925 rows) into the live account `3183ce71…`. Built the whole hierarchy server-side from a
staging table so no generated uuids transit anywhere; joined exercises on `legacy_id` (the
column added by the library import). Verified end to end.

### Done

- **Decoded the export** (100% of rows): `Set 1` = working weight (== Weight), `Set 2…N` = reps
  per set ⇒ working sets = `Sets − 1`. Bodyweight `(155 − 40)`-style notes use the net `Weight`.
- **Loaded** via REST into `public.import_hist` (anon insert, RLS off, dropped after), then ran
  `scripts/history-build.sql` (single session, idempotency-guarded) to derive:
  **5 macrocycles** (contiguous bulk/cut runs — goal = cut if name~`cut` else hypertrophy; the
  15-meso bulk run stays under the 24-position cap), **27 mesocycles**, **130 microcycles**
  (target-RIR 3→0 ramp; deload week = 4, since RIR wasn't tracked → `logged_sets.rir_reported`
  null), **108 meso_days / 503 groups / 754 meso_exercises** (per-day plan rebuilt groups-first
  from what was logged, `initial_*` from the first week), **463 workouts**, **2,925
  workout_exercises**, **6,745 logged_sets** — all `completed`.
- **Verified:** logged-set count == expected, 0 missing macro links, all 27 mesos + 5 macros +
  111 exercises surface in `v_meso_summary` / `v_macro_summary` / `v_exercise_prs`; e.g. Bench
  Press (Medium Grip) shows 114 sessions, e1RM 154→180 lb. Lifetime volume ≈ 6.07M lb,
  2023-11-07 → 2026-06-15.
- Reproducible via `scripts/import-history.py` (CSV → JSON batches) + `scripts/history-build.sql`.

### Notes / deviations

- All cycles imported as **completed** (even the in-progress June 2026 bulk) — clean for a history
  load; the latest meso/macro can be flipped to `active` to resume.
- Meso **names kept verbatim** from the export (some labels' years are off, e.g. "Cut Dec '25"
  actually ran Dec 2025–Jan 2026); macro names use the real date ranges.

## 2026-06-15 — Exercise library replaced with the user's 330-exercise import

Wholesale replacement of the stock exercise library with the user's curated export
(`docs/data/exercises_all_20260615.csv`, 330 rows). All prior macro/meso/workout/template
rows were test data and are wiped by the import; `profiles`, `muscle_groups`, and
`engine_params` are preserved. Generated, not hand-written — rerun
`scripts/import-exercise-library.py` to regenerate the migration + `seed.sql` from the CSV.

### Done

- **Migration `20260615000006_replace_exercise_library.sql`** — adds `exercises.legacy_id`
  (unique), widens the `equipment_type` check, `truncate … restart identity cascade` of the
  test data, then loads 330 stock rows (`user_id null`) + their primary/secondary muscle links.
- **`seed.sql` regenerated** — muscle_groups + the 330-library + engine_params kept; the stock
  *templates* were **dropped** (they referenced old exercise names that no longer exist and would
  fail a fresh `db reset`). Rebuild stock templates against the new library when desired.
- **Engine boundary normalizer** `toEngineEquipment` (`engine/params.ts`) maps the wider stored
  vocabulary to the canonical step buckets; wired into `buildEngineInputs` (progression) and both
  `seedMeso` call sites (generation). Unit test `engine/__tests__/equipment.test.ts` asserts the
  mapping is loss-free for load math. `EquipmentType` union + `ExerciseRow.legacy_id` added to
  `types/database.ts`; `legacy_id` is insert-optional (`Defaulted`).

### Decisions / deviations (per hard rule #8)

- **Integer ids → `legacy_id`, not the PK.** The PK is a `uuid` (every FK targets it), so the CSV's
  1–330 ids can't be the PK. They live in `exercises.legacy_id` (unique) so the later workout-history
  import joins `old int → legacy_id → uuid`. No separate conversion list needed; a
  `legacy_id ↔ uuid ↔ name` map is exported post-apply for convenience.
- **Equipment stored verbatim from the CSV** (per the user). The check now also allows
  `smith machine`, `bodyweight only`, `bodyweight loadable`, `machine assistance`, `freemotion`
  alongside the canonical engine buckets (the latter still used by user-created customs). Wrinkle to
  reconcile later: both `smith`/`smith machine` and `bodyweight`/`bodyweight only|loadable` are now
  valid; the create-exercise form still offers only the canonical set.
- **Secondaries faithful to the CSV.** A conservative, opt-in enrichment proposal (125 high-confidence
  compound synergists for rows lacking a secondary) is generated to
  `scripts/exercise-secondary-enrichment.sql` (NOT applied by the import) for review.
- **Known near-duplicates kept verbatim** (ids link to history, so nothing merged/renamed): two
  `Hack Squat` (236 quads/machine, 228 glutes/smith), `Back Raise (45 Degree)` (6) vs
  `(45 degree)` (5), `StIff Leg Deadlift` (145), `Triceps cable push-down Bar` (147).

## 2026-06-15 — Planner edit surface (2.5): staged save/cancel, immutability warning, open-workout regen, read-only planned days (on-device feedback)

On-device review of editing an existing meso surfaced four issues. This slice lands the
**Planner board (2.5) edit surface** backlog item plus the read-only future-day view. Vertical
slice; `main` deployable; no schema change.

### Done

- **Staged editing for non-draft mesos.** Editing a `planned`/`active` meso (EDIT PLAN / EDIT WEEKS)
  now works on a **local working copy** — add/remove day, add muscle groups, set exercises, set
  counts, and removals all mutate client state only; **nothing is written until `SAVE CHANGES`**. A
  sticky bottom **CANCEL · SAVE CHANGES** bar appears; CANCEL discards (confirm sheet when dirty),
  SAVE opens a confirm with the warning. **Drafts keep the live build-then-`CREATE MESOCYCLE` flow.**
  The three sheets (day setup, add-groups, picker) were made callback-driven so the board chooses
  staged-vs-live per state. *(This also resolves the reported "add-day panel won't dismiss" bug — the
  sheets now close on local state, with no server-action/revalidation timing in the loop.)*
- **Immutability warning on save.** The save-confirm sheet states plainly that completed/in-progress
  workouts and every logged set are protected and that edits only affect not-yet-started days
  (this week's remaining days + future weeks). The stronger copy shows when the meso has logged
  history (`getMesoDeletionImpact.hasHistory`, threaded into the board).
- **Open-workout regeneration (active mesos).** On save, `regenerateOpenWorkouts` does a **structural
  merge** on the open (not-yet-started) workouts of non-completed weeks: removed days' `planned`
  workouts are deleted, added days get fresh seeded planned workouts, and within an existing
  `planned` workout exercises are added/removed to match the plan while **surviving exercises keep
  their engine-progressed prescription**. Completed / in-progress / skipped workouts and all logged
  sets are never touched. Future weeks (not yet generated) pick up the new plan when their generation
  job runs. `saveMesoPlan` reconciles the planner tables (wholesale replace, day_numbers preserved so
  generated workouts still line up — nothing outside the planner tables references their ids).
- **Read-only planned-day view (issue 4).** New `/cycles/meso/[mesoId]/planned/[week]/[day]` shows a
  not-yet-generated day's **basic planned exercises** (groups → exercise · planned sets · target RIR
  from the ramp/microcycle) behind a clear **`NOT PLANNED YET`** banner explaining loads arrive once
  the prior week is logged. Wired from the Day View navigator chips (future days were dead `<div>`s)
  and the meso-detail ramp matrix's empty/future cells (previously un-clickable) — fixing the "can't
  view unplanned days / workout view gets weird after edits" report.

### Recorded deviations

- **Staged save replaces the planner tables wholesale** on commit (vs. a fine-grained diff) — simplest
  safe reconcile since the planner tables hold no logged data and `day_number` is preserved for
  retained days so generated workouts still match. Regeneration of generated workouts is the careful,
  history-protecting part.
- **Edits during a deload week** reseed newly-added exercises at the microcycle's `target_rir`
  (deload RIR) rather than recomputing the full RP deload reduction; retained exercises are untouched.
  Editing mid-deload is an edge case; the next week's generation recomputes normally.
- **The planned-day view shows structure + target RIR only** (no projected loads) — loads genuinely
  aren't known until the prior week is logged, which the banner states (10 §9 honesty guardrail).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (114/114), `npm run build` green. No schema change.
The staged-edit interactions are client state; the new IO (`saveMesoPlan`, `regenerateOpenWorkouts`)
is user-scoped through existing RLS and reuses the smoke-tested `seedMeso` path; the merge protects
started/completed work and logged sets by status guards. In-browser QA of the edit/save/regeneration
flow on a real active meso still pending (as for other screens).

## 2026-06-15 — Planner pickers retrofit: Add groups (2.6b) + multi-select Exercise picker (2.7) with equipment filter

The 2.6b "Add groups" and 2.7 "Pick exercise" mockups never made it into the build during the
design handoff — the planner shipped a plain inline 2-column add-group grid and a **single-select**
picker filling one slot at a time. This slice transcribes both figures 1:1 and adds the
equipment/machine-type filter the user asked for. No schema change; `main` deployable. Vertical slice.

### Done

- **Add groups (fig 2.6b)** — new `AddGroupsSheet` replacing the inline grid. Region-grouped
  (`LEGS · PUSH · PULL · CORE`, OTHER fallback), **multi-select** with a search box; groups already on
  the day show a greyed ✓ + **`IN DAY`** and aren't re-selectable; the action button reads
  **`ADD N GROUPS`** (live count) and adds all selected in one write (`addDayGroups` batch insert,
  each with one open slot). Opened from both the board's **`+ ADD MUSCLE GROUP`** and the day-setup
  sheet's button (the day-setup sheet no longer carries its own add-group UI).
- **Exercise picker (fig 2.7)** — rebuilt `ExercisePicker` as a **group-centric multi-select**: it
  pre-checks the group's current fills, lists muscle-group-filtered candidates with checkboxes +
  `EQUIPMENT · LAST <date>`, and **`ADD TO <DAY>`** sets the group's exercises to exactly the selected
  set (`setGroupExercises` → `planGroupExercises` lays them into slots 1..n, **retaining each kept
  exercise's `initial_sets`**, defaulting new ones to 3, and **resizing the group's slot count** to
  match). The board's slot rows (filled or empty) all open this one group picker.
- **Equipment / machine-type filter** (user request) — a chip row (`ALL` + the distinct equipment
  types present among the group's candidates) that ANDs with the search; mirrors the library 3.1
  EQUIP axis. Shown only when the group spans more than one equipment type.
- **Pure helpers** `src/lib/planner/groups.ts` — `groupByRegion` (region order + alphabetised,
  empty regions omitted, OTHER last) and `planGroupExercises` (multi-select → slot layout, sets
  retention, dedupe, empty). **+8 unit tests** (114 total).
- **Dead code removed** — the per-slot `fillSlotAction`/`fillSlot` and single-group
  `addGroupAction`/`addDayGroup` paths (superseded) are deleted.

### Recorded deviations

- **Picker is multi-select per group, not per slot.** Fig 2.7 shows checkboxes + `ADD TO <DAY>`, so
  the picker now sets the whole group's exercises at once (and the group's slot count follows the
  number picked). This supersedes the original per-slot single-select (07 Phase 2, fig "2.6") and the
  inline last-session "SELECTED" card; the **`›` on each row still opens the full history sheet**.
- **Regions are mapped client-side by muscle-group name** (`muscle_groups` has no region column) —
  documented constant in `planner/groups.ts`; unknown names fall to `OTHER` so nothing is dropped.
- **Picker subtitle uses `MUSCLE · DAY`** (drops the `SLOT n` now that it's group-level), and the
  day-setup sheet keeps the per-group set-count steppers (the picker can override the count on add).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (114/114), `npm run build` green. Pure helpers
unit-tested; the two new query writes (`addDayGroups`, `setGroupExercises`) are user-scoped through the
existing `mesocycles`/`meso_*` RLS (planning rows only — no logged history touched). In-browser pixel
QA of the two sheets still pending (as for other screens).

## 2026-06-15 — Cycles/meso navigation fixes + day-1 planner data repair (on-device feedback)

Three on-device follow-ups on the Cycles/meso surface. The meso detail page is **kept** (the 09
"nix the meso page" decision is reversed per the user).

### Done

- **All meso rows open the meso detail page** (was: `planned` mesos jumped straight to the planner
  board, so only the active meso reached the page with its delete/stats/start controls). Cycles list
  (`MacroMesoRow`/`StandaloneRow`) and the Macrocycle Overview meso rows now link to
  `/cycles/meso/<id>` regardless of status; `EDIT PLAN` on that page still opens the planner.
- **Completed days are clickable in the ramp matrix** → open the workout in the log view
  (read-only). The `✓` cell on the meso detail calendar is now a `Link` to `/log/<workoutId>`.
- **Day-1 "empty planner" repaired (data).** Diagnosis: on the user's active PPL meso, day 1's
  `meso_day_groups` (and their cascaded `meso_exercises`) had been **deleted** — almost certainly via
  the old ✕-with-stale-UI bug (the remove worked but the sheet didn't refresh, so it got clicked).
  The logged workout was intact (5 exercises, 15 sets). Reconstructed day 1's groups + slot fills
  from the surviving week-1 day-1 `workout_exercises` (chest ×2 · shoulders ×2 · triceps ×1);
  day 1 now matches the other days (3 groups / 5 fills). The **root cause is already fixed** in this
  PR's stale-sheet work, so it shouldn't recur. Idempotent repair (guarded on day 1 having 0 groups);
  no schema change.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. Data repair run
against hosted and re-queried (all 6 days now 3–4 groups / 5 fills). Read-only diagnosis of the
account before the targeted, reversible insert.

## 2026-06-15 — Draft model: create-mesocycle is the final stage; one draft at a time (Phase 2 on-device feedback, DATA)

Reorders meso creation per on-device feedback: you now build the plan **first** (on the planner
board, as a draft) and **name + size it last**. One draft at a time, no draft management.
Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260615000005_meso_draft_status.sql`** (append-only; **applied to hosted**,
  constraint re-read, advisors show no new lints) — widens `mesocycles_status_check` to admit
  **`draft`**. RLS unchanged (`mesocycles_all_own` already covers every status for the owner).
  `database.ts` mesocycle status union updated to include `draft`.
- **All three plan-a-meso paths create a draft** and drop you straight onto the planner board:
  `startScratchDraftAction` (blank), `startTemplateDraftAction` (prefilled from a template),
  `startCopyDraftAction` (prefilled from a source meso + its weeks/RIR/deload). The old
  create-**first** form (`/cycles/plan/new` + `NewMesoForm` + `createMesocycleAction`) is removed.
- **Create-mesocycle is the final stage.** A draft's planner board shows **`CREATE MESOCYCLE`**
  (gated until at least one exercise is filled) → a **finalize sheet** (name + weeks + RIR caption,
  fig 2.8) → `finalizeMesoAction` flips `draft → planned` and lands on meso detail. Non-draft boards
  keep the existing `DONE — REVIEW MESO`.
- **One draft at a time.** `createDraftMeso` **clears any existing draft** before creating the new
  one (query-layer enforced — no draft-management UI). Before that point the entry surfaces the
  existing draft so you can **keep editing** instead: a `DRAFT IN PROGRESS — <name> · CONTINUE
  EDITING ›` banner on **/cycles/plan** (with "starting a new plan replaces this draft") and a
  matching dashed banner on the **Cycles** tab. Drafts are excluded from the normal cycles lists
  (`getCyclesOverview` filters `status != 'draft'`; `listCopyableMesos` is now planned/active/completed).
- The template-detail **START A MESO FROM THIS** and both pickers (template/copy) post to the new
  draft actions (forms, not links).

### Recorded deviations

- **Create-last / draft flow** deviates from the mockup's create-first 2.8 sheet — done per direct
  user request (2026-06-15). Draft banners are built in the house style (not separately mocked).
- **Finalize requires ≥1 filled exercise** (not in the mockup) — avoids creating an empty planned meso.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. Migration applied
to hosted; `mesocycles_status_check` re-read (now includes `draft`); security advisors show no new
lints (no tables/policies/functions added). No hosted integration smoke this slice (avoided polluting
the account); the draft create/finalize/one-at-a-time logic is query-layer IO exercised via
typecheck + build. In-browser flow QA still pending.

## 2026-06-15 — Planner workflow fixes: combined day sheet, live-data bugs, delete mesocycle (Phase 2 on-device feedback)

On-device review of the planner board surfaced several broken interactions and workflow friction.
This slice fixes them. No schema change; `main` deployable. **The larger "draft model" reorder
(create-mesocycle as the *final* stage, one draft at a time) is teed up as the next slice — see
"Not done yet" below.**

### Done

- **Stale-sheet bug fixed — the root cause of three reported "doesn't work" bugs.** The day-setup
  sheet captured a **snapshot** of the day when it opened, so the per-group **± set steppers**, the
  group **✕ remove**, and the **add-muscle-group** picker all wrote to the DB but the sheet (and its
  derived `taken`/`available` lists) never reflected the change. The sheet now reads the **live**
  `day` from the board's `days` prop (looked up by id, re-passed on every revalidation), so all three
  update immediately. The board already re-derived `activeDay` from live data; only the sheet was stale.
- **Add-day and day-setup combined into one view (`Day N`).** Previously you added a day (label +
  weekday) in one tray, then reopened a near-identical "day setup" tray to add muscle groups. Now
  tapping **`+`** creates the day (auto weekday) and **opens the single combined sheet** titled
  `Day 1` / `Day 2` … with weekday + label + muscle groups + per-group set counts all in one place.
  `addDayAction` returns the new day so the client can open it directly; the old `"new"` sheet mode
  is gone. Empty state shows a full-width **`+ ADD TRAINING DAY`** button.
- **Weekday auto-fills (Monday-first).** Adding a day assigns the next unused weekday starting Monday
  (`nextWeekday`), so days are never null/unordered on creation; the user can still change it in the
  sheet. Days sort Monday-first (already the case in `getMesoPlan`).
- **"Week starts on this day" removed.** Weeks are assumed to start Monday; the checkbox and the
  `profiles.week_starts_on` write are gone (`updateDayAction` no longer takes `week_starts_here`).
  The column remains (defaults to 1) — nothing reads it for ordering.
- **Delete a mesocycle (with warnings).** New `DELETE MESOCYCLE` on the meso detail page opens a
  confirm sheet. `getMesoDeletionImpact` counts the meso's `logged_sets`; when there's history the
  copy is stronger (`… N logged sets, every workout, and the week structure …`) **and an
  acknowledgement checkbox gates the delete**. `deleteMesocycle` is user-scoped; FK cascades remove
  microcycles/workouts/logged_sets/planner rows (RLS `mesocycles_all_own` is `for all`; the child
  cascade bypasses RLS by design — verified against the schema).

### Recorded deviations

- **Combined day sheet + removed week-starts** deviate from fig 2.5 (which shows separate add/setup
  and a week-start toggle) — done per direct user request (2026-06-15 on-device review). Square-corner
  ledger styling preserved.
- **Delete button isn't in the stock mockup** — built in the house style (accent destructive row +
  confirm sheet), consistent with other unmocked controls (share/redeem).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green. No schema change.
The fixes are interaction logic in `PlannerBoard.tsx` (live-data derivation) + a delete query/action
covered by the existing RLS model; in-browser pixel/interaction QA of the combined sheet and delete
flow still pending (as for other screens).

### Follow-up — draft model (the headline workflow ask)

Shipped in the **2026-06-15 (latest)** entry above: `create mesocycle` moved to the final stage,
all three paths create a draft, one draft at a time with continue-editing banners.

## 2026-06-15 — Plan-a-meso: copy-a-mesocycle path (fig 2.4 option 01, Phase 2 / Design v2 backlog)

Lands the **copy-a-mesocycle** path — the most-cited remaining Phase 2 gap (option 01 of the
plan-a-meso flow, previously a dashed "soon" stub). No schema change: copy clones the planner
structure and lets `startMeso` reseed loads from the user's all-time bests, so it literally
"starts from where you left off." Vertical slice; `main` deployable.

### Done

- **`copyMesoStructure` + `planMesoCopy`** (`src/lib/queries/cycles.ts`) — `copyMesoStructure`
  reads the source meso's plan (`getMesoPlan`) and clones its `meso_days → meso_day_groups →
  meso_exercises` onto a freshly created target meso, mirroring `applyTemplateToMeso`. The pure
  **`planMesoCopy`** helper maps source days→groups→fills into insert rows: it **honors the user's
  exclusion list** (an excluded exercise's fill is dropped but its **slot stays open** — slot count
  preserved so the picker can replace it), widens a group's slot count to fit if the source had more
  fills than declared slots, and falls back slot numbers to position when unset. Loads are **not**
  copied — `startMeso` reseeds every slot from `v_exercise_prs`.
- **`listCopyableMesos`** — the user's planned/active/completed mesos (placeholders excluded),
  newest first, for the source picker.
- **Source picker** `/cycles/plan/copy` (house style, bordered rows like the template picker) —
  `STATUS · PHASE`, name, `N WK` / `N D/WK` chips; tapping routes to the create form with `?copy=`.
- **Create-meso form (fig 2.4) reused for copy** — `/cycles/plan/new?copy=<id>` loads the source,
  subtitles `COPIED FROM — NAME`, and prefills name (`<source> II`), weeks, RIR ramp, and deload
  from the source. The form gained `copyMesoId`/`defaultWeeks`/`defaultDeload`/`defaultRir*` props;
  `createMesocycleAction` parses an optional `copy_meso_id` and runs `copyMesoStructure` after create
  (template path unchanged). Plan-a-meso option 01 is now an enabled link.
- Tests: **106 passing** (+4) — `planMesoCopy` (full clone with weekday/label/sets carry, excluded
  exercise dropped + slot preserved, slot-count widening, empty plan).

### Recorded deviations

- **Copy picker UI not in the stock mockup** — built in the established house style (bordered rows),
  same as the template picker and share/redeem rows (a prior recorded deviation). Square-corner
  ledger styling preserved.
- **RIR ramp / deload carry from the source** even though the create form doesn't expose RIR edits;
  the copy intent is "do this meso again," so the source's ramp is the right default.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (106/106), `npm run build` green (`/cycles/plan/copy`
and the updated `/cycles/plan/new` both compile). No schema/RLS change — copy creates rows the user
owns through existing policies; the source is read via RLS (a meso not visible to the user copies as a
no-op). No hosted writes this slice; pure helper unit-tested, the DB walk mirrors the smoke-tested
`applyTemplateToMeso` pattern. In-browser pixel QA of the picker still pending (as for other screens).

## 2026-06-15 — Library & stats reconciliation: Exercise page (3.1a/b) + two-axis filter + Volume tab removed (Design v2 backlog, DATA)

Lands the bulk of the **Library & stats (against Phase 5)** reconciliation block from 09 (2026-06-14
session-3 §1/§2/§4): the net-new Exercise page (Overview/History tabs), the two-axis library filter,
and the Meso Stats Volume-tab removal. This is what the logging "View exercise ›" link (shipped
2026-06-15) was already pointing at. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260615000004_exercise_overview.sql`** (append-only; **applied to hosted**,
  schema + values re-checked, security advisors clean):
  - **`v_exercise_overview`** (security_invoker) — per (user, exercise) lifetime aggregates backing
    the 3.1a Overview and MCP read tools (one definition of progress): `times_trained`,
    `total_volume`, `first_logged_at`, `last_performed_at`, `weight_pr` (+ reps at it), `volume_pr`
    (+ the weight×reps that produced it), `best_e1rm`, `best_session_volume`. Argmax columns built
    with `distinct on` CTEs over working sets; cross-checked against raw `logged_sets` on hosted
    (Dumbbell Bench: 155×8 weight PR, 1240 volume PR, e1RM 196.3 = 155·(1+8/30) — exact).
  - **`exercises(equipment_type)` index** for the new EQUIP filter axis (09 §1 `DATA`).
- **Exercise page (3.1a/3.1b)** — rebuilt `/exercises/[exerciseId]` with an **OVERVIEW | HISTORY**
  segmented toggle (`?tab=`). Overview = LAST PERFORMED (date · W·D) + the **ALL-TIME BESTS** 2×2 ink
  grid (weight PR, est 1RM, volume PR, best session vol) + **EST. 1RM ACROSS `<macro>`** M1…Mn bars
  (filled past / accent-framed current / dashed future) + TIMES TRAINED / TOTAL VOLUME / FIRST LOGGED
  footer; description, pinned note, and the custom-exercise SHARE row retained below (deviation —
  functionally needed, not in the stock mockup). History = `ExerciseHistoryList` (sessions grouped by
  meso). `getExerciseOverview` reads the view, derives the last-session coordinate, and computes the
  across-macro bars from `v_exercise_history` (same pattern as the meso-stats macro chart).
- **Exercises tab (3.1) two-axis filter** — `MUSCLE` and `EQUIP` rows (chips scroll, selected = filled
  ink + ✕ to clear, EQUIP has an `ALL` chip); the two combine **AND**; an `n OF N EXERCISES` count +
  `CLEAR ALL` appear whenever a filter is active. Equipment chips are the distinct types present.
- **Meso stats — Volume tab removed** (09 §4): the segmented control is now **Balance · Performance**
  and defaults to **Balance**; the renumbering is 4.1 Balance / 4.2 Performance. `buildVolumeMatrix`
  stays (it still feeds `buildBalance`, and the Workout-tab resting state still renders `VolumeView`
  per 08 §2 — left unchanged, not in this backlog item).
- Types: `VExerciseOverviewRow` + the `v_exercise_overview` view registered in `database.ts`.
- Tests: **102 passing** (+7) — `buildExerciseMacroBars` (label/state/rounding, current-with-no-data,
  no-current, empty) and `groupHistoryByMeso` (consecutive grouping, distinct same-named mesos, empty).

### Recorded deviations

- **Overview keeps description / pinned note / SHARE** below the stat blocks — the 3.1a mockup shows a
  stock exercise without them, but they're functional (custom-exercise description + sharing, the
  pinned note). Square-corner ledger styling preserved.
- **Stats back-nav stays `‹ MESO`** and entry stays the meso-detail `MESO STATS` row — the planner-board
  `PLAN | STATS` toggle + `‹ PLAN` back-nav belongs to the not-yet-built single-surface planner (2.5);
  only the Volume-tab removal is in scope here.
- **`tracking_type` (3.1c / per-set render) deferred** — it changes `logged_sets` (nullable weight/reps
  + `duration_seconds`) and touches the whole logging core, so it's a separate slice (still `[ ]` in 07).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (102/102), `npm run build` green. Migration applied
to hosted; `v_exercise_overview` shape + computed values validated against raw `logged_sets`; equipment
index present; security advisors show no new lints (the view is security_invoker, no SECURITY DEFINER).
Read-only validation against existing account data — nothing written or deleted. In-browser pixel QA of
the new Exercise page / filter rows still pending (as for the other screens).

## 2026-06-15 — Logging-flow review, round 2: animation polish + skip/dot refinements

Follow-up to the on-device review (09 session-5, second batch).

### Done

- **Navigator no longer re-animates on day load.** The reveal transition is now gated to an
  explicit chevron toggle (`animate` flag); hydrating the open state after a day-chip navigation
  snaps instead of replaying the 0fr→1fr animation. Week selection was already smooth (client state).
- **Active-day dot always shown.** The orange dot marks the meso's resume week/day **regardless of
  selection** (dropped the `!viewing`/`!isSel` guards; the current week is derived from the nav
  grid, not the viewed week), so the user can always spot and return to the live day.
- **Bottom sheets slide up/down.** `BottomSheet` gained a reusable `useSheetTransition`
  (mount + `translate-y-full`↔`translate-y-0` + scrim fade, ~280ms ease-out); the per-exercise
  feedback sheet (1.4) now animates in, and the Workout Complete sheet (1.5, a custom container)
  uses the same hook for enter **and** exit.
- **Unskip all.** The exercise menu (1.2) shows **"Unskip all sets"** whenever the exercise has any
  skipped sets (`clearSkippedSets`), alongside per-set unskip.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. No schema change
this batch (reuses `skipped_set_numbers` from `20260615000003`).

## 2026-06-15 — Logging-flow on-device review: interaction fixes + per-set skip (DATA)

First hands-on review of the deployed logging flow (09 session-5). Seven interaction fixes
shipped; two larger features (notes model, workout/meso options menu) specced for next slices.
Vertical slice; `main` deployable.

### Done

- **Navigator stays open** across day selection — open state persisted in `sessionStorage`, so
  picking consecutive days no longer collapses it (supersedes the "defaults closed each entry" note).
- **Denser set rows captured** (09 §5, which the code had never picked up): box `42→32px`, value
  `17→14px`, log box `26→21px`, row padding `7→4px`, grip/log columns `22/50→20/44`; the LOG control
  keeps a ≥44px-wide tap target around the 21px box.
- **Sets are uncheckable** — tapping a logged ✓ on an active workout un-marks it and re-opens the
  slot (`unlogSet`; keeps the prescription, no renumber). Completed workouts stay locked.
- **Row menus flip on-screen** — new `AnchoredMenu` (viewport-`fixed`, measures the trigger and its
  own height) opens below when there's room, otherwise above; replaces the absolutely-positioned
  cards that ran off the bottom edge. Used by both the exercise (1.2) and set (1.3) menus.
- **Per-set skip** (`DATA`, migration `20260615000003_per_set_skip.sql`, **applied to hosted**):
  `workout_exercises.skipped_set_numbers int[]`. "Skip set" greys a set **in place** and is
  reversible ("Unskip set"); "Skip remaining sets" fills every uncompleted slot and **no longer
  flips the whole exercise to skipped** (fixing the bug where the exercise + its reopened menu were
  greyed/backgrounded). Skipped sets are never logged, so the engine and views are unaffected; the
  type's `Defaulted` union gained the column so inserts stay optional.
- **Delete vs skip split** — "Delete set" drops a planned slot (unlogged) or deletes the logged row
  (`deleteSet`, renumber); "Skip set" toggles the greyed state. Both gated to in_progress.
- **Complete-workout gating** — the button now appears only once **every set is logged or skipped**
  (was "after any set is logged"); the helper `exerciseDone`/`plannedSetCount` account for skips.

### Deferred to next slices (specced in 09 session-5 §8/§9, 07 backlog, 03)

- **Notes model** — split the cross-workout **pinned note** (exercise attribute, inline edit icon,
  optional) from a per-session **log note** (saved with the workout's exercise log; note-icon on
  history rows; editable only live). `DATA`.
- **Workout / mesocycle options menu** on the Day View header — Mesocycle (notes · edit → planner ·
  stats · End mesocycle) + Workout (note · edit day · add exercise · End workout). New audited
  `endMesocycle`/`endWorkout` queries + confirm steps. `DATA`.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Per-set-skip
migration applied to hosted. No new unit tests this slice (the new functions are I/O against
Supabase; pure helpers live in the component); the engine paths are unchanged and remain golden-tested.

## 2026-06-15 — Logging retrofit: Day View header, Workout Complete redesign, completion lock (Design v2 backlog, DATA)

Lands the **Logging (against Phase 3) reconciliation block** from 09 (2026-06-13 §1–2 / 2026-06-14
§1): the Day View header rework (1.1), the redesigned Workout Complete sheet (1.5), the set
delete + completion lock (1.3), and the 1.2 menu relabel. Vertical slice; `main` deployable.

### Done

- **Day View header (1.1)** — rebuilt as a **sticky/locked region** with a **collapsible week/day
  navigator**: `workout` logotype + disclosure chevron, a bordered card with the week selector
  (`W1…DL`, current-week orange dot) and a **nested day-chip drawer** for the selected week
  (completed = tint + ✓, current = orange dot, viewing = filled ink). Day chips **navigate** to that
  day's `/log/[workoutId]`. The coordinate keeps `W·D` + date and moves **Target RIR** beside it (in
  orange; `DELOAD WEEK` on deload); the old `MESO n/N` meta line and the `N OF M SETS LOGGED` text
  are replaced by an **orange progress bar** (`setsLogged ÷ setsPlanned`) over the marked divider.
  `DATA`: `getWorkoutDetail` now returns `navWeeks` (per-week programmed days with completion state +
  workout ids), built from the meso's microcycles/workouts/`meso_days` (future weeks fall back to the
  planner's day list).
- **Workout Complete (1.5) — redesigned.** Removed the boxed `AUTOREGULATION` panel and the
  `View meso stats` link (recalculation runs silently). The sheet is now **counts + the three
  session sliders** (overall fatigue / effort / performance, 0–4, same `SnapSlider` UI as the 1.4
  prompt) **+ notes + a single `NEXT WORKOUT →`** that completes, advances, and navigates in one
  action. `DATA`: `saveWorkoutFeedback` writes `workout_feedback` **before** completion flips the
  status, so the **already-wired** session dampener (10 §3 / `feedback.ts` `sessionDampened`) finally
  has data — previously the engine accepted `workoutFeedback` but the UI never captured it.
- **Set delete + completion lock (1.3)** — `DATA` migration `20260615000002_completion_lock.sql`
  (**applied to hosted**, policies + advisors re-checked): replaces the user-only `logged_sets`
  update policy and adds a delete policy, both gated on the **parent workout being `in_progress`**;
  splits `exercise_feedback`'s blanket `for all` into select/insert (own) + update/delete (own **and**
  parent workout `in_progress`). Inserts stay open (the first set is written while the workout is
  still `planned`); the service-role week-N→N+1 job is unaffected. UI: the set menu's **Delete set**
  now really deletes a logged set while in-progress (`deleteLoggedSet` renumbers survivors + trims a
  prescribed slot); a completed workout shows `Logged — session locked`. Refines hard rule #5
  (append-only **after** completion).
- **Exercise menu (1.2)** — `History ›` → **`View exercise ›`**, repointed to the exercise detail
  page (the full 3.1a Overview tab arrives with the library slice).
- Tests: RLS suite reworked — the old "append-only (no delete policy)" case is now a
  **completion-lock** pair: owner can amend+delete while `in_progress`; a **completed** workout
  rejects both amend and delete (and stays invisible to other users). 95 unit/engine tests
  unchanged (engine dampener already had golden coverage).

### Recorded deviations

- **Single-action complete** (vs the prior two-phase confirm→recalculated sheet): the redesigned
  sheet completes + advances + navigates on the one `NEXT WORKOUT →` tap, matching the mockup. The
  engine summary is no longer surfaced (panel removed by design); it still writes `engine_decisions`.
- **`workout_feedback` not RLS-locked on completion.** The spec calls out gating
  `logged_sets`/`exercise_feedback`; `workout_feedback` stays own-scoped because it is written once,
  transactionally, just before completion (gating its insert on `in_progress` would be order-fragile).
- **"View exercise" lands on the existing exercise detail page**, not the not-yet-built 3.1a/b
  Overview/History tabs (library slice). Functionally equivalent for now (description, bests, history).
- **Sticky header fidelity:** implemented as `position: sticky` within the scrolling page (the app
  isn't a fixed-height device frame); in-browser pixel QA still pending, as for the other screens.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. Migration applied
to the hosted project; policies confirmed present with the `in_progress` gate and security advisors
show no new lints. RLS assertions for the lock are written (need a running stack to execute, as for
the rest of the RLS suite). No hosted integration smoke this slice (avoided polluting the account) —
the new query/IO paths are covered by typecheck + build; the engine dampener path is unit-tested.

## 2026-06-15 — FFMI proximity target model + body-fat input (research-driven, ENGINE/DATA)

Multi-source literature review (deep-research harness, 7 agents) on real muscle/strength/fat-loss
rates exposed the core flaw: the engine keyed hypertrophy off **calendar training age**, which
overstates adaptation for someone who trained for years without growing. Per the research the right
state variable is **proximity to genetic potential**, observable from body composition (FFMI).

### Done

- **FFMI proximity model (primary driver)** in `src/lib/engine/macro.ts`: `rate = floor + (base −
  floor)·(1 − developedFraction)`, where `developedFraction` comes from normalized FFMI vs ceiling
  (`{male 25, female 21.5}`) / untrained baseline (`{18.5, 14.5}`); target capped at 0.6 × remaining
  potential. **Falls back to the v4 training-age decay** when body fat is unknown (existing users
  unaffected). Cut leanness band now uses **body-fat %** when present (BMI proxy fallback). Sex factor
  **0.5 → 0.7** (research: relative gains equal between sexes; 0.5 over-penalized).
- **`body_fat_pct`** added to `profiles` (migration `20260615000001`, **applied to hosted**;
  nullable, 2–70 check) with a **skippable visual band picker** in the Profile editor (6 bands → stored
  midpoint; `clearBodyFatAction`). Onboarding stays 4 steps; absent BF → graceful training-age fallback.
- **`engine_params` v5** (same migration, applied to hosted + re-parsed through the schema): new
  `hypertrophy_floor_pct_bw_month`, `ffmi_ceiling`, `ffmi_untrained`, `proximity_macro_cap_frac`,
  `cut_bf_thresholds`; v4 deactivated. New fields carry `.default()` so older rows still parse.
- **Validated the headline case:** 6′1″ 159 lb ~16% bf "trained since 2013" (FFMI ≈ 17, below
  untrained) now reads **+19–29 lb/12mo** (beginner-class) instead of elite ~2 lb/yr; a jacked FFMI-25
  veteran of the same age correctly reads ~0; leaner-at-equal-weight ⇒ slower (reads muscle, not scale).
- Tests: **95 passing** (+4) — proximity goldens (undermuscled-long-timer, near-ceiling, leanness
  gradient, BF-based cut band); sex-factor test corrected to 0.7. RLS active-version assertion → 5.
- Docs: 10-spec §5 rewritten (proximity primary, training-age fallback, v3→v4→v5 evolution + the Hubal
  individual-variation caveat). `scripts/macro-engine-matrix.ts` retained as the dev review harness.

### Notes / honesty

- The target is explicitly **not the heart of the app** (periodization for results is) — implemented
  proportionately, behind tunable `engine_params`, and always shown as an estimate band.
- FFMI ceiling (25/21.5 normalized) and the band-midpoint body-fat estimate carry real individual
  variation; the model is a planning prior, not a prediction.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (95/95), `npm run build` green. v5 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema`; user case confirmed
duration-sensitive and beginner-class. RLS suite needs a running stack (unchanged); assertion bumped.

## 2026-06-14 (latest) — Macro-target engine fix: continuous training-age decay + capped cut + auto block-length (ENGINE)

Fixes the realistic-target outputs flagged on-device: for a high-training-age profile the target was
**static across durations** (3-month and 12-month macros both showed ≈+0.6 lb) and implausibly low.
Root cause: the hypertrophy model clamped the per-macro total to a hard **career-cap** (remaining
lifetime potential), which collapses to a fixed tiny number for near-potential lifters regardless of
duration. Reviewed via a matrix harness across 7 profiles × 4 goals × 3 durations and retuned.

### Done

- **Hypertrophy → continuous training-age decay** (`rate(T) = base × e^(−T/tau)`, `base {1.0,1.5}%BW`,
  `tau 5 yr`). The target now scales with duration **and** tapers smoothly with training age; the hard
  career-cap clamp is gone (`career_cap_lb`/`career_tau_years` kept in params only for back-compat).
  Reproduces the Aragon bands at their anchor ages; a 13-yr lifter now reads **+0.4–0.7 / +0.9–1.3 /
  +1.8–2.6 lb** for 3/6/12 mo (was a flat +0.6 lb) — ~2–3 lb lean mass/yr, research-appropriate.
- **Cut → compounding + cap.** Was linearly extrapolating %BW/week (−93 lb over 12 mo). Now compounds
  on the shrinking bodyweight (decelerates) and is capped at `cut_cap_pct_bw` (25% BW). Strength and
  maintain unchanged.
- **`suggestMesoLength(months)`** (pure) — picks the block length (4/5/6 wk) that divides the macro
  most evenly (12 mo → 4 wk = 52/4 exact; 6 mo → 5 wk). The Create-Macrocycle form **auto-selects** it
  and re-suggests as duration changes, until the user overrides (then their pick sticks); a `SUGGESTED`
  hint shows until then.
- **`engine_params` v4** (migration `20260614000003`, **applied to hosted** + re-read/parsed): new
  `hypertrophy_base_pct_bw_month`, `hypertrophy_decay_tau_years`, `cut_cap_pct_bw`; v3 deactivated.
  Schema fields added with `.default()` so older rows still parse; seed + `DEFAULT_ENGINE_PARAMS`
  mirror it; RLS active-version assertion bumped to 4.
- Tests: **91 passing** (+5) — reworked macro goldens to the new model; a **monotonic-in-duration**
  property across training ages 1/4/7/13 (would have caught the static bug), a 13-yr decay-but-positive
  case, a cut-cap bound, and `suggestMesoLength` correctness. `scripts/macro-engine-matrix.ts` is the
  (dev-only) review harness. Docs: 10-spec §5 rewritten (model + superseded note); cut formula updated.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (91/91), `npm run build` green. v4 migration applied
to hosted; the exact migration JSON re-parsed through `engineParamsSchema` and the 13-yr case confirmed
duration-sensitive. Corrected output matrix reviewed across beginner→elite, both sexes, older lifter.

## 2026-06-14 — Macrocycle restructure: goal layer + Create engine + Overview + Cycles retrofit (Design v2 backlog, DATA)

Lands the largest reconciliation block: the **macrocycle becomes the single-goal layer** (09
2026-06-13 §3–5 / 2026-06-14). `macro_slots` retired; the create-macrocycle engine (2.3),
Macrocycle Overview (2.2), `+ NEW` chooser (2.1b), and the Cycles list retrofit (2.1) are live,
all feeding off the already-built-and-tested `planMacrocycle`. Vertical slice; `main` deployable.

### Done

- **`DATA` migration `20260614000002_macrocycle_restructure.sql`** (append-only; **applied to the
  hosted project** via Supabase MCP, schema re-read to confirm):
  - `macrocycles` — goal vocabulary migrated (`gain → hypertrophy`, `strength` added; check swapped
    to `hypertrophy/strength/cut/maintain`); new `duration_months`, `meso_length_weeks`,
    `recommended_duration_months`, and the cached planMacrocycle snapshot (`target_low/high`,
    `target_unit`, `target_direction`, `rate_low/high`).
  - `mesocycles` — `position` + `phase` (accumulation/intensification/peak); `unplanned` added to the
    status check; `macro_slot_id` dropped; `(macrocycle_id, position)` index. Any prior slot ordering
    is carried onto the host meso before the table goes.
  - `macro_slots` **dropped** (policy/index/trigger cascade).
  - New **`v_macro_summary`** (security_invoker) — per-macro rollup (meso count, sessions, total
    volume, working sets, first-week start). Security advisor clean (no new lints; view isn't flagged).
- **Engine wiring (no engine change).** `src/lib/queries/macro.ts`: `profileToMacroProfile`
  (training-age from `training_since`), `planForMacro` (live recompute), `createMacrocycleWithMesos`
  (creates the macro + N **unplanned, phased** placeholders), `planUnplannedMeso` (`+ PLAN` flips to
  planned), `getMacroOverview` (+ `buildMacroStats`: est-strength e1RM trend on key lifts by
  frequency, over the shared `v_exercise_history`). `engineGoal` simplified to map the macro goal →
  progression goal (hypertrophy/strength → gain; cut/maintain pass through); slot lookup removed from
  the week N→N+1 job and the meso-stats macro chart.
- **Screens (pixel pass off the v2 mockup, figs 2.1/2.1b/2.2/2.3):**
  - **Create Macrocycle (2.3)** `/cycles/new` — the engine: name, goal (4), duration (3/6/12/custom),
    block length (4/5/6 wk), with a **live target card** (range + per-month rate + meso strip +
    phase legend) recomputed client-side via the pure `planMacrocycle`. Creates `active` macro +
    unplanned mesos, lands on Cycles.
  - **Macrocycle Overview (2.2)** `/cycles/macro/[macroId]` — realistic-target card (range + orange
    `≈ rate / month` + profile chips), mesocycle timeline (phase + status + `+ PLAN` on placeholders),
    macro-stats 2×2 (est strength / total volume / sessions / adherence). No progress-vs-projection
    bar (09 §3).
  - **`+ NEW` chooser (2.1b)** — bottom-sheet picker (Macrocycle → 2.3 · Standalone meso → 2.4) with
    the in-macro `+ PLAN` note.
  - **Cycles list (2.1) retrofit** — macro rows `GOAL <goal> · N MESOCYCLES` + `OVERVIEW ›`, name →
    Overview, chevron expand; meso rows `MESO n · <PHASE> · …`, unplanned `SUGGESTED <phase> · NOT
    PLANNED` + `+ PLAN`; standalone section unchanged. Slot language gone.
  - Standalone meso create (2.4 from-scratch/template) simplified to standalone-only; planner board
    macro-context strip rebuilt from `position`/`phase`.
- Types (`database.ts`): `MacroGoalType`/`MesoPhase`, macrocycle target columns, meso `position`/
  `phase`/`unplanned`, `MacroSlotRow`/`macro_slots` removed, `VMacroSummaryRow` added.
- Tests: **86 passing** (+6) — `macro.test.ts` (profile→engine mapping incl. training-age math,
  phase labels, plan snapshot/recommended-duration fallback); `engineGoal` test reworked to the new
  goal mapping. RLS test updated (goal vocab; slot block → positioned-unplanned-meso gating).

### Recorded deviations

- **Per-month rate cached** in `macrocycles.rate_low/high` — 03 says the rate is "derived, not
  stored". Cached anyway because strength's compounding band is **not** derivable from the total
  range ÷ duration; the Overview still **recomputes the whole plan live** from the profile, so the
  cache is a snapshot/fallback only.
- **Est. strength** (macro stats) is computed in the **query layer** over `v_exercise_history` (the
  e1RM trend is engine-side), not inside `v_macro_summary` SQL — same pattern as Phase 4 progress
  scoring; still one shared view for the raw history.
- **Timeline progress bar** is status-based (done = filled, active = accent, planned = faint), not
  set-precise — exact `setsLogged ÷ planned` per meso would need extra queries; deferred.
- **Overview `FULL ›`** link and a real **EDIT MACROCYCLE** screen are out of this slice — the stats
  card has no detail page yet, and edit shows `SOON`. (Per-meso STATS is the existing 4.x screen.)
- **`v_exercise_overview`** (Exercise page 3.1a) is **not** built here — it belongs to the
  library/stats slice; the shared-views list in CLAUDE notes it as pending.
- Legacy pre-restructure meso (1 row on hosted) has null `position` — the Overview/list fall back to
  row index so it renders cleanly.

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (86/86), `npm run build` green. Migration applied
to the hosted project and the schema re-read (new macro columns, meso `position`/`phase`, `macro_slots`
gone, `v_macro_summary` present, legacy `gain` row migrated to `hypertrophy`); security advisors show
no new lints. RLS suite needs a running stack (unchanged); its assertions were updated to the new
shape. No hosted integration smoke this slice (avoided polluting the existing account) — the create/
overview I/O is exercised only through typecheck + the schema check; pure helpers are unit-tested.

### Not done yet / next

- **Plan a mesocycle (2.4) four paths** — copy / template / **meso builder (group priorities)** /
  scratch (copy + builder still stubs).
- **Planner board (2.5) as the single meso surface** — `PLAN | STATS` toggle, partial-completion
  lock, `SAVE CHANGES`; retire the old meso-detail (2.2-old) page.
- **Logging retrofit (1.1/1.2/1.5/1.3)** — Day View sticky header + orange progress bar, Workout
  Complete redesign (re-add session sliders), set delete + completion lock RLS.
- **Library & stats** — `exercises.tracking_type` + per-type set rows, two-axis filter, **Exercise
  page (3.1a/b)** + `v_exercise_overview`, Meso Stats drop the Volume tab.
- **MCP `create_macrocycle` / `get_macro_summary`** (05) once the connector phase lands.

## 2026-06-14 — Macrocycle planning engine + e1RM metric (Design v2 backlog, ENGINE)

First code landing of the **Design v2 reconciliation backlog**: the pure engine foundation the new
macrocycle goal layer (Create Macrocycle 2.3 / Overview 2.2) sits on, plus the §1 e1RM definition.
Pure, fully tested, no UI yet — the screens consume these in the next slice.

### Done

- **`planMacrocycle()`** (`src/lib/engine/macro.ts`, pure & parameterized per 04 §Macrocycle
  planning, defaults from 10 §5): ingests the full profile (sex, age, bodyweight+unit, height,
  experience level, training years) and a goal (hypertrophy / strength / cut / maintain), returns
  `{ target, perMonthRate, recommendedDurationMonths, durationMonths, mesoCount, phases, estimate }`.
  - **Hypertrophy** — %BW/month rate band × duration × **sex factor** (0.5 female absolute) ×
    **age taper**, capped by a **career-potential** ceiling that decays with training age
    (`1 − e^(−years/τ)` × `career_cap_lb`).
  - **Strength** — monthly-compounding % on key lifts, capped per experience.
  - **Cut** — %BW/week scaled by **leanness via BMI proxy** (high-bf / average / lean bands),
    presented as a loss.
  - **Maintain** — no weight target (recomposition framing).
  - **Recommended timeframe** — months to reach a meaningful target at the profile's rate, clamped;
    backstops an omitted duration. `mesoCount = floor(months × 4.33 / mesoLength)`; **phases** spread
    accumulate → intensify → peak (`spreadPhases`, parameterized by `phase_plan`).
  - Every target carries an `estimate: true` flag + an "(estimate, …)" rationale (10 §9 honesty
    guardrail — no progress bar, conservative end).
- **e1RM** (`src/lib/engine/e1rm.ts`, 10 §1): `estimateE1rm(weight, reps, rir, params)` →
  effective-reps (`reps + rir·offset`), **averaged Epley/Brzycki** (Epley-only fallback past
  Brzycki's valid range), and a **confidence band** (high / moderate / low) that degrades with
  effective reps / RIR and is `low` whenever RIR is unreported.
- **Params v3** (`engine_params`): new `e1rm`, `macro_target`, `phase_plan`, `key_lifts` blocks added
  to `engineParamsSchema` with `.default()` (so the active v2 row still parsed) and seeded as an
  explicit, admin-tunable **version 3** via append-only migration `20260614000001_engine_params_v3.sql`
  (v2 deactivated, kept for replay). Mirrored in `params.ts` defaults + `seed.sql`; **applied to the
  hosted project** (v3 active, parses). RLS test updated to expect active version 3.
- Tests: **80 passing** (+18) — 12 golden/property macro plans (per-goal goldens, monotonic-in-
  duration, ~½ female absolute, experience scaling, perMonthRate×duration≈target, `spreadPhases`) +
  6 e1RM (Epley/Brzycki average, confidence bands, Brzycki fallback, null-RIR, non-working input).

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (80/80), `npm run build` green. Migration applied
to the hosted project via the Supabase MCP and re-read (v3 active, `macro_target`/`phase_plan`
present and well-formed). RLS suite needs a running stack (unchanged from prior sessions); the
version assertion was updated to 3.

### Not done yet / next

- The **DATA macrocycle restructure** (retire `macro_slots`; `macrocycles.goal_type` /
  `duration_months` / `meso_length_weeks` / derived targets; `mesocycles.position` / `phase` /
  `unplanned`) — the migration that the Cycles UI net-new screens depend on. `planMacrocycle` is
  ready to feed it.
- **Cycles UI net-new** (2.1 retrofit, 2.1b chooser, 2.2 Overview, 2.3 Create Macrocycle engine):
  wire `planMacrocycle` into the create flow + Overview target card (live recompute on goal/duration).
- **Metric-defaults remainder**: wire e1RM into the stats views/exercise page; seed volume landmarks
  / autoreg bands / adherence with per-metric golden tests.

## 2026-06-14 — Metrics & engine-params research lock-down (no code)

Research + documentation pass turning every mockup metric into a precise, research-backed
definition with default `engine_params`. Ran a multi-source sports-science review (e1RM accuracy,
rate-of-gain models, volume landmarks, subjective-feedback validity, progression/deload, push/pull
balance) with primary citations. **No code changed.**

### Done

- **New [10-metrics-spec.md](10-metrics-spec.md)** — authoritative metric/param doc: e1RM
  (effective-reps = reps+RIR, avg Epley/Brzycki, confidence weighting), fractional volume counting
  (1.0/0.5), MEV/MAV/MRV landmarks, workload/pump/joint-pain → set-count autoregulation, RIR ramp,
  increments/regression/deload, the profile-personalized macrocycle target + recommended-timeframe
  engine, key-lifts-by-frequency, stats rollups (total volume, adherence, progress score, advisory
  push:pull), consolidated default `engine_params`, and §9 honesty guardrails.
- **Decisions locked (user, 2026-06-14):** (1) macrocycle target personalized from the full profile
  + engine recommends timeframe; shown as an estimate, no progress bar; (2) **session feedback
  sliders restored** to a redesigned Workout Complete sheet (mockup dropped them in error); (3)
  fractional 1.0/0.5 volume counting; (4) key lifts = most-logged (by frequency). Defaults: female
  absolute-target ×0.5 (relative %s equal); pump = secondary nudge only.
- Threaded through 01 (F2/F3), 03 (`workout_feedback` kept + redesigned sheet; macro recommended
  duration; fractional counting), 04 (`planMacrocycle` profile inputs + recommend-timeframe; metric
  pointers), 05, 07 (backlog: Complete redesign, profile-driven target, params seeding), 08
  (decisions log), 09 (new 2026-06-14 session-4 entry), CLAUDE.md (10 in read-first list).

### Recorded deviation

- **Workout Complete (1.5) re-adds session sliders** — authorized deviation from the mockup, which
  dropped overall fatigue / effort / performance. Sheet = counts + the three session sliders (1.4
  slider UI) + paragraph notes + `NEXT WORKOUT →`; autoregulation panel stays removed.

### Not done yet / next

- Implement the metrics/params per 10 (engine + migrations + the Complete-sheet redesign), in the
  07 reconciliation backlog. Hard rules in force; engine changes need golden fixtures.

## 2026-06-14 — Design v2 handoff: docs integration (no code)

Documentation-only pass folding the **2026-06-13/14 design sessions** into the spec docs ahead of
implementation. New design assets imported and every doc reconciled; **no schema, engine, or UI
code changed** — the implementation lands in future sessions per the new reconciliation backlog.

### Done

- **Imported design artifacts** into `docs/design/`: updated source-of-truth mockup
  `workout - App Screens v2.dc.html`; new interactive prototype `WorkoutApp.dc.html` +
  `workout - Interactive Prototype.dc.html`; session-3 render screenshots under
  `screenshots/v2-session3/`; and the new **`docs/09-design-changelog.md`** (authoritative for its
  dated deltas).
- **08-design-decisions** — added the 09 amendment pointer; reconciled the §5 figure index
  (Section 02 renumbered, `+ NEW` chooser 2.1b, Macrocycle Overview 2.2, Create Macrocycle 2.3,
  planner board 2.5; Exercise page 3.1a/b/c; Volume stats tab removed → Balance 4.1 / Performance
  4.2); repointed stats to the planner `STATS` toggle; logged new decisions (macrocycle goal layer,
  realistic target, plan-a-meso paths, exercise tracking type, simplified complete sheet).
- **01-product-spec** — macrocycle as a single-goal layer (hypertrophy/strength/cut/maintain) with
  the create engine + realistic target; F2 cycle flow (chooser, 4-path plan, planner lock); F3
  complete sheet simplified; F5 tracking type + two-axis filter + Exercise page; F7 stats restructure.
- **03-data-model** — `DATA` target shape: `macrocycles` goal vocab + `duration_months` /
  `meso_length_weeks` / derived target columns; **retire `macro_slots`** → `mesocycles.position` +
  `phase` + `unplanned` status; `exercises.tracking_type`; `logged_sets` nullable weight/reps +
  `duration_seconds`; new views `v_exercise_overview` / `v_macro_summary`; week→day completion +
  `exercises(equipment_type)` index. Marked as migration deltas (not yet migrated).
- **04-feedback-engine** — goal vocab (gain→hypertrophy, +strength) + phase modulation; new pure
  `planMacrocycle()` (meso count, suggested phases, realistic target + per-month rate from
  goal/duration/block-length/profile); module layout + golden/property test requirements.
- **05-mcp-connector** — `create_macrocycle` (engine-computed) + `get_macro_summary`; goal-update
  tool reworked; new views added to the data-shape contract.
- **06-design-system** — addendum for the SetRow density, locked Day View header + progress bar,
  two-axis filter, `PLAN | STATS` toggle, and the exploratory dark theme (→ 09 §5a).
- **07-implementation-plan** — added the **Design v2 reconciliation backlog** (retrofit/net-new
  mapped to Phases 2/3/5 with `DATA`/`ENGINE` tags) for future execution.
- **CLAUDE.md** — 09 added to the read-first list and pixel-fidelity rule; mockup-over-prototype
  source-of-truth note; shared-views list extended.

### Not done yet / next

- Everything in the **07 reconciliation backlog** — the actual migrations, engine functions, and
  screen retrofits. Execute in future sessions, hard rules in force (append-only migration + RLS +
  tests per PR; engine changes need fixtures; pixel fidelity to the mockup, checking 09 first).
- **Resolved (2026-06-14):** the set menu (1.3) `Delete set` is allowed for **any set while the
  workout is `in_progress`** (not just unlogged). **Completing a workout locks it** — sets/feedback
  become immutable — since completion runs the engine's next-week generation and we don't want to
  recompute the chain. RLS gates `logged_sets`/`exercise_feedback` `update`/`delete` on the parent
  workout being `in_progress`; this refines hard rule #5 (append-only *after* completion). Edit-meso
  already can't touch completed weeks (planner lock). Captured in 03/07/08.
- Note: the interactive prototype is a **functional-testing** artifact and is not pixel-perfect —
  the **mockup is the source of truth** for every detail (already enforced in CLAUDE.md / 09).

## 2026-06-13 — Phase 5: meso stats, library, templates & sharing

### Done

**Phase 5 — meso stats, library & templates** (complete except a from-scratch template editor, which is not planned for v1)

- **Meso stats (figs 4.1–4.3)** at `/cycles/meso/[id]/stats` — one screen, three views via the segmented control, everything off the shared views (one definition of progress):
  - *Volume:* sets-per-group-per-week matrix from `v_meso_week_sets` — closed weeks show logged, the active week shows logged-so-far (orange `● W#` + `N OF M PLANNED SETS` footer), generated future weeks show the autoregulated plan, ungenerated weeks fall back to the planner baseline; TOTAL row; `W#–W# = AUTOREGULATED PLAN` caption
  - *Balance:* PUSH/PULL/LEGS cards (avg planned sets/wk; classification over the seeded vocabulary, abs excluded), per-muscle bars, BALANCE CHECK callout (push:pull ratio + lowest-volume group)
  - *Performance:* top-set-by-week grid for the meso's three biggest lifts (orange cell = in-progress week, `+N LB VS W1` badge), e1RM-across-macro bars for the lead lift (filled past / accent current / dashed future slots), PRS THIS MESO (ALL-TIME = heavier top weight than all pre-meso history; REP PR = better e1RM at or below the old top weight; lifts with no prior history can't PR)
  - Entered from meso detail, the 1.5 complete sheet, and the **Workout-tab resting state**, which now renders the last completed meso's full 4.1 view (08 §2)
- **Exercises tab (3.1) build-out:** rows link to an exercise detail page (description, primary/secondary groups + equipment, last performed, all-time best, pinned note, inline 3.2 history); `+ NEW` creates custom exercises (name, equipment, primary + secondary groups, description/notes; zod-validated)
- **Exercise history (3.2) shared everywhere:** query moved to `src/lib/queries/history.ts` with one presentational component; used by the day-view menu, the exercise detail page, and the **picker (2.6)**, whose selected card now shows the last-session line (`115 lb × 13, 12 · MESO — W4·D1`) and the underlined `FULL HISTORY ›` sheet per the mockup
- **Templates (3.3):** live tab (search, emphasis label, `N D/WK` + gender chips) → template detail page → `START A MESO FROM THIS` (2.7 create sheet with `FROM TEMPLATE — NAME` subtitle, then the planner board opens prefilled — days, groups, slot fills; **excluded exercises never carry over**, their slots stay open); `SAVE AS TEMPLATE` on meso detail round-trips the full `template_day_groups` shape; plan-a-meso (2.3) option 02 is live via a slot-aware template picker
- **Sharing (F5/F6):** one-time share codes (8 chars, no 0/O/1/I) for custom exercises, templates, and mesocycles — SHARE row on each detail page, redeem form on the Templates tab. Copy-on-accept with provenance ids (`source_exercise_id`/`source_template_id`) and per-grantee dedupe; custom exercises referenced by shared templates/mesos are copied (and deduped) too; shared mesos copy as **planned standalone structure** — the owner's loads don't carry, the engine seeds the grantee's numbers at start. Acceptance reads run on the service client (grantee can't read the owner's rows) with every write explicitly scoped to the redeeming user
- **Seed polish:** stock templates now seed `template_day_groups` (groups derived from each exercise's primary muscle group, slots linked); idempotent backfill added to the seed and **applied to the hosted project** (64 groups, 89/89 exercises linked)

**Phase 3 leftover — replace exercise (1.2 menu):** live picker pre-filtered to the slot's muscle group; blocked once sets are logged (row shows a LOGGED state); the prescription reseeds from the user's all-time best on the incoming movement with a clinical rationale line

### Recorded deviations

- **Templates `+ NEW` stays dimmed** and the 3.3 `CONTINUE EDITING DRAFT ›` row is omitted: templates come from save-meso-as-template (and Phase 6's MCP `create_template`); a from-scratch template editor + draft model is out of v1 scope
- **Share/redeem UI is not mocked** — built in the house style (bordered rows, redeem input on the Templates tab). Codes are single-redemption: mint again to share again
- **Volume view, ungenerated weeks:** workouts generate week-by-week, so far-future weeks show the planner baseline under the mockup's `AUTOREGULATED PLAN` caption until the engine generates them; ungenerated **deload** weeks show `—` (the engine sizes deload sets at generation)
- The performance macro chart labels itself `ACROSS MACRO — {LIFT} EST. 1RM` (no macro short-code; macros have names, not codes)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (62/62 — 14 new unit tests over the volume matrix, balance copy, key-lift grid, PR detection, emphasis vocabulary, share-code format), `npm run build` green. Hosted-DB smoke through the real modules: signup → stock template detail carries the backfilled groups-first shape → exclusion added → meso created from template (board prefilled, excluded movement's slot left open, slot counts intact) → saved back as a template (groups round-trip) → meso started → 2 sets logged → `getMesoStats` (current-week volume, key-lift cell, balance note), `getExerciseHistory` (W1·D1 entry) → custom exercise share code minted (format + dedupe on re-mint, stock objects refused). Smoke user + data deleted after; `acceptShareCode` itself isn't integration-tested (needs the service key, not available in this environment) — its helpers are unit-tested and all writes are user-scoped

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment)
2. Phase 6 — MCP connector at `/api/mcp`: OAuth bridge, read tools over the same views, draft write tools with `mcp_write_audit`, admin param/replay tools (`engine_decisions` + versioned params are flowing)
3. Phase 7 — production hardening (RLS/advisor audit, rate limiting, Sentry, accessibility pass, CSV export + account deletion, final design QA)
4. In-browser pixel QA of the new screens (stats, exercise detail, templates) against `docs/design/screenshots/`

## 2026-06-13 — Phase 4: progression engine alignment & wiring

### Done

**Phase 4 — engine re-alignment + week N→N+1 generation** (complete)

- **Feedback re-alignment:** engine inputs now take the redesigned 1.4 signals — joint pain 0–3 per exercise, pump and workload 0–10 per muscle group. The workload slider anchors set counts ("just right" = 5): `workload ≥ workload_high (8)` pulls a set; `workload ≤ workload_low (3)` with pump ≥ `set_add_pump_min (6)` under the gain goal adds one up to the group ceiling; low pump at the right dose flags exercise selection in the rationale instead of touching load. Strain/fatigue thresholds removed
- **Per-equipment per-unit increments:** `engine_params` v2 expresses increment + rounding per equipment in **both units** (`{ kg, lb }`) — lb users get real plate math (barbell +5 lb, not 2.5 kg × factor) — with first-class **bands (10 lb / 5 kg)** and **kettlebell (9 lb / 4 kg)** steps; the `engineEquipment` shim in generation is gone. Rationale copy now reads "+5 lb" (mockup voice)
- **Params v2** shipped as append-only migration `20260613000001_engine_params_v2.sql` (v1 deactivated and kept for replay; single-active index holds), mirrored in `params.ts` defaults and seed; **applied to the hosted project**; RLS test updated to expect v2 active
- **Week N→N+1 generation job** (`src/lib/queries/progression.ts`): on workout completion, `advanceWeekAfterWorkout` builds the same day of week N+1 from week-N actuals + feedback (group-scoped pump/workload resolved from whichever exercise closed the group, weekly group set totals, meso peak per exercise for deload sizing, goal from macro slot → macro → gain for standalone, peak slots train as gain), inserts the workout + prescriptions with rationale strings, and writes one `engine_decisions` row per exercise (inputs/output/params version) via the **service client** with explicit user scoping. Idempotent per day; on week close it backfills skipped days (prescriptions carry forward) and activates microcycle N+1; the final week closes the meso. `catchUpProgression` re-runs the job on first open of the Workout tab if completion-time generation failed
- **Autoregulation summary composer** (`src/lib/engine/summary.ts`, pure + unit-tested): the 1.5 copy — "Feedback recorded. W3 targets recalculated — Hack Squat +5 lb, Cable Pushdown +1 set. Ramp moves to 1 RIR next week.", deload and meso-close variants, clause cap with "and N more"
- **Complete sheet wired** (fig 1.5): `COMPLETE W2·D1` completes + recalculates in one action and the AUTOREGULATION callout swaps to the real engine summary; the primary becomes `NEXT — W2·D2` (next sibling, or W(N+1)·D1 once the week closes; `DONE` after the meso)
- **Progress scoring v1:** `getMesoProgressScores` (`src/lib/queries/stats.ts`) — per-exercise e1RM trend across a meso from `v_exercise_history` via `scoreProgress`, ready for Phase 5 stats and MCP
- Tests: 48 passing — reworked golden meso/prescribe/bounds fixtures to the new feedback shape, new cases for workload-anchored volume, pump corroboration, selection flag, kettlebell/bands steps, summary composer, and pure progression helpers (`buildEngineInputs`, `weeklySetsByGroup`, `peakByExercise`, `engineGoal`)

### Recorded deviations

- **Complete sheet is two-phase** (confirm → recalculated state): the 1.5 mockup shows the post-completion state; a confirm step is kept so opening the sheet can't silently mark untouched exercises skipped. After confirming, the sheet matches the mockup (real summary + NEXT button)
- Week-1 seeding decisions (from `startMeso`) are not yet audited to `engine_decisions` — the rationale lives on `workout_exercises.notes`; folding seeding into the decisions audit is noted for Phase 6 (replay wants it)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (48/48), `npm run build` green. Migration applied to the hosted project (v2 active, v1 kept inactive). Hosted-DB integration smoke through the real modules: signup → standalone 4-week meso (2 exercises, one group) → start (hosted params v2 parse) → 6 clean sets logged → group feedback (pump 7, workload 2) → complete → **advance**: week-2 workout generated with +5 lb on barbell, +1 set group-wide, RIR 3→2, full rationale strings, microcycle 2 activated, summary exactly in the mockup voice (`engine_decisions` insert shimmed in the smoke — no service key in this environment; covered by RLS tests). Smoke user deleted afterwards (and the leftover `smoke-test-claude@example.com` from the earlier session cleaned up too)

### Not done yet / next

1. Phase 3 leftover: Playwright e2e for the logging loop (still no browser runtime in this environment); exercise-menu replace/move
2. Phase 5 — meso stats screens (figs 4.1–4.3) off the shared views, exercises tab build-out, history sheet integration in picker/menu, templates round-trip, sharing
3. Phase 6 — MCP connector incl. admin param/replay tools (`engine_decisions` + versioned params are now flowing, so the decision inspector and replay harness have real data)

## 2026-06-12 — Design-fidelity pass: every screen transcribed from the v2 mockup HTML

The first builds of the 1.x–4.x screens improvised layouts from the spec prose; this pass re-reads `docs/design/mockups/workout - App Screens v2.dc.html` figure by figure and rebuilds each screen to its exact structure, copy, sizes, and colors. **New CLAUDE.md hard rule #8:** pixel fidelity to the mockup HTML is mandatory before building or changing any screen.

### Reworked to match

- **Day view (1.1)** is now the Workout tab itself (no header/back-link page): brand row (`workout` logotype + meso name), meso week track with the `MESO X OF Y · MACRO` / `● WEEK N — TARGET R RIR` caption, 46px `W2·D1` coordinate with date + `N OF M SETS LOGGED`, and per-exercise blocks — group caps label with 28px history/menu buttons, 20px exercise name + equipment, `PINNED —` note bar, and the **LB / REPS / LOG set grid**: editable cells (logged = tinted ink-framed; next = paper with 1.5px ink frame; future = faint), 26px LOG checkbox (filled ✓ / 2px frame / faint), ⋮ handle per row. `/log/[id]` stays as a deep link with a `‹ WORKOUT` crumb
- **Exercise menu (1.2)** and **set menu (1.3)** are anchored menu cards (offset hard shadow, scrim) — not bottom sheets — with the mockup's row sets: History › / New note / Replace exercise / Move down / Add set / Skip remaining sets / Remove exercise; Add set below / Set type (STRAIGHT⇄DROP) / Skip set / Delete set. History opens the 3.2 sheet (real `logged_sets` data grouped by meso)
- **Feedback (1.4):** title "Feedback", `MG — AFTER EXERCISE · FEEDS W# TARGETS` subtitle, sentence-case None/Low/Moderate/High pain options, ⓘ explainers, pump endpoints NO PUMP / BEST EVER, workload TOO EASY / JUST RIGHT / TOO MUCH with the explainer callout, Cancel + SAVE footer
- **Complete (1.5):** "W2·D1 complete." sheet with Exercises completed / Sets logged / Skipped rows, bordered AUTOREGULATION callout (placeholder copy until Phase 4), framed WORKOUT NOTES field, underlined "View meso stats", `NEXT — W#·D#` primary
- **Cycles (2.1):** `+ NEW` header button, expandable macro blocks (▼/▶) with `GOAL ARC: … · ● NOW IN SLOT N`, ink-rule-indented slot rows (✓ box / accent CURRENT badge / faint "Slot N" + dashed `+ PLAN`), `STANDALONE — NO MACRO` section
- **Meso detail (2.2):** WK/RIR/day-column ramp matrix (✓ cells, accent-framed next day, dashed deload/unbuilt), `RAMP 3 → 0 RIR` / `DELOAD W# — # RIR` caption, EDIT WEEKS + GO TO W#·D# button pair, MESO STATS row
- **Plan a meso (2.3):** numbered 01–04 rows (copy / template / builder / scratch) with chevrons
- **Planner board (2.4):** framed day-tab bar with `+` cell, `N OF M PICKED · S SETS` caption + `✎ DAY SETUP`, group headers with two-letter badges and sets counts, ⋮⋮ exercise rows with `EQUIPMENT · START N SETS`, dashed `Slot n — pick exercise` rows, macro-context strip with mini slot bars
- **Day setup (2.5):** label + weekday side-by-side, week-starts checkbox + accent Remove day, per-group −/n/+ steppers with ✕, in-sheet + ADD MUSCLE GROUP, helper copy, Cancel/DONE
- **Picker (2.6):** search + filled group chip, select-then-add model with the accent-framed SELECTED card (equipment, last performed, best set), `ADD TO {DAY}` primary
- **Create meso (2.7):** macro-placement timeline (filled/✓, accent-framed selected, dashed open slots with the JAN '26 … caption), framed 4–8 weeks segmented row, `RIR RAMP: 3 → 0 · W# DELOAD` caption, Cancel/CREATE; deload is always included per the mockup (toggle removed)
- **Exercises (3.1):** search frame, FILTERS chip row (muscle-group filter), `NAME / GROUP · EQUIPMENT · LAST date` rows; **Templates (3.3)** frame
- **More (4.4):** logotype, framed profile card (name, `34 · INTERMEDIATE · 198 LB · 5′11″` meta, TRAINING SINCE / N WORKOUTS LOGGED footer), SETTINGS rule with inline LB/KG mini-toggle, AI connector + CSV rows, version line
- **Profile (4.5):** read-only data rows (tap to edit in a sheet; height displayed ft/in for lb users), framed experience segmented control + helper, filled/bordered equipment chips, `NAME / REASON · ✕` exclusion rows + dashed + ADD EXCLUSION + helper

### Recorded deviations (hard-rule or phase-driven)

- **No "Delete set" on logged sets** — logged history is append-only (hard rule 5); the set menu offers amend-in-place instead. Delete/skip exist for unlogged sets only
- **Flow order:** the meso row is created at 2.7 before the board (the planner persists to `meso_days`/`meso_day_groups`, which need the meso id); the screens themselves match the mockups
- **Picker card** shows ALL-TIME BEST instead of the last-session set line (last-session line + FULL HISTORY land with the 3.2 integration in Phase 5)
- `+ NEW` on Exercises/Templates is dimmed until create-custom (Phase 5); plan-entry options 01–03 dimmed with "(soon)" until their phases
- Profile height edits in cm (display converts to ft/in); sign-out button added to More (needed, not mocked)

### Verified

`typecheck` / `lint` / `test` (30/30) / `build` green; hosted-DB smoke re-run for the extended day-view detail (context label, sibling workouts, microcycles) with cleanup.

## 2026-06-12 (later) — Phase 3 workout logging (core loop)

### Done

**Phase 3 — workout logging** (core loop; e2e + engine-derived summary pending)

- Day view `/log/[workoutId]` (fig 1.1): meso week track + RIR/deload badge in the header, day coordinate + day label, exercises grouped under `01 — QUADS` rules with pinned notes, set rows in three states — logged (filled ink, tap to amend), the live set (accent frame with weight/reps steppers, RIR chips, drop-set toggle, LOG SET), unstarted (faint prescription row)
- Logging data layer (`src/lib/queries/logging.ts`): `getWorkoutDetail` (one shape for the whole day), `logSet` with denormalized cycle stamps + auto `in_progress` flip, `amendSet` (corrections are updates — logged history stays append-only), prescribed-set add/skip, exercise skip/remove (remove blocked once sets exist, since the FK would cascade logged history), pinned-note save (one pinned per exercise)
- Exercise menu (fig 1.2): prescription rationale line, new/replace pinned note, add set, skip last set, skip remaining, remove (destructive accent row)
- Per-exercise feedback prompt (fig 1.4): auto-opens after the last planned set; joint pain (NONE/LOW/MODERATE/HIGH) per exercise; pump + workload 0–10 snap-sliders scoped to the muscle group when the exercise is the group's last to finish ("just right" centered), with explainer copy; writes the redesigned `exercise_feedback` rows
- Workout complete sheet (fig 1.5): per-exercise summary rows (set count + top set), workout notes, completion marks logged exercises completed / untouched ones skipped, closes the microcycle when the whole week is done (next-week activation is the Phase 4 job); autoregulation summary placeholder until Phase 4
- Workout tab resting state (08 §2): with no active meso, shows the latest completed meso's summary (`v_meso_summary`) above the setup prompt

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` green. Hosted-DB integration smoke for the full loop: standalone meso → plan → start → pinned note → 2 logged sets (workout flips `in_progress`) → group-scoped feedback (pump 7 / workload 5) → complete (status, notes, exercise statuses, microcycle closed) — then cleaned up.

### Not done yet / next

1. Phase 4 — week N→N+1 generation job (prescribe() wired to the new feedback signals, `engine_decisions` writes, autoregulation summary copy), engine input re-alignment to pump/workload 0–10 with new golden fixtures, per-equipment lb increments
2. Playwright e2e for the logging loop (no browser runtime in this environment)
3. Exercise menu leftovers: history sheet (3.2, Phase 5), replace exercise, move

## 2026-06-12 — Phase 1 delta complete; Phase 2 cycles & groups-first planning

### Done

**Phase 1 delta** (complete)

- Queries for the pivot tables in `src/lib/queries/`: exclusions (list/add/remove), pinned exercise notes, picker query (`listPickerExercises` — muscle-group pre-filter, search, last-performed + best-set from `v_exercise_prs`, exclusions removed), wider profile patch, `getActiveEngineParams`
- Onboarding rebuilt as the 08 §4 four-step sequence (about you → experience → equipment access → units, lb default) with a step rail; submits once at the end, lands on Cycles
- Profile screen `/more/profile` (fig 4.5): data rows (name/age/height/bodyweight + updated-at/training-since), experience segmented control (instant save), equipment chips, excluded-exercise management with reason labels and a search sheet
- More tab (fig 4.4): profile card → Profile, working LB/KG toggle, AI connector + CSV export placeholder rows, version line
- Hosted Supabase confirmed live (both migrations + seed applied); `.env.example` unchanged — anon key + URL wired locally via `.env.local` for verification

**Phase 2 — cycles & groups-first planning** (core flow complete)

- Cycles tab (fig 2.1): macro sections with ordered goal-arc slots — filled slots show their meso (orange marker = active), empty slots show dashed `+ PLAN`; legacy/unslotted mesos still listed under their macro; standalone section; empty state per 08 §4
- Macro creation `/cycles/new`: name, date range, goal-arc slot builder (tap to cycle cut/gain/maintain/peak, add/remove up to 12)
- Plan-a-meso entry `/cycles/plan` (fig 2.3): from-scratch live; template/copy/builder as dashed "soon" cards
- Create mesocycle `/cycles/plan/new` (fig 2.7): name, placement (standalone or any open macro slot), weeks 4–8, deload toggle, live RIR-ramp preview on `WeekTrack`
- Planner board `/cycles/meso/[id]/plan` (figs 2.4–2.6): weekday-sorted day tabs, muscle-group blocks with numbered slots (filled rows + dashed `+ EXERCISE`), add-group sheet, day-setup sheet (label, weekday, week-starts-here → `profiles.week_starts_on`, per-group slot steppers, remove day), exercise picker pre-filtered to the slot's muscle group with search, start-sets stepper, last-performed/best-set data
- Meso detail `/cycles/meso/[id]` (fig 2.2): RIR ramp matrix (weeks × days; filled = complete, accent frame = in progress, dashed = unbuilt/planned), `GO TO W#·D#`, edit plan, `MESO STATS` stub
- **Meso start generation** (`src/lib/queries/generation.ts`): on start, builds all microcycles from `rirRamp` (week 1 active) and week-1 workouts/`workout_exercises` from the planner board via `seedMeso` — prescriptions carry muscle-group context, target RIR, and the engine rationale string; bands/kettlebell map to `other` increments until Phase 4
- Engine: `rirRamp` widened from 3–6 to 3–8 weeks (matches the 2.7 week range + pivot schema), with a new 8-week golden test
- Workout tab updated for standalone mesos (`getCurrentState` now anchors on the active meso, macro optional); read-only day view at `/log/[workoutId]` shows generated prescriptions grouped by muscle group with rationale lines (logging itself is Phase 3)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (30/30), `npm run build` all green. End-to-end integration smoke against the **hosted** Supabase project (signup → onboarding writes → macro + slots → meso into slot → 2 planner days → group + slot fill → start meso): 5 microcycles created with the 3→0 ramp + deload, week-1 workouts generated with correct sets/target RIR/muscle group/rationale, `getCurrentState` surfaces the next workout; test data cleaned up after. Route auth gating spot-checked on a local dev server.

### Not done yet / next

1. Phase 3 — workout logging (day view 1.1 one-thumb logging, exercise/set menus, per-exercise feedback prompt, workout-complete sheet, Playwright e2e). The `/log/[workoutId]` read-only view is the starting skeleton
2. Phase 4 — engine feedback re-alignment (pump/workload 0–10 inputs, new golden fixtures), week N→N+1 generation job, per-equipment lb increments incl. bands/kettlebell
3. Phase 2 leftovers tracked in 07: template-prefilled planner (Phase 5), copy-a-meso, meso builder
4. A throwaway auth user (`smoke-test-claude@example.com`) remains on the hosted project from the integration smoke; safe to delete from the Supabase dashboard

## 2026-06-12 — Phase R: light-ledger retheme, canon tab bar

### Done

**Phase R — design-system retheme** (code-complete)

- Token set replaced in `src/styles/globals.css` per 08 §1: cream `#F4F0E6` base, paper `#FCFAF4` surfaces, ink `#17140F`, accent `#C14B2A`; opacity steps of ink (`ink/55`, `ink/45`, `ink/15`…) carry the secondary/faint/hairline roles; square corners everywhere (all radius tokens removed); the old dark palette, pressed-orange, and green/yellow status colors are gone. `--shadow-menu` (5px 5px 0 hard offset) is the single permitted shadow
- Typography: Archivo variable (latin, 100–900) committed at `src/app/fonts/` and self-hosted via `next/font/local`; helpers `.title-display` (800 lowercase tight), `.logotype` (0.22em lowercase), `.label-caps` retracked to 0.12em, `.numeral` unchanged
- Primitives reworked to the ledger: `Button` (filled-ink primary / 1.5px ink-frame secondary), `Card` → ruled section (caps header over 1.5px rule, no box), `Input` (paper bg, ink focus), `FeedbackScale` (accent-fill selection per fig 1.4), `NumberStepper`, `RirBadge` (accent frame at peak, dashed deload)
- New primitives from the mockups: `SegmentedControl` (filled-ink active), `Chip` (filled-ink selected + dashed planned variant), `SnapSlider` (snap-to-stop 0–10, tick stops, rectangular accent thumb, keyboard support), `BottomSheet` (ink scrim, 2px-rule sheet), `MenuCard`/`MenuItem` (offset hard shadow, accent destructive row), `WeekTrack` (filled/current+dot/faint/dashed-deload states)
- **Canon tab bar** `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`: routes renamed `today`→`workout`, `settings`→`more`, `insights` removed, `templates` placeholder added; sign-in lands on `/workout`, onboarding completion lands on `/cycles` (08 §4); active tab is bold ink with ■ marker
- All existing screens (landing, auth, onboarding, cycles, exercises, workout, more) re-dressed in the system: ruled headers with lowercase display titles, hairline row dividers, filled-ink radio/checkbox chips, no rounded corners anywhere
- PWA: manifest + theme color → `#F4F0E6`, `start_url` → `/workout`, status bar `default`; icons regenerated for the light system (`scripts/generate-icons.mjs` recolored). Service worker already shell-precache-only — no offline-logging assumptions to remove

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green. Token/spacing values transcribed from the v2 mockup HTML (figs 1.1–4.5); pixel QA in a real browser still worth a pass when deploys exist.

### Not done yet / next

1. Phase 1 delta — onboarding rebuilt as the 08 §4 four-step sequence, Profile screen (fig 4.5), real More tab rows, queries for the pivot tables; provision hosted Supabase + Vercel
2. Phase 2 — cycles & groups-first planning (the new primitives — Chip, BottomSheet, WeekTrack, SegmentedControl — are ready for the planner screens)
3. Engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring (Phase 4)

## 2026-06-12 — Design pivot ingested; plan rewritten; schema delta

### Done

**Design handoff ingested** (Claude Design mockup round)

- [08-design-decisions.md](08-design-decisions.md) added as the authoritative design source; mockup HTML + screenshots in `docs/design/`
- Specs updated for the pivot: light ledger system supersedes the dark system in 06 (banner added); canon tab bar `WORKOUT · CYCLES · TEMPLATES · EXERCISES · MORE`; **offline sync cut** (01/02/07 — app is online-only); **admin UI cut** — engine inspection/tuning/replay ship as admin-gated MCP tools (01/02/04/05/07); CLAUDE.md hard rules updated
- [07-implementation-plan.md](07-implementation-plan.md) rewritten: new Phase R (design-system retheme), groups-first planning in Phase 2, redesigned feedback + workout-complete flow in Phase 3, engine re-alignment in Phase 4, meso stats/library/templates in Phase 5, MCP incl. admin tooling in Phase 6, hardening in Phase 7

**Schema delta** — migration `20260612000001_design_pivot.sql` (RLS + tests in the same PR; `database.ts` updated)

- `profiles`: height/bodyweight (+`bodyweight_updated_at`), `training_since`, `week_starts_on`
- New tables: `excluded_exercises`, `exercise_notes` (pinned), `macro_slots` (goal arc), `meso_days` + `meso_day_groups` (groups-first planner), `template_day_groups`, `mcp_write_audit`
- `mesocycles`: nullable `macrocycle_id` (standalone mesos), `macro_slot_id`, weeks 3–8
- `workout_exercises`: `muscle_group_id` (day-view grouping + feedback scope), `status` (skip states)
- `logged_sets`: `set_type` (straight/drop), `unit` (lb/kg); nullable `macrocycle_id`
- `exercise_feedback` redesigned: joint pain 0–3 per exercise; pump/workload 0–10 sliders per muscle group (strain/fatigue dropped)
- Equipment vocabulary + bands/kettlebell; `exercises.description`
- New views `v_meso_week_sets` (stats volume/balance) and `v_exercise_prs` (performance/PRs)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29) green; both migrations applied in order against a clean Postgres (`check_function_bodies=off`, as on Supabase)

### Not done yet / next

1. Phase R — retheme tokens/primitives to the light ledger system (blocks all screen work)
2. Phase 1 delta — onboarding sequence, Profile/More screens, queries for the new tables; provision hosted Supabase + Vercel
3. Phase 2 onward per the rewritten plan; engine feedback re-alignment (pump/workload 0–10) needs new golden fixtures before wiring

## 2026-06-11 — Foundation, data model, engine core

### Done

**Phase 0 — Foundation & scaffolding** (code-complete; deploys pending)

- Next.js 15 (App Router) + TypeScript + Tailwind v4, structured per [02-architecture.md](02-architecture.md)
- PWA baseline: `manifest.webmanifest`, generated icons (`scripts/generate-icons.mjs`), Serwist service worker (`src/app/sw.ts`, disabled in dev)
- Design tokens from [06-design-system.md](06-design-system.md) as Tailwind theme variables in `src/styles/globals.css`
- UI primitives: `Button`, `Card`, `Input`, `BottomNav`, `RirBadge`, `NumberStepper`, `FeedbackScale`
- ESLint (flat config) + Prettier + Vitest; CI workflow (`.github/workflows/ci.yml`): typecheck, lint, unit tests, build, plus an RLS job against a local Supabase stack

**Phase 1 — Auth, profiles & data model** (code-complete; hosted project pending)

- Full schema migration `supabase/migrations/20260611000001_initial_schema.sql`: all 19 tables from [03-data-model.md](03-data-model.md), RLS enabled everywhere with default deny, denormalized cycle stamps on `logged_sets`, hot-path indexes, `security_invoker` views `v_exercise_history`, `v_muscle_group_volume`, `v_meso_summary`, signup trigger creating `profiles`
- Notable policy decisions: no client `delete` policy on `logged_sets` (append-only history); `profiles` update policy prevents self role-escalation; `engine_decisions` written only via service role; single-active-row constraint on `engine_params`
- Seed (`supabase/seed.sql`): 12 muscle groups, ~80 stock exercises with muscle-group mappings, 4 stock templates (Upper/Lower 4-day, PPL 6-day, Full Body 3-day, Glute Emphasis 4-day), `engine_params` v1 mirroring `src/lib/engine/params.ts`
- RLS test suite (`tests/rls/`, `npm run test:rls`): cross-user reads/writes blocked, stock visibility, append-only sets, role escalation, engine table gating
- Supabase clients (`src/lib/supabase/`): browser, SSR server, middleware session refresh, and `service.ts` (the only module allowed to touch the service-role key)
- Email/password auth (server actions, zod-validated), onboarding flow writing profile + `onboarded_at`
- Hand-authored `Database` types (`src/lib/types/database.ts` — regenerate with `npm run db:types` once a stack is running) and `src/lib/queries/` for profiles, exercises, cycles

**Phase 4 — engine core** (pulled forward; it is pure code with no infra dependency)

- `src/lib/engine/`: `prescribe()`, `seedMeso()`, `rirRamp()`, `scoreProgress()`; rule modules for performance delta, feedback modulation, deload, RIR ramp, rounding/increments
- All tunables flow from `engine_params` (zod schema gate — a malformed row cannot be parsed, so it can never be activated)
- 29 tests: table-driven rule-branch units, a golden 5-week + deload meso simulation (100 → 102.5 → 105 → 107.5 → 60 kg deload), and seeded-PRNG property tests on hard bounds (pain gate blocks increases, deload < peak, set floor/ceiling)

### Verified

`npm run typecheck`, `npm run lint`, `npm run test` (29/29), `npm run build` all green locally. RLS tests are written and wired into CI but need a running Supabase stack to execute.

### Not done yet / next

1. **Provision hosted Supabase project + Vercel project** (needs account decisions): apply migration + seed, set env vars, enable an OAuth provider, then regenerate `database.ts` from the live schema
2. **Phase 2 — cycle management**: meso builder UI, microcycle generation (`rirRamp` is ready), week-1 workout generation, exercise library v2 (create custom), cycle timeline screen
3. **Phase 3 — logging flow**: logging UI (primitives exist), feedback sheets, offline outbox + sync, Playwright e2e
4. **Phase 4 remainder**: week N→N+1 generation job wiring `prescribe()` to data + `engine_decisions` audit writes
5. Phases 5–8 per the plan

## 2026-06-19 — rep-window prescription engine (doc 13 + §9)

Built the doc 13 model with the §9 amendments (per-goal windows, Option-A
schedule, session-best anchor). **Param-gated** (doc 13 decision 8): activating
`engine_params` v9 turns it on; the legacy increment/rep-count path stays in code
and is byte-for-byte preserved (the existing golden + `prescribe.test.ts` assert
it under `weight_selection=increment`).

- **Engine.** `weightForRepsAtRir()` (closed-form converse of
  `predictRepsAtWeight`); `recencyWeightedE1rm` now selects `session_best` /
  `best` / `mean` via `e1rm.anchor_method` (session_best = recency-weighted best
  set → mean of that set's session, `E1rmSample.sessionKey`). `prescribe()` gained
  a mode-gated rep-window path: pick the load that lands reps in the goal's window
  at the target RIR from the anchor (Option-A: reps climb the window, load held
  within the meso, stepping on window-cap or anchor change); RIR grading
  (`gradeOnRir`, overshoot holds, never regresses); swap-in / cold-start seeding
  from the anchor. The anchor subsumes the old +increment / −regression rules in
  this mode.
- **Per-goal windows.** `engineGoal()` no longer collapses strength/hypertrophy →
  `gain`; `goalTypes` widened (`gain` kept as a hypertrophy alias). `rep_window`
  defaults: hypertrophy/cut/maintain 8–12 (6–15), strength 3–5 (2–6).
- **Plumbing.** `getExerciseE1rmAnchors` now carries confidence + session grouping
  (shared by the live predictor); `buildEngineInputs`/`generateDay` thread the
  anchor into `prescribe()`. Workout-Complete summary surfaces rep deltas.
- **Params.** v9 migration seeds a materialized snapshot (schema_version 4);
  versions ≤ 8 flagged non-replayable. A provenance test locks the v9 hash to
  `DEFAULT_ENGINE_PARAMS`.
- **Tests.** New `rep-window.test.ts` (Option-A schedule, overperformance
  repricing, per-goal windows, bounds, RIR grading, seeding, fallback gate),
  `weightForRepsAtRir` + anchor-method coverage, bounds property test exercises
  the rep-window path. 381 pass, typecheck + lint clean.

**Activation is a manual step** (doc 13 §6, not done here): propose/activate v9 via
the admin MCP and `replay_decisions` / `simulate_prescriptions` a sample against
v9 to confirm reps/weights look sane on real data before flipping it live.

**Deferred to a fast-follow** (doc 13 §4.4 / §8): the "Reset to prescription"
exercise-menu item (UI), and per-slot rep ranges (plumb
`template_exercises.default_rep_range` → `meso_exercises`).

## 2026-06-19 — Reset to prescription (shipped) + regenerate planned prescriptions

Closed the doc 13 §4.4 fast-follow and added the missing piece it implied.

- **"Reset to prescription" exercise-menu item** (`dc019bd`, already on `main`):
  clears an exercise's `set_weights` overrides so unlogged sets fall back to the
  stored `prescribed_weight` (→ predicted reps); logged history untouched. It is
  **gated to appear only when overrides exist** (nothing to reset otherwise), so
  on a freshly-generated day it is intentionally hidden until you edit a weight —
  this is by design, not a bug (kept as-is per owner call). Per-slot rep ranges
  remain deferred.
- **`regenerate_planned_prescriptions` admin MCP tool** (`src/lib/mcp/tools/admin.ts`
  + `src/lib/queries/regeneration.ts`). `prescribe()` only fires at week N→N+1
  generation, so activating a new `engine_params` version leaves *already
  generated, not-yet-performed* workouts stale — nothing re-fires the engine for
  them. This tool re-runs the engine on those planned prescriptions (the
  write-back counterpart of `replay_decisions`): for each `planned` workout
  exercise with **no logged set** whose latest decision predates the active
  version, replay its stored inputs against the active params and write the
  refreshed weight/reps/sets/RIR back, plus a fresh `engine_decisions` row
  (`provenance.regenerated`) so the audit chain stays intact.
  - **Safety:** two-step and dry-run by default. The first call (omit `confirm`)
    writes nothing and returns the diffs plus a `plan_token` (a stable hash of the
    active version + every changed exercise's target prescription). A write needs
    BOTH `confirm="apply"` and `confirm_token` echoing that token; a missing or
    **stale** token (the plan changed since the preview) returns the current dry
    run instead of writing — so an over-eager MCP client cannot apply in one blind
    call (the original `confirm="apply"`-only gate let ChatGPT do exactly that).
    Never touches in-progress/completed workouts, logged sets, or manual
    `set_weights` overrides (which compose on top — clear them with "Reset to
    prescription"). Pairs with `activate_engine_params`.
  - **Scope:** all users (admin-gated; service-role client with per-row,
    server-derived user scoping — hard rule #4; **no `user_id` argument** —
    hard rule #5, covered by the existing admin-tool test). Optional `mesocycle_id`
    filter; `limit` cap.
  - **Anchor rebuild (fix).** Originally the tool replayed each prescription's
    stored inputs *verbatim*. That silently defeated a v8→v9 backfill: decisions
    recorded before doc 13 carry **no `strengthAnchor`**, and v9's rep-window
    weight selection is gated on a non-null anchor — so replaying them always fell
    through to the legacy increment branch and reported "unchanged" (the same blind
    spot as `replay_decisions`). `getRegenerablePlannedDecisions` now recomputes the
    anchor per `(user, exercise)` from logged history via the same
    `getExerciseE1rmAnchors` the live week-advance uses and injects it into each
    candidate's inputs (`withRecomputedAnchors`, pure). A null anchor (no usable
    history) is left in place so the engine keeps its plan-based cold-start
    fallback. The anchor reflects current strength (recency-weighted), exactly as a
    fresh generation would compute it; the dry-run diff shows the result before
    applying.
  - **Tests.** Pure `planRegeneration` (changed / unchanged / invalid-source /
    mixed-batch classification) + `withRecomputedAnchors` (injects anchor, null
    when none, flips a backfill from unchanged→changed once the anchor engages the
    rep window); tool added to the admin registration / no-`user_id` /
    unauthenticated coverage. Typecheck + lint clean; full suite green. No schema
    change (reuses existing columns; append-only respected).
- **Generation-gap self-heal (`catchUpMesoGeneration` + `catch_up_generation`).**
  Prescriptions are generated *per completed workout* (`advanceWeekAfterWorkout`).
  Any day whose completion never ran the job — seeded/imported history, a failed
  or raced completion — leaves a permanent hole the per-completion path can't
  reach (a locked day can't be re-completed), and the existing `catchUpProgression`
  only fires when the whole active week is closed (`!nextWorkout`), so a mid-week
  hole (e.g. W4·D1 when W3·D1 was seeded complete while W3·D4 is still planned)
  never heals. New pure `planCatchUp(weeks, workouts)` finds every closed
  (completed/skipped) day whose next-week same-day counterpart is missing;
  `catchUpMesoGeneration` runs the normal `advanceWeekAfterWorkout` on each
  (idempotent, additive — only CREATES missing days, never touches started/logged
  work or existing prescriptions; a freshly created day is generated under the
  active params, so it lands on v9).
  - **Auto-heal:** the Workout tab calls it on load for the active meso (cheap
    when there are no gaps), so a missing day appears without any manual step.
  - **Manual trigger:** `catch_up_generation` admin MCP tool (caller-scoped;
    optional `mesocycle_id`, default the active meso). Dry-run by default (lists
    the days it would create); `confirm="apply"` generates them.
  - **Tests.** `planCatchUp` (single mid-week gap, ignores planned/last-week,
    skipped counts as closed, none when counterparts exist, week→day ordering);
    tool added to the admin registry / no-`user_id` coverage. Full suite green,
    typecheck + lint clean. No schema change.
- **Unified on-load reconcile (`reconcileMesoPlan`).** The "keep the plan correct"
  job is one thing, not three tools to invoke: activating a new `engine_params`
  version should just propagate to every user. `reconcileMesoPlan(service, userId,
  mesoId)` does both halves in one call — (1) `catchUpMesoGeneration` to create any
  missing day, then (2) the anchor-rebuilt regeneration to refresh any
  not-yet-started prescription whose decision predates the active version
  (`getRegenerablePlannedDecisions` gained a `userId` scope for the per-user load
  path). The **Workout tab runs it on load** for the active meso, so activation is
  the only manual step — correctness then appears transparently on each user's next
  open (idempotent; cheap when nothing is stale; never touches started/completed
  work, logged sets, or manual `set_weights`). The `regenerate_planned_prescriptions`
  / `catch_up_generation` MCP tools remain as optional ops/preview triggers but are
  no longer required for correctness. Full suite green, typecheck + lint clean.
- **`params_version` staleness gate on the reconcile.** The on-load reconcile's
  refresh half (above) was paying its full cost on *every* Workout-tab open — to
  decide whether anything was stale it joined `workout_exercises → engine_decisions`
  and recomputed strength anchors from logged history, even though a new
  `engine_params` version is rare. Now each prescription stamps the
  `params_version` it was last computed/reconciled under
  (`workout_exercises.params_version`, migration
  `20260620000003`; stamped by `generateDay`, the seed builders in `startMeso` /
  `regenerateOpenWorkouts`, user-added slots in `addWorkoutExercises`, and
  `applyRegeneration`). `reconcileMesoPlan` settles staleness with **one indexed
  read** — "is any planned, not-yet-started row in this meso behind the active
  version (or unstamped)?" — and short-circuits when none is, so the steady-state
  open is instant. Only when a row is genuinely behind does the heavy
  anchor-rebuilt replay run; afterwards every open row is stamped current (covering
  unchanged/invalid/seed rows the replay leaves as-is by design) so the gate stays
  closed until the next activation. Migration backfills existing rows from each
  prescription's latest decision (stale generated rows stay detectable; decision-less
  seeds are marked current). Behavior is unchanged — same rows refreshed, same
  numbers; only the steady-state cost drops from a multi-query + anchor recompute to
  a single read. Full suite green (416), typecheck + lint clean.

- **Freshness gap: a decision-less planned day in the middle of imported history
  was re-seeded instead of advanced (the "W3·D4" bug).** Importing a meso's
  completed history while leaving one mid-stream day `planned` (the next workout to
  do) produced a `workout_exercises` row with no `engine_decisions` row. The
  generation gap-heal (`planCatchUp`) skips it — the day already exists, so nothing
  is "missing" — and the per-completion advance never reached it either (its
  prior-week sibling pre-existed). The read-path reconcile then backfilled it as a
  **seed** (doc 14 §6.3, `kind = decision?.kind ?? "seed"`), repricing it off the
  prior-*meso* peak and discarding the in-meso week N-1 → N progression: a week-3
  leg day showed week-1 seed loads instead of numbers progressed from the completed
  week-2 same day. Fix (doc 14 §7c): `reconcilePrescriptions` now detects a
  decision-less open row in week N>1 whose week-(N-1) same-day, same-exercise
  counterpart is completed and backfills it as an **advance** — rebuilding the
  engine's derived history from that counterpart's logged sets + feedback via the
  same `buildEngineInputs` / `weeklySetsByGroup` / `peakByExercise` the generation
  path uses, then running the advance recompute (refreshes the anchor, overlays live
  config). Only a row with no completed prior-week counterpart stays a cold-start
  seed. The routing boundary is the pure, unit-tested `advanceSourceKey` (week 1 →
  seed; week N → its prior-week source key). The extra source-history reads run only
  when such a row exists (rare). One verified instance (a hosted W3·D4 leg day) was
  also corrected in place: its five planned, unlogged prescriptions were rewritten
  to the engine's W2·D4 → W3·D4 advance with matching `advance` decisions + fresh
  `dep_fingerprint`s (validated against the same anchors the already-generated W4
  days recorded). Full suite green (481), typecheck + lint clean.

## 2026-06-30 — Field-notes bug sweep (PH29 / PH38 / PH36 / PH34, PR #84)

Four backlog bugs (`docs/notes/`). No schema/migration changes; no rule-#8 deviations
(all touch existing screens/behaviors).

- **PH38 (swap-exercise prescription).** `replaceWorkoutExercise`
  (`queries/logging.ts`) left the outgoing exercise's per-set `set_weights`
  overrides on the slot, so the first set showed the old planned weight (reps
  predicted off it) until "reset to prescription". Now clears `set_weights` on swap.
  Test: `__tests__/replace-exercise.test.ts`.
- **PH29 (page-switch "double layer label").** The bottom nav drew two `■` position
  markers during a route transition (`usePathname` lags the commit → previous tab
  still `active` while the tapped tab is `pending`). `BottomNav.tsx` now lifts a
  single `anyPending` signal so the source tab yields its marker to the tapped tab;
  exactly one `■` shows. (Instant-switch latency is server-compute-bound → WS-J perf.)
- **PH36 (bodyweight-only model/increment).** Engine half already correct under
  engine_params v16 (reps-only at fixed bodyweight; increment inert). Closed the UI
  gap: the Exercise page now hides the "Load step" increment control for
  `bodyweight_only` lifts (loadable/assisted keep it — there the step rounds the
  added/assist weight).
- **PH34 (meso-stats "planned sets").** Future weeks materialize lazily, so
  `v_meso_week_sets` had no rows for them; the stats UI fell back to the static
  planner baseline while the MCP tool reported `null` (two surfaces disagreeing).
  Owner ruled "autoregulated projection." New pure `projectWeekSets`
  (`queries/volume-projection.ts`) carries the last materialized week's set count
  forward, deload-scaled (mirrors the engine's set carry-forward under neutral
  feedback — there is no forward MEV→MAV→MRV ramp, T-A5 unbuilt), seeded by the
  planner baseline only when a group never materialized. Wired into both shared
  surfaces (`buildVolumeMatrix` + `get_muscle_group_volume`, new `projected` status)
  so they read one definition. Pure TS, no migration. Tests:
  `volume-projection.test.ts` + updated `stats.test.ts`/`read-tools.test.ts`.

Full suite green (560, +8), typecheck + lint clean.

## 2026-06-30 — Performance WS-J: server load-time slice

Server-side read-path wins from the measured audit (Supabase advisors + code).

- **Reconcile gate (#1).** `mesocycles.last_reconcile_sig` (migration
  `20260630000001_meso_reconcile_signature.sql`, **applied to the live project**
  `juqvbiymmdcggctdqoiq` via MCP — additive nullable column, no backfill). Every
  prescription surface ran the full ~8-10-round-trip reconcile on open even when
  fresh; now `reconcilePrescriptions` first computes a cheap meso-level staleness
  signature (`loadMesoStaleInputs`, ~2 round-trips) over every meso-global dependency-
  fingerprint input and skips the full pass (gap-heal + freshness) when it matches the
  stored stamp, which it writes on each successful reconcile. Conservatism (the gate
  never skips a genuinely-stale row) is pinned by `reconcile-gate.test.ts`. **Deploy
  note:** the column is live; the first open of each existing meso runs one full
  reconcile (null stamp) then the gate engages — self-healing, no manual step.
- **Double engine_params read (#8).** Threaded an optional pre-resolved
  `{version,params}` through `ensureFreshPrescriptions`/`reconcilePrescriptions`; the
  Workout + Log pages resolve once and pass it in.
- **Anchor round-trips (#4).** `getExerciseE1rmAnchors`: 3 serial reads → one
  `Promise.all`; output byte-identical.
- **Anchor recency floor (#3) — rejected.** A live check showed a 120-day `performed_at`
  floor would drop the anchor for ~56% of (user,exercise) pairs (recency weighting is
  relative; a stale exercise still yields a usable anchor), forcing cold-start where
  real data exists. Not shipped; rationale left in a code comment.

Full suite green (563, +3), typecheck + lint + production build clean.

## 2026-06-30 — Performance WS-J: advisor cleanup (security + cheap migrations)

`20260630000002_advisor_cleanup.sql` — **applied + verified on the live project**
`juqvbiymmdcggctdqoiq` via MCP.

- **Security (linter ERROR, now cleared):** `v_exercise_overview` was `SECURITY
  DEFINER`, bypassing the querying user's RLS. The view aggregates `logged_sets`
  GROUP BY user_id and every app read filters `.eq(user_id, …)`, so flipping it to
  `security_invoker` returns the same per-user data — now RLS-enforced. Verified by
  simulating an authenticated role: the view returned only that user's own rows
  (111), zero foreign.
- **Performance:** added the missing FK index
  `exercise_param_overrides(exercise_id)`; wrapped the owner RLS policy's
  `auth.uid()` in a scalar subselect (init-plan, evaluated once per query).
- **Deliberately left:** the `current_profile_role`/`is_admin` SECURITY DEFINER
  *function* advisories (intentional anti-recursion RLS helpers — they expose only
  the caller's own role/admin status) and the leaked-password protection toggle (a
  dashboard-only setting, tracked in `manual-operations.md`).

No application code changed (view columns unchanged → no type regeneration).
