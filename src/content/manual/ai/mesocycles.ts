// AI Manual — chapter 6, "Use case: a block" (doc 22 §7, §7.1).
//
// Second worked example. **Every exchange below was run against the live
// connector** on 2026-08-13 (§7.1), including the write half:
//
//   - `create_mesocycle` — a real 4-week, 2-day draft was created from scratch
//     (days → muscle-group blocks → exercise ids), and came back:
//     *"drafted mesocycle … (4 wk, 2 day/wk) as planned. Review and start it
//     in-app; the engine sets the numbers on activation."*
//   - `preview_mesocycle_volume` — run **twice**: once on a proposed `days`
//     spec with no ids and nothing written, and once on the created draft. The
//     second is where fractional counting shows itself: two exercises produced
//     `shoulders 1.5` and `biceps 1.5` off their secondary muscles alone
//   - a plausible 4-day plan came back **below MEV on seven groups**, which is
//     §2's whole point and was not arranged — it is what the first spec I wrote
//     actually returned
//   - `delete_mesocycle` — the draft was removed (*"deleted a planned
//     mesocycle"*) and `get_macrocycles` re-read to confirm
//     `standalone_mesocycles: []`. The owner's account is as it was found
//
// GROUND TRUTH beyond the run (`22d` §3.4, §7 K2; `tools/authoring.ts`):
//   - `preview_mesocycle_volume` performs NO mutation — never imply it writes
//   - `activate_mesocycle` needs `confirm="activate"` and its own description
//     prefers in-app activation; within a macro, activation is sequential
//   - `edit_mesocycle` reaches a LIVE block's board and the three doc-21 levers
//   - `duplicate_mesocycle` carries structure, not loads — the engine reseeds
//
// Claims: `C-aimeso-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_MESOCYCLES: ManualChapter = {
  manual: "ai",
  slug: "mesocycles",
  number: 6,
  title: "Use case: a block",
  summary:
    "Drafting a training block by describing it, checking it against your volume landmarks before it starts, and reshaping one you are already running.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-ask",
      title: "The ask",
      summary:
        "Describe the block you want; what arrives is a draft with your structure and the app's numbers still to come.",
      keywords: [
        "create a block",
        "new mesocycle",
        "plan my training",
        "split",
        "four days",
        "draft a block",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Build me a four-week block, two days a week, upper and lower, ramping from 3 RIR to 1." },
            " A sentence like that is a complete brief: it names the length, the split, and the effort ramp, which is everything the app needs you to decide.",
          ],
        },
        {
          kind: "para",
          text: "There are two ways it can build. From one of your templates, which is the fast path when you are running something back. Or from scratch, day by day — each day a set of muscle-group blocks, each block a few exercises out of the library.",
        },
        { kind: "heading", text: "What comes back" },
        {
          kind: "para",
          text: [
            "A planned block, with a line saying so: ",
            { strong: "review and start it in-app; the engine sets the numbers on activation" },
            ". The weights, reps and set counts are absent on purpose — they are computed from your recent sets at the moment the block starts, so a draft made three weeks early would only be stale.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "Slot it, or leave it standing alone",
          text: "Say which macrocycle it belongs to and it fills the earliest open slot. Say nothing and it is a standalone block you can place later — which is also how you build the one block that runs beside your main arc.",
        },
      ],
      related: [
        "ai/mesocycles#the-volume-check",
        "ug/planning-a-mesocycle#the-planner-board",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-volume-check",
      title: "The check before you commit",
      summary:
        "A plan can be projected against your volume landmarks with nothing written, and a sensible-looking split often fails it.",
      keywords: [
        "volume check",
        "mev",
        "enough sets",
        "is my plan good",
        "preview",
        "under-trained",
        "landmarks",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Ask ",
            { strong: "check that plan against my volume landmarks" },
            " before you start anything. It projects the week-1 sets each muscle would get and compares them to your own ",
            { term: "volume_landmarks", text: "MEV and MRV" },
            ", writing nothing at all.",
          ],
        },
        {
          kind: "para",
          text: [
            "It is worth doing because plans fail this more often than they look like they will. A four-day split with three or four exercises a day — the sort of thing that reads as a full week — came back ",
            { strong: "below MEV on seven muscle groups" },
            ", back and quads among them.",
          ],
        },
        { kind: "heading", text: "The number that surprises people" },
        {
          kind: "para",
          text: [
            "Muscles you did not train directly still appear. In the draft this chapter is written from, two exercises produced ",
            { num: "1.5" },
            " weekly sets for shoulders and the same for biceps — the ",
            {
              to: "ug/volume#why-a-set-can-count-as-half",
              text: "half-credit each set gives a secondary muscle",
            },
            ". So a plan can be closer to adequate than it looks, and the check is what tells you which.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A guide to weak points, not a prescription",
          text: "The landmarks are population starting points scaled to your experience, and individual variation around them is wide. Read a group sitting below the floor as worth a second look rather than as a verdict.",
        },
      ],
      related: [
        "ug/volume#the-band",
        "ug/planning-a-mesocycle#the-volume-check",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "reviewing-and-starting",
      title: "Reviewing it, and starting it",
      summary:
        "The draft lands in Cycles for you to open, change and start — and starting it is the step the app would rather you took yourself.",
      keywords: [
        "review",
        "start the block",
        "activate",
        "planned",
        "approve",
        "where did it go",
      ],
      blocks: [
        {
          kind: "para",
          text: "Whatever an assistant built, read it on the planner board before it means anything. That is the screen where the block's shape is legible at a glance — days across, muscle-group blocks down, an exercise per row — and where changing a slot takes one tap.",
        },
        {
          kind: "para",
          text: [
            "Starting it is deliberately a separate act. An assistant can do it and has to confirm in so many words; the tool it would use carries the app's own preference, which is that ",
            { strong: "you start blocks in the app" },
            ". The reason is that starting is when the program seeds week 1 off your recent sets, and it is worth being the person present when that happens.",
          ],
        },
        { kind: "heading", text: "Order matters inside an arc" },
        {
          kind: "para",
          text: "Within a macrocycle, blocks start in sequence: a later block waits for the one before it to finish. That is what lets each block's opening weights come from the results of the block before rather than from a guess made months earlier.",
        },
        {
          kind: "para",
          text: "A draft you decide against can be removed by asking, as long as nothing has been logged into it.",
        },
      ],
      related: [
        "ug/planning-a-mesocycle#naming-and-starting",
        "ai/the-rules#plans-arrive-as-drafts",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "changing-a-running-block",
      title: "Changing a block you are running",
      summary:
        "A live block is editable through the connector too — days, exercises, sets, and the per-exercise effort levers.",
      keywords: [
        "edit my block",
        "swap an exercise",
        "add a day",
        "change sets",
        "mid-block",
        "duplicate",
        "run it back",
      ],
      blocks: [
        {
          kind: "para",
          text: "Blocks do not survive contact with real weeks. An assistant can restructure the one you are in, not only the ones you have not started: add or remove a day, swap an exercise for one your shoulder prefers, reorder the board, change a starting set count.",
        },
        {
          kind: "para",
          text: [
            "It also reaches the three per-exercise levers — an ",
            {
              to: "ug/exercise-level-rir#why-one-exercise-differs",
              text: "effort target for one exercise",
            },
            ", a cap on its working sets, and where in the rep range it sits. Those are what turn ",
            { strong: "go easier on incline press for a fortnight" },
            " into an assignment the program actually follows.",
          ],
        },
        { kind: "heading", text: "Running one back" },
        {
          kind: "para",
          text: "A block that worked can be cloned into a fresh draft and varied. The structure carries; the loads do not, because the new block reseeds from where you are now rather than from where you were when the old one started.",
        },
        {
          kind: "para",
          text: "Sessions you have already logged in the block stay as they are through all of this. Editing changes what is asked of you next, and never what you did last week.",
        },
      ],
      related: [
        "ai/coaching#the-ask",
        "ug/planning-a-mesocycle#editing-a-running-block",
      ],
    },
  ],
};
