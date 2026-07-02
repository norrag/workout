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
| **A** | Engine & metrics Q&A | [`A-engine-metrics.md`](./A-engine-metrics.md) | How e1RM, strength gain, progression, misses, baselining, set-planning, deloads work — answered from code + spec. |
| **B** | e1RM audit & exposure | _shipped_ | Store per-set e1RM, expose to MCP, tap-to-flip e1RM view in history. |
| **C** | Stats unification | _tbd_ | Meso ↔ macro stats parity, planned-sets definition, aggregate strength gains. |
| **D** | Macrocycle & meso management | _tbd_ | Custom-duration input bug, unplanned-meso display, meso management under a macro. |
| **E** | Logging & feedback UX | _tbd_ | Feedback slider resolution, note icon, back-button clutter, set-type removal, over/under marker, soreness capture. |
| **F** | Settings, profile & search | _tbd_ | Settings cleanup, template-code flow, profile height units, live search filter, bodyweight-exercise settings. |
| **G** | Bugs | _tbd_ | Discrete defects to reproduce + fix. Shipped: page-switch double-marker glitch (PH29, PR #84), switch-exercise prescription (PH38, PR #84), match-weights crash (PH35), height units (PH28). Open (from the 2026-07-01 review): pain-gate set-add veto (R8), short-phase trend read (R9), replay bodyweight seed (R10), decisions-fetch truncation (R11), custom-exercise load_type (R12), SetRow typing clobber (R13), engine guardrail batch (R24). |
| **H** | Needs product decision | _tbd_ | Items that were blocked on an owner call — **all decided 2026-07-02 (backlog Batch 4):** admin-tool privacy (PH33 → ready), soreness-at-0-days (P21 → verify), LLM prescription analysis (PH30 → deferred). |
| **I** | Engine v9 cleanup | [`I-engine-v9.md`](./I-engine-v9.md) _(shipped)_ | Retire the legacy increment path; fold bodyweight / cold-start / big-miss into a clean v9 model. Complete (T-I1–T-I5, engine_params v16 active); detail file kept for history. |
| **J** | Performance & efficiency | [`J-performance.md`](./J-performance.md) | Speed/efficiency pass (N1): measure-first baseline, then client bundle/render wins + query-scope/caching. Heavy lifting already lives in the backend; the engine stays pure TS (not relocated to edge/DB). |
| **K** | Integrity & security hardening | [`../reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md) §1/§4 | From the 2026-07-01 repo review: shares exploit (R1), dead CI/RLS guardrail (R2), non-atomic plan/param writes + missing uniques (R3), history-deleting regeneration (R4), completion-lock bypasses (R5), UTC dates (R6), SW auth-cache purge (R7), MCP polish (R25). |
| **L** | Delivery guardrails & observability | [`../reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md) §5 | From the same review: production error observability (R20), e2e/integration/golden-v16 coverage (R21), env fail-fast (R22), repo hygiene (R23). |
