// AI Manual — chapter 10, "How to read its answers" (doc 22 §7).
//
// The honesty guardrails (doc 10 §9) restated as reader expectations, and
// §8.4-framed throughout: a hedge is a correct answer, not a shortcoming.
//
// GROUND TRUTH (`mcp/envelope.ts`, `22d` §3.6, §9):
//   - every payload can carry `data_quality` — the scales a rating uses, how
//     many samples a mean came from, an estimates caveat, and a comparability
//     note. Observed live on `get_training_overview`, `analyze_exercise_progress`
//     and `compare_mesocycles`
//   - `analyze_exercise_progress` returns a `confidence_mix` (in the run behind
//     ch. 7: 1 high / 30 moderate / 57 low across 88 sessions)
//   - `explain_prescription` returns `source: "recorded"` or `"projected"` —
//     `22d` §9 says ch. 10 MUST name this, and §2 does
//   - subjective feedback exists only from 2026-06-15; earlier sessions were
//     migrated without it, and the envelope says so rather than showing zeros
//
// `22d` §8 rule 8 / §7 **K1**: `E1RM_ESTIMATE_NOTE` says e1RM is "Epley-based"
// while the engine averages Epley and Brzycki, and the same response can carry
// both wordings (`D-19`). This chapter states the engine's behavior and quotes
// neither string.
//
// Claims: `C-airead-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_READING_ANSWERS: ManualChapter = {
  manual: "ai",
  slug: "reading-answers",
  number: 10,
  title: "How to read its answers",
  summary:
    "Which of its numbers are estimates, when an answer is a record and when it is a recomputation, and why a hedge is usually the correct answer.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "which-numbers-are-estimates",
      title: "Which numbers are estimates",
      summary:
        "Weights and reps are what you lifted; strength figures are modelled from them, and the responses say which is which.",
      estimate: true,
      keywords: [
        "estimate",
        "e1rm",
        "accurate",
        "how reliable",
        "confidence",
        "trust the numbers",
        "one rep max",
      ],
      blocks: [
        {
          kind: "para",
          text: "Two kinds of number come back, and they deserve different amounts of weight.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Recorded." },
              " Weights, reps, sets, dates, session ratings, adherence. These are what you logged, and they are exact.",
            ],
            [
              { strong: "Modelled." },
              " Anything about strength — an ",
              { term: "e1rm", text: "estimated one-rep max" },
              ", a percentage change, a macrocycle target. Worked out from the recorded numbers by a formula.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The modelled ones also carry a ",
            { term: "e1rm_confidence", text: "confidence" },
            " of their own, and a real spread is wider than people expect: across one lift's whole history the mix was ",
            { num: "1" },
            " high, ",
            { num: "30" },
            " moderate and ",
            { num: "57" },
            " low. Sets taken far from failure or run for many reps carry the least information about strength.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Read the trend, not the figure",
          text: "A strength estimate is worth reading as a direction over several sessions. An assistant quoting one to the pound, or calling it a max you could lift today, has taken it further than the number goes.",
        },
      ],
      related: [
        "ai/reading-answers#recorded-or-projected",
        "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "recorded-or-projected",
      title: "A record, or a recomputation",
      summary:
        "An explanation of a prescription is either the decision as it was made, or the same rules run again now — worth knowing which.",
      estimate: true,
      keywords: [
        "why this weight",
        "projected",
        "recorded",
        "decision",
        "explain",
        "different answer",
      ],
      blocks: [
        {
          kind: "para",
          text: "When you ask why a prescription is what it is, the answer arrives in one of two forms, and the response says which.",
        },
        {
          kind: "table",
          columns: ["Form", "What it is"],
          rows: [
            [
              "recorded",
              "the decision as the program actually made it, with the inputs it saw at the time and the rule that fired. History",
            ],
            [
              "projected",
              "the same rules run again now, because no decision has been recorded for that exercise yet. A forecast of what it will do",
            ],
          ],
        },
        {
          kind: "para",
          text: "The distinction matters when the inputs have moved since. A projection made after you logged a heavy session will reflect that session; the recorded decision from last week will not, because last week did not know about it.",
        },
        {
          kind: "para",
          text: [
            "So ",
            { strong: "was that recorded or projected?" },
            " is a fair follow-up whenever an explanation and the number on your screen seem to disagree. Usually they do not disagree — they are ",
            {
              to: "ug/prescription-details#when-a-prescription-changes",
              text: "answers from two different moments",
            },
            ".",
          ],
        },
      ],
      related: [
        "ug/prescription-details#when-a-prescription-changes",
        "ai/coaching#why-this-number",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "when-it-hedges",
      title: "When it hedges",
      summary:
        "Small samples, mixed phases and thin feedback are stated rather than smoothed over, and the hedge is the honest answer.",
      estimate: true,
      keywords: [
        "why is it vague",
        "hedging",
        "not sure",
        "sample size",
        "few sessions",
        "data quality",
        "missing feedback",
      ],
      blocks: [
        {
          kind: "para",
          text: "Responses carry their own caveats alongside the figures: the scale a rating used, how many sessions a mean came from, whether a comparison crosses a phase, and where an estimate is weak. An assistant reading those properly will pass them on.",
        },
        {
          kind: "para",
          text: "Three hedges are common and each has a specific cause worth knowing.",
        },
        {
          kind: "table",
          columns: ["It says", "Because"],
          rows: [
            [
              "the sample is small",
              "a mean over three sessions is a different claim from a mean over thirty, and the response carries the count",
            ],
            [
              "this crosses a phase",
              "the sessions span a cut and a bulk, and the honest comparison is within one or at matched effort",
            ],
            [
              "there is no feedback for that period",
              "session ratings have only been captured since mid-2026, so earlier sessions have none. Absent by design rather than lost",
            ],
          ],
        },
        {
          kind: "para",
          text: "An assistant that answers a thin question crisply is telling you less than one that says the read is thin. The hedge is the finding, and acting on it usually means logging a few more comparable sessions before deciding anything.",
        },
      ],
      related: [
        "ai/analysis#the-four-questions",
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
      ],
    },
  ],
};
