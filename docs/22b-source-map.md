# 22b — Source map & supersession ledger (doc 22, Phase 0a)

**Status:** ground truth for both manuals. Working document — not user-facing prose.
**Audited:** 2026-08-06, against the repo at `6d5d674` (post-Batch-32) **and the
live database** (`engine_params` read directly). **Re-checked against `6441e93`**
after PR #230 shipped the versioning & release framework — no behavior the manual
describes changed, but doc 22's *plan* is now bound in five ways: [§10](#10-what-doc-23-changes-for-this-manual).
**Scope:** doc 22 §11 Phase 0a — *"Per topic, which doc is authoritative and
which passages are superseded. Resolve 08↔09↔06, 18↔19, 11↔21, 16↔17,
10-over-all. Flag every behavior that shipped **inactive** so the manual
documents live behavior only (O3)."*

> **Why this document exists.** Doc 22 §2.1: this repo supersedes *in place*.
> A manual written from spec prose will document behavior that a later review
> corrected, or behavior that is coded but switched off. Phase 0a resolves that
> before a word of user-facing prose is written. **Nothing in Phase 3 or Phase 6
> may cite a doc without checking it against [§3](#3-topic--authoritative-source)
> and [§4](#4-the-live-behavior-ledger) first.**

**The headline finding:** doc 22 §2.2's own inactive-behavior list is **stale**.
v20 and v23 are both **live**. The genuinely-inactive behavior is a different
one — **the measuring band (v26)** — and it sits underneath a chapter doc 22
§6.2 says must be written. See [§4](#4-the-live-behavior-ledger).

---

## 1. How to use this map

Three questions, three sections:

| Question | Section |
|---|---|
| *"Which doc do I trust for this topic?"* | [§3](#3-topic--authoritative-source) |
| *"Is this behavior actually switched on?"* | [§4](#4-the-live-behavior-ledger) |
| *"Is this passage I'm reading superseded?"* | [§5](#5-superseded-passages-that-would-mislead-a-manual-author) |

Then, before writing a chapter, check its row in
[§7](#7-per-chapter-source-assignment-the-phase-0a-exit-criterion).

---

## 2. The precedence ladder

Read top-down: the first rule that applies, wins.

1. **The code and the active `engine_params` row beat every document.** Doc 22
   §2.3. A doc describes intent; the deployed code and the active params are what
   a reader experiences. Where they disagree, the manual describes the code and
   the disagreement is filed as a defect (see [§6](#6-defects-found-not-doc-22s-to-fix)).
2. **A dated amendment beats the doc it amends.** `docs/09-design-changelog.md`
   over `08`/`06`; doc 21 §Phase 1 over doc 11's RIR premise; doc 19 over doc 18
   §6/§10; the doc 19 §12 amendment (2026-07-24) over doc 19's own body.
3. **The narrower authoritative doc beats the broader one** *on its own subject*:
   16 owns progression internals, 17 owns macro goals, 19 owns explanation
   content, 21 owns exercise-level RIR, 14 owns prescription freshness.
4. **Doc 10 beats everything on metric definitions and default parameter values**
   — including 16/17/21 — because those docs report metrics rather than define
   them. (But see rule 1: doc 10's *defaults* are frequently behind the active
   row.)
5. **`docs/reviews/` are consolidated, not authoritative.** Each named review
   thread was folded into a numbered doc; where a review and its consolidating
   doc disagree, the doc wins. Reviews remain useful for *rationale* — which is
   exactly what the manual's "why this way" paragraphs need.
6. **`docs/notes/` records intent and status, never behavior.** Useful for FAQ
   mining (doc 22 §5 ch. 21) and for finding *what confused a real user*. Its
   technical answers are snapshots and go stale — see [§5.6](#56-workstream-a-is-a-dated-snapshot).

---

## 3. Topic → authoritative source

The manual's per-topic lookup table. "Superseded" names what a naive reader
would otherwise pick up.

| Topic | Authoritative | Superseded / do not cite | Notes for the manual |
|---|---|---|---|
| **Screen structure, layout, controls, copy** | `docs/09-design-changelog.md` (dated entries, newest wins) → then `08` | `06` (color system + nav), `08` where 09 amends it, the interactive prototype (`WorkoutApp.dc.html`) | Hard rule 8. The **mockup** beats the prototype; **09 beats the mockup** where dated. Post-Batch-32, four surfaces moved — see [§5.1](#51-batch-32-moved-four-documented-surfaces-n75n79) |
| **Metric definitions** (e1RM, volume, MEV/MAV/MRV, est. strength, adherence) | `docs/10-metrics-spec.md` | `04-feedback-engine.md` (logic only, values are stale), `11` §-level number claims | Doc 10 §9 honesty guardrails bind the manual (doc 22 §2.5/§8.2) |
| **Default parameter values** | **the active `engine_params` row (v25)** → then doc 10 | doc 10's stated defaults where the row differs; every `engine_params` value quoted in 11/16/17/21 | [§4.2](#42-the-active-parameter-values-the-manual-may-state) is the transcribed live block |
| **e1RM formula + confidence** | `engine/predict.ts` → doc 10 §1 (incl. the §S3 amendment) | doc 11's formula statement, `A-engine-metrics.md` §S1, `MCP envelope.ts::E1RM_ESTIMATE_NOTE` | The Epley/Brzycki **cutoff** is the operative rule — see [§6.1](#61-doc-22-misstates-its-own-headline-claim-the-brzyckiepley-rationale) |
| **The strength anchor** | `engine/reps.ts` + `queries/logging.ts` → doc 11 → doc 16 | `A-engine-metrics.md`'s "two e1RM systems" framing (closed by T-A1, PR #103) | Stats now read the **stored engine stamp**; recency decay is prescription-only |
| **RIR premise: reported vs target** | **doc 21 §2 / Phase 1** | **doc 11's premise** — that logged sets carry no reported RIR | Rule: `assumedRir = rir_reported ?? target_rir`. This was a *correction of a defect* (N71), not a feature |
| **Progression (earned step, pacer, earn gate)** | `docs/16-prescribed-progression.md` | `13-reps-prescription-unification.md`, `04`, `A-engine-metrics.md` §S4/§S5 | **Live** (v20 → v25). See [§4](#4-the-live-behavior-ledger) |
| **Macrocycle goals, targets, pacing, closeout** | `docs/17-macrocycle-goals.md` | doc 10 §5's pre-N21 target engine, doc 16 on the rate source | **Live** (v21/v22/v23/v24/v25) |
| **Prescription freshness / invalidation** | `docs/14-prescription-invalidation.md` | any `params_version` single-scalar gate description | User-visible as *"prescriptions refresh on next view; logged history is never touched"* |
| **Exercise-level RIR, set cap, rep position** | `docs/21-exercise-level-rir.md` | doc 11's single-week-RIR model | Live **except** §6.1's measuring band — [§4.1](#41-what-is-not-live) |
| **Prescription explanation content** | `docs/19-...-v3.md` (+ its §12 amendment) | **doc 18 §6** (substitution seam), **doc 18 §10** (voice), doc 18's payload/trigger policy | Doc 18 keeps model/client, storage, decision-id lifecycle, post-check |
| **The connector surface** | the code (`src/lib/mcp/`) → `docs/05-mcp-connector.md` | `12-connector-coaching-roadmap.md` (a roadmap, not a contract) | Fully inventoried in [`22d`](./22d-connector-inventory.md) |
| **BodySpec / DEXA** | `docs/15-bodyspec-dexa-integration.md` for internals; `17` §6 for how it reaches the engine | — | Doc 22 ch. 16 |
| **Glossary term wording** | `src/lib/glossary.ts` — **verbatim**, doc 22 §8.1 | every restatement of a term in 10/11/16/21 | A term the manual needs that the app lacks is **added to `glossary.ts`**, not defined only in the manual |
| **Offline / caching behavior** | `src/app/sw.ts` + CLAUDE.md hard rule 9 | doc 02's pre-N68 no-outbox statement | Set-logging writes are queued (N68); reads are online-only |
| **Version identity, release notes, the What's New gate, the release process** | `docs/23-versioning-releases.md` + `src/content/releases/` + `src/lib/version/` | the hardcoded `WORKOUT 0.1 — PRE-RELEASE` footer, and any pre-2026-08-06 statement that the app is unversioned | New as of PR #230. See [§10](#10-what-doc-23-changes-for-this-manual) — it binds doc 22's phases, not just its content |
| **MEASURE (doc 20)** | — | **all of it** | Out of scope: not built. Doc 22 §1.2 |

---

## 4. The live-behavior ledger

Doc 22 §11 Phase 0a's central output, and its **O3** obligation: *document live
behavior only*.

### 4.0 The correction to doc 22 §2.2

Doc 22 §2.2 states: *"`engine_params` **v20** (earned-step progression) and
**v23** (strength-rate band) shipped **inactive**, pending owner activation."*

**Both were activated, and the chain has run four versions past them.** Read
directly from `public.engine_params` on 2026-08-06:

| Version | Active? | What it carries |
|---|---|---|
| 20 | superseded | earned-step progression (doc 16 Phase 1) — **activated 2026-07-11** |
| 21 | superseded | macro-target correction (doc 17 §2 / N21) — activated 2026-07-11 |
| 22 | superseded | `rate_source` → `"plan"` (doc 17 Phase R3 / N37) — activated 2026-07-11 |
| 23 | superseded | two-component strength-rate model (doc 17 §2.7 / N43) — activated 2026-07-12 |
| 24 | superseded | `rate_source` → `"plan"` over the corrected band — activated 2026-07-12 |
| **25** | **ACTIVE** | the doc 17 §7 / N36 self-gating **envelope loop** — active since 2026-07-12 |
| 26 | **inactive** | the doc 21 §6.1 **measuring band** (`e1rm.max_measuring_rir = 8`) |

Doc 22's §2.2 sentence should be corrected when doc 22 is next touched; until
then, **this table is the authority**. Note also that v22, v24 and v25 were
admin-MCP micro-bumps with **no committed migration** — so `supabase/migrations/`
alone under-reports the live chain, and reading the repo is not sufficient.

### 4.1 What is NOT live

Exactly three things. The manual documents none of them.

**① The measuring band — doc 21 §6.1 (`e1rm.max_measuring_rir`).**
The code is complete (`predict.ts::isMeasuringRir`, `stampE1rm`), but the
parameter is **`.optional()` and absent from the active v25 row**, so
`isMeasuringRir` returns `true` for every set and the rule never fires. **Every
logged set, at any RIR, is currently treated as a strength measurement.**

> **This is the single most consequential Phase-0 finding**, because doc 22 §6.2
> makes the band load-bearing in User Guide ch. 8: *"past the **measuring band**
> (`max_measuring_rir`) they are priced and never treated as a measurement of
> your strength — so a protected block does not read as a decline."*
>
> That sentence conflates two doc-21 rules with **different live status**:
>
> | Rule | Question it answers | Live? |
> |---|---|---|
> | §6.1 measuring band | *Is this a measurement at all?* — asked at the stamp | **NO** (v26 inactive) |
> | §6.2 backed-off stats policy | *Is this measurement comparable?* — asked at read time | **YES** (migration `20260804000001`, applied + verified 2026-08-04) |
>
> The *reassurance the reader actually needs* — "a protected block does not read
> as a decline" — is **§6.2, and it is live**: a slot run easier than its week is
> tagged `BACKED OFF`, dropped from PR views / `best_e1rm` / the trend fold /
> the meso PR scan (from both sides), kept in volume and adherence, and
> disclosed in one sentence wherever the number appears. Asymmetric by design:
> a slot run *harder* than its week keeps every claim it earns.
>
> **Instruction for Phase 3d (ch. 8):** write the reassurance from §6.2. Do
> **not** mention the measuring band, `max_measuring_rir`, or "priced but not
> measured" until v26 activates. Doc 22 §6.2's third and fourth bullets need
> amending on that basis.

**② The LLM coaching line — serving mode unknown.** `LLM_EXPLANATIONS` is a
Vercel environment variable, not readable from a Claude session
(`docs/deployment/manual-operations.md`). Evidence from the live database:
`decision_explanations` holds **203 rows, newest 2026-08-06 11:20 UTC** — so
generation is running in production. Whether they are **served** depends on
`LLM_EXPLANATIONS` being `on` rather than `shadow`. **Owner confirmation
required** — see [§8](#8-open-items-requiring-owner-or-ops-confirmation), O-A.
Until confirmed, ch. 17 documents the **deterministic** ask line and why line
(always rendered, `src/lib/prescription-narrative.ts`) and treats the coaching
line as conditional.

**③ Everything in doc 20 (MEASURE).** Not built; doc 22 §1.2 already excludes it.

### 4.2 The active parameter values the manual may state

Transcribed from the active v25 row. Doc 22 §8.2 requires every numeric default
the manual states to carry its `engine_params` path — this is the source table
for those rows, and the **only** sanctioned set of numbers.

> **Re-read 2026-08-08** (doc 22 Phase 3a), against the live row via
> `get_engine_params(25)`. **v25 is still active and unchanged** —
> `params_hash 91887f0f…`, hash-verified — and `e1rm.max_measuring_rir` is
> still absent, so [§4.1](#41-what-is-not-live) ① holds. The five
> **ch. 2** rows below were added from that read, per this section's own rule.

| `engine_params` path | Value | Where the manual needs it |
|---|---|---|
| `e1rm.rir_offset` | `1` | ch. 10 — effective reps = `reps + rir × 1` |
| `e1rm.brzycki_max_eff_reps` | `10` | ch. 10 — **the cutoff**; average below, Epley alone above |
| `e1rm.high_max_eff_reps` / `high_max_rir` | `8` / `2` | ch. 10 — high confidence |
| `e1rm.mod_max_eff_reps` / `mod_max_rir` | `12` / `3` | ch. 10 — moderate confidence |
| `e1rm.anchor_method` | `"session_best"` | ch. 10 — the anchor |
| `e1rm.recency_halflife_days` | `30` | ch. 10 — why old sessions fade |
| `e1rm.max_measuring_rir` | **absent** | **do not state** — see §4.1 ① |
| `deload.target_rir` | `6` | ch. 9 — the deload week's target RIR |
| `deload.load_pct` / `set_pct` | `0.55` / `0.5` | ch. 9 — **fallback path only** (see below) |
| `deload_anchor_rir` | `true` | ch. 9 — with a confident anchor the deload load is chosen **the same way a working week's is** (window-centred reps at the higher deload RIR), not as a flat % of peak. `load_pct`/`set_pct` apply only when there is no usable anchor. `engine/index.ts:253` |
| `rep_window.hypertrophy` | `6–15`, target `8–12` | ch. 10 — double progression |
| `rep_window.strength` | `2–6`, target `3–5` | ch. 10, ch. 14 |
| `volume.landmarks.*` | per-muscle `[MEV, MAV, MRV]` triples | ch. 12 — the band |
| `volume.experience_scale` | `0.7 / 1.0 / 1.1` | ch. 12 — why your band differs |
| `min_sets` / `max_sets_per_exercise` | `2` / `6` | ch. 11, ch. 8 |
| `mg_set_ceiling` | `20` | ch. 11 — the set-add guard |
| `workload_high` / `workload_low` | `8` / `3` | ch. 11 — the autoregulation thresholds |
| `set_add_pump_min` | `6` | ch. 11 — pump only corroborates |
| `pain_gate` / `pain_cut_gate` | `2` / `3` | ch. 11 — the joint-pain gate, **stated first** |
| `progression.mode` / `pacing` / `rate_source` | `"earned_step"` / `"macro_rate"` / `"plan"` | ch. 10, ch. 14 |
| `progression.min_confidence` | `"moderate"` | ch. 10 — the earn gate |
| `progression.envelope.enabled` | `true` | ch. 10 — **live**, self-gating per user |
| `progression.band_position` | `0.5` | ch. 14 |
| `progression.goal_rate_factor.hypertrophy` | `0.75` | ch. 14 |
| `key_lifts.n` / `selection` | `5` / `"frequency"` | ch. 13 |
| `increment.*` / `rounding.*` | 5 lb (10 bands, 9 kettlebell) | ch. 15 — the load step |
| `experience_increment_scale` | `1.5 / 1.0 / 0.5` | ch. 15 |
| `macro_target.present` | `"conservative_end"` | ch. 14 — **why you see the low end**; ch. 2 |
| `macro_target.age_taper` | `true` (start 40) | ch. 14 |
| `macro_target.age_taper_start` | `40` | **ch. 2** — the age the taper begins |
| `macro_target.sex_factor_female` | `0.7` | **ch. 2** — the **hypertrophy** path only |
| `macro_target.strength_sex_factor` | `{male: 1, female: 1}` | **ch. 2** — relative strength gains are modelled sex-equal, which is why ch. 2 must not carry the 0.7 across to strength |
| `macro_target.bf_proxy_pct` | `male {10/16/25}`, `female {18/26/35}` | **ch. 2** — **present on v25**, so a blank body fat resolves to the BMI-band value before any training-age fallback (ledger `D-07`) |
| `macro_target.ffmi_ceiling` / `ffmi_untrained` | `25 / 21.5`, `18.5 / 14.5` | **ch. 2** — the modelled ceiling and untrained baseline the proximity read sits between. Ch. 2 names them in words only; ch. 14 owns the numbers |
| `progression.envelope.min_history_mesos` | `2` | **ch. 2** — the point pacing stops depending on the experience bucket |

**Rule:** a number not in this table does not go in the manual until it has been
read out of the code or the active row and added here.

### 4.3 What IS live that a reader might assume is not

Worth stating, because Phase 3 authors reading doc 22 §2.2 would under-document
these:

- **Earned-step progression** (doc 16) — `mode: "earned_step"`, `step: "min"`,
  `cadence: "microcycle"`. The engine leads the demand by one earned quantum.
- **Macro-rate pacing off the plan band** (doc 17 §3 / N37) —
  `rate_source: "plan"`, so the pacer reads the profile-personalized band, not
  the experience bucket.
- **The two-component strength-rate model** (doc 17 §2.7 / N43) —
  `macro_target.strength_model.enabled: true`.
- **The self-gating envelope loop** (doc 17 §7 / N36) —
  `progression.envelope.enabled: true`, short-circuiting to `band_position 0.5`
  until a user has 2 qualifying completed mesos. **User-visible consequence:** two
  users with identical plans can be paced differently, and *the same* user's
  pacing changes as their history accrues. Ch. 10 and ch. 14 must not describe
  pacing as a fixed rule.
- **The doc 21 §2 / N71 re-levelling** — the historical restamp **ran in
  production 2026-08-02**: 9 087 e1RM stamps moved, average **+4.80 lb
  (+4.85 %)**, strictly upward. A long-time user's historical numbers changed on
  that date. Ch. 21 (FAQ) should carry this; it is exactly the kind of thing that
  reads as a bug.
- **Concurrent mesocycles** (N79) — and the resolution rule that follows from it.
- **Planner editing of an in-progress mesocycle** (N78).

---

## 5. Superseded passages that would mislead a manual author

### 5.1 Batch 32 moved four documented surfaces (N75–N79)

Doc 22 §2.4 already names these. Confirmed present in the code at `6d5d674`:

| Was | Is now | Consequence for the manual |
|---|---|---|
| "Engine audit" in the exercise ⋮ menu | **Prescription details**, opened by tapping the prescription strip's **ask line** (underlined) | Every pre-2026-08-06 doc/screenshot showing the menu row is wrong. Amends N57's "the strip stays purely the story" |
| `/cycles` listed everything | Finished cycles hidden behind a quiet toggle carrying a count (`?completed=1`) | Ch. 3 must describe the toggle; a completed meso *inside* a running macro stays visible |
| Planner board locked once history existed | **Opens through `active`**; frozen only at `completed`/`abandoned` | Ch. 4 — editing a running block is a documented capability, not a workaround |
| One active meso per user (DB-enforced) | **One per macrocycle**; standalone blocks unconstrained | "The active meso" is a **resolution**, not a fact: the block holding the **most recently logged set** wins, falling back to newest-created |
| History e1RM row showed `EFF REPS` and `~` on RIR | Both dropped (N77) | Ch. 13 |

### 5.2 Doc 11's RIR premise is amended by doc 21 Phase 1

Doc 11 describes logged sets as not carrying a reported RIR. **Doc 21 Phase 1
changed the premise:** sets capture `rir_reported`, and one resolution —
`rir_reported ?? target_rir` (`predict.ts::assumedRir`) — is shared by the stamp,
the anchor, and the compliance marker. Never default a missing report to `0`
(the N11 regression). Any doc-11 passage that assumes "every set was taken to
failure" is **the defect N71 closed**, not the behavior.

### 5.3 Doc 18 is superseded in three specific places

Per doc 22's own index and doc 19's header: **doc 19 supersedes doc 18 §6 (the
substitution seam), §10 (voice), and the payload/trigger policy.** Doc 18 keeps
the model/client, storage, decision-id lifecycle, post-check, and admin tooling
— and the admin tooling is **excluded** from the manual anyway (doc 22 §1.2).
Doc 19's own §12 amendment (2026-07-24, N62) adds `source_session` and `macro`
to the facts payload and beats doc 19's body.

The manual-facing shape is doc 19's **three layers**: a deterministic *ask*, a
deterministic *why* (always rendered), and a trigger-gated LLM *coaching line*.
`src/lib/prescription-narrative.ts` is **always the fallback** — so the
deterministic layers are the ones ch. 17 can promise unconditionally.

### 5.4 Doc 16 vs doc 17 — the seam

Doc 16 owns progression internals (the earn gate, the quantum, the pacer's
*mechanism*). Doc 17 owns macro goals and the pacer's **rate source**. Where they
appear to conflict on pacing, doc 17 wins on *where the rate comes from* and doc
16 wins on *what is done with it*. Both are live.

### 5.5 Doc 06 and doc 08 on color and navigation

Doc 06's color system and nav are superseded by doc 08; doc 08 is amended in
place by dated 09 entries. For the manual this matters only for the reader's own
chrome (Phase 1's hard-rule-8 pass, Phase 2's routes) — but hard rule 7's copy
discipline applies to **every** rendered line the manual ships.

### 5.6 Workstream A is a dated snapshot

`docs/notes/A-engine-metrics.md` is the best FAQ source in the repo *and* the
most dangerous to copy from: it is a 2026-06/07 snapshot. Specifically stale:

| Passage | Status |
|---|---|
| "There are two different e1RM systems" (engine anchor vs raw-Epley views) | **Closed** by T-A1 / PR #103 — stats read the stored engine stamp everywhere |
| "Per-set e1RM is computed on read, never stored — `logged_sets` has no `e1rm` column" | **Wrong now** — stamped per set since `20260708000001` |
| §S1's "falling back to Epley alone at ≥36 effective reps" | **Superseded** by the §S3 cutoff at **10** |
| §S7's "the active params are v9" | **v25** |
| §S3's "deloads included in e1RM and PRs" | **Amended** by T-A2 and again by doc 21 §6.2 |
| §S4/§S5 on the legacy `increment` path and `regression_pct` | **Retired** — `weight_selection: "rep_window"`, `mode: "earned_step"` |
| PH39's "the stats-view e1RM has no recency decay at all" | Still true *and still worth documenting* — stats show the **undecayed** value; recency decay is prescription-only. A genuine, live source of reader confusion |

**Use it for the questions, not for the answers.** The questions are real user
confusion; every answer must be re-derived from the code.

---

## 6. Defects found (not doc 22's to fix)

Recorded so Phase 3/6 do not propagate them, and so a later PR can close them.

### 6.1 Doc 22 misstates its own headline claim (the Brzycki/Epley rationale)

Doc 22 §5 ch. 10 says the manual should explain *"why two formulas are averaged
(**Epley drifts high at high reps, Brzycki low**; averaging cancels)."*

The code says the opposite about Brzycki, and the averaging is **not** what
happens at high reps:

> *"Brzycki tracks Epley to ~10 reps then **inflates increasingly** above it (its
> `37 − effReps` denominator goes near-zero), so a 20–30-rep burnout produced a
> 2–4× e1RM blow-up. The rule is now: average Epley+Brzycki only for effective
> reps ≤ `e1rm.brzycki_max_eff_reps`, **Epley alone above**."*
> — doc 10 §1, amended 2026-06-24 (§S3); implemented in `predict.ts::e1rmFactor`

The original "Epley high / Brzycki low, averaging cancels" rationale (LeSuer
1997; Mayhew 1992) holds **only inside the 5–15 band where the two agree** — and
the active cutoff is **10 effective reps**. Ch. 10 must state both halves:
averaged in the band where they agree, Epley alone above it. Doc 22 §1.1/§5's
parenthetical is the bug.

### 6.2 The connector's standing e1RM caveat is stale copy

`src/lib/mcp/envelope.ts::E1RM_ESTIMATE_NOTE` says *"Epley-based estimates."* The
engine averages Epley and Brzycki below the cutoff. One-line copy fix, tracked
in [`22d`](./22d-connector-inventory.md) §7 K1. **Do not quote it as a source.**

### 6.3 The stale inactive claim has propagated into doc 23

`docs/23-versioning-releases.md` **T10** says *"`engine_params` (v20/v23/v26 all
shipped inactive, activated later by an owner-gated MCP step)"*. **v20 and v23
are active** ([§4.0](#40-the-correction-to-doc-22-22)); only v26 is not. Doc 23's
*argument* is unaffected — an activation really is a user-visible change with no
diff, and that is why it is a feature release — but its example inherits doc 22
§2.2's error.

Worth recording precisely because it is what this audit exists to prevent: the
claim was wrong in doc 22, went unchecked, and was cited as established fact by
the next spec written. Correct it when doc 23 is next edited; [§4](#4-the-live-behavior-ledger)
governs in the meantime, for both docs.

### 6.4 Doc 22 §2.2's inactive list

See [§4.0](#40-the-correction-to-doc-22-22). Corrected inline in doc 22 by the
Phase-0 PR and **folded into its prose at Phase 1** (O-D); this ledger remains
the authority.

### 6.5 Doc 22 §6.2's measuring-band bullets

See [§4.1](#41-what-is-not-live) ①. Two of the four bullets describe an inactive
rule. Ch. 8 is still writable in full — from §6.2's live policy. Amended in doc
22 at Phase 1 (O-D).

### 6.6 `GLOSSARY.e1rm` stated the RIR direction backwards

**Found at Phase 1, and fixed there.** The card's closing clause read *"closer
to failure reads as stronger"*. The engine computes the opposite: effective reps
= `reps + rir` and e1RM is increasing in effective reps (`predict.ts::e1rmFactor`
— Epley `1 + effReps/30`, Brzycki `36/(37 − effReps)`, both monotonic), so at
the same weight × reps the set with reps **in reserve** implies the greater
strength. Production had already demonstrated it: the doc 21 §2 restamp moved
every historical stamp **upward** (+4.85%) precisely by re-reading unreported
sets at their prescribed RIR instead of as taken to failure.

Recorded here because of *how* it surfaced. Doc 22 §8.1 requires the manual to
reproduce the glossary's own words, so writing ch. 6's mechanism section forced
the sentence to be checked against `predict.ts` — which is the contract doing
the job it was designed for, one chapter into the build. Fixed in
`src/lib/glossary.ts`, pinned by a test, and logged as `D-01` in
[`22a`](./22a-manual-claims.md).

---

## 7. Per-chapter source assignment (the Phase-0a exit criterion)

Doc 22 §11 Phase 0 exit: *"every chapter has an identified, non-conflicting
source; the inactive-behavior exclusion list is explicit."*

| Ch. | Authoritative sources | Conflicts resolved? | Live-behavior caveat |
|---|---|---|---|
| 1 What WORKOUT is | README, doc 01, `BottomNav.tsx`, [`22c`](./22c-app-inventory.md) | ✅ | — |
| 2 Your profile | `/more/profile` code, doc 17, `engine/macro.ts` | ✅ | envelope loop makes pacing per-user (§4.3) |
| 3 The cycle model | glossary, doc 03, doc 09, N76/N79 | ✅ | multi-live blocks + the resolution rule (§5.1) |
| 4 Planning a mesocycle | `/cycles/plan` code, doc 09, N78 | ✅ | planner opens for `active` blocks |
| 5 Training a session | `/log/[id]` code, doc 09, doc 21, N75/N77 | ✅ | ask line opens Prescription details |
| 6 Effort: RIR and the ramp | **doc 21 §2** (over doc 11), doc 10, glossary | ✅ §5.2 | — |
| 7 Ramps & training styles ⭐ | doc 10, `COACHING_GUIDE`, **+ the 3d-r research pass** | ⚠️ **content does not exist yet** — 3d-r is a hard prerequisite | O7 still open (doc 22 §13) |
| 8 Exercise-level RIR ⭐ | doc 21, `slot-effort-display.ts`, `queries/slot-effort.ts` | ✅ | **§6.1 band NOT live — write from §6.2** (§4.1 ①) |
| 9 Deloads ⭐ | doc 10, `COACHING_GUIDE`, doc 21 §6.2, active `deload.*` | ✅ | MRV-stop auto-deload is **spec, not code** — see below |
| 10 How your next weight is chosen | `engine/predict.ts`, `reps.ts`, doc 10 §1, doc 16, doc 21 | ✅ §6.1 | state the **cutoff**; envelope loop affects pacing |
| 11 Why the app asks how it felt | `rules/feedback.ts`, doc 10, active params | ✅ | the ±1 model is what ships (see below) |
| 12 Volume | `engine/volume.ts`, doc 10 §2, glossary | ✅ | landmarks are experience-scaled |
| 13 Reading your stats | `engine/strength.ts`, the shared views, doc 10 | ✅ | stats show the **undecayed** e1RM (§5.6) |
| 14 Macrocycle goals | doc 17, doc 10 §5, active `macro_target.*` | ✅ | `present: "conservative_end"`, no progress bar |
| 15 Exercises & templates | `/exercises`, `/templates`, doc 09 | ✅ | increment indexes off last entered weight (N67) |
| 16 Body data | doc 15, doc 17 §5/§6 | ✅ | — |
| 17 Prescription details | **doc 19** (+ §12), doc 18 for infra only, N75 | ✅ §5.3 | **coaching line conditional** — §4.1 ②, O-A |
| 18 Connecting an AI | [`22d`](./22d-connector-inventory.md) | ✅ | Phase-5 manual tools do not exist yet |
| 19 Your data | `/more/account`, `/more/export`, doc 03, hard rule 9 | ✅ | queued writes (N68) |
| 20 Glossary | `src/lib/glossary.ts` **verbatim** | ✅ | 13 terms today — see [`22c`](./22c-app-inventory.md) §C for gaps |
| 21 Troubleshooting & FAQ | `docs/notes/` **questions**, code **answers** (§5.6) | ✅ | include the 2026-08-02 re-levelling (§4.3) |

**Two chapters carry a spec-vs-code gap that is not a supersession and must be
written from the code:**

- **Ch. 9 / ch. 11 — the volume ramp.** Doc 10 §3 specifies a graded
  MEV→MAV→MRV ramp (`+2/+1/hold/−1..−2`) and a two-week-at-MRV auto-deload
  trigger. **Neither is implemented.** What ships is a **±1 set** model
  (`rules/feedback.ts::modulateFromFeedback`) with MEV/MAV/MRV used as a
  classification library and the `mg_set_ceiling` guard. Deferred deliberately
  (T-A5, 2026-07-02: *"keep the ±1 model for now; do not amend doc 10"*). So
  **doc 10 §3 is aspirational on this one point** — the manual describes ±1.
  This directly constrains doc 22 §6.1's *"the strong signals are the ones the
  app actually measures — the MRV-stop rule (two weeks of workload ≥ 9 …)"*:
  **the app does not implement an MRV-stop rule.** Ch. 9 must describe the
  joint-pain gate, the ±1 workload response, and the scheduled deload — and say
  the deload is scheduled, because that is the truth.
- **Ch. 5 / ch. 13 — in-progress sets count immediately.** Sets logged in an
  open workout count toward volume, e1RM, PRs, and the anchor at once (T-A8,
  still an open decision). This contradicts the natural mental model and is a
  live FAQ item, not a bug to hide.

---

## 8. Open items requiring owner or ops confirmation

None of these block Phase 1. All block a specific chapter in Phase 3/6.

| # | Question | Blocks | Why Claude cannot answer it |
|---|---|---|---|
| **O-A** | Is `LLM_EXPLANATIONS` set to `on` or `shadow` in Vercel production? | ch. 17, AI Manual ch. 10 | Vercel env vars are a human-only step (`deployment/manual-operations.md`). DB evidence shows generation is running; serving is the unknown |
| **O-B** | Will **v26** (the measuring band) be activated before Phase 3d? | ch. 8 | Owner-gated activation (`manual-operations.md` step ⑤). **Re-scoped by doc 23 §9.5:** activating v26 changes a number users are shown, so it classifies `release_impact: "feature"` — and `activate_engine_params` now **refuses** a feature-classified activation unless a live release announces it. So v26 cannot be switched on ahead of a release note; it rides a feature release, and ch. 8 gains the band in the same block. Answering O-B is now a *sequencing* call, not a yes/no |
| **O-C** | **O7** from doc 22 §13 — name published third-party programs in ch. 7, or describe by characteristic? | ch. 7 (via 3d-r) | Owner call, already framed in doc 22 §6.3 |
| ~~**O-D**~~ | ~~Should doc 22 §2.2, §6.1 and §6.2 be amended in place to match §4 above?~~ | — | ✅ **Closed 2026-08-07 (Phase 1).** All three folded into doc 22's own prose, so the stale claim is no longer stated before its correction. This ledger still governs |

---

## 9. Standing rule for Phases 3–6

Doc 22 §2.4 is the reason this document has a shelf life. Two obligations:

1. **Re-validate this map at Phase 4**, alongside the claims-ledger
   re-validation. Batch 32 moved four surfaces in one day; §4's parameter table
   is a snapshot of one database row that an admin micro-bump can change without
   a migration.
2. **Every claim entering `22a-manual-claims.md` cites code or the active
   params row** — never this document, and never a numbered spec — because a
   spec citation is what this whole audit exists to prevent.

---

## 10. What doc 23 changes for this manual

PR #230 shipped the versioning & release framework (doc 23, N80) after this
audit's first pass. It does not change any behavior the manual describes — but
it **binds doc 22's plan** in five ways that Phase 1 must absorb before it
starts.

### 10.1 The manuals *are* release 1.1.0

Doc 23 §11.1, owner decision: 1.0.0 is the framework, and **1.1.0 is the
manuals**. That is the first release anyone is ever notified about. Two
consequences:

- **The manual must be dark-shippable.** Doc 22 ships its content over many PRs
  across weeks; ungated, the guide would go live chapter by chapter and the
  1.1.0 announcement would be telling users about something they had already
  been reading. So **the guide routes and the More-tab entry sit behind
  `releaseActive("1.1.0")`** — one gate at the route boundary, not gates
  scattered through content. This is a **doc 22 Phase 2 deliverable** that doc 22
  §11 does not currently mention.
- **`NEXT_PUBLIC_RELEASE_OVERRIDE` is how chapters get reviewed** while staged.
  It is honored only when `VERCEL_ENV !== "production"`, so a Vercel **preview**
  deploy renders the staged release. Owner review of the Phase-1 exemplar
  (doc 22 §11 Phase 1 exit) will run through that path, not through production.

### 10.2 Doc 22 §9.4's section IDs now have a second consumer

Doc 22 §9.4 already calls stable section IDs "an API". Doc 23 §7.2 / T11 makes
that literal: **release-note `guide` targets are doc 22 section IDs**, resolved
by **the same validator** doc 22 Phase 2 builds — one validator, two consumers.

`src/content/releases/links.ts` ships `GUIDE_SECTION_IDS` as an **empty array**
with a comment naming doc 22 Phase 2 as the thing that fills it, and the registry
test asserts the `guide` variant is unusable until then. So doc 22 Phase 2 owes
doc 23 a concrete export, not just an internal convention.

### 10.3 The phase order is now interleaved

Doc 23 §11.1 sets it, and it is not the order doc 22 §12 draws:

```
doc 23 P0–P4  →  doc 22 P0–P2  →  doc 23 P5  →  doc 22 content phases  →  cut 1.1.0
```

Doc 23 P0–P4 and P6 are **done**. **Doc 22 Phase 0 is done with this PR**, so
the critical path is now **doc 22 Phases 1–2** — and those unblock doc 23 P5
(guide deep links), which is the last thing standing between here and 1.1.0.

### 10.4 Release notes are a third copy surface, bound by doc 22's contracts

Doc 23 §5.2 adopts **doc 22 §8.4 (positive framing)** and **§8.5 (plain
language)** by reference, plus hard rule 7 and the doc 10 §9 guardrails. So the
manual and the release notes must describe the same feature in the same words —
and the glossary-identity contract (§8.1) reaches both.

Practical rule for Phases 3 and 6: **when a chapter introduces a concept, its
release entry links to that chapter's section** rather than re-explaining it.
That is also doc 23 §7.2's stated reason for coupling the two docs.

### 10.5 Every doc-22 PR from Phase 1 onward carries release obligations

Doc 23 §9.3: an ordinary PR appends its entries to
`src/content/releases/unreleased.ts` **when it changes something a user would
notice**, and §9.6 adds the documentation contract (behavior doc amended, 09
changelog updated, backlog swept).

| Doc 22 phase | User-visible? | Owes an `unreleased.ts` entry? |
|---|---|---|
| **Phase 0** (this PR) | no — working documents only | **no** |
| Phase 1 (block model + exemplar) | no, if gated behind `releaseActive("1.1.0")` | no |
| Phase 2 (reader infrastructure, routes, More entry) | **yes** — but gated | **yes**, staged for 1.1.0 |
| Phases 3–4 (content) | gated | fold into the same 1.1.0 entries |
| Phase 5 (connector retrieval) | **yes** — new connector capability | **yes** |
| Phase 6 (AI Manual) | gated | fold in |
| Phase 7 (link placement) | **yes** | **yes** |

**The corollary that matters:** doc 22's Phase 2 must add the release gate at
the same moment it adds the routes, or the manual goes live early and 1.1.0 has
nothing to announce.
