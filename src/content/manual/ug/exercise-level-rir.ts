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
//   - **the measuring band is LIVE** — v27 activated 2026-08-12
//     (`params_hash f8dcfb51…`, `e1rm.max_measuring_rir: 5`), so a set at an
//     assumed RIR ABOVE 5 is priced and performed but not measured: stamp
//     `none`, out of the anchor and every strength surface, kept in volume
//     (doc 21 §6.1). The working-week ramp tops out at the boundary; this
//     chapter's lever can go past it, and the standard deload now sits at 8
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
    "Set one exercise to run easier or harder than the week's effort target, and see how that changes its weight and stats.",
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
          text: "The week's ramp sets the default effort for every exercise. An exercise-level target replaces that default for one exercise. A higher target lowers its weight; a lower target raises it. Clear the target to use the week's ramp again.",
        },
        // N81 — the card the Effort target sheet now opens from its own
        // `TARGET RIR` label, so the sheet and this chapter are one wording.
        { kind: "term", term: "exercise_target_rir" },
        {
          kind: "para",
          text: [
            "The week's ramp stops at ",
            { num: "5" },
            " reps in reserve. You can set an exercise from 0 to 30 reps in reserve, so the same control can make one lift harder or much easier.",
          ],
        },
        { kind: "heading", text: "Which values change what" },
        {
          kind: "table",
          columns: ["Set it", "And"],
          rows: [
            [
              "above the week's target",
              "the exercise is marked backed off, leaves your strength trend and records, and cannot earn a weight increase",
            ],
            [
              "at or below the week's target",
              "the exercise stays in your strength results and can earn a weight increase",
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
          text: "Raise the target when you need to protect a joint, rebuild a lift, or hold one exercise steady. The exercise stays in the session, and its weight drops enough to leave the requested reps in reserve.",
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
            " above the week's value, plus any number you type. Use a small increase for a modest reduction in effort. Use ",
            { num: "8" },
            " or more to keep the movement very easy while it recovers.",
          ],
        },
        { kind: "heading", text: "Leave a reason" },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "REASON" },
            " field is saved with the assignment. It appears on the exercise and in the reasoning under ",
            {
              to: "ug/training-a-session#the-day-screen",
              text: "the day's ask",
            },
            ". Write why you changed the effort so the lighter work is clearly intentional when you review it later.",
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
        // N81 — the mark is met here, so the definition is here (§8.4c rule 2).
        // The next section is what it costs you; this is what it says.
        { kind: "term", term: "backed_off" },
        { kind: "heading", text: "Coming back" },
        {
          kind: "para",
          text: "Clear the target and the ramp takes over at the next session. You can also lower the target in stages. The app prices each session from your recent work, so your return weight reflects what you have been lifting during the back-off.",
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
          text: "The app records deliberately easier work without treating it as a loss of strength.",
        },
        {
          kind: "table",
          columns: ["Number", "How a backed-off set reads"],
          rows: [
            [
              "your strength trend, and your best estimated strength",
              "left out",
            ],
            ["records for the exercise and the block", "left out"],
            [
              "weekly sets per muscle, volume, weight and session records",
              "counted — those are things you did",
            ],
            [
              "the strength anchor your next set is based on",
              "counted through 5 RIR; left out above it",
            ],
          ],
        },
        { kind: "heading", text: "Why some easy sets still anchor" },
        {
          kind: "para",
          text: "Through 5 RIR, backed-off sets still update the strength anchor. The estimate accounts for the reps you left, so it can compare a lighter set with your normal work. This keeps your return weight tied to recent training instead of jumping back to the weight you used before the back-off.",
        },
        {
          kind: "para",
          text: [
            "A set more than ",
            { num: "3" },
            " reps short of failure is a rough strength reading. It can update the anchor, but it cannot earn a weight increase. The weight can increase again after a session at ",
            { num: "3" },
            " or closer.",
          ],
        },
        {
          kind: "heading",
          text: "Targets above 5 are not strength measurements",
        },
        {
          kind: "para",
          text: [
            "Set a target further than ",
            { num: "5" },
            " reps from failure and the app stops using those sets as strength measurements. They are prescribed and logged normally and still count toward volume. Your strength estimates and anchor stay at the last measurable session.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "One direction only",
          text: "An exercise run harder than its week stays in your strength trend and can set records. The app only sets aside easier work, because that work was deliberately reduced.",
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
        "Lower one exercise's target to run it closer to failure than the rest of the week.",
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
            "The week's ramp must account for fatiguing compound lifts. A smaller isolation exercise may recover well at a harder effort. If the week is set to ",
            { num: "3" },
            " reps in reserve, you can give that exercise a lower target. Its prescribed weight rises so it finishes closer to failure.",
          ],
        },
        {
          kind: "para",
          text: [
            "The exercise reads ",
            { ui: "PUSHED HARDER" },
            " above its name. Those sets remain in your strength results and can set records.",
          ],
        },
        {
          kind: "para",
          text: [
            "Harder sets create more fatigue. If your session feedback starts coming back ",
            { to: "ug/how-it-felt#workload", text: "past just right" },
            ", the program removes a set from that exercise the following week.",
          ],
        },
        { kind: "heading", text: "The set cap" },
        {
          kind: "para",
          text: [
            "An exercise can also carry a ceiling on its working sets, shown under ",
            { ui: "SET BY YOUR COACH" },
            " and set through the AI connector. The program can prescribe fewer sets than the cap, but never more. A coach can cap an exercise at one working set. The overall maximum is ",
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
            " decides which weeks use the assignment. Only one choice also changes the deload.",
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
            " column. If the value changes by week, the board reads ",
            { ui: "RIR BY WEEK" },
            " instead of showing one value.",
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
