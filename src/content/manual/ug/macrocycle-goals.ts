// User Guide — chapter 14, "Macrocycle goals" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 14 — `engine/macro.ts`, `queries/macro.ts`,
// `queries/macro-close.ts`, `queries/macro-retrospective.ts`,
// `queries/engine-goal.ts`, `queries/plan-rate.ts`, `cycles/new/CreateMacroForm.tsx`,
// `cycles/macro/[macroId]/page.tsx`, and the active v25 row re-read 2026-08-11):
//   - the goal is the ONE field with engine consequences beyond the name:
//     `engineGoal()` maps it onto the progression goal, which selects the
//     `rep_window` (strength 3–5 within 2–6; everything else 8–12 within 6–15)
//     and the `progression.goal_rate_factor` (cut 0 · maintain 0 · gain and
//     hypertrophy 0.75 · strength 1). A standalone block with no macro defaults
//     to the hypertrophy window
//   - `planMacrocycle` derives a target band, a per-month rate, a recommended
//     duration, the block count (`floor(months × 4.33 / mesoLengthWeeks)`) and
//     the phase spread. The reader chooses name, goal, duration, block length
//   - **THE FINDING (`D-15`).** The `YOUR TARGET` / rate / rationale / model-band
//     cards are HIDDEN on both the create and edit forms — N54, owner
//     2026-07-11, rolled back until the N43 v23 band is trustworthy
//     (`CreateMacroForm.tsx:204`, `EditMacroForm.tsx:234`,
//     `macro/[macroId]/page.tsx:79`). `planMacrocycle` still runs for the block
//     math, and `LAST BLOCK MEASURED` stays because it is measured. So the band
//     is computed, stored (`macrocycles.target_*`, `rate_*`), and reaches the
//     user through the CONNECTOR (`formatMacroSummary.target`) and through the
//     retrospective's `TARGET` band — never through a create screen. 22c §B2.2
//     says otherwise and is corrected in this PR
//   - `macro_target.present: "conservative_end"` has NO code consumer. The only
//     thing that reads it is `COACHING_GUIDE`'s prose instruction to the
//     assistant. So "you see the conservative end" is a rule about what an AI
//     tells you, not about a rendered app number
//   - pacing: `rate_source: "plan"` means the pacer reads
//     `planMacrocycle(...).strengthRatePctMonth` off the LIVE profile
//     (`queries/plan-rate.ts`), times `goal_rate_factor[goal]`, at
//     `band_position` — moved per-user by the envelope loop once 2 qualifying
//     blocks exist. 22b §4.3 forbids describing pacing as a fixed rule
//   - close: `macroClosesNaturally` — every positioned real block terminal, at
//     least one of them existing; `unplanned` placeholders do not hold it open.
//     Or `End macrocycle`, which drives open blocks terminal first. A terminal
//     macro is frozen (`isTerminalMacroStatus`) — goals edits refused
//   - the retrospective grades against the STORED contract, never a live
//     recompute: `within band` / `above band` / `below band` /
//     `insufficient data`, plus `NOT MEASURED` and `NOT COMPARABLE` as answers.
//     The Overview's live plan is a recompute; the grade is the contract
//
// SEAMS: ch. 2 owns which profile fields feed the model; ch. 3 owns the cycle
// nesting; ch. 4 owns building a block; ch. 10 owns the earned step the pacer
// governs; ch. 13 owns the stats tiles; ch. 16 owns body data and DEXA.
// Claims: `C-macro-01` onward.

import type { ManualChapter } from "../types";

export const UG_MACROCYCLE_GOALS: ManualChapter = {
  manual: "ug",
  slug: "macrocycle-goals",
  number: 14,
  title: "Macrocycle goals",
  summary:
    "The goal you set on a macrocycle is the one setting that reaches all the way down into your prescriptions — and the block it opens is graded against the promise it was created under.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-four-goals",
      title: "The four goals",
      summary:
        "Growth, strength, cutting or maintaining — and what each one changes about the training underneath.",
      keywords: [
        "hypertrophy",
        "strength",
        "cut",
        "maintain",
        "goal",
        "which goal should i pick",
        "what does the goal do",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A ",
            { term: "macrocycle" },
            " carries one goal for its whole run, and that goal is not a label. It picks the rep range your prescriptions work inside, and it decides whether the program leads the weight up at all.",
          ],
        },
        {
          kind: "table",
          columns: ["Goal", "Reps it works in", "Does the weight climb?"],
          rows: [
            [[{ ui: "HYPERTROPHY" }], [{ num: "8–12" }], "yes, at three quarters of the modelled rate"],
            [[{ ui: "STRENGTH" }], [{ num: "3–5" }], "yes, at the full rate"],
            [[{ ui: "CUT" }], [{ num: "8–12" }], "no — the aim is to keep what you have"],
            [[{ ui: "MAINTAIN" }], [{ num: "8–12" }], "no"],
          ],
        },
        {
          kind: "para",
          text: [
            "The two that hold are deliberate. Asking for more weight while you are eating less is asking for a miss, so a cutting block prices each week off ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "what you have recently done",
            },
            " and leaves it there. Holding your lifts through a cut is the result you want from it.",
          ],
        },
        {
          kind: "para",
          text: "A block you start on its own, with no macrocycle over it, trains in the growth range and progresses like a growth block. Most blocks are growth blocks, so that is the default a standalone one gets.",
        },
      ],
      related: [
        "ug/macrocycle-goals#setting-one-up",
        "ug/how-your-weight-is-chosen#from-a-number-to-a-weight",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "setting-one-up",
      title: "Setting one up",
      summary:
        "You choose four things; the engine works out how many blocks fit and what shape they take.",
      keywords: [
        "create macrocycle",
        "new macrocycle",
        "duration",
        "how long",
        "mesocycle length",
        "phases",
        "accumulate intensify peak",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "Create new" },
            " on the Cycles tab, then ",
            { ui: "Macrocycle" },
            ". Four fields, and each one is yours: a name, the goal, how many months, and how long each block should be.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Duration",
              text: "Presets, or a custom number of months. It sets how far ahead the arc is drawn.",
            },
            {
              label: "Block length",
              text: "Three to eight weeks, deload included. The suggested value is a reasonable starting point rather than a recommendation you need to defend.",
            },
          ],
        },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "PLAN" },
            " card underneath recalculates as you go: how many blocks fit into the months you picked, and a suggested phase for each — building volume early, sharpening in the middle, one peak at the end where there is room for one. Where you have finished a block already, ",
            { ui: "LAST BLOCK MEASURED" },
            " shows the strength rate it actually produced.",
          ],
        },
        {
          kind: "para",
          text: [
            "Creating it lays down empty slots rather than plans — one per block, each waiting for you to ",
            {
              to: "ug/planning-a-mesocycle#starting-a-block",
              text: "build it when you reach it",
            },
            ". You plan each block at the point you are about to train it, with the last one's results already in.",
          ],
        },
      ],
      related: [
        "ug/macrocycle-goals#the-target-behind-it",
        "ug/planning-a-mesocycle#starting-a-block",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-target-behind-it",
      title: "The target behind it",
      summary:
        "Every macrocycle is created with a realistic target worked out from your profile, and it does two jobs afterwards.",
      estimate: true,
      keywords: [
        "target",
        "realistic target",
        "how much can i gain",
        "goal range",
        "recommended duration",
        "band",
        "projection",
      ],
      blocks: [
        {
          kind: "para",
          text: "When you create a macrocycle, the app works out what that goal plausibly means for you over that many months — a range, not a figure, and a per-month rate to go with it. It is built from your profile: sex, age, height, bodyweight, how long you have trained, and your body-fat reading where you have one.",
        },
        {
          kind: "para",
          text: [
            "That range is ",
            { strong: "kept as the block's contract" },
            " and it does two jobs quietly, in the background: it sets how fast the app is willing to lead your weights up, and it is what the arc is graded against when it finishes.",
          ],
        },
        {
          kind: "para",
          text: [
            "The create screen therefore stays quiet about the number. To read it, ask an assistant you have ",
            {
              to: "ug/what-workout-is#the-five-tabs",
              text: "connected to the app",
            },
            " — it can give you the range, the per-month rate and the timeframe the model would recommend for that goal.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A conservative estimate, and a moving one",
          text: "The range is a model of typical outcomes under good training, food and sleep — three things the app does not watch. Individual variation is wider than the model, so an assistant is instructed to quote you the cautious end of it. It is also recomputed from your profile as that profile changes, so the figure you are quoted in month four need not match month one.",
        },
      ],
      related: [
        "ug/macrocycle-goals#how-it-paces-your-weights",
        "ug/your-profile#what-it-is-for",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-it-paces-your-weights",
      title: "How it paces your weights",
      summary:
        "The goal's rate band is what decides whether an earned increase ships this week or waits.",
      estimate: true,
      keywords: [
        "pacing",
        "why is the weight not going up",
        "rate",
        "too slow",
        "too fast",
        "progression rate",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Session by session, the program decides whether you have ",
            {
              to: "ug/how-your-weight-is-chosen#leading-by-one-step",
              text: "earned an increase",
            },
            ". The macrocycle decides whether now is when you get it.",
          ],
        },
        {
          kind: "para",
          text: "The app watches how fast the weight it has been asking for has actually climbed over the last month, and compares that against the rate your goal and profile make realistic. Climbing at pace already, and an earned increase waits for a week where it is needed. Behind pace, and it ships.",
        },
        {
          kind: "para",
          text: "That is what stops a good month compounding into a demand you cannot hold. The rate is the thing keeping the ask tethered to what a body of your age, training history and goal tends to be able to do.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "It follows your own blocks",
          text: "Once you have a couple of completed blocks behind you, the app moves your pace within that band based on how those blocks actually went — how often you earned increases and how often you met them. Two people with the same plan and the same profile can end up paced differently, and your own pace changes as your history builds.",
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#how-often-a-step-comes",
        "ug/macrocycle-goals#finishing-an-arc",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "finishing-an-arc",
      title: "Finishing an arc",
      summary:
        "A macrocycle closes itself when its blocks are done, and the Overview becomes a graded retrospective.",
      estimate: true,
      keywords: [
        "end macrocycle",
        "complete",
        "retrospective",
        "verdict",
        "did i hit my goal",
        "within band",
        "close out",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A macrocycle completes on its own once every block in it has finished or been abandoned — empty slots you never built do not hold it open. You can also close one early from the header menu with ",
            { ui: "End macrocycle" },
            ", which finishes any open blocks first.",
          ],
        },
        {
          kind: "para",
          text: [
            "Once closed, the arc is a record: its goals are fixed and its Overview swaps ",
            { ui: "MACROCYCLE STATS · TO DATE" },
            " for ",
            { ui: "RETROSPECTIVE" },
            ", graded against the target it was created under rather than against what the model would say about you today.",
          ],
        },
        {
          kind: "table",
          columns: ["Row", "What it grades"],
          rows: [
            [[{ ui: "STRENGTH" }], "your strength trend against the contract band — informational where strength was never the promise"],
            [[{ ui: "MASS" }], "measured bodyweight change, and only ever measured"],
            [[{ ui: "COMPOSITION" }], "lean and fat change between scans that bracket the arc"],
            [[{ ui: "PROGRESSION" }], "how many increases were earned, paced back, and held"],
            [[{ ui: "BLOCKS" }], "how many blocks were completed, abandoned, or never built"],
          ],
        },
        {
          kind: "para",
          text: [
            { ui: "NOT MEASURED" },
            " and ",
            { ui: "NOT COMPARABLE" },
            " are answers here, not gaps. The first means the arc has no body data to grade against; the second means the scans it does have came from different machines. Both are the honest result, and the app prefers them to a number it would have to invent.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#where-to-look",
        "ug/macrocycle-goals#the-target-behind-it",
      ],
    },
  ],
};
