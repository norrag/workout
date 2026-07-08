# Review — prescribed e1RM progression (response to "Updates to the Prescription Engine")

**Date:** 2026-07-07
**Source:** owner memo *Updates to the Prescription Engine* (2026-07; verbatim in
`docs/notes/backlog.md` appendix, intake item **N35**). The memo diagnoses a gap,
drafts a double-progression fix, withdraws it as flawed, and asks: *"How, and on
what basis, do we trigger an increase to the e1RM of the user such that they are
prescribed progress cleanly throughout their macrocycles and mesocycles?"*
**Status:** analysed against the engine at HEAD; recommendation below. No code
changes in this PR — this is the design review the memo requested. The
recommended design was put through a hostile design review before landing;
§6.3–6.6, the workload/staleness gates, the Phase-1 rate ceiling, and several
§9 corrections are its product (the review also confirmed: no e1RM-space
double-count with the RIR ramp, the no-compounding re-arm rule holds, the
pain/dampener locks compose, and honest single-rep misses score ≈ the measured
anchor).
**Relates to:** archived S4 / PR22 (`docs/notes/A-engine-metrics.md`), owner
ruling T-I5 (2026-06-25, "never fabricate"), R24 hold-week concern, N21
(macro-target correction), doc 10 §4, doc 13 §9.2, doc 14.

---

## 1. Summary

1. **The memo's diagnosis is correct, and it is exact — not approximate.** Under
   the active v19 params, an athlete who performs precisely what is prescribed
   reproduces the strength anchor to the pound, every session, every meso. The
   prescription is a **fixed point** of the engine by construction (§3). The RIR
   ramp intensifies *effort* week-over-week but demands zero capacity gain, and
   the meso seed reprices the unchanged anchor back to the bottom of the rep
   window, so meso N+1 week 1 equals meso N week 1. Progression exists in the
   system only as *detection* (of voluntary over-performance), never as *demand*.
2. **The memo's self-critique of its own withdrawn plan is also correct** (§5).
   Inheriting `weight × reps` at seed ignores RIR, and the top-of-window trigger
   is unreachable under compliance: the Option-A rep climb was deliberately built
   to offset the RIR ramp one-for-one (doc 13 §9.2, hardened by R24a), so reps
   can never out-climb the ramp to reach `target_high`.
3. **The open question dissolves under one reframe.** The stored e1RM must
   **never** be incremented — that would fabricate a measurement (T-I5). The
   thing that must lead is the **prescribed demand**. Split one number into two
   roles: the *measured anchor* (trailing, honest, unchanged) and the
   *prescription target* `A* = anchor + one earned overload quantum`. The
   doc-11 premise — a logged set is assumed performed at its prescribed target
   RIR — then closes the loop automatically: **performing the prescription at
   the prescribed RIR *is* the data point that raises the measured e1RM to the
   target.** The engine never invents capacity; it asks for one quantum more
   and lets performance confirm or refute it (§6).
4. **This is a small, pure, param-gated engine change** (§7). The per-session
   compliance gate derives from inputs `prescribe()` already receives
   (`previous`, `actualSets`, feedback); the cadence/rate/throttle gates need
   one **caller-computed derived lookback input** over recent
   `engine_decisions` (same pattern and doc-14 treatment as the strength
   anchor). No schema change, no fingerprint change; all tunables land in a
   new `engine_params.progression` block behind the house `.optional()`
   discipline (absent ⇒ today's behavior, byte-identical fingerprints).
   Rollout is the standard propose → replay-diff → activate flow.
5. **Notably, this restores what doc 10 §4 already specifies.** The metrics
   spec mandates genuine double progression ("when the top of the range is hit
   for all sets at target RIR, **add one increment** and reset to the bottom",
   Plotkin 2022). The implementation neutralized the climb against the ramp, so
   the spec's overload intent was silently lost. The memo rediscovered that
   divergence from the athlete's seat.

---

## 2. What the memo says (restated)

- The engine captures progress in e1RM well (session-best anchor + repricing),
  but **never prescribes e1RM progression by design**. If the athlete follows
  prescriptions indefinitely, the model never asks for more; progression must
  come from the athlete over-performing on their own initiative — "a
  particularly honest and driven athlete to truly push themselves to the target
  RIR in spite of the prescription, not because of it."
- The withdrawn plan: (a) *seed route* — stop repricing to the low end of the
  window; inherit the anchor session's average `weight × reps` unless its rep
  average falls outside the window (below → reprice low per existing logic;
  above → bump the anchor by one minimum increment, then reprice low);
  (b) *advance chain* — climb reps until **all** prescribed sets hit the top of
  the window without pain, then bump the anchor one minimum increment and
  reprice to the window bottom.
- The self-flagged flaws: seed inheritance disregards RIR (same ramp, same
  reps, same result meso-over-meso); and unless extra reps are *continually*
  prescribed, the athlete never reaches the top of the window at all — but
  prescribing extra reps **is** an e1RM increase, so the e1RM must rise for the
  trigger to even become reachable. Topping the window is therefore the
  *weight-ratchet* trigger, not the e1RM trigger. The open question: on what
  basis does the e1RM itself advance?

---

## 3. The fixed point, verified against the code

### 3.1 Why compliance reproduces the anchor exactly

Three code facts make the treadmill exact rather than approximate:

1. **Forward and inverse share one curve.** A logged set is scored
   `e1RM = weight × k(reps + rir × rir_offset)` (`src/lib/engine/predict.ts:104-118`),
   and the prescribed load is chosen by inverting the *same* factor:
   `weightForRepsAtRir = e1rm / k(reps + targetRir × rir_offset)`
   (`predict.ts:170-183`, comment: "they must share it or forward/inverse
   drift"). Perform exactly what was priced and the measured e1RM *is* the
   anchor (modulo the loadable-step rounding, which is zero-mean noise the
   R24b deadband exists to absorb).
2. **The rep climb is RIR-neutral by design.** Doc 13 §9.2 (Option A):
   "Because `targetReps` climbs +1/week while the RIR ramp drops `targetRir`
   −1/week, effective reps stay ~constant, so **the weight is held within the
   meso**." R24a (`climb_requires_rir_step`, v19) hardened this into an exact
   invariant — the climb now happens *only* when the ramp steps
   (`src/lib/engine/index.ts:326-339`), eliminating even the accidental
   overload that hold weeks used to produce (it was repricing loads *down*,
   which is why it was removed — correctly, given the then-current model).
3. **A logged set assumes RIR = prescribed target RIR** (doc 11 premise,
   `src/lib/engine/reps.ts:4-9`; the anchor query applies it at
   `src/lib/queries/anchors.ts:149` — reported RIR when present, else the
   prescription's target, over completed workouts only, `anchors.ts:105-111`).
   There is no independent effort measurement that could detect "this was
   actually easier this week" when the athlete logs prescribed weight ×
   prescribed reps. Compliance is *informationally invisible* — the record it
   produces is indistinguishable from zero adaptation.

### 3.2 Worked example (active defaults: hypertrophy window 8–12, `rir_offset` 1, `brzycki_max_eff_reps` 10, 5 lb step)

Anchor 200 lb, 4 working weeks, linear ramp 3→2→1→0, perfect compliance:

| week | target RIR | target reps | priced load | prescription | measured e1RM if performed exactly |
|---|---|---|---|---|---|
| 1 (seed) | 3 | 8 (window low) | 146.3 → **145** | 145 × 8 @ 3 | **198.2** |
| 2 | 2 | 9 | 146.3 → **145** | 145 × 9 @ 2 | **198.2** |
| 3 | 1 | 10 | 146.3 → **145** | 145 × 10 @ 1 | **198.2** |
| 4 | 0 | 11 | 146.3 → **145** | 145 × 11 @ 0 | **198.2** |
| deload | 4 | — | anchor-based, RIR 4 | (recovery) | — |
| **meso 2, week 1** | 3 | 8 | 145 | **145 × 8 @ 3** | 198.2 |

Same bar weight for four straight weeks (by design — that part is correct
double-progression form), but the measured e1RM is **pinned at 198.2 for the
entire meso**, and meso 2 opens with the *identical* prescription meso 1 opened
with. This is not only closed-form arithmetic: running the actual engine
(`prescribe`/`seedMeso`/`recencyWeightedE1rm` with the full v19-equivalent flag
set) under simulated perfect compliance reproduces the table verbatim and holds
it for **three consecutive byte-identical mesocycles**, anchor pinned at 198.2
throughout. Note also that reps peak at 11: `target_high` (12) is never reached, so
the top-of-window reset — today's only in-meso load-step trigger — **cannot
fire under compliance** with a 5-step window and a 3-step ramp. The two escape
hatches are exactly the memo's: the athlete volunteers extra reps (the anchor
catches it — `assessPerformance` "beat", `rules/performance.ts:69`), or they
report a *lower* RIR than target (`rirReported`, same effect via the sample).

The same holds on every other path: the seed route
(`seedMeso`/`seed_from_anchor`, `index.ts:595-687`) prices `target_low` at the
start RIR off the same anchor; the cold-start/swap-in branch
(`index.ts:194-238`) does the same; the bodyweight model
(`rules/bodyweight.ts`) predicts reps off the same anchor at a fixed effective
load. One anchor, one curve, no lead.

### 3.3 What autoregulation does and does not touch

`modulateFromFeedback` (`rules/feedback.ts:18-90`) moves **set counts only**
(workload/pump/pain → `setDelta`), and the pain gate / session dampener can
only *block* a load increase, never create one (`index.ts:371-372, 421-423`).
`gradeOnRir` only colors the rationale. **No feedback path changes prescribed
load, and nothing anywhere advances e1RM.** So the gap cannot be closed by
tuning existing knobs — no parameter setting produces prescribed overload.

Nor is there a backstop that would eventually notice: **no stagnation
detection exists anywhere in the engine or specs** — no plateau detector, no
meso-over-meso progress check, no rule that escalates when the athlete merely
complies. Plateau detection exists only as *retrospective analytics* over MCP
(`analyze_exercise_progress`, doc 05), which reports the flat line but feeds
nothing back into prescriptions.

---

## 4. How we got here (this is a designed-in gap, not a regression)

Worth stating plainly because it changes how the fix should be framed:

- **Doc 04 framed the RIR step itself as the progression**: "Moving the target
  RIR down by 1 with the same weight/reps is itself a progression; load
  increases must account for that" (§ per-exercise step 2). True for *effort*,
  but it licensed a model where nothing else needs to move.
- **Doc 13 §9.2 chose Option A** explicitly to kill load-creep-at-fixed-reps,
  and stated the consequence: "the load only moves when (a) they top the window
  … or (b) the **anchor** changes (real strength change, incl. caught
  overperformance)." The anchor-only stance was the point.
- **T-I3/T-I4/T-I5 (owner rulings, 2026-06-25)** retired the legacy
  `increment`/`regression_pct` path *because it fabricated progression without
  evidence* — "+fixed increment on a hit" with no anchor grounding. The ruling:
  "real strength change is carried by the recency anchor (rising or falling),
  never a fixed step or hidden back-off… If something truly does not have
  enough data… the user should just seed themselves… rather than make up data."
- **R24a (v19)** then made the anchor-only fixed point *exact* by removing the
  hold-week wobble.
- **Doc 11's locked RIR premise** (no per-set RIR capture; the e1RM math
  assumes the prescribed target RIR) is what makes compliant performance score
  at exactly the prescribed e1RM — the premise *creates* the fixed point, and
  no spec flags that consequence as a limitation. (The same premise is what
  makes the fix below work; §6.2.)
- The memo's ratchet idea has a direct ancestor: the owner's embedded editor
  note 3 in the 2026-06-23 standalone-prescription investigation ("reduce reps
  back toward the lower end … step up the athlete's reps until they can
  complete the increment") — the concern has been circling for two weeks.

Each step was locally right (the legacy path really did invent numbers; the
hold-week reprice-down really was a bug). Their sum is a system that is purely
**reactive**: a perfect mirror with no pull. The archived S4 answer
(`A-engine-metrics.md`) claimed Option A "is exactly the 'hold load until all
sets reach the top of the rep range…'" behavior the owner had asked for — but
classic double progression climbs reps at **constant** target effort (each +1
rep is a genuine capacity demand), while Option A climbs reps at **falling**
RIR (zero net demand). The two look identical in a training log and are
physiologically different. The memo caught what that answer missed.

Doc 10 §4, meanwhile, still specifies the genuine version: "Advance reps within
the prescribed range; when the top of the range is hit for all sets at target
RIR, add one increment and reset to the bottom… (Progressive overload via load
or reps is interchangeable for hypertrophy — Plotkin 2022)." So the
recommendation below is not a new doctrine — it is doc 10 §4 implemented inside
doc 13's anchor→weight framework, with T-I5's honesty constraint preserved.

---

## 5. Assessment of the memo's withdrawn plan

The owner's editor notes already identified the load-bearing flaws; confirming
each against the code, plus two the memo did not name:

1. **Seed inheritance of `weight × reps` disregards RIR — confirmed defective.**
   Meso N ends at (say) 145 × 11 @ 0 RIR. Inheriting "same average weight ×
   reps" into meso N+1 week 1 at 3 RIR prescribes a near-maximal effort on the
   week that exists to be sub-maximal — it silently converts the RIR ramp reset
   into a one-week +3-effective-rep jump, then the ramp re-tightens onto reps
   that have nowhere to go. (It also anchors the seed to a *session average*,
   reintroducing a flavor of the fabricated-triple problem T-I5 killed.)
2. **The top-of-window trigger is unreachable under compliance — confirmed**
   (§3.2): the climb is ramp-locked (+1 rep only on a −1 RIR step, R24a), the
   window is 5 steps and the ramp 3, and every seed resets to `target_low`. Only
   voluntary over-performance reaches 12 — which is the exact reliance the memo
   set out to remove.
3. **The "+1 increment then reprice to window bottom" step is nearly
   e1RM-neutral anyway** — a flaw the memo circled ("it would seem the e1RM
   must be consistently increased… reaching the top of the rep range simply
   triggers the weight increment (not e1RM)"). Precisely: repricing to the
   bottom of the window at the *same* anchor already raises the bar weight
   (fewer effective reps ⇒ heavier load at equal e1RM); adding one increment
   *and* repricing off a bumped anchor changes the athlete's demand by only
   that one quantum. The ratchet is presentation; the quantum is the substance.
4. **(Unnamed in the memo) Fabricating the anchor bump violates the T-I5 line.**
   Both memo branches "compute a progression to the anchor e1RM by incrementing
   the anchor." If that increment is written into the *measured* e1RM record or
   its anchor, the system now contains a capacity claim no set ever
   demonstrated — the exact class of invented number the 2026-06-25 ruling
   retired, and a direct hit on the doc 10 §9 honesty guardrails (e1RM is "an
   estimate/trend" of performance). It also compounds: a second unearned bump
   stacks on the first with no confirmation between them.
5. **(Unnamed in the memo) "All sets at the top without pain" is the right
   *shape* of gate but the wrong *placement*.** As a trigger for a rare ratchet
   event it is almost never consulted (see 2). As a compliance gate for an
   *earned* quantum (§6) it is consulted every session — same predicate, moved
   to where it has effect. Note the predicate must be **new logic**:
   `climb_on_performed_reps` (v12 #1) established the right *direction*
   (advance on the minimum performed working set, not the best), but it is
   climb bookkeeping — nothing existing compares set count, per-set weight, or
   per-set RIR against the prescription (§6.4 spells the full predicate out).

So the memo's instincts — double progression, minimum-increment quanta, a
pain-free full-compliance gate, mirrored advance/seed treatment — are all
retained below. What changes is *what gets incremented* (the prescription
target, never the measurement) and *when* (every earned microcycle, not a rare
window event).

---

## 6. The answer: separate the measurement from the demand

### 6.1 The reframe

The question "on what basis do we trigger an increase to the e1RM?" contains
the trap. The e1RM is a **measurement**; a training program does not increase a
measurement, it increases the **ask**, and the measurement follows real
performance. The engine currently uses one number (the recency anchor) in two
roles:

- **capacity estimate** — what the athlete has demonstrated (trailing), and
- **prescription basis** — what the athlete is asked to do next (should lead).

Give the second role its own value:

```
A  = recency-weighted measured anchor            (unchanged, honest, trailing)
A* = A + δ   if the overload step is EARNED      (the prescription target)
   = A       otherwise
δ  = one progression quantum in e1RM space        (see 6.3)
```

and run the **entire existing §9.2 machinery on `A*` instead of `A`**. The
downstream invariants — internally consistent triple, window bounds, §S5
gate-holds, rounding — compose unchanged, because they are all expressed
relative to the anchor input and `A*` differs from `A` by at most one quantum.
(One deliberate carve-out: the R24b deadband applies only to un-earned weeks —
§7.1.)

### 6.2 Why this closes the loop without fabricating anything

The doc-11 premise ("the app prescribes a target RIR and trusts the user to hit
it honestly, so a logged weight × reps against a target RIR is itself an RIR
data point") is what makes this mechanically complete:

- **Perform the prescription** (priced off `A* = A + δ`) at the prescribed RIR
  → that set scores `e1RM ≈ A + δ` → the measured anchor rises to meet the
  target **because the athlete actually did the work**. Nothing was invented;
  the prescription led, the measurement followed.
- **Miss it honestly** (log the reps actually achieved) → the set scores ≈ `A`
  → the anchor holds (or falls, which the falling-anchor machinery already
  owns). Next session the target is *re-armed at `A + δ` off the measured
  anchor* — **never `previousTarget + δ`**. The lead never compounds
  unconfirmed. This single rule is the anti-runaway property the legacy
  increment path lacked: the prescription is permanently clamped to at most one
  quantum ahead of demonstrated capacity.

Worked continuation of §3.2 (measured anchor 198.2; quantum per §6.3:
δ = min(δ_w ≈ 6.8, δ_r ≈ 4.8) = 4.8 → `A* = 203.0`): week 2 reprices to
148.5, the 5 lb lattice snaps it up, and the prescription is **150 × 9 @ 2**
instead of 145 × 9 @ 2. Performed → measured e1RM 205.0 (the *realized* ask
was a full plate step, ~1.4×δ — see §6.3's realized-ask rule); the athlete
demonstrably got stronger, on prescription. One rep short → measured 200.0,
and the target re-arms off the *new* measurement — the ask stays one honest
step ahead. Meso N+1 week 1 (earned at meso close) seeds **150 × 8 @ 3** vs
meso N's 145 × 8 @ 3 — visible, real, meso-over-meso prescribed progress,
which is exactly the memo's stated goal.

Misses self-regulate the *ceiling*: an advanced athlete misses most attempts
and progresses at their true fraction of quanta, and misses are not failure
states — they are the rate-limiter working. But be honest about the
compliant-novice rate: one earned plate step is ~2.5–3.4% of e1RM, the earn is
per *session* (a lift trained twice a week banks two steps), so uncapped
perfect compliance implies ~20–27%/month — far above even doc 10 §5's
**beginner** strength band of 4–8%/*month* (intermediate 1.5–3, advanced
0.5–1.5). Two governors keep the ask inside the evidence (both in §6.4/§6.6):
the default **cadence of one earned step per exercise per microcycle**
(mirroring how the ramp steps weekly), and a **rate ceiling** that skips the
step when the trailing ~30-day prescribed gain exceeds the profile's doc-10
band — the ceiling is what bounds the checkbox-logging failure mode (§6.5),
so it ships in Phase 1, not as a later refinement.

### 6.3 The quantum δ

δ should be the **smallest honest step the exercise can express**, evaluated in
e1RM space at the current effective-rep count `E`:

- **weight-quantum:** `δ_w = rounding[equipment] × k(E)` — one loadable step
  (already per-user/per-exercise via the editable increment override,
  `effective-params.ts`). ≈ 2–3% on a typical compound.
- **rep-quantum:** `δ_r = w × (k(E+1) − k(E))` — one rep at the held load.
  ≈ 2.5–3.5% in the hypertrophy window.
- **recommended default: `min(δ_w, δ_r)`** as the *target* quantum — a 30 lb
  dumbbell curl with a 5 lb (16%) plate jump progresses by reps; a micro-loaded
  barbell progresses by weight. This is doc 10 §4's increments table ("smallest
  available increment", isolation lifts on microplates) done in anchor space.

**Be honest about what the lattice then does to it.** The existing machinery
(reprice → `roundToStep` → reps re-derived from the rounded weight) decides how
the bump *manifests*, and on most barbell loads it is NOT "+1 rep": in the
compliant steady state the base load sits exactly on the 5 lb lattice, δ_r in
weight space is ≈ w/41 (≈ 3.5 lb at 145), so above ~100 lb rounding snaps the
earned reprice up a **full plate step** — the realized ask is ≈ 0.4–1.4× δ
depending on where the lattice falls, and manifests as +1 rep at held load only
on lighter lifts. Both realizations are sane training quanta (classic double
progression and classic LP respectively), but the design must own the bounds
rather than pretend δ is delivered exactly. Hence a **realized-ask rule** in
the engine, applied after rounding:

- if the earned prescription is **byte-identical** to the unearned one (the
  quantum vanished — window hard cap, `bodyweight_only` rep ceiling, deadband
  corner), emit **no** `progression` trace and do **not** consume the earn —
  never claim an overload that isn't being asked;
- if the realized ask exceeds `max_pct_per_step` of the measured anchor (huge
  plate jump on a light lift), **skip** the step and hold today's behavior —
  the cap binds on the *realized* ask, where it can actually fire, not on the
  abstract δ (which for `min` mode is ≤ δ_r ≈ 3% by construction).

One related cleanup should ride along: doc 10 §8 specifies per-class increments
(lower compound 5, upper compound 2.5, isolation 1.25 lb, `decay_per_week`),
but the live `rounding` table is 5 lb for nearly everything. δ_w inherits
whatever `rounding[equipment]` (or the per-exercise override) says, so shipping
the finer specced steps — or at minimum documenting that the editable increment
override is how users get honest quanta on small lifts — keeps the overload ask
proportionate on isolation work.

### 6.4 The earned gate

The step is earned for the next session of an exercise when **all** of the
following hold for the previous session. The first row is a **new, explicit
all-sets predicate** over `actualSets` vs `previous` — no existing helper
delivers it (`assessPerformance` grades the *best* set and consults reported
RIR on that set only; `climb_on_performed_reps` feeds the climb, it compares
nothing to the prescription):

| condition | predicate | note |
|---|---|---|
| prescription fully performed | working (non-warmup) set count ≥ `previous.sets`, **and every** working set has `weight ≥ previous.weight`, `reps ≥ previous.reps`, and `rirReported == null OR rirReported ≥ targetRir − rir_tolerance` | "all prescribed sets and reps" — the memo's own gate, including a back-off-set and a ground-to-failure guard |
| no pain gate | `!painGated` (`pain_gate`; `pain_cut_gate` a fortiori) | memo: "without reporting pain" |
| no session dampener | `!sessionDampened` | rough sessions don't earn |
| workload not hot | `exerciseFeedback.workload < workload_high` and no pain/workload-driven set cut this session | never cut the dose and raise the potency off the same feedback |
| not a deload week (either side) | `week.isDeload` / previous week | deloads neither earn nor take steps |
| not stale | caller-supplied `daysSincePreviousSession ≤ progression.max_gap_days` | after a layoff, first reproduce the old anchor (the session-best anchor's *value* does not decay — only its session ranking shifts — so a stale `A + δ` would be a PR ask on a detrained athlete) |
| anchor confident | `anchor.confidence ≥ progression.min_confidence` (**`moderate`**\*) | never lead a shaky measurement |
| goal opted in | `progression.goals` — default **on** for `hypertrophy`/`gain`/`strength`, **off** for `cut`/`maintain` | preserves the R24b "cut/maintain hold honestly" resolution |
| cadence + rate + throttle | §6.6 (derived lookback input) | one step per microcycle; trailing-rate ceiling; miss throttle |

\* The floor must be `moderate`, and this is load-bearing: confidence is keyed
on **effective** reps (`predict.ts:78-92` — `high` needs eff ≤ 8 AND rir ≤ 2),
and the Option-A invariant pins compliant hypertrophy sets at eff ≈ 11 all
meso, so a compliant hypertrophy session can **never** score `high` — a `high`
floor would leave the feature provably inert for the flagship goal (the
strength window, at eff 3–6, is unaffected). `moderate` (eff ≤ 12, rir ≤ 3) is
satisfiable every compliant week in both windows. The §7.4 goldens must assert
the gate actually arms at the shipped defaults, per goal.

When not earned, `A* = A` and behavior is byte-identical to today — including
every hold, gate, and deadband path.

### 6.5 What explicitly does NOT change

- **The measured e1RM pipeline** (`estimateE1rm`, `recencyWeightedE1rm`, stats
  views, PRs, MCP analytics): untouched. No stored e1RM is ever bumped.
- **The honesty guardrails (doc 10 §9):** strengthened, if anything — the
  rationale/trace discloses the lead explicitly (below), and every e1RM shown
  anywhere remains performance-derived.
- **The trust model's *premise*** — the system keeps trusting logged reps at
  the prescribed RIR (doc 11). But be precise about what the design changes in
  the *consequences* of a broken premise, because the change is real and
  asymmetric. **Today, dishonest checkbox-logging is harmless to the record:**
  tapping "done as prescribed" reproduces the anchor to the pound forever —
  §3's fixed point makes fake compliance drift-free. **Under this design it
  compounds:** each fake "compliant" session scores `A + δ`, `session_best`
  snaps the anchor to the newest best session immediately, the step re-arms
  off the new measurement, and the ask runs away at roughly a plate step per
  earn with no natural ceiling. A milder version hits the honest grinder who
  never reports RIR: completing asks by silently grinding to true failure
  while the record assumes the target RIR parks the prescription a few quanta
  above true capacity, labeled "2 RIR" (a doc 10 §9 violation). This is why
  three governors are **part of the v1 design, not refinements**: the
  trailing-rate ceiling bound to the doc-10 §5 band (§6.6 — it converts
  unbounded runaway into at-worst the fastest evidenced human rate), the
  workload gate (§6.4 — grinding shows up as a hot workload slider), and the
  full-compliance predicate honoring any *reported* RIR. An optional fourth is
  listed in §10: requiring one non-null `rirReported` (or a `beat`) every k-th
  consecutive earned step, re-grounding the loop with a single honest data
  point.

### 6.6 The derived lookback input (cadence, rate ceiling, miss throttle)

Three governors need a small window of *progression history* that `previous` +
`actualSets` cannot carry. It arrives exactly the way the strength anchor does:
a **caller-computed derived input**, assembled from recent `engine_decisions`
for the user × exercise (pure engine, no I/O; excluded from the doc-14
fingerprint like every derived input):

```
progressionHistory: {
  earnedThisMicrocycle: boolean,   // cadence: default one step per exercise per week
  trailing30dPrescribedGainPct: number | null,  // rate ceiling vs doc 10 §5 band
  consecutiveMissedEarns: number,  // throttle: 2+ earned-then-missed cycles ⇒
}                                  //   require 2 compliant sessions to re-arm
```

- **Cadence (default: one step per exercise per microcycle).** The advance
  chain runs per completed workout, so a lift trained twice a week would bank
  two steps a week; keying the earn to the microcycle mirrors how the RIR ramp
  itself steps, and keeps multi-frequency programming from doubling the rate.
- **Rate ceiling (ships in Phase 1).** Skip the step when the trailing ~30-day
  *prescribed* gain exceeds the top of the profile's `strength_pct_month` band
  (`macro_target` params — beginner 4–8%/mo, intermediate 1.5–3, advanced
  0.5–1.5; `macro.ts` already computes the personalization, nothing consumes
  it per-session today). This is the honesty backstop for §6.5, and
  incidentally the first real connection between the macrocycle goal layer and
  session prescriptions.
- **Miss throttle.** A plateaued athlete would otherwise oscillate
  earn → miss → earn indefinitely — a max-effort attempt one quantum above
  capacity every re-arm, at 0–1 RIR in late-meso weeks (in the strength window
  that is a failed near-5RM, a safety event, not just fatigue). Every serious
  autoregulated methodology spaces repeated failed attempts; after ≥ 2
  consecutive earned-then-missed cycles, require 2 fully compliant sessions
  before re-arming.

---

## 7. Mechanism design (recommended implementation shape)

### 7.1 Engine

- New pure rule module `src/lib/engine/rules/progression.ts`:
  `assessOverloadStep(inputs, params) → { earned: boolean; delta: number; detail: string }`.
  Implements the §6.4 all-sets predicate itself (nothing existing does), and
  consumes `previous`, `actualSets`, `exerciseFeedback`/`workoutFeedback` (via
  `modulateFromFeedback`), `strengthAnchor`, `week`, `goalType`, the new
  `progressionHistory` derived input (§6.6), and the `progression` params
  block. No I/O, no clock, no randomness (hard rule 3) — `daysSince…`/history
  come from the caller like `ageDays` does today.
- `prescribe()` (`index.ts`): immediately after the anchor-confidence check,
  compute `A* = anchor.value + (earned ? delta : 0)` and thread `A*` through
  the existing rep-window path (the §9.2 climb, `boundRepsToWindow`, §S5
  gate-hold all take the same substituted value). Two composition rules: the
  **R24b deadband is evaluated only when not earned** (its job is absorbing
  decay on a hold; an earned week *intends* an increase, and letting it fire
  produced the one corner where a step could be silently eaten while the trace
  claimed an overload), and the **realized-ask rule (§6.3) runs after
  rounding** — no `progression` trace unless the final prescription actually
  differs. When it does, the trace gains a step: `{ rule: "progression",
  detail: "earned overload: targeting e1RM 203.0 (measured 198.2 + 4.8);
  previous session met in full, no pain" }` — P0-4 keeps rationale and trace
  in lockstep for free, and an earned session must never emit both an
  "earned overload" and a "holding" rule for the same load.
- `seedMeso()`: accept an `earned` (or precomputed `targetAnchor`) member on
  `opts` alongside `opts.anchor` — the caller derives it from the prior meso's
  final working session exactly as the advance chain does. Mirrors the memo's
  requirement that the seed inherit the progression effect when the trigger is
  met "at the end of a mesocycle, when there is no advance to compute."
  Caller plumbing is the known set of sites: meso activation
  (`queries/generation.ts:117`), week-over-week generation
  (`queries/progression.ts:312`, replay `:1212`), swap-ins
  (`queries/slot-prescription.ts:178`), and the freshness-recompute path
  (`queries/regeneration.ts`).
- `prescribeBodyweight()`: same `A*` substitution in effective-load space;
  loadable/assisted manifest through the effective-load window;
  `bodyweight_only` manifests as reps — **until the window's hard rep cap**,
  where the quantum has nowhere to go (reps clamp to `win.max`, there is no
  load axis and no reset). The §6.3 realized-ask rule handles the mechanics
  (no false "earned" trace, earn not consumed), but the *product* answer is a
  substitution nudge: at the `bodyweight_only` cap, surface "add load /
  progress to the loadable variation" in the rationale instead of an overload
  claim.
- **Grading and UI prediction stay on the measured anchor** (`gradeOnRir`,
  `impliedRirAtReps` hints): honesty lives on `A`. The implied-RIR drift a
  one-quantum lead introduces is ≤ ~1 RIR (inside `rir_tolerance`); if it
  bothers in practice, feed the decision's stored `A*` to the day-view
  predictor — a display choice, not an engine one.

### 7.2 Params (all in one gated block; absent ⇒ today, no fingerprint churn)

```jsonc
"progression": {
  "mode": "earned_step",            // absent/off = current behavior
  "step": "min",                    // "min" | "increment" | "rep" (target quantum, §6.3)
  "min_confidence": "moderate",     // "high" is provably inert for hypertrophy (§6.4)
  "goals": { "hypertrophy": true, "gain": true, "strength": true,
             "cut": false, "maintain": false },
  "cadence": "microcycle",          // "microcycle" | "session" (§6.6)
  "rate_ceiling": "macro_band",     // skip when trailing 30d prescribed gain
                                    //   exceeds strength_pct_month[bucket] top (§6.6)
  "miss_rearm_sessions": 2,         // after ≥2 earned-then-missed cycles (§6.6)
  "max_gap_days": 10,               // staleness gate (§6.4)
  "peak_week": "skip",              // no step at targetRir 0 (see §9)
  "max_pct_per_step": 0.05          // ceiling on the REALIZED ask / A (§6.3)
}
```

`max_pct_per_step` binds on the realized (post-rounding) ask — with
`step: "min"` the abstract δ is ≤ δ_r ≈ 3% by construction, so a cap on δ
itself could never fire; the realized ask is where a coarse plate jump can
overshoot. Ship as engine_params **v20** (append-only migration), inactive;
activate after a replay diff per `docs/deployment/manual-operations.md`.

### 7.3 Doc 14 (freshness) compliance — one derived input, no new machinery

- The earned gate derives from `previous` (config side of the projection) and
  `actualSets`/feedback (derived side) — both already `EngineInputs`, so the
  denylist projection is untouched and write/check parity holds.
- The `progression` block rides `paramsToken`: activation moves every open
  fingerprint at once, which is the intended v-bump semantics.
- The seed's `earned`/`targetAnchor` opt is a **derived** input like
  `opts.anchor` (recomputed from history on the read path, excluded from the
  fingerprint per doc 14 §3) — same contract, same tests.
- `progressionHistory` (§6.6) is likewise a **derived** input: caller-computed
  from recent `engine_decisions`, recomputed on the read path, excluded from
  the fingerprint. This is the one honest cost over the original sketch — the
  cadence/ceiling/throttle governors cannot be derived from `previous` +
  `actualSets` alone. Still no schema change: decisions already persist
  everything the lookback needs.
- Future per-user × exercise override "progression off for this lift" slots
  into the existing `ExerciseParamOverride` merge (doc 14 §6.1) when wanted.

### 7.4 Tests (hard rule 3)

- **The treadmill golden test** — the memo, encoded: simulate M mesos of
  perfect compliance; assert measured e1RM flat and week-1 prescriptions
  identical with the block absent; assert one earned step per microcycle and
  rising meso-over-meso seeds with it active. This pins the defect *and* the
  fix.
- **The gate arms at the shipped defaults, per goal** — under simulated
  perfect compliance the step must actually fire for hypertrophy AND strength
  at the default `min_confidence`. This is the test that would have caught the
  inert-`high` blocker: the treadmill test alone passes with the block
  active-but-dead.
- **No-compounding test:** consecutive misses ⇒ target re-arms at `A + δ`, not
  `A + kδ`; **miss throttle:** ≥ 2 earned-then-missed cycles ⇒ 2 compliant
  sessions required to re-arm.
- **Trace consistency:** an earned session never emits both an "earned
  overload" and a "holding"/deadband rule for the same load; a vanished
  realized ask emits no `progression` rule at all.
- **Realized-ask bounds:** lattice-snap overshoot stays ≤ `max_pct_per_step`;
  the `bodyweight_only` window-cap case earns nothing and claims nothing.
- Gate matrix (pain / dampener / workload-hot / deload / stale gap / low
  confidence / cut-maintain / partial sets / short sets / back-off set /
  low-RIR-reported set ⇒ no step, byte-identical to today); seed-route parity
  with advance-route; replay determinism on historical decisions (absent block
  ⇒ unchanged outputs).

### 7.5 Phasing

1. **Phase 1 — advance chain** (`prescribe()` + params + `progressionHistory`
   plumbing + tests): in-meso prescribed progression **including the rate
   ceiling, cadence, and miss throttle** — the governors are what make the
   feature honest, so they are not separable from it. Smallest slice that
   kills the fixed point safely.
2. **Phase 2 — seed route** (`seedMeso` + caller plumbing): meso-over-meso
   carry, the memo's second half.
3. **Phase 3 (optional) — deeper macro coupling:** the Phase-1 ceiling already
   reads the `strength_pct_month` band; a fuller coupling (per-user measured
   rate feeding the band, macro-goal-aware quanta) should wait for N21's
   macro-target correction and for field evidence that the simple ceiling is
   the binding constraint.

---

## 8. Alternatives considered and rejected

| alternative | why not |
|---|---|
| **Bump the stored anchor/e1RM on a trigger** (memo's literal ask) | Fabricates a measurement (T-I5, doc 10 §9); compounds unverified; corrupts stats/PRs/MCP analytics that share the e1RM definition. |
| **Rep-space-only fix** (make the climb net +1 including hold weeks; seed inherits reps) | A genuine subset of the recommendation, but: quantum locked to ~3% (no microload path), reintroduces the R24a hold-week wobble it took v19 to remove, seed inheritance still fights the ramp reset (§5.1), and strength-window (3–5 reps) progression wants weight-first. `A* = A + δ` subsumes it cleanly. |
| **Scheduled linear %** (e.g. +1%/week program-side, engine follows) | Reintroduces the retired fabricated-progression path with a percent sign; ignores demonstrated performance; compounds while the athlete stalls. |
| **AMRAP / calibration sets** (periodic max-rep set re-measures the anchor) | Improves *measurement*, not *demand* — the fixed point survives (a compliant athlete AMRAPs exactly the predicted reps). Worth considering later as an anchor-confidence booster (relates PR22's "catch the high-water mark"), orthogonal to this design. |
| **UI-only nudges** ("try one more rep" prompts without engine backing) | Restates the status quo — progression still depends on athlete initiative; prescriptions and rationale would contradict the nudge. |
| **Do nothing** (position the app as mirror-only) | Contradicts doc 01's premise (the engine prescribes progression), doc 10 §4, and the memo's explicit product intent. |

---

## 9. Interactions reviewed

- **RIR ramp / hold weeks (R24a/R24b):** compose, with one explicit rule. Not
  earned ⇒ identical inputs, identical behavior. Earned ⇒ the reprice rises by
  δ/k(E) — which for the rep-quantum is *sub-step* (~3.5 lb on a 145 lb bar),
  so the R24b deadband could swallow it in a corner where reported low RIRs
  drag the session-mean anchor down; hence §7.1's rule that the deadband is
  evaluated only on un-earned weeks (its job is absorbing decay on a hold, and
  an earned week intends an increase). The step is otherwise *independent* of
  ramp position — stepped, held, and flat (cut/maintain-style) ramps alike
  when the goal opts in, because it is priced in e1RM space, not rep space.
- **Pain gate / session dampener (§S5):** already cap any increase at the last
  handled load (`index.ts:371-372, 421-423`) — a gated week both fails to earn
  *and* cannot express a step. Two independent locks, correct order.
- **Deload:** short-circuits before the working path (`index.ts:112-183`);
  deload weeks neither earn nor receive steps; the post-deload week's "previous
  session" is the deload ⇒ not earned ⇒ meso re-entry is measured, then the
  seed (phase 2) carries the earned state across the boundary instead.
- **Peak week (0 RIR):** an earned step at 0 RIR asks for a genuine rep/load
  PR. Recommended default: **skip** (`progression.peak_week: "skip"`). Doc 10
  frames 0 RIR as "a peak-week ceiling, not the routine target," the fatigue
  budget (Refalo: −25% velocity loss at failure) is already spent by the ramp,
  and in the strength window a failed +5 lb near-5RM attempt is a safety
  event. The owner can flip it to "take the PR attempt" per goal if the peak
  week should be exactly that.
- **Swaps / cold starts:** no previous-session compliance context ⇒ not earned
  ⇒ seed off measured anchor exactly as today (`seed_anchor` branch unchanged).
- **Live in-session data (N3, resolved PR #78):** already handled — the anchor
  query reads completed workouts only (`anchors.ts:105-111`), and the advance
  chain runs at workout completion. The earned assessment naturally evaluates
  at the same boundary; no mid-session interaction exists.
- **Stats / views / MCP:** untouched — they consume measured e1RM. The
  decision record gains the `progression` trace rule; `explain_prescription` /
  `replay_decisions` surface it for free; `simulate_prescriptions` becomes the
  natural owner-facing preview for the v20 activation replay diff.
- **Prescription provenance:** `engine_decisions.kind` stays `seed | advance`
  (migration `20260620000005`; the N33/PR #147 rule derives swap kinds from
  data) — the overload step is not a new kind, it is a trace rule *within*
  either kind, so recompute/replay dispatch is untouched and
  progression-led rows remain identifiable per decision.

## 10. Open questions for the owner

1. **Default δ mode** — recommend `min(weight, rep)` sized as the target with
   the §6.3 realized-ask rule owning the lattice; the simpler alternative is
   `increment`-only with the editable per-exercise increment as the single
   size lever (then the doc 10 §8 finer per-class steps matter more).
2. **Cut/maintain** — recommend default-off (hold strength honestly, per the
   R24 discussion); opt-in per goal is one param flip.
3. **Confidence floor** — must open at `moderate`: `high` is provably inert
   for hypertrophy (compliant sets are pinned at ~11 effective reps, §6.4).
   Confirm, or ask for a separate earn-gate confidence decoupled from the
   e1RM display bands.
4. **Cadence** — recommend one step per exercise per microcycle (§6.6);
   `session` cadence exists for aggressive novice programming but multiplies
   by training frequency.
5. **Peak-week steps** — recommend skip at `targetRir 0` (§9); flip per goal
   if the peak week should be the PR attempt.
6. **Periodic honest-RIR confirmation** — optionally require one non-null
   `rirReported` (or a `beat` outcome) every k-th consecutive earned step
   (§6.5). Adopt now, or rely on the rate ceiling + workload gate and revisit
   with field data?

---

## Appendix — memo claims, one-line verdicts

| memo claim | verdict |
|---|---|
| "the model itself would never proactively prescribe a genuine progression of the e1RM" | **Confirmed, exact** (§3: shared forward/inverse curve + RIR-neutral climb + anchor-repriced seed). |
| "progression must come from the athlete over-performing… raising the anchor by their own performance" | **Confirmed** — `beat` outcome / lower reported RIR are the only anchor-raising routes (`rules/performance.ts:69`, `reps.ts:89-104`). |
| seed plan "defective — inheriting same weight × reps disregards RIR" | **Confirmed** (§5.1) — also collides with the ramp reset. |
| "unless additional reps are prescribed continually… the user would never hit the target 12 reps" | **Confirmed** (§3.2) — 5-step window vs 3-step ramp-locked climb; seeds reset to `target_low`. |
| "prescribing the additional reps itself would be an increase to the e1RM" | **Confirmed and load-bearing** (§6.2) — under the doc-11 premise the prescription *is* the future data point; that is the mechanism, done on the target rather than the record. |
| "reaching the top of the rep range simply triggers the weight increment… not e1RM" | **Confirmed** (§5.3) — the window reset is presentation at constant anchor. |
| open question: "on what basis do we trigger an increase to the e1RM?" | **Reframed** (§6): never trigger the measurement; lead the demand by one earned quantum (`A* = A + δ`) and let performance confirm it. Basis = full compliance on every set, no pain, no dampener, workload not hot, fresh (no layoff), confident anchor, goal opted in, once per microcycle, under the profile's evidenced monthly rate ceiling. |
