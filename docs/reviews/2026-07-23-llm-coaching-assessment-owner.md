# Assessment of the LLM Coaching and Decision-Explanation Layer

> **Provenance.** Owner-provided review document, handed over 2026-07-23
> ("LLM_Coaching_Assessment_Reviewed.md"), preserved verbatim below. It reviews
> the live v2 output of the doc-18 explanation pipeline (N58, PRs #195–#197)
> against real generations (Hack Squat, Bench Press) and proposes the
> deterministic-facts → triggered-LLM architecture. The owner flagged that the
> document "is not perfect" and contains nuances they don't entirely agree
> with; the reconciled, authoritative build spec is
> [`docs/19-prescription-explanation-v3.md`](../19-prescription-explanation-v3.md)
> — where this document and doc 19 conflict, **doc 19 wins**.



## Executive assessment

The basic prescription output should be deterministic - e.g. "4 sets of 12 at 90 lb". The LLM role should be narrower:

1. Translate the prescription into plain language.
2. Explain the relevant bigger-picture reason.
3. Connect reliable historical context to the current exercise.
4. Surface one useful consideration when the data supports it.
5. Remain silent when it has nothing meaningful to add.

The ideal character is not a virtual personal trainer. It is a knowledgeable training analyst: observant, concise, practical, and appropriately restrained.

The current implementation gives the LLM too much raw decision machinery and asks it to turn that machinery into prose. This leads it to narrate implementation details, mix incompatible metrics, overstate uncertain observations, and manufacture coaching relevance from whatever data happens to be present.

The better architecture is:

Deterministic prescription → deterministic explanation facts → optional LLM coaching insight

The LLM should receive an already-curated semantic summary rather than the raw engine trace.

## Problems in the current output

### 1. Internal terminology is leaking into the user experience

The latest Hack Squat explanation uses terms such as:

- “rate pacer”
- “paced decisions”
- “measured strength”
- “target”
- “earned an increase”
- “trailing prescribed gain”

These are useful for debugging and auditing the engine, but they do not communicate clearly to a normal user.

“Earned an increase” is also ambiguous. The load did not increase, but repetitions increased from 10 to 11 and the target moved from 1 RIR to 0 RIR. The prescription became harder, even though the weight stayed fixed.

A clearer explanation would be:

> You completed all three sets at 112.5 lb, so the next session adds one repetition per set. The weight stays the same because this week is already intended to be harder by taking the sets closer to failure.

The concepts of rate control, confidence gates, progression governors, estimated strength anchors, and trace statuses should remain available in an administrative or advanced diagnostic view, not the coaching output.

### 2. The LLM is being allowed to reconcile facts it does not reliably understand

The stored Hack Squat explanation says strength was “trailing at 4.8% per month versus the 1.4% target.” A value of 4.8% is not trailing a target of 1.4%. The live test corrected this to “gaining,” but then combined:

- 4.8% prescribed progression
- 5.62% measured estimated-strength progression
- three previous rate-limited decisions

Those metrics have different definitions. Their combination adds apparent sophistication without improving the user’s understanding.

The LLM should not perform this reconciliation. The deterministic layer should provide a single approved statement such as:

> Recent progression has already been faster than planned, so the program is increasing difficulty through repetitions rather than another load jump.

### 3. Inferred effort is being presented as observed effort

Many recent decisions have no reported RIR. The engine falls back to assuming the prescribed RIR, but the explanation then says:

> You met the target at about 1 RIR.

That was not reported by the user. It is an engine assumption.

The user-facing layer should distinguish among:

- Observed: the user reported 1 RIR.
- Inferred: no RIR was logged, but completed performance was consistent with the prescription.
- Unknown: the available data cannot determine actual effort.

In most routine explanations, the missing RIR does not need to be mentioned. When it materially affects the reasoning, the wording should be:

> You completed the prescribed work. Because no RIR was logged, the app is treating the effort as approximately on target.

### 4. Notes are being converted into arbitrary coaching claims

The Hack Squat note described a severe burning pump and aching quads. The explanation concluded that this supported “controlled execution” and “patience.” That connection was invented. A strong pump may reflect local effort, but it does not independently justify either of those recommendations.

The LLM should classify note content before using it:

- Setup or equipment preference
- Pain or joint concern
- Technique cue recorded by the user
- Normal exertion or pump
- Performance explanation
- Exercise preference
- Unclear or irrelevant commentary

Normal exertion should generally not produce advice. Pain, equipment constraints, or durable setup notes can be relevant.

### 5. A routine prescription is receiving more explanation than it deserves

Most prescriptions are simple:

- Same load, one more repetition
- Same work, lower target RIR
- Load increase after successful completion
- Deload reduction
- Hold after an incomplete performance

These can be explained deterministically in one sentence. Generating an LLM response for every exercise makes the output repetitive and encourages the model to find significance where none exists.

## Recommended output model

Each exercise should have up to three distinct layers.

### Layer 1: Prescription

This is entirely deterministic and visually primary.

> 112.5 lb × 11 reps × 3 sets
Target: 0 reps left in reserve

The prescription should never depend on the LLM response being available.

### Layer 2: Why this changed

This should also be deterministic or template-driven. It answers the immediate question without exposing engine implementation.

> You completed 112.5 lb for 10 repetitions across all three sets. The next session adds one repetition while keeping the load unchanged.

The deterministic system already knows the principal reason. There is little benefit in paying an LLM to restate it.

### Layer 3: Coaching context

This is the optional LLM layer. It should appear only when there is something useful beyond the immediate calculation.

Examples include:

- A relevant pain or exercise note
- A persistent, sufficiently reliable trend
- A meaningful change in program phase or weekly intent
- Repeated difficulty completing later sets
- A recurring relationship between performance and session position
- A notable adherence or fatigue pattern
- A load increment that is too large for the exercise
- A repeated discrepancy between prescribed and performed work

This layer should normally be one or two sentences.

## Recommended content hierarchy

When generating coaching context, information should be considered in this order:

### 1. Immediate exercise-specific constraints

Examples:

- Joint pain
- A durable setup note
- Equipment differences
- A user-recorded exercise preference
- A repeated problem completing a specific movement

These are usually more actionable than abstract strength trends.

### 2. Program intent

Examples:

- The block is moving closer to failure.
- This is a peak-effort week.
- This is a deload.
- The current block emphasizes chest and back.
- Difficulty is increasing through repetitions rather than load.

This gives the user the bigger-picture “why” without requiring statistical interpretation.

### 3. Repeated performance patterns

Examples:

- Several comparable sessions have remained flat.
- Performance is improving within the same phase and target RIR.
- Later sets have repeatedly fallen below target.
- The exercise performs differently depending on where it appears in the workout.

These should only be mentioned when the pattern is sufficiently consistent.

### 4. General educational guidance

This should be used sparingly and only when triggered by a specific observation. The output should not provide a generic lifting lesson with every prescription.

## Reliability framework

The LLM should not be given equal freedom with every available data point.

| Data | Reliability | Appropriate use |
| --- | --- | --- |
| Prescribed and completed load, repetitions, and sets | High | Explain the immediate prescription |
| Week, target RIR, phase, and deload status | High | Explain program intent |
| Durable pinned exercise notes | High | Personalize setup and exercise context |
| Explicit session notes | Moderate to high | Use when relevant, recent, or repeated |
| Explicitly reported joint pain | Moderate to high | Surface caution and tolerated alternatives |
| Repeated joint-pain ratings | High enough for pattern detection | Identify recurring exercise concerns |
| Actual reported RIR | Moderate | Interpret whether the target was met |
| Assumed RIR when none was reported | Low | Do not present as observed fact |
| One session’s estimated 1RM | Low | Usually suppress |
| Rolling trend across comparable sessions | Moderate | Use with sample and confidence gates |
| Matched-RIR comparison within the same phase | Moderate to high | Discuss persistent progress or stagnation |
| Cross-phase strength comparison | Low | Suppress unless the phase change is the point |
| Pump or workload rating from one session | Low | Rarely actionable alone |
| Whole-session performance rating | Moderate | Contextualize an unusual day, not change the plan |
| A single poor workout | Low | Acknowledge without interpreting as regression |
| Exercise order and fatigue position | Moderate | Use only when the pattern repeats |
| Machine loads across different equipment | Low | Do not compare unless the equipment identity is stable |

The current Bench Press analysis demonstrates why these gates matter. The system detects a declining current-phase trend, but all nine current-phase estimates are low-confidence, the lift occurs in more than one day slot, and its position in the workout varies. The correct coaching conclusion is not “your bench is declining.” It is:

> Recent bench performance has been inconsistent, but the available estimates are too noisy to call this a meaningful decline. Continue tracking comparable sessions before changing course.

In many contexts, even that may be more analysis than the user needs.

## Pain and note-based coaching

Pain notes are one area where the LLM can add genuine value because free-text notes contain context that deterministic progression logic cannot easily express.

The Bench Press history contains the note:

> AC joint pain when benching

A useful explanation attached to a later bench prescription could say:

> You previously noted AC-joint discomfort on this movement. Treat the prescribed load as a target rather than an obligation: use the grip and range that remain comfortable, and use a tolerated pressing variation if the discomfort returns.

This is directional, relevant, and grounded in user-provided data. It does not claim to know the user’s form or diagnose the cause.

However, a single older session note should not remain permanently prominent. Pain context should use clear rules:

- Always surface a durable pinned pain note.
- Surface a recent session pain note for the next few exposures.
- Continue surfacing it if pain is reported again.
- Reduce prominence after multiple pain-free exposures.
- Do not infer resolution merely because no rating was entered.
- Do not provide highly specific form corrections without observational data.

A better structured pain input would materially improve this capability:

- Location
- Severity
- Whether it occurred during or after the movement
- Whether it changed across sets
- Whether range of motion, grip, or load affected it
- Whether the same issue occurred on recent exposures
- Which alternative movements were tolerated

This need not become a lengthy questionnaire. A brief pain follow-up shown only when joint pain is reported would be sufficient.

## Plateau and trend coaching

The LLM should never merely report that progress has stopped. A trend belongs in the coaching layer only when it changes what the user should consider.

A plateau message should require:

- At least three to five comparable non-deload sessions
- The same training phase
- Similar prescribed RIR
- The same exercise and equipment
- A stable day slot or an adjustment for exercise position
- Moderate or better estimate confidence
- No obvious single-session explanation
- A sufficiently large and persistent pattern

The message should then translate the observation into practical considerations:

> Performance has remained roughly flat across five comparable sessions. Before changing the movement, check whether setup, rest periods, and repetition standard have stayed consistent. If the same pattern continues through the next block, a smaller load increment or exercise change may be worth considering.

The LLM should not autonomously modify the program based on this. It should help the user interpret the pattern and identify reasonable questions.

## Tone and character

The coaching voice should be:

- Calm rather than motivational
- Specific rather than inspirational
- Direct rather than conversational
- Observant rather than authoritative
- Comfortable saying that no conclusion is warranted
- Focused on the next useful action
- Clear about whether a statement comes from reported data or an estimate

It should avoid:

- Praise for routine compliance
- Simulated intimacy
- Excessive encouragement
- Claims about motivation or discipline
- Claims about form that the system cannot observe
- Medical-sounding diagnoses
- Technical engine vocabulary
- Statistical details that do not change the recommendation
- Treating every fluctuation as meaningful

The implicit character should be:

> “Here is what the program is doing, the most relevant context from your history, and what is worth paying attention to.”

Not:

> “I am your coach and know how you are moving, recovering, and adapting.”

## Semantic payload for the LLM

The LLM should not receive raw trace strings such as:

- status: paced
- governor: rate_pacer
- anchor e1RM
- deltaTarget
- confidence below moderate
- trailing30dPrescribedGainPct

A deterministic preprocessing layer should translate those into an approved structure:

```
{
  "prescription_change": "reps_increased",
  "previous_work": "112.5 lb × 10 × 3",
  "next_work": "112.5 lb × 11 × 3",
  "primary_reason": "completed_prescribed_work",
  "program_context": "target effort increases from 1 RIR to 0 RIR",
  "load_reason": "recent progression is already ahead of the planned rate",
  "actual_rir_status": "not_reported",
  "trend_status": "no_actionable_trend",
  "note_signal": {
    "type": "normal_exertion",
    "summary": "strong quad pump and local fatigue",
    "surface_to_user": false
  }
}
```

This removes calculation and fact-selection responsibilities from the LLM. The model’s job becomes prioritization and wording.

A suitable response schema would be:

```
{
  "headline": "optional short takeaway",
  "why": "plain-language explanation",
  "coaching_context": "optional actionable context",
  "confidence": "high | moderate | limited",
  "show_context": true
}
```

The why field could usually be filled without an LLM. The LLM would primarily generate coaching_context.

## Trigger model

LLM generation should be event-driven rather than universal.

### No LLM needed

- Routine repetition progression
- Routine load progression
- Planned RIR change
- Normal deload adjustment
- No relevant notes or trends
- Data is too sparse or noisy

### Short LLM insight

- Relevant recent note
- Repeated pain signal
- Persistent completion problem
- Reliable plateau
- Major change in block intent
- Significant exercise-order effect
- An unusual prescription that needs contextual explanation

### Broader review insight

Longer synthesis is better delivered at:

- End of workout
- End of week
- End of mesocycle
- User-requested “why” or progress review

These review points provide enough data for meaningful synthesis and avoid repeating similar explanations across every exercise.

## Cost-minimizing architecture

The current live test used approximately 1,393 input tokens to produce an 88-word response. That is excessive for a routine progression explanation.

A lower-cost structure would be:

1. Deterministic formatter for every prescription.
Covers what changed and the primary reason.
2. Deterministic trigger scoring.
Determines whether meaningful coaching context exists.
3. Precomputed features.
Trend confidence, pain recurrence, note category, adherence pattern, and comparability should be computed before the LLM call.
4. LLM calls only for triggered cases.
Likely a minority of prescriptions.
5. On-demand generation for expanded explanations.
A “Why?” or “More context” control can generate deeper analysis only when requested.
6. Cache by decision and context fingerprint.
Do not regenerate unless the prescription, relevant note, or trend state changes.
7. Strict output length.
Most exercise-level coaching should fit within roughly 40–80 words.
8. Workout-level aggregation.
When several exercises share the same reason, explain it once. For example, “This is the final hard week, so several exercises retain their load while moving closer to failure.”
9. Use the LLM for unstructured data, not arithmetic.
Notes and cross-signal synthesis justify model usage. Rewriting a progression rule usually does not.

This could reduce generation volume substantially while increasing the perceived intelligence of the feature.

## Additional data that would create the most value

### Highest priority

Actual effort reporting.

The current system frequently assumes target RIR because none was logged. A simple end-of-exercise effort entry would improve progression interpretation and explanation accuracy.

Structured note classification.

Allow notes to be marked as setup, pain, preference, technique reminder, equipment, or general. The user can still enter free text.

Pain persistence and resolution.

A lightweight follow-up after a pain report would allow the system to distinguish a one-time issue from a recurring constraint.

Equipment and setup identity.

Machine number, attachment, bench angle, grip, and similar details improve the comparability of historical performance.

Reason for prescription deviation.

When users perform a different load or repetition count, an optional reason such as equipment unavailable, pain, fatigue, time, or intentional adjustment would prevent incorrect conclusions.

### Useful but secondary

- Rest-time consistency
- Exercise-order changes
- Explicit exercise preference
- Whether the user intentionally altered technique or range
- Whether a session was performed under unusual conditions
- User feedback on whether an insight was useful

Sleep, stress, and readiness data may be useful at a weekly level, but they should not be allowed to produce frequent day-to-day prescription changes unless their predictive value is demonstrated.

## Example outputs

### Routine progression

Prescription: 112.5 lb × 11 × 3, target 0 RIR

> You completed 112.5 lb for 10 repetitions across all three sets. The next session adds one repetition while keeping the weight fixed; this week is also intended to bring the sets closer to failure.

No separate coaching statement is necessary.

### Load progression

Prescription: 275 lb × 9 × 3, target 1 RIR

> You completed the previous target at the intended effort, so the load increases by 5 lb. Keep the same repetition standard rather than treating the heavier weight as a reason to shorten the range or change execution.

The second sentence should only be used if the user has a relevant consistency note or a pattern suggesting altered execution. Otherwise, omit it.

### Poor single session

> This session was below your recent average, but one workout is not enough to indicate a decline. The prescription remains within the current progression plan.

### Low-confidence trend

> Recent estimates have varied, but the sessions are not comparable enough to support a useful trend conclusion. No change is indicated from this data alone.

### Persistent plateau

> Performance has remained roughly unchanged across several comparable sessions. The useful next checks are setup consistency, rest periods, and whether later sets are repeatedly falling below target before considering a program change.

### Pain-related context

> You previously noted AC-joint discomfort while benching. Use the prescribed load only within a comfortable grip and range, and choose a tolerated pressing variation if the discomfort returns.

## Recommended implementation order

### Phase 1: Remove harm and confusion

- Stop sending raw trace terminology to the user.
- Stop presenting assumed RIR as reported RIR.
- Separate load progression from total prescription difficulty.
- Prevent mixing prescribed progression rates with measured strength estimates.
- Suppress coaching when no actionable signal exists.
- Introduce deterministic explanation templates.

### Phase 2: Introduce the coaching layer

- Classify notes.
- Add confidence and comparability gates.
- Generate context only for meaningful triggers.
- Add progressive disclosure through a “Why?” expansion.
- Move broader analysis to workout and weekly summaries.

### Phase 3: Improve data collection

- Add lightweight RIR reporting.
- Add structured pain follow-up.
- Capture equipment and setup identity.
- Capture reasons for deviations.
- Collect whether the coaching insight was useful.

## Final position

The LLM creates the most value where the data is contextual, unstructured, and requires prioritization. It creates the least value where the answer is a deterministic consequence of the progression engine.

The system should therefore use deterministic logic to state:

- What the user should do
- What changed
- The direct reason it changed

The LLM should add:

- Why that matters in the broader program
- Which historical context is genuinely relevant
- What the user may reasonably pay attention to
- When the available evidence is insufficient to draw a conclusion

The quality standard should not be “the explanation sounds intelligent.” It should be:

> The user understands the prescription better and leaves with one useful piece of context they could not have obtained from the numbers alone.
