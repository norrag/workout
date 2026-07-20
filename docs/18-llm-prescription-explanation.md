# 18 — LLM prescription explanation (build spec)

> **Status: v1 BUILT (2026-07-20, N58) — activation is owner-gated.** §7
> phases 1–5 shipped in one PR: `decision_explanations` (+RLS, migration
> applied to hosted), `src/lib/llm/` (config/kill-switch, Responses-API
> client, payload + prompt + post-check, fire-and-forget write-site hook at
> the doc-16 §10 sites), and the read seam (strip substitution + MCP
> `explain_prescription.explanation`). The §9 voice gate is operational as
> **shadow mode**: `OPENAI_API_KEY` set + `LLM_EXPLANATIONS` unset generates
> and stores but serves nothing; `on` flips the strip. Both §2 build-time
> checks passed (model id `gpt-5.6-luna` + pricing verified against the
> official page 2026-07-20; `reasoning.effort` exists, defaults `medium`,
> pinned to `"none"` in code). Owner steps in
> [`deployment/openai-api-setup.md`](deployment/openai-api-setup.md). §7.6
> monitoring and the §10 v2 coaching layer remain.
>
> **Testing follow-up (2026-07-20, same day):** the first live run surfaced a
> testability gap — generation is fire-and-forget (§5), so its failures were
> visible only in Vercel function logs, and a fresh fingerprint meant no way
> to re-trigger a generation without re-training. Follow-up PR adds:
> `llm_explanation_failures` (durable, queryable failure log written beside
> every R20 report; owner-or-admin SELECT) and four admin MCP tools —
> `get_llm_explanation_status` (env config as the deployed function resolves
> it + stored rows + recent failures), `test_llm_explanation` (one live call;
> returns the exact upstream error; optional per-decision dry-run/store),
> `generate_explanations` (synchronous scoped (re)generation, `overwrite` for
> prompt iteration), and `recompute_prescriptions` (forced re-decide of open
> rows — all / day coordinate / exercise — writing new decisions even when
> numbers are unchanged, so the explanation pipeline re-keys). None of this
> changes the §5 production lifecycle; it is the §9 voice-gate loop made
> operable from a Claude session.
>
> Owner-commissioned 2026-07-19 alongside the
> deterministic quick-read (PR #194, same session). This is the PH30 idea
> ("LLM narrative layer", parked 2026-07-02) made concrete: model, payload,
> budgets, storage, invalidation, delivery, and cost. The deterministic
> composer (`src/lib/prescription-narrative.ts`) shipped first and remains the
> permanent fallback; the LLM output is a **drop-in replacement for the
> quick-read's body lines only** (§6). The engine — never the model — computes
> every number (root CLAUDE.md rule 3; PH30 owner framing).

## 1. Goal and non-goals

**Goal.** For each open prescription, a short explanation that answers both
**what** and **why** (owner requirement, 2026-07-19): if reps are held by the
pacer, backed down from feedback like joint pain or fatigue, or unchanged
because last week's target wasn't hit, the user is told so — **including when
several factors contribute at once** (a pacer deferral can sit on top of a
pain-capped load; every recorded cause gets named). This requirement binds the
deterministic composer too — `prescription-narrative.ts` walks the full
decision trace (feedback modulation notes, the doc-16 §3.6 progression state,
the legacy grade) and renders up to three why-lines with the earn-gate echo of
a feedback cause deduplicated — and the LLM is expected to do it *better*
(fluid multi-cause sentences instead of stacked lines).

**Non-goals (v1).** The model never chooses or adjusts a number, never sees
data the deterministic path doesn't, and the feature never blocks a screen: no
explanation ⇒ the deterministic lines render. v1 explains the prescription at
hand and stops there — the coaching register is **v2** (§10), gated on the v1
MVP proving out.

## 2. Model choice: OpenAI GPT-5.6 Luna

Owner-selected. Verified pricing (July 2026):

| | Input /1M | Output /1M | Cached input /1M | Notes |
|---|---|---|---|---|
| **GPT-5.6 Luna** | **$1.00** | **$6.00** | $0.10 (cache write 1.25×) | fast tier; ~1M context, 128K max output |
| GPT-5.6 Terra | $2.50 | $15.00 | $0.25 | not needed |
| GPT-5.6 Sol | $5.00 | $30.00 | $0.50 | not needed |

Batch API: flat 50% off input+output for async jobs (viable here — §5), per
the same sources. Sources: [aipricing.guru/openai-pricing](https://www.aipricing.guru/openai-pricing/),
[openrouter.ai/openai/gpt-5.6-luna](https://openrouter.ai/openai/gpt-5.6-luna),
[pricepertoken.com](https://pricepertoken.com/pricing-page/model/openai-gpt-5.6-luna).
**Build-time checks:** confirm the exact API model id (`gpt-5.6-luna`) against
the [official pricing page](https://developers.openai.com/api/docs/pricing);
if the Luna tier exposes a reasoning-effort control, pin it to the minimum —
reasoning tokens bill as output and would otherwise dominate the budget.

## 3. Payload design (what the model sees) — the budget's input half

One compact JSON object, ~**350 tokens hard target** (≈1.4 KB), assembled
server-side from data the audit layer already extracts — no new queries of
substance (§7). Everything is engine-derived; **no PII** (no names, emails,
ids), no free-text user notes in v1 (session notes can carry personal
information; folding them in is a v2 decision with its own privacy review).

```jsonc
{
  "exercise": "Deadlift",              // name + muscle group only
  "muscle_group": "glutes",
  "equipment": "barbell",              // load phrasing (added/assistance/bodyweight)
  "week": { "n": 2, "of": 5, "target_rir": 2, "deload": false },
  "goal": "hypertrophy",               // macro goal word
  "ask": { "weight": 250, "reps": 9, "sets": 3 },        // the tuple to explain
  "previous": { "weight": 250, "reps": 8, "target_rir": 3 },
  "decision": {                        // the recorded decision, trimmed
    "kind": "advance",
    "trace": [                         // rule + status + detail, verbatim
      { "rule": "load", "detail": "hold 250 lb, reps to 9 of 8–12 (anchor e1RM 341.7 lb)" },
      { "rule": "rir", "detail": "target RIR steps 3 to 2" },
      { "rule": "progression", "status": "paced", "governor": "rate_pacer",
        "detail": "earned; skipped by rate pacer (trailing 3.4%/mo ≥ target 1.7%/mo)" }
    ]
  },
  "anchor": { "e1rm": 341.7, "from": "250 × 8 on Jul 12" },
  "recent": [                          // ≤3 lines, the history sheet's shape
    "Jul 15 · 255 × 8, 7, 7",
    "Jul 12 · 250 × 8, 8, 8",
    "Jul 8 · 265 × 7, 7, 4"
  ],
  "feedback": { "pump": 6, "workload": 5, "joint_pain": 0 }   // last session, when present
}
```

Why these fields: the trace is the decision (already prose-compressed by the
engine); `previous` + `ask` give the delta; `recent` grounds "how you've been
moving"; `anchor` explains the pricing basis; feedback explains dampeners.
Dropping any of them forces the model to guess — including more (full
history, raw sets, params) buys nothing at 4× the tokens.

**System prompt** (~250 tokens, static ⇒ prompt-cached): role ("you explain a
strength-training prescription the engine already computed"), the output
contract (§4), the honesty guardrails as rules (doc 10 §9: e1RM is an
estimate; never promise outcomes; never contradict or restate numbers not in
the payload; no medical advice; lb only; no exclamation marks, no hype —
doc 06 voice), and 2 few-shot pairs (a paced hold + a deload) — few-shots are
part of the cached prefix so they cost ~nothing after the first call in a
burst.

## 4. Output contract — the budget's other half

- **≤ 320 characters, 1–3 sentences**, plain text (no markdown, no emoji).
  ~80 output tokens; request `max_output_tokens: 120` so the cap never
  truncates mid-sentence, and clamp to 320 chars server-side.
- Replaces ONLY the quick-read's body `lines` — the **ask line stays
  deterministic** (`composeAsk`), so the numbers on screen are never
  model-rendered.
- **Deterministic post-check before storing** (cheap, no second model call):
  (a) length ≤ 320; (b) every number in the text appears in the payload
  (extract numerals, compare against the payload's value set — the same trick
  as the marker/gate sharing: one comparison, no trust); (c) non-empty. Any
  failure ⇒ discard, R20-report, deterministic fallback. This is what makes
  "drop-in" safe.

## 5. Lifecycle: generate at decision-write, store, never regenerate in place

Generation is keyed to `engine_decisions.id` — which makes **invalidation
free**: a doc-14 recompute or a new advance writes a NEW decision row, whose
explanation is generated with it; the read path always joins the row's latest
decision, so a stale explanation can never show. No fingerprint participation,
no TTLs, no cache-busting — the decision id IS the cache key. (Alignment with
doc 14: the explanation is a display artifact OF a decision, not an engine
input; it must never feed back into anything.)

- **When:** immediately after a decision insert at the §10 doc-16 write sites
  (generation advance, seed, reconcile recompute, slot writes) — server-side,
  fire-and-forget (one retry), never blocking the write or the page. A
  generation failure leaves no row ⇒ deterministic lines.
- **Sync vs Batch API:** at current volume (§8) the 50% batch discount is
  worth ~15¢/month and adds a queue + poller; **recommend synchronous
  fire-and-forget** now, note Batch as the lever if volume ever 100×s.
- **Prompt caching:** decisions are written in bursts (a whole day generates
  at workout completion; a reconcile recomputes a meso's open rows together),
  so the static system prefix cache-hits within every burst (90% off those
  tokens; 30-min cache life covers a burst easily).
- **Backfill:** none. Only newly written decisions get explanations; a row
  whose latest decision predates the feature renders deterministic lines
  forever (or until its next recompute naturally re-decides it).

## 6. Delivery — the drop-in seam

The day-view strip renders `{ask, lines}`:

```
lines = storedExplanation(latestDecisionId) ?? composePrescriptionNarrative(...).lines
```

- `getPrescriptionAudit` (queries/audit.ts) already fetches the latest
  decision per row; extend its select with a joined `decision_explanations`
  row and add `explanation: string | null` to `PrescriptionAudit`. The strip
  substitutes it for the composed lines when present; the ENGINE AUDIT panel
  keeps showing the raw trace regardless (the audit half never goes LLM).
- **MCP reuse: yes, twice.** (a) The payload (§3) is a trimmed projection of
  what `explain_prescription` already returns (`formatPrescriptionDecision`:
  inputs.previous, anchor, trace, output) — the assembly function should live
  in query land and be shared by both. (b) Delivery: `explain_prescription`
  attaches the stored explanation as an `explanation` field, so the connector
  coach reads the same sentence the app shows (one definition of the story,
  like one definition of the numbers).

## 7. Implementation plan (one PR per phase)

1. **Schema.** Migration: `decision_explanations` (`decision_id` PK →
   `engine_decisions.id`, `user_id`, `body text`, `model`, `tokens_in int`,
   `tokens_out int`, `created_at`); RLS: owner SELECT, no client writes
   (service-role insert only) + RLS tests. Token counts persisted ⇒ cost
   audit is a one-line SQL rollup.
2. **Client.** `src/lib/llm/openai.ts` — thin server-only fetch to the
   Responses API (`OPENAI_API_KEY` env; Vercel + `manual-operations.md`
   runbook entry), zod-validated response, 10s timeout, one retry, R20
   error funnel. Global kill switch: unset key / `LLM_EXPLANATIONS=off` ⇒
   the feature silently doesn't exist.
3. **Payload + prompt.** `src/lib/llm/prescription-explainer.ts` — pure
   payload projection (unit-tested against the §3 shape + token ceiling) +
   the system prompt + the §4 post-check (unit-tested: number-set
   verification, clamp).
4. **Write-site hook.** Fire-and-forget generation after decision inserts
   (the doc-16 §10 site list); integration test with a stubbed client.
5. **Read seam.** `PrescriptionAudit.explanation` + strip substitution + MCP
   `explain_prescription` field; goldens for fallback behavior.
6. **Monitor.** A month in, run the token rollup; revisit Batch/caching only
   if the bill says so (it won't — §8).

## 8. Cost model

**Volume (measured, not guessed).** From the master history exports
(`docs/data/`, both users, trailing 90 days): Garron ≈23 and Madeline ≈21
performed exercise-rows/week ⇒ **~44 advance decisions/week** (each performed
row prices one next-session counterpart), plus seeds at meso boundaries
(≈ +1 week-equivalent per ~5-week meso ≈ +20%) and reconcile-recompute bursts
on config changes (one params flip re-decides ≈ a week's open rows). Call it
**~250 decisions/month steady state, ~400 in a heavy tuning month**.

**Per generation** (§3/§4 budgets):

| Component | Tokens | Rate | Cost |
|---|---|---|---|
| System prefix (cache miss, 1.25×) | 250 | $1.25/M | $0.00031 |
| System prefix (cache hit) | 250 | $0.10/M | $0.000025 |
| Payload | 350 | $1.00/M | $0.00035 |
| Output | ~90 | $6.00/M | $0.00054 |
| **Total, cache-miss** | | | **≈ $0.0012** |
| **Total, cache-hit (burst norm)** | | | **≈ $0.0009** |

**Monthly:** 250 × ~$0.001 ≈ **$0.25/month** (heavy month ≈ $0.40; batch
would shave it to ~$0.13). Ten times the user base at the same training
volume: ≈ **$2.50/month**. The cost is a rounding error; the real budget
constraint is latency/complexity, which the fire-and-forget design absorbs.

## 9. Risks / open questions

- **Model id + reasoning behavior** need the §2 build-time check (post-cutoff
  model family; aggregator pricing verified but the id string and any
  reasoning-token behavior must be confirmed against the official docs at
  build).
- **Voice drift.** The few-shots + post-check bound it, but the owner should
  read a first batch against doc 06's voice before the strip flips on
  (ship phases 1–4 with the strip still deterministic; flip in phase 5).
- **Session notes in the payload** (the PH30 "incorporate session notes"
  idea): deferred to the §10 v2 coaching layer, where their admission gets
  its own privacy review — notes are the one input that can carry personal
  information.
- **Multi-language:** out of scope; the app is English-only.

## 10. v2 — the coaching layer (owner direction, 2026-07-19; build after the v1 MVP proves out)

> Owner framing: the generations are "a natural place to marry some of the
> coaching aspects from the MCP with the prescriptions … a little bit of both
> the explanation of why you're being asked to do what you're being asked
> today, and maybe a little bit of focus direction for the user based on
> what's been going on. Think of a kind of a Mike Mentzer sort of scientific
> coaching personality to keep you informed, focused, and on track. It still
> needs to be short."

**What changes vs v1** (everything else — storage, invalidation, seam,
post-check — carries over unchanged):

- **Payload additions** (~+150–250 tokens; still comfortably under a 600-token
  input ceiling):
  - the user's **exercise notes** (pinned note + last session note) — the one
    v1 privacy exclusion, admitted deliberately here with its own review
    (notes can carry personal information; they stay out of any log line);
  - a **trend block** from the progression-history aggregate
    (`get_progression_history` / `queries/progression-history.ts`, shipped
    PR #161): earn/miss mix, governor firings, trailing prescribed-vs-measured
    gain — the structured evidence for "you've been parked here three weeks"
    or "four straight earned steps";
  - last workout-level feedback (fatigue/effort/performance), which v1
    already carries at exercise grain.
- **Output contract:** budget rises to **≤ 480 chars / 2–4 sentences**
  (~120 output tokens; `max_output_tokens` 160). Structure: hard targets and
  the multi-factor why FIRST (never displaced by coaching), then at most one
  or two clauses of **focus direction** grounded in the payload ("the misses
  are all on set three — protect rest before it", "pump has read low here
  two weeks running; a substitution is on the table").
- **Voice:** informed, focused, matter-of-fact — a scientific-coach register
  (the owner's Mentzer reference), expressed through the few-shots. Bounded by
  the same house rules: no hype, no exclamation marks, no promises, no medical
  advice; evidence named from the payload only. The §4 number post-check
  applies unchanged.
- **Cost:** ~600 in + ~120 out ⇒ ≈ **$0.0013/generation** cache-missed —
  materially identical to v1 (≈ $0.33/month at current volume).
- **Sequencing:** ship v1 (§7 phases 1–6), let the owner read a real month of
  generations, then flip v2 as a prompt + payload revision — no schema or
  seam change; `decision_explanations.model`/prompt-version columns already
  distinguish generations for comparison.
