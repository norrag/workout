// AI Manual — chapter 2, "Setting it up" (doc 22 §7).
//
// The one chapter with a job to finish rather than a subject to explain: a
// reader arrives here unable to use the connector and should leave using it.
//
// GROUND TRUTH (`22d` §5 — the real auth flow, read from `api/mcp/route.ts`,
// `mcp/auth.ts`, `oauth/consent/page.tsx`, `api/oauth/decision/route.ts`):
//   - the address is `<origin>/api/mcp`, derived per deployment by
//     `resolveOrigin()`. `22d` §8 rule 4: NEVER hardcode it — say "copy it from
//     that page", which is also why the steps below quote no URL
//   - the discovery handshake (401 → protected-resource pointer → the project's
//     authorization server) is invisible to the reader and stays invisible here
//   - the consent screen names the requesting client and the scopes, and states
//     "It will act as you, see only your own data, and can never delete logged
//     history" — quoted in §2 because it is the sentence that answers the
//     question a reader has at exactly that moment
//   - the grant is PER CLIENT (`client_id` on every call, recorded in the audit
//     trail); two assistants are two grants, revoked independently
//   - revocation: remove the connector in the client, or revoke from the
//     account's connected apps — the same two routes `/more/connector` states
//   - failure shapes (`22d` §6): 401 → the client re-runs authorization;
//     429 + `Retry-After` over the rate limit; a refused tool comes back as a
//     structured in-result error the assistant can read
//   - the rate limit is ~120 requests/minute per connection. `22d` §6.1 and
//     §8 rule 5: it is an env var, not an `engine_params` path, so §8.2's
//     "state a number only beside its parameter" rule means NO NUMBER in prose
//
// §8.5 ALLOWANCE: `MCP` appears in `ai/setup#connecting` only — the reader must
// find that word in their own client's interface, and the app's own field reads
// `ADD THIS AS A CUSTOM / REMOTE MCP CONNECTOR`. Registered in `MAY_SAY_MCP` in
// `contracts.test.ts`. `address` glosses it everywhere the word `endpoint`
// would otherwise appear.
// Claims: `C-setup-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const AI_SETUP: ManualChapter = {
  manual: "ai",
  slug: "setup",
  number: 2,
  title: "Setting it up",
  summary:
    "Copy one address, approve one sign-in, and ask one grounding question — plus what to do when a client will not connect.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "connecting",
      title: "Connecting a client",
      summary:
        "Three steps from the AI connector screen: copy the address, add it in your assistant, approve the sign-in.",
      keywords: [
        "connect",
        "setup",
        "how do i add it",
        "custom connector",
        "install",
        "get started",
        "address",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Everything you need is on ",
            { ui: "More" },
            " → ",
            { ui: "AI connector" },
            ". The screen shows one web address and copies it in a tap. It belongs to this installation of the app, so take it from the screen rather than from anywhere else.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Copy",
              text: [
                "Tap the address on the connector screen. In your assistant, this goes wherever it asks you to add a custom or remote ",
                { ui: "MCP" },
                " connector — that is the word to look for in its interface, and the app's own label says the same thing.",
              ],
            },
            {
              label: "Approve",
              text: "Your assistant sends you to sign in to WORKOUT and asks you to approve the connection. Approving is what grants access, and the assistant sees your account rather than your password.",
            },
            {
              label: "Ask",
              text: "Ask it something concrete about your training. The next section but one has a first question worth using.",
            },
          ],
        },
        {
          kind: "para",
          text: "Between the second and third step your assistant does a short discovery exchange with the app on its own. You may see it think for a moment; there is nothing to fill in.",
        },
      ],
      related: [
        "ai/setup#approving-access",
        "ai/setup#checking-it-works",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "approving-access",
      title: "What you are approving",
      summary:
        "The approval screen names the assistant asking and what it will be able to do, in the app's own words.",
      keywords: [
        "consent",
        "permission",
        "approve",
        "authorize",
        "sign in",
        "what does it get",
        "scope",
      ],
      blocks: [
        {
          kind: "para",
          text: "The approval screen is part of WORKOUT rather than part of your assistant, which is what makes it worth reading. It names the client that asked, lists what it is requesting, and states the standing terms of any connection:",
        },
        {
          kind: "callout",
          tone: "note",
          label: "On the approval screen",
          text: "It will act as you, see only your own data, and can never delete logged history.",
        },
        {
          kind: "para",
          text: [
            'Those three clauses are the whole security model in one line, and ',
            {
              to: "ai/the-rules#it-acts-as-you",
              text: "chapter 3 takes each of them apart",
            },
            ". Approve, and your assistant receives a token of its own. Decline, and the exchange ends there.",
          ],
        },
        {
          kind: "para",
          text: "If you were signed out when your assistant started, you sign in first and land back on this screen with the request intact.",
        },
      ],
      related: [
        "ai/the-rules#it-acts-as-you",
        "ai/setup#more-than-one-assistant",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "checking-it-works",
      title: "Checking it works",
      summary:
        "One question tells you whether the link is live, because only a connected assistant can answer it.",
      keywords: [
        "test",
        "did it work",
        "verify",
        "first question",
        "is it connected",
        "try it",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Ask it: ",
            { strong: "where am I in my current block?" },
            " It is the right first question because it cannot be answered from general knowledge — the answer either names your block, your week and your next session, or the link is not live.",
          ],
        },
        {
          kind: "para",
          text: "A working answer sounds like a status line: the block by name, which week of it you are in, the effort target for that week, and which day comes next. It should match what the Workout tab shows you.",
        },
        {
          kind: "para",
          text: [
            "If it answers in generalities about training blocks, it is talking rather than reading. Say so — ",
            { strong: "check my actual data" },
            " — and if that changes nothing, the connection did not complete.",
          ],
        },
        {
          kind: "link",
          to: "ai/setup#when-it-will-not-connect",
          label: "When a client will not connect",
        },
      ],
      related: [
        "ai/setup#when-it-will-not-connect",
        "ai/what-it-can-do#where-you-are",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "more-than-one-assistant",
      title: "More than one assistant",
      summary:
        "Each client you connect gets its own grant, so adding one leaves the others alone and withdrawing one is exact.",
      keywords: [
        "revoke",
        "disconnect",
        "remove",
        "two clients",
        "second device",
        "stop access",
        "cancel",
      ],
      blocks: [
        {
          kind: "para",
          text: "Access is granted per client. Connect a second assistant and it goes through its own approval and receives its own token; the first one carries on unaffected.",
        },
        { kind: "heading", text: "Withdrawing one" },
        {
          kind: "list",
          items: [
            "Remove the WORKOUT connector inside that assistant, which is the quickest route and the one to reach for first.",
            "Or withdraw its authorization from your account's connected apps, which ends access even if you no longer have the assistant installed.",
          ],
        },
        {
          kind: "para",
          text: "Either way the grant ends for that client alone. Your training is untouched by connecting or disconnecting anything — the record lives in the app, and a connector is a door onto it.",
        },
      ],
      related: [
        "ai/the-rules#your-record-stands",
        "ug/your-data#what-is-stored",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "when-it-will-not-connect",
      title: "When it will not connect",
      summary:
        "The four things that go wrong at setup, and what each one looks like from your assistant's side.",
      keywords: [
        "not working",
        "error",
        "failed",
        "cannot connect",
        "401",
        "rate limit",
        "troubleshoot",
        "broken",
      ],
      blocks: [
        {
          kind: "para",
          text: "Four failures cover nearly everything, and each has a distinct signature.",
        },
        {
          kind: "table",
          columns: ["What you see", "What it is"],
          rows: [
            [
              "the client rejects the address",
              "the address was pasted with a trailing space, or from somewhere other than the connector screen. Copy it again with the tap control",
            ],
            [
              "it asks you to sign in again, a while later",
              "a grant expires like any sign-in. Your assistant re-runs the approval on its own; approve it again and the conversation continues",
            ],
            [
              "it says it is being asked to slow down",
              "the connection accepts a bounded number of requests per minute so one assistant cannot crowd out the app itself. It is told how long to wait and retries",
            ],
            [
              "everything connects, but answers stay general",
              "the client has the connector installed and is choosing not to use it. Ask directly for your data, or check that the connector is enabled for the conversation you are in",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "A tool that refuses a specific request is a different thing entirely, and usually a rule doing its job — ",
            {
              to: "ai/the-rules#your-record-stands",
              text: "chapter 3 covers those",
            },
            ".",
          ],
        },
      ],
      related: [
        "ai/the-rules#your-record-stands",
        "ai/setup#checking-it-works",
      ],
    },
  ],
};
