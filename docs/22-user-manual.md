# 22 — User Manual & AI Manual (build spec + phased plan)

**Status:** building — Phases 0–3, 5 and 6 are done. Phases in [§11](#11-the-phased-plan).
**Owner ask (2026-08-05):** review the repository, the app's real functionality,
and every note/doc produced so far, then produce two user-facing manuals — a
**User Guide** and a dedicated **AI/MCP Manual** that lives under the AI
connector settings page — and afterward place links to them at the points in the
app where they help most.
**Phases 0–3 built** (2026-08-06/11) — the User Guide is complete at **21
chapters, 106 sections** — **Phase 5 with them** (2026-08-12): the connector can
search and read it. **Phase 6 is built** (2026-08-13): the AI Manual is complete
at **12 chapters, 48 sections**, its reader is mounted under `/more/connector`,
and every chapter 5–8 example was run against the live connector as
[§7.1](#71-worked-examples-are-the-deliverable) requires. **Phase 4, the owner's
cold read, is in progress** and now covers both manuals; **Phase 7** (link
placement) is next. **O7 is answered** by the 3d-r research pass
([§6.3](#63-rir-ramps-and-training-styles)).
**One decision is back with the owner:** D3's offline promise is withdrawn on
the reasoning in [§4](#d3--offline-availability-accepted-conditionally).
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
separate owner-gated step (`docs/deployment/manual-operations.md`). Until
2026-08-10 that described **v26 — the doc 21 §6.1 measuring band**, which shipped
complete and inert; **v26 is now active and nothing on the list is inactive**.
Per **O3**, the manual documents live behavior only — which cuts both ways, and
the second cut is the expensive one: an activation makes prose that was correct
when written **incomplete**, silently, with no code diff to review. The band's
own activation did exactly that to four chapters and five ledger rows
([`22a`](./22a-manual-claims.md) `D-21`).

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
Phase 1 landed the block model, the section-ID scheme, the length budget, the
house-styled renderer, and the section/chapter routes; **Phase 2 landed the map,
search, deep-link entry, the five content contracts and the three D3 guards**.
Only the maintenance rule remains outstanding (Phase 8).

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
   a test asserts the precache manifest carries no manual assets. *(Phase 2:
   shipped — and the mechanism was simpler than assumed, because
   `additionalPrecacheEntries` already replaces the public-directory glob and
   `server/**` is excluded by the plugin. 09-changelog 2026-08-08 §6.)*
3. ~~**Offline still works, for free, for anything you have read.**~~ ⚠️
   **Withdrawn at Phase 2 — this reasoning was wrong.** See the correction
   below.

Net: **cache-on-read, not precache.** No launch cost, and fully within hard
rule 9 (immutable build assets only). The search index is the one shared
artifact big enough to matter, so it is lazily fetched on first search rather
than imported by the guide routes.

> **Correction (2026-08-08, Phase 2) — offline manual reading is not
> delivered, and on the owner's own terms it should not be bought.**
>
> Promise 3 assumed a chapter becomes a hashed asset under `/_next/static/**`,
> where `sw.ts`'s `CacheFirst` rule would pick it up. It does not. The reader is
> **server-rendered** — deliberately, so a section of any depth costs the reader
> no JavaScript (09-changelog 2026-08-07 §4) — so its prose lives in the HTML
> and the RSC payload, both of which `sw.ts` serves `NetworkOnly` by design
> (R7 / hard rule 9). Nothing about a chapter ever enters the static-asset
> cache. Offline, a guide navigation gets `/~offline` like every other screen.
>
> Buying it back would mean either shipping the prose as client JavaScript
> (contradicting the reader's own design and inflating every route) or
> precaching the guide (contradicting **D3 guard 2** and the owner's launch-cost
> condition outright). **O1** accepted offline reading *"only because it is
> free"* — it is not free, so the recommendation is to leave it withdrawn.
> **Owner call needed only if that reasoning is not accepted.**
>
> **D3's condition is unaffected and fully met**: the guards exist to keep the
> manual off the app's hot paths, which was never the same question as offline.
> All three shipped and are enforced ([§11](#11-the-phased-plan) Phase 2).

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
  > **Source note (Phase 0a, folded in at Phase 1; amended 2026-08-12).** That reassurance is doc 21 **§6.2** — the read-time comparability policy — and it is what the chapter is built around. The **measuring band** (§6.1, `max_measuring_rir`) is a *different* rule, asked at the stamp: *is this a measurement at all*. It went live in v26 and moved to **5 RIR** in v27, so ch. 8 carries both: §6.2 as the reassurance, the band as the boundary case past it (a target further than 5 reps from failure is priced and performed but not measured). Ch. 10 states the same rule as a fourth, unrated rating. Ch. 9 owns the consequence for the standard deload, now 8 RIR and therefore above the band. [`22b`](./22b-source-map.md) §4.1 ①, [`22a`](./22a-manual-claims.md) `D-21`/`D-22`.
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
- **How ramp choice interacts with everything else** — set counts and deload timing. *(The fourth interaction — how much of your data is usable as a strength measurement — stays out of this chapter on seam grounds: all working-ramp values remain measurable through v27's 5-RIR cutoff. Ch. 8 owns exercise-level targets beyond it; ch. 9 owns the appended 8-RIR deload. See §6.2's source note.)*

**Constraint on the "example programs" ask (open question O7).** Naming
third-party published programs means making checkable claims about someone else's
work, which go stale and can be wrong, and it risks reading as endorsement or as
"WORKOUT implements this." Recommended treatment: describe approaches by their
**characteristics**, and where a widely-known approach is referenced, name it only
where the ramp property is a documented, citable feature of the published program,
cite the source, and state plainly that WORKOUT is not implementing that program.
Owner call in [§13](#13-owner-decisions--answered-questions).

> **Taken, 2026-08-11 (3d-r).** No program is named. The research found no
> citable ramp *specification* — the literature studies proximity to failure as a
> variable, not as a published program's schedule — so a name would have rested
> on that program's own commercial materials, which the claims ledger cannot
> verify. Reasoning and the one-block reversal path: the review's §6.

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
`workout://coaching-guide`, plus `workout://user-guide-index` added in Phase 5
([§10](#10-how-the-connector-finds-things-in-the-manual)) — four at 1.1.0.
Re-verified from `registerTool` call sites at Phase 6: **58 registered, 17
admin-gated and excluded, 41 user-facing**.

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

### 8.4b Standing authoring rules from owner review round 3 (2026-08-08)

Seven notes came back off the Phase-3a chapters. Like [§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07)
these are **rules for every chapter after them**, not corrections to three.
Chapter 3 was signed off as the composition model — *"focused and substantive.
All chapters should aim to be composed this way"* — so where a rule below is
abstract, ch. 3 is what it looks like.

1. **Orientation before detail. A chapter's depth is set by its place in the
   reading order.** Chapter 1 introduces basic operation; a behavior that is
   secondary, conditional, or an edge case belongs to the chapter that owns the
   surface. The test is *does a reader who has never opened this screen need
   this yet?* — and if the answer is no, it moves, however true it is. Phase 3a
   failed this three times in one chapter: the Workout tab's session-resume
   pointer and the entire version-history feature were introduced before the
   reader had been told what the Workout page shows.
2. **Every sentence carries substance.** A sentence the reader would skip is a
   sentence that should not be there. *"Every list and detail screen paints its
   own frame the moment you tap"* was true, sourced, and useless.
3. **Distill — never describe a description.** Where the app already explains
   something on screen, state the **point**, once, in plain words. Quoting app
   copy through a `ui` run is for labels, controls, and lines the reader must
   **find** on screen; it is not for explanation they can already read there.
   *This corrects the round-1 reading of [`22c`](./22c-app-inventory.md) §B5.2:*
   "extend, do not restate" means **take it further**, not quote-then-gloss.
4. **The reader's words, not the build's.** [§8.5](#85-plain-language-vocabulary)
   bans the connector's vocabulary; this bans the app-designer's. *Renders*,
   *surface*, *state*, *component*, *route* describe how the thing was made. A
   reader has a page that shows things.
5. **Never define a thing by what it is not** — including rhetorically.
   [§8.4](#84-positive-framing)'s test catches capability-absence; the same
   failure in the shape *"X does not lead to Y. It is Y"* passes the test and
   fails the rule. Say what it is, first, in the first sentence.
6. **Weight follows importance.** How much space a thing gets is a claim about
   how much it matters. A section titled *what the profile is for* that spent
   two paragraphs and a callout on bodyweight while barely answering its own
   title is a proportion failure, independent of whether each sentence is true.
7. **Draw what is structural.** Where the subject is a hierarchy, a nesting or a
   sequence, a `figure` carries it better than a list can. The reader should be
   able to see the shape.

### 8.4c Standing authoring rules from owner review round 4 (2026-08-11)

Three notes came back off the Phase-3b chapters. Like
[§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07) and
[§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08),
these bind **every chapter after them**. All three are the same underlying
failure — a chapter documented its own surface accurately and left the reader
worse off than the app would have.

1. **Where a better path exists, name it — even when another chapter owns it.**
   Ch. 4 documented three in-app routes into a block and said nothing about
   planning one through the connector, which is the most capable and usually the
   easiest route there is. Completeness about one surface is not service to the
   reader. The rule is **point, do not explain**: name the route, say what it is
   better at, say where it lives, and hand off to the chapter that owns it. A
   chapter that owns a *task* owes every way of doing it; a chapter that owns a
   *surface* owes only that surface's depth.
2. **Define an advanced term where the reader meets it, not where the manual
   files it.** *This narrows [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
   rule 1 rather than contradicting it.* Reading position sets **depth**; it does
   not license leaving a term undefined at first use. Ch. 4's volume check put
   `UNDER MEV` and `OVER MRV` in front of a reader eight chapters before ch. 12
   defines them. [§8.1](#81-the-glossary-is-one-source-not-two) makes the fix
   free — render the `term` card, which is the app's own words, and let the
   owning chapter go deeper. If the term has no glossary entry, that is the
   signal to add one, per [`22c`](./22c-app-inventory.md) §C2.
3. **Before writing "here is where you do X", find every surface that does X.**
   Ch. 4 described planner-board editing as though it were the only way to change
   a running block; the day view's exercise menu does the same work, and carries
   a propagation control the chapter never mentioned. A grep for the action, not
   for the screen, is the check — and it is the same discipline
   [`22b`](./22b-source-map.md) §9 already demands of claims.

> **The owner's fourth note is a design proposal, not an authoring rule.**
> *"Advanced terms deserve definitions when used, or perhaps links to the
> glossary, or clickable pop-up definitions, identified with underline as an
> alternate to the circled i icon. This could be a useful standard tool for
> definitions of complex terms throughout the app."* That is a second `InfoDot`
> affordance — an inline underlined term rather than a trailing ⓘ — which is a
> new interaction pattern and therefore a hard-rule-8 design pass. Tracked as
> **N81** and folded into [§11](#11-the-phased-plan) **Phase 7a**, where the
> link-placement grammar is decided anyway: 7a already owes the ruling on
> `InfoDot` (term-level) versus a manual link (mechanism-level), and this is the
> third affordance in that same grammar. Rule 2 above is what the manual does in
> the meantime, and it needs no app change.

### 8.4d Standing authoring rules from owner review round 5 (2026-08-11)

Four notes came back on the Phase-3c and Phase-3e chapters. Like
[§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07),
[§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08) and
[§8.4c](#84c-standing-authoring-rules-from-owner-review-round-4-2026-08-11),
they bind **every chapter after them**.

1. **Where the reader enters a value, say what the value does — and who reads
   it.** *This is the counterweight to [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
   rule 1, not an exception to it.* Reading position sets depth; it does not
   license a section that asks for input and explains nothing. A reader lands on
   the screen chapter or the mechanism chapter with equal probability, and
   **either must leave them able to proceed**: the point of entry owes the
   one-line effect and a link, the owning chapter owes the reasoning. Ch. 5's
   feedback and completion sections described the controls without saying which
   knob the reader was pulling.
   The second half of the rule is the one that is easy to miss: **say who else
   reads it.** Exercise and session notes are legible to the connector, which
   makes a note a message to two readers — yourself next week, and whoever helps
   you plan. That is load-bearing for how the app is actually used, and no
   chapter had said it.
2. **An overview section is an answer, not an index.** A first section whose
   content is *"the sections below explain this"* has spent a screen and told
   the reader nothing. It must be complete **at its own depth** — every field,
   one line each — so a reader who stops there still knows what their answers
   do. Ch. 11 §1 deferred all five of its subjects to its own later sections.
3. **Never claim a virtue by negation.** A third shape of the failure
   [§8.4](#84-positive-framing) and
   [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
   rule 5 already chase: praising the app for an absence of friction —
   *"with nothing to wait for and nothing to confirm"*, *"nothing about it is
   hidden"*, *"nothing is lost by dismissing the sheet"*. The owner's word for
   it was **self-congratulatory**, and it is the right one: each of those
   sentences had a direct positive form available and reached for applause
   instead. **Enforced** by a denylist in `contracts.test.ts` over *authored*
   prose — a `term` block's body is the glossary's copy, so a rule the manual
   could satisfy only by paraphrasing a card (and breaking
   [§8.1](#81-the-glossary-is-one-source-not-two)) is the app's decision, not
   the manual's.

### 8.4e Standing authoring rules from owner review round 6 (2026-08-11)

Six notes came back on the Phase-3d and Phase-3f chapters. Like
[§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07)
through [§8.4d](#84d-standing-authoring-rules-from-owner-review-round-5-2026-08-11),
they bind **every chapter after them** — and unlike the earlier rounds, two of
them are about *what the manual believes*, not about how it writes.

1. **Effort is the thing this app is for. Do not write a cautious manual.**
   The owner's framing, and it is a correction to a real drift across the effort
   cluster: *"leaving reps in reserve is a fatigue-management tool, not a growth
   tool. If you can recover from the fatigue, pushing to or near failure more
   frequently can yield better results… If I had to guess, most people probably
   do not train hard enough."* Where a trade-off is real, give **both** sides
   their weight; a sentence that only ever names the cost of effort is not
   neutral, it is an argument. Chapter 7 had four ramp descriptions in which the
   easier option always sounded safer and the harder one always sounded
   expensive, which is not what the evidence in its own research pass says.

2. **A build identifier belongs in the exact-rule layer and nowhere else.**
   *"Do not mention app variable names, such as `e1rm.mod_max_rir`, outside of
   the exact-rules sections."* This is [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
   rule 4 in its most literal form. Layer 1–2 states the **value in the reader's
   terms** ("3 or fewer reps short of failure"); the greppable parameter name
   goes in a `detail`. **Enforced** by a test over non-`detail` blocks, and
   [§8.2](#82-the-honesty-contract)'s "a current value carries its path" check
   moved from block scope to **section** scope so the grep chain survives the
   move. Where a derived relationship is what the reader gets, **the ledger
   records the derivation** so a parameter change finds the prose that depends
   on it.

3. **Give the real formula.** Where a formula is the answer, print it —
   `w × (1 + r ÷ 30)` beats "the Epley formula, see `e1rm.rir_offset`". A reader
   who wants the mechanism wants the mechanism.

4. **Say it and move on.** No rule-counting scaffolding (*"Two rules cover the
   whole feature"*), no origin stories, and no elaborate metaphor where a plain
   noun exists — the owner struck *valve*, *shedding* and *performance debt* from
   chapter 9 in one pass, and the plain sentences that replaced them are shorter
   and say more. The owner's word for the failure was **classroom lecture**.

5. **Consolidate.** *"We do not need to spread closely related topics across so
   much surface area."* Chapter 9 lost a section by merging *what a deload is*
   with *when you need one*, because they are one question. The
   [§9.3](#93-the-section-length-budget) budget stops a section sprawling; it
   does nothing about a **chapter** sprawling, and this rule is that gap closed.

6. **A control chapter owes the values that change behavior.** *"Users need to
   know what exercise-level RIR does, what it is for, how to use it, and which
   actual values trigger meaningful behavior in the app."* Where a reader types a
   number, the chapter owes a table of which numbers cross a threshold — not the
   thresholds' parameter names, per rule 2, but the numbers themselves.

> **One note is a product proposal, not an authoring rule.** *"Bar speed is
> frequently discussed as one of the better methods of estimating true RIR. I
> wonder if this can be generalized into guidance that helps users estimate
> proximity to failure. This could be included in an info card somewhere in the
> app or emphasized in coaching explanations."* That is a new in-app surface (an
> `InfoDot` or a coaching-line trigger), so it is a hard-rule-8 design pass and
> is tracked as **N83** (N82 was independently claimed by the day-view focus
> pass while this review sat unmerged). Chapter 7 §4 carries the guidance as
> *prose* in the
> meantime, which needs no app change.

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

> **Amended 2026-08-08, owner review round 3.** This section originally required
> the map to list **every section inline**, so that any section was one tap from
> `/more/guide`. The owner reversed it: *"the guide landing page should show only
> the chapter titles and one-liners, with click-through to view the subsections.
> This would keep each view manageable."*
>
> **The reversal is right, and the original reasoning was the mistake.** §9's
> whole premise is that a manual fails by becoming one untraversable document —
> and an inline map is exactly that failure moved up a level. With 21 chapters at
> ~6 sections it would have been a ~130-row wall, which is a worse orientation
> surface than the thing it was optimizing a tap away from. **Browsing depth and
> reading depth are different problems**: the tap budget below is what matters
> for a reader who knows what they want, and search and Phase 7's in-app links
> already serve them at 1 and 0 taps. A reader who is *browsing* wants the shape
> of the manual, which is 21 titles, not 130 rows.
>
> The chapter page therefore joins the critical path, and in exchange it gains
> **chapter-level prev/next** so cover-to-cover browsing works the way
> section-level prev/next already makes cover-to-cover reading work
> ([§8.4a](#84a-standing-authoring-rules-from-owner-review-round-2-2026-08-07)
> rule 4, applied one level up).

| From | To a section | Taps |
|---|---|---|
| A link placed in the app (Phase 7) | the exact section | **0** — the link *is* the section route |
| Search | the section | **1** — results are section routes |
| `/more/guide` (the map) | any section | **2** — chapter, then section. The map is 21 titles with a one-line summary each, so the shape of the manual fits on a screen or two |
| A chapter page | the next chapter | **1** — chapter prev/next |
| A section | the next section | **1** — prev/next crosses chapter boundaries, so cover-to-cover reading stays "next, next, next" |

The chapter route is now both the orientation layer and the stable breadcrumb
parent. Search is what keeps the second tap from mattering to a reader who
already knows what they are looking for.

### 9.3 The section-length budget

The mechanism that stops long sections from re-creating the problem. A section
targets **one to two phone screens**: roughly ≤ 350 words and ≤ 12 blocks, to be
calibrated against the Phase-1 exemplar. Over budget → split the section, or move
detail into a layer-3 `detail` block, which is collapsed by default and therefore
**does not count** toward the budget. Enforced by a test that fails the build with
the offending section ID, so the constraint is felt at authoring time rather than
discovered by a reader.

### 9.4 The rest

1. **Contents page per manual** — chapters with one-line descriptions, in reading order. *(Amended 2026-08-08 per [§9.2](#92-shortest-paths): titles and summaries only. The section list is the chapter page's job.)*
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
>
> **O-B closed 2026-08-10** — the owner activated v26 after ch. 8 shipped, so the
> chapter was written from the live §6.2 policy and gained the band afterwards in
> a drift pass ([`22a`](./22a-manual-claims.md) `D-21`). O-A remains open.

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

### Phase 2 — Reader infrastructure — ✅ **BUILT 2026-08-08**

| Scope | Size |
|---|---|
| The **map** route (fig 4.8) and **search**; deep-link marking, breadcrumb-back, the build-time index + search UI (lazily loaded), and the remaining content-contract tests from [§8](#8-content-contracts) — plus the two outstanding **D3 performance guards**: the import guard and the precache-exclusion assertion. More-tab entry row, and `GUIDE_SECTION_IDS` populated for doc 23 ([`22b`](./22b-source-map.md) §10.2). The `figure` block and its asset policy (09-changelog 2026-08-07 §5) | M–L |

*(Phase 1 shipped the chapter-contents and section routes, the block renderer,
link-target validation, the release gate, and the length budget — plus, from
owner review round 2, **prev/next and related sections**, which this row no
longer owes.)*

> **Landed.** The design pass first (hard rule 8): 09-changelog **2026-08-08**,
> claiming fig **4.11 — guide search** and building fig 4.8.
>
> - **The map** (`/more/guide`) — every chapter with its sections inline, so
>   [§9.2](#92-shortest-paths)'s one-tap requirement holds; a corpus count in
>   the meta line, and the search row above the list.
> - **Search** (`/more/guide/search`, fig 4.11) — live-filtering as you type
>   (the app's own P20 grammar), results as section rows with a **snippet**
>   rather than the authored summary, and three distinct empty states.
>   `search.ts` is the lexical index [§10](#10-how-the-connector-finds-things-in-the-manual)
>   describes — title/keyword/glossary-alias/summary/body weighting, prefix
>   matching, an all-terms bonus — and it is the same artifact Phase 5's
>   `search_manual` will serve. **The design claim is tested, not asserted:**
>   `search.test.ts` queries the real chapter, including one hand-authored
>   keyword the prose never says ([§10.3](#103-the-honest-limit-and-what-to-do-about-it)).
> - **Deep-link entry** — `?from=` re-points the breadcrumb at the screen the
>   reader came from (N27) and moves the chapter parent to the right of the same
>   row; the landed section carries the accent ■. `from` is validated against an
>   allowlist, never trusted. One recorded deviation: the mark persists for the
>   visit rather than fading (09-changelog 2026-08-08 §3).
> - **The five [§8](#8-content-contracts) contracts** are now tests
>   (`contracts.test.ts`): glossary identity with a **pending-terms ledger that
>   may only shrink**, the honesty contract including *every cited
>   `engine_params` path resolving against the schema*, the claims ledger parsed
>   and every row's section resolved, positive framing, and plain language.
> - **The three D3 guards** (`guards.test.ts`), the third of them reading the
>   **built** service worker — CI re-runs the suite after `npm run build`.
> - **`figure`** with its asset policy: single-colour line art under
>   `public/manual/`, rendered as a CSS mask so it is correct in both themes,
>   in its own 32-entry runtime cache ahead of the app-chrome image rule. First
>   use is the ramp diagram in ch. 6, which states shape and no tunable value.
> - **`GUIDE_SECTION_IDS`** populated for doc 23 — as **literal strings**, since
>   `links.ts` is reachable from the app shell and importing the registry there
>   would break D3 guard 1 on its first use. `link-targets.test.ts` resolves
>   every one through the registry instead: one validator, two consumers.
> - **The More-tab row** (`Guide`, first under `SETTINGS`), gated with the
>   routes.
>
> **Two findings.** The **D3 promise-3 correction** above — offline manual
> reading is not delivered by this architecture — and the serwist reading in
> 09-changelog 2026-08-08 §6, which the first pass at guard 2 got wrong.

**Exit:** the exemplar chapter is reachable, searchable, deep-linkable; CI
enforces the contracts *and* the performance guards — **met**. Everything after
this is content.

### Phase 3 — User Guide content

One PR per group. Usage before mechanism; chapter 10 after its vocabulary.

| Phase | Chapters | Size |
|---|---|---|
| **3a** | 1 What WORKOUT is · 2 Your profile · 3 The cycle model — ✅ **BUILT 2026-08-08** | M |
| **3b** | 4 Planning a mesocycle · 15 Exercises & templates — ✅ **BUILT 2026-08-10** | M |
| **3c** | 5 Training a session — ✅ **BUILT 2026-08-11** | M |
| **3d-r** | **Research pass** for chapter 7 → [`docs/reviews/2026-08-11-rir-ramps-and-training-styles.md`](./reviews/2026-08-11-rir-ramps-and-training-styles.md), evidence-tagged per doc 10's convention ([§6.3](#63-rir-ramps-and-training-styles)) — ✅ **DONE 2026-08-11** | M |
| **3d** | 7 Choosing your ramp · 8 Exercise-level RIR · 9 Deloads — the effort cluster, written together so the three levers read as one system — ✅ **BUILT 2026-08-11** | L |
| **3e** | 11 Why the app asks how it felt · 12 Volume — ✅ **BUILT 2026-08-11** | M |
| **3f** | **10 How your next weight is chosen** — anchor, e1RM, its role, confidence, double progression — ✅ **BUILT 2026-08-11**, owner review gate open | L — own review gate |
| **3g** | 13 Reading your stats · 14 Macrocycle goals — ✅ **BUILT 2026-08-11** | M |
| **3h** | 16 Body data · 17 Prescription details · 19 Your data — ✅ **BUILT 2026-08-11** | M |
| **3i** | 18 Connecting an AI · 20 Glossary (generated) · 21 Troubleshooting & FAQ — ✅ **BUILT 2026-08-11** | M |

(Chapter 6 ships in Phase 1.) Each PR: content blocks + claims-ledger rows +
contracts green.

> **3a landed 2026-08-08; owner review round 3 revised it 2026-08-09.** Chapters
> 1–3, now **eleven** sections, 114–285 words each against the 350 budget
> (corpus median 225, so the exemplar's densest section is still the
> ceiling-brusher). The review's seven rules are
> [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
> and its navigation reversal is [§9.2](#92-shortest-paths); **ch. 3 was signed
> off as the composition model for every chapter after it**. Ch. 1 lost its
> version-history section outright (not a primary function — 22c already assigns
> it to ch. 19) and its Workout-tab section was rewritten from an edge case into
> an orientation; ch. 2's first two sections were re-proportioned and stopped
> quoting the app's own explanatory copy back at the reader; ch. 3 gained a
> nesting figure. **`day_slot` was added to `glossary.ts`** — the
> first of [`22c`](./22c-app-inventory.md) §C2's ten, taken because ch. 3
> depends on it and [§8.1](#81-the-glossary-is-one-source-not-two) forbids a
> manual-only definition. **The decision on the other nine: each lands with the
> chapter that needs it**, so the definition is authored by the pass that
> verifies the behavior behind it. The pending-terms ledger shrank by three
> (`macrocycle` / `mesocycle` / `microcycle`, the three [`22c`](./22c-app-inventory.md)
> finding C1-a names as defined-but-unsurfaced — ch. 3 renders all three).
>
> **Two findings, both recorded in [`22a`](./22a-manual-claims.md), neither
> fixed here** (Phase 3a is content; [§1.2](#12-scope-boundaries) forbids
> behavior changes): **`D-06`** — `EQUIPMENT ACCESS` has no consumer in the app
> at all, only in the connector's `get_profile`, so a reader toggling `barbell`
> off changes nothing they can see; **`D-07`** — the profile's own body-fat copy
> says a blank field falls back to training age, which v21's `bf_proxy_pct`
> made one step short. Ch. 2 documents the truth in both cases and states it
> positively.

> **3b landed 2026-08-10.** Chapters **4** (Planning a mesocycle) and **15**
> (Exercises & templates), six sections each, 138–228 words against the 350
> budget — the corpus median moves 225 → 215, so ch. 6's mechanism section is
> still the ceiling-brusher and the two new chapters sit comfortably under it.
> Written to ch. 3's composition model
> ([§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)):
> ch. 4 draws the planner board's day → muscle-group → slot nesting as a
> `figure` (rule 7, and the dashed open slot is the board's own mark), and
> ch. 15 leaves MEV/MRV to ch. 12, the strength reads to ch. 10/13, and
> `BACKED OFF` to ch. 8 rather than half-defining any of them (rule 1).
> **`load_step` was added to `glossary.ts`** — the second of
> [`22c`](./22c-app-inventory.md) §C2's ten, under 3a's standing decision that
> each term lands with the chapter that needs it.
>
> **Three findings, all recorded in [`22a`](./22a-manual-claims.md), none fixed
> here** ([§1.2](#12-scope-boundaries) again): **`D-08`** — the create-mesocycle
> sheet hardcodes `DELOAD AT 4 RIR` while the live `deload.target_rir` is **8**,
> so the one screen where a user sets the deload up is the one screen that
> misstates it; **`D-09`** — [`22c`](./22c-app-inventory.md) §B2.6 tabulated
> *four* ways to start a block from the page's copy, but `Meso builder` renders
> disabled with `" (soon)"`, which is [§2](#2-why-this-is-harder-than-it-looks-read-before-phase-0)'s
> own failure mode occurring inside the audit written to prevent it (22c is
> corrected in place); **`D-10`** — N46's missing template-edit path, which ch. 15
> states as the positive rule instead ([§8.4](#84-positive-framing)).
>
> **Owner review round 4 (2026-08-11) returned three notes on ch. 4**, all folded
> in and generalized as [§8.4c](#84c-standing-authoring-rules-from-owner-review-round-4-2026-08-11).
> §1 gained **the connector as a planning route** — named, not explained, because
> it is the most capable path and ch. 4 had been silent about it; §4 now
> **renders the `volume_landmarks` card** where the reader first meets MEV and
> MRV, instead of deferring both to ch. 12 (the pending-terms ledger shrank by
> one); §6 gained **the day view as the other editing surface**, including the
> `Repeat this change on this day in future weeks` control and the fact that a
> reorder propagates without one. A fourth note — an inline underlined term as a
> second definition affordance — is a design proposal, tracked as **N81** and
> ruled on in Phase 7a with the rest of the link grammar.

> **3c landed 2026-08-11.** Chapter **5** (Training a session), six sections,
> 206–256 words against the 350 budget — the corpus median moves 215 → 218 over
> 35 sections. The first chapter written under
> [§8.4c](#84c-standing-authoring-rules-from-owner-review-round-4-2026-08-11),
> and the first content PR since Phase 2 that touches **no** design surface: no
> new block kind, no new asset, and [`22c`](./22c-app-inventory.md) §C2 marks
> every undefined string on this screen as manual-only, so no glossary term was
> owed either.
>
> The chapter walks the day screen — header and progress rule (skipped sets
> leave its denominator), the navigator, the set row, the two menus, the
> feedback prompts and the completion sheet — and holds three seams rather than
> restating them: **ch. 6** owns what the RIR box means and what a set above or
> below the ask does next week (linked twice inline), **ch. 4** owns the
> controls that edit the plan rather than the session, and **ch. 17** owns the
> prescription strip's layers, which ch. 5 names and hands off. That last one is
> also a live constraint, not only a seam: the coaching line's serving mode is
> still unconfirmed ([`22b`](./22b-source-map.md) §8 **O-A**). **One forward
> debt:** §5 (the feedback prompts) owes ch. 11 a typed cross-link, which lands
> with ch. 11 in Phase 3e — a link cannot be authored before its target
> resolves ([§9.4](#94-the-rest) 5).
>
> N68 is stated as the reader meets it — a tap is recorded on the phone and sent
> when it can be — because *"logging is queued"* is a build fact and *"a dead
> spot in the gym cannot strand you mid-exercise"* is what it buys
> ([§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
> rule 4). **31 new [`22a`](./22a-manual-claims.md) rows and no new defects** —
> worth recording, because this screen has been through more review passes than
> any other in the app.

> **3e landed 2026-08-11, out of sequence and deliberately.** Chapters **11**
> (Why the app asks how it felt) and **12** (Volume), five sections each,
> 157–227 words against the 350 budget; the corpus median holds at 215 over 45
> sections. 3d is gated on the 3d-r research pass ([§6.3](#63-rir-ramps-and-training-styles)),
> and these two are the pair that ch. 5 and ch. 4 were already handing off to —
> so taking them next closed a real forward debt rather than opening one.
>
> **The ±1 model is what these chapters document.** Doc 10 §3's graded
> MEV→MAV→MRV volume ramp and its two-week-at-MRV auto-deload trigger were
> deferred (T-A5) and are not implemented; [`22b`](./22b-source-map.md) §7 names
> this as one of the two spec-vs-code gaps that must be written from the code.
> Ch. 11 therefore describes one set off, one set on, or hold — and no automatic
> deload — while ch. 12 keeps MEV/MAV/MRV in the advisory role the code gives
> them.
>
> **Three things the chapters state that the specs do not.** The set-add branch
> needs *four* conditions met at once, not two. `session_dampen_require_both` is
> `true` on the live row, so a hard-but-strong session is **not** dampened — the
> hold needs a wiped-out reading **and** a poor one. And volume's logged counts
> apply a **hard-set filter** (non-warm-up, ≤ 4 reps in reserve, unreported
> counting) that is baked into the SQL view rather than into `engine_params`,
> which is exactly the kind of rule a spec-derived manual would have missed.
>
> The **pending-terms ledger shrank by three** — `pump`, `workload` and
> `fractional_sets` are now rendered — leaving only `deload` (3d),
> `e1rm_confidence` (3f) and `est_strength` (3g), each with the chapter that
> owes it. **Four parameters were added to [`22b`](./22b-source-map.md) §4.2**
> from a fresh read of the live row (still v25, hash-verified). Ch. 5's forward
> debt is paid: its feedback section now links into ch. 11.
>
> **One finding, `D-12`:** [`22c`](./22c-app-inventory.md) §B2.4 listed
> `TOP SET BY WEEK — KEY LIFTS` on the meso stats tabs; N10 removed that grid on
> 2026-07-03. Corrected in 22c, and flagged in its §C2 because the glossary
> recommendation attached to `KEY LIFTS` rests on a screen that no longer shows
> them — which **ch. 13** would otherwise have inherited.
>
> **One contract-machinery change.** [§8.2](#82-the-honesty-contract)'s
> "a current value carries its parameter path" check recognised **dotted** paths
> only, and several live parameters sit at the top level of the row
> (`pain_gate`, `workload_high`, `min_sets`). A bare identifier now counts as a
> citation when — and only when — the schema resolves it, so the check reaches
> the parameters these chapters actually cite. The dotted-path existence
> assertion is untouched.

> **3d-r and 3d landed 2026-08-11.** The **research pass**
> ([`docs/reviews/2026-08-11-rir-ramps-and-training-styles.md`](./reviews/2026-08-11-rir-ramps-and-training-styles.md))
> read all seven sources first-hand rather than summarizing doc 10's summary of
> them, and that is what it was for: **it found doc 10 §4's own rationale
> wrong.** *"Hypertrophy gains flatten past ~1–2 RIR"* is stated in doc 10 and
> repeated verbatim in `COACHING_GUIDE`, and neither cited paper establishes a
> plateau — Refalo 2023's failure-vs-non-failure effect is small but positive
> throughout, and the Robinson meta-regression found a **continuing** negative
> slope with intervals excluding null. Doc 10's *conclusion* survives (0 RIR is a
> peak-week ceiling); its argument does not. The manual states the **trade**
> instead — a small per-set gain, a steep per-set fatigue cost, and fatigue as
> what limits weekly sets — which is stronger, and is what ch. 7 is written from.
> Recorded as [`22a`](./22a-manual-claims.md) **`D-13`**; doc 10 and the
> connector's guide are theirs to correct ([§1.2](#12-scope-boundaries)).
>
> **O7 is answered, at its conservative end: no third-party program is named.**
> The recommendation in [§13](#13-owner-decisions--answered-questions) was
> *describe by characteristic, name only where the ramp property is documented
> and citable* — and the research turned up no citable ramp **specification**,
> because the literature studies proximity to failure as a variable rather than
> as a published program's schedule. Naming one would have meant sourcing it from
> that program's own commercial materials, which [`22a`](./22a-manual-claims.md)'s
> rule (code or the active params row) cannot verify. The four characteristic
> shapes carry the instructional load; adding a name later is one `detail` block,
> and the review's §6 records the cost so the owner can overrule cheaply.
>
> **Chapters 7, 8 and 9 — fifteen sections, 172–255 words against the 350
> budget**; the corpus median moves 215 → 212 over 61 sections, so the ch. 6
> exemplar's mechanism section (323) is still the ceiling-brusher after four
> content phases. Written together because the three levers are one system: ch. 7
> chooses the week's effort, ch. 8 overrides it per exercise, ch. 9 is the week
> that spends none of it — and each hands the other two their seams rather than
> half-explaining them.
>
> **Two things ch. 8 says that no spec does, both from the code.** The §6.2
> read-time policy is **asymmetric**, and the manual states the asymmetry as the
> reassurance it is: easier-than-the-week work is set aside from strength reads
> *and kept in volume, weight PRs and session-volume PRs*, because those last
> three are observations rather than estimates. And the earn gate refuses
> **explicitly** with reason `exercise_rir`, so "the program stops leading the
> weight up while you are backed off" is a stated behavior, not an inference.
> Per [`22b`](./22b-source-map.md) §4.1 ①, the **measuring band appears nowhere**
> — v26 is inactive, so today every logged set at every RIR is still treated as a
> measurement, and ch. 8 gains the band in the release that activates it (**O-B**).
> *(Amended 2026-08-10: v26 activated, and the band was added to ch. 8 as the
> boundary case beyond §6.2 — `D-21`. The paragraph above stands as the record of
> what the chapter was written from.)*
>
> **Ch. 9 is the chapter the specs would have got wrong.** Doc 22 §6.1's own
> *"MRV-stop rule"* is not implemented, and doc 10 §3's graded volume ramp with
> it ([`22b`](./22b-source-map.md) §7) — so the chapter says plainly that **the
> app deloads on a schedule and nothing triggers one**, and points at ch. 11 for
> what does happen week to week. Its evidence section carries a nuance doc 10
> does not: the one controlled trial had its deload group **stop training for a
> week**, which is a different intervention from the light week this app
> prescribes, so the trial argues against skipping training mid-block and says
> little about a deload week. Both halves are stated, because the first half
> alone reads as *deloads are useless*, which the study does not show.
>
> **`deload` is rendered, clearing the last of the 3a-era pending terms bar two**
> — `e1rm_confidence` (3f) and `est_strength` (3g), each with the chapter that
> owes it. **One defect, `D-13`** (above); **`D-08`** is stated the Phase-3a way —
> ch. 9 gives the true deload target and does not narrate the create sheet's
> stale literal.

> **3f landed 2026-08-11 — the headline chapter, and its review gate is open.**
> Chapter **10 How your next weight is chosen**, six sections, 185–292 words
> against the 350 budget; the corpus median holds at 215 over 67 sections. It is
> the chapter every other one has been handing off to — ch. 4, 5, 6, 7, 8, 9 and
> 12 each stop at *"the weight comes from your recent sets"* and point here.
>
> **The structure is the argument.** Four steps in order: a set becomes an
> estimate · the estimates fold into one anchor · the anchor prices a weight ·
> a clean week earns one step on top. Each section is one step, so a reader who
> stops anywhere has a true partial answer rather than half a mechanism.
>
> **The [`22b`](./22b-source-map.md) §6.1 correction is stated as a reason, not
> as a rule.** Ch. 6 already carries the Epley/Brzycki **cutoff** in its layer 3;
> ch. 10 owes the *why* — the two formulas agree over short heavy sets and one
> runs away upward past roughly ten effective reps, so averaging them is right
> inside that band and wrong above it. This doc's own §5 chapter-10 row was the
> thing Phase 0a corrected, and `C-wt-06` is where the prose is finally pinned to
> `e1rmFactor`.
>
> **Earned versus offered is the split that makes progression explicable.**
> §5 answers *did last session earn a step* (eight predicates, in the reader's
> words); §6 answers *is now when it gets spent* (the pacer plus three
> governors). Doc 16's principle 4 — **budget, never quota** — is the closing
> line of the chapter, because "none of these ever invents a step" is what stops
> the pacer reading as the app deciding how strong you are.
>
> **Two facts the chapter states that no chapter had.** The rep climb **rides
> the RIR step** (`climb_requires_rir_step`) and topping out is judged on your
> **lowest** performed working set (`climb_on_performed_reps`) — both live, both
> the kind of thing that reads as a bug when it surprises you. And
> `progression.goal_rate_factor` is **0 for cut and maintain**, so those blocks
> earn no steps at all; that was in the live row and in no manual sentence.
>
> **One defect, `D-14`, fixed here.** `GLOSSARY.e1rm_confidence` closed with a
> sentence describing the **measuring band** — v26, inactive — so the card
> claimed a rating tier no user has. It surfaced because ch. 10 is the first
> chapter to render that card: [§8.1](#81-the-glossary-is-one-source-not-two)
> forces the manual to carry the app's own words and **O3** forbids documenting
> inactive behavior, and the two contracts collided on one sentence. Removed,
> with a code comment carrying the exact text to restore when v26 activates.
> *(Restored 2026-08-10 — v26 activated and the comment made the revert a single
> edit, which is the case for recording removed copy where the next author will
> stand: `D-21`.)* It
> is the third defect §8.1 has caught in a card the manual was about to render,
> and the first found by **O3** rather than by the copy rules. The card has no
> `InfoDot` call site, so no reader had seen it.
>
> **The live row was re-read a third time** (`get_engine_params(25)`: still v25,
> `params_hash 91887f0f…`, hash-verified, `max_measuring_rir` still absent), and
> ten parameters were added to [`22b`](./22b-source-map.md) §4.2 under its own
> rule. **23 new [`22a`](./22a-manual-claims.md) rows** and an eight-row
> deliberately-absent table — the longest yet, because this chapter sits next to
> five others' subjects. **`e1rm_confidence` is rendered**, leaving `est_strength`
> (3g) as the last pending glossary term.

> **Owner review round 5 (2026-08-11) returned four notes across 3c and 3e**,
> all folded in and generalized as
> [§8.4d](#84d-standing-authoring-rules-from-owner-review-round-5-2026-08-11).
>
> - **Ch. 5 gained a seventh section, `#notes`.** Notes are legible to the
>   connector — *"a note to yourself, and to your training coach"* — which is
>   how the feature is actually used and which no chapter had said. The section
>   states the seam in both directions: prescriptions come from logged sets, and
>   a note is the context an assistant reasons from when you ask it to work
>   around a niggle or find a movement that suits you better. It was split out
>   rather than appended because the addition took `#adjusting-as-you-go` to 360
>   words, ten over budget — [§9.3](#93-the-section-length-budget) doing exactly
>   what it exists for.
> - **Ch. 5 §6 and §7 now say what each answer moves**, one line each, and link
>   into ch. 11 — a reader lands on either chapter and both must leave them able
>   to proceed.
> - **Ch. 11 §1 is now a complete answer at its own depth**: a five-row table
>   covering every field the app asks for, including the two it records rather
>   than acts on, so a reader who stops there is not left guessing.
> - **Three sentences claimed a virtue by negation** and are now direct. The
>   denylist that replaced them found a fourth the review had not named
>   (*"nothing is lost by dismissing the sheet"*), and it is scoped to authored
>   prose because `GLOSSARY.e1rm`'s *"so you never have to test one"* is the
>   app's copy — the manual renders it verbatim by contract and cannot reword it
>   ([§8.1](#81-the-glossary-is-one-source-not-two)). That scoping is a new
>   helper, `authoredProseOf`: contracts that judge **authorship** use it;
>   contracts that judge what a **reader takes away** — hype, precision,
>   overclaiming — keep reading the glossary's words too, because the reader
>   does not care who typed them.

> **Owner review round 6 (2026-08-11) returned notes across 3d and 3f**, all
> folded in and generalized as [§8.4e](#84e-standing-authoring-rules-from-owner-review-round-6-2026-08-11).
> Two of them are about what the manual *believes*, which is a first.
>
> - **The effort cluster had drifted cautious.** *"Leaving reps in reserve is a
>   fatigue-management tool, not a growth tool… most people probably do not train
>   hard enough."* Ch. 7 §3 now opens on exactly that, names the practical case
>   for visiting failure (it is the only way to calibrate what your own 0 feels
>   like, which every later report depends on), and closes on **effort and
>   consistency as the drivers** rather than on a menu of cautions. The
>   research pass supported this all along — its §2.1 has hypertrophy improving
>   toward failure and strength flat across RIR — and the first draft had read
>   the same evidence timidly.
> - **Parameter names left the prose.** Nine `code` runs sat in layer 1–2 across
>   six chapters, including two in the signed-off ch. 6 and ch. 2; all nine moved
>   into `detail` blocks, and [§8.2](#82-the-honesty-contract)'s current-value
>   check moved from **block** scope to **section** scope so the grep chain
>   survived. A new test fails the build on a parameter name outside a `detail`.
>   Where the reader now gets a derived relationship instead of a name, the
>   **ledger records the derivation** (`C-ramp-16`).
> - **Ch. 8 answered a question its own specifier got wrong.** The owner asked
>   whether backed-off sets leave the strength anchor. They do not — the anchor's
>   only exclusion is the measuring band, which is **inactive**, so every set at
>   every RIR anchors. Doc 21 §5 wants it that way (excluding them would freeze
>   the anchor and make the return jump to full load). What actually holds the
>   weight during a back-off is the **confidence ladder**. Recorded as
>   [`22a`](./22a-manual-claims.md) **`D-20`**, and it is the strongest argument
>   yet for the chapter existing: the person who specified the feature held the
>   inactive rule as their mental model. *(Amended 2026-08-10: they then activated
>   it. The rule now exists — above 8 assumed RIR, not "8 or above", and keyed on
>   the effort performed rather than on the back-off — and the chapter says so.
>   `D-21`. **Amended again 2026-08-12:** v27 lowered the boundary to 5, so only
>   work at 5 RIR or closer still anchors; confidence governs the 4–5 range and
>   exclusion governs anything easier. The standard deload moved to 8 and now
>   sits beyond the band by design.)*
> - **Ch. 9 lost a section and gained a control.** *What a deload is* and *when
>   you need one* merged, the *valve* / *shedding* / *performance debt* framing
>   went, and the chapter now documents what the first draft had missed outright:
>   a started deload **can** be dropped, via `End mesocycle` in the day view (or
>   `Skip remaining sets` per exercise), and attendance is untouched because
>   deload days never counted toward it.
> - **Ch. 10 states the formulas** — `w × (1 + r ÷ 30)` and `w × 36 ÷ (37 − r)` —
>   and corrects its own account of recency: **age decides which session wins,
>   not what it is worth.** The winning set is an argmax over estimate × recency;
>   the anchor's value is then that session's mean at full value. The first draft
>   implied stored numbers fade, and they never do.
>
> **One note is a product proposal**, tracked as **N83**: generalize bar speed
> into in-app guidance for judging proximity to failure, as a glossary card or a
> coaching-line trigger. It joins N81 in Phase 7a's affordance grammar. Ch. 7 §4
> carries the cue as prose meanwhile, which needs no app change.
>
> **3g landed 2026-08-11 — and it is the phase where the audit's own reading of
> a screen was wrong twice.** Chapters **13** (Reading your stats) and **14**
> (Macrocycle goals), eleven sections, 148–305 words against the 350 budget; the
> corpus median moves 215 → 209 over 78 sections, and ch. 6's mechanism section
> (323) is still the ceiling-brusher after six content phases.
>
> **`D-15` — the macrocycle target band is computed, stored, and never shown.**
> Doc 22 §5's own ch. 14 brief is *"the personalized target band and recommended
> timeframe; why it is a conservative band"*, and
> [`22c`](./22c-app-inventory.md) §B2.2 describes the create card as showing
> `EST. STRENGTH` and *"a model band"*. **It shows neither.** `YOUR TARGET`, the
> rate, the rationale and the model band are hidden by **N54** (owner,
> 2026-07-11) on all three surfaces that would print them — the create form, the
> edit form, and the macro Overview's `REALISTIC TARGET` card. `planMacrocycle`
> still runs, `macrocycles.target_*` still persists, and the band still does two
> jobs the reader feels: it paces how fast the weights climb, and it is what the
> closeout grades against. So ch. 14 §3 documents a number **with no screen to
> point at**, and names the two surfaces that do return it — a connected
> assistant, and a completed macro's `RETROSPECTIVE` band. The second half of
> the same finding: `macro_target.present: "conservative_end"` has **no code
> consumer at all** — `COACHING_GUIDE`'s prose is its only reader, so *"you see
> the conservative end"* is a rule about what an AI tells you. Both corrected in
> [`22c`](./22c-app-inventory.md) and [`22b`](./22b-source-map.md) §4.2.
>
> **`D-16` closes the thread `D-12` opened.** `D-12` found the audit describing
> a grid N10 had removed; this found the parameter that grid was the only reader
> of — `key_lifts.n` / `selection`, live on v25, with no consumer anywhere in the
> repo. [`22b`](./22b-source-map.md) §4.2 had it filed under ch. 13, and
> [`22c`](./22c-app-inventory.md) §C2 recommended adding `KEY LIFTS` to the
> glossary. Ch. 13 claims nothing about key lifts, and the §C2 row is closed
> rather than re-sited: a card for a term no screen shows is the §C1-a defect
> that table exists to shrink.
>
> **Ch. 13 is built around what a number is being compared against**, because
> that is what the questions in `docs/notes/` are actually about. Its last two
> sections carry the three exclusions (deloads, backed-off sessions, mis-log
> outliers) with the disclosure line that explains a missing lift, and then the
> two live surprises: **sets logged in a workout you have open count
> immediately**, and **stats show each estimate undecayed while the prescription
> path fades older sessions** ([`22b`](./22b-source-map.md) §5.6's PH39 note —
> the one workstream-A passage that is still true and still confusing).
>
> **The asymmetry in the back-off policy is stated as the reassurance it is.**
> A backed-off session leaves the strength trend, `best_e1rm` and the PR views,
> and **stays** in volume, weight PRs and session-volume PRs — because those are
> observations of what you lifted rather than estimates of what you could, and
> the app holds the second kind to a stricter bar. **`est_strength` is
> rendered**, which empties `PENDING_GLOSSARY_TERMS` outright: every one of the
> fifteen glossary keys now resolves to a `term` block somewhere in the guide,
> five phases ahead of ch. 20 generating them.
>
> **46 new [`22a`](./22a-manual-claims.md) rows** across the two chapters, plus
> two deliberately-absent tables. The live row was **re-read a fourth time**
> (`get_engine_params(25)`: still v25, `params_hash 91887f0f…`, hash-verified,
> `max_measuring_rir` still absent) — and this read produced two *absences*
> rather than values: `strength` is not on the row at all, so ch. 13's trend
> runs on the engine's own defaults (`3` · `3` · `1.5`%), which is what its
> layer 3 says.

> **3h landed 2026-08-11.** Chapters **16** (Body data), **17** (Prescription
> details) and **19** (Your data), fourteen sections, 118–214 words against the
> 350 budget — the tightest group yet, and the corpus median moves 209 → 203
> over 92 sections. Ch. 19's `#deleting-your-account` is the shortest section in
> the manual at 118 words, which is the right length for it: the app's own copy
> is already careful, and [§8.4b](#84b-standing-authoring-rules-from-owner-review-round-3-2026-08-08)
> rule 3 forbids describing a description.
>
> **`D-17` — the quick entry that does not update what the app trains you on.**
> Three surfaces write a bodyweight and they do not behave alike: the profile
> editor and the day view's bodyweight chip each write the profile figure **and**
> append a measurement, while the More tab's `Log bodyweight` appends the
> measurement **only**. That is doc 17 §5's deliberate boundary —
> `bodyweight_log` is measurement substrate and the profile figure is the engine
> input, never derived from it — but the row is labelled `Log bodyweight` and
> shows the latest measurement, so a reader who weighs in there has every reason
> to think the app now works from it. It does not: bodyweight-loaded movements
> and the target model keep reading the older profile figure. Ch. 16 §1 states
> the split as a three-row table and says which action serves which intent,
> which is [§8.4c](#84c-standing-authoring-rules-from-owner-review-round-4-2026-08-11)
> rule 3 (*find every surface that does X*) doing exactly what it was written
> for — the rule found the third writer.
>
> **Ch. 17 is the chapter O-A constrains, and it is written to survive either
> answer.** [`22b`](./22b-source-map.md) §4.1 ② is explicit: document the
> deterministic ask and why as always rendered, and treat the coaching line as
> conditional. So §4 states the doc 19 §3 architecture claim rather than the
> feature — the engine authors every number, the deterministic lines are a
> **complete** explanation, and a coaching line is additive under its own
> `COACH` rule. Every sentence there is true whether serving is `on` or
> `shadow`, so answering **O-A** adds a trigger-policy paragraph rather than
> forcing a rewrite.
>
> **Ch. 19 is where hard rule 9 becomes a reader-facing sentence.** Reads are
> live — a navigation with no connection reaches a short screen with a retry,
> which the app's own offline copy already frames honestly — and set logging is
> queued, so a tap is recorded on the phone and sent when it can be. The chapter
> also picks up doc 23's two version surfaces ([`22c`](./22c-app-inventory.md)
> §B5.1a assigns them here): the What's New sheet appears once per unseen feature
> release, accumulates skipped ones, and stays away from a workout you have
> started logging.
>
> **53 new [`22a`](./22a-manual-claims.md) rows** across the three chapters,
> plus three deliberately-absent tables; `GUIDE_SECTION_IDS` +14. Ch. 19's table
> is the first to record a **vocabulary** exclusion rather than a scope one:
> row-level security, policies and service-role scoping are all real and all
> named by their build words, so the chapter claims what a reader can act on —
> the data is scoped by the database rather than by the screen — and leaves the
> mechanism to doc 03.

> **3i landed 2026-08-11, and Phase 3 is complete.** Chapters **18**
> (Connecting an AI), **20** (Glossary) and **21** (Troubleshooting & FAQ) —
> fourteen sections, 135–236 words. **All 21 chapters, 106 sections**, median
> **200** words against the 350 budget, and ch. 6's mechanism section (323) has
> been the ceiling-brusher since Phase 1, which is the calibration holding
> across nine content phases and eight authoring-rule revisions.
>
> **Ch. 20 retires `PENDING_GLOSSARY_TERMS`.** [§8.1](#81-the-glossary-is-one-source-not-two)'s
> end state — every `GlossaryKey` resolving to a `term` block — was enforced
> until now by a list that could only shrink, which is a contract that enforces
> nothing until someone remembers to shorten it. The chapter replaces it with an
> assertion: **every key is filed into exactly one of chapter 20's five groups**,
> so a term added to `glossary.ts` and left unplaced fails CI. The grouping and
> the one orienting line per group are authored; every definition is the app's
> own copy rendered at read time, which is what "generated" was always supposed
> to mean here. **No manual-only term proved necessary** — §5 allowed for them,
> and every advanced term a chapter needed got a `glossary.ts` entry instead
> (`day_slot`, `load_step`), which is the same rule pushing the other way.
>
> **Ch. 18 takes [§8.5](#85-plain-language-vocabulary)'s one allowance, for the
> first time.** `MCP` appears in exactly one section — the setup steps — because
> the app's own field reads `ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR` and a
> reader who has not been told the word cannot complete the step. `MAY_SAY_MCP`
> in `contracts.test.ts` was written empty in Phase 2 for precisely this case.
> The chapter carries **no typed link into the AI Manual**: `ai/**` sections do
> not exist, and [§9.4](#94-the-rest) 5 forbids authoring a link before its
> target resolves — a **forward debt** in the ch. 5 → ch. 11 pattern, paid by
> Phase 6e.
>
> **Ch. 21 is mined, and one mined question had to be rewritten.**
> [`22c`](./22c-app-inventory.md) Part D's `F18` asks *"why is the target only
> the low end of the range?"* — a premise `D-15` disproves, since no app screen
> shows the band at all. It is answered as *where is my macrocycle target*
> instead, pointing at ch. 14. `F11` is the one [`22b`](./22b-source-map.md)
> §4.3 insisted on: the 2026-08-02 re-levelling moved 9 087 historical estimates
> **upward**, and nothing else in the manual would explain a long-time user's
> numbers changing overnight. The two open product decisions (**T-A7**
> in-session repricing, **T-A8** in-progress sets) are stated as current
> behavior and promised nothing, per [`22c`](./22c-app-inventory.md) Part E 4.
> `F10` is linked to ch. 13 rather than answered twice — answering a mechanism
> in two chapters is how two chapters drift.
>
> **One test moved rather than broke.** Phase 2's search assertion pinned
> *"estimated one-rep max"* to ch. 6, on the reasoning that a section is findable
> by a card it renders without ever writing the phrase. With ch. 20 shipped the
> glossary section ranks first — the right answer to a bare term search, produced
> by the same alias mechanism. The test now asserts both.
>
> **42 new [`22a`](./22a-manual-claims.md) rows** and three deliberately-absent
> tables; `GUIDE_SECTION_IDS` +14, and it now covers all 106 sections. **Phase 4
> is next**: a cold read end to end, and a re-validation of every ledger row,
> `22b`, `22c` and `22d` against the code.

### Phase 4 — User Guide review gate

| Scope | Size |
|---|---|
| Cold read end to end for coherence, duplication, and vocabulary drift across chapters written in different sessions. **Re-validate every claims-ledger row against code** — the check that catches a claim true at Phase 0 and changed during Phase 3 (Batch 32 is the proof this is needed). Owner review | M |

### Phase 5 — Connector retrieval *(was Phase 6; promoted — [§10.4](#104-consequence-for-the-plan))* — ✅ **DONE 2026-08-12**

| Scope | Size |
|---|---|
| `workout://user-guide-index` resource, `search_manual` and `get_manual_section` tools over the build-time index, per-section `keywords` and glossary aliases, `app_route` on every result. Ships before the AI Manual content so chapter 4 describes a connector that can read the manual | M |

> **Landed** — built while the owner's Phase-4 read is in progress, which the
> sequencing allows: retrieval reads whatever the registry holds, so a wording
> change from the review needs no change here.
>
> **The design claim held.** [§10.1](#101-why-not-rag) argued that authorship had
> already done the chunking, so ranking would be enough and no embedding store
> was needed. The retrieval tests were written as that claim's falsifier — plain
> paraphrase, in a reader's words, resolving to the section a person would have
> picked ("why did my weight go up" → `ug/how-your-weight-is-chosen#leading-by-one-step`,
> "what does the app do with my answers" → `ug/how-it-felt#what-your-answers-do`).
> They passed on the authored `keywords` as they stood, with no tuning of the
> ranking and no keyword added to make a test pass. **No embeddings, and the
> §10.3 mitigation 3 trigger has not fired.**
>
> **Three additions the plan did not name, each earning its place:**
> - **A second renderer, not a second copy.** `src/content/manual/markdown.ts` renders the block model as markdown, so `get_manual_section` returns *the section the reader sees* — including the `detail` layer (collapsed on screen, never withheld from a read) and the [§8.2](#82-the-honesty-contract-is-a-test-not-an-intention) estimate caveat, whose omission on the way to a model is precisely the overclaiming doc 10 §9 forbids. A cross-link renders as its **in-app route**, not its ID.
> - **The gate.** The whole surface is registered behind `releaseActive("1.1.0")` alongside the guide routes ([`22b`](./22b-source-map.md) §10, doc 23 §9.2) — before the release those routes 404, so a searchable manual would only hand out links the reader cannot open. A test drives the gate open via `NEXT_PUBLIC_RELEASE_OVERRIDE` and asserts the tools and the resource appear, so the release PR is not the first thing to find out whether the switch works. `unreleased.ts` gains the entry [`22d`](./22d-connector-inventory.md) §10 said this owed.
> - **One line of server instructions**, gated with the tools, carrying the one distinction a model will not otherwise draw: **the guide documents the app, the data tools report the user.**
>
> **One guard was widened, with its reason asserted rather than trusted.** D3's
> import guard now allows `src/lib/mcp/` — the guard is about *client* bundles
> and the MCP surface is `server-only` throughout — and a companion assertion
> fails if any MCP module that imports the manual drops the directive.

### Phase 6 — AI Manual content — ✅ **BUILT 2026-08-13**

| Phase | Chapters | Size |
|---|---|---|
| **6a** | 1 What the connector is · 2 Setup · 3 The rules it operates under · 4 What it can do | M |
| **6b** | 5 Macrocycle use case · 6 Mesocycle use case | M — **every transcript actually run** ([§7.1](#71-worked-examples-are-the-deliverable)) |
| **6c** | 7 Performance analysis · 8 Coaching | M — same rule |
| **6d** | 9 Getting good answers · 10 How to read its answers · 11 Notes/exclusions/preferences · 12 When it gets something wrong | M |
| **6e** | Rework `/more/connector` into a hub: keep the endpoint and connect steps, add the manual entry; owner review over the whole AI Manual | S |

> **Landed.** The design pass first (hard rule 8): 09-changelog **2026-08-13**,
> whose governing decision is that **there is no second design**. D4 already
> made the two manuals one system, and the block model, renderer, ID scheme,
> budget and reader chrome were manual-agnostic from Phase 1 — the *routes* were
> the only thing hardcoded to `ug`. So figs 4.8 / 4.9 / 4.10 are reused at a
> second root rather than redrawn, **no new figure number is claimed**, and no
> eleventh block kind was needed.
>
> - **The reader** (`/more/connector/guide[/<chapter>[/<section>]]`). The map and
>   chapter screens lift into `ManualScreens.tsx` and both manuals' route files
>   become thin callers; three things vary and all three are data the screens
>   already read.
> - **One search, over both manuals**, which is what [§9.4.3](#94-the-rest) asked
>   for before either existed. A result row now leads with its manual — chapter
>   numbers restart per manual, so `CH 4` alone named two chapters — and the back
>   link follows the reader in through the same `?from=` allowlist the section
>   screen uses.
> - **12 chapters, 48 sections, 80 ledger rows** in [`22a`](./22a-manual-claims.md),
>   every one verified against `src/lib/mcp/**` and the migrations rather than
>   against [`22d`](./22d-connector-inventory.md) ([`22b`](./22b-source-map.md)
>   §9.2 — and that discipline is what found `D-18`).
> - **[§7.1](#71-worked-examples-are-the-deliverable) is met, not approximated.**
>   Every chapter 5–8 exchange was run live on 2026-08-13, the write half as a
>   create → capture → delete round-trip on the owner's explicit approval, with
>   `get_macrocycles` re-read afterwards to confirm the account was as found.
> - **6e**: `/more/connector` keeps its address and its three connect steps and
>   loses the `ACCESS & REVOCATION` paragraph that was chapters 2 and 3 said
>   worse; its intro is corrected per [`22d`](./22d-connector-inventory.md) §7
>   **K3**. Ch. 18's **forward debt is paid** — the hand-off links it could not
>   author in Phase 3i now resolve.
>
> **Two defects, both found by writing prose against code.** `D-18`:
> [`22d`](./22d-connector-inventory.md) §5 said the requesting client is recorded
> in the write audit; the table is `(user_id, tool, args_hash, summary,
> created_at)` and has no client column. `D-19`: [`22d`](./22d-connector-inventory.md)
> §7 **K1**'s stale e1RM caveat is worse than stale — one
> `analyze_exercise_progress` response carries *"Epley-based"* in `data_quality`
> and *"Epley·Brzycki"* in its own `metric_definitions`, so a connected assistant
> is handed two accounts of the same number.
>
> **Two things the plan did not name.** `GUIDE_SECTION_IDS` gained the AI
> Manual's 48 IDs **and a completeness test** — it had been complete in practice
> since Phase 3 and nothing said so, and now a new section is a link target the
> moment it exists. And the two links from `/more/connector` into the manual are
> literal strings in their own module, resolved by a test: the page is outside
> D3's import allowlist, and a route file may only export what Next reserves.

**Exit:** both manuals are readable, searchable and connector-legible; the AI
Manual's four use cases are demonstrated with exchanges that were run. Owner
review of the AI Manual folds into **Phase 4**, which now covers both manuals.

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

> **O7 closed 2026-08-11** by the 3d-r research pass, which took the
> recommendation below at its conservative end — ch. 7 names no third-party
> program, and the reasoning plus the cheap reversal are in the review's §6. Left
> in place rather than deleted because the owner may still want names.

| # | Question | Recommendation |
|---|---|---|
| **O7** (closed) | Chapter 7 asks for "examples of programs that use different approaches". Name real published programs, or describe approaches generically? | **Describe approaches by characteristic**, and name a published program only where the ramp property is documented and citable, with the citation and an explicit "WORKOUT does not implement this program." Naming programs creates checkable third-party claims that go stale and can read as endorsement — but the owner asked for examples, so this is a call about *how far*, not *whether* ([§6.3](#63-rir-ramps-and-training-styles)) |
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
