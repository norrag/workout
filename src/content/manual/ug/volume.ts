// User Guide — chapter 12, "Volume" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 12 — `engine/volume.ts`, doc 10 §2, the active v25
// row, and the shared stats views):
//   - one counting definition, `fractionalSetCount`: a primary link credits
//     `volume.direct` (1.0) and a secondary `volume.indirect` (0.5). Both keys
//     are ABSENT from the v25 row, so the code defaults apply — which is why
//     this chapter states the rule in words and cites no path for it
//   - the band is `volume.landmarks[muscle]` = `[MEV, MAV, MRV]`, whole-set
//     rounded after `volume.experience_scale` (0.7 / 1.0 / 1.1). Ten muscles
//     are parameterized; a muscle with no landmark simply has no band
//   - `classifyVolume` has four zones, and the module's own header calls the
//     numbers heuristic and advisory — doc 10 §9. The honesty callout is that
//     sentence, not a softening of it
//   - the band is FLAGGED on the planner board only. The meso stats matrix
//     reports counts without judging them; `buildBalance` averages over
//     non-deload weeks and its note states a push:pull ratio and the lowest
//     group, which doc 10 §9 makes advisory with no posture or injury claim
//   - `TOTAL VOLUME · LB` is a different quantity — `sum(weight × reps)` in the
//     views, not sets. `VOLUME PR` is `max(weight × reps)` for one set and
//     `BEST SESSION VOL` the best session sum
//   - claims are registered in `docs/22a-manual-claims.md`
//
// SEAMS: ch. 11 owns how a set count actually moves week to week (this chapter
// links out twice rather than restating ±1); ch. 4 owns the planner preview as
// a control; ch. 13 owns reading the stats screens; ch. 10 owns the weight.
//
// FINDING: `22c` §B2.4 lists `TOP SET BY WEEK — KEY LIFTS` on the meso stats
// tabs. N10 dropped that grid (`MesoStatsViews.tsx:202`, `stats.ts:505`).
// Corrected in 22c in place; it lands on ch. 13, not here.

import type { ManualChapter } from "../types";

export const UG_VOLUME: ManualChapter = {
  manual: "ug",
  slug: "volume",
  number: 12,
  title: "Volume",
  summary:
    "How the app counts your training — hard sets per muscle per week, why some count as halves, and the range each muscle is judged against.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-volume-means-here",
      title: "What volume means here",
      summary:
        "Hard sets per muscle per week — one unit, used by the plan and the stats alike.",
      keywords: [
        "volume",
        "weekly sets",
        "how much training",
        "sets per muscle",
        "hard sets",
        "what counts",
      ],
      blocks: [
        {
          kind: "para",
          text: "Volume in this app is a count of working sets, per muscle, per week. Not hours, not tonnage, and not exercises — the number of hard sets a muscle received in seven days.",
        },
        {
          kind: "para",
          text: "That unit is the one the evidence for muscle growth is clearest on, and it is the one thing a plan can be checked against before it is run and measured against after.",
        },
        { kind: "heading", text: "One definition, everywhere" },
        {
          kind: "para",
          text: [
            "Planning, stats, and weekly adjustments all use the same set count. If a plan shows ",
            { num: "14" },
            " sets for back, completing it as written records ",
            { num: "14" },
            " when you have run it as written.",
          ],
        },
        {
          kind: "para",
          text: "Warm-ups are left out of it, and so is a set taken so far from failure that it was not really a stimulus. What counts is the work that asked something of the muscle.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "A logged set credits volume when it was not a warm-up and was taken reasonably close to failure — ",
                { num: "4" },
                " or fewer reps in reserve. A set with no reported effort counts too: the ask it was given stands unless you say otherwise, which is the same benefit of the doubt every other ",
                {
                  to: "ug/effort-rir#report-what-you-did",
                  text: "unreported set",
                },
                " gets.",
              ],
            },
            {
              kind: "para",
              text: "Planned counts are different by nature — a set that has not happened yet has no effort to judge, so a plan's preview counts every set it lays out.",
            },
          ],
        },
      ],
      related: ["ug/volume#why-a-set-can-count-as-half", "ug/volume#the-band"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "why-a-set-can-count-as-half",
      title: "Why a set can count as a half",
      summary:
        "An exercise credits the muscle it mainly trains in full and the ones it also works at half.",
      keywords: [
        "half set",
        "fractional",
        "secondary muscle",
        "primary muscle",
        "why 0.5",
        "leg day looks short",
        "decimal sets",
      ],
      blocks: [
        {
          kind: "para",
          text: "A press trains the chest directly and also trains the triceps and shoulders. The app gives one full set to the primary muscle and half a set to each supporting muscle.",
        },
        { kind: "term", term: "fractional_sets" },
        { kind: "heading", text: "What it looks like on screen" },
        {
          kind: "para",
          text: [
            "Four sets of a press and three sets of dips give the chest ",
            { num: "7" },
            " and triceps ",
            { num: "3.5" },
            ". The triceps receive half credit because they assist both movements.",
          ],
        },
        {
          kind: "para",
          text: [
            "This is why a hard leg day can produce different totals for each muscle. Squats, leg press, and lunges may give your quads ",
            { num: "9" },
            " sets while your glutes and hamstrings receive fractional credit. The app counts each muscle separately across the full week.",
          ],
        },
        {
          kind: "para",
          text: [
            "Which muscles an exercise credits, and at which weight, comes from its ",
            {
              to: "ug/exercises-and-templates#your-own-exercises",
              text: "primary and secondary muscles",
            },
            ". On a custom exercise that is your call to make.",
          ],
        },
      ],
      related: [
        "ug/exercises-and-templates#your-own-exercises",
        "ug/volume#the-band",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-band",
      title: "The range each muscle is judged against",
      summary:
        "A floor, a productive zone and a ceiling per muscle — scaled to your training experience.",
      keywords: [
        "mev",
        "mav",
        "mrv",
        "too many sets",
        "not enough sets",
        "landmarks",
        "band",
        "how many sets should i do",
      ],
      blocks: [
        {
          kind: "para",
          text: "Each muscle has a weekly volume range: a minimum, a productive zone, and an upper limit that may be difficult to recover from.",
        },
        { kind: "term", term: "volume_landmarks" },
        {
          kind: "para",
          text: [
            "Between them sits a third mark, ",
            { strong: "MAV — maximum adaptive volume" },
            " — the top of the productive zone. Above it, additional sets still count, but fatigue increases faster than the likely benefit.",
          ],
        },
        { kind: "heading", text: "Why yours differs from someone else's" },
        {
          kind: "para",
          text: "Each muscle has its own volume range because muscles tolerate different amounts of work. The app then scales that range by training experience. A beginner therefore receives a lower range than an advanced lifter for the same muscle.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Treat the band as a sanity check",
          text: "These numbers carry large individual variation, and they are heuristics rather than measurements of you. They are worth using to catch a muscle getting almost nothing or far too much, and not worth chasing a set at a time.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The stored triple is ",
                { code: "volume.landmarks" },
                " per muscle — for example chest ",
                { num: "8 / 20 / 22" },
                " and hamstrings ",
                { num: "6 / 16 / 20" },
                " — multiplied by ",
                { code: "volume.experience_scale" },
                ", currently ",
                { num: "0.7" },
                " for beginner, ",
                { num: "1.0" },
                " for intermediate and ",
                { num: "1.1" },
                " for advanced, then rounded to whole sets.",
              ],
            },
            {
              kind: "para",
              text: "Ten muscle groups carry a band. A muscle without one is counted and shown like any other; there is simply no range to judge it against.",
            },
          ],
        },
      ],
      related: ["ug/volume#where-your-sets-show-up", "ug/how-it-felt#workload"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "where-your-sets-show-up",
      title: "Where your sets show up",
      summary:
        "The planner checks the plan against the band; the block's stats report what you actually did.",
      keywords: [
        "weekly sets per muscle",
        "sets per week",
        "balance",
        "push pull legs",
        "balance check",
        "stats",
        "planned sets",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Two surfaces, doing different jobs. The planner board's ",
            {
              to: "ug/planning-a-mesocycle#the-volume-check",
              text: "volume check",
            },
            " judges a plan against the band before you run it — it is the one screen that calls a count high or low.",
          ],
        },
        {
          kind: "para",
          text: [
            "A running block's ",
            { ui: "BALANCE" },
            " tab reports instead. ",
            { ui: "SETS / WEEK" },
            " is a muscle-by-week grid: logged counts for the weeks behind you, the current week marked, and the weeks ahead shown as ",
            { ui: "AUTOREGULATED PLAN" },
            " — planned, and expected to move.",
          ],
        },
        { kind: "heading", text: "The balance read" },
        {
          kind: "para",
          text: [
            "Under it, ",
            { ui: "AVG SETS / WEEK — PLANNED" },
            " ranks your muscles as bars, and three cards total the week into ",
            { ui: "PUSH" },
            ", ",
            { ui: "PULL" },
            " and ",
            { ui: "LEGS" },
            ". The averages leave the deload week out, so one lighter week does not flatten the block's shape.",
          ],
        },
        {
          kind: "para",
          text: [
            { ui: "BALANCE CHECK" },
            " shows your push-to-pull ratio and the muscle with the fewest weekly sets. Use both when reviewing the balance of your next block.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A ratio is a ratio",
          text: "Push to pull is a description of how you have trained, not a diagnosis. It makes no claim about your posture, your shoulders or your risk of injury, and there is no single correct number for it.",
        },
      ],
      related: [
        "ug/planning-a-mesocycle#the-volume-check",
        "ug/volume#weight-lifted-is-a-different-number",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "weight-lifted-is-a-different-number",
      title: "Weight lifted is a different number",
      summary:
        "Total volume in pounds is a tally of work done — useful, and not what the band measures.",
      keywords: [
        "total volume lb",
        "tonnage",
        "volume pr",
        "best session vol",
        "pounds lifted",
        "why is my volume huge",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The app also keeps a second, unrelated tally: ",
            { ui: "TOTAL VOLUME · LB" },
            ", every working set's weight multiplied by its reps and added up. It is a measure of how much you moved, not of how much a muscle was trained.",
          ],
        },
        {
          kind: "table",
          columns: ["Number", "Is"],
          rows: [
            [
              [{ ui: "TOTAL VOLUME · LB" }],
              "everything lifted across a block or a macrocycle, summed",
            ],
            [
              [{ ui: "VOLUME PR" }],
              "the most weight × reps you have done in a single set of an exercise",
            ],
            [
              [{ ui: "BEST SESSION VOL" }],
              "the most you have moved in one session of that exercise",
            ],
          ],
        },
        { kind: "heading", text: "What it is good for" },
        {
          kind: "para",
          text: "Within one exercise, total weight moved can compare the size of different sessions. It does not compare exercises fairly because heavy exercises dominate the total.",
        },
        {
          kind: "para",
          text: [
            "Sets per muscle guide the plan and its volume range. Total weight moved describes how much load you handled. ",
            {
              to: "ug/volume#the-band",
              text: "the volume range uses sets, not pounds",
            },
            ".",
          ],
        },
      ],
      related: [
        "ug/volume#what-volume-means-here",
        "ug/how-it-felt#what-your-answers-do",
      ],
    },
  ],
};
