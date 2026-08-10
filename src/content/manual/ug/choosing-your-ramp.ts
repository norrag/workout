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
          text: "Fatigue is what limits how many hard sets a week can hold, so the two directions can arrive at similar growth: more sets a little further from failure, or fewer sets taken to it. Which one is better is settled by what you recover from, not by the sets themselves — and recovery is personal enough that it is worth finding out rather than assuming.",
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
        "Reps in reserve buy recovery, not growth — so the ramp you want is the hardest one you can repeat.",
      keywords: [
        "training style",
        "ramp examples",
        "high volume",
        "strength training",
        "maintenance",
        "which ramp should i use",
        "start rir end rir",
        "should i train to failure",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Reps left in reserve are a recovery tool, not a growth tool." },
            " Nothing about stopping short makes a set work better — it makes the set cost less. So the question a ramp answers is how much you can recover from, and if you recover well, training closer to failure more often is the productive direction. Most lifters have room there.",
          ],
        },
        {
          kind: "para",
          text: [
            "There is a second reason to visit failure now and then, and it is practical: it is the only way to find out what your own ",
            { num: "0" },
            " actually feels like. A ramp that ends there recalibrates your judgement once a block, which every estimate you report afterwards depends on.",
          ],
        },
        {
          kind: "para",
          text: [
            "Weighing fatigue, joint wear and performance together, the default ",
            { num: "3 → 0" },
            " is well supported: enough easy weeks to bank the volume, a hard finish that both earns and calibrates. Add the deload week if recovery starts slipping.",
          ],
        },
        { kind: "heading", text: "The four shapes" },
        {
          kind: "table",
          columns: ["Shape", "Set as", "For", "The cost"],
          rows: [
            [
              [{ strong: "Standard" }],
              [{ num: "3 → 0" }],
              "most blocks, most of the time",
              "none worth naming — it is the middle for a reason",
            ],
            [
              [{ strong: "Conservative" }],
              [{ num: "4 → 2" }],
              "high weekly set counts, or a joint you are working around",
              "the weight stops stepping up, and your effort reports get harder to trust",
            ],
            [
              [{ strong: "Strength-biased" }],
              [{ num: "2 → 1" }],
              "effort concentrated on the lifts that matter",
              "every accessory pays the same price unless you set its own target",
            ],
            [
              [{ strong: "Holding" }],
              [{ num: "5 → 5" }],
              "a busy stretch, or coming back from a layoff",
              "the program holds your weight rather than building it",
            ],
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "There is no best ramp",
          text: "The evidence supports the shape of the trade, not a winner. Effort and consistency are what drive progress, so pick the shape you can produce real effort on week after week — then judge it by what the block produced.",
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
      title: "Judging your own effort",
      summary:
        "Estimates get sharper the closer a set finishes to failure — which is one more reason to go there regularly.",
      keywords: [
        "rir accuracy",
        "guessing rir",
        "how do i know my rir",
        "bar speed",
        "overestimate",
        "true failure",
      ],
      blocks: [
        {
          kind: "para",
          text: "Reporting reps in reserve is a judgement, and people make it well close to failure and badly far from it. Accuracy improves as a set nears the end, drops off in long sets, and improves with practice.",
        },
        {
          kind: "para",
          text: [
            { strong: "So do not train easy all the time." },
            " Taking a set to failure now and again is how you find out what your own limit feels like, and every estimate you report afterwards is calibrated against it — yours and the program's alike.",
          ],
        },
        { kind: "heading", text: "The cue that works" },
        {
          kind: "para",
          text: "Watch how fast the bar moves. Rep speed falls off sharply as a set approaches failure, and it is a far better signal than how hard a set feels — the same trial that measured fatigue as a drop in bar speed is measuring the thing you can see mid-set. When the last rep moved noticeably slower than the one before it, you are close.",
        },
        {
          kind: "para",
          text: [
            "The rest is arithmetic you already know: count what you could have done, not what you hoped for, and ",
            {
              to: "ug/effort-rir#report-what-you-did",
              text: "report the number you actually reached",
            },
            ".",
          ],
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
        "Your set counts follow your own feedback, the weight steps only off confident sessions, and the deload is untouched.",
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
            "Set counts follow your ",
            { to: "ug/how-it-felt#workload", text: "own feedback" },
            ", not the ramp. Report a session past just right and that exercise loses a set next week; report it easy with a strong pump and it gains one. A hard ramp only reduces volume if you tell the app the sessions were too much — which is the system finding the ceiling you can actually train at.",
          ],
        },
        { kind: "heading", text: "Whether the weight steps up" },
        {
          kind: "para",
          text: [
            "The program leads your weight from a ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "strength anchor",
            },
            " built out of recent sessions, and it will only step that anchor upward off a session it can read confidently. In practice that means a session taken to ",
            { strong: "3 reps short of failure or closer" },
            ", on sets that were not extremely long.",
          ],
        },
        {
          kind: "para",
          text: [
            "So a ramp that never goes below ",
            { num: "4" },
            " keeps prescribing but holds the weight steady. That is correct for a holding block and a real cost anywhere else — the reason to pick a conservative ramp is recovery, not comfort.",
          ],
        },
        { kind: "heading", text: "What the ramp leaves alone" },
        {
          kind: "para",
          text: [
            "The deload week takes its target from the program whatever the ramp does, so a conservative block does not get a softer deload and an aggressive one does not get a harder one. Deload timing follows the block's ",
            { strong: "length" },
            " — 3 to 8 weeks, with the deload as the last of them.",
          ],
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "A set is rated moderate confidence at ",
                { num: "3" },
                " or fewer reps in reserve and ",
                { num: "12" },
                " or fewer effective reps (",
                { code: "e1rm.mod_max_rir" },
                ", ",
                { code: "e1rm.mod_max_eff_reps" },
                "), and a step is offered only from an anchor rated moderate or better (",
                { code: "progression.min_confidence" },
                "). An anchor takes the best rating in its session, so one qualifying set carries it.",
              ],
            },
          ],
        },
      ],
      related: ["ug/how-it-felt#workload", "ug/deloads#what-a-deload-is"],
    },
  ],
};
