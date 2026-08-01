# 21 — Exercise-level RIR (authoritative build spec)

**Status: authoritative build spec** (2026-07-31). Consolidates the owner's
Batch-28b proposal and the assessment thread:
[assessment](./reviews/2026-07-31-exercise-level-rir.md) → owner notes +
decisions A1–A8 (Batch 28c) → **owner pushback on §4.2 + the RIR ceiling
(Batch 28d, revised the same day)**. Those are the rationale record; **where they
conflict with this doc, this doc wins.** Doc 16 keeps authority over progression
internals, doc 14 over freshness, doc 10 over metric definitions — this doc
amends each where noted (§2, §5, §6, §7). Implementation proceeds in new
sessions, one phase per PR (§10).

Backlog: **N67** (the feature), **N68** (the RIR-premise defect, absorbed as
Phase 1), **N38** (honest-RIR capture — absorbed as Phase 1), **N69** (bounded
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
| A8 | **Close the override review.** Its one unresolved thread (bounded substitution + the `LOOKBACK_WEEKS = 2` cliff) is preserved as **N69**. |
| **28d** | **Repricing needs no special case** — thread the resolved RIR through the existing pricing path, symmetric in both directions (§4.2, supersedes the rejected centered-reps rule). **Prescription RIR is unbounded** so one lever spans deload → rehab → extra effort (§4.3); the **measuring band** (§6.1) is what keeps that honest. |

---

## 2. The RIR premise, amended (amends doc 11; absorbs N38)

**Today's premise:** the app prescribes a target RIR and trusts the athlete to
hit it, so no per-set RIR is captured; a logged `weight × reps` against a
*prescribed* target RIR is itself an RIR data point.

**Two paths implement it inconsistently, and that is a live defect (N68):**

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
  restamp backfill. The two paths converge; N68 closes by construction.
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
part of the rejected centering rule, demoted from a mandate to a knob. Deferred
to Phase 4 — nothing depends on it.

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

## 10. Phases (one per PR, each green on its own)

**Phase 1 — one RIR premise (N68 + N38).** `assumedRir = rir_reported ??
target_rir` at the stamp site, the anchor, and the marker; per-set RIR capture
in the day view (pre-filled with the prescription, never 0 — pin the N11 case);
restamp backfill via `e1rm-restamp`; `rir_reported` + effective reps in exercise
history; RIR copy rewrite; doc 10/11 amendment recording the re-levelling.
*Tests:* stamp ⇄ anchor parity on one fixture; the N11 exactly-as-prescribed
case on a deload; restamp idempotence; capture default.

**Phase 2 — assignment: plan + engine.** Migration (§3, incl. widening the
`target_rir` checks to 0–30); pure resolution (§4.1) applied after
`liveWeekRirUpdates`; `prescribe()` consumes the resolved RIR at the three §4.2
sites — **no new branch**; earn-gate predicate + miss-throttle parity (§5); doc
14 wiring (§7).
*Tests:* absolute resolution vs ramp/deload incl. the below-deload warning case;
**repricing golden against the §4.2 table** (the owner's 342.6-anchor case at RIR
8 across the window) and symmetrically for a *lowered* RIR — reps stay inside the
window in both directions; unset ⇒ byte-identical output and fingerprint;
fingerprint scoping; no earn while active.

**Phase 2b — the measuring band (§6.1).** `max_measuring_rir` param + the
`'none'` confidence label; stamp writes null past the band; anchor drops those
samples; strength views exclude them, volume keeps them. Ships with Phase 2 or
immediately after — **§4.3's unbounded ceiling must not reach production without
it**.
*Tests:* band boundary (RIR 8 measures, 9 does not, at the default); anchor
freeze under a deep-backoff block; absent param ⇒ byte-identical.

**Phase 3 — MCP.** `set_exercise_rir` / `set_exercise_sets` ops + reason,
read-side disclosure, audit. *Tests:* tool-handler tests on the seeded fixture
user; refusal on started/completed weeks.

**Phase 4 — set lever (A4) + optional `rep_position` (§4.2).** `set_cap`
resolution + engine clamp, same fingerprint treatment; `rep_position` as an
optional per-slot knob (unset ⇒ the schedule decides). Can merge into Phase 2 if
it lands naturally.

**Phase 5 — stats policy (§6).** Intent-keyed exclusion from strength surfaces,
volume disclosure flag, comparability note on meso/macro rollups.

**Phase 6 — UI + explanation.** 09-changelog design pass, planner/day-view
disclosure, editor sheet, doc 19 layering.

**Out of scope, tracked as N69:** bounded exercise substitution and the
`LOOKBACK_WEEKS = 2` return cliff — the one clause this lever cannot express.
