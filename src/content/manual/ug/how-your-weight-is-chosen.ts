// User Guide — chapter 10, "How your next weight is chosen" (doc 22 §5).
//
// The headline chapter, and the one doc 22 §11 gives its own review gate.
//
// GROUND TRUTH (22b §7 ch. 10 — `engine/predict.ts`, `engine/reps.ts`,
// `engine/index.ts`, `engine/rules/progression.ts`, `engine/rules/envelope.ts`,
// `queries/anchors.ts`, doc 16, doc 10 §1, and the active v25 row):
//   - the anchor is `e1rm.anchor_method: "session_best"` — the recency-weighted
//     best SET's whole session, averaged; recency is `0.5^(ageDays/30)` from
//     `e1rm.recency_halflife_days`. Its confidence is the STRONGEST present in
//     that session (`bestConfidence`), which is the lenient floor
//   - confidence: `high` at ≤ 8 effective reps AND ≤ 2 RIR; `moderate` at ≤ 12
//     and ≤ 3; `low` otherwise, and always `low` when no RIR was reported
//   - the weight is `weightForRepsAtRir(anchor, targetReps, weekRir)` — the load
//     that lands the schedule's reps at the week's RIR — then rounded, then the
//     reps re-derived from the rounded load so the triple stays consistent
//   - double progression is the §9.2 Option-A schedule: reps climb one per week
//     inside the window at a held load, reset to `target_low` when the window
//     tops out, and the climb is gated on the RIR having stepped
//     (`climb_requires_rir_step`) and driven by the MINIMUM performed working-set
//     reps (`climb_on_performed_reps`)
//   - doc 16 earned step: `A* = A + δ` where δ is the SMALLEST of one load step
//     and one rep, in e1RM space; re-armed off the MEASURED anchor every time,
//     never `A + kδ`. Eight earn-gate predicates; four governors
//   - the envelope loop is LIVE and SELF-GATING per user
//     (`progression.envelope.enabled`, `min_history_mesos` 2) — so pacing is
//     per-user and changes as history accrues. 22b §4.3 forbids describing
//     pacing as a fixed rule
//
// THE CORRECTION THIS CHAPTER EXISTS TO GET RIGHT (22b §6.1, doc 10 §1's
// 2026-06-24 amendment): the Epley/Brzycki pair is a **cutoff**, not a
// cancelling average. Brzycki tracks Epley to ~10 effective reps and INFLATES
// above it, so the two are averaged only up to `e1rm.brzycki_max_eff_reps`
// (10) and Epley runs alone above. Doc 22 §5's own "averaging cancels the two
// biases" rationale holds only inside the band. Ch. 6 states the rule in its
// layer 3 (`C-e1rm-03`); this chapter states WHY.
//
// THE MEASURING BAND IS LIVE (ledger `D-21`, updated for v27 on 2026-08-12):
// `e1rm.max_measuring_rir` is 5 on the active row and `isMeasuringRir` returns
// false past it — a set at an assumed RIR above 5 is
// stamped `none`, carries no estimate, and leaves the anchor and every strength
// surface while volume keeps it. `GLOSSARY.e1rm_confidence` carries the
// sentence again (`D-14`'s restore condition, 22b §8 **O-B**), so this chapter
// renders it through the card and states the rule in its own ladder. A working
// ramp can reach the boundary at 5; ch. 8 owns exercise-level targets past it,
// and ch. 9 owns the standard deload at 8.
//
// RE-CHECK BEFORE EDITING: true only while `e1rm.max_measuring_rir` is on the
// ACTIVE row (22b §4.2) — doc 22 **O3** forbids documenting an inactive one.
//
// SEAMS: ch. 6 owns effective reps and the honest report; ch. 7 owns the ramp
// as a choice; ch. 8 owns the per-exercise lever; ch. 11 owns feedback; ch. 13
// owns the stats screens; ch. 14 owns macrocycle goals and the rate band;
// ch. 15 owns the load-step control. Claims: `C-wt-01` onward in 22a.

import type { ManualChapter } from "../types";

export const UG_HOW_YOUR_WEIGHT_IS_CHOSEN: ManualChapter = {
  manual: "ug",
  slug: "how-your-weight-is-chosen",
  number: 10,
  title: "How your next weight is chosen",
  summary:
    "Your recent sets establish a strength anchor, which sets the next weight; a completed session can earn one small increase.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-anchor",
      title: "The strength anchor",
      summary:
        "One number per exercise, taken from your strongest recent session — age decides which session, not what it is worth.",
      estimate: true,
      keywords: [
        "strength anchor",
        "where does the weight come from",
        "anchor",
        "recent sets",
        "session best",
        "how does it know",
      ],
      blocks: [
        {
          kind: "para",
          text: "Each logged set produces a strength estimate. The app averages one recent session into an anchor for that exercise. It uses the anchor to choose this week's weight, then adds one small increase when the previous session qualified.",
        },
        { kind: "heading", text: "How the anchor is built" },
        {
          kind: "para",
          text: "The anchor is the average strength estimate from your best eligible recent session. Using every working set in that session reduces the effect of one unusually good or bad set.",
        },
        {
          kind: "para",
          text: [
            { strong: "Recency helps select the session." },
            " Each candidate's score is reduced by half for every ",
            { num: "30" },
            " days since you did it, so a recent session can outrank an older, slightly stronger one. After selection, the anchor uses the winning session's actual average without the recency discount.",
          ],
        },
        {
          kind: "para",
          text: "The anchor rises when your recent sessions improve. Time away does not lower it by itself. Until you log better work, the best eligible recent session remains the anchor.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The winning set is the one maximising estimate × recency, where recency is ",
                { num: "0.5" },
                " raised to (days ÷ half-life). The anchor's value is then the mean of that set's whole session, undiscounted. Parameters: ",
                { code: "e1rm.anchor_method" },
                " (",
                { ui: "session_best" },
                ") and ",
                { code: "e1rm.recency_halflife_days" },
                ". The discount is relative among one exercise's own sets, so a lift you last trained months ago still has an anchor.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/effort-rir#why-honesty-matters",
        "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-sharp-the-estimate-is",
      title: "How sharp the estimate is",
      summary:
        "Long sets and sets stopped far from failure produce less reliable strength estimates.",
      estimate: true,
      keywords: [
        "confidence",
        "high moderate low",
        "how accurate",
        "epley",
        "brzycki",
        "reliable",
        "estimate quality",
      ],
      blocks: [
        { kind: "term", term: "e1rm_confidence" },
        {
          kind: "table",
          columns: ["Rated", "When the set was"],
          rows: [
            [
              [{ strong: "High" }],
              [
                "worth ",
                { num: "8" },
                " effective reps or fewer, and stopped no more than ",
                { num: "2" },
                " short of failure",
              ],
            ],
            [
              [{ strong: "Moderate" }],
              [
                "worth ",
                { num: "12" },
                " or fewer, and stopped no more than ",
                { num: "3" },
                " short",
              ],
            ],
            [
              [{ strong: "Low" }],
              "longer than that, easier than that, or logged with no effort reported",
            ],
            [
              [{ strong: "Not rated" }],
              [
                "further than ",
                { num: "5" },
                " reps from failure — the set counts as work and as volume, and the app reads no strength from it",
              ],
            ],
          ],
        },
        { kind: "heading", text: "Why two formulas, and why only sometimes" },
        {
          kind: "para",
          text: "The app calculates estimated strength with the Epley and Brzycki formulas. Their results are similar for short, heavy sets, so the app averages them through ten effective reps. Above ten, it uses only Epley because Brzycki rises too quickly.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Lean on the band, not the digit",
          text: "Treat a low-confidence estimate as a rough reading. Judge the trend across several sessions instead of relying on one figure.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "With ",
                { strong: "w" },
                " the weight and ",
                { strong: "r" },
                " the effective reps (reps plus reps in reserve), the two formulas are Epley — ",
                { num: "w × (1 + r ÷ 30)" },
                " — and Brzycki — ",
                { num: "w × 36 ÷ (37 − r)" },
                ". They are averaged up to ",
                { num: "10" },
                " effective reps; above that Brzycki climbs away from Epley, so Epley runs alone.",
              ],
            },
            {
              kind: "para",
              text: [
                "Parameters: ",
                { code: "e1rm.brzycki_max_eff_reps" },
                " for the cutoff, ",
                { code: "e1rm.high_max_eff_reps" },
                " / ",
                { code: "e1rm.high_max_rir" },
                " and ",
                { code: "e1rm.mod_max_eff_reps" },
                " / ",
                { code: "e1rm.mod_max_rir" },
                " for the bands, and ",
                { code: "e1rm.max_measuring_rir" },
                " for the point past which a set is priced but not measured. An anchor takes the best rating present in its session, and only measured sets reach it.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/effort-rir#why-honesty-matters",
        "ug/how-your-weight-is-chosen#from-a-number-to-a-weight",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "from-a-number-to-a-weight",
      title: "From a number to a weight",
      summary:
        "The app picks the load that lands this week's reps at this week's effort.",
      keywords: [
        "rep window",
        "how is the weight picked",
        "8 to 12",
        "rep range",
        "goal",
        "strength reps",
        "rounding",
      ],
      blocks: [
        {
          kind: "para",
          text: "The app chooses the weight expected to place this week's reps at this week's effort target. Your strength anchor supplies the starting point, and the block goal supplies the allowed rep range.",
        },
        {
          kind: "para",
          text: "Your block's goal sets the rep range it works inside. A growth block aims for the middle of a moderate range; a strength block works in a short heavy one.",
        },
        {
          kind: "table",
          columns: ["Block goal", "Aims for", "Allowed to reach"],
          rows: [
            [
              "growth, cutting, maintaining",
              [{ num: "8–12" }, " reps"],
              [{ num: "6–15" }],
            ],
            ["strength", [{ num: "3–5" }, " reps"], [{ num: "2–6" }]],
          ],
        },
        { kind: "heading", text: "Then it is made liftable" },
        {
          kind: "para",
          text: [
            "The chosen load is rounded to something you can actually put on the bar — the exercise's own ",
            {
              to: "ug/exercises-and-templates#the-load-step",
              text: "load step",
            },
            ". The app then recalculates the reps from that rounded weight. The displayed weight, reps, and effort target therefore describe the same set.",
          ],
        },
        {
          kind: "para",
          text: [
            "The effort half of the question is the week's own target, or an ",
            {
              to: "ug/exercise-level-rir#why-one-exercise-differs",
              text: "exercise's own",
            },
            " where one is set. For the same reps, a higher target produces a lighter weight.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#reps-first-then-weight",
        "ug/exercises-and-templates#the-load-step",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "reps-first-then-weight",
      title: "Reps climb, then the weight steps",
      summary:
        "Double progression: work up the rep range at one weight, and when you top it out the weight moves and the reps start again.",
      keywords: [
        "double progression",
        "reps went up",
        "why same weight",
        "rep range",
        "when does the weight increase",
        "reset",
      ],
      blocks: [
        {
          kind: "para",
          text: "The app increases reps before weight because one rep is usually a smaller change than one load step. You progress through the rep range at the same weight, then increase the weight after every set reaches the top.",
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Climb",
              text: "Each week asks one more rep than the last, at much the same weight, up to the top of the range.",
            },
            {
              label: "Top out",
              text: "Reach the top of the range on every working set, and next week starts again at the bottom of it — with a heavier load.",
            },
            {
              label: "Repeat",
              text: "That is one full turn of the cycle, and a block usually contains one or two.",
            },
          ],
        },
        { kind: "heading", text: "Two details that surprise people" },
        {
          kind: "para",
          text: [
            "The effort ramp also affects reps. The app adds a rep in weeks where ",
            {
              to: "ug/effort-rir#the-weeks-ramp",
              text: "target RIR steps down",
            },
            ". When the effort target stays the same, the reps also stay the same.",
          ],
        },
        {
          kind: "para",
          text: [
            "And the top-out is judged on your ",
            { strong: "lowest" },
            " working set, not your best one. The weight increases only after every set reaches the top of the range.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#leading-by-one-step",
        "ug/effort-rir#missing-the-ask",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "leading-by-one-step",
      title: "Earning a step",
      summary:
        "A week you completed as asked lets the program lead your anchor by the smallest honest step — once.",
      estimate: true,
      keywords: [
        "progressive overload",
        "earned step",
        "why did the weight go up",
        "why is it not going up",
        "overload",
        "compliance",
      ],
      blocks: [
        {
          kind: "para",
          text: "The anchor describes what you have already done. After a qualifying session, the app can prescribe one small increase above it.",
        },
        {
          kind: "para",
          text: [
            {
              strong:
                "The step is the smallest honest one the exercise can express",
            },
            " — either one turn of its load step or one extra rep at the same weight, whichever is the smaller move. On a lift that only goes up in tens, that means the reps move first.",
          ],
        },
        { kind: "heading", text: "What earns it" },
        {
          kind: "para",
          text: "A weight increase requires a recent working-week session with a moderately confident strength anchor. You must complete every prescribed set without missing its target. Joint pain, a rough session, or workload above just right blocks the increase.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "It never stacks",
          text: "If the load step or rep range cannot express an increase, the prescription stays at the anchor. The next eligible session can still add only one increase. Missed increases never accumulate.",
        },
        {
          kind: "para",
          text: [
            "Where a step is held back, the reason is written into the session's own reasoning. A held week still prescribes: it asks for the anchor as measured, which is the honest thing to ask when the last session ",
            {
              to: "ug/effort-rir#missing-the-ask",
              text: "did not clear its own bar",
            },
            ".",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#how-often-a-step-comes",
        "ug/how-it-felt#what-your-answers-do",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-often-a-step-comes",
      title: "How often a step comes",
      summary:
        "Earning one and being offered it are different questions, and the second is paced to your goal and your own history.",
      estimate: true,
      keywords: [
        "how fast should i progress",
        "paced",
        "why no increase",
        "rate",
        "too slow",
        "beginner",
        "advanced",
      ],
      blocks: [
        {
          kind: "para",
          text: "A qualifying session makes an increase available. The pacing rule then checks whether your prescribed weight has already been rising fast enough for the block's goal.",
        },
        {
          kind: "para",
          text: [
            "The app compares how much the ",
            { strong: "asked-for" },
            " weight has risen over the last month against a target rate for your goal, drawn from the same band your ",
            { to: "ug/cycle-model#the-four-layers", text: "macrocycle" },
            " target comes from. If you are already at that pace, the increase waits. If you are behind it, the increase is applied.",
          ],
        },
        { kind: "heading", text: "Three other things can delay one" },
        {
          kind: "list",
          items: [
            "One step per exercise per week, whatever else is true.",
            "A run of steps taken and then missed asks for a couple of clean sessions before the next one is armed.",
            "The final working week of a block, where the effort ask is already at its hardest, takes no step of its own.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Your pace is yours",
          text: "The rate depends on your goal and profile. After you complete two blocks, it also reflects how often you earned and completed past increases. Two people on the same plan can therefore receive different pacing.",
        },
        {
          kind: "para",
          text: "A block whose goal is cutting or maintaining takes no steps at all. Holding your strength through a cut is the win there, and asking for more while you are eating less is asking for a miss.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "Which goals take steps is ",
                { code: "progression.goal_rate_factor" },
                ", currently ",
                { num: "0" },
                " for cut and maintain.",
              ],
            },
          ],
        },
        {
          kind: "para",
          text: "These pacing rules only delay an available increase. A completed qualifying session is always required to create one.",
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#leading-by-one-step",
        "ug/how-it-felt#the-session-questions",
      ],
    },
  ],
};
