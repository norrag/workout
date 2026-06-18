# 12 — Connector Coaching Roadmap (staged plan)

Status: **staged plan, for incremental build across sessions.** This document
turns a brainstorm about the MCP connector's role as a *grounded personal
trainer* into an ordered backlog. Each stage is independently shippable as a
vertical slice and names its scope, design, hard-rule constraints, and
acceptance criteria. It changes no behavior by itself — it is the artifact to
build against.

Authoritative intent still lives in [05-mcp-connector.md](05-mcp-connector.md)
(tool surface), [04-feedback-engine.md](04-feedback-engine.md) (engine logic),
and [10-metrics-spec.md](10-metrics-spec.md) (metric definitions + the honesty
guardrails in §9). Where this doc disagrees with those, **those win** and this
doc is stale. Update [PROGRESS.md](PROGRESS.md) as each stage lands.

## Why — the driving finding

Driving the connector as a coaching client against the live account surfaced a
concrete failure that motivates most of this plan. `analyze_exercise_progress`
for **Dumbbell Curl (2-Arm)** (`22c73c4a-3c3b-4992-9670-4b4dfda612c5`) returns
`best_e1rm 49`, `latest_e1rm 27`, `change_pct −18.2`, `trend: declining`,
`stalled: true`. A coaching layer *will* surface that as "your curls are
regressing." It is almost certainly a **false alarm**, false for three stacked
reasons:

1. **Cross-phase.** The 35 lb top sets that set the lifetime best were logged
   Dec–April, entirely inside **cut** mesocycles. The current block is a
   **bulk** at 20–25 lb.
2. **Slot pooling.** Inside the current bulk the curl occupies **two day-slots**
   — Day 1 (logged at 25 lb) and Day 3 (logged at 20 lb). The series is a
   sawtooth across two different intended loads.
3. **Single-latest read.** "Latest" happened to land on the lighter Day-3 slot
   (20×11), i.e. the bottom tooth. The Day-1 slot is flat at ~25×11.

The unifying principle behind the plan: **the connector is already honest about
*estimates* (the inline `data_quality` blocks are good) but not yet honest about
*comparability*.** Closing that gap — and aligning the agent with the app's
training paradigm so it interprets numbers the way the engine intends — is the
goal.

## Decisions locked (2026-06-18)

1. **Edit-meso target scope = any day that is neither completed nor in
   progress.** Not "future weeks only." If the user is on Monday of a week,
   later, untouched days *in that same week* are valid edit targets. A day that
   is completed or in progress is never edited (consistent with hard rule #5 —
   logged history is immutable). The engine still owns set/load/rep numbers; the
   LLM edits structure and the week-1 baseline, and the engine ramps from there.
2. **Cross-meso comparison keys on prescribed RIR, not W·D coordinate.** W·D
   alone does not survive unequal meso lengths (a 4-week vs an 8-week block) or
   differing intent (a 4-week cut vs a 4-week bulk). Each week carries a
   prescribed target RIR; that is the primary alignment key for "matched
   intent." **Macro `goal_type` is a segmenting/annotation dimension** — compare
   within a goal where possible, and always caveat a comparison that crosses a
   cut↔bulk boundary.

---

## Stage 1 — Coaching paradigm + persona in the connector

**Status: landed 2026-06-18** (`src/lib/mcp/server.ts` instructions +
`workout://coaching-guide` resource in `src/lib/mcp/coaching-guide.ts`). See
[PROGRESS.md](PROGRESS.md).

**Goal.** Align the assistant with the app's science-based training paradigm so
it reasons *with* the engine instead of second-guessing it, and so it inherits
the §9 honesty guardrails.

**Scope.**
- Extend the server-level instructions string (`src/lib/mcp/server.ts`) beyond
  the current domain primer (hierarchy / RIR / units / "engine computes the
  numbers") with a compact **paradigm + stance** section.
- Add a `workout://coaching-guide` **resource** for the depth (citations,
  landmarks, autoregulation logic) so the instructions string stays short.

**Content — distilled from [10-metrics-spec.md](10-metrics-spec.md), not
invented:**
- The progression model: RIR ramp (Refalo 2023), fractional volume counting
  1.0/0.5 (Pelland 2024), MEV/MAV/MRV landmarks and the workload-driven
  autoregulation (RP/Israetel), double progression + deload.
- The **stance**, mirroring §9 guardrails: e1RM is a trend not a tested 1RM;
  pump/soreness are weak secondary signals (never proof of a good session);
  deloads are a fatigue valve, not a growth booster; push:pull is advisory, no
  posture/injury claims; rate-of-gain and landmark numbers are heuristics with
  large individual variance.

**Reframe / non-goals.** The **client** owns tone; the **server** owns *domain
paradigm + guardrails*, not peppiness. Design against a "motivational trainer"
voice that overclaims — that fights §9. This stage reinforces the existing
inline `data_quality` notes; it must not contradict them.

**Constraints.** No schema, no new tool. Pure docs/instructions distillation.

**Acceptance.** A fresh client session, given only the connector, explains *why*
the app ramps RIR / counts fractional volume / deloads, and hedges e1RM and
pump correctly without being prompted.

---

## Stage 2 — Per-day session classification (derived field)

**Status: landed 2026-06-18** (`src/lib/engine/classification.ts` pure classifier;
surfaced per day in `get_mesocycle` and per day in `get_muscle_balance`). See
[PROGRESS.md](PROGRESS.md).

**Goal.** Stop the "your low-set days are under-trained" misread when those days
are legs by design (the exact gap observed: Day 2 = 12 sets and Day 4 = 10 sets
are leg days; Day 1 = 29 and Day 3 = 20 are upper).

**Scope.** Add a deterministic derived `emphasis`/`classification` field per day
in `get_mesocycle` (and optionally per-day in `get_muscle_balance`), computed
from the **fractional-volume PPL map already defined in [10] §7** (push = chest,
front/side delts, triceps; pull = back, rear delts, biceps; legs = quads,
hamstrings, glutes, calves). Label by dominant fractional volume on the day
(e.g. `legs`, `upper-push`, `full-body`).

**Reframe / non-goals.** The label is **context, not a verdict.** `get_muscle_
balance` already gives the meso-level PPL split and already correctly flags real
deficits (in the live data: quads 6 sets < MEV 8, hamstrings 3). Do not let the
per-day label become a new thing the model lectures about — it exists to prevent
a naive read, not to add judgment.

**Constraints.** Derived/computed only; reuse the §7 map and fractional counting
(`exercise_muscle_groups.role`, 1.0/0.5). No new stored column needed.

**Acceptance.** `get_mesocycle` days carry a stable classification; a client
asked "is my volume uneven?" distinguishes "fewer sets because it's a leg day"
from a genuine deficit.

---

## Stage 3 — Analysis comparability upgrade

**Goal.** Fix the false-stall class of bug (the curl) by making single-exercise
analysis compare like with like. This is the highest-accuracy-per-effort stage.

**Scope — `analyze_exercise_progress` (and the meso `progress_scores`):**
1. **Rolling / last-N-comparable instead of single latest.** Replace the lone
   `latest_e1rm` driver of `trend`/`stalled` with a rolling window over recent
   comparable sessions. Cheapest, biggest win — kills the "latest was the light
   Day-3 slot" artifact.
2. **Phase awareness.** Join each session's meso `goal_type` (bulk/cut/…); when
   the window spans a cut↔bulk boundary, **segment or caveat** rather than
   reporting a raw decline. Per decision #2, goal is a segmenting dimension.
3. **Expose e1RM confidence.** [10] §1 already specs high/moderate/low
   confidence by effective reps & RIR, but the live tools don't return it.
   Surface it and **down-weight low-confidence points** in best/trend. This also
   answers rep-range fairness: e1RM already normalizes heavy-low vs light-high
   via effective reps, so **no new metric is needed** — confidence weighting is
   the fix (a 20×11 set is weaker evidence than a 35×8 set).
4. **Matched comparison across mesos** keyed on **prescribed RIR** (decision
   #2), e.g. "this meso's RIR-1 top sets vs last meso's RIR-1 top sets,"
   annotated with each block's goal.

**Constraints.** Engine stays the source of any prescribed numbers; this is
read/interpretation only. Honor §9 — every estimate stays labeled; confidence
bands must be presented as bands, not new precision.

**Acceptance.** The Dumbbell Curl no longer reports `declining/stalled` off a
single light-slot session; matched-RIR comparison shows the Day-1 slot flat; a
cut→bulk transition is caveated, not alarmed.

**Dependency.** Stage 5's per-slot view, if built, sharpens this further but is
not required — rolling + phase + confidence already defuse the example.

---

## Stage 4 — `edit_mesocycle` write tool

**Goal.** Close the biggest *functional* gap: today the write surface is
create + delete only, so the "analyze → suggest → apply on approval" loop has no
apply step. This unlocks agentic rebalancing (e.g. `get_muscle_balance` flags
quads/back/chest below MEV → propose changes → apply).

**Scope — editable operations on a meso:**
- add / remove an exercise slot,
- swap the exercise in a slot,
- reorder slots within a day,
- set the **week-1 baseline** set count (the engine ramps from there).

**Target rule (decision #1).** Editable targets = **any day that is neither
completed nor in progress**, including untouched later days of the *current*
week. Completed or in-progress days are never edited.

**Hard-rule constraints.**
- Hard rule #3 / #5: the **engine owns** week-to-week set counts and loads; the
  LLM edits *structure* + the week-1 baseline only. Never rewrite an
  already-generated/logged week's prescription; never touch logged sets.
- Validate with the same zod schemas as the app forms; record to
  `mcp_write_audit`; server-side business validation (weeks 3–8, etc.).
- For a day later in the current week, the engine re-derives that day's
  prescription from the edited structure when the day is generated/started —
  confirm the regeneration path doesn't disturb already-generated days.

**Open question to resolve at build time.** Whether editing a slot mid-meso
should also be expressible as a save-to-template + restart path for larger
restructures, or stay purely in-place. Default: in-place, bounded to the
operations above.

**Acceptance.** A client can rebalance an active meso's remaining (incomplete,
not-in-progress) days on approval; the engine ramps the edited structure
forward; completed/in-progress days and all logged history are untouched; the
write is audited.

---

## Stage 5 — Session-order / fatigue-position normalization

**Goal.** Make performance fair to where a movement sits in the session — the
leg-extensions-after-heavy-deadlifts problem, and a contributor to the two-slot
curl divergence.

**Pre-build data check (blocking).** Confirm whether the **actual performed
exercise order within a session** is persisted, not just the planned slot order.
Signals already present: the plan has `slot_number` and ordered groups, and
logged sets expose a `sequenceIndex` (seen in `explain_prescription` inputs).
If actual per-session sequence is stored, this stage is *surfacing*; if not, it
needs a small capture/view change first.

**Scope (if data supports it).**
- Per-(exercise, day-slot) series so a movement's two slots are analyzed
  separately instead of pooled.
- A fatigue-position annotation (movement's ordinal within its session) so
  analysis can normalize "first movement vs 4th."

**Constraints.** Read/interpretation only; no change to how sessions are
logged beyond (if required) capturing performed order.

**Acceptance.** The Dumbbell Curl's Day-1 and Day-3 slots report as distinct
series; an accessory performed late in a session isn't misread as a regression
versus the same movement performed fresh.

---

## Suggested sequence

1. **Stage 1** (paradigm/persona) and **Stage 2** (per-day classification) —
   nearly free, stop confidently-wrong advice today.
2. **Stage 3** (analysis comparability) — fixes the false-stall bug class,
   reuses metrics [10] already defines.
3. **Stage 4** (`edit_mesocycle`) — the real new build; unlocks rebalancing.
4. **Stage 5** (session-order) — gated on the data-capture check.

Stages 1–3 are independent and can land in any order; Stage 4 is independent of
1–3; Stage 5 depends only on its own data check and enhances Stage 3.
