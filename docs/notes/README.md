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
| **G** | Bugs | _tbd_ | Discrete defects to reproduce + fix (match-weights crash, page-switch flicker, switch-exercise prescription, height units). |
| **H** | Needs product decision | _tbd_ | Items blocked on an owner call (LLM prescription analysis, admin-tool privacy, soreness rule). |
| **I** | Engine v9 cleanup | [`I-engine-v9.md`](./I-engine-v9.md) | Retire the legacy increment path; fold bodyweight / cold-start / big-miss into a clean v9 model. |
| **J** | Performance & efficiency | [`J-performance.md`](./J-performance.md) | Speed/efficiency pass (N1): measure-first baseline, then client bundle/render wins + query-scope/caching. Heavy lifting already lives in the backend; the engine stays pure TS (not relocated to edge/DB). |
