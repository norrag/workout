# 22d — Connector inventory (doc 22, Phase 0d)

**Status:** ground truth for the AI Manual. Working document — not user-facing prose.
**Audited:** 2026-08-06, from `src/lib/mcp/` at `6d5d674` (post-Batch-32);
**re-verified at `6441e93`** after PR #230 (doc 23, N80) — see [§10](#10-re-verification-after-pr-230);
**amended 2026-08-12** for doc 22 Phase 5, which added the manual's own retrieval
surface — see [§11](#11-phase-5-landed-the-manual-retrieval-surface).
**Scope:** doc 22 §11 Phase 0d — *"Per user-facing tool: one plain-language line,
whether it writes, and which use-case chapter it belongs to. Plus the real auth
flow, rate limits, and failure behavior. Admin tools are listed once as an
exclusion set and then dropped."*

> **Rule of this document.** Every line below was read out of the code, not out
> of doc 05. Where the code and doc 05 disagree, the disagreement is recorded in
> [§7](#7-discrepancies-found) and resolved in `22b` before it reaches prose.
> The **plain-language line** in the tables is a *draft for the manual* — it is
> the audit's proposal, and Phase 6a is free to improve it. The **writes?** and
> **chapter** columns are findings, not proposals.

---

## 1. Headline counts

| | Count | Source |
|---|---|---|
| Tools registered | **56** → **58** at 1.1.0 | `registerTools()` → 7 modules |
| Admin-gated (excluded from the manual) | **17** | `ADMIN_TOOL_NAMES` in `tools/admin.ts:1001` |
| **User-facing (the AI Manual's subject)** | **39** → **41** at 1.1.0 | 56 − 17, plus the two Phase-5 tools |
| — of which read-only | 22 → 24 | |
| — of which write | 17 | |
| Resources | **3** → **4** at 1.1.0 | `registerResources()` in `mcp/resources.ts` |

> **"at 1.1.0"** is not hedging. `search_manual`, `get_manual_section` and
> `workout://user-guide-index` are registered behind `manualRetrievalActive()`
> (doc 23 §9.2), so on today's `main` a client sees 56/39/3 and after the release
> PR it sees 58/41/4, with nothing else changing. [§11](#11-phase-5-landed-the-manual-retrieval-surface)
> has the detail; AI Manual ch. 4 documents the post-release surface, because
> the AI Manual ships **in** that release.

Doc 22 §7.2's "56 tools, 17 admin-gated" is confirmed exactly. The §7.2 grouping
also enumerates exactly these 39 names — no tool in the code is missing from it,
and no name in it is absent from the code.

Per-module breakdown (registration order in `tools/index.ts`):

| Module | Tools | Admin? |
|---|---|---|
| `get-current-state.ts` | 1 | no |
| `read.ts` | 13 | no |
| `coaching.ts` | 7 | no |
| `write.ts` | 12 | no |
| `authoring.ts` | 5 | no |
| `edit.ts` (via `write.ts`) | 1 | no |
| `admin.ts` | 9 | **yes** |
| `admin-llm.ts` | 4 | **yes** |
| `admin-prompt.ts` | 4 | **yes** |
| `manual.ts` (doc 22 Phase 5) | 2 | no — release-gated |

---

## 2. The exclusion set — named once, then dropped

Per doc 22 §1.2, these get **no coverage at all** in either manual: not a
chapter, not a paragraph, not a "these exist" note. Listed here so Phase 6
authoring has an explicit deny-list to check against.

```
get_engine_params          propose_engine_params      activate_engine_params
discard_engine_params      get_engine_decisions       get_progression_history
replay_decisions           simulate_prescriptions     restamp_e1rm
get_llm_explanation_status test_llm_explanation       generate_explanations
recompute_prescriptions    get_coaching_prompt        propose_coaching_prompt
activate_coaching_prompt   discard_coaching_prompt
```

Two consequences the manual must respect:

1. **Non-admin clients never see them.** `scopeAdminToolVisibility()` filters
   `tools/list` by `profiles.role`, so a normal reader's client shows **39**
   tools. The manual's "what it can do" chapter therefore matches what the reader
   actually sees — no explanation needed for a gap, because there is no gap.
2. **Visibility is a nicety, not the boundary.** `resolveAdmin()` denies at call
   time regardless. This is a security fact, not manual content.

Everything after this section is the 39.

---

## 3. The user-facing tools

**Writes?** — `read` = no mutation; `write` = mutates; `write (draft)` = creates
or edits something that lands in a reviewable, un-activated state.
**Ch.** — the AI Manual chapter the tool is *demonstrated* in (doc 22 §7).
Every tool is also inventoried in ch. 4 ("What it can do").

### 3.1 Orientation (3)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `get_current_state` | Where you are right now: your live macrocycle → block → week → next workout, this week's target RIR, and any per-exercise effort assignment, set cap, or rep position running this week. | read | 3, 5–8 |
| `get_training_overview` | The one-call grounding snapshot: who you are, where you are, how the current block is going (adherence and fatigue), and the strength trend on your key lifts. | read | 7, 8 |
| `get_profile` | Your profile — age, sex, height, bodyweight, body-fat, experience, training age, preferred equipment. | read | 5 |

**Manual-relevant detail.** `get_current_state`'s own description states the
**N79 resolution rule**: more than one block can be live, and the one it reports
is *the one holding the most recently logged set*. This is a user-visible
behavior and belongs in User Guide ch. 3 as well as AI Manual ch. 3.

### 3.2 History & analysis (10)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `get_exercise_history` | Session-by-session history for one lift, newest first: top weight and reps, that session's best strength estimate, which week and day it was, the block it belonged to, deload flags, and both kinds of note. | read | 7 |
| `get_recent_sessions` | Your most recently finished workouts with their session feedback (fatigue / effort / performance) and notes. Defaults to the last 10. | read | 8 |
| `get_exercise_notes` | Every pinned note you keep across the exercise library — the durable context about how you run each movement. | read | 11 |
| `analyze_exercise_progress` | Whether one lift is actually moving: trend, PRs, and stall detection, compared like with like — current training phase only, a rolling window rather than one latest read, per-day-slot series, and where in the session the lift sits. | read | **7** |
| `compare_mesocycles` | Two or more blocks side by side: volume, estimated strength, adherence, session feedback. | read | 7 |
| `get_muscle_balance` | Weekly sets per muscle and the push/pull/legs split for a block you have actually trained, with a per-day emphasis breakdown so a lower-set leg day is not misread. | read | 7 |
| `get_muscle_group_volume` | Weekly hard sets per muscle for a block — planned vs actually logged, week by week, deload weeks flagged, weeks not yet generated marked as projected. | read | 7 |
| `get_exercise_affinity` | Which movements you actually train and how they treat you — frequency, recency, loads, volume, each with its pinned note and averaged joint-pain / workload / pump. | read | 8, 11 |
| `check_data_hygiene` | Structural oddities worth a gentle mention: a macrocycle whose length differs from the recommendation, duplicate block names, placeholders still on the default. | read | 12 |
| `get_body_composition` | Your DEXA scan history from a connected BodySpec account, with per-scan deltas and the comparability rules that say when a delta is real. | read | 7 |

**Manual-relevant detail.** `analyze_exercise_progress` is the tool AI Manual
ch. 7 is built around: its description already names the four comparability
guards (phase segmentation, rolling window, day-slot split, fatigue position).
Ch. 7 should teach the reader to *ask for* these, not just receive them.

### 3.3 Cycles — read (4)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `get_macrocycles` | All your macrocycles with their blocks in order (goal, phase, RIR ramp, status), plus any standalone blocks. The structural map. | read | 5 |
| `get_macrocycle_summary` | One macrocycle's goal arc: the realistic target range and per-month rate, the block timeline, and macro stats. | read | 5 |
| `get_mesocycle` | One block's plan, groups-first: its days, the muscle-group blocks on each day, the exercises filling each slot, and a derived per-day emphasis label. | read | 6 |
| `get_mesocycle_summary` | One block's performance rollup: adherence, volume, estimated strength, feedback patterns, per-exercise progress. Matches the in-app meso stats. | read | 6, 7 |

### 3.4 Cycles — write (11)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `create_macrocycle` | Draft a macrocycle from a goal and block length. **The engine** computes the personalized target, the recommended timeframe, the block count, and the suggested phases. | write (draft) | **5** |
| `update_macrocycle_goals` | Change a macrocycle's goal, duration, block length, name, or notes; the engine recomputes the target and phases. Only empty slots reconcile — planned, live, and finished blocks are untouched. | write | 5 |
| `manage_macrocycle_slots` | Reshape a macrocycle's slots: add an empty one, remove an empty one, reorder them all, or drop an existing standalone block into a slot. | write | 5 |
| `delete_macrocycle` | Undo a macrocycle you created, with its empty placeholders. Refused once anything is logged under it or it holds a live or finished block. | write | 5 |
| `create_mesocycle` | Draft a block for you to review before it starts — from a template, or built from scratch day by day. You set the RIR ramp; the engine computes loads, reps, and sets when it starts. | write (draft) | **6** |
| `edit_mesocycle` | Restructure a planned **or live** block's planner board: add or remove days, add / remove / swap / reorder exercises, set week-1 sets — plus the three effort levers (per-exercise RIR, working-set cap, rep position). | write | 6, 8 |
| `update_mesocycle` | Edit a block's header in place — name, phase, length, deload flag, RIR ramp — without demolishing its plan or losing its macro placement. | write | 6 |
| `duplicate_mesocycle` | Clone a block's settings and whole planner board into a new draft ("run last block back with a few tweaks"). Loads are not carried; the engine reseeds on activation. | write (draft) | 6 |
| `activate_mesocycle` | Turn a reviewed draft into the live block. The one real state change with consequences — it requires an explicit confirmation. | write | 6 |
| `delete_mesocycle` | Undo a block you created. Refused once any set has been logged in it. | write | 6 |
| `preview_mesocycle_volume` | Project a plan's weekly sets per muscle against your MEV / MAV / MRV landmarks **without writing anything**, so a plan self-checks before it starts. | read *(no mutation)* | 6 |

**Manual-relevant details.**

- `preview_mesocycle_volume` is grouped under "Cycles (write)" in doc 22 §7.2
  but **performs no mutation** — its description says so explicitly. Ch. 6 should
  present it as the safe rehearsal step, and ch. 4's grouping should not imply it
  writes. Recorded in [§7](#7-discrepancies-found).
- `edit_mesocycle` is the single largest tool in the surface and carries the
  three doc-21 effort levers. It is the *mechanism* behind the AI Manual ch. 8
  promise that a niggle becomes a real assignment rather than advice to remember.
- `activate_mesocycle`'s description carries the **N79 concurrency rule** and the
  **within-macro sequencing rule** ("a future block can't start until every
  earlier block is complete, so its prescriptions are seeded from the latest
  results, never in advance"). Both are user-visible behavior.
- Its description also states the app's own preference: *"Prefer letting the
  athlete activate in-app; use this only on explicit request."* Worth surfacing
  in ch. 6 as a stated norm rather than a hidden one.

### 3.5 Library (9)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `search_exercises` | Search the exercise library (stock plus your own), filterable by name and equipment, with each movement's muscles. The same library the in-app pickers use. | read | 6 |
| `create_custom_exercise` | Add a movement of your own: name, equipment, muscles, an optional load step, and — for bodyweight movements — which of the three load meanings applies. | write | 11 |
| `delete_custom_exercise` | Remove a custom movement you added. Refused for stock exercises, for anything with logged sets, and for one still used by a planned block. | write | 11 |
| `set_exercise_increment` | Set or clear your per-exercise load step — how much weight the engine adds when you meet the prescription, overriding the equipment default for that lift only. | write | 11 |
| `search_templates` | Search reusable block templates (stock plus your own) by name, with emphasis and days per week. | read | 6 |
| `create_template` | Save an existing block's structure as a reusable template. | write | 6 |
| `delete_template` | Remove one of your own templates. Stock templates cannot be removed; a block already started from it is unaffected. | write | 6 |
| `manage_exclusions` | Add or remove an excluded movement, with a reason. Excluded movements never appear in pickers and are never recommended. | write | 11 |
| `get_exclusions` | The movements you have excluded, with their reasons. | read | 11 |

**Manual-relevant detail.** `set_exercise_increment`'s description states two
things a reader needs and doc 22 does not yet capture: setting a step also
**indexes the steps off the last weight you actually entered** (with a 10 lb
step, 88 lb goes to 98 or 78, not to 90), and **prescriptions refresh on next
view while logged history is never touched** — the doc-14 freshness behavior,
visible to a user. Also that it is **pointless for bodyweight-only lifts**, where
the engine progresses reps. All three belong in User Guide ch. 15 too.

### 3.6 Coaching (2)

| Tool | Plain-language line (draft) | Writes? | Ch. |
|---|---|---|---|
| `log_note` | Set or clear the pinned note on an exercise — durable context like grip, setup, or a nagging caveat. Per-session notes are written in the live workout instead. | write | 11 |
| `explain_prescription` | Why the engine chose this load, these reps, and these sets: the inputs it saw, the output, and its reasoning. Falls back to a read-only projection when no decision has been recorded yet. | read | 8 |

**Manual-relevant detail.** `explain_prescription` returns
`source: "projected"` when no recorded decision exists. The AI Manual ch. 10
("how to read its answers") should name this, because a projection is a
recomputation, not a record of what actually happened.

---

## 4. Resources (3 today, 4 at 1.1.0)

| URI | What it is | Auth |
|---|---|---|
| `workout://profile` | Your profile, same shape as `get_profile`. | session-scoped |
| `workout://current-cycle` | Your live macro → block → week → next workout with this week's target RIR (and slot effort). | session-scoped |
| `workout://coaching-guide` | The app's training paradigm and honesty guardrails, as markdown. Identical for every client — no user data. | none needed |
| `workout://user-guide-index` *(1.1.0)* | The user guide's contents tree: every chapter and section with its ID, one-line summary, and in-app route. Identical for every client — no user data. | none needed |

> **Corrected 2026-08-12.** This section's heading said *"5 after Phase 5"*. Doc
> 22 §10.2 adds **one** resource and **two tools**; the count conflated them.
> Phase 5 landed one resource, so it is 4.

**Manual-relevant detail.** `workout://coaching-guide` is the same text doc 22
§3 identifies as "a large fraction of the how-it-works chapters, translated to an
athlete audience." It is *readable by the connector*, which means a reader can
ask their AI to explain the paradigm even before the manual retrieval tools ship.

---

## 5. The real auth flow

Read from `src/app/api/mcp/route.ts`, `src/lib/mcp/auth.ts`,
`src/app/oauth/consent/page.tsx`, and `src/app/api/oauth/decision/route.ts`.

**What actually happens**, in the order a reader experiences it:

1. The reader copies the endpoint from `/more/connector` — `<origin>/api/mcp`.
   `resolveOrigin()` derives it from `NEXT_PUBLIC_APP_URL`, so the page always
   shows the correct one for the deployment; the manual should say *"copy it
   from that page"* and never hardcode a URL.
2. Their AI client calls the endpoint with no token. `withMcpAuth(..., {required: true})`
   returns **401 carrying the protected-resource metadata pointer (RFC 9728)**.
3. The client follows that pointer to discover **Supabase's OAuth 2.1
   authorization server** and starts a standard authorization request.
4. Supabase redirects the reader to **`/oauth/consent?authorization_id=…`**. If
   they are not signed in, they are sent to sign in and returned here with the
   request preserved.
5. The consent screen shows **the requesting client's name** and **the scopes
   requested**, with the standing statement: *"It will act as you, see only your
   own data, and can never delete logged history."* The reader approves or
   denies; the decision posts to `/api/oauth/decision`.
6. On approval the client receives a bearer token. **Every** subsequent call
   verifies it against the project's JWKS: issuer pinned, algorithms pinned to
   `RS256 / ES256 / EdDSA` (so `alg: none` and HS-confusion are refused), and
   the `anon` / `service_role` project keys explicitly rejected even though they
   share the issuer.
7. Identity is the token's `sub`. **No tool takes a `user_id`.** Queries run
   through a token-bound client, so per-user scoping is enforced by RLS, not by
   tool code.
8. **Revocation:** remove the connector in the AI client, or revoke the
   authorization from the account's connected apps. (This is what
   `/more/connector` says today; the AI Manual ch. 2 should keep the same two
   routes.)

**Writing the manual against this:** step 2–3 is invisible to the reader and
should stay invisible in prose. The three steps the connector page already lists
(paste endpoint → sign in and approve → ask it something) are the right shape;
ch. 2 adds the consent-screen detail, per-client scope, verification ("ask it
where I am in my block"), revocation, and the failure modes below.

**Per-client scope.** The grant is per OAuth client (`client_id` is carried on
every call and recorded in the audit trail). Two AI clients are two grants,
revocable independently.

---

## 6. Rate limits and failure behavior

### 6.1 Rate limit

| Property | Value | Source |
|---|---|---|
| Limit | **120 requests / minute**, overridable via `MCP_RATE_LIMIT` | `api/mcp/route.ts:46` |
| Window | fixed 60 s | same |
| Key | SHA-256 of the bearer token (IP fallback when unauthenticated) | `clientKey()` |
| Over-limit response | HTTP **429** with `Retry-After` in seconds, body `{jsonrpc, error:{code:-32029,message:"Rate limit exceeded"}}` | same |
| Scope caveat | **per warm instance**, not global — a scaled-out deployment enforces the limit per lambda | `rate-limit.ts` header |

**For the manual:** the honest user-facing statement is *"the connector accepts
about two requests a second per connection; a client that goes over is told to
wait and retry."* The per-instance caveat is an operational detail, not manual
content. **No number should be stated in prose without this row as its source**
(doc 22 §8.2 requires the param path beside every stated default).

### 6.2 Failure behavior

Three distinct shapes a reader's client can surface, all worth ch. 12
("When it gets something wrong"):

| Failure | What the client sees | Where |
|---|---|---|
| No / invalid / expired token | 401 + protected-resource pointer → the client re-runs the authorization | `withMcpAuth` |
| Over the rate limit | 429 + `Retry-After` | `withRateLimit` |
| A tool throws (bad id, database error, refused delete) | A **structured** in-result error — `{error:{code,message,detail}}` with `isError: true`, so the model can read and correct it rather than seeing `[object Object]` | `withErrorHandling` + `toolError` |
| A tool *declines* (a rule was hit) | The same `isError: true` flag over an `{ok:false, error}` body — R25 converged the two dialects onto one signal | `withErrorHandling` |
| A resource throws | No `isError` shape exists for resources, so the guard rethrows a clean `code: message (detail)` string into the JSON-RPC error | `guardResource` |

**The reader-facing lesson for ch. 12** is that a refusal is usually a *rule*,
not a bug: `delete_mesocycle` refuses once a set is logged, `delete_custom_exercise`
refuses for stock movements or anything with history, `manage_macrocycle_slots`
refuses to remove a planned/live/finished block. Each of these is a hard rule 5
consequence and reads correctly as reassurance.

### 6.3 Every write is audited

`recordMcpWrite()` writes a `mcp_write_audit` row for each mutation — tool name,
a **hash** of the arguments (never the raw arguments, which can contain note
text), and a short summary, always under the server-derived user id. The audit
insert is deliberately non-fatal: a failed audit never inverts a successful write
into an error.

Worth one sentence in AI Manual ch. 3, framed positively: *"every change the
connector makes is recorded, and the record stores a fingerprint of the request
rather than its contents."*

---

## 7. Discrepancies found

Feeding [§8](#8-what-phase-6-must-not-do) and `22b`.

| # | Finding | Resolution |
|---|---|---|
| **K1** | `E1RM_ESTIMATE_NOTE` (`mcp/envelope.ts:49`) says e1RM is **"Epley-based"**. The engine averages **Epley and Brzycki** (`engine/e1rm.ts`, `predict.ts`), and doc 22 §1.1 names the average as headline manual content. The connector's standing caveat is stale copy. | **The code's engine wins.** The manual says Epley/Brzycki average. Flagged in `22b` §K1; the envelope string is a one-line fix for a separate PR — **not** a doc-22 deliverable, but it must not be quoted as a source. |
| **K2** | `preview_mesocycle_volume` sits under "Cycles (write)" in doc 22 §7.2 but performs **no mutation**. | Doc 22's grouping is presentational; the manual must not imply it writes. Corrected in [§3.4](#34-cycles--write-11). |
| **K3** | The connector page's current copy says the connector *"can draft mesocycles and templates"* — true, but understated post-Batch-32: it can also draft **macrocycles**, place blocks in macro slots, and edit a **live** block's planner board including the effort levers. | Ch. 1 and the Phase-6e rework of `/more/connector` update this. Not a behavior bug. |
| **K4** | `MCP_INSTRUCTIONS` (server.ts) tells the model the ramp is *"e.g. 3 → 0–1, with 0 RIR a peak-week ceiling, not the routine target"*, while `GLOSSARY.rir_ramp` says *"begin a few reps shy of failure, step closer each week, then back off for the deload."* These agree but are differently emphatic about 0 RIR. | Not a conflict. User Guide ch. 7 (ramps and styles) is the place the 0-RIR-as-ceiling point is made; the glossary body stays verbatim per §8.1. |

---

## 8. What Phase 6 must not do

A deny-list distilled from this audit, for the AI Manual author.

1. **Do not document the 17 admin tools**, or the existence of an admin tier.
2. ~~**Do not document `search_manual`, `get_manual_section`, or
   `workout://user-guide-index`** until Phase 5 ships them.~~ **Lifted
   2026-08-12** — Phase 5 shipped them ([§11](#11-phase-5-landed-the-manual-retrieval-surface)),
   and they are release-gated on the same 1.1.0 that carries the AI Manual, so
   ch. 4 documents them. It must describe them as they are: the guide, not the
   user's data.
3. **Do not say "MCP"** outside the ch. 2 allowlist (doc 22 §8.5). Note that the
   in-app copy already says *"ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR"* —
   that is exactly the allowlisted case (the reader must find that word in their
   own client), and ch. 2 should quote the app's label rather than invent one.
4. **Do not hardcode the endpoint URL.** It is derived per deployment.
5. **Do not state the rate limit, the schema version, or any feedback scale
   without its source row here** — §8.2 requires a greppable source beside every
   stated number.
6. **Do not invent transcript output.** §7.1 requires every ch. 5–8 example to
   have been run against the live connector. This audit deliberately did **not**
   run any tool: Phase 0 is a code read, and a transcript captured now would be
   stale by Phase 6 anyway.
7. **Do not describe `preview_mesocycle_volume` as making a change.**
8. **Do not quote `E1RM_ESTIMATE_NOTE`** — see K1.

---

## 9. Ready-for-Phase-6 checklist

| AI Manual chapter | Sources identified? | Gaps |
|---|---|---|
| 1 What the connector is | ✅ connector page copy, `MCP_INSTRUCTIONS` | K4 — the capability list is understated |
| 2 Setup | ✅ [§5](#5-the-real-auth-flow) | none |
| 3 The rules it operates under | ✅ `auth.ts`, hard rules 4/5, [§6.3](#63-every-write-is-audited) | none |
| 4 What it can do | ✅ [§3](#3-the-user-facing-tools) + [§11](#11-phase-5-landed-the-manual-retrieval-surface) | none — the Phase-5 tools shipped and are in scope |
| 5 Macrocycle use case | ✅ tools identified | transcript must be **run** |
| 6 Mesocycle use case | ✅ tools identified | transcript must be **run** |
| 7 Performance analysis | ✅ `analyze_exercise_progress` + comparability guards | transcript must be **run** |
| 8 Coaching | ✅ `edit_mesocycle` effort levers, `explain_prescription` | transcript must be **run** |
| 9 Getting good answers | ✅ `MCP_INSTRUCTIONS` grounding stance | none |
| 10 How to read its answers | ✅ envelope `data_quality`, `FEEDBACK_SCALES`, guardrails | `source: "projected"` must be named |
| 11 Notes, exclusions & preferences | ✅ | none |
| 12 When it gets something wrong | ✅ [§6.2](#62-failure-behavior) | none |

---

## 10. Re-verification after PR #230

PR #230 (doc 23, N80) touched `src/lib/mcp/tools/admin.ts`. Re-counted from
`registerTool` call sites at `6441e93`:

| | Count | Change |
|---|---|---|
| Tools registered | **56** | unchanged |
| Admin-gated | **17** | unchanged |
| **User-facing** | **39** | unchanged |
| Resources | **3** | unchanged |

Every count and every name in [§1](#1-headline-counts)–[§4](#4-resources-3-today-5-after-phase-5)
still holds. **No tool was added, removed, or renamed**, and nothing moved across
the admin boundary — so the exclusion set is byte-identical and no chapter
changes.

**What did change, and why it is still excluded.** `propose_engine_params` and
`activate_engine_params` gained a required `release_impact` argument
(`none` / `fix` / `feature`), and `activate_engine_params` now **refuses** a
`feature`-classified activation unless a live release announces it (doc 23 §9.5).
Both tools are admin-gated and already in [§2](#2-the-exclusion-set--named-once-then-dropped);
per doc 22 §1.2 they get no coverage in either manual. Recorded here only so a
later re-verification can see the change was checked rather than missed.

**Two consequences that do land outside the exclusion set:**

1. **`/more/connector` is an allowlisted release-note link target.**
   `src/content/releases/links.ts::LINKABLE_ROUTES` includes it, so a future
   release entry can point a reader straight at the connector page — and, once
   doc 22 Phase 2 populates `GUIDE_SECTION_IDS`, at an AI Manual section. Worth
   knowing when Phase 6e reworks that page into the manual's hub.
2. **The AI Manual is part of release 1.1.0** ([`22b`](./22b-source-map.md) §10),
   so its routes ship behind `releaseActive("1.1.0")` alongside the User Guide's,
   and its Phase-5 connector tools (`search_manual`, `get_manual_section`,
   `workout://user-guide-index`) are a **user-visible capability** that owes an
   `unreleased.ts` entry when it lands. [§8](#8-what-phase-6-must-not-do) rule 2
   is unchanged: do not document them before they ship.

---

## 11. Phase 5 landed — the manual retrieval surface

**2026-08-12.** Doc 22 Phase 5 ([§10.2](../22-user-manual.md#102-the-design--retrieve-then-read))
is built. This section is the ground truth for AI Manual ch. 4; it replaces the
placeholder in [§4](#4-resources-3-today-4-at-110) and lifts
[§8](#8-what-phase-6-must-not-do) rule 2.

### 11.1 The three surfaces

| Surface | Kind | Writes? | Reads user data? | Chapter |
|---|---|---|---|---|
| `workout://user-guide-index` | resource | no | **no** | 4 |
| `search_manual` | tool | no | **no** | 4 |
| `get_manual_section` | tool | no | **no** | 4 |

Plain-language lines, drafted for ch. 4 to improve:

- **`search_manual(query, limit?)`** — *"Find the parts of the app's guide that
  answer a question."* Returns ranked pointers, not prose: `section_id`,
  `chapter`, `title`, `summary`, a `snippet`, the in-app `app_route`, and a
  relative `score`. `limit` defaults to **8**, capped at **25**. A query matching
  nothing returns `count: 0` and a hint pointing at the index resource.
- **`get_manual_section(section_id, include_related?)`** — *"Read one section of
  the guide."* Returns the section as markdown plus its route, its position in
  its chapter (`"3 of 6"`), and — unless `include_related: false` — the
  author's related sections and the ones either side in reading order. An
  unresolvable ID fails **in band** (`ok: false` → `isError`, per R25) with up to
  five suggested IDs.

### 11.2 Four facts ch. 4 must get right

1. **They resolve no session at all.** These are the only tools on the surface
   that never call `resolveSession` — the guide is identical for every reader, so
   there is nothing to scope. The manual should say what that means for the
   reader rather than how it is implemented: *asking the AI how the app works
   never touches your training data.*
2. **`app_route` is the point of the design.** Every result carries the in-app
   route, so an assistant hands back a section the reader can open. Doc 22 §10.2
   calls this out; it is a fact worth one sentence in ch. 4.
3. **The estimate caveat survives the read.** A section flagged `estimate` comes
   back with doc 22 §8.2's standing caveat appended to its markdown, exactly as
   the screen renders it. Ch. 4 should not promise the AI *adds* caveats — it
   should say the guide carries its own, and they come through intact.
4. **No embeddings, and that is not a limitation to apologize for** (doc 22
   §10.1). Ranking is over titles, authored keywords, glossary aliases,
   summaries and body text. If ch. 4 mentions retrieval at all, the honest line
   is that the guide is written in short titled sections, so finding the right
   one is a lookup rather than a guess.

### 11.3 The gate, and what it means for counting

All three are registered behind `manualRetrievalActive()` — `releaseActive("1.1.0")`
— at the two call sites (`tools/index.ts`, `resources.ts`). Before the release a
client sees **56 tools / 39 user-facing / 3 resources**; after it, **58 / 41 / 4**.
`MCP_INSTRUCTIONS` gains one gated paragraph naming the three surfaces and the
distinction they exist to draw: *the guide documents the app, the data tools
report the user.* The `unreleased.ts` entry
[§10](#10-re-verification-after-pr-230) said this owed is filed as
`connector-reads-the-guide`.

**Re-verify at doc 22 Phase 6**, per this document's own rule: read the counts
out of the code again rather than out of this section.
