// User Guide — chapter 18, "Training with AI".
//
// The slug stays `connecting-an-ai` because section IDs are public link targets,
// but setup now lives entirely on More → AI connector. This chapter folds the
// former 12-chapter AI Manual into eight task-shaped sections: what the
// connector opens up, the context it carries, analysis, planning, coaching,
// working with it, reading its answers, and control.
//
// GROUND TRUTH (`22d`, `src/lib/mcp/tools/**`, `more/connector/page.tsx`):
//   - the connector reads the user's profile, current state, cycles, training
//     history, notes, body-composition data, and the Guide
//   - it compares lifts and blocks, explains prescriptions, drafts macrocycles
//     and mesocycles, edits planned or live blocks, and manages the exercise
//     library, templates, exclusions, notes, and per-exercise settings
//   - new cycles and blocks are reviewable drafts; activation requires explicit
//     confirmation; edits to existing plans are real writes
//   - identity comes from the approved connection, logged history is protected,
//     the progression engine owns every prescribed number, and writes are
//     audited with a hash of the arguments rather than their contents
//   - admin-only capabilities remain excluded from user-facing documentation
//
// Claims: `C-ai-01` onward in `22a`.

import type { ManualChapter } from "../types";

export const UG_CONNECTING_AN_AI: ManualChapter = {
  manual: "ug",
  slug: "connecting-an-ai",
  number: 18,
  title: "Training with AI",
  summary:
    "Connect Claude or ChatGPT to the full context of your training, then use it to understand your history, plan what comes next, and make changes in the app with you in control.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-it-opens-up",
      title: "More than a chat shortcut",
      summary:
        "The connector gives Claude or ChatGPT real access to your training context and real tools for working in the app.",
      keywords: [
        "ai",
        "claude",
        "chatgpt",
        "connector",
        "assistant",
        "what can it do",
        "why connect",
        "coach",
      ],
      blocks: [
        {
          kind: "para",
          text: "The AI connector turns Claude or ChatGPT from a blank conversation into an assistant that can work with your actual training. It can call into WORKOUT, gather the context a question needs, and use the result to explain, plan, or act.",
        },
        {
          kind: "para",
          text: [
            "This is much more than saving a few copy-and-paste steps. A connected assistant can read your profile, find where you are in a cycle, follow a lift across months of sessions, compare whole blocks, and then build or change plans inside the app. Its answer can carry the context of your training rather than the abbreviated version that fits in a prompt.",
          ],
        },
        {
          kind: "table",
          columns: ["It can", "What that means"],
          rows: [
            [
              "read",
              "pull the relevant profile, cycle, session, exercise, feedback, note, and body-data records from your account",
            ],
            [
              "understand",
              "connect those records across exercises, blocks, goals, and long stretches of training",
            ],
            [
              "act",
              "draft and reshape plans, manage the exercise library, and set preferences that the app follows",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Open ",
            { ui: "More" },
            " → ",
            { ui: "AI connector" },
            " when you are ready to connect a client. That page handles the address, approval, and revocation; this chapter is about what becomes possible afterwards.",
          ],
        },
      ],
      related: [
        "ug/connecting-an-ai#the-context-it-carries",
        "ug/your-data#what-is-stored",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-context-it-carries",
      title: "The context it carries",
      summary:
        "Your profile, current plan, history, notes, preferences, and the Guide can all contribute to one answer.",
      estimate: true,
      keywords: [
        "context",
        "profile",
        "training history",
        "long term",
        "past cycles",
        "notes",
        "body composition",
        "guide",
      ],
      blocks: [
        {
          kind: "para",
          text: "A useful training answer rarely lives in one number. The connector can assemble the layers around it in one conversation and keep following the question as you move from the present week to the months behind it.",
        },
        {
          kind: "table",
          columns: ["Context", "What it contributes"],
          rows: [
            [
              "your profile",
              "age, body data, experience, training age, and equipment preferences",
            ],
            [
              "where you are",
              "the live macrocycle, block, week, next session, effort target, and any exercise-level assignments",
            ],
            [
              "what you have done",
              "cycles, sessions, sets, exercise history, adherence, volume, strength estimates, and records",
            ],
            [
              "how it felt",
              "session feedback, exercise feedback, and the notes you left for yourself",
            ],
            [
              "what the app means",
              "the Guide itself, searchable section by section when the question is about how WORKOUT behaves",
            ],
          ],
        },
        {
          kind: "para",
          text: "That depth matters over long time horizons. The assistant can compare a current block with several earlier ones, keep a cut separate from a gaining phase, and recognize that the same exercise may behave differently in two day slots or two positions in a session.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "Your notes become useful context",
          text: "A pinned exercise note, a session note, or a reason for excluding a movement is available the next time you ask for help. Write the detail you would want a coach to remember.",
        },
      ],
      related: [
        "ug/training-a-session#notes",
        "ug/connecting-an-ai#analysis-and-insight",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "analysis-and-insight",
      title: "Analysis across your training",
      summary:
        "Ask about one lift, a muscle group, a block, or an entire training arc and get the comparisons behind the conclusion.",
      estimate: true,
      keywords: [
        "analysis",
        "progress",
        "am i getting stronger",
        "compare blocks",
        "muscle balance",
        "volume",
        "stalled",
        "why this weight",
      ],
      blocks: [
        {
          kind: "para",
          text: "The connector is especially useful when the question crosses screens. It can pull several views of the same training, compare them, and show why one reading deserves more weight than another.",
        },
        {
          kind: "table",
          columns: ["Ask", "What it can examine"],
          rows: [
            [
              "am I getting stronger on this lift?",
              "session-by-session history, records, the current trend, matched-effort comparisons, day slots, and session position",
            ],
            [
              "was this block better than the last one?",
              "volume, estimated strength, adherence, and the fatigue, effort, and performance you reported",
            ],
            [
              "is my plan balanced?",
              "weekly sets per muscle, planned against logged work, volume landmarks, and push-pull-legs balance",
            ],
            [
              "why did this prescription change?",
              "the decision the program recorded: its inputs, its output, and the rule that produced it",
            ],
            [
              "what changed over the whole macrocycle?",
              "the block timeline, adherence, overall and per-muscle strength reads, and body-composition history when available",
            ],
          ],
        },
        {
          kind: "para",
          text: "A lift can look down within one phase and up against the same effort in the previous block. A good analysis checks phase, matched effort, day slot, and session position before calling that a stall. The connector returns those comparisons together, so you can ask for the reasoning rather than settle for a headline.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "The conclusion should show its footing",
          text: "Weights, reps, dates, and feedback are records. Strength trends, percentage changes, and macrocycle targets are estimates built from them. Ask which sessions and comparisons carried the answer when the distinction matters.",
        },
      ],
      related: [
        "ug/reading-your-stats#reading-like-with-like",
        "ug/prescription-details#opening-the-details",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "planning-and-building",
      title: "Planning and building in the app",
      summary:
        "Turn a goal and a few constraints into a reviewable plan, then keep shaping it as your training develops.",
      estimate: true,
      keywords: [
        "plan",
        "create macrocycle",
        "draft a block",
        "edit my block",
        "mesocycle",
        "template",
        "exercise library",
        "change my program",
      ],
      blocks: [
        {
          kind: "para",
          text: "The connector works in both directions. After it understands the goal, the time available, your history, and your constraints, it can build the plan in WORKOUT instead of leaving you with instructions to translate by hand.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Plan a macrocycle." },
              " Give it the goal and horizon; the app computes the personalized target, timeframe, block count, and suggested phases. The assistant can arrange the block slots and revise the open part of the arc later.",
            ],
            [
              { strong: "Draft a block." },
              " Start from a template or describe the days, muscles, exercises, priorities, and effort ramp you want. It can preview weekly volume against your landmarks before you review the draft.",
            ],
            [
              { strong: "Reshape a live block." },
              " Add or remove days, swap and reorder exercises, change starting sets, or assign an exercise its own effort target, working-set cap, or place in the rep range.",
            ],
            [
              { strong: "Manage the library around the plan." },
              " Find or add exercises, save and reuse templates, exclude movements with a reason, pin notes, and set a lift's own load step.",
            ],
          ],
        },
        {
          kind: "para",
          text: "That range covers most planning and exercise-library work you would otherwise do screen by screen. Conversation adds the useful part: the assistant can inspect what you trained before deciding what belongs next, explain the trade-offs, and make a second pass from your feedback.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "A strong planning request",
          text: "Draft my next five-week hypertrophy block from the one I just finished. Keep four days, add back volume, avoid the movements on my exclusion list, and show the volume check before you create it.",
        },
      ],
      related: [
        "ug/planning-a-mesocycle#starting-a-block",
        "ug/exercises-and-templates#what-an-exercise-remembers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "coaching-in-context",
      title: "Coaching that can become action",
      summary:
        "Review how training is going, decide what to change, and turn the decision into a setting or plan update you can see.",
      estimate: true,
      keywords: [
        "coach",
        "review my week",
        "push or back off",
        "fatigue",
        "joint pain",
        "niggle",
        "rir assignment",
        "explain prescription",
      ],
      blocks: [
        {
          kind: "para",
          text: "A connected assistant can coach from the trail your training leaves. It can review recent sessions with their fatigue, effort, and performance ratings; compare the work with earlier blocks; read joint-pain and workload feedback; and account for the notes attached to a session or exercise.",
        },
        {
          kind: "para",
          text: [
            "Ask whether to push, hold, or back off and have it show both sides: what the work has been, and what the work has cost. Ask why a load dropped and it can read the recorded prescription decision rather than inventing a reason from the number alone.",
          ],
        },
        { kind: "heading", text: "Advice can become part of the plan" },
        {
          kind: "para",
          text: "Suppose your elbow has been irritated on one press. The assistant can examine the exercise history and feedback, then offer a choice: raise that exercise's reps-in-reserve target, cap its working sets, swap it, or pin a note about the setup. With your direction, it can make that change in the live block so the app follows it next session.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "Add what your log cannot know",
          text: "Sleep, stress, illness, schedule pressure, and the exact feel of a joint can change the right decision. Tell the assistant what happened outside the app before asking it to change the plan.",
        },
      ],
      related: [
        "ug/how-it-felt#what-your-answers-do",
        "ug/exercise-level-rir#backing-an-exercise-off",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "working-with-it",
      title: "How to work with it",
      summary:
        "Start with the outcome, let the assistant gather context, and ask it to show the evidence before it changes anything.",
      keywords: [
        "prompt",
        "what should i ask",
        "good answers",
        "grounding",
        "which data",
        "how to use",
      ],
      blocks: [
        {
          kind: "para",
          text: "You can speak in training terms. Name the outcome and the constraints; the assistant can choose the connector tools needed to answer. A useful conversation usually moves through four steps.",
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Orient",
              text: "Ask it to check where you are in your macrocycle, block, and week before offering advice.",
            },
            {
              label: "Frame",
              text: "State the goal, the time available, the equipment or schedule constraints, and anything the app could not have recorded.",
            },
            {
              label: "Investigate",
              text: "Ask which history it read and which comparisons it used. For a lift, request phase, matched effort, day slot, and session-position checks.",
            },
            {
              label: "Act",
              text: "Ask for a summary of the proposed changes, then tell it which ones to make. Review the result in WORKOUT.",
            },
          ],
        },
        {
          kind: "table",
          columns: ["Instead of a broad ask", "Give it a job"],
          rows: [
            [
              "how am I doing?",
              "review my last three blocks, separate the phases, and tell me which lifts and muscle groups changed at comparable effort",
            ],
            [
              "make me a program",
              "draft a four-day block from my current one, keep the exercises that are progressing, and bring back volume into my target range",
            ],
            [
              "my shoulder hurts",
              "read my press history and joint-pain feedback, show me the options, and wait for me before changing the live block",
            ],
          ],
        },
      ],
      related: [
        "ug/connecting-an-ai#reading-the-answer",
        "ug/cycle-model#finding-your-cycles",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "reading-the-answer",
      title: "Reading the answer",
      summary:
        "Separate records, estimates, program decisions, and coaching opinions so each part of the answer gets the right weight.",
      estimate: true,
      keywords: [
        "is this accurate",
        "estimate",
        "wrong answer",
        "hallucination",
        "recorded",
        "projected",
        "verify",
        "source",
      ],
      blocks: [
        {
          kind: "para",
          text: "The best answers keep four kinds of statement separate. That separation lets the assistant be useful without making every sentence sound equally certain.",
        },
        {
          kind: "table",
          columns: ["Kind", "How to read it"],
          rows: [
            [
              "a record",
              "a weight, rep count, date, note, rating, or completed session taken from your account",
            ],
            [
              "an estimate",
              "a strength trend, percentage change, target, or projected volume worked out from records and carrying its own limits",
            ],
            [
              "a program decision",
              "the load, reps, and sets the progression engine prescribed, with a recorded explanation when one exists",
            ],
            [
              "a recommendation",
              "the assistant's judgement about what you could change, which is yours to accept, revise, or decline",
            ],
          ],
        },
        {
          kind: "para",
          text: "A prescription explanation also says whether it read the recorded decision or produced a current projection because no saved decision was available. The first reports what happened; the second shows what the program would compute from the available inputs now.",
        },
        {
          kind: "para",
          text: [
            "When an answer surprises you, ask: ",
            { strong: "check that against my data — which sessions did you read?" },
            " If it describes a feature you cannot find, ask it to search the Guide. If it states a prescription that differs from the day screen, use the screen: that is the program's current decision.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
        "ug/connecting-an-ai#staying-in-control",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "staying-in-control",
      title: "Staying in control",
      summary:
        "The connection is scoped to your account, new plans are reviewable, logged history is protected, and the program remains the source of every prescription.",
      keywords: [
        "safe",
        "control",
        "can it delete",
        "drafts",
        "approve",
        "audit",
        "revoke",
        "refused",
      ],
      blocks: [
        {
          kind: "para",
          text: "The connector gives an assistant broad reach while keeping the important boundaries visible in the app.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "The connection is yours." },
              " It is approved per AI client, fixed to your account, and removable from that client or from your connected apps.",
            ],
            [
              { strong: "New plans arrive for review." },
              " Macrocycles and blocks are created as planned drafts. Starting a block takes explicit confirmation, and the app is the clearest place to inspect it first.",
            ],
            [
              { strong: "Edits are real changes." },
              " A requested edit to a planned or live block, note, exclusion, exercise, template, or load step is written to your account. Ask for the proposed changes first when you want a checkpoint.",
            ],
            [
              { strong: "Your training record stands." },
              " Logged sets and sessions stay as you recorded them. Requests that would remove protected history are refused with the rule that blocked them.",
            ],
            [
              { strong: "The program owns the prescription." },
              " The progression engine computes every prescribed load, rep count, and set count. The assistant can interpret the decision and recommend a plan change; it cannot author those numbers itself.",
            ],
          ],
        },
        {
          kind: "para",
          text: "Every connector write leaves an audit entry with the action and time. The request is represented by a fingerprint rather than a stored copy of its contents. Anything the assistant changes can also be inspected and changed through the app.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Use judgement where the data ends",
          text: "The connector supplies comprehensive context, not certainty. Medical symptoms, sharp pain, and decisions that exceed training advice belong with an appropriate professional.",
        },
      ],
      related: [
        "ug/your-data#what-is-stored",
        "ug/prescription-details#who-writes-the-numbers",
      ],
    },
  ],
};
