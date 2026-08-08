// AI Manual — chapter 1, "What the connector is" (doc 22 §7).
//
// The AI Manual's orientation chapter, and its depth is set against User Guide
// ch. 18, which already tells a reader what the connector is at guide depth
// (doc 22 §8.4b rule 1). Restating ch. 18 here would waste the reader's first
// screen, so this chapter takes the two things ch. 18 could not afford: the
// **tool** idea — an assistant that calls into the app rather than working from
// what you paste — and the **two domains** distinction (your training vs. how
// the app works) that the connector's own server instructions draw and that
// every later chapter leans on.
//
// GROUND TRUTH (`22d` §1, §3, §11; `src/lib/mcp/server.ts`, `tools/index.ts`,
// `more/connector/page.tsx`):
//   - 58 tools registered at release 1.1.0, 17 admin-gated and EXCLUDED, 41
//     user-facing; 4 resources. Re-counted from `registerTool` call sites at
//     Phase 6, per `22d`'s own re-verification rule
//   - the connector page's promise, corrected for `22d` §7 K3: it also drafts
//     macrocycles, places blocks into macro slots, and edits a LIVE block
//   - `MCP_INSTRUCTIONS` states the grounding stance ("call get_current_state
//     first") and, gated with the manual tools, the one distinction this
//     chapter's §3 is built on: the guide documents the app, the data tools
//     report the user
//   - the manual-retrieval tools resolve no session at all (`22d` §11.2 fact 1)
//
// §8.5: no `MCP` in this chapter — ch. 2 §1 is the one allowlisted section.
// Claims: `C-conn-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_WHAT_IT_IS: ManualChapter = {
  manual: "ai",
  slug: "what-it-is",
  number: 1,
  title: "What the connector is",
  summary:
    "Your training record, opened to an AI assistant you already use — with real tools it can call rather than numbers you have to describe.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-idea",
      title: "The idea",
      summary:
        "An assistant that reads your training by calling into the app, instead of working from whatever you remember to type.",
      keywords: [
        "what is the connector",
        "ai",
        "claude",
        "chatgpt",
        "plug-in",
        "tools",
        "how does it work",
      ],
      blocks: [
        {
          kind: "para",
          text: "An AI assistant is good at reading a lot of numbers and saying something useful about them. The hard part has always been getting the numbers there. Typing out a training block is tedious enough that you summarize, and a summary is where the detail that mattered goes missing.",
        },
        {
          kind: "para",
          text: [
            "The connector removes that step. You link an assistant — Claude, or another client that supports custom connectors — to your account once, and it gains a set of ",
            { strong: "tools it can call" },
            " against your training: one that returns a lift's session-by-session history, one that returns a block's volume per muscle, one that drafts a mesocycle.",
          ],
        },
        { kind: "heading", text: "What that changes" },
        {
          kind: "para",
          text: "Ask a connected assistant how your incline press has gone, and it fetches the sessions, the loads and the strength estimates, then answers from what came back. Ask an unconnected one the same thing and it answers from your description of it.",
        },
        {
          kind: "para",
          text: "It works in both directions. It reads, and it writes — a block it drafts for you lands in the app as a planned one, for you to open, change and start yourself.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "It is your account, at arm's length",
          text: "The link is scoped to you alone, one assistant at a time, and you can withdraw it whenever you like. What the connector can and cannot do is the subject of chapter 3.",
        },
      ],
      estimate: true,
      related: ["ai/what-it-is#two-kinds-of-question", "ai/setup#connecting"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-it-is-good-for",
      title: "What it is good for",
      summary:
        "Three jobs it does better than the app's own screens: reading across blocks, drafting plans, and explaining a number.",
      keywords: [
        "why connect",
        "worth it",
        "use cases",
        "what should i ask",
        "benefits",
        "capabilities",
      ],
      blocks: [
        {
          kind: "para",
          text: "The app's screens are built around the block you are in. Three things sit awkwardly in that frame, and each is where a connected assistant earns its place.",
        },
        {
          kind: "table",
          columns: ["Ask it to", "Because"],
          rows: [
            [
              "read across blocks",
              "a year of training is many screens and one question. An assistant can pull several blocks at once and answer whether a muscle has been under-trained since spring, which no single screen is shaped to say",
            ],
            [
              "draft a plan",
              [
                "building a block by hand is a lot of tapping. Describing one — ",
                { strong: "four days, upper-lower, more back volume than last time" },
                " — and reviewing what comes back is faster, and it can reshape a block you are already running",
              ],
            ],
            [
              "explain a number",
              "it can fetch the reasoning behind a specific prescription — the inputs the program saw and what it did with them — and put it in words, on the day you wondered",
            ],
          ],
        },
        {
          kind: "para",
          text: "Chapters 5 to 8 work each of these through as a real exchange — the prompt that started it, what came back, and what to do with it in the app.",
        },
      ],
      related: [
        "ai/what-it-can-do#where-you-are",
        "ug/connecting-an-ai#what-it-is-good-at",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "two-kinds-of-question",
      title: "Two kinds of question",
      summary:
        "Questions about your training and questions about how the app works are answered from different places, and it is worth knowing which you asked.",
      keywords: [
        "how the app works",
        "my data",
        "guide",
        "which source",
        "manual",
        "difference",
      ],
      blocks: [
        {
          kind: "para",
          text: "A connected assistant can reach two separate things, and keeping them apart is the single most useful idea in this manual.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Your training." },
              " Your cycles, sessions, sets, feedback, notes and profile. Scoped to your account, and different for every reader.",
            ],
            [
              { strong: "The manuals." },
              " These pages and the User Guide, which the connector can search and read. The same words for everyone, and no part of your record.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "So ",
            { strong: "how does the app pick my next weight" },
            " is a question about the app, answered out of the guide. ",
            { strong: "Why did my next weight drop" },
            " is a question about you, answered out of your sessions. The good answers to the second usually use both.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "Worth asking for",
          text: "When an answer surprises you, ask which of the two it came from. An assistant explaining the app from memory rather than from the guide is the most common way a plausible wrong answer gets made.",
        },
      ],
      related: [
        "ai/what-it-can-do#the-manuals-themselves",
        "ai/the-rules#the-engine-owns-the-numbers",
      ],
    },
  ],
};
