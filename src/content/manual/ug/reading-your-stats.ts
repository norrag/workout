// User Guide — chapter 13, "Reading your stats" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 13 — `engine/strength.ts`, `queries/stats.ts`,
// `queries/exercises.ts`, the shared views in `supabase/migrations/`, and the
// active v25 row re-read 2026-08-11):
//   - EST. STRENGTH per lift is `strengthTrend`: best session e1RM over the
//     most-recent window vs best over the earliest, symmetric non-overlapping
//     windows, `k = max(1, min(window_sessions, floor(n/2)))`. A lift needs
//     `min_sessions` (3) scored sessions to appear at all, and a change inside
//     `tolerance_pct` (1.5) reads as holding. The `strength` block is ABSENT
//     from the v25 row, so `DEFAULT_STRENGTH` (3 / 3 / 1.5) is what runs —
//     the schema carries the block, so the paths are citable
//   - the muscle rollup is `rollupMuscleProgress` — each scored lift credits
//     every muscle it links to at the volume weights (1.0 primary / 0.5
//     secondary); the macro headline is `volumeWeightedStrengthTotal`, the
//     muscle numbers weighted by each muscle's fractional set volume (N16 — one
//     number behind the Overview tile and the Performance tab)
//   - three exclusions, three different mechanisms: deload sessions (T-A2),
//     `backed_off` sessions (doc 21 §6.2, the view predicate
//     `we.target_rir > mc.target_rir`), and `dropE1rmOutliers` (N14, 3× off the
//     window median). `strengthComparabilityNote` discloses the second
//   - PRs are `buildPrs`: heavier top weight than anything before the block =
//     ALL-TIME; a better e1RM at or below the old top weight = REP PR; a lift
//     with no prior history cannot PR
//   - `v_exercise_overview` drops backed-off sets from `best_e1rm` ONLY —
//     `weight_pr` / `volume_pr` / `best_session_volume` / `times_trained` /
//     `total_volume` keep them, because those are observations rather than
//     estimates (migration `20260804000001`, §3's own comment)
//   - the exercise page's bar row is `buildExerciseMacroBars`: peak e1RM per
//     meso across the current macro, the most recent one `current` (accent),
//     untrained blocks dashed
//
// NOT CLAIMED — `KEY LIFTS`. `key_lifts.n` / `selection` are on the live row
// and `22b` §4.2 files them under this chapter, but **N10 removed the only
// surface that rendered them** (`D-12`) and a repo-wide grep finds no consumer
// at all today (`D-16`). 22b §4.2 is corrected in this PR.
//
// SEAMS: ch. 6 owns the compliance marks; ch. 8 owns the back-off lever and why
// its sessions sit out; ch. 9 owns deloads; ch. 10 owns the anchor and how a
// weight is priced; ch. 12 owns fractional counting and the band; ch. 14 owns
// the macrocycle Overview's goal-side content. Claims: `C-stat-01` onward.

import type { ManualChapter } from "../types";

export const UG_READING_YOUR_STATS: ManualChapter = {
  manual: "ug",
  slug: "reading-your-stats",
  number: 13,
  title: "Reading your stats",
  summary:
    "Three screens answer three different questions — how one lift is going, how a block went, and how the whole arc is going — and one definition of progress sits behind all of them.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "where-to-look",
      title: "Where to look",
      summary:
        "Three surfaces, one question each: this lift, this block, this arc.",
      keywords: [
        "stats",
        "where are my stats",
        "progress",
        "charts",
        "performance tab",
        "balance tab",
        "history",
      ],
      blocks: [
        {
          kind: "para",
          text: "Your numbers live on three screens, and picking the right one is mostly a matter of how wide a question you are asking. Each screen is reached from the thing it describes: a lift's page from the lift, a block's tabs from the block, the arc's Overview from the macrocycle.",
        },
        {
          kind: "table",
          columns: ["Screen", "The question it answers", "What it shows"],
          rows: [
            [
              "An exercise's own page",
              "how is this one lift going",
              "lifetime bests, one bar per block, and every session you have logged",
            ],
            [
              [
                "A block's ",
                { ui: "BALANCE" },
                " and ",
                { ui: "PERFORMANCE" },
                " tabs",
              ],
              "how is this block going",
              "sets per muscle per week, the push / pull / legs split, this block's records, and each lift's trend",
            ],
            [
              [
                "A macrocycle's ",
                { ui: "OVERVIEW" },
                " tab",
              ],
              "how is the whole arc going",
              "the block timeline, four headline figures, and body composition where you have scans",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "The three agree with each other by construction. Sets are counted one way everywhere (",
            { to: "ug/volume#why-a-set-can-count-as-half", text: "fractionally, by muscle" },
            "), and strength is worked out one way everywhere, so a figure on the block tab and the same figure on the macrocycle Overview are the same calculation over a wider window.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#one-lift-at-a-time",
        "ug/reading-your-stats#the-strength-trend",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "one-lift-at-a-time",
      title: "One lift at a time",
      summary:
        "The exercise page: lifetime bests, a bar for each block of the current arc, and the full session history.",
      estimate: true,
      keywords: [
        "exercise page",
        "all time bests",
        "weight pr",
        "volume pr",
        "history",
        "past sessions",
        "how much have i lifted",
      ],
      blocks: [
        {
          kind: "para",
          text: "Tap an exercise name anywhere in the app — a set row, a planner slot, the library — and you land on its page. Two tabs: what you have ever done with it, and every session in order.",
        },
        { kind: "heading", text: "All-time bests" },
        {
          kind: "table",
          columns: ["Figure", "What it is"],
          rows: [
            [[{ ui: "WEIGHT PR · LB" }], "the heaviest working set you have logged, with the reps you got"],
            [[{ ui: "EST. 1RM" }], "the best single-set strength estimate the lift has produced"],
            [[{ ui: "VOLUME PR" }], "the biggest single set by weight times reps"],
            [[{ ui: "BEST SESSION VOL" }], "the biggest day's total for that lift"],
          ],
        },
        {
          kind: "para",
          text: [
            "Below them, one bar per block of the macrocycle you are in, each carrying that block's peak estimate. The block you are training now is drawn in orange; a block where you have not trained this lift is drawn dashed. It is the shortest read of ",
            { strong: "is this lift moving across the arc" },
            " the app has.",
          ],
        },
        { kind: "heading", text: "History" },
        {
          kind: "para",
          text: [
            "One row per session, newest first, each with its week and day. Tap a row to flip between what you lifted and what it was worth as an estimate. Rows carry a ",
            { ui: "DELOAD" },
            " or ",
            { ui: "BACKED OFF" },
            " tag where the session was one, session notes expand, and ",
            { ui: "LOAD OLDER" },
            " walks back through the rest.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
        "ug/exercises-and-templates#what-an-exercise-remembers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-strength-trend",
      title: "The strength trend",
      summary:
        "EST. STRENGTH compares your best recent sessions against your best early ones, per lift and rolled up per muscle.",
      estimate: true,
      keywords: [
        "est strength",
        "estimated strength",
        "percent change",
        "am i getting stronger",
        "trend",
        "muscle group strength",
      ],
      blocks: [
        { kind: "term", term: "est_strength" },
        {
          kind: "para",
          text: [
            "A lift joins the list once it has ",
            { num: "3" },
            " sessions the trend can use, which is the app's way of leaving out a movement you subbed in once. Under that it reads ",
            { ui: "Not enough data yet" },
            " rather than showing a figure built on two points.",
          ],
        },
        {
          kind: "para",
          text: [
            "Because both ends are the ",
            { strong: "best" },
            " of a few sessions rather than a single one, a light opening week costs you nothing on the read, and one heroic day does not become the bar every later session is measured against. Small movements in either direction are reported as holding rather than as a change.",
          ],
        },
        {
          kind: "para",
          text: "Each lift's change then credits the muscles it trains — in full to the muscle it works directly, half to the ones it helps. The single headline figure on a macrocycle averages those muscle numbers, weighting each by how much work that muscle actually got, so a muscle you trained twice cannot swing it as hard as one you trained all block.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Estimate against estimate",
          text: "Both ends of this comparison are worked out from sets, not tested. It is a good read on direction and a rough one on size — treat a few percent as noise and a sustained climb as real.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "Each end is the best of up to ",
                { code: "strength.window_sessions" },
                " sessions, the windows shrinking symmetrically so they never overlap on a short series; ",
                { code: "strength.min_sessions" },
                " is the floor to be scored at all and ",
                { code: "strength.tolerance_pct" },
                " is the dead band that reads as holding. The block is absent from the active row, so the engine's own defaults apply — ",
                { num: "3" },
                " · ",
                { num: "3" },
                " · ",
                { num: "1.5" },
                "%.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
        "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "records",
      title: "Records",
      summary:
        "Two kinds of PR — a heavier top set, and a better set at a weight you had already handled.",
      estimate: true,
      keywords: [
        "pr",
        "personal record",
        "all time",
        "rep pr",
        "prs this meso",
        "why is this not a pr",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A block's ",
            { ui: "PRS THIS MESO" },
            " list compares your best set of each lift in the block against everything you had logged before it started. Two things can earn a place.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "All-time",
              text: "You put more weight on the bar than you ever had for that lift.",
            },
            {
              label: "Rep PR",
              text: "At a weight you had already handled, you did more with it — more reps, or the same reps with more left in reserve — so the strength estimate behind it beats your old best.",
            },
          ],
        },
        {
          kind: "para",
          text: "A lift you are doing for the first time in this block has nothing to beat, so it sits the list out until it has a history behind it.",
        },
        {
          kind: "para",
          text: [
            "The exercise page's ",
            { ui: "ALL-TIME BESTS" },
            " answer the same question over your whole history rather than one block, which is why a lift can show a lifetime best from a year ago and no record this block.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
        "ug/effort-rir#why-honesty-matters",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-a-strength-read-leaves-out",
      title: "What a strength read leaves out",
      summary:
        "Three kinds of session sit out the strength numbers, and the app says so when they do.",
      estimate: true,
      keywords: [
        "missing sessions",
        "why is my exercise not listed",
        "deload excluded",
        "backed off",
        "comparability",
        "mis-logged set",
      ],
      blocks: [
        {
          kind: "para",
          text: "A strength number is a comparison, so it is only worth what the like-for-likeness of its two ends is worth. Three kinds of session are set aside before it is worked out.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Deload weeks" },
              " — a ",
              { to: "ug/deloads#how-it-reads-afterwards", text: "week that is meant to be light" },
              " would otherwise read as a week you got weaker.",
            ],
            [
              { strong: "Backed-off sessions" },
              " — an exercise ",
              { to: "ug/exercise-level-rir#what-it-does-to-your-numbers", text: "assigned an easier target than its week" },
              " was deliberately not a strength test.",
            ],
            [
              { strong: "Mis-logged sessions" },
              " — a session whose estimate sits wildly off everything else that lift has produced, which is almost always reps typed into the weight box.",
            ],
          ],
        },
        {
          kind: "para",
          text: "Where back-off work was set aside, a line under the trend counts the sessions and names the lifts, so a lift missing from the list is explained rather than silently gone.",
        },
        {
          kind: "para",
          text: [
            "All of it still counts as ",
            { to: "ug/volume#where-your-sets-show-up", text: "volume" },
            ", and toward weight and volume records. Those are observations of what you lifted; the trend is an estimate of what you could. The app is stricter with the second kind for exactly that reason.",
          ],
        },
      ],
      related: [
        "ug/exercise-level-rir#what-it-does-to-your-numbers",
        "ug/deloads#how-it-reads-afterwards",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "reading-like-with-like",
      title: "Reading like with like",
      summary:
        "Most apparent regressions are comparisons between two things that were never comparable.",
      estimate: true,
      keywords: [
        "why did my strength drop",
        "regression",
        "comparable",
        "cutting",
        "same lift two days",
        "why is the number different",
      ],
      blocks: [
        {
          kind: "para",
          text: "When a figure looks alarming, the first thing to check is what it is being compared against. Three habits cover most of it.",
        },
        {
          kind: "list",
          items: [
            "A cutting block against a growth block is a comparison across two different jobs. Holding your lifts through a cut is the win there.",
            [
              "The same lift trained twice a week is read ",
              { to: "ug/cycle-model#day-slots", text: "slot against slot" },
              ", because a heavy day and a lighter day pooled together look like a sawtooth.",
            ],
            "One session is a data point. Three in a row moving the same way is a trend.",
          ],
        },
        { kind: "heading", text: "Two things that surprise people" },
        {
          kind: "para",
          text: "Sets you log in a session you have open count straight away. Volume, records and estimates all move while you are still in the gym, so a figure you check mid-workout is a figure with half a session in it.",
        },
        {
          kind: "para",
          text: [
            "And your stats show each estimate as it was recorded, while the weight the app asks for next fades older sessions as they age. Same figures, two jobs — which is why a lifetime best from months ago can sit above what you are being asked to lift today. ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "How the prescription weighs recent work",
            },
            " explains the second half of that.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#the-anchor",
        "ug/cycle-model#day-slots",
      ],
    },
  ],
};
