# notes — the owner's running field-notes, tracked

This folder is Claude's working notebook for the stream of notes the owner
captures while using WORKOUT (bugs, questions, ideas, UX nits). The owner hands
over raw notes periodically and works the backlog **through Claude** — Claude
owns and maintains the structure here.

- **How this area operates:** [`CLAUDE.md`](./CLAUDE.md) — the intake protocol,
  lifecycle, and consolidation/purge rules. Read it first.
- **Current state of every open item:** [`backlog.md`](./backlog.md).
- **What happened recently:** [`log.md`](./log.md) (newest first).
- **Closed/shipped items:** [`archive.md`](./archive.md).

## Workstreams

Items are grouped so related work ships together; a workstream gets a detail
file once it's actively worked. Re-cut these whenever intake reveals a better
grouping.

| ID | Workstream | Detail file | What it covers |
|----|-----------|-------------|----------------|
| **A** | Engine & metrics Q&A | [`A-engine-metrics.md`](./A-engine-metrics.md) | How e1RM, strength gain, progression, misses, baselining, set-planning, deloads work — answered from code + spec. Open: **N68** (the stats e1RM stamp ignores prescribed RIR while the anchor honors it — blocks N67 direction 2). |
| **B** | e1RM audit & exposure | _shipped_ | Store per-set e1RM, expose to MCP, tap-to-flip e1RM view in history. |
| **C** | Stats unification | _tbd_ | Meso ↔ macro stats parity, planned-sets definition, aggregate strength gains. Shipped: strength-rate band v23 (N43, PR #182 — inactive, awaits Phase-R activation), target-card disable (N54, 2026-07-12). Open: DEXA-copy amendment + target-card re-enable (N52/N54, ride the v23 activation). |
| **D** | Macrocycle & meso management | _tbd_ | Custom-duration input bug, unplanned-meso display, meso management under a macro. Open: custom-template editing (N46). |
| **E** | Logging & feedback UX | _tbd_ | Feedback slider resolution, note icon, back-button clutter, set-type removal, over/under marker, soreness capture. Shipped: replace-sheet filters + confirm step (N48/N49, 2026-07-12). |
| **F** | Settings, profile & search | _tbd_ | Settings cleanup, template-code flow, profile height units, live search filter, bodyweight-exercise settings. |
| **G** | Bugs | _tbd_ | Discrete defects to reproduce + fix. Shipped: page-switch double-marker glitch (PH29, PR #84), switch-exercise prescription (PH38, PR #84), match-weights crash (PH35), height units (PH28), R8–R13 (2026-07-01 review, PRs #95–#119), replace-exercise first-set staleness (N5), deload underperform arrow (N11). , past-workout input lock (N50) + seed rep-window bound (N51, engine) 2026-07-12. Open: engine guardrail remainder (R24, reprice-down); tab-bar detach on iOS standalone (N47, HIGH). |
| **H** | Needs product decision | _tbd_ | Items that were blocked on an owner call — **all decided 2026-07-02 (backlog Batch 4):** admin-tool privacy (PH33 → ready), soreness-at-0-days (P21 → verify), LLM prescription analysis (PH30 → deferred). |
| **I** | Engine v9 cleanup | [`I-engine-v9.md`](./I-engine-v9.md) _(shipped)_ | Retire the legacy increment path; fold bodyweight / cold-start / big-miss into a clean v9 model. Complete (T-I1–T-I5, engine_params v16 active); detail file kept for history. |
| **J** | Performance & efficiency | [`J-performance.md`](./J-performance.md) | Speed/efficiency pass (N1): measure-first baseline, then client bundle/render wins + query-scope/caching. Heavy lifting already lives in the backend; the engine stays pure TS (not relocated to edge/DB). Open: launch splash / black-screen pre-paint window (N53, HIGH). |
| **K** | Integrity & security hardening | [`../reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md) §1/§4 | From the 2026-07-01 repo review: shares exploit (R1), dead CI/RLS guardrail (R2), non-atomic plan/param writes + missing uniques (R3), history-deleting regeneration (R4), completion-lock bypasses (R5), UTC dates (R6), SW auth-cache purge (R7), MCP polish (R25). |
| **L** | Delivery guardrails & observability | [`../reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md) §5 | From the same review: production error observability (R20), e2e/integration/golden-v16 coverage (R21), env fail-fast (R22), repo hygiene (R23). |
| **M** | In-app help & education | _tbd_ | Batch 7: shared InfoDot primitive + glossary source for the app's jargon (RIR, e1RM, MEV/MRV, deload…) placed across dense surfaces (N25). |
| **Q** | MEASURE companion app | [`../20-measure-companion-app.md`](../20-measure-companion-app.md) | The measurement front end (N66): bodyweight series + smoothing/reports, circumferences, DEXA relocation, import/export, the integrated summary, and the WORKOUT seam. Direction fixed; blocked on the doc-20 §13 owner decisions, then Phase 0's mockup pass (hard rule 8) before any build. |
| **P** | Prescribed progression | [`../16-prescribed-progression.md`](../16-prescribed-progression.md) | Earned-step overload + macro-rate pacing (N35, engine_params v20). Phases 1–4 shipped (PRs #158–#161); Phase R activation prepared 2026-07-09. Open deferred spine (doc 16 §11): envelope loop (N36), `rate_source:"plan"` pacer branch (N37, needs N21), required honest-RIR confirmation (N38), per-exercise progression-off override (N39). Shipped: prescription-detail audit surfacing (N44/N45, 2026-07-12). Also holds **N67** (temporary per-exercise effort/load management — override direction PARKED, [`../reviews/2026-07-31-coach-override-prescriptions.md`](../reviews/2026-07-31-coach-override-prescriptions.md); live direction is exercise-level RIR, [`../reviews/2026-07-31-exercise-level-rir.md`](../reviews/2026-07-31-exercise-level-rir.md), `needs-input` on its §9 Q1–Q8 and blocked on N68; N39 is nearly redundant under a RIR floor). |
