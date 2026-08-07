// User Guide — chapter 8, "Exercise-level RIR" (doc 22 §5, §6.2).
//
// GROUND TRUTH (22b §7 ch. 8 — doc 21, `queries/slot-effort.ts`,
// `lib/slot-effort-display.ts`, `EffortSheet.tsx`, migration
// `20260804000001_backed_off_stats_policy.sql`, `rules/progression.ts`):
//   - resolution is ABSOLUTE: `resolvedRir = slotRir ?? weekRir`, no floor, no
//     clamp, and removing the assignment restores the ramp with nothing to
//     unwind (`resolveSlotEffort`)
//   - the sheet offers 0 plus four steps EASIER than the week (`EASIER_STEPS =
//     [1,2,4,8]`) and a custom value 0–30 (`RIR_MAX`)
//   - "backed off" is an intent key, not a measurement: `slotRir > weekRir`
//     (`isBackedOffSlot`), mirrored in SQL as
//     `workout_exercises.target_rir > microcycles.target_rir`
//   - the §6.2 read-time policy IS LIVE. `best_e1rm` (v_exercise_overview,
//     v_meso_summary) and the best-set PR view drop backed-off sets;
//     `weight_pr` / `volume_pr` / `total_volume` / `times_trained` keep them,
//     because those are observations rather than strength estimates;
//     `backed_off_sets` is the disclosure count
//   - the earn gate refuses explicitly — `progression.ts:251`, reason
//     `exercise_rir` — and an assignment-active session cannot arm the miss
//     throttle either
//   - the set cap and rep position are CONNECTOR-set and read-only in the
//     sheet (`SET BY YOUR COACH`); `cappedSets` lets an authored cap go BELOW
//     `min_sets` on purpose
//   - the global ceiling is `max_sets_per_exercise` (6), `clampSets`
//
// NOT LIVE — DO NOT WRITE (22b §4.1 ①): the measuring band, `max_measuring_rir`,
// "priced but not treated as a measurement". v26 is inactive, so today every
// logged set at every RIR is treated as a measurement. The reassurance a reader
// needs is §6.2's comparability policy, which is live, and that is what
// `#what-it-does-to-your-numbers` is written from. Doc 22 §6.2's third and
// fourth bullets are amended on this basis (22b §4.1 ①, "Instruction for Phase
// 3d").
//
// SEAMS: ch. 6 owns the lever's controls and the week's ramp; ch. 7 owns the
// ramp as a choice; ch. 11 owns feedback; ch. 10 owns how a weight is chosen;
// ch. 13 owns the stats screens. Claims: `C-perex-05` onward in 22a.

import type { ManualChapter } from "../types";

export const UG_EXERCISE_LEVEL_RIR: ManualChapter = {
  manual: "ug",
  slug: "exercise-level-rir",
  number: 8,
  title: "Exercise-level RIR",
  summary:
    "Running one exercise at its own effort — easier while you protect something, harder where the week's ramp is not the limit — and what each direction does to your numbers.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "why-one-exercise-differs",
      title: "Why one exercise gets its own target",
      summary:
        "The week's ramp is one number for every lift in it, and real training has exceptions.",
      keywords: [
        "effort target",
        "per exercise rir",
        "exception",
        "one lift different",
        "absolute",
        "unbounded",
        "override the ramp",
      ],
      blocks: [
        {
          kind: "para",
          text: "A week's ramp asks one effort of every exercise in it. Most weeks that is right. Some weeks it is right for eleven exercises and wrong for the twelfth — a joint you are working around, or a small isolation lift that the week's ramp is not really what limits.",
        },
        {
          kind: "para",
          text: "The lever came out of a real case: a lifter working around a nerve problem had a plan agreed with a coach — this movement stays light for a fortnight — and nowhere in the app to put it. That origin is why it works the way it does.",
        },
        { kind: "heading", text: "Two rules cover the whole feature" },
        {
          kind: "list",
          items: [
            [
              { strong: "It is absolute." },
              " Set a target on an exercise and that target is what the exercise runs at, whatever the week says. Clear it and the exercise is back on the ramp, with nothing left over to undo.",
            ],
            [
              { strong: "It has no ceiling." },
              " The week's own ramp stops at ",
              { num: "5" },
              " reps in reserve. An exercise-level target goes as far as you need, which is what lets one lever cover a light week, a rehab block and an extra push.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Both directions travel the same path — the weight is re-priced to meet the effort you asked for, lighter for a higher target and heavier for a lower one. Backing an exercise off and pushing it harder are one lever, and the ",
            { to: "ug/effort-rir#per-exercise", text: "controls are the same either way" },
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
        "Protecting a lift without dropping it: raise its target, and the load follows.",
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
          text: "Assign a target above the week's and the exercise gets easier in the way that keeps it useful: the same movement, the same slot in the session, at a weight chosen to leave those extra reps in the tank.",
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
            " above the week's own value, plus any number you type. A step of ",
            { num: "1" },
            " or ",
            { num: "2" },
            " is a lift you are being careful with; ",
            { num: "8" },
            " and beyond is a movement you are keeping in the session while it recovers.",
          ],
        },
        { kind: "heading", text: "Leave a reason" },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "REASON" },
            " field travels with the assignment and shows up wherever the assignment does — on the exercise itself, and in the reasoning under ",
            { to: "ug/training-a-session#the-day-screen", text: "the day's ask" },
            ". Three weeks later it is the difference between a lift that looks stalled and a lift you deliberately parked.",
          ],
        },
        {
          kind: "para",
          text: [
            "The exercise carries ",
            { ui: "BACKED OFF" },
            " above its name for as long as the assignment is easier than the week it sits in, so nothing about the session is quietly different from what the plan shows.",
          ],
        },
        { kind: "heading", text: "Coming back" },
        {
          kind: "para",
          text: "Unwinding it is a return trip through the same sheet — one step at a time if you want to test the water, or straight back to the ramp. There is a good reason to step: the weight is priced off what you have been doing lately, so a lift that spent a month light comes back at a weight that reflects that.",
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
      title: "What a backed-off block does to your numbers",
      summary:
        "Easier work is set aside from strength reads and kept in your volume — and it is disclosed, not hidden.",
      keywords: [
        "backed off",
        "does it ruin my stats",
        "pr",
        "strength trend",
        "decline",
        "regression",
        "does light work count",
      ],
      estimate: true,
      blocks: [
        {
          kind: "para",
          text: "A month of deliberately light work is not a month of getting weaker, and the app is built so it cannot read as one. A slot assigned easier than its week is set aside from every strength read rather than folded in as a decline.",
        },
        {
          kind: "table",
          columns: ["Number", "A backed-off set"],
          rows: [
            ["your strength trend for that exercise", "left out"],
            ["your best estimated strength, for the exercise and for the block", "left out"],
            ["weekly sets per muscle, and your volume totals", "counted in full"],
            ["heaviest weight lifted, and best single set", "counted — those are things you did"],
          ],
        },
        { kind: "heading", text: "Disclosed, both ways" },
        {
          kind: "para",
          text: [
            "The sets that were set aside are counted and reported, so a block reads as ",
            { strong: "twelve of these sets were run easier on purpose" },
            " rather than as a gap. In your exercise history the session carries a ",
            { ui: "BACKED OFF" },
            " tag beside the date, the same way a deload week is tagged.",
          ],
        },
        {
          kind: "para",
          text: "The program also stops leading the weight upward while an assignment is easing an exercise, and says so in its reasoning. It keeps prescribing; it holds off on stepping the demand up, because a week that was made easier has not shown it earned more.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "One direction only",
          text: "An exercise run harder than its week keeps every claim it earns — those sets stay in your trend and can set records. Only the easier direction is set aside, because that is the one that would otherwise look like decline.",
        },
      ],
      related: [
        "ug/exercise-level-rir#pushing-an-exercise-harder",
        "ug/effort-rir#why-honesty-matters",
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
            " reps in reserve can leave real stimulus unclaimed on the small stuff while it protects you on the squat.",
          ],
        },
        {
          kind: "para",
          text: [
            "Assign that exercise a lower target and it runs closer to failure, at a heavier weight, while everything else keeps the week's setting. The exercise reads ",
            { ui: "PUSHED HARDER" },
            " above its name, and those sets stay in your strength reads in full.",
          ],
        },
        { kind: "heading", text: "It is bought with fatigue" },
        {
          kind: "para",
          text: [
            "Effort you add here is effort your recovery pays for, and it lands in the same budget the week's ramp was rationing. Use it where the movement is genuinely cheap. If a session starts coming back ",
            { to: "ug/how-it-felt#workload", text: "past just right" },
            ", the program takes a set off that exercise, which is the signal you overspent.",
          ],
        },
        { kind: "heading", text: "The set cap" },
        {
          kind: "para",
          text: [
            "An exercise can also carry a ceiling on its working sets, shown in the sheet under ",
            { ui: "SET BY YOUR COACH" },
            " and set through the AI connector. The program may prescribe fewer sets than the cap and never more, and a cap may go below the floor the program would otherwise keep — one hard set is a legitimate ask.",
          ],
        },
        {
          kind: "para",
          text: [
            "Above every assignment sits a plain ceiling: ",
            { num: "6" },
            " working sets for any one exercise (",
            { code: "max_sets_per_exercise" },
            ").",
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
          text: "Weeks already behind you are never rewritten. A session that is done, in progress or skipped is training that already happened, so an assignment applies from the week you are in forward.",
        },
        { kind: "heading", text: "On the planner board" },
        {
          kind: "para",
          text: [
            "The board shows one block-wide value in its ",
            { ui: "RIR" },
            " column, because the board is a view of the block's shape rather than of one week. An exercise carrying week-by-week assignments reads ",
            { ui: "RIR BY WEEK" },
            " there and keeps every one of them.",
          ],
        },
        {
          kind: "para",
          text: [
            "Assignments belong to the plan, not to the session, so ",
            {
              to: "ug/planning-a-mesocycle#starting-a-block",
              text: "copying a block",
            },
            " brings them along. Worth a look before you start the copy, if the reason for one has passed.",
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
