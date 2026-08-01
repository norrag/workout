# Coach-authored prescription overrides — pre-implementation review

**Date:** 2026-07-31 · **Status: CLOSED — not being built** (owner decision A8,
2026-07-31). Kept as a historical record only. The live direction is
**exercise-level RIR assignment**:
[assessment](./2026-07-31-exercise-level-rir.md) → build spec
[`docs/21-exercise-level-rir.md`](../21-exercise-level-rir.md). No code was
written from this doc and none should be.

> **Closed the same day it was written.** The owner judged the
> coach-prescription-override paradigm "messy and a large paradigm shift" and
> proposed managing effort per exercise through the RIR framework the app
> already has. That direction was assessed, decided (A1–A8), and specified in
> doc 21.
>
> **Where this doc's findings went, so nothing is lost by closing it:**
> - **§2 (the five engine couplings)** — a property of the engine, not of this
>   design. Answered structurally by doc 21 §5 (RIR-adjusted anchor, earn-gate
>   predicate, miss-throttle parity, unchanged pain clamp).
> - **§3 (a display-only layer desyncs the volume views)** — the reason doc 21
>   writes the resolved value into `workout_exercises.target_rir` rather than
>   layering over it.
> - **§4.4 (the `LOOKBACK_WEEKS = 2` return cliff)** — **the one thread that
>   stays open**, because bounded substitution is the single clause exercise-level
>   RIR cannot express. Tracked as backlog **N69**; this section is still its only
>   written record.
> - **§5 (no separate coach principal)** and **§6 (reduce-only safety bounds)** —
>   apply to any MCP write that changes what the athlete is asked to do,
>   including doc 21 §8's new ops.

The owner's request: an MCP path that lets the LLM coach override or author
prescriptions for an exercise / day / week — full tuple (exercise, weight, reps,
sets) plus a documented reason, duration, and return criteria — clearly labeled
as coach-authored, fully audited, with a defined relationship to the progression
engine. Motivating case: lumbar nerve symptoms after hard deadlift work; the
coach and owner agreed a temporary plan (stop deadlifts, cut related workload,
substitute safer movements) and there is no way to write that plan down.

The idea is sound and the motivating case is real. This review pushes back on
**one premise**, flags **six mechanical traps** the design has to answer, and
proposes an architecture that keeps the app's invariants intact. Owner decisions
are collected in §13.

---

## 1. What exists today (so the gap is exact)

Worth being precise, because roughly half the ask is already reachable and the
half that isn't is the interesting half.

| Capability | Today | Where |
|---|---|---|
| Substitute an exercise for **one session** | **yes** | `replaceWorkoutExercise` (`queries/logging.ts:828`) → `queries/slot-prescription.ts`; in-app swap on the day view |
| Substitute for **every** remaining week | **yes** | `edit_mesocycle { op: "swap_exercise" }` (`mcp/tools/edit.ts:413`) — plan-level, all future weeks |
| Substitute for **a bounded window** (2 of the next 5 weeks) | **no** | — |
| Change the **weight** the athlete will see | partial — per-set, athlete-side only | `workout_exercises.set_weights` (`queries/logging.ts:734-790`), untouched by the reconcile |
| Change **sets** for a single upcoming day | **no** (plan-level baseline sets only) | `edit_mesocycle { op: "set_baseline_sets" }` |
| Change **reps / target RIR** for a day or week | **no** | — |
| Stop an exercise for a period without deleting it | partial | `manage_exclusions` (`excluded_exercises`, has a `reason` column) — but it is a **library-level** flag with no time bound and no effect on an already-generated plan |
| Record *why* | partial | `log_note` (pinned or session note); exclusion `reason` |
| Per-user × per-exercise engine override | **yes, one knob** | `exercise_param_overrides` (weight increment only) → `resolveEffectiveParams` (doc 14 phase 3) |

So the missing pieces are: **time-boxed** scope, **load/volume modulation**,
and a **first-class record** of coach intent that survives the freshness
reconcile. Everything else is plumbing that already exists — which is good news
for the size of the build.

---

## 2. The premise that does not hold: "the engine stays separate"

The proposal says the engine would keep evaluating against its **original**
prescription, so rehab work registers as a miss and the engine keeps a
conservative view of capacity. The first half is true; **the second half is
not**, and not because of a bug — because the engine deliberately anchors on
what was *performed*, not on what was *prescribed*. Five paths carry the
override work straight into the engine's state regardless of where the override
is stored:

**2.1 The strength anchor is a recency-weighted argmax over performed sets.**
`recencyWeightedE1rm` (`engine/reps.ts:152`) with the active `session_best`
method picks `argmax(e1RM × 0.5^(age/30))` and averages that session
(`engine_params` v23: `anchor_method: "session_best"`, `recency_halflife_days:
30`). A lighter session at ratio `r` of the pre-injury e1RM overtakes the old
anchor once the old session is older than **`30 · log₂(1/r)` days**:

| load cut | rehab work becomes the anchor after |
|---|---|
| −10 % | ~4.6 days |
| −20 % | ~9.7 days |
| −30 % | ~15.4 days |

So the owner's expectation is **inverted at short horizons**: a one-week −20 %
override leaves the anchor completely untouched, and the week the override ends
the engine reprices at pre-injury loads immediately — no conservatism at all. At
two weeks or more, the anchor drops to the rehab level and stays there. Neither
behavior was chosen; both fall out of a decay constant tuned for something else.

**2.2 The advance path's base weight is the best set actually performed.**
`const baseWeight = perf.bestWeight!` (`engine/index.ts:332`, from
`assessPerformance`) — not the prescription. It is the floor/ceiling for every
hold, deadband, and gate branch below.

**2.3 The pain / dampener clamp pins next week to the rehab load.** When
`painGated` or `sessionDampened` is set, the engine refuses to prescribe above
what was handled: `finalWeight = baseWeight` (`engine/index.ts:434`, `:498`,
`:513`). During a rehab block the athlete is *very likely* to report joint pain
≥ `pain_gate` (2), so the coach's −20 % becomes the **ceiling** for as long as
pain is reported — not for the override window. Combined with 2.1 this is a
ratchet, and the climb back out is metered by the earned-step pacer at roughly
one quantum (~3 %) per microcycle: recovering a −20 % cut is a **multi-month**
proposition, not "some ramp-up time".

**2.4 The rep climb restarts from the reps performed.** With
`climb_on_performed_reps: true` (active), `prevReps` is the **minimum** working
set's reps (`engine/index.ts:386-387`). Rehab work sits outside the prescribed
window by design, and both directions distort:
- lighter load × **higher** reps → `toppedOut` (`:396`) → window reset **and a
  load step** — the engine reads pain-limited pump work as earned progress;
- pain-limited **low** reps → next target reps are low → under rep-window
  pricing, fewer reps at the same anchor prices the load **up**.

**2.5 The earn gate and miss throttle both trip.** Doc 16 §3.4/§3.5: a
non-compliant session fails the gate, and ≥ 2 consecutive earned-then-missed
cycles arms the miss throttle (`engine/rules/progression.ts:254`), which then
demands `miss_rearm_sessions` fully compliant sessions before progression
re-arms. A rehab block therefore buys latency **on top of** the anchor damage —
and the trace will report the athlete as having missed, which is false: they did
exactly what they were told.

**Conclusion.** "Keep the override separate from the engine" is not an available
option; the only real question is **which of these five couplings we accept and
which we neutralize explicitly**. My recommendation is in §13 Q4, but the
decision has to be made deliberately — leaving it implicit means the feature
ships with a silent multi-month load ratchet attached to the pain gate.

---

## 3. Where an override lives — three architectures

**A. Display-only layer** (the `set_weights` pattern: engine prescription stays
in `workout_exercises`, the override renders on top). Attractive for
auditability — the original is preserved by construction — but **rejected**:
every volume view sums `workout_exercises.prescribed_sets` directly
(`20260702000001_v_meso_week_muscle_sets.sql:63-81`,
`20260612000001_design_pivot.sql:313`). A display layer desyncs planned volume,
`get_muscle_group_volume`, `preview_mesocycle_volume`, muscle-balance, and the
planner board from what the athlete is actually being told to do — breaking the
"stats screens and MCP share the same views, one definition of progress"
convention. It also repeats the N33 mistake (a write path that bypasses the
framework) that
[`2026-07-04-swap-prescription-provenance.md`](./2026-07-04-swap-prescription-provenance.md)
was written to close.

**B. Constraint override resolved into effective params / engine inputs.** The
coach writes *intent* — "cap load at 80 % for weeks 3–4", "cap sets at 2",
"progression off", "cap target reps at 8" — into a new time-boxed override table;
`resolveConfigInputs` / `resolveEffectiveParams` pick it up; the **engine**
computes the numbers and writes them to `prescribed_*` with a decision recording
the constraint in provenance. This is exactly the doc 14 §7 reusable contract:
make the value an engine input, resolve it in the shared resolver, and
invalidation scope falls out of the fingerprint with no bespoke wiring. Every
view, every MCP tool, the day view, and the explanation layers see the effective
prescription for free.

**C. Absolute per-slot pin.** The coach names the exact tuple. Unavoidable for
**exercise substitution** (there is no "constraint" that means "do
Romanian deadlifts instead"), and the owner explicitly asked for it. Should be a
first-class decision `kind` (`"override"`) written through the same
slot-prescription resolver, never a raw write.

**Recommendation: B as the default expression, C available and explicitly
labeled.** B keeps the engine as the only author of numbers (doc 05: "the LLM
proposes structure; the engine fills in numbers"), composes with the RIR ramp
and deload automatically, and stays correct if any other input changes
mid-window. C is the escape hatch for substitution and for the case where the
coach genuinely wants a specific number. The audit requirement is satisfied
either way **without a "before" column**: `engine_decisions` already stores the
full inputs + output of the pre-override decision, so the counterfactual is
already on record (`explain_prescription` / `replay_decisions` can show it).

---

## 4. Six mechanical traps

**4.1 The reconcile's cheap gate has no clock.** `mesoStaleSignature`
(`queries/regeneration.ts:632`, inputs at `:600-627`) is a content watermark —
params version, RIR ramp, weeks, goal, experience, override count + latest
`updated_at`, exercise watermark, workout watermarks. A time-boxed override that
**expires by the clock alone** moves none of these, so
`reconcilePrescriptions` short-circuits at `:778` and the expired override keeps
applying forever. Any window-based design must add the window boundary (e.g. the
next expiry instant, or the current local training date) to that signature —
and there is a conservatism test in place that will need extending.

**4.2 Expiry must not rewrite history.** Only `planned`, unlogged rows are ever
rewritten (doc 14 §8, hard rule 5). An override that ends must leave the days
already performed under it exactly as logged.

**4.3 A `-20 %` constraint is relative to *what*?** If it is relative to the
live engine prescription, the number moves when anything upstream moves
(anchor refresh, RIR ramp step) — usually right, occasionally surprising. If it
is frozen at authoring time it is stable but goes stale. Recommend: **relative,
recomputed** (that is the whole point of B), with the resolved absolute value
shown back to the coach at authoring time and recorded in the decision
provenance.

**4.4 The substitution lookback cliff at 2 weeks.** `LOOKBACK_WEEKS = 2`
(`queries/slot-prescription.ts:70`): when the original exercise returns, it
advances off its most recent instance with logged sets **within 2 weeks**;
beyond that it falls back to a **cold seed** off the prior peak
(`v_exercise_prs`). So a 3-week rehab substitution — a completely ordinary
duration — makes the deadlift come back **priced off its pre-injury peak**,
which is the worst possible direction after a nerve issue. If bounded
substitution ships, this needs an answer: either the lookback extends under an
active override, or (better) the return is itself an override — see §13 Q4.

**4.5 Double-counting with the engine's own autoregulation.** The coach cuts a
set; the engine's `pain_cut_gate` (3, active) *also* cuts a set
(`engine/rules/feedback.ts:41-47`) and `pain_gate` (2) blocks increases. The
athlete can end up with a deeper cut than either party intended. Decide: does an
active override **suppress** feedback-driven set changes for that exercise
("coach has the wheel"), or **compose** with them? Recommend compose for safety
(both only ever reduce) but **disclose both** in the explanation, and forbid
the coach's constraint from being *lifted* by the engine.

**4.6 Overrides are not the same object as exclusions.** `excluded_exercises`
already means "stop recommending this movement" and carries a `reason`. A
temporary "no deadlifts for 2 weeks" is conceptually an exclusion with a window
— but exclusions today don't touch an existing plan. Decide whether the override
system absorbs a time-boxed exclusion or the two stay separate and must be
cross-checked (an exercise excluded but still prescribed is an obvious
incoherence a coach could create today).

---

## 5. Authorship, trust, and the "coach" identity

There is **no separate coach principal.** The MCP session authenticates as the
user (doc 05: identity comes from the token, no tool takes a `user_id`). So:

- "Author" can only record what is verifiable: source = MCP, the OAuth
  `client_id`, timestamp, tool + args hash (`mcp_write_audit` already does the
  last two). A free-text "authored by Dr. So-and-so" is **user-supplied
  metadata, not authentication** — fine to store, never to display as if
  verified.
- "Coach override via MCP is the only route" is a **friction boundary, not a
  security boundary**. It doesn't stop the athlete from authoring their own
  overrides; it stops them from doing it *casually*, which may well be the
  actual goal — worth stating plainly in the spec so nobody later mistakes it
  for a control.
- **Corollary: there must be an in-app escape hatch.** If overrides can only be
  created *and cleared* through MCP, then a connector outage, a revoked token,
  or a chat the athlete can't reconstruct leaves them locked into a prescription
  they cannot change from the app. At minimum: overrides are **visible** on the
  day view and **clearable** in-app, even if only MCP can create them.

---

## 6. Safety bounds for a first version

An LLM writing loads into a live plan is the highest-blast-radius write the app
would have. Suggested v1 envelope (all enforced server-side with zod + business
validation, like every other write tool):

- **Reduce-only.** Load multiplier ∈ [0.5, 1.0]; sets ≤ engine sets; reps within
  the goal window's hard `[min, max]`. Raising demand via MCP is out of scope —
  the engine's earned-step path is the only route up.
- **Bounded horizon.** Window ≤ 4 weeks and ≤ the end of the active mesocycle;
  no overrides on a future meso that hasn't been activated.
- **Planned, unlogged rows only** — same guard as the reconcile
  (`queries/regeneration.ts:72-77`). Never touches a started or completed
  workout.
- **One override per (exercise, window)**, replacing rather than stacking, so
  the resolved value is never the product of three multipliers nobody can see.
- **Explicit confirmation echo** on the tool (the `activate_mesocycle` /
  `activate_engine_params` pattern) — this is the same class of action.
- **Never fabricates a measurement** (T-I5): an override changes what is *asked*,
  never a logged set, an e1RM, or an anchor.

---

## 7. Surfaces that must change

Not exhaustive, but the ones that will be wrong if missed:

- `queries/fingerprint.ts` (config projection + params token), `regeneration.ts`
  (stale signature, recompute, force scope), `progression.ts` / `generation.ts`
  / `slot-prescription.ts` (every prescription write site).
- Day view: the prescription strip and the set rows must show the override and
  its reason. Live re-derivation (`prescription_anchor`, doc 16 §5.2) must price
  off the override's basis, not the engine's, or an athlete-edited weight
  re-derives reps against a target that isn't being asked for.
- Explanation layers: the deterministic why (`lib/prescription-narrative.ts`)
  must state coach authorship *first* — this is doc 19's "ask / why" contract —
  and the LLM coaching line's facts payload needs an `override` block so it
  never narrates an engine rationale for a number the engine didn't choose.
  `explain_prescription` likewise.
- MCP reads: `get_current_state`, `get_mesocycle`, `get_exercise_history` should
  disclose active overrides, or the coach will re-derive its own plan from data
  that silently contains its own last intervention.
- Stats/verdicts: a meso containing an override window is **not comparable** to
  one that doesn't — `get_mesocycle_summary` / adherence / progress score should
  disclose it rather than grade the athlete down for compliance with a rehab
  plan. (This also affects the macro closeout retrospective, doc 17 §5.)

---

## 8. Design gate (hard rule 8)

"Clearly identified as coach-authored" is a **UI requirement**, and there is no
mockup figure for it. Precedent exists for this exact situation: the three-state
set marker in doc 16 Phase 3 had no figure, so it shipped as a house-style
transcription recorded in `docs/09-design-changelog.md` (2026-07-09 entry). Same
path here — a 09-changelog entry describing the override badge/strip in the
ledger idiom (dashed borders = planned, orange = current position/selection
only, tracked all-caps labels, no hype copy) before any screen work. Worth
knowing up front that this is a real design pass, not a one-line badge: the
athlete needs to see *what was asked, why, by whom, until when*, and how to get
back to the engine's number.

---

## 9. What I think the honest version of this feature is

Stripping it back: the coach doesn't actually need to author numbers. It needs
to be able to say, in a way the app will enforce and remember:

> "Deadlift is out until the 12th. Romanian deadlift in its place at 60 %.
> Everything that loads the low back drops to 80 % load and 2 sets. No
> progression on any of it. Reason: lumbar nerve symptoms. Revisit when
> symptom-free for 5 days."

Every clause there is a **constraint plus a window plus a reason** — which is
architecture B, plus one absolute substitution (C), plus a `progression: off`
flag that N39 already contemplates as a per-exercise override. That framing
keeps one author of numbers, gets fingerprint invalidation for free, composes
with the RIR ramp and deloads, and survives an engine params activation
mid-window. It is also a much smaller build than a general prescription editor.

---

## 10. Suggested phasing (if adopted)

1. **Spec** (doc 21) — settle §13, write the data model + the engine-coupling
   rules; amend doc 14 §7 (new source), doc 16 §3.4 (gate predicate), doc 05
   (tool surface), doc 19 (explanation contract).
2. **Phase 1 — the record + the engine seam.** `prescription_overrides` table
   (RLS + tests), resolution into config inputs / effective params, fingerprint
   + stale-signature wiring (§4.1), decision provenance. Load cap + set cap +
   `progression: off`. No new UI beyond a minimal day-view disclosure.
3. **Phase 2 — MCP surface.** `set_prescription_override` / `list_` / `clear_`
   with the §6 envelope, confirmation echo, `mcp_write_audit`, and the read-side
   disclosure in `get_current_state`.
4. **Phase 3 — bounded substitution** (architecture C) incl. the §4.4 lookback
   answer and the return ramp.
5. **Phase 4 — explanation + stats disclosure** (doc 19 layers, comparability
   flags on summaries/retrospective).
6. **Phase 5 — in-app surface**: the 09-changelog design pass, override visible
   and clearable in-app.

---

## 11. What I'd push back on

- **A general "coach writes any prescription" tool.** It makes the LLM an author
  of loads, which contradicts doc 05's division of labour, makes every downstream
  number's provenance ambiguous, and gives a hallucinated tuple a direct path to
  the athlete's barbell. Constraints + a labeled substitution get ~95 % of the
  value with a bounded failure mode.
- **Raising demand via override.** Out of scope for v1 (§6).
- **Auto-expiry on clinical criteria** ("when symptom-free for 5 days"). The app
  cannot evaluate that. Store it as text, expire on the date, and *prompt* —
  never silently decide the athlete has recovered.
- **A "before" snapshot column.** `engine_decisions` already holds the
  counterfactual; a second copy is one more thing that can disagree with itself.

---

## 12. Smaller open questions

- Does an override survive a **meso edit** that regenerates the plan (weeks
  changed, deload toggled)? Recommend: yes, it is keyed to (exercise, date
  window), not to a row id.
- Does it apply to **new** slots added inside the window (a swap-in, an
  added exercise)? Recommend: yes, if keyed by exercise and the window is live.
- What about an override on an exercise the athlete then **removes** from the
  plan — dangling, or auto-cleared?
- Should the override carry a **target RIR** clause? Rehab plans often say
  "stay 3+ reps in reserve" and the RIR ramp will otherwise walk it to 0-1.
  Probably yes, as a *floor* (never a ceiling).
- **Deload interaction:** a deload week inside an override window applies both
  reductions multiplicatively (0.55 × 0.8 = 0.44). Intended, or should the
  override yield to the deload?

---

## 13. Owner decisions needed

**Q1 — Number authorship.** Constraints-only (engine renders), absolute pins, or
both? *Recommend: both, with constraints as the default expression and pins
reserved for substitution + explicit cases, always labeled.*

**Q2 — Storage.** Effective-params/config override (B) writing through the
engine into `prescribed_*`, vs a display layer (A)? *Recommend B — A desyncs
every volume view (§3).*

**Q3 — Scope keys.** Which of exercise / day / week / muscle-group can an
override target? *Recommend: (exercise × date-window) as the only key in v1;
"this week" and "this day" are expressed as windows. A muscle-group-wide clause
("everything that loads the low back") is genuinely useful for rehab but wants
role-grain resolution — worth a decision, possibly v2.*

**Q4 — The engine-coupling question (the important one).** Given §2, pick one:
  - **(a) Accept the coupling.** Rehab work anchors and clamps exactly as any
    other work. Honest, zero engine change; but the athlete eats a multi-month
    load ratchet triggered by their own pain reports, and the trace calls their
    compliance a miss.
  - **(b) Neutralize selectively (recommended).** Sessions performed under an
    active override are: excluded from the **earn gate** and the **miss
    throttle** (they neither earn nor count as missed — exactly how deloads are
    already treated, doc 16 §3.4), and marked in the decision trace as
    coach-directed. The **anchor stays untouched** — measurement honesty is
    preserved, and the §2.1 crossover behavior is disclosed rather than hidden.
    The return ramp is then the coach's job (a follow-up override at 85 %, 92 %,
    100 %), which is precisely the capability being asked for.
  - **(c) Exclude override sessions from anchoring too.** Removes the ratchet
    entirely, but the app then prescribes off a measurement it has reason to
    believe is stale, immediately after an injury. *I'd argue against this.*

**Q5 — Autoregulation composition** (§4.5): suppress or compose? *Recommend
compose-and-disclose.*

**Q6 — Exclusions** (§4.6): absorb time-boxed exclusions into overrides, or keep
separate with a coherence check?

**Q7 — In-app escape hatch** (§5): confirm that overrides must be visible and
clearable in-app even if only MCP can create them. *Strongly recommend yes.*

**Q8 — Substitution return** (§4.4): extend `LOOKBACK_WEEKS` under an override,
or require the coach to prescribe the return? *Recommend the latter — an
automatic extension re-prices off pre-injury work, which is the failure mode we
are trying to avoid.*
