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
//     2026-07-11; re-enable declined by the owner 2026-08-14 (N52/N54
//     wontfix), so the band is permanently a background/connector-only
//     quantity and this chapter's positive framing is the settled truth
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
            " uses one goal for its full duration. The goal sets the prescription's rep range and decides whether weight increases are available.",
          ],
        },
        {
          kind: "table",
          columns: ["Goal", "Reps it works in", "Does the weight climb?"],
          rows: [
            [
              [{ ui: "HYPERTROPHY" }],
              [{ num: "8–12" }],
              "yes, at three quarters of the modelled rate",
            ],
            [[{ ui: "STRENGTH" }], [{ num: "3–5" }], "yes, at the full rate"],
            [
              [{ ui: "CUT" }],
              [{ num: "8–12" }],
              "no — the aim is to keep what you have",
            ],
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
          text: "A block you start on its own, with no macrocycle over it, trains in the hypertrophy range and progresses like a hypertrophy block. Most blocks are growth blocks, so that is the default a standalone one gets.",
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
        "Choose the goal, timeframe, weekly schedule, and starting point; the app suggests the blocks.",
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
              text: "Choose a preset or enter a number of months. This sets the macrocycle's duration.",
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
            " card shows how many blocks fit in the selected time and suggests a phase for each. It places volume-building blocks first, sharpening blocks next, and one peak at the end when time allows. If you have completed a block, ",
            { ui: "LAST BLOCK MEASURED" },
            " shows the strength rate it actually produced.",
          ],
        },
        // N81 — the create form marks the word `phases` inline and this is the
        // card behind it; the timeline prints one beside every block.
        { kind: "term", term: "phase" },
        {
          kind: "para",
          text: [
            "Creating a macrocycle adds one empty slot for each suggested block. ",
            {
              to: "ug/planning-a-mesocycle#starting-a-block",
              text: "Build each block when you are ready to train it",
            },
            ", using results from the previous block.",
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
          text: "The app estimates a target range and monthly rate for the selected goal and timeframe. It uses your sex, age, height, bodyweight, training history, and body-fat value when available.",
        },
        {
          kind: "para",
          text: [
            "That range is ",
            { strong: "kept as the block's contract" },
            ". It sets the maximum pace of weight increases and provides the target used to grade the finished macrocycle.",
          ],
        },
        {
          kind: "para",
          text: [
            "To read the target range, ask an assistant you have ",
            {
              to: "ug/what-workout-is#the-five-tabs",
              text: "connected to the app",
            },
            ". It can report the range, monthly rate, and recommended timeframe.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A conservative estimate, and a moving one",
          text: "The range assumes consistent training, food, and sleep, which the app does not monitor. Individual results vary more than the model shows, so an assistant quotes the cautious end. Profile changes can also change the range during the macrocycle.",
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
          text: "The app compares the last month's increase in prescribed weight with the target rate for your goal and profile. If you are already at that rate, an available increase waits. If you are behind it, the increase is applied.",
        },
        {
          kind: "para",
          text: "The target rate limits how quickly prescriptions rise. It keeps increases consistent with the selected goal, your profile, and your training history.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "It follows your own blocks",
          text: "After two completed blocks, the app adjusts your pace within the target range. It uses how often you earned increases and then completed them. Your pacing can therefore change as your training history grows.",
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
            "A macrocycle completes after every built block is finished or abandoned; unused empty slots are ignored. To close it early, choose ",
            { ui: "End macrocycle" },
            " from the header menu. This also finishes any open blocks.",
          ],
        },
        {
          kind: "para",
          text: [
            "When you close a macrocycle, its goals become fixed. Its Overview replaces ",
            { ui: "MACROCYCLE STATS · TO DATE" },
            " for ",
            { ui: "RETROSPECTIVE" },
            ". The retrospective grades the macrocycle against its original target.",
          ],
        },
        {
          kind: "table",
          columns: ["Row", "What it grades"],
          rows: [
            [
              [{ ui: "STRENGTH" }],
              "your strength trend against the contract band — informational where strength was never the promise",
            ],
            [
              [{ ui: "MASS" }],
              "measured bodyweight change, and only ever measured",
            ],
            [
              [{ ui: "COMPOSITION" }],
              "lean and fat change between scans that bracket the arc",
            ],
            [
              [{ ui: "PROGRESSION" }],
              "how many increases were earned, paced back, and held",
            ],
            [
              [{ ui: "BLOCKS" }],
              "how many blocks were completed, abandoned, or never built",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            { ui: "NOT MEASURED" },
            " and ",
            { ui: "NOT COMPARABLE" },
            " are explicit results. The first means the macrocycle lacks body data. The second means its scans came from different machines and cannot support a valid comparison.",
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
