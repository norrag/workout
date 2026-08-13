# 09 — Design Changelog (post-mockup amendments)

Status: **authoritative for the deltas below**. This document records design changes made in
ongoing design sessions **after** the June 2026 mockup round captured in
[08-design-decisions.md](08-design-decisions.md). Where an entry here conflicts with 08 or
[06-design-system.md](06-design-system.md), **this document wins** (most recent dated entry
takes precedence). Figure numbers (1.1–4.5) refer to the mockup index in 08 §5 and the visual
source file `workout - App Screens v2.dc.html`.

> **Why this file exists.** 08 is the settled baseline. Designers keep iterating in separate
> design sessions, and those changes have to reach the production build (Next.js + Tailwind,
> see [07-implementation-plan.md](07-implementation-plan.md) / [PROGRESS.md](../PROGRESS.md))
> without ambiguity. Every design session appends a **dated entry** here so handoff to
> engineering is explicit and traceable.

## How to use this file (for designers)

Append a new `## YYYY-MM-DD — <short title>` section at the **top** of the Entries list for
each session. In it, for every discrete change include:

- **Change** — what is different now, concretely (screen + element).
- **Rationale** — why.
- **Affected figures** — e.g. `1.1`.
- **Impact** — one of the tags below, plus exactly what engineering must do.

**Impact tags**

| Tag | Meaning |
|---|---|
| `NET-NEW` | New behavior/spec for a screen **not yet built** — fold into the build, no retrofit. |
| `RETROFIT` | Changes a screen/component **already implemented** — code change required. |
| `TOKENS` | Touches design tokens / shared primitives — review for cross-screen impact. |
| `DATA` | Implies a data-model or query requirement — check [03-data-model.md](03-data-model.md). |
| `NO-CODE` | Mockup/spec clarification only; no engineering action. |

## 2026-08-13 — The AI Manual folds into the Guide (N74 owner amendment)

The dedicated AI Manual proved to be a second information hierarchy for one
part of the product. The owner reversed that choice: AI is now one substantial
chapter in the main Guide, while connection remains a task on its setup page.

### 1. `/more/connector` links to Guide chapter 18 (`RETROFIT`)

- **Change** — retain the existing bordered manual-link pattern, but point it at
  `/more/guide/connecting-an-ai`. The row reads **Explore training with AI**
  with the supporting line **Analysis, planning, coaching, and control**.
- **Rationale** — the setup screen should reveal the connector's breadth without
  becoming the explanation itself.
- **Affected figures** — fig 4.4's connector row and the unnumbered connector
  detail composition recorded in the 2026-08-13 entry below.
- **Impact** — `RETROFIT`; no new primitive or figure is introduced.

### 2. The second reader becomes a redirect surface (`RETROFIT`)

- **Change** — `/more/connector/guide/**` permanently redirects into the new
  chapter, with topic-aware destinations for planning, analysis, coaching,
  interpretation, and control. Former setup sections return to
  `/more/connector`.
- **Rationale** — preserves bookmarks while leaving one Guide map, one search,
  and one reading order.
- **Affected figures** — figs 4.8–4.11 return to a single Guide instance.
- **Impact** — `RETROFIT`; the reader components remain unchanged.

> **Build context as of 2026-06-13:** Phase 3 (logging flow) is **not yet implemented**
> (see PROGRESS.md → "Not done yet"). Everything in the 2026-06-13 entry below therefore
> lands as `NET-NEW` against the logging UI — there is no existing Day View code to retrofit.
> Build the Day View to this spec the first time.

---

## Entries

## 2026-08-15 — The definition grammar: three affordances, one system (doc 22 Phase 7a, N74 / N81)

The design pass hard rule 8 owes before Phase 7 places a single link. Two
questions arrived together and doc 22 Phase 7a says they are answered together
rather than separately: **what shape is an in-app link into the Guide**, and
**what is the third affordance N81 asked for** (an underlined term inside
prose). Deciding them apart is how an app ends up with three ways to say
"there is more about this" that look like each other.

**The ruling: one grammar, three members, split by what the reader is asking.**

| The reader's question | Affordance | Where it can go | What it opens |
|---|---|---|---|
| *"What does this word mean?"* | **`InfoDot`** — trailing circled `i` (N25) | beside a **label** | the glossary card, in place |
| *"What does this word mean?"* — but the word is **inside a sentence** | **inline term** (N81, spec'd below, **not built here**) | inside prose | the same glossary card, in place |
| *"Why is this number what it is?"* | **`GuideLink`** — tracked-caps text link, trailing `›` | under the **block** that printed the number | the Guide section that explains it — a navigation |

The split that matters is the third row against the first two. The first two are
**term-level** and resolve **in place**: you stay where you are, because you were
mid-task. The third is **mechanism-level** and **navigates**, because the answer
does not fit in a card and the reader who wants it has stopped to ask. That is
also why they never substitute for each other: an `InfoDot` on `EST. STRENGTH`
tells you what an estimate is, and no amount of it tells you why yesterday's
weight went up.

### 1. `GuideLink` — the manual-link affordance (`NET-NEW` primitive, `RETROFIT` at one site)

- **Change.** A new shared primitive, `src/components/ui/GuideLink.tsx`:
  tracked caps at `9.5px`, `font-semibold`, `tracking-[0.1em]`, `text-ink/55`,
  trailing ` ›`, on its own line under the block it explains. No border, no
  chevron box, no icon, no accent.
- **It is not new drawing.** This is the app's existing quiet-forward-link
  idiom — the `READ ›` / `SET UP ›` / `CSV ›` row-ends on More, and literally
  the `How you stay in control ›` line Phase 6e improvised on
  `/more/connector`. Phase 7 **names** it and that site adopts the primitive,
  so there is one implementation rather than a pattern and a copy of it.
- **The label is the destination's own title.** Not a hand-written invitation.
  A link that reads `THE STRENGTH ANCHOR ›` promises exactly the heading the
  reader lands on, and the promise is a **test**, not a habit
  (`guide-links.test.ts` asserts label ≡ section title). This is the same
  discipline §8.1 already applies to the glossary: one set of words, one source.
- **Rationale for the weight.** It has to be findable by someone looking for it
  and invisible to someone who is not — the day view had just been decluttered
  the same week (N82). Tracked caps at `ink/55` is the lightest thing the design
  system can say and still be read as a control; anything bordered would compete
  with the ledger rules that structure every one of these screens.
- **Placement rule (hard, and it is the reason the primitive can be quiet):**
  a `GuideLink` sits **under a block, never inside a row**, and never in the set
  grid. Per screen the cap is **one visible at a time**.
- **Its separator is a prop, not a wrapper.** Where the link needs the ledger's
  hairline above it, that rule is drawn *inside* the component (`rule`), because
  the whole affordance is release-gated: a `border-t` wrapper at the call site
  would paint a stray rule under the block for every user until 1.1.0 ships.
  Chrome and gate have to vanish together.
- **Affected figures** — none redrawn. Figs 1.1, 2.2, 2.3, 3.1a, 4.1–4.3, 4.4
  gain one line each at the foot of an existing block; no figure's structure,
  spacing rhythm or control set changes. **No new figure number is claimed.**
- **Impact** — `NET-NEW` primitive + `TOKENS` (shared component); nine wave-1
  sites listed in [`docs/22e-link-placement-audit.md`](22e-link-placement-audit.md).

### 2. Where a `GuideLink` may **not** go (`NO-CODE`, but it is binding)

Two exclusions, both earned rather than stylistic:

- **Not on the day view's exercise card.** N82 removed one icon per card from
  that surface days ago; adding a link back to it would spend the same budget on
  the opposite of what the owner asked for. The day view reaches the Guide from
  **inside sheets** — surfaces opened deliberately, by someone who has already
  stopped.
- **Not on an unguarded form.** A `GuideLink` navigates, and a navigation out of
  a sheet holding unsaved slider values or unsaved text discards them. So the
  affordance is allowed on a **read-only** surface, or on one whose dirty state
  is already intercepted (`useNavigationGuard`, the planner board) — never on a
  form that would silently lose input. This is what holds the Feedback, Effort
  target, Workout Complete and Load step sheets out of wave 1 despite being
  where the question is most often asked; the audit's §5 says what would unblock
  them.

### 3. N81's inline term — the design, ruled and specified, **not built in this pass**

- **Change (specified, for its own build pass).** An underlined run inside
  prose that opens the **same** glossary card `InfoDot` opens, from the **same**
  `src/lib/glossary.ts` entry. Trigger styling:
  `underline decoration-dotted decoration-from-font underline-offset-2`,
  inheriting the surrounding type size and color, `aria-expanded` on a
  `<button>` exactly as `InfoDot` does.
- **Why dotted.** Hard rule 7 reserves orange for position and selection, so the
  affordance cannot be colored, and a **solid** underline is already what the
  app's in-prose navigation wears (the prescription strip's ask line, N75). A
  **dotted** rule is the standard "definition, not destination" convention, it
  is distinguishable without color, and it survives dark mode and high-contrast
  because it borrows the text's own color.
- **Why it is not built here.** It is a new interaction pattern whose real cost
  is a **content** pass, not a component: `22c` §C2 counts ~22 rendered terms
  with no definition anywhere, and several need a glossary entry written before
  anything can link to one. Bundling that into the link-placement PR would put
  an unreviewed copy pass inside a placement pass. It gets its own wave
  (doc 22 Phase 7c), with the grammar above already settled so that wave is
  execution rather than design.
- **Impact** — `NO-CODE` in this pass; `NET-NEW` when N81's wave builds.

## 2026-08-14 — Day View: the focus pass (fig 1.1 / 1.2, N82, staged for 1.1.0)

**Revised through owner review round 1, same day.** The first pass over-cut; §6
records exactly what was overruled and why, and the entry above it describes the
**settled** design, not the draft.

Owner-directed: "the Workout day view … has gained a number of visual elements
that are beginning to create clutter and distraction. Retain functionality, ease
and speed of use, and quick access to useful tools while reducing visual clutter
and focusing the user on the elements that matter most and are used most
frequently."

The diagnosis, taken against the rendered screen rather than the spec. The day
view's hot path is the **set grid** — reading a target, editing a weight,
ticking `LOG`. Support furniture had accumulated at the same visual weight and,
critically, **at per-exercise cost**: a four-button icon row is four bordered
28px boxes *per card*, so a six-exercise day drew **24** of them in a column
down the right edge. The owner named the symptom directly — "too many tool
icons".

Four changes. Every one is presentational or a menu rearrangement; **no action
is removed, no write path moves, and no engine input changes.**

### 1. The exercise name is the prescription strip's disclosure (fig 1.1)

- **Change.** The name gains a chevron and the whole `name + chevron` is the
  toggle — `11px` chevron at `ink/45`, `1.5` gap, rotating 180° on open over
  `200ms`. `aria-expanded` and the `<exercise> prescription` label move with it.
- **Rationale.** This is the header's **own** idiom one screen up: the `workout`
  logotype + chevron already discloses the week/day navigator. Reusing it
  invents nothing, trades a 28px glyph for a 20px-bold title as the target, and
  — the point — **removes an icon from the row without removing a capability.**
  The owner's verdict on this change: *"That's good, as it eliminates one icon
  in the strip without losing the functionality — exactly what I was looking
  for."*
- **Default stays closed.** The strip's *ask* line largely restates what the set
  rows already show (weight, reps, RIR); its non-redundant content is the
  **why**, an occasional question rather than a per-set one.
- **Rule-8.** No mockup figure covers the strip at all (pre-existing deviation,
  N57/N63, recorded in PROGRESS.md). House style honored: existing chevron
  primitive, ink only, no accent, no new control type.

### 2. The icon row goes four buttons → three (fig 1.1)

- **Change.** The **prescription toggle** leaves, its job now done by §1. The
  **note** and **history** buttons stay exactly as they are, as does `…`.
- **Rationale.** These two are what you reach for *mid-set* — "what did I do
  last time", "write that down before I forget" — and a menu trip for either is
  the wrong trade against a brief that asks for tools to stay fast. Owner:
  *"notes and history are important to have."* The complaint was the **quantity
  of the row**, not icons as a device; removing the one icon whose function had
  a better home is the whole of the correct answer.

### 3. The two note strips merge into one, ranked below the program (fig 1.1)

- **Change.** `PINNED — …` and `NOTE — …` were two separate left-ruled strips;
  they become **one** strip carrying up to two rows. The kind is named in the
  ledger's tracked-caps label idiom (`9px / 600 / 0.16em / ink 45`) rather than
  inline caps prose, and the strip's rule drops to `border-l border-ink/25`.
- **Rationale.** A real defect, not a preference: the pinned strip wore
  `border-l-2 border-ink` — **identical to the prescription strip**. A card with
  a prescription open, a pinned note and a session note showed three
  near-identical bars with no way to tell the program's voice from the lifter's.
  One rule per author, and the heavier rule belongs to the program. Both notes
  keep their own edit target.

### 4. The `…` menu's rows are grouped (fig 1.2)

- **Change.** The rows are grouped by a stronger rule (`border-b border-ink/30`
  per group, via the new shared `MenuGroup`) into *look it up* / *set it up* /
  *adjust this session* / *remove*. `MenuRow`'s existing `last:` reset drops the
  hairline under each group's final row, so grouping costs no doubled borders.
- **The rows and their order are untouched.** The groups fall on seams the list
  already had, so nothing moves under a returning user's thumb, and no row is
  added or removed.
- **Rationale.** Twelve flat rows mixing navigation, configuration, ordering,
  structure and a destructive action is past a comfortable scan. Four short
  lists is not. Owner: *"I like your organization of the menu items also."*

### 5. Deliberately not changed

- **`TARGET n RIR` keeps the accent** — see §6.
- **The set grid** — the hot path, and already right. Column count, cell
  primitives, marker glyphs, per-set `⋮` and the `LB · REPS · RIR · LOG` header
  are untouched.
- **Per-exercise "next" row emphasis.** Every exercise keeps its own editable
  next row rather than the page having one. Restricting it would read as more
  focused and would break supersetting, which is a real way people train.
- **The grid header repeating per card.** Three similar number columns need
  their labels in view; it is already `9px / ink 50`.
- **Equipment type on the name row.** Considered folding into the eyebrow as
  ` · MACHINE`; rejected — the eyebrow's ` · SUFFIX` slot is spoken for by
  doc 21 §8's effort suffixes under a documented two-suffix budget.
- **The `Notes` row in the `…` menu** stays alongside the note icon. The owner
  was explicitly indifferent (*"they don't particularly bother me there"*), and
  the row carries state the icon cannot — `Notes ›` versus `Add note`.

### 6. Owner review round 1 — what was overruled

Recorded because the reasoning that produced the draft was sound-sounding and
still wrong; a later session must not re-derive it.

- **Cutting the icon row to `…` alone. REVERSED.** The draft moved note and
  history into the menu on a frequency argument (they are reached less often
  than the grid, so they should cost a tap). The argument mis-weighted the
  cost: *frequency* is not the only axis — **interruption** is. Both are
  consulted **between sets**, with a rest clock running and a bar to get back
  under, and a two-tap detour there is worth more than the ink it saves. The
  owner's framing — "which were functional" — is the correct correction: the
  screen's problem was one redundant icon, and the pass had found it (§1) before
  over-generalising from it.
- **`TARGET n RIR` in ink instead of the accent. REVERSED.** The draft read hard
  rule 7 literally (orange marks *current position + selection only*; the week's
  effort ask is a fact, so it should not wear it) and de-accented the label.
  Overruled: the effort ask is the one number that governs every set on the
  screen, and it is meant to be **found instantly** on a glance mid-session.
  **Rule 7 bends here on purpose, and this is the standing exception** — a
  literal reading that costs the screen its fastest read is a misreading of what
  the rule is for. The label keeps `text-accent` bold.
- **Adding a `History ›` row to the `…` menu. WITHDRAWN.** It existed only to
  compensate for removing the history icon. With the icon restored, the
  2026-06-26 entry that folded history into `View exercise` holds again on its
  original reasoning: one shortcut, not two.

### Staging + impact

- **Staged behind `releaseActive("1.1.0")`** (doc 23 §9.2) via `focusPass()` in
  `DayView.tsx`; the release PR is the switch. Both code paths ship until then,
  which is the §9.2 cost, accepted. The menu **grouping** is gated too
  (`MenuGroup ruled={…}`) so nothing about the menu changes early.
- **Release note** — `day-view-focus-pass` staged in `unreleased.ts`. A changed
  layout with no new capability is still a feature-release change (§4.2): the
  control a returning user reaches for has moved.
- **Affected figures.** `1.1`, `1.2`.
- **Impact.** `RETROFIT` — `DayView.tsx` (`ExerciseBlock` icon row / name row /
  note strips / menu grouping) and `components/ui/AnchoredMenu.tsx` (new
  `MenuGroup`). **No `DATA` change.** `DayHeader` ends the pass unchanged.
- **Manual.** `ug/training-a-session#the-day-screen` said "four small buttons";
  it now says three and describes the name-row chevron. `#notes` gained the menu
  row alongside the note button. Both ship in 1.1.0 — doc 22 §2's whole point is
  that the manual and the screen must not drift.

## 2026-08-13 — The AI Manual gets a reader (figs 4.8–4.11 reused; N74 / doc 22 Phase 6)

Doc 22 Phase 6 writes the **AI Manual**, the second of D4's "two surfaces, one
system". It needs somewhere to be read, and `/more/connector` has to stop being
a settings page and become that manual's front door. Both are screens, so this
is the hard-rule-8 design pass, written before any of Phase 6 is built.

**The governing decision is that there is no second design.** D4 says the two
manuals are one system; the block model, the renderer, the section-ID scheme,
the length budget and the reader chrome are already built and already
manual-agnostic (`MANUAL_ROOT`, `MANUAL_LABEL`, `ManualSectionHeader`,
`ManualChapterNav`). A second look for the AI Manual would be a second thing to
learn for no reader benefit. **No new figure number is claimed by this entry.**

### 1. Figs 4.8 / 4.9 / 4.10 are reused at a second root

- **Change.** The map, chapter-contents and section screens mount again under
  `/more/connector/guide[/<chapter>[/<section>]]`, rendering the `ai` half of
  the registry. Identical geometry, identical row grammar, identical prev/next.
  Three things vary, and they are all **data the screens already read**:
  the meta line's manual label (`AI MANUAL` rather than `USER GUIDE`), the
  `h1.title-display` (**ai manual** rather than **guide**), and the map's back
  link, which goes to `‹ AI connector` rather than `‹ More`.
- **Rationale.** The chapter and section screens were already parameterized on
  `ManualId` in Phase 1 — the routes were the only thing hardcoded to `ug`. The
  build therefore lifts the map and chapter screens into shared components and
  leaves four-line route files, rather than copying two screens and letting the
  copies drift.
- **Affected figures.** 4.8, 4.9, 4.10 — reused, not amended.
- **Impact.** `NET-NEW` for the routes; `RETROFIT` for `/more/guide`'s two
  screens, which become callers of the shared components with no visual change.

### 2. Fig 4.11 — one search, over both manuals (`RETROFIT`)

Doc 22 §9.4.3 says *one field over both manuals*, and it was written before
either existed. Now that both do, it needs two amendments, because chapter
numbers restart per manual and a result row reading `CH 4 · What it can do`
would be ambiguous the moment the AI Manual lands.

- **A result row names its manual.** The tracked-caps line becomes
  `USER GUIDE · CH 6 · EFFORT: RIR AND THE RAMP` — the manual label first, in
  the same 9.5px caps, then the existing chapter field. Always shown, not only
  on cross-manual hits: a row whose label appears conditionally teaches the
  reader nothing about what the label means.
- **The back link follows the reader in.** The search screen accepts `?from=`
  through the same `resolveOrigin` allowlist the section screen uses (2026-08-08
  §3), so a reader who searched from the AI Manual returns to the AI Manual.
  Without it the link stands as `‹ Guide`. Two new origins are named for this:
  `/more/guide` → `GUIDE` and `/more/connector/guide` → `AI MANUAL`.
- **One screen, one URL.** Search stays at `/more/guide/search` and the AI
  Manual's map links to it with its own `from`. A second search route would be
  two URLs for one index and a decision the reader has to make ("am I searching
  the right one?") in place of a result they can read.
- **The copy follows the scope.** The map's search row, the field's placeholder
  and the no-match line say *the manuals*, and the meta line reads
  `USER GUIDE + AI MANUAL · TITLES, TERMS AND TEXT`. A field labelled "search
  the guide" that returns AI Manual rows is the kind of small lie that makes a
  reader distrust the results they did want.
- **Affected figures.** 4.11 — amended.

### 3. `/more/connector` becomes the AI Manual's front door (`RETROFIT`)

Built at Phase 6e, specified here. No mockup exists for this screen (the
deviation the Phase-1 build already recorded), so it is composed from patterns
the app ships, and the composition is written down before it is transcribed.

- **What stays, unchanged.** The `ENDPOINT` copy field and the `HOW TO CONNECT`
  three steps. They are the reason someone opens this page, and doc 22 §8.5's
  one allowance exists precisely because the reader must find the word `MCP` in
  their own client — this page is where they read it.
- **What is added.** A manual entry row directly under the intro, in the
  emphasis grammar the guide map already uses for its search row (full-width
  `border-[1.5px] border-ink`, name at `text-sm font-semibold`, quiet tracked
  caps at the right). It reads `AI manual` / `12 CHAPTERS ›`.
- **What is replaced.** The `ACCESS & REVOCATION` paragraph, which is the AI
  Manual's ch. 2 and ch. 3 said shorter and without their depth. The page keeps
  one line and points at the section that owns it — the doc 22 §8.4c rule 1
  shape (*point, do not explain*), applied to an app screen.
- **The intro paragraph is corrected**, per `22d` §7 **K3**: it says the
  connector drafts mesocycles and templates, which has been understated since
  Batch 32 — it also drafts macrocycles, places blocks into macro slots, and
  edits a **live** block's planner board.
- **Impact.** `RETROFIT` — `/more/connector`, gated with the 1.1.0 routes for
  the manual row only; the endpoint and connect steps stay live for everyone.

### 4. No new block kind, and no new figure asset

Phase 6 is content plus two route trees. The AI Manual writes to the ten block
kinds that exist. Recorded because the 2026-08-07 §5 entry made a new block kind
a design decision, and "we did not need one" is the answer this pass owes.

---

## 2026-08-10 — One manual figure: the planner board's structure (N74 / doc 22 Phase 3b)

Phase 3b is content, so there is no new screen and no new block kind — the whole
entry is one drawn asset, recorded here because the 2026-08-08 `figure` entry
made the asset policy a design decision rather than an authoring one.

### 1. `planner-structure.svg` — new figure, chapter 4

- **Change.** A single-colour line-art tree under `public/manual/`, rendered in
  `ug/planning-a-mesocycle#the-planner-board`: a day branching into two
  muscle-group blocks, one carrying two filled exercise slots, the other one
  **dashed** open slot.
- **Rationale.** Doc 22 §8.4b rule 7 — *draw what is structural*. The planner
  board is groups-first (day → muscle-group block → exercise slots), and that
  nesting is the one thing a reader has to hold before any control on the screen
  makes sense. A list makes them assemble it; a tree hands it over. Same argument
  that produced `cycle-nesting.svg`, one level down.
- **The dashed slot is not decoration.** Dashed borders mean planned/empty
  (hard rule 7), and the board uses exactly that for an unfilled slot — so the
  figure teaches the mark the reader is about to meet rather than inventing one.
- **Nothing tunable is baked in**, per the standing rule the two earlier figures
  set (`22a` `C-ramp-06`, `C-cyc-01a`): `3 SETS` is one plausible starting count,
  never a default the engine owns, and the split is an example. A number the
  engine can change lives in text, where a param bump is greppable to the prose
  that states it.
- **Affected figures.** None amended; this is an asset, not a screen.
- **Impact.** `NET-NEW` — the asset plus one `figure` block. It inherits the
  2026-08-08 policy unchanged (CSS mask filled with `currentColor`, the
  `manual-figures` runtime cache, no precache).

---

## 2026-08-09 — The map becomes a table of contents (figs 4.8 / 4.9 amended, N74 / doc 22 Phase 3a review)

Owner review of the Phase-3a chapters returned a navigation change, and it
reverses a decision the 2026-08-08 entry made one day earlier. Recorded here
rather than quietly rebuilt, because fig 4.8 was derived in this file and a
figure is not re-derived without saying so.

**The change.** *"The guide landing page should show only the chapter titles and
one-liners, with click-through to view the subsections. This would keep each
view manageable. From the chapter view, which shows the subsections, you could
incorporate the same previous/next chapter navigation currently used within the
sections."*

**Why the previous derivation was wrong.** Fig 4.8 listed every section inline
under its chapter, to satisfy doc 22 §9.2's "one tap from the map to anywhere".
With one chapter shipped that read as a tidy 6-row list. At the manual's real
size — 21 chapters, ~6 sections each — it is a ~130-row wall, which is the
untraversable-document failure doc 22 §9 exists to prevent, relocated to the
one screen whose whole job is orientation. The tap count was optimized and the
**legibility** was not, and legibility is what a landing page is for.

### 1. Fig 4.8 — the map, amended

- **Chapter rows only**: number, title, and the chapter's one-line summary, each
  row a link to the chapter page. Same row geometry the section rows used
  (`border-b border-ink/15`, 14px bold title over a 13px `text-ink/60` summary,
  a `›` at the right), so the change is what the rows *say*, not a new pattern.
- The section-count field in the meta line **stays** — it is how a reader learns
  the manual is bigger than 21 things without being shown all of them.
- The search row is unchanged and keeps its position above the list. It now
  carries more weight, since it is the 1-tap path for a reader who knows what
  they want; the 2-tap browse path is for a reader who does not.

### 2. Fig 4.9 — the chapter page gains prev/next

The chapter page moves onto the critical path, so it takes the affordance the
section footer already has (2026-08-07 §4, owner review round 2): a two-column
footer rule, `‹ Previous` / `Next ›` in tracked caps over the **destination's
name**, never a bare arrow.

- It is the **same component grammar**, one level up — deliberately, so the
  reader learns the pattern once. Rendered by `ManualChapterNav`, sibling to
  `ManualSectionNav` in `ManualBlocks.tsx`.
- It runs over chapter reading order **within one manual** (doc 22 D4: the User
  Guide and the AI Manual are separate reads), so it never runs one into the
  other — the same rule `readingOrder` already applies to sections.
- Ends are open: chapter 1 has no previous, the last chapter no next.

### 3. Fig 4.10 — one figure gains a diagram

Ch. 3's opening section renders the cycle hierarchy as a `figure` rather than
leaving the nesting to prose ("draw what is structural", doc 22 §8.4b rule 7).
`public/manual/cycle-nesting.svg` follows the Phase-2 asset policy without
amendment: single-colour line art, CSS mask filled with `currentColor`, its own
aspect reserved. It shows **profile → macrocycle → mesocycle → microcycle →
workout** as nested frames — the profile included on the owner's note that the
goal arc rests on who you are, and drawn outside the cycle stack rather than as
another layer of it, because it is an input to the arc and not a period of time.
No tunable value is baked into the asset (`C-ramp-06`'s rule, applied again).

Phase 1 built one chapter and the screen that renders a section. Phase 2 makes
it a *manual*: a map, a search, a door on the More tab, and the deep-link entry
Phase 7's in-app links will use. One new figure number is claimed in the 08 §5
index: **4.11 — guide search**. Everything else here either builds a surface the
2026-08-07 entry already specified (4.8) or amends 4.10.

The derivation rule is unchanged from that entry: no mockup exists, so each
surface is composed from patterns the app already ships and the composition is
written down before it is transcribed.

### 1. The guide map (fig 4.8) — built as specified

Built exactly as the 2026-08-07 entry §3 specified it, with two additions that
only became decisions once the screen existed:

- **The meta line counts the corpus** — `USER GUIDE · 1 CHAPTER · 6 SECTIONS`,
  in the tracked `10px` meta form, counts in `.numeral`. A manual should say how
  big it is; a reader deciding whether to browse or search is asking exactly
  that.
- **A chapter rule is a link.** The `SETTINGS`-style rule carrying the chapter
  number and title is tappable and carries the app's quiet chevron, so the
  chapter contents page (fig 4.9) is reachable without being *on the way* to
  anything. Sections remain listed inline beneath it, which is what keeps
  doc 22 §9.2's one-tap requirement true.
- **Search sits above the chapters**, as a full-width `border-[1.5px]
  border-ink` row reading `Search the guide` with the standard `SEARCH ›` quiet
  label — the settings-row grammar at emphasis weight. It is above the list
  because it is the shortest path for a reader who arrived with a question
  rather than with curiosity.
- **Impact.** `NET-NEW` — `/more/guide`.

### 2. Guide search (fig 4.11)

- **Change.** `/more/guide/search`: the More sub-page header (`‹ GUIDE`,
  `h1.title-display` reading **search**, one tracked meta line), then a single
  bordered field, then results. A result row is the fig-4.9 row grammar with a
  tracked-caps `CH n · CHAPTER TITLE` line above the section title and a
  **snippet** — a ~150-character window of the section's own prose around the
  first match — where the chapter list shows the authored summary.
- **It live-filters as you type**, which is the app's own search grammar (P20,
  the exercise library) rather than a submit-and-render form. A reader who does
  not yet know the manual's vocabulary needs to watch the corpus move under the
  query; that is the whole reason typing beats submitting here.
- **The snippet, not the summary.** A search result has to show *why it
  matched*. The summary is the right thing on the map, where the reader is
  browsing; in results it would hide the sentence they were looking for.
- **The empty states are three, and each says something different**: before the
  minimum query length, what a result *is* ("results are sections — each one
  opens on its own screen"); while the index loads, `SEARCHING…`; on no match, a
  suggestion of what kind of word to try. A single "no results" line would be
  the same screen for three different situations.
- **No accent.** Nothing here is a current position or a selection.
- **Affected figures.** 4.11 (new).
- **Impact.** `NET-NEW`.

### 3. Deep-link entry — the back link follows the reader (fig 4.10, `RETROFIT`)

- **Change.** A section route accepts `?from=`, the app's existing origin
  grammar (N4, already on the exercise page and meso stats). When it is present
  and resolves, the breadcrumb row's left link becomes `‹ {ORIGIN}` — `‹ WORKOUT`
  for a link tapped mid-session — and the **chapter parent moves to the right of
  the same row** as `{CHAPTER TITLE} ›`, so nothing is lost. Without it, the row
  is exactly what Phase 1 shipped.
- **Rationale.** N27, the standing rule: always back-link where you came from.
  This is the surface where it matters most, because Phase 7 sends readers here
  from the middle of a workout, and a back link into the guide would strand
  them. Keeping the chapter link visible is what stops the fix from trading one
  lost affordance for another.
- **The landing mark is the accent's one job in the reader.** A deep-linked
  section carries a **■ in orange** at the head of its meta line. Hard rule 7
  reserves orange for current position, and "the section you were just sent to"
  is precisely that — the same role the tab bar's ■ plays.
- **Deviation from doc 22 §9.4.6, recorded.** The spec says the mark is shown
  *briefly*. It is not animated: it persists for the visit and is gone the
  moment the reader moves on, because the next section carries no origin. A mark
  that fades on a timer is absent for the reader who looked up mid-scroll, and
  it would replay on every client-side re-render. "For as long as you are on the
  screen you were sent to" is the honest reading of *briefly* here.
- **`from` is validated, not trusted.** It is matched against an allowlist of
  in-app prefixes (longest wins, so More's children keep their own names) and
  anything else — protocol-relative, backslashed, off-site, or simply
  unrecognized — is dropped and the chapter breadcrumb stands. A wrong-looking
  back link is a worse failure than no origin at all.
- **Impact.** `RETROFIT` — fig 4.10's header, now
  `src/components/manual/ManualSectionHeader.tsx` (shared with the Phase-6 AI
  Manual reader).

### 4. The door: a `Guide` row on More (fig 4.4, `RETROFIT`)

- **Change.** A settings row — `Guide` with the quiet `READ ›` label — as the
  **first** row under the `SETTINGS` rule, above `Theme`.
- **Rationale.** doc 22 **O2** put the entry point on the More tab, and the app
  has no separate tab for settings, so this is where it goes. First rather than
  last because discoverability is the entire purpose of having an entry point,
  and the rows below it are toggles a reader already knows how to find. It is a
  navigation row among settings rows, which the AI connector and BodySpec rows
  already established as acceptable on this screen.
- **Gated with the routes it opens** (`releaseActive("1.1.0")`, doc 23 §9.2) —
  one gate at the route boundary and one at the door, so a dark release has no
  visible handle.
- **Impact.** `RETROFIT` — fig 4.4.

### 5. `figure` — the tenth… eleventh block kind, and its asset policy

The 2026-08-07 entry §5 deferred `figure` to this phase on the grounds that its
asset policy was a D3-guard question. It was, and the answer has two parts.

- **Change.** A `figure` block renders a bordered box containing the asset, with
  an optional caption beneath at `text-[11px] leading-[1.5] text-ink/55`. The
  asset is **single-colour line art** under `public/manual/`, and it is rendered
  as a **CSS mask filled with `currentColor`** — `mask-image` plus
  `background-color`, not an `<img>`.
- **Why a mask.** The app carries an explicit light/dark switch on
  `<html data-theme>`. An `<img>` with baked ink disappears in one of the two
  themes, and `prefers-color-scheme` cannot see an explicit override, so
  `<picture>` does not solve it either. A mask takes the theme's own ink token
  and is exactly right in both — verified by rendering the first figure in both
  themes before it shipped. It also constrains figures to single-colour line
  art, which is the only figure style the light-ledger system has room for.
- **`role="img"` + `aria-label`** carry the alt text a mask would otherwise
  drop, and a test requires every figure to have one: a figure that renders as a
  mask is *nothing at all* to a reader who cannot see it.
- **The cache policy.** Figures get **their own runtime cache**
  (`manual-figures`, 32 entries, `CacheFirst`), matched **ahead of** the general
  same-origin image rule. That rule's cache is capped at 64 entries **shared
  with the app icons and splash screens**, and a chapter of figures read once
  would quietly evict app chrome — the "the manual degraded the app" outcome
  D3's condition exists to prevent. Cache-on-read, never precached.
- **The first figure states shape, not values.** `rir-ramp.svg` draws a
  five-week block stepping `3 · 2 · 1 · 0` with the deload week well above the
  others and **no number on it**, because the deload target is an
  `engine_params` value and an image is the least greppable place a number can
  go stale in. The prose states it, next to its parameter path (doc 22 §8.2).
- **Impact.** `NET-NEW` — `figure` in the block union, its renderer, the
  `manual-figures` cache in `sw.ts`, and `public/manual/`.

### 6. What the D3 guards actually turned out to be

Recorded because the first pass at them was wrong in a way the next person would
repeat. `@serwist/next` behaves differently from its own config-entry sibling:

1. Supplying `additionalPrecacheEntries` **replaces** the public-directory glob
   outright. The `/~offline` entry has therefore been keeping `public/**` out of
   the precache since R7 — figures were never at risk, and adding them would
   take deleting that option.
2. Assets under `server/` are excluded by the plugin itself, so **no prerendered
   guide HTML is ever precached**.
3. Measured against a real build, the manifest holds exactly one entry
   (`/~offline`). The named `manual-search-index` chunk exclusion in
   `next.config.ts` is therefore defence in depth rather than the mechanism —
   kept because it is the line that would still bite if the scoping changed.

The guard that carries the weight reads the **built artifact**: CI re-runs the
guard suite after `npm run build` and asserts the emitted manifest names nothing
manual.

**One correction to doc 22 falls out of the same reading**, and it is a real
one: D3's third promise — *"a chapter read once is a hashed immutable build
asset, so it re-opens offline"* — **does not hold**, because the reader is
server-rendered. A section's prose lives in HTML and the RSC payload, both of
which `sw.ts` serves `NetworkOnly` by design; it never becomes a
`/_next/static/**` asset. Offline manual reading is not delivered, and under the
owner's own framing of **O1** (*worth having only because it is free*) it should
not be bought. Recorded in doc 22 §4 for the owner; the guards keeping the
manual off the hot path stand regardless, because they were never about offline.

## 2026-08-07 — The manual reader: map, chapter contents, section (figs 4.8 / 4.9 / 4.10, N74 / doc 22 Phase 1)

Hard rule 8 again has no figure to point at: the June mockup round predates the
idea of a manual, so **there is no mockup for any of the three surfaces**. This
entry is the design pass doc 22 §2.6 requires, taking the same route the
2026-08-06 entry took for the release surfaces — derive from the house system,
write the derivation down, then transcribe it.

Three figure numbers are claimed in the 08 §5 index: **4.8 — guide map (More →
Guide)**, **4.9 — chapter contents**, **4.10 — a section**.

**Why they can be derived and not drawn.** A manual introduces exactly one new
object — a *block of reference prose* — and the app already renders every other
piece: sub-page headers (fig 4.4's children), section rules (`SETTINGS` on More),
glossary cards (`InfoDot`), quiet onward links (`LABEL ›`), and the dated
entry list (fig 4.6). The design question is which of those compose, and the
answer is checkable against the surrounding screens rather than a matter of
taste.

**The one genuinely new constraint** is that these are *reading* surfaces. Every
other screen in the app is a working surface where density wins; a manual
section is read once, in order, and the house's 12–13px tracked density would
make it hostile. So the reader gets the app's **one** typographic concession:
body prose at `text-sm leading-[1.65] text-ink/80`, roughly 60–70 characters a
line at phone width. Nothing else changes — same cream, same ink, same square
corners, same accent discipline.

### 1. The section is the screen (fig 4.10)

- **Change.** `/more/guide/[chapter]/[section]` renders **one section**, per doc
  22 §9.1. Header is the More sub-page grammar with the **chapter** as parent:
  the back link reads `‹ {CHAPTER TITLE}` (`text-[10px] font-bold
  tracking-[0.14em] text-ink/55`), then the section title, then one tracked
  all-caps meta line — `USER GUIDE · CH 6 · 3 OF 6`, numerals in `.numeral`.
- **The section title is not a `title-display`.** Screen titles in this app are
  one lowercase word or two (`more`, `what's new`); a section title is a
  sentence and would set as three display lines on a phone. It renders in the
  app's other bold-heading form instead — `text-[22px] font-extrabold
  tracking-[-0.01em]`, sentence case — the same weight as fig 4.4's profile
  name, one step up. The chapter page keeps `title-display`, because a chapter
  title *is* a screen name.
- **No accent anywhere on the page** in Phase 1. Orange marks current position
  and selection only; a section being read is not a selection. It reappears in
  Phase 2 for exactly one job — the ■ marking the landed section after a
  deep-link entry (doc 22 §9.4.6), which is a current-position mark and so is
  the accent's actual meaning.
- **Affected figures.** 4.10 (new).
- **Impact.** `NET-NEW`.

### 2. Chapter contents (fig 4.9)

- **Change.** `/more/guide/[chapter]` is a **contents page, never prose** (doc
  22 §9.1). `‹ GUIDE` back link, `h1.title-display text-[32px]` with the chapter
  title, a one-line chapter summary at `text-sm text-ink/60`, then the section
  list: one row per section, `border-b border-ink/15 py-3.5`, carrying a
  `.numeral` index in `text-ink/40`, the section title at `text-[15px]
  font-bold`, its one-line summary at `text-[13px] text-ink/60`, and the app's
  quiet chevron.
- **Rationale.** This is fig 4.4's settings-row grammar with a summary line
  added — the same shape as a release entry (fig 4.6 §3). Reusing it is what
  makes the guide read as part of the app rather than as an embedded document.
- **Affected figures.** 4.9 (new).
- **Impact.** `NET-NEW`.

### 3. The guide map (fig 4.8) — specified now, built in Phase 2

- **Change.** `/more/guide` lists every chapter with **its sections inline**, so
  a section is never behind a chapter page (doc 22 §9.2's one-tap requirement).
  A chapter is the `border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold
  tracking-[0.14em]` rule the app already uses for `SETTINGS`, carrying the
  chapter number in `.numeral`; its sections are the §2 rows beneath it.
- **Rationale.** The map is the whole answer to the owner's "not one
  untraversable document" note. Expanding chapter-by-chapter would hide the
  thing being navigated; the section rules are cheap enough to render the lot.
- **Impact.** `NET-NEW` — **Phase 2**. Recorded here so the design pass covers
  the reader as a whole rather than being reopened mid-build.

### 4. The block vocabulary — nine kinds, each already in the house

Content is typed data (doc 22 D2) and each block kind maps onto a pattern the
app ships, so nothing here is invented:

| Block | Renders as | Borrowed from |
|---|---|---|
| `heading` | tracked-caps rule, `border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]` | `SETTINGS` on More (4.4) |
| `para` | `text-sm leading-[1.65] text-ink/80`; app copy quoted inside it is full ink at `font-medium` — the house has no italics | the reading concession above |
| `list` | rows with a 3px `bg-ink/30` square marker; ordered lists use `.numeral` indices in `text-ink/40` | `W1` labels in the RIR schedule editor |
| `steps` | numbered rows, `border-b border-ink/10 py-2.5`, tracked-caps label + body | the day view's ruled rows |
| `table` | tracked-caps head under a `border-b-[1.5px] border-ink`, `border-b border-ink/15` rows, `overflow-x-auto` | meso stats tables |
| `callout` | `border-[1.5px] border-ink px-4 py-3.5`; the `honesty` tone adds a tracked-caps label line | the `InfoDot` card |
| `term` | **the `InfoDot` card's exact internals** — `label-caps text-[10px] font-bold tracking-[0.14em]` + `text-xs leading-[1.55] text-ink/80` — in the same bordered box | `InfoDot` (N25) |
| `link` | the quiet onward link, `LABEL ›`, `text-[9.5px] font-semibold tracking-[0.1em] text-ink/55` | every settings row |
| `detail` | `<details>` behind a quiet-link summary; opens into a `border-t border-ink/15` box | the planner's `ADVANCED` disclosures |

- **The `term` block is the §8.1 contract made visible.** A glossary term
  renders in the manual as the *same card* the `InfoDot` opens, with body copy
  read from `src/lib/glossary.ts` at render time — so it is structurally
  impossible for the manual to define a term in different words.
- **Dashed borders stay out.** Hard rule 7 reserves dashed for planned/empty;
  nothing in a manual section is either, so every border here is solid.
- **`detail` is doc 22 D5's third depth layer** — collapsed by default, and
  therefore excluded from the §9.3 length budget. Its summary is fixed copy,
  `THE EXACT RULE ›`, so the reader learns one affordance rather than a new
  label per section.
- **Impact.** `NET-NEW` (`src/components/manual/`).

### 5. `figure` is deferred to Phase 2, deliberately

Doc 22 D2 names `figure` in the block union. It is **not** built here, and the
reason is a design one rather than a scheduling one: a figure is an asset under
`public/`, which `sw.ts` serves through `StaleWhileRevalidate` with a **64-entry
cap shared with the app icons and splash screens**. A figure-heavy manual would
quietly evict app chrome from that cache — precisely the kind of "the manual
degraded the app" outcome doc 22 D3's condition exists to prevent. The asset
policy therefore belongs with Phase 2's other D3 guards, not ahead of them.
Until then a section describes a control in words and links to it.

- **Impact.** `NO-CODE` — recorded so Phase 2 owns it.

### 6. Copy discipline is a test, not a habit (again)

Manual copy is typed data in `src/content/manual/`, and hard rule 7 plus the doc
10 §9 guardrails are enforced over that data by unit tests — as they already are
for release notes. Phase 1 lands the **length budget** (doc 22 §9.3), calibrated
against this entry's exemplar chapter: **≤ 350 words and ≤ 12 blocks per
section**, `detail` contents excluded. The remaining four contracts land with
the reader infrastructure in Phase 2.

- **Calibration.** Chapter 6's six sections came out at 205–323 words over 6–9
  blocks, median 229. Doc 22 §9.3's proposed ceiling therefore stands unchanged:
  a typical section sits at two thirds of it, and the densest — the three-layer
  mechanism section, which is the shape most at risk of sprawling — at 92%.
- **Rationale.** The budget is a design constraint before it is a content one:
  350 words is one to two phone screens at the body size fixed in §1, which is
  what makes "the section is the screen" true rather than aspirational.
- **Impact.** enforced in `src/content/manual/__tests__/`.

### Round-2 refinements (owner review of the exemplar, same day — all shipped)

The exemplar did its job: four notes came back off the rendered screens, three
of which are design changes rather than copy fixes.

**7. A section's footer gains prev/next (fig 4.10) — `RETROFIT`**

- **Change.** Below the related list, a two-column footer under a
  `border-t-[1.5px] border-ink` rule: `‹ PREVIOUS` / `NEXT ›` in the tracked
  `9.5px` caps the app uses for quiet labels, each **naming its destination**
  underneath at `text-[13px] font-semibold`. It crosses chapter boundaries
  (doc 22 §9.2), and the ends of a manual are simply open.
- **Rationale.** Owner: reaching an adjacent section should not cost a trip up
  to the chapter page and back down. Naming the destination rather than showing
  a bare arrow is the same principle as §8 below — the reader should know where
  a control goes before committing to it. Pulled forward from Phase 2.

**8. `related` is a labelled list carrying each target's summary — `RETROFIT`**

- **Change.** Related sections render under their own `RELATED` rule, one row
  per target with its **title and its one-line summary**, in the fig-4.9 row
  grammar. The bare `LABEL ›` links that previously sat at the foot of two
  sections are gone. A row whose target is already the prev or next section is
  **omitted**, since the footer directly beneath it offers that same link.
- **Rationale.** Owner: a link dropped in cold does not say why it is there. The
  target's summary is the reason, and it costs nothing because §9.4 already
  makes every section owe one. The standalone `link` block stays in the model
  for genuinely in-flow pointers introduced by the sentence before them — it is
  the *unmotivated trailing* link that was the mistake, not the block kind.

**9. New block kind: `legend` — show the mark, do not describe it — `NET-NEW`**

- **Change.** A `legend` block renders rows of *the app's actual mark* beside
  what it means: a fixed `22px` glyph cell in `text-ink/50` (the day view's own
  weight), the app's own name for the mark in tracked caps, then one line of
  explanation. First use is the `▲` / `■` / `▼` set-compliance markers in ch. 6.
- **The mark vocabulary is closed**, exactly as the block union is: a symbol the
  manual can draw is a symbol the app actually renders. Marks are addressed as
  tokens (`set-marker:over`) and resolved through **`src/lib/set-markers.ts`**,
  a new shared source that `DayView.tsx` now reads too — so the screen and the
  manual cannot show different glyphs, and a test asserts the day view no longer
  carries the characters inline.
- **Rationale.** Owner: demonstrating an app element is a strength of this
  format and should be used wherever it applies. Describing `■` as "level with
  it" asks the reader to imagine a symbol that is three centimetres away on the
  screen they are asking about.
- **Impact.** `NET-NEW` (`legend`), plus `RETROFIT` on `DayView.tsx`'s marker.

**10. Definitions may not lean on an unexplained abbreviation — `RETROFIT`**

- **Change.** `GLOSSARY.e1rm`'s label becomes **`ESTIMATED ONE-REP MAX (E1RM)`**
  and its body now ties the words to the letters before using them; the two
  other cards that said "estimated 1RM" say "estimated one-rep max". A test
  asserts any card mentioning `1RM`/`e1RM` also spells it out.
- **Rationale.** Owner: a definition that opens with "1RM" explains nothing to
  the reader who needed the definition. This is a glossary change rather than a
  manual one **because §8.1 makes them the same text** — which is the contract
  working as intended for the second time in one phase.
- **Impact.** `RETROFIT` — every `InfoDot` for these terms, and the manual.

## 2026-08-06 — Two new surfaces: the What's New sheet and the version history (figs 4.6 / 4.7, N80 / doc 23 Phase 0)

Hard rule 8 has no figure to point at here — the June mockup round predates the
idea of a release, so **there is no mockup for either surface**. This entry is
the design pass doc 23 Phase 0 requires, and it is what the build transcribes,
taking the same route doc 16 Phase 3 took for the set-row marker: derive both
screens from the house system rather than improvise them, and write the
derivation down before any markup exists.

Two new figure numbers are claimed in the 08 §5 index: **4.6 — version history
(More → What's new)** and **4.7 — What's New sheet**.

**Why they can be derived and not drawn.** Neither surface introduces a new
kind of object. A release entry is a titled block of prose with an optional
onward link — the same shape as the settings rows on More (fig 4.4) and the
glossary cards behind an InfoDot. A release is a dated group of them, which is
what every section rule in the app already expresses. So the design question is
not "what should these look like" but "which existing patterns compose", and
getting that wrong is visible immediately against the surrounding screens.

### 1. The What's New sheet (fig 4.7)

- **Change.** A new bottom sheet, reusing `BottomSheet` unchanged — ink scrim at
  45%, cream panel rising from the tab edge behind a 2px ink rule, square, no
  grab handle, ~280ms rise. **Title** is the newest pending release's headline
  (`text-[26px] font-extrabold`, the sheet's standard). **Subtitle** is the
  tracked all-caps line the sheet already reserves: the version — or the version
  *span* when several releases accumulated — then the date, e.g.
  `1.1.0 · 14 AUG 26` or `1.1.0 – 1.3.0 · 14 AUG 26`. Versions and dates set in
  `.numeral`.
- **Body** is the shared entry list (§3 below), newest release first, entries
  concatenated. No per-release sub-heading inside the sheet: a returning user is
  being told *what is new*, not *which release each thing shipped in* — the
  history page is where that distinction is offered.
- **Dismiss** is the full-width ink bar the app uses for a committing action
  (`bg-ink py-4`, `text-[13px] font-bold tracking-[0.12em]`), reading
  **GOT IT**. The sheet's own ✕ and the scrim dismiss it identically; all three
  acknowledge, because all three are the user choosing to leave.
- **Rationale.** O2 chose a sheet over a banner: a banner is easy to ignore,
  which defeats the point, and a sheet is honest about interrupting. The
  interruption is bounded by doc 23 §6.4, which only ever lets it land between
  sessions. Reusing `BottomSheet` rather than inventing a modal also inherits
  `useModalA11y` (escape, focus trap, focus return) and `useScrollLock` — R18
  behavior that a bespoke overlay would have to re-earn.
- **No accent.** The sheet carries no orange. Nothing on it is a current
  position or a selection; the release being announced is simply the content.
- **Affected figures.** 4.7 (new).
- **Impact.** `NET-NEW`.

### 2. Version history — More → What's new (fig 4.6)

- **Change.** A new More sub-page at `/more/whats-new`, using the sub-page
  header the other More children already use: the `‹ MORE` back link
  (`text-[10px] font-bold tracking-[0.14em] text-ink/55`), then
  `h1.title-display text-[32px]` reading **what's new**, then one tracked
  all-caps meta line — `WORKOUT 1.0.0 · EVERY RELEASE, NEWEST FIRST`.
- **A feature or major release** renders as a section: a `border-b-[1.5px]
  border-ink` rule carrying the version (left) and the date (right), the
  headline beneath it at `text-xl font-extrabold`, then the shared entry list.
- **A fix release** collapses to a single dashed-bordered row —
  `border border-dashed border-ink/35`, version, a `1 FIX` / `n FIXES` count and
  the date, expanding to one line per entry. Dashed is the house marker for
  something *held back* rather than laid out, which is exactly what a collapsed
  fix release is; O3 wants maintenance visible without letting it compete with
  feature releases for attention.
- **The accent appears exactly once**: a ■ in orange against the version the app
  is currently serving. That is the only "you are here" on the page, and it is
  the same role the tab bar's ■ plays (hard rule 7).
- **Entry point.** The More footer stops being the hardcoded string
  `WORKOUT 0.1 — PRE-RELEASE` and becomes a link:
  `WORKOUT <version> — WHAT'S NEW ›`, same weight and colour as before
  (`text-[9.5px] font-medium tracking-[0.12em] text-ink/45`). It stays a footer,
  not a settings row: the version is provenance, not a setting.
- **Rationale.** This page is the durable copy of the sheet — a user who
  dismissed it, or who wants to re-explore, comes here — and that is precisely
  what allows the sheet to be strictly once-only.
- **Affected figures.** 4.6 (new), 4.4 (footer).
- **Impact.** `NET-NEW`, plus `RETROFIT` on fig 4.4's footer.

### 3. `ReleaseEntryList` — one renderer, two surfaces

- **Change.** A single component renders an entry in both places. A row is
  `border-b border-ink/15 py-4`: an optional tracked all-caps area label
  (`TRAINING` / `PLANNING` / `STATS` / `CONNECTOR` / `APP`, `text-[9.5px]
  tracking-[0.12em] text-ink/45`), the title at `text-[15px] font-bold`, the
  body at `text-sm leading-relaxed text-ink/70`, and an optional onward link in
  the app's standard quiet-link form — `LABEL ›`, `text-[9.5px] font-semibold
  tracking-[0.1em] text-ink/55`.
- **Rationale.** Nothing about an entry may render differently in the two
  places, or the history page stops being a faithful copy of what the user was
  shown. Enforcing that with one component rather than with discipline is the
  same call doc 22 D4 made.
- **Impact.** `NET-NEW` (`src/components/releases/ReleaseEntryList.tsx`).

### 4. Copy discipline is a test, not a habit

- **Change.** Release copy is typed data in `src/content/releases/`, and the
  house voice is enforced by unit tests over that data: no exclamation marks or
  superlatives (hard rule 7), positive framing, plain language, the doc 10 §9
  honesty guardrails (an estimate is named as an estimate), and a length budget
  — headline ≤ 60 characters, entry title ≤ 60, body ≤ 240, at most six entries
  in one release.
- **Rationale.** Release notes are the copy most likely to drift toward
  marketing, and they are written in small pieces weeks apart. The length budget
  is also a design constraint: six entries is roughly what fits a sheet without
  it becoming a document, and a block that produces more should have shipped as
  two releases.
- **Impact.** `NO-CODE` for layout; the constraint is enforced in
  `src/content/releases/__tests__/registry.test.ts`.

## 2026-08-06 — Four surfaces get quieter: prescription details, the cycles filter, the history row, the planner exercise sheet (figs 1.1 / 1.2 / 2.1 / 2.5 / 3.2, N75–N78)

One owner batch, one shared instinct: each screen was asked to carry one thing
less, or to carry the same things in fewer controls.

- **Change (N75, figs 1.1/1.2).** The exercise ⋮ menu's `Engine audit ›` row is
  **gone**. The sheet is renamed **Prescription details** and is opened by
  tapping the prescription strip's **ask line**, which is now underlined
  (`decoration-ink/35`, `underline-offset-[3px]`) to read as tappable without a
  chevron or a second control.
- **Rationale.** The ⋮ menu is a short fixed list where every row costs a slot,
  and this is a panel most people never open. This **amends the 2026-07-19
  entry** below, whose Batch-20 addendum removed an in-strip link so the strip
  would stay "purely the story": the owner's correction is that the ask line
  *is* the door, so nothing sits **beside** the story competing with it.
- **Impact.** `RETROFIT` — `DayView.tsx`, `PrescriptionDetailSheet.tsx`.

- **Change (N76, fig 2.1).** The cycles list hides **finished cycles** by
  default — a whole closed macrocycle (status `completed`, or every block in it
  completed/abandoned) and closed standalone mesos. A completed mesocycle
  **inside a still-running macrocycle stays visible**. A single muted link sits
  at the bottom of the list carrying the count: `SHOW 3 COMPLETED CYCLES` /
  `HIDE COMPLETED CYCLES`, at `9.5px` tracked caps in `ink/40`, no border and
  no accent.
- **Rationale.** The list is a working surface; a year of closed blocks buries
  the one that is live. The count is what keeps the toggle honest — hidden
  history must read as hidden, never as lost. It is the quietest control on the
  page on purpose: a filter is not an action.
- **Impact.** `RETROFIT` — `cycles/page.tsx` (`?completed=1`, server render).

- **Change (N77, fig 3.2).** The history list's flipped (e1RM) row drops the
  `· N EFF REPS` clause and the `~` prefix on an assumed RIR. It now reads
  `367.5 lb E1RM · 2 RIR`.
- **Rationale.** Owner: the row was too busy, and the tilde marks a distinction
  — assumed vs reported — that this row's reader can't act on. It survives on
  `get_exercise_history`, where the distinction has a reader who needs it.
  Supersedes the 2026-08-04 (session 2) entry's addition of both marks to this
  row.
- **Impact.** `RETROFIT` — `ExerciseHistoryList.tsx` (display only; the query
  and MCP payload are unchanged).

- **Change (N78, fig 2.5).** The planner board's exercise row is **one target**.
  The inline `−/N/+` starting-set stepper, its `START SETS` micro-label, the `✕`
  remove control, and the tap-the-name-to-substitute gesture are all replaced by
  a single row-wide button opening an **exercise sheet**: `STARTING SETS`
  (stepper) · `TARGET RIR` (unset = one dashed `+ SET A TARGET RIR` button; set
  = stepper plus a dashed `FOLLOW THE RAMP`) · `Replace exercise ›` ·
  `Remove from day`. The row itself now shows `3 SETS` over `RIR 4` (or
  `RIR —` / `RIR BY WEEK`) and a `›`. The board is also reachable for an
  **in-progress** mesocycle, not only a planned one.
- **Rationale.** The row carried six targets per exercise, one of them
  undiscoverable, and had no room for the effort lever the owner asked for —
  so the lever arrived by **subtraction**. `RIR —` is said out loud rather than
  left blank so an assignment always reads as a departure from something (doc 21
  §4.1), and `RIR BY WEEK` names a per-week assignment rather than flattening it
  into a value the board can't show. The sheet's note states what an assignment
  overrides **before** it is set, and that a flat value governs the deload too.
- **Impact.** `RETROFIT` — `PlannerBoard.tsx`, `MesoHeader.tsx`. No mockup
  figure for the sheet; it is assembled from this screen's existing light-ledger
  primitives (the day sheet's stepper grammar, dashed = optional/unset,
  `border-ink/15` action rows). Deviation recorded in `PROGRESS.md`.

## 2026-08-05 — RIR capture cell shows the real number again (fig 1.1, corrects 2026-08-04 session 2, doc 21 §2, N70)

- **Change.** The `RIR` capture cell's 2026-08-04 amendment (below) is
  **reverted**: when the prescribed target RIR is above 10, the cell no longer
  pre-fills empty with a `—` placeholder. It shows the **real prescribed
  number, unbounded** (e.g. `21`), same as every value below 10 always has. What
  is new is the **muting**: the number reads at `ink/45` — the grid's existing
  convention for "this is the plan's assumption, not something you reported" —
  for as long as the cell is untouched **this session** and the row carries no
  server-confirmed report; the instant the athlete types, or once a real report
  lands, it reads at full strength. A logged row with no reported RIR (or a
  future/skipped/locked static row) uses the exact same muting rule it already
  did.
- **Rationale (owner review).** A blank cell tells the athlete nothing. The
  2026-08-04 change reasoned by analogy to §9.4's qualitative band (the ask
  sentence, the planner meta) — but those are narrative prose, where printing
  "kept well short of failure" instead of "21 RIR" avoids asking the reader to
  internalize a strange number. This cell is a plain numeric readout; the
  strange-number problem doesn't apply to it the same way, and the safety
  concern that motivated blanking it doesn't apply at all: `reportedRirFromInput`
  already turns anything outside 0–10 into "no report", **whatever the box
  displays** — so showing `21` was never at risk of writing an illegal
  `rir_reported`. Muting communicates "not a confirmed report" without
  discarding the information a `—` did.
- **Affected figures.** 1.1 (set grid), same shared row component as 1.2/1.3.
- **Impact.** `RETROFIT` — `DayView.tsx` (the capture cell's fill + muting) and
  `day-rules.ts::captureRirDefault` (now returns `number`, not
  `number | null`).

## 2026-08-04 (session 2) — An effort assignment reads on the plan and prices in words, not a number nobody can estimate (figs 1.1 / 1.2 / 2.5b, doc 21 §8/§9.4, N70)

The Phase-6 pass for exercise-level RIR. Four elements, none of which exists in
the mockup; every one built from a primitive the app already ships.

- **Change (fig 1.1, Day View exercise eyebrow).** The `NN — MUSCLE` eyebrow
  gains a suffix when the slot carries an assignment for this week, using the
  **exact idiom already there for `· SKIPPED`** (same 10px semibold,
  `0.16em` tracking, `ink/55`, ` · ` separator — no tag box, no new primitive,
  no accent):
  - assigned **above** the week's RIR → `· BACKED OFF`
  - assigned **below** the week's RIR → `· PUSHED HARDER`
  - a working-set cap → `· CAPPED 2` · a rep position → `· TOP OF WINDOW`
  At most **two** suffixes render (RIR state first); the strip carries the rest.
  `BACKED OFF` is deliberately the **same word** the history row and the
  comparability line already use (2026-08-04 session 1) — one state, one name,
  wherever it appears.
- **Change (fig 1.1, prescription quick-read strip).** The assignment is the
  **first thing the why says**, above every engine-authored line: *"This exercise
  is set to 4 reps short of failure this week, easier than the week's 1."*
  followed, when one was stored, by the reason on its own line: *"Noted: nerve
  flare — easing the lumbar load for two weeks."* Then at most one further
  effort line (cap → rep position → the measuring-band note). Same 11px body
  treatment as the existing why lines; **no new label, no rule, no color** — the
  ordering *is* the emphasis (doc 21 §8: the authored effort level must be read
  before the engine's own reasoning, so a coaching line can never narrate an
  engine rationale for a decision a human made).
- **Change (fig 1.1, the ask line — doc 21 §9.4 settled as the qualitative
  band).** Past the measuring band (`e1rm.max_measuring_rir`, default 8) the ask
  **stops printing the RIR number** and states the band instead: `3 sets of 9 at
  171 lb, each kept well short of failure.` The real number is unchanged
  everywhere it is a *number* — the Engine audit sheet's `PRESCRIPTION` tuple
  (fig 1.2) still reads `171 × 9 @ 21 RIR`, and the trace is untouched. A
  strip-only band line says why: *"Well short of failure by design — this one is
  priced light, so it is not read as a strength measurement."*
- **Change (fig 1.1, the `RIR` capture cell — amends the 2026-08-02 pre-fill
  rule; itself superseded by 2026-08-05, above).** When the prescribed target
  RIR is **above 10** (the range `logged_sets.rir_reported` accepts, and the
  range a human can estimate at all), the cell pre-fills **empty** with a `—`
  placeholder instead of the prescribed number, and stays editable 0–10. An
  untouched cell still reports nothing and still resolves to the prescription
  server-side, so the default stays a no-op; what changes is that the app stops
  printing "21" in a box labelled RIR and asking the athlete to confirm it. A
  real report *is* still accepted there, and a set reported at 8 becomes a
  measurement again — the band and the capture control compose rather than
  fight. ~~Reverted 2026-08-05: the cell shows the real number again, muted
  instead of blanked — see the entry above.~~
- **Change (net-new sheet, fig 1.2 family — `Effort target`).** A bottom sheet off
  the Day View exercise `⋯` menu. It takes its **shape** from the Load-step sheet
  (doc 14 phase 3, `LoadStepSheet.tsx`) — title + tracked-caps subtitle, choice
  controls, an optional free entry, a clear affordance, `Cancel` / `SAVE` — and
  its **choice-control vocabulary from the settings screens** (fig 4.4 and the
  profile editor), *not* from Load step. Revised twice on 2026-08-04 after owner
  review; the shipped treatment is:
  - **section label** `10px / 600 / 0.14em / ink 55`;
  - **contiguous button block** — `flex border-[1.5px] border-ink`, cells
    `flex-1 py-2.5 text-center text-[10px] tracking-[0.1em]`, unselected **paper
    with no fill** (`font-medium text-ink/55`) divided by `border-l border-ink/30`,
    **selected `bg-accent font-bold text-bg-base`**;
  - **full-width dashed button** for the two escape hatches, exactly the profile
    editor's `CUSTOM VALUE` control, filling to accent when active;
  - **helper `<p>`** under each block, `11px / 500 / normal / ink 60`.
  The **scale** is the settings screens'; the **selected fill is accent**, not
  their ink. Hard rule 7 reserves orange for current position and selection, and
  a selected cell is exactly that — the settings screens predate that reading and
  the Load-step sheet already fills with accent. What was wrong in the first cut
  was only the scale: Load step's `13px` bold chips read a full size larger than
  every other choice control in the app. One consequence: the custom-value
  validation message is **ink**, not accent — inside this sheet orange now means
  *selected*, so an orange error string would compete with the filled cells.
  Contents, top to bottom:
  1. the week's own value stated first — `WEEK 3 RAMP` / `1 RIR` (§4.1's "show
     the default beside the field"), `DELOAD WEEK` on a deload week;
  2. `TARGET RIR` — a **five-cell** block: `RIR 0` (absolute — taken to failure,
     the hardest thing this lever can ask for) then four steps **easier than the
     week** (`+1 +2 +4 +8`), resolved on selection and shown as absolute values
     (`RIR 5`). A step can never collide with the `0` cell, since every step
     lands at least 1 above a week RIR that is itself ≥ 0. Then `CUSTOM VALUE`
     (dashed, full width) for the 0–30 range, then `USE THE WEEK'S RAMP (n RIR)`
     (dashed, full width) as the clear affordance;
  3. `APPLIES TO` — `THIS WEEK` / `WORKING WEEKS` / `ALL WEEKS` as a three-cell
     block, each with **one short line** saying what it reaches: *"Week 3 only."*
     / *"Every working week — not the deload."* / *"Every working week and the
     deload."*;
  4. `REASON` — a one-line text field, 500 chars, stored with the assignment (A7)
     and surfaced in the strip. Its placeholder is **direction-neutral** (*"why
     this exercise runs differently"*): this lever raises effort as often as it
     lowers it, and an example that only ever described a back-off framed it
     wrongly;
  5. warnings after a save, in **ink**, under a `SAVED — NOTE` rule:
     harder-than-programmed, and an all-weeks value covering the deload.
  The `Cancel` / `SAVE` footer is unchanged at `13px` — that pairing is identical
  in every sheet in the app **including the settings sheets**, so it was already
  consistent; the mismatch was entirely in the choice controls.
  A cap or rep position set over the connector reads here under a
  `SET BY YOUR COACH` label as **settings rows** (`Working-set cap` · `2`), not
  editable controls — A4 keeps MCP the primary surface for those two, and a lever
  the sheet cannot change must still be visible where the athlete looks for it.
- **Scope labels (revised 2026-08-04).** `WHOLE BLOCK` read as though it might
  rewrite weeks already trained. The set is now **`THIS WEEK` / `WORKING WEEKS` /
  `ALL WEEKS`**, which names the real distinction — **deload coverage**. A flat
  `meso_exercises.target_rir` governs every week the per-week schedule doesn't,
  and the deload falls off the end of that schedule by construction (§4.1), so
  only `ALL WEEKS` reaches it. `WORKING WEEKS` still writes **forward only** from
  the current week; that is indistinguishable in outcome from rewriting weeks
  1..n — a trained week cannot change — and it keeps the stored plan free of
  edits that could not have had an effect. The standing guarantee sentence
  (*"weeks you have already trained never change"*) was **removed from the sheet**
  at the owner's direction; the three layers that enforce it are recorded in doc
  21 §10 and PROGRESS instead of restated on every render.
- **Change (fig 2.5b, the planned-day page).** The per-slot right-hand meta
  (`N SETS · M RIR`) resolves the assignment for that week, so a planned week
  shows the intensity it will actually be priced at, and appends ` · BACKED OFF`
  / ` · PUSHED HARDER` in the same eyebrow idiom. A slot priced past the
  measuring band shows `LIGHT` in place of the RIR number, matching the strip.
- **Rationale.** doc 21 §8 requires the assignment to read on the planner slot
  and the day-view strip and gives the sheet the Load-step precedent, but no
  figure exists for any of it. The two judgement calls: (1) the **eyebrow suffix
  over a tag box** — the exercise header already has four icon controls and a
  boxed tag would compete with them, while `· SKIPPED` proves the suffix is the
  house idiom for "this row is in a non-default state"; (2) the **qualitative
  band** — doc 21 §9.4, settled by the owner. A prescription of `@ 21 RIR` is
  arithmetically fine and humanly strange, and printing it in the athlete's
  quick-read asks them to internalize a number the app itself refuses to treat as
  a measurement. The band phrase says the true thing; the audit sheet keeps the
  arithmetic.
- **Affected figures.** 1.1 (eyebrow, strip, set grid), 1.2 (menu + the new
  sheet; the audit sheet is unchanged and that is the point), 2.5b (planned day).
- **Rule-8 pass.** **No mockup figure exists** for any element here — verified
  against `workout - App Screens v2.dc.html`, where the exercise eyebrow carries
  only `NN — MUSCLE`, the strip carries only ask + why, and the exercise menu has
  no effort row. Recorded here before building per doc 21 §8; same precedent as
  the 2026-08-02 RIR column and the P19/N35 marker glyphs. House style honored:
  every primitive reused (the `· SKIPPED` suffix, the strip body line, the
  Load-step sheet), **ink only — no accent except the Load-step chip selection
  the sheet inherits**, square corners, lowercase/tracked-caps discipline, no
  hype and no exclamation marks.
- **Impact.** `RETROFIT` — `DayView.tsx` (eyebrow, strip, menu row, capture
  pre-fill), the planned-day page; `NET-NEW` — `EffortSheet.tsx`; `DATA` — the
  day view and the planned-day page must read the slot's assignment columns
  (`meso_exercises.target_rir` / `rir_schedule` / `set_cap` / `set_cap_schedule` /
  `rep_position` / `effort_reason`) resolved for the week, plus whether the
  resolved RIR is inside the measuring band.

## 2026-08-04 — Backed-off sessions read as set-aside, not as decline (figs 3.2 / 4.3, doc 21 §6.2, N70)

- **Change (fig 3.2, exercise History):** a session whose slot ran at an
  **assigned RIR above its week's** carries a **`BACKED OFF` tag** on the row —
  the *same* tag primitive as `DELOAD` (1px `ink/40` border, 8.5px bold,
  `0.1em` tracking, `px-[5px] py-[2px]`, `align-[2px]`), rendered after it when
  both apply. The session's numbers are unchanged: top weight, reps, e1RM, RIR
  and effective reps all still show.
- **Change (fig 4.3 + the macro Performance tab, `EST. STRENGTH …` block):** when
  the rollup set any session aside, a **one-sentence comparability line** follows
  the block's existing all-caps footnote, at the **Balance-note treatment**
  (13px, `leading-[1.55]`, `ink/80`, sentence case): *"N sessions ran at an
  assigned back-off RIR (…) and are left out of the trend — deliberately easier
  work is not a like-with-like strength read. The sets still count toward
  volume."* Absent entirely when nothing was set aside.
- **Rationale:** doc 21 §6.2 excludes a deliberately-easier session from every
  strength surface, exactly as deloads are already excluded (T-A2). An exclusion
  the athlete cannot see is indistinguishable from missing data — worse here than
  for deloads, because a rehab block can remove a lift from the trend entirely.
  The tag answers "why is this session not counted"; the line answers "why did
  the number move / why is this lift missing". Both state the other half too —
  the volume still counts (§9.1) — so the disclosure cannot be read as "that work
  didn't happen".
- **Affected figures:** 3.2 (history rows, and the shared history sheet used by
  the Performance drill-down), 4.3 (meso Performance), macro Performance (M8).
- **Rule-8 pass:** **no mockup figure exists** for either element — verified
  against `workout - App Screens v2.dc.html`, where history rows carry only the
  `DELOAD` tag and the strength block carries only its all-caps footnote. Doc 21
  §8 requires the house-style transcription to be recorded here before building;
  same precedent as the 2026-08-02 RIR column and the P19/N35 marker glyphs.
  House style honored: **existing primitives reused, none invented** — the tag is
  the DELOAD tag, the line is the Balance note; ink only, **no accent** (orange
  stays reserved for current position + selection); square corners; no
  exclamation marks and no hype.
- **Impact:** `RETROFIT` — `ExerciseHistoryList.tsx` (tag) and
  `stats/StrengthProgress.tsx` (line); `DATA` — both read new fields
  (`v_exercise_history.backed_off`, `StrengthProgress.comparability`).
- **Deliberately not here:** the *planner/day-view* disclosure of an active
  assignment and the editor sheet — those are Phase 6, with their own pass.

## 2026-08-02 — Day View: per-set RIR capture joins the set grid (fig 1.1, doc 21 §2/§8, N71/N38)

- **Change:** the logging set grid gains a **third value column, `RIR`**, between
  `REPS` and `LOG`. The header row becomes `LB · REPS · RIR · LOG` and the grid
  goes `[20px 1fr 1fr 44px 44px]` — `LB`/`REPS` keep the flexible columns, `RIR`
  takes a fixed 44px (one or two digits is the whole range), and `LOG` is
  unchanged at 44px. The cell is the **same input primitive** as `LB`/`REPS`:
  same 35px box, 15px numeral, same four state treatments (logged / next /
  skipped / future). No new control type is introduced.
  - **Pre-filled with the prescribed target RIR** — never 0, never empty. On a
    logged row it shows what that set reported; on a queued row what it
    reported at the tap; on an unlogged row the week's ask.
  - **Static rows** (future / skipped / completed-session / queued) render the
    number as text like the other two cells. It is **muted to `ink/45` whenever
    the number is the prescription rather than something the athlete reported** —
    a logged set that carried no report reads muted, exactly like an unlogged
    row's ask. Same honesty rule as history's `~` marker (§6.2): an assumption
    is never rendered as an observation.
  - Editing a logged row's RIR saves through the same blur → amend path as
    weight and reps; a value outside 0–10 (or an emptied cell) reports
    **nothing** rather than a wrong number, and the server falls back to the
    prescription.
- **Rationale:** doc 21 §2 (A1) amends the RIR premise — the prescription is a
  *suggestion* and the athlete reports honest reps-in-reserve *even when it
  differs*. Without a write surface, `logged_sets.rir_reported` was dormant and
  every stats surface read every set as taken to failure (N71). Doc 21 §9.2
  settled the ergonomics as **option (a)**, a per-set control pre-filled with
  the prescribed value: the honest default and the simplest to reason about.
  Pre-filling the prescription makes the default a **no-op** — an untouched cell
  reports exactly what the server's `assumedRir` fallback would have resolved to
  — so the new column costs nothing on the hot path and only a *changed* value
  carries information. Pre-filling **0** was rejected outright: that is the N11
  regression, where an exactly-as-prescribed set read as a big miss, worst on
  deloads.
- **Affected figures:** 1.1 (set grid), and the shared set-row component
  wherever it appears (1.2, 1.3).
- **Rule-8 pass:** **no mockup figure exists for per-set RIR capture** —
  verified against `workout - App Screens v2.dc.html` (the set grid there is
  `LB / REPS / LOG` throughout; RIR appears only as the week's target in header
  and prescription copy, never as a set-row cell). Doc 21 §8 anticipates this
  and requires the house-style transcription to be recorded here before
  building. Same precedent as the P19/N35 marker glyphs (2026-07-09). House
  style honored: existing cell primitive reused rather than invented; ink only,
  no accent (orange stays reserved for position/selection); square corners;
  tracked all-caps column label.
- **Touch targets:** the 44px column keeps the input's hit area at 44×35 with
  the row's 10px gaps around it, matching the `LOG` column's treatment (R18).
  `LB`/`REPS` narrow from ~118px to ~100px on a 375px viewport — still well
  clear of a three-digit weight at 15px.
- **Copy (doc 21 §8):** the `rir` glossary entry changes **meaning**, not just
  wording — it now states that the target is what to aim for, not what to
  report, and asks for the RIR the athlete actually had. The `rir_ramp` entry
  gains "unless one is set for a specific exercise" ahead of doc 21 Phase 2.
- **Also in this pass (exercise history, fig 3.1b/3.2):** the e1RM flip line
  reports the RIR the estimate was **priced at** and the **effective reps**
  behind it — `367.5 lb EST 1RM · ~2 RIR · 10 EFF REPS`. A leading `~` marks an
  RIR that was *assumed* from the prescription rather than reported, so an
  assumption is never displayed as an observation (doc 21 §6.2).
- **Impact:** `NET-NEW` + `DATA` — `logged_sets.rir_reported` (existing column,
  previously never written) becomes live; the write queue's `log` op carries it;
  exercise history gains `rir_source` + `effective_reps`.

## 2026-07-24 — Day View: the prescription strip becomes a three-layer ledger, + the COACH line (fig 1.1, N63)

Owner-directed: "rework the deterministic prescription explanation language to
be better, and more consistent with the character/language/tone/terminology
represented within the coaching layer… consider also the overall formatting of
the full prescription note (statement, explanation, coaching layer) so we have a
clear, pleasant and easy presentation." The ask line was called out as already
good and is unchanged. Amends the 2026-07-19 entry below (§1); the drill-in
rule, the target-glyph button, and the strip's position above PINNED all stand.

### 1. Quick-read strip — visual hierarchy across the three layers (fig 1.1)

- **Change:** the strip's single flat block of `11px` ink/70 lines becomes three
  ranked zones inside the same left-border strip:
  - **the ask** — `11.5px` semibold **full ink** (was ink/85, same weight as the
    body). It is the prescription; it reads first and reads as primary.
  - **the why** — `11px` medium ink/70 as before, but each cause on its own line
    with `4px` of air between them (`space-y-1`) instead of `2px`, so a
    two- or three-cause week reads as a list, not a paragraph.
  - **the coach line** — doc 19 §3's additive LLM layer, now rendered: separated
    by a hairline (`border-t border-ink/20`, `8px` above / `6px` below), a
    tracked-caps `COACH` label (`9px`, `0.16em`, ink/45 — the ledger
    section-header idiom already used by the audit sheet and the set-grid
    header), then the line itself at ink/75.
- **Rationale:** the three layers have three different authors and three
  different standings (the ask is the program's instruction, the why is the
  program's reasoning, the coach line is an observation). Flat styling made them
  one undifferentiated blob and left the coach line — when it exists at all —
  indistinguishable from a program fact.
- **Copy:** the strip's loading and retry lines said "the engine's decision";
  they now say "the program's decision" (doc 19 §4.2 — "engine" appears only in
  the Engine audit).
- **Affected figures:** `1.1`.
- **Impact:** `RETROFIT`. No mockup figure covers this strip (pre-existing
  rule-8 deviation from N57, recorded in PROGRESS.md); the treatment is built
  from the light-ledger primitives already in the day view. Nothing about the
  coach line's *availability* changes here — it renders only when the LLM
  feature is serving and a stored v3 row exists for the decision (doc 19 §3),
  which is still the minority-of-decisions path.

### 2. Deterministic explanation — one voice with the coaching layer

- **Change:** every line the composer can write was rewritten to the copy system
  now documented at the head of `src/lib/prescription-narrative.ts` and pinned
  by tests: the program is the actor, second person only for what the lifter did
  or reported, cause-then-consequence in one sentence, the lifter's own rating
  vocabulary (workload *past just right*, pump, joint pain, fatigue,
  performance), one parallel construction for every held-weight cause, and no
  hype. A **program-intent line** ("this is the block's peak week…") now closes
  the why on the weeks where intent is the story, using the same templates the
  coaching facts payload uses, and only when the week has room for it.
- **Rationale:** the deterministic layer is what the lifter reads every session;
  it was drifting into colloquialism ("ran hot", "a rough one") and engine-ish
  shorthand ("step up", "price a confident step") while the coaching layer was
  held to an analyst register. Two layers, one voice.
- **Impact:** `RETROFIT` (copy only — no number, gate, or engine behavior
  changes). Full rationale + the per-line before/after live in doc 19 §13.

## 2026-07-21 — Feedback card: joint-pain exercise attribution (fig 1.4)

Owner-reported: joint pain is collected once a muscle group closes, but it was
stored on the group-*closing* exercise, so the engine's pain gate and the MCP
feedback rollup attributed it to whichever exercise was last rather than the one
that actually hurt (e.g. AC-joint pain on bench press mis-read as pain during the
incline press that followed). Joint pain is genuinely per-exercise; the card
must let the lifter say which exercise(s) caused it.

### 1. "Which exercise caused it?" multi-select (fig 1.4)

- **Change:** in the group-close feedback prompt, when real joint pain (Low /
  Moderate / High — i.e. > None) is reported **and** the muscle group has more
  than one performed exercise, a new section appears below the Joint pain
  buttons: a bold label "Which exercise caused it?" with a tracked
  `— optional; defaults to all` sublabel, then one full-width selectable button
  per performed exercise in the group (vertical stack, left-aligned names).
  Multi-select — any number may be on. Selection uses the same light-ledger
  grammar as the pain / days-sore buttons (`accent` fill + `bg-base` text when
  on, `ink/40` hairline border when off; square corners). The Joint pain
  sublabel reads `— today's <group> work` when the group has multiple performed
  exercises, and `— during <exercise>` for a single-exercise group (unchanged).
- **Behavior:** the pain **level** lands on each selected exercise's feedback
  row and clears on the deselected ones; an **empty** selection with pain
  reported defaults to attributing the pain to **all** performed exercises
  (conservative — the gate fires on each). None / soreness-only prompts show
  none of this (card stays clean). Pump / workload / soreness remain
  group-scoped on the closing exercise. On edit the section reconstructs the
  prior attribution from whichever rows carry pain.
- **Rationale:** put the pain gate on the exercise that hurt; keep the common
  path (no pain, or single-exercise groups) exactly as before.
- **Affected figures:** `1.4`.
- **Impact:** `RETROFIT` — fig 1.4 already built. No mockup figure exists for
  the attribution control (rule-8 deviation, recorded here + in PROGRESS.md);
  it reuses the existing feedback-button grammar. **No `DATA` change** —
  `exercise_feedback.joint_pain` is already per-`workout_exercise`; only the
  write path changed (level fans out across the attributed exercises).

## 2026-07-19 — Day View: prescription quick-read strip + the detail sheet becomes the Engine audit (N57)

Owner-directed rework of prescription presentation: "what we have now feels
more like a debugging panel than a useful prescription detail." The
presentation splits into a user-facing **quick-read** and a technical
**Engine audit**. All `RETROFIT` on fig 1.1/1.2 surfaces; no mockup figure
exists for either half — light-ledger styling per rule 8, deviation recorded
in PROGRESS.md.

### 1. Exercise card — prescription (target) button + quick-read strip (fig 1.1)

- **Change:** each exercise card's header icon row gains a leftmost
  **target-glyph button** (circle + center dot, 14×14 stroke style, matching
  the note/history buttons) that toggles a **prescription quick-read strip**
  rendered exactly where and how notes render (left-border strip, `11px`
  medium ink/70, above PINNED). The button carries the menu-style active
  state (`border-ink bg-ink text-bg-base`) while open.
- **Content (deterministic composer `src/lib/prescription-narrative.ts`):**
  an **ask line** composed from the row alone (instant, e.g. "3 sets of 9 at
  250 lb, each stopped 2 reps short of failure."), then body lines once the
  recorded decision loads: the delta vs last session (the RIR ramp explained
  in reps-to-failure language) plus the **why, with room for multiple
  contributing factors** (owner follow-up 2026-07-19) — feedback-modulation
  causes (pain-capped load, hot-workload set removal, rough-session
  dampening, set additions/vetoes) rendered alongside the progression state
  (`stepped` / `paced` / `vanished` / `not_earned` with its predicate,
  surfacing the previously invisible paced/not-earned hold, N56 §8.5), with
  the earn-gate echo of a feedback cause deduplicated so one cause never
  reads as two; capped at three why-lines; a hand-adjusted-numbers caveat
  when the live tuple diverges from the decision (N33 S4). Copy voice per
  06: plain sentences, no hype, no exclamation marks.
- **Drill-in:** via the ⋮ menu's `Engine audit ›` row only (owner follow-up
  2026-07-19 — an in-strip link was built and removed; the strip stays
  purely the story).
- **Rationale:** the only in-app explanation was the raw engine rationale
  string buried in the ⋮ menu — technical, and silent about paced holds.

### 2. Exercise ⋮ menu — rationale row replaced by "Engine audit" (fig 1.2)

- **Change:** the menu row that printed the raw rationale prose now reads
  `Engine audit ›` (standard MenuRow), always present. The prose lives in
  the audit sheet.

### 3. Prescription detail sheet → **Engine audit** (no figure)

- **Change:** retitled `Engine audit`; content regrouped into a ledger:
  PRESCRIPTION (tuple + engine rationale + out-of-band tripwire), DECISION
  (KIND / COMPUTED UNDER Vx · date / VERIFIED AS OF Vx + re-verified note),
  EST. STRENGTH (e1RM) (unchanged N44/N45 ledger), TRACE — trace steps now
  label their doc-16 §3.6 status coding structurally
  (`PROGRESSION · PACED (RATE_PACER)`) instead of relying on the prose.
- **Rationale:** the sheet is the retained auditability half of the split;
  same information, organized as the record it is.

One PR sweeping the small Batch-17 items. All `RETROFIT`.

### 1. Day View — replace-exercise sheet gets filters + a confirm step (fig 1.2 menu path)

- **Change (N48):** the replace sheet gains the shared `EQUIP` FilterBar axis
  (N29 grammar), exactly as the planner's picker carries it. Candidates were
  already muscle-scoped; equipment was the missing cut.
- **Change (N49):** picking a candidate no longer commits the swap on a bare
  row tap. Rows are single-select (checkbox square, radio behavior) and the
  swap commits via a full-width `REPLACE EXERCISE` button, disabled until a
  pick exists — mirroring the planner `ExercisePicker` (N31) and the day-view
  `AddExerciseSheet`, which were already select-then-confirm.
- **Rationale:** owner note (Batch 17); the sheet was the only tap-to-commit
  picker left, and an accidental tap committed a swap instantly.
- **Impact:** `RETROFIT` — shipped in the same PR as this entry.

### 2. Day View — add-exercise sheet chips fold onto `FilterBar`

- **Change:** the hand-rolled `ALL GROUPS` / `ALL EQUIP` chip rows (pre-N29)
  become two FilterBar axes (`GROUP`, `EQUIP`) — same behavior, shared
  primitive, standard ✕-to-clear affordance.
- **Impact:** `RETROFIT` — the last pre-N29 chips are gone; FilterBar is now
  the only filter idiom in the app.

### 3. Day View — prescription detail sheet gains an `EST. STRENGTH (e1RM)` block

- **Change (N44/N45):** below the PRESCRIPTION block, a new ledger section
  with up to three rows: `PRESCRIBED IMPLIES` (the e1RM the prescribed
  weight × reps @ RIR inverts to; effective load for bodyweight movements),
  `TARGET ANCHOR A*` (the doc-16 target anchor that priced the row — stepped
  rows only), and `MEASURED ANCHOR` with its coordinate — the winning set the
  recency anchor keyed on, e.g. `115 × 11 ON JUN 28`.
- **Rationale:** owner notes (Batch 17): the anchor e1RM appeared only baked
  into rationale strings, and the anchor's provenance was computed then
  discarded — the number was unauditable ("e1RM 110.1, but I did 115×11 on
  May 22", PH39's ghost). Estimates stay labeled EST. per doc 10 §9.
- **Impact:** `RETROFIT` + `DATA` (the anchor's source coordinate now threads
  from the engine through `inputs.strengthAnchor`, so newly recorded decisions
  and `explain_prescription` carry it). No mockup figure exists for this sheet
  (pre-existing rule-8 deviation, PROGRESS.md).

### 4. Day View — completed/skipped sessions render logged sets as static text (fig 1.2)

- **Change (N50):** on a completed or skipped workout, logged rows' weight/rep
  cells are static text (logged styling and the over/met/under marker
  preserved) instead of live inputs. Editing was an illusion — the
  completion-lock RLS silently discarded the writes.
- **Impact:** `RETROFIT`.

### 5. Create-meso sheet — `WEEKS` label reflects the deload toggle

- **Change (N55):** "WEEKS — INCLUDING DELOAD" renders the suffix only while
  "Final week is a deload" is checked, mirroring the edit-details sheet's
  existing conditional.
- **Impact:** `RETROFIT` (one label).

### 6. Macro surfaces — the goal-target estimate cards are hidden again (figs 2.2/2.3)

- **Change (N54, owner-decided):** the 2026-07-11 Phase-R2 restore below is
  rolled back — macro Overview `REALISTIC TARGET` card, create-flow
  `YOUR TARGET` + rate + closing rationale + `MODEL BAND` priming row, and the
  goals-edit `YOUR TARGET` card (pre-R2; hidden for consistency) all come off
  again. `LAST BLOCK MEASURED` stays (measured, not modeled). `planMacrocycle`
  and the persisted targets are untouched — a pure view change.
- **Rationale:** the strength-rate band still buckets by calendar training
  years (N43); the owner wants the numbers hidden until the v23
  FFMI-proximity band makes them trustworthy. Re-enable rides N43/v23.
- **Impact:** `RETROFIT` — supersedes the fig 2.2/2.3 halves of the
  2026-07-11 Phase-R2 entry below until re-enabled.

## 2026-07-11 — Phase R2: the target cards return (figs 2.2/2.3), with the est-strength nouns

v21 (the doc 17 §2 target-engine correction) is **active on hosted**, so the
N21 owner hide of 2026-07-04 is lifted — the cards are re-transcribed from
figs 2.2/2.3 (the geometry, sizes, and copy of the pre-hide build, which was
itself the mockup transcription; verified against
`workout - App Screens v2.dc.html`).

### 1. Macro Overview (fig 2.2) — `REALISTIC TARGET` card restored

- **Change:** the card returns at the top of the OVERVIEW panel, above the
  mesocycle timeline (which regains its `mt-[18px]` ruled offset): tracked
  header `REALISTIC TARGET · <noun>`, 34 px range numeral + `over N mo`,
  accent `≈ +low–high / month` rate line, profile chips (training age /
  bodyweight / experience), and the estimate fine print. One wording
  amendment vs the pre-hide build: the strength-goal noun is
  **`EST. STRENGTH`**, not `KEY-LIFT STRENGTH` — key lifts were retired as a
  measurement by PR #157 (doc 17 §2.5); the target is graded by the
  est-strength rollup, so the card must name what will actually be measured.
- **Affected figures:** 2.2.
- **Impact:** `RETROFIT` — pure view restore (`planMacrocycle` kept running
  throughout; PR #140 made the hide view-only).

### 2. Create engine card (fig 2.3) — `YOUR TARGET` + rate + rationale restored

- **Change:** the engine card's accent `YOUR TARGET` header, range numeral
  with the goal noun (`lean mass` / `est. strength` — same PR #157 amendment
  — / `bodyweight`; maintain renders the recomposition line), the accent
  per-month rate, and the closing rationale paragraph under the CREATE button
  all return. The PLAN block (block math + phase strip) is unchanged.
- **Change (the 09 2026-07-11 §3 deferred half):** the prior-block priming
  line gains its **model band** — the top-ruled ledger area now stacks two
  rows when a prior completed macro qualifies: `MODEL BAND` /
  `<low>–<high>%/MO EST. STRENGTH` (the §2.1-personalized
  `strengthRatePctMonth` — strength-denominated to match the measured row,
  whatever the goal) above `LAST BLOCK MEASURED` / `+X%/MO EST. STRENGTH`.
  Composition per doc 17 §5 (*"model band 1.5–3%/mo · your last block
  measured 1.9%/mo"*), rendered in the established ledger-row grammar; still
  display-only, never blended into the target (principle 4).
- **Affected figures:** 2.3.
- **Impact:** `RETROFIT` — view restore + one new ledger row in the priming
  area.

## 2026-07-11 — BodySpec DEXA: engine + MCP, and the profile body-fat control rework (doc 17 §6, N34 Phase 5c)

The third DEXA PR (doc 15 §5 Phase 3) plus an owner-directed rework of the
profile's body-fat control (owner note, 2026-07-11: after a scan updates the
profile, the estimate bands still rendered with a stale band lit; the old
band increments — 10/14/18/23/29 — read as arbitrary; and there was no way
to enter a between-band value). **Rule-8 pass:** fig 4.5 shows the profile
data rows but predates the body-fat picker's DEXA states; no figure covers
an RMR surface (re-verified against `workout - App Screens v2.dc.html`).
Treatments below are house-style; this entry is the design record.

### 1. Profile (fig 4.5) — body-fat estimate bands normalized + custom value

- **Change:** the six estimate bands move to even 5-point steps —
  `~10% · ~15% · ~20% · ~25% · ~30% · 35%+` (was 10/14/18/23/29/35) — and a
  full-width **`CUSTOM VALUE`** chip lands under the grid (dashed idle, the
  `+ ADD EXCLUSION` grammar). It opens a bottom sheet with a single numeric
  input (2–70, half-point steps); a saved value that matches no band
  midpoint lights the custom chip as `CUSTOM — 17.5%` (pressed ink style)
  instead of approximately lighting a band. Band highlight becomes **exact
  match** (was ±2.5 fuzzy): a value is either a band pick, a custom entry,
  or a measurement — never a guess at which chip it "counts as". Helper
  copy gains the custom path ("Pick the closest band, or enter an exact
  value if you know it.").
- **Rationale:** normalized increments read as a scale, not a lookup table;
  a between-band user shouldn't have to lie by a band's width (owner note).
- **Affected figures:** 4.5 (body-fat block only).
- **Impact:** `RETROFIT` — picker rework + `setBodyFatEstimateAction`.

### 2. Profile (fig 4.5) — DEXA-measured body-fat state

- **Change:** while the profile's body-fat carries **DEXA provenance**
  (`profiles.body_fat_source = 'dexa'`, written by the consented scan-apply)
  **and** a BodySpec connection exists, the estimate picker gives way to a
  measured panel: header reads `BODY FAT — MEASURED` / `BODYSPEC DEXA`
  (replacing `— ESTIMATE` / `OPTIONAL`), an ink-bordered row shows the
  measured figure (`18.2%`) beside `SCAN <date>` (the newest applied scan's
  date — derived, never duplicated), and a dashed
  **`OVERRIDE WITH AN ESTIMATE`** action opens the §1 custom sheet (saving
  flips provenance back to `'estimate'` and restores the bands). Helper
  copy states the lifecycle flat: *"Measured by DEXA — applying a new scan
  updates it. Override to use your own estimate instead, or disconnect
  BodySpec to return to the estimate bands."* Disconnecting BodySpec
  reverts the control to the picker (the value itself stays until edited —
  it's still the best current belief).
- **Rationale:** a connected, current user has better data than any band —
  showing six unlit estimate chips beside a measurement misstates what the
  app knows (owner note). Estimate bands are for when estimating is all
  there is.
- **Affected figures:** 4.5 (body-fat block only).
- **Impact:** `RETROFIT` + `DATA` — `profiles.body_fat_source` column
  (migration `20260711000005`); apply-action stamps `'dexa'`, picker/custom
  stamp `'estimate'`.

### 3. Macro page (fig 2.2) — `MEASURED RMR` context on cut/gain macros

- **Change:** the macro Overview tab gains a ruled `MEASURED RMR` section
  (below `BODY COMPOSITION`) **only** on `cut` and `hypertrophy` macros and
  only when the newest scan carries a Cunningham RMR (the FFM-based
  formula — genuinely DEXA-informed; Mifflin is height/weight arithmetic
  and never qualifies as "measured"). One stat-grade numeral
  (`1,798 KCAL/DAY`) beside `SCAN <date>`, with the honesty footnote:
  *"Resting metabolic rate from your lean mass (Cunningham) — daily
  maintenance sits above it once activity is added. Context for this
  cut/gaining block only — prescriptions and targets never read it."*
- **Rationale:** doc 15 §3.4 — a measured metabolic anchor as display-only
  context on the energy-balance goals, without opening nutrition scope.
- **Affected figures:** 2.2 (section added; existing elements unchanged).
- **Impact:** `RETROFIT` — reads the newest `body_scans` row.

### 4. MCP `get_body_composition` (not a screen — noted for completeness)

- **Change:** the connector gains the 5c read tool over
  `v_body_comp_history` (the same view every in-app scan surface reads),
  with the doc 15 §6 guardrails shipped as data (`measurement_guardrails`:
  LSC bands, same-scanner rule, quarterly cadence, targets-never-
  prescriptions) and the newest scan's RMR as labeled context.
- **Affected figures:** none. **Impact:** `NET-NEW` (doc 05 tool table).

## 2026-07-11 — BodySpec DEXA: return-to-app page for the cookie-free connect flow (doc 15 §8.5, N34)

The connect round trip moved server-side after the owner's first real
connect failed from the installed PWA (doc 15 §8.5: iOS runs the provider
login in an in-app browser sheet with its own cookie jar, so the callback
may execute in a context with no app session). One net-new surface rides
along. **Rule-8 pass:** no mockup figure exists for any out-of-app
interstitial; house-style, composed from the established tokens — this entry
is the design record.

### 1. OAuth callback — return-to-app interstitial

- **Change:** when the connect callback lands in a browsing context that
  does not hold the initiating user's session (the installed-PWA sheet), it
  renders a minimal standalone page instead of redirecting into the app:
  logotype, lowercase title (`bodyspec connected` / `connection not
  completed`), the same one-shot outcome line the `/more/bodyspec` flash
  shows (one copy definition, shared), a muted note telling the user this
  window opened outside the app and to close it, and a full-width
  ink-bordered `OPEN WORKOUT` link to `/more/bodyspec`. Cream/ink tokens
  inlined (the page exists outside the app shell); square corners; no
  exclamation marks. A context that does hold the session keeps the
  original redirect + flash — the interstitial only appears where a
  redirect would have bounced to sign-in.
- **Rationale:** the sheet cannot render the app (no session in its jar)
  and must never dead-end at a sign-in screen for a flow that has already
  succeeded server-side.
- **Affected figures:** none.
- **Impact:** `NET-NEW` + `DATA` — `oauth_transactions` migration
  (`20260711000004`), connect/callback rework, interstitial response.

## 2026-07-11 — BodySpec DEXA: enrich + view (doc 17 §6, N34 Phase 5b)

The second DEXA PR (doc 15 §5 Phase 2): the LSC guardrail machinery lands
(`v_body_comp_history`), and with it the surfaces 5a deliberately deferred —
scan-to-scan deltas, the consented profile-update proposal, the macro-page
composition trend, and the retrospective's DEXA verdict rows. **Rule-8 pass:**
as with 5a, no mockup figure exists for any body-composition surface
(re-verified against `workout - App Screens v2.dc.html`); every treatment
below is **house-style**, composed from established primitives, and this
entry is the design record. The doc 15 §6 guardrails are binding copy rules
here: sub-LSC deltas are never presented as change, cross-scanner deltas are
flagged and never graded, no exclamation marks — health data gets the
flattest ledger voice in the app.

### 1. `/more/bodyspec` — post-sync profile-update proposal card

- **Change:** when the newest imported scan is unresolved (neither applied
  nor dismissed), carries a measured weight and/or body-fat %, and is not
  older than the profile's own bodyweight freshness (`AS OF` date), the
  integration screen renders a proposal card between `CONNECTION` and
  `SCANS`: an ink-bordered block titled `SCAN 8 JUL — UPDATE PROFILE?`, one
  ledger row per proposed value (`BODYWEIGHT 176.3 LB`, `BODY FAT 18.2%`,
  each beside the current profile value it would replace), and two actions —
  ink `APPLY TO PROFILE` and quiet `KEEP CURRENT`. Apply writes
  `profiles.bodyweight` / `body_fat_pct` (body-fat now carries a measured
  value rather than a band estimate), stamps `bodyweight_updated_at`, and
  appends the scan-day point to `bodyweight_log` (`source: 'dexa'`) — the
  Phase-4 series gains its third writer exactly as specified. Keep-current
  records the dismissal so the card never nags; either resolution is
  per-scan and permanent. **Never silent** (doc 15 §2.3): no sync ever
  mutates the profile.
- **Rationale:** measurement proposes, the user confirms — the MCP
  draft-then-confirm posture applied to external data (doc 15 §2.3; doc 17
  §6 5b).
- **Affected figures:** none.
- **Impact:** `NET-NEW` + `DATA` — `profile_applied_at` /
  `profile_dismissed_at` columns on `body_scans`; card + two actions.

### 2. `/more/bodyspec/[scanId]` — `VS PREVIOUS SCAN` section (the 5a deferral)

- **Change:** the scan detail ledger gains a `VS PREVIOUS SCAN` section
  (between `COMPOSITION` and `REGIONS`) once a prior scan exists, reading
  the scan's `v_body_comp_history` row: `LEAN` / `FAT` / `WEIGHT` /
  `BODY FAT` delta rows (`+1.2 LB`, `−0.4%`), each **stated against the
  noise band** — a lean or fat delta inside the ~2 lb LSC renders its value
  plus the muted suffix `WITHIN MEASUREMENT RANGE` (doc 15 §6.2 rule 1:
  never present a sub-LSC delta as a change), body-fat inside ±1 point
  likewise. When the previous scan came from a **different scanner model**,
  the section renders the flag line
  `DIFFERENT SCANNER — DELTAS NOT COMPARABLE` and the rows stay, muted, as
  flagged context (rule 2: flagged, not charted). The meta line under the
  section header names the previous scan's date.
- **Rationale:** 5a's entry promised exactly this: "scan-to-scan comparison
  ships with `v_body_comp_history` (5b) where the LSC noise bands and
  same-scanner flags can ride along."
- **Affected figures:** none.
- **Impact:** `RETROFIT` + `DATA` — `v_body_comp_history` view; one section
  on the scan detail.

### 3. Macro page (fig 2.2) — `BODY COMPOSITION` section on OVERVIEW

- **Change:** the macro Overview tab gains a ruled `BODY COMPOSITION`
  section (below the stats grid) **only when ≥ 2 scans fall within the
  macro's window** (±14-day bracket tolerance on both ends; doc 15 §3.2 —
  one scan is not a trend and renders nothing). Per-scan ledger rows (date ·
  `LEAN LB` · `FAT LB` · `BF%` numerals), then a top-ruled `CHANGE` line
  folding first → last scan with the same LSC treatment as §2
  (`LEAN +2.6 LB · FAT −1.9 LB`; sub-LSC values carry
  `WITHIN MEASUREMENT RANGE`; cross-scanner pairs render the
  `DIFFERENT SCANNERS — NOT COMPARABLE` flag instead of a graded change).
  Footnote copy states the cadence honestly: *"DEXA reads quarterly-plus —
  scan-to-scan lean changes under ~2 lb sit inside measurement noise."*
- **Rationale:** the outcome layer becomes visible where the goal lives
  (doc 15 §3.2), without letting a single scan or a noisy pair masquerade
  as a verdict.
- **Affected figures:** 2.2 (section added below the stats grid; existing
  elements unchanged).
- **Impact:** `RETROFIT` + `DATA` — section reads `v_body_comp_history`
  filtered to the macro window.

### 4. Completed-macro retrospective — DEXA composition rows + mass verdict

- **Change:** two amendments to the retrospective card (09 2026-07-11 N40
  entry) and its MCP twin:
  - **`COMPOSITION` row** — when ≥ 2 scans bracket the macro's logged span
    (±14 days per endpoint), a row renders the measured Δlean / Δfat over
    the block with the §2 LSC treatment. **Same-machine scans only** grade;
    a cross-scanner bracket renders the pair flagged (`DIFFERENT SCANNERS —
    NOT COMPARABLE`) and makes no claim. Informational on every goal (lean
    retention is the actual success metric of a cut; doc 15 §3.2) — the
    row never letter-grades.
  - **`MASS` row, DEXA fallback** — the Phase-4 mass verdict (measured Δbw
    vs the contract band) now also grades from bracketing same-machine scan
    weights when the bodyweight series itself doesn't bracket the span; the
    note line names the source (`measured via DEXA`). The bodyweight series
    stays first when both bracket (denser, user-owned); "not measured"
    remains the honest fallback when neither does.
- **Rationale:** doc 17 §4.2's mass verdict clause ("a bodyweight series
  and/or DEXA scans") completes; scans bracketing a macro grade the outcome
  itself (doc 15 §3.2).
- **Affected figures:** none (retrospective card is a 09-defined surface).
- **Impact:** `RETROFIT` — `macroRetrospective` fold gains the composition
  block; Overview card + `get_macrocycle_summary` render it (one fold,
  parity preserved).

## 2026-07-11 — BodySpec DEXA: integration screen + scan ledger (doc 17 §6, N34 Phase 5a)

The optional BodySpec account connection lands (doc 15; doc 17 Phase 5a):
connect via OAuth, import the full scan history, and read each scan as a
ledger. **Rule-8 pass:** no mockup figure exists for an integrations surface,
a connection screen, or a scan view (re-verified against
`workout - App Screens v2.dc.html`: fig 4.4 shows the More settings list
without an integrations row; no 3.x/4.x figure covers external data). All
treatments below are **house-style**, composed from established primitives
(settings-row grammar, section rules, ledger data rows, `BottomSheet`); this
entry is the design record. Health data gets the strictest ledger voice —
stated flat, no interpretation beyond what doc 15 §6 allows.

### 1. More page (fig 4.4) — "BodySpec DEXA" settings row

- **Change:** the SETTINGS list gains a **"BodySpec DEXA"** row (below "AI
  connector", same grammar): right side reads `SET UP ›` when disconnected,
  `CONNECTED` (muted tracked caps) once linked, `RECONNECT ›` when the
  connection has erred. Links to `/more/bodyspec`.
- **Rationale:** the integration is optional and quiet — one row in settings,
  never a nav item (doc 15 is macro-layer measurement, not a daily surface).
- **Affected figures:** none (fig 4.4's settings-list grammar).
- **Impact:** `NET-NEW` — row on the More page.

### 2. `/more/bodyspec` — integration screen (connect / sync / disconnect / scan list)

- **Change:** a More detail screen in the connector-page pattern (`‹ MORE`
  backlink, logotype, lowercase title `bodyspec dexa`):
  - **Disconnected:** an intro paragraph (what connecting does: imports your
    scan history; scans inform targets and verdicts, never prescriptions),
    then a full-width ink-bordered `CONNECT BODYSPEC ACCOUNT` action that
    starts the OAuth flow at BodySpec. When the integration isn't configured
    for the environment (no client id), the action is replaced by a muted
    `NOT AVAILABLE IN THIS ENVIRONMENT` line.
  - **Connected:** a `CONNECTION` section — ledger rows for `CONNECTED AS`
    (the BodySpec account email), `LAST SYNCED` (`—` before the first sync),
    and, on failure, a plain-stated error line with the retry path. A
    full-width `SYNC NOW` action pulls new scans on demand (pull-based per
    doc 15 §2.3 — scans arrive a few times a year; no polling).
  - **`SCANS` section:** one row per imported scan, newest first — date
    (bold) + scanner model (muted caps) left; `BODY FAT %` and
    `LEAN LB` numerals right. Rows link to the scan detail (§3). Empty
    state is a dashed-border block: `NO SCANS IMPORTED YET` /
    `SYNC AFTER YOUR APPOINTMENT — RESULTS APPEAR WITHIN A FEW DAYS`.
  - **Disconnect:** a `DISCONNECT` section at the foot — copy states tokens
    are destroyed, plus a checkbox `ALSO DELETE IMPORTED SCANS` (imported
    third-party health data is the user's to remove, doc 15 §2.3; logged
    training history is never touched). Confirm via `BottomSheet` (the
    End-macrocycle confirm weight).
- **Rationale:** doc 15 §5 Phase 1 — the vertical slice that proves the
  loop; connect/sync/disconnect status is the whole surface, everything else
  waits for 5b.
- **Affected figures:** none.
- **Impact:** `NET-NEW` + `DATA` — `external_connections` + `body_scans`
  migrations, OAuth flow, import pipeline, screen.

### 3. `/more/bodyspec/[scanId]` — scan detail ledger

- **Change:** one scan, read as a ledger (`‹ BODYSPEC` backlink; title =
  scan date, e.g. `14 jul 2026`; scanner model + scan time as the meta
  line). Sections, in order, each the standard ruled header + data rows:
  `MEASURED AT SCAN` (weight lb / height / age), `COMPOSITION` (body fat %,
  lean / fat / bone mass lb), `REGIONS` (per-region lean + fat lb: arms,
  legs, trunk, android, gynoid), `VISCERAL FAT` (mass lb, volume cm³),
  `BONE DENSITY` (total g/cm²), `PERCENTILES` (age/sex-matched rows —
  `85TH · MEN 35–45`, stated flat per doc 15 §6.2), `RMR` (Cunningham +
  Mifflin-St. Jeor kcal/day, labeled `MEASURED FROM LEAN MASS` /
  `HEIGHT-WEIGHT ESTIMATE`). **No deltas, trends, or verdicts on this
  screen in 5a** — scan-to-scan comparison ships with `v_body_comp_history`
  (5b) where the LSC noise bands and same-scanner flags can ride along
  (doc 15 §6 guardrails); a single scan renders only itself.
- **Rationale:** store-then-show fidelity first; honest comparison needs the
  guardrail machinery, so it waits for its phase rather than shipping bare.
- **Affected figures:** none.
- **Impact:** `NET-NEW` — detail route over `body_scans`.

## 2026-07-11 — Bodyweight series: quick-entry, freshness labels, create-flow priming (doc 17 §5, N41 Phase 4)

The bodyweight measurement series (`bodyweight_log`) lands: profile bodyweight
edits now also append a dated point, and three small surfaces ride along.
**Rule-8 pass:** no mockup figure exists for a bodyweight quick-entry, a
freshness label, or the create-card priming line (re-verified against
`workout - App Screens v2.dc.html`: fig 4.4/4.5 show the profile card and data
rows without dates; fig 2.3's engine card has no measured-rate line). All three
treatments below are **house-style**, composed from established primitives;
this entry is the design record.

### 1. More page — "Log bodyweight" quick-entry row + sheet

- **Change:** the More page (fig 4.4) SETTINGS list gains a **"Log
  bodyweight"** row (above "AI connector"), right side showing the latest
  measured point as `205 LB · 30 JUN` (muted tracked caps, the settings-row
  grammar; `—` when no point exists). Tapping opens a `BottomSheet` — title
  `log bodyweight`, subtitle `MEASUREMENT · LB`, a weight input (prefilled
  with the latest known value) and a date input (defaults to today, may be
  backdated), Cancel + ink `SAVE` action. Saving appends a
  `source: 'manual'` point to `bodyweight_log`; **it never rewrites
  `profiles.bodyweight`** — the profile scalar stays the engine/profile
  input, edited only in the profile editor (doc 17 §5; doc 15 §3.3 boundary).
  Same-day re-entry overwrites that day's manual point (latest wins).
- **Rationale:** mass-denominated macro goals are ungradable without a
  measured series (N41); the quick entry is the cheapest honest writer, and
  backdating lets the owner bracket a block that just closed.
- **Affected figures:** none (fig 4.4's settings-list grammar).
- **Impact:** `NET-NEW` + `DATA` — `bodyweight_log` migration, quick-entry
  action + sheet component.

### 2. "As of" freshness label wherever profile bodyweight displays

- **Change:** profile-bodyweight displays gain a muted as-of suffix naming
  the date the value was last measured/updated: the More profile card's meta
  token and the create-engine profile chip (figs 2.2/2.3) read
  `205 LB · AS OF 30 JUN`; the profile editor's existing `UPDATED 30 JUN`
  suffix on the BODYWEIGHT row is reworded to `AS OF 30 JUN` (one vocabulary).
  The day-view BW chip (09 2026-07-04, T-I2) is exempt — it is a live editor
  whose value is current by construction, and the chip line has no room.
- **Rationale:** doc 17 §5 — the macro contract is priced off this number;
  a stale scalar should say so (doc 10 §9 honesty).
- **Affected figures:** 2.3 (chip row), 4.4 (profile card meta), 4.5
  (BODYWEIGHT data row).
- **Impact:** `RETROFIT` — suffix on three existing displays; no layout
  change.

### 3. Create engine card (fig 2.3) — prior-block measured-rate priming line

- **Change:** the create-macro engine card gains **one display-only line**
  when a prior **completed** macrocycle exists with a gradable strength
  rollup: below the PLAN card's phase strip, a top-ruled ledger line
  `LAST BLOCK MEASURED` / `+1.9%/MO EST. STRENGTH` (muted label left, numeral
  right). The rate is the block's est-strength headline (PR #157 rollup)
  normalized to %/mo over its logged span; blocks spanning under 28 days of
  logging don't qualify (a near-empty block can't honestly denominate a
  monthly rate). **Never blended into the target** (doc 17 principle 4) —
  the line is informational context for the human choosing a goal.
- **Deferred half:** doc 17 §5 composes this beside the model band
  (*"model band 1.5–3%/mo · your last block measured 1.9%/mo"*). The model
  band is currently hidden (N21 owner ruling 2026-07-04, pending v21
  activation), so the band half of the copy joins at **Phase R2** when the
  target cards are re-transcribed from figs 2.2/2.3; until then the line
  stands alone.
- **Affected figures:** 2.3.
- **Impact:** `NET-NEW` — prior-block rate lookup on the create page; line
  in `CreateMacroForm`'s PLAN card. Edit-macro (same engine, prefilled) does
  not show the line — priming is a create-time affordance.

## 2026-07-11 — Macrocycle closeout + retrospective (doc 17 §4, N40 Phase 3)

A macrocycle can now end — naturally when its last real block closes, or by an
explicit "End macrocycle" — and a completed macro's Overview grades the block
against the goal contract. **Rule-8 pass:** no mockup figure exists for a
completed-macro Overview, a retrospective card, or an End-macrocycle dialog
(re-verified against `workout - App Screens v2.dc.html`: fig 2.2 shows only the
live `MACROCYCLE STATS · TO DATE` block; the only "complete" surfaces are the
Workout Complete sheet). All three treatments below are **house-style**,
composed from established primitives; this entry is the design record.

### 1. Macro header ⋮ — "End macrocycle" + confirm sheet

- **Change:** the macro header's `⋮` menu (N24 grammar) gains a destructive
  **"End macrocycle"** row, shown only while the macro is `active`. It opens a
  `BottomSheet` confirm — title `End macrocycle`, subtitle
  `END OPEN BLOCKS · COMPLETE`, body copy: *"This ends every remaining block:
  anything with logged work is completed (open sets skipped), blocks never
  started are abandoned. Logged history is kept. This can't be undone."* —
  Cancel + accent `END MACROCYCLE` action. Exactly the End-mesocycle dialog's
  weight and geometry (fig 1.1 options menu, 09 session-5 §9), one level up.
- **Rationale:** owner's closeout semantics (2026-07-10): the close is a
  deliberate, irrevocable act mirroring the workout/meso closeout family —
  never end-date-driven. No history is deleted, so the delete-dialog's
  acknowledge-checkbox weight is not required.
- **Affected figures:** none (house-style; macro header per fig 2.2's header
  region).
- **Impact:** `NET-NEW` — `endMacrocycle` query + server action + MacroHeader
  menu/sheet.

### 2. Completed-macro Overview — retrospective replaces "to date"

- **Change (a):** once a macro is `completed`, the stats section header swaps
  `MACROCYCLE STATS · TO DATE` → **`RETROSPECTIVE`**, and a verdict list
  renders above the (unchanged) 2×2 stat tiles, in the ledger row grammar
  (tracked caps label left, value right, `1.5px` ink top rule):
  - **STRENGTH** — the est-strength headline vs the stored contract band,
    e.g. `+6.2% · TARGET +4–8%`, with a verdict tag `WITHIN BAND` /
    `ABOVE BAND` / `BELOW BAND` / `INSUFFICIENT DATA` (ink-bordered box, the
    PLANNED badge geometry — never orange; the macro is over, nothing is
    "current"). On a mass-goal macro the row is informational:
    `EST. STRENGTH +6.2% · NOT THE PROMISE` (factor-0.75/0 pacing — strength
    was never this macro's contract).
  - **MASS** — only on mass-denominated contracts (hypertrophy/cut/maintain):
    `NOT MEASURED` with a muted pointer line (*"needs a bodyweight series or
    DEXA scans bracketing the block"*) until N41/N34 land body data. Never
    proxy-graded.
  - **PROGRESSION** — the demand-side aggregate when progression decisions
    exist: `12 EARNED · 3 PACED · 5 HELD` with a muted breakdown line (pacer
    vs gate mix, vanished share). Hidden while the progression mode is
    inactive (no decisions recorded).
  - **BLOCKS** — the block outcome mix: `4 DONE · 1 ABANDONED · 2 NOT BUILT`.
- **Change (b):** on a completed macro the timeline's unplanned placeholders
  drop the `+ PLAN` affordance and read `NOT BUILT` (muted, dashed mark
  unchanged) — the macro is frozen; planning into it is over. The tiles keep
  their live definitions (adherence/volume restated at close reads the same
  numbers the macro accrued).
- **Rationale:** doc 17 §4.2 — grade against the contract
  (`target_low/high`), estimate-vs-estimate copy per doc 10 §9, verdict
  vocabulary fixed (never letter grades); derive-on-read, no new stored
  state.
- **Affected figures:** 2.2 (Overview stats region + timeline rows).
- **Impact:** `NET-NEW` + `DATA` — `macroRetrospective` fold shared by the
  Overview and `get_macrocycle_summary` (one definition of the verdict);
  natural close fires when the last real block reaches a terminal state.

## 2026-07-10 — Profile AGE row becomes BIRTHDATE (doc 17 §2.5, N21 Phase 1)

- **Change:** the profile data row **AGE** (fig 4.5) and the onboarding ABOUT
  YOU field **Age** are replaced by **BIRTHDATE** — same row/field pattern, a
  native date input instead of a number. The profile row displays the stored
  ISO date; a legacy profile that only carries the static age int shows
  `AGE <n>` until re-saved (no backfill; single-user deployment). Everything
  else on both screens is unchanged.
- **Rationale:** a stored age goes stale a year at a time, and the v21
  strength-path personalization now reads age (doc 17 §2.1). Age is derived
  fresh from birthdate at plan time (`profileAge`), falling back to the
  legacy int.
- **Affected figures:** 4.5 (profile), onboarding step 1.
- **Impact:** `RETROFIT` + `DATA` — `profiles.birthdate date` (migration
  `20260710000001`); onboarding/profile editors swap the field; every age
  read (`profileToMacroProfile`, MCP `get_profile`, More card) goes through
  the derived age.

## 2026-07-09 — Three-state set marker: `met` glyph joins ▲/▼ (doc 16 §5.3, N35 Phase 3)

- **Change:** the P19 per-set performance marker on logged set rows (Day View,
  fig 1.1) becomes **three-state**. `over` keeps the small ink `▲` at the top
  right corner of the reps cell and `under` keeps the `▼` at the bottom right;
  the in-band case — previously rendered as *absence* — now shows a small ink
  `■` (6px vs the carets' 8px, same `ink/50`), vertically centered on the
  cell's right edge between the carets' two positions. Accessible names:
  "above prescription" / "met prescription" / "below prescription". The
  on-target band is no longer a UI constant: marker, engine earn gate, and
  grading read the one shared tunable (`engine_params` →
  `progression.compliance_band`; ±1.5% default while the block is absent, the
  same value as the retired module-local `MARKER_BAND`).
- **Rationale:** doc 16 (prescribed progression) — under the earned-step model
  an in-band set is a *positive* state (delivering the ask is what earning
  looks like) and deserves a glyph rather than absence (owner ruling,
  follow-up 3 §4). Session-level "progression earned" stays disclosed through
  the existing rationale/audit affordances — no new indicator, display stays
  uncomplicated.
- **Affected figures:** 1.1 (set grid). Like the original P19 pair this is
  **house-style — no mockup figure exists for the marker** (rule-8 pass
  re-verified against `workout - App Screens v2.dc.html`: the only ▲/▼
  occurrences are annotation prose, not set-row treatments). Ink-only glyphs
  per the ledger system; orange stays reserved for position/selection.
- **Impact:** `RETROFIT` — shipped with N35 Phase 3 (`DayView` `SetRow` +
  `day-rules.ts::loggedSetMarker` delegating to the engine's shared
  comparison).

## 2026-07-05 (session 2, cont.) — Per-week RIR editor (N18-B)

- **Change:** both RIR surfaces — the planner **FinalizeSheet**'s ADVANCED
  disclosure (fig 2.8) and the meso header's **Edit details** sheet — gain a
  "Set each week independently" toggle (the deload checkbox grammar). Enabling
  it seeds one row per working week from the current ramp (`W1 … Wn`, each the
  same 0–5 segmented control as START/END RIR) and **hides the START/END pair**
  while active (the schedule supersedes it; no dead controls). The deload week
  never gets a row — a muted note reads `W{n} DELOAD — RIR SET BY THE ENGINE`.
  Values are deliberately free-form (any 0–5 per week, no descend constraint —
  flexibility is the point). The collapsed summary line reads
  `RIR BY WEEK: 3·2·2·1` instead of `RIR RAMP: 3 → 0`, and the meso header's
  ramp line follows the same swap. Changing WEEKS with a schedule active
  truncates it or extends it by repeating the last week's RIR.
- **Rationale:** N18 Batch-7 — "allow the RIR for each week to be set
  independently, rather than just choosing a ramp, for more flexibility…
  a deep option that we don't need to make overly obvious." Same disclosure,
  zero new surface when untouched.
- **Affected figures:** 2.8 (finalize), meso header edit sheet. **Impact:**
  `NET-NEW` + `DATA` — `mesocycles.rir_schedule` (per-working-week array; the
  deload RIR stays engine-owned), threaded through create/edit/duplicate/copy,
  the activation ramp, the doc-14 freshness reconcile, and the MCP
  create/update/read tools.

## 2026-07-05 (session 2) — Unified filter grammar: shared FilterBar (N29)

- **Change:** one shared **FilterBar** primitive (`components/ui/FilterBar.tsx`)
  replaces the three divergent filter UIs. The grammar generalizes the exercise
  library's two-axis idiom (fig 3.1, the sleekest of the three): each axis is a
  52px tracked-caps caption + a horizontally scrolling chip track led by an
  `ALL` reset chip; selected = filled ink with an `✕` (tapping the active chip
  also clears); while any axis is active, a live result count and a `CLEAR ALL`
  underline action appear. Chips are `min-h-8` (≥32px tap target), square,
  ink-selected — orange stays reserved for current position. State lives with
  the caller, so the same bar serves client-state surfaces and URL-driven ones.
- **Adoptions:** the **Templates tab** (fig 3.3) and the **from-template
  picker** (fig 2.4 option 02) swap their three `<select>` dropdowns for chip
  rows — `DAYS` (2–7), `SPLIT` (full body … other), `FOR` (ANYONE / FEMALE /
  MALE) — and gain the count + CLEAR ALL affordance the selects lacked; both
  render one shared `TemplateFilterPanel` (search form + FilterBar), still
  URL-driven. The **exercise library** (fig 3.1) keeps its exact behavior but
  its MUSCLE axis gains the leading `ALL` chip the original 3.1 spec described
  (previously only EQUIP had one). The **planner exercise picker** (fig 2.7)
  adopts the same chips for its equipment row and gains the `EQUIP` axis
  caption (previously an unlabeled, differently-sized chip row).
- **Rationale:** N29 — "a bit of a sleeker filtering UI for exercises and
  templates. They feel disjointed and clunky." Three hand-rolled chip specs and
  a select grid encoded the same filled-ink selection grammar with different
  sizes, borders, and affordances.
- **Affected figures:** 3.1, 3.3, 2.4, 2.7. **Impact:** `TOKENS` + `RETROFIT` —
  new shared primitive; no data changes. Deliberate deltas: templates filtering
  is now chip-based rather than dropdown-based, and its count line reads
  `n TEMPLATES` (no `OF total` — the list is server-filtered, the unfiltered
  total isn't fetched).

## 2026-07-05 — Glossary info affordance (InfoDot) + template-picker filters (N25, N29)

- **Change:** app-wide **InfoDot** primitive (`components/ui/InfoDot.tsx`) — the
  feedback sheet's circled-"i" trigger grammar (17px, or 14px `small` on dense
  meta lines; open state inverts to ink) generalized into a shared affordance
  that opens an **anchored glossary card**: ink/35 scrim + a square
  `border-[1.5px] border-ink` card (264px, `shadow-menu`, AnchoredMenu
  placement — below the trigger, flipping above when it won't fit) with a
  tracked all-caps term label and 2–3 sentence body. All copy comes from one
  source, `src/lib/glossary.ts` (RIR, RIR ramp, deload, e1RM, MEV/MRV,
  fractional set counting, pump, workload, macro/meso/microcycle) so a term is
  explained with the same words everywhere. **Rationale:** N25 — technical
  terms sit all over the app with no intuitive route to clarity; the owner
  asked for help affordances that don't clutter. **Affected figures:** 1.4
  (feedback sheet), 1.1 (day-view header meta), 2.6 (planner), 4.1/4.3
  (stats), 3.1 (exercise page). **Impact:** `TOKENS` + `RETROFIT` — new shared
  primitive; the two ad-hoc feedback-sheet explainers (pump/workload inline
  expanders) are migrated onto it. Deliberate delta: the workload explainer
  no longer auto-expands on sheet open (the slider's JUST RIGHT center label
  keeps the essential cue; full copy is one tap away, consistent with every
  other term).
- **Change:** wave-1 InfoDot placements: day-view header `TARGET n RIR` /
  `DELOAD WEEK` line (terms: RIR / deload), meso calendar ramp footer +
  edit-details START RIR (RIR ramp), planner finalize-sheet START RIR (RIR
  ramp), planner WEEKLY SETS PER MUSCLE header (MEV/MRV) + DIRECT·SECONDARY
  weights line (set counting), meso Volume tab SETS/WEEK header (set
  counting), EST. STRENGTH header on meso/macro Performance (e1RM), exercise
  page EST. 1RM best cell (e1RM). Placement is intentionally incremental —
  more surfaces adopt it as they're touched. **Impact:** `RETROFIT`.
- **Change:** the **from-template picker** (fig 2.4 option 02) gains the same
  DAYS/WK · SPLIT · FOR filter bar as the Templates tab (fig 3.3), URL-driven,
  search preserves active filters. **Rationale:** N29 — `listTemplates`
  already supported the filters; the picker just never rendered them.
  **Affected figures:** 2.4. **Impact:** `RETROFIT` (reuses
  `TemplateFilters` unchanged).

## 2026-07-04 (session 5) — History-sheet fixes from N15 testing (N32)

Owner field-tested the session-4 drill-down; three amendments (Batch 9 →
N32).

- **Change:** the drill-down history sheet opens on **sets/reps** like every
  other history entry point — the session-4 "e1RM-first" opening is
  **reverted** (tap a row to flip to e1RM, standard PH32 behavior).
  **Rationale:** owner: "keep the standard history behavior".
  **Affected figures:** 3.2. **Impact:** `RETROFIT` (amends the session-4
  entry).
- **Change:** the history sheet's subtitle **exercise name is a link** to the
  exercise page (`/exercises/{id}`, ink underline), on every entry point (day
  view, picker, drill-down). `BottomSheet.subtitle` widened to a ReactNode.
  **Rationale:** owner: users should be able to reach the full exercise page
  from the History panel. **Affected figures:** 3.2. **Impact:** `RETROFIT` +
  `TOKENS` (shared BottomSheet prop).
- **Change (bug, behavioral):** sheets no longer fight the N6 pull-to-refresh
  — while any overlay holds the scroll lock, `PullToRefresh` never arms
  (the lock's `position:fixed` zeroes `window.scrollY`, so every drag on an
  open sheet read as a top-of-page pull: the page behind the scrim visibly
  shifted and a long drag fired a refresh mid-interaction; present on all
  sheets since N6). Sheet panels also gain `overscroll-contain` and isolate
  their touch events. **Affected figures:** all sheets. **Impact:** `TOKENS`
  (BottomSheet / PullToRefresh / useScrollLock primitives).

## 2026-07-04 (session 4) — Macro header adoption, history drill-down, set-row scale, origin-aware back links

Batch-7 build 3 (N24/N15/N26/N27, with the N28 sort fix riding along). No
mockup figures exist for the macro header or the drill-down rows; they adopt
the established P16 header grammar and the fig-3.2 history sheet (recorded per
rule 8).

- **Change:** the macrocycle page (2.2) header is rebuilt as a sticky
  `MacroHeader` on the day-view/meso/exercise header grammar: brand row
  (`‹ CYCLES` back link + `MACROCYCLE` context label), 27px title + `⋮` icon
  button, meta line (`GOAL <TYPE> · <SPAN> · <N> MONTHS`) + status badge
  (ACTIVE in accent — the meso header's CURRENT geometry; COMPLETE/ARCHIVED
  in muted ink), with the owner's goal-notes line beneath when present. The ⋮
  `AnchoredMenu` carries **Edit macrocycle** (the existing `/edit` route —
  goal, duration, notes, and blocks all edit there), replacing the full-width
  `EDIT MACROCYCLE` link that sat at the bottom of the OVERVIEW tab. No share
  button — macrocycles aren't shareable. **Rationale:** N24 — completes the
  header unification: day view, meso, exercise, and macro now share one
  sticky-header idiom. **Affected figures:** 2.2. **Impact:** `RETROFIT`
  (route skeleton updated to match).
- **Change:** day-view set rows (1.1) scale up ~10%: value cells 32→35px tall
  at 15px (was 14px) type, row padding 4→5px, and the LOG box 21→23px (its
  ✓ 12→13px; the R18 full-cell tap target grows with the cell to 44×35px).
  Column grid (`20px 1fr 1fr 44px`) and the header row are unchanged.
  **Rationale:** N26 — owner: "they're just slightly too small". Amends the
  09 §5 "denser rows" values. **Affected figures:** 1.1. **Impact:**
  `RETROFIT` + `TOKENS` (LogCheckbox is a shared primitive; pull-to-refresh
  reuses only its travelling-gap animation, not the box size — unaffected).
- **Change:** the day-view ⋮ → "Mesocycle stats" deep link now carries its
  origin (the N4 `?from=` pattern): the meso page's back link reads
  `‹ WORKOUT` and returns to the workout you came from instead of the
  hardcoded `‹ CYCLES`. Only a same-app `/log/<id>` path is honored.
  **Rationale:** N27 — "you should always back link where you came from".
  **Affected figures:** 2.3. **Impact:** `RETROFIT`.
- **Change:** Performance-tab trend rows drill into history: the macro tab's
  muscle-group **contributor rows** and the meso tab's **ALL EXERCISES rows**
  are now tappable (a `›` after the meta line marks it) and open the fig-3.2
  history sheet **scoped to that cycle's mesocycles** — subtitle reads
  `<EXERCISE> — THIS MACROCYCLE` / `THIS MESO` in place of the equipment tag —
  and **e1RM-first**: the sheet opens on the e1RM view (the number the trend
  is made of) and a row tap flips to sets/reps, the inverse of the PH32
  default for this entry point only. Scoped history pages exactly like the
  full sheet (N30's LOAD OLDER row). **Rationale:** N15 — "drill even further
  down in macro muscle groups all the way down to exercise history".
  **Affected figures:** 3.2 (new entry point; sheet layout unchanged).
  **Impact:** `RETROFIT`.

## 2026-07-04 (session 3) — Planner picker: replace-in-place mode (N31)

- **Change:** tapping a **filled** row on the planner board (2.5) now opens
  the exercise picker (2.7) in a *replace* mode instead of the group
  multi-select: title "Replace exercise", subtitle
  `SWAPS <NAME> — SAME SLOT & SETS`, single-select rows (radio behavior,
  seeded with the current movement), exercises already filling another slot
  of the same group disabled with an `ALREADY IN THIS GROUP` sub-label, and a
  full-width `REPLACE EXERCISE` submit (disabled until a different pick).
  The swap keeps the slot's day position, group slot, and starting sets.
  Open-slot rows keep the original multi-select ("ADD TO …") unchanged.
  **Rationale:** N31 — substitution via the multi-select appended the pick at
  the day's end, kept the original, and grew the slot count.
  **Affected figures:** 2.5 / 2.7. **Impact:** `RETROFIT` (shipped PR #143).

## 2026-07-04 (session 2) — Exercise surfaces: shared header, create-page rebuild, new-exercise tray, paged history

Batch-7 build 2 (N22/N23/N30). No mockup figures exist for these controls; the
header adopts the established P16 meso-header grammar and the trays mirror the
PH27 template tray (recorded per rule 8).

- **Change:** the exercise detail page (3.1a/b) header is rebuilt as a sticky
  `ExerciseHeader` on the day-view/meso header grammar: brand row (back link —
  still honoring the N4 `?from=` origin — + `LIBRARY` context label), 28px
  title + `[share][⋮]` icon cluster, meta line + `CUSTOM` badge. The ⋮
  `AnchoredMenu` carries **Load step** (the I13 sheet — now shown *disabled*
  with a `BODYWEIGHT` trailing tag on bodyweight-only lifts instead of
  vanishing, PH36 intent preserved), **Share exercise** and **Delete
  exercise** (owned custom only). The share row leaves the bottom of the
  OVERVIEW tab for a share sheet behind the header icon (meso-header
  pattern). Delete gets a confirm sheet that mirrors the MCP tool's guards —
  refused with reasons when logged sets or plan references exist (hard rule
  #5). **Rationale:** N22 — the increment felt absent behind a faint `⋯`;
  header unification (day view / meso / exercise share one idiom).
  **Affected figures:** 3.1a/3.1b. **Impact:** `RETROFIT`.
- **Change:** the create-exercise page (08 §4, described-not-mocked) is
  rebuilt as divided ledger sections (NAME / EQUIPMENT / MUSCLES / LOAD STEP /
  DETAILS): bodyweight equipment picks now explain their load semantics
  inline, and a **LOAD STEP** section (same preset-chip grammar as the
  Load-step sheet, `DEFAULT +n lb` chip first, CUSTOM entry) makes the
  per-exercise increment settable **at creation** — previously
  create-then-edit. Hidden for bodyweight-only equipment (inert there).
  **Rationale:** N22(b) — owner: increments must be available at creation.
  **Affected figures:** none (08 §4). **Impact:** `RETROFIT`.
- **Change:** the exercises page `+ NEW` control becomes a chooser tray
  (template-tray grammar): **Blank exercise** row → the create page, plus the
  `OR ADD FROM A CODE` redeem input. **Rationale:** N23 — a user handed an
  exercise share code looks under *new exercise*, not the meso/template trays
  (redeem stays kind-agnostic; any code routes right). **Affected figures:**
  3.1. **Impact:** `RETROFIT`.
- **Change:** exercise history (3.2 — HISTORY tab and the day-view history
  sheet) no longer truncates silently at ~120 sets: older sessions lazy-load
  via a quiet `LOAD OLDER` ledger row (auto-fires as it scrolls into view;
  tappable as the fallback; shows `LOADING OLDER…` / retry states) until the
  history is exhausted. **Rationale:** N30 — full history must be reachable;
  the silent cap hid the N14 outlier session. **Affected figures:** 3.2.
  **Impact:** `RETROFIT` + `DATA` (paged `getExerciseHistory`).

## 2026-07-04 — Batch-7 build 1: planner set stepper, create-time RIR disclosure, cycles-tray redeem, target cards hidden

No mockup figures exist for the three new controls; each reuses established
grammar (recorded per rule 8). The card removals retrofit existing screens.

- **Change:** each filled planner-board row gains a compact −/＋ `START SETS`
  stepper (group-slots stepper grammar at 28px row scale, `START SETS`
  micro-caption below) between the exercise text and ✕; the `· START n SETS`
  text leaves the sub-label. **Rationale:** N17 — the seed was plumbed but
  uneditable. **Affected figures:** 2.5. **Impact:** `RETROFIT` (shipped
  PR #140).
- **Change:** the finalize sheet's `RIR RAMP: x → y` caption is now a
  disclosure row (right-aligned `EDIT`/`DONE` underline affordance) expanding
  to the edit-details sheet's START RIR / END RIR segmented rows + the
  final-week-deload checkbox. Collapsed by default with standard values.
  **Rationale:** N18-A — a deep option without badgering. **Affected
  figures:** 2.8. **Impact:** `RETROFIT` (shipped PR #140).
- **Change:** the cycles `+ NEW` sheet appends the template tray's
  `OR ADD FROM A CODE` divider + redeem input below the macro/meso rows.
  **Rationale:** N20 — one receptacle per create surface; redeem is
  kind-agnostic. **Affected figures:** 2.1b. **Impact:** `RETROFIT` (shipped
  PR #140).
- **Change:** the macro overview's `REALISTIC TARGET` card and the
  create-macrocycle `YOUR TARGET` range/rate/rationale are hidden; the create
  form keeps the block-fit sentence + M1..Mn phase strip under a plain `PLAN`
  label (ink/55, not accent — rule 7). **Rationale:** N21 — the target engine
  needs correction before the numbers are shown again; hiding is a pure view
  change. **Affected figures:** 2.2, 2.3. **Impact:** `RETROFIT` (shipped
  PR #140); re-enabling later is view-only.

## 2026-07-03 (session 4) — I12 completes in-app: place-into-macro, edit details, block management, planner volume readout

Owner authorization (2026-07-03, in-chat): *"I will take your design direction
on these… You're authorized to rework in any way you see fit to produce a
well-designed and intuitive end result."* No mockup figures exist for these
four surfaces; each reuses established grammar and is recorded here as the
design of record.

- **Change (meso ⋮ menu → "Place into macrocycle").** On a **standalone
  planned** meso only. Opens a bottom sheet listing the user's macrocycles —
  name, goal + block count — each row stating exactly where the meso would
  land: `FILLS M2` (consumes the earliest open slot, inheriting its phase) or
  `ADDS AS M5` (appends). One tap places it and lands on the macro timeline.
  Explicit position choice stays MCP-only (`place_mesocycle`); the default
  placement is the overwhelmingly common case. Empty state links to the
  macrocycle engine.
- **Change (meso ⋮ menu → "Edit details").** Any non-frozen meso. A sheet in
  the finalize-sheet grammar (fig 2.8): NAME always; WEEKS (3–8 segmented
  row), START/END RIR rows (end clamped ≤ start), and a "final week is a
  deload" checkbox — the shape controls render **only while the meso hasn't
  started** (subtitle: `NAME ONLY — RAMP LOCKED ONCE STARTED` after). Closes
  on save; server guards unchanged (`updateMesocycleAttrs`).
- **Change (macro edit page → BLOCKS section).** Below the re-plan form: the
  full timeline as rows (`M{n}`, name, status), with ▲▼ on not-yet-started
  blocks (a move never crosses a started/completed row), ✕ on open slots
  only, and a dashed `+ ADD BLOCK` appending a placeholder at the macro's
  block length. Applies immediately (not staged with the form) — stated in
  the caption.
- **Change (planner board → WEEKLY SETS PER MUSCLE).** Between the day list
  and SAVE AS TEMPLATE: fractional weekly sets per muscle over the CURRENT
  board (updates live as sets/exercises change), each row showing the
  experience-scaled band (`MEV 10 · MRV 22`), with `UNDER MEV n` / `OVER MRV
  n` emphasized in ink when out of band (no accent — rule 7). Counting is
  the shared R14 fold — relocated to `lib/plan/volume-preview.ts` so the
  board, the Balance tab, and MCP `preview_mesocycle_volume` share one
  definition. A just-added exercise credits its group at the direct weight
  until its roles arrive with the revalidation.
- **Affected figures.** 2.2-adjacent (macro edit), 2.5 (planner board), the
  meso page header menu. All `RETROFIT`, shipped with this entry's build.

## 2026-07-03 (session 3) — Meso header menu: Duplicate; START gate surfaces proactively (I12)

- **Change (meso ⋮ menu).** The mesocycle header's ⋮ menu (P16 grammar) gains a
  **"Duplicate mesocycle"** row between "Edit plan/weeks" and "Save as template":
  one tap copies the meso's settings + planner board (loads are never copied — the
  engine reseeds on activation) into a fresh standalone `planned` meso and lands on
  its page. Failure returns with an inline accent error line (same pattern as the
  template error).
- **Change (START MESOCYCLE).** On a planned meso whose activation is gated —
  another block is live, or earlier-positioned siblings in its macrocycle aren't
  finished — the START button now renders **disabled with the reason as a muted
  (`ink/55`) line beneath it**, instead of looking tappable and failing with a
  reactive error. The server-side gate is unchanged; the reactive accent error
  remains for races.
- **Rationale.** I12: the MCP authoring surface got duplicate + gated activation in
  PR #92; the in-app surface offered neither, and a dead-looking failure on tap
  violates the "acknowledge every input" bar (N1).
- **Affected figures.** → 2.2/2.5-adjacent (meso page header menu, START button
  state). No mockup figure exists for either control; both reuse the established
  menu-row / disabled-button grammar (`LOCKED` precedent) — recorded as a rule-8
  deviation in PROGRESS.
- **Impact.** `RETROFIT` — shipped with the same entry's build (PR #134).

## 2026-07-03 (session 2) — Performance-tab reorg: macro drill-down (N9) + meso trim (N10)

Owner decisions (verbatim in `docs/notes/backlog.md` appendix Batch 5). Amends
the Performance tabs introduced in the 2026-07-02 session-6 entry (M8/I11/PH37
— still no mockups for these surfaces; the rule-8 deviation carries over).

- **Change (macro Performance tab):** the **muscle-group strength gain is the
  primary statistic** — full-width rows (group name + role-weighted % gain),
  each **expandable** (▸/▾ disclosure) to the exercises that rolled into that
  number (name, first→last e1RM, session count, % score, `SECONDARY` marker on
  0.5-credit links). The **flat "ALL EXERCISES" list is dropped at macro
  scope** — across a whole macro it grows too long to read; per-exercise detail
  now lives inside its group. An exercise linked to several groups appears
  under each (fractional credit is expected, footnoted on the section).
- **Change (meso Performance tab):** the **"TOP SET BY WEEK — KEY LIFTS" grid
  and the "ACROSS MACRO — {lift} EST. 1RM" chart are removed** (macro-scope
  content on a meso view). The tab is now: est-strength trend (all exercises +
  muscle rollup, unchanged) + PRS THIS MESO.
- **Rationale:** muscle groups are the honest unit across a macro's many months
  and exercise swaps; single-exercise macro charts belong to macro-scope
  surfaces, not the meso tab.
- **Affected figures:** 4.3 (meso Performance) and the (mockup-less) macro
  stats Performance panel.
- **Impact:** `RETROFIT` — shipped in the same PR (`MesoStatsViews.tsx`
  `PerformanceView` trim; new `MuscleStrengthSection.tsx` on
  `cycles/macro/[macroId]/page.tsx`; rollup carries `contributors[]` in
  `queries/stats.ts`).

## 2026-07-03 — Planned-meso badge + future-meso muting (N8)

Owner decision (verbatim in `docs/notes/backlog.md` appendix Batch 5 + the
same-day addendum). The v2 mockup predates this — its fig 2.1 planned rows
still show the empty checkbox; this entry supersedes that detail.

- **Change (cycles list, fig 2.1):** planned mesocycles no longer render the
  empty checkbox — they get a **"PLANNED" text badge** in CURRENT's exact
  geometry (1.5px border, 8.5px/700/0.12em caps, 3px 7px padding) in **ink**
  rather than accent (the owner's "white": ink renders cream-white under the
  dark ledger inversion). The checkbox vocabulary is reserved for completion
  (✓ filled box). Row muting widens from unplanned-only to **every future
  meso**: planned + unplanned names at ink/50, sublines at ink/45 — only
  current/completed render full ink. Applies to macro-grouped and standalone
  rows alike.
- **Change (macro overview timeline, fig 2.2):** the numbered `TimelineMark`
  vocabulary stays, but **planned rows swap the right-side progress bar for
  the same PLANNED badge** (a zero-progress bar on a not-yet-started block
  carried no information); the same muting scheme applies (planned titles
  ink/50, sublines ink/45; unplanned rows keep `+ PLAN` and their existing
  muting; completed/active keep their bars).
- **Rationale:** an empty checkbox reads "incomplete task", not "scheduled
  block" — the badge names the state; muting keeps the current position the
  loudest element on the ledger (08 §1: orange marks current position only).
- **Affected figures:** 2.1, 2.2.
- **Impact:** `RETROFIT` — shipped in the same PR (`cycles/page.tsx`
  `StatusMark` + row muting; `cycles/macro/[macroId]/page.tsx` timeline).

## 2026-07-02 (session 6) — Meso page rework (P16) + macro stats tabs (M8) + strength trends (I11/PH37)

Owner-decided rework of the cycle surfaces (decisions verbatim in
`docs/notes/backlog.md` appendix Batch 4). No mockups exist for these — the
owner explicitly approved designing them from the existing patterns (recorded
rule-8 deviation); fidelity anchors are the day-view header (1.1), the planner
board (2.5), and the meso stats views (4.1/4.2).

### 1. Meso page = header + `OVERVIEW | BALANCE | PERFORMANCE` toggle — `RETROFIT`, `NET-NEW`
- **Change.** The meso detail page's button stack (EDIT / GO TO / MESO STATS /
  SAVE AS TEMPLATE / SHARE / DELETE) is replaced by:
  - a **day-view-style sticky header** (back link + macro context; title;
    meta + status badge; orange **completion progress bar** over the planned
    week×day grid) carrying three header actions — a **calendar button** that
    drops down the week × day matrix (the old page-body RIR ramp matrix; days
    clickable → day view when materialized, read-only planned view otherwise),
    a **share button** (opens the share-code sheet), and a **⋮ menu** holding
    *Edit plan/weeks* (locked once history exists, as before), *Save as
    template*, and *Delete mesocycle*;
  - a top-level **`OVERVIEW | BALANCE | PERFORMANCE`** segmented toggle.
    **OVERVIEW** renders the planner board **read-only** (day tabs + the flat
    ordered exercise list; editing goes through the ⋮ menu → planner board);
    GO TO / START stays its primary action. **BALANCE / PERFORMANCE** are the
    meso stats views, absorbed from the standalone screen.
- **Tab naming.** The owner's P16 wording said "volume" for the middle tab;
  his M8 wording said "balance" for the same view at macro scope. Reconciled
  to **BALANCE** on both surfaces — this file's 2026-06-14 §4 already retired
  "Volume" as a tab name for exactly this content, and M8's whole point is
  meso/macro naming unification.
- **Affected figures.** 2.2-old territory (meso detail), 4.1/4.2 (now panels
  of the meso page; `/cycles/meso/[id]/stats` redirects into the toggle).
- **Impact.** `RETROFIT` + `NET-NEW`. The "MESO STATS" button and screen are
  gone; deep links redirect.

### 2. Macro page gains the same three-way toggle (M8) — `NET-NEW`
- **Change.** Macrocycle Overview (2.2) gets `OVERVIEW | BALANCE |
  PERFORMANCE`. OVERVIEW keeps the existing content (realistic target,
  timeline, stat tiles, edit). **BALANCE** = the 4.1 balance view at macro
  scope (fractional sets averaged over materialized weeks across the macro's
  mesos; unbuilt future weeks excluded — no cross-meso projection).
  **PERFORMANCE** = the strength-trend sections below.
- **Impact.** `NET-NEW`; macro stats stay on the macro page per the
  2026-06-13 §6 "contextual stats, no tab" rule.

### 3. Est-strength trends: per-exercise list + muscle rollup (I11/PH37) — `NET-NEW`, `DATA`
- **Change.** Both Performance tabs gain **EST. STRENGTH — ALL EXERCISES**
  (every exercise **logged ≥3 non-deload sessions** in the window — owner's
  rule, excludes subbed-in lifts; first → last engine e1RM with the signed
  %-change) and **STRENGTH BY MUSCLE GROUP** (role-weighted mean of those
  %-changes — primary 1.0 / secondary 0.5 via `engine_params.volume`, the doc
  10 §2 counting weights). Deloads excluded per T-A2; values undecayed per
  T-A1. Same numbers surface on MCP `get_mesocycle_summary` /
  `get_macrocycle_summary`.
- **Impact.** `NET-NEW`, `DATA` (shared query folds; no schema change).

### 4. Day view loses its back button (P17) + deep-link return (N4) — `RETROFIT`
- **Change.** `/log/[workoutId]` no longer renders `‹ WORKOUT` — the day
  navigator lives inside the Workout tab, so selecting a day isn't a page
  change (owner, option 2). "View exercise" from the day view now carries its
  origin: the exercise page's back control returns to that day view
  (`‹ WORKOUT`), not the exercises list.
- **Affected figures.** 1.1, 3.1a.

## 2026-06-15 (session 5) — Logging-flow review on device (product)

First hands-on review of the deployed logging flow. Several interaction fixes plus two net-new
features. The interaction fixes (1–7) shipped in the same session; the two larger features
(notes model, workout/meso options menu) are specced here and below for dedicated next slices.

### 1. Day View navigator — stays open across day selection — `RETROFIT`
- **Change.** Selecting a day from the expanded navigator must **not** auto-close it; it stays
  open until the user closes it (chevron). Supersedes the 2026-06-13 note that the navigator
  "defaults closed on each entry."
- **Rationale.** Selecting consecutive days is common; collapsing on every pick is hostile.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: open state persisted in `sessionStorage` so it
  survives the day-chip navigation.)*

### 2. Set rows — capture the denser sizing — `RETROFIT`
- **Change.** The logging set rows were still at the **old** dimensions; rebuild to the denser
  spec (2026-06-13 §5: box 32px, value 14px, log box 21px, padding 4px, columns 20/44).
- **Affected figures.** 1.1/1.2/1.3.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15.)*

### 3. Sets are uncheckable — `RETROFIT`
- **Change.** Tapping a logged set's ✓ **un-marks** it (re-opens the slot for re-entry). Allowed
  only on an active (in_progress) workout; completed workouts are locked.
- **Rationale.** Mis-taps and corrections need a one-tap undo, not a menu detour.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT`, `DATA` (delete-the-logged-row while in_progress; keep the prescription).
  *(Shipped 2026-06-15: `unlogSet`.)*

### 4. Row menus must flip to stay on-screen — `RETROFIT`
- **Change.** When a row's `⋮` menu would overflow the bottom of the screen, it opens **above**
  the button instead of below; below when there's room.
- **Affected figures.** 1.2/1.3.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: `AnchoredMenu` — viewport-fixed, measures and flips.)*

### 5. Skip set = grey, don't remove; reversible — `RETROFIT`, `DATA`
- **Change.** "Skip set" **greys the set in place** and makes it non-interactable (it is **not**
  removed). It is reversible via the same menu ("Unskip set"). Distinct from "Delete set", which
  drops a planned slot.
- **Affected figures.** 1.3.
- **Impact.** `RETROFIT`, `DATA`. *(Shipped 2026-06-15: per-set skip stored as
  `workout_exercises.skipped_set_numbers int[]`, migration `20260615000003`; reversible while
  in_progress.)*

### 6. Skip remaining sets = per-set, not whole-exercise — `RETROFIT`
- **Change.** "Skip remaining sets" greys **only the uncompleted sets** of the exercise; logged
  sets and the exercise itself stay displayed and interactive, and the exercise's own menu is
  unaffected (the prior bug greyed/!backgrounded the whole exercise and its reopened menu).
  Reversible per set.
- **Affected figures.** 1.2.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15: uses the same per-set skip mechanism; the
  exercise no longer flips to `status = skipped` during an active workout.)*

### 7. Complete-workout gating — `RETROFIT`
- **Change.** The "Complete workout" button appears **only when every set is logged or skipped**
  (not merely "after any set is logged").
- **Affected figures.** 1.1/1.5.
- **Impact.** `RETROFIT`. *(Shipped 2026-06-15.)*

### 8. Notes model — pinned note vs session log note — `NET-NEW`, `DATA` *(next slice)*
- **Change.** Two distinct kinds of exercise note:
  - **Pinned note** — an **attribute of the exercise record**, shown on that exercise in *every*
    workout until edited/unpinned. Editable from the Day View (an **edit (pencil) icon** on the
    pinned-note bar) or the Exercise page. Pinning is **optional**.
  - **Session log note** — a note **saved with that workout's exercise log** (per-session). Shown
    in exercise history (quick-view and the Exercise page) as a small **note icon** on the row;
    tapping the row reveals the note. **Editable only in the live, active workout** — never from
    history or after the workout completes.
- **Rationale.** Today there is only one notion (the pinned note via "New/Replace note"), so a
  per-session observation has nowhere to live and the pinned note's cross-workout semantics are
  implicit.
- **Affected figures.** 1.1, 1.2, 3.1a/3.2.
- **Impact.** `NET-NEW`, `DATA`. Pinned note already exists (`exercise_notes`, `is_pinned`); add
  a **per-(workout_exercise) session note** (likely `workout_exercises.log_note` or reuse
  `exercise_feedback.notes`), a note-icon affordance on history rows, and a pinned-note inline
  **edit icon**. Editing gated to the active workout (RLS like the completion lock). See
  [03-data-model.md](03-data-model.md).

### 9. Workout / mesocycle options menu — `NET-NEW`, `DATA` *(next slice)*
- **Change.** A new overflow (`⋮`) control on the Day View header, placed **to the right of the
  date / Target-RIR column** and sized vertically to match the height of those two rows. It opens
  a menu with two clearly separated groups:
  - **Mesocycle** — Mesocycle notes · Edit mesocycle (→ planner board) · Mesocycle stats
    (→ stats) · **End mesocycle** (skips all remaining sets on all remaining days and completes
    the mesocycle — **strong destructive warning** describing exactly what it does).
  - **Workout** — New/Edit workout note · Edit day (→ planner board, current day selected) · Add
    exercise · **End workout** (skips all remaining sets and completes the workout — warn it can't
    be undone).
- **Rationale.** There was no entry point for whole-workout / whole-meso actions from the logging
  screen; several were unreachable (end early, jump to edit, add an exercise mid-session).
- **Affected figures.** 1.1 (new control), → 2.5 (planner board), 4.1/4.2 (stats).
- **Impact.** `NET-NEW`, `DATA`. New header control + grouped menu. Navigation items reuse
  existing routes. **End workout** = skip-remaining-all + complete (the existing completion +
  per-set-skip paths). **End mesocycle** = skip/complete every remaining workout of the meso, then
  mark the meso complete — needs a new audited query + a confirm step. **Add exercise** opens the
  group-aware picker against the live workout. Mesocycle/workout notes depend on the §8 notes model.

### Round-2 refinements (same-day, all `RETROFIT`, shipped)
- **Navigator animation** only plays on an explicit chevron toggle — hydrating the open state on a
  day-chip navigation snaps (no re-run of the reveal). Refines §1.
- **Active-day dot** always shows on the resume week/day, even when it is the selected/viewed chip,
  so the live day is always findable. Refines §1/1.1.
- **Bottom-sheet motion:** all bottom sheets slide up on open / down on close (~280ms, scrim fade)
  via a shared `useSheetTransition`; applies to the per-exercise feedback sheet (1.4) and the
  Workout Complete sheet (1.5).
- **Unskip all:** the exercise menu (1.2) offers "Unskip all sets" when any set is skipped
  (alongside per-set unskip). Refines §6.

## 2026-06-14 (session 4) — Metrics lock-down (engineering/product) + Workout Complete redesign

Session scope: a research pass defining every displayed metric and engine parameter
([10-metrics-spec.md](../10-metrics-spec.md), the new authoritative metric/params doc), plus one
design correction to the Workout Complete sheet. Driven by engineering/product, not a designer
mockup pass — so the mockup is amended here.

### 1. Workout Complete (1.5) — session feedback sliders restored — `RETROFIT`
- **Change.** The session feedback sliders (overall **fatigue / effort / performance**, 0–4) are
  **re-added** to the complete sheet, using the same slider UI as the per-exercise prompt (1.4),
  alongside the paragraph notes and `NEXT WORKOUT →`. The sheet now reads: counts + the three
  session sliders + notes + next. The **autoregulation panel stays removed** (08 §3 / 2026-06-13 §2
  unchanged on that point).
- **Rationale.** The sliders were dropped from the mockup inadvertently; the engine uses
  session-level fatigue/performance as a dampener on that session's progression (10 §3). This
  supersedes the "counts + notes only" wording of the 2026-06-13 §2 entry for the slider question.
- **Affected figures.** 1.5.
- **Impact.** `RETROFIT`, `DATA`. Keep `workout_feedback` (overall_fatigue/effort/performance);
  build the redesigned sheet; wire the session dampener.

### 2. Metric & engine-parameter definitions locked — `NET-NEW` (doc), `DATA`/`ENGINE`
- **Change.** New [10-metrics-spec.md](../10-metrics-spec.md) gives research-backed definitions and
  default `engine_params` for: e1RM (effective-reps + Epley/Brzycki avg + confidence weighting),
  **fractional volume counting (1.0/0.5)**, MEV/MAV/MRV landmarks, the workload/pump/joint-pain
  set-count autoregulation, RIR ramp, increments/regression, deload, the **profile-personalized
  macrocycle target + recommended timeframe**, **key lifts = most-logged (by frequency)**, and
  stats rollups. Includes honesty guardrails (don't overclaim e1RM, targets are estimates, pump/
  soreness secondary, push:pull advisory-only, deloads = fatigue management).
- **Rationale.** Replace the mockups' illustrative numbers with grounded, citable definitions so the
  engine helps real progress rather than showing pretty-but-unfounded figures.
- **Affected figures.** 2.2, 2.3, 3.1a/b, 4.1, 4.2 (read-outs); 1.4 (signals).
- **Impact.** `DATA`/`ENGINE` — implement per 10; no UI layout change beyond softening the Balance
  Check copy (push:pull is advisory, not an injury/posture claim).

## 2026-06-14 (session 3) — Interactive prototype build; library, macrocycle & meso-stats refinements

Session scope: stood up a **fully interactive, reload-persistent prototype** of the whole
five-tab shell in both the paper and dark themes, then made a series of design refinements
against it — all reconciled back into the mockup `workout - App Screens v2.dc.html`, which
remains the source of truth. Deliverables: `workout - Interactive Prototype.dc.html` (the
side-by-side device board) and `WorkoutApp.dc.html` (the app component, mounted twice by theme).

> Source-of-truth note (applies going forward): **the mockup board
> `workout - App Screens v2.dc.html` is authoritative for all UI**, not the prototype. When the
> two diverge, the mockup wins; prototype is brought back in line. Recorded in `CLAUDE.md`.

### 1. Exercise library (3.1) — equipment-type filter added
- **Change.** The single `FILTERS` row (one muscle-group chip) is replaced by **two labeled
  filter rows**: `MUSCLE` (All / Glutes / Quads / …) and `EQUIP` (All / Barbell / Dumbbell /
  Machine / Cable). The two combine (AND); each active chip carries an `✕` to clear it; a live
  `n OF 16 EXERCISES` count and a `CLEAR ALL` action appear whenever any filter is active.
- **Rationale.** Users browse by equipment as often as by muscle (what's free in the gym,
  injury work-arounds); muscle-only filtering was insufficient.
- **Affected figures.** 3.1.
- **Impact.** `RETROFIT` — Exercises list gains a second filter axis (`equipment`) and the
  count/clear affordance. `DATA` — exercise records already carry `equipment`; ensure it is
  queryable/indexed for filtering.

### 2. Exercise menu (1.2) — "History" → "View exercise"
- **Change.** The day-view exercise overflow (`⋯`) menu item **"History ›"** is renamed
  **"View exercise ›"** and now opens the full Exercise page (Overview / History tabs, 3.1a–b)
  rather than jumping straight to history.
- **Rationale.** Per-exercise history already has a dedicated control in the Day View, so a
  second history shortcut here was redundant; "View exercise" exposes the whole page (bests,
  est-1RM trend, lifetime totals, and history) in one move.
- **Affected figures.** 1.2 → 3.1a/3.1b.
- **Impact.** `RETROFIT` — relabel the menu row and repoint its action to the Exercise page
  (default to Overview tab).

### 3. Macrocycle Overview (2.2) — progress tracking removed; per-month target rate added
- **Change (a).** The **"Progress · Lean Mass" block** (the +4.3 lb / on-track bar with the
  Jan→Aug body-weight axis) is **deleted**. The Overview now flows: header → Realistic Target →
  Mesocycle Timeline → Macrocycle Stats.
- **Change (b).** The **Realistic Target** card gains a **per-month rate** line under the total
  range, in orange — e.g. `≈ +1.1–1.6 lb / month` (Strength `≈ +1–2% / month`, Cut
  `≈ −2.2–3.4 lb / month`, etc.). The same rate is shown in the Create-Macrocycle engine card
  (2.3) and recomputes live with goal/duration.
- **Rationale.** The app does not (and won't, in scope) track body weight or other external
  progress inputs, so a body-weight progress bar implied data we never collect. The target
  **range remains as the planning framework**; expressing it as a monthly rate gives the user a
  more manageable cadence to gauge against. Actual tracking stays limited to the workout data
  the app collects directly (kept in **Macrocycle Stats**: est. strength, total volume,
  sessions, adherence).
- **Affected figures.** 2.2, 2.3.
- **Impact.** `RETROFIT` — remove the progress-vs-projection element from the Overview; add the
  per-month rate to both the Overview target card and the Create engine output. `DATA` — drop
  any body-weight/lean-mass progress query for this surface; per-month rate is derived from the
  target range ÷ duration (no new data).
- **Consistency fix.** Profile bodyweight reconciled to **198 LB** across Overview chips, More
  (4.4), and Profile (4.5).

### 4. Meso Stats (4.x) — Volume tab removed
- **Change.** The **Volume** tab (former 4.1, the weekly sets-per-group table) is **deleted**.
  Meso Stats now has **two tabs — Balance · Performance** — and opens on **Balance**. Figures
  renumbered: **Balance → 4.1, Performance → 4.2**.
- **Rationale.** The Volume table largely duplicated the Balance view's **"Avg sets / week —
  planned"** bars but was less useful; Balance leads with the planned-volume bars (the actual
  planning view) plus the push/pull/legs split and balance check.
- **Affected figures.** 4.1 (removed), 4.2→4.1, 4.3→4.2.
- **Impact.** `RETROFIT` — Meso Stats drops the Volume tab and defaults to Balance; ensure deep
  links / STATS toggle (2.5) open Balance.

### 5. Interactive prototype (net-new artifact)
- **Change.** New deliverables `workout - Interactive Prototype.dc.html` and `WorkoutApp.dc.html`:
  a working build of the five-tab shell (Workout · Cycles · Templates · Exercises · More) with a
  live logging flow (step weight/reps, log sets, progress bar, feedback bottom sheet, complete
  sheet, advance), navigable Cycles (list → overview → meso stats; create-macrocycle engine;
  create-mesocycle modal), exercise & template detail pages, and More/Profile. State **persists
  across reloads** (per-device localStorage). Presented in two themes side by side: the **paper
  ledger** (primary) and a **muted dark** cousin (restrained terracotta accent, soft radii).
- **Rationale.** A clickable single-flow prototype to evaluate the restructured app end-to-end
  (was listed as a "round 5 candidate" in the mockup notes).
- **Affected figures.** All.
- **Impact.** `NO-CODE` — prototype/spec artifact for evaluation and engineering reference; not
  a production target itself. The dark theme is exploratory (06 omits dark mode for now).

#### 5a. Dark-theme palette (as shipped in the prototype) — `TOKENS`
The prototype's dark theme is a **muted, restrained cousin of the paper ledger**, not 06's
original signal-orange dark mode. It intentionally **pulls the accent back** from 06's
`#F25C05` to a desaturated terracotta so the dark theme reads like a dimmed version of the
light theme rather than a louder one. Recorded here because it supersedes 06's initial dark
values for this direction.

| Role | Token (prototype) | Value | Notes vs 06 |
|---|---|---|---|
| App background | `bg` | `#0B0B0C` | same as 06 `--bg-base` |
| Surface | `surface` | `#141416` | same as 06 `--bg-surface` |
| Raised / input | `raised` / `field` | `#1C1C1F` | same as 06 `--bg-raised` |
| Hairline | `line` | `#26262A` | same as 06 `--border-subtle` |
| Hairline (soft) | `lineSoft` | `rgba(154,154,160,0.16)` | — |
| Heavy line | `heavy` | `#34343A` | — |
| Text primary | `ink` | `#F2F2F0` | same as 06 `--text-primary` |
| Text secondary | `soft` | `#9A9AA0` | same as 06 `--text-secondary` |
| Text tertiary | `softer` | `rgba(154,154,160,0.65)` | — |
| Text faint | `faint` | `rgba(154,154,160,0.32)` | — |
| **Accent** | `accent` | **`#C8593B`** | **muted terracotta — replaces 06 `#F25C05`** |
| Accent (dim fill) | `accentDim` | `rgba(200,89,59,0.18)` | low-opacity accent wash |
| On-accent | `onAccent` | `#0B0B0C` | text/icon on accent |
| Positive | `positive` | `#5E9B79` | softer than 06 `#4CAF7D` |
| Warning | `warning` | `#C7A050` | softer than 06 `#E0B23C` |
| Selected fill / ink | `selFill` / `selInk` | `#F2F2F0` / `#0B0B0C` | inverted chip/tab selection |
| Pop shadow | `pop` | `0 16px 40px rgba(0,0,0,0.6)` | menus/sheets |

Shape in dark: **soft radii** (`rCard` 6px, `rInput` 4px) vs the paper theme's hard 0px edges;
1px borders. Accent discipline from 06 still holds — current/selected markers, the day-view
progress bar, the slider thumb; **never** large filled backgrounds. Primary CTAs are **ink**
(`selFill`), not accent. Paper theme (primary) for reference: `bg #F4F0E6`, `ink #17140F`,
`accent #C14B2A`, `field #FCFAF4`, hard edges (0px radius), 1.5px borders.

---

## 2026-06-13 (session 2) — Workout Complete cleanup, Day View progress bar, Cycles → macrocycle restructure, stats model

Session scope: simplification of the Workout Complete sheet (1.5); a lock + progress-bar pass
on the Day View header (1.1); and a substantial restructure of the **Cycles** area — the
"macros" → "macrocycles" rebrand, retirement of "slots", a new macrocycle creation engine and
overview, a unified meso view/edit surface, and a contextual stats model. All changes live in
`workout - App Screens v2.dc.html`. **Section 02 figures were renumbered — see item 5.**

> Terminology note (applies app-wide): **"macro" / "macrocycle slot" → "macrocycle"**, and
> **"slot" → "mesocycle"**. "Macros" was dropped to avoid collision with macronutrients. Any
> existing copy, labels, or identifiers using "macro"/"slot" should be migrated.

### 1. Day View (1.1) — progress bar, RIR relocation, locked header
- **Change.** Three header changes, superseding parts of the earlier 2026-06-13 entry
  (items 2–3): (a) the `SCHEDULED · n SETS` / `3 OF 14 SETS LOGGED` text line is **replaced by
  an orange progress bar overlaying the marked divider** under the big `W2·D1` coordinate; the
  bar fills to `completed ÷ total` sets (0% planned, ~21% for 3/14, 100% complete). (b) The
  **Target RIR** label moves out of the expanded navigator card to the coordinate area (right
  of `W2·D1`, where the sets line used to sit). (c) The **`MESO 2 / 4` label is removed
  entirely** from the navigator card — the expanded card now contains only the week selector +
  day chips. (d) The header (logotype row, navigator, `W2·D1` + RIR + progress bar) is
  **pinned/locked at the top**; the exercise/set list scrolls in a container beneath it.
- **Rationale.** Encode completion visually instead of as a redundant text line; keep the most
  useful context (RIR) adjacent to the coordinate; declutter the navigator; keep the day
  identity fixed while logging.
- **Affected figures.** 1.1.
- **Impact.** `RETROFIT` against the Day View header spec in the prior same-day entry (not yet
  built, so really `NET-NEW` against code), `DATA`. Progress bar needs the live
  `setsLogged ÷ setsPlanned` for the viewed day. Build the header as a sticky region.

### 2. Workout Complete (1.5) — remove autoregulation panel, simplify CTA
- **Change.** Removed the boxed `AUTOREGULATION` summary panel and the `View meso stats`
  link from the completion sheet. The primary button changes from
  `NEXT — W2·D2 · WED 14 JUN` to a simple **`NEXT WORKOUT →`**.
- **Rationale.** The autoregulation recalculation still happens silently in the background — it
  doesn't need a panel shouting it on completion. Stats don't belong on the workout flow. The
  next-workout button was over-labeled.
- **Affected figures.** 1.5.
- **Impact.** `NET-NEW`. Completion sheet shows: counts (exercises / sets / skipped) + notes
  field + `NEXT WORKOUT →`. No autoregulation panel, no stats link.

### 3. Macrocycles are the goal layer — new entity, overview, and creation engine
- **Change.** A **macrocycle** now carries a single long-term **goal** (`Hypertrophy ·
  Strength · Cut · Maintain`) and organizes several mesocycles toward it.
  - **2.2 Macrocycle Overview** (NEW; replaces the retired meso-detail/RIR-ramp page).
    Tapping a macrocycle's **name** opens it. Contents: goal + date span; a **Realistic
    Target** panel (e.g. `+8–11 lb lean mass`) derived from the user's profile (training age,
    bodyweight, experience level); a **progress-vs-projection** bar (actual vs target band);
    the **mesocycle timeline** (each meso with suggested phase + status); and rolled-up
    **macrocycle stats** (est. strength, total volume, sessions, adherence).
  - **2.3 Create Macrocycle** (NEW; the "engine"). Inputs: name; goal; **duration**
    (`3 / 6 / 12 mo` + custom); **mesocycle length preference** (`4 / 5 / 6 wk`, incl. deload).
    From these + profile it computes the **number of evenly-spaced mesocycles** that fit and
    proposes **suggested phases** (Accumulate → Intensify → Peak), plus a realistic target.
    Mesocycles are created **unplanned** and the user plans each as they reach it.
- **Rationale.** Gives the endless succession of mesocycles a shared, science-grounded
  direction and a concrete long-term goal the user can track against.
- **Affected figures.** 2.2 (new), 2.3 (new).
- **Impact.** `NET-NEW`, `DATA`. Requires a macrocycle entity (goal, duration, computed
  target, ordered meso phases/placeholders) and a target/meso-count calculation from goal +
  duration + meso length + profile. Stats rollups aggregate across the macro's mesos. Check
  [03-data-model.md](03-data-model.md) for macrocycle goal, phase, and target fields.

### 4. Cycles list (2.1) restructure + "+ NEW" chooser (2.1b)
- **Change.** Macrocycle rows show **`GOAL <goal> · N MESOCYCLES`** (neutral ink — no orange
  budget) and an **`OVERVIEW ›`** link; the **name** taps through to the Overview, the
  **chevron** expands/collapses the mesocycle list (active macro auto-expanded). Removed the
  per-row `● ON MESO n` / `● AT W2·D1` orange status tags — the `CURRENT` badge on the active
  meso row is sufficient. Mesocycle rows drop all "slot" language (`SLOT 2 — BULK` →
  `MESO 2 · INTENSIFICATION`); unplanned mesos read `Mesocycle n` + `SUGGESTED <phase> ·
  NOT PLANNED` with a `+ PLAN` action. **`+ NEW`** opens a **chooser sheet (2.1b)** with two
  paths: **Macrocycle** or **Standalone mesocycle** (not tied to a macro). Mesocycles *inside*
  a macrocycle are created from that macro's **`+ PLAN`** rows, not from `+ NEW`.
- **Rationale.** Clear hierarchy and navigation; minimal orange; one creation entry that
  disambiguates the two "from scratch" paths while keeping in-macro planning contextual.
- **Affected figures.** 2.1, 2.1b (new).
- **Impact.** `NET-NEW`, `DATA`. List needs macrocycle→meso grouping with each meso's phase +
  status; standalone mesos remain supported (no macro FK). `+ PLAN` creates a meso attached to
  the macro at that position.

### 5. Planner board (2.5) = unified mesocycle view/edit surface; figures renumbered
- **Change.** The old meso-detail page (2.2) is **removed**; tapping a **mesocycle** opens the
  **planner board** as the single view/edit surface. It gains a **`PLAN | STATS` toggle** at
  the top (STATS routes to the meso stats screens, see item 6) and a **partial-completion
  lock**: completed + in-progress weeks are **read-only**, edits apply to upcoming weeks only
  (banner: "W1 logged · W2 in progress. Past & active weeks are locked — edits apply to W3
  onward."). The macrocycle context strip is rebranded (`MACROCYCLE 26-1 · MESO 2 OF 4 ·
  INTENSIFICATION`, no slot). Primary button is `SAVE CHANGES` when editing an existing meso.
  **Renumbering of Section 02:** 2.2 Macrocycle Overview (new), 2.3 Create Macrocycle (new),
  2.4 Plan a mesocycle (was 2.3), **2.5 Planner board** (was 2.4), 2.6 Day setup (was 2.5),
  2.7 Exercise picker (was 2.6), 2.8 Create mesocycle (was 2.7). The 2.8 create-mesocycle
  modal's placement block is rebranded `MACROCYCLE PLACEMENT` with meso positions `M1…M4`
  (`MESO 3 OF 4 · INTENSIFICATION`) replacing the old `SLOT 3 OF 4 — GOAL: BULK`.
- **Rationale.** The week-matrix detail page had no job the planner board can't do; unifying
  view/edit removes a screen and gives one clear place to manage a meso. Locking logged weeks
  protects history while still allowing forward edits.
- **Affected figures.** 2.5 (was 2.4); removes old 2.2; 2.4/2.6/2.7/2.8 renumbered.
- **Impact.** `NET-NEW`, `DATA`. Planner board must load an existing meso (any state),
  enforce read-only on completed/active weeks, and apply edits forward only. Needs per-week
  completion state.

### 6. Stats model — contextual, no new bottom-tab
- **Change.** Decided: **no dedicated stats tab** (Exercises/Templates tabs preserved).
  **Macrocycle stats** live on the Macrocycle Overview (2.2). **Mesocycle stats** (4.1–4.3:
  Volume / Balance / Performance) are reached via the **`STATS` toggle on the planner board
  (2.5)**; their back-nav changed `‹ MESO` → `‹ PLAN`. The Section 04 intro and the
  next-steps note were repointed accordingly; `ACROSS MACRO 26-1` → `ACROSS MACROCYCLE 26-1`.
- **Rationale.** Keeps stats one tap from the cycle they describe and keeps the Workout tab
  focused on the session, without spending a bottom-tab slot.
- **Affected figures.** 2.2, 2.5, 4.1–4.3.
- **Impact.** `NET-NEW`. Wire the planner board `STATS` toggle to the meso stats views; macro
  stats render on the Overview. No stats entry from the Workout tab.

### Verified (mockup)
All new/changed screens render with no console errors; Day View header locks with the orange
progress bar; `MESO 2/4` removed from the navigator; Cycles rows, `+ NEW` chooser, Macrocycle
Overview, Create Macrocycle engine, and the planner board `PLAN | STATS` toggle + lock banner
all display as specified. Title widths measured in-DOM (Archivo loaded) — no real wrapping;
apparent wraps in capture tooling are font-fallback artifacts only.

## 2026-06-13 — Day View (1.1) header rework + denser set rows

Session scope: the logging Day View header and set-row density. All changes live in
`workout - App Screens v2.dc.html`, figure 1.1.

### 1. Collapsible week/day navigator (was: always-on meso track)
- **Change.** The week/meso context block is **collapsed by default**. The header at rest
  shows only: the `workout` logotype + a chevron, the cycle label (`GARRON JUN '26 — BULK`)
  top-right, and the big `W2·D1` coordinate with its date / `3 OF 14 SETS LOGGED` line.
  Tapping the chevron (or the logotype row) expands a navigator panel with a quick
  reveal animation (~300ms height + fade).
- **Rationale.** The resting header previously stated the current week in four places and the
  day in nearly as many. It was overloaded for a screen whose primary job is logging.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`. Build the Day View header as a disclosure: collapsed by default,
  animated expand. Persist the open/closed preference is **not** required (defaults closed on
  each entry to the screen).

### 2. Programmed-days row, nested under the selected week
- **Change.** The expanded navigator is **one bordered card**: the week segmented control
  (`W1 W2 W3 W4 DL`) on top, and directly beneath it — inside the same card, divided by a
  rule — a row of **day chips for the selected week** (`D1…D5`; fewer for `DL`). Selecting a
  different week swaps the day row to that week's days. Day chip states: completed = subtle
  ink-tint fill + `✓`; current day = orange dot; selected (viewing) = filled ink; planned =
  hairline outline. The day's coordinate detail (`W2·D1` + status line) updates with the
  selection (`COMPLETED · 14 OF 14 SETS`, `SCHEDULED · 14 SETS PLANNED`, or the live
  `3 OF 14 SETS LOGGED` for the active day).
- **Rationale.** There was no way to see or navigate the other programmed days in a week, or
  to review completed/upcoming days in past/future weeks. Nesting the days inside the week
  card makes the hierarchy (days belong to the selected week) unambiguous.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`, `DATA`. The navigator needs, per week in the active meso: the list of
  programmed days with each day's label and completion state (completed / active / planned),
  and the set-logged counts for the coordinate line. Confirm `v_meso_summary` /
  microcycle/workout queries expose week→day lists with completion + set counts; add a query
  if not. Tapping a day should navigate the Day View to that day (read-only for completed,
  loggable for the active day) — wire to the same logging route.

### 3. Header de-cluttering
- **Change.** Removed the redundant `MESO 2 OF 4 · MACRO 26-1` meta line, the
  `PROGRAMMED DAYS — Wn` label, and the `● Wn — TARGET n RIR` line. The week now appears in
  exactly two places (the selector + the `W2·D1` headline). Inside the expanded card the only
  retained context is `MESO 2 / 4` (left) and the selected week's `TARGET n RIR` (right, in
  orange; `DELOAD WEEK` for the deload).
- **Rationale.** Remove repetition; keep only functionally necessary context.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`. Honor the reduced information set when building the header.

### 4. Chevron styling
- **Change.** The disclosure chevron is **borderless** (no box), weighted to match the
  `workout` logotype, and vertically centered with it. Rotates 180° between
  collapsed (▾) and open (▴).
- **Rationale.** The boxed chevron read as a separate control; it should feel part of the
  logotype lockup.
- **Affected figures.** 1.1.
- **Impact.** `NET-NEW`.

### 5. Denser set rows
- **Change.** Set-row vertical density reduced across the logging screens: input box height
  `42px → 32px`, value font `17px → 14px`, log checkbox `26px → 21px`, row vertical padding
  `7px → 4px`, grip/log columns tightened (`22px / 50px → 20px / 44px`). Applied to all
  logging set rows (1.1, and the same row component wherever it appears — 1.2/1.3) for
  consistency.
- **Rationale.** The boxes were oversized for a full workout; a denser row fits more of the
  session on screen while staying above the ≥44px touch-target rule for the **interactive**
  controls (the row as a whole and the log checkbox hit area remain tappable; only the visual
  box shrank).
- **Affected figures.** 1.1 (and shared set-row component used by 1.2, 1.3).
- **Impact.** `NET-NEW`, `TOKENS`. These are the set-row dimensions to build the logging row
  primitive to. Verify the rendered touch target for the log control stays ≥44px (pad the hit
  area beyond the 21px visual box).

### Verified (mockup)
Collapsed/expanded states render; chevron toggles `grid-template-rows` 0fr↔1fr with opacity
fade; week selection swaps the day row and updates the coordinate line; no console errors.
