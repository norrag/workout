// User Guide — chapter 3, "The cycle model" (doc 22 §5).
//
// The app's core vocabulary, and the chapter every later one leans on. 22c
// finding C1-a is the reason it exists in this shape: `macrocycle`,
// `mesocycle` and `microcycle` are defined in `glossary.ts` but surfaced by no
// `InfoDot` anywhere, so they are used as headings on screens with no way to
// ask what they mean. Rendering all three as `term` cards here is the manual
// paying that debt in the app's own words (doc 22 §8.1).
//
// GROUND TRUTH (22b §7 ch. 3 — glossary, doc 03, doc 09, N76/N79):
//   - the day-slot model is real and keyed on `workouts.day_number`:
//     `queries/slot-prescription.ts` looks the advance source up on
//     (mesocycle, day number, exercise), and
//     `analysis/comparability.ts::analyzeByDaySlot` splits a lift's history
//     the same way. `day_slot` was added to `glossary.ts` in this PR because
//     ch. 3 depends on it and §8.1 forbids a manual-only definition
//     (22c §C2 / Part E item 2)
//   - **N79, and this chapter owes it (22b §5.1):** more than one block can be
//     live, so "the current block" is a RESOLUTION, not a fact. The rule is
//     `queries/cycles.ts::resolveActiveMesocycle` — the block holding the most
//     recently logged set, falling back to newest-created
//   - N76: finished cycles hide behind a counted toggle (`?completed=1`), and
//     a completed block inside a running macrocycle stays visible
//     (`cycles/page.tsx`)
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_CYCLE_MODEL: ManualChapter = {
  manual: "ug",
  slug: "cycle-model",
  number: 3,
  title: "The cycle model",
  summary:
    "The four layers the app organizes training into, what a day slot is, and how to find the block you are in.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-four-layers",
      title: "The four layers",
      summary:
        "Macrocycle, mesocycle, microcycle, workout — each one a slice of the one above it.",
      keywords: [
        "macrocycle",
        "mesocycle",
        "microcycle",
        "block",
        "week",
        "cycle",
        "periodization",
        "structure",
      ],
      blocks: [
        {
          kind: "para",
          text: "Training here nests: a long-term goal is made of blocks, a block is made of weeks, and a week is made of sessions. The three outer layers carry the names the screens use.",
        },
        {
          kind: "figure",
          src: "/manual/cycle-nesting.svg",
          alt: "Four nested frames: a macrocycle spanning months contains a mesocycle of weeks, which contains a microcycle of one week, which contains one workout — labelled W3·D2. Your profile sits outside them, feeding in with an arrow.",
          width: 560,
          height: 272,
          caption:
            "Each layer sits inside the one above it. Your profile is not one of them — it is what the outermost layer's goal is set from.",
        },
        { kind: "term", term: "macrocycle" },
        { kind: "term", term: "mesocycle" },
        { kind: "term", term: "microcycle" },
        { kind: "heading", text: "And the session" },
        {
          kind: "para",
          text: [
            "The innermost layer is a single workout, which the day screen names as a coordinate: ",
            { ui: "W3·D2" },
            " is the second training day of the third week. The week and day navigator behind the ",
            { ui: "workout" },
            " logotype uses the same shorthand, with ",
            { ui: "DL" },
            " for a deload week.",
          ],
        },
        {
          kind: "para",
          text: [
            "Each layer answers a different question. The week sets how hard to push — that is its ",
            { to: "ug/effort-rir#the-weeks-ramp", text: "target RIR" },
            ". The block decides what is trained and for how long. The macrocycle decides what all of it is for. Keeping them separate is what lets one week be easy without the goal changing.",
          ],
        },
      ],
      related: [
        "ug/cycle-model#day-slots",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "day-slots",
      title: "Day slots, and comparing like with like",
      summary:
        "Why the app compares Monday's bench to Monday's bench rather than to every bench you have done.",
      keywords: [
        "day slot",
        "same day",
        "twice a week",
        "sawtooth",
        "comparison",
        "why is my progress flat",
        "day 2",
      ],
      blocks: [
        {
          kind: "para",
          text: "A block's shape repeats each week: the same days, in the same order, carrying the same exercises. That repetition is what makes progress readable, and it has a name.",
        },
        { kind: "term", term: "day_slot" },
        { kind: "heading", text: "Why it matters" },
        {
          kind: "para",
          text: [
            "Plenty of splits train a movement twice a week at different intensities — a heavy row on day 1 and a lighter one on day 4. Read as one series those sessions zigzag, and a good week can look like a bad one. Read slot by slot, each is a clean line: day 1 against day 1, day 4 against day 4.",
          ],
        },
        {
          kind: "para",
          text: "The program works the same way. When it chooses this week's weight for an exercise, it looks at what that exercise did in the same slot in earlier weeks — not at every time you have ever performed the movement.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "So moving an exercise to a different day starts a new comparison for it. That is usually the right answer rather than a loss — the two days ask different things.",
        },
      ],
      related: [
        "ug/cycle-model#the-four-layers",
        "ug/effort-rir#missing-the-ask",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "finding-your-cycles",
      title: "Finding your cycles",
      summary:
        "How the Cycles tab groups what is running, what is planned, and what is finished.",
      keywords: [
        "cycles tab",
        "where are my cycles",
        "completed",
        "hidden",
        "missing cycles",
        "draft",
        "standalone",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The ",
            { ui: "Cycles" },
            " tab is the index of everything you have planned or run. Macrocycles are listed first, each expanding to the blocks inside it; blocks that belong to no macrocycle sit under ",
            { ui: "STANDALONE — NO MACROCYCLE" },
            ".",
          ],
        },
        { kind: "heading", text: "Finished cycles are tucked away" },
        {
          kind: "para",
          text: [
            "The list shows what is live and what is coming. Everything finished sits behind one quiet line at the foot of the page — ",
            { ui: "SHOW 6 COMPLETED CYCLES" },
            " — which carries the count, so you can see at a glance that the history is there.",
          ],
        },
        {
          kind: "para",
          text: "A finished block inside a macrocycle that is still running stays where it is. It is part of that macrocycle's own record, and hiding it would leave a gap in the middle of the story.",
        },
        { kind: "heading", text: "Drafts" },
        {
          kind: "para",
          text: [
            "A plan you started and left unfinished appears at the top as ",
            { ui: "DRAFT IN PROGRESS" },
            " with ",
            { ui: "CONTINUE EDITING ›" },
            ". There is one draft at a time, so starting a new plan replaces it — the page says so before you do.",
          ],
        },
      ],
      related: [
        "ug/cycle-model#one-block-at-a-time",
        "ug/cycle-model#the-four-layers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "one-block-at-a-time",
      title: "When more than one block is live",
      summary:
        "You can run a second block alongside your plan, and the app follows whichever one you actually train.",
      keywords: [
        "two mesocycles",
        "concurrent",
        "which meso am i in",
        "rehab block",
        "standalone",
        "active block",
        "wrong block",
      ],
      blocks: [
        {
          kind: "para",
          text: "Most of the time one block is running and there is nothing to think about. But a block can also run alongside your plan — a rehab programme, a few weeks of something different, a standalone block that belongs to no macrocycle.",
        },
        { kind: "heading", text: "Which one the app follows" },
        {
          kind: "para",
          text: [
            { strong: "The block holding your most recently logged set." },
            " Train a rehab session and the Workout tab follows the rehab block; train your macrocycle's next day and it follows that again. There is nothing to switch — logging is the switch.",
          ],
        },
        {
          kind: "para",
          text: "Before either block has a set in it, the newest one wins, which is almost always the one you just made.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "If the Workout tab is showing a block you did not expect, the answer is which block you logged into last. Open the one you want from the Cycles tab and log a set, and the tab follows it from then on.",
        },
        { kind: "heading", text: "Why this rule" },
        {
          kind: "para",
          text: "Every other candidate rule needs bookkeeping — marking a block current, remembering to unmark it. This one is decided by training, which is the thing you were going to do anyway.",
        },
      ],
      related: [
        "ug/cycle-model#finding-your-cycles",
        "ug/what-workout-is#the-workout-page",
      ],
    },
  ],
};
