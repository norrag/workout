# 22 — User Manual & AI Manual (build spec + phased plan)

**Status:** plan — no content written yet. Phases in [§9](#9-the-phased-plan).
**Owner ask (2026-08-05):** review the repository, the app's real functionality,
and every note/doc produced so far, then produce two user-facing manuals — a
**User Guide** and a dedicated **AI/MCP Manual** that lives under the AI
connector settings page — and afterward place links to them at the points in the
app where they help most.

> **This doc is the spec.** The build is spec-driven (CLAUDE.md); doc 22 is
> authoritative for the manuals' information architecture, content contracts,
> hosting decision, and phase order. It does **not** override any behavior spec:
> where doc 22 describes engine behavior it is *reporting* docs 10/14/16/17/19/21
> and the code, never defining it. If a conflict is found, the behavior doc wins
> and doc 22's text is the bug.

---

## 1. What we are actually producing

Two deliverables, one content system.

| # | Deliverable | Audience | Home |
|---|---|---|---|
| **A** | **User Guide** — what the app is, how to use it, what its terms mean, and (plain-language) how the parts that produce numbers actually work | Any athlete using WORKOUT | In-app, reachable from More and from context-specific entry points throughout the app |
| **B** | **AI Manual** — setup, concept, tool surface, and worked use cases for the MCP connector | Users connecting an LLM client | In-app, under `/more/connector` |

Plus one follow-on, deliberately sequenced last:

| # | Deliverable | Notes |
|---|---|---|
| **C** | **Link placement pass** — deep links from dense app surfaces into the exact manual section that explains them | Owner explicitly wants this *after* the content exists, so the placement decisions are made against real sections |

### 1.1 Objectives restated as acceptance criteria

The owner's objectives, turned into things that can be checked:

- **Defines key terms.** Every term the app renders to a user has exactly one definition, and the manual's definition is the same words as the in-app `InfoDot` (see [§7.1](#71-the-glossary-is-one-source-not-two)).
- **Explains how to use the app.** Every screen in the app's route map has a "how to use it" section (route map audited in Phase 0b — [§9](#9-the-phased-plan)).
- **Explains how it functions, prioritizing understandability.** Named examples from the ask: how the strength anchor is derived, which methods compute e1RM (Epley/Brzycki average over effective reps), and what role e1RM plays. Delivered as layered depth: a one-line answer, then a plain-language mechanism, then an optional "the exact rule" block.
- **Explains reasoning in plain language.** Every mechanism section carries a *why this way* paragraph (e.g. why the two e1RM formulas are averaged; why deloads are framed as a fatigue valve and not a growth booster).
- **Indexed, well formatted, searchable, easy to navigate.** Concrete requirements in [§8](#8-navigation--search-requirements).
- **Covers the AI connector.** The User Guide gets a short connector chapter that hands off to the AI Manual; the AI Manual carries the depth.
- **AI Manual demonstrates the four named use cases.** Macrocycle creation/management, mesocycle creation/management, performance analysis, coaching — each as a worked example, not a feature list.

### 1.2 Explicitly out of scope for this work

- Any change to engine behavior, prescriptions, or stats. Documentation only.
- Admin/tuning workflows as *user* documentation. The 17 admin-gated MCP tools ([§6.2](#62-the-tool-surface-56-tools)) get a short "these exist and are role-gated" note in the AI Manual and nothing more; they are not user features.
- MEASURE (doc 20). It is not built; the manual documents what ships.
- Marketing copy, onboarding tours, video, or a public docs site.

---

## 2. Why this is harder than it looks (read before Phase 0)

Four things make a naive "read the docs and write it up" approach produce a
wrong manual.

**2.1 The docs contradict each other by design.** This repo supersedes in place:
09 beats 08 and 06; 19 supersedes parts of 18; doc 21 Phase 1 *amends the doc 11
RIR premise*; doc 16 owns progression internals while 17 owns macro goals; doc 10
owns metric definitions. Several docs also describe things that shipped
**inactive** pending owner activation (engine_params v20/v23 — see PROGRESS and
`docs/deployment/manual-operations.md`). A manual written from prose alone will
document behavior that is not live. **Phase 0a exists to resolve this before a
word of user-facing prose is written.**

**2.2 The code is the only reliable source for what a user sees.** Numbers,
labels, thresholds, and defaults must be read from `src/lib/engine/`,
`engine_params`, `src/lib/glossary.ts`, and the screens themselves — not from
spec prose, which may describe a design that was later corrected in review.

**2.3 The honesty guardrails are binding on this manual too.** Doc 10 §9 and the
`COACHING_GUIDE` (`src/lib/mcp/coaching-guide.ts`) forbid overclaiming: e1RM is an
estimate and never a tested max; deloads are fatigue management, not a growth
booster; MEV/MAV/MRV numbers are heuristics; pump and soreness are weak signals;
push:pull balance is advisory, with no posture/injury-prevention claims;
model-based targets show the conservative end with no progress bar. A user manual
is exactly the surface where these get quietly softened into confident marketing
claims. They must not be. See [§7.2](#72-the-honesty-contract).

**2.4 Voice is a hard rule, not a preference.** CLAUDE.md hard rule 7 governs
every rendered surface: no hype copy, no exclamation marks, tracked all-caps
labels, lowercase logotype, orange for current position/selection only, square
corners, dashed borders for planned/empty. Hard rule 8 (pixel fidelity) applies
to the manual screens as much as any other: no mockup figure exists for a manual
reader, so the house-style transcription must be recorded in
`docs/09-design-changelog.md` **before** the reader is built (the same procedure
doc 21 Phase 6 followed).

---

## 3. What exists today that we build on (audited 2026-08-05)

Not starting from zero. Confirmed present:

| Asset | Location | Relevance |
|---|---|---|
| **Glossary** — 13 terms, honest-by-contract copy, enforced by a copy test | `src/lib/glossary.ts` | The manual's term definitions must *be* these, not paraphrase them |
| **`InfoDot`** — circled-i → anchored glossary card | `src/components/ui/InfoDot.tsx` | The existing in-app help grammar; the manual extends it rather than replacing it (N25, PR #148) |
| **Coaching guide** — the science paradigm + guardrails, already written for an LLM audience | `src/lib/mcp/coaching-guide.ts`, served as `workout://coaching-guide` | A large fraction of the User Guide's "how it works" chapters is a *translation* of this to an athlete audience |
| **Connector page** — endpoint, 3-step connect, revocation | `src/app/(app)/more/connector/page.tsx` | The AI Manual's entry point; this page becomes a hub, its current copy becomes the manual's chapters 1–2 |
| **MCP surface** — 56 tools, 3 resources | `src/lib/mcp/tools/`, `src/lib/mcp/resources.ts` | The AI Manual's subject |
| **Doc 11** — engine explainer (with the doc-21 amendment) | `docs/11-workout-engine-explainer.md` | Source for the prescription-mechanism chapters |
| **Doc 10** — metric definitions + defaults | `docs/10-metrics-spec.md` | Source of record for every number the manual states |
| **Backlog workstream M** — "In-app help & education" | `docs/notes/README.md` | This work's home workstream; N25 is its shipped predecessor |

**Not present:** any markdown renderer (no `react-markdown`/MDX in
`package.json`), any `/help` or `/guide` route, any search index, and any
manual-maintenance rule in CLAUDE.md. Those are net-new and are why Phases 1–2
exist.

---

## 4. Decisions to settle before content is written

These are the calls that change what the later phases build. Recommendations are
given so the default path is clear; the owner overrides where they disagree.

### D1 — Where do the manuals live? **Recommendation: in-app, both.**

The AI Manual's home is fixed by the ask ("under the AI connector settings
page"). The User Guide should match: a manual the athlete can only read on
GitHub fails the "easy to navigate" objective for the person holding a phone
mid-workout, and link placement (deliverable C) is meaningless without in-app
targets.

Proposed routes:

```
/more/guide                      user guide — index/contents
/more/guide/[chapter]            a chapter, with anchored sections
/more/connector/guide            AI manual — index/contents
/more/connector/guide/[chapter]  a chapter
```

The AI Manual sits *under* the connector route so its parentage is structural,
not just a link.

### D2 — How is content authored and rendered? **Recommendation: typed content modules, no new dependency.**

Three options considered:

| Option | Verdict |
|---|---|
| Add `react-markdown`/MDX and render `.md` | **Rejected.** New runtime dependency against the WS-J bundle guard; markdown can't express the house components (ledger rules, tracked-caps section heads, InfoDot cards, figure blocks) without a custom component map that ends up bigger than option 3 |
| Hand-build every section as bespoke TSX | **Rejected.** ~30 chapters of bespoke JSX is unreviewable and drifts in style immediately |
| **Typed block model** — content as data (`src/content/manual/*.ts`) with a small house renderer | **Recommended.** A closed union (`heading` / `para` / `list` / `table` / `callout` / `steps` / `term` / `figure` / `link`) rendered by ~200 lines of house-styled components. Zero new deps, type-safe cross-links and glossary references, and the block data is directly reusable for the search index, the section-anchor map, and the MCP resource ([§5.3](#53-the-manual-should-also-be-readable-by-the-connector)) |

Content lives in `src/content/manual/` (User Guide) and
`src/content/manual/ai/` (AI Manual) — plain data, no I/O, unit-testable, with
the renderer in `src/components/manual/`.

### D3 — Is manual content available offline? **Recommendation: yes, by construction; confirm with owner.**

Hard rule 9 makes reads online-only, with nothing beyond immutable build assets
runtime-cached. Under D2 the manual is *compiled into the bundle* — it is a build
asset, not a runtime read — so a statically-rendered manual route is offline-
capable without violating the rule or adding an outbox. This is a genuine win
(reading "what does this feedback slider mean" in a basement gym with no signal),
but it is a rule-9 adjacent call and the owner should confirm rather than have it
arrive as a side effect. **Open question O1.**

### D4 — One manual or two? **Recommendation: two surfaces, one system.**

Separate readers, separate tables of contents, separate entry points — but one
block model, one renderer, one search index, one voice test. Cross-links flow
both ways (User Guide connector chapter → AI Manual; AI Manual concept
references → User Guide mechanism sections).

### D5 — Depth model. **Recommendation: three layers, always in this order.**

Every mechanism section is written as: **(1) the one-line answer** the reader
came for → **(2) the plain-language mechanism** with a worked example in real
numbers → **(3) an optional collapsed "the exact rule"** block with the precise
formula, thresholds, and the param name that tunes it. Layer 3 is where the
pedantry goes, so layers 1–2 stay readable. This is the structural answer to
"prioritize understandability while informing users how key features work."

---

## 5. User Guide — information architecture

Chapters, in reading order. Each is one PR-sized unit of work in Phase 3+. The
"sources" column is where the ground truth for that chapter comes from and is
what Phase 0 must have resolved.

| # | Chapter | Covers | Primary sources |
|---|---|---|---|
| 1 | **What WORKOUT is** | The premise: periodized cycles + an engine that prescribes from your own performance. What the app does *not* do (no nutrition, no cardio, no coaching-by-vibes). The five tabs and what lives on each | README, doc 01, `BottomNav.tsx` |
| 2 | **Getting started** | Sign up, the profile that the engine actually uses (sex, age, height, bodyweight, experience, training-since) and *why each field matters*, first macrocycle, first mesocycle, first session | `(auth)/onboarding`, `/more/profile`, doc 17 |
| 3 | **The cycle model** | Macrocycle → mesocycle → microcycle → workout → day-slot. What a "slot" is and why the app compares a slot to itself | glossary, doc 03, doc 09 |
| 4 | **Planning a mesocycle** | The planner board as the single meso surface; from scratch / from template / copy a previous; day + muscle-group structure; the volume preview; activating a block | `/cycles/plan`, `/cycles/meso/[id]/plan`, doc 09 |
| 5 | **Training a session** | Day view anatomy: header, progress bar, the prescription strip, set rows, logging a set, editing weight, per-set RIR capture, the exercise + session feedback sheets, Workout Complete | `/workout`, `/log/[id]`, doc 09, doc 21 |
| 6 | **Effort: RIR** | RIR as reported vs target; the ramp; **report what you actually did, even when it misses the ask**; per-exercise target RIR (doc 21) and what the four scopes mean; the measuring band; deloads | glossary, doc 21, `slot-effort-display.ts` |
| 7 | **How your next weight is chosen** | The headline "how it works" chapter. The **strength anchor** — what it is, how it's derived from recent sets, why it's smoothed and recency-weighted; **e1RM** — the Epley/Brzycki average over effective reps (`reps + rir`), why two formulas are averaged (Epley drifts high at high reps, Brzycki drifts low; averaging cancels), and the **role** it plays: it is the currency the anchor, the prescription, the compliance marker, and the strength trend are all denominated in; confidence tiers and what a low-confidence read means; double progression and increments; earned-step progression and the macro-rate pacer in plain language | doc 11 (+21 amendment), doc 16, doc 10, `engine/` |
| 8 | **Why the app asks how it felt** | Workload / pump / joint-pain feedback → next week's set count. The joint-pain gate first. Why workload is primary and pump only nudges. Honest framing of what these signals are worth | doc 10, `rules/feedback.ts`, `COACHING_GUIDE` |
| 9 | **Volume** | Fractional set counting (1.0 primary / 0.5 secondary) and why a leg day can look "short"; MEV/MAV/MRV as a band, not a target; where the numbers come from and how much to trust them | glossary, doc 10, `engine/volume.ts` |
| 10 | **Reading your stats** | Exercise page, meso stats, macro overview; **Est. Strength** (rolling-window recent-best vs baseline-best, rolled up muscle-weighted) and why a fresh block's easy opener doesn't tank it; PRs; comparability traps (cross-phase, slot pooling, single-latest reads) | doc 10, `engine/strength.ts`, doc 09 |
| 11 | **Macrocycle goals** | Goal types; the personalized target band and recommended timeframe; why it's shown as a conservative band with no progress bar; pacing; closeout and the retrospective | doc 17, doc 10 |
| 12 | **Exercises & templates** | Library, the two-axis filter, custom exercises, per-exercise increment, exclusions, sharing by code | `/exercises`, `/templates`, doc 09 |
| 13 | **Body data** | Profile bodyweight vs the bodyweight series; body-fat estimate vs measured; BodySpec DEXA connect/import and the measurement-range honesty rules | doc 15, doc 17, `/more/bodyspec` |
| 14 | **The explanation on your prescription** | What the ask line, the why line, and the coaching line are; which are deterministic and which is model-written; that the engine authors every number either way | doc 19, doc 18 |
| 15 | **Connecting an AI** | Short chapter: what the connector is, what it can do, and a hand-off to the AI Manual | `/more/connector`, doc 05 |
| 16 | **Your account & your data** | Export, account deletion, what's stored, per-user isolation, what "online reads / queued writes" means for offline behavior | `/more/account`, `/more/export`, doc 03 |
| 17 | **Glossary** | Every term, one place — generated from `glossary.ts` plus manual-only terms | `src/lib/glossary.ts` |
| 18 | **Troubleshooting & FAQ** | The real recurring confusions harvested from `docs/notes/` — e.g. "why did my weight go down", "why does this say fewer sets than I did", "why is my e1RM lower after a good session" | `docs/notes/backlog.md` (S-series questions), workstream A |

### 5.1 A note on chapter 7

Chapter 7 is the chapter the owner's ask is really about, and it is the one most
likely to go wrong. It gets a dedicated review gate in Phase 4 and is built
**after** the mechanism-adjacent chapters (6, 8, 9) so its vocabulary is already
established.

### 5.2 Harvesting the FAQ

Chapter 18 should not be invented. `docs/notes/` contains a real record of what
confused the person using this app — the `S`-series questions, workstream A's
engine Q&A, and the review docs. Phase 0c mines these into a candidate FAQ list
rather than guessing.

### 5.3 The manual should also be readable by the connector

Once the content is a typed block model, exposing it as an MCP resource
(`workout://user-guide`) is nearly free, and it means a connected LLM answers
"how do I start a new mesocycle?" from the actual manual instead of improvising.
Scoped as a small phase of its own (Phase 6) so it can be dropped without
affecting the manuals.

---

## 6. AI Manual — information architecture

| # | Chapter | Covers |
|---|---|---|
| 1 | **What the connector is** | MCP in plain language: your training data, made available to an AI client you choose, with tools it can call. What this buys you that a chat about your training doesn't: it reads your real numbers and can draft real plans |
| 2 | **Setup** | The endpoint; adding it as a custom/remote connector; the authorization handshake; per-client scope; verifying it works ("ask it where I am in my block"); revoking access; what to do when a client can't connect |
| 3 | **The rules it operates under** | Identity is fixed to you — no tool takes a user id, and nothing can reach another account. It never deletes logged history. Writes land as drafts you review in the app. **The engine computes every prescribed load, rep, and set — the model surfaces and interprets, it never invents numbers.** Rate limits. What it can and cannot see |
| 4 | **What it can do** | The tool surface by capability group ([§6.2](#62-the-tool-surface-56-tools)), written as capabilities in plain language, not an API reference — "it can pull your full history for an exercise, including per-set RIR and estimate confidence" rather than a schema dump |
| 5 | **Use case: macrocycle creation & management** | Worked example — from "I want to gain muscle over the next 5 months" through goal setting, target review, slot planning, and mid-macro management. Shows the prompts, what the model does, and what you review in the app |
| 6 | **Use case: mesocycle creation & management** | Worked example — drafting a block from your history and constraints, previewing volume before committing, editing a live block, duplicating a block that worked |
| 7 | **Use case: performance analysis** | Worked example — "am I actually getting stronger on incline press?", exercise trend reads, meso comparisons, muscle balance, volume-by-group; and the comparability traps to ask it about |
| 8 | **Use case: coaching** | Worked example — the conversational mode: reviewing a session, deciding whether to push or back off, working around a niggle (and how that becomes a real exercise-level RIR assignment rather than advice you have to remember) |
| 9 | **Getting good answers** | How to prompt it well: ground it first, ask for the caveat, ask it to check comparability, ask it to show which tool it used. What a good answer looks like vs a confident wrong one |
| 10 | **What it will not claim** | The honesty guardrails, stated as user expectations — so a hedged answer reads as correctness, not weakness |
| 11 | **Notes, exclusions & preferences** | The quieter tools: logging notes it will read later, exercise exclusions, per-exercise increments, affinity |
| 12 | **Limits & troubleshooting** | Known limits, admin-only tools existing but being role-gated, what to do when it gets something wrong, and how to report it |

### 6.1 Worked examples are the deliverable, not decoration

Chapters 5–8 are the ones the owner called out. Each needs a real transcript
shape: the setup, the prompt, an abridged but **truthful** response, and the
follow-up in the app. Fabricated transcripts that show the connector doing
something it can't do are the main failure mode here — Phase 5's acceptance
criterion is that every example was actually run against the live connector.

### 6.2 The tool surface (56 tools)

Audited 2026-08-05 from `src/lib/mcp/tools/`. Grouping for chapter 4 (**17 are
admin-gated** via `resolveAdmin` and get one paragraph in chapter 12, not a
walkthrough):

- **Orientation** — `get_current_state`, `get_training_overview`, `get_profile`
- **History & analysis** — `get_exercise_history`, `get_recent_sessions`, `get_exercise_notes`, `analyze_exercise_progress`, `compare_mesocycles`, `get_muscle_balance`, `get_muscle_group_volume`, `get_exercise_affinity`, `check_data_hygiene`, `get_body_composition`
- **Cycles (read)** — `get_macrocycles`, `get_macrocycle_summary`, `get_mesocycle`, `get_mesocycle_summary`
- **Cycles (write)** — `create_macrocycle`, `update_macrocycle_goals`, `manage_macrocycle_slots`, `delete_macrocycle`, `create_mesocycle`, `edit_mesocycle`, `update_mesocycle`, `duplicate_mesocycle`, `activate_mesocycle`, `delete_mesocycle`, `preview_mesocycle_volume`
- **Library** — `search_exercises`, `create_custom_exercise`, `delete_custom_exercise`, `set_exercise_increment`, `search_templates`, `create_template`, `delete_template`, `manage_exclusions`, `get_exclusions`
- **Coaching** — `log_note`, `explain_prescription`
- **Admin-gated (17)** — engine params propose/activate/discard, decisions, replay, simulate, recompute, restamp, progression history, coaching-prompt lifecycle, LLM explanation tooling

Plus 3 resources: `workout://profile`, `workout://current-cycle`,
`workout://coaching-guide`.

---

## 7. Content contracts

Three contracts, each enforced by a test so drift is caught in CI rather than by
reading.

### 7.1 The glossary is one source, not two

A term defined in `src/lib/glossary.ts` must appear in the manual with **that
exact body text**. The manual may add depth *around* it; it may not restate it in
different words. Enforced by a test that asserts every `GlossaryKey` resolves to
a manual `term` block whose body is identity-equal to `GLOSSARY[key].body`.
Terms the manual needs that the app doesn't yet show get added to `glossary.ts`
(gaining an `InfoDot` for free), not defined only in the manual.

### 7.2 The honesty contract

A copy test over all manual blocks, extending the existing `glossary.ts` copy
contract:

- No exclamation marks; no hype vocabulary (a denylist: "crush", "insane",
  "guaranteed", "optimal" used as a claim, "maximize", …).
- Any sentence stating an e1RM, a strength projection, or a macro target must be
  within a section flagged `estimate: true`, and that section must render the
  standing estimate caveat.
- Deload sections may not use growth/gain framing.
- Every numeric default stated in the manual must carry its `engine_params` path
  so a reader knows it is tunable and a future param change is greppable to the
  manual text that states it.

### 7.3 The claims ledger

The highest-value artifact of this whole plan, and the answer to §2.1/§2.2.

`docs/22a-manual-claims.md` — a table of **every factual assertion** the manuals
make about how the app behaves, each with its source:

| Claim ID | Manual location | Assertion | Source of truth | Verified |
|---|---|---|---|---|
| `C-e1rm-01` | UG 7.2 | e1RM averages Epley and Brzycki over `reps + rir` | `src/lib/engine/e1rm.ts` + doc 10 §2 | ✓ 2026-08-xx |

Rules: a claim enters the manual only after its row exists and is verified
against code (not prose). A PR that changes engine behavior greps this ledger.
This is what makes the manual maintainable instead of a snapshot that rots in a
month.

---

## 8. Navigation & search requirements

From the "indexed, well formatted, searchable, easy to navigate" objective:

1. **Contents page per manual** — chapters with one-line descriptions, in reading order.
2. **Stable section IDs** — every section has a permanent slug (`ug/prescriptions#anchor`, `ai/setup#revoking`). These are the link targets for deliverable C, so they are an API: renaming one is a breaking change and needs a redirect entry.
3. **In-page section index** — chapters longer than ~4 sections open with a jump list.
4. **Search** — a single field over both manuals, matching section titles, body text, and glossary terms, built from the block model at build time. Results grouped by manual, showing chapter → section, scored title-first. Client-side; no network round trip; no new dependency (a simple inverted index over the block data is sufficient at this corpus size).
5. **Prev/next** within a chapter, and **breadcrumb-back** to the surface the reader came from — the app's existing "always back-link where you came from" rule (N27) applies: a reader who enters the manual from the day view returns to the day view.
6. **Cross-links** — typed `link` blocks referencing section IDs, validated at build (a test asserts every link target resolves).
7. **Deep-link entry** — `/more/guide/prescriptions#anchor` scrolls to and briefly marks the target section, so a link from an `InfoDot` lands somewhere obviously correct.

---

## 9. The phased plan

Sequenced so each phase is a reviewable PR, nothing is written before its ground
truth is established, and the surface exists before the content that fills it.

Rough sizing is relative, not calendar: **S** ≈ a focused session, **M** ≈ a
substantial session, **L** ≈ needs splitting if it grows.

### Phase 0 — Ground truth (no user-facing prose)

Four independent, parallelizable audits. Output is working documents, not manual
content. **This phase is the one that determines whether the manual is correct.**

| Phase | Scope | Output | Size |
|---|---|---|---|
| **0a** | **Doc supersession map.** Walk every doc in `docs/` and record, per topic, which doc is authoritative and which passages are superseded. Explicitly resolve: 08↔09↔06 (design), 18↔19 (explanations), 11↔21 (RIR premise), 16↔17 (progression vs macro goals), 10 (metrics, over all). Flag every behavior that shipped **inactive** pending activation (v20/v23) so the manual documents live behavior only | `docs/22b-source-map.md` | M |
| **0b** | **Functional inventory from the code.** Route-by-route walk of all 25 pages: what the screen shows, every control, every user-visible behavior and state, every label. This is the skeleton of chapters 1–6 and 10–16 | `docs/22c-app-inventory.md` | L → split by tab if it grows |
| **0c** | **Concept & FAQ inventory.** Every jargon term the app renders (from `glossary.ts`, UI strings, stats labels, feedback sheets), marked as defined / undefined; plus the FAQ candidates mined from `docs/notes/` per [§5.2](#52-harvesting-the-faq) | appended to `22c` | M |
| **0d** | **Connector inventory.** Per tool: what it does in one plain-language line, admin-gated or not, whether it writes, and which use-case chapter it belongs to. Plus the real auth flow, rate limits, and failure envelope, read from `auth.ts`/`rate-limit.ts`/`envelope.ts` | `docs/22d-connector-inventory.md` | M |

**Exit criteria:** every chapter in §5 and §6 has an identified, non-conflicting
source for its content; the inactive-behavior list is explicit.

### Phase 1 — Architecture & one exemplar

| Scope | Size |
|---|---|
| Settle D1–D5 with the owner (this doc's [§4](#4-decisions-to-settle-before-content-is-written) + [§12](#12-open-questions-for-the-owner)). Define the block model types (`src/content/manual/types.ts`) and the section-ID scheme. **Hard-rule-8 design pass:** transcribe the reader's house style from existing primitives and record it in `docs/09-design-changelog.md` before building. Then build **one chapter end-to-end** — proposed: UG chapter 6 (RIR), which exercises headings, glossary terms, tables, callouts, a three-layer mechanism section, and cross-links | M |

**Why an exemplar first:** it converts every layout and voice argument from
abstract to concrete before 30 chapters are written against the wrong pattern.

**Exit criteria:** owner has seen the rendered exemplar and signed off on look,
depth, and voice.

### Phase 2 — Reader infrastructure

| Scope | Size |
|---|---|
| Routes (`/more/guide`, `/more/guide/[chapter]`, `/more/connector/guide`, `/more/connector/guide/[chapter]`), contents pages, the block renderer components, section anchors + deep-link marking, prev/next, breadcrumb-back, the search index + search UI, link-target validation test, the three content-contract tests from [§7](#7-content-contracts) (running green against the single Phase-1 chapter). More-tab entry row | M |

**Exit criteria:** the exemplar chapter is reachable, searchable, deep-linkable,
and CI enforces the contracts. All later phases are then *content only*.

### Phase 3 — User Guide content

One PR per group. Order is deliberate: usage before mechanism, and chapter 7
after the vocabulary chapters that feed it.

| Phase | Chapters | Size |
|---|---|---|
| **3a** | 1 What WORKOUT is · 2 Getting started · 3 The cycle model | M |
| **3b** | 4 Planning a mesocycle · 12 Exercises & templates | M |
| **3c** | 5 Training a session | M |
| **3d** | 8 Why the app asks how it felt · 9 Volume | M |
| **3e** | **7 How your next weight is chosen** — the anchor, e1RM, its role, confidence, double progression, earned-step progression, the pacer | L (gets its own review gate — [§5.1](#51-a-note-on-chapter-7)) |
| **3f** | 10 Reading your stats · 11 Macrocycle goals | M |
| **3g** | 13 Body data · 14 The explanation on your prescription · 16 Your account & your data | M |
| **3h** | 15 Connecting an AI · 17 Glossary (generated) · 18 Troubleshooting & FAQ | M |

(Chapter 6 ships in Phase 1 as the exemplar.)

Each 3x PR: content blocks + claims-ledger rows + contract tests green.

### Phase 4 — User Guide review gate

| Scope | Size |
|---|---|
| Cold read of the whole guide end to end for coherence, duplication, and vocabulary drift across chapters written in different sessions. Verify every claims-ledger row against code a second time (the check that catches a claim that was true at Phase 0 and changed during Phase 3). Owner review pass | M |

### Phase 5 — AI Manual content

| Phase | Chapters | Size |
|---|---|---|
| **5a** | 1 What the connector is · 2 Setup · 3 The rules it operates under · 4 What it can do | M |
| **5b** | 5 Macrocycle use case · 6 Mesocycle use case | M — **every transcript actually run against the live connector** ([§6.1](#61-worked-examples-are-the-deliverable-not-decoration)) |
| **5c** | 7 Performance analysis · 8 Coaching | M — same rule |
| **5d** | 9 Getting good answers · 10 What it will not claim · 11 Notes/exclusions/preferences · 12 Limits & troubleshooting | M |
| **5e** | Rework `/more/connector` into a hub: keep the endpoint + connect steps, add the manual entry; owner review pass over the whole AI Manual | S |

### Phase 6 — Expose the manual to the connector *(optional, droppable)*

| Scope | Size |
|---|---|
| `workout://user-guide` MCP resource serving the block model as markdown, so a connected model answers how-to questions from the manual rather than improvising ([§5.3](#53-the-manual-should-also-be-readable-by-the-connector)) | S |

### Phase 7 — Link placement *(deliverable C — the owner's follow-on)*

| Phase | Scope | Size |
|---|---|---|
| **7a** | **Placement audit.** Walk every screen and list candidate insertion points, each with the exact section ID it should target and a justification. Decide the *grammar*: when does a surface get an `InfoDot` (term-level), and when a manual link (mechanism-level)? Recommendation to hold: the manual link is a distinct affordance from `InfoDot` and must not clutter — placement is earned, not sprayed. Owner reviews the list before any code | M |
| **7b** | Implement the approved wave-1 placements | M |
| **7c** | Implement the remainder / follow-up wave after the owner has used wave 1 | S–M |

### Phase 8 — Maintenance rules

| Scope | Size |
|---|---|
| Amend `CLAUDE.md` with the standing rule: **a PR that changes user-visible behavior updates the manual and its claims-ledger rows in the same PR** (the same discipline the backlog-row rule already enforces). Point the repo `README.md` at the manuals and fix its stale status line while there ("planning complete — implementation not yet started" is long since false). Close the `N74` backlog row | S |

*(Already done when this plan was written: the doc-22 entry in the CLAUDE.md doc
index, the `N74` backlog row + `log.md` entry, and the workstream **M** pointer.)*

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| **Documenting behavior that isn't live** (v20/v23 shipped inactive) | Phase 0a's explicit inactive list; contract test flags any manual claim whose param version isn't the active one |
| **The manual rots within weeks** — this codebase moves fast | The claims ledger (§7.3) + the CLAUDE.md rule (Phase 8). Without both, this is a snapshot, not a manual |
| **Voice drift across 30 chapters written in many sessions** | The Phase-1 exemplar as the pattern; the copy contract test; the Phase-4 cold read |
| **Overclaiming** — the manual quietly softens the honesty guardrails into confident claims | §7.2 as an enforced test, not an intention |
| **Fabricated connector transcripts** | Phase 5's acceptance criterion: examples are run, not imagined |
| **Phase 3e (chapter 7) becomes a spec rewrite** | Depth layer 3 caps how deep it goes; anything deeper is a link to the doc, not prose in the manual |
| **The reader clutters the app** | Phase 7a's placement audit gates every insertion; no placement ships without owner review |
| **Scope creep into MEASURE / admin tooling** | §1.2 |

---

## 11. Sequencing summary

```
0a ─┐
0b ─┼─→ 1 (exemplar) ─→ 2 (infrastructure) ─┬─→ 3a…3h ─→ 4 ─┐
0c ─┤                                        │               ├─→ 7a ─→ 7b ─→ 7c ─→ 8
0d ─┘                                        └─→ 5a…5e ──────┤
                                                  └─→ 6 (opt)┘
```

Phase 0's four audits are parallelizable. Phase 3 and Phase 5 are independent of
each other once Phase 2 lands. Phase 7 needs both manuals' section IDs to exist.

---

## 12. Open questions for the owner

| # | Question | Recommendation |
|---|---|---|
| **O1** | Should manual content be readable offline? Under D2 it's a build asset, so this is achievable without touching hard rule 9 — but it should be a decision, not a side effect | Yes — a manual you can't read in a signal-dead gym misses the point |
| **O2** | Does the User Guide belong on the More tab only, or does it deserve a more prominent entry (e.g. from the empty/first-run states)? | More tab in Phase 2; revisit in Phase 7a with real placement data |
| **O3** | Should the manual document **inactive** engine behavior (v20 earned-step progression, v23 strength-rate band) as "coming", or omit it until activated? | Omit. A manual that describes behavior the reader can't observe is worse than a shorter manual. Revisit at activation |
| **O4** | AI Manual audience assumption: does the reader know what an LLM client / MCP is, or do we start from zero? | Start from zero in chapter 1 but keep it to a few paragraphs — the reader who already knows can skip a screen |
| **O5** | Do the worked connector transcripts use the owner's real training data (concrete and credible, but personal) or a synthetic athlete? | Real numbers, lightly generalized. Credibility matters more here than in most docs, and this is a single-user deployment today |
| **O6** | Is a FAQ chapter mined from `docs/notes/` acceptable, given those notes are the owner's own confusions? | Yes — they are the highest-signal source available for what actually confuses a user of this app |

---

## 13. Relationship to other docs

- **Doc 10** is authoritative for every metric definition the manual states; doc 22 never redefines one.
- **Docs 16 / 17 / 19 / 21** are authoritative for progression, macro goals, explanations, and exercise-level RIR respectively; chapters 6, 7, 11, 14 report them.
- **Doc 09** is authoritative for screen structure; chapters 4, 5, 10, 12 report it.
- **Doc 05** is authoritative for the MCP surface; the AI Manual reports it. When the AI Manual and doc 05 disagree, doc 05 is right and the manual is a bug.
- **N25** (archived) is this work's predecessor: the `InfoDot` + glossary layer is term-level help; this manual is the mechanism-level layer above it. They share one glossary.
- Workstream **M** ("In-app help & education") is this work's home in `docs/notes/`.
