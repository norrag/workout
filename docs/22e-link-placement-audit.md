# 22e — Link placement audit (doc 22 Phase 7a)

> **What this is.** Deliverable **C** of doc 22 — *"place links to [the manual]
> at the points in the app where they help most"* (owner, 2026-08-05) — audited
> before any of it is built, which is what
> [doc 22 §11 Phase 7a](./22-user-manual.md#phase-7--link-placement-deliverable-c)
> requires. Every user-reachable surface is listed, with the section it would
> target, and a **decision**. The rule the whole document is written against:
> **placement is earned, not sprayed.**
>
> **Status:** **Phase 7 is complete.** 7a audited · **wave 1 (7b) built
> 2026-08-15** · **wave 2 built 2026-08-15 (session 2)**, the owner having
> accepted §5's recommendation · **N81's inline term built 2026-08-15
> (session 3)**, which is [§6](#6-n81--the-inline-term-affordance-built).
> **Design pass:** `09-changelog` **2026-08-15** — the grammar, the
> primitive, and the two exclusions — amended by **2026-08-15 (session 2)**,
> which rules how far the guard reaches, and **(session 3)**, which draws the
> inline term and rules where it may go. Read them first; this document
> applies them.

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
its own wave — its real cost was the glossary-content pass
[`22c`](./22c-app-inventory.md) §C2 called for, not the component. [§6](#6-n81--the-inline-term-affordance-built)
is what shipped.

**③ Links carry a section ID string, never an imported module.** doc 22 D3
guard 1. The table below lives in `src/lib/guide-links.ts` as literals,
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

> **The budget is the mechanism link's, not the grammar's.** A term-level mark
> is not a navigation and costs a dotted rule rather than a line of chrome, so
> it has its own rules — in a sentence, first use only, once per term per screen
> ([§6.2](#62-the-placements); `09-changelog` 2026-08-15 session 3 §2). E5 binds
> all three members alike.

> **E4 after wave 2.** The test is unchanged and still binding — it is the
> reason nothing here is placed by eye. What changed is the surfaces: the ones
> §5 identified are now intercepted, so they pass it rather than being excused
> from it. [§3.3](#33-wave-2--built-7c) records which mechanism each uses, and
> the design pass (`09-changelog` 2026-08-15 session 2 §1) rules the choice.

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

### 3.3 Wave 2 — built (7c)

Ten placements, all of them the E4 group: surfaces that passed every test but
the unguarded-form one, and now pass that too. The **Mechanism** column is the
whole of what §5 bought — see `09-changelog` 2026-08-15 session 2 §1 for why a
sheet and a page are guarded differently.

| # | Surface | Sits under | Target section | Renders as | Mechanism |
|---|---|---|---|---|---|
| **10** | `/log/[id]` — **Exercise feedback** sheet | the asks, above the actions | `ug/how-it-felt#what-your-answers-do` | `WHAT YOUR ANSWERS DO ›` | guarded link |
| **11** | `/log/[id]` — **Workout Complete** | `SESSION — FEEDS NEXT WEEK'S TARGETS` | `ug/how-it-felt#the-session-questions` | `THE THREE QUESTIONS AT THE END ›` | guarded link |
| **12** | `/log/[id]` — **Effort target** sheet | the pricing line | `ug/exercise-level-rir#why-one-exercise-differs` | `WHAT IT DOES ›` | guarded link |
| **13** | `/exercises/[id]` — **Load step** sheet | the chips + `USE DEFAULT` | `ug/exercises-and-templates#the-load-step` | `THE WEIGHT JUMP FOR ONE LIFT ›` | guarded link |
| **14** | `/cycles/meso/[id]` — **Edit details** sheet | the ramp controls | `ug/choosing-your-ramp#why-a-ramp` | `WHY A BLOCK RAMPS INSTEAD OF PICKING ONE EFFORT ›` | guarded link |
| **15** | `/cycles/meso/[id]/plan` — **exercise** sheet | the RIR block's note | `ug/planning-a-mesocycle#the-exercise-sheet` | `THE EXERCISE SHEET ›` | board's page guard |
| **16** | `/cycles/new` | the `PLAN` card | `ug/macrocycle-goals#setting-one-up` | `SETTING ONE UP ›` | page guard (new) |
| **17** | `/cycles/macro/[id]/edit` | the `PLAN` card | `ug/macrocycle-goals#the-four-goals` | `THE FOUR GOALS ›` | page guard (new) |
| **18** | `/exercises/new` | the `EQUIPMENT` block's load hint | `ug/exercises-and-templates#your-own-exercises` | `MAKING YOUR OWN EXERCISE ›` | page guard (new) |
| **19** | `/more/profile` | the `Calibrates…` line | `ug/your-profile#what-it-is-for` | `WHAT THE PROFILE IS FOR ›` | none needed |

**Two rows this wave corrected.** Both were filed under E4 on the assumption
that a screen with controls is a form:

- **`/more/profile`** writes each change as it is made — experience, sex,
  equipment and body fat each fire their action on tap. The page holds no
  unsaved state at all, so #19 needed no mechanism; the audit had simply been
  wrong about it.
- **The planner's exercise sheet** stages through to the board's working copy,
  which `useNavigationGuard` has intercepted since R16. #15 was already covered
  by the guard the audit was asking for.

**What #12 also settles.** The `SET BY YOUR COACH` row in §4 was declined on
budget rather than on merit; #12 sits on the same sheet and its section covers
the same ground, so that candidate is closed rather than pending.

**Still declined, and for the same reason as before:** `/exercises/[id]`'s
`HISTORY` tab, the macro `BODY COMPOSITION` tab, `/more/bodyspec`, the day
view's History sheet, `/workout`'s two states, `/cycles/meso/[id]`'s `OVERVIEW`
tab and `/templates/[id]`. None of them fails E4 — they are held on **budget**
or on a weak E2, which is a judgement about density, and wave 2 changed nothing
about it. They stay `W2` in §4.

---

## 4. Full screen sweep

Every user-reachable surface, including the ones with nothing to place. Screens
are [`22c`](./22c-app-inventory.md)'s inventory; **W1** = wave 1 (§3),
**W2 #n** = wave 2 (§3.3), **W2** = recommended and still unbuilt, **—** = no
placement, with the test it fails.

| Screen / surface | Candidate | Target | Decision |
|---|---|---|---|
| `/workout` — day view inline | — | — | **—** E5 (see §3.2) |
| `/workout` — resting state | meso summary + volume | `ug/reading-your-stats#where-to-look` | **W2** — budget: duplicates #3/#4 |
| `/workout` — `SET UP CYCLES` empty | first-run orientation | `ug/cycle-model#the-four-layers` | **W2** — the strongest *new-user* candidate in the app |
| `/log/[id]` — exercise card / set grid | — | — | **—** E5 |
| `/log/[id]` — **Prescription details** | ✔ | `ug/how-your-weight-is-chosen#the-anchor` | **W1 #1** |
| `/log/[id]` — **Exercise feedback** sheet | ✔ | `ug/how-it-felt#what-your-answers-do` | **W2 #10** |
| `/log/[id]` — **Effort target** sheet | ✔ | `ug/exercise-level-rir#why-one-exercise-differs` | **W2 #12** |
| `/log/[id]` — `SET BY YOUR COACH` block | read-only cap + rep position | `ug/exercise-level-rir#how-far-it-reaches` | **—** budget: #12 owns the sheet |
| `/log/[id]` — **Workout Complete** | ✔ | `ug/how-it-felt#the-session-questions` | **W2 #11** |
| `/log/[id]` — **History** sheet | `EFF LOAD` / `E1RM` toggles | `ug/reading-your-stats#one-lift-at-a-time` | **W2** — read-only, passes; held on budget |
| `/log/[id]` — **Notes** sheet | pinned vs session | `ug/training-a-session#notes` | **—** E1: the sheet's own copy already says it |
| `/log/[id]` — set-log queue banner | — | `ug/your-data#live-reads-and-queued-logging` | **—** E2: an error banner is not a reading moment |
| `/cycles` | — | — | **—** E1 |
| `/cycles/new` | ✔ | `ug/macrocycle-goals#setting-one-up` | **W2 #16** |
| `/cycles/macro/[id]` — `OVERVIEW` | ✔ | `ug/macrocycle-goals#the-target-behind-it` | **W1 #5** |
| `/cycles/macro/[id]` — `BALANCE` | — | `ug/volume#where-your-sets-show-up` | **—** budget: #3 owns it |
| `/cycles/macro/[id]` — `PERFORMANCE` | ✔ | `ug/reading-your-stats#reading-like-with-like` | **W1 #6** |
| `/cycles/macro/[id]` — `BODY COMPOSITION` | `DIFFERENT SCANNERS — NOT COMPARABLE` | `ug/body-data#comparing-two-scans` | **W2** — budget: shares the `OVERVIEW` tab with #5 |
| `/cycles/macro/[id]/edit` | ✔ | `ug/macrocycle-goals#the-four-goals` | **W2 #17** |
| `/cycles/meso/[id]` — `OVERVIEW` | the plan view | `ug/cycle-model#day-slots` | **W2** — weakest of the three tabs on E1 |
| `/cycles/meso/[id]` — `BALANCE` | ✔ | `ug/volume#where-your-sets-show-up` | **W1 #3** |
| `/cycles/meso/[id]` — `PERFORMANCE` | ✔ | `ug/reading-your-stats#the-strength-trend` | **W1 #4** |
| `/cycles/meso/[id]` — header RIR ramp | the ramp strip | `ug/effort-rir#the-weeks-ramp` | **—** E3: the `rir_ramp` `InfoDot` is the right grain here |
| `/cycles/meso/[id]` — `Edit details` sheet | ✔ | `ug/choosing-your-ramp#why-a-ramp` | **W2 #14** |
| `/cycles/meso/[id]/plan` — volume preview | ✔ | `ug/volume#the-band` | **W1 #2** |
| `/cycles/meso/[id]/plan` — exercise sheet | ✔ | `ug/planning-a-mesocycle#the-exercise-sheet` | **W2 #15** — the board's guard already covered it |
| `/cycles/meso/[id]/planned/[w]/[d]` | `NOT PLANNED YET` | `ug/cycle-model#one-block-at-a-time` | **—** E1 |
| `/cycles/plan` | ✔ | `ug/planning-a-mesocycle#starting-a-block` | **W1 #9** |
| `/cycles/plan/copy` · `/template` | pickers | — | **—** E1 |
| `/templates` · `/templates/[id]` | — | `ug/exercises-and-templates#templates` | **W2** — detail page only; weak on E2 |
| `/exercises` | — | — | **—** E1 |
| `/exercises/[id]` — `OVERVIEW` | ✔ | `ug/exercises-and-templates#what-an-exercise-remembers` | **W1 #7** |
| `/exercises/[id]` — `HISTORY` | `DELOAD` / `BACKED OFF` tags | `ug/exercise-level-rir#what-it-does-to-your-numbers` | **W2** — budget: shares the screen with #7 |
| `/exercises/[id]` — **Load step** sheet | ✔ | `ug/exercises-and-templates#the-load-step` | **W2 #13** |
| `/exercises/new` | ✔ | `ug/exercises-and-templates#your-own-exercises` | **W2 #18** |
| `/more` | — | — | **—** §3.2 |
| `/more/profile` | ✔ | `ug/your-profile#what-it-is-for` | **W2 #19** — never was a form (§3.3) |
| `/more/account` | ✔ | `ug/your-data#what-is-stored` | **W1 #8** |
| `/more/delete-account` | — | `ug/your-data#deleting-your-account` | **—** E2: a confirm page must not offer a way out that is not the decision |
| `/more/connector` | ✔ (adoption) | `ug/connecting-an-ai#staying-in-control` | **W1** — Phase 6e's line, now the primitive |
| `/more/bodyspec` · `[scanId]` | `VS PREVIOUS SCAN` comparability | `ug/body-data#comparing-two-scans` | **W2** — read-only, passes; held on budget with the macro row |
| `/more/whats-new` | — | `ug/your-data#seeing-what-changed` | **—** E3: the page *is* the answer |
| What's New sheet | — | — | **—** doc 23 §7.2 already gives entries their own `guide` targets |
| `/~offline`, auth, onboarding, `/share` | — | — | **—** E2 |

**Counts after wave 2:** **20 built** (19 numbered + `/more/connector`'s
adoption) · 8 recommended and waiting, every one of them held on **budget or a
weak E2** rather than on a mechanism · 16 declined with a reason. Nothing in
this table is waiting on a decision.

**After N81 (§6.2):** eight further placements, five of them inline marks and
three `InfoDot`s. They are listed in §6.2 rather than in the table above because
this table is the **mechanism-level** sweep — a term mark answers a different
question and does not spend the one-link budget. The eight unbuilt `W2` rows are
unaffected: not one of them was held on the absence of a definition.

---

## 5. What unblocked the E4 group — **decided, and built**

> **Owner, 2026-08-15: recommendation accepted.** The section below is kept as
> the record of what was asked and why; §3.3 is what was built. The one
> substantive departure from the wording of option (1) is stated at the end,
> and it is a narrowing, not a widening.

The recommendations that failed only **E4** were on forms with unsaved local
state and no interception. Between them they included the three placements this
audit rates highest on E1/E2 in the whole app: the **Exercise feedback** sheet,
the **Effort target** sheet, and the **Load step** sheet. The reader is being
asked for an input, or is changing a number that reprices their training, and
*that* is when they want to know what it does.

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

### 5.1 How (1) was built, and where it was narrowed

The hook went where the hook belongs — the three **pages** that were genuinely
unguarded (`/cycles/new`, `/cycles/macro/[id]/edit`, `/exercises/new`), which
also closes a gap that predates this audit: those forms have been discarding
unsaved input on any tab-bar tap since they were written.

The **sheets** got something narrower than the wording of (1), on purpose. A
sheet's scrim covers the page, so the Guide link is the only navigation the
surface offers, and intercepting that one anchor is exactly sufficient —
whereas arming the hook plants a **history sentinel**, and the sheets in
question are the Feedback and Effort target sheets on the day view. Changing
what the back button does mid-workout is a larger behavior change than this
audit asked the owner to approve, and it is not needed to lift E4. So:
`GuardedGuideLink` for sheets, `useNavigationGuard` for pages, one shared
discard-confirm for both (`09-changelog` 2026-08-15 session 2 §1–2).

Cost, for the record: two new components totalling ~130 lines, one extracted
from the planner board unchanged, plus a `dirty` expression per surface. No
sheet gained or lost a control.

### 5.2 What the E4 group turned out not to include

Two rows in §4 were filed against E4 on the assumption that a screen carrying
controls is a form; reading the code corrected both. **`/more/profile`** writes
every change as it is made and holds no unsaved state; **the planner's exercise
sheet** stages into the board's working copy, which has been guarded since R16.
Neither needed anything built. They are the reason this wave is ten placements
against a seven-row estimate.

---

## 6. N81 — the inline term affordance *(built)*

> **Status:** built 2026-08-15 (session 3), in the order §6 planned — **glossary
> entries first, then the primitive, then the prose sites.** Design:
> `09-changelog` **2026-08-15 §3** (the ruling) and **session 3 §1–4** (the
> build and its placement rules).

The reason this was a wave of its own is worth keeping: the component is a
morning's work and the **content** is not. An affordance that opens a card is
useless where no card exists, and `22c` §C2 counted the gap.

### 6.1 The content pass — six new terms

`22c` §C2's **recommendation column is now closed.** Six terms it marked *add to
glossary* landed here, each verified against code rather than against a spec
([`22b`](./22b-source-map.md) §9.2) and each filed into chapter 20:

| Term | Where the app already printed it, undefined | Owning section |
|---|---|---|
| `strength_anchor` | Prescription details — `MEASURED ANCHOR` | `ug/how-your-weight-is-chosen#the-anchor` |
| `exercise_target_rir` | Effort target sheet — `TARGET RIR` | `ug/exercise-level-rir#why-one-exercise-differs` |
| `backed_off` | history rows + the day view eyebrow — `BACKED OFF` | `ug/exercise-level-rir#backing-an-exercise-off` |
| `effective_load` | history rows on a bodyweight lift — `EFF LOAD` | `ug/reading-your-stats#one-lift-at-a-time` |
| `adherence` | macrocycle Overview — `ADHERENCE` | `ug/reading-your-stats#where-to-look` |
| `phase` | the macro timeline, the Cycles list, the create form | `ug/macrocycle-goals#setting-one-up` |

Chapter 20 gained a **sixth group**, `ug/glossary#reading-a-session`, for the
three that describe training already done; the other three joined existing
groups. Ledger rows: `C-gloss-07`/`08`, `C-perex-27b`, `C-wt-25`,
`C-stat-26`/`27`, `C-macro-22`.

**One §C2 recommendation was declined**, and for the reason §C2 itself gives:
`model band` / `REALISTIC TARGET` is hidden on every screen that would print it
(**`D-15`**, N54), so a card for it would be the §C1-a defect the table exists to
shrink — a definition with no screen behind it, exactly as `KEY LIFTS` was.
Revisit when the cards return with N43/v23.

### 6.2 The placements

Two affordances, split by the rule in §1 ① — a term inside a **sentence** is
marked; a term that **is a label** takes the dot.

| # | Surface | The sentence, or the label | Term | Affordance |
|---|---|---|---|---|
| **20** | `/workout` — first-run empty state | *"Set up a macrocycle…"* | `macrocycle` | inline |
| **21** | `/cycles` — first-run empty state | *"A macrocycle sets the long-term direction… and the mesocycles that build toward it"* | `macrocycle`, `mesocycle` | inline |
| **22** | `/cycles/new` — the standfirst | *"A long-term arc that gives your mesocycles a shared direction"* | `mesocycle` | inline |
| **23** | `/cycles/new` — the `PLAN` card | *"We've spaced suggested phases…"* | `phase` | inline |
| **24** | `/more/profile` — the `SEX` note | *"Calibrates the realistic muscle-gain target on your macrocycles"* | `macrocycle` | inline |
| **25** | Prescription details | `MEASURED ANCHOR` | `strength_anchor` | `InfoDot` |
| **26** | Effort target sheet | `TARGET RIR` | `exercise_target_rir` | `InfoDot` |
| **27** | Macro `OVERVIEW` | `ADHERENCE` | `adherence` | `InfoDot` |

Plus the manual's own `{ term }` runs, which now render through the primitive
(`09-changelog` session 3 §3) rather than as a bare semibold span.

**What that fixes, beyond the new terms.** `22c` §C1-a's oldest finding was that
`macrocycle` / `mesocycle` / `microcycle` are the app's core vocabulary and had
**no trigger anywhere** — defined in `glossary.ts`, reachable from nothing. Two
of the three now answer where a first-time reader meets them, which is the
screen they are read on rather than a chapter they have not opened.

### 6.3 What deliberately got no mark

- **`microcycle`.** No screen says the word — the app says *week*. A mark cannot
  go where the term does not appear, and inventing a sentence to hold one would
  be the §C1-a defect in reverse.
- **`backed_off` and `effective_load` have cards but no in-app trigger.** Both
  render **only inside repeating history rows** (and `BACKED OFF` also on the day
  view's eyebrow, which is the N82 hot path). A trigger per row is exactly the
  per-card cost N82 removed, and the row is already a tap target for the
  weight/estimate flip, so a nested button would be a second meaning for the same
  tap. They are defined in the app's own words, reachable from chapter 20 and
  from the sections that print them, and they wait for a single-instance
  surface — a legend or a header — rather than being sprayed down a list.
- **Generated prose.** The prescription strip's *why*, the comparability
  sentence and the effort disclosures are composed as strings in pure modules;
  marking a term inside one needs a run model, and doc 19 keeps the engine the
  author of those words (`09-changelog` session 3 §2).

## 7. Maintenance

- The affordance's **separator is a prop** (`rule`), not a wrapper at the call
  site. The link is release-gated, so a `border-t` div around it would paint a
  hairline under the block for every user until 1.1.0 — chrome and gate vanish
  together or the gate is decorative.

- A new placement adds one row to `src/lib/guide-links.ts` and one `GuideLink`
  at the site. The test is what keeps the ID honest — and since wave 2 it also
  fails on a row **no call site renders**, so the table cannot quietly drift
  ahead of the app.
- **A new term mark adds nothing but the mark**, because there is no table to
  keep: the term IS the key. What holds it honest is
  `inline-term.test.ts`, which reads the call sites and fails when the marked
  words are not the term's own, when one file marks a term twice, when a second
  file draws the card, or when the gate leaves the primitive. Adding a term to
  `glossary.ts` still owes chapter 20 a home and [`22a`](./22a-manual-claims.md)
  a row — `contracts.test.ts` fails otherwise.
- **Choosing between the three members is one question: what is the reader
  asking, and is the term a label or a word in a sentence?** *What does this mean*
  + label ⇒ `InfoDot`; *what does this mean* + mid-sentence ⇒ `InlineTerm`; *why
  is this number what it is* ⇒ a Guide link, which navigates and therefore takes
  the E-tests below.
- **Choosing the affordance at a new site is E4, mechanically.** Read-only or
  already-guarded surface → `GuideLink`. A surface holding its own unsaved
  input → `GuardedGuideLink` with a `dirty` expression and the sentence naming
  what is at stake. A page that holds unsaved input and has other exits →
  `useNavigationGuard` + `LeaveConfirm`, and then the plain link.
- **There is one discard-confirm** (`LeaveConfirm`) and a test asserts nobody
  re-draws it; a second copy is how two surfaces end up asking the same
  question in two voices.
- **A renamed section** breaks `guide-links.test.ts` before it breaks a reader,
  and doc 22 §9.4.2 already calls a section ID an API: rename ⇒ redirect entry.
- **A retitled section** breaks the same test, because the label *is* the title.
  That is deliberate — it is the only way a link keeps its promise without
  someone remembering to re-read it.
- Placements themselves are re-validated with the rest of doc 22 at Phase 4 and
  under the Phase 8 rule.
