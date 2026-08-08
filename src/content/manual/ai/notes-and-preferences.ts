// AI Manual — chapter 11, "Notes, exclusions and preferences" (doc 22 §7).
//
// The quieter capabilities. They are grouped together because they share one
// property that is the chapter's whole argument: each is a durable instruction
// the reader gives once and the app keeps applying — the opposite of advice
// that has to be remembered.
//
// **Run against the live connector** on 2026-08-13: `get_exclusions` returned
// `count: 0` with the standing rule attached (*"Excluded exercises never appear
// in pickers — do not recommend them"*), which is what an unused lever looks
// like and is why §2 leads with what it is for rather than with how to read one.
//
// GROUND TRUTH (`22d` §3.5, §3.6):
//   - `log_note` sets or clears the PINNED note on an exercise; per-session
//     notes are written in the live workout instead — two different notes
//   - `set_exercise_increment` indexes the steps off the last weight actually
//     entered (with a 10 lb step, 88 lb goes to 98 or 78, not to 90), refreshes
//     prescriptions on next view without touching logged history, and is
//     pointless for bodyweight-only lifts where the engine progresses reps
//   - `get_exercise_affinity` returns frequency, recency, loads and volume with
//     each movement's pinned note and averaged joint pain / workload / pump
//   - `manage_exclusions` carries a reason; excluded movements never appear in
//     pickers and are never recommended
//
// Claims: `C-aipref-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_NOTES_AND_PREFERENCES: ManualChapter = {
  manual: "ai",
  slug: "notes-and-preferences",
  number: 11,
  title: "Notes, exclusions and preferences",
  summary:
    "The settings that make the app fit you — each one said once to an assistant, and applied from then on.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "notes",
      title: "Notes it will read later",
      summary:
        "A pinned note on an exercise is durable context both of you see; a session note belongs to the day it was written.",
      keywords: [
        "notes",
        "pinned note",
        "remember",
        "context",
        "grip",
        "setup",
        "log a note",
      ],
      blocks: [
        {
          kind: "para",
          text: "Two kinds of note exist and they do different jobs. A note pinned to an exercise is permanent context about how you run that movement — the grip, the seat height, the caveat. A note on a session belongs to that day and describes it.",
        },
        {
          kind: "para",
          text: [
            "An assistant can set or clear the ",
            { strong: "pinned" },
            " one for you. Session notes stay where they are written, in the workout itself.",
          ],
        },
        { kind: "heading", text: "Why this is worth the minute" },
        {
          kind: "para",
          text: [
            "Both kinds are legible to an assistant later, which makes a note ",
            {
              to: "ug/training-a-session#notes",
              text: "a message to two readers",
            },
            ": yourself next month, and whoever helps you plan the block after this one. A note explaining why an exercise is running light is the difference between a plan that respects a decision you made and one that quietly undoes it.",
          ],
        },
        {
          kind: "para",
          text: "So the useful habit is to say the reason out loud when you ask for a change, and let it pin the reason next to the change.",
        },
      ],
      related: [
        "ai/coaching#a-niggle-becomes-an-assignment",
        "ug/training-a-session#notes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "exclusions",
      title: "Movements you would rather not do",
      summary:
        "An exclusion takes a movement out of every picker and out of every recommendation, with your reason attached.",
      keywords: [
        "exclude",
        "never suggest",
        "hate this exercise",
        "cannot do",
        "remove from pickers",
        "injury",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Some movements are off the table — a bad knee, a machine your gym lacks, a lift you have never got on with. Say so once: ",
            { strong: "stop suggesting back squats, my knee objects" },
            ".",
          ],
        },
        {
          kind: "para",
          text: "An excluded movement stops appearing in the app's pickers and stops being offered by any assistant, which is the point: the rule travels with your account rather than with the conversation you happened to mention it in.",
        },
        {
          kind: "para",
          text: "The reason travels with it, and it is worth giving a real one. A knee that objects today may not object in a year, and an exclusion whose reason you can still read is one you can revisit deliberately. Removing an exclusion is the same kind of sentence in reverse.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "Excluding is not deleting",
          text: "The movement stays in the library with your history on it intact. What changes is whether it gets offered to you.",
        },
      ],
      related: [
        "ai/notes-and-preferences#per-exercise-settings",
        "ug/exercises-and-templates#finding-an-exercise",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "per-exercise-settings",
      title: "Per-exercise settings",
      summary:
        "Your own load step, your own movements, and the tolerance profile an assistant uses to pick exercises that suit you.",
      keywords: [
        "load step",
        "increment",
        "custom exercise",
        "add an exercise",
        "affinity",
        "which exercises suit me",
      ],
      blocks: [
        {
          kind: "para",
          text: "Three more levers, each said once and applied from then on.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Your own load step." },
              " How much a given lift goes up by when you meet the ask, replacing the equipment default. It steps from the last weight you actually entered, so an unusual starting weight stays yours rather than being rounded onto a grid.",
            ],
            [
              { strong: "Movements of your own." },
              " A machine your gym has and the library does not: name it, say what it trains and what it loads with, and it is available everywhere the stock library is.",
            ],
            [
              { strong: "What suits you." },
              " An assistant can read which movements you actually train, how often, and how they have treated you — the average joint pain, workload and pump each one has drawn — and use that to suggest work you are likely to tolerate.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Changing a load step re-prices your upcoming prescriptions the next time you look at them. Sessions you have already logged are ",
            { strong: "untouched" },
            " — the setting changes what is asked next, never what happened.",
          ],
        },
        {
          kind: "para",
          text: "The load step is for lifts where you add weight. On bodyweight movements the program progresses reps instead, so setting one there changes nothing.",
        },
      ],
      related: [
        "ug/exercises-and-templates#the-load-step",
        "ug/exercises-and-templates#your-own-exercises",
      ],
    },
  ],
};
