// AI Manual — chapter 5, "Use case: a macrocycle" (doc 22 §7, §7.1).
//
// The first of the four worked examples. §7.1 is an acceptance criterion, not a
// style note: **every exchange below was run against the live connector** on
// 2026-08-13, and the numbers are that run's, lightly generalized per O5.
//
// WHAT WAS RUN, and what came back:
//   - `create_macrocycle` — **refused**, and the refusal is the section. With a
//     macrocycle already running it returns: *"…is still running — a macrocycle
//     is one long-term direction at a time, so end it before starting another.
//     (A standalone mesocycle can run alongside it.)"* That is a better §1 than
//     a successful draft would have been: it is the rule a reader meets first
//   - `get_macrocycle_summary` — target 9.6–14.4 lb over 6 months (1.6–2.4 a
//     month), `is_estimate: true`, `recommended_duration_months: 4` against a
//     chosen 6; timeline of five blocks; stats 49 sessions, 94% adherence,
//     +2.6% est. strength; `muscle_group_progress` from +14.3% (triceps) to
//     −12.2% (back)
//   - `get_macrocycles` — the structural map, five macrocycles deep
//
// THE LOAD-BEARING FACT (`22a` `D-15`): the target band is computed, stored,
// and **hidden on every screen** pending N54/N43. The connector is the only
// surface that returns it, which is what makes this chapter's §2 worth its
// space rather than a restatement of User Guide ch. 14.
//
// A cleanup note for whoever re-runs these: a throwaway block was drafted and
// deleted in the same session (ch. 6), and `get_macrocycles` was re-read
// afterwards to confirm `standalone_mesocycles: []`.
//
// Claims: `C-aimac-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_MACROCYCLES: ManualChapter = {
  manual: "ai",
  slug: "macrocycles",
  number: 5,
  title: "Use case: a macrocycle",
  summary:
    "Setting up a months-long goal arc through an assistant, reading the target it computes, and managing the arc once it is running.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-ask",
      title: "The ask",
      summary:
        "What to say to start an arc, what you decide, and what the app computes the moment you have said it.",
      keywords: [
        "start a macrocycle",
        "new goal",
        "gain muscle",
        "how do i plan months",
        "long term",
        "bulk",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "I want to put on size over the next four months." },
            " That is enough. What an assistant needs from you is the direction, the horizon, and how long you like your blocks to run; everything after that is computed rather than chosen.",
          ],
        },
        {
          kind: "table",
          columns: ["Yours to decide", "Computed for you"],
          rows: [
            [
              "the goal — size, strength, leaning out, or holding",
              "a realistic target range for that goal, personalized to your profile",
            ],
            [
              "how many months you want to give it",
              "how many months it actually warrants, which may be fewer",
            ],
            [
              "how long a block runs, three to eight weeks",
              "how many blocks fit, and a suggested phase for each",
            ],
          ],
        },
        { kind: "heading", text: "One direction at a time" },
        {
          kind: "para",
          text: "Asking for a second arc while one is running is declined, in those words: a macrocycle is one long-term direction at a time, so the running one ends before another starts. A standalone block can run beside it, which is the room the rule leaves for rehab work or anything that has to happen alongside the plan rather than instead of it.",
        },
        {
          kind: "para",
          text: "The arc arrives with empty slots where its blocks will go. Filling them is chapter 6's job, and they can be filled one at a time as you get to them.",
        },
      ],
      related: [
        "ai/macrocycles#reading-the-target",
        "ug/macrocycle-goals#the-four-goals",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "reading-the-target",
      title: "Reading the target it sets",
      summary:
        "The target range and monthly rate are computed from your profile, and asking is how you see them.",
      estimate: true,
      keywords: [
        "target",
        "how much can i gain",
        "realistic",
        "rate",
        "per month",
        "goal range",
        "expectations",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Ask ",
            { strong: "what is my macrocycle actually targeting?" },
            " and you get a range rather than a number. For a six-month size arc it came back as roughly ",
            { num: "10–14" },
            " lb, which is ",
            { num: "1.6–2.4" },
            " lb a month — worked out from your bodyweight, leanness, experience and training age rather than from a rule of thumb.",
          ],
        },
        {
          kind: "para",
          text: [
            "It also returns the timeframe it would have recommended. In that same arc the answer was ",
            { num: "4" },
            " months against the ",
            { num: "6" },
            " that were asked for, which is the app saying the goal is reachable sooner than the horizon set for it.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A band, and it is meant to be one",
          text: "The range is a model of what someone with your profile can expect, not a promise about you. Read the low end as the one to plan against, and the width of the band as the honest uncertainty in the model.",
        },
        {
          kind: "para",
          text: [
            "This is the clearest case in the manual of the connector reaching something the screens do not print. The band ",
            {
              to: "ug/macrocycle-goals#the-target-behind-it",
              text: "does two jobs in the background",
            },
            " — it paces your weights and it grades the arc at the end — and asking is how you read it.",
          ],
        },
      ],
      related: [
        "ug/macrocycle-goals#the-target-behind-it",
        "ug/macrocycle-goals#how-it-paces-your-weights",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "managing-the-arc",
      title: "Managing it once it is running",
      summary:
        "Reshaping slots, changing the goal, and what stays untouched when the arc recomputes around you.",
      keywords: [
        "change my goal",
        "add a block",
        "reorder",
        "extend",
        "shorten",
        "reshape",
        "mid-cycle",
      ],
      blocks: [
        {
          kind: "para",
          text: "An arc set up in April rarely survives June unamended. Three kinds of change are available by asking, and each is careful about what it leaves alone.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Reshape the slots." },
              " Add an empty one, drop an empty one, reorder them, or take a standalone block you have already built and place it into a slot.",
            ],
            [
              { strong: "Change the goal or the horizon." },
              " The target and the suggested phases recompute; only the empty slots reconcile to the new shape.",
            ],
            [
              { strong: "Undo a mistake." },
              " An arc you created and never trained under can be removed with its empty placeholders.",
            ],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "What recomputing never touches",
          text: "Blocks you have planned, started or finished stay exactly as they are. Changing the goal changes the arc around them, and the training you already did is not part of what moves.",
        },
        {
          kind: "para",
          text: "So the honest version of a mid-arc conversation is worth having out loud: tell it what has changed about your life, ask what that does to the arc, and read the two answers — the new target, and which slots it proposes to move.",
        },
      ],
      related: [
        "ai/macrocycles#checking-in-on-it",
        "ai/the-rules#your-record-stands",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "checking-in-on-it",
      title: "Checking in on it",
      summary:
        "The arc-level rollup — adherence, estimated strength, and which muscles moved — and the one question that makes it useful.",
      estimate: true,
      keywords: [
        "how is it going",
        "progress",
        "am i on track",
        "review",
        "macro stats",
        "muscle progress",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "How is this macrocycle going?" },
            " returns the arc as a whole rather than the block you are in: how many sessions you logged, what share of the planned ones that was, an estimated strength change across the arc, and the same change broken down per muscle.",
          ],
        },
        {
          kind: "para",
          text: [
            "In the run this chapter is written from that was ",
            { num: "49" },
            " sessions at ",
            { num: "94" },
            "% adherence and ",
            { num: "+2.6" },
            "% estimated strength — with the per-muscle spread running from ",
            { num: "+14" },
            "% on triceps to ",
            { num: "−12" },
            "% on back. The spread is the interesting part, and the headline number is the average that hides it.",
          ],
        },
        {
          kind: "para",
          text: [
            "So the follow-up worth asking every time is ",
            { strong: "which of those are comparable?" },
            " A muscle whose main lift moved day-slots, or one whose numbers span a cut and a bulk, will show a change that is about the comparison rather than about you. Chapter 7 is that question done properly.",
          ],
        },
        {
          kind: "link",
          to: "ai/analysis#when-a-number-lies",
          label: "When a number is not what it looks like",
        },
      ],
      related: [
        "ai/analysis#when-a-number-lies",
        "ug/reading-your-stats#the-strength-trend",
      ],
    },
  ],
};
