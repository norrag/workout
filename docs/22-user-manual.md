# 22 — User Manual & AI Manual (build spec + phased plan)

**Status:** plan — no content written yet. Phases in [§11](#11-the-phased-plan).
**Owner ask (2026-08-05):** review the repository, the app's real functionality,
and every note/doc produced so far, then produce two user-facing manuals — a
**User Guide** and a dedicated **AI/MCP Manual** that lives under the AI
connector settings page — and afterward place links to them at the points in the
app where they help most.
**Revised 2026-08-06** after owner review round 1: D1–D5 and O1–O6 answered
([§4](#4-decisions), [§13](#13-owner-decisions--answered-questions)); three
content areas added ([§6](#6-the-three-added-content-areas)); admin content
excluded from both manuals; navigation re-cut to section-level granularity
([§9](#9-navigation--search)); the connector-retrieval design answered
([§10](#10-how-the-connector-finds-things-in-the-manual)); the repo-vs-runtime
editing question answered ([§14](#14-could-an-admin-mcp-tool-edit-the-manual)).

> **This doc is the spec.** The build is spec-driven (CLAUDE.md); doc 22 is
> authoritative for the manuals' information architecture, content contracts,
> hosting decision, and phase order. It does **not** override any behavior spec:
> where doc 22 describes engine behavior it is *reporting* docs 10/11/14/16/17/19/21
> and the code, never defining it. If a conflict is found, the behavior doc wins
> and doc 22's text is the bug.

---

## 1. What we are producing

| # | Deliverable | Audience | Home |
|---|---|---|---|
| **A** | **User Guide** — what the app is, how to use it, what its terms mean, and (plain-language) how the parts that produce numbers actually work | Any athlete using WORKOUT | In-app, reachable from More and from context-specific entry points throughout the app |
| **B** | **AI Manual** — setup, concept, capabilities, and worked use cases for the AI connector | Users connecting an AI client | In-app, under `/more/connector` |
| **C** | **Link placement pass** — deep links from dense app surfaces into the exact manual section that explains them | Owner's follow-on, deliberately sequenced last so placements are chosen against real sections |

### 1.1 Objectives as acceptance criteria

- **Defines key terms.** Every term the app renders has exactly one definition, and the manual's definition is the same words as the in-app `InfoDot` ([§8.1](#81-the-glossary-is-one-source-not-two)).
- **Explains how to use the app.** Every screen a standard user reaches has a "how to use it" section (route map audited in Phase 0b).
- **Explains how it functions, prioritizing understandability.** Named by the owner: how the strength anchor is derived, which methods compute e1RM (the Epley/Brzycki average over effective reps), and what role e1RM plays. Delivered through the three-layer depth model (D5).
- **Explains reasoning in plain language.** Every mechanism section carries a *why this way* paragraph.
- **Indexed, searchable, easy to navigate — in bite-sized pieces.** Requirements in [§9](#9-navigation--search). This was escalated in owner review: the manual must not read as one untraversable document.
- **Covers the AI connector.** A short User Guide chapter hands off; the AI Manual carries the depth.
- **Demonstrates the four named connector use cases.** Macrocycle creation/management, mesocycle creation/management, performance analysis, coaching — each as a worked example.

### 1.2 Scope boundaries

- **No admin content in either manual** (owner, 2026-08-06). The 17 admin-gated MCP tools, engine-parameter tuning, replay/simulation, and the LLM-explanation tooling are not user features and get **no** coverage — not a chapter, not a paragraph, not a "these exist" note. The inventory in [§7.2](#72-the-tool-surface) exists so Phase 0d knows what to *exclude*.
- **No sign-up / authentication walkthrough** (owner, 2026-08-06). A reader of the manual is already signed in; documenting the step they necessarily completed to get here is wasted words. Account *management* a user does later (data export, deletion) stays.
- **Describe what the app is, not what it is not** (owner, 2026-08-06). No "WORKOUT doesn't track nutrition/cardio" framing, no feature-absence lists, no defensive comparisons. Where a limit genuinely affects how a reader should act, state the positive rule instead ("estimates are shown as a band" rather than "we don't give exact maxes"). This is a copy contract ([§8.4](#84-positive-framing)), not just guidance.
- **No behavior changes.** Documentation only. Two small app changes are in scope as *carriers*: the manual routes themselves, and Phase 7's links.
- **MEASURE (doc 20) is excluded** — it is not built; the manual documents what ships.

---

## 2. Why this is harder than it looks (read before Phase 0)

**2.1 The docs contradict each other by design.** This repo supersedes in place:
09 beats 08 and 06; 19 supersedes parts of 18; doc 21 Phase 1 *amends the doc 11
RIR premise*; doc 16 owns progression internals while 17 owns macro goals; doc 10
owns metric definitions. A manual written from prose alone will document behavior
that was later corrected in review. **Phase 0a exists to resolve this before a
word of user-facing prose is written.**

**2.2 Some documented behavior is not live.** An `engine_params` version can be
written, tested, and merged and still be switched off, because activation is a
separate owner-gated step (`docs/deployment/manual-operations.md`). Today that
describes **v26 — the doc 21 §6.1 measuring band**, which ships complete and
inert. Per **O3**, the manual documents live behavior only.

> **Amended 2026-08-06/07** (Phase 0a, then folded in here at Phase 1 per
> [`22b`](./22b-source-map.md) §8 **O-D**). This paragraph originally named
> **v20** and **v23** as the inactive pair. Both had in fact been activated —
> v20 on 2026-07-11, v23 on 2026-07-12 — and the chain has since run to **v25
> active**. The argument was right and the example was stale, which is the
> failure mode this whole section is about.
> **[`22b`](./22b-source-map.md) §4 is the authoritative ledger.** It was read
> from the live `engine_params` row, not from `supabase/migrations/` — which
> under-reports the chain, because v22/v24/v25 were micro-bumps with no
> committed migration.

**2.3 The code is the only reliable source for what a user sees.** Numbers,
labels, thresholds, and defaults come from `src/lib/engine/`, the active
`engine_params`, `src/lib/glossary.ts`, and the screens — not from spec prose.

**2.4 The app moves faster than a manual normally can.** Batch 32 (PR #226)
merged the day after this plan was first written and changed four things the
manual would have documented wrongly: "Engine audit" became **Prescription
details** and moved to the prescription strip's ask line (N75); the cycles list
now hides finished cycles behind a toggle (N76); the planner board **opens for
in-progress mesocycles** (N78); and **more than one mesocycle may be live at
once**, so "the active meso" is now a *resolution* rather than a fact (N79). This
is not an argument against writing the manual — it is the argument for
[§8.3](#83-the-claims-ledger) and the Phase-8 maintenance rule, and for
re-validating Phase 0's audits at Phase 4.

**2.5 The honesty guardrails bind this manual too.** Doc 10 §9 and
`src/lib/mcp/coaching-guide.ts` forbid overclaiming: e1RM is an estimate and
never a tested max; deloads are fatigue management, not a growth booster;
MEV/MAV/MRV numbers are heuristics; pump and soreness are weak signals;
push:pull balance is advisory with no posture/injury claims; model-based targets
show the conservative end with no progress bar. A user manual is exactly where
these quietly become confident marketing claims. See [§8.2](#82-the-honesty-contract).

**2.6 Voice is a hard rule.** CLAUDE.md hard rule 7 governs every rendered
surface. Hard rule 8 (pixel fidelity) applies too: no mockup figure exists for a
manual reader, so the house-style transcription must be recorded in
`docs/09-design-changelog.md` **before** the reader is built — the procedure doc
21 Phase 6 followed.

---

## 3. What exists today that we build on (audited 2026-08-05/06)

| Asset | Location | Relevance |
|---|---|---|
| **Glossary** — 13 terms, honest-by-contract copy, enforced by a copy test | `src/lib/glossary.ts` | The manual's term definitions must *be* these |
| **`InfoDot`** — circled-i → anchored glossary card | `src/components/ui/InfoDot.tsx` | The existing term-level help grammar; the manual is the mechanism-level layer above it (N25) |
| **Coaching guide** — the science paradigm + guardrails, already written for an AI audience | `src/lib/mcp/coaching-guide.ts` | A large fraction of the "how it works" chapters is a *translation* of this to an athlete audience |
| **Connector page** | `src/app/(app)/more/connector/page.tsx` | Becomes the AI Manual's hub; its current copy becomes chapters 1–2 |
| **MCP surface** — 56 tools, 3 resources | `src/lib/mcp/` | The AI Manual's subject (minus the 17 admin-gated) |
| **Service-worker caching rule** — `CacheFirst` over `/_next/static/**`, everything else `NetworkOnly` | `src/app/sw.ts` | Makes D3's offline behavior free without touching launch cost ([§4](#d3--offline-availability-accepted-conditionally)) |
| **Import-guard test pattern** — source-text assertion that a hot-path module never imports the schema layer | `src/lib/engine/__tests__/predict.test.ts` (WS-J) | The pattern the manual's performance guard copies |
| **Docs 10 / 11 / 16 / 17 / 19 / 21** | `docs/` | Sources for the mechanism chapters |

**Not present when this plan was written:** any renderer, any `/guide` route, any
search index, any manual-maintenance rule. Those are net-new — hence Phases 1–2.
Phase 1 has since landed the block model, the section-ID scheme, the length
budget, the house-styled renderer, and the section/chapter routes; the search
index and the maintenance rule remain outstanding (Phases 2 and 8).

---

## 4. Decisions

All five signed off by the owner 2026-08-06. D3 carries a condition.

### D1 — Where the manuals live: **in-app, both.** ✅ accepted

Routes revised for section-level granularity (see [§9](#9-navigation--search)):

```
/more/guide                                  the map — chapters, each expanding to its sections
/more/guide/search                           search
/more/guide/[chapter]                        chapter contents (a short section list, not prose)
/more/guide/[chapter]/[section]              ONE section = one screen — the atomic, linkable unit
/more/connector/guide[...]                   the same shape for the AI Manual
```

### D2 — Authoring & rendering: **typed block model, no new dependency.** ✅ accepted

Content as data in `src/content/manual/` — a closed union (`heading` / `para` /
`list` / `table` / `callout` / `steps` / `term` / `figure` / `link` / `detail`)
rendered by house-styled components in `src/components/manual/`. Zero new deps,
type-safe cross-links and glossary references, and the block data is the single
artifact behind the renderer, the search index, the anchor map, and the
connector's retrieval surface ([§10](#10-how-the-connector-finds-things-in-the-manual)).

### D3 — Offline availability: **accepted, conditionally**

> Owner: *"accepted only if app launch or load times are not negatively
> affected. I do not want to reduce the performance of frequently used areas of
> the app to provide offline access to rarely used and potentially large
> reference documentation."*

The condition is right, and it is satisfiable with **zero** launch cost, because
the mechanism is already in the service worker. Three separate guarantees, each
with an enforcement:

1. **The manual never enters a hot path's bundle.** Next's App Router already
   splits by route, so `/more/guide/**` chunks are not in the Workout tab's first
   load *unless something imports them*. The real risk is an import leak — a day-view
   component pulling in manual content for a link label, or the search index
   imported at module scope somewhere shared. **Enforcement:** an import guard in
   the WS-J style (`predict.test.ts`) asserting that nothing outside
   `src/content/manual/**`, `src/components/manual/**`, and the guide routes
   imports manual content. Link placements (Phase 7) pass a **section ID string**,
   never an imported content module — that is what keeps the guard satisfiable.
2. **The manual is not precached.** Precaching would download every chapter at
   service-worker install — bandwidth the owner is right to refuse for reference
   material. **Enforcement:** manual chunks are excluded from `__SW_MANIFEST`;
   a test asserts the precache manifest carries no manual assets.
3. **Offline still works, for free, for anything you have read.** `sw.ts` already
   runs `CacheFirst` over `/_next/static/**` with a 30-day expiry. A chapter read
   once is a hashed immutable build asset in that cache, so it re-opens offline
   afterwards. Nothing extra to build, nothing added to launch.

Net: **cache-on-read, not precache.** No launch cost, offline for what you have
actually opened, and fully within hard rule 9 (immutable build assets only). The
search index is the one shared artifact big enough to matter, so it is lazily
fetched on first search rather than imported by the guide routes.

### D4 — Two surfaces, one system. ✅ accepted

Separate readers, tables of contents, and entry points; one block model, one
renderer, one search index, one voice test. Cross-links flow both ways.

### D5 — Three-layer depth. ✅ accepted

Every mechanism section: **(1) the one-line answer** → **(2) the plain-language
mechanism** with a worked example in real numbers → **(3) an optional collapsed
"the exact rule"** with the formula, thresholds, and the `engine_params` path
that tunes it. Layer 3 is where the pedantry goes, so layers 1–2 stay readable —
and it does not count against the section-length budget ([§9.3](#93-the-section-length-budget)).

---

## 5. User Guide — chapters

21 chapters. Each is a Phase-3 work unit. Every chapter breaks into
independently-addressable sections ([§9](#9-navigation--search)); the section
split is decided per chapter during Phase 0b/3.

| # | Chapter | Covers | Primary sources |
|---|---|---|---|
| 1 | **What WORKOUT is** | The premise: periodized cycles plus an engine that prescribes from your own performance. The five tabs and what lives on each | README, doc 01, `BottomNav.tsx` |
| 2 | **Your profile** | The fields the engine actually uses — sex, age, height, bodyweight, experience, training-since — and *what each one changes* about your prescriptions and targets | `/more/profile`, doc 17, `engine/macro.ts` |
| 3 | **The cycle model** | Macrocycle → mesocycle → microcycle → workout → day-slot. What a "slot" is and why the app compares a slot to itself. That more than one mesocycle can be live (N79) | glossary, doc 03, doc 09 |
| 4 | **Planning a mesocycle** | The planner board as the single meso surface; from scratch / from template / copy; day + muscle-group structure; the exercise sheet; the volume preview; activating a block; editing a block that is already running (N78) | `/cycles/plan`, doc 09 |
| 5 | **Training a session** | Day view anatomy: header, progress bar, the prescription strip and its ask line, set rows, logging a set, editing weight, per-set RIR capture, the exercise and session feedback sheets, Workout Complete | `/workout`, `/log/[id]`, doc 09, doc 21 |
| 6 | **Effort: RIR and the ramp** | RIR as reported vs target; the ramp; **report what you actually did, even when it misses the ask**, and why that honesty is what makes every other number work | glossary, doc 21, doc 10 |
| 7 | **Choosing your ramp: training styles** ⭐ | How different ramps express different training styles; the RIR ↔ stimulus ↔ fatigue relationship; worked examples of approaches. [§6.3](#63-rir-ramps-and-training-styles) | **needs a research pass** — doc 10, Refalo 2023, Zourdos 2016 |
| 8 | **Exercise-level RIR** ⭐ | Why the lever exists and how to use it in both directions — backing an exercise off (rehab) and pushing one harder (a muscle the ramp does not limit). [§6.2](#62-exercise-level-rir) | doc 21, `slot-effort-display.ts` |
| 9 | **Deloads** ⭐ | What fatigue is here, why a deload sheds it, when one is realistically needed per the evidence, and how to use them in the app. [§6.1](#61-deloads) | doc 10, `COACHING_GUIDE`, doc 21 Phase 5 |
| 10 | **How your next weight is chosen** | The headline chapter. The **strength anchor** — what it is, how it is derived from recent sets, why it is smoothed and recency-weighted; **e1RM** — the Epley/Brzycki average over effective reps (`reps + rir`), why two formulas are averaged — ⚠️ **corrected by Phase 0a:** Brzycki tracks Epley to ~10 effective reps and then *inflates* above it, so the operative rule is a **cutoff** (`e1rm.brzycki_max_eff_reps = 10`): average inside the band where the two agree, **Epley alone above it**. The "Epley high / Brzycki low, averaging cancels" rationale holds only inside that band. See doc 10 §1's 2026-06-24 amendment and [`22b`](./22b-source-map.md) §6.1 — and the **role** it plays: the currency the anchor, the prescription, the compliance marker, and the strength trend are all denominated in; confidence tiers; double progression and increments | doc 11 (+ doc 21 amendment), doc 16, doc 10, `engine/` |
| 11 | **Why the app asks how it felt** | Workload / pump / joint-pain feedback → next week's set count. The joint-pain gate first. Why workload is primary and pump only nudges | doc 10, `rules/feedback.ts` |
| 12 | **Volume** | Fractional set counting (1.0 primary / 0.5 secondary) and why a leg day can look "short"; MEV/MAV/MRV as a band; where the numbers come from and how much to trust them | glossary, doc 10, `engine/volume.ts` |
| 13 | **Reading your stats** | Exercise page, meso stats, macro overview; **Est. Strength** (rolling-window recent-best vs baseline-best, muscle-weighted rollup) and why a fresh block's easy opener does not tank it; PRs; comparability (cross-phase, slot pooling, single-latest reads) | doc 10, `engine/strength.ts` |
| 14 | **Macrocycle goals** | Goal types; the personalized target band and recommended timeframe; why it is a conservative band; pacing; closeout and the retrospective | doc 17, doc 10 |
| 15 | **Exercises & templates** | Library, the two-axis filter, custom exercises, per-exercise increment, exclusions, sharing by code | `/exercises`, `/templates`, doc 09 |
| 16 | **Body data** | Profile bodyweight vs the bodyweight series; body-fat estimate vs measured; BodySpec DEXA connect/import and the measurement-range rules | doc 15, doc 17 |
| 17 | **Prescription details** | The ask line, the why line, the coaching line, and the Prescription details sheet behind the ask line (N75); which parts are deterministic and which are model-written; that the engine authors every number either way | doc 19, doc 18, N75 |
| 18 | **Connecting an AI** | Short chapter: what the connector is and what it can do, then a hand-off to the AI Manual | `/more/connector`, doc 05 |
| 19 | **Your data** | Export, account deletion, what is stored, per-user isolation, and what "online reads, queued writes" means in practice | `/more/account`, `/more/export`, doc 03 |
| 20 | **Glossary** | Every term, one place — generated from `glossary.ts` plus manual-only terms | `src/lib/glossary.ts` |
| 21 | **Troubleshooting & FAQ** | The real recurring confusions mined from `docs/notes/` — "why did my weight go down", "why does this say fewer sets than I did", "why is my e1RM lower after a good session" | `docs/notes/backlog.md`, workstream A |

⭐ = added in owner review round 1.

**Ordering note.** Chapters 6–9 form the effort cluster and 10–12 the
number-making cluster; chapter 10 is written after the vocabulary chapters that
feed it, and gets its own review gate ([§11](#11-the-phased-plan)).

**FAQ sourcing.** Chapter 21 is mined, not invented. `docs/notes/` is a real
record of what confused the person using this app — the `S`-series questions,
workstream A's engine Q&A, the review docs (**O6** accepted).

---

## 6. The three added content areas

Added in owner review round 1. Specified here because two of them are the
chapters most likely to be written thinly, and the third needs research the repo
does not yet contain.

### 6.1 Deloads

Currently deloads appear only as a glossary card and a passing mention. The owner
wants the concept, the evidence, and the operation.

**Must cover:**

- **What fatigue is in this context** — an accumulating performance decrement, distinct from soreness and from muscle damage, and why it is the thing a deload addresses.
- **Conceptual purpose** — a deliberate reduction that sheds accumulated fatigue so the next block starts from a real baseline. A valve, not a stimulus.
- **When one is realistically needed, per the research** — and this is where the chapter earns its keep, because the honest answer is *thinner than the fitness-culture default*. The lone RCT on a **planned mid-cycle** deload (Coleman 2024) found no benefit and a possible strength decrement. So: the app's default (end of a 4–6 week block) is a **[HEURISTIC]** scheduling convention.
- **What the app actually acts on**, which is narrower than doc 10 §3 reads. The graded MEV→MAV→MRV ramp and its two-week-at-MRV auto-deload trigger were deliberately deferred (T-A5) and **are not implemented**; what ships is a **±1 set** workload response (`rules/feedback.ts`) with MEV/MAV/MRV as an advisory classification library. The live signals are the **joint-pain gate** (`pain_gate 2` vetoes additions, `pain_cut_gate 3` cuts a set) and the **workload slider** (≥ 8 cuts a set; ≤ 3 with a strong pump adds one). Frame the chapter as *the app deloads on a schedule, and adjusts your set counts week to week from your own feedback* — there is no automatic deload trigger to describe. (Phase 0a correction, folded in at Phase 1; see [`22b`](./22b-source-map.md) §7.)
- **How to use them in the app** — where the deload week sits in a meso, how prescriptions change (read the live `engine_params` in Phase 0, do not copy the doc-10 defaults blind), that a deload week's sets are **set aside from strength reads** rather than counted as a decline (doc 21 Phase 5), how to shorten or skip one, and what to expect the week after.
- **Guardrail (doc 10 §9, binding):** a deload is fatigue management, not a proven growth or strength booster. No growth framing anywhere in the chapter.

### 6.2 Exercise-level RIR

Doc 21 shipped the lever across six phases; the manual has to make it usable. The
owner named both directions explicitly, and the *raise effort* direction is the
one that will be missed if not called out.

**Must cover:**

- **Why it exists** — the week's RIR ramp is one number for the whole week, and real training has exceptions. Origin case (worth telling, because it explains the design): a live nerve episode where a coach-agreed rehab plan had nowhere to live.
- **The semantics**, in plain language: an assignment is **absolute** — set it and it wins, leave it unset and the exercise follows the week's ramp. It is **unbounded**, so one lever spans deload → rehab → extra effort. The load is repriced through the normal rep-window path, **symmetrically** — backing off and pushing harder are the same mechanism in opposite directions, not two features.
- **Use case A — lower the effort (rehab, a niggle, a lift you are protecting).** Assign a higher target RIR; the load reprices down; the sets still count as work and volume, and **a protected block does not read as a decline** — a slot run easier than its week is tagged `BACKED OFF`, dropped from PRs, `best_e1rm` and the strength trend (from both sides, so it can neither set a PR nor raise the bar), kept in volume and adherence, and disclosed in one sentence wherever the number appears. How to unwind it when you are ready.
  > **Source note (Phase 0a, folded in at Phase 1).** That reassurance is doc 21 **§6.2** — the read-time comparability policy, which **is live**. Write the chapter from it. The **measuring band** (§6.1, `max_measuring_rir`) is a *different* rule — asked at the stamp, *is this a measurement at all* — and it ships **inactive** as v26, so today every set at every RIR is still treated as a measurement. Ch. 8 must not mention the band until v26 activates. [`22b`](./22b-source-map.md) §4.1 ①.
- **Use case B — raise the effort (a muscle the standard ramp does not limit).** The owner's case: systemic fatigue is not the constraint on small isolation work the way it is on heavy compounds, so a week sitting at 3 RIR can leave stimulus unclaimed on those exercises. Assign a lower target RIR. Cover the per-exercise set cap and the honest caveat that this buys stimulus with fatigue.
- **The scopes** — `THIS WEEK` / `WORKING WEEKS` / `ALL WEEKS` — what each reaches, and specifically how they differ on deload coverage.
- **Where the lever lives** — the day view and the exercise sheet, plus the planner board's flat column and why a per-week assignment reads `RIR BY WEEK` there instead of being flattened (N78). Phase 0b re-confirms these surfaces post-Batch-32.

### 6.3 RIR ramps and training styles

The owner asked for ramps beyond the default 3 → 0, how they map to training
styles, the RIR ↔ hypertrophy ↔ fatigue relationship, and examples of programs
taking different approaches.

**This is the one chapter whose content is not already in the repo.** Doc 10 and
`COACHING_GUIDE` establish the RIR/fatigue relationship and cite the evidence,
but neither maps ramps to styles, and neither discusses third-party programs. So
this chapter gets a **research pass first**, producing
`docs/reviews/2026-08-xx-rir-ramps-and-training-styles.md` with the doc-10
evidence tags (`[EVIDENCED]` / `[HEURISTIC]` / `[DERIVED]`) applied per claim —
the pattern the repo already used for `2026-07-09-goal-rate-factor-research.md`.
Prose is written from that review, not from the open web.

**Must cover:**

- **3 → 0 is a default, not a law**, and where in the app the ramp is set (meso create/edit start → end RIR).
- **The relationship** — proximity to failure buys stimulus and costs fatigue, but not linearly: gains flatten past roughly 1–2 RIR while fatigue keeps climbing (Refalo 2023). "Closer to failure" is therefore not monotonically better, which is *why* the app ramps rather than sitting at 0.
- **Ramps as style**, with the trade-off named for each: a conservative high-volume ramp (more sets tolerated, lower per-set fatigue); the standard hypertrophy ramp; a strength-biased pattern (closer to failure on the lifts that matter, effort spared elsewhere — usually expressed as a flatter ramp *plus* per-exercise assignments, which links chapter 8); a flat high-RIR ramp for maintenance or rehab.
- **How ramp choice interacts with everything else** — set counts and deload timing. *(The fourth interaction — how much of your data is usable as a strength measurement — belongs here only once v26 activates; see §6.2's source note.)*

**Constraint on the "example programs" ask (open question O7).** Naming
third-party published programs means making checkable claims about someone else's
work, which go stale and can be wrong, and it risks reading as endorsement or as
"WORKOUT implements this." Recommended treatment: describe approaches by their
**characteristics**, and where a widely-known approach is referenced, name it only
where the ramp property is a documented, citable feature of the published program,
cite the source, and state plainly that WORKOUT is not implementing that program.
Owner call in [§13](#13-owner-decisions--answered-questions).

---

## 7. AI Manual — chapters

**Vocabulary rule (O4, accepted with amendment).** Start from zero, and use the
words a reader already has: *"Claude or ChatGPT"* not *"an LLM"*; *"connector"* or
*"plug-in"* not *"MCP"*. The literal string `MCP` appears only where a reader must
type or find it in their AI client's own UI (which labels it that way) — and there
it is introduced as *"your AI client may call this an MCP or custom connector."*
Enforced as a copy contract ([§8.5](#85-plain-language-vocabulary)).

| # | Chapter | Covers |
|---|---|---|
| 1 | **What the connector is** | Your training data, made available to an AI you already use, with real tools it can call. What this buys you over describing your training in chat: it reads your actual numbers and can draft real plans |
| 2 | **Setup** | The endpoint; adding it in your AI client; authorizing; per-client scope; verifying it works ("ask it where I am in my block"); revoking; what to do when a client will not connect |
| 3 | **The rules it operates under** | Identity is fixed to you — nothing can reach another account. It never deletes logged history. Writes land as drafts you review in the app. **The engine computes every prescribed load, rep, and set — the AI surfaces and interprets them.** What it can see |
| 4 | **What it can do** | Capabilities in plain language, grouped by what you would want ([§7.2](#72-the-tool-surface)) — "it can pull your full history for a lift, including how hard each set was and how confident the estimate is", not a schema dump |
| 5 | **Use case: macrocycle creation & management** | Worked example from "I want to gain muscle over the next five months" through goal setting, target review, slot planning, and mid-macro management |
| 6 | **Use case: mesocycle creation & management** | Worked example — drafting a block from your history and constraints, previewing volume before committing, editing a live block, duplicating one that worked |
| 7 | **Use case: performance analysis** | Worked example — "am I actually getting stronger on incline press?", trend reads, meso comparisons, muscle balance, volume by group, and the comparability questions to ask |
| 8 | **Use case: coaching** | Worked example — reviewing a session, deciding whether to push or back off, working around a niggle *and having it become a real exercise-level RIR assignment* rather than advice you must remember (links User Guide ch. 8) |
| 9 | **Getting good answers** | How to prompt it: ground it first, ask which numbers it used, ask it to check comparability. What a good answer looks like next to a confident wrong one |
| 10 | **How to read its answers** | The honesty guardrails as reader expectations — where it hedges, why the hedge is the correct answer, and which of its numbers are estimates. Positively framed per [§8.4](#84-positive-framing) |
| 11 | **Notes, exclusions & preferences** | The quieter capabilities: notes it will read later, exercise exclusions, per-exercise increments, affinity |
| 12 | **When it gets something wrong** | Recognizing it, correcting it in the app, and reporting it |

### 7.1 Worked examples are the deliverable

Chapters 5–8 are what the owner asked for. Each needs a real transcript shape:
the setup, the prompt, an abridged but **truthful** response, and the follow-up in
the app. Fabricated transcripts showing the connector doing something it cannot
do are the main failure mode. **Phase 5 acceptance criterion: every example was
actually run against the live connector.** Per **O5**, real numbers, lightly
generalized.

### 7.2 The tool surface

Audited 2026-08-05 from `src/lib/mcp/tools/`: **56 tools**, of which **17 are
admin-gated** via `resolveAdmin`. Grouping for chapter 4 — the admin group is
listed **only so Phase 0d excludes it**; per [§1.2](#12-scope-boundaries) it gets
no coverage at all.

- **Orientation** — `get_current_state`, `get_training_overview`, `get_profile`
- **History & analysis** — `get_exercise_history`, `get_recent_sessions`, `get_exercise_notes`, `analyze_exercise_progress`, `compare_mesocycles`, `get_muscle_balance`, `get_muscle_group_volume`, `get_exercise_affinity`, `check_data_hygiene`, `get_body_composition`
- **Cycles (read)** — `get_macrocycles`, `get_macrocycle_summary`, `get_mesocycle`, `get_mesocycle_summary`
- **Cycles (write)** — `create_macrocycle`, `update_macrocycle_goals`, `manage_macrocycle_slots`, `delete_macrocycle`, `create_mesocycle`, `edit_mesocycle`, `update_mesocycle`, `duplicate_mesocycle`, `activate_mesocycle`, `delete_mesocycle`, `preview_mesocycle_volume`
- **Library** — `search_exercises`, `create_custom_exercise`, `delete_custom_exercise`, `set_exercise_increment`, `search_templates`, `create_template`, `delete_template`, `manage_exclusions`, `get_exclusions`
- **Coaching** — `log_note`, `explain_prescription`
- ~~Admin-gated (17)~~ — **excluded from the manual**

Resources: `workout://profile`, `workout://current-cycle`,
`workout://coaching-guide`, plus the two added in Phase 6
([§10](#10-how-the-connector-finds-things-in-the-manual)).

---

## 8. Content contracts

Each enforced by a test, so drift is caught in CI rather than by reading.

### 8.1 The glossary is one source, not two

A term defined in `src/lib/glossary.ts` appears in the manual with **that exact
body text**. The manual may add depth around it; it may not restate it in
different words. Enforced by a test asserting every `GlossaryKey` resolves to a
manual `term` block identity-equal to `GLOSSARY[key].body`. Terms the manual needs
that the app does not yet show get **added to `glossary.ts`** (gaining an
`InfoDot` for free), not defined only in the manual.

### 8.2 The honesty contract

A copy test over all manual blocks:

- No exclamation marks; no hype vocabulary (denylist).
- Any sentence stating an e1RM, a strength projection, or a macro target sits in a section flagged `estimate: true`, which renders the standing estimate caveat.
- Deload sections may not use growth or gain framing ([§6.1](#61-deloads)).
- Every numeric default the manual states carries its `engine_params` path, so a param change is greppable to the prose that states it.

### 8.3 The claims ledger

`docs/22a-manual-claims.md` — every factual assertion the manuals make about app
behavior, with its source:

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-e1rm-01` | UG 10.2 | e1RM averages Epley and Brzycki over `reps + rir` | `src/lib/engine/e1rm.ts` + doc 10 §2 | ✓ 2026-08-xx |

A claim enters the manual only after its row exists and is verified against
**code**, not prose. A PR that changes behavior greps this ledger. Given
[§2.4](#2-why-this-is-harder-than-it-looks-read-before-phase-0), this is the
difference between a manual and a snapshot.

### 8.4 Positive framing

Owner rule, 2026-08-06. A test flags absence-framing patterns in manual copy —
"does not", "doesn't support", "unlike", "we don't" — outside an allowlist of
places where a negative is the honest statement (the guardrails in AI Manual
ch. 10, and safety statements such as *"it never deletes logged history"*, where
the negative **is** the reassurance). Everywhere else, state the positive rule.

### 8.4a Standing authoring rules from owner review round 2 (2026-08-07)

Four notes came back off the Phase-1 exemplar. Three were fixed in place; all
four are rules for **every chapter after it**, not one-off corrections.

1. **A definition may not lean on an unexplained abbreviation.** Spell the term
   out and tie the words to the letters before using them — inside the very card
   that exists to explain it, above all. Enforced for `1RM`/`e1RM` by a test in
   `src/lib/__tests__/glossary.test.ts`; extend the pattern as new abbreviations
   enter the glossary (`MEV`, `MRV`, `RIR`, `DEXA`, `RMR`).
2. **Show the app element, do not describe it.** Where a screen uses a mark, an
   icon, or a distinctive control, render it — that is a thing this format can
   do that spec prose cannot, and it is why the `legend` block exists. The mark
   vocabulary is closed and each entry resolves through the app's own definition
   (`src/lib/set-markers.ts` is the first), so the manual and the screen cannot
   show different symbols.
3. **A link states why it is there.** `related` renders each target's summary
   under a labelled `RELATED` rule; an inline cross-link is introduced by the
   sentence carrying it. A bare `link` block parked at the foot of a section is
   the pattern this rule exists to prevent.
4. **An adjacent section is one tap.** Prev/next in the section footer, naming
   its destination rather than showing a bare arrow.

### 8.5 Plain-language vocabulary

Per **O4**. A denylist test over manual copy: `LLM`, `large language model`,
`MCP` (outside the ch. 2 allowlist where the reader must find that word in their
own client), `OAuth`, `JSON-RPC`, `endpoint` used without a plain gloss. The
substitutions are the contract: *Claude or ChatGPT*, *connector* / *plug-in*,
*sign in and approve*.

---

## 9. Navigation & search

Escalated in owner review: *"It should not read like a single, untraversable
100-page document… Documents, chapters, and topics should instead be divided into
bite-sized sections that can be accessed independently through the shortest
possible navigation paths."* That reshapes the routes (D1) and adds an enforced
length budget.

### 9.1 The section is the unit, not the chapter

A **section** is one screen, one URL, one search hit, one link target. A chapter
page is a **contents page** — a one-line intro and its section list — never the
chapter's full prose. This is the structural difference between a manual and a
long document, and it is why the chapter route and the section route are
separate.

### 9.2 Shortest paths

| From | To a section | Taps |
|---|---|---|
| A link placed in the app (Phase 7) | the exact section | **0** — the link *is* the section route |
| Search | the section | **1** — results are section routes |
| `/more/guide` (the map) | any section | **1** — the map lists chapters with their sections inline (expandable), so a section is never behind a chapter page |
| A section | the next section | **1** — prev/next crosses chapter boundaries, so cover-to-cover reading stays "next, next, next" |

The chapter route exists for orientation and for a stable parent in breadcrumbs;
it is never on the critical path to a section.

### 9.3 The section-length budget

The mechanism that stops long sections from re-creating the problem. A section
targets **one to two phone screens**: roughly ≤ 350 words and ≤ 12 blocks, to be
calibrated against the Phase-1 exemplar. Over budget → split the section, or move
detail into a layer-3 `detail` block, which is collapsed by default and therefore
**does not count** toward the budget. Enforced by a test that fails the build with
the offending section ID, so the constraint is felt at authoring time rather than
discovered by a reader.

### 9.4 The rest

1. **Contents page per manual** — chapters with one-line descriptions, in reading order, sections inline.
2. **Stable section IDs** — permanent slugs (`ug/effort-rir#per-exercise`). These are link targets for Phase 7 *and* retrieval keys for [§10](#10-how-the-connector-finds-things-in-the-manual), so they are an API: renaming one is a breaking change needing a redirect entry.
3. **Search** — one field over both manuals, over section titles, body text, glossary terms, and hand-authored keywords ([§10.3](#103-the-honest-limit-and-what-to-do-about-it)). Built from the block model at build time, lazily fetched on first search (D3), client-side, no new dependency.
4. **Breadcrumb-back to origin** — a reader who enters from the day view returns to the day view (the app's existing N27 rule).
5. **Cross-links** — typed `link` blocks referencing section IDs, validated at build; a test asserts every target resolves.
6. **Deep-link entry** briefly marks the landed section, so an in-app link lands somewhere obviously correct.
7. **Related sections** — a short typed list per section, which doubles as the retrieval layer's neighbor graph.

---

## 10. How the connector finds things in the manual

> Owner: *"How will the MCP efficiently locate relevant information in the user
> manual and bring it into context? Will it use RAG, or is this already handled
> by the documentation architecture?"*

**Short answer: the architecture handles the hard part; we add ranking, not
embeddings.** No vector RAG, and the reason is specific rather than ideological.

### 10.1 Why not RAG

The expensive, error-prone part of a RAG pipeline is **chunking** — splitting
continuous prose into pieces that are individually coherent and carry enough
context to be useful in isolation. Under D2 and [§9.1](#91-the-section-is-the-unit-not-the-chapter),
that work is done **by authorship**: the manual is written as discrete,
independently-addressable, titled sections with stable IDs, a length budget, typed
cross-links, and a related-sections graph. Those are better chunks than a splitter
produces, because a person decided where the seams are.

Scale supports the same conclusion. Roughly 21 chapters × ~6 sections ≈ 130–200
sections of ~150–350 words — call it 40–70k words. At that size a lexical index
over titles, body, glossary aliases, and keywords is competitive with embeddings,
and it is **deterministic, debuggable, free to build, and free to keep current**.
Embeddings would add a model dependency, an embedding store, and a re-embedding
pipeline that must fire whenever a parameter change rewrites a sentence — and the
manual's correctness is CI-tested, so a retrieval layer that silently re-ranks on
a model upgrade is the wrong kind of moving part here.

### 10.2 The design — retrieve, then read

Three pieces, all generated from the same block model that already backs the
renderer and the in-app search:

1. **`workout://user-guide-index`** (resource) — the full contents tree: every section's ID, title, one-line summary, parent chapter, and in-app route. A few KB. A client loads it once and then **has the map**, which alone answers a large share of "where is X" without any search at all.
2. **`search_manual(query, limit)`** (tool) — ranked hits over the build-time inverted index, title-weighted and glossary-alias aware, returning `{section_id, chapter, title, summary, snippet, app_route}`. Cheap and bounded — it returns pointers, not prose.
3. **`get_manual_section(section_id, { include_related })`** (tool) — one section's full text as markdown. The read step.

This is **retrieve-then-read**, the same shape a coding agent uses on a codebase,
and it works for the same reason: good names plus a map beat embeddings when the
corpus is *authored* rather than scraped.

Two refinements that matter:

- **Every result carries its in-app route**, so the AI can hand the user a tappable link into the app — the connector and the app point at the same section.
- **The glossary is the alias layer.** Someone asking "what's my estimated max" should land on the e1RM section. Each section's index entry carries its glossary term keys and their labels as searchable aliases — the synonym expansion a lexical index otherwise lacks, and it comes free from [§8.1](#81-the-glossary-is-one-source-not-two).

### 10.3 The honest limit, and what to do about it

Lexical search misses paraphrase that shares no vocabulary with the text — *"why
did it make this week easier?"* → the autoregulation section. Mitigations in cost
order:

1. **Hand-authored `keywords` per section** — cheap, under authorial control, and it also improves in-app search. Recommended, in scope from the start.
2. **The index resource** — the model can browse the map instead of depending on a query matching.
3. **Only if measured recall is genuinely poor after real use:** embeddings as an *additive re-rank* over the lexical hits, never a replacement. Supabase has pgvector. Recorded as a deferred option with a trigger condition, not a plan.

### 10.4 Consequence for the plan

Phase 6 is **no longer optional** (it was marked droppable in the first draft;
the owner's question is what changed that). It moves ahead of the AI Manual
content, because chapter 4's "what it can do" should describe a connector that
can already read the manual. One artifact — the build-time index — serves both
the in-app search and the connector.

---

## 11. The phased plan

Sequenced so nothing is written before its ground truth exists, and the reading
surface exists before the content that fills it. **S** ≈ a focused session,
**M** ≈ substantial, **L** ≈ split if it grows.

### Phase 0 — Ground truth (no user-facing prose) — ✅ **DONE 2026-08-06**

Four parallelizable audits. Output is working documents. **This phase determines
whether the manual is correct.**

> **Landed:** [`22b-source-map.md`](./22b-source-map.md) (0a),
> [`22c-app-inventory.md`](./22c-app-inventory.md) (0b + 0c),
> [`22d-connector-inventory.md`](./22d-connector-inventory.md) (0d). It found
> three errors **in this document** — §2.2's inactive list, §5 ch. 10's Brzycki
> rationale, and §6.1's MRV-stop claim — each corrected inline above. Two items
> now block one chapter each: **O-A** (`LLM_EXPLANATIONS` mode → ch. 17) and
> **O-B** (v26 activation → ch. 8); neither blocks Phase 1.

| Phase | Scope | Output | Size |
|---|---|---|---|
| **0a** | **Doc supersession map.** Per topic, which doc is authoritative and which passages are superseded. Resolve 08↔09↔06, 18↔19, 11↔21, 16↔17, 10-over-all. Flag every behavior that shipped **inactive** (v20/v23) so the manual documents live behavior only (**O3**) | `docs/22b-source-map.md` | M |
| **0b** | **Functional inventory from the code.** Route-by-route walk of every screen a standard user reaches: what it shows, every control, every state, every label. Must be taken **after** Batch 32 (N75–N79 changed four documented surfaces — [§2.4](#2-why-this-is-harder-than-it-looks-read-before-phase-0)). Skips sign-up/auth per [§1.2](#12-scope-boundaries). This is the skeleton of chapters 1–5, 13–19 | `docs/22c-app-inventory.md` | L → split by tab if it grows |
| **0c** | **Concept & FAQ inventory.** Every jargon term the app renders, marked defined/undefined; plus FAQ candidates mined from `docs/notes/` | appended to `22c` | M |
| **0d** | **Connector inventory.** Per user-facing tool: one plain-language line, whether it writes, and which use-case chapter it belongs to. Plus the real auth flow, rate limits, and failure behavior. **Admin tools are listed once as an exclusion set and then dropped** | `docs/22d-connector-inventory.md` | M |

**Exit:** every chapter has an identified, non-conflicting source; the
inactive-behavior exclusion list is explicit.

> **⚠️ Amended by doc 23 §11.1 (2026-08-06, PR #230): the manuals are release
> 1.1.0.** Three bindings on the phases below, detailed in
> [`22b`](./22b-source-map.md) §10:
>
> 1. **Phase 2 must add the release gate with the routes.** The guide routes and
>    the More-tab entry ship behind `releaseActive("1.1.0")` — one gate at the
>    route boundary — or the manual goes live chapter by chapter and the 1.1.0
>    announcement has nothing to announce. `NEXT_PUBLIC_RELEASE_OVERRIDE` on a
>    Vercel **preview** deploy is how staged chapters get reviewed, including the
>    Phase-1 exemplar.
> 2. **Phase 2 owes doc 23 an export.** §9.4's section IDs are now literally an
>    API with two consumers: release-note `guide` targets resolve through **the
>    same** validator. `src/content/releases/links.ts::GUIDE_SECTION_IDS` ships
>    empty and names doc 22 Phase 2 as the thing that fills it.
> 3. **The interleave** is `doc 23 P0–P4 → doc 22 P0–P2 → doc 23 P5 → doc 22
>    content phases → cut 1.1.0`. Doc 23 P0–P4/P6 and doc 22 Phase 0 are done, so
>    **doc 22 Phases 1–2 are the critical path to 1.1.0**.
>
> From Phase 1 onward each PR also follows doc 23 §9.3: append to
> `src/content/releases/unreleased.ts` when it changes something a user would
> notice. Phase 0 did not, and owed no entry.

### Phase 1 — Architecture & one exemplar — ✅ **BUILT 2026-08-07, awaiting owner sign-off**

| Scope | Size |
|---|---|
| Block model types (`src/content/manual/types.ts`), the section-ID scheme, and the length budget calibrated against real copy. **Hard-rule-8 design pass** recorded in `docs/09-design-changelog.md` before building. Then **one chapter end-to-end** — proposed: **chapter 6 (Effort: RIR and the ramp)**, which exercises headings, glossary terms, tables, callouts, a three-layer mechanism section, cross-links, and a multi-section split | M |

> **Landed.** `src/content/manual/{types,ids,budget,index}.ts` (9 block kinds —
> `figure` deferred to Phase 2 with its asset policy, 09-changelog 2026-08-07
> §5); IDs of the form `ug/effort-rir#per-exercise` with a route mapper per
> manual; the budget **confirmed unchanged at 350 words / 12 blocks** against
> real copy (six sections, 205–309 words, median 229). The design pass is the
> 2026-08-07 changelog entry, claiming figs **4.8 / 4.9 / 4.10**. Chapter 6
> ships as six sections behind `releaseActive("1.1.0")`, rendered by
> `src/components/manual/ManualBlocks.tsx` at
> `/more/guide/effort-rir[/<section>]`. [`22a-manual-claims.md`](./22a-manual-claims.md)
> is open with **22 rows**, all verified against code.
>
> **It found two defects in shipped copy** (ledger `D-01`, `D-02`), both in
> `GLOSSARY.e1rm`: the RIR direction stated backwards, and a definition leaning
> on the unexplained abbreviation "RM". Both fixed and pinned in the same PR —
> surfaced precisely because [§8.1](#81-the-glossary-is-one-source-not-two)
> forces the manual to render the glossary's own words.
>
> **Owner review round 2 (2026-08-07)** returned four notes, folded in above and
> generalized as [§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07):
> prev/next and the labelled `related` list were **pulled forward from Phase 2**,
> the `legend` block was added (a tenth kind — show the mark, do not describe
> it), and the abbreviation rule became a contract. The remaining note was
> approval.

**Exit:** owner has seen the rendered exemplar and signed off on look, depth,
voice, and section granularity — **round 2 answered, ✅ signed off**. Review path
is a Vercel **preview** deploy with `NEXT_PUBLIC_RELEASE_OVERRIDE=1.1.0`
([`22b`](./22b-source-map.md) §10.1).

> **Navigation caveat for the reviewer:** the More-tab entry row and the guide
> **map** are Phase 2, so until then the reader is reachable only by typing
> `/more/guide/effort-rir`. That is scope, not a defect.

### Phase 2 — Reader infrastructure

| Scope | Size |
|---|---|
| The **map** route (fig 4.8) and **search**; deep-link marking, breadcrumb-back, the build-time index + search UI (lazily loaded), and the remaining content-contract tests from [§8](#8-content-contracts) — plus the two outstanding **D3 performance guards**: the import guard and the precache-exclusion assertion. More-tab entry row, and `GUIDE_SECTION_IDS` populated for doc 23 ([`22b`](./22b-source-map.md) §10.2). The `figure` block and its asset policy (09-changelog 2026-08-07 §5) | M–L |

*(Phase 1 shipped the chapter-contents and section routes, the block renderer,
link-target validation, the release gate, and the length budget — plus, from
owner review round 2, **prev/next and related sections**, which this row no
longer owes.)*

**Exit:** the exemplar chapter is reachable, searchable, deep-linkable; CI
enforces the contracts *and* the performance guards. Everything after this is
content.

### Phase 3 — User Guide content

One PR per group. Usage before mechanism; chapter 10 after its vocabulary.

| Phase | Chapters | Size |
|---|---|---|
| **3a** | 1 What WORKOUT is · 2 Your profile · 3 The cycle model | M |
| **3b** | 4 Planning a mesocycle · 15 Exercises & templates | M |
| **3c** | 5 Training a session | M |
| **3d-r** | **Research pass** for chapter 7 → `docs/reviews/2026-08-xx-rir-ramps-and-training-styles.md`, evidence-tagged per doc 10's convention ([§6.3](#63-rir-ramps-and-training-styles)) | M |
| **3d** | 7 Choosing your ramp · 8 Exercise-level RIR · 9 Deloads — the effort cluster, written together so the three levers read as one system | L |
| **3e** | 11 Why the app asks how it felt · 12 Volume | M |
| **3f** | **10 How your next weight is chosen** — anchor, e1RM, its role, confidence, double progression | L — own review gate |
| **3g** | 13 Reading your stats · 14 Macrocycle goals | M |
| **3h** | 16 Body data · 17 Prescription details · 19 Your data | M |
| **3i** | 18 Connecting an AI · 20 Glossary (generated) · 21 Troubleshooting & FAQ | M |

(Chapter 6 ships in Phase 1.) Each PR: content blocks + claims-ledger rows +
contracts green.

### Phase 4 — User Guide review gate

| Scope | Size |
|---|---|
| Cold read end to end for coherence, duplication, and vocabulary drift across chapters written in different sessions. **Re-validate every claims-ledger row against code** — the check that catches a claim true at Phase 0 and changed during Phase 3 (Batch 32 is the proof this is needed). Owner review | M |

### Phase 5 — Connector retrieval *(was Phase 6; promoted — [§10.4](#104-consequence-for-the-plan))*

| Scope | Size |
|---|---|
| `workout://user-guide-index` resource, `search_manual` and `get_manual_section` tools over the build-time index, per-section `keywords` and glossary aliases, `app_route` on every result. Ships before the AI Manual content so chapter 4 describes a connector that can read the manual | M |

### Phase 6 — AI Manual content

| Phase | Chapters | Size |
|---|---|---|
| **6a** | 1 What the connector is · 2 Setup · 3 The rules it operates under · 4 What it can do | M |
| **6b** | 5 Macrocycle use case · 6 Mesocycle use case | M — **every transcript actually run** ([§7.1](#71-worked-examples-are-the-deliverable)) |
| **6c** | 7 Performance analysis · 8 Coaching | M — same rule |
| **6d** | 9 Getting good answers · 10 How to read its answers · 11 Notes/exclusions/preferences · 12 When it gets something wrong | M |
| **6e** | Rework `/more/connector` into a hub: keep the endpoint and connect steps, add the manual entry; owner review over the whole AI Manual | S |

### Phase 7 — Link placement *(deliverable C)*

| Phase | Scope | Size |
|---|---|---|
| **7a** | **Placement audit.** Every screen, candidate insertion points, the exact section ID each targets, and a justification. Decide the grammar: `InfoDot` stays term-level; a manual link is mechanism-level and is a distinct affordance. Placement is earned, not sprayed. Links pass a section **ID**, never an imported module (D3 guard). Owner reviews the list before any code | M |
| **7b** | Implement approved wave-1 placements | M |
| **7c** | Remainder / follow-up wave after the owner has used wave 1 | S–M |

### Phase 8 — Maintenance rules

| Scope | Size |
|---|---|
| Amend `CLAUDE.md`: **a PR that changes user-visible behavior updates the manual and its claims-ledger rows in the same PR** — the discipline the backlog-row rule already enforces. Point the repo `README.md` at the manuals and fix its stale status line. Close the `N74` backlog row | S |

*(Already done when this plan was written: the doc-22 entry in the CLAUDE.md doc
index, the `N74` backlog row + `log.md` entry, the workstream **M** pointer.)*

---

## 12. Sequencing & risks

```
0a ─┐
0b ─┼─→ 1 (exemplar) ─→ 2 (infrastructure) ─→ 3a…3i ─→ 4 ─→ 5 (retrieval) ─→ 6a…6e ─┐
0c ─┤                                                                                 │
0d ─┘                                                                    7a ─→ 7b ─→ 7c ─→ 8
```

Phase 0's audits are parallelizable. Phase 3's groups are independent of each
other once Phase 2 lands, except 3d-r → 3d. Phase 7 needs both manuals' section
IDs to exist.

| Risk | Mitigation |
|---|---|
| **The app changes under the manual** — Batch 32 proved this in one day | The claims ledger (§8.3), the Phase-4 re-validation, the Phase-8 CLAUDE.md rule |
| **Documenting behavior that isn't live** (v20/v23) | Phase 0a's explicit exclusion list; **O3** accepted |
| **The manual becomes the 100-page document the owner warned about** | §9.1 section-as-unit + §9.3 enforced length budget, failing the build with the offending section ID |
| **Offline support degrades launch performance** (D3's condition) | Three enforced guards: import guard, precache exclusion, lazy search index — none of which are aspirational |
| **Voice drift across 21 chapters and many sessions** | Phase-1 exemplar; five contract tests; Phase-4 cold read |
| **Overclaiming** | §8.2 as a test, not an intention |
| **Chapter 7's program examples make unverifiable third-party claims** | The 3d-r research pass, evidence tags, and open question **O7** |
| **Fabricated connector transcripts** | Phase 6 acceptance: examples are run, not imagined |
| **Chapter 10 becomes a spec rewrite** | Depth layer 3 caps it; deeper than that is a link, not prose |
| **The reader clutters the app** | Phase 7a's owner-reviewed placement audit |

---

## 13. Owner decisions & answered questions

Round 1, 2026-08-06.

| # | Decision | Outcome |
|---|---|---|
| **D1** | In-app, both | ✅ accepted — routes re-cut to section granularity per §9 |
| **D2** | Typed block model | ✅ accepted |
| **D3** | Offline availability | ✅ accepted **conditionally** — only if launch/load times are unaffected. Satisfied by cache-on-read rather than precache, with three enforced guards ([§4](#d3--offline-availability-accepted-conditionally)) |
| **D4** | Two surfaces, one system | ✅ accepted |
| **D5** | Three-layer depth | ✅ accepted |
| **O1** | Offline manual reads | ✅ folded into D3 — worth having only because it is free |
| **O2** | User Guide entry point | ✅ More tab in Phase 2; revisit at Phase 7a |
| **O3** | Document inactive engine behavior? | ✅ **omit** until activated |
| **O4** | AI Manual audience floor | ✅ start from zero, **and use plain words** — "Claude or ChatGPT" not "LLM", "connector"/"plug-in" not "MCP". Now a copy contract ([§8.5](#85-plain-language-vocabulary)) |
| **O5** | Real or synthetic transcript data | ✅ real numbers, lightly generalized |
| **O6** | Mine the FAQ from `docs/notes/` | ✅ yes |

### Still open

| # | Question | Recommendation |
|---|---|---|
| **O7** | Chapter 7 asks for "examples of programs that use different approaches". Name real published programs, or describe approaches generically? | **Describe approaches by characteristic**, and name a published program only where the ramp property is documented and citable, with the citation and an explicit "WORKOUT does not implement this program." Naming programs creates checkable third-party claims that go stale and can read as endorsement — but the owner asked for examples, so this is a call about *how far*, not *whether* ([§6.3](#63-rir-ramps-and-training-styles)) |
| **O8** | Should manual edits be possible at runtime via an admin tool, rather than through a PR? | **Not as designed; keep content in the repo.** Full analysis in [§14](#14-could-an-admin-mcp-tool-edit-the-manual) — with a narrow errata overlay held in reserve if the friction turns out to be real |

---

## 14. Could an admin MCP tool edit the manual?

> Owner: *"If the user manual is hosted in the repository, could admin-gated MCP
> tooling be used to edit the documentation? This may provide an easier way to
> make small, interactive changes than relying on Claude Code to create new pull
> requests, but would it introduce other risks or complications?"*

**The mechanical answer first:** not directly. Under D2 the manual is compiled
into the build. The deployed app on Vercel has a read-only filesystem and is
rebuilt from git on every deploy, so a running MCP tool cannot change what is
served. Any runtime edit path therefore has to pick one of two routes, and both
have real costs.

### Path A — the tool commits to GitHub via the API

Requires a repo-write GitHub token in the app's server environment. That is a new
high-value secret in an app whose threat model currently includes **no** repository
access at all: a compromised app environment would gain write access to the source
tree. Each edit also triggers a deploy (minutes, not seconds), and committing
straight to `main` bypasses CI — including the five content contracts in
[§8](#8-content-contracts), which are precisely what keeps the manual honest.
Committing to a branch instead is safe but is exactly the PR loop the owner wants
to avoid. **Not recommended.**

### Path B — move manual content into the database

Edits become instant with no deploy. But content leaves the repo, so the
glossary-identity test, the honesty copy test, the length budget, the
link-validation test, and the claims ledger can no longer run in CI over the live
text — the entire anti-rot mechanism, given up to save a PR. It also converts the
manual from a build asset into a runtime read, forfeiting D3's free offline
behavior and adding a database round trip to every manual page; and it needs
migrations, RLS, and an authoring surface. Worst of all it splits the source of
truth: a repo copy and a DB copy that diverge. **Not recommended.**

### Path C — keep content in the repo; make the edit loop cheap *(recommended)*

The friction here is PR ceremony, not editing. Because D2 makes content **data**,
a wording fix is a one-line change in a data file, in a docs-only PR with no
runtime risk surface — a short Claude Code session, and CI still proves the
contracts hold. That is a better trade than a permanent new secret or a forked
source of truth, and it costs minutes.

### Path D — a narrow errata overlay *(held in reserve)*

If, after real use, the "a wrong sentence is live until the next PR" gap turns out
to matter, the minimal fix is **not** a runtime editor: it is an admin tool that
writes a small `manual_errata` table keyed by section ID, which the renderer
displays as a dated correction note **beneath** the section, never rewriting the
body. Wrong statements get corrected in seconds, the correction is visibly a
correction, the source of truth stays in the repo, every contract keeps running,
and the real fix lands in a batched PR that clears the row. Roughly one table, one
tool, and a small render change. **Recommendation: do not build it now** — build it
only if Path C's latency is observed to be a genuine problem, so we are not
carrying an authoring system nobody uses.

---

## 15. Relationship to other docs

- **Doc 10** is authoritative for every metric definition the manual states; doc 22 never redefines one.
- **Docs 16 / 17 / 19 / 21** are authoritative for progression, macro goals, explanations, and exercise-level RIR; chapters 8, 9, 10, 14, 17 report them.
- **Doc 09** is authoritative for screen structure; chapters 4, 5, 13, 15 report it.
- **Doc 05** is authoritative for the connector surface; the AI Manual reports it. When they disagree, doc 05 is right and the manual is a bug.
- **N25** (archived) is the predecessor: `InfoDot` + glossary is the term-level layer; this manual is the mechanism-level layer above it. They share one glossary.
- Workstream **M** ("In-app help & education") is this work's home in `docs/notes/`.
