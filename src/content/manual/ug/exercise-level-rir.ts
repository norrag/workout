// User Guide — chapter 8, "Exercise-level RIR" (doc 22 §5, §6.2).
//
// GROUND TRUTH (22b §7 ch. 8 — doc 21, `queries/slot-effort.ts`,
// `queries/anchors.ts`, `lib/slot-effort-display.ts`, `EffortSheet.tsx`,
// migration `20260804000001_backed_off_stats_policy.sql`,
// `rules/progression.ts`, `engine/predict.ts`):
//   - resolution is ABSOLUTE: `resolvedRir = slotRir ?? weekRir`, no floor, no
//     clamp; removing the assignment restores the ramp
//   - the sheet offers 0 plus four steps EASIER than the week (`EASIER_STEPS =
//     [1,2,4,8]`) and a custom value 0–30 (`RIR_MAX`)
//   - "backed off" is the plan's INTENT: `slotRir > weekRir`
//     (`isBackedOffSlot`), mirrored in SQL as
//     `workout_exercises.target_rir > microcycles.target_rir`
//   - §6.2 read-time policy is LIVE. `best_e1rm` (v_exercise_overview,
//     v_meso_summary) and the best-set PR view drop backed-off sets;
//     `weight_pr` / `volume_pr` / `total_volume` / `times_trained` keep them
//   - **backed-off sets STAY IN THE ANCHOR up to the measuring band**
//     (`queries/anchors.ts` — the only per-sample exclusion is
//     `isMeasuringRir`). Doc 21 §5 is explicit about why they are kept:
//     excluding them would freeze the anchor and make the return prescription
//     jump straight back to full load. What holds the weight during a shallow
//     back-off is the CONFIDENCE ladder — a set more than 3 RIR from failure is
//     `low`, and `progression.min_confidence` is `moderate` (ledger `D-20`)
//   - **the measuring band is LIVE** — v26 activated 2026-08-10 18:05 UTC
//     (`params_hash 6dd02244…`, `e1rm.max_measuring_rir: 8`), so a set at an
//     assumed RIR ABOVE 8 is priced and performed but not measured: stamp
//     `none`, out of the anchor and every strength surface, kept in volume
//     (doc 21 §6.1). Nine is reachable only through THIS chapter's lever — the
//     week ramp tops out at 5 and the deload at 6 — which is why the band is
//     written here and in ch. 10 and nowhere else (ledger `D-21`)
//   - the two rules are different questions and both are on: §6.1 asks *is this
//     a measurement at all* (at the stamp), §6.2 asks *is it comparable* (at
//     read time). A set can be inside the band and still backed off
//   - the earn gate refuses explicitly — `progression.ts:251`, reason
//     `exercise_rir`
//   - the set cap and rep position are CONNECTOR-set, read-only in the sheet
//     (`SET BY YOUR COACH`); `cappedSets` lets an authored cap go BELOW
//     `min_sets`; the global ceiling is `max_sets_per_exercise` (6)
//
// RE-CHECK BEFORE EDITING: every band sentence below is true only while
// `e1rm.max_measuring_rir` is on the ACTIVE `engine_params` row (22b §4.2).
// Doc 22 **O3** forbids documenting a parameter that is not live — which is
// exactly why this prose was absent until 2026-08-10.
//
// VOICE (doc 22 §8.4e, owner review round 6): say what the lever does, what it
// is for, how to use it, and which values change behavior. No origin story, no
// rule-counting scaffolding, no parameter names outside a `detail` block.
//
// SEAMS: ch. 6 owns the controls; ch. 7 owns the ramp as a choice; ch. 10 owns
// the anchor and the step; ch. 11 owns feedback; ch. 13 owns the stats screens.
// Claims: `C-perex-05` onward in 22a.

import type { ManualChapter } from "../types";

export const UG_EXERCISE_LEVEL_RIR: ManualChapter = {
  manual: "ug",
  slug: "exercise-level-rir",
  number: 8,
  title: "Exercise-level RIR",
  summary:
    "Running one exercise at its own effort — easier while you protect something, harder where the week's ramp is not the limit — and which values change what.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "why-one-exercise-differs",
      title: "What it does",
      summary:
        "One exercise runs at its own target RIR instead of the week's, and the weight is repriced to meet it.",
      keywords: [
        "effort target",
        "per exercise rir",
        "one lift different",
        "absolute",
        "unbounded",
        "override the ramp",
        "which values matter",
      ],
      blocks: [
        {
          kind: "para",
          text: "A week's ramp asks one effort of every exercise in it. Give one exercise a target of its own and that target wins — whatever the week says — and the weight is repriced to meet it: lighter for a higher target, heavier for a lower one. Clear it and the exercise is back on the ramp.",
        },
        {
          kind: "para",
          text: [
            "The week's own ramp stops at ",
            { num: "5" },
            " reps in reserve; an exercise-level target has no ceiling. That is what lets one control cover a lift you are protecting for two weeks and a lift you want to push harder all block.",
          ],
        },
        { kind: "heading", text: "Which values change what" },
        {
          kind: "table",
          columns: ["Set it", "And"],
          rows: [
            [
              "above the week's target",
              "the exercise is marked backed off: it leaves your strength trend and records, and the weight stops stepping up",
            ],
            [
              "at or below the week's target",
              "the exercise keeps every claim it earns, and can still earn a step",
            ],
            [
              [{ num: "3" }, " or fewer reps short of failure"],
              "the session is read confidently enough for the weight to step up",
            ],
            [
              [{ num: "4" }, " or more"],
              "the weight holds until a harder session comes in",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The control is the exercise's ",
            { ui: "…" },
            " menu → ",
            { ui: "Effort target" },
            ", in the day view or on a planned day — ",
            {
              to: "ug/effort-rir#per-exercise",
              text: "the steps are in chapter 6",
            },
            ".",
          ],
        },
      ],
      related: [
        "ug/effort-rir#per-exercise",
        "ug/exercise-level-rir#backing-an-exercise-off",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "backing-an-exercise-off",
      title: "Backing an exercise off",
      summary:
        "Keep the movement in the session at a lower cost: raise its target, and the load follows.",
      keywords: [
        "rehab",
        "injury",
        "niggle",
        "sore shoulder",
        "go lighter",
        "protect a lift",
        "easier",
        "backed off",
      ],
      blocks: [
        {
          kind: "para",
          text: "Use it when a movement needs to cost less for a while — a joint you are working around, a lift you are rebuilding, or one you want to hold steady while everything else advances. The exercise keeps its slot in the session at a weight chosen to leave the extra reps in the tank.",
        },
        {
          kind: "para",
          text: [
            "The sheet offers steps of ",
            { num: "1" },
            ", ",
            { num: "2" },
            ", ",
            { num: "4" },
            " and ",
            { num: "8" },
            " above the week's value, plus any number you type. One or two steps is being careful; ",
            { num: "8" },
            " and beyond is keeping a movement in the session while it recovers.",
          ],
        },
        { kind: "heading", text: "Leave a reason" },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "REASON" },
            " field travels with the assignment and appears wherever the assignment does — on the exercise, and in the reasoning under ",
            { to: "ug/training-a-session#the-day-screen", text: "the day's ask" },
            ". Three weeks later it is what separates a lift that stalled from one you parked on purpose.",
          ],
        },
        {
          kind: "para",
          text: [
            "The exercise carries ",
            { ui: "BACKED OFF" },
            " above its name while the assignment is easier than its week, so the session shows what it is.",
          ],
        },
        { kind: "heading", text: "Coming back" },
        {
          kind: "para",
          text: "Clear the target and the ramp takes over from the next session. Step back in stages if you want to test it — the weight is priced off what you have been lifting lately, so a month of light work comes back at a weight that reflects it rather than at where you left off.",
        },
      ],
      related: [
        "ug/exercise-level-rir#what-it-does-to-your-numbers",
        "ug/exercise-level-rir#how-far-it-reaches",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-it-does-to-your-numbers",
      title: "What it does to your numbers",
      summary:
        "Easier work leaves your strength trend and records, stays in your volume, and holds the weight steady rather than lowering it.",
      keywords: [
        "backed off",
        "does it ruin my stats",
        "pr",
        "strength trend",
        "decline",
        "anchor",
        "does light work count",
      ],
      estimate: true,
      blocks: [
        {
          kind: "para",
          text: "A month of deliberately light work is not a month of getting weaker, and the app is built so it cannot read as one.",
        },
        {
          kind: "table",
          columns: ["Number", "A backed-off set"],
          rows: [
            ["your strength trend, and your best estimated strength", "left out"],
            ["records for the exercise and the block", "left out"],
            ["weekly sets per muscle, volume, weight and session records", "counted — those are things you did"],
            [
              "the anchor your next weight is priced from",
              "counted while the target stays within reach of failure, and the reason is below",
            ],
          ],
        },
        { kind: "heading", text: "Why easy sets still anchor" },
        {
          kind: "para",
          text: "The anchor keeps them on purpose. An estimate already accounts for the reps you left, so a light set priced at a high target lands near where a normal set would — and dropping those sets instead would freeze the anchor at your pre-backoff level, so the first session after you cleared the target would jump straight back to full load.",
        },
        {
          kind: "para",
          text: [
            "What holds the weight steady is confidence, not exclusion. A set more than ",
            { num: "3" },
            " reps short of failure is a rough read, and the program steps the weight up only off a session it can read well. So while you are backed off the weight holds, and it starts moving again once you put in a session at ",
            { num: "3" },
            " or closer.",
          ],
        },
        { kind: "heading", text: "Past a very easy target, nothing is measured" },
        {
          kind: "para",
          text: [
            "Set a target further than ",
            { num: "8" },
            " reps from failure and the app treats those sets as work rather than as a reading: priced and performed as usual, counted in your volume, and left out of any strength estimate. Your anchor holds at the last session it genuinely measured, so you come back to the weight you last earned.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "One direction only",
          text: "An exercise run harder than its week keeps every claim it earns — those sets stay in your trend and can set records. Only the easier direction is set aside, because that is the one that would otherwise look like decline.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The reading cutoff is ",
                { code: "e1rm.max_measuring_rir" },
                ". Past it a set is stored with no estimate and a rating of ",
                { ui: "none" },
                ", which is what keeps it out of the anchor and out of every strength surface while volume and adherence still count it. It is measured against the effort the set was performed at — your own report where you gave one, the prescribed target otherwise.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#the-anchor",
        "ug/exercise-level-rir#pushing-an-exercise-harder",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "pushing-an-exercise-harder",
      title: "Pushing an exercise harder",
      summary:
        "Where the week's ramp is not the real limit, a lower target claims the stimulus it leaves behind.",
      keywords: [
        "harder",
        "push harder",
        "isolation",
        "lateral raise",
        "curls",
        "lower rir",
        "extra effort",
        "set cap",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The ramp is set by what heavy compound work costs you. A lateral raise does not cost that, so a week sitting at ",
            { num: "3" },
            " reps in reserve leaves real stimulus unclaimed on the small stuff while it protects you on the squat. Give those exercises a lower target and they run closer to failure at a heavier weight.",
          ],
        },
        {
          kind: "para",
          text: [
            "The exercise reads ",
            { ui: "PUSHED HARDER" },
            " above its name, and those sets stay in your strength reads in full. It is the direction most people have room in.",
          ],
        },
        {
          kind: "para",
          text: [
            "The cost is recovery, out of the same budget the ramp was rationing. If the sessions start coming back ",
            { to: "ug/how-it-felt#workload", text: "past just right" },
            ", the program takes a set off that exercise — which is the signal you spent more than you had.",
          ],
        },
        { kind: "heading", text: "The set cap" },
        {
          kind: "para",
          text: [
            "An exercise can also carry a ceiling on its working sets, shown under ",
            { ui: "SET BY YOUR COACH" },
            " and set through the AI connector. The program may prescribe fewer than the cap and never more, and a cap can go below the program's own floor — one hard set is a legitimate ask. Above every assignment sits a plain ceiling of ",
            { num: "6" },
            " working sets for one exercise.",
          ],
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The global ceiling is ",
                { code: "max_sets_per_exercise" },
                " and the floor the cap may undercut is ",
                { code: "min_sets" },
                ".",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/exercise-level-rir#how-far-it-reaches",
        "ug/how-it-felt#workload",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-far-it-reaches",
      title: "How far an assignment reaches",
      summary:
        "This week, every working week, or every week including the deload — and how it reads on the planner board.",
      keywords: [
        "applies to",
        "scope",
        "this week",
        "working weeks",
        "all weeks",
        "deload",
        "rir by week",
        "planner board",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "APPLIES TO" },
            " decides how much of the block an assignment covers. The three choices differ in one thing that is easy to miss, and it is the deload week.",
          ],
        },
        {
          kind: "table",
          columns: ["Choice", "Reaches"],
          rows: [
            [[{ ui: "THIS WEEK" }], "the week you are in, and no other"],
            [
              [{ ui: "WORKING WEEKS" }],
              "this week and every working week after it — the deload keeps its own target",
            ],
            [
              [{ ui: "ALL WEEKS" }],
              "every working week and the deload, which is the one choice that reaches it",
            ],
          ],
        },
        {
          kind: "para",
          text: "Weeks already behind you are never rewritten — an assignment applies from the week you are in forward.",
        },
        { kind: "heading", text: "On the planner board" },
        {
          kind: "para",
          text: [
            "The board shows one block-wide value in its ",
            { ui: "RIR" },
            " column, because it is a view of the block's shape rather than of one week. An exercise carrying week-by-week assignments reads ",
            { ui: "RIR BY WEEK" },
            " there and keeps every one of them.",
          ],
        },
        {
          kind: "para",
          text: [
            "Assignments belong to the plan, so ",
            {
              to: "ug/planning-a-mesocycle#starting-a-block",
              text: "copying a block",
            },
            " brings them along — worth a look before you copy, if the reason for one has passed.",
          ],
        },
      ],
      related: [
        "ug/effort-rir#per-exercise",
        "ug/planning-a-mesocycle#editing-a-running-block",
      ],
    },
  ],
};
