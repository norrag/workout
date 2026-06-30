# CLAUDE.md — Operating manual for the notes area

This is **Claude's working notebook** for the running stream of field notes the
owner captures while using WORKOUT — bugs, questions, ideas, UX nits, and "go
look at this" hunches. It is not a finite import to drain; it is an **ongoing
intake-and-tracking system** that lives for as long as the app is being used.

**Claude owns this structure.** The owner does not browse or maintain these
files — they hand Claude raw notes periodically and interface with the backlog
*through Claude*. So optimize every file here for **Claude's** consumption and
for surviving across sessions, not for human readability. Rename, split, merge,
re-shape, and prune freely whenever the shape of the work changes — just keep
this manual, `backlog.md`, and `log.md` truthful so any future session can
resume cold.

> One thing to internalize: the owner's notes arrive **raw and overlapping** —
> the same underlying problem stated three ways, an idea that depends on a bug
> being fixed first, a "low priority" nit that's actually a symptom of a high
> priority defect. The value Claude adds is **assessment**: dedup, relate,
> group, sequence, and prioritize — not just file-and-forget.

---

## The intake protocol (what to do when the owner hands over notes)

When the owner delivers a batch of notes ("here are my notes", a pasted list, a
photo of a phone note, etc.), run this loop:

1. **Capture verbatim, never lose a word.** Append the raw text to
   `backlog.md`'s [appendix](./backlog.md#appendix-verbatim-source) under a dated
   intake batch heading. The appendix is **append-only** — it is the permanent
   record of what was actually said, independent of how items later get split or
   reworded.
2. **Parse into discrete items.** One note may become several items, or several
   notes may collapse into one. Give each a stable ID (see *IDs* below).
3. **Assess each item against what's already known** — this is the core step:
   - **Duplicate / overlap?** If it restates an open item, fold it in (add the
     new phrasing to that item, don't create a second row). If it overlaps
     partially, cross-link them and note the shared root cause.
   - **Relationship / dependency?** If it can't be built until another item
     ships, record `blocked on <ID>`. If it's a symptom of a deeper item, link
     `symptom of <ID>` and consider whether fixing the root closes it.
   - **Grouping?** Assign it to a workstream (existing or new) so related work
     can be tackled together. Re-group existing items if the new note reveals a
     better cut.
   - **Priority?** Carry the owner's HIGH/MED/LOW if given; otherwise assign one
     and say why. Let dependencies inform sequence (a HIGH item blocked on a MED
     item means the MED item is effectively HIGH).
4. **Classify** type (`Q/B/F/UX/D`) and set initial **status** (usually `inbox`
   → `triaged` once scoped).
5. **Scope** the actionable ones against the real codebase (file:line refs in
   `scoping.md` or a workstream detail file) so they're ready to build later.
6. **Record** a dated entry in `log.md` summarizing what the batch added/changed.

Always end an intake by telling the owner, in chat, what you did: what was new,
what merged into existing items, what relationships/dependencies you found, and
what you'd suggest tackling next. The chat *is* their interface to this area.

## Lifecycle

```
inbox → triaged → (needs-input | ready | answered) → in-progress → done → archived
```

| status        | meaning                                                  |
|---------------|----------------------------------------------------------|
| `inbox`       | captured, not yet examined                               |
| `triaged`     | classified + initial scope written                       |
| `answered`    | question resolved in a detail doc (may spawn a task)     |
| `needs-input` | blocked on an owner decision (frame the options in-row)  |
| `ready`       | clean scoped task with acceptance criteria               |
| `in-progress` | being built (link the branch/PR)                         |
| `done`        | shipped (PR/commit linked) — eligible for archival       |
| `wontfix`     | declined, with a one-line reason                         |
| `superseded`  | folded into / replaced by another item (link it)         |
| `archived`    | terminal; moved out of the live index into `archive.md`  |

## Types

| type | meaning                                              |
|------|------------------------------------------------------|
| `Q`  | question / info-gathering (answer from code + docs)  |
| `B`  | bug (incorrect behavior)                             |
| `F`  | feature / rework                                     |
| `UX` | UX polish / cosmetic                                 |
| `D`  | needs a product decision before it can be scoped     |

A type can shift as understanding sharpens (`Q→B` when a question turns out to
expose a defect). Keep the arrow so the origin is visible.

## IDs

IDs are stable handles, never reused. Existing prefixes are historical
(`S*` stats questions, `M*`/`P*`/`PH*` from the original phone/macro/priority
batches, `PR*` progression, `I*` important, `T-*` spawned follow-up tasks,
`O*` one-offs). For **new** intake, prefer a short dated batch prefix
(e.g. `N1`, `N2`, … for "note") so the source batch is legible from the ID, and
spawn follow-ups as `T-<id>`. Don't renumber old IDs — they're referenced from
`log.md`, `PROGRESS.md`, and `docs/reviews/`.

## Workstreams

Items are grouped into workstreams so related work ships together (ideally one
workstream per session). A workstream gets its own **detail file** once it's
actively worked (e.g. `A-engine-metrics.md`, `I-engine-v9.md`); until then it's
just a column in the index. Re-cut workstreams whenever intake reveals a better
grouping — the letters are labels, not a fixed taxonomy. The current roster
lives in [`README.md`](./README.md#workstreams) and the per-item assignment in
`backlog.md`.

## Keeping the index in sync with PRs (the non-negotiable part)

The index only stays truthful if status moves **in lockstep with the code**. The
failure mode this prevents: a build PR ships the fix but leaves the row reading
`done (PR pending)` forever, so the live index slowly fills with already-merged
work. Two rules, and the resume sweep that backstops them:

1. **When a PR addresses an item, that same PR updates the item's row** — set the
   status to `done (PR #<n>)` with the **real PR number** (never a bare "PR
   pending"), and append the `log.md` entry in the same PR. Building the code and
   leaving the row stale is an incomplete change. If you open the PR before you
   know its number, write the branch name and fix the number to `#<n>` the moment
   the PR exists. This applies to **any** PR that closes/advances a tracked item,
   not just sessions that start from this area — if you touch code that resolves a
   backlog ID, update its row before you push.
2. **A merged PR cannot sweep its own row** (the merge happens after the PR is
   written), so archival is a **separate, mandatory step owned by the resume
   protocol** (below). Never assume "the build PR will handle archival" — it
   structurally can't.
3. **Reconciliation sweep, every session start** — before picking new work,
   reconcile the live index against actual merge state: for every row marked
   `done` / `done (PR #<n>)` / any "PR pending" wording, check whether that PR has
   **merged** (git log / list merged PRs). If merged, sweep the row to `archive.md`
   with its PR link and a one-line resolution, per the purge policy. This is what
   makes the system self-correct even when a prior session forgot rule 1.

## Consolidation & purge policy (keeping the live index lean)

An ongoing system rots if every closed item stays in the live table forever. So:

- **Archive terminal items.** When an item is `done` (and the PR is merged /
  the owner has confirmed), `wontfix`, or `superseded`, move its **row** out of
  `backlog.md`'s live index into [`archive.md`](./archive.md), preserving its
  ID, resolution, and PR/commit link. Its **verbatim text stays** in the
  `backlog.md` appendix (append-only record) — only the tracking row migrates.
- **Consolidate overlaps** as soon as you spot them: one canonical item, with
  the alternate phrasings folded in and the duplicate row marked `superseded →
  <ID>` and archived. Never leave two live rows for one problem.
- **Don't purge prematurely.** Keep `done`-but-unmerged items live (they're not
  truly shipped). Keep anything with open follow-ups live until the follow-ups
  close too.
- **Batch the cleanup.** Do an archival sweep at the end of a session that
  closed work, not mid-task. Note the sweep in `log.md`.

## File map

| File | Role |
|------|------|
| `CLAUDE.md` (this) | how this area operates — the standing instructions |
| `README.md` | thin orientation + the workstream roster |
| `backlog.md` | **live index** of every open/active item + the append-only verbatim appendix — the single source of truth for item state |
| `archive.md` | terminal items (done/wontfix/superseded) moved out of the live index, with resolutions |
| `log.md` | dated activity log, newest first — what each session changed |
| `scoping.md` | codebase-grounded scope notes for UI/feature/bug items |
| `A-engine-metrics.md` | workstream A detail (engine & metrics Q&A) |
| `I-engine-v9.md` | workstream I detail (engine v9 cleanup) |
| _new `<X>-*.md`_ | spin up a detail file per workstream as it's picked up |

## Resume protocol (every session, start here)

1. Read `log.md` (newest entry = where the last session left off).
2. Open `backlog.md` (live state of every open item) and `archive.md` if you
   need a closed item's history.
3. **Run the reconciliation sweep** (see *Keeping the index in sync with PRs*):
   for every `done` / `done (PR #<n>)` / "PR pending" row, confirm whether its PR
   has merged, and archive the merged ones **before** doing anything else. Do this
   every session, not only when something looks stale — it's the backstop for any
   row a prior session left un-swept.
4. If the owner handed over notes, run the **intake protocol** above.
5. Otherwise pick the next item by priority + `ready`-ness, respecting
   `blocked on` dependencies.
6. Whenever you change anything, update the item's row in `backlog.md` **and**
   append a dated `log.md` entry. Keep `backlog.md` the single source of truth.
   If the change is a **code PR** that resolves an item, set the row to
   `done (PR #<n>)` in that same PR (rule 1 above).

## Integration with the rest of `docs/`

This area feeds the build, it doesn't replace the specs. When an item ships,
the implementation record goes in `docs/PROGRESS.md` (link the item ID back);
deep investigations live in `docs/reviews/`; binding product/engine decisions
get written into the numbered specs (`docs/0x`–`1x`) per the root `CLAUDE.md`.
The backlog tracks *intent and status*; those docs hold the *substance*.
