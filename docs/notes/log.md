# Notes-area log

Append a dated entry whenever a session moves work. Newest first.
(Formerly "Triage log" — the area was rebranded to an ongoing notes system on
2026-06-26; see the entry below.)

> **Dates in this log are not a reliable sort key; the order is.** Entries run
> **newest session first**, and where a session number is given that is the
> authoritative sequence. The dates come from each session's own clock, which
> has drifted from real time more than once — sessions 114–123 all carry
> doc-side dates that run ahead of the merge dates their own PRs are stamped
> with (session 119, dated 2026-08-10 from a `mcp_write_audit` row, sits below
> entries dated 2026-08-15 whose PRs merged on 2026-08-13). Earlier sessions
> left this as found rather than renumbering, and so does this one: **when a
> date matters, take it from the PR's merge timestamp or a DB row, not from the
> heading.** Sessions are numbered from 93 onward; **120 was never used.**

## 2026-08-30 — Session 131: the plate loader comes in from the shortcut (N89)

**Owner:** *"I have an apple shortcut that does this… place it the exercise
drop down menu as a tool for loading plates… brought up in a bottom tray, and
then execute its quick multi-stage workflow in pages which advance right to
left… The weight should be autofilled from the weight of the active set of
exercise it was selected from, but allow the user to change it (changing it from
load plates would update the set too)… This should be staged as a feature update
fyi."* Attached: the shortcut's own implementation spec.

**The math was the easy half and is a faithful port.** `src/lib/plates.ts` —
subtract the unloaded implement, split across one or two sides, spend
`[45, 25, 10, 5, 2.5]` greedily largest-first, never exceed the ask, report the
achievable total. Two departures from a literal transcription, both small: it
runs in **integer quarter-pounds**, because a floating-point descent that
subtracts 2.5 four or five times accumulates enough dust for `floor` to drop a
plate the lifter can actually load; and the rack is a **parameter** rather than
a constant, which is the spec's own closing note honored as far as it goes
without inventing a settings screen nobody asked for.

**The coupling is the half that justifies building it here at all.** A plate
calculator that does not know the set makes you type the weight twice and lets
the two disagree. So the tray opens on the **active** set's weight — the first
not logged or skipped, resolved exactly as the weight cell resolves it — and a
change written there goes back to that set through the same queued
`plan_weight` op a weight-cell blur uses, which means `Match weight across sets`
governs its fan-out with no new rule and no new op kind. On a completed or
locked session it stays a calculator and says so.

**Hard rule 8 had nothing to transcribe.** There is no mockup for this, so the
pass was discharged as a design entry written before the build (09-changelog
2026-08-30): four pages on a horizontal track, `touch-action: pan-y` so the
swipe axis is ours and the sheet still scrolls, a step rail whose current
segment is the one thing rule 7 lets the accent mark, and a result that reads as
a ledger first and a drawn sleeve second. An unreachable ask is **stated** —
closest total under it, how far short, and an offer to record that number —
rather than silently rounded, which is doc 10 §9 applied to a number the app
made up rather than one it measured.

**Two calls worth restating.** The bar weight and loading points live in
**device storage** per exercise, not on the account: they describe the rack you
are standing at, they have to work with no connection, and the equipment
defaults are only an opening bid one visit replaces — no migration, and nothing
entangled with the `exercise_param_overrides` fingerprint, which is an *engine*
override table and would have been the wrong home. And the menu row goes
**second in N82's first group**, the only insertion that leaves every existing
row at the index a returning thumb already knows.

Staged behind `releaseActive("1.2.0")` per the owner's closing line, with the
release note in `unreleased.ts`. PR [#255](https://github.com/norrag/workout/pull/255).

**Round 2, same session — the note itself.** The owner read the staged entry and
asked for two things: plainer copy (*"just tell the user what the tool is in a
basic way"*) and *"a quick, cropped gif"* demonstrating it. The copy is now the
owner's own sentence, tidied. The recording needed a **pattern** first: release
entries had no media at all, so `ReleaseEntry` gained an optional `media`,
rendered identically in the once-only modal and the What's New history (§8's
one-renderer rule), with CI gates on the asset's existence, path, size budget
and alt text, and its own service-worker cache so one recording cannot evict app
chrome. Two calls are worth reading in
[`09-changelog`](../09-design-changelog.md) 2026-08-30 §7: the media is **capped
at 260px** (a portrait phone recording at full entry width is taller than the
modal's whole scroll area — the note would open on a picture with its prose
pushed off screen), and it ships in **one theme**, because a raster cannot be a
theme-following mask and neither `display:none` nor `<picture>` can avoid
fetching a second copy under an explicit `data-theme` toggle.

The clip itself was recorded against the **real components** — a production
build, the day view's own `AnchoredMenu`, the built `PlateSheet`, real fonts and
tokens, real touch events through CDP — with the CSS timeline slowed 4× so a
280 ms transition yields enough frames to resample back to true speed. It is a
recording of the app, not a re-drawing of it, which is the only basis on which
an announcement may show one. The example is the owner's own upcoming Barbell
Hip Thrust at 287.5 lb: a number the rack cannot reach, so the clip ends on 285
and the 2.5 lb it is short by rather than on something tidier. Guide updated in the same PR (hard rule 10):
ch. 5 `#adjusting-as-you-go` gains *Loading the bar*, with claims
`C-plate-01`…`05` and the `22c` §B1.2 menu inventory corrected.

## 2026-08-15 — Session 130: N88 — the strength anchor was starving on batch width

**Owner:** *"Kneeling Hamstring Curl has plenty of logged history, but when the
current mesocycle was created, the prescription engine incorrectly treated it
like a brand-new exercise with no history… This is not because the history is
too old… the mesocycle seeding process failed to retrieve the existing history
for this exercise."*

Confirmed, and the owner's diagnosis was right down to the exclusion. It was a
retrieval failure, not an age rule.

**What it was.** `getExerciseE1rmAnchors` bounded egress with a global
`.limit(600)` over one recency-ordered read spanning the entire batch of
exercises. That is a per-**call** cap, not a per-**exercise** one, so the rows
it returned were the batch's 600 most recent — and an exercise trained on a
longer rotation than its batch-mates had its whole history pushed past the
cutoff by *other* exercises' recent sets. It then read as "no history" and
seeded a blank starting weight. Batch width, not age, is the variable, which is
exactly why the meso seed (one call, every exercise in the plan) was where it
showed and why re-seeding one exercise alone made it disappear.

**The evidence was unambiguous.** Replaying the 2026-08-10 seed of *August '26 -
Bulk* (23 exercises) against live data: 815 eligible sets sat newer than
Kneeling Hamstring Curl's most recent set, so all 66 of its rows fell outside
the cap (best rank 755), as did all 52 of Barbell Hip Thrust's (best rank 2860).
Those two, and only those two, recorded `strengthAnchor: null` in
`engine_decisions` — no false positives, no false negatives. The three other
`null` seeds in the same window belong to a different user. Hip Thrust is the
"other exercise earlier this week" the owner remembered; it was re-seeded alone
on 08-12 and immediately anchored at 286.7 lb off history nobody had touched.

**Worth recording because the comment predicted it.** The module argued
deliberately *against* a `performed_at` recency floor — ~56% of (user, exercise)
pairs are more than four half-lives stale, and a floor would force cold-start
where real data exists — and then closed with "egress is already bounded by the
`.limit(600)` below". A global LIMIT over a recency-ordered union *is* that
floor, wearing a different hat, with a cutoff that moves with how many other
exercises happen to be in the plan. The reasoning was right and the
implementation quietly contradicted it.

**The fix** makes the bound per-exercise: a new `v_anchor_candidate_sets` view
ranks each user's candidates within an exercise, and the caller filters
`set_rank <= 40`. Postgres applies that as a WindowAgg `Run Condition`, so it
stops early per partition — bounded egress with no global cutoff — and the
existing `logged_sets_user_exercise_idx` matches the partition and order exactly
(EXPLAIN: index-cond pushdown, 0.8 ms). Eligibility moved into the view
(non-warmup, rep-bearing, N3 completed-only) so a rank slot is never spent on a
row the caller would discard; that also dropped a round-trip.

**Two things the code change does not do,** both carried in the runbook: the
migration has to reach hosted before the deploy — unlike an `engine_params`
activation, the code in the same PR *reads* the view — and prescriptions already
written blank stay blank until `recompute_prescriptions` is run for them.

Also re-dated manual claim `C-wt-04` ("a lift you last trained months ago still
has an anchor"), which the defect had silently falsified on the seed route. The
prose was already correct; it just wasn't true yet.

## 2026-08-14 — Session 129: doc 22 Phase 4 — the owner's cold read closes N74

**Owner:** *"I have cold-read all docs, and they are live now. So Phase 4 is
complete. Mark it as such and update all docs appropriately."*

Phase 4 was doc 22's own review gate: a cold read of the Guide end to end for
coherence, duplication and vocabulary drift across chapters written in eleven
separate build phases, plus a re-validation of every
[`22a`](../22a-manual-claims.md) claims-ledger row against the live code —
exactly the check [§2.4](../22-user-manual.md#2-why-this-is-harder-than-it-looks-read-before-phase-0)
named after Batch 32 moved four documented surfaces in a day. The owner ran it
and confirmed everything holds.

**Doc 22 updated to close it out.** The top-of-doc status line now reads
*complete* rather than naming Phase 4 as the one thing left; the Phase 4 table
row gets its own `✅ DONE 2026-08-14` marker and a landed note; the Phase 8
section's *"N74 is not closed"* caveat is corrected to record that Phase 4
closed it.

**`N74` is archived, not just marked done.** With every phase (0–8, incl. 0a–0d
and 3a–3i) built, reviewed and released, there is nothing left for the row to
track — it moves to `archive.md` per the consolidation policy, verbatim source
staying in the backlog appendix. Workstream **M**'s roster line now reads
*"nothing open"*.

- **Index sync:** `N74` swept live → `archive.md`.

## 2026-08-14 — Session 128: doc 22 Phase 8 — the rule that keeps the manual honest (N74)

**Owner:** *"please review docs/22-user-manual.md and execute phase 8."* Three
items: the CLAUDE.md maintenance rule, the README, and this row.

**The rule is hard rule 10, not a `Conventions` bullet.** Rules 1–9 all describe
things a reviewer can see in a diff — an RLS policy missing, a service key in a
client bundle, an improvised layout. A chapter going stale is the one failure
that appears in **no** diff, which is exactly why it needs the strongest
placement in the file rather than the tidiest one.

**It names the lookup, not just the obligation.** *"Update the manual"* is
unactionable against 110 sections, so the rule points at `22a`'s *source of
truth* column as the index **from code back to prose**: grep it for the file,
symbol or parameter path you touched, and every row that comes back is prose to
re-verify. It also names the case with no diff at all — an `engine_params`
activation — which is doc 22 §2.2's own failure mode and the one an author is
least likely to file under "documentation". Link placements keep their two rows
(`22e` + `guide-links.ts`), which was already written down in the doc index.

**The README was two releases stale**, still reading *"Planning complete —
implementation not yet started"* with a doc table that stopped at `07`. It now
leads with the Guide as the app's user-facing documentation (More → Guide),
carries the later authoritative specs, and points at `PROGRESS.md` and this
backlog for live state — which is where *"shipped but not live"* is tracked, so
the README never has to make that claim itself.

**No release entry, no test.** Docs-only, so nothing a user notices (doc 23
§9.3). And the rule is a claim about what a diff **fails** to contain, which CI
cannot assert; enforcement is the ledger's greppability, Phase 4, and review.

**One correction in passing.** The backlog's own standing warning cited N79 as
*"still dark today"* — session 126 applied that migration, so the example is
re-dated rather than dropped: dark for eight days, applied 2026-08-14.

- **Index sync:** `N74` — Phase 8 done (PR #250); the row **stays live for Phase 4 alone**,
  because a review gate closes when the owner reads, not when the build ships.
  Workstream **M**'s roster line updated to match.

## 2026-08-14 — Session 127: the ladder tells the truth again (N87 built)

**Owner:** *"do the whole thing as a PR"* — plus one correction that changed the
design: *"there is no PR created when you activate a version via MCP, so resolve
that in your work."* Exactly right, and the rule I had written (*"activating a
version adds its fixture in the same PR"*) was incoherent on its face. There is
no commit anywhere in the activation loop, so the repo **cannot** be told at
activation time. It can only be told afterwards — which means the mechanism has
to be a *warning that persists* rather than a gate that fires once.

**The ladder is caught up, and building it found the old rung was wrong.**
`V21`–`V25` and `V27` added; `V22` marked as the rolled-back branch it actually
is, since `V23` builds on `V21` rather than on it. The pre-existing **`V26` was
wrong**: spread off `V20` with a note claiming v21–v25 were orthogonal to the
band. They are not — the real v26 row carries the macro-target correction, the
strength model, `rate_source: "plan"` and the envelope block, so that fixture
hashed to something **no stored row has ever had**.

**Which is the point of the mechanism that replaced eyeballing.** `params_hash`
is sha256 over the canonical sorted-key JSON of the stored row, so recomputing
it from a hand-written fixture proves the fixture **is** the row. All **16 rungs
now match their stored hash**, v11 through v27 — verified, not asserted. That
also quietly guards `replay_decisions`, which re-runs an old decision under the
version it was recorded against: a rung that had drifted would have made a
replay silently wrong.

**The live coupling has tests for the first time.** `measuring-band.test.ts`
pins the cutoff at 8 (v26) and `deload.test.ts` runs `target_rir` 6 (v15) — both
right for the versions they name, neither what production does. v27 moved the
cutoff to **5** and the deload target to **8** *in the same version*, precisely
so they would cross. Now asserted through the real functions: 6/7/8 RIR no
longer measure, an ordinary deload set stamps `e1rm: null` / `none`, and
working-week effort still measures.

**`golden-meso-live.test.ts` kept its numbers.** Its header claimed to pin "the
LIVE production params shape" and pinned v18 — true on 2026-07-02, false from
2026-07-11. The claim is corrected; the expectations are **deliberately
untouched**, because re-pinning them to v27 in a cleanup pass is the exact
silent re-pin its own last paragraph forbids. What it covers is orthogonal to
everything v21–v27 changed, so the coverage was always real — only the label was
wrong. A full v27 golden is worth writing when someone can derive it by hand.

**The asymmetry in `db:check` is the whole design.** An unapplied migration
means deployed code reads a column that isn't there — production is broken, so
it **fails**. A stale ladder means the test suite is weaker than it looks —
production is fine, so it **warns**, every run, until someone clears it. Nobody
gets blocked from merging an unrelated PR because a parameter version was
activated an hour ago, which is the friction that gets guards switched off.

`src/lib/engine/live-params.json` is the one declaration both readers use — the
TypeScript ladder and the plain-ESM script, which cannot import TS. The runbook
gained a five-step follow-up in place of the impossible rule.

- **Index sync:** N87 → `done (PR #249)`. Suite 139 files / 2066 tests green.

## 2026-08-14 — Session 126: the migration lands, #222 is rebased, and the e2e diagnosis was wrong (N79, N85, N84, N87, N52)

> Session 125 is the rebased PR #222 branch's own entry; it arrives with that
> merge.

**Owner, going to bed:** *"you're cleared on the first task… rebase and update
222 for merge, and address the e2e suite. I do not want to flip #4."*

**N79 first, because it was the only thing actively broken.** The
concurrent-mesocycles migration is applied — hosted `20260814014300`, pre-check
0 rows, and afterwards `pg_indexes` shows `mesocycles_one_active_per_macrocycle`
with `mesocycles_one_active_per_user` gone. Advisors clean, no new findings. The
feature had been dark for eight days: merged in #226, released inside 1.1.0,
refused by the database the whole time.

**#222 rebased and re-verified.** The clone was **shallow**, which is why the
first attempt produced add/add conflicts on every file in the repo — there was
no common ancestor to diff against. After `--unshallow` the real picture: 51
commits behind, and **all 20 code files merged clean**; the only conflicts were
four doc files, each a both-added-at-the-top. Two ID collisions the branch
carried are fixed rather than replayed — its backlog row said `N74` (the User
Guide holds it) and its log entry said `Session 98` (doc 21 Phase 5, same day) —
and the bookkeeping commit that wrote them was dropped. On the new base:
typecheck, lint, production build green, **138 test files / 2052 tests pass**.
The drift guard's own comparison, run by hand against hosted: **zero drift** —
because N79 had been applied an hour earlier. The guard was written for exactly
that failure and spent eight days unmerged while an instance of it sat in
production.

**Then the e2e suite, where the interesting thing is that N84 was wrong.**
Diagnosed from run 31761203458 and its downloaded Playwright report rather than
from the row. **`bodyspec-integration.spec.ts:106` — the deterministic
`waitForURL` hang the whole row was built around — now passes in 3.6 s.** It
died with the lock file and came back with it; `v_body_comp_history` was never
implicated. The failing set has changed twice in three runs, which is itself a
finding.

What actually fails now:

- **`bodyspec:159`** — after `KEEP CURRENT` the card never clears. The page
  snapshot is what makes this diagnosable: **both buttons render `[disabled]`**,
  so `useTransition`'s `pending` never returns. The action itself is correct
  (`resolveScanProposal` + `revalidatePath`); it is the transition round trip
  that hangs. Left open — not reproducible here.
- **`prescribed-progression:205`** — reps stay at 11 when the weight drops.
  Looked like **N87** for an hour. It is not: the test **passed** on PR #222's
  run against the same v18 database.
- **`bodyweight-quick-entry:60`** — strict mode, two identical profile sublines,
  passed on retry. Both copies carry the right text, so this is an App Router
  transition with both trees mounted. **Fixed** by scoping the assertion to the
  profile card, which is what it was ever about.

**N87 is the real catch of the session, and it came out of chasing that middle
one.** `grep 'set is_active = true where version' supabase/migrations/` returns
**one hit: version 18**. Every version after that is inserted inactive and
activated by a human through the MCP tools, which write to hosted and leave
nothing in the repo. **v22, v24, v25 and v27 — the live one — have no migration
at all.** So a fresh local stack, which is precisely what CI builds on, runs
**v18** while production runs **v27**: no earned-step progression, no
`rate_source:"plan"`, no envelope loop, no strength model, no measuring band.
Every DB-backed test has been validating an engine that stopped being production
behavior on 2026-07-11. Unit and golden tests pass explicit fixtures and are
unaffected. **And #222's guard structurally cannot catch this** — it compares
migrations, and an activation is not one. Same class of drift, one level up, in
the blind spot of the fix for it.

**Then #222's own CI run arrived and reframed all of it.** A *different* set
failed again: `:106` failed, `:159` was flaky, and `prescribed-progression`
passed — and the run took **3.5 minutes against `main`'s 53.5 seconds for the
same nine tests**. Three runs, three failing sets, a 4× runtime spread, every
failure from the same bodyspec/progression cluster. That is **runner-speed
flakiness in a timing-sensitive cluster, not three product defects**, and it
means the next step is one local repro rather than three fixes. The single datum
that survives every run is `:159`'s snapshot — both buttons `[disabled]` — so a
`useTransition` really does fail to settle, at least some of the time. N87 loses
its supporting failure and stands on its own, which it comfortably does.

**N87 re-scoped the next morning, and the first writeup had aimed at the wrong
target.** The owner pushed back on the obvious remedy — *"adding a CI check for
every little thing makes PRs cumbersome"*, and the MCP activation loop exists so
params can be replayed and verified cheaply from a ChatGPT sub. That objection is
correct, and following it led to the actual hole. CI's database running v18 is
**nearly harmless**: the DB-backed tests are 9 e2e smoke tests plus write-pipeline
and RLS, none of which assert engine numbers. The engine is tested by ~2,050
unit/golden tests that take an **explicit params object** — and that ladder, in
`engine/__tests__/helpers.ts`, runs `V11 → … → V20 → V26` with **no V21, V22,
V23, V24, V25 or V27**. So `golden-meso-live.test.ts`, whose header still says
*"the LIVE production params shape: the v18 row"*, pins v18; `measuring-band`
pins `max_measuring_rir: 8` where live is **5**; `deload.target_rir` is 6 across
the ladder and 4 in the defaults where live is **8**. Those last two are exactly
the pair v27 changed, and v27 exists *because they interact*. **Nothing tests
that interaction at the values it runs at.** The remedy is therefore one fixture
per activation, not a gate on hosted state — the activation workflow is right and
stays.

**N52/N54 declined, and the decline is written into the code.** Every
*"re-enable rides N43/v23"* comment now reads as settled rather than pending —
the condition was met on 2026-07-12 and will never be acted on. No Guide chapter
needed touching: Phase 3g had already written ch. 14 positively (the band is the
block's contract, it paces and grades in the background, a connected assistant
is where you read it), so the prose was true and is now simply permanent.

- **Index sync:** N79 → done (archive at next sweep); N52 → `wontfix`; N84
  re-diagnosed against real evidence; **N87 opened**; N85 → `done (PR #222)` on
  that branch.

## 2026-08-14 — Session 125: production schema drift (N85) — and the ordering model it was blamed on

> **Renumbered twice.** The branch wrote *Session 98* (taken by doc 21 Phase 5, same
> day) under item *N74* (taken by the User Guide). This is the work of 2026-08-04
> landing on 2026-08-14, so it is numbered as the session that merged it.
>
> **Rebased and re-verified 2026-08-14.** 51 commits behind; the two doc files were
> the only conflicts and all 20 code files merged clean. On the new base: typecheck,
> lint and a production build are green and **138 test files / 2052 tests pass**. The
> drift guard's comparison was run by hand against the live hosted migration list —
> **zero drift**, which it should be, because **N79's missing migration was applied
> earlier the same day**. That is this PR's own argument, demonstrated: the drift it
> guards against was sitting in production while it waited to merge.

Reported as an out-of-order-workouts bug. It wasn't one. Two users were stuck
behind an unapplied migration, and the app's own safety nets are what made it
look like normal operation.

- **Root cause: `20260802000004_slot_rep_position.sql` was never applied to
  hosted.** PR #221 merged code reading `meso_exercises.rep_position` on
  2026-08-02 22:15 UTC. `getSlotEffortRows` names that column in its `select`
  *and* its `.or()` filter, so every call raised 42703 — taking out
  `advanceWeekAfterWorkout`, `reconcilePrescriptions`, `catchUpProgression` and
  the MCP plan surfaces. Postgres logs carried ~60 of the error in 24h.
- **Out-of-order was exonerated.** Progression is day-slot keyed: W(N+1)·D
  advances from W(N)·D, each completed day generates its own counterpart
  independently, and the week-close branch only asks whether every day is
  closed. Parrish's D3→D1→D2 week would have generated fine on 2026-08-01. The
  DayView navigator and the cycles grid already treat any day of the active
  week as reachable, so this was a *supported* interaction all along.
- **Migration applied to hosted** via MCP (`20260804143526 / slot_rep_position`),
  column + CHECK verified, and the exact failing query shape re-run clean.
  Parrish and Sara self-heal on next app open — `catchUpMesoGeneration` finds
  three closed days with no counterpart and fills them.
- **Why nobody noticed for two days.** All four call sites are deliberate
  degrade-gracefully catches (R20). They reported to console/Sentry — but
  `SENTRY_DSN` is still an unset manual op, and the *user-facing* copy said
  "Next week's targets generate when the engine runs." The engine had run three
  times and thrown each time.
- **The guard that was missing.** Every CI job applies migrations to a fresh
  local stack, so all of them prove only that the repo is self-consistent; none
  can see hosted. `npm run db:check` + a `migration-drift` CI job now compare
  the two. It compares **name stems**, not versions: the hosted `version` is
  assigned at apply time (repo `20260802000004…` landed as `20260804143526`)
  and the `name` column is recorded inconsistently across the project's history
  (`20260702000005_write_integrity` vs `slot_rep_position`). The two
  pre-tracking migrations (`initial_schema`, `design_pivot` — verified live by
  object existence, earliest tracked version is `20260613004448`) are
  baselined, because a check that always reports two known-good failures is one
  people learn to scroll past.
- **Schema drift now names itself.** 42703/42P01/42883 re-scope to
  `schema-drift:<scope>` with a `remediation` hint. A retry never fixes one, so
  it should never have shared a channel with dropped connections.
- **Two genuine product gaps the outage exposed**, both reachable without any
  drift: an active meso with no next workout had *no* recourse in the UI (now a
  stalled-week panel with a retry), and an untrained day had no terminal state
  at all (now `skipWorkout` — "End workout" *completes*, which is wrong for a
  day you never trained, and it made a single dropped session enough to leave a
  week un-closable and the next week ungeneratable).
- **Week boundary closed.** Completing W(N)·D materializes W(N+1)·D
  immediately, and the cycles grid deep-linked it as *loggable*. It is now
  fully viewable but not loggable until its week activates — the engine prices
  a week off the whole of the week before it. Owner confirmed the model: free
  within a week, gated at the boundary.
- **Rule-8 note:** no mockup figure covers either new state (fig 1.1 has no
  failure variant, and there is no skip-day sheet). Both are built from the 08
  §5 vocabulary and recorded in `docs/PROGRESS.md`.

## 2026-08-14 — Session 124: the cleanup pass — 28 rows swept, two abandoned PRs found, one feature dark

**Owner:** *"Do a clean up and organization pass of the docs and notes sections.
Make sure everything up to date, what done is archived, notes are organized."*

**The sweep itself was overdue and the size says so.** No reconciliation had run
since 2026-08-02, across twelve merged PRs (#215 → #247, including the 1.1.0
cut). 48 live rows, **28 of them terminal** — every PR confirmed merged against
the GitHub API before archiving. Included in that: the `answered` question rows
S1–S3/S6–S8/PH39, live since the June triage, which are terminal by the
lifecycle's own definition (the substance is in `A-engine-metrics.md`; the tasks
they spawned are their own `T-A*` rows). **N35** closed on its own stated
criterion — *"stays live only until v20 is activated"* — which was met on
2026-07-11 when v21, "otherwise identical to v20", went active.

**But the sweep was not the finding. Three things the index could not see were.**

**1. Two fully built PRs had been abandoned in plain sight.** PR **#222**
(2026-08-04) and PR **#212** (2026-07-30) are both complete, both reviewed-ready,
and **neither is on `main`** — #222's `db:check`, `skipWorkout` and `isWeekLocked`
are absent from the tree today. Each wrote its backlog row *on its own branch*,
so `main`'s index never learned they existed, and **no sweep over merged PRs can
find a PR that never merged.** They also collided: #222 claimed `N74` (taken by
the User Guide) and #212 claimed `N67` (taken by #215 the same week). Filed here
as **N85** and **N86**, and the gap is closed structurally — `backlog.md` gains
an [open-PR register](./backlog.md#open-pull-requests) and `CLAUDE.md` gains
**rule 4**, which makes reconciling open PRs part of the session-start sweep.

**2. A released feature is dark, and the runbook step was never struck.**
**N79** (concurrent mesocycles) merged in PR #226 and shipped inside 1.1.0, but
`20260806000001_concurrent_mesocycles` **is not in the hosted migration list** —
the applied chain jumps `20260804213026` → `20260806210701`. `pg_indexes`
confirms it: `mesocycles_one_active_per_user` is still there and
`mesocycles_one_active_per_macrocycle` was never created, so the database still
enforces one active meso per *user* and a second standalone block raises 23505
against code that expects success. This is **the same failure class #222 was
written to guard against** — which is the argument for merging #222, made by the
repo rather than by the PR. `CLAUDE.md` **rule 5** now requires checking hosted
migrations and the active `engine_params` row before archiving a `done` row.

**3. N52/N54's remainder was silently dropped a month ago.** Both were told to
*"ride the v23 activation"*. v23 and the v24 `rate_source:"plan"` flip went live
2026-07-12 (PR #183). Neither shipped: `cycles/macro/[macroId]/page.tsx` still
carries both N54 comments and the `REALISTIC TARGET` card is still hidden. Doc 22
found the same hole from the other side and logged it as ledger `D-15` → `D-20`
— *a chapter describing a band the reader cannot see*. The re-enable is a pure
view change; the row is corrected to `ready` and needs one owner yes.

**Also done.** `README.md`'s workstream roster rebuilt against reality (it still
listed N71 as open in **A** and N53 as open in **J**, both long shipped);
workstreams **R** and **S** declared — **S** was already in use by N83/N84
without ever being in the roster. **N83** moved to `ready` (its blocker, Phase
7a's affordance ruling, shipped in #244). Five owner device-checks that were
holding otherwise-terminal rows open (N34, N47, N56, N57, N59) consolidated into
one **O-2** row. Doc-side: `PROGRESS.md`'s duplicate empty Phase-3f heading
removed and the misfiled 2026-08-09 MCP entry moved out of the June section;
`manual-operations.md` reconciled against the live `engine_params` row (**v27**
active since 2026-08-12) and the hosted migration list; root `CLAUDE.md`'s doc
index corrected (it still advertised *"v25 active, v26 inactive"*).

- **Index sync:** 28 rows → `archive.md`; N52/N74/N79/N83 corrected in place;
  N85, N86, O-2 opened. Live index 48 → 23.

## 2026-08-13 — Release 1.1.0: the Guide block goes live (N74 / N80 / N82, PR #247)

> Unnumbered: the release cut ran as its own pass after session 123, and PR #247
> merged at 2026-08-13T21:25Z — after #246 (18:35Z), which is why it sits above
> the entries dated 2026-08-15.

The owner approved the staged notes and the rendered notification, then asked
for the production cut. The release registry now contains a frozen `1.1.0`
feature release dated 2026-08-13: three linked modal highlights (the App Guide,
training with AI, and the workout-screen focus pass) followed by five supporting
notes on the full What's New page. `package.json` and the lock file move to
1.1.0; `unreleased.ts` is empty and points at 1.2.0.

The release pass also fixed a gate-lifecycle trap exposed by the cut. Feature
call sites now retain the literal version they ship behind; the moving
`UNRELEASED_VERSION` constant is reserved for the staged manifest and preview.
That lets the release PR advance staging to 1.2.0 without re-hiding the 1.1.0
Guide, connector tools, glossary affordances, or day-view changes. The runbook
records the rule. N80's stale placeholder was reconciled to its merged framework
PR, #230.

The What's New work in the same release replaces the bottom tray with the
owner-approved centered floating modal, gives the release an explicit title,
uses one restrained orange marker, limits the interruption to the 1–3 headline
items, and links the complete record to More → What's New. Preview presentation
is now a tested seam and remains inert in production.

**Release verification:** lint and typecheck are clean; all 137 unit files pass
(2,032 passed, 1 skipped), including the 153-test focused release/Guide suite.
The prescription-writer source scan was made path-separator-safe and given a
15-second budget for Box-backed Windows I/O. A clean local `next build` reaches
Webpack but the Windows/Box filesystem makes Next call `readlink` on the regular
`src/app/api/client-error/route.ts` file and returns `EISDIR`; the untouched file
has no link/reparse attributes. The Linux CI build remains the production gate.

## 2026-08-15 — Session 123: N81's inline term, and the six words it needed (N74 Phase 7, N81)

> **On the date:** doc-side, like sessions 114–122.

**Owner:** *"Begin doc 22 phase 7's remaining N81's inline term piece."* The one
part of Phase 7 left unbuilt, ruled at 7a and held back for a stated reason: the
component is a morning's work and the **content** is not.

**So the content came first, and it was most of the session.** `22c` §C2's
recommendation column had eight terms open. Six landed — `strength_anchor`,
`exercise_target_rir`, `backed_off`, `effective_load`, `adherence`, `phase` —
each read off code rather than a spec (`22b` §9.2), which is what stopped two of
them from being wrong:

- **`phase` does nothing to a prescription.** `spreadPhases` places them and
  `phaseLabel` prints them; nothing in `engine/index.ts` reads
  `mesocycles.phase`, and its only other consumer is the coaching context. So
  the card says *guidance for how you plan each block*, not "it changes how the
  block runs" — which is what the word invites you to assume.
- **`adherence` has a denominator a reader would guess wrong.** Decided days
  only (`completed`/`skipped`), working weeks only. The card leads with what is
  *left out*, because that is the part that makes the number make sense.

**One recommendation was declined**, and by the table's own logic: `model band` /
`REALISTIC TARGET` is hidden on every screen that would print it (`D-15`, N54),
so a card for it would be the §C1-a defect — a definition with no screen behind
it, exactly as `KEY LIFTS` was.

**Then the primitive, which is small on purpose.** `InlineTerm` is a `<button>`
wearing a dotted underline and nothing else — no size, no colour, no weight, so
the run reads as the sentence it sits in. The card it opens is `InfoDot`'s
popover **extracted unchanged** into `useGlossaryCard`: two triggers, one
drawing. A test fails if a second drawing appears, if a call site draws its own
underline, or if the gate leaves the primitive.

**The gate is the interesting difference.** `GuideLink` returns `null` when the
release is closed, which is right for a trailing element. An inline mark cannot
do that — dropping the run would delete a word out of the middle of a sentence —
so closed it returns the words, unmarked. `InfoDot` gained a `staged` prop for
the three new dots, which *can* return nothing.

**Placement, split by grammar rather than by taste.** A term inside a sentence
gets the mark; a term that IS a label keeps the dot. Five inline (the `/workout`
and `/cycles` first-run copy, `/cycles/new` twice, the profile's `SEX` note) and
three dots (`MEASURED ANCHOR`, `TARGET RIR`, `ADHERENCE`). Plus the manual's own
`{ term }` runs, which now render through the primitive — which is what §8.4c
rule 2 asked for and the block model could not previously do without dropping a
whole card into the paragraph.

**It closes `22c` §C1-a's oldest finding as far as it can go.** `macrocycle` and
`mesocycle` are the app's core vocabulary and had **no trigger anywhere**,
because an `InfoDot` only fits beside a label and they were never labels. They
answer now, on the screens a first-time reader meets them on. `microcycle`
still has none and cannot: no screen says the word — the app says *week*.

**Two cards deliberately have no in-app trigger.** `BACKED OFF` and `EFF LOAD`
render **only inside repeating history rows**, where a trigger per row is the
per-card cost N82 removed a week ago, and where the row is already a tap target
for the weight/estimate flip. Written down in `22e` §6.3 rather than quietly
skipped — they are defined, reachable from the Guide, and waiting for a
single-instance surface.

- **Index sync:** N81 → `done (PR #246)`; N74's Phase 7 row closed out.

## 2026-08-15 — Session 122: the guard travels with the link (N74 Phase 7c)

> **On the date:** doc-side, like sessions 114–121.

**Owner:** *"docs/22e-link-placement-audit.md has been reviewed… Your
recommendations are accepted. Please proceed."* The one decision session 121
put back to them was `22e` §5 — the E4 group — and the recommendation there was
option (1), extend the guard, as its own PR at Phase 7c. That is this session.

**The framing that mattered.** The exclusion wave 1 wrote is *not on an
unguarded form*, and the temptation on being told "accepted" is to treat the
rule as waived. It isn't: it holds exactly as written, and what changed is the
surfaces. Ten of them now satisfy it, which is why the audit's §2 table is
untouched and only §3.3/§4 moved.

**Where the pass departed from the wording of (1), and why it is a narrowing.**
§5 said "extend `useNavigationGuard` to sheets". For a **page** that is right,
and it went there — `/cycles/new`, `/cycles/macro/[id]/edit` and
`/exercises/new` have been discarding unsaved input on a tab-bar tap since they
were written, so the hook closes a gap older than the audit. For a **sheet** it
is the wrong tool: the scrim already makes the Guide link the only navigation on
offer, so intercepting that one anchor is exactly sufficient, while arming the
hook plants a **history sentinel** — and the sheets in question are the Feedback
and Effort target sheets *on the day view*, the hot path, mid-workout, the
surface N82 had just been asked to calm. Changing what back does there is a
larger behavior change than the owner was asked to approve. `GuardedGuideLink`
for sheets, `useNavigationGuard` for pages, one shared confirm for both; the
departure is written down in `22e` §5.1 rather than left as a silent
implementation choice.

**Reading the code corrected the audit twice.** `/more/profile` writes every
change as it is made — experience, sex, equipment, body fat each fire on tap —
so it holds no unsaved state and never was a form. The planner's exercise sheet
stages into the board's working copy, guarded since R16. Both had been filed
under E4 on the assumption that a screen carrying controls is a form. Neither
needed anything built, which is why the wave is **ten placements against §5's
seven-row estimate**, and both rows are corrected in place rather than in a
footnote.

**One discard-confirm.** `LeaveConfirm` is the planner board's sheet moved out
unchanged; only the sentence naming what is unsaved varies. A test fails if
`Discard changes?` is written anywhere else, and a second fails if a surface
arms the guard without rendering the confirm — the same
assert-it-rather-than-remember-it discipline as wave 1's label contract.

**One more thing the link table can now catch:** a `GUIDE_LINKS` row that no
call site renders fails CI. The audit is meant to *be* the placement list; before
this, a forgotten row would have passed every assertion above it forever.

**Release notes.** The existing `guide-links-in-the-app` entry widened to cover
the input surfaces, and a second entry was added — the discard-confirm is a
user-visible behavior change in its own right (doc 23 §4.2), since these forms
used to drop work silently.

**Left standing, deliberately:** N81's inline term. Nothing this session changed
its sequencing — `22c` §C2's ~22 undefined terms need glossary entries under
§8.1 before the affordance can point at one, and that is a copy pass, not a
placement pass. It is now the only unbuilt part of Phase 7.

- **Index sync:** N74's row carries 7c (PR #245); N81's status reworded to
  name it as the one Phase 7 wave still unbuilt and what it is gated on.

**CI, and it is worth writing down.** Fixing the lock file turned out to lift a
rock. All three jobs had been dying at `npm ci` (`@emnapi/*` drift from a
floating transitive), which means **the e2e suite had not run at all** for
however long that has been true — `main` has been reporting red without anyone
seeing what was underneath it. Resynced, and two things came out: a strict-mode
violation in `bodyweight-quick-entry` that has stood since #214 (`/BODYWEIGHT/`
matches the ledger row *and* the equipment chip), fixed here; and an
intermittent navigation timeout on the BodySpec scan-detail route, which is not
this PR's — those routes are untouched and the links this PR adds render
nothing before 1.1.0. Tracked as **N84** rather than absorbed, because proving
it needs the local stack this session cannot run (no Docker daemon).

## 2026-08-15 — Session 121: the Guide reaches into the app (N74 Phase 7a+7b, N81 ruled)

> **On the date:** doc-side, like sessions 114–118. Session 119's note on the
> two clocks still applies and is left as found.

**Task: doc 22 Phase 7 — deliverable C**, the link-placement pass the owner
asked for on 2026-08-05 and the plan deliberately sequenced last so placements
could be chosen against real sections.

**What the pass actually had to decide.** Phase 7a owed a grammar ruling, and
**N81** — the owner's inline-underlined-term proposal from review round 4 — had
been scheduled into the same phase on the argument that three affordances
decided separately become three ways to say *"there is more about this"* that
look like each other. That argument held. The ruling is **one grammar, three
members, split by what the reader is asking**: *"what does this word mean"* is
**term-level** and resolves **in place**, because the reader is mid-task
(`InfoDot` beside a label, N81's term inside a sentence — one glossary, two
grains); *"why is this number what it is"* is **mechanism-level** and
**navigates**, because the answer does not fit in a card and whoever wants it
has stopped to ask. Design pass: 09-changelog **2026-08-15**.

**The audit is the deliverable, not the code.**
[`docs/22e-link-placement-audit.md`](../22e-link-placement-audit.md): five earn
tests, every user-reachable surface swept, **nine placements built and fourteen
declined with the test each failed**. The two exclusions that did the most work
are the ones worth carrying forward — **nothing on the day view's card or set
grid**, because N82 had just removed an icon per card at the owner's direction
and this must not spend that back; and **nothing on an unguarded form**, because
a link navigates and navigating out of a sheet holding unsaved sliders discards
them.

**That second rule cost the audit its three best placements, and the finding
goes back to the owner rather than being quietly absorbed.** The Feedback,
Effort target and Load step sheets rate highest on *the reader is asking right
now* and fail **only** the unguarded-form test. The fix already exists —
`useNavigationGuard` does exactly this on the planner board — but it is a
**behavior change**, which doc 22 §1.2 puts outside the manual's scope.
Recommended as its own PR at 7c (`22e` §5, with the cheap alternative and why it
is wrong).

**Two contracts, tested rather than remembered.** A link's **label is the
destination section's own title**, so a *retitled* section now fails CI the way a
renamed one already did — the §8.1 single-source discipline applied to links.
And the **release gate lives inside the primitive**, once, because guide routes
404 before 1.1.0 and nine call sites can each forget a gate.

**No new drawing.** `GuideLink` is the app's existing `READ ›` / `SET UP ›` /
`CSV ›` idiom — literally the line Phase 6e improvised on `/more/connector`,
which now **adopts** the component instead of remaining a second copy. No figure
redrawn, no new figure number claimed.

**N81 is ruled and specified but deliberately unbuilt**, and the reason is worth
recording: the component is small and the **content** is not. `22c` §C2 counts
~22 rendered terms with no definition anywhere; each needs a glossary entry
written under §8.1 before anything can link to one. Putting that copy pass
inside a placement PR would have hidden it. Its row moves to **Phase 7c** with
the design settled, so that wave is execution.

**Rows touched:** `N74` (Phase 7a+7b done), `N81` (design ruled → Phase 7c).

## 2026-08-10 — Session 119: the v26 drift pass (N70 activation → N74 prose)

> **On the date:** this entry sits above entries dated 2026-08-11 → 15 because it
> is the newest session, and its date is the one the **database** gives —
> `mcp_write_audit` timestamps the v26 activation at 2026-08-10 18:05 UTC and the
> session ran after it. The doc-side dates from sessions 114–118 run ahead of that
> clock. Left as found rather than renumbered: the ordering here is by session,
> and the DB timestamps are the checkable ones.

**Trigger: an owner question, not a task.** *"Aren't backed-off sets excluded
from the strength anchor?"* — with the expectation that work at 8 RIR or above
leaves the anchor, work at 3 RIR or below earns progression, and 7–4 RIR anchors
without earning. That is `D-20` almost verbatim, asked again three days later —
except that in between **the owner activated `engine_params` v26**, so the answer
had changed underneath the manual.

**What is actually true** (verified against the live row and the code, not the
specs): the anchor's only per-sample exclusion is the measuring band, now live at
`e1rm.max_measuring_rir: 8`, so a set leaves the anchor **above 8** — not at 8,
and by absolute assumed RIR rather than by being backed off. Backed-off sets
inside the band still anchor, on purpose (doc 21 §5: excluding them freezes the
anchor and makes the return prescription jump to full load). They do leave the
strength *trend*, `best_e1rm` and the PR views — doc 21 §6.2, a different rule,
live since 2026-08-04. Progression is refused for **any** backed-off slot by name
(`progression.ts:251`, reason `exercise_rir`) before confidence is even consulted;
the 4-and-above story is the confidence floor, and it only bites when that session
is the anchor's winning sample. So the owner's outcome intuition was right in all
three parts and the mechanism was wrong in all three.

**The drift pass.** Activating a parameter ages prose with no code diff to review,
which is a failure mode this area had not seen before: four chapter ground-truth
headers (chs. 6/7/8/10) and five *deliberately absent* ledger rows were written
from "v26 is inactive", and `GLOSSARY.e1rm_confidence` was carrying a sentence
`D-14` had removed for describing exactly this rule. Ch. 8 gained the band as the
boundary case beyond §6.2 (its centre is unchanged — §6.2 is still the answer to
"does a protected block read as a decline"); ch. 10 gained the fourth, unrated
state below the three ratings; the `D-14` sentence came back verbatim off the code
comment that had preserved it, which is the whole case for recording removed copy
where the next author will stand. Chs. 6 and 7 still omit the band, now on **seam**
grounds rather than liveness: their ramp spans 0–5 RIR and a deload 6, so nothing
they document can reach above 8.

**One finding worth keeping.** The activation classified `release_impact: "fix"`,
which doc 23 §9.5 only permits when no user-visible number moves — and it held,
because **no logged set in the database sits above the band** (0 of 11 834). The
`checkAnnouncement` guard was therefore never exercised: the first activation that
moves a number is where it bites, and it will refuse without a live announcing
release (the only release is `1.0.0`). Recorded in `22b` §4.0/§6.3 and in the
runbook, whose steps ④/⑤ are now closed out with the activation record.

Ledger: [`22a`](../22a-manual-claims.md) **`D-21`**. `22b` **O-B** closed.

## 2026-08-15 — Session 118: owner review round 6, reconciled onto a moved main (N74)

**Housekeeping first: PR #236 (Phases 3d-r/3d/3f) had already merged**, and `main` had moved a long way past it — Phases 3g, 3h, 3i, 5 and 6 all landed (the whole rest of both manuals), plus an unrelated day-view pass that happened to claim `N82`. Reset the branch onto `main`, reapplied this round's diff (the seven chapter/test files applied cleanly — nothing else had touched them since the merge — and the five shared registries needed manual reconciliation), and renumbered two collisions: `D-15` → `D-20`, `N82` → `N83`.

Notes on the effort cluster and ch. 10, generalized as **doc 22 §8.4e**. Two are
about what the manual believes, which no earlier round has been.

**The one that matters most: the chapters had drifted cautious.** Every ramp
description made the easier option sound safer and the harder one sound
expensive, and four sections in a row can add up to an argument nobody wrote. The
owner's correction is the right reading of my own research pass — its §2.1 has
hypertrophy improving toward failure and strength flat across RIR, which is not a
finding that supports a careful tone. *Reps in reserve are a fatigue-management
tool, not a growth tool*; if you recover, training closer to failure more often is
the productive direction; most people have room there. Ch. 7 §3 now says that
first. Worth remembering as a failure mode: honest hedging repeated across
sections stops being hedging.

**`D-20` is the finding of the round** (renumbered from a first-draft `D-15` — `D-15`–`D-19` were independently claimed by Phases 3g/3h/6a/6c while this review sat unmerged). The owner asked whether backed-off sets
leave the strength anchor, describing an 8-RIR cutoff and a 7–5 band. That is doc
21 §6.1 — **v26, inactive**. Live, `anchors.ts` has exactly one per-sample filter
and it passes everything. So the person who specified the feature was holding the
unshipped rule as their model of the shipped one. Doc 21 §5 argues for the live
behavior on purpose (excluding easy sets would freeze the anchor and make the
return prescription jump to full load), and the owner's *outcome* intuition was
right anyway — the mechanism is just the confidence ladder rather than exclusion.
This is the clearest evidence so far that "the specs and the code disagree" is not
an abstract risk in this repo.

**Parameter names are out of the prose.** Nine of them, across six chapters,
including two in chapters already signed off. The interesting part was the
contract: §8.2 requires a stated default to be greppable to its parameter, and
moving the names into `detail` would have broken that if the check stayed at
block scope. Moved to section scope, plus a new test that fails on a parameter
name outside a `detail`. Where the reader now gets a derived relationship instead
of a name, the ledger row carries the derivation so the chain still holds.

**Ch. 9 was over-built.** *What a deload is* and *when you need one* are one
question; *valve*, *shedding* and *performance debt* were three metaphors doing
the work of one plain sentence. It also turned out I had documented the deload as
unavoidable once started, which is wrong — `End mesocycle` in the day view drops
it, and attendance never counted those days anyway. That is the §8.4c rule 3
failure (find every surface that does X) recurring, and it is worth noting it
recurred in a chapter written *after* that rule existed.

**N83** — bar speed as in-app guidance (renumbered from a first-draft `N82`, which the day-view focus pass claimed independently) for judging proximity to failure. The
evidence is already in the repo and unusually direct: the study that priced
fatigue measured it *as* velocity loss, so the same quantity is observable
mid-set. Glossary card or coaching-line trigger; hard rule 8 either way, and it
joins N81 in Phase 7a's affordance grammar. Ch. 7 §4 carries it as prose now.


## 2026-08-14 — Session 117: the day-view focus pass (N82)

Owner asked for the Workout day view to be assessed and decluttered without
losing functionality or speed of access, staged with 1.1.0. Shipped as **PR
#240**, then **revised through owner review round 1** the same day.

**The assessment was done against the rendered screen, not the spec.** A
throwaway harness compiled the real Tailwind theme over a transcription of the
shipped markup so the page could actually be looked at — which surfaced what a
code read had not: the clutter compounds **per exercise**. A four-button icon
row is four bordered boxes *per card*, so a six-exercise day draws 24 of them
down the right edge. The owner had already named the symptom: "too many tool
icons".

**Shipped (four changes, all presentational or menu-structural):**

1. The **exercise name becomes the prescription strip's disclosure** — name +
   chevron, which is the header's own week/day-navigator idiom reused rather
   than a new control invented. This is the change that mattered: it takes an
   icon off the row **without losing a capability**. Owner: *"That's good, as it
   eliminates one icon in the strip without losing the functionality — exactly
   what I was looking for."*
2. Icon row **4 → 3**. Note and history keep their icons.
3. The two note strips **merge into one** under `border-l border-ink/25`. The
   pinned strip had been wearing `border-l-2 border-ink` — *identical to the
   prescription strip* — so a card with both showed two indistinguishable bars
   written by two different authors.
4. The `…` menu's rows are **grouped** by a stronger rule. Rows and order
   untouched. Owner: *"I like your organization of the menu items also."*

**Reversed at owner review — the lesson is worth keeping:**

- **Cutting the row to `…` alone.** The draft moved note and history into the
  menu on a frequency argument. Frequency was the wrong axis. **Interruption**
  is the one that matters here: both are consulted *between sets*, with a rest
  clock running and a bar to get back under, and a two-tap detour there costs
  more than the ink it saves. The pass found the one genuinely redundant icon
  (change 1) and then over-generalised from it. Owner: *"The only thing you
  really did was take away the icons, which were functional."*
- **De-accenting `TARGET n RIR`.** The draft read hard rule 7 literally — orange
  marks position and selection, and the week's effort ask is a fact — and moved
  it to ink. Overruled: the ask is the one number that governs every set on the
  screen and is meant to be found instantly on a mid-session glance. **The
  accent there is a standing, deliberate exception to rule 7**, now written into
  `22c` §B1.2 so a future session does not "fix" it again.
- A drafted `History ›` menu row existed only to compensate for removing the
  history icon; it was withdrawn with the icon's restoration, and 2026-06-26
  (one shortcut, not two) holds on its original reasoning.

**Deliberately not changed**, and recorded as such: the set grid (the hot path,
already right); per-exercise next-row emphasis (one active row per page would
read as more focused but would break supersetting); the grid header repeating
per card; equipment type on the name row; the `Notes` row in the `…` menu (the
owner was explicitly indifferent, and the row carries state the icon cannot —
`Notes ›` vs `Add note`).

**Staging.** Behind `releaseActive("1.1.0")` via `focusPass()` — the menu
grouping too (`MenuGroup ruled={…}`), so nothing about the menu changes early.
Release note `day-view-focus-pass` staged in `unreleased.ts`: a changed layout
with no new capability is still a feature-release change (doc 23 §4.2).

**Kept in sync in the same PR** (doc 22 §2's whole point): `22c` B1.2, and the
manual's `ug/training-a-session#the-day-screen` / `#notes`, which described the
button row. Both ship in 1.1.0 and would otherwise have described a screen that
no longer exists.

## 2026-08-13 — Session 116: the AI Manual (N74, doc 22 Phase 6)

Twelve chapters, 48 sections, a reader under `/more/connector/guide`, and the
connector page reworked into its front door. Both manuals now exist; Phase 7
(link placement) is what remains of doc 22.

**The design pass decided there was nothing to design.** D4 said the two manuals
were one system, and Phase 1 had built everything below the routes
manual-agnostic — `MANUAL_ROOT`, `MANUAL_LABEL`, the section header, the chapter
nav, the block model, the budget. Writing that down (09-changelog 2026-08-13)
before building is what turned an afternoon of "make an AI-manual version of the
guide screens" into lifting two components and writing four four-line route
files. **No new figure number, no eleventh block kind.** The one real amendment
came from having two manuals at all: chapter numbers restart per manual, so a
search result reading `CH 4 · What it can do` had quietly started naming two
different chapters.

**§7.1 was the interesting constraint, and it paid for itself.** Doc 22 makes
"every example was actually run" an acceptance criterion and `22d` §8 rule 6
bans invented transcripts outright, so chapters 5–8 were written from live
connector calls. The write half needed the owner's approval, taken explicitly,
and was run as a create → capture → delete round-trip with `get_macrocycles`
re-read afterwards to confirm the account was as found.

Everything the runs returned was better than what would have been written:

- **Ch. 7's whole case is real.** `analyze_exercise_progress` on one lift came
  back `−22.7%`, `declining`, `stalled` — and carried matched-RIR deltas of
  **+10.1 / +10.1 / +7.1 / +10.5 %** against the previous block in the same
  payload. Three of the four comparability guards applied to that single lift at
  once. A constructed example would have used one guard and been less true.
- **Ch. 6's volume check failed on the first plan written for it** — a plausible
  four-day split, below MEV on seven groups — and the created draft then showed
  fractional counting doing its work (`shoulders 1.5` off secondaries alone).
- **Ch. 5 §1 is a refusal**, because `create_macrocycle` cannot succeed while an
  arc is live. *"A macrocycle is one long-term direction at a time"* teaches the
  rule better than a successful draft would have, and it is the honest thing to
  document.

**Two defects, both in the Phase-0 audit rather than in the app**, and both
found because `22b` §9.2 forbids verifying a claim against a document:

- **`D-18`** — `22d` §5 said the write audit records the requesting client.
  `client_id` is resolved per call, but `mcp_write_audit` is
  `(user_id, tool, args_hash, summary, created_at)` and `recordMcpWrite()` has
  no parameter for one. Ch. 3 claims the action, the summary and the time; a
  chapter written from the audit would have promised a reader something the
  table cannot give them.
- **`D-19`** — `22d` §7 K1 called the connector's e1RM caveat stale. It is
  self-contradicting: one response carries *"Epley-based estimates"* in
  `data_quality` and *"RIR-folded Epley·Brzycki"* in its own
  `metric_definitions`. That is a better argument for the one-line fix than
  staleness was, and it is filed for a separate PR — Phase 6 is documentation
  only.

**Two things nobody planned.** `GUIDE_SECTION_IDS` had listed every User Guide
section since Phase 3 and nothing said so, so it gained a completeness test —
a new section is now a link target the moment it exists. And the connector
page's two links into the manual live in their own module as literal strings:
literals because the page is outside D3's import allowlist, their own module
because a Next route file may only export what Next reserves, which is a rule I
found by exporting a constant from `page.tsx` and watching the build refuse it.

**Housekeeping.** Registry suite parameterized over both manuals, guard 3 widened
to both reading routes, `MAY_SAY_MCP` at its second and final entry,
`unreleased.ts` gained `ai-manual`, ch. 18's Phase-3i forward debt paid, and
`22d` §11.4 records the Phase-6 re-verification (58 / 17 / 41 / 4, unchanged).

## 2026-08-12 — Session 115: the connector can read the manual (N74)

Doc 22 **Phase 5** — `workout://user-guide-index`, `search_manual`,
`get_manual_section`. Built while the owner's Phase-4 read is in progress, which
the sequencing allows: retrieval reads whatever the registry holds, so a wording
change coming out of the review needs no change here.

**The thing worth recording is that §10.1's argument was falsifiable and
survived.** The design said no embeddings were needed because authorship had
already done the chunking. That is the kind of claim a plan can assert and never
check, so the retrieval tests were written as the check: queries in a reader's
own words, resolving to the section a person would have picked — *"why did my
weight go up"*, *"what does the app do with my answers"*. They passed on the
`keywords` Phase 3 had already authored, with no ranking tuned and no keyword
added to make a test pass. Nine content phases of authoring discipline are what
paid for a retrieval layer that took an afternoon.

**A second renderer, not a second copy.** `get_manual_section` returns markdown
generated from the same block model the screen renders, so a `term` block reads
back as the glossary's own words, a collapsed `detail` is never withheld from a
model that is usually asking for exactly that rule, and a section flagged
`estimate` carries its §8.2 caveat into the payload. The last one is asserted
over every flagged section rather than reviewed, because dropping a caveat on
the way to an LLM is precisely the overclaiming doc 10 §9 exists to stop.

**A gate asserted only in its off state is a gate nobody has tried.** Everything
here registers behind `releaseActive("1.1.0")`, which today is false, so every
gate assertion would have passed against a surface that never worked. One test
drives it open with `NEXT_PUBLIC_RELEASE_OVERRIDE` and asserts the tools and the
resource actually appear. Same reasoning as the D3 import-guard widening: the
allowlist entry for `src/lib/mcp/` is justified by `server-only`, so the
justification is a second assertion rather than a comment.

**`22d` was corrected while being amended** — "5 resources after Phase 5"
conflated doc 22 §10.2's one resource with its two tools. It is 4. Its §8 rule 2
is lifted and a new §11 is ch. 4's ground truth.

## 2026-08-11 — Session 114 (cont.): Phase 3 finished (N74)

Doc 22 **Phase 3i** — chapters 18 (Connecting an AI), 20 (Glossary) and 21
(Troubleshooting & FAQ). That is the User Guide: **21 chapters, 106 sections**,
median 200 words against the 350 budget.

**The budget is the thing worth recording.** Ch. 6's mechanism section has been
the longest in the manual since Phase 1, at 323 words, and it still is after
nine content phases and eight rounds of authoring rules. The calibration note in
`budget.ts` predicted exactly that — a ceiling a careful author brushes rather
than one they never see — and it turns out to have been right for a corpus
seventeen times the size it was calibrated on.

**Ch. 20 is where §8.1 finally becomes enforceable.** Until now the glossary
contract's end state — every key resolving to a card — was held by
`PENDING_GLOSSARY_TERMS`, a list that could only shrink. That is a real
mechanism while chapters land one at a time and a dead one afterwards: nothing
fails if someone adds a term and forgets the list. The chapter replaces it with
an assertion that every key is filed into exactly one of its five groups. Adding
a term to `glossary.ts` now fails CI until it has a home.

The grouping is authored and the definitions are not, which is the right split.
"Generated from `glossary.ts`" in doc 22 §5 could have meant iterating
`Object.keys()`, and that would have produced a chapter in insertion order with
no reading logic at all. What matters is that no definition is retyped — and a
test can guarantee that without also surrendering the order.

Worth noting what did **not** happen: doc 22 §5 allowed for manual-only terms,
and none were needed. Every advanced term a chapter met without a definition got
a `glossary.ts` entry instead — `day_slot` in 3a, `load_step` in 3b — which is
§8.1 pushing the other way, and better, because those cards are now available to
`InfoDot` call sites too.

**Ch. 18 spends §8.5's one allowance.** The plain-language rule bans `MCP`
outright except where a reader has to find that word in their own client, and
`MAY_SAY_MCP` was written empty in Phase 2 against exactly this moment. The
app's field says `ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR`; a reader told
only about "a connector" cannot complete step one. So the word appears in one
section and nowhere else in 106.

**A mined question turned out to rest on a false premise.** `22c` Part D's F18
is *"why is the target only the low end of the range?"* — mined from a real
`docs/notes/` question, and answerable only if a range is on screen. `D-15` from
Phase 3g says it is not: N54 hid every card that would print it. So the question
became *where is my macrocycle target*, which is the question a reader would ask
today. This is the second time the mined material has needed re-deriving rather
than transcribing, which is what `22b` §5.6 warned about — it just warned about
stale *answers*, and this was a stale premise.

**One test moved rather than broke,** which is the good kind. Phase 2 asserted
that searching *"estimated one-rep max"* finds ch. 6's honesty section, because
that section renders the e1RM card without ever writing the phrase — the alias
layer doing its job. With ch. 20 shipped, the glossary section ranks first
instead. That is the correct answer to a bare term search, produced by the same
mechanism, so the assertion now covers both.

42 new `22a` rows; `GUIDE_SECTION_IDS` +14 and now covering all 106 sections.
**Phase 4 next** — a cold read end to end, and a re-validation of every claims
row and of `22b` / `22c` / `22d` against the code, which is the check Batch 32
is the standing argument for.

## 2026-08-11 — Session 114 (cont.): the three service chapters (N74)

Doc 22 **Phase 3h** — chapters 16 (Body data), 17 (Prescription details) and 19
(Your data). Fourteen sections, none over 214 words: these are chapters people
arrive at with a specific question, and the right answer to a specific question
is short.

**`D-17`, and the rule that found it.** §8.4c rule 3 says *before writing "here
is where you do X", find every surface that does X* — so before writing ch. 16's
bodyweight section I grepped for the writers rather than for the screen. There
are three, and they do not agree: the profile editor and the day view's chip
each write `profiles.bodyweight` **and** append a measurement point; the More
tab's `Log bodyweight` appends the point only.

That is doc 17 §5's boundary working exactly as designed — the series is
measurement substrate and the profile figure is the engine input, never derived
from it. The problem is entirely in what a reader can see: the row says
`Log bodyweight`, it displays your latest measurement, and nothing on it hints
that the number your push-ups are priced off is a different one. So the chapter
leads with a three-row table (where you enter it · records a measurement ·
updates the profile figure) and then says the operative sentence plainly: log a
weight to keep the record, edit the profile to change what the app works from —
and the profile edit records the measurement too.

**Ch. 17 was the one I expected O-A to block, and it turned out not to.** The
open question is whether production serves the model-written coaching line or
only generates it, and that is a Vercel environment variable no Claude session
can read. What resolved it was noticing that doc 19 §3's claim is *architectural*
rather than conditional: the deterministic ask and why always render and are a
complete explanation, and a coaching line is only ever appended beneath them.
That sentence is true in both modes. So §4 documents the division of labour —
the engine authors every number, prose never changes one — and mentions the
`COACH` line as something you may find rather than something you will. Answering
O-A later adds a paragraph about when one appears; it does not invalidate a line.

**Ch. 19's absent-table is the first vocabulary exclusion.** Row-level security,
policies, service-role scoping: all real, all load-bearing, and all named in the
build's words. §8.5 and §8.4b rule 4 between them make the fix obvious once
stated — the reader-facing claim is that reads are scoped by the database rather
than by the screen asking, which is the part that matters to them (a bug in a
screen cannot reach past it) and needs none of the vocabulary.

**Shortest section in the manual so far: `#deleting-your-account`, 118 words.**
The delete screen's own copy is careful and complete, and §8.4b rule 3 forbids
describing a description — so the chapter says where it is, what goes, that the
export comes first, and that you type the word. Anything more would have been
padding a page that exists to be read once.

53 new `22a` rows; `GUIDE_SECTION_IDS` +14.

## 2026-08-11 — Session 114: the stats chapters, and two audits that were wrong (N74)

Doc 22 **Phase 3g** — chapters 13 (Reading your stats) and 14 (Macrocycle goals).

**The interesting part of this phase was not the prose.** Both chapters were
written against screens the Phase-0 audit had already inventoried, and in both
cases the audit's description was wrong about something load-bearing — which is
the exact failure mode doc 22 §2 predicted for *spec* prose, occurring one level
down in the working documents written to prevent it.

**`D-15`. The macrocycle target band is computed, stored, and never shown.**
Doc 22 §5's brief for ch. 14 is "the personalized target band and recommended
timeframe; why it is a conservative band". `22c` §B2.2 says the create card shows
`EST. STRENGTH` and "a model band". Neither is true: **N54** (owner, 2026-07-11)
hid the `YOUR TARGET` range, the rate, the rationale line and the model band on
the create form, the edit form and the macro Overview alike, pending N43's v23
band. What survives is `PLAN` (block count + phase strip) and, where a prior block
supplies it, `LAST BLOCK MEASURED` — which stays precisely because it is measured
rather than modelled.

The chapter that would have been written from the brief is a chapter telling
readers to look at a number that is not on their screen. What is actually true is
better material: the band is still computed, still stored as the block's
contract, and still does two jobs the reader feels — it paces how fast the app
will lead the weights up, and it is what the closeout grades against. So §3
documents it as background machinery and names the two surfaces that do return
it: a connected assistant, and a completed macro's `RETROSPECTIVE` band.

Second half of the same finding: `macro_target.present: "conservative_end"` has
no code consumer at all. The only thing that reads it is `COACHING_GUIDE`'s prose
instruction. "You see the conservative end" is therefore a rule about what an AI
tells you — which is what ch. 14's honesty callout now says.

**`D-16` closes the thread `D-12` opened.** `D-12` (Phase 3e) found `22c`
describing a `KEY LIFTS` grid N10 had removed. This phase found the parameter that
grid was the only reader of: `key_lifts.n` / `selection`, still on the live v25
row, with no consumer anywhere in the repo — the schema block plus two comments
recording the removal. `22b` §4.2 had them filed under ch. 13 and `22c` §C2
recommended adding `KEY LIFTS` to the glossary; the §C2 row is now closed rather
than re-sited, because a card for a term no screen shows is the §C1-a defect that
table exists to shrink.

**Ch. 13 is organized around comparability rather than around screens.** Reading
the `docs/notes/` questions back, almost none of them are "where do I find X" and
almost all of them are "why is this number lower than that number". So the map
section is short and the last two sections carry the weight: the three exclusions
(deloads, backed-off sessions, mis-log outliers) with the disclosure line that
explains a lift missing from the list, and then the two things that genuinely
surprise people — sets logged in a workout you have **open** count immediately,
and the stats show each estimate **undecayed** while the prescription path fades
older sessions. That second one is `22b` §5.6's PH39 note, the single
workstream-A passage flagged as still true and still worth documenting.

**The back-off policy's asymmetry is stated as reassurance, not as a rule.** A
backed-off session leaves the strength trend, `best_e1rm` and the PR views, and
stays in volume, weight PRs and session-volume PRs. The reason is worth a sentence
because it generalizes: those are observations of what you lifted, and the trend
is an estimate of what you could — the app holds the second kind to a stricter
bar.

**Housekeeping.** Live row re-read a fourth time (still v25, `91887f0f…`,
hash-verified, `max_measuring_rir` still absent) and this read produced two
*absences* rather than values, which is a first: `strength` is not on the row at
all, so ch. 13's trend runs on the engine's own defaults, and that is what its
layer 3 says. Rendering `est_strength` empties `PENDING_GLOSSARY_TERMS` outright
— every one of the fifteen glossary keys now resolves to a `term` block somewhere
in the guide, five phases ahead of ch. 20 generating them. 46 new `22a` rows;
`GUIDE_SECTION_IDS` +11.

## 2026-08-11 — Session 113 (cont.): the headline chapter (N74)

Doc 22 **Phase 3f** — chapter 10, and its owner review gate is now open.

**This is the chapter every other one has been deferring to.** Ch. 4, 5, 6, 7, 8,
9 and 12 all stop at some form of *"the weight comes from your recent sets"* and
point here, which meant the debt was structural rather than stylistic: writing it
late was right (it needed the vocabulary chapters first), and writing it in four
ordered steps is what makes the deferrals resolve cleanly. A set becomes an
estimate · the estimates fold into one anchor · the anchor prices a weight · a
clean week earns one step on top.

**The correction Phase 0a made to doc 22 itself finally lands as prose.** Doc 22
§5's chapter-10 row used to say the Epley/Brzycki average cancels the two
formulas' biases; the truth is a **cutoff** — Brzycki tracks Epley to about ten
effective reps and inflates above it. Ch. 6 already carried the rule in layer 3;
what ch. 10 owed was the reason, in words a reader can hold: the two agree over
short heavy sets, one runs away upward on long ones, so the average is right
inside that band and wrong above it.

**Earned versus offered is the whole of why progression is explicable.** Doc 16
draws the line and the chapter follows it: §5 is *did last session earn a step*
(eight predicates), §6 is *is now when it gets spent* (the pacer and three
governors). Principle 4 — budget, never quota — is the closing sentence, because
without it the pacer reads as the app deciding how strong you are allowed to get.

**Three things the live row knew and no chapter said.** The rep climb rides the
RIR step, so reps hold on a ramp-hold week. Topping out is judged on the lowest
performed working set, not the best one. And `goal_rate_factor` is 0 for cut and
maintain — a cutting block earns no steps at all, which is exactly the kind of
silence that reads as a bug.

**`D-14` is the first defect O3 caught rather than the copy rules.**
`GLOSSARY.e1rm_confidence` ended with a sentence describing the measuring band —
v26, inactive — so the card promised a rating tier nobody has. It surfaced because
ch. 10 is the first chapter to render that card: §8.1 makes the manual carry the
app's own words, O3 forbids documenting inactive behavior, and the two collided on
one sentence. Removed, with the exact text kept in a code comment so restoring it
when v26 activates is a revert. The card has no `InfoDot` call site, so this was a
latent defect rather than one a reader had hit — the same shape as `D-03`.

Live row re-read a third time (still v25, hash-verified, `max_measuring_rir` still
absent); ten parameters added to `22b` §4.2. 23 new `22a` rows and an eight-row
deliberately-absent table, the longest yet — which is itself the honest signal
that this chapter sits next to five other chapters' subjects.

## 2026-08-11 — Session 113: the effort cluster, and a research pass that corrected doc 10 (N74)

Doc 22 **Phase 3d-r** (the research pass) and **Phase 3d** (chapters 7, 8, 9).

**The research pass earned its place by disagreeing with the repo.** Doc 22 §6.3
called ch. 7 *"the one chapter whose content is not already in the repo"* and
sent me to the sources. Reading them first-hand rather than trusting doc 10's
summary is what found the problem: doc 10 §4 justifies the whole RIR ramp with
*"hypertrophy gains flatten past ~1–2 RIR while fatigue keeps rising"*, and
`COACHING_GUIDE` repeats the sentence verbatim, so the connector coaches from it
too. **Neither cited paper establishes a plateau.** Refalo 2023's
failure-vs-non-failure effect is small but positive throughout (ES 0.19, 95% CI
0.00–0.37); the Robinson meta-regression found a *continuing* negative slope for
RIR on hypertrophy with intervals excluding null, and a **flat** relationship for
strength.

The conclusion doc 10 draws survives — `0 RIR` is a peak-week ceiling — but the
argument for it does not, and the true one is better: closer to failure buys a
little growth, no extra strength, and a steeply rising fatigue cost (bar speed
−8% at 3 RIR, −13% at 1, −25% at failure, near-linear), and **fatigue is what
limits how many sets a week can hold**. That makes it a trade, not a diminishing
return, which is exactly why ramping beats sitting at either end. `D-13`; doc 10
and `coaching-guide.ts` are theirs to fix, since Phase 3 is documentation-only.

**O7 closed at its conservative end.** The owner asked for example programs; the
recommendation was *describe by characteristic, name only where the ramp
property is documented and citable*. The research turned up no citable ramp
**specification** — the literature studies proximity to failure as a variable,
not as a published program's schedule — so a name would have rested on that
program's own commercial materials, which `22a`'s rule (code or the active params
row) cannot verify. Four characteristic shapes carry the load, and the review's
§6 records the one-`detail`-block reversal so overruling is cheap.

**The three chapters are one system, so they were written as one.** Ch. 7 sets
the week's effort, ch. 8 overrides it for one exercise, ch. 9 is the week that
spends none of it. Each hands the other two their seams instead of
half-explaining them — and ch. 6 keeps the *controls*, so ch. 7 links rather than
re-documenting start/end cells it does not own (§8.4b rule 3).

**Two app behaviors neither spec states, both read out of the code.** The doc 21
§6.2 back-off policy is **asymmetric**, and stating the asymmetry is what makes
it reassuring rather than alarming: easier-than-the-week work leaves the strength
trend, `best_e1rm` and the PR view, and **stays** in volume, `weight_pr`,
`volume_pr` and `total_volume`, because those are observations rather than
estimates — with the excluded sets counted as `backed_off_sets` rather than
disappearing. And the earn gate refuses **explicitly**, with reason
`exercise_rir`. Ch. 7 arrives at the same gate from the other direction: a ramp
whose easiest week is 4 RIR or above produces only `low`-confidence estimates,
and `progression.min_confidence` is `moderate`, so a very conservative ramp holds
the weight by construction. That is a real, checkable consequence of a ramp
choice and it is nowhere in any spec.

**Ch. 9 is the chapter written straight from doc 22's own error.** §6.1 still
frames an "MRV-stop rule the app actually measures"; the Phase-0 audit had
already found it unimplemented (`22b` §7, T-A5). So the chapter says plainly that
the app deloads **on a schedule** and nothing triggers one, and sends the reader
to ch. 11 for what does move week to week. Its evidence section carries a nuance
doc 10 does not: Coleman 2024's deload group **stopped training for a week**,
which is a different intervention from the light week this app prescribes — so
the trial argues against skipping training mid-block and says little about a
deload week. Both halves are stated, because the first alone reads as *deloads
are useless*, which the study does not show.

**The measuring band stays out** (`22b` §4.1 ①). v26 is inactive, so every logged
set at every RIR is still treated as a measurement; ch. 8 gains the band in the
release that activates it. Writing §6.2 without §6.1 is the single most
consequential instruction the Phase-0 audit left behind, and it held.

`deload` rendered ⇒ two pending glossary terms left. 48 new `22a` rows,
`GUIDE_SECTION_IDS` +15, all suites green.

## 2026-08-11 — Session 112 (cont.): Phase 3c/3e owner review round 5 (N74)

Four notes across ch. 5 and ch. 11, generalized as **doc 22 §8.4d** (binding on
every later chapter): say what an input does *and who reads it*, where it is
entered · an overview section is an answer, not an index · never claim a virtue
by negation.

**The note the owner is making about notes is a product point, not a copy
point.** Exercise and session notes are legible to the connector, so a note is a
message to two readers — you next week, and whoever helps you plan. Checked
before writing it: pinned notes come back from `get_exercise_notes` (and ride
along with `get_exercise_history`), per-session notes are `session_note` on each
history entry, and the whole-session note is `notes` on `get_recent_sessions`.
The chapter states the seam in **both** directions, because "the AI reads my
notes" invites the assumption that a note moves a number — nothing in
`src/lib/engine/` reads one.

Ch. 5 now has **seven** sections: the addition took `#adjusting-as-you-go` to
360 words against the 350 budget, so notes were split out rather than appended.
First time the length budget has forced a structural decision rather than a trim,
and it made the better call.

**The denylist found a note the review had not.** *"Nothing is lost by dismissing
the sheet"* is the same self-congratulatory move as the two sentences the owner
named. It also hit `GLOSSARY.e1rm`'s *"so you never have to test one"* — which
the manual renders verbatim by §8.1 and cannot reword. Rather than weaken the
rule or paraphrase a glossary card, the check now runs over **authored** prose
(`authoredProseOf`), while the honesty and hype checks keep reading term bodies:
a rule about authorship excludes the app's copy, a rule about what the reader
takes away does not.

## 2026-08-11 — Session 112 (cont.): doc 22 Phase 3e — feedback and volume (N74)

Chapters **11** and **12**, five sections each, taken **ahead of 3d** because 3d
is gated on the ch. 7 research pass and these two are the chapters ch. 4 and
ch. 5 were already deferring to. Corpus median holds at 215 over 45 sections.

**The reason 3e needed the code and not the spec.** `22b` §7 flags two
spec-vs-code gaps, and both live here. Doc 10 §3 specifies a graded
MEV→MAV→MRV volume ramp with a two-week-at-MRV auto-deload; neither is built
(T-A5), so ch. 11 documents the ±1 model that ships and never mentions an
automatic deload. Ch. 12 gives MEV/MAV/MRV the advisory role the code gives it.

**Three findings that came out of reading rather than transcribing:**

- The set-add branch requires **four** conditions simultaneously — easy
  workload, strong pump, a growth goal, and the muscle under `mg_set_ceiling` —
  with a pain veto over all of them. Doc 10 reads like two.
- `session_dampen_require_both` is **`true`** on the live row, so a hard session
  you performed well in goes ahead with its increase. It takes fatigue ≥ 8 *and*
  performance ≤ 3 to hold the weight. Worth stating plainly: a reader who thinks
  "I said I was wiped out, so it went easy on me" would be wrong.
- Volume's logged counts carry a **hard-set filter** — non-warm-up, ≤ 4 reps in
  reserve, unreported counting — baked into `v_meso_week_muscle_sets` rather
  than into `engine_params`. It explains a real discrepancy a user could hit
  (sets logged very far from failure not showing up in the weekly count), and no
  spec states it in those terms.

**`D-12`** — `22c` §B2.4 listed `TOP SET BY WEEK — KEY LIFTS` on the meso stats
tabs; N10 dropped that grid on 2026-07-03. Corrected in place. The part that
matters is downstream: §C2 recommends adding `KEY LIFTS` to the glossary on the
strength of that screen, so **ch. 13** needs the row re-sited before it states
anything about key lifts.

**One contract change.** §8.2's current-value-carries-its-path check recognised
dotted paths only; `pain_gate`, `workload_high` and `min_sets` are top-level. A
bare identifier now counts as a citation only when the schema resolves it — more
reach, same grip.

## 2026-08-11 — Session 112: doc 22 Phase 3c — training a session (N74)

Chapter **5**, six sections, 206–256 words against the 350 budget (corpus
median 215 → 218 over 35 sections). The first chapter written under §8.4c, and
the first content PR since Phase 2 that touches no design surface: no new block
kind, no asset, and no glossary term owed — `22c` §C2 marks every undefined
string on this screen (`straight`/`drop`/`amend`, `no report`) as manual-only.

**What the chapter had to get right.** This is the screen a reader is standing
in front of mid-set, so three things carry the weight:

- **The progress rule excludes skipped sets.** Stated plainly, because it is the
  difference between "I cut it short" and "I failed to finish" — and the same
  math is what the completion sheet's `{n} / {n}` counts on (R19 fixed them
  disagreeing once already).
- **N68 said as the reader meets it.** *"Logging is queued"* is a build fact;
  *"a tap is recorded on the phone and sent when it can be, so a dead spot in
  the gym cannot strand you mid-exercise"* is what it buys (§8.4b rule 4). The
  queue strip is described by what it says, not by its existence.
- **The session pointer.** Cut from ch. 1 at round 3 for arriving before the
  reader knew what the Workout page was; it belongs here, and `22a` had already
  parked it against ch. 5 with the note that the owner's *"only for a few
  minutes"* read has no timer behind it — the pointer is session-scoped, so it
  dies when the app does.

**Seams held.** Ch. 6 owns the RIR box and what a set above or below the ask
does to next week (linked twice inline rather than restated); ch. 4 owns the
controls that write the **plan** rather than the session; ch. 17 owns the
prescription strip's layers, which ch. 5 names and hands off — and must, while
**O-A** (is `LLM_EXPLANATIONS` serving or shadowing?) is unanswered. One forward
debt: §5 owes ch. 11 a typed cross-link, which lands with ch. 11 in 3e, because
a `link` cannot be authored before its target resolves.

**31 new `22a` rows, no new defects.** Worth recording after three consecutive
content phases that each found one or three: this screen has had more review
passes than any other in the app, and it read clean.

## 2026-08-11 — Session 111 (cont.): the MEV/MRV card itself was the gap (D-11)

One more note off round 4, on the fix rather than the chapter: rendering
`volume_landmarks` at first use surfaced that the card never spells out what
`MEV` and `MRV` stand for — the same abbreviation defect `D-02` fixed on
`e1rm`, sitting in a glossary entry `D-02`'s fix predated.

- **Fixed**: body now reads *"MEV — minimum effective volume — is the
  floor… MRV — maximum recoverable volume — is the ceiling…"*, trimmed to fit
  the 280-character non-explainer cap.
- **Generalized the test rather than just fixing the card.**
  `glossary.test.ts`'s abbreviation check only matched `e?1RM`. Added a second
  check for `MEV`/`MRV` so the next term with a bare abbreviation fails CI
  instead of waiting for a reader to notice.

## 2026-08-11 — Session 111 (cont.): Phase 3b owner review round 4 (N74)

Three notes on ch. 4, all folded in and generalized as **doc 22 §8.4c** so they
bind 3c onward, plus one design proposal spun out as **N81**.

**All three notes are the same failure.** Each chapter had documented its own
surface accurately and left the reader worse off than the app would have.

- **Name a better path, even when another chapter owns it.** Ch. 4 listed three
  in-app routes into a block and said nothing about planning one through the
  connector — which the owner points out is the most capable and usually the
  easiest route there is. §1 now gives it a heading and two paragraphs. It
  **points, it does not explain**: ch. 18 and the AI Manual own the how. Verified
  before writing — `create_mesocycle` lands the block **`planned`**, and
  `activate_mesocycle` needs `confirm="activate"` and is itself told to prefer
  letting the athlete activate in-app, so "nothing goes live without you" is
  true. The typed cross-link is owed once those sections exist.
- **Define an advanced term where the reader meets it.** §4 was putting
  `UNDER MEV` / `OVER MRV` in front of a reader eight chapters before ch. 12
  defines them, on my reading of §8.4b rule 1. That rule sets **depth**; it does
  not license leaving a term undefined at first use. §8.1 makes the fix free —
  render the card, which is the app's own words. `volume_landmarks` left the
  pending-terms ledger.
- **Before writing "here is where you do X", find every surface that does X.**
  §6 had the planner board as the only way to change a running block. The day
  view's exercise ⋮ menu reorders, swaps, sets effort targets, and the workout
  menu adds exercises. Worth the check: swaps and adds carry
  `Repeat this change on this day in future weeks`, and a **reorder propagates
  with no checkbox at all** — the owner's note said "checkbox", and the code says
  checkbox for two of the three.

**N81** — the fourth note is a design proposal, not an authoring rule: an inline
underlined term as a second definition affordance, so a definition can live
inside a sentence rather than trailing a label. New interaction pattern ⇒ hard
rule 8. Scheduled into **doc 22 Phase 7a**, which already owes the ruling on
`InfoDot` vs a manual link — three affordances, one grammar, decided together.

## 2026-08-10 — Session 111: user-manual Phase 3b, chapters 4 & 15 (N74)

The planning chapter and the library chapter, six sections each, written to
ch. 3's composition model. Sections run 138–228 words; the corpus median moves
225 → 215 over 29 sections.

- **Ch. 4 (Planning a mesocycle)** — three routes in, the planner board, the
  N78 exercise sheet, the live volume check, creating and starting the block,
  and editing one mid-block. The board's day → muscle-group → slot nesting is
  **drawn** (§8.4b rule 7) as `planner-structure.svg`, with the open slot dashed
  because that is the board's own mark for empty.
- **Ch. 15 (Exercises & templates)** — the two-axis filter, what an exercise
  remembers, the load step (N67: steps index off the last weight *entered*),
  custom exercises with the three bodyweight load meanings verbatim, templates,
  and share codes.
- **`load_step` added to `glossary.ts`** — the second of 22c §C2's ten, under
  Phase 3a's rule that each term lands with the chapter that needs it.
- **§8.4b rule 1 did real work.** Both chapters name things they do not define —
  MEV/MRV, `EST. 1RM`, `BACKED OFF`, the ramp's values — because ch. 12, 10, 8
  and 6 own them. That is the discipline that keeps Phase 4's duplication pass
  cheap.

**Three findings, none fixed (content phase, §1.2):**

- **`D-08`** — the create-mesocycle sheet hardcodes `DELOAD AT 4 RIR`; the live
  `deload.target_rir` is **6**, and every other surface reads the parameter. The
  screen where the deload is set up is the one that misstates it.
- **`D-09`** — `22c` §B2.6 said there are four ways to start a block. `Meso
  builder` renders disabled with `" (soon)"`; three work. **doc 22 §2's failure
  mode, occurring inside the audit written to prevent it** — transcribed copy
  without the row's state. 22c corrected in place.
- **`D-10`** — N46: no edit path for a saved template. Ch. 15 takes the positive
  rule instead.

Next: **3c** (ch. 5, Training a session).

## 2026-08-09 — Session 110 (cont.): Phase 3a owner review round 3 (N74)

Seven content notes plus a navigation change, all folded in and generalized as
**doc 22 §8.4b** so they bind Phases 3b onward. **Ch. 3 signed off as the
composition model for every chapter after it.**

- **The map reverses to chapters-only** (fig 4.8 amended one day after it was
  built; 09-changelog 2026-08-09). Phase 2 listed every section inline to hit
  §9.2's "one tap to anywhere" — right at one chapter, a ~130-row wall at 21.
  That is the untraversable-document failure §9 exists to prevent, moved onto
  the orientation screen. The chapter page joins the critical path and takes
  **chapter-level prev/next**, the section footer's grammar one level up.
- **The seven rules**: orientation before detail · substance per sentence ·
  distill, never describe a description · the reader's words not the build's ·
  never define a thing by what it is not (including rhetorically) · weight
  follows importance · draw what is structural.
- **Two are corrections to earlier readings.** 22c §B5.2's "extend, do not
  restate" was read as *quote the app's line, then gloss it*; it means take the
  point further — the reader has already read that line on screen. And §8.4's
  positive-framing test catches capability-absence, but *"The Workout tab does
  not lead to a session. It is the session"* passes the test and fails the rule.
- **Ch. 1** lost the version-history section outright (not a primary function;
  22c already assigns it to ch. 19) and its Workout-tab section was rewritten
  from an edge case into an orientation. **Ch. 2** §1 was re-proportioned to
  answer its own title. **Ch. 3** gained a nesting figure with the profile drawn
  outside the cycle stack as an input, checked by rendering it as the mask in
  both themes rather than by reading coordinates.
- **Worth recording**: the owner's read of the resume behavior ("a few minutes")
  has no timer in the code — the pointer is `sessionStorage` and dies with the
  tab session, which is why a relaunched PWA lands on the current workout. Right
  observation, different mechanism; noted in `22a` for ch. 5.

## 2026-08-08 — Session 110: user-manual Phase 3a, chapters 1–3 (N74)

Doc 22 Phase 3a executed — the first content group on top of Phase 2's reader.
Chapters **1 What WORKOUT is**, **2 Your profile** and **3 The cycle model**,
twelve sections, still behind `releaseActive("1.1.0")`.

- **No design pass needed**: no new block kind, no new rendered pattern. Phase
  3a is content into the surface Phases 1–2 built, which is what makes a
  content phase cheap.
- **Sizes**: 139–243 words per section against the 350 budget; corpus median
  moved 229 → 211, so ch. 6's three-layer mechanism section (323) is still the
  ceiling-brusher and the budget still bites in the right place.
- **`day_slot` added to `glossary.ts`** — the first of `22c` §C2's ten
  recommendations, taken because ch. 3 depends on it and §8.1 forbids a
  manual-only definition. **Decision on the other nine: each lands with the
  chapter that needs it**, so the definition is written by the pass that
  verifies the behavior. The pending-terms ledger shrank by three —
  `macrocycle` / `mesocycle` / `microcycle`, the core vocabulary `22c` finding
  **C1-a** flagged as defined-but-never-surfaced, now rendered as cards in
  ch. 3 (they still have no in-app `InfoDot`; that is Phase 7a's).
- **The live params were re-read**, not trusted: `get_engine_params(25)`
  confirmed v25 still active and hash-verified, `e1rm.max_measuring_rir` still
  absent (so `22b` §4.1 ① holds), and the five ch. 2 rows were added to `22b`
  §4.2 under its own "read it before you state it" rule.
- **Ledger**: 38 new rows in `22a` (`C-app-*`, `C-prof-*`, `C-cyc-*`), each
  against code or the active row.

**Two findings, recorded not fixed** (Phase 3a is content; doc 22 §1.2 forbids
behavior changes). **`D-06`** — `profiles.preferred_equipment`, the
`EQUIPMENT ACCESS` toggles, has **no consumer in the app**: no picker filters
on it, no engine path reads it, and it appears nowhere in `src/lib/engine/`.
Its only reader is the connector's `get_profile`. A user toggling `barbell`
off changes nothing they can see, which is a reasonable expectation to have.
Ch. 2 states what it *does* do (§8.4) and points at the Exercises tab's `EQUIP`
filter for browsing. Worth a backlog item: wire it in, or drop the field.
**`D-07`** — the profile's body-fat copy says a blank field falls back to
training age; since v21 the model first substitutes a representative body fat
for the BMI leanness band (`macro_target.bf_proxy_pct`, present on v25), and
training age is the fallback only when height or weight is missing too. The app
under-describes its own improvement. Ch. 2 documents the two-step version.

Next: **3b** (ch. 4 Planning a mesocycle · ch. 15 Exercises & templates).

## 2026-08-08 — Session 109: user-manual Phase 2, reader infrastructure (N74)

Doc 22 Phase 2 executed. The exemplar chapter is now reachable, searchable and
deep-linkable, and CI enforces the contracts and the performance guards — the
phase's stated exit. Still behind `releaseActive("1.1.0")`.

- **Design pass first** (hard rule 8): `09-design-changelog.md` gains a
  2026-08-08 entry claiming fig **4.11** (guide search) and building fig 4.8.
- **Navigation**: the map (`/more/guide`) with sections inline, search
  (`/more/guide/search`), the `Guide` row on More, and `?from=` deep-link entry
  with an allowlist-validated origin and the accent ■ on the landed section.
- **Search** is the lexical index doc 22 §10 designed — no embeddings, and the
  design claim is tested against the real chapter rather than asserted,
  including a hand-authored keyword the prose never uses.
- **The five §8 contracts** are now tests, including a glossary pending-terms
  ledger that may only shrink and a check that every `engine_params` path the
  manual cites resolves **against the schema** (not the defaults — several live
  parameters are `.optional()` and absent from `DEFAULT_ENGINE_PARAMS`, which is
  exactly the shape of `e1rm.brzycki_max_eff_reps`, a value ch. 6 states).
- **`figure`** shipped with its asset policy: a CSS mask filled with
  `currentColor`, because the app has an explicit light/dark switch and a baked
  `<img>` would disappear in one of them. Verified by rendering it in both
  themes before shipping. Own cache, ahead of the 64-entry app-chrome bucket.
- **`GUIDE_SECTION_IDS`** populated for doc 23 — the last thing doc 22 owed it.

**Two findings.** doc 22 **D3's third promise is wrong** (`22a` **D-04**):
offline manual reading was never going to work, because the reader is
server-rendered and its prose is HTML plus an RSC payload, both `NetworkOnly`
under R7 — never a `/_next/static/**` asset. Doc 22 §4 withdraws it on the
owner's own **O1** framing ("worth having only because it is free"), and flags
it for the owner in case that reasoning is not accepted. Separately, the first
pass at D3 guard 2 was written against the wrong `@serwist/next` entry point
(**D-05**) — caught by `tsc`, and the real precache behavior is now written
down.

## 2026-08-07 — Session 108: user-manual Phase 1, architecture + one exemplar chapter (N74)

Doc 22 Phase 1 executed. The reading surface exists and chapter 6 fills it, all
behind `releaseActive("1.1.0")` so nothing is live; owner review runs on a
preview deploy with `NEXT_PUBLIC_RELEASE_OVERRIDE=1.1.0`.

- **Design pass first** (hard rule 8, no mockup exists): `09-design-changelog.md`
  gains a 2026-08-07 entry claiming figs **4.8 / 4.9 / 4.10** and deriving all
  three from patterns already in the app.
- **Architecture**: the nine-kind block union + inline vocabulary
  (`src/content/manual/types.ts`), the section-ID scheme
  (`ug/effort-rir#per-exercise`), the length budget, the registry, and the
  house-styled renderer (`src/components/manual/ManualBlocks.tsx`).
- **The budget was calibrated, not assumed**: chapter 6's six sections ran
  205–309 words over 6–8 blocks, median 229, so doc 22 §9.3's 350/12 stands.
- **`figure` deliberately deferred to Phase 2** — its assets live under
  `public/`, which shares a 64-entry image cache with the app icons, so the
  policy belongs with the other D3 guards.
- **Claims ledger opened** ([`22a`](../22a-manual-claims.md)) with 22 rows, each
  verified against code or the live v25 params row.

**The §8.1 glossary-identity contract earned its keep immediately.** Writing
ch. 6's mechanism section forced `GLOSSARY.e1rm` to be checked against
`predict.ts`, and its closing clause was the mechanic backwards — *"closer to
failure reads as stronger"*, when e1RM rises with effective reps (`reps + rir`),
so the set with reps in reserve implies the greater strength. The doc 21 §2
restamp (+4.85%, strictly upward) is the same fact observed in production.
Fixed, pinned by a test, logged as `D-01` and in `22b` §6.6, staged for 1.1.0.

**Doc hygiene:** `22b` §8's **O-D** closed — the Phase-0a corrections are folded
into doc 22's prose (§2.2 now names v26, §6.1 the ±1 workload model, §6.2/§6.3
off the measuring band).

**Owner review round 2, same day — signed off with four notes**, all folded in
and generalized as doc 22 **§8.4a** so they bind every later chapter:

1. **Prev/next in the section footer**, crossing chapter boundaries, naming its
   destination — pulled forward from Phase 2.
2. **`related` is a labelled list carrying each target's summary**, and skips
   whatever prev/next already offers; the bare trailing `LABEL ›` links are
   gone. Also pulled forward from Phase 2.
3. **A tenth block kind, `legend`** — show the app's mark, do not describe it.
   First use is the `▲`/`■`/`▼` set markers, whose glyphs moved to a shared
   `src/lib/set-markers.ts` that `DayView.tsx` reads too (ledger `D-03`).
4. **No definition may lean on an unexplained abbreviation** — `GLOSSARY.e1rm`
   is now `ESTIMATED ONE-REP MAX (E1RM)` and ties the words to the letters
   (ledger `D-02`), with two sibling cards following and a test pinning it.

## 2026-08-06 — Session 107: user-manual Phase 0, the four ground-truth audits (N74)

Doc 22 Phase 0 executed and landed as three working documents. The phase exists
because spec prose alone yields a wrong manual (doc 22 §2); it found three
places where doc 22 itself is one of the wrong sources.

- **[`22b-source-map.md`](../22b-source-map.md) (0a).** The precedence ladder,
  a topic → authoritative-source table, and the **live-behavior ledger** read
  straight out of `public.engine_params` rather than out of the repo.
- **[`22c-app-inventory.md`](../22c-app-inventory.md) (0b + 0c).** 26 routes
  walked from the code post-Batch-32, with every control, state and label; plus
  the concept inventory (13 glossary terms, 4 of them never surfaced; ~22
  undefined rendered terms, 10 recommended for `glossary.ts`) and 18 mined FAQ
  candidates.
- **[`22d-connector-inventory.md`](../22d-connector-inventory.md) (0d).** 56
  tools confirmed, 17 admin-gated and named once as an exclusion set, 39
  user-facing each with a plain-language line, a writes? verdict and its
  use-case chapter — plus the real auth flow, the 120 req/min limit, and the
  four failure shapes.

**Three corrections to doc 22, all of which would have shipped as wrong prose:**

1. **§2.2's inactive list is stale.** v20 (earned-step progression) activated
   2026-07-11 and v23 (strength-rate band) 2026-07-12; the chain has since run
   to **v25 active**. The genuinely-inactive behavior is **v26, the doc 21 §6.1
   measuring band** — and it sits directly under ch. 8, which doc 22 §6.2 says
   must be written. The reassurance ch. 8 actually needs ("a protected block
   does not read as a decline") is doc 21 **§6.2**, which *is* live. Two of
   §6.2's four bullets need amending.
2. **§5 ch. 10's headline rationale is backwards.** Doc 22 says "Epley drifts
   high at high reps, Brzycki low; averaging cancels". The code says Brzycki
   *inflates* above ~10 effective reps, and the operative rule is a **cutoff**
   (`e1rm.brzycki_max_eff_reps = 10`): average inside the band where they agree,
   Epley alone above it.
3. **§6.1's "the MRV-stop rule the app actually measures" is not implemented.**
   What ships is a ±1 set workload model with MEV/MAV/MRV as an advisory
   classification library; doc 10 §3's graded ramp and auto-deload trigger were
   deliberately deferred (T-A5). Ch. 9 must say the deload is **scheduled**.

**Two open items now blocking specific chapters** (not Phase 1): **O-A** — is
`LLM_EXPLANATIONS` `on` or `shadow` in production? (203 explanations exist,
newest today, so generation is running; serving is a Vercel env var Claude
cannot read) — blocks ch. 17. **O-B** — will v26 activate before Phase 3d?

**O7** (naming published programs in ch. 7) remains open and does not block
Phase 1.

**Merged `main` after N80's PR #230** and made the audits comply with doc 23:
`22c` gains `/more/whats-new`, the What's New sheet and the new footer (26 → 27
routes); `22d` §10 re-verifies 56/17/39 unchanged; `22b` §10 records the five
ways doc 23 binds doc 22's plan — **the manuals are 1.1.0**, so Phase 2 ships the
guide routes behind `releaseActive("1.1.0")` and must populate
`GUIDE_SECTION_IDS`, and **Phases 1–2 are now the critical path to 1.1.0**. Doc
22 §11 amended to say so. Also found that doc 22 §2.2's stale inactive claim had
already been inherited by doc 23 **T10** (`22b` §6.3), and that doc 23 §9.5
re-scopes **O-B**: v26 now rides a feature release rather than being activated
independently. This PR classifies as **no release entry** (§4.2 — nothing a user
would notice).
## 2026-08-06 — Session 106: the versioning framework is built, v1.0.0 cut (N80, doc 23 phases 0–6)

Doc 23 went from plan to shipped in one PR. Nothing in the plan needed
rewriting, which is the useful signal: the two owner-review corrections
(the `workouts.status` suppression rule and version-keyed gating) were the parts
that would otherwise have been discovered in code.

- **Phase 0 first, because hard rule 8 says so.** No mockup exists for the sheet
  or the history page. Both are derived from the house system in a dated
  09-changelog entry, and figs **4.6** / **4.7** are claimed in the 08 §5 index
  with an explicit footnote that nothing was drawn for them. The derivation held
  up: a release entry turned out to be the same object as a More settings row
  plus a body paragraph, so no new pattern was invented.
- **What the code forced, and what it didn't.** Only one plan detail changed on
  contact: `/stats` is not a route (stats hang off a meso, which is ID-bearing),
  so the allowlist links to `/cycles` instead — exactly the T7 case the doc
  predicted, arriving from a direction it hadn't named. Everything else built as
  written.
- **The invisibility of unreleased work is structural, not a rule.**
  `src/content/releases/index.ts` does not import `unreleased.ts`. There is no
  path from a staged entry to `RELEASES`, so the history page cannot show one
  even if someone wants it to. A test asserts the property, but the property
  does not depend on the test.
- **The guard is a real refusal, not a note.** `activate_engine_params` now
  refuses a `feature`-classified activation whose `announced_in` is missing,
  unknown, a fix release, or not yet deployed — the same shape as the existing
  `confirm_version` echo. T10 stops being runbook discipline.
- **Priming needed a client hop.** The `prime` branch writes from a one-shot
  effect rather than during the server render: §6.3 is explicit that
  acknowledgment is never a render side effect, and that reasoning applies to
  priming for the same reason. It costs one write per account, once.
- **Remaining / external.** Apply `20260806000002_last_seen_version` to hosted
  and confirm the backfill; `NEXT_PUBLIC_RELEASE_OVERRIDE` goes on Vercel's
  Preview scope only, when there is a staged block to review. Both are in
  `manual-operations.md`.
- **Next in workstream V:** 1.1.0 = the manuals (doc 23 §11.1), which sets the
  doc-22 interleave — 22 P0–P2, then 23 P5's `guide` half, then 22's content
  phases, then the cut.

## 2026-08-06 — Session 105: versioning plan, owner review round 1 (N80, Batch 35)

Owner reviewed [doc 23](../23-versioning-releases.md), **accepted all eight
decisions**, and raised six points — three of which were defects. Doc revised on
the same branch/PR (#229, still open). Verbatim in the backlog appendix as
**Batch 35**.

- **The live-workout rule was broken.** "Never over a live workout" was written
  as route suppression, but `(app)/workout/page.tsx` renders `DayView` inline —
  *"the latest uncompleted workout IS the tab (fig 1.1)"* — so the rule would
  have suppressed the modal on the app's landing surface, i.e. always. Owner
  caught it. Redefined off state the schema already carries: `workouts.status`,
  which `queries/logging.ts::logSet` flips `planned → in_progress` on the **first
  logged set**. Looking at a workout is `planned`; being in one is
  `in_progress`. The stale-`in_progress` case is handled by allowing every other
  tab to show the modal — no time heuristic, no clock in the gate (§6.4).
- **"Dark shipping" was too vague to be a mechanism.** Owner asked the exact
  right question: what keeps unreleased feature work hidden, and what flips it?
  Answered as **version-keyed gating** — `releaseActive("1.1.0")` is
  `compare(CURRENT_VERSION, "1.1.0") >= 0`, `CURRENT_VERSION` comes from the
  registry, and the registry only gains `1.1.0.ts` in the release PR. **The
  release PR is the switch**; one merge flips every accumulated gate, bumps the
  digit, publishes the notes and starts the modals. History invisibility falls
  out of the data model (`unreleased.ts` is never in `RELEASES`). The owner's
  stated model is confirmed line-by-line in a §9.2 table, including the fix-digit
  reset. Costs written down honestly: dual code paths until the cut, migrations
  can't be gated this way, and a non-production `NEXT_PUBLIC_RELEASE_OVERRIDE`
  is needed to preview a staged block.
- **`release_impact` on the MCP param tools** (§9.5) — owner's instinct was right
  and it is cheap: one required argument (`none`/`fix`/`feature`) on
  `propose_`/`activate_engine_params`, and `activate` refuses a `feature`-classified
  set when no live release announces it. That turns T10 from runbook discipline
  into a guard, and `replay_decisions` (already used for the v19→v20 assessment)
  informs the classification rather than leaving it to guesswork.
- **CI cost audited** (§9.4). Every proposed gate is a pure unit test riding the
  existing `npm run test` step — no new workflow, no new job, ~0 minutes; the
  expensive jobs (`supabase start`, Playwright) predate this work. The one check
  that *would* have needed its own workflow and `pull_request` write permission —
  the "touched `src/app/**` without a release note" warning — was **dropped** and
  became a checklist line, since it can't be trusted anyway.
- **Guided tour accounted for** (§6.5): the gate returns a discriminated union so
  `prime` is a named state a tour can hook, while `last_seen_version` stays
  single-purpose — a user can finish a tour and still be owed three release
  notes, so one column must not mean both.
- **1.1.0 = the manuals** (owner). Sets the interleave with doc 22 (23 P0–P4 →
  22 P0–P2 → 23 P5 → 22 content → cut 1.1.0) and adds a requirement: the
  manual's routes sit behind the release gate, or the guide would go live
  chapter-by-chapter and the announcement would be telling users about something
  they'd already been reading (§11.1).
- **O7 amended** with the owner's note that MEASURE will need its own versioning
  once built: when it splits, the registry filters on `surface` and MEASURE gets
  its own column, not a jsonb map on `last_seen_version`.

N80 moves `needs-input` → **ready**; next is Phase 0, the hard-rule-8 design pass.

## 2026-08-06 — Session 104: versioning & release framework (N80, Batch 34)

Owner asked how to architect and implement discrete versioned releases from a
fresh **v1.0.0**, with per-user last-seen tracking driving a What's New modal,
a version history on More, and a defined process. Answered with a plan + build
spec: [`docs/23-versioning-releases.md`](../23-versioning-releases.md) (PR #229).
New workstream **V**; verbatim note in the backlog appendix as **Batch 34**.

- **The proposed structure works, with one renaming.** `MAJOR.FEATURE.FIX`
  keeps semver's shape but defines the digits by **audience**, not API compat —
  there is no public API, so what matters is whether a person needs to be told.
  The owner's "major versions (1.1)" are **feature releases**; `2.0.0` is
  reserved for a rare product-model change. The decision rule is one question
  (§4.2) with a rider that matters here: **a changed number counts even with no
  UI diff** (doc 10 §9 honesty).
- **Two things the code forced that prose alone would have missed.** (1) Hard
  rule 8 — there is **no mockup** for either the modal or the history page, so a
  `09-design-changelog` design pass gates the build (Phase 0). (2) Activating
  `engine_params` changes prescriptions with **zero code diff** (v20/v23/v26 all
  shipped inactive, activated later by an owner-gated MCP step), so under §4.2
  an activation is a feature release — `manual-operations.md` gains an
  announce-then-activate step (§9.4).
- **The registry lives in the repo, not the DB** (§5.1): a release note is a
  claim about deployed code, so note and feature must be one commit that
  deploys and rolls back together. Same reasoning as doc 22 §14.
- **Three correctness traps drive the design** (§2): the version comparison must
  run **server-side** (a stale bundle compares against a stale constant); the
  gate must **accumulate** skipped releases (users don't open the app every
  release); new accounts must be **primed**, so `profiles.last_seen_version`
  uses `null` = "not yet primed" rather than a default.
- **"Push to main in blocks" resolved without a release branch** (§9.1): option
  C — trunk + a staged `unreleased.ts` manifest + dark shipping for anything
  that must not appear early. The repo already has that muscle (inactive params,
  `LLM_EXPLANATIONS`). A long-lived `release/1.1` would fight the deployable-
  `main` convention and conflict badly against this repo's large slices.
- **Couples to doc 22.** Guide deep links are doc 22 §9.4 section IDs sharing
  its validator — a dependency, not a blocker, which is why deep links are
  Phase 5. The standing contract: a feature release that introduces a concept
  ships its guide section in the same block, so "learn how this works" has a
  destination.
- **Six phases** (§11); phases 1–2 are shippable as 1.0.0 on their own and
  replace the hardcoded `WORKOUT 0.1 — PRE-RELEASE` footer with an enforced
  three-way identity. **Eight decisions returned to the owner** (§12 O1–O8);
  N80 sits `needs-input` until they land.

## 2026-08-06 — Session 103: user-manual plan, owner review round 1 (N74, Batch 33)

Owner reviewed [doc 22](../22-user-manual.md), accepted every decision (D1–D5)
and every open question (O1–O6), and added content, scope, navigation and
architecture notes plus two real questions. PR #225 had merged and #226 landed
on top, so the revision came via a fresh branch off `main`. Verbatim notes in the
backlog appendix as **Batch 33**.

- **Three chapters added** (doc 22 §6, the areas the owner found missing):
  **deloads** — the concept, plus the honest evidence position (the lone RCT on
  a *planned mid-cycle* deload found no benefit and a possible strength
  decrement, so the app's 4–6 week default is a scheduling heuristic while the
  real signals are the MRV-stop rule the app already measures); **exercise-level
  RIR** — both directions, the rehab back-off *and* the owner's push-harder case
  for muscles the systemic ramp doesn't limit; **RIR ramps ↔ training styles**.
- **The third one needs research the repo doesn't have.** Doc 10 and the
  coaching guide establish the RIR/fatigue relationship but neither maps ramps to
  styles nor discusses third-party programs — so chapter 7 gets a **research pass
  first** (`docs/reviews/…-rir-ramps-and-training-styles.md`, evidence-tagged per
  doc 10's convention, the pattern of the goal-rate-factor research). Filed as
  Phase 3d-r. It also raised the one new open question, **O7**: naming real
  published programs makes checkable third-party claims that go stale and can
  read as endorsement — recommendation is characteristics-first, named only where
  the ramp property is documented and citable.
- **Scope cuts:** admin capabilities and admin-only tools are out of **both**
  manuals (not even a "these exist" note — the §7.2 inventory now exists purely
  so Phase 0d knows what to exclude); sign-up/auth is out, since a manual reader
  already completed it.
- **Two new copy contracts:** *positive framing* (describe what the app is, not
  what it isn't — tested, with an allowlist for the places a negative is the
  honest statement, e.g. "it never deletes logged history") and *plain language*
  (O4 amendment — "Claude or ChatGPT" not "LLM", "connector"/"plug-in" not "MCP",
  the latter allowed only where the reader must find that word in their own
  client's UI).
- **Navigation re-cut, the biggest structural change.** The owner's
  "not an untraversable 100-page document" note moves the addressable unit from
  the chapter to the **section**: chapter routes become contents pages, section
  routes are the atomic linkable unit, every path to a section is ≤1 tap (map,
  search, and in-app links all land on section routes), prev/next crosses chapter
  boundaries so a linear read still works, and a **build-failing section-length
  budget** (~≤350 words / ≤12 blocks, layer-3 `detail` blocks exempt) enforces it
  at authoring time instead of leaving it to discipline.
- **D3's condition is satisfiable at zero launch cost**, which is the useful
  finding: `sw.ts` already runs `CacheFirst` over `/_next/static/**`, so
  **cache-on-read rather than precache** gives offline access to anything already
  opened without adding a byte to install or launch. Backed by three enforced
  guards — a WS-J-style import guard (nothing outside the manual tree imports
  manual content; Phase 7 links pass a section *ID*, never a module), a
  precache-manifest exclusion assertion, and a lazily-fetched search index.
- **Q: how will the connector find things — RAG?** Answered in §10:
  **retrieve-then-read over the authored section graph, no vector RAG.** D2 makes
  chunking an *authorship* product — titled, independently-addressable sections
  with stable IDs, a length budget, and a related-sections graph are better chunks
  than any splitter, and at ~130–200 sections a lexical index is competitive while
  staying deterministic and CI-checkable. Design: a `workout://user-guide-index`
  resource (the map, a few KB) + `search_manual` + `get_manual_section`, with the
  glossary as the alias layer and an `app_route` on every hit so the AI hands back
  a tappable link. Embeddings deferred behind a measured-recall trigger. This
  **promoted the retrieval phase from optional to required** and moved it ahead of
  the AI Manual content.
- **Q: could an admin MCP tool edit the docs?** Answered in §14. Mechanically
  no — Vercel's filesystem is read-only and rebuilt from git. The two ways to make
  it work both cost more than they save: a GitHub-write token is a new
  high-value secret in an app whose threat model has no repo access today *and*
  bypasses the content contracts; DB-backed content forfeits CI enforcement,
  offline, and a single source of truth. Recommendation: keep content in the repo
  (a wording fix is a one-line data change), and hold a narrow **errata overlay**
  — admin tool writes a dated correction note rendered *beneath* a section, body
  untouched — in reserve if the latency ever proves to matter.

Plan only; no code. Doc 22 revised throughout, CLAUDE.md's doc-22 entry updated.

> **Housekeeping owed:** the reconciliation sweep found `done (PR #…)` rows whose
> PRs have merged (#215–#226, incl. N70/N73/N75–N79). Left un-swept deliberately —
> archiving them is a large, unrelated diff that would bury a docs-plan review.
> Flagged to the owner; do it as its own pass.

## 2026-08-06 — Session 102: exercise menu, cycles list, planner editing, concurrent mesos (N75–N79)

Owner handed over five items in one batch (Batch 32). All five built and shipped
in **PR #226**; the whole batch is UI-and-plumbing except N79, which is a schema
change.

- **N75** — *Engine audit* → **Prescription details**, off the ⋮ menu and onto
  the prescription strip's own ask line (underlined). This amends **N57**, whose
  Batch-20 addendum had deliberately removed an in-strip link; the owner's point
  is that the *ask line itself* is the right door, not a link beside it.
- **N76** — completed cycles hidden by default on `/cycles`, with a muted
  count-carrying toggle at the bottom (`?completed=1`, server render, no
  settings entry). Completed mesos inside a *running* macro stay visible.
- **N77** — the history e1RM row loses `EFF REPS` and the assumed-RIR `~`. Both
  came from **N70 Phase 1**; the tilde's job was to keep an assumption from
  reading as an observation, and the owner's call is that in this row the
  distinction has no reader. It survives on `get_exercise_history`, where it does.
- **N78** — the planner board opens for an in-progress meso. **The finding: the
  board could already do this.** Staged working copy, transactional replace,
  `regenerateOpenWorkouts`' structural merge that skips every started workout,
  and a save-confirm sheet with a written-but-unreachable "LOGGED HISTORY IS
  PROTECTED" branch. One `disabled={hasHistory}` was the whole lock, and it was
  protecting nothing. Exercise-level RIR reaches the board as the **flat**
  column only — N70 Phase 6 left `PlannerBoard.tsx` alone because a per-week
  assignment can't be shown truthfully on a surface with no week axis, and that
  reasoning still holds for the per-week form; the flat value is the part the
  board can author honestly. The clutter ask was answered by **subtraction**:
  six per-row targets (set stepper ×3 + its label, ✕, and a secretly-tappable
  exercise name) collapsed into one exercise sheet, so adding a lever made the
  row simpler rather than denser.
- **N79** — concurrent mesocycles. Not a gate removal: **R15** made
  one-active-per-user a DB guarantee, so the index had to be replaced
  (`mesocycles_one_active_per_macrocycle`). The consequence worth naming is that
  "the active meso" stops being a lookup and becomes a **resolution** —
  `resolveActiveMesocycle`, most-recently-logged-set wins, per the owner's rule.
  One active macrocycle is enforced in the app rather than by an index, because
  an account already carrying two would fail the migration.

Next: nothing new is blocked. **N74** (the manuals) still awaits owner review of
doc 22 §4/§12 before Phase 0, and this batch adds three surfaces the eventual
route-by-route inventory will have to describe (the cycles toggle, the planner
exercise sheet, concurrent blocks).

## 2026-08-05 — Session 101: user manual + AI manual — plan written (N74)

New owner task, not a note batch: review the repo, the app's real functionality
and all docs/notes to date, then produce a **User Guide** and a dedicated
**AI/MCP Manual** (the latter living under the AI connector settings page), and
afterward place links into the app at the points where they help most. Owner
asked for the phased plan first, before any writing.

- **New item N74** filed under workstream **M** (in-app help & education), the
  home of the archived N25 `InfoDot`/glossary work. This is the mechanism-level
  layer above N25's term-level layer; they share one glossary.
- **Plan:** [`docs/22-user-manual.md`](../22-user-manual.md) — IA for both
  manuals (18 User Guide chapters, 12 AI Manual chapters), content contracts,
  navigation/search requirements, and nine phases sized to one PR each.
- **The finding that shaped the plan.** Writing this manual from spec prose
  would produce a wrong manual. The docs supersede each other in place
  (09↔08↔06, 19↔18, 21 amends 11's RIR premise, 16↔17), and engine_params
  **v20 and v23 shipped inactive** pending owner activation — so several
  documented behaviors are not live. Hence **Phase 0**: four parallel
  ground-truth audits (doc supersession map, route-by-route functional
  inventory over all 25 pages, concept/FAQ inventory, connector inventory over
  the 56 tools / 17 admin-gated / 3 resources) that gate every later phase and
  produce `22b`/`22c`/`22d`.
- **Structural calls** recorded as D1–D5 with recommendations: in-app for both
  (the AI Manual's home is fixed by the ask; the User Guide should match or
  link placement has no targets); content as a **typed block model** in
  `src/content/manual/` rather than adding a markdown renderer (no new
  dependency against the WS-J bundle guard, and one source feeds the renderer,
  the search index, the anchor map and an optional `workout://user-guide`
  resource); a three-layer depth model (one-line answer → plain-language
  mechanism → collapsed exact rule) as the structural answer to "understandable
  but informative".
- **Anti-rot mechanisms**, because this codebase moves fast: a **claims ledger**
  (`22a`) mapping every factual assertion to code (not prose), three
  CI-enforced content contracts (glossary identity with `glossary.ts`, the
  doc-10 §9 honesty guardrails as a copy test, link-target validity), and a
  Phase-8 CLAUDE.md rule that a behavior-changing PR updates the manual in the
  same PR — the discipline the backlog-row rule already enforces.
- **Deferred by design:** link placement is Phase 7 (owner's own sequencing —
  placements are decided against real sections, and gated by an owner-reviewed
  audit so the app doesn't get sprayed with help icons).
- Six open owner questions in doc 22 §12 (offline availability, User Guide
  prominence, whether to document inactive engine behavior, AI Manual audience
  floor, real vs synthetic transcript data, mining the FAQ from `docs/notes/`).

No code written. Awaiting owner review of §4 decisions + §12 questions before
Phase 0 starts.

## 2026-08-05 — Session 100: two owner review rounds on the Phase 6 Effort target UI (N70, PR #224)

N70 is already closed (Phase 6, PR #224); this session is polish on that PR
before merge, not a new backlog item — no row change.

- **Round 1:** the Effort-target sheet's choice controls were restyled off the
  settings screens (fig 4.4) instead of Load step's oversized accent chips;
  scope labels/copy corrected so the wider scope doesn't read as reaching
  already-trained weeks; fixed an empty `CUSTOM` field silently acting as
  "clear."
- **Round 2:** selection fill moved from ink to **accent** (hard rule 7 —
  orange is for current position/selection, and a selected cell is exactly
  that); added an absolute `RIR 0` cell; scope labels became
  `THIS WEEK` / `WORKING WEEKS` / `ALL WEEKS`; removed the standing
  never-changes-a-trained-week sentence from the sheet (the enforcement stays
  in doc 21 §10 code, not restated in copy); reason placeholder made
  direction-neutral.
- **The real one:** round 2 also reopened and reversed a Phase 6 decision —
  the per-set RIR capture cell (logging grid) blanked the number whenever the
  prescription sat above the 0–10 reportable range, reasoning by analogy to
  §9.4's qualitative band. Owner pushback: a blank cell gives no information,
  and the cell was never at risk of mis-saving the way §9.4's narrative
  surfaces were — `reportedRirFromInput` already discards anything outside
  0–10 whatever the box shows. Reverted to showing the real number, muted
  until confirmed (typed, or a server report lands). `captureRirDefault` is
  `number` again, not `number | null`.
- Docs: doc 21 §9.4/§10 both now carry the correction in place (superseded
  bullets marked, not deleted); 09-design-changelog gets a new dated entry
  rather than a rewrite of the 2026-08-04 one; PROGRESS gets a new top entry.
  Full suite green (1730), typecheck/lint/build clean both rounds.

## 2026-08-04 — Session 99: doc 21 Phase 6 built — the lever reaches the app (N70)

The last phase. Five phases made the lever real, correct, writable over MCP and
honest in the stats; this one makes it visible and editable where the athlete
actually is, and stops the coaching layer from claiming credit for a decision a
person made.

- **N70 → Phase 6 done (PR #224). The item CLOSES** — all six phases shipped.
- **One display module for one state.** `src/lib/slot-effort-display.ts` (pure,
  client-safe) owns every word: the eyebrow suffix, the §9.4 band phrase, the
  disclosure sentences. Three surfaces compose from it, so they cannot drift into
  three vocabularies. `hasEffortDisclosure` is where "unassigned reads exactly as
  before" is enforced rather than hoped for.
- **§9.4 settled: the qualitative band, as a DISPLAY rule.** Past
  `max_measuring_rir` the ask says "each kept well short of failure" and the
  planner meta says `LIGHT`; the audit sheet still prints `171 × 9 @ 21 RIR` and
  nothing about pricing or the trace moves. The assignment line and the ask are
  composed from the same predicate so they can never disagree.
- **The defect this phase surfaced.** §4.3 made the ask unbounded (0–30) while
  `rir_reported` stayed 0–10 — so Phase 1's pre-fill would have printed `21` into
  a box labelled RIR and asked the athlete to confirm it. The pre-fill now returns
  null past the reportable range and the cell renders empty. Still a no-op default
  (empty reports nothing, the server's `assumedRir` resolves to the same
  prescription), and a *real* report at 8 still makes the set a measurement again:
  the band and the capture control compose rather than fight.
- **The ordering IS the argument.** The assignment and its reason render above
  every engine-authored line, the delta line drops its "easier effort target"
  clause when an assignment (not the ramp) moved the RIR, the week frame is
  suppressed, and on a deload the assignment replaces the deload boilerplate
  instead of contradicting it. A person chose the effort; the engine only priced
  the load to meet it, and no layer may imply otherwise.
- **Two write surfaces, one authoring policy.** `planEffortEdits` +
  `loadEffortContext` moved out of the MCP tool into `queries/slot-effort.ts`
  (re-exported so the tool's tests are untouched) and the new
  `setSlotEffortAction` runs the same planner — same refusals, same §4.1
  warnings, same already-trained-week guard. The sheet's three scopes OVERLAY the
  slot's existing per-week map instead of replacing it, so nudging one week can
  never silently drop an assignment sitting on another.
- **doc 19: the numbers come off the recorded decision.** `effort_assignment` is
  projected from `inputs.exerciseRir` and friends, so an explanation describes the
  assignment that priced *that* decision, not today's plan. Only the reason needs
  a lookup, and it is dropped when one exercise carries two different reasons in a
  meso — the wrong reason on a coaching line is worse than none.
- Full suite green (1683 → 1730, +47 across five files), typecheck + lint +
  production build clean.

## 2026-08-04 — Session 98: doc 21 Phase 5 built — the stats policy (N70)

The read side of the lever: what a deliberately-easier session is allowed to say
about the athlete's strength.

- **N70 → Phase 5 done (PR #223).** Row updated; the item stays live (Phase 6
  remains).
- **One intent key.** `isBackedOffSlot(slotRir, weekRir)`, which
  `resolveSlotEffort` now calls for its own `backedOff`, mirrored in SQL as
  `workout_exercises.target_rir > microcycles.target_rir`. That is the *realized*
  form of `resolvedRir > weekRir`, and hard rule 5 (a performed session's row is
  never rewritten) makes it a permanent record of the intensity actually trained.
- **Intent, not confidence — and not symmetric.** Excluding by `e1rm_confidence`
  would drop honest high-rep work, since confidence degrades with effective reps
  too. And a slot run *harder* than its week keeps every claim it earns; only the
  back-off direction is set aside.
- **Read-side only, which is the whole difference from §6.1.** The band asks "is
  this a measurement at all" and answers it at the stamp; §6.2 asks "is this
  measurement comparable". The set was genuinely measured and still anchors the
  engine — so no stamp changes, no backfill, and a later policy change is free.
- **Excluded from strength, kept in volume, disclosed in both.** Out of the trend,
  `best_e1rm`, both PR views, and both sides of the meso PR scan (a backed-off
  session can't set a PR *or* raise the bar a later one must clear). Still in
  volume with a fractionally-weighted `logged_backed_off_sets` count, and still in
  history with its numbers plus a `BACKED OFF` tag.
- **The disclosure travels with the number.** `StrengthProgress.comparability` is
  built from the same scores the block renders, so it can never contradict them;
  MCP gets the same sentence, a `compare_mesocycles` warning, and per-week volume
  disclosure. Everything omitted-not-zeroed when nothing is assigned.
- **Last N71 corner closed.** `analyze_exercise_progress`'s session series was
  still passing `rir_reported` raw into `estimateE1rm` — an unreported set read as
  taken to failure, exactly the defect Phase 1 fixed elsewhere.
- **Flagged, not decided.** `logged_hard_sets` bakes doc 10 §2's separate RIR ≤ 4
  stimulus rule, so a back-off reported past RIR 4 leaves the hard-set count while
  staying in the disclosure — and Phase 1's write surface means the "unreported
  counts, benefit of the doubt" clause rarely applies any more. Whether a deep
  back-off should read as under-dosed volume is §2's call; recorded in doc 10 §9
  for the owner rather than changed here.
- **Verified live.** Migration applied to the hosted project: every pre-existing
  view column hashes byte-identically to the pre-migration baseline, all
  disclosure counts 0, advisors clean. A simulated assignment over the real data
  (no writes) flags 691 sessions / 1641 sets, confirming the shapes fire.

### Next session — suggested starting point
- **Doc 21 Phase 6** — the UI + explanation pass: planner/day-view disclosure of
  an active assignment, the editor sheet, the deferred prescription-strip copy for
  the set cap and the rep position, and the doc-19 layering. Needs a hard-rule-8
  design pass in `09-design-changelog.md` first, and §9.4's settled answer (the
  qualitative band for an out-of-band RIR) is its input.

## 2026-08-02 — Session 97: doc 21 Phase 4 built — the set lever bites, and the rep-position knob (N70)

The second and third levers on a slot. Phase 3 made the assignment writable;
Phase 4 makes the set cap *do* something and adds the one knob §4.2 kept when it
retracted the forced-centering rule.

- **N70 → Phase 4 done (PR #221).** Row updated; the item stays live (Phases 5–6
  remain).
- **The cap is applied once, at the boundary.** `cappedSets` wraps `prescribe()`
  and `seedMeso()` rather than editing each branch's `sets` expression (deload,
  cold start, seed anchor, rep window, bodyweight all land on a set count
  already). It sits *outside* the doc-16 progression wrapper deliberately: sets
  play no part in the earn gate or the realized-ask comparison, so a capped
  week's progression trace is identical to an uncapped one's.
- **A ceiling, and absolute.** `min(sets, cap)`, applied after
  `clampSets(…, params)` — so an authored cap of 1 wins over `params.min_sets`,
  which is the rehab case the lever exists for. It never raises the count;
  `set_baseline_sets` stays the way to start an exercise on more sets, and the
  Phase-3 "the engine doesn't clamp to this yet" warning is replaced by the one
  that now matters.
- **`rep_position` stays a knob, not a rule.** §4.2's correction is untouched —
  repricing at a different RIR needs no special case. Unset ⇒ the Option-A climb
  schedule decides, byte for byte; set ⇒ `repsAtPosition` replaces the schedule's
  rep choice at the three sites that make one, and the existing pricing path does
  the rest. Named positions resolve against the target band, an explicit rep count
  is clamped to the window's hard bounds — a coach can ask for 15s but cannot
  escape the goal's window.
- **Flat per slot, on purpose.** One `rep_position text` column, no third
  week-indexed array: the position is how the exercise is priced, not an intensity
  that ramps. The MCP op **refuses** `weeks`/`schedule` instead of ignoring them,
  so a caller who wanted a per-week position is told the column cannot express it.
- **Freshness is one key per lever.** `exerciseSetCap` and `exerciseRepPosition`
  join `exerciseRir` in `buildConfigInputs`, each omitted when its own lever is
  unassigned; the recompute's explicit key-drop (Phase 2's non-obvious guard) now
  runs per lever, so clearing one assignment can't leave another replaying off a
  stale copy.
- **One honesty fix on the read side.** `get_current_state` described a slot
  carrying only a set cap as "running at an assigned RIR" — quoting the week's own
  value as if it had been authored. The RIR sentence now covers only RIR-assigned
  slots; caps and positions get their own clause.
- *Deliberately not here:* the prescription-strip copy for either lever. The trace
  and rationale carry both (visible over `explain_prescription`), but the
  deterministic *why* line and the doc-19 facts payload are Phase 6's subject,
  with the rest of the explanation layering and its design pass.

## 2026-08-02 — Session 96: the set-logging queue's echo rule (N73)

Owner reported two regressions from N68's write queue: a ~1s "ping-pong" where a
logged set un-logs and re-logs (and the active set walks backwards with it), and
an edited RIR repeatedly discarded on the last set of an exercise. New item
**N73**, built in PR #220.

- **One root cause, not two.** The queue retired an op's optimistic overlay on
  **dispatch success** and only then called `router.refresh()`. That leaves a
  window one revalidation round-trip wide with the overlay already gone and the
  server render not yet committed — and in that window the row falls back to
  server state that does not contain the set. Box un-ticks, next set un-advances.
  Its intermittency was never mysterious: it depended on whether a racing refresh
  committed inside or outside that window. The discarded RIR is the same window
  with an edit in it — the row became editable mid-flight, then the arriving
  render remounted it (the row key carries `logged.id`) or resynced it through
  `adoptServerRowState("own-logged-set", …)`, which adopted unconditionally
  **and** cleared the row's dirty flag, so the next blur had nothing left to send.
- **The fix is a rule, not a patch: retire on the ECHO, never on the ack.** A
  landed write moves to a new `acked` status and keeps its overlay until a
  rendered server row *contains* it. `reconcile` (fed the day view's rows on
  every render, and free when idle — it returns the same state object) is the
  only thing that drops it. The two kinds are deliberately asymmetric: a log is
  echoed by its **set number existing**, an amend only by the row carrying the
  **amended values**, so a stale pre-amend render is held rather than adopted.
- **Three supporting changes.** `adoptServerRowState` gains a `writeOutstanding`
  veto (the queue is the authority on whether this row still owes a write); one
  coalesced, debounced `router.refresh()` replaces one-per-op; and the provider's
  `apply` stopped mutating a ref inside a `setState` updater.
- **An echo watchdog backstops the rule.** An acked op waits on a *render*, not
  on the queue, so the processor can never free it — if the refresh meant to
  fetch that render never lands (the connection drops in the moment between the
  write landing and the refetch), the row would sit correct-but-uneditable
  indefinitely. That is the same shape of wedge the queue exists to prevent, so
  while anything is acked the runtime keeps re-asking (every 5s, plus each
  `online`/`visibilitychange` wake). Silent on a healthy round-trip.
- **The safety valve is kind-aware, and that asymmetry is the point.** An acked
  *amend* expires after 30s (dropping it just lets the row adopt server truth).
  An acked *log* never expires on a timer — dropping it would retract a true
  statement and un-tick a box the lifter watched fill, which is the regression
  itself. It needs no timer anyway: it is invisible the moment any render carries
  the set number, and `reconcile`/`clearWorkout`/`decodeQueue` all collect it.
- Perceived latency is unchanged (the tap still advances the row in the same
  frame). What the ~250 ms debounce bounds is how long a just-logged row stays
  uneditable — comfortably inside the owner's ≤1s target.

## 2026-08-02 — Session 95: doc 21 Phase 3 built — the MCP write surface (N70)

The lever becomes usable. Phases 2/2b resolved and priced an assignment end to
end, but nothing could write one; Phase 3 is the surface, and per A4 it is the
primary one — the app UI is still Phase 6.

- **N70 → Phase 3 done (PR #219).** Row updated; the item stays live (Phases 4–6
  remain).
- **One defect found and fixed on the way in, worth naming.** `save_meso_plan`
  is a wholesale replace that re-inserts every slot from a **structure-only**
  payload — so a plain day reorder, in the app or over MCP, would have wiped
  every assignment in the meso. Phase 2 shipped the columns without touching
  that path, and nothing caught it because nothing could write an assignment
  yet. `saveMesoPlan` now snapshots and re-keys by day-slot × exercise, the
  identity `slotEffortKey` already resolves against. No migration — the RPC
  payload stays structure-only.
- **Two policy calls the spec left to the build:**
  1. *Refusal on started weeks is week-precise, not day-precise.* The structural
     day lock ("this day already trained this week") is the wrong shape for an
     assignment — assigning week 4 is legitimate on a day whose week-1 session is
     in the books. So a **named** week that is completed / in progress / skipped
     is refused, while a **flat** value is allowed and warns which weeks it can
     no longer change.
  2. *Intent gets warnings, not refusals.* An assignment below the week's ramp
     (harder than programmed) and a flat value reaching the deload week are both
     legitimate uses; they are stated, with the week's own default beside them,
     rather than blocked or applied silently (§4.1).
- **Disclosure is present-only** on both read surfaces, so an unassigned plan —
  every plan today — reads byte-identical to before the lever existed.
  `getCurrentState` takes it as an opt-in because the workout page calls it up to
  three times a render.
- No migration this phase. Suite 1608 green, typecheck + lint clean.

### Next session — suggested starting point
- **doc 21 Phase 4**: the set lever's engine clamp (`set_cap` resolves and is
  written today, but nothing consumes it yet) + the optional `rep_position` knob
  (§4.2). Then Phase 5 (stats policy) and Phase 6 (UI + explanation, which needs
  a hard-rule-8 design pass recorded in `docs/09-design-changelog.md`).

## 2026-08-02 — Session 94: doc 21 Phases 2 + 2b built — exercise-level RIR (N70)

The feature itself, on the premise Phase 1 fixed. Shipped as one PR because
doc 21 §10 requires it: "§4.3's unbounded ceiling must not reach production
without" the measuring band.

- **N70 → `in progress`, Phases 2 + 2b done (PR #218).** Row updated with what
  landed and what is next (Phase 3, MCP). It stays live — four of six phases
  remain.
- **Deliberately still inert.** The plan columns, the resolution, and the engine
  coupling are all active, but **nothing writes an assignment yet** — that is
  Phase 3 (MCP) / Phase 6 (UI). Worth stating plainly so the next session
  doesn't go looking for a surface that was never in scope.
- **Two things the spec didn't anticipate, both recorded in doc 21 §10 as-built:**
  1. *A spread cannot delete a key.* `liveConfig` omits `exerciseRir` when a slot
     is unassigned, so a replayed advance whose assignment had been **cleared**
     would have carried its own stale copy forever — the ramp would never
     reassert. The recompute now drops the key explicitly. This is the kind of
     defect the byte-identity discipline creates: omitting rather than nulling is
     right for the fingerprint and wrong for the spread, and only one of those is
     obvious at the call site.
  2. *`v_exercise_prs` had never been fixed.* It re-computes e1RM in SQL off
     `coalesce(rir_reported, 0)` instead of reading the stamp, so **§2's shared
     resolution — the whole of Phase 1 — had not reached it**, and §6.1's band
     wouldn't have either. Found while wiring 2b, fixed in the same PR. Phase 1's
     write-up lists the view among the consumers of the stamp; it isn't one.
- **Deployed the same session, and the deploy found three drifts.** The owner
  asked for the restamp + migrations to be applied, so they were (run record in
  `docs/deployment/manual-operations.md`). The N71 re-levelling moved 9 087
  stamps, avg +4.80 lb (+4.85 %), strictly upward.
  1. `restamp_e1rm` **has never worked at scale** — a 1 000-id `.in()` filter
     goes in the query string and 414s. Phase 1 shipped it untested against real
     volume; it was also reporting the failure as `"[object Object]"`. Both
     fixed. The prod restamp ran as verified SQL instead (0 mismatches against
     the TS engine over all 2 618 distinct combos).
  2. `20260721000001` had been applied to prod as raw SQL and **never entered
     the migration ledger** — a `db push` would later have re-run it and
     reverted the §2 resolution. Recorded.
  3. `coaching_prompts.body` was **12 000 in the repo and 24 000 in prod** —
     another uncommitted hosted-only migration. Reconstructed.
  The pattern is the point: hosted and `supabase/migrations` drift in BOTH
  directions, and nothing checks. Worth a standing session-start reconcile.
- **The params row nearly shipped on the wrong base.** The band was first
  written as v24 over the v23 file; hosted v24 already exists (`rate_source`
  → "plan") and v25 (active) adds the envelope loop, so activating it would have
  reverted both. Rebuilt as v26 from v25's stored materialization. Standing rule
  now in the runbook: **build a params row from the ACTIVE row, never from the
  newest file in the repo.**
- **Miss-throttle parity turned out to be a test, not a feature.** §5 asks that a
  backed-off session neither earn nor count as a missed earn. It already can't:
  the throttle pairs a `stepped` ask with the next verdict, and a backed-off week
  only ever records `not_earned` — the same reason a deload can't arm it. Pinned
  rather than re-implemented.

## 2026-08-02 — Session 93b: post-merge sweep (N71 archived; a reverted sweep re-applied)

PR #216 merged, so the archival step that a build PR structurally cannot do for
itself (CLAUDE.md rule 2) runs here.

- **N71 → archive.** Terminal: doc 21 Phase 1 shipped and merged. **N38** and
  **N70** deliberately stay live — N38 only lost its capture half (the periodic
  honest-RIR engine check is still deferred), and N70 is one phase into six.
- **A previous sweep had been silently reverted, and is re-applied.** Six rows
  archived on 2026-07-31 (N53, N61, N62, N63, N64, N65) were live in the index
  again. Cause, from `git log`: the sweep deleted them in `ac21ebe`; the merge
  `73e7c2b` ("Merge branch 'main' into claude/coach-override-prescriptions-…")
  restored the deleted lines, because that branch was cut before the sweep and
  the conflict resolution took the pre-sweep side. All five PRs (#187, #203,
  #206, #207, #208) re-confirmed merged; the archived resolutions were unchanged
  and stand, so the rows were simply removed again rather than re-adjudicated.
  N58 and PH30 were never resurrected.
- **Worth carrying forward:** a sweep is only durable once every in-flight branch
  has rebased past it. A sweep landing while long-lived branches are open needs
  re-verifying at the next session start — noted in `archive.md` on the affected
  entry. This is exactly the rot rule 3's reconciliation sweep exists to catch;
  it caught it.

## 2026-08-02 — Session 93: doc 21 Phase 1 built — one RIR premise (N71, N38, N70)

First code on doc 21. Phase 1 of six, and the one that had to go first: it fixes
the premise the whole feature stands on.

- **The defect, restated as built.** Two paths, two assumptions. The anchor
  honored each set's prescribed `target_rir`; the per-set e1RM stamp keyed on
  `logged_sets.rir_reported`, which nothing ever wrote — so `effectiveReps =
  reps + 0` and **every stats surface read every set as taken to failure** while
  the engine's own anchor did not. `assumedRir(reported, prescribed)` in
  `engine/predict.ts` is now the single rule at the stamp site (log *and*
  amend), the anchor, `setComplianceMarker`, the restamp planner, and exercise
  history. N71 closes by construction — there is no longer a second place for
  the two to disagree.
- **Capture shipped, so N38's other half is done.** §9.2 option (a): a third
  set-grid column (`LB · REPS · RIR · LOG`), the same input primitive as the
  other two, pre-filled with the prescribed target RIR. The pre-fill being a
  *no-op* is the design's whole trick — an untouched cell reports exactly what
  the server's fallback would have resolved to, so a new column on the hottest
  path in the app costs nothing and only a *changed* value carries information.
  Pre-filling 0 stayed rejected; that is N11.
- **Two guards pinned, not assumed.** Absence resolves to the ask, never 0; and
  `rir_reported` stays capped 0–10, past which the honest report is "no idea".
  Both have tests, including the deload case where the miss would be worst.
- **The backfill is an operator step, on purpose.** `activate_engine_params`
  only restamps when an `e1rm` *param value* moves — here the **resolution**
  changed while every param held, so a new admin-gated `restamp_e1rm` tool
  drives it. It is **not run against production in the PR**: the pass moves
  every historical e1RM upward once (PRs, `best_e1rm`, key lifts, the strength
  trend), and that should land when the owner chooses, not as a side effect of a
  deploy. Doc 10 gains **§9.1** describing the re-levelling; doc 11's premise
  carries an amendment banner pointing at doc 21 §2.
- **Honesty carried through to the surfaces.** An assumed RIR is a plan fact,
  not an observation, and nothing displays it as one: history reports
  `rir_source` (`reported`/`assumed`/`mixed`) with a `~` on the assumed case
  plus the effective reps behind the estimate, the MCP payload says the same,
  and the day view mutes a set-row RIR that is the prescription rather than a
  report. The `rir` glossary copy changed *meaning*, not wording.
- **Rule 8 honored.** No mockup figure exists for per-set capture — re-verified
  against `App Screens v2` (its set grid is `LB · REPS · LOG` throughout; RIR
  appears only as the week's target in header/prescription copy). House-style
  transcription recorded in the 09 changelog, precedent being the P19/N35 marker
  glyphs.
- **Deferred deliberately:** the measuring band (§6.1) stays Phase 2b. It only
  becomes load-bearing once §4.3's unbounded prescription RIR exists, and
  nothing loggable today reaches it.

Rows moved: **N71 → done (PR #216)**; **N38 → reduced**, capture half done, the
periodic-check half still deferred but now with real reported-RIR data to design
against; **N70 → in progress**, Phase 2 (+ 2b, which must ship with or
immediately after it) next.

Suite green at 1500 (+34); typecheck + lint clean. No migration — every column
this phase writes already existed.

## 2026-07-31 — Session 92d: repricing policy retracted + measuring band added (N70, doc 21 §4.2/§4.3/§6.1)

Owner pushed back on doc 21 §4.2. **Right on both counts**; the section is
rewritten, §4.3 and §6.1 are new, and two of my numbers are corrected in their
favour. Batch 30d verbatim appended. Still no code.

- **Forced centered reps: retracted.** It fired whenever `resolvedRir ≠ weekRir`,
  including on a *decrease* — so an exercise deliberately pushed harder would have
  had its rep schedule reset for no reason. A special case wearing a rule's
  clothes. Gone.
- **The owner's repricing proposal is already the engine's mechanism.** The
  rep-window path prices load *from* reps and RIR
  (`weightForRepsAtRir`, `engine/index.ts:404`) and then re-derives and clamps
  reps to the window (`:492-517`) — it never holds load constant, so the
  "265 lb × 1 rep" failure they wanted to avoid cannot occur. Threading
  `resolvedRir` through those three sites generalises in **both** directions with
  no branch. My "flooring reps prices it heavier" was a comparison between rep
  choices at the same RIR, not a claim that raising RIR raises load — it answered
  a question nobody asked, and it read as nonsense in context. Fairly called.
- **Two numbers corrected in the owner's favour.** The assessment's "−14.6 % at
  RIR 8" was one policy point (centered reps, vs an RIR-1 week), not the lever's
  range: priced against a genuine 0-RIR ask it delivers **−16 % to −22 %**
  depending on rep position. And their worked example — 265 × 9 @ 0 RIR, ask 8
  RIR, "maybe 215 × 8" — prices at **219 × 9** on the real path. Their intuition
  was calibrated; my framing wasn't.
- **Unbounded RIR adopted** (§4.3, DB check 0–8 → 0–30). The arithmetic is sound:
  at the same anchor, −25 % of the ask ≈ RIR 13, half the e1RM ≈ RIR 21, −50 % of
  the ask ≈ RIR 39. One lever really does span deload → rehab → extra effort.
- **What needed the guard was not the pricing but the second job A1 gave that
  number.** `assumedRir = rir_reported ?? target_rir` feeds the e1RM stamp and the
  anchor, so an unbounded prescribed RIR silently asserts an unobserved
  measurement — 3.3 % of e1RM per RIR step under Epley, and past ~37 effective
  reps Brzycki is undefined (the code caps bisection at 35.9). Hence the new
  **measuring band** (§6.1): `max_measuring_rir` (default 8, `.optional()`, so
  nothing that exists today changes), gating on the **assumed-RIR component**
  rather than total effective reps — an honest 15-rep set is 15 reps of
  observation; a 9-rep set at RIR 21 is 9 observed and 21 asserted. Past the band
  a set is priced normally but stamped `e1rm = null` / confidence `'none'`,
  dropped from the anchor and strength views, kept in volume. The anchor freezes
  rather than drifting on fiction — the intended trade, since the coach owns the
  return ramp.
- Phase 2 loses the centering work and gains the widened check; **new Phase 2b**
  ships the measuring band — §4.3's unbounded ceiling must not reach production
  without it. `rep_position` survives as an *optional* Phase-4 knob. §9 grows to
  four confirmations (adds the band default and out-of-band display).

## 2026-07-31 — Session 92c: exercise-level RIR DECIDED → build spec doc 21 (N70, N71, N72, PR #211)

Owner returned notes + decisions A1–A8 on the assessment and asked to finalize
before starting phased implementation in a new session. Settled design promoted
out of `reviews/` into an authoritative numbered spec:
**[`docs/21-exercise-level-rir.md`](../21-exercise-level-rir.md)** (6 phases,
§10), indexed in the root `CLAUDE.md`. Both review docs demoted to rationale
records with "where they conflict, 21 wins" headers. Still no code.

- **A1 widened N71 substantially.** The minimal fix was "fall back to the
  prescribed RIR in the stamp"; the owner wants logged sets to actually
  **capture `rir_reported`**, with stats reading RIR and reporting effective
  reps. That amends the doc-11 premise itself (the prescription becomes a
  *suggestion*; report honest reserve even when it differs) and **absorbs N38**
  (honest-RIR capture, deferred since doc 16 §11). One resolution rule —
  `rir_reported ?? target_rir` — is now shared by the stamp, the anchor and the
  compliance marker, so the two paths converge by construction. Guard pinned in
  the spec: the capture default is the prescribed RIR, **never 0** — that is the
  N11 regression, already covered by `day-rules.test.ts:114`.
- **A2 rejected my floor recommendation; absolute it is.** Recorded with its one
  consequence: an assignment on a deload week wins over `deload.target_rir`
  including downward, so the tool/UI must show the week's default and warn when
  a value lands below it. No silent semantics.
- **Owner note 3 needed two corrections, both now in the spec (§4.2).** First,
  repricing already happens — `weightForRepsAtRir(anchor, reps, rir)` is where
  the −9 % came from, so the policy adds *determinism*, not magnitude. Second,
  "floor reps" would price the backed-off load **heavier**, not lighter (fewer
  effective reps ⇒ lower `k` ⇒ higher weight): at RIR 5 the window floor gives
  0.698 × anchor vs 0.667 centered. The deload's actual mechanic is
  window-**centered** reps (`engine/index.ts:190-196`), which is both lighter and
  parity with the owner's own "this is a deload at exercise level" framing. Table
  at RIR 1/3/4/5/6/8 × floor/centered/top is in the spec.
- **RIR ceiling stays 8**, answered with numbers: even RIR 8 is only −14.6 %
  load vs a normal RIR-1 week, and "9 reps with 12 in reserve" is not a
  meaningful instruction. Past ~15 % the lever is sets or substitution.
- **A5 adopted narrowed, flagged for confirmation (doc 21 §9.1).** Excluding by
  *measured confidence* would silently drop legitimate work (confidence also
  degrades with effective reps, so an honest 15-rep set at RIR 1 is already
  `low`, and A1's honest reporting pushes more real sets there). The spec
  excludes on prescription **intent** (`resolvedRir > weekRir`) — deterministic
  and plan-level, exactly like the existing `is_deload` filter — and excludes
  from **strength** surfaces while **keeping** the sets in **volume** surfaces
  with a disclosure flag, since a backed-off set still consumes recovery budget
  and dropping it would read as under-MEV during a block the athlete is
  complying with.
- **A8 closed the override review.** Its surviving open thread — bounded
  substitution and the `LOOKBACK_WEEKS = 2` return cliff — spun out as **N72**
  (`F`, MED) so closing the doc loses nothing; §4.4 there is still its only
  written record. The doc's other findings are pointed at their new homes in
  doc 21 §5/§8.
- **Dedup (protocol step 3).** A1 collides with two live rows, both folded
  rather than left to duplicate the work: **T-N60a** (effort-reporting adoption
  — "the schema exists but no UX invites it") is **superseded → doc 21 Phase 1**,
  which now owns the interaction design; and **N38** is **halved** — its capture
  affordance + doc-11 premise amendment move to Phase 1, leaving only the
  periodic honest-RIR engine rule deferred. A side effect worth noting: doc 19
  §4.3's effort-honesty gate has been suppressing effort claims across the
  deterministic why and the facts `effort_status` precisely because effort was
  inferred, never observed — Phase 1 unblocks that too.
- N70 → `ready`, N71 → `ready` (doc 21 Phase 1), N72 → `triaged`, Batch 30c
  verbatim appended. Owner starts Phase 1 in a new session.

## 2026-07-31 — Session 92b: exercise-level RIR — assessment; override direction parked (N70 d2, N71, PR #211)

Owner read the override review, judged it "messy and a large paradigm shift",
and proposed an alternative: **exercise-level RIR assignment** (per exercise and
per week), managing effort through the RIR framework the app already has. Asked
for an assessment doc and for the previous review to be marked obsolete. No code.

- **N70 rewritten** around the problem (temporary per-exercise effort/load
  management) with two directions: direction 1 (overrides) **PARKED**, direction
  2 (exercise RIR) **LIVE**. Assessment:
  [`docs/reviews/2026-07-31-exercise-level-rir.md`](../reviews/2026-07-31-exercise-level-rir.md).
  The override review got a parked banner naming what survives (its §2 engine
  couplings, §4.4 substitution cliff, §5/§6) rather than being deleted. Both
  review docs re-dated 2026-07-31 (the first was mis-dated 2026-07-26).
- **The direction is right and cheaper than direction 1** — and more of it is
  already built than the owner realised: `workout_exercises.target_rir` is
  **already a per-slot column** and `queries/anchors.ts` already uses it as each
  set's assumed RIR; `meso_exercises` is the slot-grain plan row;
  `mesocycles.rir_schedule` (N18-B) is the per-week authoring precedent;
  `edit_mesocycle` is the MCP seam; doc 14 §7 makes invalidation mechanical.
  Crucially the whole clock problem disappears (§4.1 of direction 1) because a
  per-week RIR value is content, not a window.
- **New item N71 (`B`, HIGH, workstream A) — the blocking finding.** The app has
  **two RIR assumptions**: the anchor uses the prescribed `target_rir`, but the
  stored per-set stamp uses `rir_reported`, which is **never written**
  (`DayView.tsx:1698`), so every stats surface treats every set as taken to
  failure. That means exercise-level RIR would fix the engine's view and leave
  the history chart, PRs and strength trend still reading lighter work as
  decline — the proposal's headline benefit. It is also the general form of the
  384-vs-367.5 divergence from the 2026-07-04 review §8.2. Fix is small
  (`rir_reported ?? target_rir` + the existing restamp hook) but re-levels every
  historical e1RM upward, so it wants its own PR.
- **Two honest limits recorded:** RIR is a ~2 %/step lever — RIR 1→5 at 9 reps
  is only **−9.1 %** load (computed against the live v23 params), so it is an
  excellent fatigue lever and a weak absolute-load one; the app's own deload
  pairs RIR 6 with a 50 % set cut, which is why the assessment recommends a
  per-exercise **set floor** alongside. And RIR cannot say "stop deadlifts", so
  bounded substitution stays open.
- Recommended shape: **floor semantics** (`max(weekRir, floor)` — reduce-only,
  ramp keeps working, deload wins), a `reason` column, an earn-gate predicate,
  and a build sequence starting with N71. Eight owner decisions in §9.

## 2026-07-31 — Session 92: coach-authored prescription overrides — review (N70, PR #211)

Owner proposed an MCP path letting the LLM coach override or author
prescriptions (exercise / day / week: exercise, weight, reps, sets + reason,
duration, return criteria), prompted by a live lumbar-nerve episode where a
coach-agreed rehab plan had nowhere to live. Asked for questions and concerns in
a review doc before implementing. No code.

- **New item N70** (`F`, HIGH, workstream P, `needs-input`); Batch 30 verbatim
  appended. Review:
  [`docs/reviews/2026-07-31-coach-override-prescriptions.md`](../reviews/2026-07-31-coach-override-prescriptions.md).
- **The load-bearing correction (§2):** the owner's premise that overrides can
  stay *separate* from the engine isn't available. The engine anchors on what
  was **performed**, not on what was prescribed, so five couplings carry rehab
  work into engine state regardless of where an override is stored — the
  `session_best` anchor argmax (crossover at `30·log₂(1/r)` days: a 1-week −20 %
  block is *invisible*, a 2-week+ block ratchets the anchor down), `baseWeight =
  perf.bestWeight` (`engine/index.ts:332`), the pain/dampener clamp pinning next
  week to the rehab load (`:434/:498/:513` — and rehab weeks are exactly when
  pain gets reported), `climb_on_performed_reps` restarting the climb off
  performed reps (`:386`), and the earn gate + miss throttle both tripping while
  labelling perfect compliance a miss. Recommendation (§13 Q4): override
  sessions neither earn nor count as missed (the deload treatment), anchor left
  untouched, and the **coach prescribes the return ramp** — which is the asked-for
  capability anyway.
- **Architecture (§3):** a display-only override layer is rejected — every
  volume view sums `workout_exercises.prescribed_sets` directly, so the plan
  would desync from what the athlete is told to do (the N33 lesson). Recommended:
  a **time-boxed constraint override** resolved into config inputs / effective
  params (doc 14 §7 contract ⇒ fingerprint invalidation for free, engine stays
  the only author of numbers), plus a labeled absolute pin for substitution.
  `engine_decisions` already holds the counterfactual, so no "before" column.
- **Traps found (§4):** `mesoStaleSignature` has **no clock**, so an override
  that expires by date alone would never bust the reconcile's cheap gate and
  would apply forever (`queries/regeneration.ts:600-632/:778`); and
  `LOOKBACK_WEEKS = 2` means a 3-week rehab substitution brings the original
  exercise back **priced off its pre-injury peak** — the worst direction after an
  injury.
- Also flagged: there is no separate coach principal (MCP-only is friction, not
  security ⇒ an in-app view/clear escape hatch is mandatory), the pain-gate
  double-cut, the hard-rule-8 design pass (no mockup figure; doc-16 Phase-3
  marker precedent), and the stats-comparability disclosure. Eight owner
  decisions in review §13; N39 (per-exercise progression-off override) is a
  subset of this item.
## 2026-07-31 — Session 93: MEASURE review round 1 — capture, the Health bus, three-source synthesis (N66, PR #214)

Owner reviewed doc 20 and returned five items plus one confirmation. Doc 20
revised in PR #214 (#210 had already merged, so this landed as a fresh change
on top of `main` rather than stacking on it); still direction, still no code.

- **Topology confirmed.** Shared auth, one deployable, not separate now — but
  separable later "without an unreasonable amount of work". Turned that from an
  intention into **§3.4: six checkable rules** (eslint import boundary, no
  cross-shell React context, `queries/measure/*` as the only DB path, a single
  `src/lib/seam/` module, token-auth capture endpoints from day one, no
  internal-path deep links) **plus a costed split**: move three directories,
  publish the seam as HTTP, set the Supabase cookie domain, pick an MCP host.
  Days, not weeks — and no data migration, because the DB never forked.
- **Principle 7, transparency** (owner's words): no composites, every number
  carries method/window/n and drills to its measurements, assumptions named
  inline, assumption-backed outputs are ranges not points. This is the
  constraint that produced the §5 shape.
- **§4 capture is new and is a real requirement, not polish.** Weighing is the
  highest-frequency action in the suite, so it gets a latency budget (intent →
  logged under 5s, no cold launch) and three paths. Needs the first non-MCP API
  surface: `measure_api_tokens` (hashed, prefix-listed, revocable) behind
  `POST /api/measure/weight`. **The existing `unique (user_id, measured_on,
  source)` turns out to make capture idempotent by construction** — a
  double-run replaces rather than duplicates, and a Health↔MEASURE automation
  loop *converges instead of compounding*. A constraint written for a different
  reason is what makes the whole design safe.
- **§4.5 is the finding of the session: Apple Health is the integration bus.**
  Happy Scale already reads *and writes* Body Mass to Health, as do Withings
  and Renpho. So one Shortcut recipe pair gives bidirectional Happy Scale
  coexistence **and** smart-scale support with no vendor API, no OAuth client,
  no partner agreement — and it answers owner items 2 and 3 together. Verified
  the mechanics: *Get Contents of URL* does POST with a JSON body and custom
  headers, *Log Health Sample* writes Body Mass. Two device-check caveats
  recorded (no variable in the Type field; automation confirmation prompts vary
  by iOS version). **Dropbox declined as a sync path** — parsing another app's
  backup format to produce body-weight numbers fails principle 7 and breaks
  silently; kept only as a possible future *transport* in §8, never a format.
  Also recorded flatly: a PWA cannot touch HealthKit on any browser, so
  Shortcuts is the only bridge and the design should stop looking for a better
  one.
- **§5 answers the owner's hard question.** They combine, but **not by
  averaging**. The instrument table makes the asymmetry explicit — weight is a
  *precise instrument on a contaminated quantity*, tape an *imprecise
  instrument on a decent proxy*, DEXA a *good instrument at too slow a
  cadence* — so any weighted blend would have fictional weights. Instead:
  **three tiers** (measured → corroborated → projected) with **Tier 3
  structurally sealed from both the seam and the engine**, and an **8-row
  corroboration matrix** over mass × waist where "flat" means *inside that
  instrument's noise band*, with window minimums in code (`confidence.ts`) and
  DEXA overriding when scans bracket. Also fixed: **waist is a fat proxy, limb
  girth is a mixed proxy** — never read the same way.
- **Seam narrowed to four items** through `src/lib/seam/` (§5.6): mass rate in
  lb/wk **and %/mo** (the pacer's own unit, so no conversion sits between the
  apps), trend-bracketed Δbw over the macro span, composition delta when
  same-scanner scans bracket, and the one-sentence corroboration line. Tape,
  Tier 3, and raw series do **not** cross. **Worth flagging as a concrete
  improvement:** the retrospective's Δbw today brackets *raw* points and so
  inherits ±2–4 lb of daily noise at both endpoints — §5.6-2 upgrades it to
  trend values.
- **§9 Happy Scale parity table**, verified against their published feature
  set: take the trend line, tunable smoothing, self-correcting rate,
  projections (banded), plateau detection, range views, Health import/export;
  **adapt** milestones (keep the chunking mechanic, drop the celebration —
  ledger voice); **decline** Dropbox sync and streaks/badges (hard rule 7).
- Phasing re-cut to 10 phases with capture pulled early (2 → 3 → 4 is the
  capture spine). §17 now separates three settled decisions from nine open ones.

### Next session — suggested starting point
Get the §17 answers. Four are quick and unblock Phase 0 design work (waist
site, tape routine, milestones, Tier 3 default); the rest can ride along. A
**Happy Scale CSV export sample** is a concrete artifact needed to pin that
adapter (§8). Then Phase 0's mockup pass — still gates everything.

## 2026-07-31 — Session 92: increment indexing, set-logging queue, slider drag (N67/N68/N69, PR #215)

Owner handed over three field notes and asked for them built in the same pass.
All three shipped; the middle one turned out to be structural and cost a hard
rule.

- **Reconciliation sweep first** (resume protocol step 3): PRs #187, #195, #203,
  #206, #207, #208 all confirmed merged, so **N53, N58, N61–N65 and PH30** moved
  to `archive.md`. Rows with a real residual stayed live on purpose — N34, N43,
  N47, N56, N57, N59, N60.
- **N67 — the increment must index off what the lifter entered.** The override
  already set `params.rounding[equipment]`, but `roundToStep` snapped to
  ABSOLUTE multiples of it, so an 88 lb machine load with a 10 lb step became 90,
  not 98. The fix gives the lattice a **phase**: `roundToStep(w, eq, params,
  origin)` snaps to `origin ± k × step`, and `latticeOrigin` resolves the origin
  from inputs the engine already had (last logged working set → seed earn context
  → `previous` → `weekPeak` → plan `initial`). Two existing tests changed their
  expected numbers, which is the clearest evidence the behavior moved — a manual
  325 seed is now the lifter's own 315, and a 3 lb custom step holds 184 instead
  of snapping to 183.
- **The design call worth remembering on N67:** it is gated by a new OPTIONAL
  `rounding_origin` param that `resolveEffectiveParams` sets per-exercise, not by
  a params version bump. That keeps it live immediately (no activation runbook),
  keeps every stored `engine_params` row a complete materialization
  (`is_replayable` / `params_hash` untouched), and — because the origin rides
  already-denylisted derived inputs — adds no freshness dependency. A global
  switch is still available by activating a version that sets the key itself.
- **N68 — the hang-up was not flakiness, it was where the state lived.** The box
  acknowledged on the server action's response (N12) but `nextSetNumber` was
  derived from server rows ALONE, so a stalled RSC revalidation left the row
  checked and the next row `future`: logged, un-advanceable, and only recoverable
  by relaunching. Taking the write off the interaction path is the fix; surviving
  a dropped connection is the by-product the owner also asked for. Pure model in
  `lib/logging/queue.ts`, runtime in `components/logging/SetLogQueueProvider.tsx`,
  mounted in the `(app)` layout so it drains across navigation and relaunches.
- **N68 reverses hard rule 9 for writes** ("no offline sync"). Recorded in
  `CLAUDE.md`, `01 §F3`, `02 §A5` (rewritten), and `07`. Reads stay online-only —
  R7's decision not to runtime-cache documents/RSC is still right, and the honest
  limit is stated: a **cold start with no connection still can't render the day
  view**. Filed as **T-N68a**, needs an owner call.
- **Two constraints shaped the queue's shape.** (1) Only idempotent ops may be
  queued, because retry is blind — `logSet` upserts on
  `(workout_exercise_id, set_number)` (R3), `amendSet` addresses one set id, the
  planned-weight write overwrites; **unlog and delete stay foreground** and a
  queued row's delete menu says "Still saving…". (2) `COMPLETE WORKOUT` still
  gates on SERVER truth, because completion locks the session and would refuse
  its own outstanding writes — a fully-logged day mid-drain shows
  `SAVING THE LAST SETS…`.
- **The queue is deliberately zod-free** (hand-written guards on the storage
  boundary) — it rides the `(app)` layout's client chunk, and WS-J keeps zod and
  the engine barrel out of the day view's bundle. With zod the day view went
  134 → 150 kB first load; without it, 137 kB.
- **N69 — sliders drag from the thumb only.** `SnapSlider` had the pointer
  handlers and `touch-none` on the whole 44px track, so on a scrolling feedback
  sheet a scroll attempt both moved the value and ate the gesture. Pointer
  capture now lives on a transparent 44px wrapper around the accent block; the
  track ignores pointers and scrolls.

### Next session — suggested starting point
Sweep this PR's rows once #215 merges. Then the **T-N68a** owner call (offline
reads — cache the active day with a staleness marker, or accept the limit), and
confirm N67 on device against the machine lift that prompted it. N66's doc-20
§13 decisions are still the biggest unblocked lever.

## 2026-07-25 — Session 91: MEASURE companion app — direction doc (N66, PR #210)

Owner opened a new concept: a companion app, **MEASURE**, for everything
body-measurement — bodyweight tracking with smoothing/rolling windows and
periodic reports, circumferences, DEXA, import/export, and an integrated
summary — sharing WORKOUT's DB, design system, and MCP connector, with its own
front end and a cross-linked seam. Asked for the potential, the opportunities,
and the best architecture, documented as the concept comes into focus. No code.

- **New item N66** (`F`, `needs-input`) + **new workstream Q**; Batch 27
  verbatim appended. Direction written to
  [`docs/20-measure-companion-app.md`](../20-measure-companion-app.md) and
  indexed in the root `CLAUDE.md`.
- **Roughly half the substrate already exists** — the read was the useful part:
  `bodyweight_log` (doc 17 §5 / N41), `body_scans` + `external_connections` +
  `oauth_transactions` + `v_body_comp_history` (doc 15 / N34), and the pure
  folds in `queries/bodyweight.ts`. The concept is much less "new app" than it
  looks; it is mostly a front end and an IA for a lobe that already shipped
  under `/more`.
- **The topology call (§3) is the doc's load-bearing decision.** Recommended a
  `(measure)` route group **inside this deployable** with its own layout, tab
  bar, and web manifest: two installable home-screen PWAs on one origin, so
  they share the Supabase session cookie (sign in once) and every cross-link is
  a plain `<Link>` — and `src/lib` is shared with zero refactor. Cost stated
  plainly: one deploy, one CI, no independent releases. The monorepo (two Vercel
  projects) is recorded as the end state with explicit tripwires, and an eslint
  import boundary between the two route groups keeps the promotion mechanical.
  A separate repo is rejected outright — it would fork the migrations, types,
  query layer, and design system against principle 5 and the shared-views rule.
- **Two principles worth carrying beyond this doc.** (1) *Smoothing is
  read-time, never stored* — no `smoothed_weight` column, so changing a window
  is instant and doc 14's invalidation problem is avoided by construction
  rather than solved. (2) The pure `src/lib/measure/` module emits rate as
  **%/month**, the pacer's own unit (doc 17 §2.4), so measured bodyweight rate
  compares to a macro contract band with no conversion and no second definition.
- **Boundary restated as binding:** doc 15 §3.3 — measurement informs targets
  and verdicts, never prescriptions. MEASURE must not become a back door into
  the engine; the consented profile proposal stays the only engine-facing path,
  and `bodyweight` stays on the doc-14 fingerprint denylist.
- **Import flagged as the sleeper feature** (§4.6): existing scale history is
  what makes every trend and verdict useful on day one instead of after six
  months of empty charts.
- **Phase 0 is a mockup pass and it gates everything** (hard rule 8) —
  `measure - App Screens.dc.html` with an M-series figure index, so it can't
  collide with WORKOUT's 1.x–4.x.

### Next session — suggested starting point
Get the **§13 answers** from the owner (install model · does BodySpec relocate ·
Navy-method bf% · progress photos · where a weight goal lives · import formats ·
smoothing defaults · MCP write posture). Decisions 1 and 5 are the two that
change the shape of the work; the rest can be settled during Phase 0. Then the
mockup pass — nothing else is buildable before it.

## 2026-07-25 — Session 90: mesocycle editing + sharing bugs (N64/N65, PR #208)

Owner handed over two field-reported defects: the day view and cycles view can
show a day's exercises in different orders, and a shared meso doesn't carry the
edits made before sharing. Both filed as new items (Batch 26 verbatim source
added) and fixed in the same PR.

- **New items N64 (order) + N65 (share snapshot)**, both `B`/HIGH. They share a
  root: the planner board is the meso's structural record and every copy/share
  reads it, but half the edit surfaces never wrote to it.
- **N64 — both directions were broken, not one.** Plan → session:
  `regenerateOpenWorkouts` merges structurally (surviving rows keep their
  position, new ones append), so a planner-board reorder or an MCP
  `reorder_day`/`swap_exercise` never reached an already-generated week. Session
  → plan: the day view's move-up/down wrote the session and its later-week
  siblings only. New leaf `queries/plan-order.ts` is now the one definition and
  runs both ways. A day-view replace/add writes to the plan only when *"repeat
  this change on this day in future weeks"* is ticked — reusing the intent
  signal the UI already collects rather than inventing a new rule; a removal, or
  an unticked replace/add, stays session-local by design.
- **A third order bug fell out of the same read.** `planMesoCopy` renumbered
  copied fills group-by-group, so duplicating a meso with an interleaved day
  reset it to group-clustered order. Fills now carry the source's flat
  `day_position`.
- **N65 — the share code recorded nothing.** Redemption read the owner's live
  board, so the grantee got whatever it held when they typed the code. Now
  `shares.payload` (migration `20260725000001`) snapshots the structure at mint
  time and refreshes on re-mint, and redemption copies that (live read kept as
  the fallback for old codes). The copy had also been dropping `rir_schedule`.
  R1's ownership assertion is deliberately left on the **live** rows, so the
  snapshot can't widen what a copy may touch.
- **Verified, not assumed:** day *reordering* (`meso_days.weekday`) was already
  copied correctly — worth stating because it is what the owner's note named
  first; the actual losses were the day-view exercise edits and the live-read
  redemption.
- Tests +43 (1434 green), lint + typecheck clean. **Hosted migration applied**
  same session, owner-directed (`share_snapshot`, verified via `list_migrations`
  + `get_advisors` — additive column, nothing new flagged).
- **Not done this session:** the reconciliation sweep of already-merged `done`
  rows (N56–N63 etc.) — left for a housekeeping pass so this PR stays a bug fix.

## 2026-07-24 — Session 89: deterministic explanation language + the three-layer strip (N63, PR #207)

Owner: rework the deterministic explanation language to match the coaching
layer's character, and make the whole prescription note — statement, why, and
coach line — read as one well-formatted thing. The ask line was called out as
already good and is untouched. Recorded as doc 19 §13 + the doc 09 2026-07-24
design entry.

- **New item N63** filed (Batch 25 verbatim source added). Follow-on to N60–N62.
- **A written copy system, not a wording tweak.** Seven rules at the head of
  `prescription-narrative.ts`, taken from the same review tone table the
  coaching prompt is held to: program-as-actor, second person only for what the
  lifter did or reported, cause-then-consequence in one sentence, the lifter's
  own rating words (workload *past just right*, pump, joint pain, fatigue,
  performance), one parallel construction across every held-weight cause, plain
  "no conclusion warranted" for thin data, no hype. Every composed line was
  rewritten to it, and a new test block sweeps EVERY line the module can emit
  for banned engine vocabulary, praise/hype, and sentence shape — so the system
  is enforced, not just documented.
- **Two accuracy bugs the copy pass surfaced.** (1) `paced` is four governors
  (rate_pacer / cadence / miss_throttle / peak_week, doc 16 §3.5) and BOTH
  layers narrated all four as the rate pacer's — a lifter whose lift was held
  by the once-per-week cadence was told their gains were ahead of plan. Each
  governor now has its own sentence and its own facts `load_reason`
  (`pace_status` was already correct — it always required `rate_pacer`).
  (2) The ramp clarifier "a step up even where the numbers match" rendered on
  weeks where the numbers had plainly changed; it is now gated to the case it
  exists for.
- **Program intent, the review's second-ranked content.** A closing frame line
  on peak / first / last weeks, built from the same templates
  `projectProgramContext` gives the model, rendered last and only when the week
  has ≤2 things to say already (so the §4.4 line cap holds).
- **Effort honesty went live.** §4.3's `effortStatus` input existed but nothing
  supplied it, so the day view always fell through to "inferred".
  `PrescriptionAudit.effortObserved` now reads the decision's
  `inputs.actualSets` through a pure, client-safe `readEffortObserved`.
- **The strip is now a three-layer ledger** (doc 09 entry): ask visually
  primary, why lines with air between causes, and the doc-19 §3 **COACH line
  rendered** under a hairline + tracked-caps label — the §8 design decision the
  spec asked for, closing the strip half of §11 phase 4. Loading/retry copy no
  longer says "the engine's decision".
- Full suite green (1406 tests), typecheck + lint clean. No migration,
  no engine change, no number moved.

### Next session — suggested starting point
- The rest of doc 19 phase 4: MCP `explain_prescription.facts`, the note-write
  regeneration hooks, then a month of trigger/abstention/token measurement.
- Owner residual from N62 still open: the ACTIVE prod prompt is DB v4, authored
  before the source_session/macro payload — revise it via propose →
  `generate_explanations preview=true` → activate.

## 2026-07-24 — Session 88: LLM payload tense + macro goal + prompt preview (N62, PR #206)

Owner handed over three updates to the doc-19 explanation stack and the MCP
layers around it. All three built; recorded as the doc 19 §12 amendment.

- **New item N62** filed (Batch 24 verbatim source added). Follow-on to N60/N61.
- **§12.1 the payload has a tense.** `week` stayed (the UPCOMING prescription);
  the session that produced `previous_work` now has its own
  `source_session {week_n, target_rir, deload}`, resolved from
  `source_workout_exercise_id` → workout → microcycle, with the target RIR off
  the recorded `previous` tuple so a missing hop degrades instead of lying.
  `note.source` is now `pinned | source_session | recent_session`, and a
  source-session note repeats the block under `note.session` — a 1 RIR note can
  no longer be read as if it happened in the 0 RIR peak week. Prompt gained a
  timing paragraph; the pain few-shot is rebuilt on exactly that case.
- **Free rider, same source:** `effort_status` now derives from the recorded
  decision's `actualSets[].rirReported` (doc 19 §4.3's observed/inferred gate,
  previously hardcoded `unknown`).
- **§12.2 macro goal.** `macro {goal, block {n,of}, phase, target, goal_notes}`
  when the meso has a macrocycle — qualitative by construction: the target is
  ONE formatted estimate sentence off the cached `target_*` snapshot, there is
  no rate and no macro status verdict, `pace_status` stays the only pacing
  verdict. `goal_notes` is a bounded (140-char) exception to "the note is the
  only free text"; the prompt forbids coaching it as an event. Best-effort
  assembly — a standalone meso or any failure omits the block.
- **§12.3 preview without activating.** `test_llm_explanation` and
  `generate_explanations` take `prompt_version` (any stored version, draft
  included) or `prompt_body` (an unsaved edit); `generate_explanations
  preview=true` runs real calls across a real scope and writes NOTHING
  (disposition `previewed`) while the live prompt keeps serving. Ad-hoc bodies
  name no version, so they can never be stored. `get_coaching_prompt` now
  returns a `payload_contract` block (facts fields + output schema + the
  post-check rules that hold regardless of prompt text).
- **Prompt version:** code fallback bumped to **5** — prod already runs an
  editable DB prompt at v4, so the constant sits above it and a stored row's
  `prompt_version` still names exactly one prompt text.
- **Owner residual:** the ACTIVE prod prompt (DB v4) predates this payload and
  describes neither new field. It keeps working; revise it through
  propose → `generate_explanations preview=true` → activate.
- Full unit suite green (1387), typecheck + lint clean.

## 2026-07-24 — Session 87: editable LLM coaching prompt via MCP (N61, PR #203)

Owner asked whether we could build MCP tools to edit/update the LLM
decision-explanation system prompt. Built it — the doc-19 coaching prompt is
now editable, versioned admin config, mirroring the `engine_params` tuning loop.

- **New item N61** filed (Batch 23 verbatim source added). Follow-on to N60.
- **Storage:** migration `20260724000001` — `coaching_prompts` (append-only
  versions, single active row, admin-only RLS SELECT + writes, atomic
  `activate_coaching_prompt` RPC). Ships EMPTY: the code constant
  `COACHING_SYSTEM_PROMPT` (version 3) stays the permanent fallback. +RLS tests
  (admin propose/read/activate, non-admin denied read+write+RPC, length
  backstop). DB types updated. **Migration not yet applied to hosted prod** —
  owner-gated step, like N58/N60.
- **Query layer:** `src/lib/queries/coaching-prompts.ts` — get active / list /
  get version / propose (version floored at 4 so DB prompts always clear the
  serving cut) / activate / deletion-impact + discard. Unit-tested.
- **Generation:** `explanations.ts` resolves the ACTIVE DB prompt once per burst
  (byte-stable, prompt-cache friendly) and falls back to the constant on empty
  table / read error — the editor can never take the pipeline down. Both the
  write-site path and the probe stamp `prompt_version` from the resolved prompt.
- **MCP tools (admin-gated):** `get_coaching_prompt` (browse + effective active,
  `include_body` to copy for editing), `propose_coaching_prompt`,
  `activate_coaching_prompt` (confirm-echo; no auto-regenerate — separate step),
  `discard_coaching_prompt` (guards active + referenced). `get_llm_explanation_status`
  now reports the effective prompt source (db | code_fallback) + version.
- **Serving cut** is now the named const `COACHING_SERVED_MIN_PROMPT_VERSION`
  (was a literal `3` in `read.ts` + `audit.ts`). Deterministic post-check still
  guards every generation regardless of prompt text.
- Doc 18 §10 addendum documents the editor. Typecheck + lint clean; full unit
  suite green (1364).

## 2026-07-23 — Session 86: prescription explanation v3, phase 3 built (N60, PR #202)

Built doc 19 phase 3 on a fresh branch (PR #201 having merged) — the LLM
re-enters the pipeline, fenced by the phase-2 facts + triggers. Ships in shadow.

- **Storage:** migration `20260723000001` adds `triggers text[]` to
  `decision_explanations` (nullable/additive); **applied + verified on hosted
  prod via MCP**. RLS unchanged; round-trip test added. DB types updated.
- **Generation contract:** new pure `src/lib/llm/coaching.ts` — prompt v3
  (analyst voice, tone prohibitions verbatim, effort-honesty rule, few-shots on
  facts payloads incl. abstention + low-confidence), structured JSON output
  `{coaching_context, note_class, abstain}`, extended post-check (abstention =
  no row; ≤360; facts number-set; note-only + non-actionable class ⇒ discard).
- **Generation path:** `generateOne` now skips the API call when no trigger
  fires (the silent majority), feeds the facts payload, parses, post-checks,
  stores body + triggers + `prompt_version 3`; outcomes carry a `disposition`.
  Admin tools surface the disposition breakdown + v3 prompt_version; the probe
  runs the same v3 path.
- **Owner next step (gate before phase 4):** voice-read a regenerated v3 batch
  via `generate_explanations overwrite:true` (shadow) or `test_llm_explanation`
  on single decisions. Full suite green (1353), typecheck + lint clean.

## 2026-07-23 — Session 85: prescription explanation v3, phases 1–2 built (N60, PR #201)

Built the first two of doc 19's five phases — the pure, no-model-risk half that
improves the product on its own. The LLM re-enters only at phase 3, so nothing
here changes a live model surface.

- **Phase 1 — seam inversion + Layer-2 hardening.** `substituteExplanation`
  retired for `appendCoaching`: the deterministic ask + why now ALWAYS render
  and a stored LLM line is appended beneath as an additive `coach` field
  (out-of-band + unpriced guards carry over). Serving cut: stored rows served
  only at `prompt_version ≥ 3` in `getPrescriptionAudit` + MCP
  `explain_prescription` — nothing serves today (no v3 rows), the safe floor.
  `prescription-narrative.ts` copy pass per §4: paced=held-back framing,
  program-language throughout (no "engine" outside the audit), an `effortStatus`
  input gating the grade line's effort claim (inferred ≠ observed), and ≤3-line
  suppression tests. **Strip COACH-line visual deferred to phase 4** (needs a
  09 design decision; nothing serves until then).
- **Phase 2 — facts + triggers, pure.** New `src/lib/llm/explanation-facts.ts`
  (the §5 one-verdict-per-axis worldview; §5.1 gates as code — the Bench Press
  low-confidence case projects `insufficient_data`, never `plateau`) and
  `src/lib/llm/coaching-triggers.ts` (§6.1 gates; empty ⇒ no API call). Dry-run
  wired into `test_llm_explanation` (returns facts + triggers) and
  `generate_explanations` (`dry_run=true` would-trigger report) for calibration
  before the gate flips on. Golden tests anchor both review scenarios.
- **§10 spun-off candidates filed** as T-N60a–f (effort-reporting adoption,
  structured pain follow-up, note classification at entry, equipment/setup
  identity, deviation reasons, review-synthesis surfaces) for owner
  prioritization — not phases of this build.
- **Remaining (owner-gated):** phase 3 (prompt v3 + `triggers` migration +
  structured output; owner voice-reads a batch first), phase 4 (strip coach
  line + MCP `facts` + note-write regen), phase 5 (§8 deferred surfaces).
- Full suite green (1340), typecheck + lint clean. Implementation record in
  `docs/PROGRESS.md` (2026-07-23 entry).

## 2026-07-23 — Session 84: Batch 22 intake — prescription explanation v3 spec (N60)

Owner handed over a full review document of the live v2 explanation output
("LLM_Coaching_Assessment_Reviewed.md") plus the directive to assess it,
connect the dots against the codebase, and write the v3 spec + implementation
plan — with license to amend nuances the owner doesn't fully endorse.

- **Captured.** Review doc preserved verbatim →
  [`docs/reviews/2026-07-23-llm-coaching-assessment-owner.md`](../reviews/2026-07-23-llm-coaching-assessment-owner.md)
  (provenance header added); chat directive in the backlog appendix (Batch 22).
- **Assessed against the code.** All five diagnosed failure modes traced to
  real design facts, not prompt bugs: `projectTrace` sends the raw trace
  verbatim; the payload carries the two-rate prescribed/measured pair the
  model then mis-reconciles; the RIR premise (assumed = target) is invisible
  to the model; raw notes + a "coach" instruction manufacture relevance;
  `substituteExplanation` replaces the deterministic why wholesale and every
  decision generates.
- **Spec written** → [`docs/19-prescription-explanation-v3.md`](../19-prescription-explanation-v3.md)
  (authoritative over doc 18 for content architecture/voice/payload/triggers/
  seam; doc 18 keeps infra). Five recorded amendments to the owner doc (19 §2):
  LLM `why` field dropped entirely (deterministic composer is the sole why
  author); note classification inside the one generation call; decision-id
  keying kept (+ note-write regeneration hooks instead of a context
  fingerprint); analyst voice as a refinement of the §10 register; the
  data-collection phase severed into separate backlog candidates (19 §10 —
  to be filed as items when the owner prioritizes; note: per-set
  `rir_reported` already exists, the gap is UX adoption).
- **New item N60** (F/HIGH/H, ready): build = 19 §11, five sequenced PRs;
  phases 1–2 are LLM-free and independently valuable.

## 2026-07-21 — Session 83: N59 — catch-up restamp of stored e1RM past v11 (PR #198)

Owner (Batch 21): stored `logged_sets.e1rm` never restamped after v11 introduced
`brzycki_max_eff_reps: 10`; back-fill all users, and a diff of the effect on
strength metrics if feasible.

- **Root cause confirmed.** T-N33's `e1rmBlockChanged` (queries/e1rm-restamp.ts)
  compares the incoming activation's `e1rm` block to the **outgoing** one, not to
  the stored stamp. The block changed once (v10→v11); v11 shipped inactive and
  the restamp hook didn't exist yet, so by the time it landed the block was
  byte-identical on every activation v11→v25 (verified in prod) — the hook never
  re-fired. Pre-v11 averaged-Epley+Brzycki stamps persisted, inflating e1RM on
  effective-reps > 10 sets.
- **Faithful recompute.** Reproduced the engine's `estimateE1rm` for the active
  params (rir_offset 1, brzycki cutoff 10) in SQL. Ran it in **double precision**
  (float64) with `Math.round` as `floor(x*10+0.5)/10` — numeric/exact rounding
  disagreed with the engine on 10 half-way ties (e.g. 22.5×13 eff = 32.25 →
  engine 32.3). Validated the SQL output against the **real TS engine** across all
  **1153** distinct (weight, effReps) combos: **0 mismatches** (golden 245×15→367.5,
  245×8@2→326.7 pass).
- **Applied to prod (MCP).** Rollback snapshot of all 11,149 prior stamps →
  `ops.e1rm_restamp_backup_20260721` (non-public schema, not API-exposed), then
  the guarded UPDATE: **4919 rows** rewritten across **3 users**; idempotent second
  pass = 0 diffs. Deadlift best now 367.5 (was 384.2). Confidence bands unchanged
  (the v11 delta touches only the value).
- **Strength-metrics diff.** 131/220 user-exercise best-e1RM values corrected
  downward (avg −15.9 lb, max −218.1); largest drops on high-rep / bodyweight
  movements (walking lunges, back raises, weighted sit-ups, seated leg curl)
  where the averaged formula inflated most.
- **Durable record.** Idempotent migration `20260721000001` (no-op on the
  already-backfilled prod; performs the catch-up in every other environment).
  Policy left unchanged per the owner — it now always catches future `e1rm`-block
  changes since the stamps are caught up.

## 2026-07-20 — Session 82: N58 v2 — the §10 coaching layer (PR #197)

Owner: v1 is implemented and tested; build v2. Shipped doc 18 §10 exactly as
sequenced — a prompt + payload revision, no seam/lifecycle/gating change:

- **Payload** (+`projectTrend`, pure): pinned + last session note (200-char
  word-boundary caps; enter the model payload only, never a log or failure
  row), the §8.3 trend block folded over the pacer's 90-day lookback (status
  mix, governor firings, asks met/missed, prescribed-vs-measured %/30d;
  best-effort — no active params or any query failure omits the block, never
  sinks the burst), last workout fatigue/effort/performance.
- **Contract:** ≤480 chars / 2–4 sentences, `max_output_tokens` 160; §4
  post-check unchanged (note numerals join the allowed set). DB backstop
  320→480 via migration `20260720000003` (constraint swap only; applied to
  hosted, verified).
- **Prompt v2:** scientific-coach register — multi-factor why first, then at
  most a clause or two of focus direction, only when trend/notes/feedback
  ground it. `EXPLANATION_PROMPT_VERSION` → 2 for row comparability.

Tests +11 (suite 1289); RLS length test now pins 480-accept/481-reject;
typecheck + lint clean. Testing rides the PR-196 admin loop
(`generate_explanations` `overwrite:true` regenerates under v2). Residuals:
owner voice-reads a v2 batch; §7.6 cost rollup a month in.

## 2026-07-20 — Session 81: N58 live-test diagnosis + admin test loop (PR #196)

Owner report after running the #195 runbook: workout completed → "8 attempted
writes errored" with a model-related message; repeated load-step edits (incl.
a deliberate odd 17 lb) visually re-prescribed but wrote no
`decision_explanations`, no OpenAI tokens; a later session claimed "no
increment-override write since 7-15"; and testing exposed the need for a
recompute/reprocess lever.

**Diagnosis (from the hosted DB — engine_decisions is the audit trail):**

- The pipeline DOES fire: 8 advance decisions at workout completion (15:22)
  and three reconcile pairs (16:17–16:18) all scheduled generations; every
  attempt failed at the OpenAI call (0 rows, 0 tokens — consistent with a
  key/billing/model-access refusal). The exact upstream error was only in
  Vercel function logs — the testability gap this session closes. Root cause
  on the OpenAI side still needs the owner to run one live probe (below).
- The **increment-override scare is a false alarm**: recompute provenance
  records `incrementOverride: 25 → 17 → null` across the three reconciles —
  every app edit landed, recomputed under the right effective params, and the
  "round" 255 lb IS a 17-multiple (15×17; likewise 250=10×25, 260/265 = 5s).
  The final USE DEFAULT deleted the row, which is why the other session found
  nothing after 7-15 — `exercise_param_overrides` keeps no history; the
  provenance trail does.

**Built (one PR):**

- `llm_explanation_failures` — durable failure log written beside every R20
  report (burst / generate / post_check stages, exact error text; owner-or-
  admin SELECT, service-only writes; +RLS tests; hosted migration applied).
- Admin MCP tools (admin-llm.ts, PH33-hidden, `resolveAdmin`-gated):
  `get_llm_explanation_status` (deployed env config + stored rows + recent
  failures), `test_llm_explanation` (one live call, raw upstream error;
  per-decision dry-run/store), `generate_explanations` (synchronous scoped
  (re)generation, `overwrite`, 40-cap), `recompute_prescriptions` (forced
  re-decide of open rows: `all` / week+day / exercise — reconcile gains a
  `force` scope that skips both freshness short-circuits and writes a new
  decision even when numbers are unchanged, provenance reason
  "forced recompute"; explanations generated synchronously with outcomes).
- `generateDecisionExplanations` now returns per-decision outcomes;
  `reconcilePrescriptions` returns `writtenDecisionIds` (+ details under
  force). Doc 18 status header + runbook §3.4 troubleshooting rewritten
  around the new loop.

Tests +8 (suite 1278); typecheck + lint clean. Next owner step: run
`test_llm_explanation` on the deployed connector and fix what the raw error
names (§1 billing / key / model access).

## 2026-07-20 — Session 80: N58 build — LLM prescription explanation v1 (PR #195)

Owner go on N58: build the doc-18 spec + a first-time OpenAI API setup
walkthrough (owner's first API use).

**Built (doc 18 §7 phases 1–5, one PR):**

- **Schema** — `decision_explanations` keyed 1:1 to `engine_decisions.id`
  (invalidation free: a recompute is a new decision ⇒ a new explanation; the
  read path joins the row's latest decision), owner-or-admin SELECT +
  service-role-only writes + 320-char DB backstop + token counts; RLS tests;
  migration **applied to hosted** (verified RLS on / 1 policy / 0 rows).
- **Client** — `src/lib/llm/openai.ts`, thin zod-validated Responses-API
  fetch (10s timeout, one transient-only retry, `store:false`). Both §2/§9
  build-time gates passed against the official docs (2026-07-20): id
  `gpt-5.6-luna` at exactly the doc-18 pricing; `reasoning.effort` exists,
  defaults `medium`, **pinned `"none"`** (reasoning bills as output).
  `OPENAI_EXPLANATION_MODEL` env override for upstream renames.
- **Payload/prompt/post-check** — pure `prescription-explainer.ts`: §3
  projection off the recorded decision (trace verbatim minus quanta, anchor
  "from" line, ≤3 history lines, feedback; no PII/notes), system prompt w/
  paced-hold + deload few-shots, §4 post-check (every output numeral must be
  in the payload's number set — plus engine-derived ask-vs-previous deltas;
  failure ⇒ discard + R20 + deterministic fallback).
- **Write-site hook** — fire-and-forget (`after()`, detached fallback) at the
  doc-16 §10 sites: advance (post-`insert_generated_day`), seeds/slots
  (`recordSeedDecisions` now selects ids), reconcile recompute (ids collected
  across the pass). Never blocks a write; per-decision isolation; idempotent
  upsert.
- **Read seam (§6)** — `PrescriptionAudit.explanation` (fetched only when
  serving), `substituteExplanation` swaps ONLY the strip body (ask + ENGINE
  AUDIT stay deterministic; out-of-band rows keep the N33-S4 caveat), MCP
  `explain_prescription.explanation` = the same stored sentence.
- **Gating** — off / **shadow** (key set, var unset: generate + store, serve
  nothing — the §9 voice gate operationalized) / on. Ships fully inert.
- **Owner runbook** — `docs/deployment/openai-api-setup.md`: billing + $5
  budget cap, dedicated project + restricted key, Vercel env, shadow
  verification SQL, voice review, flip, month-one cost rollup;
  manual-operations entry added.

Tests +35 (suite 1272); typecheck + lint clean. Doc 18 status header → v1
BUILT. Residuals on the N58 row: owner runs the runbook; §7.6 cost rollup a
month in; §10 v2 coaching layer parked until v1 proves out.

## 2026-07-19 — Session 79: Batch 20 — prescription presentation split (N57, PR #194) + LLM explanation spec (N58/doc 18)

Owner (Batch 20, verbatim in the appendix, after #193 merged): the details
panel "feels more like a debugging panel than a useful prescription detail" —
build a deterministic user-friendly quick-read now (toggle next to the notes
button, notes-style reveal), revamp the details panel into a debug panel, and
spec the LLM explanation (OpenAI Luna, budgets, MCP reuse, per-generation +
monthly cost) as a drop-in for the deterministic text later.

Sweep first: #193 merged, but N56 stays live per the residual rule (owner
device check + the step-cadence design question); its paced-surfacing residual
is closed by this session's N57. PH30 → `superseded → N58` (archive next
sweep).

**N57 built (this PR):** pure composer `src/lib/prescription-narrative.ts`
(ask from the row alone; delta vs last session in reps-to-failure language —
the RIR ramp finally explains itself; doc-16 §3.6 progression state in plain
sentences incl. paced/not-earned; N33-S4 hand-adjusted caveat; 20 tests, the
N56 W2·D4 case is the canonical fixture), target-glyph button + notes-style
strip in the exercise card (fetch-on-open, instant ask, `ENGINE AUDIT ›`
drill-in), detail sheet retitled **Engine audit** and regrouped
(PRESCRIPTION / DECISION / EST. STRENGTH / TRACE, status-coded trace labels),
⋮-menu raw-rationale row replaced with `Engine audit ›`. Plumbing:
`readTrace` preserves status/governor/predicate; `PrescriptionAudit` gains
`previous` (decision inputs). 09-changelog entry 2026-07-19; no mockup figure
— deviation recorded in PROGRESS.md.

**N58 spec'd:** `docs/18-llm-prescription-explanation.md` — GPT-5.6 Luna
(verified $1/M in, $6/M out, $0.10/M cached), ~350-token decision-projection
payload (reuses the `explain_prescription` shape), ≤320-char output with a
deterministic number-set post-check, generation at decision write keyed to
`engine_decisions.id` (invalidation free), `decision_explanations` storage,
drop-in seam = the strip's `lines`. Cost ≈ $0.001/generation; measured volume
(~44 performed rows/wk both users → ~250 decisions/mo) ⇒ ≈ $0.25/mo. Root
CLAUDE.md doc index updated. N58 `ready`, build on owner go.

**Batch-20 addendum (same session, owner review of the built PR):** (1) the
strip's `ENGINE AUDIT ›` link removed — drill-in lives in the ⋮ menu only;
(2) the quick-read's why went **multi-factor**: `composeWhyLines` renders
feedback-modulation causes (pain-capped load, hot-workload set removal,
rough-session dampening, set adds/vetoes — engine note strings translated,
unknown notes surfaced verbatim) alongside the progression state, deduping
the earn-gate echo of a feedback cause, capped at three lines, with a legacy
grade fallback for pre-v20 decisions (+6 tests → 26); (3) doc 18 amended —
§1 requires what+why with multiple contributing factors (binds both
versions), new §10 v2 coaching layer (user notes + progression-history
trends in the payload, hard targets first + brief focus direction,
Mentzer-style scientific-coach register, ≤480 chars, after the v1 MVP).
09-changelog entry amended in place (same PR).

## 2026-07-19 — Session 78: N56 intake — W2·D4 deadlift prescription mismatch (code-side, PR #193)

Owner (Batch 19, screenshot attached): "Please look at my next deadlift
session prescription it does not match what is shown on screen. Please assess
and address." Day view W2·D4 (SAT 18 JUL, TARGET 2 RIR): Deadlift 250×8×3,
unlogged.

Reconciliation sweep first: PRs #186 (N47) and #187 (N53) are merged, but both
rows carry open owner residuals (device re-check of the tab-bar repro; PWA
remove+re-add after deploy), so per the purge policy both stay live — nothing
archived.

**Session constraint:** no live data — the `workout` connector was toggled off
for the chat and the session was non-interactive, so the N33-style
`engine_decisions` pull and a clarifying question were both impossible. The
investigation is therefore code-side, recorded in
`docs/reviews/2026-07-19-deadlift-w2d4-prescription-mismatch.md`: the screen is
the freshness-reconciled stored row; stable-params recompute cannot drift (the
anchor's recency weighting is relative; progression context replays frozen);
worked v21 numbers make 250×8@2RIR the self-consistent paced/`not_earned`
output for an anchor ≈333 (a plain hold prices 255 only off a 250×8@3 anchor);
one deadlift quantum ≈1.95% vs the 1.69 %/mo paced budget means heavy-lift
steps land ~monthly by construction. Ranked hypotheses + the exact
discriminating queries for a connector-enabled session are in the doc's §5/§6.

**Shipped in the same PR:** the one structural gap found — doc 14 §5 requires
the read-path reconcile on EVERY prescription-displaying surface, but no MCP
tool ran it — closed for `explain_prescription` (`freshenActivePrescriptions`:
active-meso reconcile before the decision read, degrade-loudly contract; +3
tests in `explain-prescription-freshness.test.ts`). MCP and the app now report
one prescription.

N56 filed (B, HIGH, WS-P, in-progress): blocked on the owner saying where the
mismatching number was seen (+ its value) and on a connector-enabled session
running the evidence checklist. §7 design questions parked in the row.

**Same-session resolution (owner enabled the connector mid-session; review doc
§8):** the live trail settled it. Stored W2·D4 prescription = **250×9@2**
(decision `e8881072`, v21: hold off anchor 341.7; the earned step `paced` by
the rate pacer at trailing 3.35 ≥ target 1.7 %/mo) — never rewritten, and the
Jul-19 advance still read `previous` 250×9. The screen's 250×**8** came from
the DISPLAY layer: unlogged set rows render the live reps prediction, and a
`paced` row has no `prescription_anchor` (it's `stepped`-only), so the
predictor fell back to the measured anchor — which W2·D2 (Jul 15: 255×8,7,7)
had dragged 341.7→333.1; `predictRepsAtWeight(333.1, 250, 2) = 8`. The
display was an **un-earnable ask** (250×8@2 ≈ 333 would score `under` the
±1.5% band vs the graded 341.7 basis); the owner self-raised to 255×8 → `met`
→ earned → W3·D4 = 260×9@1 `stepped` (A* 346.7, v25).

Fix shipped in the same PR #193: `prescriptionBasisE1rm` +
`impliedPrescriptionE1rm` in `day-rules.ts` (pure; +7 tests pinning the field
numbers), `SetRow` prices cells and weight-edit re-derivations off the graded
ask — recorded `A*` → the stored prescription's implied e1RM → measured
anchor only for prescription-less rows; the detail sheet's PRESCRIBED IMPLIES
line now shares the same helper. Display ⇄ markers ⇄ earn gate read one
definition of the ask. N56 → done (PR #193); residuals: owner device check
post-deploy + the §8.5 design questions (coarse-lift step cadence under the
pacer; surfacing `paced`/`not_earned` on the day view).

## 2026-07-12 — Session 77: N53 splash regression — branded launch images + first-byte fast path (PR #187)

Owner: "investigate the N53 splash regression … the ideal resolution durably
displays the loading splash, correctly themed, as early as possible, and
minimizes black screen time."

Reconciliation sweep first: PR #181 merged → its eight terminal rows
(N44/N45/N48/N49/N50/N51/N54/N55) archived. N43 (PR #182, activation runbook
open) and N47 (PR #186, owner device re-check) stay live.

Investigation upheld the addendum-2 code audit (mechanism byte-unchanged since
PR #119) and sharpened the cause into three stacked facts: the startup PNGs
were **solid** background (in dark appearance = perceptually the OS-default
black — a "working" launch image still reads as a black screen); the
in-document `Splash` window is one warm `(app)`-layout auth RTT — a blink;
and the LONG window is pre-document, where middleware blocked every first
byte on a network `auth.getUser()`. The 7/2 forced re-add (PR #109) is the
likely H1 trigger (iOS re-resolves startup images at add time, cf. #90/`b0faa88`);
no public evidence of a general iOS 26.5 startup-image regression was found.

Shipped (all branches attacked, whichever H is true on-device): launch PNGs
now render the full `Splash` composition both themes (woff2 → glyph outlines →
sharp; new devDeps sharp/wawoff2/opentype.js); middleware `getUser()` →
`getSession()` (no network on valid token, on-demand refresh, presence-only
routing — verified auth stays in layouts/pages, RLS unchanged);
`getRequestAuth` React-`cache()` dedup (layout + Workout tab + day-view deep
link); `LaunchScreenAudit` class-miss telemetry through the R20 funnel (new
`"launch"` boundary); `launch-screens.test.ts` pixel guards (79 tests — dims,
brand-bg corners, ink-in-center). Manual step added to
`manual-operations.md`: owner must remove + re-add the PWA once after deploy.
Suite 1200 green, lint/typecheck/build clean. N53 → done.

## 2026-07-12 — Session 76: N47 tab-bar detach — scroll-lock rework (PR #186)

Owner: "begin work on the HIGH bug N47 tab-bar detach; resolve robustly."
Reconciliation sweep first: PR #184 (N36 self-gating) merged — N36's row stays
live pending its owner-gated activation runbook, nothing to archive.

Built the scoped fix (scoping.md N47 entry, hypothesis corroborated by the
Batch-17-addendum screenshots): `useScrollLock` no longer toggles
`body{position:fixed; top:-Y}` — the iOS-standalone trigger that left every
`position:fixed` element (the tab bar) bound to a stale viewport after a
BottomSheet + keyboard session. The lock is now:

- body `overflow:hidden` (propagates to the viewport; scroll offset preserved —
  no jump, nothing to re-anchor) + `overscroll-behavior:none` on html+body;
- a document-level non-passive capture `touchmove` guard for the touch
  scrolling older WebKit leaks through `overflow:hidden` — pure
  `touchMoveAllowed` walk (new `scroll-lock.test.ts`, 9 tests): interactive
  controls and genuinely scrollable sub-regions allowed, scrim/static chrome
  prevented;
- N7's exact scroll restore kept as the unlock backstop (keyboard focus-reveal
  can still shift an overflow-hidden document programmatically);
- `overscroll-contain` on the three overlay scroll regions that could chain to
  the document (CompleteSheet panel, both fullHeight sheet lists);
- `BottomNav` on its own compositor layer (`transform-gpu`) as hardening.

Verified end-to-end headless (real app + local Supabase, CDP raw-touch drive,
24/24): lock at depth keeps `scrollY` un-zeroed, scrim drags inert, sheet lists
scroll, exact N7 restore at depth, nav re-anchored + taps navigate after an
overlay+keyboard-shaped session, page scroll alive post-close (guard fully
removed), menu→sheet refcount handoff holds. Residual: the iOS
keyboard/visual-viewport half of the repro is not emulatable headless — owner
re-checks on device after merge. N47 row → done.

## 2026-07-12 — Session 75: N36 envelope loop goes self-gating (owner Batch-18 note, PR #184)

Owner note (Batch 18, verbatim in the appendix): why gate the envelope loop on
a remembered future enable at all — it should default to the current portion of
the band while a user lacks history, kick in automatically when the data
exists, and the short-circuited position should be tunable. Reconciliation
sweep first: PRs #182/#183 merged (N43's row was already stamped `done (PR
#182)` — left live pending its archival sweep with the open N52/N54 riders).

Assessment: the old "fit thresholds from field data, then ship the params
block" gate conflated **global threshold calibration** (refinable any time
from the monitor instruments) with **per-user data availability** (which must
be automatic — the owner's multi-user point is decisive). The mechanism (PR
#177) already started every fold at the tunable `progression.band_position`
and treated sparse mesos as no evidence, but a single qualifying meso could
move the position, and nothing made the sufficiency rule explicit or tunable.

Built (PR #184):

- **Engine:** `progression.envelope.min_history_mesos` (int ≥ 1, default 2) —
  `deriveBandPosition` short-circuits to the `band_position` default until
  that many qualifying (≥ `min_decisions`) completed mesos sit in the lookback
  window; symmetric on the way out (aging past `lookback_mesos`/`max_age_days`
  re-engages the gate — same return-from-absence decay). Off →
  short-circuited → modulating all pace off the same tunable knob, so the
  transition is continuous. Block still `.optional()` ⇒ absent = byte-identical
  (suite 1112, +5 gate goldens).
- **Doc 17 §7** amended (self-gating design, thresholds demoted from
  activation gate to provisional-refit); §9 row 6 + intro spine updated.
- **Runbook** rewritten: "Fit + activate" → "Activate the envelope loop"
  (propose defaults bump → replay diff → owner review/activate → standing
  monitor/refit). All prereqs cleared (v20 2026-07-11, N43's v24 2026-07-12) —
  the activation can run whenever the owner says go, no field-data wait.

N36 row updated to **self-gating built (PR #184)**; remaining scope is the
owner-gated activation runbook itself.

## 2026-07-12 — Session 74 (cont.): N43 Phase-R activation — v23 applied + v24 plan-flip live

After PR #182 merged, ran the doc 17 Phase-R activation from the same session
(owner: "replay and review the new version diff to current via MCP, and activate
and flip to plan once approved"):

- **Applied v23** via Supabase `apply_migration` (the `20260712000001` migration
  was pending — hosted migrations apply via MCP, not the deploy). Inactive row,
  hash `ed12c6a0…`, `is_replayable`. Param diff v21→v23 = exactly `strength_model`.
- **Replay review:** candidate v23 and candidate v21 over the same 100 recorded
  decisions produce the **identical** 25-diff set → the v23-specific delta on
  stored prescriptions is **empty** (the 25 are legacy v15–v22 drift the active
  v21 already implies). Proposed **v24** (base v23, `rate_source: "plan"`, hash
  `b58a0f1d…`) — the re-flip of the rolled-back v22 on the corrected band; its
  replay is **also** the identical 25 diffs (flip is forward-looking only).
- **Forward-looking effect (Garron's live profile, FFMI ≈ 16.7):** pacer source
  band 0.5–1.5 %/mo (advanced bucket) → **1.36–2.28 %/mo** (two-component
  intermediate) — *raising* the target, N43's intent.
- **Owner approved → activated v23 then v24.** v24 is the single active version
  (`rate_source: "plan"`, `strength_model.enabled true`); e1rm unchanged, no
  restamp. Rollback = re-activate v21 or v23. Recorded in
  `manual-operations.md` (v23/v24 section → DONE).
- **Now unblocked (separate items, not started here):** N52 (DEXA-indirect-chain
  copy amendment) and N54 (re-enable the macro goal-target cards) — both gated on
  the band becoming trustworthy, now live; N36's envelope fit runs on the
  corrected band.

## 2026-07-12 — Session 74: N43 build — two-component strength-rate model (engine_params v23, inactive, PR #182)

Owner: "Review docs/reviews/2026-07-11-strength-rate-model-research.md and
implement N43." Reconciliation sweep first: PR #181 merged into main (all its
`done (PR #181)` rows already stamped, verbatim text preserved) — nothing new to
archive. Then built N43 per the research doc §4, doc 17 Phase 7:

- **Engine** (`macro.ts`): `strengthRateBand` now dispatches. With
  `macro_target.strength_model` present + enabled AND body composition readable,
  the calendar bucket is replaced by the additive
  `neural(effectiveTrainingAge) + k × hypertrophyRate_FFM` (new
  `twoComponentStrengthRate`): the N21 proximity rate re-expressed as %/mo of FFM
  (÷ fat-free fraction) × coupling `k`, plus a decaying neural band
  `N0·e^(−effYears/τ)+floor`; the §4 un-bank guardrail discounts effective
  training age when realized FFM is low. Sum takes the same v21 sex factor + age
  taper, clamped to the ceiling. Degrades to the bucket band when no FFMI — the
  strength-path mirror of the hypertrophy training-age-decay fallback. All three
  call sites (`strengthRatePctMonth`, strength target, `recommendDuration`) get
  it for free.
- **Params** (`params.ts`): `macro_target.strength_model` block, `.optional()`
  (enabled/neural_n0/neural_floor/neural_tau_years/ffm_coupling_k/
  undermuscled_unbank/rate_ceiling_pct_month). Absent ⇒ parse/hash
  byte-identical, v21 behavior.
- **Migration** `20260712000001_engine_params_v23_strength_model.sql`, applied
  **inactive**; full materialization + canonical sha256
  (`ed12c6a0…`, guarded in params-provenance.test.ts). v22 was the hosted-only
  `rate_source:"plan"` micro-bump rolled back to v21 — no committed migration, so
  this lands as v23.
- **Goldens**: macro.test.ts pins the research §4 corners — Garron (13 yr, FFMI
  ≈16.7) → **1.36–2.28 %/mo** (intermediate, above the advanced calendar bucket);
  true novice same FFMI → **4.36–7.28** (beginner, the gap is the neural term);
  advanced FFMI-ceiling → **0.14–0.50**; ceiling clamp; un-bank raises a
  mid-career undermuscled lifter; body-comp-missing ⇒ the bucket band
  byte-identical; strength_model absent ⇒ v21 band.
- **Docs**: doc 17 §2.7 (new) + §9 Phase-7 row + §10 cross-doc; doc 10 §5
  strength paragraph + params list; PROGRESS.md; manual-operations Phase-R entry.

Suite 1107 green (+10 macro goldens), lint/typecheck clean. Activation is
Phase R (replay diff — expected ≈ empty on stored prescriptions until
`rate_source:"plan"` — then owner review). **N43 → done (PR #182)**; unblocks
N36 (must land before the envelope fit) and N52/N54 (copy + target-card re-enable
ride the v23 activation).

## 2026-07-12 — Session 73: Batch-17 easy-roundup build — N44/N45/N48/N49/N50/N51/N54/N55 in one PR (#181)

Owner: "round up the easy ones and get as much of them done in one PR as
possible." Reconciliation sweep first: clean — no `done` rows awaiting archive
(N34/N36 stay live on field-gated residuals). Then all eight `ready` Batch-17
items shipped in one PR, in scoping's suggested order:

- **N51** (HIGH, engine): both seed branches now `boundRepsToWindow`, gated on
  `bound_to_target_window` (pre-v12 replay pinned byte-identical). New
  `seed-window.test.ts`. Accepted residual noted in-row: code-only fix, stored
  seed rows refresh only when a fingerprint input changes.
- **N50**: `staticCells` includes `readOnly`; locked logged rows render their
  actuals as static text, marker preserved; `save()` guards.
- **N48+N49**: `ReplaceSheet` gains the EQUIP FilterBar axis + single-select +
  disabled-until-picked REPLACE EXERCISE confirm; `AddExerciseSheet`'s
  hand-rolled chips folded onto FilterBar — no tap-commit picker and no
  pre-N29 chips remain anywhere.
- **N44+N45**: prescription detail's `EST. STRENGTH (e1RM)` block (PRESCRIBED
  IMPLIES / TARGET ANCHOR A\* / MEASURED ANCHOR + winning-set coordinate);
  `recencyWeightedE1rm` returns provenance, schema-widened `.nullish()` on
  `inputs.strengthAnchor`, fingerprint-neutral (pinned), threaded to
  `LoggedExercise.e1rm_anchor_source`. W·D coordinate skipped deliberately
  (set+date is the owner's own phrasing of the complaint).
- **N54** (owner-decided): #178's target cards reverse-applied + the
  goals-edit card hidden for consistency; re-enable rides N43/v23.
- **N55**: label conditional mirrored.

Suite 1097 green (+9), lint/typecheck clean. 09-changelog 2026-07-12 entry +
PROGRESS.md entry in the same PR. **Still open from Batch 17:** N43 (build
v23 — the next big one), N46 (template editing, own slice), N47 (scroll-lock
rework + device verify), N53 (launch-splash regression, device investigation),
N52 (rides N43).

## 2026-07-11 — Session 72: Batch-17 intake — N44–N54 (11 notes, all investigated at intake)

Owner handed over 11 notes and asked for a precursor look into each. Five
parallel code sweeps ran at intake; every item landed `ready`/`triaged` with a
scoping entry (no `inbox` residue). Reconciliation sweep first: clean — N34/N36
stay live on field-gated residuals, N43 `ready`, no stale `done` rows.

- **New items:** N44 (prescribed/target e1RM in prescription detail, MED),
  N45 (anchor source coordinate, MED — provenance computed then discarded in
  `recencyWeightedE1rm`), N46 (edit custom templates, MED — confirmed zero
  update path anywhere; detail page lacks delete too), N47 (**HIGH** tab bar
  detaches/goes dead on iOS standalone — top hypothesis: `useScrollLock`'s
  body-position-fixed toggling; ancestor-transform ruled out), N48+N49
  (replace-sheet EQUIP filter + confirm step — the sheet is the only
  tap-to-commit picker left; ship together), N50 (past-workout inputs editable
  but RLS no-ops the save — one-conditional client fix), N51 (**HIGH** seed
  prescribes 6 reps under an 8–12 window — both seed branches skip
  `boundRepsToWindow`, the exact correction the prescribe path applies),
  N52 (DEXA→prescriptions question — **answered**: copy correct today, the
  indirect chain goes live only with N43's v23 + `rate_source:"plan"`; copy
  amendment rides N43), N53 (**HIGH** no splash / long black launch — splash
  code unchanged; dark-mode launch surfaces read black + the pre-document
  triple-`getUser()` window the splash can't cover), N54 (disable macro target
  cards again — owner-decided in the note; revert the #178 JSX hunks + the
  goals-edit surface).
- **Relationships:** N44↔N45 one PR (same sheet + threading); N48↔N49 one PR
  (same sheet); N52 + N54 cross-linked into N43's row (both ride v23); N53
  filed under WS J next to N1's north star; N47/N50/N51 to WS G.
- **Suggested attack order:** N50+N51 (small, high-value correctness), N54
  (owner-decided, small), N47 device verification, N48+N49, N44+N45, N53, N46.
- README workstream roster refreshed (stale G "Open" list corrected — N5/N11
  shipped long ago; C/D/E/J/P rows gained the new items).

**Addendum (same session):** owner sent three screenshots (preserved in
`assets/`). (1) N47 evidence: the detach captured live on /cycles AND the
planner board — the fixed bar renders against a stale mid-screen viewport
bottom, and the planner capture is the same minute as an open create-meso
BottomSheet + keyboard, corroborating the scroll-lock (+ visual-viewport)
trigger; row stays `triaged` but the hypothesis is now evidence-backed.
(2) N53: the screenshots confirm the device runs the app in dark appearance —
cause (1) established; since the app *stays* dark after launch, the
splash-color half became an owner decision (cream-always vs legible-dark-splash
vs retire-dark-theme) → row moved to `needs-input` with the options framed;
the pre-paint auth collapse remains unconditional. (3) New **N55** (UX, LOW,
WS D, `ready`): the create-meso sheet hard-codes "WEEKS — INCLUDING DELOAD"
(`PlannerBoard.tsx:1318`) while the deload checkbox is toggleable —
`MesoHeader.tsx:605` already has the conditional to mirror. Trivial.

**Addendum 2 (same session):** owner corrected the N53 assessment — the dark
splash used to display legibly and no longer displays at all ⇒ re-framed as a
**regression**, needs-input color options withdrawn, row back to `triaged`.
Code audit: the entire launch chain is unchanged since PR #119, so the cause
is environmental/timing. Hypotheses recorded in scoping (H1 primary: the iOS
startup image stopped applying → pre-document window falls back to
iOS-default black; H2: the `Splash` fallback window only spans the layout
auth await; H3 weak: response buffering), plus a device-verification plan and
theme-independent fix levers (branded startup PNGs, collapse the triple
`getUser()`, verify the fallback streams).

## 2026-07-11 — Session 71 (cont. 2): N43 research + pacing pressure-test, rollback to v21

Owner directed the research pass + a pacing pressure-test, and the interim
rollback. Both review docs written; N43 moved needs-input → ready.

- **Rolled back to v21** (`activate_engine_params` 21) per the owner — v22's
  plan/advanced band understates this profile; v21's intermediate band contains
  the model-derived rate. Branch restarted from merged main (PR #178) →
  `claude/macro-goals-r2-r3-envelope-ntaw6h`, **PR #179**.
- **Strength-rate model research** (`docs/reviews/2026-07-11-strength-rate-model-research.md`):
  two-component hypothesis EVIDENCED, combine ADDITIVELY (Balshaw 2017). FFM
  coupling `k ≈ 1.0` (not the ⅔ sketch) ⇒ Garron ~1.4–2.3 %/mo = intermediate,
  advanced bucket understates. Functional form + coefficient bands + trust-FFM
  guardrail recommended for v23. Two research agents; allometric-FFM exponent
  filled the first sweep's flagged gap.
- **Pacing pressure-test** (`docs/reviews/2026-07-11-pacing-fundamentals-review.md`):
  harness `scratchpad/pacing-sim.ts` drives the REAL engine through 9 scenarios.
  Confirms owner's thesis — pacer = rate-limiter on the lead (not the primary
  progression engine, which is the measured anchor); honest lifter can't be
  over-prescribed; RIR-mortgaging bounded + self-correcting, worst on 8-wk mesos
  (4.8% transient, exposed at RIR 0). Key new limit: the envelope loop moves
  position *within* a band and can't fix a whole-band miscalibration → N43 gates
  N36's fit.
- N43 → **ready** (D→F); build v23 next per the research doc §4.

## 2026-07-11 — Session 71 (cont.): Batch-16 intake — N43, the strength band's calendar-bucket defect

Immediately after the R2/R3 activations the owner reviewed the flip's
consequences and raised a design inconsistency: the strength band buckets by
calendar training years (12.7 y → advanced 0.5–1.5 %/mo) while the
hypertrophy path prices FFMI proximity (owner's developed fraction ≈ 0 →
novice-rate lean-mass projection) — the same calendar-vs-body-comp defect
N21 fixed on the hypertrophy side, now **metering the pacer** since the R3
flip. Filed as **N43** (D, HIGH, WS C, needs-input): research pass →
proximity-derived strength band (v23); interim keep-v22 vs roll-back-v21
decision framed in-row. Verbatim in Batch 16. N36 unaffected (envelope is
source-agnostic). Committed to the open PR #178 branch.

## 2026-07-11 — Session 71: Phase R2 + R3 executed (v21 + v22 active), target cards return

Owner-directed activation session on the doc-17 spine (branch
`claude/macro-goals-r2-r3-envelope-ntaw6h`, **PR #178**). No new intake.

- **R2 (v21):** replay evidence gathered exactly as the runbook demanded
  (0/20 changed on v20 sources; v21 ≡ v20 diff sets on 100 mixed sources) +
  a pure-engine target-band review (owner profile byte-identical; §2.1/§2.2
  corrections verified on sample profiles) → activated via
  `activate_engine_params`. Target cards re-enabled in this PR (figs 2.2/2.3;
  est-strength nouns per doc 17 §2.5; priming model-band half joins). N21's
  archived row gains the activation postscript.
- **R3 (v22):** proposed via `propose_engine_params` (base v21 +
  `rate_source: "plan"`), replay byte-identical (0/20 + no v22-specific diff
  on mixed sources), activated. Key forward-looking fact recorded in the
  runbook: owner's pacer target drops ≈ 1.69 → 0.75 %/mo (self-reported
  intermediate bucket → training-years advanced plan band). N37's archived
  row gains the postscript.
- **Envelope (N36):** no code change — confirmed still field-data-gated
  (v20/v22 progression decisions span < 1 day; the fit needs ≥ 2–3 real
  completed mesos). Explained to the owner in-session (why the fit data
  isn't backfillable: pre-v20 history contains no engine-led asks, so no
  earn/miss/governor outcomes exist to fit thresholds against).
- Human steps remaining: birthdate re-save (non-binding until 40); the
  envelope fit clock runs on training time.

## 2026-07-11 — Session 70: N36 envelope loop — mechanism built, shipped OFF (doc 17 Phase 6)

Owner kicked off doc 17 Phase 6. Reconciliation sweep first: no stale `done`
rows (N34 stays live on its human residual, correctly). Session finding that
reshaped the plan: **v20 is now ACTIVE on hosted** (verified via
`get_engine_params`; `get_progression_history` already records live decisions
— ~20 across 19 exercises, span < 1 day) — so Phase 6's R1 gate is cleared,
but the field data is nowhere near the "few real mesos" the threshold fit
needs. Scope split accordingly, per §7's own language: **build the whole
mechanism now, ship it OFF; the fit + params bump + activation stay
field-data-gated** (new runbook section). Branch
`claude/macrocycle-goals-phase-6-k6kxf1` (**PR #177**).

- Engine: `rules/envelope.ts` pure fold (completed-meso boundary steps,
  `MAX_BOUNDARY_STEP 0.25` binding, dwell, clamp [0,1], bounded lookback as
  the return-from-absence decay; demand-side inputs only; down wins over up;
  raises require real up-pressure — pacer trips or beat share);
  `progression.envelope` `.optional()` params block (PROVISIONAL thresholds,
  absent everywhere ⇒ byte-identical); `EngineInputs.bandPosition` derived
  input; the pacer lerps `inputs.bandPosition ?? params.band_position`
  under either rate source; `seedMeso` threads it through the shared gate.
- Queries: `queries/envelope.ts` leaf assembly (decisions → completed-meso
  outcomes via the §8.3 fold per exercise + `setComplianceMarker` beat
  share → position), wired at the `planStrengthRate` sites (activation
  seed, advance, projection); doc-14 treatment (denylist + recorded +
  replays frozen through `recomputeRow` and `replay_decisions`).
- Tests +27 (suite 1089): loop-off byte-identity, movement/dwell/clamp +
  floor/top-pin goldens, fingerprint invariance, boundary selection, replay
  determinism, source-agnostic pacer composition. Lint + typecheck clean.
- Docs: PROGRESS entry; runbook "Fit + activate the envelope loop" + the
  v20 section stamped ACTIVATED (verified); this row + N36 updated.

Doc 17 Phases 1–6 are now all built. Next on this spine: owner-side only
(R2 v21 activation, R3 plan flip, the envelope fit once field data exists).

## 2026-07-11 — Session 69: N34 Phase 5c — engine + MCP, and the profile body-fat rework

Doc 17 §6 Phase 5c (the last DEXA build PR), plus an owner note pinned to
the same PR: after a scan's proposal updated the profile, the profile still
rendered the estimate bands with a stale band lit; the band increments
(10/14/18/23/29) read as arbitrary; and there was no between-band entry.
Branch `claude/macrocycle-phase-5c-dexa-4hyegu` (**PR #176**).

- **Engine path (no engine change, by design):** measured bf% rides the
  existing `bodyFatPct` profile input (doc 15 §3.1) — the 5b apply already
  writes the profile, so `planMacrocycle` was consuming measured values the
  moment they were accepted. Pinned with a mapping-equality test
  (dexa-sourced ≡ same-value estimate). Passing measured FFM directly stays
  the noted later refinement.
- **Provenance (migration `20260711000005`):** `profiles.body_fat_source`
  (`'estimate'` | `'dexa'`, null legacy) — the scan APPLY stamps `'dexa'`,
  the picker/custom entry stamps `'estimate'`, clearing nulls it. Covered by
  the existing column-agnostic owner RLS (birthdate-migration shape).
- **Profile control rework (owner note; 09 2026-07-11 Phase-5c entry §§1–2):**
  bands normalized to even 5-pt steps (~10…~30, 35%+), exact-match
  highlight (no more fuzzy ±2.5 lighting), full-width CUSTOM VALUE chip →
  bottom-sheet numeric entry (2–70) rendering as `CUSTOM — 17.5%` when a
  non-band value holds; while provenance is `'dexa'` AND the BodySpec
  connection exists, the picker gives way to a measured panel (value +
  `SCAN <date>` from the newest applied scan, derived on read) with
  OVERRIDE WITH AN ESTIMATE; disconnecting reverts to the picker, the value
  stays until edited.
- **RMR context (doc 15 §3.4; 09 entry §3):** MEASURED RMR section on cut/
  hypertrophy macro Overviews from the newest scan's Cunningham (FFM-based)
  estimate — display-only, prescriptions/targets never read it, Mifflin
  never shown as "measured".
- **MCP (doc 17 5c; 09 entry §4):** `get_body_composition` over
  `v_body_comp_history` (shared-view rule) with deltas + same-scanner
  comparability + LSC within-noise flags computed from the one constant set
  (`queries/body-comp.ts`), newest-scan RMR, and the doc 15 §6 guardrails
  shipped as a `measurement_guardrails` data block; `get_profile` now
  reports `body_fat_source`. Doc 05 tool table updated.
- Suite green (1062), typecheck + lint clean. Docs: 09 Phase-5c entry,
  doc 15 §5 row-3 build note, doc 05 table, this row + PROGRESS.md.
- N34 build-out is complete (5a/5b/5c + field fix); the row stays live for
  the one human residual — the owner's first real connect recording the
  §8.3 outcome in doc 15.

## 2026-07-11 — Session 68: N34 field fix — cookie-free connect round trip (+ prod migration catch-up)

Owner reported two things from first real use: the More tab erroring, and
the first real BodySpec connect dying at Keycloak's "Cookie not found" from
the installed PWA (screenshot; login + consent had succeeded). Branch
`claude/macrocycle-phase-5b-migrations-1jagpf` (**PR #175**); migration
`20260711000004`.

- **Prod catch-up first (the More tab):** the 5a/5b PRs had merged but
  their migrations were never applied to the live project. Diffed
  `supabase/migrations/` against the live ledger — everything through
  `20260711000001_bodyweight_log` was applied; applied `20260711000002`
  (connect tables) + `20260711000003` (enrich + view) via MCP in order,
  verified tables/view/policies/deny-all, advisors clean. More tab fixed.
- **Root cause of the connect failure (structural, not a fluke):** from a
  home-screen web app the OAuth round trip spans two browsing contexts —
  iOS runs the provider login (and the redirect back) in an in-app browser
  sheet with its own ephemeral cookie jar. The 5a flow carried PKCE
  verifier + state in httpOnly cookies and required the Supabase session at
  the callback: none of the three exist in the sheet. Recorded as doc 15
  §8.5.
- **Fix:** server-side `oauth_transactions` (deny-all; state PK = 256-bit
  single-use credential, 10-min TTL, user id bound at /connect while the
  app context still has the session). The callback consumes it by `state`
  alone — zero cookies — and persists via service-role call sites scoped to
  the transaction's user. Response adapts: initiating user's session
  present → the original redirect + flash; otherwise a house-style
  return-to-app interstitial (09 2026-07-11 entry; shared flash copy in
  `more/bodyspec/flash.ts`) — never a sign-in bounce.
- **Middleware catch (from driving the production build):** the blanket
  signed-out→/sign-in redirect intercepted the session-less callback before
  the handler ran — `/api/integrations/bodyspec` added to the middleware
  public paths (both routes manage their own auth). Verified live: bare
  callback → 400 interstitial, provider-error → interstitial, signed-out
  connect → `/sign-in?redirect=/more/bodyspec`.
- **Tests:** RLS deny-all + single-use-consumption block; suite green
  (1057), typecheck + lint clean. Migration applied + posture verified on
  the live project via MCP.

Doc updates riding along: doc 03 (`oauth_transactions`), doc 15 §8.5,
09-changelog (interstitial), PROGRESS, this log + N34 row.

## 2026-07-11 — Session 67: N34 5b built — doc 17 Phase 5b (BodySpec enrich + view)

Owner kicked off Phase 5b ("implement phase 5b"). Second of the three DEXA
PRs (**#174**, branch `claude/macrocycle-goals-phase-5b-7o486o`);
migration `20260711000003` (`v_body_comp_history` + the `body_scans`
proposal-resolution stamps).

- **Reconciliation sweep first:** no stale `done` rows — N34 correctly
  live (`in-progress — 5a shipped (PR #173)`, merged); nothing to archive.
- **Hard-rule-8 gate:** 09-changelog entry (2026-07-11, Phase-5b section)
  for the four house-style surfaces — proposal card, scan-detail
  `VS PREVIOUS SCAN`, macro-page `BODY COMPOSITION`, retrospective
  composition/mass rows. No mockup figure exists for any; re-verified.
- **The guardrails ship as data, one definition:** `v_body_comp_history`
  (security_invoker; deltas vs previous scan + `same_scanner_as_prev` —
  null on the first scan, false when either model is unknown) and the LSC
  constants (`queries/body-comp.ts`: lean/fat ~2 lb, bf% ±1 pt, quarterly
  60 d). Every consumer inherits doc 15 §6: sub-LSC deltas say `WITHIN
  MEASUREMENT RANGE`, cross-scanner pairs are flagged and never graded.
- **Consented proposal (doc 15 §2.3):** newest unresolved scan only; APPLY
  writes profile bodyweight/bf% + appends `bodyweight_log source:'dexa'`
  (the Phase-4 series' third writer); KEEP CURRENT resolves permanently.
  Pure rule refuses resolved/stale/no-op scans; the action re-runs it
  server-side. Resolution stamps are the only new mutable state.
- **Retrospective + MCP, one fold:** `macroRetrospective` gains the
  informational `composition` block, and the mass verdict gains its DEXA
  fallback (bracketing same-machine scan weights when the bodyweight
  series doesn't bracket; series first when both do).
  `get_macrocycle_summary` returns it snake_cased (parity test).
- **Tests:** +19 unit (suite 1057), +2 RLS blocks (view semantics against
  real Postgres; resolve guard never restamps), e2e extended. The
  pre-existing 5a e2e test fails in this sandbox on unmodified main too
  (Chromium build mismatch; CI has matching browsers) — verified by
  stash-run before shipping.

Doc updates riding along: doc 03 (`body_scans` stamps +
`v_body_comp_history`), doc 15 §5 (Phase-2 row build note), PROGRESS,
this log + N34 row (`in-progress — 5b shipped`).

## 2026-07-11 — Session 66: N34 5a built — doc 17 Phase 5a (BodySpec connect + import)

Owner kicked off Phase 5 ("implement phase 5"). First of the three DEXA PRs
(**#173**, branch `claude/macrocycle-goals-phase-5-2xfwkf`); migration
`20260711000002` (`external_connections` + deny-all
`external_connection_secrets` + `body_scans`).

- **Reconciliation sweep first:** N41 (PR #172) merged → row archived
  ("Swept 2026-07-11 — macro goals Phase 4").
- **Hard-rule-8 gate:** 09-changelog entry (2026-07-11, Phase-5a section)
  for the More settings row, the `/more/bodyspec` integration screen, and
  the scan detail ledger — all house-style, no mockup figure exists.
  Re-verified the live `openapi.json` (still v0.14.3) before writing the
  zod schemas.
- **Connect (doc 15 §8):** PKCE S256 + `offline_access` against the
  Keycloak realm; per-environment self-registered clients
  (`scripts/register-bodyspec-client.ts` — human-run so the one-shot
  `registration_access_token` lands in a secret store, not a transcript;
  runbook section in `manual-operations.md`). The callback runs the §8.3
  first-login verification (`GET /users/me`) BEFORE persisting anything;
  `api_denied` fails the connect with its own copy + runbook pointer.
- **Secrets posture (hard rule 4):** token material in a deny-all table
  (RLS, no policies, client grants revoked) reached only via service-role
  call sites in `queries/external-connections.ts`, always user-scoped;
  refresh rotation there too; dead grant ⇒ row `error` ⇒ RECONNECT.
- **Import:** serial identity-from-token fetchers, full-history backfill,
  zod at the boundary (lenient on unmapped fields), kg→lb / cm→in in
  `convert.ts` only, verbatim `raw` per section, pure `mapScanToImport`
  fold, idempotent upserts on `(user_id, provider, provider_result_id)`;
  results without a composition section skip as non-DEXA.
- **Deliberately NOT in 5a:** deltas/trends/verdicts (5b —
  `v_body_comp_history` + LSC guardrails), `source:'dexa'` bodyweight
  points + profile proposal (5b), engine/MCP (5c). Scans persist through a
  disconnect unless the user opts into the purge (doc 15 §2.3).
- **Tests:** +12 unit (suite 1039: conversion + map goldens off provider
  examples, RFC 7636 vector, schema leniency), +5 RLS blocks (secrets
  deny-all even to the owner; disconnect cascade), e2e integration-screen
  spec. Unit/typecheck/lint/build green locally.

Doc updates riding along: doc 03 (three tables), doc 15 §8.3 (build-status
note — verification outcome pending the owner's first real login),
PROGRESS, this log + N34 row (`in-progress — 5a shipped`).

## 2026-07-11 — Session 65: N41 built — doc 17 Phase 4 (bodyweight series + create-flow priming)

Owner kicked off Phase 4 ("implement phase 4"). One PR (**#172**, branch
`claude/macrocycle-goals-phase-4-flvrc9`); migration `20260711000001`
(`bodyweight_log` + the `v_macro_summary` logged-span columns).

- **Hard-rule-8 gate first:** 09-changelog entry (2026-07-11, Phase-4
  section) for the quick-entry row + sheet (More page settings grammar), the
  "as of" freshness suffix (one vocabulary — the profile editor's `UPDATED`
  reworded to `AS OF`), and the fig-2.3 `LAST BLOCK MEASURED` ledger line.
  Rule-8 pass re-verified: no mockup figure covers any of them.
- **Series (§5):** `bodyweight_log` — owner-only RLS, `source
  ('manual'|'profile'|'dexa')`, unique `(user_id, measured_on, source)`;
  writers append on every profile-bodyweight edit (editor field, day-view BW
  chip via T-I2, onboarding) and from the new quick entry (manual,
  backdatable, same-day replace; **never** writes the profile scalar).
  Reads resolve a day to the latest-entered point across sources.
- **Mass verdict:** `bodyDeltaForSpan` (±14-day bracketing of the
  `v_macro_summary` logged span, distinct-day endpoints) feeds the Phase-3
  `bodyData` seam in `getMacroOverview` — the completed Overview and
  `get_macrocycle_summary` flip from "not measured" to a graded Δbw off one
  fold. Never proxy-graded (principle 6).
- **Priming (§4-carry):** `getPriorBlockMeasuredRate` — the last trained
  completed block's est-strength headline normalized to %/mo
  (`measuredRatePctMonth`, ≥28-day logged-span floor), display-only on the
  create card; never an input to `planMacrocycle` (principle 4). The model-
  band half of the copy waits for Phase R2 (target cards still hidden per
  the N21 ruling). Create-only.
- **Tests:** +12 unit (suite 1027), +4 RLS blocks, e2e quick-entry flow +
  a priming-negative in the closeout spec. Unit/typecheck/lint green
  locally; RLS + e2e ride the CI local stack as usual.

**Hosted repair + deploy:** found the hosted DB **behind merged code** — the
Phase-1 migrations (`20260710000001/2`) were never applied (macro create/
goals-edit and birthdate saves were failing in prod since PR #169 deployed).
Applied both + this phase's `20260711000001` via the Supabase MCP; v21
verified structurally (= hosted v20 + the documented three-param delta),
INACTIVE, active row still v20; bodyweight_log advisor-clean (initplan-wrapped
policy, reflected in the repo file). Runbook R2 row checked off
(`manual-operations.md`); v21 activation itself stays owner-gated.

N41 → done pending merge; N34 Phase 5b's verdict rows now have both the
retrospective seam AND real bodyweight substrate to slot beside.
Reconciliation sweep: **N40 archived** (PR #171 merged; row → `archive.md`,
live index trimmed).

## 2026-07-11 — Session 64: N40 built — doc 17 Phase 3 (macrocycle closeout + retrospective)

Owner kicked off Phase 3 ("implement phase 3"). One PR (**#171**, branch
`claude/macrocycle-goals-phase-3-qvav73`); **no migration** — `completed` was
already in the macro status vocabulary (no code path wrote it), and the
retrospective is derive-on-read per doc 17 principle 5.

- **Hard-rule-8 gate first:** 09-changelog entry (2026-07-11) for the three
  net-new surfaces — the header-⋮ "End macrocycle" + confirm sheet (the
  End-mesocycle dialog's weight, one level up), the completed-Overview
  retrospective card (ledger rows + verdict tags above the unchanged 2×2
  tiles), and the timeline's `NOT BUILT` placeholder treatment. Rule-8 pass
  re-verified: no mockup figure exists for any of them (fig 2.2 shows only
  the live "to date" block); house-style from established primitives.
- **Close transitions (§4.1):** new leaf `queries/macro-close.ts` —
  `macroClosesNaturally` (every real block terminal; `unplanned` placeholders
  aren't open work; all-placeholder macros never self-close) +
  `maybeCompleteMacroAfterMeso`, cascaded from BOTH meso-terminal sites (the
  final-week advance in `queries/progression.ts` and `endMesocycle`);
  `endMacrocycle` (logging.ts, beside its family) drives every open block
  terminal in position order — logged work ⇒ the `endMesocycle` path
  (`completed`, open sets skipped), never started + placeholders ⇒
  `abandoned` — then completes the macro. Irrevocable; logged history never
  touched (hard rule 5).
- **Freeze (§4.1):** `goalsEditRefusal` — a terminal macro refuses goals
  edits (rename/notes stay allowed); `attachMesoToMacro` +
  `manageMacroSlots` refuse placement/slot changes on a terminal macro (the
  spec's "already blocked by position guards" turned out not to exist — added
  them); the timeline's `+ PLAN` affordance and the End row disappear once
  frozen. The edit action surfaces the refusal as a form error.
- **Retrospective (§4.2):** pure `macroRetrospective` fold
  (`queries/macro-retrospective.ts`) — strength verdict = the PR #157
  est-strength rollup vs the **stored contract** (`target_*`, never the live
  recompute), fixed vocabulary (`within band` / `above band` / `below band` /
  `insufficient data` — the latter on a null headline, <
  `strength.min_sessions` qualifying lifts, or a bandless contract);
  informational (never lb-graded) on mass-goal macros; mass row **"not
  measured"** until N41/N34 body data brackets the span (the `bodyData` seam
  is in place, loss-direction grading included); demand aggregate =
  per-exercise `aggregateProgressionEvents` combined by
  `combineDemandSummaries` (earn/paced/held mix, pacer-vs-gate pressure,
  vanished share; null while the mode is inactive); adherence/volume tiles
  restated; block-outcome mix (`DONE · ABANDONED · NOT BUILT`). Assembled in
  `getMacroOverview` once `status = 'completed'`, so the Overview page and
  `get_macrocycle_summary` (new `retrospective` block + `status` field,
  `formatMacroRetrospective`) read **one fold** — parity-tested.
- **Tests** +24 (suite 1015 green): natural-close matrix incl. the mixed
  placeholder fixture, `planEndMacrocycle` matrix, freeze refusals, verdict
  goldens per band position + insufficient-data rules + never-proxy-graded
  mass + the Phase-4/5 bodyData seam, demand-combiner sums, MCP parity
  (values pass through unchanged; the summary block IS the fold). New e2e
  (`macrocycle-closeout.spec.ts`): end-macro flow → COMPLETE badge +
  retrospective renders (INSUFFICIENT DATA + 3 ABANDONED) + affordances gone.

**N40 → done (PR #171).** N41 (Phase 4, bodyweight series) unblocks on merge —
its mass-verdict rows slot into the retrospective's `bodyData` seam; N34 5b
likewise. Reconciliation sweep: **N37 archived** (PR #170 merged; row →
`archive.md`, live index trimmed).

## 2026-07-10 — Session 63: N37 built — doc 17 Phase 2 (`rate_source: "plan"` pacer branch)

Owner kicked off Phase 2 ("implement phase 2"). One PR (**#170**, branch
`claude/macrocycle-goals-phase-2-gncftk`); **no migration, no behavior
change** — every params row keeps `rate_source: "band"`, the flip is the v22
micro-bump at doc 17 Phase R3.

- **Engine:** `EngineInputs.planStrengthRate` (`{low, high} | null`,
  `.nullish()` no default — pre-existing stored inputs parse byte-identically);
  `pacerTargetRate` branches on `rate_source === "plan"` with a non-null plan
  rate (`lerp(planStrengthRate, band_position) × goal_rate_factor[goal]`),
  degrading to the bucket band otherwise — never unpaced, position + factor
  source-agnostic (N36 composes unchanged); `seedMeso` gains the matching opt
  so the seed-route earn shares the pacer.
- **Assembly:** new leaf `queries/plan-rate.ts` — `derivePlanStrengthRate`
  evaluates pure `planMacrocycle` on the live profile and reads the
  goal-independent `strengthRatePctMonth` (the Phase-1 carrier); self-gates
  null while the mode is inactive; never throws. Wired at the
  `progressionHistory` sites: meso-activation seed (`SeedCtx`), week advance
  (`WeekContext`), the projection, and standalone mesos via
  `engineGoal(null)` → hypertrophy. `profileToMacroProfile` moved into the
  leaf (macro → stats → generation would cycle); `macro.ts` re-exports.
- **Doc-14 treatment:** `planStrengthRate` added to `DERIVED_INPUT_KEYS`
  (fingerprint-excluded — bodyweight/bf%/age edits don't churn open rows),
  recorded in decision inputs, replayed **frozen** by the freshness recompute
  (advance + seed) and `replay_decisions` (a candidate flipping `rate_source`
  diffs honestly against recorded rates).
- **Docs:** PROGRESS entry; `manual-operations.md` gained the Phase R3
  runbook (propose v22 `rate_source: "plan"` → replay diff: paced/stepped mix
  shifts, no entitlement change → activate → monitor).
- **Tests** +16 (suite 991 green): plan-vs-band arithmetic, band_position
  composition, goal denomination (hypertrophy paces on the strength band ×
  0.75, never lb/mo), null-plan band fallback byte-identity, inert under
  "band"/absent block, fingerprint denylist + write/check parity, frozen
  replay (recompute + admin), assembly self-gate/standalone/never-throws.

**N37 → done (PR #170).** Phase R3 (the flip) unblocks once R1 (v20) + R2
(v21) are activated. Reconciliation sweep: **N21 archived** (PR #169 merged;
row → `archive.md`, live index trimmed).

## 2026-07-10 — Session 62: N21 built — doc 17 Phase 1 (v21 target correction + contract snapshot + birthdate)

Owner kicked off the doc-17 build ("implement phase 1"). One PR (**#169**, branch
`claude/macrocycle-goals-phase-1-9vs7z4`), everything gated per §2.6:

- **Engine (`macro.ts`):** strength band × `strength_sex_factor` {1,1} × age
  taper w/ strength floor 0.7 (target + `recommendDuration`); hypertrophy
  proximity model runs on a BMI-band bf% proxy when only bf% is missing
  (`bf_proxy_pct`; decay reserved for no-height/bw); cut cap now rescales the
  low endpoint proportionally (parameterless); `MacroPlan.strengthRatePctMonth`
  exposed for every goal (unrounded — the N37 pacer carrier). All three params
  `.optional()`; DEFAULT hash untouched (guarded).
- **Contract:** `macrocycles.plan_inputs` snapshot (resolved MacroProfile +
  params version) stamped at create + goals edits; `updateMacrocycle` gained
  the `isGoalsEdit` gate — rename/notes saves no longer re-price the contract
  (principle 3). `profiles.birthdate` replaces the static age as the age
  source (`profileAge`, int fallback); onboarding/profile UI swapped (fig 4.5,
  09-changelog 2026-07-10); MCP `get_profile` + More card read derived age.
- **Migrations:** `20260710000001` (plan_inputs + birthdate),
  `20260710000002` (v21 INACTIVE, hash `7017e257…b4316`).
- **Docs:** doc 10 §5 amended (incl. restating the strength target as
  measured by the §6 est-strength rollup); `manual-operations.md` gained the
  Phase R2 runbook (v21 replay diff ≈ empty expected → activate → re-enable
  target cards → owner re-saves birthdate). PROGRESS.md entry.
- **Tests** +23 (suite 975 green): §2.6 matrix (personalization goldens incl.
  the pinned legacy 60F=18M defect, continuity, cut rescale, carrier
  denomination, provenance hashes, birthdate derivation, `isGoalsEdit`).

**N21 → done (PR #169).** N37 (Phase 2) unblocks on merge; N40/N41/N34 remain
ready per doc 17 §9. Reconciliation sweep: nothing to archive (session-61
rows all current; #168 merged and already reflected).

## 2026-07-10 — Session 61: doc 17 — the macro-goals build spec; owner ratifications folded in; N42 swept

Owner ratified the architecture record (PR #166) with three updates and asked
for the complete phased implementation plan "similarly to how we just did
with the progression model." Shipped **`docs/17-macrocycle-goals.md`**
(authoritative build spec; where it conflicts with the architecture record,
17 wins; doc 16 untouched). PR #168. What changed against the record:

- **Closeout semantics (owner decision):** natural close when every
  positioned meso is terminal, or explicit **"End macrocycle"** irrevocably
  ending open work — the `endWorkout`/`endMesocycle` family one level up
  (logged → `endMesocycle`, never-started → `abandoned`); the record's
  end-date nudge is dropped (users may overrun the plan). Completed macros
  freeze.
- **PR #157 (est-strength rework, merged today) folded in:** the key-lifts
  fold is retired, so the N40 retrospective grades the **`strengthTrend`
  rollup** (headline + per-muscle) vs the contract band, and the create-flow
  priming line uses the same metric; the record's `key_lifts.n` drift note is
  moot. Doc 10 §5's "% on key lifts" target wording gets restated in the
  Phase-1 PR.
- **DEXA unblock (doc 15 §8, PR #167) + owner adoption:** N34 moves to
  ready — doc 17 Phase 5 (5a connect+import / 5b enrich+verdicts /
  5c engine+MCP), parallelizable from day one.
- **One carrier amendment:** the N37 plan rate rides a new goal-independent
  `MacroPlan.strengthRatePctMonth` (a mass-goal macro paces the strength
  dimension — `perMonthRate` is lb/mo there, the wrong field). Derived input
  named `planStrengthRate`.

Phase map (§9, one PR each): 1 = v21 target correction (+ contract
`plan_inputs`, `birthdate`) → 2 = plan-rate pacer branch → 3 = closeout +
retrospective → 4 = bodyweight series + priming → 5a–c = DEXA →
6 = envelope loop (field-data-gated) → R1–R4 = owner activations (v20 first,
v21 + card re-enable, `"plan"` flip via v22, monitor).

Notes-area maintenance in the same PR: merge-artifact **duplicate N21 and
N34 rows removed** (kept the newer of each); N21/N34/N36/N37/N40/N41 rows
point at their doc-17 phases (N34/N40/N41 → **ready**, types D→F); **N42
swept to `archive.md`** (done + PR #157 merged — the resume-protocol
reconciliation sweep); doc 17 added to the root `CLAUDE.md` doc list.

## 2026-07-10 — Session 60: PR #157 refresh — merged main ×2, N36→N40→N42 renumber, CI fixes

Owner asked to freshen the open est-strength PR (#157) against main and advise
for merge. Merged `origin/main` (post #161/#162/#167) into the branch:

- **All code auto-merged clean** (`engine/index.ts`, `engine/params.ts`,
  `queries/logging.ts`, doc 10) — conflicts were docs-only (this area +
  `PROGRESS.md`).
- **ID collision found and fixed:** the PR session filed the est-strength item
  as **N36**, but Session 58 (Phase R, merged first) filed the doc-16 deferred
  spine as **N36–N39**, and the second refresh merge hit the same collision
  again: PR #166 (N21 macrocycle-goals architecture, merged 2026-07-10) filed
  **N40/N41** (macro close + retrospective, bodyweight series). The
  est-strength item is renumbered **N42** (next free ID); main's N36 (envelope
  loop) and N40/N41 (architecture doc) stand. Code/spec never referenced the
  ID, so the renumbers are docs-only. Same story for the session number: the PR session
  was a parallel "Session 53" — left dated in place below, marked as a parallel
  branch.
- Full suite + typecheck re-run green on the merged tree.
- **Found + fixed the standing CI e2e failure (red since PR #160 — every run
  from #412 on, incl. main).** Reproduced locally against the local stack and
  pulled the Playwright trace: the Phase-3 progression e2e logged set 1 with
  `reps: 118` — the day-view weight-blur handler re-derives the reps input
  asynchronously, and at robot speed the test's `fill("8")` landed after that
  re-render with the selection collapsed, APPENDING to the predicted "11";
  the server correctly rejects reps > 100 (zod), the set never logs, the
  `uncheck set 1` assertion times out. Test-only fix in
  `tests/e2e/prescribed-progression.spec.ts`: blur the weight edit and wait
  for the re-derive to settle, then a fill-and-verify retry (`toPass`) for
  both sets. The app behaved correctly throughout (validation + rollback
  toast); no product code touched. PRs #160–#167 were merged over this red
  e2e — worth keeping an eye on "merged with failing CI" as a process slip.
- Migration `20260708000001` (e1rm_confidence) applied to the hosted project
  via the Supabase MCP pre-merge (additive; deployed main code ignores the
  column). Backfill verified: 10,918 stamped sets banded (all `low` — correct,
  `rir_reported` has no write surface yet), 1 null-e1RM row null.
- **GitHub Actions runners died account-wide at ~20:58 UTC** — runs #431–#433
  (incl. the run that would have exercised the e2e fix, and main's #166 merge)
  all failed in ~5s with `runner_id: 0` and no logs: no runner assigned,
  nothing executed. Human-only fix (billing/spending limit) — runbook section
  added to `docs/deployment/manual-operations.md` → "Restore GitHub Actions
  runners". The e2e fix is verified locally through the real stack; CI can't
  confirm it until runners return.

## 2026-07-10 — Session 59 (parallel): N21 macrocycle-goals architecture record (owner's four questions answered)

Owner asked for the end-to-end architecture of the macrocycle goal layer
around N21: (1) how do we get targets right, (2) how do we use them,
(3) how do we measure results and close the loop, (4) what persists across
macro boundaries. Answered in
**`docs/reviews/2026-07-10-macrocycle-goals-architecture.md`** (design record,
not a build — doc 16's authority untouched). PR #166. Highlights:

- **Frame:** confirmed the owner's cadence+pacing levers / envelope-tunes-
  within-bounds understanding; sharpened it — the engine-facing product of the
  whole macro layer is exactly one number (the expected monthly strength rate)
  plus two per-goal lookups (`goal_rate_factor`, `rep_window`); the loop closes
  at four nested timescales (entitlement / pacing / position / contract), the
  fourth of which had no design until now.
- **Q1 (set):** N21 defect recap + the input-quality ladder (self-reported →
  derived → measured → observed record); **contract-vs-estimate snapshot
  semantics named as designed behavior** (stored `target_*` = the contract,
  overwritten only by an explicit goal edit; live recompute = the estimate;
  retrospectives grade against the contract) + persist the `MacroProfile`
  inputs beside the target columns at create/edit (N21 slice). Hygiene finds:
  `profiles.age` is a static int (→ birthdate), `key_lifts` display uses
  top-3 vs the param's n=5 (`stats.ts:67-78`).
- **Q2 (use):** the two levers and the three non-levers (quantum size,
  entitlement, measured anchor); **N37 shape fixed** — plan rate stays a band
  lerped by `band_position`, arrives as a doc-14 derived input
  (fingerprint-excluded, replay-recorded), degrades toward `"band"` never
  unpaced.
- **Q3 (measure):** the per-goal measurement asymmetry (strength fully
  in-app; mass goals honestly ungradable until body data exists); **N36
  residence fixed** — per-user derived `band_position` fold over trailing
  decisions at seed time, params value as default, per-user grain, no new
  table; **macro close + retrospective designed** (nothing happens at macro
  end today — `status` never leaves `active`); filed as **N40**.
- **Q4 (carry):** the permanent record is the persistence layer — derive,
  don't duplicate (decisions + logged history already carry entitlement,
  pacing, position across every boundary). Persist only two things for
  measurement: the enriched contract snapshot and a **bodyweight time series**
  (filed as **N41**); observed-rate priming of the next macro's create flow is
  derive-on-read, display-only (never silently blended).

Backlog updates in the same PR: N21 row gains the architecture-doc pointer
(build scope unchanged, still next target); N36/N37 rows carry their decided
shapes; **N40** (macro close + retrospective, needs-input) and **N41**
(bodyweight series, needs-input) added to workstream C. Owner decision list in
the doc's §6 (7 decisions, each with a recommendation).

## 2026-07-10 — Session 59: N34 readiness probe — BodySpec build unblocked (doc 15 §8)

Owner asked whether the BodySpec integration is buildable now, and clarified
the deployment is **private single-user testing** — which reframed doc 15's
"Phase 0: email BodySpec" gate. A live probe of the auth server answered the
two questions that actually blocked the build:

- **OAuth client (§7-1): resolved.** The Keycloak realm exposes anonymous
  OIDC dynamic client registration — a live POST returned a working public
  PKCE client with arbitrary redirect URIs, no approval. The app self-registers
  its client at Phase-1 build time. (Probe left one inert throwaway client on
  their server, documented in §8.1.)
- **Refresh tokens (§7-2): resolved at realm level.** `offline_access` +
  `refresh_token` grant supported and granted to the probe client.
- **Residual risk (one):** a possible undocumented audience/scope check
  (`ext_api_token`) on the API itself — verifiable only via a real login;
  it's the first 5-minute check of Phase 1, fallback = the old Phase-0 email.

Doc 15 amended in place: §1.1/§5/§7 pointers + new **§8 addendum**
("build is unblocked for a private deployment"). N34 row updated —
Phase 0 is no longer an owner action; remaining owner input is the
adopt-&-phase decision (doc 15 §5). No code. Shipped as **PR #167**
(`claude/bodyspec-dexa-api-readiness-q5a25w`).

## 2026-07-09 — Session 58: N35 Phase R — activation prep + deferred spine filed + N21 primed

Phase R is a **runbook, not code** (doc 16 §10) — shipped as **PR #162**
(`claude/phase-r-implementation-gkmzol`). No engine change, no app change; the
branch carries docs + the applied-inactive v20 migration. Work done this
session:

**(1) Research pass — the activation gate.** `goal_rate_factor.hypertrophy`
resolved: **keep 0.75** (do NOT collapse to 1.0). New evidence doc
`docs/reviews/2026-07-09-goal-rate-factor-research.md` (doc-10 house style,
evidence labels): moderate-load (8–12) 1RM conversion runs ~0.56–0.73 of
heavy-load (3–5) in the one head-to-head that isolates rep zone
(Schoenfeld 2016 squat 0.56 / bench 0.73), consistent with the load-continuum
meta (Schoenfeld 2017) + volume-matched trials (Lasevicius 2018, Campos 2002).
0.75 is the conservative-for-a-*governor* top of that band — the pacer only
delays, so erring high lets earned performance through. v20 already carries
0.75, so **no params edit** — the finding validates the shipped value.

**(2) v20 applied INACTIVE + replay diff.** Migration
`20260709000001_engine_params_v20_prescribed_progression.sql` applied to hosted
via the Supabase MCP, hash-verified `cb451a02…c90287` (matches
`params-provenance.test.ts`); v19 remains active, nothing changes for users.
`replay_decisions` candidate v20: **v19→v20 = 15 source / 11 changed / 0 errors**
(all diffs are earned steps on compliant advance/seed working weeks — reprice up
one quantum, e.g. Hack Squat 110→112.5, or a +1 rep climb; lattice snaps to
window-bottom); broader 100-decision replay = 80 unchanged / 20 changed / 0
errors (unchanged = seeds/deloads/gate-failures, byte-identical as designed).
This is the diff the owner reviews before activating.

**(3) Runbook.** `docs/deployment/manual-operations.md` gained the "Activate
engine_params v20" section (5 steps: research ✓ / replay ✓ / owner review /
activate via admin MCP `activate_engine_params` / monitor via
`get_engine_decisions` + `get_progression_history`), plus the increment
recommendation and the plan-rate/envelope unblock note.

**(4) Deferred spine filed — N36–N39.** The doc 16 §11 deferred items are now
first-class high-priority backlog rows (workstream **P**, new), each pointing
back to doc 16 §11: **N36** envelope loop (blocked on v20-active + field data +
N21), **N37** `rate_source:"plan"` pacer branch (blocked on N21), **N38**
required honest-RIR confirmation + capture affordance, **N39** per-exercise
progression-off override. README workstream roster + doc 16 §11 updated with
the IDs.

**(5) N21 primed as NEXT TARGET.** New scoping doc
`docs/reviews/2026-07-09-n21-strength-rate-priming.md`: re-verified the audit
(strength target is bucket-only — age/sex applied only to hypertrophy; model
flip on profile completeness; cut-range collapse), researched the missing
modifiers (**strength `sexFactor ≈ 1.0`, NOT the hypertrophy 0.7** — relative
1RM gains are sex-equal, Roberts 2020 / Refalo 2025; apply `ageMultiplier` with
a possibly higher strength floor, Peterson 2010 neural-gain preservation),
proposed a v21 shape that exposes the personalized `perMonthRate` the
`rate_source:"plan"` flip reads, and laid out the
Phase-R → N21 → plan-rate → envelope sequence. N21 elevated MED→HIGH (it blocks
N37 + N36).

N35 row → Phase R prepped; stays live until v20 is activated (owner) and the
deferred rows are picked up. Next target: **N21**.

## 2026-07-09 — Session 57: N35 build Phase 4 — audit aggregate (doc 16 §8.3/§10)

Fourth (final code) build slice of doc 16 shipped as **PR #161**
(`claude/prescribed-progression-phase-4-d9pzs5`). Read-side only — no schema
change, no migration, no engine change; while v20 stays INACTIVE no decision
carries a progression step, so the new surface honestly reads empty.

Landed: admin MCP tool `get_progression_history` (role-gated Slice-4 roster;
caller's own decisions only, hard rule 5) — per exercise: earn/miss/skip
status mix, governor firings (`paced` by governor), gate failures
(`not_earned` by first failing predicate), the `vanished` share of asks
(§8.3's increment-sizing signal → the doc 10 §8 finer-increments decision),
earned-then-met/missed/unanswered ask pairing (the miss throttle's pairing,
surfaced) + `open_ask`, trailing prescribed vs measured gain (%/30d, pacer's
7-day span floor, deloads excluded), and a bounded chronological event
series. Pure fold in `queries/progression-history.ts`
(`toProgressionAuditEvent` + `aggregateProgressionEvents`, re-exported via
`queries/progression.ts`); fetch + labels in
`queries/engine-admin.ts::getProgressionHistory` (trace-rule JSONB
containment, 2000-row window with truncation note); doc 05 admin table row.
`v_progression_events` deliberately NOT built — §10 gates the view on a stats
screen wanting it and none does; deferral recorded in PROGRESS.md. Tests +9
(suite 941).

N35 row → Phase 4 shipped; doc-16 build-out complete. Remaining: Phase R
(owner-gated activation incl. the hypertrophy-factor research pass — runbook,
not code).

## 2026-07-09 — Session 56: N35 build Phase 3 — day-view coupling + three-state markers (doc 16 §10)

Third build slice of doc 16 shipped as **PR #160**
(`claude/prescribed-progression-phase-3-4etoto`). No engine-output change and
no migration — with the v20 block (still INACTIVE) absent, no decision ever
records a target anchor, so every fallback path is byte-identical to today.

Landed: the day read (`queries/logging.ts`) carries `prescription_anchor` per
exercise — the target `A* = A + δ` from the `stepped` progression step of the
LATEST `engine_decisions` row (every reprice records a fresh decision, so a
superseded step can't leak a stale lead; read ungated so the coupling stays
honest in the deactivation window). `SetRow`'s live predictor prices off
`prescription_anchor ?? e1rm_anchor` (§5.2) — a weight edit re-derives reps
faithful to the prescribed target including the earned lead; the measured
anchor stays the basis everywhere else. Markers go three-state (§5.3):
`loggedSetMarker` now delegates to the engine's `setComplianceMarker` — the
earn gate's comparison made visible, structurally unable to diverge — with
the band params-fed (`progression.compliance_band` absorbed `MARKER_BAND`).
Glyphs ▲/■/▼ small ink, house-style (rule-8 pass re-verified: no mockup
figure exists for the set-row marker; 09-changelog 2026-07-09 entry is the
authoritative treatment). WS-J bundle guard extended to pin
`rules/progression.ts` + `rules/feedback.ts` zod-free in the client chunk.
Tests +13 (suite 932): three-state day-rules, the marker ⇄ earn-gate
agreement fixture (8 scenarios), extended guard; new e2e
(`prescribed-progression.spec.ts`) drives a fabricated stepped decision
through the real UI — earned prescription renders, weight edit re-derives
off the recorded target, met/under markers reflect the shared comparison.

N35 row → Phase 3 shipped. Next per 16 §10: Phase 4 (optional audit
aggregate, post field data), Phase R (owner-gated activation).

## 2026-07-09 — Session 55: N35 build Phase 2 — seed route / meso-over-meso carry (doc 16 §10)

Second build slice of doc 16 shipped as **PR #159**
(`claude/prescribed-progression-phase-2-uzc3ff`). No migration — v20
(INACTIVE) already carries the block; with it absent every seed output,
recorded input, fingerprint, and trace stays byte-identical (pinned).

Landed: `seedMeso` doc-16 §3.7 wrapper — the caller supplies the prior meso's
final working session (`earn` opt + `progressionHistory` +
`daysSincePreviousSession`) and the seed evaluates it through the SAME
`assessProgression` gate + governors as the advance chain, re-prices the
anchor-parameterized `seedCore` off `A* = A + δ`, and shares the extracted
`applyRealizedAsk` §3.3 rule verbatim (vanished retains the earn;
`max_pct_per_step`; `stepped` announces the target). New derived
`EngineInputs.seedEarn` (doc 14 §3 denylisted, recorded for replay).
Earned-at-close derivation in the new leaf `queries/seed-progression.ts`
(most recent completed WORKING session per exercise — deloads excluded, so
the earn crosses the deload boundary; `max_gap_days` decides honesty).
Caller plumbing per the §10 site list: `startMeso` earns; plan-edit adds +
slot swaps never (no compliance context; slot path forwards `isDeload`);
`recomputeSeed` + admin `replay_decisions` replay the recorded earn frozen
with the anchor refreshed. `progressionHistory` assembly moved to the leaf
`queries/progression-history.ts` (generation ↔ progression cycle), re-exported
from `progression.ts`. Tests +23 (suite 919): seed↔advance parity (same δ,
same A* — by construction via the shared gate), meso-over-meso golden (the
memo's acceptance case: fixed point absent, meso 2 opens above meso 1
active), deload-boundary carry + staleness cutoff, gate/governor cases on the
seed, bodyweight rep-cap vanish, doc-14 fingerprint parity, replay
determinism.

N35 row → Phase 2 shipped. Next per 16 §10: Phase 3 (day-view coupling +
three-state markers, hard-rule-8 mockup pass), Phase 4 (optional audit
aggregate), Phase R (owner-gated activation).

## 2026-07-09 — Session 54: N35 build Phase 1 — engine core + advance chain (doc 16 §10)

First build slice of doc 16 shipped as **PR #158**
(`claude/prescribed-progression-phase-1-vgi63a`). Ships INACTIVE — engine_params **v20**
(`20260709000001`) carries the `progression` block; with it absent every
output, fingerprint, and trace is byte-identical (pinned by the treadmill
golden, which also reproduces the doc-16 §7 worked example verbatim:
145×8@3 → earned 150×9@2 targeting e1RM 203.0 → measured 205.0).

Landed: `src/lib/engine/rules/progression.ts` (earn gate with e1RM-space
per-set compliance via the shared three-state comparison, governors —
cadence / macro-rate pacer / miss throttle / peak-week — and the quantum δ);
`prescribe()` threading (`A*` as an anchor-input substitution, deadband
carve-out on earned pricing, realized-ask rule after rounding with
retry-not-stack `vanished` + `max_pct_per_step` + the `bodyweight_only`
substitution nudge, always-on status-coded `progression` trace step, grading
pinned to the measured anchor); `progressionHistory` +
`daysSincePreviousSession` derived inputs (doc 14 §3 denylist, recorded for
replay) with assembly in `queries/progression.ts` (90-day lookback,
normalized %/30d pacer rate, miss/re-arm derivation) wired into `generateDay`
and `projectNextPrescription`; `get_engine_decisions` rule/status filter
(§8.3); doc 10 §4 + doc 13 §9.2 pointers to doc 16; the stale
"standalone → gain" comment corrected (follow-up 2 §5). Full §10 Phase-1
test matrix green (+49 tests; suite 896).

N35 row → **in-progress, Phase 1 shipped**. Next per 16 §10: Phase 2 (seed
route), Phase 3 (day-view coupling + markers), Phase 4 (optional audit
aggregate), Phase R (owner-gated activation).

## 2026-07-09 — Session 53 (cont.): Batch 15 — N35 follow-up #3 + design finalized (doc 16)

Owner's third follow-up (Batch 15 verbatim in the appendix) answered in
[`docs/reviews/2026-07-09-prescribed-progression-followup-3.md`](../reviews/2026-07-09-prescribed-progression-followup-3.md),
and the design **finalized** as
[`docs/16-prescribed-progression.md`](../16-prescribed-progression.md) —
the authoritative build spec consolidating the memo + review + follow-ups
1–3 (doc 16 wins over the whole thread; root `CLAUDE.md` docs list updated).

Substance: (1) **Vanished earns — the owner's accumulation assumption is
corrected** (the "worth discussing before implementation" branch): "earn
retained" = the single-quantum entitlement is *retried* (re-armed at
`A + δ` off the measured anchor), never *stacked* (`A + kδ` never exists) —
stacking is the compounding-unconfirmed-credit failure the no-compounding
rule forbids, and it would eventually demand a multi-quantum leap on
exactly the lift least able to absorb it. Coarse-increment lifts don't
need it: `step: "min"` picks the rep axis, each performed quantum banks in
the measured anchor (the anchor IS the accumulator), and the top-of-window
reset — which this design finally makes reachable — converts the banked
rep gains into the load step. True dead-ends (window cap + oversized plate
jump; `bodyweight_only` ceiling) get equipment/product answers (increment
override, doc 10 §8, substitution nudge), not credit. (2) Prefill
flow-through confirmed automatic. (3) **Owner rulings adopted:** the live
day-view predictor prices off the prescription-basis target anchor (A*
when stepped — flips review §7.1's deferral; `logging.ts:335` /
`DayView.tsx:1339` today read the measured anchor), and the earn gate
moves to **e1RM-space per-set compliance** — not the literal weight×reps
pair, which broke under athlete-owned weight edits — sharing the P19
`loggedSetMarker` comparison (grinder guard intrinsic: reported-low-RIR
scores under). (4) Markers go **three-state (over/met/under)**;
`MARKER_BAND` moves into params as `compliance_band` so marker, gate, and
grading read one tunable; "met" glyph is mockup-governed (09 entry at
build). N35 → **ready (build)**: phases in doc 16 §10 (engine core → seed
→ day-view/markers → audit aggregate → owner-gated activation with the
hypertrophy-factor research pass); implementation in new sessions.

## 2026-07-09 — Session 53 (cont.): Batch 14 — N35 follow-up #2 (auditability, band_position, envelope, standalone)

Owner responded again (same PR #156 thread); captured verbatim as **Batch
14** and answered in
[`docs/reviews/2026-07-09-prescribed-progression-followup-2.md`](../reviews/2026-07-09-prescribed-progression-followup-2.md)
(amends follow-up 1 where they conflict).

Substance: (1) **Auditability** — the substrate already exists
(`engine_decisions` inputs/output + structured trace + explain/replay/
simulate MCP tools); amendment: the progression trace becomes **always-on
and status-coded** (stepped / vanished / paced / not_earned, with a
structured payload naming the governor or failing predicate) — follow-up 1's
"no trace when the ask vanishes" refined to "never *claim*, always
*record*". Line drawn: record at decision grain (Phase 1), aggregate
read-side only (`get_engine_decisions` filter now; admin
`get_progression_history` once field data exists), feed back into
prescriptions only as a doc-14 derived input (= the envelope, Phase 3). The
history does NOT duplicate `v_exercise_history`: it's demand-side +
relational (earn/miss/skip stream, governor firings, prescribed-vs-measured
gap) — none of it exists elsewhere. (2) **Pacing decoupling confirmed**: the
pacer reads the `strength_pct_month` *band table* (a param), none of
`planMacrocycle`'s heuristic projections; the quantum is mechanical
(increment/rep), never band-derived; `rate_source: "plan"` is the one
explicit opt-in coupling. (3) **`band_position` (0–1, default 0.5)**
replaces the band_mid/band_top enum — continuous, tunable, and deliberately
the same knob the owner's **envelope loop** (adopted as the Phase-3 shape)
will drive: performance moves position *within* the macro envelope, at meso
boundaries, hysteretic, from demand-side outcomes — bounded by construction,
replay-exact (position recorded in decision inputs). (4) **Standalone
mesos**: nothing extra needed — goal resolves via `engineGoal(null)` →
hypertrophy, the band keys off the profile bucket, history is per
user × exercise across meso/macro boundaries; post-N21 "plan" works too
(pure function). Flagged the stale "standalone → gain" comment
(`progression.ts:1129`) for cleanup in the build PR. N35 stays needs-input;
updated decision list in follow-up 2 §6.

## 2026-07-08 — Session 53: Batch 13 — N35 follow-up answered, design amended (macro-rate pacing)

Owner responded to the N35 review with four threads; captured verbatim as
**Batch 13** in the appendix and answered in
[`docs/reviews/2026-07-08-prescribed-progression-followup.md`](../reviews/2026-07-08-prescribed-progression-followup.md)
(which amends the 2026-07-07 review — follow-up wins on conflict).

Substance: (1) convergence confirmed; "when" restated as earned + once per
microcycle at most + rate-paced. (2) The "progressing twice" concern:
half-dissolved (the ramp rep is reserve drawdown — zero capacity ask;
capacity ask is exactly one quantum/week), half-adopted (ungoverned
per-microcycle stepping ≈ 10–15%/mo is too aggressive — resolved by the
owner's own macro-rate idea). (3) **Design amendment:** the §6.6 rate
ceiling is promoted to a **macro-rate pacer** (macro sets the expected
strength rate, meso paces earned quanta to it; hard boundary: budget never
quota — the rate meters the ask, only performance mints it) and the
per-goal booleans become **per-goal rate factors** (strength 1.0,
hypertrophy 0.75 [HEURISTIC — research pass before v20], cut/maintain 0);
ships in Phase 1 (backward-compatible generalization of the ceiling);
`rate_source: "plan"` is the post-N21 personalization flip (N21 row
cross-linked). (4) Misc answered: the `moderate` confidence ceiling under
compliant hypertrophy is intentional (estimate-accuracy honesty, doc 10 §9
— only gates needed fixing, already done); "reported RIR" is
`logged_sets.rir_reported` — a real optional column honored everywhere on
read but with **no write surface today** (DayView logs null always), so
review §10 Q6 is now explicitly a two-part decision (engine rule + capture
affordance + narrow doc-11 premise amendment). Updated owner-decision list
in the follow-up's §6; N35 stays needs-input.

Reconciliation sweep ran clean (no merged-but-live rows; N1 in-progress,
N21/N34/N35 open).

## 2026-07-08 — Session 53 (parallel branch): est-strength rework — recent-vs-baseline rolling trend (N42, filed as N36)

Owner flagged that aggregated macrocycle "est. strength" dropped the moment a
new meso started, and suspected (a) the in-progress block factoring in and
(b) volatility from a pure first→last two-point delta. Investigation confirmed
both, compounding: the RIR ramp makes a fresh block open light, so its opener
became the `last` endpoint and cratered every continuing lift. Also found the
Overview tile (top-3 key-lift mean) and the Performance tab (muscle rollup)
were *different* aggregations that could disagree (the archived N16 fix only
partially closed this).

Reworked the whole metric bottom-up (owner-approved design), shipped as **N42** (filed as N36 in-session; renumbered at merge — see Session 60):
- **engine/strength.ts** (pure, golden-tested): `strengthTrend` = best of the
  most-recent window vs best of the earliest, symmetric non-overlapping windows
  (`engine_params.strength`, `.optional()` so no params-hash churn — replay
  safe; falls back to `DEFAULT_STRENGTH`). `volumeWeightedMean` helper.
- **queries/stats.ts + macro.ts**: `foldProgressScores` uses it; muscle rollup
  unchanged (role-weighted, PH37); headline = **volume-weighted mean of the
  muscle changes** (fractional-set weights), shared by the Overview tile and
  Performance tab so they're identical by construction (finishes N16). Dropped
  `keyLiftStrengthPct`.
- **Confidence stored** (`logged_sets.e1rm_confidence`, migration
  `20260708000001` + backfill; stamped at log/amend, restamped on e1rm-block
  change) — auditability (owner: "log it").
- **Clarity** (owner: info buttons over terse one-liners): glossary rewrites
  (e1rm now states RIR/effective-reps plainly; new `est_strength`,
  `e1rm_confidence` cards), InfoDots on the macro tile + strength sections, and
  **RIR denoted next to e1RM in the history flip view**.
- Session value stays the **session average** e1RM (N2 kept, per owner).
- Verified on live data: Bench Press −7.3%→−3.8% (single opener corrected),
  Machine Chest Supported Row −32%→−31.7% (genuine decline honestly preserved).

Spec updated: `docs/10-metrics-spec.md` §1 (confidence persisted), §6 (est.
strength redefined), §8 (`strength` param block). Relates to / supersedes the
archived N16; extends N9's muscle rollup. Ships as PR on
`claude/macrocycle-strength-estimates-wdbefl`.


## 2026-07-07 — Session 52: Batch 12 intake — prescribed e1RM progression review (N35)

Owner handed over a memo ("Updates to the Prescription Engine", uploaded
.docx): the engine captures e1RM progress but never *prescribes* it — exact
compliance never advances the anchor. The memo drafts a double-progression
fix, withdraws it as flawed, and asks on what basis the e1RM should advance.

Intake: verbatim text captured as **Batch 12** in the appendix; one new item
**N35** (D→F, HIGH, needs-input). Reconciliation sweep ran clean (nothing
merged-but-live; live index is N1 in-progress, N21/N34/N35 open).

Analysis delivered as
[`docs/reviews/2026-07-07-prescribed-progression-review.md`](../reviews/2026-07-07-prescribed-progression-review.md):
the memo's diagnosis is **confirmed exact** — prescription and measurement
invert the same `e1rmFactor` curve, the Option-A climb is RIR-neutral by
design (R24a), and the seed reprices the unchanged anchor; verified by running
the real engine (three consecutive byte-identical mesos, anchor pinned at
198.2). Recommended design: never bump the *measured* e1RM (T-I5); prescribe
from a target anchor `A* = anchor + one earned quantum` — explicit all-sets
compliance gate (incl. workload + staleness), `min(weight, rep)` quantum with
a realized-ask rule, no compounding of unconfirmed leads, governed by
per-microcycle cadence + a doc-10 §5 rate ceiling + a miss throttle — as a
param-gated `progression` block (v20), phased advance-chain → seed-route →
deeper macro coupling (after N21). The design was hardened by a hostile
review (fixed: an inert `high` confidence floor for hypertrophy, the
checkbox-logging runaway asymmetry, per-session vs per-week rate arithmetic,
gate predicate gaps, a deadband corner, the `bodyweight_only` rep-cap dead
end). Six open questions for the owner in the review's §10.

## 2026-07-05 — Session 51 (cont.): CI fix + hosted deploy + in-session sweep (PR #153)

PR #152 merged with the rls-tests job red — root-caused to a PRE-EXISTING
#151 regression: `unstable_cache` (reference cache, WS-J #7) throws its E469
`incrementalCache missing` invariant when the vitest integration suite runs
the query layer outside the Next runtime; the first throw cascaded through
write-pipeline.test.ts. Fixed on PR #153 (accessors fall back to the same
uncached loader on exactly that invariant; rls-tests green on the PR) — noted
as a #7 amendment on the N1 row.

Hosted deploy done in-session per the owner's go-ahead: migrations
`20260705000001` (v19, hash verified) + `20260705000002` (`rir_schedule`)
applied via the Supabase MCP; `replay_decisions` for v19 over v18-sourced
decisions returned **0 changed / 0 errors** (all 26 are week-1 seeds — the
v19 gates live in the advance path, pinned by the goldens); v19 **activated**
via the admin MCP `activate_engine_params` (hook ran; e1RM restamp no-op,
e1rm block unchanged). v18 is the rollback target.

Both PRs merged in-session → reconciliation sweep ran in-session: **R24, R25,
N18, N29 archived** ("Swept 2026-07-05 (later 2)"). Live index is now: N1
(WS-J Phase-3 remainder, as measured), N21 (needs-decision), N34
(needs-input), PH30 (deferred), the answered Q rows, and T-A5 (deferred).

## 2026-07-05 — Session 51: four closures — N29 FilterBar, N18-B per-week RIR, R24 + R25 remainders (PR #152)

Resume-protocol sweep first: no stale `done` rows. The owner asked for the
unblocked R24/R25 remainders + N29 FilterBar + N18-B, with design authority
delegated. All four shipped on PR #152, one commit each:

- **N29 → done.** Shared `FilterBar` primitive (the fig 3.1 two-axis chip
  grammar generalized); exercises refactored onto it, templates tab + picker
  swap their selects for chips via one `TemplateFilterPanel` (duplicated
  search-form block collapsed; `TemplateFilters.tsx` retired), planner
  picker's equipment row adopts it. 09 entry.
- **N18 → done.** Part B: `mesocycles.rir_schedule` (migration
  `20260705000002`), `rirRamp(schedule?)`, week-1 seed reads the ramp not
  `rir_start`, `mesoStaleSignature` gains the column (the only freshness
  change — the fingerprint already carried `week.targetRir`, exactly as
  doc 14's worked example predicted; dated amendment added), shared
  `RirScheduleEditor` behind both sheets' ADVANCED disclosure, MCP
  create/update/read support. Copy/duplicate carry it.
- **R24 → done.** Hold-week reprice-down investigated: two mechanisms —
  (a) the Option-A climb's unconditional `prevReps + 1` breaks the doc 13
  §9.2 constant-effective-reps invariant on ramp-hold weeks (the default
  ramp holds at wk 2→3, so this was routine, not rare); (b) anchor decay
  prices an identical hold lower in wk N+1. Fixed as engine_params **v19**
  (INACTIVE; `climb_requires_rir_step` + `hold_week_anchor_deadband` —
  deadband absorbs sub-step decay only, a full-step fall is real signal).
  Previously-unpinned ramp-hold case now golden under both param sets.
  Runbook v19 step added; activation is an owner action after a replay diff.
- **R25 → done.** Error contract converged at the composition-root wrapper
  (`{ok:false}` refusals now also `isError`); `place_mesocycle` and
  `list_engine_params` retired into `manage_macrocycle_slots`/
  `get_engine_params`; preview vs muscle-balance kept split deliberately
  (plan-pre-start vs trained-weeks — muscle_balance is empty for a draft)
  with cross-referencing descriptions; docs/05 drift fixed (stale
  regenerate tool row, summary-tool names, resource list) + new
  Failure-contract section.

Green: typecheck, lint, 847 tests (+27), production build. Archive sweep for
these rows falls to the next session after PR #152 merges.

## 2026-07-05 — Session 50: WS-J Phase 2 closed — #7 reference cache built, #5 dropped (PR #151)

Resume-protocol sweep first: no stale `done` rows (48/49 swept in-session;
N29/N34 correctly live). Picked the highest-priority open item — **N1**'s
remaining Phase-2 pair — and closed the phase:

- **#7 shipped.** New `queries/reference.ts`: `muscle_groups` (12 rows, 8+
  call sites incl. every day-view open) and the stock exercise library +
  links (330 + 352 rows; `/exercises`, planner, add-exercise sheet) now serve
  from the shared Next Data Cache (`unstable_cache`, 1 h TTL, `ref:*` tags),
  read through the service client scoped to global rows only. `exercises.ts`
  merges live per-user custom rows/links over the cached stock
  (`loadLibrary`/`mergeLibrary`/`filterLibraryExercises`, pure + tested);
  `listMuscleGroups` is now zero-arg (7 call sites updated). Static test
  guards that nothing per-user can enter the shared cache. Live-verified
  352/352 stock links via PostgREST against the hosted project.
- **#5 dropped** with rationale in `J-performance.md`: #7 made only global
  reference data cacheable and no mutation touches it; per-user reads stay
  uncached per doc 14's pull-based freshness; the existing `revalidatePath`
  pair is the correct router-cache bust for the user's own edits.

Phase 2 is now fully dispositioned (#1–#10 all shipped/rejected with reasons).
N1 row narrowed to Phase-3 (streaming/decomposition, as measured). Green:
typecheck, lint, 820 tests (+9), production build.

## 2026-07-05 — Session 49: BodySpec DEXA integration assessment (N34)

Owner requested a full assessment of integrating BodySpec's DEXA-scan API
(scan booked for Tuesday). Intake as **Batch 11 → N34** (F, MED,
needs-input). Deliverable: **`docs/15-bodyspec-dexa-integration.md`** —
API assessment (OpenAPI v0.14.3 fetched live: user-tier OAuth2/PKCE via
Keycloak, pull-only — webhooks are partner-tier; full scan history via
paginated results; composition/bone/percentiles/VAT/RMR sections), proposed
schema (`body_scans` time series + `external_connections` +
`v_body_comp_history`; scan facts treated as *derived* inputs per doc 14,
like bodyweight), engine direction (measured FFM/FFMI into `planMacrocycle`
targets only — never set/week-level autoregulation; ties into N21's model
correction), genuinely-new capabilities (outcome verdicts for macros, cut
lean-retention, percentile positioning, RMR context), LSC/same-scanner
honesty guardrails, 4-phase build sketch. Phase 0 (OAuth client
registration, refresh-token story) is an owner email to
dev-support@bodyspec.com. Adoption would amend doc 01's out-of-scope line.

## 2026-07-05 — Session 48 (cont. 2): PR #148 merged — in-session sweep

PR #148 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N25 archived** (`archive.md`, "Swept
2026-07-05 (later)"). **N29 stays live** — the picker half shipped in #148
but the chip-based FilterBar unification remains (row: in-progress). Docs-only
follow-up PR on the branch restarted from merged main (same name). Live index
is now: N1 (WS-J remainder), N18-B (per-week RIR), N21 (needs-decision), N29
(FilterBar), PH30 deferred, R24/R25 remainders.

## 2026-07-05 — Session 48 (cont.): N25 + N29-picker built (PR #148)

Picked the two `ready` items after the sweep; both shipped on PR #148
(N25 row → done; N29 row → in-progress, picker half done):

- **N25** — `src/lib/glossary.ts` (11 terms; copy-contract test enforces
  all-caps labels, no exclamation marks, card-sized bodies, the e1RM/deload
  honesty guardrails) + `components/ui/InfoDot.tsx` (the feedback sheet's
  circled-"i" grammar → anchored square glossary card, AnchoredMenu
  placement, modal a11y + refcounted scroll lock so it stacks over sheets).
  Migrated the two ad-hoc pump/workload explainers (workload no longer
  auto-expands — deliberate, recorded in 09). Wave-1 placements across
  day view, meso header/edit sheets, planner, stats, exercise page.
  09 entry "2026-07-05"; PROGRESS record.
- **N29 (picker)** — from-template picker reuses `TemplateFilters`
  unchanged; days/emphasis/gender threaded into `listTemplates`; the search
  form preserves active filters. FilterBar unification remains open.

Green: typecheck, lint, 811 tests (+5), production build.

## 2026-07-05 — Session 48: reconciliation sweep — archive N33 + T-N33 (PR #147 merged)

Resume-protocol sweep: PR #147 confirmed merged (`b9ba057`) → **N33** and
**T-N33** rows swept to `archive.md` ("Swept 2026-07-05"). Live index is now:
N1 (WS-J remainder: Phase-2 #5/#7 caching pair + Phase-3 as measured), N18-B
(per-week RIR schedule), N21 (target-engine needs-decision), N25 (InfoDot +
glossary, ready), N29 (picker filters ready / FilterBar triaged), PH30
deferred, R24/R25 remainders. Session continues with the ready build slice
(N25 + N29 picker) — see the next entry.

## 2026-07-05 — Session 47 (cont. 3): N33 + T-N33 built (PR #147)

Owner: "Go ahead and build N33 and T-N33." Both shipped on the open PR #147
branch (rows → done; archive sweep falls to the next session after merge):

- **N33** — new `queries/slot-prescription.ts` resolver: swap
  (`replaceWorkoutExercise`) and add (`addWorkoutExercises`) both compute via
  the engine with the kind derived from the data (advance off the §9 lookback
  source — most recent same-day-slot instance with logged working sets within
  2 weeks, set-less N-1 fallback for generation parity — else the doc 14 §6.2
  cold seed); full tuple + rationale + fingerprint + decision written
  (`seed-decisions.ts` generalized to carry kind/source). Reconcile gains the
  S2 exercise-identity replay guard (`dropForeignDecisions`) and the same §9
  lookback in the §7c backfill (`advanceSourceKeys` + set-presence
  preference). Detail sheet gains the S4 out-of-band tripwire (decision
  output numbers compared to the live row; the false "re-verified" line is
  replaced by an explicit "set outside the engine" note on divergence).
  Golden test reproduces the owner's W5·D2 case: swap-back restores
  **215×10@6RIR·2 sets**. Doc 14 §6.2 carries a dated amendment.
- **T-N33** — `queries/e1rm-restamp.ts` wired into the MCP
  `activate_engine_params` tool: when the incoming version's `e1rm` block
  differs from the outgoing one, all `logged_sets.e1rm` stamps recompute
  under the new params (same rule as log time), changed rows rewritten via
  chunked PK upserts (service client, idempotent), counts in the tool
  result. Golden test: 245×15 restamps 384.2 → 367.5. Caveat documented:
  migration-activated versions bypass the hook.

Green: typecheck, lint, 805 tests (+27: slot resolver, lookback selection,
replay guard, audit matcher, restamp planner, advance-kind decisions),
production build. PROGRESS.md entry "2026-07-05 (latest)".

## 2026-07-04 — Session 47 (cont. 2): T-N33 decided (restamp on activation) + anchor-selection Q&A

Owner decided **T-N33: restamp `logged_sets.e1rm` on params activation**
(row → decided/ready; scope note: restamp only when the activation changes
the `e1rm` block, batch per-user, service-role — derived column, not logged
truth, so hard rule #5 is not implicated). Second follow-up question
answered (chat + review doc §8.2): `session_best` scores sets by estimate ×
recency decay (half-life 30 d) and anchors on the winner's session at its
**undecayed** confidence-weighted mean — the 7-day-old 245×15 (367.5 → ≈312
after decay) lost to the fresh 285×7 (≈347), so the 07-01 session anchored
at 331.9. Verbatim in **Batch 10 addendum 2**.

## 2026-07-04 — Session 47 (cont.): Batch 10 addendum — owner follow-up folded into N33

Owner follow-up on the findings (verbatim = **Batch 10 addendum** in the
appendix): (1) advance-first also applies to the **add** path (remove →
re-add = the same lineage break) — folded into N33/S1 as one shared resolver;
(2) "cold seed" defined in review doc §8.1 (no in-meso `previous`; precedence
anchor → plan initial → unseeded — history still flows in via the anchor);
(3) the 384-vs-367.5 anchor question **resolved** (§8.2, verified against the
params registry: the history surface shows log-time per-set stamps under the
pre-v11 averaged formula, the anchor recomputes live under the v11
`brzycki_max_eff_reps=10` cutoff → Epley-only 367.5; W5 anchor 331.9 = mean
of the 285×7/4 session's estimates) — spawned **T-N33** (needs-input: restamp
/ compute-live / label the stale stored e1RMs); (4) missed-week lookback
designed in §9 (N-1 → K=2, same-day-slot, source must have logged working
sets, trace discloses the gap) — key finding: plain skips already advance
today (`generateDay` passes empty actualSets → anchor reprice/hold); only a
swapped-away/removed week breaks the chain, which the lookback + S1 fix.

## 2026-07-04 — Session 47: Batch 10 intake — swap/prescription provenance investigation (N33)

Owner raised an in-chat investigation request with a W5·D2 screenshot: after a
deload-week swap-out/swap-back of Deadlift, the day view filled 245×5, the menu
note said "swapped in at your all-time best 245 × 15", and the detail sheet
showed 245×15·2·6RIR over a V17 DELOAD trace (215×10) with a "re-verified under
V18 — unchanged" line. Verbatim = **backlog appendix Batch 10**, all → **N33**
(B, HIGH, WS-G, `ready`).

Investigated end-to-end (code + the live `engine_decisions` audit trail via
MCP); full findings + solution assessment in
[`docs/reviews/2026-07-04-swap-prescription-provenance.md`](../reviews/2026-07-04-swap-prescription-provenance.md).
Root causes: `replaceWorkoutExercise` writes PR weight/reps **out-of-band**
(no engine call, no decision, no fingerprint restamp — the add path was
brought into doc 14 §6.2, the swap path never was), and the freshness
framework is **blind to exercise identity** (not in the fingerprint; replay
never compares `decision.exercise_id` to the row), so the swap busts neither
the meso stale gate nor the row fingerprint and the reconcile re-certifies
hand-written numbers. The displayed 245×5 is the day view's anchor predictor
(e1RM 331.9 @ 245 lb, 6 RIR) papering over the incoherent row. Proposed fix
(scoped, `ready`): swap computes via the engine (advance off the §7c
counterpart when one exists — makes A→B→A restore the deload numbers — else a
cold seed like `addWorkoutExercises`), decision/row exercise-id mismatch ⇒
backfill in the reconcile, one `writePrescription` chokepoint, sheet mismatch
guard. Related: N5/N13 were the client-side symptoms of the same flow; the
e1RM-skew aside is parked with the open R24 remainder (review doc §7).

## 2026-07-04 — Session 46 (cont. 3): PR #145 merged — in-session sweep

PR #145 (notes sweep + N32 fix) merged with checks green while the session
was live, so the reconciliation sweep ran in-session: **N32 archived**
(`archive.md`, "Swept 2026-07-04 (later 5)"). Docs-only follow-up PR on the
branch restarted from merged main (same name). Live index is now: N1 (WS-J
remainder), N18-B (per-week RIR), N21 (target-engine needs-decision), N25
(InfoDot + glossary), N29 (picker filters + FilterBar), PH30 deferred,
R24/R25 remainders. Owner should re-test the sheet scroll fix on device —
the root-cause diagnosis (N6 pull gesture arming under the scroll lock) was
made from the code paths, not reproduced on hardware.

## 2026-07-04 — Session 46 (cont. 2): Batch 9 intake + N32 fix (PR #145)

Owner field-tested the PR #144 drill-down and handed over one bug + two
changes in-chat (verbatim = **backlog appendix Batch 9**, all → **N32**,
fixed on the open PR #145 branch):

- **Scroll bug root-caused** — not an N15 defect: the scroll lock's
  `position:fixed` zeroes `window.scrollY`, so the N6 `PullToRefresh` armed
  on every drag over any open sheet (pull spacer moved the page behind the
  scrim; a long drag fired `router.refresh()` mid-interaction). Present on
  **all** sheets since N6 shipped (2026-07-03); the drill-down was simply the
  first long sheet tested after it. Fix: `isScrollLocked()` export +
  `PullToRefresh` guard, `overscroll-contain` + touch isolation on
  `BottomSheet`.
- **Drill-down opens on sets/reps** — owner reverted the e1RM-first opening;
  `initialFlipped`/`e1rm_first` removed everywhere (PH32 default holds).
- **Exercise-name link** — the history sheet subtitle's exercise name links
  to `/exercises/{id}` on every entry point (`BottomSheet.subtitle` is now a
  ReactNode).

Green: typecheck, lint, 778 tests, production build. 09 entry "2026-07-04
(session 5)"; PROGRESS updated. N32 rides PR #145 (the docs-sweep PR, now
docs + fix); archive sweep falls to the next session.

## 2026-07-04 — Session 46 (cont.): PR #144 merged — in-session sweep

PR #144 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N15, N24, N26, N27, N28 archived**
(`archive.md`, "Swept 2026-07-04 (later 4)"). Docs-only follow-up PR on the
branch restarted from merged main (same name). Live index is now: N1 (WS-J
remainder), N18-B (per-week RIR), N21 (target-engine needs-decision), N25
(InfoDot + glossary), N29 (picker filters + FilterBar), PH30 deferred,
R24/R25 remainders. **WS-C and WS-E are clear** (N21 decision aside).

## 2026-07-04 — Session 46: PR #143 swept; attack-order slots 4+5 built — N24 + N15 + N26 + N27 + N28 (PR #144)

Reconciliation sweep: **N31 archived** (`archive.md`, "Swept 2026-07-04
(later 3)" — PR #143 merged). Branch restarted from merged main. No new notes
handed over → picked the next attack-order slot (N24), folded in the three
small `ready` items (N26/N27/N28), then continued into the follow-on stats
slice (N15):

- **Headers (WS-D):** **N24 done** — sticky `MacroHeader` on the shared
  header grammar (brand row + `MACROCYCLE` label, title + ⋮ `AnchoredMenu`
  with "Edit macrocycle" → the existing `/edit` route, meta line +
  ACTIVE/COMPLETE/ARCHIVED badge, goal-notes line); the bottom EDIT
  MACROCYCLE link removed; route skeleton mirrored (stale N21 target-card
  block dropped). Header unification complete: day view / meso / exercise /
  macro share one idiom. No share button (macros aren't a `ShareObjectType`),
  no archive row (N19 wontfix).
- **Navigation (WS-E):** **N27 done** — the day-view "Mesocycle stats" menu
  row carries `&from=/log/<workoutId>`; the meso page validates it (N4 guard)
  and threads new optional `backHref`/`backLabel` props into `MesoHeader`
  (`‹ WORKOUT` when honored, `‹ CYCLES` default).
- **Day view (WS-E):** **N26 done** — set rows scaled +10% per the scoped
  values (35px cells / 15px values / 23px LOG box / 5px padding); the R18
  full-cell tap targets grow with the cell; grid templates untouched.
- **Cycles list (WS-D):** **N28 done** — pure `orderCyclesTopLevel`
  (`start_date ?? created_at` desc, `created_at` tie-break) applied to macros
  + standalone mesos in `getCyclesOverview`; `orderMesos` untouched; 3 unit
  tests.
- **Stats drill-down (WS-C):** **N15 done** — `getExerciseHistory` gains an
  optional `scopeMesoIds` filter (N30 pagination applies within the scope);
  threaded through the action (zod uuid array ≤100) and the list's pager.
  `HistorySheetTarget` gains `meso_ids`/`scope_label`/`e1rm_first`; macro
  muscle-group **contributor rows** and meso **ALL EXERCISES rows** open the
  sheet scoped to their cycle, **e1RM-first** (tap flips to sets/reps —
  inverse of the PH32 default per the owner). `StrengthProgressSection` became
  a client component; MCP `get_exercise_history` contract unchanged.

Green: typecheck, lint, 778 tests (+3), production build. 09 entry
"2026-07-04 (session 4)"; PROGRESS updated. Archive sweep for this PR's rows
falls to the next session. **WS-C is now fully clear except the N21
needs-decision.**

Next per the attack order: **N29** (from-template picker filters; the unified
FilterBar remains triaged), **N25** (InfoDot + glossary). Open decisions:
N18-B (per-week RIR), N21 (target engine), R24/R25 remainders, WS-J phase
2/3.

## 2026-07-04 — Session 45: PR #142 swept; N31 intake + fix (PR #143)

Reconciliation sweep: **N22, N23, N30 archived** (`archive.md`, "Swept
2026-07-04 (later 2)" — PR #142 merged). Branch restarted from merged main.

Owner handed over one bug note in-chat (verbatim = **backlog appendix Batch
8**): substituting an exercise on the planner board of a *planned* meso
appended the pick instead of replacing, kept the original, showed both
selected on re-open, and (via the group multi-select's `exercise_slots`
growth) left an empty slot after manual cleanup.

**Root cause (one defect, both bullets):** a filled board row opened the same
group-wide multi-select `ExercisePicker` as an open slot (`setPicker({group,
day})` with no notion of the tapped fill). Selection is seeded with the
group's current exercises, so a "replacement" tap *adds* to the set;
`setGroupExercises`/`planGroupExercises` append new picks after the day's
last position and `exercise_slots: max(layout, slots)` grows the group. The
board simply had no replace-in-place path (MCP's `edit_mesocycle
swap_exercise` did; the app didn't).

**N31 fixed (same PR):** `PickerTarget` gains `replaceFill`; a filled-row tap
opens the picker in **replace mode** — single-select (radio), seeded with the
current movement, rows already filling *another* slot of the group disabled
(`ALREADY IN THIS GROUP`), sheet titled "Replace exercise" with a
`REPLACE EXERCISE` submit (disabled until a different pick). The swap keeps
the fill's id/day position/slot/starting sets: staged in editing mode (the
owner's planned-meso path, committed via SAVE CHANGES), and a new
`replaceSlotAction` → `replaceSlotExercise` single-row `exercise_id` update
on live drafts, with a query-layer duplicate guard (+5 unit tests). Open-slot
taps keep the original multi-select unchanged.

Green: typecheck, lint, 775 tests (+5), production build. 09 entry
"2026-07-04 (session 3)"; PROGRESS updated. Archive sweep for N31's row falls
to the next session.

## 2026-07-04 — Session 44: attack-order slot 3 built — N22 + N23 + N30 (PR #142)

Reconciliation sweep: no-op (PR #141's sweep already archived N14/N16/N17/N20;
open PRs are only dependabot + stale #48). No new notes handed over → picked
the next attack-order slot (N22+N23) and pulled the N30 rider in with it (its
scoping said "ride with N15 or N22"; it shares the exercise-page surface):

- **Exercise surfaces (WS-F):** **N22 done** — (a) sticky `ExerciseHeader` on
  the meso-header grammar ([share][⋮] on `AnchoredMenu`; the I13 Load-step
  sheet refactored to a controlled `LoadStepSheet` in the ⋮ menu, disabled
  with a `BODYWEIGHT` tag on bodyweight-only lifts instead of vanishing;
  share moved off the OVERVIEW tab; **new in-app delete** for owned custom
  exercises with the MCP tool's exact guards + a blocker-explaining confirm
  sheet); (b) create-exercise page rebuilt in ledger sections with the load
  step settable at creation (per-equipment `DEFAULT +n lb` chip from
  `engine_params.rounding`); (c) MCP parity — `create_custom_exercise`
  +`notes`/+`weight_increment`, new **`set_exercise_increment`** tool (first
  MCP increment surface; doc 05 table updated). **N23 done** — `+ NEW` on the
  exercises page is now a tray (Blank exercise / OR ADD FROM A CODE with the
  kind-agnostic `RedeemForm`); backend untouched.
- **History depth (WS-C):** **N30 done** — `getExerciseHistory` cursor-paged
  on whole calendar days (`pageSetsByDay` pure helper + 7 unit tests; the
  day grain makes identical-timestamp import artifacts unable to split or
  dupe a session across pages); `ExerciseHistoryList` lazy-loads older pages
  via a `LOAD OLDER` IntersectionObserver row (tap fallback + retry);
  HISTORY tab + `HistorySheet` inherit; MCP first-page contract unchanged.
- **N15 unblocked further:** the scoped drill-down should reuse N30's
  pagination (row updated).
- Design records: 09 entry "2026-07-04 (session 2)" (four no-mockup deltas);
  PROGRESS.md updated. Green: typecheck, lint, 770 tests (+7), production
  build.

Next per the attack order: **N24** (macro header adoption), then **N27 + N26**
(back-link origin + set-row sizing), **N15** (scoped history drill-down),
**N28** (start-date sort), **N29** (picker filters). Archive sweep for this
PR's rows falls to the next session.

## 2026-07-04 — Session 43 (cont.): PR #140 merged — in-session sweep

PR #140 merged with checks green while the session was live, so the
reconciliation sweep ran in-session: **N14, N16, N17, N20 archived**
(`archive.md`, "Swept 2026-07-04 (later)"). Rows kept live for the
remainders: **N18** re-scoped to Part B only (per-week `rir_schedule`),
**N21** now purely the target-engine needs-decision (hide is merged).
Docs-only follow-up PR on the branch restarted from merged main (same name).
Live index is now: N1 (WS-J remainder), N15+N30 (unblocked stats slice),
N22+N23 (next attack-order slot), N24–N29 remainders, PH30 deferred,
R24/R25 remainders.

## 2026-07-04 — Session 43: attack-order slots 1+2 built — N14/N16/N21-hide + N17/N18-A/N20 (PR #140)

Reconciliation sweep: no-op (only dependabot PRs + stale #48 open; no `done`
rows live). No new notes handed over → picked the top of the Session-42 attack
order and shipped the first two slots as one PR (single designated branch):

- **Stats trust (WS-C):** **N14 done** — `dropE1rmOutliers` in the shared fold
  (sessions >3× from the window median dropped; generous by design so real
  beginner runs survive). **N16 done** — bespoke `buildMacroStats` fold
  deleted; the tile now reads pure `keyLiftStrengthPct` over the same
  qualified scores as the Performance tab (MCP inherits via
  `getMacroOverview`). **N21 hide done** — both target cards removed, engine +
  columns + block math kept; the target-engine correction stays open
  (needs-decision). 9 new unit tests incl. the 7-lb endpoint case and the
  deload-tail regression.
- **Planner/create (WS-D):** **N17 done** — START SETS stepper on filled
  board rows (staged + live-draft paths, clamp 1–20). **N18-A done** —
  FinalizeSheet ramp line is a collapsed disclosure → START/END RIR + deload,
  optional override through `finalizeSchema`/`finalizeDraftMeso`; **Part B
  (per-week RIR) still open.** **N20 done** — `RedeemForm` in the new-cycle
  tray (rode here instead of with N23).
- **N15 unblocked** (was sequenced behind N14/N16); rides with N30 next.
- Design records: 09 entry (2026-07-04) for the three no-mockup control
  deltas + the N21 card removals; PROGRESS.md updated. Green: typecheck,
  lint, 763 tests (+9), production build.

Next per the attack order: **N22 + N23** (exercise page overhaul + sharing
trays), then **N24**, **N27 + N26**, with **N15 + N30** as the follow-on
stats slice. Archive sweep for this PR's rows falls to the next session
(a merged PR can't sweep its own rows).

## 2026-07-04 — Session 42 (cont.): Batch-7 addendum — owner clarifications (PR #139)

Owner reviewed the intake findings in-chat (with a /cycles screenshot) and
returned five clarifications; verbatim capture = **backlog appendix Batch 7
addendum**. Deltas applied:

- **N30 (new, F, MED, WS-C, ready)** — the 120-set history cap surfaced by
  N14's scoping is itself unwanted: full history must be reachable via
  lazy-load/pagination (~120 initial page is fine). Scoped: keyset pagination
  on `getExerciseHistory` + a sentinel in `ExerciseHistoryList`/`HistorySheet`.
  Rides with N15 or N22.
- **N22 expanded** — the increment gap is at **creation**: rebuild the
  create-exercise page (general UI overhaul + Load-step settable at creation;
  today it's create-then-edit), and **MCP parity** — `create_custom_exercise`
  lacks increment (and notes); no MCP increment surface exists at all.
- **N23 confirmed as scoped** — the point is the receptacle where users
  expect it (new-exercise tray), even though redeem is already kind-agnostic.
- **N19 → wontfix, archived** ("Drop the archival bit"). The side-finding —
  app meso delete cascades logged history behind an ack checkbox while MCP
  refuses (rule-5 spirit gap) — was not ruled on; noted in the archive row
  for whenever the delete flow is next touched.
- **N28 needs-input → ready (UX→B)** — the screenshot resolved it: completed
  macros render oldest-first because their `created_at` is an import-order
  artifact. Fix = top-level sort by training start date desc (fallback
  created_at); within-macro order confirmed correct, untouched.

Attack-order impact: slot 4 becomes **N24 alone** (macro header, menu =
edit/goals — no archive row); N30 joins the N15 slice (or rides N22).

## 2026-07-04 — Session 42: Batch 7 intake — 16 new items (N14–N29) (PR #139)

Reconciliation sweep: no-op (PR #138 — the I12/N13 sweep — merged; no `done`
rows live; open PRs are only dependabot + stale #48). Owner handed over 19
stream-of-thought notes; ran the intake protocol. Verbatim capture = **backlog
appendix Batch 7**; all items scoped against the code at intake (4 parallel
scoping passes; full file:line detail in `scoping.md` § Batch 7). Notes-only
PR — no code changed. New workstream **M** (in-app help & education) added to
the roster.

**Merges at parse time:** notes 9+11 → **N22** (exercise page overhaul +
header + increment); notes 10+12 → **N23** (exercise sharing entry points);
notes 18+19 → **N29** (filter UI). 19 notes → 16 items.

**Key scoping findings (premise checks worth knowing before building):**
- **N14/N16 (HIGH, stats trust):** both macro-stat complaints are real and
  share a root — single-first/last-session endpoints with no qualification.
  N14: `foldProgressScores` lets one unrepresentative early session (e1RM 7)
  define the denominator, and the 120-set history cap hides that session from
  the history view. N16: the KEY LIFTS tile is a separate bespoke fold that
  includes deloads and means only the 3 most-logged lifts — a cut ending on a
  deload reads -36.3% while the qualified Performance pipeline stays positive.
  One PR can fix both against one definition.
- **N17 (HIGH):** planner set-count editing is UI-only — `initial_sets` is
  already plumbed model→board→save→engine seed; it's just hardcoded to 3 with
  no stepper.
- **N19 (HIGH, data-loss surface):** the app's meso delete cascades logged
  history behind an ack checkbox — violates hard rule #5's spirit (MCP side
  already refuses). Archive-not-delete via `archived_at` + `/more/archive`.
- **N22/N23 (premises contradicted by shipped code):** the increment setting
  already exists (I13 Load-step sheet) — it's just behind a faint `⋯` that
  vanishes on bodyweight-only lifts; exercise sharing already works
  end-to-end incl. **kind-agnostic redeem** (a meso code entered anywhere
  routes correctly — the owner's hoped-for behavior is already built). The
  real gaps: header/discoverability + `RedeemForm` mounting only in the
  templates tray.
- **N28:** top-level cycle lists are **already newest-first** (`created_at`
  desc) — needs-input: which list looked wrong, or is `start_date`-desc the
  ask?
- **N21:** target-engine audit found real smells (age/sex applied only to
  hypertrophy; discontinuous model flip on profile completeness; cut cap
  collapse). Interim hide is small and keeps the timeline's `plan.phases`
  dependencies intact.

**Suggested attack order for the build sessions:**
1. **N14 + N16 + N21-hide** (stats-trust PR — all in `stats.ts`/`macro.ts`
   folds + two view-card removals; HIGH).
2. **N17 + N18-A + N20** (planner/create PR — stepper + advanced RIR
   disclosure + tray redeem; small pieces, one surface family).
3. **N22 + N23** (exercise page overhaul + sharing trays; owner-authorized
   design delta needed → 09 entry at build time).
4. **N19 then N24** (archive-not-delete, then the macro header that hosts the
   macro-side archive row — or one PR if capacity allows).
5. **N27 + N26** (small day-view PR: origin-aware back links + row sizing).
6. **N29-picker** (small wiring) whenever a templates PR is open; the unified
   FilterBar and **N15** (drill-down, after stats are right) as their own
   medium slices; **N25** (InfoDot + glossary) incremental.

Open from before: N1 WS-J remainder (Phase-2 caching / Phase-3 streaming),
R24 reprice-down investigation, R25 tool consolidation, PH30 deferred.

## 2026-07-03 — Session 41 (cont.): PR #137 merged — in-session sweep

PR #137 merged with all checks green while the session was live, so the
reconciliation sweep ran in-session: **I12 + N13 archived** (`archive.md`,
"Swept 2026-07-03 (later 7)"). With I12 closed, the live index is down to
N1 (in-progress, WS-J remainder: Phase-2 #5/#7 caching + Phase-3 streaming),
PH30 (deferred), and the R24/R25 remainders. The four new I12 surfaces have
no mockups — the owner's field feedback is the acceptance check; reopen
anything that doesn't hold up. Docs-only follow-up PR (branch restarted from
the merged main, same name).

## 2026-07-03 — Session 41: N13 fix + I12 completed (owner-authorized design) (PR #137)

Same session, continued after PRs #134/#135 merged. Owner handed over Batch 6
in-chat (appendix): N1 skeletons **confirmed on device**; **I12 design
authorization** ("rework in any way you see fit"); **N13** — reset-to-
prescription broken on an exercise's first set.

- **N13 — done (HIGH, B, WS-G).** Root cause was R13-era, not N5: the reset
  echo (`set_weights` cleared → `plannedWeight` null) arrives through the
  planned-input re-sync channel, whose typed-row guard never releases on an
  unlogged row — and set 1 is necessarily typed-in, since typing is what makes
  the reset option appear. The override-CLEARING transition is now its own
  `prescription-reset` class in `day-rules.ts::adoptServerRowState` (always
  adopt + clear the typed flag); already-null transitions (bodyweight edit
  while typing) keep the R13 protection. Swap path (N5 remount key) verified
  intact. +1 unit test.
- **I12 — done (PR #137 closes it).** The four remaining pieces built to
  Claude's design (09 2026-07-03 session 4 = design of record): **Place into
  macrocycle** sheet on standalone planned mesos (rows state `FILLS M2` /
  `ADDS AS M5` exactly, computed with the same pure `planMacroPlacement` the
  write uses; lands on the macro timeline); **Edit details** sheet (name any
  time, weeks/RIR/deload segmented controls until start — finalize-sheet
  grammar); **BLOCKS** section on the macro edit page (▲▼ on not-yet-started
  rows, never crossing a locked one; ✕ on open slots; dashed + ADD BLOCK;
  applies immediately); **WEEKLY SETS PER MUSCLE** live readout on the
  planner board with MEV/MRV bands, out-of-band emphasized in ink. The R14
  fold relocated to `lib/plan/volume-preview.ts` (client-safe, type-only
  imports — `/plan` holds 121 kB) with `previewVolume` staying server-side;
  MCP re-exports keep its callers/tests intact. Deliberately MCP-only:
  explicit-position placement, phase editing.
- **Verified:** typecheck, lint, 754 tests (+1), production build (meso page
  +1.4 kB for two sheets; `/log` 127 kB unchanged). New surfaces flagged for
  the owner's normal use — no mockup existed, so field feedback is the check.

## 2026-07-03 — Session 40 (cont.): PR #134 merged — in-session sweep

PR #134 merged with all checks green while the session was live (the new e2e
job + integration suite passed on the final commit), so the reconciliation
sweep ran in-session: **R21 archived** (`archive.md`, "Swept 2026-07-03
(later 6)"). I12 (advanced — remainder needs owner design input) and N1
(skeletons shipped, device-check pending) correctly stay live. Live index is
now: I12, N1, PH30 (deferred), R24/R25 remainders. Docs-only follow-up PR
(branch restarted from the merged main, same name).

CI-iteration note for the record: the e2e run surfaced and fixed a real app
bug before merge — `/exercises` 414'd on the local stack (330-id `.in()`
query string in `listExercises`; hosted merely tolerated the oversized URI) —
plus two harness fixes (fixture `weeks` floor, LOG click landing on the
transient saving span). Exactly the class of regression R21 was filed to
catch.

## 2026-07-03 — Session 40: R21 (all 3 bullets) + N1 per-route skeletons + I12 scoping & first slices (PR #134)

Reconciliation sweep: no-op (PRs #132/#133 merged; Session 39's in-session
sweep already archived their rows; no `done` rows live). Worked the recorded
order — **R21** (last full-weight review item), the **N1 Phase-A escalation**,
and **I12** — on branch `claude/r21-i12-progress-o2pp6r`, **PR #134**. Full
record in PROGRESS 2026-07-03 (latest); the I12 UI delta is a dated 09 entry
(2026-07-03 session 3).

- **R21 — done, all 3 bullets.** (a) v18 golden meso (`golden-meso-live.test.ts`):
  anchored lifter simulated over 5 weeks + deload with the anchor recomputed
  from the logged sets each week — pins the seed-from-anchor, the rep climb
  bounded to the window, the anchor-based RIR-6 deload, and a
  bodyweight_loadable effective-load scenario; every number hand-verified
  before pinning. (b) `tests/integration/write-pipeline.test.ts` — the
  activate/seed → log → complete → generate round-trip through the real query
  layer + RPCs, riding the CI rls-tests job (skips nothing; hard-fails without
  a stack, like the RLS suite). (c) Playwright e2e smoke + config + dedicated
  CI e2e job — sign-in → START → log incl. the auto-prompted feedback sheet →
  complete → asserts the engine-generated W2·D1. `test:e2e` is no longer dead.
  No Docker in this sandbox → both stack suites verified via the PR's CI
  (first run caught the fixture's `weeks: 2` vs the 3–8 schema check).
- **N1 — per-route skeleton slice shipped** (row stays in-progress, WS-J).
  Root cause recorded in `J-performance.md`: sibling navs never re-suspend the
  group-level `(app)/loading.tsx` boundary — only routes with their OWN file
  paint on tap, which is exactly the two that behaved. 9 routes got
  layout-mirroring skeletons; `<Link>` prefetch carries the shells. Owner
  device-check pending.
- **I12 — advanced.** Full in-app-vs-MCP gap table now in `scoping.md` § I12
  (helpers all exist; delta is pure UI). Shipped the two slices that fit the
  existing design grammar: ⋮ menu **Duplicate mesocycle** + the **proactive
  START gate** (disabled + reason via the same pure `mesoActivationBlock`).
  Remaining pieces (attach-into-macro picker, header edit after finalize,
  direct slot add/remove/reorder, plan-time volume preview) each lack a mockup
  figure — queued for a design delta / owner input before building.
- **Verified:** typecheck, lint, 753 unit tests (+2), production build. CI
  (rls-tests incl. integration, e2e) is the merge gate for the stack suites.

**Next:** the I12 remainder needs owner design input (4 pieces listed in
`scoping.md`); N1 continues (device-verify the skeletons, then Phase-2 #5/#7
caching or Phase-3 streaming as measured); R24 reprice-down investigation and
R25 tool-surface consolidation stay parked.

## 2026-07-03 — Session 39 (cont.): PR #132 merged — in-session sweep

PR #132 merged with all checks green while the session was still live, so the
reconciliation sweep ran immediately instead of waiting for the next session's
resume protocol: **N12/N9/N10/N6 archived** (`archive.md`, "Swept 2026-07-03
(later 5)"). Live index is now down to N1 (in-progress, WS-J), R21, R24/R25
remainders, and I12. Docs-only follow-up PR (branch restarted from the merged
main, same name).

## 2026-07-03 — Session 39: N12 + N9 + N10 + N6 — WS-J logging slice + Performance-tab reorg + PTR (PR #132)

Reconciliation sweep: PR #131 merged → **N5/N7/N8/N11 archived** (swept to
`archive.md`, "Swept 2026-07-03 (later 4)"; N5+N7 stay flagged there for the
owner's on-device spot-check). Then built the next two slots of the recorded
attack order in one PR, branch `claude/outstanding-issues-review-r56zpv`.
Full record in PROGRESS 2026-07-03 (latest); N9/N10's design delta is a dated
09 entry (2026-07-03 session 2).

- **N12 — done.** Latency: the `logSet` stamp chain (4 serial SELECTs before
  every set write) is one embedded PostgREST read (smoke-tested against live
  REST — 200, embeds resolve); the `in_progress` flip is skipped past
  `planned`; the reconcile gate's completed-work watermark now reads
  closed (completed/skipped) workouts only, so the first set of a session no
  longer busts the gate (its own status flip was the buster) — conservatism
  test extended, +1 case. Signature key set changed ⇒ each meso pays one full
  reconcile on first open post-deploy, then the gate re-engages. Hang: the LOG
  spinner tracks the server action (15s watchdog), acknowledges on
  write-confirm via `ack` state, and the revalidation echo remounts the row;
  timeout = shake + "safe to try again" (R3 upsert). Deferred-with-reasons:
  J-Phase-2 #5 (needs #7's tagging), #6 (columns are ~fully consumed; bytes
  not round trips) — recorded in `J-performance.md`.
- **N9 — done.** `rollupMuscleProgress` keeps its per-exercise attribution as
  `contributors[]` (role-tagged, best first; multi-group appearance = expected
  fractional credit; +unit assertions); new client `MuscleStrengthSection`
  renders group rows with ▸/▾ drill-down on the macro Performance panel; the
  flat ALL-EXERCISES list is gone at macro scope. Meso tab component untouched;
  MCP summaries project explicit fields, so nothing leaks there.
- **N10 — done.** Key-lift grid + across-macro chart deleted from
  `PerformanceView` and `stats.ts` (`buildKeyLifts`, top-set fold, chart query,
  `KeyLift`/`MacroChartBar` types; 2 retired tests). The `contextLine` meso
  position is re-derived from the macro's meso ordering — decoupled from
  `keyLifts[0]` and now present even without a lead lift.
- **N6 — done.** `PullToRefresh` wrapper in `(app)/layout.tsx` (document
  scrolls → one wrapper covers day view + all `/cycles/**`): armed at
  `scrollY === 0` only, resisted pull, threshold release → `router.refresh()`
  in a transition, travelling-gap square indicator;
  `overscroll-behavior-y: contain` kills Android's native PTR double-fire.
- **Verified:** typecheck, lint, 751 tests (+1 gate, −2 retired), production
  build with CI env — `/log` + `/workout` hold at 127 kB. No local stack;
  N12 feel + N6 gesture flagged for the owner's on-device check.

**Next:** R21 (MED — e2e/integration coverage, unblocked once the R2 chain
boots locally) is the last review item at full weight; **I12 in-app planner
UX** remains the open large HIGH; R24's hold-week reprice-down investigation
and R25's tool-surface consolidation stay open (in-progress rows). N1 Phase-A
per-route skeletons (the escalated 1-2s nav gap) is the next WS-J slice.

## 2026-07-03 — Session 38: N5 + N11 + N7 + N8 — the four scoped Batch-5 quick fixes (PR #131)

Reconciliation sweep: no-op (PR #130, the Batch-5 intake, merged — it was
notes-only with no `done` rows to sweep; R24/R25/I12 correctly stay live).
Built the first slot of Session 37's suggested attack order — the four
one-file items in a single PR, branch `claude/notes-n5-n11-n7-n8-jt2yyi`.
Full record in PROGRESS 2026-07-03 (latest); N8's design delta recorded as a
dated 09 entry (figs 2.1/2.2).

- **N5 — done.** Went with the scoped lowest-risk option: the `SetRow` key now
  carries `we.exercise_id`, so a replace remounts the rows and the editable
  set-1 `useState` re-initializes from the new exercise's prescription. The
  re-sync effects are untouched (R13 semantics preserved).
- **N11 — done.** The P19 marker memo extracted to pure
  `day-rules.ts::loggedSetMarker`; unreported RIR now compares at the week's
  target RIR on both sides instead of defaulting the logged side to 0.
  6 new unit tests (deload regression, working-week, over/under, reported-RIR
  directions, null guards). Note: a *reported* RIR still counts — same
  weight/reps at RIR 0 against a target of 3 correctly reads ▼.
- **N7 — done.** `useScrollLock` rewritten to the `position:fixed` +
  `top:-scrollY` pattern with exact restore on release; scrollbar-padding
  compensation and the stacked-overlay ref count kept. Every sheet/menu rides
  the same hook, so the fix is global.
- **N8 — done.** `/cycles` `StatusMark`: planned → PLANNED text badge
  (CURRENT's geometry in ink — the owner's "white" resolves to ink, which
  renders cream-white under the dark ledger inversion); checkbox reserved for
  completed; muting widened to planned + unplanned on macro-grouped AND
  standalone rows. Macro timeline: numbered marks stay, planned rows swap the
  progress bar for the badge, same muting adopted.
- **Verified:** typecheck, lint, 752 tests (+6), production build (`/log`
  127 kB — day-rules imports the zod-free predict core only). No local stack
  in this sandbox; N5 + N7 flagged for the owner's on-device spot-check
  (N7 is installed-iOS-PWA-specific).

**Next per the Session-37 attack order:** **N12** (set-log latency + hanging
spinner, HIGH) as the opening WS-J slice, folding in N1 Phase-2 deferreds
#5/#6; then **N9+N10** (Performance-tab rework, ship together). **N6**
(pull-to-refresh) rides whenever a day-view PR is open. R21 (MED) remains the
last review item at full weight; I12 in-app planner UX still the open large
HIGH.

## 2026-07-03 — Session 37: Batch 5 intake — 8 new items (N5–N12) + N1 escalation (PR #130)

Reconciliation sweep: no-op (PR #129 merged; R24/R25 correctly stay live —
in-progress with open remainders; no `done` rows). Owner handed over 9 field
notes; ran the intake protocol. Verbatim capture = **backlog appendix Batch 5**;
all actionable items scoped against the code at intake (3 parallel scoping
passes; full file:line detail in `scoping.md` § Batch 5). Notes-only PR — no
code changed.

- **N5 (HIGH, B, WS-G, ready)** — replace-exercise leaves the old exercise's
  numbers on set 1 only. **PH38's symptom returned via a different mechanism**:
  the PR #84 `set_weights` clear is intact; the culprit is retained client
  `useState` on the editable first row — its re-sync effect deps
  (`plannedWeight`/`bodyweight`) don't change across a swap, and neither the
  card key (`we.id`, stable through replace) nor the row key includes
  `exercise_id`, so nothing remounts. Sets 2+ are prop-derived (always fresh).
  Trivial-small fix, two options recorded.
- **N6 (MED, F, WS-E, ready)** — pull-to-refresh. Doesn't exist; standalone-PWA
  mode is why native PTR is gone. One shared wrapper in `(app)/layout.tsx`
  (document is the scroll container; no cycles sub-layout) covers day view +
  all `/cycles/**` at once.
- **N7 (MED, UX, WS-E, ready)** — note-sheet scroll drift. Root cause:
  `useScrollLock` never captures/restores `scrollY`; one-file fix covers every
  sheet/menu.
- **N8 (HIGH, UX, WS-D, ready)** — planned-meso badge: white PLANNED text badge
  (CURRENT's style), checkbox only when completed, `+ PLAN` unchanged, mute
  everything not current/completed. Maps to `/cycles` `StatusMark`. The
  macro-timeline question was **answered same-session (appendix Batch 5
  addendum):** numbered marks stay; planned rows swap the right-side progress
  bar for the PLANNED badge; both surfaces adopt the muting scheme.
- **N9 + N10 (HIGH, F, WS-C, ready — ship together)** — Performance-tab
  reorg: macro tab promotes the muscle-group rollup to primary with per-group
  exercise drill-down (rollup already sees the attribution, just discards it);
  meso tab drops the key-lift top-sets grid + across-macro chart (net deletion;
  `keyLifts[0]`→`contextLine` coupling flagged). Amends the PR #104 surfaces —
  record a 09 changelog delta at build time.
- **N11 (MED, B, WS-G, ready)** — deload ▼ at exactly-prescribed performance.
  Root cause: RIR-asymmetric marker comparison (prescribed side uses target RIR
  ≈6 on deloads; logged side `rir_reported: null` → 0). 1-3 line fix; extract
  the memo to `day-rules.ts` for tests.
- **N12 (HIGH, B, WS-J, ready)** — set-log latency + never-resolving spinner.
  Latency: ~6 serial round-trips in `logSet` + the first set of each session
  busting the reconcile gate (its own `in_progress` flip bumps the gate's
  `workouts.updated_at` watermark) + double `revalidatePath`. Hang: the spinner
  is transition-pending on the **revalidation commit**, not the write, with no
  timeout. Build as a WS-J slice with N1 Phase-2 deferreds (#5/#6).
- **N1 escalated** (9th note folded in, not a new row): 1-2s dead nav gaps
  persist (cycles pages worst); owner's bar = immediate switch + skeleton
  everywhere, day view is the only page doing it right. This **disproves the
  Phase-A architecture note** that Link navs already paint the
  `(app)/loading.tsx` fallback — logged in `J-performance.md` as the next
  Phase-A action (verify on device, then per-route skeletons/streaming).
- Housekeeping: pruned `scoping.md`'s stale "not yet researched" list
  (PH29/PH38/PH31/PH32/PH37 all shipped).

**Suggested attack order for the next build sessions:** the three scoped
one-file bugs first — **N5 + N11** (both day-view, trivial) and **N7**
(`useScrollLock`), plus **N8** (small, two badge components) — one PR could
carry all four. Then **N12** as the opening WS-J slice (biggest daily-loop pain,
HIGH), folding in N1's revalidation-narrowing deferreds. Then **N9+N10**
together (Performance-tab rework, medium). **N6** (pull-to-refresh) rides
whenever a day-view PR is open. R21 (MED) remains the last review item at full
weight; I12 in-app planner UX still the open large HIGH.

## 2026-07-03 — Session 36 (cont. 5): PR #127 merged + R25 mechanical fixes (PR #129)

- **PR #127 MERGED** (all checks green). No sweep: R24 stays live
  (in-progress — the reprice-down investigation remains open); its row now
  reads "mechanical fixes merged (PR #127)".
- Note: enabling dependabot (R23) immediately opened **PRs #123–126**
  (3 github-actions majors + 1 grouped npm minors batch) — left for the
  owner to review; they consumed the #123–126 numbers, which is why the R24
  PR landed as #127.
- Continued the LOW tail — **R25, the 3 mechanical bullets** (LOW, WS-K),
  **PR #129**. The tool-surface consolidation (+ full error-contract
  convergence) stays open as a deliberate design pass — row narrowed.
- **R25 (3/4) — done.** (a) `recordMcpWrite` never throws: every caller runs
  it AFTER the mutation commits, so an audit failure inverted a successful
  write into `isError` and a retrying agent duplicated drafts — now
  log-and-return (`reportError("mcp:audit")`); 3 new tests incl. both
  failure shapes. (b) Resource handlers (`profile`, `current-cycle`,
  `coaching-guide`) wrapped in `guardResource`: report + rethrow a clean
  structured message — the raw-Postgrest `[object Object]` path the tool
  wrapper was built to kill is closed on the resource surface too.
  (c) `MCP_JWT_AUDIENCE` enablement runbook step added to
  `manual-operations.md` (until set, any project-issued user JWT is a valid
  `/api/mcp` bearer — decode the connector token's `aud`, set the var,
  redeploy, retest).
- **Next per the attack order:** R21 (MED, testing infra — the last review
  item at full weight); the R24/R25 remainders are parked design/investigation
  items. N1 (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont. 4): PR #122 merged + R24 mechanical fixes (PR #127)

- **PR #122 MERGED** (all checks green). Archival sweep ran: **R23 swept to
  `archive.md`** ("Swept 2026-07-03 (later 3)"); branch restarted from the
  merged main. Sweep rides with this PR.
- Continued the LOW tail — **R24, the 4 mechanical fixes** (LOW, WS-G),
  **PR #127**. The 5th bullet (hold-week reprice-down) stays open per the
  owner's 2026-07-02 ruling ("no fix decided yet") — row narrowed to it.
- **R24 (4/5) — done.** (a) `engineParamsSchema.superRefine`: rep_window
  `min ≤ target_low ≤ target_high ≤ max` per goal + `min_sets ≤
  max_sets_per_exercise` — a bad row can no longer be activated (doc 04);
  verified every hosted row v1–v18 passes (SQL invariant sweep), so replay
  is untouched. (b) `brzycki_max_eff_reps` capped ≤ 10 (the Epley/Brzycki
  crossing) — a higher cutoff made k(effReps) non-monotonic (more reps →
  heavier load); property tests pin monotonicity under both cutoff rules +
  inverse consistency. (c) No-anchor hold skips `roundToStep` — 27.5 lb on a
  5-lb step used to prescribe 30 with "hold 27.5 lb" in the rationale
  (negative control: verified old rounding → 30); regression test holds
  27.5 verbatim. (d) Stale `retire_prior_peak_seed` contract comments fixed
  (params.ts + seedMeso header): the legacy branch is deleted, the flag
  inert. 743 tests (+9), golden meso unchanged.
- **Next per the attack order:** R25 (MCP polish, LOW, WS-K); R21 (MED,
  testing infra). N1 (WS-J) and I12's in-app planner UX remain the open
  HIGH-priority workstreams.

## 2026-07-03 — Session 36 (cont. 3): PR #121 merged + R23 — repo hygiene batch (PR #122)

- **PR #121 MERGED** (all checks green). Archival sweep ran: **R22 swept to
  `archive.md`** ("Swept 2026-07-03 (later 2)"); branch restarted from the
  merged main. Sweep rides with this PR.
- Continued the LOW tail — **R23** (LOW, WS-L), **PR #122**. Full record in
  PROGRESS 2026-07-03 (latest).
- **R23 — done.** Dead code deleted: the 2 unused-but-live `"use server"`
  POST endpoints (`reorderGroupExercisesAction` + its now-orphaned
  `reorderGroupExercises` query, `saveProfileDetails` + schema/FormState);
  dead exports `listMacrocycles`, `setExerciseStatus`, `confidenceRank`
  (+ its private rank map); 6 unused UI components (Card, MenuCard,
  FeedbackScale, NumberStepper — with its stale-closure bug, RirBadge,
  WeekTrack); 7 engine-barrel over-exports trimmed (module exports intact).
  Views: `v_muscle_group_volume` (dead since initial schema, wrong week
  boundary/no fractional counting) **and** `v_meso_week_sets` (superseded by
  the R14 role-grain view; root CLAUDE.md's "pending retirement with R23"
  note resolved) retired via migrations `20260703000002` + `20260703000003`,
  **both applied live**; row types + registry entries removed. Dep nits:
  `@next/bundle-analyzer` aligned to next 15 majors, `tsx` now a real devDep
  (scripts doc `npx tsx`), dead `tests/unit/**` vitest include removed,
  `.github/dependabot.yml` added (weekly, grouped minors/patches).
- **Next per the attack order:** R24 (engine guardrail batch, LOW, WS-G) and
  R25 (MCP polish, LOW, WS-K); R21 (MED, testing infra) behind them. N1
  (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont. 2): PR #120 merged + R22 — env validated at boot (PR #121)

- **PR #120 MERGED** (all checks green — `rls-tests` ran the new single-active
  constraint probe against the migrated chain). Archival sweep ran: **R15
  swept to `archive.md`** ("Swept 2026-07-03 (later)"), live index trimmed;
  branch restarted from the merged main. Sweep rides with this PR.
- Continued into the LOW tail per the attack order — **R22** (LOW, WS-L),
  **PR #121**. Full record in PROGRESS 2026-07-03 (latest).
- **R22 — done.** New `src/lib/env.ts`: zod-validated public Supabase env,
  parsed once, read by all four supabase factories + the MCP auth bridge (one
  definition; trailing-slash normalization included). A missing/typo'd/
  malformed var now throws one loud error naming every offending var instead
  of a generic 500 from inside @supabase/ssr. `next.config.ts` asserts
  presence at build/dev boot, so a Vercel misconfiguration can't ship at all
  (CI placeholders still pass). Service-role key deliberately stays out of the
  schema (hard rule #4 — confined to `service.ts`). 6 unit tests; build
  verified both directions (placeholder env builds; missing env fails loudly).
- **Next per the attack order:** R23–R25 (LOW tail), R21 (MED, bigger testing
  infra). N1 (WS-J) and I12's in-app planner UX remain the open HIGH-priority
  workstreams.

## 2026-07-03 — Session 36 (cont.): PR #119 merged + R15 — one live block per user (PR #120)

- **PR #119 MERGED** (all checks green). Archival sweep ran: **R11 + R12 swept
  to `archive.md`** ("Swept 2026-07-03"), live index trimmed; branch restarted
  from the merged main. Sweep rides with this PR.
- Continued per the attack order — **R15** (MED, WS-D), **PR #120**. Full
  record in PROGRESS 2026-07-03 (latest).
- **R15 — done.** One live block per user, app gate + DB guarantee:
  `startMeso` now blocks while ANY of the user's mesos is active (the old gate
  only checked same-macro siblings, so a standalone/other-macro meso could go
  live next to an in-flight block and `get_current_state`/the Workout tab
  silently followed the newest); new partial unique index
  `mesocycles_one_active_per_user` (migration `20260703000001`, **applied
  live + verified**, no pre-existing violations) makes it race-safe — the
  losing flip surfaces a friendly error (everything seeded pre-flip is
  R3-retry-safe); `activate_mesocycle` tool description now states the
  exclusive-activation contract instead of overstating the old one. Scratch
  PG16 chain green from zero (60 migrations + seed, 26/26 RLS tables, index
  present); 4-step SQL probe (second same-user activation → 23505, other
  users unaffected, completion frees the slot); new RLS-suite test
  ("single active meso (R15)") for CI.
- **Next per the attack order:** the LOW tail (R21–R25). N1 (WS-J) and I12's
  in-app planner UX remain the open HIGH-priority workstreams.

## 2026-07-03 — Session 36: R11 + R12 — reconcile pagination + custom-exercise load-type (PR #119)

Reconciliation sweep: no-op (PR #118 was itself the R9+R10 sweep; no `done`
rows live). Built the next two items in the recorded attack order — **R11 +
R12** (both MED, WS-G) — on branch `claude/review-outstanding-work-l9x34f`,
**PR #119**. Full record in PROGRESS 2026-07-03 (latest).

- **R11 — done.** Reconcile's decision fetch paged (`latestDecisionsByRow`,
  stable `created_at desc, id desc` order, early exit) — the unbounded fetch
  truncated at PostgREST `max-rows`, misclassifying old-decision rows as
  decision-less → re-seeded off the prior-meso peak. Grounded live: hosted has
  641 decisions (max 38/row) and climbing — this would have bitten soon.
  5 new unit tests incl. the beyond-page-1 truncation regression.
- **R12 — done.** `createCustomExercise` derives `load_type` at insert
  (`toEngineLoadType`); create vocabulary (new `src/lib/types/equipment.ts`)
  drops load-ambiguous bare `"bodyweight"` for the three load-typed labels
  (app form + action schema + MCP); MCP `create_custom_exercise` /
  `search_exercises` equipment args now zod enums (hard rule #6);
  `dedupeMuscleRoles` + link-failure cleanup kill the orphan-exercise path.
  **No backfill migration:** verified zero custom / bare-bodyweight rows on
  hosted.
- **Next per the attack order:** R15 (MED, WS-D); then the LOW tail
  (R21–R25). N1 (WS-J) and I12's in-app planner UX remain the open
  HIGH-priority workstreams.

## 2026-07-02 — Session 35 (cont. 4): PR #117 merged + archival sweep

- **PR #117 MERGED** (all checks green). End-of-session archival sweep ran:
  **R9 + R10 swept to `archive.md`** ("Swept 2026-07-02 (late 3)"), live index
  trimmed. Sweep shipped as its own small docs PR (a merged PR can't sweep its
  own rows); branch restarted from the merged main per the follow-up rule.
- **Session 35 total: three build PRs merged** — #115 (T-R2), #116 (R5+R7,
  migration `20260702000006` applied live), #117 (R9+R10) — plus this sweep.
- **Next per the attack order:** R11 + R12 (MED, WS-G); R15 (MED, WS-D);
  then the LOW tail (R21–R25). N1 (WS-J) and I12's in-app planner UX remain
  the open HIGH-priority workstreams.

## 2026-07-02 — Session 35 (cont. 3): PR #116 merged + R9 + R10 — analysis honesty fixes (PR #117)

- **PR #116 MERGED** (all checks green — `rls-tests` ran the 9 new
  completion-lock tests against the migrated chain). Archival sweep ran:
  **R5 + R7 swept to `archive.md`** ("Swept 2026-07-02 (late 2)"), live index
  trimmed; branch restarted from the merged main. Sweep rides with this PR.
- Continued per the attack order — **R9 + R10** (both MED, WS-G), **PR #117**.
- **R9 — done.** `analyzeComparableProgress` short-phase fix: with ≤ window
  points the rolling max equals the phase best and there is no prior baseline,
  so every phase start asserted "improving" — even a strict decline (the MCP
  surface built to kill false trend reads). Now a short phase reads the trend
  within the window (latest vs first, tolerance-banded → declining /
  improving / plateau). New trend cases incl. `[120,110,100]` → declining
  and the two-point drop; the flat day-slot series still reads plateau.
- **R10 — done.** `replay_decisions`' seed branch now passes the stored
  `bodyweight` to `seedMeso` — under the live v16 bodyweight model the replay
  omitted it, so every bodyweight-lift seed replayed as the deferred
  null-weight prescription and diffed spuriously against ANY candidate,
  corrupting the doc-04 tuning loop. Regression test: a bodyweight seed
  replays unchanged under v16 (verified failing without the fix).
- **Next per the attack order:** R11 + R12 (MED, WS-G); R15 (MED, WS-D)
  behind them; then the LOW tail (R21–R25).

## 2026-07-02 — Session 35 (cont. 2): R5 + R7 — completion-lock hardening + SW cache trim (PR #116)

Continued per the attack order on the restarted branch — **R5 + R7** (both MED,
WS-K), **PR #116**. Full record in PROGRESS 2026-07-02 (latest). Migration
`20260702000006` applied live + verified.

- **R5 — done.** Migration `20260702000006_completion_lock_hardening`: the
  completion lock now covers the whole session surface, and child INSERTs
  verify parent ownership (FK checks bypass RLS). Workouts: update only while
  planned/in_progress (no completed→in_progress resurrection, no notes
  rewrites), insert only 'planned' into an owned micro, delete only planned
  rows with no logged sets (hard rule #5 at the DB layer). workout_exercises
  (the engine's `previous` + the volume counts): insert/update/delete gated on
  an open parent, delete also requires an empty slot. logged_sets INSERT gated
  open-parent + slot-belongs-to-workout. workout_feedback: bare FOR ALL →
  full open-parent lock (dampener no longer editable after the engine consumed
  it). exercise_feedback: INSERT + UPDATE WITH CHECK gain the owned-open
  parent EXISTS — the **feedback-slot squat** (unique `workout_exercise_id`
  squatted by a stranger, permanently blocking the victim's feedback) is
  closed. microcycles: no reopening completed weeks, insert into owned meso
  only, delete only history-free weeks. **Authed write-path inventory first**
  (agent sweep of queries/actions/MCP): completion writes land BEFORE the
  status flip, startMeso/regenerate touch only planned+history-free rows, no
  path leaves completed/skipped — nothing legitimate is blocked.
- **R7 — done.** `sw.ts` drops Serwist's `defaultCache` (NetworkFirst-cached
  documents/RSC/`/api/` for ~24h) for static-asset-only caching; anything
  else is NetworkOnly. Offline navigations now get a precached ledger
  `/~offline` interstitial (new route, public path, `additionalPrecacheEntries`)
  instead of silently stale prescriptions — online-only per hard rule #9.
  Auth screens mount `ClearClientCaches`: purge every non-precache
  CacheStorage cache (kills pages cached by previous SW versions on shared
  devices) + drop the `lastWorkoutId` session pointer.
- **Verification:** scratch-PG16 chain green (68 policies); **29 policy
  probes** (12 expected 42501 rejections, all legitimate flows pass — incl.
  the logSet upsert and the pre-flip completion sequence); **9 new RLS suite
  tests** (describe "completion-lock hardening (R5)") for CI; typecheck, lint,
  unit suite, production build green; built `sw.js` inspected (no document
  caching, fallback wired).

## 2026-07-02 — Session 35 (cont.): PR #115 merged + archival sweep

- **PR #115 MERGED** (all checks green — `rls-tests` rebuilt the chain with the
  transcribed file). Archival sweep ran: **T-R2 swept to `archive.md`**
  ("Swept 2026-07-02 (late)"), follow-up table trimmed; branch restarted from
  the merged main. Sweep rides with the next build PR (session-start
  reconciliation pattern).
- Continuing in-session with the next items per the attack order: **R5 + R7**
  (MED, WS-K).

## 2026-07-02 — Session 35: T-R2 — hosted perf migration transcribed into the chain (PR #115)

Reconciliation sweep: no-op (PR #113 was itself the R20 sweep; no `done` rows
live). Built the next item in the recorded attack order — **T-R2** (ready, own
PR) — on branch `claude/review-outstanding-work-xmlmuc`, **PR #115**. Full
record in PROGRESS 2026-07-02 (latest).

- **T-R2 — done.** New `supabase/migrations/20260620115322_perf_rls_initplan_
  and_fk_indexes.sql`: the out-of-band hosted migration transcribed **verbatim**
  (body pulled from hosted `supabase_migrations.schema_migrations.statements`
  as base64, decoded, md5-verified `25446aa1…` — zero hand-transcription) at
  its true chain position. 56 `ALTER POLICY` initplan wraps + 23 FK covering
  indexes. Two time-capsule references documented in the header
  (`shares_grantee_accept`, pre-recursion-fix `profiles_update_own`) — both
  superseded later in the chain exactly as on hosted. **No hosted apply
  needed** (the version row already exists there).
- **Verification (scratch-PG16 harness, R2-style — no Docker in this
  sandbox):** full chain + seed applies from zero (26/26 tables RLS-on, 330
  stock exercises); end-state **hash parity with hosted** on all 56 policy
  rows (qual/with_check/roles/cmd) and all 105 public indexes — same
  aggregate md5 both sides; **negative control** re-ran the chain without the
  file → policy hash diverges and exactly 23 indexes go missing. Typecheck,
  lint, unit suite green (SQL-only change).
- **Next per the attack order:** R5 + R7 (MED, WS-K); R9–R12/R15 behind them.

## 2026-07-02 — Session 34 (cont.): PR #112 merged + archival sweep

- **PR #112 MERGED.** End-of-session archival sweep ran: **R20 swept to
  `archive.md`** ("Swept 2026-07-02 (night)"), live index trimmed. Sweep
  shipped as its own small docs PR (a merged PR can't sweep its own row);
  branch restarted from the merged main per the follow-up rule.
- Reminder for the owner (external, manual-operations): set **`SENTRY_DSN`**
  in Vercel to turn on Sentry delivery — the structured console floor is
  already live in production logs.
- Next per the attack order: **T-R2** (ready, own PR — hosted migration
  transcription); then R5/R7 (MED, WS-K).

## 2026-07-02 — Session 34: R20 — production error observability (PR #112)

Reconciliation sweep: no-op (PR #111 was itself the R3/R4 sweep; no `done`
rows live). Built the next item in the review's attack order — **R20**
(observability, HIGH) — on branch `claude/open-work-review-oym68j`, **PR #112**.
Full record in PROGRESS 2026-07-02 (latest); 07 Phase 7 observability ticked.

- **R20 — done.** New `src/lib/observability/`: `reportError()` funnel —
  structured `[report:<scope>]` console line always (Vercel captures with no
  config), plus **dependency-free Sentry envelope delivery** when `SENTRY_DSN`
  is set (no SDK — deliberate, the client bundle is a live N1 concern; pure
  wire-format builders, 3s timeout, never throws). `instrumentation.ts`
  `onRequestError` catches every unhandled server error; the 5 deliberate
  swallow sites (freshness reconcile, seed decisions, complete/end week
  generation, workout-tab catch-up) + the MCP tool guard now report before
  degrading; new root `global-error.tsx` + `(auth)/error.tsx` boundaries and
  a same-origin-guarded, zod-capped pre-auth `/api/client-error` intake wired
  to all three client boundaries.
- **Verification:** 713 unit tests (+20), typecheck, lint, build; end-to-end
  probe on the built app against a mock ingest (204/403/400 paths + a
  correctly-formed envelope received; ingest-down still 204s).
- **Remaining external:** set `SENTRY_DSN` in Vercel (manual-operations row
  updated — console floor is live regardless).
- **Next per the attack order:** **T-R2** (ready, own PR — hosted migration
  transcription); then R5/R7 (MED, WS-K).

## 2026-07-02 — Session 33 (cont.): PR #110 merged + archival sweep

- **PR #110 MERGED** (all checks green, incl. `rls-tests`). End-of-session
  archival sweep ran: **R3 + R4 swept to `archive.md`** ("Swept 2026-07-02
  (evening)"), live index trimmed. Sweep shipped as its own small docs PR
  (a merged PR can't sweep its own rows); branch restarted from the merged
  main per the follow-up rule.
- Next per the attack order: **R20** (observability, HIGH); **T-R2** still
  ready (own PR); R5/R7 (MED, WS-K) behind them.

## 2026-07-02 — Session 33: R3 + R4 — write integrity (PR #110)

Reconciliation sweep: **PRs #104 + #105 merged** → archived **M8 / I11 / I14 /
P16 / P17 / PH37 / R6 / N4** to `archive.md` ("Swept 2026-07-02 (build 2)").
Then built the next items in the review's attack order — **R3 + R4** (write
integrity, both HIGH) — on branch `claude/open-work-review-x3yv06`, **PR #110**.
Migration `20260702000005` **applied live + verified**; full record in
PROGRESS 2026-07-02 (latest).

- **R4 — done.** `regenerateOpenWorkouts`' two delete branches now exclude
  anything carrying logged sets (pure `withoutLoggedHistory`); `logSet`'s
  in_progress flip error surfaced; `completeWorkout` statuses batched +
  error-checked. The hard-rule-#5 cascade path is closed from both ends.
- **R3 — done.** Atomic DB functions for the three multi-statement flows
  (`save_meso_plan` with an ownership guard, `activate_engine_params`,
  service-only `insert_generated_day` which also ADOPTS poisoned empty days —
  `planCatchUp` now flags them as gaps); `startMeso` made retry-safe instead
  of transactional (seed math stays pure-TS, recorded deviation); unique keys
  on `workouts (microcycle_id, day_number)` + `logged_sets
  (workout_exercise_id, set_number)` with `logSet` upsert semantics — the
  live DB's 11 retry-storm duplicate groups (15 excess rows, double-counted
  volume) deduped in the migration (recorded rule-5 deviation, newest row
  kept). MCP: `create_mesocycle` days path validates dup days/groups +
  exercise existence up front, zod bounds, orphan-draft compensation;
  `edit_mesocycle add_day` rejects same-group-twice days.
- **Verification first:** Docker was available this session — the full
  migration chain + the RLS suite (35 green, +6 new) ran on a from-scratch
  local stack BEFORE the live apply; atomicity/adoption/guard behaviors
  probed on both local and live. Unit suite **693 green (+15)**, typecheck,
  lint, build.
- **Next per the attack order:** R20 (observability, HIGH); T-R2 still ready
  (own PR); R5/R7 (MED, WS-K) behind them.

## 2026-07-02 — Session 32 (cont.): I14 slider unification (PR #105, stacked on #104)

Same session, own PR per the build order (it carries a data migration). Branch
`claude/i14-slider-unification-rh81n2`, **stacked on the PR #104 branch** so the
shared docs files don't conflict; GitHub retargets it to main when #104 merges.
Migration `20260702000004` **applied live + verified**.

- **I14 — done.** All feedback sliders on one 0–10 scale: session sliders drop
  0–4 (UI max + defaults 2→5, zod + engine input bounds widened);
  stored `workout_feedback` rescaled round(x×2.5) (28 rows, exact map
  verified live); **engine_params v18** (thresholds 8/3 — same trip points on
  the rescaled data) **ACTIVATED in the migration** — recorded deviation from
  ship-inactive: the rescale and the thresholds are inseparable. Replay of old
  decisions unaffected (stored inputs + stored params); diffing old decisions
  *against v18* mixes scales — documented caveat. MCP scale legend updated
  (incl. the stale soreness "0–3"). New `session-scale.test.ts` (exhaustive
  0–4→0–10 equivalence + §S5 on the new scale); v18 provenance hash guarded.
  **660 tests (+5)**, typecheck, lint, build green.
- **Next:** R3+R4 (write integrity) per the review's attack order; T-R2 ready.

## 2026-07-02 — Session 32: Batch-4 build 2 — the WS-C consumers + nav/date fixes (PR #104)

Reconciliation sweep: **PR #103 merged** → archived **R14 / P18 / P21 / PH33 /
T-A1 / T-A2** to `archive.md` ("Swept 2026-07-02 (build 1)"). Then built the
Session-31 build order's consumer half on branch
`claude/ws-c-consumers-p16-rework-rh81n2`, **PR #104**. The R6 migration
**applied live** and probe-verified. Full record in PROGRESS 2026-07-02
(latest) + the new dated design-changelog entry (09 2026-07-02 session 6).

- **I11 — done.** Per-exercise est-strength %-change (≥3 non-deload sessions,
  engine e1RM undecayed, deloads excluded) on the meso + macro Performance
  tabs; progress scores now carry `sessions` and generalize to macro scope
  (`getProgressScores`). Live check: 18/24 exercises qualify in one active
  meso — the subbed-in exclusion bites as intended.
- **PH37 — done.** STRENGTH BY MUSCLE GROUP — role-weighted rollup
  (primary 1.0 / secondary 0.5, the R14 counting weights) of I11's qualifying
  scores; meso + macro scopes; both MCP summaries expose it.
- **M8 — done.** Macro page gains OVERVIEW|BALANCE|PERFORMANCE; Balance
  reuses the meso fold over a concatenated week axis (materialized weeks
  only); Performance = I11/PH37. Tab naming reconciled to **BALANCE** on both
  surfaces (owner said "volume" in P16 / "balance" in M8; 09 had retired the
  Volume tab name — recorded in 09 2026-07-02 §1).
- **P16 — done (the large one).** Meso page reworked: day-view-style sticky
  header (calendar dropdown = the old week×day matrix, share sheet, ⋮ menu
  with edit/save-template/delete, whole-grid progress bar) over the same
  three-way toggle; Overview = read-only planner board (`MesoPlanView`);
  `/cycles/meso/[id]/stats` now redirects into the toggle; `AnchoredMenu`/
  `MenuRow` extracted to `components/ui/`; `DeleteMesoButton` folded into the
  header menu and deleted.
- **P17 + N4 — done.** Day view has no back button (option 2); "View
  exercise" carries `?from=/log/<id>` and the exercise page returns to the
  originating day view.
- **R6 — done.** `logged_sets.performed_on` (client-local day) migration
  `20260702000003` applied live (10,821 rows backfilled to their old UTC
  bucket, 0 diverging — reads unchanged until new sets), day view sends
  `localDayIso()` at log time, `v_exercise_history` re-bucketed; the 6
  `shortDate` copies collapsed into `lib/dates.ts`.
- Green: **655 tests (+11)**, typecheck, lint, production build. Docs:
  PROGRESS entry, 09 dated entry (P16/M8/I11/PH37/P17/N4 + rule-8
  deviations + tab naming), backlog rows stamped, scoping synced.
- **Next:** **I14** (slider unification 0–10 + data rescale — own PR, next in
  this session if capacity allows); then R3+R4 (write integrity) per the
  review's attack order; T-R2 still ready.

## 2026-07-02 — Session 31: Batch-4 build 1 — the metric-definition foundation (PR #103)

Reconciliation sweep: no-op (only stale unrelated #48 open; no `done (PR #n)` rows
live). Followed Session 30's suggested build order — the dependency-first foundation
that unblocks the WS-C stats/meso rework — plus the independent quick wins that fit.
Branch `claude/review-prioritize-work-egj0xt`, **PR #103**. Both migrations
**applied live** and probe-verified.

- **R14 — done (PR #103).** Fractional 1.0/0.5 volume counting + the RIR≤4
  hard-set rule (doc 10 §2). New role-grain view `v_meso_week_muscle_sets`
  (facts per meso×week×muscle×role, hard-set rule baked at the doc default:
  rir ≤ 4 or unreported, warm-ups never count) + ONE shared pure fold
  (`engine/volume.ts::fractionalSetCount`, weights from new optional
  `volume.direct/indirect` params keys — v11+ `.optional()` discipline, stored
  rows stay replayable) consumed by: stats matrix/Balance, MCP volume/balance/
  preview tools, the PH34 projection + planner baseline, and the engine's
  weekly-set ceiling input (fractional `muscleGroupWeeklySets`; derived input →
  no fingerprint churn). Live parity check: primary counts = old view exactly
  (43=43); secondaries add the missing compound credit; 0 all-time sets above
  RIR 4 (no retroactive bite). **Recorded deviation:** `counting_max_rir` /
  `warmups_count` are view-baked doc defaults, not live params (SQL can't read
  versioned params; a param the counting SQL can't honor would silently lie).
  Old `v_meso_week_sets` + dead `v_muscle_group_volume` → retire with R23.
- **T-A1 — done (PR #103).** Engine e1RM everywhere:
  `v_exercise_overview`/`v_meso_summary` `best_e1rm` = max stored per-set
  engine e1RM; new `v_exercise_history.best_set_e1rm` (REP-PR comparisons now
  set-grain, closing the avg-vs-best inflation from the 06-26 change); stats
  inline raw Epley + dead `epleyE1rm` deleted — raw Epley survives nowhere.
  Stats undecayed; decay prescription-only. **Half-life confirmed MCP-tunable**
  (`e1rm.recency_halflife_days: 30` in the active v17 row). Answers PH39.
- **T-A2 — done (PR #103).** `getMesoProgressScores` skips deload-microcycle
  sessions; volume + PR stats keep deloads; denoted in MCP notes.
- **Quick wins:** **P18 done** (set-type menu row hidden, model dormant);
  **PH33 done** (admin tools hidden from `tools/list` via a role-filter wrap of
  the SDK handler; call-time denial unchanged); **P21 done — verified no-op**
  (explicit 0 already stored for `soreness_days`).
- Green: **644 tests (+15)**, typecheck, lint, production build (`/log` 126 kB
  unchanged). Docs: PROGRESS entry, root `CLAUDE.md` shared-views line →
  `v_meso_week_muscle_sets`, rows/scoping/A-detail synced.
- **Next per the build order:** the WS-C consumers — **I11 + PH37 + M8** (stats
  screens on the new definitions) and **P16** (meso surface, large); **I14**
  (slider unification, own PR — data migration); **P17+N4**, **R6** remain
  ready. R3+R4 (write integrity) still queued from the review's attack order.

## 2026-07-02 — Session 30: owner decision batch (Batch 4) — 17 needs-input items resolved

Reconciliation sweep: no-op (Session 29 already merged PR #100 and swept R13/R18/R19;
no `done (PR #n)` rows live). This session was **notes-only** — no code changed. Claude
had compiled every open `needs-input` item into a fill-in Word doc last turn; the owner
returned it with a decision per item. Captured the verbatim responses as **backlog
appendix Batch 4** and folded the decisions into every row + detail file. Owner will
merge these notes and start building in a new session.

**Decisions applied (17 items):**
- **Stats cluster (WS-C):**
  - **T-A1** → ready: standardize on the **engine e1RM formula** everywhere (retire
    the last raw-Epley `v_exercise_overview.best_e1rm`). **Stats show the undecayed /
    best-ever value**; **recency decay is reserved for prescriptions only**. Keep the
    30-day half-life (confirm it's MCP-tunable). Answers PH39.
  - **M8** → ready: build the macro **Overview|Balance|Performance** stats screen
    **without a mockup** (rule-8 deviation to record); meso Performance est-strength
    confirmed. Build the meso side *through* **P16**.
  - **I11** → ready (HIGH): est-strength %-change per exercise for **every exercise
    logged ≥3× in the meso** (excludes subbed-in/inconsistent lifts).
  - **PH37** → ready: muscle-group strength-gain rollup at **macro + meso** scopes;
    **all-time dropped** (no natural home).
  - **T-A2** → ready: **exclude deloads from strength-progress scoring**; keep them in
    volume + PR stats; denote where relevant.
  - **R14** → ready: implement **fractional 1.0/0.5** volume counting **and** the
    **RIR≤4 hard-set** rule per doc 10 (no spec amendment). Foundational — **sequence
    before** the stats rework since it moves every Balance/MEV/MRV number.
- **Engine (WS-A/G):**
  - **T-A5** → **deferred**: keep the ±1 model; don't amend doc 10 (graded ramp stays a
    future option). Owner idea: expose training style (±1 vs graded ramp) as a
    **setting / macrocycle-type selection** down the road.
  - **T-A6** → **closed/archived** (owner confirmed WS-I resolved it).
  - **R24** hold-week reprice-down: **logged for future investigation** (owner sees the
    concern — a decayed anchor makes a "hold" drift down; matters most for **cut/maintain**
    macro types); no fix decided. Row annotated, stays triaged.
- **Day-view / nav UX (WS-E):**
  - **P17** → ready: option 2 (no back button in the Workout-tab day view). Spawned
    **N4** (deep-link return-to-origin — back from "view exercise" should land on the day
    view, not the exercises list).
  - **P18** → ready: hide the **set-type menu affordance only**; leave the drop-set model
    dormant.
  - **M10** → **wontfix/archived** ("leave unplanned mesos as they are").
- **Meso surface (WS-C/D):**
  - **P16** → ready (**large**): meso page reworked to an **Overview|Volume|Performance**
    toggle (absorbs the MESO STATS button) + a **read-only planner-board Overview** +
    a day-view-style header (calendar button w/ clickable days → day/plan view, share
    button, ⋮ menu for edit/save-template/delete). Full spec in `scoping.md`. Subsumes
    M8's meso side; naming of the "VOLUME" vs "BALANCE" tab flagged for build.
- **Feature scope (WS-E/F/H):**
  - **I14** → ready (HIGH): **unify all feedback sliders to one 0–10 scale** and
    **rescale existing persisted data** (needs a data migration + engine/golden updates).
  - **PH30** → **deferred**: LLM stays an *explanation layer over* the deterministic
    engine (session-note-aware, verbose rationale, light PT advice via MCP), never a
    replacement. Parked.
  - **PH33** → ready: hide admin tools from `tools/list` for non-admins (visibility only;
    denial already enforced).
  - **P21** → decided (store explicit 0) → **verify** current behavior already does so.
- **Data correctness (WS-K):**
  - **R6** → ready: use the **client-supplied local date** at record time; consolidate the
    6 `shortDate` copies.

**Files touched:** `backlog.md` (index rows, follow-up table, new **N4**, appendix Batch 4),
`archive.md` (swept **M10** wontfix + **T-A6** done), `A-engine-metrics.md` (T-A1/T-A2/T-A5/T-A6
follow-up rows), `scoping.md` (M8/M10/I14/P16/P17/N4/P18/PH33 + the blockers note), `README.md`
(WS-H roster). No code/schema/engine change; no tests run.

**Suggested build order for the next session** (dependencies first): **R14** (fractional
volume — unblocks the stats numbers) → **T-A1 + T-A2** (e1RM standardization + deload
exclusion — the metric definitions) → **I11 / PH37 / M8 / P16** (the stats + meso-surface
rework, which all consume the above) in a coherent WS-C push. Independent quick wins in
parallel: **P17+N4**, **P18**, **PH33**, **R6**, **P21** (verify). **I14** (HIGH) is
self-contained but carries a data migration — its own PR.

## 2026-07-02 — Session 29 (cont.): PR #100 merged + owner revert + archival sweep

- **maximumScale revert (owner ruling).** The R18 pinch-zoom bullet dropped
  `maximumScale:1`; the owner ruled the zoom cap **stays** (installed-PWA
  native feel > the WCAG 1.4.4 concern). Reverted in `c2cc15c`; the ruling is
  recorded on the viewport config, PROGRESS.md, and the R18 row so it isn't
  re-"fixed". PR body updated.
- **PR #100 MERGED** (main `e3e1775`). End-of-session archival sweep ran:
  **R13 / R18 / R19 swept to `archive.md`** ("Swept 2026-07-02"), live index
  trimmed. Branch restarted from the merged main for the sweep (a merged PR
  can't sweep its own rows). R18's zoom-cap sub-bullet carried into the
  archive as wontfix.
- Next per the review's attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-02 — Session 29: R13 + R18 + R19 — the UI/UX cluster (workstream E/G day-view surface)

Reconciliation sweep: no-op (session 28's sweep PR #99 already merged; no
`done (PR #n)` rows live). Owner steered this session toward "documented UI
issues and things that impact user experience" — picked the three open
UX-facing items sharing the day-view surface over the attack order's R3+R4
(write integrity, now next up). Branch `claude/notes-review-priorities-zx5f1v`.

- **R13 — done.** The SetRow re-sync effect no longer clobbers in-progress
  typing: split into an own-logged-set effect (always adopts — it's the row's
  own write echoing back) and a planned-input effect (`set_weights`/bodyweight
  changes adopt only while the row has no uncommitted edits). The rule is pure
  + unit-tested (`day-rules.ts::adoptServerRowState`). Closes the client-side
  cousin of N3: an auto-match fan-out or blur-persisted weight revalidating
  0.5–2s later could silently replace typed reps right before LOG.
- **R18 — done.** New shared `useModalA11y` (focus in/restore, Tab trap,
  Escape via a top-most-overlay stack) wired into BottomSheet (~18 sheets),
  CompleteSheet (also gained role="dialog"/aria-modal), and AnchoredMenu
  (menuitem roles + ↑/↓/Home/End). Tap targets to the WCAG 24px floor with
  visuals unchanged: LOG checkbox button fills its 44×32 cell (21px box stays
  the visual), per-set ⋮ → 24×32, planner ▲▼ → 24×24 (rule-8 note in
  PROGRESS: arrows sit ~5px further apart — the only visible delta).
  The `maximumScale:1` bullet was **ruled against mid-PR (owner,
  2026-07-02)**: the cap stays — installed-PWA native feel outranks the
  WCAG 1.4.4 concern; ruling recorded on the viewport config. The full
  doc-07 Phase-7 a11y audit remains its own phase item; this closes the
  scoped defects.
- **R19 — done (all 3 bullets).** New `(app)/not-found.tsx` ledger card inside
  the app shell (10+ `notFound()` sites dead-ended on Next's unstyled default);
  landing there clears the stale session `lastWorkoutId` so the Workout tab
  can't 404 forever after its meso is deleted. CompleteSheet totals now share
  the header's skipped-slot-excluded math via pure `day-rules.ts::daySetTotals`
  (unit-tested); the third bullet (SAVE AS TEMPLATE SubmitButton) had already
  shipped with R17/PR #98.
- Green: **629 tests (+15)**, typecheck, lint, production build (`/log`
  first-load 126 kB, +1 kB = the a11y hook). No engine/schema/query change.
- Next per the attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-01 — Session 28: R17 + R16 — field usability, shipped together (PR #98)

Reconciliation sweep: no-op (only the stale unrelated #48 open; no `done (PR #n)`
rows live — session 27's sweep PR #97 already merged). Picked the next items in
the review's attack order: **R17 + R16** (the two destructive-failure modes; the
review says ship together). Branch `claude/notes-review-prioritize-1ore6l`.

- **R17 — done (PR #98).** No sheet write can reach the `(app)` error boundary
  anymore (that unmount was what destroyed typed input): the shared day-view
  `commit` (all ~14 menu ops) catches + toasts, on the argument that a failed
  write with no revalidation leaves the view already-rolled-back; NoteSheet /
  FeedbackSheet save in their own transition and close only on success (typed
  note + sliders survive failure, SAVING… label); CompleteSheet, END WORKOUT /
  END MESOCYCLE, and AddExerciseSheet ADD keep their sheet open on failure;
  logged-set amends go through `runLog` (spinner/shake/retry-on-next-blur).
  Fetch-on-open sheets (History / Replace / AddExercise) get the
  PrescriptionDetailSheet catch + stale-guard + a shared `FetchRetry` RETRY
  state instead of a permanent "Loading…". The meso page finally reads the
  `?error=template` param `saveMesoAsTemplateAction` has always redirected to
  (was silent), and that submit got the Phase-A `SubmitButton` treatment —
  closing one R19 bullet (row annotated; R19 stays triaged with 2 bullets).
  `(app)/error.tsx` no longer claims "Nothing was lost".
- **R16 — done (PR #98).** `doSave` catches: a failed `saveMesoPlanAction`
  keeps the staged `workDays` and the confirm sheet open (one-tap retry)
  instead of remount-and-discard. New `useNavigationGuard`
  (`components/ui/useNavigationGuard.ts`): while `editing && dirty`, in-app
  anchor clicks are intercepted capture-phase (before Next's Link), browser
  back is absorbed via a history sentinel, tab close gets native beforeunload;
  all land in the discard-confirm sheet, which now carries the intercepted
  destination. Pure `shouldGuardNavigation` rule unit-tested (5 tests).
  R3 (the server half — non-atomic `saveMesoPlan`) stays open, next up.
- Green: **614 tests (+5)**, typecheck, lint, production build (`/log`
  first-load unchanged at 125 kB). No engine/schema/query change.
- **PR #98 MERGED** same session (all checks green, incl. `rls-tests`) →
  end-of-session archival sweep ran: R17 + R16 rows swept to `archive.md`
  ("Swept 2026-07-01 (evening)"). Sweep shipped as its own small docs PR (a
  merged PR can't sweep its own row). On-device failure-path spot check
  (e.g. airplane-mode a note save) is the owner's final confirmation.
- Next per the attack order: **R3 + R4** (write integrity), then R20
  (observability). R6/R14 owner decisions still queued.

## 2026-07-01 — Session 27: R2 — clean-DB migrations fixed; guardrail chain revived (PR #96)

Reconciliation sweep: **PR #95 merged** → archived **R1** and **R8** to
`archive.md` ("Swept 2026-07-01 — review top two merged"). Picked the next item
in the review's attack order: **R2** (the guardrail revival everything else
relies on). Branch `claude/notes-review-prioritize-rz0rkh`.

- **R2 — done (PR #96).** The chain now reproduces a working DB from zero;
  verified on a scratch Postgres 16 with a simulated Supabase bootstrap (no
  Docker in the sandbox), one transaction per file + `seed.sql`. Three breaks,
  three fixes (detail in PROGRESS 2026-07-01):
  1. `is_admin()` reordered after `profiles` in the initial migration (LANGUAGE
     sql body validated at create time). Recorded rule-#2 deviation — reorder
     only, end-state identical to hosted (normalized def match verified).
  2. **New `20260611000002_seed_muscle_groups.sql`** — the 12 muscle-group rows
     lived only in seed.sql (runs *after* migrations), but 0615-6 joins them to
     link the stock library (silently 0 links on clean DB) and 0617-2 hard-fails
     seeding templates. This second break was masked by the first — found only
     because the scratch run got past `is_admin`.
  3. **New `20260619000002_rls_auto_enable.sql`** — captured the hosted-only
     function + `ensure_rls` event trigger verbatim (read via MCP
     `pg_get_functiondef`, which voids the runbook's "human-only" rationale);
     guarded/idempotent, grants left to 0620 (end-state ACL = hosted). Both new
     migrations **applied to hosted via MCP as recorded no-ops**.
  4. **Version collision** (caught by the PR's own first CI run, not the
     scratch harness): two files shared prefix `20260616000001` and the CLI
     tracking table PKs on version → renamed `adherence_rule` to
     `20260616000004` (= true hosted order). Harness now simulates the
     tracking table; full chain re-verified post-reorder.
  5. **Missing table grants** (caught by the suite's first-ever execution —
     CI run 2): no migration GRANTs on tables; hosted rode on postgres
     default privileges, the CI local stack has none → "permission denied
     for table macrocycles" pre-RLS. New end-of-chain
     `20260701000003_table_grants.sql` reproduces hosted's posture (ALL on
     tables/sequences to the three roles + default privileges; functions
     untouched so the 0620 revokes stand; RLS default-deny stays the gate).
     Verified on scratch with zero simulated defaults; hosted no-op
     (relacl identical before/after).
  6. **Stale escalation assertion** (CI run 3 — 28/29 tests passed): the
     role-escalation test expected a silent 0-row update (`[]`), but the
     WITH CHECK rejection errors with 42501 (the hosted-verified behavior
     from the 06-22 recursion-fix probe). Assertion fixed + strengthened
     (role verified unchanged after the attempt).
  - **CI GREEN (run 4, commit 4e05683):** `rls-tests` succeeded for the
    first time ever — all 29 RLS tests pass against a from-scratch stack;
    `checks` green too. The hard-rule-#1 guardrail is live. Owner step:
    make both checks required after merge (runbook).
  - **PR #96 MERGED** same session → end-of-session archival sweep ran:
    R2 row swept to `archive.md` ("Swept 2026-07-01 (later) — R2 merged").
    T-R2 stays open in the follow-up table. Sweep shipped as its own small
    docs PR (a merged PR can't sweep its own row).
  - End-state checks: 26/26 tables RLS-on; stock data identical to hosted
    (330 exercises / 352 links / 8 templates); single active params v10;
    `ensure_rls` proven to auto-enable RLS on a new table.
- **T-R2 filed (ready).** Full hosted↔clean-DB diff surfaced the remaining
  drift: out-of-band hosted migration `20260620115322` initplan-wrapped ~54
  policies + added 23 FK indexes the repo chain doesn't reproduce. Perf-only;
  own PR (mechanical but security-sensitive).
- **Runbook updated:** migration-reconciliation section marked RESOLVED; new
  human step added — make `checks`+`rls-tests` **required status checks** on
  `main` *after* this PR merges green (GitHub MCP has no settings surface).
- R21 note updated (integration tests unblock on merge). Next per the attack
  order: **R17+R16** (field usability), then R3+R4 (write integrity).

## 2026-07-01 — Session 26: R1 + R8 — the review's top two, shipped live (PR #95)

Reconciliation sweep: no-op (no `done (PR #n)` rows live; I12 `advanced (PR #92)`
intentionally live, N1 in-progress). Picked the review's suggested attack order:
**R1 + R8** (small diffs, worst consequences). Branch
`claude/notes-review-prioritize-diew7r`.

- **R1 — done (PR #95).** Share redemption is no longer a cross-user copy
  primitive. Migration `20260701000002` drops `shares_grantee_accept` (RLS can't
  scope columns; no client path updates shares — redemption runs on the service
  client, so the policy's only real use was the exploit). **Applied live** and
  probe-verified: a simulated grantee UPDATE (authenticated role + JWT sub)
  touches 0 rows; grantee SELECT + owner control intact. Defense in depth:
  `acceptShareCode` now asserts every copied object is owned by
  `share.owner_id` (stock exercises excepted) — also closes the owner-side
  rewrite surface (`shares_owner_all` allowed re-pointing one's own share at a
  victim uuid; the insert path was already ownership-checked but the update
  path wasn't). New `shares` RLS describe block (grantee read-only; runs once
  R2 revives the job) + 5 mocked-service ownership tests in `sharing.test.ts`.
- **R8 — done (PR #95), v17 ACTIVATED.** Doc 10 §3 step 0 is now enforced:
  new optional `pain_cut_gate` param (v11–v16 `.optional()` discipline — absent
  ⇒ legacy, pre-v17 decisions replay byte-identically); with it present the
  feedback rule runs pain first — pain ≥ `pain_gate` (2) vetoes set additions,
  pain ≥ `pain_cut_gate` (3) forces −1 set + a substitution note, regardless of
  workload/pump. Table-driven `pain-gate.test.ts` (13) + a bounds property
  invariant (no set increase under the gate over 500 randomized inputs) + v17
  hash guard. Migration `20260701000001` (v17 INACTIVE) **applied**, then
  **activated** after replay verification: v16-sourced decisions show zero
  set-count diffs (the only 2 diffs are the pre-existing R10 bodyweight-seed
  replay artifact — R10 stays open); live history has pain ≥ 2 twice, pain 3
  never, so activation changes nothing retroactively and only bites when pain
  recurs. Open prescriptions re-stamp on next view via the freshness reconcile.
- **R2 — advanced (PR #95).** Folded in the stale-assertion half since this PR
  already edits `rls.test.ts`: the recursion-guard test now updates
  `display_name` (not the dropped `units` column) and the engine-params read
  asserts one active row at version ≥ 10 instead of the long-stale `=== 5` pin.
  Remaining (own PR): clean-DB migration ordering, commit `rls_auto_enable()`,
  make the CI jobs required checks.
- Green: **609 tests (+21)**, typecheck, lint. Next per the attack order: finish
  **R2** (revive the migrations/RLS/CI guardrails — also unblocks the new shares
  RLS tests actually running), then R17+R16.

## 2026-07-01 — Session 25: full-surface repo review → items R1–R25 (Batch 3) (PR #94)

Reconciliation sweep: no-op (same state as Session 24 — I12 `advanced (PR #92)`
intentionally live, N1 in-progress). Owner asked for a proactive whole-repo review
("issues and opportunities for significant and impactful improvements…
regardless of how ambitious") with findings folded into this area.

Ran five parallel domain reviews (engine/analysis, data layer/DB/RLS, UI/app
routes, MCP/API/middleware/PWA, cross-cutting tooling), each briefed to exclude
already-tracked ground (WS-J, Phase-A gaps, T-A1, doc-07 open phases). Re-verified
the top claims directly (shares policy SQL + copy path, pain-gate code,
regeneration delete branches). Result: **25 new items (R1–R25)** filed under two
new workstreams **K** (integrity & security hardening) and **L** (delivery
guardrails & observability) plus existing C/D/E/G. Evidence + file:line scoping in
[`docs/reviews/2026-07-01-repo-review.md`](../reviews/2026-07-01-repo-review.md)
(serves as the scoping record; no separate `scoping.md` entries).

Headlines, by severity:
- **R1 (HIGH, security):** share redemption = cross-user copy primitive
  (grantee can rewrite `object_id`; service-role copy never checks the owner).
- **R2 (HIGH):** the hard-rule-#1 guardrail is dead — migrations don't apply to a
  clean DB (documented since 06-20, unfixed) + the RLS suite has stale
  assertions; **every CI run since ~06-20 is red** and checks aren't required.
- **R3/R4 (HIGH):** `saveMesoPlan` delete-then-insert can wipe an active plan
  (reachable from the new PR-#92 MCP authoring input gaps); regeneration can
  cascade-delete logged history (hard-rule-#5 breach path).
- **R8 (HIGH, engine safety):** joint-pain 3/3 still *adds* a set — doc 10's one
  hard safety gate unenforced on set additions (verified by execution).
- **R17 (HIGH, UX):** sheet writes fail destructively — typed notes/feedback
  destroyed by the error boundary while the error page claims "Nothing was lost".
- **R20 (HIGH):** zero production error observability; reconcile failures =
  silently stale prescriptions.
- Needs-input: **R6** (canonical local-day rule for UTC date drift) and **R14**
  (implement doc 10's fractional 1.0/0.5 volume counting vs amend the doc —
  changes every Balance/MEV/MRV number; informs I11/PH37/M8).

Suggested attack order: R1+R8 (small diffs, worst consequences) → R2 (revives the
guardrails) → R17+R16 (field usability) → R3+R4 (write integrity) → R20
(observability). Owner decisions queued: R6, R14 (+ the R24 ramp-hold design nit).

## 2026-07-01 — Session 24: WS-J Phase 1 — client bundle & render slice (PR #93)

Reconciliation sweep: no-op (only PR-linked live row is I12 `advanced (PR #92)`,
merged but intentionally live — in-app planner UX remains). Picked the next J slice
per `J-performance.md`: Phase 1 client bundle/render (the planner draft-path rework
stays its own isolated follow-up).

- **`/log` + `/workout`: 142 → 125 kB First Load JS (−17 kB gz).** Chunk
  fingerprinting showed the "engine" delta was mostly **zod itself** (12.7 kB gz,
  present only because `reps.ts`/`e1rm.ts` parse params inside every exported
  function) + the params/schema layer (4.7 kB).
- **`engine/predict.ts`** — zod-free predictor core (type-only imports, keyed on the
  validated `params.e1rm` slice); `e1rm.ts`/`reps.ts` keep byte-identical public
  APIs as parse-then-delegate wrappers (hard rule #6 intact). `predict.test.ts`:
  core ≡ wrapper on two param generations + a static no-runtime-zod import guard.
  Server bonus: `recencyWeightedE1rm` parses once per anchor, not per sample.
- **DayView render path:** future-row predictions + P19 markers `useMemo`ized;
  `ExerciseBlock` → `React.memo` with stable id-taking callbacks (functional
  updates) so one block's menu/typing doesn't re-render the rest; day progress
  counts memoized; `HistorySheet`/`PrescriptionDetailSheet` via `next/dynamic`.
- **Measure-first corrections recorded:** the planned weight-input debounce was
  moot (prediction fires on blur, not per keystroke); `ExerciseBlock` already
  existed — the gap was memo + stable props, not extraction.
- Green: 588 tests (+4), typecheck, lint, production build. N1 stays in-progress
  (remaining: Phase 2 #5/#6/#7 caching; planner draft-path optimistic; Phase 3).

Built the connector's plan-into-a-macro authoring surface (from a needs doc the owner
relayed from the LLM coach). Advances **I12** (was `triaged (needs design pass)`) — the
MCP side now ships; row set to `advanced (PR #92)`
with the remaining in-app planner UX called out. New/extended tools: `edit_mesocycle`
`add_day`/`remove_day` (build a whole day, or a plan from an empty meso, in one call);
`place_mesocycle` + `create_mesocycle`/`duplicate_mesocycle` `macrocycle_id` (author/attach
into a slot); `update_mesocycle` (header edit); `duplicate_mesocycle`; `manage_macrocycle_slots`;
gated `activate_mesocycle` with the **sequential-activation invariant** (planned mesos seed only
after prior blocks complete — wired into `startMeso` so the app respects it too);
`preview_mesocycle_volume` (non-persisting MEV/MAV/MRV check). No schema change; suite green
(584), typecheck + lint clean. Detail in PROGRESS 2026-07-01 + 05-mcp-connector.md §Write.

## 2026-06-30 — Session 22: WS-J — iOS PWA launch screens (the pre-document gap)

#89 merged + owner-verified ("in general it looks good"); the remaining black is the iOS
**pre-document** launch blank (the OS screen between the icon tap and the WebView loading the
start URL — iOS ignores the manifest `background_color` and shows black unless an
`apple-touch-startup-image` matches the device exactly). Owner is installed to the iOS home
screen and wants it gone.

- **24 launch images** (`public/splash/apple-splash-<pw>-<ph>-<theme>.png`) — solid brand
  background (cream `#f4f0e6` / dark `#14110c`) matching the in-document `Splash`, generated with
  `sharp` for 12 portrait iPhone classes (SE → 16 Pro Max) × light/dark. Reproducible via
  `scripts/gen-ios-splash.mjs`.
- **`<link rel="apple-touch-startup-image">` per class** emitted from the root layout head,
  driven by `src/lib/pwa/ios-launch-screens.ts` (exact `device-width/height/-webkit-device-pixel-
  ratio/orientation/prefers-color-scheme` media queries). Verified 48 well-formed tags render.
- Result: home-screen launch now shows the brand background (not black) → in-document logotype
  splash → content. Solid bg keeps the OS-screen → document-splash transition seamless (no
  icon/text pop; sidesteps the cream-tiled-icon blending differently per theme).
- Green: typecheck, lint, production build. On-device cold launch is the final check (the gap is
  iOS-OS-level, not reproducible headlessly).

## 2026-06-30 — Session 21: WS-J — cold-start splash (no more black screen)

Owner: cold load is 3–5s of **black screen** ("is it hung?"); fine with the load time, just
doesn't want to stare at black. Root cause: `(app)/layout.tsx` does `await auth.getUser()` (a
network call) before rendering anything, and there's no Suspense boundary above it, so nothing
paints for the whole TTFB (black on a dark-themed device). The manifest bg is already cream;
the user's device is in dark mode (theme-color `#14110C`).

- **Branded cold-start splash** (`components/ui/Splash.tsx`) streamed as the **root** Suspense
  fallback (`app/layout.tsx` wraps `{children}`). Paints from the first byte — app background +
  "workout" logotype + a quiet activity cue — so a cold/hard load shows the app starting, then
  swaps to the per-route skeleton when the shell streams in, then content. Theme-aware
  (`bg-bg-base`/`text-ink`). Soft tab navigations are unaffected (they use per-route loading.tsx).
- Doesn't change load time (owner's stated preference) — removes the black void during it.
- Note: covers the document/data load. The iOS PWA **pre-document** launch blank (needs
  `apple-touch-startup-image`s) is a separate, larger follow-up if still bothersome.
- Green: typecheck, lint, production build. Streaming verified structurally (the placeholder-auth
  path fast-redirects, so the splash window only exercises with a real authenticated session —
  on-device cold launch is the final check).

## 2026-06-30 — Session 20: WS-J — advisor cleanup (security + cheap perf migrations)

#87 merged + owner-verified. Acknowledgment north star is largely met (#85 + the toggle
conversions cover the daily-loop surfaces; only the lower-frequency PlannerBoard *draft* path
remains a residual). Picked the remaining audit migrations — led by a real **security ERROR**.

- **Migration `20260630000002_advisor_cleanup.sql` (applied + verified live).**
  - **#2 (security ERROR):** `v_exercise_overview` was SECURITY DEFINER → bypassed RLS. Confirmed
    every usage filters `.eq(user_id, …)` and the view is per-user; flipped to `security_invoker`.
    Verified live: simulating an authenticated user, the view returns exactly their own 111 rows,
    **0 foreign** — same app data, now RLS-enforced; the linter ERROR is cleared.
  - **#9:** FK index `exercise_param_overrides(exercise_id)` (was a seq scan on the reconcile path).
  - **#10:** wrapped the owner RLS policy `auth.uid()` → `(select auth.uid())` (init-plan, per-query).
- **Left intentionally:** `current_profile_role`/`is_admin` SECURITY DEFINER function WARNs (the
  anti-recursion RLS helpers — they return only the caller's own role/admin status, not a leak),
  the leaked-password dashboard toggle (already in `manual-operations.md`), and the unused-index /
  `shares` multi-policy INFO/WARN noise.
- Docs only on the code side (no TS change; view columns unchanged → no type regen). Suite/types
  unaffected.

## 2026-06-30 — Session 19: WS-J — return-to-tab snappiness + nav label fix

Owner feedback after #86 merged: (a) the page-switch label still ghosts ("double layer"),
(b) the Workout tab takes ~1s and reloads everything + resets to the current day every tap;
wants it to "just switch back to where I was" (day/week/scroll retained). Investigated the
reload architecture (agent): `/workout` recomputes the current day via `getCurrentState` on
every open and renders DayView inline; day chips are full `/log/[id]` navigations (unmount +
scroll loss); the ~1s is serial Supabase round-trips, not bundle/render; the client Router
Cache (`staleTimes`) was unset (dynamic=0 ⇒ refetch every return). Owner chose a **~2 min**
("balanced") cache window.

- **Nav label glitch — fixed.** Removed the label loading animation entirely (the
  `animate-pulse` + active/pending marker handoff ghosts on mobile). `BottomNav` now
  acknowledges a tap by optimistically moving the ■ marker to the tapped tab (no animation),
  cleared on commit. Load indication lives in the destination skeleton, per owner preference.
- **Return-to-tab is instant + state-retained.** `experimental.staleTimes { dynamic: 120,
  static: 300 }` (`next.config.ts`): returning to a previously-viewed `/workout` or `/log/[id]`
  within 2 min is served from the client Router Cache — no server round-trip, scroll restored.
- **Workout tab no longer resets to current day.** `DayView` stamps a session-scoped
  `lastWorkoutId` (active meso only); `BottomNav`'s Workout tab links to that `/log/[id]` so
  it returns to the day/week you left. The tab also now matches `/log/*` as the Workout section.
- **Staleness guard.** `setIncrementOverrideAction` already revalidated `/workout`; added
  `/log/[workoutId]` so an override edit is never stale on return to a cached day. Only rare
  out-of-band admin param tunes can be briefly stale (self-heal within the window) — the
  owner-accepted tradeoff.
- Green: 563 tests, typecheck, lint, production build (staleTimes active).

## 2026-06-30 — Session 18: WS-J Phase 2 slice — server load-time

Owner picked the server load-time path; #85 merged, branch restarted from main. Built the
ranked server wins from the audit (design via the audit agent).

- **#1 reconcile gate (the big win).** Every prescription-showing surface ran the full
  ~8-10-round-trip reconcile on open even when fresh. Added `mesocycles.last_reconcile_sig`
  (migration `20260630000001`, **applied to live**) + a cheap meso-level staleness signature
  (`loadMesoStaleInputs` ~2 round-trips + pure `mesoStaleSignature`) hashing every meso-global
  fingerprint input (params version, RIR ramp, macro goal, profile experience, override/
  exercise/completed-work watermarks). Gate at the top of `reconcilePrescriptions` skips both
  gap-heal + freshness on a match; stamps the start-signature on success. **Conservatism is
  the safety property** — `reconcile-gate.test.ts` asserts each input flip busts the hash.
  Validated the loader against live schema/data.
- **#8 double params read.** `ensureFreshPrescriptions`/`reconcilePrescriptions` take an
  optional pre-resolved `{version,params}`; Workout + Log pages resolve once and pass in.
- **#4 anchor round-trips.** `anchors.ts`: 3 serial reads → 1 `Promise.all` (completed
  workouts + target_rir + bw load-type), result byte-identical.
- **#3 anchor date floor — REJECTED.** Live check: a 120-day floor would delete the anchor
  for ~56% of (user,exercise) pairs (recency weighting is relative; old exercises still give
  a valid anchor). Reverted; left a comment. Measurement caught what the design missed.
- Green: 563 tests (+3 conservatism), typecheck, lint, production build. Migration applied
  live (additive nullable column; first open of each existing meso runs one full reconcile,
  then the gate engages — self-healing, no manual step).

## 2026-06-30 — Session 17: WS-J Phase A slice 1 — interaction acknowledgment

Ran the measure + audit phase (3 parallel agents + ANALYZE build), then shipped the
first acknowledgment slice (the owner's primary north-star track). Branch
`claude/notes-review-assessment-t14bcu`.

- **Phase 0 measured:** bundle is lean (104 kB shared; only /workout + /log heavy at
  142 kB ≈ +38 kB engine). Bundle code-split is a *secondary*, single-route win.
  Server audit (Supabase advisors): the "feels slow" cause is the **per-open
  reconcile** running full work even when fresh (#1); plus anchor-query global limit,
  duplicated params read, a `SECURITY DEFINER` view, an FK index. Interaction audit:
  app is broadly well-acknowledged (logging loop exemplary); gaps = same-route
  `?param=` tab toggles (dead), planner draft path, discarded `isPending` on SAVE/END.
- **Shipped (Phase A slice 1):** `SegmentedTabs` (instant client-state toggle, no
  refetch) for the two dead tab toggles (exercise OVERVIEW|HISTORY, meso-stats
  BALANCE|PERFORMANCE); `ending`/`pending` flags wired to END WORKOUT/MESO and
  PlannerBoard SAVE CHANGES (self-closing sheet); `SubmitButton` (`useFormStatus`) on
  five plain-form submits (save-as-template, discard-draft, delete-meso, blank-template,
  sign-out).
- **Deferred (tracked in J-performance.md):** planner draft-path optimistic (#1, HIGH
  but risky — own PR); TemplateFilters stale-list (#6, low); press-state sweep.
- Green: 560 tests, typecheck, lint, production build.

## 2026-06-30 — Session 16: WS-J performance kickoff + post-merge sweep

PR #84 merged. **Reconciliation sweep:** archived PH38/PH29/PH36/PH34 (the bug sweep) to
`archive.md` under "Swept 2026-06-30 (later) — bug sweep (PR #84)"; trimmed the live index.
Restarted the designated branch from the merged `main` for the new workstream.

**Owner reframed the performance goal (north star).** "Snappy" is defined as: *every* user
interaction on *every* surface is **visually acknowledged immediately** — the user must never
be left wondering "is it loading, or did I mis-tap?" Responsiveness (acknowledge the action,
even with a placeholder/spinner) matters more than instantaneous data; real load times still
get addressed via efficient code + strategic caching. Updated the N1 row (HIGH, in-progress)
and `J-performance.md` to make interaction-acknowledgment the primary lens, alongside the
existing measure-first bundle/render + query/caching plan. Work starts with Phase 0 measurement
(bundle analyzer, slow-query baseline) + an interaction-acknowledgment audit of every surface.

## 2026-06-30 — Session 15: bug sweep (PH29, PH38, PH36) + PH34 decision framed

Owner asked to attack all the open bug items, perf to follow. Ran four parallel
code investigations (PH29/PH38/PH36/PH34). Branch `claude/notes-review-assessment-t14bcu`,
**PR #84**. Reconciliation sweep: nothing new to archive (#82/#83 merged last session; only
unrelated #48 open).

- **PH38 — done (PR #84).** Root cause in `replaceWorkoutExercise`
  (`queries/logging.ts`): the swap updated only `exercise_id`/`prescribed_*` and left
  the outgoing exercise's per-set `set_weights` overrides on the slot, so the first set
  showed the old planned weight (reps predicted off it) until "reset to prescription"
  (which clears exactly `set_weights` — matching the reported workaround). Fix: clear
  `set_weights` on swap. New query-layer test `__tests__/replace-exercise.test.ts`
  (cleared payload + no-history + logged-sets guard). No engine change. *Noted but not
  taken:* the swap also seeds raw `v_exercise_prs` best rather than `seedMeso`, and the
  freshness fingerprint is blind to exercise identity (same-equipment swaps escape the
  reconcile) — latent, deferred; the `set_weights` clear closes the reported symptom.
- **PH29 — done (PR #84)** for the glitch. The "double layer label" = two `■` markers in
  the bottom nav during a transition (`usePathname` lags the commit → old tab still
  `active` while tapped tab `pending`, both draw ■). Fix in `BottomNav.tsx`: lift a single
  `anyPending` signal so the source tab yields its marker to the tapped tab; exactly one ■
  ever shows. The *instant-switch/slowness* half is server-compute-bound (Workout tab RSC)
  → folded into N1/WS-J; route-level `loading.tsx` + prefetch already exist.
- **PH36 — done (PR #84).** Confirmed the owner's expectation: the engine/model half was
  already fixed by **engine_params v16** (active) — bodyweight_only progresses on reps at
  fixed bodyweight and the increment override is inert (weight never rounded through the
  step). Remaining gap was UI: the Exercise page surfaced the "Load step" control for
  bodyweight_only lifts where it does nothing. Fix: hide `ExerciseSettingsMenu` for
  `bodyweight_only` (loadable/assisted keep it).
- **PH34 — done (PR #84).** Owner ruled **autoregulated projection**. Confirmed the
  engine's set-count model is single-step (carry `previous.sets` forward + a ±1 feedback
  nudge `index.ts:378` + deload scaling), with **no forward MEV→MAV→MRV ramp** (T-A5
  unbuilt) — so an unmaterialized week (no feedback) faithfully projects to the last
  materialized week's count carried forward, deload-scaled. Built pure `projectWeekSets`
  + shared `loadPlannerBaseline`/`loadMesoSetProjection` (`queries/volume-projection.ts`),
  rewired `buildVolumeMatrix` (stats) and `get_muscle_group_volume` (MCP, new `projected`
  status) off the old baseline-vs-`null` split so both read one definition. **No SQL
  migration** — the projection is pure TS from data the views already expose. Tests:
  `volume-projection.test.ts` (6, carry-forward/deload/floor/baseline-seed/post-deload),
  updated `stats.test.ts` + `read-tools.test.ts`. **Caveat relayed to owner:** the
  projection is flat across accumulation weeks (honest, not a climbing ramp); a climbing
  projection needs the unbuilt set ramp (T-A5).
- Green: `npm run test` **560** (+8), typecheck, lint.

## 2026-06-30 — Session 14: reconcile merged PRs + harden the PR-sync process

Owner flagged that the live index was full of `done (PR pending)` rows whose PRs had
actually merged — the post-merge sweep had never been run — and asked to (a) reconcile
the notes against real PR/commit state and (b) fix the operating manual so status moves
in lockstep with PRs going forward. Branch `claude/review-notes-section-khtf4p`.

- **Reconciliation.** Checked the live index against the merged-PR list (only the
  unrelated **#48** is still open). Every `done (PR pending)` item maps to a merged PR —
  nothing was actually stuck. **Swept 12 rows + WS-I (T-I1–T-I5) to `archive.md`** under a
  new "Swept 2026-06-30 — reconcile merged build PRs" section, with PR links + resolutions:
  PH35/PH42/P20/PH26/P19/PH27/PH28 (**#62**), PH31/PH32 (**#65**, backfill **#66**), O1
  (**#72/#73**), PH40/PH41 (**#78**), PR26 + T-I2/T-I4/T-I5 (**#72/#80/#81/#82**).
- **Backlog.** Live index trimmed to genuinely-open items; follow-up table drops the merged
  WS-I tasks (note + archive link left in place); T-A4 annotated as realized via #82. Replaced
  the "done (PR pending)" note with the new status convention.
- **Process fix (the real ask).** `docs/notes/CLAUDE.md`: new **"Keeping the index in sync
  with PRs"** section (rule 1: the *building* PR sets `done (PR #161)` with the real number +
  logs it; rule 2: a merged PR can't sweep its own row; rule 3: a **reconciliation sweep** runs
  at every session start). Wired the sweep into the **resume protocol** as step 3. Root
  `CLAUDE.md`: added the "any PR that resolves a backlog item updates its row in the same PR"
  rule to the `docs/notes/` bullet so non-notes sessions follow it too.
- No code/schema/engine changes; docs only.

## 2026-06-26 — Session 13: T-I4 — retire the legacy increment model (WS-I complete)

With v16 active the legacy path is dead in production, so this deletes it (own PR,
branch `claude/t-i4-retire-legacy`). No version bump / no row migration — legacy param
fields stay in the schema (deprecated) to keep historical rows replayable; only the code
is removed.

- `prescribe()` legacy `else` → no-anchor **hold** (anchor-only; no +increment / no
  −regression%). `seedMeso()` prior-peak branch deleted (precedence: anchor → initial →
  unseeded). `incrementFor` removed; `effective-params` drops the dead `increment` set;
  exercise page default = rounding step. Legacy params marked DEPRECATED in `params.ts`.
- Re-pointed the engine test harness off the legacy default (`prescribe.test.ts`,
  `golden-meso`, `rep-window`, `standalone-prescription`, `regeneration`, `admin-tools`,
  `equipment`, `effective-params`). Suite green (549), typecheck + lint + build clean.
- **WS-I / PR26 complete**: T-I1–T-I5 all done. T-I4 → done (PR pending).

## 2026-06-26 — Session 12: Group 2 — audit, loadable data migration, v16 ACTIVATED

- **Pre-activation audit** (read-only, all users): every bodyweight_loadable exercise was
  logged as **total** (entered ≈/≥ bodyweight); assisted entries are valid assist amounts
  (no migration); bodyweight_only ≈ bodyweight (safe). Only 2 users have bodyweight history.
- **Loadable data migration** (one-time live cleanup, NOT a repo migration): 73 working
  sets rewritten to `weight = round(added/5)×5`, `bodyweight = entered − added` —
  effective load preserved exactly. Slant Board uses bw_ref 150 (owner's note). assisted/
  only/external untouched.
- **Replay (post-migration)** confirmed sane v16 output; Back Raise anchor 379→220 (double-
  count fixed). **Activated engine_params v16** (v15 retired) — bodyweight model is LIVE.
- **T-I4 (legacy deletion) deferred to its own PR** — the legacy path is the engine
  test-harness default (7 files, ~38 assertions) and feeds historical replay/provenance;
  bundling a full re-point into the UI PR right after a live activation is too risky.
  Dead under v16; deletion ships as a focused, fully-tested follow-up. Recorded in PR #81.

## 2026-06-26 — Session 11: Group 2 — replay dry run, migrations applied, bodyweight UI

- **Migrations applied to live** (002 columns + backfill, 003 v16 INACTIVE), recorded
  in the tracking table. Backfill: load_type set on all 330 library exercises (26 only /
  13 loadable / 5 assisted / 286 external); all 10,763 logged sets got bodyweight from
  profile. Active stays v15; v16 replayable.
- **Replay dry run (v15→v16)** on user 0af27789 (BW 125, richest bodyweight history).
  Finding: **bodyweight_only reproduces v15 numbers** (e.g. Pushup 125×11 — safe to
  activate) because users log ~bodyweight already; **loadable/assisted diverge** because
  users logged *total*, not *added* (Back Raise anchor 215→379 ⇒ "145 lb added", nonsense).
  ⇒ loadable/assisted need the UI + a per-exercise data migration before activation.
- **Bodyweight day-view UI built** (owner rulings): inline-editable `BW` chip (writes
  straight to profile via `updateBodyweightAction`), read-only weight cell for
  bodyweight_only, effective-load in the live predictor + P19 marker, and the history
  tap-flip shows EFF LOAD (session avg) for bodyweight lifts. Branch
  `claude/bodyweight-ui`. Rule-8 deviation (no mockup) recorded in PROGRESS.
- **Remaining for T-I4:** migration-audit (total→added per exercise) → activate v16 →
  delete legacy.

## 2026-06-26 — Session 10: Group 2 / T-I2 built — bodyweight load-type model (gated v16)

Owner picked Group 2, scoped to **just the bodyweight model**, and ruled: **build
assisted now** (it's the inverse of loadable). Built T-I2 as a gated, INACTIVE slice on
branch `claude/group2-bodyweight-model`.

- **Load-type model + effective load** (`engine/load.ts`): `LoadType` (external /
  bodyweight_only / bodyweight_loadable / bodyweight_assisted), `effectiveLoad`/
  `enteredForEffective`, `toEngineLoadType`/`coerceLoadType`. Engine handler
  `rules/bodyweight.ts` (reps-at-fixed-bodyweight for only; rep-window in effective space
  with entered-value rounding for loadable/assisted; defer when no anchor+no seed). Routed
  from `prescribe()`/`seedMeso()` behind `bodyweight_model`; external path byte-identical.
- **Inputs/fingerprint:** `exercise.loadType` is a config input (in the fingerprint);
  top-level `bodyweight` is derived (excluded, like the anchor). Wired through all
  EngineInputs builders; anchor query prices on effective load under the flag.
- **Schema:** `exercises.load_type` + `logged_sets.bodyweight` (migrations `…002`),
  captured at log time; **engine_params v16 INACTIVE** (`…003`). Hash guarded.
- **Deferred to activation:** DayView UI (#5 + rule-8 no-mockup), effective-load e1RM
  write, then **T-I4** legacy deletion. T-I2 → done (PR pending). Suite green (557).
## 2026-06-26 — Session 9b: Group 1 merged, migration applied, archival sweep

PR #78 **merged**. Applied the view migration `20260626000001_v_exercise_history_avg_e1rm`
to the live project (`apply_migration`) and verified against real data: all **4,411**
history rows now equal the session average, **1,271** of them differ from the old session
max — change confirmed live and correct. **Archival sweep** (post-merge, per the purge
policy): moved **N2**, **N3**, **T-A7**, **T-A8** out of the live index into `archive.md`
(new "Group 1 merged (PR #78)" section). **T-A1** stays live (only partially advanced —
`v_exercise_overview.best_e1rm` still raw-Epley + the per-screen / PH39 call open).

## 2026-06-26 — Session 9: Group 1 built — active-workout isolation + session-average e1RM

Owner reviewed the proposed next work-groups and selected **Group 1** (engine
correctness), ruling: unify the e1RM systems by **averaging the stored engine per-set
e1RM**. Built both items; branch `claude/next-work-groups-88mqme`.

- **N3 / T-A7 / T-A8 — done (PR pending).** `getExerciseE1rmAnchors` (`anchors.ts`) now
  filters candidate sets to those whose parent `workouts.status='completed'`, so the
  in-progress workout never feeds the anchor (the recency-best-first-set repricing the
  owner described). Single-point fix ⇒ live predictor, seed, progression, regeneration
  all inherit it. History/stats keep posting in-progress sets live (owner: fine); only
  the prescription/prediction input excludes them. `status='completed'` is set at the same
  step feedback is captured (`completeWorkout`), so it's a faithful "canonical with
  feedback" gate. T-A7/T-A8 moved done.
- **N2 / T-A1 (history half) — done (PR pending).** Session e1RM was the session *max* on
  raw Epley; now the **session average of `logged_sets.e1rm`** (engine RIR-aware formula).
  Two surfaces: `history.ts sessionBestE1rm → sessionAvgE1rm` (Exercise history / PH32
  flip), and `v_exercise_history.e1rm` (migration `20260626000001`, drop+recreate for the
  double→numeric type change). `v_exercise_prs` already recomputes on the engine formula
  (06-24), so PR badges stay coherent. Trend consumers read per-session values, no best-set
  assumption — they now read averages; `comparability.ts` (separate analysis system,
  already engine-formula) left as-is. **T-A1 advanced** (only `v_exercise_overview.best_e1rm`
  still raw-Epley; the "what each screen shows" + PH39 decay question stay open).
- **Tests:** `sessionAvgE1rm` unit tests (average vs old max, null-skip, 1-dp rounding,
  bodyweight⇒null). Full suite green (540), typecheck + lint clean. Engine itself unchanged.
- **Recorded for Group 2 (owner rulings, not built):** store bodyweight on the set at log
  time, uneditable after complete (#4); no seed-weight prompt — blank weight/reps + an
  informative prescription-reasoning line inviting a manual start (#5). Folded into
  `I-engine-v9.md` sequencing (T-I2).

## 2026-06-26 — Session 8: intake batch 2 (perf + engine corrections), notes-only

Owner handed over a perf review request plus two notes; explicitly **not** ready
to execute — capture/assess only. Ran the intake protocol; logged as appendix
**Batch 2**. Three new items (new `N*` batch-prefix per the ID convention):

- **N1 — Performance & efficiency (new workstream J).** Reviewed the app structure
  against the owner's perf questions. Finding: the backend already does the heavy
  lifting (SQL-view aggregation, server-side engine + freshness reconcile,
  batched/indexed queries); the real wins are client bundle/render + a few
  query-scope/caching fixes, **not** relocating compute to edge/DB (engine stays
  pure TS, hard rule #3). Phased measure-first plan in
  [`J-performance.md`](./J-performance.md); added WS **J** to the README.
  Cross-linked PH29 (page-switch slowness overlaps the streaming work).
- **N2 — History e1RM averaging (B, WS-B).** Owner: history e1RM "appears to take
  max"; should **average** across all working sets in the session. Not yet
  investigated against `v_exercise_*` / `ExerciseHistoryList`. Flagged as likely
  sharing a fix with N3 (the engine anchor already averages session e1RM).
- **N3 — Active workout must not feed live prescriptions (owner DECISION).**
  Prescriptions/predictions read **previous completed workouts only**; the current
  workout becomes canonical only when marked complete **with feedback**. Live
  posting of current sets to history is fine. This **resolves the open needs-input
  on T-A7 (PH40) and T-A8 (PH41)** — both moved to decided/build-pending. Root
  cause the owner described: the first logged set of a current exercise, if it's
  the recency-weighted best, makes the session-average anchor (one set logged)
  snap all remaining sets to that weight. Build deferred per owner.

No code changed; no tests run (notes-only). This branch
(`claude/app-performance-review-twermm`, PR #77) was originally cut against the
pre-rebrand `docs/triage/` tree; merged `main` (the rebrand, PR #76) and re-applied
all three items into the new `docs/notes/` structure with `N*` IDs.

## 2026-06-26 — Session 7: rebrand triage → ongoing notes area

Owner asked to turn the one-time "triage" area into a **functional, ongoing**
place to drop notes that Claude assesses, relates, groups, prioritizes, tracks,
and prunes — with Claude owning the structure and the owner interfacing through
chat rather than the files. No backlog items were worked this session; this was a
structural reorg.

- **Renamed `docs/triage/` → `docs/notes/`** (`git mv`, history preserved).
- **New `CLAUDE.md`** — the operating manual for the area: the intake protocol
  (capture verbatim → parse → **assess against known items** for dupes /
  relationships / dependencies / grouping / priority → classify → scope →
  log), the full lifecycle incl. a new `archived` terminal state, the
  consolidation & purge policy, the file map, and the resume protocol. This is
  the standing instruction set the owner asked for.
- **Reframed `README.md`** to a thin orientation + the workstream roster
  (pointer to `CLAUDE.md` for process). **Reframed `backlog.md`** from a finite
  "imported 2026-06-22" doc to the **live index**; its verbatim appendix is now
  the **append-only** record, organized into dated **intake batches** (Batch 1 =
  the original Notes doc) so future drops append cleanly.
- **New `archive.md` + first purge sweep.** Moved genuinely-terminal rows out of
  the live index: merged/confirmed (**M9**, **I13**), superseded (**I15** → PH42),
  resolved-and-removed-in-v2 (**S4**, **S5**, **PR22–PR25**), and the resolved
  follow-up **T-A3**. Kept all "done (PR pending)" items live (not yet merged) per
  the purge policy. Raw text for the moved items stays in the backlog appendix.
- **Fixed cross-references** to the renamed folder in `docs/PROGRESS.md` and
  `docs/reviews/2026-06-23-standalone-prescription-investigation.md`, and added a
  pointer to the notes area from the root `CLAUDE.md` docs list so it's
  integrated into the overall doc system.
- No code, schema, or engine changes. Detail files (`A-engine-metrics.md`,
  `I-engine-v9.md`, `scoping.md`) carried over unchanged.

## 2026-06-25 — Session 6: WS-I kickoff — T-I1 decided + T-I5 built (gated)

Owner reviewed Workstream I in light of the current engine state (corrected the
stale "active = v9" framing: live active is now **v12**, after v10 imperial, v11
standalone fixes, v12 rep-window round 2; the S1 anchor seed and S3/S5 fixes are
already live but **layered in front of** the still-present prior-peak branch, so all
of WS-I was still unbuilt). Confirmed v13 is a throwaway test row (disregard).

- **T-I1 — bodyweight model DECIDED (owner).** Recorded in `I-engine-v9.md`
  ("Decision: bodyweight model"). Three load types: **bodyweight-only** (profile
  bodyweight as a read-only prefilled load, cue the user, progress on reps only);
  **bodyweight-loadable** (effective load = bodyweight + added; bodyweight used in
  the calc but not shown; narrow + under-tested); **bodyweight-assisted** (negative
  weight = bodyweight − assist; same engine math; UI for entry/display deferred +
  documented if the library has no assisted exercises yet). Implies a first-class
  **load-type** column and **user bodyweight as an engine input**. Unblocks T-I2.
- **T-I5 — prior-peak seed retirement BUILT (gated, inactive).** New
  `retire_prior_peak_seed` `.optional()` param; `seedMeso` skips the
  `priorPeak × meso_seed_backoff_pct` branch when set, so seed precedence becomes
  **confident anchor → user `initial_*` → unseeded (null weight, prompt the user)**.
  Shipped as **engine_params v14, INACTIVE** (`20260625000001`), byte-identical to
  v12 plus the flag — pre-v14 rows parse unchanged (hash/replay/fingerprint
  untouched, guarded). `meso_seed_backoff_pct` is **left in the schema** (removing it
  would flip historical rows non-replayable); its removal + row migration stays in
  **T-I4**. Activation is the manual post-replay step (manual-operations.md). Tests:
  seed on/off matrix in `standalone-prescription.test.ts` + v14 hash guard in
  `params-provenance.test.ts`. Suite green (522), typecheck + lint clean.
- **Flagged for activation:** "unseeded" (null weight) becomes a more common live
  state — verify the planner/day view renders it as a "enter a starting weight"
  prompt (not blank/0) before activating. Engine produces the deferral; the surface
  should invite the manual seed.
- **Auditability follow-on (owner ask, → O1).** Two parts. (1) Confirmed the
  invariant "every open decision gets re-stamped to the new version on a bump, even
  when output is unchanged" already holds: `workout_exercises.params_version` advances
  on every reconcile confirmation (changed/unchanged/self-healed), and the day-view
  page runs the reconcile on every load — so it's current by view time. Lazy (on
  view) is sufficient; no eager sweep built (owner agreed). (2) **Built** the
  prescription audit reveal: the exercise `…` dropdown in the day view now has a
  "Prescription detail" row → a sheet showing decision **kind**, **verified as of
  Vx** (row stamp) vs **computed under Vy** (latest decision), and the rationale +
  trace — so a no-op version bump is visibly confirmed ("re-verified under Vx,
  unchanged since Vy"). `queries/audit.ts` + action + `PrescriptionDetailSheet`.
  Rule #8 deviation (no mockup) recorded in PROGRESS; admin-gating is an easy
  follow-up if version/kind shouldn't be user-facing.

## 2026-06-25 — Owner ruling: retire the prior-peak seed; no fabricated prescriptions

While reviewing a `replay_decisions(v12)` diff, the owner saw the "Calf Machine
seed 175×20 → 180×20" line and challenged it. Investigation (run against live
data + the branch engine) showed the diff was **not** a v12 effect: it's an old
v10 *seed* whose stored inputs carry `strengthAnchor: null` (recorded before S1),
so replay correctly fell through to the legacy `priorPeak × back-off` branch,
which carries `priorPeak.reps = 20` verbatim. The 175→180 move was the **20 lb
per-exercise increment override** (set 2026-06-24) folded into rounding by replay —
a config artifact, not engine behavior. S1's anchor seed is wired in
`generation.ts` but **hasn't run in prod** (zero seed decisions at v11).

**Decision recorded (binding):** the `priorPeak × back-off` seed and the no-anchor
*fabrication* fallback are **fundamentally broken and retired at the next
opportunity** (`T-I5`). Principle: a prescription is not produced at any cost — use
real data when available; when there isn't enough, **defer to a manual user seed**
(the user enters their own starting point), never fabricate. Seed precedence =
**confident anchor → user `initial_*` → unseeded/prompt.** This also decides `T-A4`/
`T-I3` (anchor-only; **no** hidden big-miss back-off; retire `regression_pct`).

- Recorded in [`I-engine-v9.md`](./I-engine-v9.md) (decision + principle + seed
  precedence; new `T-I5`; updated the "what would be lost" table and T-I2/T-I3),
  [`A-engine-metrics.md`](./A-engine-metrics.md) (PR25 + T-A4/T-A6 notes),
  [`backlog.md`](./backlog.md) (T-I5 + verbatim ruling + T-A4/T-I3 status), and the
  [standalone-prescription investigation](../reviews/2026-06-23-standalone-prescription-investigation.md)
  (S1 amendment: the fallback is retired, not kept).
- **No code changed this session** — documentation/decision only. T-I5 is `ready`
  and sequences ahead of / with the WS-I legacy-path deletion (T-I4).

## 2026-06-23 — Session 5: Workstream B — e1RM audit & exposure (PH31 + PH32)

Owner picked the next slice = **Workstream B** and made the two scoping calls:
store the **RIR-aware engine e1RM** per set (not raw Epley), and ship **PH31 + PH32
together**. Existing stats screens/views were left on their current raw-Epley
numbers — this slice only *adds* the engine value (keeps us out of the broader
T-A1 reconciliation).

- **PH31 — store + expose per-set e1RM.**
  - Migration `20260623130000_logged_set_e1rm.sql`: nullable `logged_sets.e1rm`,
    column comment, **backfill** of all historical working sets via the same
    formula (rir_offset read from the active engine_params row). RLS unchanged
    (policies are column-agnostic, owner-scoped).
  - Write path: `logSetAction`/`amendSetAction` compute the value with the
    engine's `estimateE1rm` (effective reps = reps + rir·offset) from active
    params and store it; amend recomputes. `logSet` input + `amendSet` patch
    gained `e1rm`; `LoggedSetRow` + the insert `Defaulted` set updated.
  - MCP: `get_exercise_history` now returns a per-session `e1rm` (session best),
    with an honesty caveat in the dataQuality note (estimate/trend, null on
    bodyweight, distinct from the view's raw-Epley e1RM).
- **PH32 — tap-to-flip history view.** `ExerciseHistoryList` gained a list-wide
  `flipped` state: tap any row to flip every row between `weight × reps` and the
  session-best `e1RM`, with a quick `metric-fade` (reduced-motion → instant);
  default on load is sets/reps. The session-note reveal moved onto its own note
  icon button so the row tap is unambiguously the flip. Bodyweight/null → "—".
- **Pure helper + tests:** extracted `sessionBestE1rm` (max over non-null,
  null-if-none) and unit-tested it; updated the three `HistoryEntry` fixtures and
  added an `e1rm` assertion to the MCP formatter test. Engine `estimateE1rm`
  already covers the bodyweight=0→null and Epley-fallback cases the backfill
  relies on. Green: typecheck, lint, **489 tests** (+3).
- **Deploy note:** the migration must be applied to the live DB **with** the code
  deploy — inserts write `e1rm`, so deploying code ahead of the column would break
  set logging. Not applied to live in this session (feature branch only).

## 2026-06-22 — Session 4: real PH35 cause (RLS recursion) + slices 1 & 2 in one PR

Owner asked to ship slice 1 + slice 2 + PH35 together, and flagged that PH35 was
**still crashing** (the toast caught it but the setting still wouldn't save), the
pencil was still too small, and the P19 under-marker should sit on the bottom
corner.

- **PH35 — found the actual root cause by inspecting the live DB.** The error
  boundary + toggle guards (session 3) only *caught* the failure. Reproduced the
  real error against production: **`42P17 infinite recursion detected in policy`**
  on `profiles` — `profiles_update_own`'s WITH CHECK queries `profiles` inside a
  `profiles` policy, so *every* regular-user profile UPDATE fails (auto-match,
  units, profile edits, onboarding). Latent since the initial schema; surfaced
  after Postgres began enforcing recursion detection. Fix
  (`20260622220627_fix_profiles_update_recursion.sql`): read the role via a
  SECURITY DEFINER helper that bypasses RLS, preserving the anti-escalation guard.
  **Applied to the live project** and verified (normal update OK, escalation
  BLOCKED 42501). Added an RLS test for a benign owner update.
- **Slice 2 polish:** P19 under-marker now sits on the bottom corner (over stays
  top); P19/PH27/PH28 otherwise as session 3.
- **Slice 1 shipped:** PH42 (legible +20% SVG pencil, absorbs I15), P20 (client
  `ExercisesBrowser` live-filter), PH26 (`/more/account` sub-page).
- Green: typecheck, lint, 486 unit tests.

## 2026-06-22 — Session 3: identify the clean slices; ship PH35 (real fix) + slice 2

- **Identified the independent (no open-question / no-larger-dependency) items.**
  Slice 1 (build-now, clean): **PH42**, **P20**, **PH26**. Slice 2 (one small
  decision away, now answered by owner): **P19**, **PH28**, **PH27**. Owner
  corrections folded in: **PR #61 is merged but PH35 still crashes**; **I13**
  confirmed merged (close); **I15** is the same icon as PH42 (illegible, not
  missing) → folds into PH42; **M8** meso est-strength is present but the owner
  wants its *meaning* clarified and has a broader meso/macro stats redesign in
  mind → back to needs-input.
- **Shipped PH35 + slice 2 in one PR** (branch `claude/nifty-darwin-xiwnxe`),
  typecheck + lint green, **486 tests** passing (+5 new `units` tests):
  - **PH35** — found the real cause: there was **no error boundary** in the
    `(app)` segment, so any rejected server action inside an optimistic toggle's
    transition rendered Next's raw "application error". Added
    `src/app/(app)/error.tsx` and made `AutoMatchToggle` / `UnitsToggle` revert +
    toast on failure (and ignore no-op clicks). PR #61's data-path guard stays.
  - **P19** — `▲`/`▼` over/under marker on logged sets in `SetRow`, compared by
    **e1RM** (per owner), ±1.5% on-target band, no marker without a prescription.
  - **PH27** — `NewTemplateButton` tray (blank template → planner, or add from a
    share code); redeem form moved off the page into the tray.
  - **PH28** — new `src/lib/units.ts` (consolidates `formatHeight` + cm↔ft/in);
    unit-aware height in `ProfileEditor` and onboarding; **onboarding reordered**
    so units is chosen first (deviation from 08 §4 recorded in PROGRESS.md).
- **Next:** slice 1 (PH42, P20, PH26) is still queued and fully clean.

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
