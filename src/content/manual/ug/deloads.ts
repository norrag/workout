// User Guide — chapter 9, "Deloads" (doc 22 §5, §6.1).
//
// GROUND TRUTH (22b §7 ch. 9 — `engine/index.ts:251–325`, `rules/deload.ts`,
// `rules/rir.ts`, `queries/stats.ts::foldProgressScores`, migration
// `20260804000001`, `MesoHeader.tsx`, `DayView.tsx` (`End mesocycle`,
// `Skip remaining sets`), plus the 3d-r research pass §2.4):
//   - the deload week's target RIR is `deload.target_rir` (6 on live v25),
//     appended by `rirRamp` OUTSIDE the ramp
//   - sets = round(peak sets × `deload.set_pct` 0.5), floored at `min_sets` (2)
//   - the LOAD is chosen the same way a working week's is (`deload_anchor_rir`
//     true): the weight that lands window-centred reps at the deload RIR.
//     `deload.load_pct` is the no-anchor fallback only. "Halved" applies to
//     SETS and to nothing else (owner review round 6)
//   - deload sessions are dropped from the strength trend
//     (`foldProgressScores(deloadMicroIds)`) and were never counted in
//     attendance (`sessions_attended` / `sessions_due` filter `not is_deload`)
//   - `includes_deload` and block length are editable while `planned`
//     (`MesoHeader.tsx:568`) — and a started deload can still be SKIPPED:
//     `End mesocycle` in the day view's ⋮ menu skips all remaining sets on all
//     remaining days and completes the block; `Skip remaining sets` does one
//     exercise (owner review round 6)
//
// SPEC-VS-CODE GAP, written from the code (22b §7): doc 10 §3's graded volume
// ramp and its two-week-at-MRV auto-deload were deferred (T-A5) and are NOT
// implemented. Nothing triggers a deload; it is scheduled.
//
// DEFECT `D-08`, not fixed here: the create-mesocycle sheet hardcodes
// `DELOAD AT 4 RIR` while the live target is 6. Per the Phase-3a precedent this
// chapter states the truth and does not narrate the discrepancy.
//
// VOICE (doc 22 §8.4e, owner review round 6): a deload is a fatigue-management
// tool, said plainly. No "valve", no "shedding", no "performance debt" — the
// elaborate framing was doing no work the plain sentence does not. Four
// sections, not five: "when you need one" belongs with what it is.
//
// GUARDRAIL (doc 10 §9, enforced by `contracts.test.ts`): no growth or strength
// framing anywhere in the chapter.
//
// Claims: `C-deload-01` onward in 22a. Renders `deload`.

import type { ManualChapter } from "../types";

export const UG_DELOADS: ManualChapter = {
  manual: "ug",
  slug: "deloads",
  number: 9,
  title: "Deloads",
  summary:
    "A light week for managing fatigue — what changes in one, whether you need it, and how to drop it when you do not.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-a-deload-is",
      title: "What a deload is, and when you need one",
      summary:
        "A light week for managing fatigue. Take one when accumulated fatigue would hold back the next block, and skip it when it would not.",
      keywords: [
        "deload",
        "light week",
        "recovery week",
        "fatigue",
        "what is a deload",
        "do i need a deload",
        "how often deload",
      ],
      blocks: [
        { kind: "term", term: "deload" },
        {
          kind: "para",
          text: "A deload manages fatigue and does nothing else. Weeks of hard training leave you lifting below what you are capable of; a light week lets that clear while you keep training, so the next block starts from what you can actually do rather than from the bottom of the last one.",
        },
        {
          kind: "para",
          text: [
            { strong: "You will not always need one." },
            " It depends on how well you have been recovering. If the last two weeks were a grind, take it. If you finished the block fresh, drop it and start the next one — a deload you did not need is a week of training you did not get.",
          ],
        },
        { kind: "heading", text: "How often, honestly" },
        {
          kind: "para",
          text: "Competitive lifters surveyed on this all deload, typically for about a week every five or six, planned in advance and prompted by stalled performance, soreness or joint stress. The app's default sits inside that. It is a sensible convention rather than a proven rule.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: "The one controlled trial of a planned mid-block deload had its deload group stop training entirely for a week. That group finished slightly worse on lower-body strength, with no difference in muscle size, power or endurance. A week off and a light week are different interventions, so the trial argues against skipping training mid-block and says little about the week this app prescribes.",
            },
            {
              kind: "para",
              text: "Which is why the app schedules a deload and never diagnoses one. Nothing watches your training and inserts a light week — that call is yours, made when you plan the block or when you get to it.",
            },
          ],
        },
      ],
      related: ["ug/deloads#the-week-itself", "ug/deloads#choosing-to-have-one"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-week-itself",
      title: "What changes in a deload week",
      summary:
        "Same exercises, well short of failure, about half the sets, and a weight chosen the same way as any other.",
      keywords: [
        "deload week",
        "how light",
        "how many sets",
        "deload weight",
        "deload rir",
        "what do i do in a deload",
      ],
      blocks: [
        {
          kind: "para",
          text: "The deload is the block's final week when you have asked for one, with the same days and the same exercises. Three things change.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Effort" },
              " — the target is ",
              { num: "6" },
              " reps in reserve, set by the program rather than by your ramp.",
            ],
            [
              { strong: "Sets" },
              " — about half what the block's heaviest week carried, with a floor of ",
              { num: "2" },
              " working sets per exercise.",
            ],
            [
              { strong: "Weight" },
              " — chosen the same way as any other week: the load that puts you in your usual rep range with those six reps left over. In practice that lands well below your working weight.",
            ],
          ],
        },
        { kind: "heading", text: "Where you see it" },
        {
          kind: "para",
          text: [
            "The block's header reads ",
            { ui: "DELOAD W6 — 6 RIR" },
            " and its meta line carries ",
            { ui: "DELOAD" },
            "; the day screen's header reads ",
            { ui: "DELOAD WEEK" },
            " where a working week names its target.",
          ],
        },
        {
          kind: "para",
          text: [
            "Log it like any week and ",
            {
              to: "ug/effort-rir#report-what-you-did",
              text: "report the effort you actually used",
            },
            ". A deload set you took closer to failure than asked is worth saying so.",
          ],
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The target comes from ",
                { code: "deload.target_rir" },
                " and the set count from ",
                { code: "deload.set_pct" },
                " against the block's peak week, floored at ",
                { code: "min_sets" },
                ". The load is priced off the strength anchor at the deload target; a flat percentage of peak (",
                { code: "deload.load_pct" },
                ") applies only when there is no usable anchor to price from.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/effort-rir#the-weeks-ramp",
        "ug/deloads#how-it-reads-afterwards",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-it-reads-afterwards",
      title: "How a deload week reads in your numbers",
      summary:
        "Set aside from strength reads and from attendance, kept in your volume.",
      keywords: [
        "deload stats",
        "does a deload hurt my numbers",
        "strength went down",
        "adherence",
        "deload tag",
        "attendance",
      ],
      estimate: true,
      blocks: [
        {
          kind: "para",
          text: "A light week produces light numbers, and the app treats them as what they are: a week that was asked to be easy.",
        },
        {
          kind: "table",
          columns: ["Number", "A deload session"],
          rows: [
            ["the block's strength trend, per exercise and per muscle", "left out"],
            ["your attendance figure", "left out — deload days were never sessions you owed"],
            ["working sets, reps and total weight lifted", "counted in full"],
            ["the muscle-by-week set grid, and the block's averages", "shown, and left out of the averages"],
          ],
        },
        {
          kind: "para",
          text: [
            "In your exercise history a deload session is tagged ",
            { ui: "DELOAD" },
            " beside the date, so a lighter row explains itself.",
          ],
        },
        {
          kind: "para",
          text: [
            "The next block opens from what your recent sets say you can do, so a deload resets nothing — it is ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "the same machinery as every other week",
            },
            ", reading a recovered body.",
          ],
        },
      ],
      related: [
        "ug/volume#where-your-sets-show-up",
        "ug/deloads#choosing-to-have-one",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "choosing-to-have-one",
      title: "Adding one, and dropping one",
      summary:
        "A checkbox while the block is planned, and two ways out of it once the block is running.",
      keywords: [
        "skip deload",
        "turn off deload",
        "final week is a deload",
        "block length",
        "no deload",
        "end mesocycle",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "Final week is a deload" },
            " is the control, set when you plan the block. Tick it and your last week becomes the deload; leave it clear and every week is a working week. A ",
            { num: "6" },
            "-week block with it ticked gives you five working weeks and a deload.",
          ],
        },
        {
          kind: "para",
          text: [
            "Both the checkbox and the block length stay editable from the mesocycle's details sheet until the block starts, alongside ",
            { to: "ug/effort-rir#the-weeks-ramp", text: "the effort ramp" },
            ". After that the shape holds.",
          ],
        },
        { kind: "heading", text: "Dropping it mid-block" },
        {
          kind: "para",
          text: [
            "Reaching the deload week and deciding you do not need it takes one step: the day view's ",
            { ui: "…" },
            " menu → ",
            { ui: "End mesocycle" },
            ", which skips the remaining days and marks the block complete. Everything you logged is kept, and your attendance figure is untouched because deload days never counted toward it.",
          ],
        },
        {
          kind: "para",
          text: [
            "To keep part of it, use ",
            { ui: "Skip remaining sets" },
            " on the exercises you want to leave out and train the rest.",
          ],
        },
        {
          kind: "para",
          text: [
            "For easing off inside a working week rather than at the end of a block, the tool is a ",
            {
              to: "ug/exercise-level-rir#backing-an-exercise-off",
              text: "per-exercise effort target",
            },
            ", which can go as light as a deload on the exercises that need it.",
          ],
        },
      ],
      related: [
        "ug/exercise-level-rir#backing-an-exercise-off",
        "ug/training-a-session#finishing-the-session",
      ],
    },
  ],
};
