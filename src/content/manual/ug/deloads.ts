// User Guide — chapter 9, "Deloads" (doc 22 §5, §6.1).
//
// GROUND TRUTH (22b §7 ch. 9 — `engine/index.ts:251–325`, `rules/deload.ts`,
// `rules/rir.ts`, `queries/stats.ts::foldProgressScores`, migration
// `20260804000001`, `MesoHeader.tsx`, plus the doc 22 Phase 3d-r research pass
// `docs/reviews/2026-08-11-rir-ramps-and-training-styles.md` §2.4):
//   - the deload week's target RIR is `deload.target_rir` (6 on the live v25
//     row), appended by `rirRamp` OUTSIDE the ramp — the ramp never sets it
//   - with a usable strength anchor and `deload_anchor_rir` on, the load is
//     chosen the SAME way a working week's is: the weight that lands
//     window-centred reps at the higher deload RIR. `deload.load_pct` (0.55) is
//     the fallback for when there is no anchor to price from
//   - sets = round(peak sets × `deload.set_pct` 0.5), floored at `min_sets` and
//     clamped by `max_sets_per_exercise`
//   - deload sessions are dropped from the strength trend
//     (`foldProgressScores(deloadMicroIds)`) and from the meso's attendance
//     figures (`sessions_attended` / `sessions_due` filter `not is_deload`);
//     working sets, reps and volume totals keep them
//   - `includes_deload` and the block length are editable only while the block
//     is `planned` (`MesoHeader.tsx:568`)
//
// SPEC-VS-CODE GAP, written from the code (22b §7): doc 10 §3's graded
// MEV→MAV→MRV volume ramp and its two-week-at-MRV auto-deload trigger were
// deferred (T-A5) and are NOT implemented. There is no automatic deload to
// describe. What ships is the joint-pain gate plus the ±1 workload response
// (ch. 11) and a deload that is SCHEDULED. This chapter says so.
//
// DEFECT `D-08`, not fixed here (doc 22 §1.2 forbids behavior changes): the
// create-mesocycle sheet hardcodes `DELOAD AT 4 RIR` while the live target is
// 6. Per the Phase-3a precedent (`D-06`/`D-07`), this chapter states the truth
// positively and does not narrate the discrepancy.
//
// GUARDRAIL (doc 10 §9, binding, and enforced by `contracts.test.ts`): a deload
// is fatigue management. No growth or strength framing anywhere in the chapter.
//
// Claims: `C-deload-01` onward in 22a. Glossary: renders `deload`, which clears
// its PENDING_GLOSSARY_TERMS row.

import type { ManualChapter } from "../types";

export const UG_DELOADS: ManualChapter = {
  manual: "ug",
  slug: "deloads",
  number: 9,
  title: "Deloads",
  summary:
    "What a deload week is for, what changes in one, how it reads in your numbers afterwards, and how honest the evidence for it actually is.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-a-deload-is",
      title: "What a deload is for",
      summary:
        "A light week that clears accumulated fatigue so the next block starts from a real baseline.",
      keywords: [
        "deload",
        "light week",
        "recovery week",
        "fatigue",
        "what is a deload",
        "rest week",
      ],
      blocks: [
        { kind: "term", term: "deload" },
        { kind: "heading", text: "The fatigue it clears" },
        {
          kind: "para",
          text: "Fatigue here means one specific thing: a performance debt. Weeks of hard training leave you producing less force than you are capable of, so what you can lift drifts below what you have actually built. It is not soreness, and it is not damage — it is the gap between your capacity and today's output.",
        },
        {
          kind: "para",
          text: "That gap accumulates quietly, which is what makes it worth planning around. A block's last weeks are its hardest, and they are also the weeks where the debt is deepest, so what you lift stops being a clean read on where you are.",
        },
        {
          kind: "para",
          text: "A light week lets the debt clear while you keep training. You come out of it lifting closer to what you can, which is a better place to start the next block from than the bottom of the previous one.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "It is a valve, not a stimulus",
          text: "A deload is fatigue management. It protects what you built rather than adding to it, and the app never treats a light week as a week that grew anything.",
        },
      ],
      related: ["ug/deloads#the-week-itself", "ug/deloads#when-you-need-one"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-week-itself",
      title: "What changes in a deload week",
      summary:
        "Same exercises, well short of failure, roughly half the sets, and a lighter weight chosen the same way as any other.",
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
          text: [
            "The deload is the block's final week when you have asked for one, and it keeps the same days and the same exercises. Three things change. The effort target is ",
            { num: "6" },
            " reps in reserve (",
            { code: "deload.target_rir" },
            ") rather than anything the ramp would have reached.",
          ],
        },
        {
          kind: "para",
          text: [
            "The sets are roughly halved against the block's heaviest week (",
            { code: "deload.set_pct" },
            "), with a floor of ",
            { num: "2" },
            " working sets so nothing disappears entirely.",
          ],
        },
        {
          kind: "para",
          text: "And the weight comes down to suit — chosen exactly the way a working week's weight is chosen, as the load that puts you in your usual rep range while leaving those six reps in the tank. The result is a real training week that asks much less of you.",
        },
        { kind: "heading", text: "Where you see it" },
        {
          kind: "list",
          items: [
            [
              "The mesocycle's header, as ",
              { ui: "DELOAD W6 — 6 RIR" },
              ", and in the block's meta line as ",
              { ui: "DELOAD" },
              ".",
            ],
            [
              "The day screen's header, which reads ",
              { ui: "DELOAD WEEK" },
              " where a working week names its target.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Log it the way you log any week, and ",
            {
              to: "ug/effort-rir#report-what-you-did",
              text: "report the effort you actually used",
            },
            ". A deload set you took closer to failure than asked is worth saying so.",
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
          text: "A light week produces light numbers, and the app treats them as what they are: a week that was asked to be easy, rather than a week you underperformed.",
        },
        {
          kind: "table",
          columns: ["Number", "A deload session"],
          rows: [
            ["the block's strength trend, per exercise and per muscle", "left out"],
            ["your attendance figure for the block", "left out — it was never one of the sessions you owed"],
            ["working sets, reps and total weight lifted", "counted in full"],
            ["the muscle-by-week set grid, and the block's averages", "shown, and left out of the averages"],
          ],
        },
        {
          kind: "para",
          text: [
            "In your exercise history a deload session is tagged ",
            { ui: "DELOAD" },
            " beside the date, so a lighter row in the list explains itself at a glance.",
          ],
        },
        { kind: "heading", text: "And the week after" },
        {
          kind: "para",
          text: [
            "The next block opens from what your recent sets say you can do, so a deload does not reset you to the start of anything. Where the opener comes from is ",
            {
              to: "ug/effort-rir#why-honesty-matters",
              text: "the same machinery as every other week",
            },
            ", reading a body that has had its debt cleared.",
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
      slug: "when-you-need-one",
      title: "When a deload is actually needed",
      summary:
        "The honest answer is thinner than the fitness-culture one: the app schedules them, and adjusts your sets week to week from your own feedback.",
      keywords: [
        "how often deload",
        "do i need a deload",
        "every 4 weeks",
        "evidence",
        "research",
        "automatic deload",
        "when to deload",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { strong: "The app deloads on a schedule." },
            " A block is 3 to 8 weeks and the deload is its last week when you asked for one. Nothing watches for a moment to trigger one — that is a decision you make when you plan the block.",
          ],
        },
        {
          kind: "para",
          text: [
            "Between deloads, the app adjusts the dose instead. Joint pain and ",
            {
              to: "ug/how-it-felt#workload",
              text: "how hard a session felt",
            },
            " each move an exercise's set count by one, week to week, which is a steadier way to manage fatigue than waiting for a valve to open.",
          ],
        },
        { kind: "heading", text: "What the evidence supports" },
        {
          kind: "para",
          text: "Surveyed competitive lifters all deload, typically for about a week, roughly every five to six weeks, mostly planned in advance and triggered by stalled performance, soreness or joint stress. That is a practice consensus, and the app's default sits inside it.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "The one trial tested something else",
          text: "The only controlled trial of a planned mid-block deload had lifters take a week off entirely, and that group finished with slightly worse lower-body strength and no advantage anywhere else. A light week is a different intervention from a week off, so the trial argues against skipping training mid-block and says little about the week this app prescribes. Scheduling one every four to six weeks is a sensible convention rather than a proven rule.",
        },
        {
          kind: "para",
          text: "Which is a reason to treat the schedule as yours to set. If a block leaves you fresh, shorten the next one's deload out of the plan; if the last two weeks were a grind, keep it.",
        },
      ],
      related: [
        "ug/how-it-felt#workload",
        "ug/deloads#choosing-to-have-one",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "choosing-to-have-one",
      title: "Choosing to have one, or not",
      summary:
        "One checkbox while a block is still planned, and the block's length around it.",
      keywords: [
        "skip deload",
        "turn off deload",
        "final week is a deload",
        "block length",
        "no deload",
        "change deload",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A deload is a property of the block, set by ",
            { ui: "Final week is a deload" },
            " when you plan it. Tick it and the last of your weeks becomes the deload; leave it clear and every week is a working week.",
          ],
        },
        {
          kind: "para",
          text: [
            "The block's length is the other half of the decision. A ",
            { num: "6" },
            "-week block with the box ticked gives you five working weeks and a deload; the same six weeks without it gives you six working weeks and no light week at the end.",
          ],
        },
        { kind: "heading", text: "While it is still planned" },
        {
          kind: "para",
          text: [
            "Both are editable from the mesocycle's details sheet up until the block starts, alongside ",
            {
              to: "ug/effort-rir#the-weeks-ramp",
              text: "the effort ramp",
            },
            ". Once a block is running its shape holds, and the sheet edits the name from then on.",
          ],
        },
        {
          kind: "para",
          text: [
            "So a deload you decide you want mid-block is really a decision about the ",
            { strong: "next" },
            " one. Inside a running block, the tool for easing off is a ",
            {
              to: "ug/exercise-level-rir#backing-an-exercise-off",
              text: "per-exercise effort target",
            },
            ", which can go as light as a deload on the exercises that need it while the rest of the week carries on.",
          ],
        },
      ],
      related: [
        "ug/exercise-level-rir#backing-an-exercise-off",
        "ug/planning-a-mesocycle#naming-and-starting",
      ],
    },
  ],
};
