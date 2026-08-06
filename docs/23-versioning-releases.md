# 23 — Versioning & Releases (build spec + phased plan)

**Status:** plan — nothing built. Phases in [§11](#11-the-phased-plan); owner
decisions still open in [§12](#12-open-decisions).
**Owner ask (2026-08-06):** the app is versioned as a pre-release; round out a
production baseline and start shipping **discrete versioned releases from a
fresh v1.0.0**. Feature releases get per-user last-seen tracking that triggers a
**What's New** modal on first view, with deep links to explore what changed, and
a **version history on the More page** with the same deep links. Small fixes
ship quietly under a third digit. Establish a defined process so documentation,
notifications, and links stay correct.

> **This doc is the spec** for version identity, release content, the
> notification gate, and the release process. It defines **no** training
> behavior: where a release note describes engine behavior it is *reporting*
> docs 10/14/16/17/19/21 and the code. Doc 22 stays authoritative for the manual
> and its section IDs — which this doc consumes as link targets
> ([§7](#7-deep-links)).

---

## 1. What we are producing

| # | Deliverable | Audience |
|---|---|---|
| **A** | **A version identity** the app, the repo, and the release notes all agree on — one source, asserted by CI | Build |
| **B** | **A release registry** in the repo: typed, validated release notes that ship in the same commit as the code they describe | Build |
| **C** | **The What's New modal** — shown once, to returning users, on the first feature release they haven't seen; accumulates skipped releases | Users |
| **D** | **Version history** under More — every release, newest first, with the same entries and the same deep links | Users |
| **E** | **The release process** — how a block of work becomes a version: what a release PR does, what CI enforces, what the runbook gains | Owner + build |

### 1.1 Objectives as acceptance criteria

- A user who has been away for three feature releases sees **one** modal covering all three, not three modals and not just the newest.
- A user who signs up today sees **no** modal — their history starts now.
- A modal **never** appears over a live workout.
- Every deep link in every release note resolves — enforced by a test, not by care.
- The version shown in the app footer, in `package.json`, and at the top of the release registry cannot disagree — CI fails if they do.
- A release note cannot describe a feature the deployed bundle doesn't contain, because the note and the feature are the same commit.
- Shipping a release is a **checklist with a CI gate**, not a memory exercise.

### 1.2 Scope boundaries

- **No new dependency.** Version comparison is ~20 lines of pure TypeScript; a registry is typed data. Same posture as doc 22's D2.
- **No runtime-editable release notes.** Content lives in the repo, for the reason in [§2](#2-the-traps) T1 and doc 22 §14.
- **No in-app update prompt / "reload to update" banner.** The service worker already uses `skipWaiting` + `clientsClaim` and documents are `NetworkOnly` (hard rule 9), so a new deploy reaches a client on its next navigation. If that turns out to be insufficient in practice it is a separate item.
- **No changelog for developers.** `docs/PROGRESS.md` and the git history already serve that. The registry is user-facing copy.

---

## 2. The traps

Read before building; each one is a decision elsewhere in this doc.

**T1 — The note and the code must be one artifact.** If release notes live in
the database (or anywhere editable at runtime), a note can describe a feature
the currently-served bundle does not have, or announce a rolled-back change.
Repo-side content makes the announcement and the behavior the same deploy.
→ [§5](#5-the-release-registry).

**T2 — The comparison must happen on the server.** `CURRENT_VERSION` is compiled
into the bundle. A tab running yesterday's JS would compare against yesterday's
constant. Resolving pending releases in a server component means the value is
always the deployed truth. → [§6.3](#63-the-gate).

**T3 — New users must not be shown history.** Priming a new account's last-seen
to the current version at onboarding is the whole fix, and it must exist before
the first feature release or every new signup gets greeted by a changelog.
→ [§6.2](#62-priming).

**T4 — Skipped releases accumulate.** Users don't open the app every release.
The gate selects *all* unseen feature releases, not the newest one.
→ [§6.3](#63-the-gate).

**T5 — The modal must never interrupt a session.** The app's most valuable state
is a workout in progress; a modal over the day view is a real harm, not a nit.
Suppression is a rule with a test, not a hope about where users are.
→ [§6.4](#64-where-and-when-it-appears).

**T6 — There is no mockup for either surface.** Hard rule 8 means the modal and
the history page need a design pass recorded in `docs/09-design-changelog.md`
*before* any markup — the route doc 16 Phase 3 took for the set-row marker.
→ [Phase 0](#phase-0--design-pass-gates-everything).

**T7 — Deep links must target stable routes, never IDs.** "See your new
macrocycle overview" cannot link to `/cycles/macro/<id>` — the reader may have
no macrocycle. Links go to tab roots and stable pages, and land gracefully on an
empty state. → [§7](#7-deep-links).

**T8 — A rollback moves the version backwards.** If 1.2.0 is reverted to 1.1.0,
users who acknowledged 1.2.0 hold a *higher* last-seen than current. Last-seen
is monotonic and the gate is a no-op in that state; a re-release must use a new
number (1.3.0), never re-issue 1.2.0.

**T9 — "Push to main in blocks" collides with an existing convention.** CLAUDE.md
says keep `main` deployable, vertical-slice PRs. Staging a block on a long-lived
release branch fights that, and this repo ships large slices that would conflict
badly. Resolved in [§9.1](#91-branch-model--trunk-with-a-staged-manifest).

**T10 — An engine-parameter activation is a user-visible change with no diff.**
Activating `engine_params` (v20/v23/v26 all shipped inactive, activated later by
an owner-gated MCP step) changes the numbers a user is prescribed while the code
deploy that carried it announced nothing. Under this framework that is a
**feature release**. → [§4.2](#42-the-rule-that-makes-it-decidable) and
[§9.4](#94-the-parameter-activation-coupling).

**T11 — A guide deep link is only as real as the manual.** Doc 22's section IDs
are explicitly an API. Release notes become a second consumer of that API, so a
renamed section breaks the highest-traffic surface in the app. Validation is
shared, not duplicated. → [§7.2](#72-guide-targets).

---

## 3. What exists today (audited 2026-08-06)

| Thing | State |
|---|---|
| `package.json` version | `0.1.0`, never bumped, referenced by nothing |
| App-visible version | **hardcoded string** `WORKOUT 0.1 — PRE-RELEASE` in `src/app/(app)/more/page.tsx` |
| Build identity at runtime | `process.env.VERCEL_GIT_COMMIT_SHA` — used by `observability/report.ts` and `queries/params-provenance.ts`. Correct for diagnostics, useless as a user-facing version |
| Per-user notification state | none |
| `profiles` | PK `id`, self-select/insert/update RLS; the update policy pins `role` and otherwise allows self-writes |
| Onboarding completion | `src/app/(auth)/onboarding/actions.ts` writes `onboarded_at` — the natural priming site |
| `(app)/layout.tsx` | resolves the user via `getRequestAuth`, mounts `ToastProvider` / `SetLogQueueProvider` / `BottomNav`. Does **not** read the profile |
| Modal primitives | `components/ui/BottomSheet.tsx`, `useModalA11y`, `useScrollLock`, `Toast` — reuse, don't invent |
| Content-as-typed-data precedent | `src/lib/glossary.ts` (N25) — one keyed record, contracts enforced in tests |
| Release tags / GitHub releases | none |
| CI | `.github/workflows/ci.yml` — typecheck, lint, `npm run test`, build; RLS + integration; e2e |

---

## 4. The scheme

### 4.1 The digits

`MAJOR.FEATURE.FIX` — semver's shape, but the digits are defined by **audience**,
not by API compatibility. There is no public API; the thing that matters is
whether a person needs to be told.

| Digit | Name | Meaning | Notified |
|---|---|---|---|
| **1**.0.0 | **major** | The product model itself changed — enough that what a returning user knows is now misleading. Rare; reserve it | Yes, and the history flags it |
| 1.**1**.0 | **feature release** | Anything a user would notice: a new screen or control, a changed label, a changed number they are shown | **Yes — What's New** |
| 1.0.**1** | **fix release** | Defects, performance, copy corrections, refactors, infrastructure — nothing a user would notice | No; listed in history only |

Naming matters for the process: the owner's "major versions (1.1, etc.)" are
**feature releases** in this doc, and `2.0.0` is a separate, rarer thing. Prose,
commits, and PR titles use *feature release* / *fix release* so the two never get
confused.

### 4.2 The rule that makes it decidable

One question, asked of every release:

> **Would a user who knows the app well see or do anything different after this
> deploy?**

Yes → feature release. No → fix release. Two riders that resolve the cases that
actually come up here:

1. **A changed number counts, even with no UI diff.** If a prescription, an
   e1RM, a volume figure, or a status verdict moves because the engine or its
   parameters changed, that is a feature release. This is the doc 10 §9 honesty
   position applied to releases: silently changing a number the user is trusting
   is worse than an unnecessary modal. It is also what makes T10 tractable.
2. **When genuinely unsure, it is a fix release *and* it waits.** Rather than
   over-announcing, hold the entry in the staged manifest until it rides along
   with a real feature release. The history page still records it.

### 4.3 What 1.0.0 is

The framework itself, plus the pre-release baseline declared production. It
carries **one** entry ("first production release") and **no** modal — every
existing account is backfilled to `1.0.0`, so the first modal anyone ever sees is
1.1.0. Building the framework *inside* 1.0.0 is deliberate: the first notified
release must not also be the release that debuts the notification.

---

## 5. The release registry

`src/content/releases/` — one file per release, an index that sorts and exports,
and a staged manifest for the release being accumulated.

```ts
// src/content/releases/types.ts
export type ReleaseKind = "major" | "feature" | "fix";

export type ReleaseTarget =
  | { kind: "app"; href: LinkableRoute }        // §7.1 — allowlisted, no IDs
  | { kind: "guide"; section: GuideSectionId }; // §7.2 — doc 22 §9.4 IDs

export interface ReleaseEntry {
  /** stable, unique across all releases; never reused */
  id: string;
  /** one line, sentence case, no trailing period */
  title: string;
  /** 1–3 plain-language sentences: what you can now do */
  body: string;
  /** where "explore" goes; omit when there is nothing to open */
  link?: { label: string; target: ReleaseTarget };
  area?: "training" | "planning" | "stats" | "connector" | "app";
}

export interface Release {
  version: string;            // "1.1.0"
  date: string;               // ISO date it reached main
  kind: ReleaseKind;
  /** the modal's title line; feature/major releases only */
  headline?: string;
  entries: ReleaseEntry[];
  /** forward-compat for doc 20 §3.4; defaults to "workout" */
  surface?: "workout" | "measure";
}
```

```
src/content/releases/
  types.ts
  1.0.0.ts
  1.0.1.ts
  1.1.0.ts
  unreleased.ts     ← entries accumulate here between releases
  index.ts          ← RELEASES (sorted, frozen), CURRENT_VERSION
```

`src/lib/version/` holds the pure logic — `compare(a, b)`, `parse`, `isFeature`,
`pendingFeatureReleases(...)`. Pure, no I/O, unit-tested, usable from server
components, the MCP layer, and tests alike.

### 5.1 Why the repo and not the database

Same argument as doc 22 §14, sharper here. A release note is a **claim about the
deployed code**. Database-stored notes can be edited to describe something that
isn't deployed, survive a rollback that removed the feature, and appear before
the deploy that implements them. Repo-side content makes those states
unrepresentable: the entry and the feature merge together, deploy together, and
roll back together. The cost — a copy fix needs a deploy — is a fix release,
which this framework makes cheap by design.

### 5.2 Content contracts (tested, per doc 22 §8's pattern)

1. **Plain language.** The doc 22 §8.5 vocabulary: "your AI assistant", not "the LLM"; "connector", not "MCP", except where the reader must find that word in their own client.
2. **Positive framing** (doc 22 §8.4) — what the app now does, not what it stopped doing wrong. A bug fix is phrased as the correct behavior.
3. **No hype** (hard rule 7) — no exclamation marks, no "we're excited", no superlatives. Tested.
4. **Honesty guardrails** (doc 10 §9) — a release note may not claim precision the engine doesn't have. e1RM stays an estimate in a release note exactly as it does in the app.
5. **Glossary identity** — a term defined in `src/lib/glossary.ts` is used with that meaning, and a note that introduces jargon links to its guide section instead of redefining it.
6. **Length budget** — headline ≤ 60 chars, entry title ≤ 60, body ≤ 240. A feature release has 1–6 entries; more than that means the block should have shipped as two releases.

### 5.3 Registry invariants (tested)

- versions unique, strictly increasing, parseable;
- dates non-decreasing with version;
- `kind: "fix"` may only advance the third digit; `"feature"` only the second (and zeroes the third); `"major"` only the first;
- entry IDs unique across the whole registry;
- a `feature`/`major` release has ≥ 1 entry and a headline; a `fix` release has no headline;
- `CURRENT_VERSION` === max(RELEASES) === `package.json.version`.

---

## 6. Per-user state and the gate

### 6.1 Storage

One nullable column, not a table:

```sql
alter table public.profiles add column last_seen_version text;
```

A scalar is sufficient because the registry — not the database — knows what
happened between two versions. `null` is meaningful: **"not yet primed"**, which
covers new signups and any row a backfill misses, and the gate treats it as "show
nothing, prime now". Existing rows are backfilled to `'1.0.0'` in the same
migration.

RLS needs nothing new: `profiles_update_own` already allows self-writes for
every column except `role`. That means a user can technically set their own
last-seen to anything — it is their own notification state, and the blast radius
is seeing or not seeing a modal. Worth stating in the migration comment so a
future reader doesn't mistake it for an oversight. The migration ships with the
RLS test (hard rule 1).

### 6.2 Priming

- **New accounts:** `onboarding/actions.ts` writes `last_seen_version = CURRENT_VERSION` alongside `onboarded_at`.
- **Any `null` encountered later:** the gate primes it to `CURRENT_VERSION` and shows nothing. Belt and braces for accounts created before the column, or created by a path that skips onboarding.

### 6.3 The gate

Pure selection, unit-tested against a fixture registry:

```ts
pendingFeatureReleases(lastSeen, releases, current):
  lastSeen == null            → []            // prime, show nothing (T3)
  compare(current, lastSeen) <= 0 → []        // up to date, or rolled back (T8)
  otherwise → releases.filter(r =>
      r.kind !== "fix" &&
      compare(r.version, lastSeen) > 0 &&
      compare(r.version, current) <= 0)       // accumulates skips (T4)
```

Resolved in a **server component** (T2). `(app)/layout.tsx` is the natural mount
— it already redirects unauthenticated users — at the cost of one PK-keyed
single-column read per app navigation. If that read proves measurable against the
WS-J budget, fold it into the tab-root pages instead; it must not become a client
fetch, which would reintroduce T2.

**Acknowledgment** is an explicit action, never a render side effect: dismissing
the modal — or tapping one of its links — calls a server action that writes
`last_seen_version = CURRENT_VERSION` (not the highest pending version, so a user
who skipped 1.1 and 1.2 clears both), guarded monotonically in TypeScript. A user
who force-quits over an unacknowledged modal sees it again, which is the correct
failure direction.

### 6.4 Where and when it appears

| Rule | Why |
|---|---|
| Never on `/log/**` or the workout day view | T5 — a session in progress outranks any announcement |
| Never while the set-logging queue has pending ops (`SetLogQueueProvider`, N68) | the user is mid-session even if they navigated away |
| Otherwise on the first `(app)` navigation after the deploy | it should feel like opening the app, not like an interception |
| Once per release block, then only from More → version history | the history page is the resumable copy ([§8](#8-version-history)) |
| Not on `/onboarding`, auth routes, or `/~offline` | those users have no history |

Suppression is a `usePathname()` predicate plus the queue state — both tested,
including an e2e that opens the day view under a pending release and asserts no
modal.

---

## 7. Deep links

Each entry may carry exactly one target. Two kinds, both validated at build time.

### 7.1 App targets

An allowlist of **stable, ID-free routes** (`LINKABLE_ROUTES`), asserted by a test
against the App Router's route files so a rename breaks CI rather than a user's
tap. Dynamic segments are excluded by construction (T7): link to `/cycles`, not
`/cycles/meso/[mesoId]`. An entry whose feature only exists inside a user's own
data links to the tab root that leads there, and the destination's empty state
does the rest.

### 7.2 Guide targets

Doc 22 §9.4 section IDs (`ug/effort-rir#per-exercise`), resolved and validated by
**the same** link-target test doc 22 Phase 2 builds — one validator, two
consumers (T11). Until doc 22 Phase 2 lands, the `guide` variant simply has no
valid values; that is a **dependency, not a blocker**, and it is the reason
[§11](#11-the-phased-plan) sequences deep links last.

This is also the strongest argument for coupling the two docs in the process: a
feature release that introduces a concept should ship its guide section in the
same block, so "learn how this works" has a destination.

### 7.3 Landing

Guide sections reuse doc 22 §9.4's brief landed-section marking. App routes
navigate plainly in v1 — a "you came from What's New" marker on arbitrary app
screens is extra surface for little gain ([§12](#12-open-decisions) O4).

---

## 8. Version history

Route: `/more/whats-new`. The hardcoded `WORKOUT 0.1 — PRE-RELEASE` footer
becomes `WORKOUT {CURRENT_VERSION}` and links here.

- Newest first. Feature and major releases render their entries in full, with the same links.
- Fix releases collapse to a version, date, and one line each — expandable. They prove the app is maintained without competing with feature releases for attention.
- **One renderer, two surfaces** (doc 22 D4): the modal and the history page share `ReleaseEntryList`. The modal is that list plus a headline and a dismiss; nothing about an entry renders differently in the two places.
- The page is the durable copy of the modal — a user who dismissed it or wants to re-explore comes here. That is what lets the modal stay strictly once-only.

Both surfaces need the Phase 0 design pass (T6).

---

## 9. The release process

The part that has to be defined, because everything above is only correct if the
process keeps it correct.

### 9.1 Branch model — trunk with a staged manifest

Three options were considered:

| | Model | Cost |
|---|---|---|
| **A** | Long-lived `release/1.1` branch; features merge there; the branch merges to main at cut time | Fights "keep `main` deployable, vertical-slice PRs"; this repo's slices are large and would conflict badly; the deployed app diverges from trunk for weeks |
| **B** | Pure trunk; a release is just a version bump over whatever landed | Features reach users before they're announced — which the owner explicitly does not want for user-visible work |
| **C** | **Trunk + staged manifest + inactive shipping** *(recommended)* | Requires discipline about flags for anything that must stay dark |

**Recommendation: C.** Work merges to `main` continuously and stays deployable.
What is *staged* is the **announcement**: entries accumulate in
`unreleased.ts`. Where a feature genuinely must not be visible before its
announcement, it ships dark — and this repo already has that muscle: engine
params v20/v23/v26 all shipped inactive behind an owner-gated activation, and
`LLM_EXPLANATIONS` gates the explanation generator. The block the owner wants is
real; it is a block of *announcement and activation*, not a block of unmerged
code.

### 9.2 The two PR shapes

**An ordinary PR** (unchanged from today) additionally appends its entries to
`src/content/releases/unreleased.ts` when it changes something a user would
notice, and updates its `docs/notes/backlog.md` row as CLAUDE.md already requires.

**A release PR** — titled `release: 1.1.0`, the only PR that touches version
identity:

1. `unreleased.ts` → `1.1.0.ts` with `version`, `date`, `kind`, `headline`; a fresh empty `unreleased.ts`;
2. bump `package.json.version` (CI asserts the three-way equality);
3. edit passes over the accumulated entries — they were written one PR at a time and need to read as one release;
4. `docs/PROGRESS.md` gains the release line; `docs/notes/log.md` gains the dated entry; backlog rows the block closed are set to `done (PR #n)`;
5. green CI, including link validation and the content contracts;
6. after merge: tag `v1.1.0` and cut a GitHub release whose body is **generated from the registry** — never hand-written, so the two can't drift.

A fix release does not need this ceremony: the fix PR itself may carry the
`1.0.1.ts` file and the bump.

### 9.3 CI gates

| Gate | Kind |
|---|---|
| Three-way version identity (`package.json` / `CURRENT_VERSION` / registry max) | **fail** |
| Registry invariants ([§5.3](#53-registry-invariants-tested)) | **fail** |
| Every `app` target in the allowlist; every `guide` target resolves | **fail** |
| Content contracts ([§5.2](#52-content-contracts-tested-per-doc-22-8s-pattern)) | **fail** |
| Modal/history renderers pinned by e2e (shows once, dismiss persists, suppressed on the day view) | **fail** |
| A PR touching `src/app/**` with no `src/content/releases/**` change | **warn only** — many legitimate PRs are refactors; a hard gate here would train people to write empty entries |

### 9.4 The parameter-activation coupling

`docs/deployment/manual-operations.md` gains a step in the activation runbook:
**if activating a parameter set changes numbers users see, the feature release
announcing it ships first** (same day), and the activation is performed after.
Ordering matters — announcing a change that hasn't happened yet is a smaller
error than a user finding their prescription moved with no explanation, and it
keeps the note truthful at every moment for the users who read it.

### 9.5 The documentation contract

A feature release is not done when the code merges. Its block must also leave:

- the behavior doc amended (the numbered specs stay authoritative — CLAUDE.md);
- `docs/09-design-changelog.md` updated for any screen change;
- the guide section written when the release introduces a concept (doc 22), so the deep link has a destination;
- backlog rows swept and `log.md` appended.

The release PR is the checkpoint where those are confirmed, which is the whole
reason to have one.

---

## 10. Testing

- **Pure:** `compare` (including `1.10.0 > 1.9.0`), `pendingFeatureReleases` — new user, up-to-date user, one skipped release, three skipped releases, fix-only interval, rollback (T8), null priming.
- **Registry:** invariants + content contracts as data-driven tests over the real registry, so a bad release note fails the release PR.
- **Links:** allowlist resolution; guide resolution once doc 22 Phase 2 exists.
- **RLS:** the new column under `profiles` policies (hard rule 1).
- **Integration:** acknowledgment writes and is monotonic; priming at onboarding.
- **e2e:** modal appears once for a returning user, survives a reload before acknowledgment, does not reappear after, is absent on the day view, and the history page lists every release.

---

## 11. The phased plan

**S** ≈ a focused session, **M** ≈ substantial.

### Phase 0 — Design pass *(gates everything)*

Hard rule 8: there is no mockup for either surface. Transcribe the house system
(08 §5 / 09) into a What's New sheet and a version-history list — square corners,
dashed borders for the collapsed fix rows, orange only for current position and
selection, tracked all-caps labels — and record the decision in
`docs/09-design-changelog.md` **before** any markup. Owner sees it. **S**

### Phase 1 — Identity and registry

`src/lib/version/` (pure), `src/content/releases/` with `1.0.0.ts`, the CI gates
of [§9.3](#93-ci-gates), `package.json` → `1.0.0`, and the More footer reading
`CURRENT_VERSION` instead of a hardcoded string. No user-visible change beyond
the footer. **S–M**

### Phase 2 — Version history

`/more/whats-new`, `ReleaseEntryList`, the footer link. Builds the shared
renderer and puts real copy on screen before anything depends on it. **S**

### Phase 3 — Per-user state

Migration + backfill + RLS test, priming at onboarding, the acknowledgment
action, and the pure gate with its full test matrix. Still no modal. **S–M**

### Phase 4 — The modal

`WhatsNewGate` in `(app)/layout.tsx`, suppression rules, e2e. After this the
framework is live and 1.1.0 can be announced. **M**

### Phase 5 — Deep links

`LINKABLE_ROUTES` + validation, links added to existing entries; the `guide`
variant enabled when doc 22 Phase 2 lands. **S**

### Phase 6 — Process

The release checklist (in this doc's §9, plus a short `docs/deployment/release.md`
runbook), the GitHub-release generator, and the
`manual-operations.md` activation coupling. **S**

**Sequencing note.** Phases 1–2 are shippable as 1.0.0 on their own and are worth
doing first regardless of how the rest is decided — they replace a hardcoded
string with an enforced identity. Phases 3–4 are what make 1.1.0 possible.

---

## 12. Open decisions

| # | Question | Recommendation |
|---|---|---|
| **O1** | Does 1.0.0 itself announce? | **No.** Backfill every existing account to `1.0.0`; the first modal anyone sees is 1.1.0 ([§4.3](#43-what-100-is)) |
| **O2** | Blocking sheet, or a dismissible banner on Today? | **Sheet requiring an explicit dismiss**, once. A banner is easy to ignore, which defeats the point; a sheet that must be dismissed is honest about interrupting, and only ever does it between sessions |
| **O3** | Do fix releases appear in the history at all? | **Yes, collapsed** — visible maintenance, no competition for attention |
| **O4** | A "from What's New" marker when landing on an app route? | **Not in v1** — guide sections get doc 22's marker; app routes navigate plainly |
| **O5** | Git tags + GitHub releases? | **Yes, generated from the registry after merge.** The registry stays the source of truth; the tag is an artifact |
| **O6** | A user who was mid-session when the release landed — where does the modal go? | **Defer to the next app open.** Showing it on Workout Complete competes with the session summary, which is a designed moment |
| **O7** | Does MEASURE (doc 20) share this version line? | **Share it initially**; the `surface` field is reserved now so a split later is a filter, not a migration (doc 20 §3.4) |
| **O8** | How much of the pre-release history goes into 1.0.0's entry? | **One line.** "First production release" — a changelog of the pre-release period has no reader |

---

## 13. Relationship to other docs

- **Doc 22** owns the manual and its section IDs; this doc *consumes* them as link targets and shares its validator. A feature release that introduces a concept should ship the guide section in the same block ([§7.2](#72-guide-targets)).
- **Doc 09** is authoritative for screen structure; the Phase 0 design pass is recorded there, and this doc never defines a layout.
- **Docs 10 / 14 / 16 / 17 / 19 / 21** are authoritative for behavior; a release note reports them. A note that disagrees with a behavior doc is the note's bug.
- **`docs/deployment/manual-operations.md`** gains the activation coupling ([§9.4](#94-the-parameter-activation-coupling)); a new `release.md` holds the release runbook.
- **`docs/PROGRESS.md`** keeps the build record; the registry is user-facing copy and is not a substitute for it.
- **Doc 20** — MEASURE's `surface` reservation, per its §3.4 separation-readiness rules.
- Workstream **V** ("Versioning & releases") in `docs/notes/` is this work's home; the tracking item is **N80**.
