# Follow-up 3 — prescribed progression: earn-retention semantics, live-row coupling, markers, finalization

**Date:** 2026-07-09
**Source:** owner follow-up #3 to the N35 thread
([review](./2026-07-07-prescribed-progression-review.md) →
[follow-up 1](./2026-07-08-prescribed-progression-followup.md) →
[follow-up 2](./2026-07-09-prescribed-progression-followup-2.md)). Four
threads: (1) what "earn retained" means for a vanished step — does the
earned value accumulate until a coarse increment becomes reachable?
(2) confirmation that prescriptions flow through to the prefilled day-view
rows; (3) the live weight/rep coupling must track the *prescribed target*
(including the progression lead), and the earn must be evaluated against the
prescribed **outcome**, not the literal weight × reps pair; (4) unify the
▲/▼ markers with the progression model and add a "met" state. Plus the
directive: finalize the design into a comprehensive implementation plan.
**Status:** all four answered. **Thread 1 corrects the owner's assumption**
(§2 — earns retry, they do not stack; the measured anchor is the
accumulator), exactly the pre-implementation discussion the follow-up asked
for. Threads 3–4 are adopted as owner rulings and amend the design (§3–§4:
the earn predicate moves to e1RM space and shares one comparison with the
markers; the live predictor prices off the prescription's target anchor).
The finalized design + implementation plan ships alongside this doc as
**[`docs/16-prescribed-progression.md`](../16-prescribed-progression.md)**,
which consolidates the memo, the review, and follow-ups 1–3 and is now the
**authoritative build spec** — the review-thread docs remain the rationale
record. No code changes in this PR.
**Relates to:** N35, T-I5, doc 10 §4/§8, doc 11 (RIR premise), doc 13 §9.2,
doc 14, P19/N11 (marker), hard rule 8 (mockup fidelity).

---

## 1. Summary

1. **"Earn retained" means the entitlement is retried, never stacked — the
   owner's accumulation assumption is NOT the intended behavior, and
   deliberately so** (§2). The prescription target is permanently clamped to
   `A + δ`: one quantum ahead of *measured* capacity, re-armed off the
   anchor every session. Accumulating unconsumed earns (`A + 2δ, A + 3δ…`)
   is precisely the compounding-unconfirmed-credit failure the no-compounding
   rule exists to forbid. The coarse-increment worry is real but is answered
   by a different mechanism: **the measured anchor is the accumulator.**
   Quanta on coarse lifts realize on the rep axis (that is what
   `step: "min"` selects), each performed quantum banks permanently in the
   anchor, and the accumulated rep-space gains convert into the load step via
   the top-of-window reset — classic double progression, which this design
   finally makes reachable. The residual true dead-ends (window cap + a
   plate jump over `max_pct_per_step`; the `bodyweight_only` rep ceiling)
   are equipment/product problems where accumulated credit would produce
   exactly the wrong outcome — a multi-quantum leap demanded all at once.
2. **Prescriptions flow through to the prefilled rows automatically** (§3.1)
   — the day view renders the stored prescription (generation writes it,
   `logging.ts` reads it); `A*` changes what is written, nothing about the
   display path. Confirmed, nothing to build.
3. **The live coupling ruling is adopted, and it flips one deferred choice**
   (§3.2): the day view's live rep re-derivation currently prices off the
   *measured* anchor (`we.e1rm_anchor`, `logging.ts:335` →
   `predictRepsAtWeight`, `DayView.tsx:1339-1345`), which on an earned week
   would disagree with the `A*`-priced prescription by one quantum. Review
   §7.1 called that drift tolerable; the owner's ruling makes it a
   requirement instead: **the live predictor reads the prescription's stored
   target anchor** (measured anchor when no lead), same shared curve, so the
   live fields and the prescription cannot disagree.
4. **The earn is evaluated against the prescribed outcome, in e1RM space —
   and this unifies the gate with the markers into one comparison** (§4).
   The review's literal per-set predicate (`weight ≥ ∧ reps ≥`) breaks under
   athlete-owned weight changes (raise the weight, perform the re-derived
   reps, hit the same target — literal predicate fails). Amended: a working
   set complies when its logged e1RM (reported-RIR-aware, effective loads)
   is not *under* its prescribed set's e1RM — which is exactly the P19
   marker comparison (`day-rules.ts:108-148`), band and all. The marker
   gains the owner's third state (**over / met / under**), and "every
   working set ≥ met" becomes the earn gate's compliance row. One
   comparison, three consumers: marker, gate, grading — they cannot
   diverge.
5. **Finalization:** the architectural questions are settled; doc 16
   consolidates the final design and the phased implementation plan
   (engine → seed → day-view coupling/markers → audit surface, with the v20
   rollout checklist). Build begins in new sessions per its phases.

---

## 2. Vanished earns: retry, don't stack — the anchor is the accumulator

### 2.1 The intended semantics, stated unambiguously

When an earned step's realized ask vanishes (the post-rounding prescription
is byte-identical), "earn retained" means: **the entitlement is not consumed
by the no-op.** Next session, provided the gates still pass, the target
re-arms at `A + δ` — *one* quantum above the current measured anchor —
again. It is a retry of the same single-quantum lead, not a deposit into a
progression account. There is never a state where the prescription target
sits more than one quantum above demonstrated capacity, no matter how many
earns vanished before it.

This is the load-bearing anti-runaway property (review §6.2): every quantum
must be **performed** before the next can stack on it, because "stacking"
happens only through the measured anchor rising. Accumulating unconfirmed
earns would break it in the worst place — a lift whose increments are too
coarse to express one quantum would bank credit until the system demanded a
multi-quantum jump *all at once*, on the lift least able to absorb it, at
whatever RIR the week happens to sit at. A 15 lb curl with a 5 lb next
plate (a ~33% jump) does not become a sane ask after six banked earns; it
becomes a shoulder injury with an audit trail. `max_pct_per_step` exists to
refuse exactly that ask, and accumulation would exist to eventually insist
on it. The two cannot both be in the design; the cap is the one that stays.

### 2.2 Why coarse increments don't need accumulation

The concern behind the assumption — "coarse-increment lifts may need
multiple earned events before a prescription increase is expressible" — is
correct in weight space and already solved in rep space:

- **`step: "min"` picks the expressible axis.** δ = min(δ_w, δ_r): on a
  micro-loadable barbell the weight quantum is smallest; on the coarse lift
  the *rep* quantum (~2.5–3.5%) is, and one rep at held load is expressible
  everywhere below the window cap. The realized ask on coarse lifts is
  "+1 rep at the same load" — no waiting, no credit.
- **Each performed quantum banks permanently in the measured anchor.** The
  athlete performs `A + δ` → the anchor rises to ≈ `A + δ` → the next earn
  arms at `(A + δ) + δ`. Accumulation is real, continuous, and *confirmed* —
  it lives in the measurement, which is the only place T-I5 allows it.
- **The top-of-window reset converts banked rep gains into the load step.**
  Climb reps quantum by quantum to `target_high`; the §9.2 reset then adds
  one increment and reprices to the window bottom (doc 10 §4's classic
  ratchet). Note this design is what makes that reset *reachable at all*:
  today the ramp-locked climb can never out-run the ramp (review §3.2 —
  reps peak at 11 in a 12-top window), whereas earned rep-quanta advance the
  prescribed reps independently of ramp steps, so a compliant athlete now
  actually tops the window and the ratchet finally fires. The memo's
  original "climb reps, then increment the weight" intuition is realized —
  with the anchor, not a counter, carrying the accumulated state.

So on the lifts the owner is worried about, the sequence is: rep quanta
realize immediately → anchor accumulates them → window tops → weight
ratchets. The vanish corners are *not* on that path.

### 2.3 The true dead-ends are product problems, and credit wouldn't fix them

Where the quantum genuinely has nowhere to go — prescribed reps pinned at
the window's hard `max` **and** the next plate jump exceeds
`max_pct_per_step` (very light dumbbell work), or the `bodyweight_only` rep
ceiling (no load axis at all) — no accounting scheme produces a sane ask,
because the missing thing is *equipment resolution*, not permission:

- the **per-exercise editable increment override** is the honest fix
  (microplates / 2.5 lb dumbbells), and shipping doc 10 §8's finer
  per-class increments makes it the default rather than a user fix;
- the **substitution nudge** (follow-up 1 / review §7.1) is the
  `bodyweight_only` answer: at the cap, the rationale recommends adding
  load or progressing to the loadable variation instead of claiming an
  overload;
- meanwhile the athlete holds at the cap with an honest trace
  (`vanished`, earn retained) — parked, visible, and audit-queryable
  (`vanished` frequency per exercise is listed in follow-up 2 §2.3 as the
  increment-sizing signal for exactly this reason).

**Resolution:** the assumption is corrected, per the owner's own
"worth discussing before implementation" branch — semantics locked as
retry-not-stack in doc 16, with a golden asserting a vanished earn re-arms
at `A + δ` (not `A + kδ`) and never consumes the earn.

---

## 3. The prescription → live-row contract

### 3.1 Prefill flow-through: confirmed, automatic

The prescription and progression models need no extra wiring to reach the
prefilled rows: the engine's outputs are *written* as the stored
prescription (per-set planned weights + prescribed reps) by the
generation/advance/seed paths, and the day view *renders* the stored
prescription (`logging.ts` day read → `plannedWeight ?? prescribedWeight`,
predicted reps per row). `A*` changes what those paths write; the display
inherits it the way it inherited every prior engine change. Stated
explicitly in doc 16 so it's testable (the Phase-3 e2e drives an earned
prescription through to the rendered row), but there is nothing to build
here.

### 3.2 Live coupling: the day view prices off the prescription's target anchor (amendment)

The owner's description of today's behavior is accurate: the live
weight ⇄ reps linkage mirrors the prescription math by construction — one
shared curve (`predictRepsAtWeight` / `weightForRepsAtRir` invert the same
`e1rmFactor`, review §3.1), consumed by both the engine and the day view.
The premise "prescription defines the targeted effort; the athlete owns the
selected weight; reps re-derive to stay faithful to the target" is doc 11
verbatim, and it is preserved.

The one seam the progression design opens: the day view's predictor
currently reads the **measured** anchor (`we.e1rm_anchor`,
`src/lib/queries/logging.ts:335`, threaded to
`predictRepsAtWeight(anchor, …)` at `DayView.tsx:1339-1345`). On an earned
week the prescription is priced off `A* = A + δ`, so an athlete who edits
the weight would get reps re-derived against a target one quantum *behind*
the prescription — the two systems would disagree by ~1 rep in exactly the
week the design asks for more. Review §7.1 deferred this as a tolerable
display drift; the owner's ruling ("the live fields should remain coupled
to the underlying prescription… ideally the prescription engine and the
live calculation engine continue to share the same underlying logic so they
cannot diverge") settles it the other way:

- the day read carries the exercise's **prescription-basis anchor** — the
  target anchor recorded in the decision that priced this workout's
  prescription (`A*` when the step was taken, `A` otherwise) — and the live
  predictor uses it;
- the *measured* anchor remains what it always was everywhere else: stats,
  PRs, anchor sampling, confidence, grading inputs. Nothing about the
  measurement pipeline changes; this is one input swap in one read path,
  and the shared-curve discipline already guarantees the rest.
- fallback: rows with no decision-recorded target (pre-v20 history,
  cold starts) use the measured anchor — today's behavior.

### 3.3 The earn is judged against the prescribed outcome (predicate amendment)

The same ruling exposes a genuine defect in the review's §6.4 compliance
row: "every working set has `weight ≥ previous.weight` and
`reps ≥ previous.reps`" is a *literal-pair* comparison. An athlete who
exercises their doc-11 ownership — bumps the bar 5 lb, performs the
re-derived reps, lands exactly on the prescribed e1RM target — would fail
the literal predicate on reps and lose an earned step for complying in
spirit. Inverted (drop 5 lb, +1 re-derived rep): same failure on weight.
The prescription's `weight × reps` pair is one *realization* of the target,
not the target itself.

Amended predicate: **a working set complies when it is not *under* its
prescribed set in e1RM space** — logged effective load × reps at
(reported RIR ?? target RIR) scores within or above the band around the
prescribed set's e1RM. This is precisely the P19 marker comparison
(`loggedSetMarker`, `src/app/(app)/log/[workoutId]/day-rules.ts:108-148`,
including the N11 equal-RIR rule and the bodyweight effective-load
resolution), reused as the gate's per-set row. Two properties fall out:

- **the grinder guard becomes intrinsic** — a set honestly reported at an
  RIR below target scores *fewer* effective reps, so its e1RM lands under
  the prescribed set's and the set fails compliance without a separate
  `rirReported ≥ targetRir − tolerance` clause;
- **back-off sets are judged fairly** — a deliberately lighter set that
  still meets its prescribed e1RM (more reps) complies; one that doesn't,
  doesn't. No special-casing.

The session-level earn is unchanged in shape: working-set count ≥
prescribed, every working set not-under, plus all the non-compliance gates
(pain, dampener, workload, deload, staleness, confidence, goal factor,
governors).

---

## 4. Markers: one comparison, three states, three consumers

Adopted. The marker and the earn gate become the same pure comparison with
three outcomes:

- **over** — set e1RM above the band top (today's ▲): beat the ask;
- **met** — within the band (today's *null*, rendered invisibly): the ask
  was delivered — under the progression model this is a *positive* state
  (it is what earning looks like), and the owner is right that it deserves
  a glyph rather than absence;
- **under** — below the band (today's ▼): the ask was missed.

Mechanics: `loggedSetMarker` returns the three-state value (`"met"` instead
of `null` for the in-band case; null stays reserved for "can't compare");
the band constant moves from a module-local (`MARKER_BAND = 0.015`,
`day-rules.ts:90`) into `engine_params` so the marker, the earn gate, and
grading all read one tunable — the "cannot diverge" requirement made
structural. Per-set markers then *are* the earn gate's compliance row made
visible: an exercise whose working sets all show met/over is compliant, and
whether that became an earned step (gates, cadence, pacer) is disclosed by
the prescription's progression trace — surfaced through the existing
rationale/audit affordances rather than a new indicator, so the display
stays uncomplicated (the owner's constraint).

Two build notes: the ▲/▼ treatment is a mockup-governed surface — the
"met" glyph and any completion-time "progression earned" treatment need a
`docs/09-design-changelog.md` entry and the hard-rule-8 mockup transcription
pass at build time, not improvisation; and the three-state change touches
the P19 tests (`day-rules.test.ts`) plus a fixture asserting
marker ⇄ earn-gate agreement on the same inputs (one comparison, asserted
once).

---

## 5. Finalization

With §2's semantics locked and §3–4 adopted, the architectural surface is
settled. The consolidated, authoritative build spec — original memo intent,
the review's mechanism, and every follow-up amendment (macro-rate pacing +
`band_position`, per-goal rate factors, always-on status-coded trace,
envelope as Phase 3, e1RM-space compliance, target-anchor live coupling,
three-state markers, retry-not-stack) — ships alongside this doc as
**[`docs/16-prescribed-progression.md`](../16-prescribed-progression.md)**,
including the phased implementation plan (engine core → seed route →
day-view coupling & markers → audit surface), the v20 params block, the
test matrix, the doc-14 treatment, and the activation runbook. The review
thread (07-07 → this doc) remains the rationale record; where any of it
conflicts with doc 16, **doc 16 wins.** Implementation proceeds in new
sessions, one phase per PR, per the plan's sequencing.
