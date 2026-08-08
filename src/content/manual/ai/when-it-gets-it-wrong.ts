// AI Manual — chapter 12, "When it gets something wrong" (doc 22 §7).
//
// The last chapter, and the one that has to hold two things apart: an assistant
// being wrong (which happens, and is recoverable), and the app declining to do
// something (which is usually a rule working). `22d` §6.2's own framing is that
// a refusal "reads correctly as reassurance", and §2 is written to that.
//
// **Run against the live connector** on 2026-08-13:
//   - `create_macrocycle` refused with the one-direction-at-a-time rule (ch. 5)
//   - `check_data_hygiene` returned three advisory flags — two macrocycles
//     longer than the engine would recommend, and an unplanned placeholder
//     still on its storage default — with the standing instruction *"Surface
//     them gently; never silently 'correct' the user's data"*. That instruction
//     is §3's subject: the app's own posture toward tidying is to ask
//
// GROUND TRUTH (`22d` §6.2; `mcp/envelope.ts`):
//   - a tool that throws and a tool that declines both come back as structured
//     in-result errors an assistant can read and act on (R25 converged them)
//   - nothing on the surface deletes logged history, so the worst case of a
//     wrong instruction is a draft to remove or a setting to change back
//
// Claims: `C-aiwrong-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_WHEN_IT_GETS_IT_WRONG: ManualChapter = {
  manual: "ai",
  slug: "when-it-gets-it-wrong",
  number: 12,
  title: "When it gets something wrong",
  summary:
    "Spotting a wrong answer, undoing anything it did, and telling a refusal apart from a fault.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "spotting-it",
      title: "Spotting it",
      summary:
        "Four tells that an answer is about training in general rather than about your training.",
      estimate: true,
      keywords: [
        "wrong",
        "made up",
        "hallucination",
        "incorrect",
        "does not match",
        "check",
        "suspicious",
      ],
      blocks: [
        {
          kind: "para",
          text: "Assistants are wrong in a recognizable way. The answer is fluent, the tone is certain, and the substance has quietly detached from your record.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "The numbers are round." },
              " Real ones rarely are. A strength figure ending in a neat zero is worth checking against the app.",
            ],
            [
              { strong: "It names a block or a lift you do not have." },
              " Close variants are the usual culprit — a similar exercise name from a different conversation.",
            ],
            [
              { strong: "It describes a screen you cannot find." },
              " An explanation of how the app works that came from memory rather than from the guide.",
            ],
            [
              { strong: "It states a prescription that differs from your day screen." },
              " The screen is right; the program computed it.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The fix for all four is the same sentence: ",
            { strong: "check that against my data — which sessions did you read?" },
            " An assistant that has to fetch will usually correct itself in the next message.",
          ],
        },
      ],
      related: [
        "ai/getting-good-answers#ask-what-it-used",
        "ai/when-it-gets-it-wrong#putting-it-right",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "a-refusal-is-usually-a-rule",
      title: "A refusal is usually a rule",
      summary:
        "When it tells you it could not do something, the reason comes with it — and it is generally the app protecting your record.",
      keywords: [
        "error",
        "refused",
        "could not",
        "declined",
        "why not",
        "blocked",
        "failed",
      ],
      blocks: [
        {
          kind: "para",
          text: "Distinguish two things that arrive looking similar. An assistant being wrong is one. The app declining a request is the other, and it comes with its reason attached.",
        },
        {
          kind: "para",
          text: [
            "Asking for a second macrocycle while one is running returns, in the app's own words, that ",
            { strong: "a macrocycle is one long-term direction at a time" },
            ", along with the note that a standalone block may run alongside it. That is not a failure to understand you — it is the answer, and it contains the way forward.",
          ],
        },
        {
          kind: "para",
          text: [
            "The same is true of the ",
            {
              to: "ai/the-rules#your-record-stands",
              text: "refusals that protect your history",
            },
            ". A block with logged sets in it, a stock exercise, a macro slot holding real training — each is declined on purpose, and reading the reason usually tells you what you actually wanted to do instead.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "When it really is a fault",
          text: "A request that fails with no reason, or fails repeatedly on something that plainly should work, is a different thing. Ask it to try once more, and if that changes nothing, the connection is the first suspect.",
        },
      ],
      related: [
        "ai/the-rules#your-record-stands",
        "ai/setup#when-it-will-not-connect",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "putting-it-right",
      title: "Putting it right",
      summary:
        "Everything an assistant can change, you can change back — and the app's own posture toward tidying up is to ask first.",
      keywords: [
        "undo",
        "fix it",
        "delete the draft",
        "revert",
        "correct",
        "report",
        "clean up",
      ],
      blocks: [
        {
          kind: "para",
          text: "Anything it did is something you can undo, and the app is the place to do it. A drafted block you did not want is removed like any planned block. A setting it changed is changed back the same way it was set. A note it pinned can be cleared.",
        },
        {
          kind: "para",
          text: "Your logged sessions stand through all of it, which is why the worst case here is tidying rather than recovery.",
        },
        { kind: "heading", text: "It should ask before tidying" },
        {
          kind: "para",
          text: [
            "An assistant can also look for loose ends — a macrocycle running longer than the app would recommend, a placeholder block still on its defaults, two blocks with the same name. Those come back as advisories with the instruction to ",
            { strong: "raise them gently and never silently correct anything" },
            ". An assistant that tidies your cycles without asking has exceeded what it was told to do.",
          ],
        },
        {
          kind: "para",
          text: "If something in the app itself looks wrong rather than something an assistant said, the User Guide's troubleshooting chapter is the faster route — most surprising numbers have an explanation there.",
        },
        {
          kind: "link",
          to: "ug/troubleshooting#a-number-looks-wrong",
          label: "A number looks wrong, in the User Guide",
        },
      ],
      related: [
        "ug/troubleshooting#a-number-looks-wrong",
        "ai/the-rules#plans-arrive-as-drafts",
      ],
    },
  ],
};
