// AI Manual — chapter 4, "What it can do" (doc 22 §7).
//
// The capability chapter, and doc 22 §7 is explicit about its form: "in plain
// language, grouped by what you would want — not a schema dump". So the
// sections are groups of *intent*, each one naming what an assistant can fetch
// or build and what the reader can ask for by name. No tool names appear.
//
// GROUND TRUTH (`22d` §3 groups, re-counted from `registerTool` call sites at
// Phase 6 per `22d`'s own rule — 58 registered, 17 admin-gated and excluded,
// 41 user-facing, 4 resources at release 1.1.0):
//   - orientation (3), history & analysis (10), cycles read (4), cycles write
//     (11), library (9), coaching (2), and the manual surface (2 tools + 1
//     resource, `22d` §11)
//   - `preview_mesocycle_volume` performs NO mutation (`22d` §7 K2) — §3 below
//     presents it as the rehearsal step and must not imply it writes
//   - `analyze_exercise_progress` carries four comparability guards: current
//     phase only, a rolling window, per-day-slot series, and session position
//   - the manual tools resolve no session (`22d` §11.2 fact 1), every result
//     carries its in-app route (fact 2), and a section's estimate caveat
//     survives the read (fact 3)
//   - `22d` §8 rule 1: the 17 admin tools get NO coverage, not even a mention
//     that a gap exists — a normal reader's client lists 41 and there is no gap
//     from where they stand
//
// Claims: `C-cando-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_WHAT_IT_CAN_DO: ManualChapter = {
  manual: "ai",
  slug: "what-it-can-do",
  number: 4,
  title: "What it can do",
  summary:
    "The capabilities a connected assistant has, grouped by what you would want from it rather than by how they are built.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "where-you-are",
      title: "Where you are",
      summary:
        "Orientation: your live block, the week you are in, what comes next, and who the app thinks you are.",
      keywords: [
        "current state",
        "where am i",
        "what is next",
        "grounding",
        "status",
        "profile",
      ],
      blocks: [
        {
          kind: "para",
          text: "The first thing a good assistant does in a conversation about your training is find out where you stand. Three things are available for that, and it can have all of them in a moment.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Your position." },
              " The macrocycle, block and week you are in, the next session waiting for you, and that week's effort target — including any per-exercise target running this week.",
            ],
            [
              { strong: "How the block is going." },
              " How many of its sessions you have completed, how the ",
              { term: "workload", text: "workload" },
              " has been reading, and the strength trend on your main lifts.",
            ],
            [
              { strong: "Who you are." },
              " Age, height, bodyweight, body-fat if you track it, experience and the equipment you prefer — the same profile the app personalizes with.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "If an answer ever sounds unmoored, ",
            { strong: "start by checking where I am" },
            " is the sentence that fixes it. Everything else in this chapter reads better once that has happened.",
          ],
        },
      ],
      estimate: true,
      related: [
        "ai/what-it-is#two-kinds-of-question",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "history-and-analysis",
      title: "History and analysis",
      summary:
        "What it can read about the training behind you — one lift, one block, a muscle group, or several blocks compared.",
      keywords: [
        "history",
        "progress",
        "am i getting stronger",
        "compare",
        "volume",
        "muscle balance",
        "analysis",
        "stalled",
      ],
      blocks: [
        {
          kind: "para",
          text: "This is the largest part of the surface, and the part that answers questions the app's own screens are not shaped to ask.",
        },
        {
          kind: "table",
          columns: ["It can fetch", "Which answers"],
          rows: [
            [
              "a lift's session-by-session history",
              "what you did, when, in which block and week, with the notes you left and how hard each session read",
            ],
            [
              "a progress read on one lift",
              [
                "whether it is actually moving — trend, records and stalls, compared ",
                { strong: "like with like" },
                " rather than against every set you ever did",
              ],
            ],
            [
              "your recent sessions",
              "how the last handful went, with the feedback you gave at the end of each",
            ],
            [
              "weekly sets per muscle",
              "planned against logged, week by week, against your own volume landmarks",
            ],
            [
              "two or more blocks side by side",
              "volume, strength, adherence and feedback across a phase rather than within one",
            ],
            [
              "your scan history",
              "body composition over time, if you have connected scans, with the rules for when a change is worth reading",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Chapter 7 works a real analysis through end to end, including ",
            { strong: "the comparability questions to ask" },
            " — the ones that separate a genuine stall from two numbers that were never comparable.",
          ],
        },
      ],
      estimate: true,
      related: [
        "ug/reading-your-stats#reading-like-with-like",
        "ug/volume#the-band",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "planning-and-blocks",
      title: "Planning and blocks",
      summary:
        "What it can build: macrocycles, blocks, and edits to a block you are already running — all of it reviewable first.",
      keywords: [
        "create a block",
        "plan",
        "draft",
        "edit my block",
        "macrocycle",
        "mesocycle",
        "change my program",
      ],
      blocks: [
        {
          kind: "para",
          text: "Everything here lands in the app as something you look at before it means anything, which is what makes asking for the ambitious version reasonable.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "A macrocycle." },
              " A goal arc over months: it drafts one from what you want and how long you have, and the app computes the target and suggests the phases. It can also reshape the slots later, or change the goal and let the arc recompute.",
            ],
            [
              { strong: "A block." },
              " Drafted from a template or built day by day, with the effort ramp you ask for. It can also clone one that worked and vary it.",
            ],
            [
              { strong: "An edit to a live block." },
              " Days, exercises, set counts and the three per-exercise effort levers, on a block you are part-way through as well as one that has not started.",
            ],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "Rehearse before you commit",
          text: "A plan can be checked against your volume landmarks before it starts — projected weekly sets per muscle, with nothing written and nothing changed. It is the cheapest way to find out that a four-day split leaves a muscle short.",
        },
        {
          kind: "para",
          text: "Chapters 5 and 6 are these two jobs done properly, with the review step in the app that each of them ends at.",
        },
      ],
      related: [
        "ai/the-rules#plans-arrive-as-drafts",
        "ug/planning-a-mesocycle#the-volume-check",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "library-and-preferences",
      title: "Library and preferences",
      summary:
        "The quieter half: exercises, templates, exclusions, per-exercise load steps and the notes it will read next time.",
      keywords: [
        "exercise library",
        "custom exercise",
        "exclude",
        "increment",
        "notes",
        "preferences",
        "templates",
      ],
      blocks: [
        {
          kind: "para",
          text: "These are the settings that make the rest of the app fit you, and they are the ones most likely to stay unset because reaching them is a detour. Asking is faster.",
        },
        {
          kind: "table",
          columns: ["Ask it to", "What that does"],
          rows: [
            [
              "add a movement you do",
              "a custom exercise with its equipment, muscles and load step, available everywhere the stock library is",
            ],
            [
              "rule a movement out",
              "an exclusion with a reason. Excluded movements stop appearing in pickers and stop being suggested",
            ],
            [
              "change how much weight a lift goes up by",
              [
                "your own ",
                { term: "load_step", text: "load step" },
                " for that lift, replacing the equipment default",
              ],
            ],
            [
              "pin a note to an exercise",
              "durable context — a grip, a setup, a caveat — that comes back every time either of you looks at that lift",
            ],
            [
              "save or find a template",
              "block structures you can start from, yours and the stock ones",
            ],
          ],
        },
        {
          kind: "para",
          text: "Notes are the one worth doing early. Anything you write about an exercise or a session is legible to an assistant later, which makes a note a message to two readers: yourself next week, and whoever helps you plan.",
        },
      ],
      related: [
        "ug/exercises-and-templates#the-load-step",
        "ug/training-a-session#notes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-manuals-themselves",
      title: "The manuals themselves",
      summary:
        "It can search and read these pages, so an explanation of how the app works comes from the app's own words.",
      keywords: [
        "read the guide",
        "how does the app work",
        "search the manual",
        "documentation",
        "explain the app",
      ],
      blocks: [
        {
          kind: "para",
          text: "A connected assistant can search both manuals and read any section of them. That is what lets it answer how the app works without reconstructing it from what it has seen elsewhere.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "It sees the whole contents list." },
              " Every chapter and section, with a one-line summary each, so it can go to the right one rather than guessing at a search.",
            ],
            [
              { strong: "Every result carries its in-app link." },
              " Which is why an assistant can end an explanation with the section you can open and read yourself.",
            ],
            [
              { strong: "A section arrives whole." },
              " Including the parts a screen keeps folded away, and including the standing note on any section that talks about estimates.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "This is the ",
            {
              to: "ai/what-it-is#two-kinds-of-question",
              text: "second of the two domains",
            },
            ", and it touches nothing of yours: the manuals are the same words for every reader, so asking how the app works reads none of your training.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "Worth saying out loud",
          text: "When an explanation of the app matters, ask it to check the guide. An assistant that quotes a section is standing on the app's own documentation; one that does not is working from memory.",
        },
      ],
      related: [
        "ai/what-it-is#two-kinds-of-question",
        "ai/the-rules#the-engine-owns-the-numbers",
      ],
    },
  ],
};
