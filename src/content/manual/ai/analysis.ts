// AI Manual — chapter 7, "Use case: is this working?" (doc 22 §7, §7.1).
//
// Third worked example, and the one the whole manual points at: doc 22 §7 says
// ch. 7 "should teach the reader to *ask for* [the comparability guards], not
// just receive them" (`22d` §3.2).
//
// **Run against the live connector** on 2026-08-13. The example is not
// constructed — it is what came back for one real lift, and it is close to a
// perfect teaching case:
//
//   - `analyze_exercise_progress` on a pulldown returned `change_pct: -22.7`,
//     `trend: "declining"`, `stalled: true` for the current phase…
//   - …and `matched_rir` in the same payload showed **+10.1% / +10.1% / +7.1%
//     / +10.5%** against the previous block at target RIR 0 / 1 / 2 / 3
//   - plus `day_slots` (three slots, one reading −26.1% and one +5%),
//     `fatigue_position` (`varies: true`, positions 3–10), and `phases`
//     (33 hypertrophy / 36 cut / 19 hypertrophy sessions)
//   - `compare_mesocycles` on two real blocks: 14.7 → 19.5 sets per workout,
//     avg fatigue 4.9 → 5.4, avg performance 6.2 → 5.7, adherence 100% both,
//     with an explicit warning that one block is incomplete so the per-workout
//     RATES are the comparable figures rather than the totals
//   - `get_muscle_balance` on the live block: push:pull 1.4:1, every group in
//     the MEV–MAV zone, glutes lowest at 5.3 weekly sets
//
// K1 NOTE (`22d` §7): the analysis payload's own `estimates` string says
// "Epley-based" while its `metric_definitions` says "Epley·Brzycki" — the two
// disagree inside one response. The manual states the engine's behavior (the
// average) and quotes neither string; recorded as `D-19`.
//
// Claims: `C-aiana-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_ANALYSIS: ManualChapter = {
  manual: "ai",
  slug: "analysis",
  number: 7,
  title: "Use case: is this working?",
  summary:
    "Asking whether a lift is really moving — and the four questions that separate a genuine stall from two numbers that were never comparable.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-ask",
      title: "The ask",
      summary:
        "One lift, one question, and the shape of the answer that comes back.",
      estimate: true,
      keywords: [
        "am i getting stronger",
        "progress",
        "is it working",
        "trend",
        "analysis",
        "one lift",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Am I actually getting stronger on pulldowns?" },
            " is the question this chapter is built around, and it is worth asking of one lift at a time. A whole-body version returns an average, and averages are where the interesting thing hides.",
          ],
        },
        {
          kind: "para",
          text: "What comes back for a single lift is more than a trend line. It carries the same figures split four different ways, because the same sessions can honestly support more than one answer.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "By phase." },
              " Sessions grouped into contiguous runs of the same goal, so a bulk and a cut are never averaged together.",
            ],
            [
              { strong: "At matched effort." },
              " This block against the previous one, compared at the same prescribed effort target.",
            ],
            [
              { strong: "By day slot." },
              " A lift trained on two days is two series, not one sawtooth.",
            ],
            [
              { strong: "By position." },
              " Where in the session it sits, and whether that has moved.",
            ],
          ],
        },
        {
          kind: "para",
          text: "The headline trend is the current phase only, over a rolling window of recent sessions rather than the latest one. That alone removes most of the noise. The next section is what to do about the rest.",
        },
      ],
      related: [
        "ai/analysis#when-a-number-lies",
        "ug/reading-your-stats#one-lift-at-a-time",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "when-a-number-lies",
      title: "When a number is not what it looks like",
      summary:
        "A real lift read as down 23% and stalled — and up 10% against the same block a month earlier. Both numbers were correct.",
      estimate: true,
      keywords: [
        "stalled",
        "declining",
        "getting weaker",
        "regression",
        "comparability",
        "why is it down",
        "confusing",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "This is a real read. One lift came back ",
            { num: "−22.7" },
            "% for the phase, flagged declining and stalled — the kind of answer that makes you change your programme.",
          ],
        },
        {
          kind: "para",
          text: [
            "The same response also compared this block against the previous one ",
            { strong: "at each matched effort target" },
            ", and every one of those was up: ",
            { num: "+10" },
            "%, ",
            { num: "+10" },
            "%, ",
            { num: "+7" },
            "%, ",
            { num: "+11" },
            "%. Like for like, against the last time the same demand was made, the lift had moved forward all block.",
          ],
        },
        { kind: "heading", text: "How both are true" },
        {
          kind: "para",
          text: "The phase trend was measured from an unusually good session at the start of it. The matched comparison was measured against the same week of the block before. Neither is wrong; they answer different questions, and only one of them is the question you meant.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "The habit worth forming",
          text: "When an assistant tells you a lift is declining, ask what it looked like at matched effort and per day slot before you act. The evidence is already in the response it read — the question is whether it used all of it.",
        },
      ],
      related: [
        "ai/analysis#the-four-questions",
        "ug/reading-your-stats#reading-like-with-like",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-four-questions",
      title: "The four questions to ask",
      summary:
        "Phase, matched effort, day slot and session position — the comparability checks worth making a habit.",
      estimate: true,
      keywords: [
        "questions to ask",
        "how to check",
        "like with like",
        "day slot",
        "fatigue position",
        "phase",
        "prompt",
      ],
      blocks: [
        {
          kind: "para",
          text: "Four questions cover nearly every way a strength number misleads. Ask them in this order and most apparent regressions resolve before you have changed anything.",
        },
        {
          kind: "table",
          columns: ["Ask", "Because"],
          rows: [
            [
              "does this span a cut and a bulk?",
              "strength read during a deficit is not comparable to strength read during a surplus, and a lifetime figure quietly mixes them",
            ],
            [
              "what does it look like at matched effort?",
              "a week prescribed at 3 reps in reserve and a week prescribed at 0 are different demands. Matching them is the closest thing to a controlled comparison you have",
            ],
            [
              "is this lift trained on more than one day?",
              "two slots at different loads pool into a zig-zag that reads as instability. Per slot, each one is usually a clean line",
            ],
            [
              "where in the session does it sit?",
              "a lift that moved from third to eighth is being trained tireder. The load reflects the position, not a loss",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "In the real read above, three of the four applied at once: the lift spanned a cut, sat in three different day slots, and moved between positions ",
            { num: "3" },
            " and ",
            { num: "10" },
            " across weeks. A single trend line was never going to be the answer.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
        "ai/reading-answers#which-numbers-are-estimates",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "block-against-block",
      title: "Comparing block against block",
      summary:
        "Two blocks side by side, and why the per-workout rates are the honest comparison rather than the totals.",
      estimate: true,
      keywords: [
        "compare blocks",
        "last block",
        "was it better",
        "volume",
        "adherence",
        "fatigue",
        "mesocycle comparison",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "How did this block compare with the last one?" },
            " returns both side by side: sets and volume, estimated strength, how much of the plan you completed, and the average fatigue and performance you reported.",
          ],
        },
        {
          kind: "para",
          text: [
            "A real pair: sets per workout up from ",
            { num: "14.7" },
            " to ",
            { num: "19.5" },
            ", adherence ",
            { num: "100" },
            "% in both, average fatigue up from ",
            { num: "4.9" },
            " to ",
            { num: "5.4" },
            " and average performance down from ",
            { num: "6.2" },
            " to ",
            { num: "5.7" },
            ". A third more work per session, and it registered in how the sessions felt.",
          ],
        },
        { kind: "heading", text: "Read the rates, not the totals" },
        {
          kind: "para",
          text: "The response says so itself when one of the blocks is still running: totals reflect the work logged so far, so a live block will always look smaller than a finished one. The per-workout figures are the pair that means something.",
        },
        {
          kind: "para",
          text: [
            "The same shape of question works one level up — ",
            {
              to: "ai/macrocycles#checking-in-on-it",
              text: "across a whole macrocycle",
            },
            " — and one level down, on a single muscle's weekly sets against your landmarks.",
          ],
        },
      ],
      related: [
        "ai/macrocycles#checking-in-on-it",
        "ug/reading-your-stats#where-to-look",
      ],
    },
  ],
};
