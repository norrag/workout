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
    "Use the exercise page for one lift, the block tabs for one block, and the macrocycle Overview for the full training period.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "where-to-look",
      title: "Where to look",
      summary:
        "Choose the screen that matches the time and scope of your question.",
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
          text: "Open an exercise page to review one lift. Open a block's Balance or Performance tab to review that block. Open the macrocycle Overview to review the full macrocycle.",
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
              ["A macrocycle's ", { ui: "OVERVIEW" }, " tab"],
              "how is the whole arc going",
              "the block timeline, four headline figures, and body composition where you have scans",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "All three screens use the same calculations. Sets are counted ",
            {
              to: "ug/volume#why-a-set-can-count-as-half",
              text: "fractionally, by muscle",
            },
            " everywhere. The macrocycle Overview applies the same strength calculation as the block tab, but over a longer period.",
          ],
        },
        // N81 — one of those four headline figures, and the one whose
        // denominator a reader will otherwise guess at (`22c` §C2).
        { kind: "term", term: "adherence" },
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
          text: "Tap an exercise name from a set row, planner slot, or the library to open its page. Overview summarizes the exercise; History lists its sessions.",
        },
        { kind: "heading", text: "All-time bests" },
        {
          kind: "table",
          columns: ["Figure", "What it is"],
          rows: [
            [
              [{ ui: "WEIGHT PR · LB" }],
              "the heaviest working set you have logged, with the reps you got",
            ],
            [
              [{ ui: "EST. 1RM" }],
              "the best single-set strength estimate the lift has produced",
            ],
            [
              [{ ui: "VOLUME PR" }],
              "the biggest single set by weight times reps",
            ],
            [
              [{ ui: "BEST SESSION VOL" }],
              "the biggest day's total for that lift",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Below them, one bar per block shows that block's peak estimate. Orange marks the current block; a dashed bar means the exercise was not trained in that block. Use the chart to answer ",
            { strong: "is this lift improving across the macrocycle" },
            ".",
          ],
        },
        { kind: "heading", text: "History" },
        {
          kind: "para",
          text: [
            "History lists sessions newest first with their week and day. Tap a row to switch between logged weight and estimated strength. A ",
            { ui: "DELOAD" },
            " or ",
            { ui: "BACKED OFF" },
            " tag identifies deliberately lighter work. Session notes expand, and ",
            { ui: "LOAD OLDER" },
            " retrieves earlier rows. On a lift where your own bodyweight is part of the load, that flip reads ",
            { ui: "EFF LOAD" },
            " rather than a strength estimate.",
          ],
        },
        // N81 — `EFF LOAD` is on the row and defined nowhere (`22c` §C2).
        { kind: "term", term: "effective_load" },
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
            " usable sessions. With fewer, it reads ",
            { ui: "Not enough data yet" },
            " rather than showing a figure built on two points.",
          ],
        },
        {
          kind: "para",
          text: [
            "Each end uses the ",
            { strong: "best" },
            " of several sessions. This prevents one light opening week or one unusually strong day from controlling the result. Small differences are reported as holding.",
          ],
        },
        {
          kind: "para",
          text: "Each lift credits its strength change to the muscles it trains: full credit to the primary muscle and half credit to supporting muscles. The macrocycle headline averages those muscle results and weights them by training volume. Muscles trained more often have more influence.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Estimate against estimate",
          text: "The trend estimates strength from logged sets. Use it to judge direction across several sessions; treat a change of only a few percent as noise.",
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
            " list compares your best set in the block with your earlier history. A higher weight or a better result at a weight you have used before earns a place.",
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
            " cover your full history. A lift can therefore show a lifetime best from a past block while showing no record in the current block.",
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
        "Deload, backed-off, and clearly mis-logged sessions are excluded from strength comparisons.",
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
          text: "A strength trend needs comparable sessions at both ends. The app excludes sessions that were deliberately easy or clearly mis-logged.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Deload weeks" },
              " — a ",
              {
                to: "ug/deloads#how-it-reads-afterwards",
                text: "week that is meant to be light",
              },
              " would otherwise read as a week you got weaker.",
            ],
            [
              { strong: "Backed-off sessions" },
              " — an exercise ",
              {
                to: "ug/exercise-level-rir#what-it-does-to-your-numbers",
                text: "assigned an easier target than its week",
              },
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
        "Compare the same goal, exercise slot, and statistic before treating a lower number as a regression.",
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
          text: "When a figure looks wrong, first check what it is being compared with.",
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
        { kind: "heading", text: "Current sessions and past estimates" },
        {
          kind: "para",
          text: "Sets you log in a session you have open count straight away. Volume, records and estimates all move while you are still in the gym, so a figure you check mid-workout is a figure with half a session in it.",
        },
        {
          kind: "para",
          text: [
            "Stats preserve each estimate as recorded. The strength anchor gives older sessions less influence when choosing your next weight. A lifetime best from months ago can therefore remain above today's prescription. ",
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
