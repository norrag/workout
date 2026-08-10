// AI Manual — chapter 8, "Use case: coaching" (doc 22 §7, §7.1).
//
// Fourth worked example, and doc 22 §7's brief for it is specific: reviewing a
// session, deciding whether to push or back off, and working around a niggle
// *and having it become a real exercise-level RIR assignment* rather than
// advice the reader has to remember. That last clause is the chapter.
//
// **Run against the live connector** on 2026-08-13:
//   - `get_recent_sessions` — four real sessions with their 0–10 ratings.
//     W4·D4 read fatigue 6 / effort 9 / performance 5; the deload week's W5·D2
//     read fatigue 6 / effort 7 / performance 3, which is the interesting one
//   - `explain_prescription` — a **recorded** decision (`source: "recorded"`,
//     `params_version: 25`) for a deload-week pulldown: strength anchor 119 lb
//     at moderate confidence, previous session 3×12 at 85 lb, week peak 4×8 at
//     90 lb, output 80 lb × 9 reps × 2 sets at 6 RIR, trace rule `deload`,
//     rationale *"Deload off strength anchor (e1RM 119 lb)… Recover before the
//     next block."* It also carried a written coaching line, which is the doc
//     19 explanation layer and is quoted in §3 as an example of its shape
//   - `get_training_overview` — 19 of 20 sessions, 100% adherence, average
//     overall fatigue 5.4
//
// GROUND TRUTH: `explain_prescription` returns `source: "projected"` when no
// decision has been recorded yet — a recomputation rather than a record of what
// happened (`22d` §3.6). Ch. 10 owns that distinction; §3 here points at it.
//
// Claims: `C-aicoach-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_COACHING: ManualChapter = {
  manual: "ai",
  slug: "coaching",
  number: 8,
  title: "Use case: coaching",
  summary:
    "Reviewing how a week actually went, deciding whether to push or back off, and turning a niggle into an assignment the program follows.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-ask",
      title: "The ask",
      summary:
        "Review my last few sessions — what an assistant reads, and what it can see that a single screen does not show together.",
      keywords: [
        "review my week",
        "how did it go",
        "coaching",
        "feedback",
        "sessions",
        "recovery",
        "tired",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Look at my last few sessions and tell me how the week went." },
            " What it reads is the sessions with the ratings you gave at the end of each: how tired you were overall, how hard the work felt, and how well you thought you performed.",
          ],
        },
        {
          kind: "para",
          text: [
            "Those three move independently, which is what makes them worth reading together. In a real week: one session at fatigue ",
            { num: "6" },
            " with effort ",
            { num: "9" },
            " and performance ",
            { num: "5" },
            " — hard work, ordinary result. Two sessions later, in a deload week, fatigue ",
            { num: "6" },
            " again but effort ",
            { num: "7" },
            " and performance ",
            { num: "3" },
            ".",
          ],
        },
        {
          kind: "para",
          text: "A deload week that still felt like work and read as a poor performance is a signal about accumulated fatigue rather than about that session. That is the kind of read the app's own screens leave you to make, and an assistant with all three numbers in front of it will make it unprompted.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "Say the things the app cannot see",
          text: "Sleep, stress, a long day, a joint that is complaining. It reads what you logged, and the context that explains a bad week is usually the part you never typed.",
        },
      ],
      related: [
        "ai/coaching#push-or-back-off",
        "ug/how-it-felt#the-session-questions",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "push-or-back-off",
      title: "Push, or back off",
      summary:
        "The decision an assistant is genuinely useful for, and the two readings it should give you before it recommends one.",
      estimate: true,
      keywords: [
        "should i push",
        "deload",
        "back off",
        "too much",
        "add sets",
        "recovery",
        "decision",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Ask it straight: ",
            { strong: "should I push this week or back off?" },
            " A useful answer weighs two things against each other, and it should show you both rather than only its conclusion.",
          ],
        },
        {
          kind: "list",
          items: [
            [
              { strong: "What the work has been." },
              " Sets per session against the block before, weekly sets per muscle against your landmarks, and how much of the plan you have actually completed.",
            ],
            [
              { strong: "What it has cost." },
              " The fatigue, effort and performance ratings over recent sessions, and any joint pain reported on individual exercises.",
            ],
          ],
        },
        {
          kind: "para",
          text: "Rising fatigue with flat performance and volume near the top of your range is the classic case for holding rather than adding. Low fatigue, volume near the floor, and a lift moving at matched effort is the case for more.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Whose judgement this is",
          text: "The recommendation is an informed opinion worked from your real history — not a measurement, and not the program's decision. The weights for next week are computed either way; what you are deciding here is whether to change the plan around them.",
        },
      ],
      related: [
        "ai/coaching#a-niggle-becomes-an-assignment",
        "ug/deloads#what-a-deload-is",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "why-this-number",
      title: "Asking why a number is what it is",
      summary:
        "It can fetch the recorded decision behind one prescription — the inputs, the rule that fired, and the reasoning.",
      estimate: true,
      keywords: [
        "why this weight",
        "explain",
        "why did it drop",
        "prescription",
        "reasoning",
        "decision",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "Why is my pulldown only 80 lb this week?" },
            " is answerable from the record rather than from inference. What comes back is the decision as it was made: what the program saw, what it produced, and which rule produced it.",
          ],
        },
        {
          kind: "para",
          text: [
            "For that real prescription: a strength anchor of ",
            { num: "119" },
            " lb at moderate confidence, the previous session's ",
            { num: "3" },
            "×",
            { num: "12" },
            " at ",
            { num: "85" },
            " lb, the week flagged as a deload at ",
            { num: "6" },
            " reps in reserve — and out of it ",
            { num: "80" },
            " lb for ",
            { num: "9" },
            " reps, ",
            { num: "2" },
            " sets, under a rule named deload. Not a lighter guess: a lighter week, on purpose.",
          ],
        },
        {
          kind: "para",
          text: [
            "Some prescriptions also carry a short written explanation of their own. That is the app's, not the assistant's, and the ",
            {
              to: "ug/prescription-details#opening-the-details",
              text: "same words appear on the prescription details in the app",
            },
            ".",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "Recorded, or worked out again",
          text: "A prescription that has already been decided comes back as the record of that decision. One that has not is recomputed for the answer — the same rules, but a projection rather than a history. It is worth knowing which you were given.",
        },
      ],
      related: [
        "ai/reading-answers#recorded-or-projected",
        "ug/prescription-details#opening-the-details",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "a-niggle-becomes-an-assignment",
      title: "A niggle becomes an assignment",
      summary:
        "The difference between advice you have to remember and a change the program actually makes.",
      keywords: [
        "sore elbow",
        "injury",
        "work around",
        "back off one exercise",
        "shoulder",
        "pain",
        "adjust",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Tell it ",
            { strong: "my left elbow has been complaining on pushdowns" },
            " and the weak version of help is a paragraph of advice you have to hold in your head on Thursday. The strong version is a change to the plan.",
          ],
        },
        {
          kind: "para",
          text: [
            "It can set an ",
            {
              to: "ug/exercise-level-rir#backing-an-exercise-off",
              text: "effort target on that one exercise",
            },
            ", which makes the program prescribe it lighter while the rest of the week carries on as planned. It can cap its working sets. It can swap it for a movement your elbow tolerates. And it can pin a note to the exercise so the reason is there next time either of you looks.",
          ],
        },
        { kind: "heading", text: "Why the note matters as much as the change" },
        {
          kind: "para",
          text: "A note on an exercise is legible to an assistant later, which makes it a message to two readers: yourself next month, and whoever helps you plan the block after this one. The elbow will be forgotten by then, and the reason the pushdown is running easy will not be.",
        },
        {
          kind: "para",
          text: "Each of these lands in the app where you can see it, and each is as easy to undo as it was to ask for.",
        },
      ],
      related: [
        "ug/exercise-level-rir#backing-an-exercise-off",
        "ai/what-it-can-do#library-and-preferences",
      ],
    },
  ],
};
