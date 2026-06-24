# Workstream A — Engine & metrics Q&A

Answers to the "how does X work" cluster, grounded in the actual code (file:line
refs) and cross-checked against the spec docs. These resolve the information-
gathering items; where an answer surfaces a real defect or design gap, a
**follow-up task** is called out and should be added to `backlog.md`'s
follow-up table.

> **The one thing to internalize first — there are two different e1RM systems:**
> 1. **Engine e1RM (the "anchor")** — averaged Epley/Brzycki over *effective
>    reps* (`reps + rir·offset`), **recency-weighted** (`0.5^(age/halflife)`,
>    default halflife 30d), anchored to a session-best. Drives **prescriptions**.
>    `src/lib/engine/e1rm.ts:35-74`, `src/lib/engine/reps.ts:162-231`.
> 2. **Stats-view e1RM** — raw single-formula Epley `weight × (1 + reps/30)`, **no
>    RIR offset, no recency, no confidence**. Drives **every stats screen** and
>    most MCP rollups. `v_exercise_history` etc. in `supabase/migrations/`.
>
> They can legitimately disagree for the same sets. Most of the confusing
> observations below trace back to this split. **See follow-up task T-A1.**

---

## S1 — How is estimated strength (e1RM) calculated?

Two implementations (above). Engine: `effReps = reps + rir·rir_offset` (default
offset 1.0), `e1RM = mean(Epley, Brzycki)`, falling back to Epley alone at ≥36
effective reps; confidence degrades with effective reps (`high_max_eff_reps 8`,
`mod_max_eff_reps 12`) and unknown RIR ⇒ low. The **anchor** weights each set's
e1RM by recency and (default `anchor_method = session_best`) takes the mean of
the working sets in the recency-weighted best set's session. Stats views use
plain Epley over non-warmup sets.

**Per-set e1RM is computed on read, never stored** — `logged_sets` has no `e1rm`
column. → directly motivates **PH31** (store per-set e1RM).

Matches `docs/10-metrics-spec.md §1` for the engine path; the view simplification
is deliberate but undocumented as a divergence. **Status: answered.**

## S2 — How is "strength increase" calculated?

`scoreProgress(first, last) = round((last−first)/first × 100, 1dp)` over e1RM
(`src/lib/engine/index.ts:475-481`). Per-meso uses first-vs-last logged session
e1RM from `v_exercise_history` (raw Epley) — `src/lib/queries/stats.ts:24-62`.
The key-lift "+/− X LB VS W1" badge is a top-set **weight** delta (latest week vs
week 1), `stats.ts:278-325`. Macro chart tracks best e1RM of the lead key lift
per meso, `stats.ts:489-551`.

**Caveat:** "first vs last logged session" is sensitive to which sessions fall in
the window and uses raw Epley with no recency smoothing, so a deload or high-rep
day can swing it (see S3). **Status: answered.**

## S3 — How are deload weeks handled in stats?

**Included** in volume, e1RM, and PRs; **excluded only from adherence**
(`sessions_attended/due` filter `not is_deload`) and from the in-app balance
per-week average (`buildBalance`, `stats.ts:227-262`). `v_meso_summary`
working_sets/volume/best_e1rm and `v_exercise_history`/`_prs`/`_overview` apply
**no deload filter**. `is_deload` is surfaced per row so a screen *could* label or
exclude it, but most don't. Defensible but undocumented, and it means a deload as
the last logged session can depress the S2 progress score.
→ **follow-up task T-A2** (decide + document deload handling in stats; at minimum
skip deload sessions in `getMesoProgressScores`). **Status: answered.**

## S4 — Sets vs reps vs weight; "is it adding weight every week?"; double progression

**The default mode is already a double-progression model — it does NOT add weight
every week.** Mode is gated by `params.weight_selection`:

- **`rep_window` (default, doc 13 §9.2):** if previous reps hit `target_high`, reset
  reps to `target_low` (load steps up); else reps climb +1 at held load. Actual
  load is re-derived by inverting the recency anchor for the target reps at the
  week's RIR. Because reps climb +1/wk while target RIR drops −1/wk, effective
  reps stay ~constant, so **load is held within the meso** and moves only when the
  window tops out or real strength (the anchor) changes. This is exactly the
  "hold load until all sets reach the top of the rep range at the prescribed RIR,
  then take the smallest increment and let reps drop" behavior the note describes.
- **`increment` (legacy):** keyed off `progression_style[goal]` (`gain→load_first`),
  this path *does* add a fixed `increment` on every met/beat — i.e. the
  "weight every week" behavior. `src/lib/engine/index.ts:236-304`.

So the perceived "weight every week" is either (a) the legacy path being active,
or (b) the anchor genuinely rising. **Important subtlety:** if the anchor is below
`reps_predict.min_confidence`, rep_window **silently falls back to the legacy
increment path**. → **follow-up task T-A3** (confirm which `weight_selection` is
active for the user, and surface/log when the confidence fallback fires).
Sets are adjusted separately by feedback (see S7). **Status: answered.**

## S5 — Misses: definition and response

`assessPerformance` grades the best working set vs the previous prescription
(`src/lib/engine/rules/performance.ts:26-124`): `beat` / `met` / `small_miss`
(reps met but RIR below target, **or** reps short by ≤ `small_miss_reps`, default
2) / `big_miss` (short by > that) / `no_data`.

Response depends on mode: in **rep_window** mode an under-performance is **not**
explicitly regressed — it's carried by the falling recency anchor (`gradeOnRir`
only colors the rationale: "harder than asked — held, not a miss"). The hard
**−10% back-off (`regression_pct` 0.9) only fires in legacy `increment` mode**, so
it is effectively dormant by default. → **follow-up task T-A4** (decide whether a
hard big-miss back-off should exist in rep_window mode, or document that the
anchor is the sole mechanism). **Status: answered.**

## S6 — Does adding a set manually transfer to future plans?

**Within a meso: yes**, as a baseline that feedback can then undo. `adjustPrescribedSets`
writes the current week's `prescribed_sets` (`logging.ts:648-665`); next-week
generation reads `previous.sets = prescribed_sets` then applies the feedback
`setDelta` and clamps to `[min_sets, max_sets]`. **Across a meso boundary: no** —
new-meso seeding takes sets from the planner board (`fill.initial_sets`), not the
prior meso's bumped count. There's no "one-off" flag. **Status: answered.**

## S7 — How is the number of sets planned?

Initial count = planner board `meso_exercises.initial_sets` (clamped to
`[min_sets, max_sets]` via `seedMeso`). Week-to-week autoregulation
(`modulateFromFeedback`, `src/lib/engine/rules/feedback.ts:18-62`; the active params
are **v9**, `20260619000001_engine_params_v9_rep_window.sql`): workload slider
≥ `workload_high` (8) ⇒ −1 set; ≤ `workload_low` (3) **and** pump ≥
`set_add_pump_min` (6) **and** goal is gain/hypertrophy **and** muscle-group weekly
sets < `mg_set_ceiling` (20) ⇒ +1 set; joint pain ≥ `pain_gate` (2) gates load
increases. `setDelta` is bounded to **±1**.

**Gap vs spec:** doc 10 §3's graded MEV→MAV→MRV ramp (`+2/+1/hold/−1..−2`) and the
two-week-at-MRV → auto-deload trigger are **not implemented**; MEV/MAV/MRV live in
`src/lib/engine/volume.ts` as a classification library used only for the
`mg_set_ceiling` guard. → **follow-up task T-A5** (implement the graded volume ramp
+ MRV-stop auto-deload, or amend doc 10 to match the simpler ±1 model).
**Status: answered.**

---

## PR22 — RIR ramp seeding & catching overperformance (the leg-press story)

- The **RIR ramp sets only the per-week target RIR** (linear start→end, deload at
  `deload.target_rir`) — `src/lib/engine/rules/rir.ts:14-45`. It does **not** seed
  the weight.
- **New-meso starting weight** is `seedMeso` = prior meso's **all-time best actual
  weight/reps** from `v_exercise_prs` × `meso_seed_backoff_pct` (0.925).
- **Within a meso, overperformance IS caught:** the rep-window path re-prices load
  off the rising recency anchor, so the leg-press "20 reps at 0 RIR" raises the
  anchor and next week's load. Swap-ins also seed from the anchor.
- **But at the meso boundary it is partly lost:** `seedMeso` keys on
  `v_exercise_prs.best_weight` (top *weight*), not the anchor or a rep-based
  high-water-mark. So a breakthrough in **reps** (not top weight) lifts load
  *within* the meso but does **not** propagate into the next meso's seed.

So the answer to the note's question — "will it landmark that high-water-mark as
my new 0-RIR going forward?" — is **within the meso yes, across the meso boundary
no.** This is a real gap worth closing. → **follow-up task T-A6** (seed new meso
from the recency anchor / rep-based high-water-mark, not just top-weight PR — the
core honesty mechanism the note is asking for). **Status: answered → spawns T-A6.**

## PR23 — How is the baseline weight & reps set?

Three different baseline notions are in active use depending on context:
- **Week-to-week:** best actual working set (`perf.bestWeight`, tiebreak reps);
  effective baseline is the recency anchor in rep_window mode.
- **New-meso seed:** all-time best historical set from `v_exercise_prs` × backoff —
  not last, not recency-weighted, not averaged.
- **Swap-in / cold start:** recency anchor (if confident) else planner defaults.

Macrocycle **goal** selects the rep window and `progression_style` but does not
set the baseline weight directly. Recency/averages enter **only** via the engine
anchor, not the meso seed. Same inconsistency flagged in PR22/T-A6.
**Status: answered.**

## PR24 — Add/sub an exercise mid-cycle (history exists, none in this meso)

`assessPerformance` returns `no_data`; `prescribe` takes the **swap-in branch**: if
rep_window mode + a usable lifetime anchor (≥ `reps_predict.min_confidence`), it
seeds load from the anchor for the window's low rep at the week's RIR
(`seed_anchor`, `src/lib/engine/index.ts:103-151`). Sets = `previous?.sets ??
initial?.sets ?? min_sets`. **Status: answered.**

## PR25 — No history present at all

Falls to the **cold-start** branch: uses `previous ?? initial` plan defaults
(weight may be null), reps from initial, sets = initial or `min_sets`, at the
week's target RIR. Mid-workout slot adds seed via `seedMeso` with null `priorPeak`
⇒ planner `initial`. Note: a low-confidence lifetime history silently behaves like
cold start rather than using the low-confidence anchor. **Status: answered.**

---

## PH39 — How fast does e1RM recency decay? (Pulldown 110.1 but did 115×11 May 22)

The **engine anchor** decays at `0.5^(ageDays / recency_halflife_days)`, default
**30-day half-life** (`src/lib/queries/logging.ts:47-106`). But the **stats-view
e1RM the user is reading has no recency decay at all** — it's raw Epley. So the
"110.1 vs a real 115×11" discrepancy is almost certainly the two-systems split
(T-A1), not decay: a 115×11 set is e1RM ≈ 157 by raw Epley, so a displayed 110.1
suggests the screen is showing an **anchor/averaged** value, or a different
set/window, than the user expects. → **follow-up task T-A1** covers reconciling
this; worth a concrete repro to confirm which number the Pulldown screen shows.
**Status: answered → needs a quick repro under T-A1.**

## PH40 — Sets "reprice as you go" during a workout

Real and by-design in rep_window mode: the live reps predictor re-derives the
prescribed load from the recency anchor, and because newly-logged sets in the
**current open workout** feed that anchor (see PH41), the prescription for later
sets can shift as you log earlier ones. The note asks whether it should only look
at *previous* sets. → **follow-up task T-A7** (decide: freeze the in-session
prescription at session start vs. let it adapt live; if adapting, make it legible
to the user). **Status: answered → spawns T-A7 (needs decision).**

## PH41 — History includes the current (incomplete) workout

Confirmed: all stats views and the history/anchor queries read `logged_sets`
directly with **no workout-status filter** (only `is_warmup = false`). A set logged
in an open, in-progress workout immediately counts toward volume, e1RM, PRs, and
the anchor. (Completion only **locks** rows from edits; it doesn't gate
visibility.) Note that next-**week** generation, by contrast, runs only off
`status = 'completed'` workouts. This contradicts the user's mental model ("a
current workout isn't entered anywhere until complete"). → **follow-up task T-A8**
(decide whether in-progress sets should be excluded from history/stats until the
workout is completed — interacts with PH40). **Status: answered → spawns T-A8.**

---

## Spawned follow-up tasks (add to `backlog.md`)

| ID | From | Task | Type |
|----|------|------|------|
| T-A1 | S1/PH39 | Reconcile the two e1RM systems (engine anchor vs raw-Epley view) — document the divergence and decide whether stats screens should show the anchor. | D→F |
| T-A2 | S3 | Decide + document deload handling in stats; skip deload sessions in `getMesoProgressScores`. | D→B |
| T-A3 | S4 | ~~Surface/log the low-confidence fallback~~ — **resolved by the PR26 investigation:** active `weight_selection` is `rep_window` with `min_confidence: low`, so the confidence fallback never fires; the legacy path is reached via **no anchor** (bodyweight/cold-start). Folded into workstream **I** (`I-engine-v9.md`). | Q→B |
| T-A4 | S5 | Decide whether a hard big-miss back-off belongs in rep_window mode, or document the anchor as sole mechanism. | D |
| T-A5 | S7 | Implement graded MEV→MAV→MRV volume ramp + MRV-stop auto-deload, or amend doc 10 to the ±1 model. | D→F |
| T-A6 | PR22/PR23 | ~~Seed a new meso from the recency anchor / rep-based high-water-mark, not just the top-weight PR.~~ **Done (gated, pending activation):** `seed_from_anchor` (§S1) makes `seedMeso` mirror the swap-in `seed_anchor` branch — seeds week 1 from the recency anchor for the window's low rep at the start RIR; `v_exercise_prs` (§S2) now returns a coherent best-e1RM set as the fallback peak. Shipped in engine_params **v11 (inactive)**; activate after a replay diff. See `docs/reviews/2026-06-23-standalone-prescription-investigation.md`. | F |
| T-A7 | PH40 | Decide whether in-session prescription should freeze at session start or adapt live; make adaptation legible. | D |
| T-A8 | PH41 | Decide whether in-progress (incomplete) workout sets count toward history/stats. | D |
