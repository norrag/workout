// AI Manual — chapter 9, "Getting good answers" (doc 22 §7).
//
// The prompting chapter, and the one at most risk of becoming folk advice. It
// is written from what the connector's own server instructions ask of a model
// (`src/lib/mcp/server.ts`), because "how to prompt it" is really "how to help
// it do what it has already been told to do".
//
// GROUND TRUTH (`MCP_INSTRUCTIONS`, `MCP_MANUAL_INSTRUCTIONS`):
//   - *"call get_current_state first to learn where the user is"* — grounding
//     is the stance the surface already takes; §1 is the reader's half of it
//   - *"never invent numbers"*, and the engine computes every prescribed load
//   - the guide/data distinction, gated with the manual tools
//   - the coaching stance names comparability as the first suspect when a
//     metric looks alarming (cross-phase, day-slot, low-confidence estimate)
//
// §3 is deliberately about **recognising** a good answer rather than about
// writing a better prompt: the failure mode a reader actually meets is a
// confident wrong answer, not an unanswered question.
//
// Claims: `C-aiask-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_GETTING_GOOD_ANSWERS: ManualChapter = {
  manual: "ai",
  slug: "getting-good-answers",
  number: 9,
  title: "Getting good answers",
  summary:
    "Three habits that decide whether an assistant answers about your training or about training in general.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "ground-it-first",
      title: "Ground it first",
      summary:
        "One opening line puts your actual position in front of it, and most weak answers are answers that skipped it.",
      keywords: [
        "how to ask",
        "prompt",
        "grounding",
        "first message",
        "context",
        "better answers",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Open with ",
            { strong: "check where I am first" },
            ". A connected assistant is asked by the app itself to do this before it coaches, and saying it out loud is the fastest way to find out whether it is going to.",
          ],
        },
        {
          kind: "para",
          text: "What that call gives it is the block you are in, the week, the effort target, what you are training next, and any per-exercise assignment running. Almost every question you might ask reads differently against that. Advice about pushing harder means one thing in week 2 and another in a deload week.",
        },
        { kind: "heading", text: "Name the thing precisely" },
        {
          kind: "para",
          text: [
            "Say ",
            { strong: "incline dumbbell press" },
            " rather than ",
            { strong: "chest press" },
            ", and say which block you mean when you mean a particular one. Your library has close variants in it, and an assistant asked about the wrong one will answer confidently about the wrong one.",
          ],
        },
        {
          kind: "para",
          text: "Long conversations drift. When one has wandered a long way from where it started, asking it to re-check your position costs a sentence and resets what it is reasoning from.",
        },
      ],
      related: [
        "ai/getting-good-answers#ask-what-it-used",
        "ai/what-it-can-do#where-you-are",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "ask-what-it-used",
      title: "Ask what it used",
      summary:
        "Which numbers, from where, over what window — the follow-up that separates a read from an impression.",
      estimate: true,
      keywords: [
        "did it check",
        "sources",
        "which data",
        "verify",
        "made it up",
        "follow-up question",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Which numbers did you use, and over what window?" },
            " is the single most useful follow-up in this manual. An answer built from your sessions can say. One built from an impression of the conversation cannot.",
          ],
        },
        {
          kind: "para",
          text: "Two more are worth keeping to hand, and both come straight out of what the connector already returns:",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Is that comparable?" },
              " Same phase, same effort target, same day slot, same position in the session. The response it read carries all four.",
            ],
            [
              { strong: "Is that from the guide or from my data?" },
              " Explanations of how the app works should come from the guide; claims about you should come from your record.",
            ],
          ],
        },
        {
          kind: "para",
          text: "None of this is adversarial. It is the same question you would ask a training partner who told you that you were getting weaker, and it usually produces a better second answer rather than a defence of the first.",
        },
      ],
      related: [
        "ai/analysis#the-four-questions",
        "ai/reading-answers#which-numbers-are-estimates",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-a-good-answer-looks-like",
      title: "What a good answer looks like",
      summary:
        "Next to a confident wrong one: specific, sourced, hedged where the data is thin, and clear about what it is recommending.",
      estimate: true,
      keywords: [
        "good answer",
        "wrong answer",
        "trust",
        "confident",
        "how do i know",
        "quality",
        "hallucination",
      ],
      blocks: [
        {
          kind: "para",
          text: "The failure to watch for is not a refusal. It is a fluent, plausible, entirely general answer delivered in the same tone as a real one.",
        },
        {
          kind: "table",
          columns: ["A good answer", "A confident wrong one"],
          rows: [
            [
              "names your block, your week, and the sessions it read",
              "talks about progressive overload in the abstract",
            ],
            [
              "gives figures you could look up in the app",
              "gives round figures that sound right",
            ],
            [
              "says where the read is weak — few sessions, mixed phases, a low-confidence estimate",
              "is equally certain about everything",
            ],
            [
              "separates what the program prescribed from what it is suggesting",
              "presents its own opinion as the program's decision",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The last row is the one worth learning by heart. Every prescribed weight, rep and set is ",
            {
              to: "ai/the-rules#the-engine-owns-the-numbers",
              text: "the app's to compute",
            },
            ", so an assistant telling you what you will lift on Thursday is reporting, and an assistant telling you to add a set is advising. Both are useful; they are not the same claim.",
          ],
        },
      ],
      related: [
        "ai/the-rules#the-engine-owns-the-numbers",
        "ai/reading-answers#when-it-hedges",
      ],
    },
  ],
};
