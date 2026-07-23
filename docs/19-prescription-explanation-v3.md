# 19 — Prescription explanation v3: deterministic facts, triggered coaching (build spec)

> Owner-commissioned 2026-07-23, from the owner's review of the live v2 output
> ([`reviews/2026-07-23-llm-coaching-assessment-owner.md`](reviews/2026-07-23-llm-coaching-assessment-owner.md),
> preserved verbatim). This spec is the reconciled architecture: it adopts the
> review's core — **deterministic prescription → deterministic explanation
> facts → optional, triggered LLM coaching insight** — and amends the nuances
> recorded in §2. **Where this doc conflicts with the owner review, this doc
> wins. Where it conflicts with doc 18, this doc wins for the explanation's
> content architecture, voice, payload, trigger policy, and delivery seam;
> doc 18 keeps authority over the infrastructure it built** (model choice and
> client, storage table, decision-id lifecycle, post-check mechanism, failure
> log, admin tooling, cost accounting). Doc 16 keeps authority over
> progression internals — nothing here changes a number the engine computes.

## 1. What v2 got wrong — the diagnosis, confirmed against the code

The v1/v2 pipeline (doc 18, N58, PRs #195–#197) hands the model the **raw
decision trace** (`projectTrace` — rule/detail/status/governor/predicate
verbatim), a two-rate trend block (`prescribed_gain_pct_per_30d` +
`measured_gain_pct_per_30d`), raw notes, and asks one prompt to produce the
what, the why, and the coaching in a single 480-char blob that **replaces**
the deterministic why entirely (`substituteExplanation` swaps out
`composeWhyLines`' output wholesale). The owner's live-output review found the
predictable failure modes, each traceable to that design:

1. **Engine vocabulary leaks.** "Rate pacer", "paced decisions", "earned an
   increase", "trailing" — the prompt *defines* the trace vocabulary for the
   model, so the model uses it. Debug language in a user surface.
2. **The model reconciles metrics it doesn't understand.** Given both a
   prescribed-gain rate and a measured-gain rate with different definitions,
   it combined them into confident nonsense ("trailing at 4.8% vs the 1.4%
   target" — 4.8 is not trailing 1.4).
3. **Assumed effort presented as observed.** The engine's RIR premise (no
   `rir_reported` ⇒ assume the prescribed target — `queries/anchors.ts`,
   doc 11) is invisible in the payload, so "you met the target at about 1 RIR"
   gets written about sessions where the user reported nothing.
4. **Notes converted into arbitrary coaching.** A "severe burning pump" note
   became evidence for "controlled execution and patience". The model was
   handed free text and an instruction to coach; it manufactured relevance.
5. **Every decision gets a generation.** Routine progressions ("same load,
   one more rep") don't need 88 model-authored words, and generating them
   anyway trains the model to find significance where none exists — and the
   user to skim past the strip.

None of these are prompt bugs to patch; they are consequences of giving the
model fact-selection and reconciliation responsibilities. v3 removes those
responsibilities.

## 2. Amendments to the owner review

The review's architecture stands. Five nuances are amended:

- **A1 — the LLM's `why` field is dropped, not "usually deterministic".** The
  review's response schema keeps an LLM-written `why` with the note that it
  "could usually be filled without an LLM". Go all the way: the why is
  **always** deterministic (`composePrescriptionNarrative`, hardened in §4).
  One author per layer — the strip never shows a model paraphrase of a
  sentence the composer can already write, and the model's entire output
  surface is the coaching layer. This also kills failure modes 1–2 outright
  for the always-visible text.
- **A2 — note classification happens inside the one generation call, not as
  a separate step.** The review says "the LLM should classify note content
  before using it". A second model call per note is cost and latency for
  nothing: the trigger layer gates on *deterministic* note metadata
  (existence, recency, pinned flag, pain-rating co-occurrence), and the
  generation call returns its classification **in the structured output**
  (§6) so the post-check can enforce "normal exertion ⇒ no advice". One
  call, classification auditable after the fact.
- **A3 — keep decision-id keying; add targeted regeneration, not a
  fingerprint.** The review's "cache by decision and context fingerprint"
  would re-introduce exactly the freshness machinery doc 18 §5 was designed
  to avoid. The decision id stays the only cache key (invalidation stays
  free on every recompute). The one real staleness hole — a note logged or
  pinned *after* the decision was priced — is closed by a write-site hook:
  note writes schedule regeneration (overwrite) for that exercise's open
  decisions (§7). No TTLs, no fingerprints.
- **A4 — the voice is a refinement of doc 18 §10, not a replacement of the
  register.** The review's "knowledgeable training analyst: observant,
  concise, practical, appropriately restrained" and doc 18's
  "scientific coach" are the same character with the volume turned down.
  What actually changes: no praise for compliance, no manufactured
  relevance, comfortable silence, and the review's tone rules (§6) become
  prompt law. The Mentzer shorthand is retired; "analyst" is the word.
- **A5 — the review's Phase 3 (new data collection) is severed from this
  build.** Effort reporting UX, structured pain follow-up, equipment/setup
  identity, deviation reasons, insight-usefulness feedback — all real
  product features with their own screens, schema, and design (hard rule 8
  applies to each). They are filed as separate backlog candidates (§10) and
  are **not** phases of v3. One correction to the review: per-set RIR
  reporting already exists (`logged_sets.rir_reported`); the gap is
  adoption/UX, not schema.

## 3. The v3 output model — three layers, three owners

| Layer | Content | Author | When shown |
|---|---|---|---|
| 1 · Ask | `112.5 lb × 11 × 3, each stopped… ` | `composeAsk` — deterministic | always (unchanged) |
| 2 · Why | delta vs last session + every recorded cause | `composePrescriptionNarrative` — deterministic | always |
| 3 · Coach | one useful, grounded consideration | LLM, trigger-gated | **minority of decisions** |

The seam inverts: today a stored explanation *replaces* the composed lines;
in v3 the composed lines **always render** and a stored coaching row renders
**beneath them** as a visually distinct line. `substituteExplanation` is
retired in favor of an additive `appendCoaching` (the ask/out-of-band
guards carry over: an N33-S4 hand-adjusted row keeps its caveat and drops the
coach line, whose story matches the decision, not the edited row). The
Engine audit sheet is untouched — raw trace vocabulary lives there, on
purpose, and nowhere else.

Rows generated under prompt versions 1–2 are whole-blob explanations and
**stop being served** the moment the seam inverts (serve only
`prompt_version >= 3`); they age out naturally as decisions recompute.

## 4. Layer 2 hardening — the deterministic why

`prescription-narrative.ts` already renders multi-cause why-lines in mostly
plain language (N57). Four corrections from the review's critique:

1. **Total-difficulty framing.** When the load holds but reps rise and/or the
   RIR ramp steps down, the story is "the prescription got harder", never "no
   increase". `composeDelta` already says "a step up even where the numbers
   match"; the progression lines must agree with it — the `paced` line
   becomes e.g. *"An extra load increase was held back — your recent gain is
   already ahead of the planned pace"* and must never render as the *only*
   line in a week that intensified (order the delta line first, which it
   already is).
2. **Vocabulary pass.** "Earned an increase" (ambiguous per the review),
   "the engine", "estimate isn't confident" — reword every line in
   `composeProgressionLine`/`composeFeedbackLine` to program-language:
   what happened, what the program does next. The word "engine" survives
   only in the Engine audit.
3. **Effort honesty.** Any line that references last session's effort must
   respect whether RIR was reported. The composer gains an
   `effortStatus: "observed" | "inferred"` input (derived where the audit is
   assembled: any `rir_reported` on the previous session's working sets ⇒
   observed). Inferred effort is simply **not mentioned** in routine lines;
   where it materially matters, the phrasing is the review's: "no RIR was
   logged, so the effort is treated as on target."
4. **Suppression symmetry.** A seed, a deload, and a routine advance each get
   exactly their one or two lines (already true) — the hardening is a test
   pass pinning that no combination of trace steps can stack past three
   lines or contradict the delta line.

All pure-composer work, golden-tested like the rest of the module.

## 5. The semantic facts projection — what the model is allowed to know

New pure module `src/lib/llm/explanation-facts.ts`: a deterministic
projection of (decision, context) → an **approved fact object**. It replaces
`buildExplanationPayload`'s raw-trace shape as the model's entire worldview.
Nothing in it is a raw trace string, a governor name, or a pair of rates.

```jsonc
{
  "exercise": "Hack Squat",
  "muscle_group": "quads",
  "week": { "n": 4, "of": 5, "target_rir": 0, "deload": false },
  "prescription_change": "reps_increased",       // enum: loads/reps/rir/sets × up/down/hold, deload, seed
  "previous_work": "112.5 lb × 10 × 3",
  "next_work": "112.5 lb × 11 × 3",
  "primary_reason": "completed_prescribed_work",  // enum, from the trace — projected, not verbatim
  "program_context": "final hard week; sets go to failure",   // template-selected sentence
  "load_reason": "recent gain already ahead of planned pace", // ONE approved statement (see below)
  "effort_status": "inferred",                    // observed | inferred | unknown
  "pace_status": "ahead_of_plan",                 // ahead | on | behind | insufficient_data — ONE verdict
  "trend_status": "no_actionable_trend",          // gated (§5.1); never two numbers to reconcile
  "pain": { "recurring": false, "last_report": null },        // from the PR-#199 attribution + ratings
  "note": {                                       // the ONE unstructured field — the model's actual job
    "source": "last_session",                     // pinned | last_session
    "age_sessions": 1,
    "text": "severe burning pump, quads aching"
  }
}
```

Principles:

- **One verdict per axis.** The two-rate trend pair is gone; the facts layer
  computes `pace_status` itself (from the same pacer inputs the engine used,
  with the doc-10 confidence gates) and the model receives the conclusion
  only. Same for `trend_status`. Failure mode 2 becomes unrepresentable.
- **Numbers only where the post-check can see them.** `previous_work` /
  `next_work` carry the tuple; the §4 number-set post-check carries over
  against this payload unchanged.
- **The note is the only free text**, clearly fenced, with provenance
  metadata. Recent-history lines and the anchor leave the payload — they fed
  the model's urge to do arithmetic and trend-reading it isn't allowed to do.

### 5.1 Reliability gates (deterministic, from the review's table)

The review's reliability table becomes code in the facts layer, not prompt
prose:

- `trend_status` may read `plateau` only when: ≥4 comparable non-deload
  sessions, same meso phase, same exercise+equipment, prescribed RIR within
  1, moderate+ e1RM confidence on the sessions, and no single-session
  outlier explanation. Anything less ⇒ `no_actionable_trend` or
  `insufficient_data` (which the model may name as such, per the review's
  "comfortable saying no conclusion is warranted").
- `pace_status` requires the pacer to have actually evaluated (a v20+
  progression step in the trace); otherwise `insufficient_data`.
- Single-session e1RM values, cross-phase comparisons, and one-off
  pump/workload ratings **never enter the payload at all** — the strongest
  gate is absence.
- `pain.recurring` uses the joint-pain attribution (PR #199) + repeated
  ratings; a single old report surfaces as `last_report` with its age and
  decays per the review's prominence rules (encoded in the trigger, §6).

## 6. Triggers, the call, and the output contract

### 6.1 Deterministic trigger scoring

`src/lib/llm/coaching-triggers.ts` (pure): (facts, context) → `Trigger[]`.
**Empty array ⇒ no API call, no row** — the deterministic layers are the
complete output. Triggers, mirroring the review's event list:

| Trigger | Gate |
|---|---|
| `pain` | recurring pain on this exercise, or a pain-classified recent report, or a pinned pain note; prominence decays after multiple pain-free exposures (never auto-resolves from silence) |
| `note` | a pinned note, or a session note from the last ~3 exposures (the model may still classify it irrelevant and abstain) |
| `plateau` | `trend_status: "plateau"` (already gated in §5.1) |
| `completion_pattern` | earned asks missed ≥2 consecutive comparable sessions, or repeated later-set shortfalls |
| `block_intent` | deload week, first week of a block, or the RIR ramp reaching 0 — the weeks where program intent is the story |
| `unusual_prescription` | any feedback modulation fired (set removed/added/vetoed, load capped, dampened) or an out-of-band deviation repeated |
| `increment_coarse` | the exercise's smallest step exceeds the paced monthly budget (the N56 step-cadence situation — a hold that will recur deserves one explanation) |

Routine progression, routine load step, routine ramp step, normal deload
with no other signal: **no trigger**. Expected call volume: a minority of
decisions (measure in shadow before flipping; the review's estimate and the
trigger list both point well under half).

### 6.2 One call, structured output

The generation call (same client, `openai.ts`) requests a JSON response:

```jsonc
{
  "coaching_context": "text ≤ 360 chars, 1–2 sentences",  // or null
  "note_class": "pain | setup | technique | equipment | preference | normal_exertion | performance_explanation | unclear",  // when a note was in the payload
  "abstain": false                                        // true ⇒ nothing worth saying
}
```

- **Abstention is a success path.** `abstain: true` (or null context) stores
  nothing; deterministic layers render alone. The prompt makes silence
  explicitly acceptable — the trigger got the model to the plate; it does
  not oblige a swing.
- **Post-check extends, doesn't change:** §4 number-set check against the
  facts payload; length ≤360; **plus** `note_class: "normal_exertion" |
  "unclear"` ⇒ the context may not reference the note (enforced by
  discarding contexts when the only trigger was `note` and the class is
  non-actionable). Any failure ⇒ discard, R20 + failure-log, no row —
  unchanged machinery.
- **Prompt v3** (`EXPLANATION_PROMPT_VERSION` = 3): the analyst voice (§2
  A4), the review's tone prohibitions verbatim (no praise for compliance,
  no simulated intimacy, no form claims, no diagnoses, no engine
  vocabulary, no statistics that don't change the recommendation), the
  effort-status rule ("inferred" ⇒ never state effort as observed), and
  few-shots rebuilt on facts payloads — including one abstention example
  and one "insufficient evidence" example (the review's low-confidence
  bench case is the template).

### 6.3 Storage

`decision_explanations` unchanged structurally; one migration adds
`triggers text[]` (audit: why this row exists) and keeps `prompt_version`
doing the serving cut (§3). `body` now holds coaching context only.

## 7. Lifecycle deltas

Generation stays at decision-write, fire-and-forget, decision-id-keyed,
burst-bounded — all of doc 18 §5. Three deltas:

1. **Trigger gate before the call** (inside `generateDecisionExplanations`):
   facts + triggers are computed for every decision in the burst; only
   triggered decisions reach the API. Facts computation is pure and cheap —
   no new queries of substance (context assembly already fetches notes,
   feedback, and the progression aggregate; it additionally needs
   `rir_reported` presence for effort status, one column on a query already
   made).
2. **Note-write regeneration** (§2 A3): `log_note` / pinned-note writes and
   session-note saves schedule `generateDecisionExplanations(…, {overwrite:
   true})` for that exercise's open-decision rows, so a fresh pain note
   reaches the very next day view rather than waiting for the next
   recompute.
3. **Admin loop unchanged:** `generate_explanations` (overwrite),
   `test_llm_explanation` (now returns facts + triggers + classification
   alongside the body), `get_llm_explanation_status`, and the failure log
   all carry over — plus a dry-run mode that reports *would-trigger* status
   across a scope, for calibrating §6.1 before flipping.

## 8. Surfaces

- **Day-view strip:** ask + why (deterministic, always) + `COACH` line
  (tracked-caps label per the 08 ledger system; only when a row exists).
  Check `docs/09-design-changelog.md` and the mockup before building the
  visual treatment (hard rule 8) — if no figure covers the coach line, it
  needs a design decision logged in 09 first.
- **MCP `explain_prescription`:** gains `facts` (the §5 object) and keeps
  `explanation` (now the coach line); the connector coach reads the same
  facts the model did — one definition of the story, extended.
- **Deferred, explicitly out of v3 core:** the review's workout-level
  aggregation ("several exercises share the same reason, explain it once")
  and end-of-workout / weekly / meso review syntheses — real ideas, different
  surfaces (Workout Complete, meso summary), each needing design work.
  Tracked as follow-ups (§10), buildable on the same facts layer.
- **On-demand deeper "why?" expansion:** deferred with them; the Engine
  audit already serves the power-user version.

## 9. Cost

Strictly below v2: fewer calls (triggered minority vs every decision),
smaller payloads (facts ≈ 200–300 tokens vs ≤600), same output budget.
Ceiling at current volume: well under doc 18's ≈$0.33/month; the token
rollup (`decision_explanations` token columns) verifies after a month.
Cost was never the binding constraint — output quality is — but the trigger
model buys both.

## 10. Spun-off backlog candidates (not phases of this build)

File as separate notes-area items for owner prioritization:

1. **Effort-reporting adoption** — surface/nudge per-set RIR entry (schema
   exists; UX doesn't invite it). Highest-leverage input per the review.
2. **Structured pain follow-up** — a brief, conditional follow-up when joint
   pain is reported (location, during/after, tolerated alternatives).
   Builds on PR #199's attribution.
3. **Note classification at entry** — optional type tag on notes
   (setup/pain/technique/equipment/general); free text stays.
4. **Equipment/setup identity** — machine/attachment/angle identity for
   comparability gating.
5. **Deviation reasons** — optional reason when performed ≠ prescribed.
6. **Workout/weekly/meso review synthesis** — the §8 deferred surfaces.

## 11. Implementation phases (one PR each, in order)

1. **Seam inversion + Layer-2 hardening.** Retire `substituteExplanation`
   for `appendCoaching`; serve stored rows only at `prompt_version ≥ 3`
   (immediately: nothing serves — deterministic-only, the safe floor);
   composer copy pass per §4 (difficulty framing, vocabulary, effort
   honesty, suppression tests). Ship with `LLM_EXPLANATIONS` generation
   left on shadow — v2 rows keep accumulating for comparison but stop
   rendering.
2. **Facts + triggers (pure).** `explanation-facts.ts` +
   `coaching-triggers.ts` with the §5.1 gates; unit/golden tests including
   the review's Hack Squat and Bench Press scenarios as fixtures (the
   bench case must produce `insufficient_data`, not `plateau`). Wire the
   dry-run trigger report into `test_llm_explanation`/
   `generate_explanations`.
3. **Prompt v3 + structured output + storage delta.** Migration
   (`triggers` column), JSON response handling, extended post-check,
   few-shots, `EXPLANATION_PROMPT_VERSION` 3; generation now trigger-gated.
   Owner voice-reads a regenerated batch (admin overwrite loop) before…
4. **Serve + note-write regeneration.** Flip the strip's coach line on
   (with its 09-logged design treatment), MCP `facts` field, note-write
   regeneration hooks. Measure a month: trigger rate, abstention rate,
   token rollup.
5. **(Later, owner-gated)** the §8 deferred surfaces and §10 items as
   individually prioritized work.

Phases 1–2 carry no model-behavior risk and improve the product on their
own; the LLM re-enters only at phase 3, already fenced by facts, triggers,
and the extended post-check.
