# 22e — Link placement audit (doc 22 Phase 7a)

> **What this is.** Deliverable **C** of doc 22 — *"place links to [the manual]
> at the points in the app where they help most"* (owner, 2026-08-05) — audited
> before any of it is built, which is what
> [doc 22 §11 Phase 7a](./22-user-manual.md#phase-7--link-placement-deliverable-c)
> requires. Every user-reachable surface is listed, with the section it would
> target, and a **decision**. The rule the whole document is written against:
> **placement is earned, not sprayed.**
>
> **Status:** 7a complete · **wave 1 (7b) built 2026-08-15** · wave 2 and N81's
> inline affordance await the owner's read of §5 / §6.
> **Design pass:** `09-changelog` **2026-08-15** — the grammar, the
> primitive, and the two exclusions. Read it first; this document applies it.

---

## 1. The three rulings Phase 7a owed

**① `InfoDot` is term-level. A Guide link is mechanism-level.** They answer
different questions and neither substitutes for the other. An `InfoDot` on
`EST. STRENGTH` says what an estimate is; it will never say why this week's
weight went up. Where both belong on one block, **both go** — the `InfoDot`
stays on the label, the link goes under the block.

**② N81's inline underlined term is the third member, and it is term-level.**
Ruled in the same design pass rather than separately (the backlog row scheduled
it here for exactly that reason), specified in `09-changelog` §3, and built in
its own wave — its real cost is a glossary-content pass over the ~22 terms
[`22c`](./22c-app-inventory.md) §C2 found undefined, not a component.

**③ Links carry a section ID string, never an imported module.** doc 22 D3
guard 1. The wave-1 table below lives in `src/lib/guide-links.ts` as literals,
and `guide-links.test.ts` resolves every one through the manual registry — the
same one-validator-two-consumers shape doc 23 §7.2 and Phase 6e's
`manual-links.ts` already use. A renamed section breaks CI, not a reader's tap.

## 2. What makes a placement *earned*

A candidate has to pass all five. Anything failing one is listed below with the
test it failed, rather than quietly dropped.

| | Test | Why |
|---|---|---|
| **E1** | The surface **prints a number or a judgement** whose derivation is not self-evident, or asks the reader for an input whose use is not self-evident | Mechanism-level is the whole distinction from `InfoDot` |
| **E2** | The reader plausibly arrives **with the question already formed** | A link nobody is looking for is clutter by definition |
| **E3** | No existing affordance already answers *that* question | An `InfoDot` on the same label is not a duplicate; an `InfoDot` answering the same question is |
| **E4** | The surface is **read-only**, or its dirty state is already intercepted | A `GuideLink` navigates; navigating out of an unguarded form discards input (`09-changelog` §2) |
| **E5** | It costs nothing on the **hot path** — never in the set grid, never on the day view's exercise card | N82 removed an icon per card the same week; this must not spend that back |

And one budget: **at most one `GuideLink` visible per screen state.** Tabs count
as separate states; a sheet counts as its own surface.

---

## 3. Wave 1 — built (7b)

Nine placements. Every one is a single tracked-caps line at the foot of an
existing block; **no layout, no control and no copy is otherwise changed.**

| # | Surface | Sits under | Target section | Renders as |
|---|---|---|---|---|
| **1** | **Prescription details** sheet (day view) | the `TRACE` block, at the foot | `ug/how-your-weight-is-chosen#the-anchor` | `THE STRENGTH ANCHOR ›` |
| **2** | **Planner board** — `WEEKLY SETS PER MUSCLE` | the band rows | `ug/volume#the-band` | `THE RANGE EACH MUSCLE IS JUDGED AGAINST ›` |
| **3** | **Meso page** — `BALANCE` tab | `SETS / WEEK` + `BALANCE CHECK` | `ug/volume#where-your-sets-show-up` | `WHERE YOUR SETS SHOW UP ›` |
| **4** | **Meso page** — `PERFORMANCE` tab | the strength lists | `ug/reading-your-stats#the-strength-trend` | `THE STRENGTH TREND ›` |
| **5** | **Macro page** — `OVERVIEW` | `MACROCYCLE STATS · TO DATE` / `RETROSPECTIVE` | `ug/macrocycle-goals#the-target-behind-it` | `THE TARGET BEHIND IT ›` |
| **6** | **Macro page** — `PERFORMANCE` tab | `EST. STRENGTH — BY MUSCLE GROUP` | `ug/reading-your-stats#reading-like-with-like` | `READING LIKE WITH LIKE ›` |
| **7** | **Exercise page** — `OVERVIEW` tab | the lifetime aggregates | `ug/exercises-and-templates#what-an-exercise-remembers` | `WHAT AN EXERCISE REMEMBERS ›` |
| **8** | **Account & data** | the `DATA` section | `ug/your-data#what-is-stored` | `WHAT IS STORED ›` |
| **9** | **Plan a meso** (`/cycles/plan`) | the three live paths | `ug/planning-a-mesocycle#starting-a-block` | `WHERE A BLOCK COMES FROM ›` |

Plus one **adoption, not an addition**: `/more/connector`'s existing
`How you stay in control ›` line becomes a `GuideLink` on
`ug/connecting-an-ai#staying-in-control`. Phase 6e improvised this pattern; it
now shares the primitive and the label contract, so its copy tracks the section
title (`STAYING IN CONTROL ›`).

### 3.1 Why each one is earned

1. **Prescription details.** The densest engine surface a user can reach —
   `MEASURED ANCHOR`, `PRESCRIBED IMPLIES`, a status-coded `TRACE`. Nobody opens
   it by accident (N75 took it out of the `⋮` menu; the ask line's underline is
   the only way in), so E2 is not an assumption. Read-only, so E4 holds. The
   anchor is the one concept the whole panel is priced off, and it is ch. 10's
   first section.
2. **Planner board volume.** `WEEKLY SETS PER MUSCLE` prints each muscle against
   a band and colors the outliers; the two `InfoDot`s there define *volume
   landmarks* and *fractional sets* but neither says how the band was chosen for
   **you**. E4 holds by the second clause: the board's dirty state is already
   intercepted by `useNavigationGuard`, so a tap asks before discarding a draft.
   *(Not ch. 4's `#the-volume-check` — that section teaches the control; ruling
   ① sends the mechanism-level link to ch. 12.)*
3. **Meso `BALANCE`.** The half-set counting is the single most-asked "why is
   that number not what I counted" on the surface that prints it.
4. **Meso `PERFORMANCE`.** `EST. STRENGTH … ALL EXERCISES` with a percentage per
   lift. E1 in its purest form: a judgement whose derivation is invisible.
5. **Macro `OVERVIEW`.** `MACROCYCLE STATS · TO DATE`, or `RETROSPECTIVE` with
   its verdicts, `NOT MEASURED` and `NOT COMPARABLE` — and per
   [`22c`](./22c-app-inventory.md) §B2.3 those are *answers*, not errors, which
   is precisely a thing a reader needs told once. Also the honest fix for the
   `D-15` gap: the target band this arc is graded against is **not printed on
   any screen** (N54), so the section is where a reader can learn what the
   grading is even about.
6. **Macro `PERFORMANCE`.** Macro scope is where cross-phase comparison actually
   bites — a cut block next to a bulk block. `#reading-like-with-like` is the
   comparability section, and this is the screen that invites the mistake.
7. **Exercise `OVERVIEW`.** `ALL-TIME BESTS` + lifetime aggregates + the
   per-exercise load step behind the `⋮`. The `e1rm` `InfoDot` is already there
   on the label and stays (ruling ①).
8. **Account & data.** Export and delete both raise "what is in there?" before
   the tap, and the answer is a list, not a definition. Also the one placement
   whose value is highest **before** the reader acts.
9. **Plan a meso.** The chooser is where the copy-vs-template-vs-scratch decision
   is made, and each carries different consequences for how loads seed. E2 is
   strong: this screen exists to be deliberated over.

### 3.2 Where wave 1 deliberately put **nothing**

- **The day view's exercise card and set grid.** E5. The day view reaches the
  Guide only from inside a sheet (#1).
- **`/workout`.** It renders the day view inline; a link there is the day view's
  link, and it is out by E5. Its *resting* state re-renders the meso stats
  components, and the wave-1 links on those live on the meso page, so the
  budget stays at one per screen state.
- **Every list screen** (`/cycles`, `/templates`, `/exercises`) — E1: a list of
  rows prints no derived number.
- **`/more`.** The `Guide` row **is** the manual's front door; a second link
  next to it would be a link to the thing it is standing on.

---

## 4. Full screen sweep

Every user-reachable surface, including the ones with nothing to place. Screens
are [`22c`](./22c-app-inventory.md)'s inventory; **W1** = built, **W2** =
recommended, waiting on the owner, **—** = no placement, with the test it fails.

| Screen / surface | Candidate | Target | Decision |
|---|---|---|---|
| `/workout` — day view inline | — | — | **—** E5 (see §3.2) |
| `/workout` — resting state | meso summary + volume | `ug/reading-your-stats#where-to-look` | **W2** — budget: duplicates #3/#4 |
| `/workout` — `SET UP CYCLES` empty | first-run orientation | `ug/cycle-model#the-four-layers` | **W2** — the strongest *new-user* candidate in the app |
| `/log/[id]` — exercise card / set grid | — | — | **—** E5 |
| `/log/[id]` — **Prescription details** | ✔ | `ug/how-your-weight-is-chosen#the-anchor` | **W1 #1** |
| `/log/[id]` — **Exercise feedback** sheet | the pump / workload / pain asks | `ug/how-it-felt#what-your-answers-do` | **W2** — E4 fails today (§5) |
| `/log/[id]` — **Effort target** sheet | scope semantics + the pricing line | `ug/exercise-level-rir#why-one-exercise-differs` | **W2** — E4 fails today (§5) |
| `/log/[id]` — `SET BY YOUR COACH` block | read-only cap + rep position | `ug/exercise-level-rir#how-far-it-reaches` | **W2** — E4 (inside the same sheet) |
| `/log/[id]` — **Workout Complete** | `SESSION — FEEDS NEXT WEEK'S TARGETS` | `ug/how-it-felt#the-session-questions` | **W2** — E4 fails today (§5) |
| `/log/[id]` — **History** sheet | `EFF LOAD` / `E1RM` toggles | `ug/reading-your-stats#one-lift-at-a-time` | **W2** — read-only, passes; held on budget |
| `/log/[id]` — **Notes** sheet | pinned vs session | `ug/training-a-session#notes` | **—** E1: the sheet's own copy already says it |
| `/log/[id]` — set-log queue banner | — | `ug/your-data#live-reads-and-queued-logging` | **—** E2: an error banner is not a reading moment |
| `/cycles` | — | — | **—** E1 |
| `/cycles/new` | the create-engine `PLAN` card + phase strip | `ug/macrocycle-goals#setting-one-up` | **W2** — E4: unguarded create form |
| `/cycles/macro/[id]` — `OVERVIEW` | ✔ | `ug/macrocycle-goals#the-target-behind-it` | **W1 #5** |
| `/cycles/macro/[id]` — `BALANCE` | — | `ug/volume#where-your-sets-show-up` | **—** budget: #3 owns it |
| `/cycles/macro/[id]` — `PERFORMANCE` | ✔ | `ug/reading-your-stats#reading-like-with-like` | **W1 #6** |
| `/cycles/macro/[id]` — `BODY COMPOSITION` | `DIFFERENT SCANNERS — NOT COMPARABLE` | `ug/body-data#comparing-two-scans` | **W2** — budget: shares the `OVERVIEW` tab with #5 |
| `/cycles/macro/[id]/edit` | goal / duration | `ug/macrocycle-goals#the-four-goals` | **W2** — E4: unguarded form |
| `/cycles/meso/[id]` — `OVERVIEW` | the plan view | `ug/cycle-model#day-slots` | **W2** — weakest of the three tabs on E1 |
| `/cycles/meso/[id]` — `BALANCE` | ✔ | `ug/volume#where-your-sets-show-up` | **W1 #3** |
| `/cycles/meso/[id]` — `PERFORMANCE` | ✔ | `ug/reading-your-stats#the-strength-trend` | **W1 #4** |
| `/cycles/meso/[id]` — header RIR ramp | the ramp strip | `ug/effort-rir#the-weeks-ramp` | **—** E3: the `rir_ramp` `InfoDot` is the right grain here |
| `/cycles/meso/[id]` — `Edit details` sheet | `RAMP LOCKED ONCE STARTED` | `ug/choosing-your-ramp#why-a-ramp` | **W2** — E4: unguarded form |
| `/cycles/meso/[id]/plan` — volume preview | ✔ | `ug/volume#the-band` | **W1 #2** |
| `/cycles/meso/[id]/plan` — exercise sheet | `STARTING SETS` week-1 note | `ug/planning-a-mesocycle#the-exercise-sheet` | **W2** — E4: form inside a guarded board |
| `/cycles/meso/[id]/planned/[w]/[d]` | `NOT PLANNED YET` | `ug/cycle-model#one-block-at-a-time` | **—** E1 |
| `/cycles/plan` | ✔ | `ug/planning-a-mesocycle#starting-a-block` | **W1 #9** |
| `/cycles/plan/copy` · `/template` | pickers | — | **—** E1 |
| `/templates` · `/templates/[id]` | — | `ug/exercises-and-templates#templates` | **W2** — detail page only; weak on E2 |
| `/exercises` | — | — | **—** E1 |
| `/exercises/[id]` — `OVERVIEW` | ✔ | `ug/exercises-and-templates#what-an-exercise-remembers` | **W1 #7** |
| `/exercises/[id]` — `HISTORY` | `DELOAD` / `BACKED OFF` tags | `ug/exercise-level-rir#what-it-does-to-your-numbers` | **W2** — budget: shares the screen with #7 |
| `/exercises/[id]` — **Load step** sheet | the N67 index-off-last-entered rule | `ug/exercises-and-templates#the-load-step` | **W2** — E4: unguarded form. Strong otherwise |
| `/exercises/new` | the three bodyweight load meanings | `ug/exercises-and-templates#your-own-exercises` | **W2** — E4: unguarded form |
| `/more` | — | — | **—** §3.2 |
| `/more/profile` | `Drives…` / `Calibrates…` | `ug/your-profile#what-it-is-for` | **W2** — E4: unguarded form. Strong otherwise |
| `/more/account` | ✔ | `ug/your-data#what-is-stored` | **W1 #8** |
| `/more/delete-account` | — | `ug/your-data#deleting-your-account` | **—** E2: a confirm page must not offer a way out that is not the decision |
| `/more/connector` | ✔ (adoption) | `ug/connecting-an-ai#staying-in-control` | **W1** — Phase 6e's line, now the primitive |
| `/more/bodyspec` · `[scanId]` | `VS PREVIOUS SCAN` comparability | `ug/body-data#comparing-two-scans` | **W2** — read-only, passes; held on budget with the macro row |
| `/more/whats-new` | — | `ug/your-data#seeing-what-changed` | **—** E3: the page *is* the answer |
| What's New sheet | — | — | **—** doc 23 §7.2 already gives entries their own `guide` targets |
| `/~offline`, auth, onboarding, `/share` | — | — | **—** E2 |

**Counts:** 9 built · 19 recommended and waiting · 14 declined with a reason.

---

## 5. What would unblock the E4 group (owner decision)

Seven of the nineteen recommendations fail only **E4** — they are on forms with
unsaved local state and no interception. Between them they include the three
placements this audit rates highest on E1/E2 in the whole app: the **Exercise
feedback** sheet, the **Effort target** sheet, and the **Load step** sheet. The
reader is being asked for an input, or is changing a number that reprices their
training, and *that* is when they want to know what it does.

Three ways out, in ascending cost:

1. **Extend `useNavigationGuard` to sheets.** The hook already exists, is
   already unit-tested, and already does exactly this on the planner board: it
   intercepts the anchor click and hands the caller the href. Each sheet would
   need a discard-confirm path. **This is a behavior change**, which doc 22 §1.2
   puts outside the manual's scope — so it is the owner's call, not the manual's.
2. **Open the section in a new tab from these sheets only.** Cheap, and
   `shouldGuardNavigation` already treats `target="_blank"` as not-a-navigation.
   But it breaks the N27 back-link contract and puts a second window in front of
   someone mid-workout. **Not recommended.**
3. **Leave them out.** Costs the audit its three best placements.

**Recommendation: (1)**, as its own small PR after wave 1 has been used, which
is what doc 22 Phase 7c is for.

---

## 6. N81 — the inline term affordance

Ruled here (§1 ②), designed in `09-changelog` 2026-08-15 §3, and
**built in its own wave** for one reason worth stating plainly: the component is
a morning's work and the **content** is not. `22c` §C2 lists ~22 rendered terms
with no definition anywhere, and the affordance is useless until each has a
glossary entry — which is a copy pass under doc 22 §8.1's single-source rule
(the manual and the card must say the same words), not a placement pass.

Sequenced as: glossary entries first (with `22a` ledger rows), then the
primitive, then the prose sites. Until then doc 22 §8.4c rule 2's stopgap holds
— the manual renders a term's definition at first use.

---

## 7. Maintenance

- The affordance's **separator is a prop** (`rule`), not a wrapper at the call
  site. The link is release-gated, so a `border-t` div around it would paint a
  hairline under the block for every user until 1.1.0 — chrome and gate vanish
  together or the gate is decorative.

- A new placement adds one row to `src/lib/guide-links.ts` and one `GuideLink`
  at the site. The test is what keeps the ID honest.
- **A renamed section** breaks `guide-links.test.ts` before it breaks a reader,
  and doc 22 §9.4.2 already calls a section ID an API: rename ⇒ redirect entry.
- **A retitled section** breaks the same test, because the label *is* the title.
  That is deliberate — it is the only way a link keeps its promise without
  someone remembering to re-read it.
- Placements themselves are re-validated with the rest of doc 22 at Phase 4 and
  under the Phase 8 rule.
