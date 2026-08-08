// AI Manual — chapter 3, "The rules it operates under" (doc 22 §7).
//
// The chapter a cautious reader opens first, so it is written to be read out of
// order: each section states one rule, why it exists, and what it means the
// next time the reader is looking at something an assistant did.
//
// GROUND TRUTH (`22d` §2, §5, §6; CLAUDE.md hard rules 4/5; `mcp/auth.ts`,
// `mcp/session.ts`, `mcp/audit.ts`, `tools/write.ts`, `engine/`):
//   - identity comes from the verified token's `sub`; NO tool takes a user id
//     (hard rule 5). Queries run through a token-bound client, so scoping is
//     enforced by row-level security rather than by tool code
//   - the token is verified on every call: issuer pinned, algorithms pinned,
//     and the project's own service keys explicitly rejected. That detail is
//     deliberately NOT in the prose — it is a security fact, not reader content
//   - writes create drafts (hard rule 5); `activate_mesocycle` is the one state
//     change with consequences and requires an explicit confirmation, and its
//     own description states the app's preference for in-app activation
//   - no tool deletes logged history; deletes are refused once a set exists
//     (`delete_mesocycle`, `delete_macrocycle`, `delete_custom_exercise`)
//   - `recordMcpWrite()` stores a HASH of the arguments, never their contents,
//     always under the server-derived user id (`22d` §6.3). The row is
//     `(user_id, tool, args_hash, summary, created_at)` — there is **no client
//     column**, which corrects `22d` §5's "recorded in the audit trail" for
//     `client_id` (defect `D-18`); §5 said it because `client_id` is carried on
//     every call, which is true and is a different thing. The prose therefore
//     claims the action, the summary and the time, and not the client
//   - the engine computes every prescribed load, rep and set — the connector
//     surfaces them (`MCP_INSTRUCTIONS`, doc 10 §9). `explain_prescription`
//     reads a recorded decision, or projects one when none exists
//
// §8.4 positive framing is the whole difficulty of this chapter: four of the
// five rules are naturally stated as things that cannot happen. Each section
// therefore leads with what IS true and lets the limit follow as its
// consequence — "your record is yours to change" before "a delete is refused".
// Claims: `C-rules-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_THE_RULES: ManualChapter = {
  manual: "ai",
  slug: "the-rules",
  number: 3,
  title: "The rules it operates under",
  summary:
    "Five standing rules that decide what a connected assistant can reach, what it can change, and what stays yours alone.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "it-acts-as-you",
      title: "It acts as you",
      summary:
        "Identity comes from the sign-in you approved, so every call is your account and only your account.",
      keywords: [
        "privacy",
        "security",
        "my data",
        "other users",
        "who can see",
        "identity",
        "safe",
      ],
      blocks: [
        {
          kind: "para",
          text: "When you approved the connection, your assistant received a token that stands for you. Every request it makes carries that token, and the app works out whose data to return from the token rather than from anything the assistant says.",
        },
        {
          kind: "para",
          text: [
            "That is why no tool on the connector takes an account to look at. There is no field for it. An assistant asking for ",
            { strong: "someone else's history" },
            " has no way to express the request, and the database applies the same rule underneath a second time.",
          ],
        },
        { kind: "heading", text: "Why this way" },
        {
          kind: "para",
          text: "Identity that travels as an argument is identity that can be typed wrongly — by an assistant guessing, or by a prompt written to make it guess. Deriving it from the approved sign-in makes the question unaskable, which holds up better than answering it carefully every time.",
        },
        {
          kind: "para",
          text: "The practical consequence is the useful one: what an assistant tells you about your training is about you, and the account you approved from is the whole of what it can reach.",
        },
      ],
      related: [
        "ai/the-rules#every-change-is-recorded",
        "ug/your-data#what-is-stored",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "plans-arrive-as-drafts",
      title: "Plans arrive as drafts",
      summary:
        "A block an assistant builds lands in Cycles as a planned one, and starting it is a separate decision you make.",
      keywords: [
        "draft",
        "review",
        "approve a plan",
        "activate",
        "does it change my training",
        "planned",
      ],
      blocks: [
        {
          kind: "para",
          text: "Ask an assistant to build you a block and it builds one, in the app, where you can see it. It arrives with the status a block you built by hand would have: planned. Open it, read the planner board, change what you want, start it when you are ready.",
        },
        {
          kind: "para",
          text: [
            "Starting a block is the one change with real consequences, because it is the point where the program begins prescribing from it. An assistant can do it, and it asks you to confirm in so many words first — the app's own preference, stated in the tool it would use, is that ",
            { strong: "you start blocks yourself in the app" },
            ".",
          ],
        },
        { kind: "heading", text: "What this makes safe" },
        {
          kind: "para",
          text: [
            "Asking for something ambitious. A five-block macrocycle, a rebuilt week, a swap across every remaining session — each of those lands somewhere you can look at it before it means anything, which is what lets you ask for the ambitious version and keep the parts you like.",
          ],
        },
        {
          kind: "link",
          to: "ug/planning-a-mesocycle#starting-a-block",
          label: "Starting a block, in the User Guide",
        },
      ],
      related: [
        "ai/the-rules#your-record-stands",
        "ug/planning-a-mesocycle#starting-a-block",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "your-record-stands",
      title: "Your record stands",
      summary:
        "Logged sets, sessions and feedback are yours to edit in the app, and the connector plans forward from them rather than over them.",
      keywords: [
        "delete",
        "can it delete my history",
        "refused",
        "error",
        "permanent",
        "why did it say no",
      ],
      blocks: [
        {
          kind: "para",
          text: "What you lifted is the foundation everything else is derived from — the next weight, the strength trend, the volume counts. The connector reads that record and plans forward from it. Changing it stays with you, in the app.",
        },
        {
          kind: "para",
          text: "So an assistant will sometimes tell you it could not do what you asked. Read those as rules rather than faults:",
        },
        {
          kind: "list",
          items: [
            "a block with logged sets in it stays; the request to remove it is declined with that reason",
            "a stock exercise stays in the library, and a custom one with history behind it does too",
            "a macrocycle slot holding a block you have planned, started or finished keeps it",
          ],
        },
        {
          kind: "para",
          text: "Each refusal comes back with its reason attached, so a good assistant will read it and offer the thing you probably meant — archiving the block rather than deleting it, or excluding an exercise rather than removing it.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "The one asymmetry worth knowing",
          text: "An assistant can create and reshape plans freely, and can undo the ones nothing has been logged into. The moment a set exists under something, that part of the record belongs to the app's own screens.",
        },
      ],
      related: [
        "ai/the-rules#plans-arrive-as-drafts",
        "ug/your-data#what-is-stored",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-engine-owns-the-numbers",
      title: "The program owns the numbers",
      summary:
        "Every prescribed weight, rep target and set count is computed by the app; a connected assistant reports and interprets them.",
      keywords: [
        "who decides the weight",
        "does the ai program me",
        "prescription",
        "trust",
        "made up numbers",
        "engine",
      ],
      blocks: [
        {
          kind: "para",
          text: "The load, reps and sets you see on a training day are worked out by the app from your logged sets, the week's effort target and the feedback you gave. That calculation is the same whether or not any assistant is connected.",
        },
        {
          kind: "para",
          text: [
            "A connected assistant reads those numbers and can explain them — it can fetch the reasoning behind one prescription, including what the program saw and what it did with it. What it is not doing is choosing them, which is what makes ",
            {
              to: "ug/prescription-details#who-writes-the-numbers",
              text: "the numbers stable",
            },
            " across two conversations and two different assistants.",
          ],
        },
        { kind: "heading", text: "Where its own judgement starts" },
        {
          kind: "para",
          text: [
            "Around the numbers rather than inside them: whether a stall is real or a comparability artefact, whether a niggle warrants backing an exercise off, which of three plausible blocks fits what you said you wanted. Treat that as ",
            { strong: "an informed opinion worked from your real history" },
            " — which is a different kind of thing from a measurement, and worth weighing as one.",
          ],
        },
      ],
      related: [
        "ug/prescription-details#who-writes-the-numbers",
        "ug/how-your-weight-is-chosen#leading-by-one-step",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "every-change-is-recorded",
      title: "Every change is recorded",
      summary:
        "Each write an assistant makes leaves an entry naming the action and the time, storing a fingerprint of the request rather than its contents.",
      keywords: [
        "audit",
        "log",
        "what did it change",
        "history of changes",
        "record",
        "accountability",
      ],
      blocks: [
        {
          kind: "para",
          text: "Every change the connector makes writes an entry of its own: which action ran, a one-line summary of what it did, and when. The entry stores a fingerprint of the request instead of the request itself, so a note about your shoulder is counted without being copied.",
        },
        {
          kind: "para",
          text: "The entries belong to your account like the rest of your record, and the recording is deliberately kept out of the way of the work — a change that succeeded stays succeeded even if writing its entry fails, because the alternative would be losing a block you asked for to a bookkeeping error.",
        },
        { kind: "heading", text: "Why this is here" },
        {
          kind: "para",
          text: "An assistant acting as you is a convenience worth having and a thing worth being able to account for afterwards. Keeping the trail is what makes the second true, and hashing the request is what keeps the first from costing you a copy of everything you have written.",
        },
      ],
      related: ["ai/the-rules#it-acts-as-you", "ug/your-data#what-is-stored"],
    },
  ],
};
