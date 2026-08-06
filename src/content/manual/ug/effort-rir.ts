// User Guide — chapter 6, "Effort: RIR and the ramp" (doc 22 §5).
//
// The doc 22 Phase 1 exemplar. Chosen because it exercises the whole model at
// once: glossary terms, a table, a callout, steps, a three-layer mechanism
// section, cross-links, and a six-way section split — and because every term it
// needs (`rir`, `rir_ramp`, `deload`, `e1rm`) already exists in `glossary.ts`,
// so it owes the §8.1 contract nothing.
//
// GROUND TRUTH (22b §7 ch. 6 / §3):
//   - the RIR premise is doc 21 §2, NOT doc 11 — a logged set carries the
//     athlete's own report, and the prescribed target is the fallback:
//     `assumedRir = rir_reported ?? target_rir` (`engine/predict.ts`)
//   - every number below is from the active v25 row via 22b §4.2, and carries
//     its `engine_params` path per doc 22 §8.2
//   - the measuring band (`e1rm.max_measuring_rir`) is NOT live (22b §4.1 ①)
//     and is mentioned nowhere in this chapter
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_EFFORT_RIR: ManualChapter = {
  manual: "ug",
  slug: "effort-rir",
  number: 6,
  title: "Effort: RIR and the ramp",
  summary:
    "How the app measures effort, how a block ramps it week by week, and why your own report of a set is the number everything else is built on.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-rir-means",
      title: "What RIR means",
      summary: "One number per set: how many more reps you could have done.",
      keywords: ["reps in reserve", "effort", "how hard", "failure", "rir"],
      blocks: [
        {
          kind: "para",
          text: "Effort in this app is measured one way, on every set, on every exercise: reps in reserve.",
        },
        { kind: "term", term: "rir" },
        { kind: "heading", text: "Where you see it" },
        {
          kind: "list",
          items: [
            [
              "The day view header, above your sets — ",
              { ui: "TARGET 2 RIR" },
              " is the week's ask. On a deload week it reads ",
              { ui: "DELOAD WEEK" },
              " instead.",
            ],
            [
              "The ",
              { ui: "RIR" },
              " column on each set row, where you report the set you just did.",
            ],
            [
              "The exercise ",
              { ui: "…" },
              " menu, under ",
              { ui: "Effort target" },
              " — where one exercise can be given a target of its own.",
            ],
          ],
        },
        { kind: "heading", text: "Why effort rather than percentages" },
        {
          kind: "para",
          text: "A percentage of your one-rep max needs a one-rep max, which means testing it, re-testing it, and having a separate answer for every exercise you would never test. Reps in reserve is something you can judge from the set you have just finished — on a leg press, on a cable fly, on anything — which is why it is the app's unit of effort.",
        },
      ],
      related: ["ug/effort-rir#the-weeks-ramp", "ug/effort-rir#report-what-you-did"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-weeks-ramp",
      title: "The week's target, and the ramp",
      summary:
        "Every week carries one target RIR, stepping closer to failure as the block goes on.",
      keywords: [
        "ramp",
        "start rir",
        "end rir",
        "3 to 0",
        "weekly target",
        "deload week",
        "schedule",
      ],
      blocks: [
        {
          kind: "para",
          text: "Each week of a block carries one target RIR, and it steps down as the block goes on. That pattern is the ramp.",
        },
        { kind: "term", term: "rir_ramp" },
        { kind: "heading", text: "Setting it" },
        {
          kind: "para",
          text: [
            "You choose the ramp while a block is still planned. The mesocycle's details sheet carries ",
            { ui: "START RIR" },
            " and ",
            { ui: "END RIR" },
            ", each a value from ",
            { num: "0" },
            " to ",
            { num: "5" },
            ". Tick ",
            { ui: "Set each week independently" },
            " to write a value per week instead, in any order you like.",
          ],
        },
        {
          kind: "para",
          text: [
            "Once a block starts it keeps the shape you gave it, and that sheet edits the name from then on. Adjusting effort inside a running block is what ",
            { to: "ug/effort-rir#per-exercise", text: "per-exercise targets" },
            " are for.",
          ],
        },
        { kind: "heading", text: "The deload week" },
        {
          kind: "para",
          text: [
            "When a block's final week is a deload, its target comes from the program rather than from the ramp — currently ",
            { num: "6" },
            " RIR (",
            { code: "deload.target_rir" },
            "), which is deliberately well short of failure. The week editor says as much: ",
            { ui: "W6 DELOAD — RIR SET BY THE ENGINE" },
            ".",
          ],
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "With ",
                { ui: "START RIR" },
                " and ",
                { ui: "END RIR" },
                " set, the working weeks are filled in evenly between the two and rounded to whole numbers, so the last working week sits exactly on the end value. A ",
                { num: "5" },
                "-week block with a deload has ",
                { num: "4" },
                " working weeks: ",
                { num: "3 · 2 · 1 · 0" },
                " for a ",
                { num: "3 → 0" },
                " ramp.",
              ],
            },
            {
              kind: "para",
              text: "A per-week schedule replaces that arithmetic outright — the values are used as written, in whatever order you set them. Either way the deload week is appended afterwards at the program's own deload target, so it is never part of the interpolation.",
            },
          ],
        },
      ],
      related: [
        "ug/effort-rir#what-rir-means",
        "ug/effort-rir#per-exercise",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "report-what-you-did",
      title: "Report what you actually did",
      summary:
        "The target is the ask. The RIR you log is your own estimate of the set you just finished.",
      keywords: [
        "reported rir",
        "target rir",
        "honest",
        "no report",
        "logging a set",
        "empty",
      ],
      blocks: [
        {
          kind: "para",
          text: "The week's target is what to aim for. The RIR you log is what happened. They are allowed to differ, and the app is built on the assumption that you will say so when they do.",
        },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "RIR" },
            " box on a set row starts on the week's ask, so leaving it alone reports exactly that. Change it when the set went differently — the last rep ground to a halt at ",
            { num: "0" },
            ", or the bar moved so well you stopped with ",
            { num: "3" },
            " still in hand.",
          ],
        },
        { kind: "heading", text: "In practice" },
        {
          kind: "table",
          columns: ["How the set went", "What to report"],
          rows: [
            [
              [{ num: "8" }, " reps with about ", { num: "2" }, " left, as asked"],
              "leave the box alone",
            ],
            ["harder than asked — the last rep barely moved", [{ num: "0" }]],
            [
              "easier than asked — you stopped well clear",
              [{ num: "4" }, ", or whatever it was"],
            ],
            ["you genuinely cannot tell", "clear the box"],
          ],
        },
        { kind: "heading", text: "When you are not sure" },
        {
          kind: "para",
          text: [
            "Clear the box and move on. An empty box is read as the week's ask — the same thing an untouched box reports — and that is a better answer than a number you do not believe. The box takes ",
            { num: "0" },
            " through ",
            { num: "10" },
            ", which is the range a person can honestly judge.",
          ],
        },
        {
          kind: "para",
          text: "The target was chosen a week in advance from numbers that were true then. You are the only one in the room who knows what the set was.",
        },
      ],
      related: [
        "ug/effort-rir#why-honesty-matters",
        "ug/effort-rir#missing-the-ask",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "why-honesty-matters",
      title: "Why the reported number matters",
      summary:
        "Every strength estimate in the app is priced off how far from failure your sets were.",
      estimate: true,
      keywords: [
        "e1rm",
        "estimated 1rm",
        "effective reps",
        "strength anchor",
        "why accuracy matters",
      ],
      blocks: [
        {
          kind: "para",
          text: "Your reported RIR is not bookkeeping. It is one of the two halves of every strength estimate the app makes.",
        },
        { kind: "term", term: "e1rm" },
        { kind: "heading", text: "The mechanic" },
        {
          kind: "para",
          text: [
            "A set's reps and its reps in reserve are added together into ",
            { strong: "effective reps" },
            " — how many reps the set was really worth. ",
            { num: "135" },
            " lb for ",
            { num: "8" },
            " reps with ",
            { num: "2" },
            " left counts as ",
            { num: "10" },
            " effective reps. The same ",
            { num: "135 × 8" },
            " taken to failure counts as ",
            { num: "8" },
            ".",
          ],
        },
        {
          kind: "para",
          text: "So the set with reps to spare implies the greater strength, because reps you left behind are evidence you had more to give. Reporting a set as harder than it was lowers the strength the app credits you with; reporting it as easier raises it. Both drift compounds over a block.",
        },
        {
          kind: "para",
          text: [
            "That estimate is what your strength anchor is built from, and the anchor is what next week's weight is chosen off. An accurate report is what keeps the next ",
            { to: "ug/effort-rir#missing-the-ask", text: "prescription" },
            " accurate.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "An estimate, not a tested max",
          text: "An estimated one-rep max is a trend read worked out from sets you actually did. It is sharpest on heavy sets taken near failure, and roughest on very high-rep sets or ones stopped a long way short of it.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "Effective reps = reps + reported RIR × ",
                { code: "e1rm.rir_offset" },
                " (currently ",
                { num: "1" },
                ").",
              ],
            },
            {
              kind: "para",
              text: [
                "The estimate averages the Epley and Brzycki formulas up to ",
                { code: "e1rm.brzycki_max_eff_reps" },
                " (currently ",
                { num: "10" },
                ") effective reps, and uses Epley alone above that — the point past which the two stop agreeing.",
              ],
            },
            {
              kind: "para",
              text: "Where a set carries no reported RIR, the app resolves it to the target RIR that set was prescribed at. That fallback is the reason an untouched box and an empty box mean the same thing.",
            },
          ],
        },
      ],
      related: [
        "ug/effort-rir#report-what-you-did",
        "ug/effort-rir#missing-the-ask",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "missing-the-ask",
      title: "When a set misses the ask",
      summary:
        "What the app does with a set that landed above or below the week's target.",
      estimate: true,
      keywords: [
        "missed the target",
        "above prescription",
        "below prescription",
        "marker",
        "weight went down",
        "why is it lighter",
      ],
      blocks: [
        {
          kind: "para",
          text: "A set that missed the ask is ordinary data. It is recorded as what it was, and the week carries on.",
        },
        {
          kind: "para",
          text: "A logged set carries a small marker beside its set number, for where it landed against its prescription:",
        },
        {
          kind: "legend",
          items: [
            {
              mark: "set-marker:over",
              text: "More than the ask — extra reps, or the same reps taken closer to failure.",
            },
            { mark: "set-marker:met", text: "The set the program asked for." },
            {
              mark: "set-marker:under",
              text: "Short of the ask — fewer reps, or the same reps with more left in reserve.",
            },
          ],
        },
        {
          kind: "para",
          text: "The comparison runs through the estimated one-rep max of each, so it weighs both halves at once rather than counting reps alone.",
        },
        { kind: "heading", text: "What happens next" },
        {
          kind: "para",
          text: [
            "Next week's weight is re-derived from your recent sets rather than stepped up on a fixed schedule, so what you reported flows straight into the next ask. This is also the answer to the most common surprise in the app: a week run ",
            { ui: "harder" },
            " than asked produces lower strength estimates from those sets, so the following week can come back a touch lighter.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "A lighter prescription is the program reading the sets you gave it, not a penalty. The arithmetic is in the previous section: fewer reps in reserve at the same weight and reps means a lower estimate.",
        },
        { kind: "heading", text: "Why this way" },
        {
          kind: "para",
          text: "A fixed weekly increase asks the same thing of a week you slept four hours as of a week you were fresh, and keeps asking it. Re-deriving the weight from what you actually lifted is what lets the ask track the athlete.",
        },
      ],
      related: [
        "ug/effort-rir#why-honesty-matters",
        "ug/effort-rir#report-what-you-did",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "per-exercise",
      title: "One exercise, its own target",
      summary:
        "A single exercise can carry a target RIR of its own, in either direction.",
      keywords: [
        "effort target",
        "per exercise rir",
        "back off",
        "push harder",
        "rehab",
        "applies to",
        "scope",
      ],
      blocks: [
        {
          kind: "para",
          text: "The week's target covers every exercise in the week. When one of them wants different treatment — a joint you are protecting, or a small isolation lift the week's ramp is not really limiting — it can carry a target of its own.",
        },
        { kind: "heading", text: "Where it lives" },
        {
          kind: "steps",
          steps: [
            {
              label: "Open",
              text: [
                "In the day view, the exercise's ",
                { ui: "…" },
                " menu, then ",
                { ui: "Effort target" },
                ".",
              ],
            },
            {
              label: "Set",
              text: [
                "Choose a target RIR, or type a custom value. ",
                { ui: "Use the week's ramp" },
                " hands the exercise back to the ramp.",
              ],
            },
            {
              label: "Scope",
              text: [
                { ui: "Applies to" },
                " — this week alone, every working week, or every working week and the deload.",
              ],
            },
            {
              label: "Reason",
              text: "A short note, which then travels with the assignment wherever it is shown.",
            },
          ],
        },
        { kind: "heading", text: "What it changes" },
        {
          kind: "para",
          text: "While an exercise-level target is set, it is the target for that exercise, and the working weight is re-priced to suit: a higher target buys a lighter weight, a lower one a heavier weight. Both directions travel the same path, so backing an exercise off and pushing it harder are one lever rather than two features.",
        },
        {
          kind: "para",
          text: [
            "The planner board keeps a block-wide value in its own ",
            { ui: "RIR" },
            " column. An exercise already carrying week-by-week targets reads ",
            { ui: "RIR BY WEEK" },
            " there and holds on to them, because the board shows one week's shape rather than the whole block.",
          ],
        },
      ],
      related: [
        "ug/effort-rir#the-weeks-ramp",
        "ug/effort-rir#why-honesty-matters",
      ],
    },
  ],
};
