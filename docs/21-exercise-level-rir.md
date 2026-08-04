# 21 — Exercise-level RIR (authoritative build spec)

**Status: authoritative build spec** (2026-07-31). Consolidates the owner's
Batch-28b proposal and the assessment thread:
[assessment](./reviews/2026-07-31-exercise-level-rir.md) → owner notes +
decisions A1–A8 (Batch 30c) → **owner pushback on §4.2 + the RIR ceiling
(Batch 30d, revised the same day)**. Those are the rationale record; **where they
conflict with this doc, this doc wins.** Doc 16 keeps authority over progression
internals, doc 14 over freshness, doc 10 over metric definitions — this doc
amends each where noted (§2, §5, §6, §7). Implementation proceeds in new
sessions, one phase per PR (§10).

Backlog: **N70** (the feature), **N71** (the RIR-premise defect, absorbed as
Phase 1), **N38** (honest-RIR capture — absorbed as Phase 1), **N72** (bounded
substitution — explicitly out of scope, tracked separately).

---

## 1. What this is

Assign a **target RIR per exercise, per week**, inside a program. The coach (via
MCP) or the athlete (via a small in-app control) can say "this exercise runs at
RIR 4 for weeks 3 and 4"; the engine reprices the load to meet that effort; the
RIR ramp reasserts itself the moment the assignment is removed.

It replaces the parked coach-prescription-override paradigm
([review](./reviews/2026-07-31-coach-override-prescriptions.md), closed) as the
mechanism for temporary per-exercise effort management: fatigue management,
rehabilitation, and ordinary programming intent ("run this one lighter all
block") all become the same one lever.

**Settled decisions (owner, 2026-07-31):**

| # | Decision |
|---|---|
| A1 | **Write `rir_reported` per set**; stats surfaces read RIR and report effective reps. Update the RIR copy to demand honest effort reporting regardless of the prescription. |
| A2 | **Absolute semantics only.** A per-exercise RIR takes control where set; where unset, the configured ramp reasserts. No floor/offset parameters. |
| A3 | Grain = **day-slot × exercise**, per week (`meso_exercises` + a per-week array). |
| A4 | **A per-exercise set lever ships too** — but the UI stays simple; MCP is the primary surface. |
| A5 | **Exclude non-working (high-RIR / low-confidence) sets from stats** — split in §6 into a hard measuring band (§6.1) and a soft working-set policy (§6.2); one confirmation open. |
| A6 | **Add the earn-gate predicate** (no progression earned while an assignment is active). |
| A7 | **Store a `reason`** with the assignment and surface it. |
| A8 | **Close the override review.** Its one unresolved thread (bounded substitution + the `LOOKBACK_WEEKS = 2` cliff) is preserved as **N72**. |
| **28d** | **Repricing needs no special case** — thread the resolved RIR through the existing pricing path, symmetric in both directions (§4.2, supersedes the rejected centered-reps rule). **Prescription RIR is unbounded** so one lever spans deload → rehab → extra effort (§4.3); the **measuring band** (§6.1) is what keeps that honest. |

---

## 2. The RIR premise, amended (amends doc 11; absorbs N38)

**Today's premise:** the app prescribes a target RIR and trusts the athlete to
hit it, so no per-set RIR is captured; a logged `weight × reps` against a
*prescribed* target RIR is itself an RIR data point.

**Two paths implement it inconsistently, and that is a live defect (N71):**

| Path | Assumed RIR | Consumers |
|---|---|---|
| Strength anchor (`queries/anchors.ts` → `recencyWeightedE1rm`) | the set's prescribed `workout_exercises.target_rir` | prescription pricing, day-view predictor, earn gate |
| Stored per-set stamp (`app/(app)/log/actions.ts:86`, `computeSetE1rm`) | `logged_sets.rir_reported` — **never written** (`DayView.tsx:1698` sends `null`) ⇒ `effectiveReps = reps + 0` ⇒ **every set stamped as taken to failure** | `v_exercise_history.e1rm` + `.best_set_e1rm`, `v_exercise_overview.best_e1rm`, `v_meso_summary.best_e1rm`, `v_exercise_prs`, strength trend, MCP history |

**Amended premise (A1).** The athlete reports RIR per set; the prescription is a
*suggestion*, and the reported value is the athlete's honest estimate of actual
reps in reserve **even when it differs from what was prescribed**. The
prescribed target RIR becomes the **fallback**, not the assumption.

**One resolution rule, used everywhere:**

```
assumedRir(set) = set.rir_reported ?? set.workout_exercise.target_rir
```

- Applies identically at the stamp site (`computeSetE1rm`), in the anchor
  (`queries/anchors.ts`), in the marker/compliance comparison, and in the
  restamp backfill. The two paths converge; N71 closes by construction.
- **Never default a captured value to 0.** This is the N11 regression, already
  pinned by a test (`day-rules.test.ts:114`): `rir_reported` defaulting to 0
  while the prescription baked in the week's target RIR made an
  exactly-as-prescribed set read as a big miss, worst on deloads. The capture
  control's **initial value is the prescribed target RIR**; leaving it untouched
  stores that value (or `null`, resolving to the same thing — pick one and pin
  it in a test).
- `logged_sets.rir_reported` is already `check between 0 and 10` and
  `v_exercise_history.avg_rir_reported` already exists — both have been dormant.

**Backfill + blast radius.** `queries/e1rm-restamp.ts` exists precisely to
recompute stored stamps when the e1RM model changes; run it under the new rule
(historical rows resolve to their slot's `target_rir`). **Every historical e1RM
moves up** — a set prescribed at RIR 2 gains 2 effective reps — so PRs,
`best_e1rm`, key lifts and the strength trend re-level once, visibly. This is a
one-time correction that makes stats agree with the engine, and it ships in its
own PR with a doc 10 §9 note.

---

## 3. Data model

Append-only migrations, RLS + policy tests in the same migration (hard rules 1–2).

```sql
alter table public.meso_exercises
  add column target_rir int check (target_rir between 0 and 8),      -- null = ramp
  add column rir_schedule int[],                                      -- per working week; null = use target_rir
  add column set_cap int check (set_cap between 1 and 20),            -- A4; null = engine's own
  add column set_cap_schedule int[],
  add column rep_position text,                                       -- §4.2; Phase 4, flat (no schedule)
  add column effort_reason text;                                      -- A7
```

Modelled directly on `mesocycles.rir_schedule` (N18-B), **including its
orphan-clearing rule**: a shape edit that changes `weeks`/`includes_deload`
without re-supplying the schedule clears it back to null
(`updateMesocycleAttrs` is the precedent).

Notes:
- `meso_exercises` is day-slot grain, so the same exercise on two days can carry
  different values (A3).
- The resolved value lands in `workout_exercises.target_rir`, which already
  exists per slot and is already read by the anchor and by
  `previous.targetRir` (`queries/progression.ts:160,273`) — no new read wiring.
- **Prescription RIR is unbounded upward** (revised 2026-07-31 after the owner's
  §4.2 pushback — supersedes the earlier "ceiling stays 8"). The DB checks on
  `microcycles.target_rir` / `workout_exercises.target_rir` widen 0–8 → **0–30**,
  so one lever spans deload → rehab → deep backoff without a second mechanism.
  What is bounded is not the *ask* but the *measurement*: see §6.1's measuring
  band. `rir_reported` stays **0–10** — that is the range a human can actually
  estimate, and past it the honest report is "no idea", i.e. null.

---

## 4. Resolution and the repricing policy

### 4.1 Resolution (A2 — absolute)

```
weekRir      = microcycles.target_rir            (ramp / rir_schedule / deload)
slotRir      = meso_exercises rir_schedule[week] ?? meso_exercises.target_rir
resolvedRir  = slotRir ?? weekRir                 -- absolute: set wins, unset yields
```

Pure, unit-tested, in the query layer (engine stays pure). It must run **after**
`liveWeekRirUpdates` in the reconcile (`queries/regeneration.ts:550`), which
re-derives unstarted weeks' RIR from the ramp — otherwise the reconcile stomps
the assignment on the next read.

`prescribe()` currently always returns `targetRir: inputs.week.targetRir`; it
must return the resolved value, threaded in as an input. That is the only
engine-signature-adjacent change.

**Deload weeks.** Absolute means an assignment set on a deload week wins over
`params.deload.target_rir` — including downward, which would make the deload
harder. That is a legitimate use (a coach ramping back *into* a block), so it is
allowed, but: the MCP tool and the UI must show the week's default beside the
field, and setting a value **below** the deload RIR emits a warning in the tool
result. No silent semantics.

### 4.2 Repricing — no special case (revised 2026-07-31)

> **Correction.** An earlier draft of this section forced **window-centered reps
> whenever the resolved RIR differed from the week's**. The owner rejected it on
> two grounds, both correct, and both are conceded here: (1) it fires on a
> *decrease* in RIR too, so an exercise deliberately pushed harder would have its
> rep schedule reset for no reason — a special case masquerading as a rule; and
> (2) the "flooring reps prices it heavier" warning was answering a question
> nobody asked. That comparison was *between rep choices at the same RIR*, not a
> claim that raising RIR raises load. The owner's actual proposal — reprice the
> weight so the prescription stays inside the rep window at the requested RIR —
> **is already exactly what the engine does.**

**The rule is: thread the resolved RIR into the existing pricing path. Nothing
else changes.** The rep-window path already:

1. picks `targetReps` from the Option-A schedule (climb / top-out reset), clamped
   to the goal window;
2. prices the load — `weightForRepsAtRir(anchor, targetReps, RIR)`
   (`engine/index.ts:404`);
3. rounds, applies `boundRepsToWindow`, then **re-derives** reps from the rounded
   weight — `predictRepsAtWeight(anchor, finalWeight, RIR)` — clamped to
   `[win.min, win.max]` (`:492-517`).

Swap `inputs.week.targetRir` for `resolvedRir` at those three sites and the whole
thing generalises, in **both** directions, with no branch. The engine never holds
the load constant and lets reps fall out of the window — it prices the load *from*
reps and RIR, so the failure the owner wanted to avoid ("265 lb for 1 rep")
cannot occur by construction.

**The owner's worked example, run through the real path.** 265 × 9 @ 0 RIR
implies an anchor of e1RM 342.6. Ask for 8 RIR:

| reps (anywhere in the 8–12 window) | repriced load | vs the 265 ask |
|---|---|---|
| 8 | 223.4 | −15.7 % |
| **9** | **218.7** | **−17.5 %** |
| 10 | 214.1 | −19.2 % |
| 11 | 209.8 | −20.8 % |
| 12 | 205.6 | −22.4 % |

The owner's estimate was "something like 215 × 8"; the engine gives 219 at the
held 9 reps. The mechanism and the intuition agree.

**This also corrects a number in the assessment.** Its "−14.6 % at RIR 8" was one
policy point (window-centered reps, measured against an RIR-1 week), not the
lever's range. Priced against a genuine 0-RIR ask, RIR 8 delivers **−16 % to
−22 %** depending on where in the window the reps sit. The lever is meaningfully
stronger than the assessment implied.

**Where in the window? Optional, not forced.** Because the load depends on the
rep position (the table above spans 18 lb), a coach may want to say "reprice at
the top of the window" for a deeper cut. That becomes an **optional** per-slot
`rep_position` (`bottom | center | top | <explicit>`); **unset ⇒ the existing
schedule decides**, which is today's behavior and the default. This is the useful
part of the rejected centering rule, demoted from a mandate to a knob. *(Shipped
in Phase 4, 2026-08-02: flat per slot, no per-week schedule — see §10.)*

### 4.3 How deep can this go, and where it stops being a measurement

The owner's follow-on: if −22 % isn't enough for rehab, raise the RIR further —
"perhaps 20 RIR, which is not something an athlete could realistically estimate,
but it simply represents a large reduction in effort, with the implied RIR
derived by reversing the same math."

**The arithmetic is right and is adopted** (hence the unbounded ceiling in §3).
Against the same 342.6 anchor at 9 reps:

| goal | load | implied RIR |
|---|---|---|
| −25 % of the ask | 198.8 | ~13 |
| 50 % of e1RM | 171.3 | ~21 |
| −50 % of the ask | 132.5 | ~39 |

So yes — one rule really does span deload, rehab, and extra effort. **The
constraint is not the pricing, it is the second job that number now does.** A1
made the prescribed RIR a *measurement input*: `assumedRir = rir_reported ??
target_rir` feeds the e1RM stamp and the anchor. An unbounded prescribed RIR
therefore silently asserts a strength measurement nobody observed:

- Under Epley each RIR step is worth **3.3 % of e1RM**. At RIR 21 the estimate is
  ~70 % assumption and ~30 % observation. At RIR 39 the curve is far outside any
  band it was fitted on (`brzycki_max_eff_reps: 10`; Brzycki itself is undefined
  at 37 effective reps — the code caps bisection at 35.9).
- The confidence ladder bottoms out at `low` (`mod_max_rir: 3`), so a set at RIR
  4 and a set at RIR 21 currently make the *same* honesty claim. That is a lie by
  omission at the top end.
- It contradicts A1's own premise. If the athlete is asked to report honest
  reserve and the ask says 21, the truthful report is "no idea" — which is
  exactly why `rir_reported` stays capped at 10 and resolves to null past it.

**The guard (§6.1): a measuring band.** Past it the set is priced normally but is
**not treated as a measurement** — no e1RM stamp, no anchor contribution. That is
the one addition needed to make an unbounded lever safe, and it is a direct
application of doc 16's principle 1 (*never fabricate a measurement*), not a
restriction on the lever itself. The prescription can go as light as the coach
wants; the app just stops claiming to have measured strength from it.

## 5. Engine coupling (amends doc 16 §3.4)

- **Earn gate (A6).** New predicate: **no earn while `resolvedRir > weekRir`** —
  same shape as the existing "not a deload week" predicate. Without it, a rehab
  week can still mint a step when the anchor is held by an older `moderate`
  session. Confidence degradation alone is not sufficient.
- **Miss throttle.** An assignment-active session neither earns nor counts as a
  missed earn (deload parity), so a backed-off block cannot arm the throttle.
- **Rep climb.** `climb_requires_rir_step` already holds the climb when RIR
  doesn't step down; the §4.2 reset supersedes it for assignment weeks.
- **Anchor: backed-off sets still anchor, non-measuring sets do not.** With §2's
  resolution a set at RIR ≤ `max_measuring_rir` is RIR-adjusted and therefore
  comparable, so it stays in the anchor — excluding it would freeze the anchor at
  pre-back-off values and make the return prescription jump straight back to full
  load (the failure mode the closed review §2.1 documented). Past the §6.1 band
  the sample is dropped instead, and the freeze is the *intended* outcome: better
  a stale honest anchor than a fabricated one.
- **Pain clamp** (`finalWeight ≤ perf.bestWeight` when pain/dampener is set,
  `engine/index.ts:434/:498/:513`): unchanged, and now clamps to a load the
  engine actually asked for.
- **Cross-meso:** assignments live on the plan, so `duplicate_mesocycle` carries
  them; nothing crosses a boundary implicitly (owner: a non-issue).

---

## 6. Stats & metrics policy

### 6.1 The measuring band (new — the guard that makes §4.3 safe)

Two different questions have been conflated by having one confidence ladder:
*how precise is this estimate* and *is this a measurement at all*. Add the second
as a hard boundary.

```jsonc
"e1rm": { "max_measuring_rir": 8 }   // new, .optional() — absent ⇒ today's behavior
```

**Gate on the assumed-RIR component, not on total effective reps.** The
unreliability comes from the *assumed* part, not the observed part: a logged
15-rep set at RIR 1 is 15 reps of observation, while a 9-rep set at RIR 21 is 9
observed and 21 asserted. Gating on effective reps would punish honest high-rep
work; gating on RIR targets exactly the fictional component.

When `assumedRir > max_measuring_rir` the set is **non-measuring**:

- `logged_sets.e1rm = null`, `e1rm_confidence = 'none'` (new label below `low`);
- excluded from the strength anchor (`queries/anchors.ts` drops the sample);
- excluded from every strength surface (`v_exercise_history.e1rm`,
  `best_set_e1rm`, `v_exercise_overview.best_e1rm`, `v_meso_summary.best_e1rm`,
  `v_exercise_prs`);
- **kept** in volume/adherence surfaces — the work happened;
- surfaced honestly in the day view and history ("effort: light — not scored").

Default 8 is chosen so **nothing existing changes**: it is today's `target_rir`
ceiling, so no set that can exist right now becomes non-measuring. It is a
tunable, and the block is `.optional()` per house discipline (absent ⇒
byte-identical fingerprints and outputs).

**Consequence worth stating:** during a deep backoff the anchor **freezes** at
its last measured value rather than drifting on fictional data. That is the
correct trade — a stale-but-honest anchor beats a fabricated one — and it is why
the return ramp is the coach's job (§4.2), which was already the plan.

### 6.2 Working-set policy (A5 — narrowed; one confirmation)


The owner's decision: only true working sets belong in stats; high-RIR /
low-confidence sets are done for other reasons and should be excluded. Adopted,
with two narrowings that I believe serve the intent better — **§9.1 flags the
one that needs a yes/no.**

1. **Key on prescription *intent*, not on measured confidence.** Excluding by
   `e1rm_confidence` would silently drop legitimate work: confidence degrades
   with *effective reps* too (`mod_max_eff_reps: 12`), so an honest 15-rep
   hypertrophy set at RIR 1 is already `low`, and under §2 honest reporting
   pushes more real sets there. Exclude on `resolvedRir > weekRir` — a
   deterministic, visible, plan-level fact, exactly like the `is_deload` filter
   the strength series already applies (`queries/stats.ts:573,179,727`).
2. **Exclude from strength surfaces; keep in volume surfaces.** Excluded from
   the e1RM/strength trend, `best_e1rm`, and PRs. **Kept** in weekly-sets /
   MEV-MAV-MRV / muscle-balance, with a disclosure flag: a set at RIR 4 still
   consumes recovery budget and still occupies a slot in the week — dropping it
   would make the volume picture wrong in the opposite direction (the athlete
   would read "under MEV" while doing exactly the prescribed volume).

Also settled: **display `rir_reported` in exercise history** (owner note 2) —
`v_exercise_history.avg_rir_reported` already exists and is dormant; the per-set
flip reads `logged_sets` directly. Report **effective reps** alongside (A1).

Honesty guardrails unchanged (doc 10 §9): e1RM is weakest above ~12 effective
reps or ≥ 4 RIR, which is precisely where a backed-off slot sits — so those
sessions are honest-but-noisy, and the surfaces should say so rather than hide
it.

---

## 7. Freshness (doc 14 §7 — mechanical)

1. `resolvedRir` (and the set cap) enter `buildConfigInputs` ⇒ they are in the
   config projection ⇒ **the fingerprint sees them and scope falls out of the
   hash**. No bespoke invalidation.
2. `meso_exercises` assignment columns join `mesoStaleSignature`
   (`queries/regeneration.ts:600-632`) so an assignment-only edit busts the
   cheap gate, with the existing conservatism test extended.
3. **No clock anywhere.** A per-week value is content, so the parked review's
   §4.1 expiry trap does not exist in this design.
4. Only `planned`, unlogged rows are ever rewritten (hard rule 5), unchanged.

---

## 8. Surfaces

- **MCP (primary, per A4).** New `edit_mesocycle` ops — `set_exercise_rir` and
  `set_exercise_sets` (slot id, per-week values or a single value, `reason`,
  clear) — inheriting the tool's zod validation, business rules, and
  `mcp_write_audit`. No new tool, no new paradigm. Read side: `get_mesocycle` /
  `get_current_state` disclose active assignments + reason.
- **UI (deliberately minimal).** The assignment reads on the planner slot and
  the day-view prescription strip; editing follows the "Load step" precedent
  (Exercise page header `⋯` sheet, doc 14 phase 3). Per-set RIR capture (§2)
  needs its own control on the set row with the prescribed value pre-filled.
  **Both need a hard-rule-8 pass**: no mockup figure exists, so transcribe
  house style and record it in `docs/09-design-changelog.md` before building
  (precedent: the doc 16 Phase-3 marker glyphs).
- **Copy (A1).** The RIR explainer changes meaning, not just wording: *the
  prescription is a suggestion; report your honest estimate of actual reps in
  reserve even when it differs.* Applies to the InfoDot/glossary copy (N25) and
  the capture control's helper text.
- **Explanation (doc 19).** The deterministic *why* states the assignment and
  its reason first ("coach set RIR 4 for this exercise this week — <reason>"),
  before the engine's own reasoning; the facts payload carries it so the
  coaching line never narrates an engine rationale for an authored effort level.

---

## 9. Open confirmations

**9.1 — Volume counting (§6.2).** A5 said exclude non-working sets from stats;
this spec excludes them from **strength** surfaces but **keeps** them in
**volume** surfaces (flagged). Rationale: a backed-off set still consumes
recovery budget, and dropping it makes MEV/MRV read as under-dosed during exactly
the block where the athlete is complying. *Confirm, or say "exclude from volume
too".* -- CONFIRMED

**9.2 — Capture ergonomics (§2).** Per-set RIR capture is new friction on the
hottest path in the app. Options: (a) a compact RIR chip on each set row,
pre-filled with the prescribed value, one tap to change; (b) capture once per
exercise (last working set) and infer the rest; (c) prompt only when the logged
weight×reps implies a materially different RIR than prescribed. *(a) is the
honest default and the simplest to reason about; the design pass will need a
call.* -- SELECT OPT A. WE WILL REVISE LATER IF I CHANGE MY MIND

**9.3 — `max_measuring_rir` default (§6.1).** Proposed **8**, chosen so nothing
that can exist today becomes non-measuring. A case exists for **6**: `mod_max_rir`
is 3, and past ~6 the assumed component already dominates the estimate. Starting
at 8 and tightening later is the safer order (it only ever *adds* exclusions), so
that is the recommendation. *Confirm 8, or set it lower.* -- CONFIRM 8

**9.4 — Display past the band (§4.3/§6.1).** A prescription of "170 lb × 9 @ 21
RIR" is arithmetically fine and humanly strange. Options: show the number as-is;
show a qualitative band ("light — well short of failure") with the number in the
detail view; or cap the *displayed* RIR while keeping the real one for pricing.
*Recommend the qualitative band — it matches the honesty guardrails and avoids
asking the athlete to estimate something they can't. Settle in the Phase 6 design
pass.* --  QUALIATITIVE BAND

**SETTLED in Phase 6 (2026-08-04).** The qualitative band, as a **display rule
only**: past `max_measuring_rir` the ask reads "each kept well short of failure"
and the planner meta reads `LIGHT`, while the Engine audit sheet still prints the
tuple verbatim (`171 × 9 @ 21 RIR`) and nothing about pricing, the trace, or the
stored numbers changes. The same rule reached the capture control, which was the
part this confirmation had not anticipated: a prescribed RIR above 10 no longer
pre-fills the per-set RIR cell (see Phase 6 "as built").

## 10. Phases (one per PR, each green on its own)

**Phase 1 — one RIR premise (N71 + N38). ✅ SHIPPED 2026-08-02.** `assumedRir =
rir_reported ?? target_rir` at the stamp site, the anchor, and the marker;
per-set RIR capture in the day view (pre-filled with the prescription, never 0 —
pin the N11 case); restamp backfill via `e1rm-restamp`; `rir_reported` +
effective reps in exercise history; RIR copy rewrite; doc 10/11 amendment
recording the re-levelling.
*Tests:* stamp ⇄ anchor parity on one fixture; the N11 exactly-as-prescribed
case on a deload; restamp idempotence; capture default.

*As built:*
- `engine/predict.ts::assumedRir(reported, prescribed)` is the one rule,
  re-exported through the engine barrel. Consumers: the stamp site
  (`log/actions.ts::computeSetE1rm`, log **and** amend), the anchor
  (`queries/anchors.ts`), the compliance marker
  (`engine/rules/progression.ts::setComplianceMarker`, which the day-view
  markers and the earn gate both read), the restamp planner, and exercise
  history. The anchor already had the fallback; the other paths did not — that
  asymmetry *was* N71.
- The stamp's fallback needs the slot's prescribed RIR, fetched by
  `getSlotTargetRir` / `getSetSlotTargetRir` and folded into the existing
  `Promise.all` on the log path, so the hot write path gains no serial latency.
- Capture is a **third value column on the set grid** (`LB · REPS · RIR · LOG`),
  the same input primitive as the other two, pre-filled from
  `day-rules.ts::captureRirDefault` and parsed by `reportedRirFromInput`
  (out-of-range or empty ⇒ report nothing, never a wrong number). Both are pure
  and unit-tested. Design pass recorded in `docs/09-design-changelog.md`
  (2026-08-02) per hard rule 8 — §9.2's **option (a)**.
- The write queue's `log` op carries `rir_reported`; ops enqueued by the
  previous build (no such field) still decode and drain, dispatching null.
- The backfill runs through the new admin-gated MCP tool **`restamp_e1rm`** —
  `activate_engine_params` only restamps when an `e1rm` param *value* moves, and
  here the **resolution** changed while every param held. Idempotent.
- Exercise history reports `avg_rir` (assumed), `rir_source`
  (`reported`/`assumed`/`mixed`) and `effective_reps`, on the flip line and in
  the MCP payload, so an assumption is never shown as an observation (§6.2).
- The one-time upward re-levelling is written up in **doc 10 §9.1**; the doc-11
  premise carries the amendment banner.

*Not in Phase 1, by design:* the measuring band (§6.1) is Phase 2b — it only
becomes load-bearing once §4.3's unbounded prescription RIR exists, and nothing
that can be logged today (`target_rir ≤ 8`, `rir_reported ≤ 10`) reaches it.

**Phase 2 — assignment: plan + engine. ✅ SHIPPED 2026-08-02.** Migration (§3,
incl. widening the `target_rir` checks to 0–30); pure resolution (§4.1) applied
after `liveWeekRirUpdates`; `prescribe()` consumes the resolved RIR at the three
§4.2 sites — **no new branch**; earn-gate predicate + miss-throttle parity (§5);
doc 14 wiring (§7).
*Tests:* absolute resolution vs ramp/deload incl. the below-deload warning case;
**repricing golden against the §4.2 table** (the owner's 342.6-anchor case at RIR
8 across the window) and symmetrically for a *lowered* RIR — reps stay inside the
window in both directions; unset ⇒ byte-identical output and fingerprint;
fingerprint scoping; no earn while active.

*As built:*
- `queries/slot-effort.ts` owns the resolution, pure and unit-tested:
  `slotRir(assignment, week)` = `rir_schedule[week] ?? target_rir`, and
  `resolveSlotEffort` folds in the week's ramp value. The schedule is indexed by
  **working week**, so a deload week falls off the end of the array and resolves
  to the flat `target_rir` — which is what lets one column pair express both
  "the whole meso" and "weeks 3–4 only". A **null element** means "no assignment
  that week"; the DB check bounds `array_remove(x, null::int)` because CHECK
  constraints cannot contain subqueries.
- **Repricing is one substitution at one site.** `pricedAtSlotRir` swaps the
  resolved RIR onto the inputs the pricing path reads; the deload, cold-start,
  bodyweight, rep-window and seed branches all generalize with no edit. The
  earn gate deliberately keeps the **un-substituted** inputs, which is what lets
  it compare the slot against the week it sits in.
- **Miss-throttle parity was not code.** The throttle only pairs a `stepped` ask
  with the next decision's compliance verdict, and a backed-off week can only
  record `not_earned` — so it can neither earn nor arm the throttle, exactly as
  a deload week already behaves. Asserted by test rather than implemented twice.
  The predicate sits **after** `sessionCompliance`: compliance judges the session
  already performed, so a genuine miss stays a miss whatever the next week asks.
- **Freshness needed one non-obvious guard.** The resolved value is omitted (not
  null) from the config projection when unassigned, so every pre-doc-21
  fingerprint, recorded decision and stale signature is byte-identical and
  nothing recomputes on deploy. But a spread cannot *delete* a key, so a
  replayed advance whose assignment was cleared would carry the stale one
  forever — the recompute drops it explicitly when the live config omits it.
  That is what makes "the ramp reasserts itself the moment the assignment is
  removed" actually true.
- The per-slot schedules inherit N18-B's orphan-clearing on a meso shape edit
  (`updateMesocycleAttrs` → `orphanedSlotSchedules`).
- `MesoExerciseRow`'s nullable assignment columns needed a per-table
  insert-optional list in `types/database.ts`: the global `Defaulted` set is
  keyed by column NAME, and `microcycles.target_rir` is NOT NULL and must stay
  required.
- **No write surface yet** — the resolution is honored end to end (seed,
  advance, day-view projection, reconcile), but nothing writes an assignment
  until Phase 3 (MCP) or Phase 6 (UI), so the lever is inert in practice.

**Phase 2b — the measuring band (§6.1). ✅ SHIPPED 2026-08-02** (same PR as
Phase 2 — **§4.3's unbounded ceiling must not reach production without it**).
`max_measuring_rir` param + the `'none'` confidence label; stamp writes null past
the band; anchor drops those samples; strength views exclude them, volume keeps
them.
*Tests:* band boundary (RIR 8 measures, 9 does not, at the default); anchor
freeze under a deep-backoff block; absent param ⇒ byte-identical.

*As built:*
- `engine/predict.ts::isMeasuringRir` + `stampE1rm` are the one rule, shared by
  the log/amend stamp site and the restamp planner. `'none'` is deliberately NOT
  a member of `E1rmConfidence`: the ladder answers "how precise", `none` answers
  "is this a measurement at all" — and keeping them apart keeps every
  `Record<E1rmConfidence, …>` weight table total.
- The strength surfaces inherit the exclusion **by construction** — they
  aggregate `logged_sets.e1rm` and max/avg ignore nulls — with one exception
  that had to be fixed: **`v_exercise_prs` re-computed e1RM in SQL** off
  `coalesce(rir_reported, 0)` rather than reading the stamp, so *both* doc-21
  rules passed it by, **including §2's shared resolution** (i.e. the N71 defect
  Phase 1 closed everywhere else was still live in that one view). It now reads
  `logged_sets.e1rm`, keeps the in-view expression only as a fallback for
  never-stamped rows, and excludes `'none'` outright.
- Ships as **engine_params v26, INACTIVE** — built on the **active v25**, not on
  the v23 file next door. The hosted chain runs ahead of `supabase/migrations`:
  v22, v24 and v25 were admin-MCP micro-bumps with no committed migration (the
  v23 file records the same pattern for v22), and v24/v25 carry
  `rate_source: "plan"` + the §7 envelope loop. Basing the band row on v23 would
  have silently reverted both on activation. `max_measuring_rir` is `.optional()`
  and 8 is the pre-doc-21 `target_rir` ceiling, so activation restamps nothing
  and the replay diff is expected empty.

**Phase 3 — MCP. ✅ SHIPPED 2026-08-02.** `set_exercise_rir` /
`set_exercise_sets` ops + reason, read-side disclosure, audit. *Tests:*
tool-handler tests on the seeded fixture user; refusal on started/completed
weeks.

*As built:*
- **Both ops live on `edit_mesocycle`** (§8 — no new tool, no new paradigm), so
  they inherit its ownership check, its planned/active gate, its zod validation
  and its `mcp_write_audit` row. They are **not** board structure, though, so
  they stay out of `applyMesoEdits` — that transform rebuilds the planner board
  wholesale, while an assignment is a column on a row that already exists. The
  handler splits the two op families and runs the structural save first.
- **The authoring core is pure**: `queries/slot-effort.ts::planSlotEffortEdit`
  takes the slot's current assignment, one intent, and the meso's shape, and
  returns the exact column patch or a sentence. Four value forms per lever —
  flat, flat + `weeks`, explicit `schedule`, `clear` — with every DB bound
  mirrored so a caller gets a refusal instead of a constraint violation.
  `tools/edit.ts::planEffortEdits` is the second pure layer: it composes a batch
  against the week defaults and the already-trained weeks, and every refusal
  fires **before any write**, so a mixed structural + effort call can't
  half-apply.
- **`save_meso_plan` was quietly fatal to this feature.** The planner-board save
  is a wholesale replace — it deletes the meso's days and re-inserts every slot
  from a structure-only payload — so a plain reorder, in the app or over MCP,
  would have wiped every assignment in the meso. `saveMesoPlan` now snapshots the
  assignments, and re-keys them onto the re-minted rows by day-slot × exercise
  (`restoreSlotEffortAssignments`) — the same identity `slotEffortKey` already
  resolves against, so a surviving slot keeps its assignment and a removed one
  loses it. No migration: the RPC's payload stays structure-only. It is also why
  the effort writes in a mixed call run **after** the structural save, addressing
  the new row ids through that key rather than the ids the caller passed in.
- **Refusal on started weeks is week-precise, not day-precise.** The structural
  day lock ("this day is completed/in progress this week") is the wrong shape for
  an assignment: assigning week 4 is perfectly legitimate on a day whose week-1
  session is in the books. So effort ops take their own guard — an op that
  **names** a week (`weeks`, or a non-null `schedule` element) whose workout for
  that day is completed / in progress / skipped is refused, while a **flat**
  value is allowed and comes back with a warning listing the weeks it can no
  longer change. A performed session is the intensity that was actually trained
  (hard rule #5) either way.
- **No silent semantics (§4.1), as warnings rather than refusals**: an assignment
  *below* the week's ramp RIR is reported as "week N runs HARDER than
  programmed"; a flat value is reported as also governing the deload week (with
  the deload's own default beside it). The week defaults come from the **live**
  ramp (`rirRamp` on the active params, exactly as `liveWeekRirUpdates` derives
  it), so a planned meso with no microcycles yet discloses the same numbers an
  active one does.
- **Read-side disclosure is present-only.** `get_mesocycle` adds an `effort`
  block **on the slot that carries one**, and `get_current_state` adds
  `effort_assignments` (resolved for the live week, with the week's own RIR
  beside it, the reason, and `backed_off`) plus a sentence in its `summary` —
  both omitted entirely when nothing is assigned, so an unassigned plan reads
  byte-identical to before the lever existed. `getCurrentState` takes the
  disclosure as an **opt-in** (`includeSlotEffort`) because the app's workout
  page calls it up to three times a render and has no use for it.
- **`set_exercise_sets` ships inert and says so.** The cap is stored, resolved
  and disclosed, but nothing in the engine clamps a set count to it until Phase
  4 — so both the tool description and every write that assigns one carry a
  warning pointing at `set_baseline_sets` for the sets the athlete actually
  sees. An MCP surface that implies an effect the prescription won't show is
  worse than no surface.
- Clearing the last assignment on a slot clears its `reason` too (A7 — a reason
  with nothing to explain is noise in every surface that reads it), and
  `set_exercise_sets` is deliberately named apart from `set_baseline_sets`: the
  cap governs every assigned week, the baseline seeds week 1 and then hands over
  to set progression.
- *Still inert in the app itself:* the UI surface and the doc-19 explanation
  layering are Phase 6.

**Phase 4 — set lever (A4) + optional `rep_position` (§4.2). ✅ SHIPPED
2026-08-02.** `set_cap` resolution + engine clamp, same fingerprint treatment;
`rep_position` as an optional per-slot knob (unset ⇒ the schedule decides).
*Tests:* the cap clamps down on every prescription route and never up; an
authored cap below `min_sets` wins; a rep position prices top-of-window lighter
than bottom at the same RIR, with the explicit form clamped to the window's hard
bounds; unset ⇒ byte-identical output, trace and fingerprint on both levers.

*As built:*
- **The cap is applied ONCE, at the boundary of both prescription routes**
  (`engine/index.ts::cappedSets`, wrapping `prescribe()` and `seedMeso()`),
  not at each branch's `sets` expression. Every branch — deload, cold start,
  seed anchor, rep window, bodyweight — already lands on a set count, and a cap
  is a statement about the result; capping the result is both the smallest
  change and the only shape a branch added later cannot forget. It sits
  **outside** the doc-16 progression wrapper on purpose: sets play no part in
  the earn gate or the realized-ask comparison, so a capped week's progression
  trace is identical to an uncapped one's.
- **A ceiling, never a floor**, and **absolute** like the RIR assignment (A2):
  `min(sets, cap)`, applied *after* `clampSets(…, params)`, so an authored cap
  of 1 wins over `params.min_sets` — a rehab slot at one set is exactly what
  this lever is for. Raising sets stays the plan's job (`set_baseline_sets`),
  because a lever that could do both would silently overwrite the volume
  autoregulation every week it was set. The Phase-3 tool warning that the engine
  "does not clamp to the cap yet" is replaced by the one that now matters: the
  cap only ever lowers the count.
- **`rep_position` is the useful half of the retracted centering rule, and
  nothing more.** §4.2's correction stands — repricing at a different RIR needs
  no special case — so this is a *knob*: unset ⇒ the Option-A climb schedule
  decides, byte for byte. Set ⇒ `repsAtPosition` replaces the schedule's
  `targetReps` at the three sites that choose a rep position (the working
  rep-window path, `prescribe`'s cold-start anchor seed, and `seedCore`'s),
  and the existing pricing path does the rest. Named positions resolve against
  the TARGET band; an explicit rep count is clamped to the window's HARD bounds,
  so a coach can ask for 15s but cannot escape the goal's window.
- **Flat per slot, with no per-week schedule** — one column (`rep_position
  text`), not a third week-indexed array. The position is a statement about how
  the exercise is priced, not an intensity that ramps; the MCP op *refuses*
  `weeks`/`schedule` rather than ignoring them, so a caller who wanted a per-week
  position is told this column cannot express it.
- One text column holds both value forms (`bottom|center|top` or digits) rather
  than a keyword column plus an int column: they are one knob with one
  resolution, and splitting them would turn "exactly one of these is set" from a
  shape into an invariant to enforce. `parseRepPosition` degrades unrecognized
  text to null — the knob is optional everywhere, so a bad row loses the
  position instead of failing a prescription.
- **Freshness is mechanical (§7.1), one key per lever.** `exerciseSetCap` and
  `exerciseRepPosition` join `exerciseRir` in `buildConfigInputs`, each OMITTED
  when its own lever is unassigned — so a slot carrying only a cap hashes
  differently from one carrying only a position, and a slot carrying neither
  hashes exactly as it did before doc 21 existed. The recompute's explicit
  key-drop (Phase 2's non-obvious guard) now runs per lever for the same reason:
  clearing one assignment must not leave another replaying off a stale copy.
- **MCP: a third op, `set_exercise_rep_position`**, on `edit_mesocycle` beside
  the other two, planned through the same entry point (`planSlotEffortEdit`
  dispatches to `planRepPositionEdit`) and returning the same result shape, so a
  batch never has to branch. Its plan reports no assigned weeks and no deload
  coverage — deliberately, since it can name neither — which keeps the
  already-trained-week refusal and the deload disclosure silent for a lever that
  has nothing to say about weeks.
- Read-side disclosure carries both: `get_mesocycle`'s slot `effort` block gains
  `rep_position` and one line on what each lever does, and `get_current_state`
  now separates "runs at an assigned RIR" from "carries an authored limit" — a
  slot with only a cap or a position was previously described as running at an
  assigned RIR (it was the week's own value), which was a claim nobody made.
- *Deliberately not here:* the prescription-strip copy. The cap and the position
  both change what the athlete sees, and the trace + rationale say so (visible
  over `explain_prescription`), but the deterministic *why* line and the doc-19
  facts payload are **Phase 6**'s subject along with the rest of the explanation
  layering and its design pass.

**Phase 5 — stats policy (§6). ✅ SHIPPED 2026-08-04.** Intent-keyed exclusion
from strength surfaces, volume disclosure flag, comparability note on meso/macro
rollups.
*Tests:* the exclusion is trend-identical to the deload exclusion on one fixture;
a rehab block that would read as a collapse holds its trend; an
only-backed-off lift stays visible with no trend; the note's null/singular/plural
forms; `isBackedOffSlot`'s truth table incl. its deliberate asymmetry; the
band applied to the read-side session series; MCP disclosure present-only.

*As built:*
- **One intent key, `isBackedOffSlot(slotRir, weekRir)`** (`queries/slot-effort.ts`),
  which `resolveSlotEffort` now calls for its own `backedOff`. The four stats
  views mirror it in SQL against the stored, already-resolved values —
  `workout_exercises.target_rir > microcycles.target_rir`. That comparison is the
  realized form of `resolvedRir > weekRir`, and because hard rule 5 never
  rewrites a performed session's row, it reads the intensity that was **actually
  trained** for history as much as for the live week. **Deliberately not
  symmetric:** a slot run *harder* than its week keeps every strength claim it
  earns.
- **The exclusion is read-side only, and that is the difference from §6.1.** The
  band asks *is this a measurement at all* and answers it at the stamp
  (`e1rm = null`, confidence `none`); §6.2 asks *is this measurement comparable*
  — the set was genuinely measured, still anchors the engine (§5), and is only
  incomparable with the block around it. So the stamp is untouched, no backfill
  exists to get wrong, and a future policy change costs nothing.
- **Surfaces.** `v_exercise_history` gains `backed_off` (bool_or per session — an
  exercise can hold two slots in a day) and **keeps its e1RM**: §6.2's closing
  note says these sessions should be *shown and flagged*, not hidden.
  `v_exercise_prs`, `v_exercise_overview.best_e1rm` and `v_meso_summary.best_e1rm`
  drop the sets outright; the trend fold (`foldProgressScores`) drops the
  sessions and **counts them per exercise**; the meso PR scan drops them from
  **both** sides (a backed-off session can neither set a PR nor raise the bar a
  later one must clear). `weight_pr` / `volume_pr` / totals keep every set —
  those are observations, not strength estimates, and a lighter set cannot
  displace them anyway.
- **Volume keeps them and says how many** (§9.1). `logged_backed_off_sets` joins
  the weekly role-grain facts and is weighted through the same 1.0/0.5 counting,
  so the disclosure is on the scale of the number it discloses. It is **not a
  subset of `logged_hard_sets`** — that column bakes doc 10 §2's separate RIR ≤ 4
  stimulus rule — and the surfaces say so rather than let a rehab block read as
  both fully dosed and under-dosed at once. *(That interaction is real and now
  visible: Phase 1 made `rir_reported` actually written, so the hard-set rule's
  "unreported counts, benefit of the doubt" clause rarely applies any more. Left
  as doc 10's call to make, flagged for the owner, not quietly redefined here.)*
- **The disclosure travels with every rollup.** `StrengthProgress.comparability`
  is one sentence built from the same scores the block renders (so it can never
  disagree with the numbers above it), surfaced in the meso and macro Performance
  tabs, `get_mesocycle_summary`, `get_macrocycle_summary`; `compare_mesocycles`
  gains a warning naming each block and its set count; `get_muscle_group_volume`
  discloses per week × muscle. Every one of them is **omitted, not zeroed**, when
  nothing is assigned — an unassigned plan reads byte-identical to before.
- **An exercise trained ONLY in backed-off sessions still gets a score entry**
  (sessions 0, no trend) so the note can name it. It fails the I11 ≥3-session
  display rule, so no trend is ever shown — but the surface can explain the
  absence instead of silently dropping the lift, which is exactly when the
  athlete needs the explanation most.
- **One more N71 corner closed.** `analyze_exercise_progress`'s session series
  (`queries/coaching.ts::getExerciseSessions` → `analysis/comparability.ts`) was
  still passing `rir_reported` **raw** into `estimateE1rm`, so an unreported set
  read as taken to failure — the same defect Phase 1 closed at the stamp, the
  anchor and the marker, and Phase 2b closed in `v_exercise_prs`. It now resolves
  `assumedRir` from the slot's prescription and applies the §6.1 band, so the
  read-side series and the stored stamp finally agree about what was measured.
- **Live verification:** the migration is applied to the hosted project. With no
  assignment in existence, the pre-existing columns of all five views hash
  **byte-identically** to the pre-migration baseline and every disclosure count
  is 0; a simulated assignment over the real data (no writes) exercises the
  joins/`bool_or` and flags 691 sessions / 1641 sets, confirming the shapes fire
  and the grain is unchanged. Advisors: no new findings, `security_invoker` kept
  on all four views.
- *Deliberately not here:* the day-view/planner disclosure of an active
  assignment, the editor sheet, and the doc-19 explanation layering — Phase 6.

**Phase 6 — UI + explanation. ✅ SHIPPED 2026-08-04.** 09-changelog design pass,
planner/day-view disclosure, editor sheet, doc 19 layering.
*Tests:* the disclosure vocabulary (eyebrow, band, the three sentence forms and
their exclusivity); the ask states the band and never the number past it; the
assignment leads the why and suppresses the ramp clause and the week frame; a
deload week with an assignment; unassigned ⇒ narrative and facts byte-identical;
the scoped overlay never drops another week; the capture pre-fill past the
reportable range; the facts block's presence/absence and the trigger.

*As built:*
- **One display module, `src/lib/slot-effort-display.ts`**, pure and client-safe
  beside `prescription-narrative.ts`: the eyebrow suffix, the §9.4 band phrase
  and the disclosure sentences all compose from it, so the day view, the
  planned-day page and the sheet cannot drift into three vocabularies for one
  state. Its guard rail is `hasEffortDisclosure` — every entry point returns
  nothing for an unassigned slot, which is where "an unassigned plan reads
  exactly as it did before the lever existed" is actually enforced.
- **§9.4 is settled as the qualitative band, and it is a DISPLAY rule only.**
  Past `e1rm.max_measuring_rir` the ask says "each kept well short of failure"
  and the planner meta says `LIGHT`; the Engine audit sheet still prints
  `171 × 9 @ 21 RIR` verbatim and the trace is untouched. The assignment line
  and the ask are composed from the same predicate, so they can never disagree
  about what is being asked.
- **The authored effort level leads the why, and that ordering is the whole
  point.** `composeEffortLines` renders above every engine-authored line — a
  person chose this effort, the engine only priced the load to meet it. Two
  consequences fall out and are pinned by test: the delta line drops its
  "an easier effort target" clause when an assignment (not the ramp) moved the
  RIR, and the program-intent frame ("first week of the block") is suppressed
  entirely, because a week's frame says nothing useful about a slot pulled off
  the ramp. On a deload week the assignment REPLACES the deload boilerplate
  rather than sitting under a sentence that contradicts it.
- **The pre-fill amendment nobody had noticed was needed.** §4.3 made the ask
  unbounded (0–30) while `rir_reported` stayed 0–10, so Phase 1's "pre-fill the
  prescribed target" would have printed `21` into a box labelled RIR and asked
  the athlete to confirm it. `captureRirDefault` now returns null past the
  reportable range and the cell renders empty with a `—` placeholder — still a
  no-op default (an empty cell reports nothing and the server's `assumedRir`
  resolves to the same prescription), but the app stops asking for a number it
  itself refuses to treat as a measurement. A **real** report is still accepted
  there, and a deep back-off reported at 8 becomes a measurement again: the band
  and the capture control compose rather than fight.
- **The app is the second write surface, and there is exactly ONE authoring
  policy.** `planEffortEdits` + `loadEffortContext` moved from the MCP tool into
  `queries/slot-effort.ts` (re-exported from `tools/edit.ts` so the tool's tests
  keep addressing them where they were defined), and `setSlotEffortAction` runs
  the same planner — same refusals, same §4.1 warnings, same already-trained-week
  guard. `loadEffortContext` now takes the active params as an argument instead
  of fetching them: `generation.ts` already imports `slot-effort.ts`, and a
  cycle between the two for one read is not worth the fragility.
- **A scoped edit OVERLAYS, it does not replace.** `planSlotEffortEdit`'s
  `value` + `weeks` form rewrites the whole schedule, which is right for a coach
  stating a complete intent and wrong for a sheet nudging one week — it would
  silently drop an assignment already sitting on week 4. `overlaySlotRirSchedule`
  resolves the slot's current per-week map first and writes over only the weeks
  in scope. One honest consequence, asserted by test: overlaying a **flat**
  assignment converts it to a schedule, so it stops covering the deload week.
- **The sheet keeps its warnings on screen.** A save that produced a §4.1
  warning (this week now runs harder than programmed; a whole-block value also
  governs the deload) holds the sheet open with the warning under a
  `SAVED — NOTE` rule instead of closing over it. It also reads on a **completed**
  session — a performed session's effort target is part of its record — and only
  refuses to write. The set cap and the rep position **read** there and are not
  editable (A4): a lever the sheet cannot change must still be visible where the
  athlete looks for it.
- **doc 19 layering: every number comes off the RECORDED decision.**
  `effort_assignment` is projected from `inputs.exerciseRir` / `exerciseSetCap` /
  `exerciseRepPosition` against `inputs.week.targetRir`, so the explanation
  describes the assignment that priced *that* decision rather than whatever the
  plan says today. Only the reason needs a lookup, and it is **dropped when one
  exercise carries two different reasons in one meso** — the day-slot hop costs
  two more queries for a case that barely exists, and attaching the wrong reason
  to a coaching line is worse than attaching none (§5.1: absence is the strongest
  gate). The prompt gains the rule that matters: an assigned effort level was
  chosen by a person, so the model may not explain it as a program decision,
  argue with it, or read a backed-off block as a decline. A new
  `effort_assignment` trigger fires on existence alone — a deliberately loose
  gate for a deliberately rare fact.
- *Deliberately not here:* the planner **board** (`PlannerBoard.tsx`), which is a
  staged-draft editing surface for plan STRUCTURE; the week-scoped planned-day
  page is where a per-week assignment can be shown truthfully, and it is what
  §8's "the assignment reads on the planner slot" asks for.

**Out of scope, tracked as N72:** bounded exercise substitution and the
`LOOKBACK_WEEKS = 2` return cliff — the one clause this lever cannot express.
