# Triage log

Append a dated entry whenever a session moves work. Newest first.

## 2026-06-22 — Session 2: reconcile Notes v2, scope the v9 cleanup, ship two bug fixes

- **Reconciled the backlog with Notes v2.** Owner pruned items session 1 resolved
  and added two. Removed as resolved: S4, S5, I13, I15, PR22–PR25 (kept with
  `resolved (removed in v2)`). Added **S8** (engine add/remove sets/reps — answered
  by existing S7/S4 research) and **PR26** (retire the legacy increment path → v9).
- **Corrected a session-1 error:** the active engine is **already v9**
  (`weight_selection: rep_window`, `min_confidence: low`), not v8. This makes the
  T-A3 "silent confidence fallback" essentially moot in production — the legacy
  path is reached via **no anchor** (bodyweight-only + cold start), not confidence.
- **Scoped PR26** into [`I-engine-v9.md`](./I-engine-v9.md) via a code investigation:
  the legacy path is the de-facto bodyweight/cold-start path; bodyweight needs a
  real data-model change (no `is_bodyweight` flag today; `weight=0` makes the
  rep-window math null; both bodyweight equipment buckets collapse to one). Spawned
  T-I1–T-I4.
- **Shipped two bug fixes** (the queued first slice), with `typecheck` + `lint`
  green and all **481 tests passing**:
  - **M9** — `CreateMacroForm` custom-duration field now holds a string and clamps
    on blur, so it can be emptied and retyped.
  - **PH35** — `setPlannedSetWeight` uses `.maybeSingle()` + no-ops on a missing
    row; `persistPlannedWeight` routes through `runLog` (try/catch + toast) instead
    of the unguarded `commit`, so an auto-match write failure can't trip the
    app-error page. (Exact on-device trigger unconfirmed; this removes the crash
    surface + the most likely cause — flagged for device verify.)

### Next session — suggested starting point
- The big open cluster is **needs-input decisions** (T-A1/2/4/6/7/8, T-I1/3, plus
  M10/P16/P17/P18/PH28/PH30/PH33). Walking these with the owner unblocks the most
  work. The v9 cleanup (WS I) is the largest engine effort and starts with T-I1.

## 2026-06-22 — Session 1: set up the triage system, parse + first-pass triage

- Imported the Notes doc (2026-06-22) and parsed **42 distinct items** across 6
  source sections into [`backlog.md`](./backlog.md), preserving verbatim text.
- Established the sub-process, status/type legends, and 8 workstreams in
  [`README.md`](./README.md).
- Ran codebase research to scope the **UI/feature** cluster; findings recorded
  per item in [`scoping.md`](./scoping.md). Key outcomes:
  - **I13** (per-user weight increment) — already shipped 2026-06-21; needs only
    a verification pass, not new work.
  - **M8** "est-strength under meso Performance tab" — **already present**; the
    real ask is the *macro* 3-way toggle, which has no mockup yet (design
    decision needed, hard rule #8).
  - **I15** (note icon left of history) — that icon **already exists**; overlaps
    with **PH42** (the *edit* pencil glyph `✎` is the unclear one).
  - **M9** (custom-duration backspace) and **PH35** (match-weights crash) have
    confirmed root causes and are small, ready-to-build fixes.
  - Several items (**M10**, **P16**, **P17**, **P18**, **PH28**) carry open
    design questions flagged for the owner before implementation.
- Ran codebase research on the **engine/metrics** cluster (A) — see
  [`A-engine-metrics.md`](./A-engine-metrics.md).

### Next session — suggested starting point
- Review `scoping.md` + `A-engine-metrics.md` answers and confirm the open
  design questions (collected under workstream **H**).
- Then knock out the two clean bug fixes (**M9**, **PH35**) as a first
  vertical slice.
