# 21 — Exercise-level RIR (authoritative build spec)

**Status: authoritative build spec** (2026-07-31). Consolidates the owner's
Batch-28b proposal and the assessment thread:
[assessment](./reviews/2026-07-31-exercise-level-rir.md) → owner notes +
decisions A1–A8 (Batch 28c). Those are the rationale record; **where they
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
| A5 | **Exclude non-working (high-RIR / low-confidence) sets from stats** — narrowed in §6, needs one confirmation. |
| A6 | **Add the earn-gate predicate** (no progression earned while an assignment is active). |
| A7 | **Store a `reason`** with the assignment and surface it. |
| A8 | **Close the override review.** Its one unresolved thread (bounded substitution + the `LOOKBACK_WEEKS = 2` cliff) is preserved as **N69**. |

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
- **Ceiling stays 8** (owner's open question, §9.3 of the assessment). The
  numbers say a higher cap buys almost nothing: even at RIR 8 the load is only
  −14.6 % vs RIR 1 (§4), and "9 reps with 12 in reserve" is not a meaningful
  instruction. If more than ~15 % load reduction is needed, the lever is sets or
  substitution, not RIR. `rir_reported`'s 0–10 range is unchanged (an athlete
  may honestly report more reserve than was ever prescribed).

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

### 4.2 Repricing (owner note 3)

**Confirmed: repricing already happens, and it is the source of the numbers
below.** Under `weight_selection: "rep_window"` the load is
`weightForRepsAtRir(anchor, targetReps, targetRir)` — raise the RIR and the load
falls out of the same call. The −9 % figure in the assessment was already the
repriced load, not the un-repriced one.

What must be *added* is the owner's second half: when the resolved RIR differs
from the week's RIR, **reset the rep schedule to a defined point instead of
carrying whatever the climb left**, exactly as a deload does. Otherwise a slot
whose climb had walked reps to 12 reprices very differently from one sitting at
8, for the same assignment.

**The mechanic is the deload's, verbatim** (`engine/index.ts:190-196`):
window-**centered** reps at the target RIR, load from the anchor, bounded to the
window, reps re-derived from the rounded weight, **no rep climb** that week.

One correction worth stating plainly, because the owner's note says "floor
reps": at a fixed anchor and RIR, **fewer reps means a heavier load** (lower
effective reps ⇒ lower `k` ⇒ higher weight). Flooring reps would make the
backed-off prescription *heavier* than centering. Hypertrophy window 8–12, load
÷ anchor:

| target RIR | floor (8 reps) | **centered (10)** | top (12 reps) |
|---|---|---|---|
| 1 | 0.774 | **0.732** | 0.698 |
| 3 | 0.732 | **0.698** | 0.667 |
| 4 | 0.714 | **0.682** | 0.652 |
| 5 | 0.698 | **0.667** | 0.638 |
| 6 | 0.682 | **0.652** | 0.625 |
| 8 | 0.652 | **0.625** | 0.600 |

Centered, relative to a normal RIR-1 week: RIR 3 **−4.7 %**, RIR 4 −6.8 %, RIR 5
**−8.9 %**, RIR 6 −10.9 %, RIR 8 −14.6 %.

**Policy (settled):** when `resolvedRir ≠ weekRir`, prescribe with
window-centered reps at `resolvedRir` — the deload path's own code, generalised
from "deload week" to "backed-off slot". The climb resumes normally on the first
week the assignment is absent. This also disposes of the owner's incoherent-triple
worry ("9 RIR while asking for 8 reps"): the load is *chosen* so the prescribed
reps land on the prescribed RIR, by construction.

**This is a deload at exercise grain, which is exactly the owner's framing** —
and it is why A4's set lever matters: the app's own deload pairs RIR 6 with
`set_pct 0.5`. RIR alone moves load ~2 %/step; volume is the other half.

---

## 5. Engine coupling (amends doc 16 §3.4)

- **Earn gate (A6).** New predicate: **no earn while `resolvedRir > weekRir`** —
  same shape as the existing "not a deload week" predicate. Without it, a rehab
  week can still mint a step when the anchor is held by an older `moderate`
  session. Confidence degradation alone is not sufficient.
- **Miss throttle.** An assignment-active session neither earns nor counts as a
  missed earn (deload parity), so a backed-off block cannot arm the throttle.
- **Rep climb.** `climb_requires_rir_step` already holds the climb when RIR
  doesn't step down; the §4.2 reset supersedes it for assignment weeks.
- **Anchor: unchanged, and deliberately not excluded.** With §2's resolution the
  samples are RIR-adjusted and therefore comparable, so they can stay. Excluding
  them would freeze the anchor at pre-back-off values and make the return
  prescription jump straight back to full load — the failure mode the parked
  review §2.1 documented.
- **Pain clamp** (`finalWeight ≤ perf.bestWeight` when pain/dampener is set,
  `engine/index.ts:434/:498/:513`): unchanged, and now clamps to a load the
  engine actually asked for.
- **Cross-meso:** assignments live on the plan, so `duplicate_mesocycle` carries
  them; nothing crosses a boundary implicitly (owner: a non-issue).

---

## 6. Stats & metrics policy (A5 — narrowed; one confirmation)

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
recovery budget, and dropping it makes MEV/MRV read as under-dosed during
exactly the block where the athlete is complying. *Confirm, or say "exclude from
volume too".*

**9.2 — Capture ergonomics (§2).** Per-set RIR capture is new friction on the
hottest path in the app. Options: (a) a compact RIR chip on each set row,
pre-filled with the prescribed value, one tap to change; (b) capture once per
exercise (last working set) and infer the rest; (c) prompt only when the logged
weight×reps implies a materially different RIR than prescribed. *(a) is the
honest default and the simplest to reason about; the design pass will need a
call.*

---

## 10. Phases (one per PR, each green on its own)

**Phase 1 — one RIR premise (N68 + N38).** `assumedRir = rir_reported ??
target_rir` at the stamp site, the anchor, and the marker; per-set RIR capture
in the day view (pre-filled with the prescription, never 0 — pin the N11 case);
restamp backfill via `e1rm-restamp`; `rir_reported` + effective reps in exercise
history; RIR copy rewrite; doc 10/11 amendment recording the re-levelling.
*Tests:* stamp ⇄ anchor parity on one fixture; the N11 exactly-as-prescribed
case on a deload; restamp idempotence; capture default.

**Phase 2 — assignment: plan + engine.** Migration (§3); pure resolution
(§4.1) applied after `liveWeekRirUpdates`; `prescribe()` consumes the resolved
RIR; the §4.2 centered-reps repricing generalised from the deload path; earn-gate
predicate + miss-throttle parity (§5); doc 14 wiring (§7).
*Tests:* absolute resolution vs ramp/deload incl. the below-deload warning case;
centered repricing golden at RIR 3/4/5/6/8 against the §4.2 table; unset ⇒
byte-identical output and fingerprint; fingerprint scoping (assignment moves
only its slot's rows); no earn while active.

**Phase 3 — MCP.** `set_exercise_rir` / `set_exercise_sets` ops + reason,
read-side disclosure, audit. *Tests:* tool-handler tests on the seeded fixture
user; refusal on started/completed weeks.

**Phase 4 — set lever (A4).** `set_cap` resolution + engine clamp, same
fingerprint treatment. Can merge into Phase 2 if it lands naturally.

**Phase 5 — stats policy (§6).** Intent-keyed exclusion from strength surfaces,
volume disclosure flag, comparability note on meso/macro rollups.

**Phase 6 — UI + explanation.** 09-changelog design pass, planner/day-view
disclosure, editor sheet, doc 19 layering.

**Out of scope, tracked as N69:** bounded exercise substitution and the
`LOOKBACK_WEEKS = 2` return cliff — the one clause this lever cannot express.
