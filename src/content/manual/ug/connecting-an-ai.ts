// User Guide — chapter 18, "Connecting an AI" (doc 22 §5).
//
// Short by design: what the connector is, how to set one up, what it is good
// for, and what stays under the reader's control. The depth lives in the AI
// Manual, and **Phase 6e paid the forward debt this header recorded**: the
// `ai/**` sections now resolve, so §1 and §4 carry typed hand-offs into them
// (doc 22 §9.4.5). The chapter itself is unchanged otherwise — its job is still
// to be the guide-depth answer, and to say where the rest of it lives.
//
// GROUND TRUTH (22b §7 ch. 18 — `22d`, `more/connector/page.tsx`,
// `api/mcp/route.ts`, `mcp/tools/**`):
//   - 56 tools registered, 17 admin-gated and EXCLUDED from both manuals
//     (`22d` §2's deny-list), 39 user-facing: 22 read, 17 write
//   - the page's own promise, verbatim in spirit: it reads cycles, history and
//     progress, drafts mesocycles and templates for review IN THE APP, only ever
//     sees the reader's own data, and never deletes logged history
//   - the three connect steps are the page's own (`HOW TO CONNECT`), and the
//     endpoint field is a copy control
//   - writes create drafts (hard rule 5); `activate_mesocycle` is confirm-gated
//     and prefers in-app activation; deletes of logged history do not exist
//   - every write is audited (`recordMcpWrite`) storing a HASH of the arguments
//     rather than their contents (`22d` §6.3's suggested framing)
//   - refusals are usually RULES, not faults (`22d` §6.2): delete refused once a
//     set is logged, a stock exercise cannot be deleted, a live block cannot be
//     removed from a macrocycle slot
//   - the rate limit is ~120 requests/minute per connection (`22d` §6.1). NOT
//     stated in prose: doc 22 §8.2 wants a parameter path beside a stated
//     number, and this one is an env var rather than an `engine_params` path
//
// §8.5 ALLOWANCE: `MCP` appears in §2 only, because the reader has to find that
// word in their own client's interface — the app's own field says
// `ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR`. `ug/connecting-an-ai#setting-one-up`
// is added to `MAY_SAY_MCP` in `contracts.test.ts` for exactly that reason, and
// `endpoint` is glossed as an address in the same section.
//
// SEAMS: ch. 4 already names the connector as a planning route; ch. 5 names
// notes as legible to it; ch. 14 names it as the way to read a macrocycle
// target. Claims: `C-ai-01` onward.

import type { ManualChapter } from "../types";

export const UG_CONNECTING_AN_AI: ManualChapter = {
  manual: "ug",
  slug: "connecting-an-ai",
  number: 18,
  title: "Connecting an AI",
  summary:
    "You can give an AI assistant read access to your training and let it draft plans for you — grounded in your real numbers, and always subject to your approval in the app.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-it-is",
      title: "What the connector is",
      summary:
        "A link between your training data and an AI client, so its answers are about you rather than about lifting in general.",
      keywords: [
        "ai",
        "claude",
        "chatgpt",
        "connector",
        "assistant",
        "what can it do",
        "coach",
      ],
      blocks: [
        {
          kind: "para",
          text: "The connector lets an AI assistant such as Claude read your training data directly. You link the assistant to your account once, then ask questions without copying sessions into a chat.",
        },
        {
          kind: "para",
          text: "You can ask which lifts improved, whether a muscle received enough volume, or what the next block should contain. The assistant can draft that block in the app for you to review.",
        },
        {
          kind: "para",
          text: [
            "The link is scoped to your account alone, and it is ",
            { strong: "yours to withdraw" },
            " at any time. It reads your data and drafts plans; the record of what you lifted is never its to remove.",
          ],
        },
        {
          kind: "link",
          to: "ai/what-it-is#the-idea",
          label: "The AI manual — setup, capabilities, and worked examples",
        },
      ],
      related: ["ug/connecting-an-ai#setting-one-up", "ai/what-it-is#the-idea"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "setting-one-up",
      title: "Setting one up",
      summary:
        "Copy one address out of the app, add it in your AI client, and approve the sign-in.",
      keywords: [
        "connect",
        "setup",
        "how do i connect",
        "custom connector",
        "authorize",
        "revoke",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Everything you need is on ",
            { ui: "More" },
            " → ",
            { ui: "AI connector" },
            ": one web address, and three steps.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Copy",
              text: [
                "The screen shows the address to use and copies it in one tap. In your AI client, this is what goes in when it asks you to add a custom or remote ",
                { ui: "MCP" },
                " connector — that is the word to look for in its interface.",
              ],
            },
            {
              label: "Approve",
              text: "The client sends you to sign in to WORKOUT and asks you to approve the connection. Approving is what grants access; the client never sees your password.",
            },
            {
              label: "Ask",
              text: "Start with something concrete — your current block, or how a lift has gone lately — and see what comes back.",
            },
          ],
        },
        {
          kind: "para",
          text: "Access is granted per client, so linking one leaves the others alone. To end a connection, remove the WORKOUT connector in that client, or withdraw its authorization from your account's connected apps.",
        },
      ],
      related: [
        "ai/setup#connecting",
        "ug/connecting-an-ai#what-it-is-good-at",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-it-is-good-at",
      title: "What it is good at",
      summary:
        "Reading and interpreting your history, and drafting the plans that are tedious to build by hand.",
      estimate: true,
      keywords: [
        "analysis",
        "plan a block",
        "draft",
        "ask about my training",
        "capabilities",
        "what to ask",
      ],
      blocks: [
        {
          kind: "table",
          columns: ["Ask it to", "Because"],
          rows: [
            [
              "read and interpret",
              "it can pull a whole macrocycle's history at once — sessions, volume per muscle, strength trends, the reasoning behind individual prescriptions — and compare across blocks in a way no single screen does",
            ],
            [
              "draft and edit plans",
              [
                "building a block by hand is a lot of tapping. Describing one in a sentence — ",
                { strong: "four days, upper-lower, heavy on back" },
                " — and reviewing what comes back is faster, and it can adjust a block you are already running",
              ],
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "A connected assistant can also read your macrocycle's ",
            {
              to: "ug/macrocycle-goals#the-target-behind-it",
              text: "target range",
            },
            ". It can set an exercise's working-set cap and its position within the rep range. The app shows those values after they are set.",
          ],
        },
        {
          kind: "para",
          text: [
            "Your ",
            {
              to: "ug/training-a-session#notes",
              text: "notes are legible to it too",
            },
            ". A note about a painful elbow gives the assistant the context needed to suggest a suitable adjustment.",
          ],
        },
      ],
      related: [
        "ug/connecting-an-ai#staying-in-control",
        "ai/what-it-can-do#history-and-analysis",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "staying-in-control",
      title: "Staying in control",
      summary:
        "Plans arrive as drafts, your logged history is permanent, and every change is recorded.",
      keywords: [
        "safe",
        "can it delete",
        "drafts",
        "approve",
        "audit",
        "refused",
        "error",
      ],
      blocks: [
        {
          kind: "para",
          text: "The connector is built so that the consequential decisions stay yours, and three rules do most of that work.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Plans arrive as drafts." },
              " A block an assistant builds lands in your Cycles tab as a planned one. You open it, look at it, change it, and start it yourself.",
            ],
            [
              { strong: "Your training record is permanent." },
              " Sets, sessions and feedback stay as you logged them. The connector plans forward; the record behind it is read-only to everything except you.",
            ],
            [
              { strong: "Every change is recorded." },
              " Each write leaves an entry saying which action ran and when, storing a fingerprint of the request rather than its contents.",
            ],
          ],
        },
        {
          kind: "para",
          text: "A refusal includes the rule that blocked the request. For example, an assistant cannot delete logged training, remove a stock exercise, or delete a block already in progress.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "It reads the numbers; it does not make them",
          text: "The program still sets every weight, rep count, and set count. An assistant can explain those numbers and offer advice based on your history. Treat that advice as an opinion, not a measurement.",
        },
      ],
      related: [
        "ai/the-rules#it-acts-as-you",
        "ug/prescription-details#who-writes-the-numbers",
      ],
    },
  ],
};
