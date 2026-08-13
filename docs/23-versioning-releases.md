# 23 — Versioning & Releases (build spec + phased plan)

**Status:** **phases 0–6 built** (2026-08-06, PR #230) — the framework is
live, 1.0.0 is cut, and the 1.1.0 release registry now ships the completed Guide
block. Both `app` and `guide` release targets resolve through the shared
validators ([§7.2](#72-guide-targets)). Per-phase state in [§11](#11-the-phased-plan);
**all eight decisions answered** in [§12](#12-decisions).
**Revised 2026-08-06 after owner review round 1** — five corrections, three of
them defects the owner caught: **"live workout" was undefined and the rule as
written would have suppressed every modal forever** (the Workout tab renders the
day view inline — [§6.4](#64-where-and-when-it-appears)); **§9.1's "dark
shipping" was too vague to answer "what is the go-live switch"**, now made
concrete as **version-keyed release gating** where the release PR *is* the switch
([§9.2](#92-the-go-live-mechanism-the-version-is-the-flag)); **the MCP parameter
tools gain a `release_impact` argument** so an activation follows the same two
paths and can be *enforced* rather than remembered
([§9.5](#95-parameter-activations-carry-their-own-release-impact)); plus a
first-run hook for a future guided tour ([§6.5](#65-first-run-vs-returning-user))
and a CI-cost audit ([§9.4](#94-ci-gates-and-their-cost)). **1.1.0 is now the manuals**
([§11](#11-the-phased-plan)).
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
- A modal **never** appears over a live workout — where "live" means a set has been logged ([§6.4](#64-where-and-when-it-appears)), not merely that the Workout tab is open.
- A feature merged to `main` but unreleased is **invisible to users and absent from the version history**, and one merge makes the whole accumulated block live at once ([§9.2](#92-the-go-live-mechanism-the-version-is-the-flag)).
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

**T5 — The modal must never interrupt a session, and "session" is not a route.**
The app's most valuable state is a workout in progress. But the Workout tab
**renders the day view inline** — `(app)/workout/page.tsx`: *"the latest
uncompleted workout IS the tab (fig 1.1)"* — so a route-based rule either
suppresses the modal on the app's landing surface (i.e. always) or pops it over
a live set. The signal has to come from the workout's state, not its URL.
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
[§9.5](#95-parameter-activations-carry-their-own-release-impact).

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

**Digits to the right reset.** `1.0.3 → 1.1.0`, `1.4.2 → 2.0.0`. Fix numbers
count fixes *since the last feature release*, so the third digit is a running
count within a block rather than a global tally — which is what makes the
[§9.2](#92-the-go-live-mechanism-the-version-is-the-flag) timeline read
correctly. Enforced by the [§5.3](#53-registry-invariants-tested) invariants.

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
6. **Length budget** — headline ≤ 60 chars, entry title ≤ 60, body ≤ 240. A
   feature release marks **1–3 entries as `highlight`** for the modal; every
   highlight has an onward link and appears before the supporting notes. The
   full history may carry additional smaller or technical changes—the modal is
   an overview, while More → What's new is the complete record.

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

**"Live workout" needs a definition, and the app already has one.** The Workout
tab is not a menu that leads to a session — it *is* the session
(`(app)/workout/page.tsx` renders `DayView` directly). So "suppress on the
workout screen" would suppress the modal on the surface the app opens to, which
is every launch: the modal would never appear at all.

The signal that separates the two states already exists in the schema.
`workouts.status` runs `planned → in_progress → completed`, and
`queries/logging.ts::logSet` flips `planned → in_progress` on the **first logged
set**. That is exactly the line: a workout the user is *looking at* is `planned`;
a workout they are *in* is `in_progress`.

| Rule | Why |
|---|---|
| **Suppress when the rendered workout is `in_progress`** | the user has logged at least one set — they are training, not browsing |
| **Show when it is `planned`** (or when no workout is active and the tab falls back to the meso summary) | this is the ordinary landing state, and the right moment |
| Suppress on `/log/**` unconditionally | the explicit day-view route is only reached deliberately, mid-session or reviewing |
| Suppress while the set-logging queue has pending ops (`SetLogQueueProvider`, N68) | the user is mid-set even if they navigated away, and a queued write is an unfinished action |
| **Otherwise show — including on Cycles, Stats and More** | this is the release valve for the stale case below |
| Not on `/onboarding`, auth routes, or `/~offline` | those users have no history to show |
| Once per release block; afterwards only from More → version history | the history page is the resumable copy ([§8](#8-version-history)) |

**The stale-session case.** A workout left `in_progress` for a week would block
the modal indefinitely if the Workout tab were the only surface that could show
it. Allowing every other tab to show it removes the need for any time-based
heuristic: the modal simply waits until the user navigates off the Workout tab,
which happens within a session or two. No "abandoned after N hours" rule, no
clock in the gate — which also keeps the engine-purity habit intact.

Tested three ways: unit tests over the suppression predicate; an e2e that logs
one set under a pending release and asserts no modal on the Workout tab; and an
e2e that navigates to Stats in the same state and asserts the modal **does**
appear.

---

### 6.5 First-run vs. returning user

A guided tour for newly onboarded users is a likely future feature (owner,
2026-08-06), and it wants exactly the state this gate computes: *this account has
no history with the app.* So the gate returns a **discriminated union**, not an
array:

```ts
type VersionGate =
  | { kind: "prime" }                          // last_seen_version is null
  | { kind: "whats-new"; releases: Release[] } // unseen feature releases
  | { kind: "none" };
```

`prime` is the tour's hook. Today it does one thing — write `CURRENT_VERSION`,
show nothing — but naming the state now means a tour is added as a branch rather
than as a rework of the gate. Same cheap forward-compat as `surface` in
[§5](#5-the-release-registry).

**`last_seen_version` stays single-purpose.** It answers "which releases has this
account been told about," and nothing else. A tour needs its own signal (a
`tour_completed_at` column, or a flags object) because the two questions come
apart immediately: a user can finish the tour and still be owed three release
notes, and re-running a tour must not re-announce releases. Overloading one
column to mean both is the kind of shortcut that is free to take and expensive to
undo.

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
screens is extra surface for little gain ([§12](#12-decisions) O4).

---

## 8. Version history

Route: `/more/whats-new`. The hardcoded `WORKOUT 0.1 — PRE-RELEASE` footer
becomes `WORKOUT {CURRENT_VERSION}` and links here.

- Newest first. Feature and major releases render every entry in full, with the same links.
- Fix releases collapse to a version, date, and one line each — expandable. They prove the app is maintained without competing with feature releases for attention.
- **One renderer, two selections:** the modal and history share
  `ReleaseEntryList`, so an entry itself never changes wording or destination.
  The modal selects only the 1–3 `highlight` entries; history selects all
  entries. The modal ends with an explicit link to this complete record.
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
| **C** | **Trunk + staged manifest + version-keyed gating** *(adopted)* | Gated features carry two code paths until the release lands |

**Adopted: C.** Work merges to `main` continuously and `main` stays deployable.
What is *staged* is the feature's **visibility**, and the mechanism is
[§9.2](#92-the-go-live-mechanism-the-version-is-the-flag). The block is real —
it is a block of *announcement and activation*, not a block of unmerged code.

### 9.2 The go-live mechanism: the version **is** the flag

Owner review asked the right question: if feature work is merged to `main` but
unreleased, what actually keeps it hidden, and what flips it on? The answer needs
no separate flag system, no env var, no database toggle.

A user-visible change lands behind a gate keyed to the version it is slated for:

```ts
// src/lib/version/index.ts
export const releaseActive = (v: string) => compare(CURRENT_VERSION, v) >= 0;

// at the call site
if (releaseActive("1.1.0")) { /* the new surface */ } else { /* today's */ }
```

`CURRENT_VERSION` is derived from the registry, and the registry only gains
`1.1.0.ts` in the release PR. **So the release PR is the switch.** One merge
simultaneously: flips every accumulated `1.1.0` gate on, bumps the version,
publishes the notes, makes them visible in the history, and starts the modals.
Before that merge, `releaseActive("1.1.0")` is `false` everywhere and the
entries sit in `unreleased.ts`, which is never part of `RELEASES` — so the
history page **cannot** show them. That property falls out of the data model
rather than being enforced by a rule.

**This is exactly the model owner review described, confirmed point by point:**

| Owner's statement | Holds? |
|---|---|
| FIX changes go live on merge to `main`, unannounced | **Yes** — fixes are ungated; the release PR for `1.0.1` can be the fix PR itself |
| FIX changes still appear in the version history | **Yes** — collapsed, per [§8](#8-version-history) / O3 |
| FEATURE changes accumulate without going live | **Yes** — `releaseActive("1.1.0")` is false until the cut |
| FEATURE changes are invisible in version history until released | **Yes** — structurally; `unreleased.ts` is not in `RELEASES` |
| A series of feature changes releases as **one** version bump | **Yes** — that is what the staged manifest is for |
| On release: modal, history, feature digit +1, **fix digit resets to 0** | **Yes** — `1.0.3 → 1.1.0`, enforced by the [§5.3](#53-registry-invariants-tested) invariants |

**A worked timeline:**

```
1.0.0  ── released ────────────────────────────────── live, in history
  ├─ fix PR       → 1.0.1  live on merge, quiet, in history
  ├─ feature PR A → gated on "1.1.0", entry → unreleased.ts   (invisible)
  ├─ fix PR       → 1.0.2  live on merge, quiet, in history
  ├─ feature PR B → gated on "1.1.0", entry → unreleased.ts   (invisible)
  └─ release PR   → 1.1.0  A and B go live together, modal, history
```

#### The costs, stated honestly

1. **A gated feature carries both code paths** until the release lands, and a cleanup PR removes the dead branch afterwards. This is the real price of the model, and it argues for **time-boxing a block to weeks, not months**, and for gating only what genuinely must not appear early. A new settings row nobody will notice does not need a gate; a redesigned Workout tab does.
2. **Migrations cannot be gated this way** — a migration applies at deploy. Additive schema (a column nothing reads yet) is invisible and ships ungated; anything that changes existing behavior must ship in the release itself. Worth checking at release-PR time.
3. **Previewing a staged block needs an override.** The owner will want to see
   1.1.0 before flipping it. `NEXT_PUBLIC_RELEASE_OVERRIDE`, honored **only**
   when `VERCEL_ENV !== "production"`, makes any Vercel preview deploy render
   the staged features, synthesize the staged manifest into the real modal and
   version-history surfaces, and acknowledge the previewed version normally.
   Env-gated rather than user-gated, so there is no auth surface and no way to
   reach it in production.
4. **Cleanup is part of the release, not after it.** The release PR opens a follow-up to strip that version's gates; left undone, the codebase accumulates permanent `releaseActive("1.1.0")` checks that are dead but never obviously dead.

### 9.3 The two PR shapes

**An ordinary PR** (unchanged from today) additionally appends its entries to
`src/content/releases/unreleased.ts` when it changes something a user would
notice, and updates its `docs/notes/backlog.md` row as CLAUDE.md already requires.

**A release PR** — titled `release: 1.1.0`, the only PR that touches version
identity:

1. `unreleased.ts` → `1.1.0.ts` with `version`, `date`, `kind`, `headline`; a fresh empty `unreleased.ts`;
2. bump `package.json.version` (CI asserts the three-way equality);
3. edit passes over the accumulated entries — they were written one PR at a time and need to read as one release;
4. confirm the [§9.2](#92-the-go-live-mechanism-the-version-is-the-flag) checks: every `releaseActive("1.1.0")` gate is intended to flip, and no ungated migration in the block changes existing behavior;
5. `docs/PROGRESS.md` gains the release line; `docs/notes/log.md` gains the dated entry; backlog rows the block closed are set to `done (PR #n)`;
6. green CI, including link validation and the content contracts;
7. after merge: tag `v1.1.0`, cut a GitHub release whose body is **generated from the registry** (never hand-written, so the two can't drift), and open the gate-cleanup follow-up.

A fix release does not need this ceremony: the fix PR itself may carry the
`1.0.1.ts` file and the bump.

### 9.4 CI gates and their cost

Every gate below is a **pure unit test** over typed data — no browser, no
database, no network. They run inside the existing `npm run test` step of the
existing job, so they add **no new workflow, no new job, and no measurable
minutes**. The expensive jobs in `.github/workflows/ci.yml` are the ones that
already exist: `supabase start` for the RLS/integration job and the Playwright
job. This framework does not add to either, except for the three e2e assertions
in [§10](#10-testing), which extend a spec file that already runs.

| Gate | Kind |
|---|---|
| Three-way version identity (`package.json` / `CURRENT_VERSION` / registry max) | **fail** |
| Registry invariants ([§5.3](#53-registry-invariants-tested)) | **fail** |
| Every `app` target in the allowlist; every `guide` target resolves | **fail** |
| Content contracts ([§5.2](#52-content-contracts-tested-per-doc-22-8s-pattern)) | **fail** |
| Modal/history behavior (shows once, dismiss persists, suppressed mid-session) | **fail** (e2e, existing job) |

**Dropped from the first draft:** the "PR touches `src/app/**` without touching
`src/content/releases/**`" warning. It was the only proposed gate needing its own
workflow with `pull_request` write permission to leave a comment, which is real
setup and real minutes for a check that cannot be trusted anyway (most such PRs
are legitimately note-free). It becomes a line in the release-PR checklist
instead — free, and applied at the moment someone is actually reviewing the
block.

**On billing generally:** GitHub Actions is unmetered for public repositories.
For a private repository the included allowance is 2,000 minutes/month on Free
and 3,000 on Pro, and this repo's cost is dominated by the Supabase-stack and
Playwright jobs that predate this work. If minutes ever become the constraint,
the lever is running the heavy jobs on a narrower trigger — not trimming these
gates, which are nearly free.

### 9.5 Parameter activations carry their own release impact

Owner review: some parameter updates are trivial and some are substantial, so the
tool should say which — and it should not be complicated. It isn't; it is one
argument and one guard.

`propose_engine_params` and `activate_engine_params`
(`src/lib/mcp/tools/admin.ts`) take a required `release_impact`:

| Value | Meaning | Path |
|---|---|---|
| `none` | no number any user sees moves (a parameter added but not yet read, a comment, a re-tuning that replays identically) | no note, no version change |
| `fix` | a number was wrong and is now right | rides a fix release; one line in the history |
| `feature` | behavior users should be told about changed | **requires a feature release announcing it, live before activation** |

Two things make this more than bookkeeping:

1. **It can be enforced, not just documented.** `activate_engine_params` already refuses to act unless `confirm_version` echoes `version`; the same guard refuses a `feature`-classified activation when no live release announces it. That converts [T10](#2-the-traps) from runbook discipline into a check.
2. **The classification does not have to be a guess.** `replay_decisions` already reports the diff a version would produce — it is how v19→v20 was assessed as "11/15 changed / 0 errors". The tool surfaces that diff when asking for the classification, so `none` is a claim the caller can check rather than assume.

`docs/deployment/manual-operations.md` keeps the ordering rule: **announce, then
activate**, same day. Announcing a change slightly before it lands is a smaller
error than a user finding their prescription moved with no explanation.

### 9.6 The documentation contract

A feature release is not done when the code merges. Its block must also leave:

- the behavior doc amended (the numbered specs stay authoritative — CLAUDE.md);
- `docs/09-design-changelog.md` updated for any screen change;
- the guide section written when the release introduces a concept (doc 22), so the deep link has a destination;
- backlog rows swept and `log.md` appended.

The release PR is the checkpoint where those are confirmed, which is the whole
reason to have one.

---

## 10. Testing

- **Pure:** `compare` (including `1.10.0 > 1.9.0`), the gate union — new user (`prime`), up-to-date user, one skipped release, three skipped releases, fix-only interval, rollback (T8); and `releaseActive` against a staged version, including the `NEXT_PUBLIC_RELEASE_OVERRIDE` branch being inert when `VERCEL_ENV === "production"`.
- **Registry:** invariants + content contracts as data-driven tests over the real registry, so a bad release note fails the release PR. Includes the [§4.1](#41-the-digits) reset rule and the property that no `unreleased.ts` entry can reach `RELEASES`.
- **Suppression:** the [§6.4](#64-where-and-when-it-appears) predicate over the matrix of `planned` / `in_progress` / `completed` / no-active-workout × route × queue state.
- **Links:** allowlist resolution; guide resolution once doc 22 Phase 2 exists.
- **RLS:** the new column under `profiles` policies (hard rule 1).
- **Integration:** acknowledgment writes and is monotonic; priming at onboarding; `activate_engine_params` refuses a `feature`-classified activation with no live announcing release ([§9.5](#95-parameter-activations-carry-their-own-release-impact)).
- **e2e** (three additions to an existing spec, per [§9.4](#94-ci-gates-and-their-cost)): the modal appears once for a returning user and does not reappear after dismissal; it is **absent** on the Workout tab once a set is logged; it **appears** on Stats in that same state.

---

## 11. The phased plan

**S** ≈ a focused session, **M** ≈ substantial.

### Phase 0 — Design pass *(gates everything)* — **DONE** (2026-08-06)

Hard rule 8: there is no mockup for either surface. Transcribe the house system
(08 §5 / 09) into a floating What's New modal and a version-history list —
square corners, the menu-card shadow, dashed borders for collapsed fix rows, a
single orange new-version marker, tracked all-caps labels — and record the decision in
`docs/09-design-changelog.md` **before** any markup. Owner sees it. **S**

### Phase 1 — Identity and registry — **DONE** (2026-08-06)

`src/lib/version/` (pure — `compare`, the gate union, `releaseActive`),
`src/content/releases/` with `1.0.0.ts` + an empty `unreleased.ts`, the CI gates
of [§9.4](#94-ci-gates-and-their-cost), `package.json` → `1.0.0`, the
`NEXT_PUBLIC_RELEASE_OVERRIDE` preview escape, and the More footer reading
`CURRENT_VERSION` instead of a hardcoded string. No user-visible change beyond
the footer. **S–M**

### Phase 2 — Version history — **DONE** (2026-08-06)

`/more/whats-new`, `ReleaseEntryList`, the footer link. Builds the shared
renderer and puts real copy on screen before anything depends on it. **S**

### Phase 3 — Per-user state — **DONE** (2026-08-06)

Migration + backfill + RLS test, priming at onboarding, the acknowledgment
action, and the pure gate with its full test matrix. Still no modal. **S–M**

### Phase 4 — The modal — **DONE** (2026-08-06)

`WhatsNewGate` in `(app)/layout.tsx`, suppression rules, e2e. After this the
framework is live and 1.1.0 can be announced. **M**

### Phase 5 — Deep links — **DONE for `app` targets** (2026-08-06)

`LINKABLE_ROUTES` + validation, links added to existing entries; the `guide`
variant enabled when doc 22 Phase 2 lands. **S**

### Phase 6 — Process — **DONE** (2026-08-06)

The release checklist (in this doc's §9, plus a short `docs/deployment/release.md`
runbook), the GitHub-release generator, the `release_impact` argument + guard on
the two `engine_params` MCP tools ([§9.5](#95-parameter-activations-carry-their-own-release-impact)),
and the `manual-operations.md` ordering rule. **S**

### 11.1 The first two releases

**1.0.0 = the framework itself**, plus the current app declared production
(phases 0–4 and 6; §4.3). Nothing is announced, because there is nobody to
announce to yet.

**1.1.0 = the manuals** (owner, 2026-08-06). This is the right first
announcement: it is a genuinely new user-facing surface, and it is the thing the
deep links point *into*, so the first modal anyone sees demonstrates the whole
mechanism rather than just describing it.

That decision creates one ordering constraint and one requirement:

- **Ordering.** Doc 22 Phase 2 (reader infrastructure, stable section IDs) must land before doc 23 Phase 5 can validate `guide` targets. So the interleave is: **doc 23 P0–P4 → doc 22 P0–P2 → doc 23 P5 → doc 22 content phases → cut 1.1.0.** Doc 23 Phase 6 can run in parallel anywhere after P1.
- **The manual must be dark-shippable.** Doc 22 ships its content over several PRs across weeks; without a gate the guide would go live chapter by chapter and the 1.1.0 announcement would be telling users about something they had already been reading. So the manual's routes and its More-tab entry sit behind `releaseActive("1.1.0")` — one gate at the route boundary rather than gates scattered through the content, which is the cheapest possible instance of the [§9.2](#92-the-go-live-mechanism-the-version-is-the-flag) cost. The `NEXT_PUBLIC_RELEASE_OVERRIDE` preview escape is what makes the chapters reviewable while they are being written.

**Sequencing note.** Phases 1–2 are shippable on their own and worth doing first
regardless — they replace a hardcoded string with a CI-enforced identity. Phases
3–4 are what make 1.1.0 possible.

---

## 12. Decisions

**All eight answered by the owner, 2026-08-06** — every recommendation accepted.

| # | Question | Decision |
|---|---|---|
| **O1** | Does 1.0.0 itself announce? | ✅ **No.** Backfill every existing account to `1.0.0`; the first modal anyone sees is 1.1.0 ([§4.3](#43-what-100-is)) |
| **O2** | Blocking modal, or a dismissible banner on Today? | ✅ **Floating modal requiring an explicit dismiss**, once. Owner review of the rendered 1.1.0 preview replaced the original bottom sheet with a centered, shadowed modal; a banner remains too easy to ignore, and [§6.4](#64-where-and-when-it-appears) guarantees the interruption only lands between sessions |
| **O3** | Do fix releases appear in the history? | ✅ **Yes, collapsed** — visible maintenance, no competition for attention |
| **O4** | A "from What's New" marker when landing on an app route? | ✅ **Not in v1** — guide sections get doc 22's marker; app routes navigate plainly |
| **O5** | Git tags + GitHub releases? | ✅ **Yes, generated from the registry after merge.** The registry stays the source of truth; the tag is an artifact |
| **O6** | Where does the modal go for a user who was mid-session? | ✅ **Defer to the next app open** — and under [§6.4](#64-where-and-when-it-appears) that is usually the next tab they touch, not the next launch |
| **O7** | Does MEASURE (doc 20) share this version line? | ✅ **Share it initially**, `surface` reserved. **Owner expects MEASURE to need its own version line once built** — so when it splits, the registry filters on `surface` and MEASURE gets its **own column** (`measure_last_seen_version`), not a jsonb map on the existing one. Two independent scalars stay legible and keep the doc 20 §3.4 separation clean |
| **O8** | How much pre-release history goes into 1.0.0's entry? | ✅ **One line.** "First production release" — a changelog of the pre-release period has no reader |

---

## 13. Relationship to other docs

- **Doc 22** owns the manual and its section IDs; this doc *consumes* them as link targets and shares its validator. A feature release that introduces a concept should ship the guide section in the same block ([§7.2](#72-guide-targets)). **The manuals are release 1.1.0** — the interleaved phase order and the manual's release gate are in [§11.1](#111-the-first-two-releases).
- **Doc 09** is authoritative for screen structure; the Phase 0 design pass is recorded there, and this doc never defines a layout.
- **Docs 10 / 14 / 16 / 17 / 19 / 21** are authoritative for behavior; a release note reports them. A note that disagrees with a behavior doc is the note's bug.
- **`docs/deployment/manual-operations.md`** gains the announce-then-activate ordering rule ([§9.5](#95-parameter-activations-carry-their-own-release-impact)); a new `release.md` holds the release runbook.
- **`docs/PROGRESS.md`** keeps the build record; the registry is user-facing copy and is not a substitute for it.
- **Doc 20** — MEASURE's `surface` reservation, per its §3.4 separation-readiness rules.
- Workstream **V** ("Versioning & releases") in `docs/notes/` is this work's home; the tracking item is **N80**.
