// User Guide — chapter 7, "Choosing your ramp: training styles" (doc 22 §5, §6.3).
//
// GROUND TRUTH: `docs/reviews/2026-08-11-rir-ramps-and-training-styles.md` —
// the doc 22 Phase 3d-r research pass, which is this chapter's only evidence
// source (doc 22 §6.3: "prose is written from that review, not from the open
// web"). Its §5 is the denylist this chapter was written against:
//   - NO "gains flatten past 1–2 RIR" — the meta-regression found a continuing
//     gradient, not a plateau. Write the TRADE (review §2.2), which is the
//     stronger argument and the one doc 10 §4 should have made
//   - NO measuring band / `max_measuring_rir` — v26 is inactive (22b §4.1 ①).
//     The live mechanism this chapter uses instead is the CONFIDENCE ladder,
//     which predates doc 21 and gates the earned step (review §3.1)
//   - NO automatic deload, no MRV stop — not implemented (22b §7); ch. 11 owns
//     what the app actually does week to week
//   - NO named third-party program — review §6 takes doc 22 O7's recommendation
//     at its conservative end
//   - NO week-level RIR above 5 — the control is 0–5 (review §1); above that is
//     ch. 8's per-exercise lever
//
// SEAMS: ch. 6 owns the ramp CONTROLS (start/end, the per-week schedule, the
// deload's own target) and this chapter links to them rather than restating
// them — §8.4b rule 3. Ch. 8 owns the per-exercise lever; ch. 11 owns how a set
// count actually moves; ch. 9 owns the deload; ch. 10 owns the weight.
//
// Claims are registered in `docs/22a-manual-claims.md` (`C-ramp-07` onward).

import type { ManualChapter } from "../types";

export const UG_CHOOSING_YOUR_RAMP: ManualChapter = {
  manual: "ug",
  slug: "choosing-your-ramp",
  number: 7,
  title: "Choosing your ramp: training styles",
  summary:
    "What effort buys and what it costs, the four ramp shapes and what each is for, and what else in the app moves when you change one.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "effort-and-fatigue",
      title: "What working closer to failure buys",
      summary:
        "A little more growth, the same strength, and a great deal more fatigue.",
      keywords: [
        "close to failure",
        "training to failure",
        "how hard should i train",
        "fatigue",
        "proximity to failure",
        "is failure better",
      ],
      blocks: [
        {
          kind: "para",
          text: "Three findings, and the ramp follows from them. Strength gains hold up across a wide range of distances from failure. Muscle growth improves a little as sets finish closer to it. Fatigue climbs steeply the whole way.",
        },
        {
          kind: "para",
          text: "The third one is measurable within minutes. In a bench-press trial, lifters did six sets at the same load and stopped at three different distances from failure; bar speed was then tested a few minutes later.",
        },
        {
          kind: "table",
          columns: ["Sets stopped at", "Drop in bar speed after"],
          rows: [
            [[{ num: "3" }, " reps short of failure"], [{ num: "−8%" }]],
            [[{ num: "1" }, " rep short of failure"], [{ num: "−13%" }]],
            ["failure", [{ num: "−25%" }]],
          ],
        },
        { kind: "heading", text: "Why that is a trade rather than a rule" },
        {
          kind: "para",
          text: "Fatigue is what limits how many hard sets a week can hold. So a week of more sets a little further from failure and a week of fewer sets at failure can buy much the same growth — and the second one costs more to recover from.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "The growth advantage is small",
          text: "Pooled across studies, training to failure beat stopping short by a trivial margin, and the studies estimated how close each set came to failure rather than measuring it. Treat the direction as sound and the size as loose.",
        },
      ],
      related: [
        "ug/choosing-your-ramp#why-a-ramp",
        "ug/choosing-your-ramp#four-shapes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "why-a-ramp",
      title: "Why a block ramps instead of picking one effort",
      summary:
        "Early weeks bank sets cheaply, late weeks spend the budget, and the deload settles the bill.",
      keywords: [
        "why ramp",
        "3 to 0",
        "default ramp",
        "training to failure every week",
        "peak week",
        "progressive intensity",
      ],
      blocks: [
        {
          kind: "para",
          text: "A block has a fatigue budget, and a ramp decides when it gets spent. Early weeks sit further from failure, which is cheap, so a lot of sets fit. Later weeks move in, when there is a deload close enough behind them to clear what they cost.",
        },
        {
          kind: "para",
          text: "A whole block trained at failure spends the budget every week and buys only the small per-set advantage above. A whole block trained far from failure never spends it. The ramp is the middle, and it is the middle for a reason rather than by tradition.",
        },
        { kind: "heading", text: "Zero is a ceiling, not a target" },
        {
          kind: "para",
          text: [
            "The default ramp ends at ",
            { num: "0" },
            " reps in reserve on the final working week. That is the hardest the block ever asks, reached once, with the deload next — a peak rather than the routine setting.",
          ],
        },
        {
          kind: "para",
          text: [
            { num: "3 → 0" },
            " is one shape among several, and you choose it. The controls sit in the mesocycle's details sheet while the block is still planned: ",
            {
              to: "ug/effort-rir#the-weeks-ramp",
              text: "start and end values, or a value per week",
            },
            ". This chapter is about which shape to pick.",
          ],
        },
      ],
      related: [
        "ug/effort-rir#the-weeks-ramp",
        "ug/choosing-your-ramp#four-shapes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "four-shapes",
      title: "Four ramps, and what each is for",
      summary:
        "Standard, conservative, strength-biased and holding — each with the trade it makes.",
      keywords: [
        "training style",
        "ramp examples",
        "high volume",
        "strength training",
        "maintenance",
        "which ramp should i use",
        "start rir end rir",
      ],
      blocks: [
        {
          kind: "para",
          text: "Four shapes cover most of what people want from a block. None of them is the correct one — each buys something and charges for it.",
        },
        {
          kind: "table",
          columns: ["Shape", "Set as", "What it is for", "What it costs"],
          rows: [
            [
              [{ strong: "Standard" }],
              [{ num: "3 → 0" }, " or ", { num: "3 → 1" }],
              "the trade above, spent late in the block",
              "nothing distinctive — it is the middle",
            ],
            [
              [{ strong: "Conservative" }],
              [{ num: "4 → 2" }, " or ", { num: "5 → 3" }],
              "more weekly sets are recoverable; easier on joints",
              "softer numbers, and at an end value of 4 or above the program stops stepping the weight up",
            ],
            [
              [{ strong: "Strength-biased" }],
              [{ num: "2 → 1" }, ", or flat"],
              "effort concentrated on the lifts that matter, spared elsewhere",
              "it needs per-exercise targets to spare the accessories",
            ],
            [
              [{ strong: "Holding" }],
              [{ num: "4 → 4" }, " or ", { num: "5 → 5" }],
              "keeps the pattern and the volume while fatigue clears or life is busy",
              "the program holds the weight rather than building it",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The strength-biased row leans on ",
            {
              to: "ug/exercise-level-rir#why-one-exercise-differs",
              text: "per-exercise targets",
            },
            ", because a flat ramp on its own charges a curl the same effort as a squat. That is chapter 8, and the two levers are one system.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "There is no best ramp",
          text: "The evidence supports the shape of the trade and not a winner. Pick for what the block is for, run it, and judge it on what the block produced.",
        },
      ],
      related: [
        "ug/exercise-level-rir#why-one-exercise-differs",
        "ug/choosing-your-ramp#what-else-a-ramp-moves",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "judging-your-own-effort",
      title: "Easy weeks are harder to judge",
      summary:
        "Reports get less accurate the further a set finishes from failure, and reports are what price the next one.",
      keywords: [
        "rir accuracy",
        "guessing rir",
        "how do i know my rir",
        "overestimate",
        "beginner",
        "conservative block",
      ],
      blocks: [
        {
          kind: "para",
          text: "Reporting reps in reserve is a judgement, and it is a judgement people make well close to failure and poorly far from it. Accuracy improves as a set nears the end, and it falls away in long sets and in lifters new to the scale.",
        },
        {
          kind: "para",
          text: [
            "That matters here because the report is not a diary entry. It ",
            {
              to: "ug/effort-rir#why-honesty-matters",
              text: "prices the next session",
            },
            ", so a block spent a long way from failure is a block whose numbers rest on the softest judgements you make.",
          ],
        },
        { kind: "heading", text: "What to do about it" },
        {
          kind: "list",
          items: [
            "Report what the set actually felt like, including when the answer flatters you less than the ask did.",
            "Treat a conservative block's estimates as looser than a hard block's, rather than as wrong.",
            "If you are new to judging effort, a middle ramp gives you more sets near the end of a set, which is where the judgement gets easier to make.",
          ],
        },
        {
          kind: "para",
          text: "This is an argument for choosing an easy ramp deliberately, for a reason you can name, rather than settling there because it is comfortable.",
        },
      ],
      related: [
        "ug/effort-rir#report-what-you-did",
        "ug/choosing-your-ramp#what-else-a-ramp-moves",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-else-a-ramp-moves",
      title: "What else a ramp moves",
      summary:
        "Your set counts, whether the program steps the weight up, and — deliberately — not the deload.",
      keywords: [
        "ramp effects",
        "set count",
        "harder ramp more volume",
        "no progression",
        "weight not increasing",
        "deload rir",
      ],
      estimate: true,
      blocks: [
        {
          kind: "para",
          text: [
            "A harder ramp raises how hard the week feels, and how hard the week feels is a ",
            { to: "ug/how-it-felt#workload", text: "question the app asks you" },
            ". Report a session past just right and the exercise loses a set next week. So a harder ramp tends to buy fewer sets, not more.",
          ],
        },
        { kind: "heading", text: "Whether the weight steps up" },
        {
          kind: "para",
          text: [
            "The program leads your weight from a ",
            {
              to: "ug/effort-rir#why-honesty-matters",
              text: "strength anchor built out of recent sets",
            },
            ", and how much it trusts that anchor depends on how the sets were run. Sets more than ",
            { num: "3" },
            " reps short of failure (",
            { code: "e1rm.mod_max_rir" },
            ") land in the lowest confidence band.",
          ],
        },
        {
          kind: "para",
          text: [
            "A step up is only taken off an anchor of moderate confidence or better (",
            { code: "progression.min_confidence" },
            "). A ramp that never goes below ",
            { num: "4" },
            " therefore holds the weight steady and keeps prescribing — which is the right behavior for a holding block, and worth knowing before you choose one.",
          ],
        },
        { kind: "heading", text: "What the ramp leaves alone" },
        {
          kind: "para",
          text: [
            "The deload week takes its target from the program, whatever the ramp does — a conservative block does not get a softer deload, and an aggressive one does not get a harder one. Deload timing follows the block's ",
            { strong: "length" },
            ", which is 3 to 8 weeks with the deload as the last of them.",
          ],
        },
      ],
      related: ["ug/how-it-felt#workload", "ug/deloads#when-you-need-one"],
    },
  ],
};
