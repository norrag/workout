# Triage — working through the field-notes backlog

This folder is the working area for processing the running list of issues,
questions, and ideas captured while using the app (the "Notes" doc, imported
2026-06-22). The raw list mixes everything together — pure questions, fuzzy
"needs more thought" ideas, UX nits, and hard bugs — so the job here is to
**drive every note to a clean action**: either a resolved answer, a
well-scoped task ready to build, or an explicit decision/won't-fix.

This is expected to span multiple sessions. Everything needed to resume is in
this folder; start any session by reading [`log.md`](./log.md) (what happened
last) and [`backlog.md`](./backlog.md) (current state of every item).

## The sub-process

Each note moves through these stages:

```
inbox  →  triaged  →  (needs-input | ready | answered)  →  in-progress  →  done
```

1. **inbox** — parsed from the source doc, not yet examined.
2. **triaged** — classified (type + workstream), and an initial scope note
   written against the real codebase (where it lives, rough size, blockers).
3. One of:
   - **answered** — for info-gathering questions: researched and answered in
     the relevant workstream file; closed (may spawn a follow-up task, which
     becomes its own backlog item).
   - **needs-input** — blocked on a decision only the owner can make; the
     question is framed in the backlog with options.
   - **ready** — scoped to a clean, buildable task with acceptance criteria.
4. **in-progress** — being built (on a feature branch / PR).
5. **done** — shipped (link the PR/commit), or **wontfix** / **superseded**
   with a one-line reason.

## Status legend

| status        | meaning                                              |
|---------------|------------------------------------------------------|
| `inbox`       | parsed, not yet examined                             |
| `triaged`     | classified + initial scope written                   |
| `answered`    | question resolved in a workstream doc (closed)       |
| `needs-input` | blocked on an owner decision                         |
| `ready`       | clean scoped task with acceptance criteria           |
| `in-progress` | being built                                          |
| `done`        | shipped (PR/commit linked)                           |
| `wontfix`     | declined, with reason                                |
| `superseded`  | folded into / replaced by another item               |

## Type legend

| type | meaning                                              |
|------|------------------------------------------------------|
| `Q`  | question / info-gathering (answer from code + docs)  |
| `B`  | bug (incorrect behavior)                             |
| `F`  | feature / rework                                     |
| `UX` | UX polish / cosmetic                                 |
| `D`  | needs a product decision before it can be scoped     |

Priorities carried over from the source doc where given (HIGH / MEDIUM / LOW),
otherwise assigned during triage.

## Workstreams (the chunks)

Items are grouped so related work can be tackled together, ideally one
workstream per working session. Each workstream gets its own detail file as it
is picked up.

| ID | Workstream | Detail file | What it covers |
|----|-----------|-------------|----------------|
| **A** | Engine & metrics Q&A | [`A-engine-metrics.md`](./A-engine-metrics.md) | How e1RM, strength gain, progression, misses, baselining, set-planning, deloads work — answered from code + spec. Source of truth for the "how does X work" cluster. |
| **B** | e1RM audit & exposure | _tbd_ | Store per-set e1RM, expose to MCP, tap-to-flip e1RM view in history. |
| **C** | Stats unification | _tbd_ | Meso ↔ macro stats parity, planned-sets definition, aggregate strength gains. |
| **D** | Macrocycle & meso management | _tbd_ | Custom-duration input bug, unplanned-meso display, meso management under a macro. |
| **E** | Logging & feedback UX | _tbd_ | Feedback slider resolution, note icon, back-button clutter, set-type removal, over/under-prescription marker, soreness capture. |
| **F** | Settings, profile & search | _tbd_ | Settings page cleanup, template-code flow, profile height units, live search filter, bodyweight-exercise settings. |
| **G** | Bugs | _tbd_ | Discrete defects to reproduce + fix (match-weights crash, page-switch flicker, switch-exercise prescription, height units). |
| **H** | Needs product decision | _tbd_ | Items blocked on an owner call (LLM prescription analysis, admin-tool privacy, soreness rule). |
| **I** | Engine v9 cleanup | [`I-engine-v9.md`](./I-engine-v9.md) | Retire the legacy increment path and fold genuinely-needed behavior (bodyweight-only / -loadable, cold start, big-miss back-off) into a clean v9 model. Pulls in T-A3, T-A5, PH36. |

## Resuming across sessions

1. Read [`log.md`](./log.md) — the dated record of what each session did.
2. Open [`backlog.md`](./backlog.md) — every item with current status.
3. Pick the next workstream / item by priority and `ready`-ness.
4. When you change anything, update the item's status in `backlog.md` and add
   a dated entry to `log.md`. Keep `backlog.md` the single source of truth for
   item state.
