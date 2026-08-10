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
// NOT LIVE — DO NOT WRITE (22b §4.1 ①): the measuring band, the `none`
// confidence label, "priced but not measured". `GLOSSARY.e1rm_confidence`
// carried that sentence and it is corrected in this PR (`D-14`).
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
    "The whole chain, in order: your sets become an estimate, the estimates become one anchor per exercise, the anchor becomes a weight, and a clean week earns one step on top of it.",
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
          text: "Four steps, and every weight the app asks of you comes out of them. Each set you log becomes a strength estimate. The estimates for one exercise fold into a single anchor. The anchor picks a weight for the reps and effort this week asks. And a week you completed cleanly earns one step on top of that.",
        },
        { kind: "heading", text: "How the anchor is built" },
        {
          kind: "para",
          text: "The anchor is not your best-ever set, and it is not an average of everything. The app finds your strongest recent session for that exercise, then takes that whole session — every working set in it — and averages them. One freak set cannot carry it, and one bad set cannot sink it.",
        },
        {
          kind: "para",
          text: [
            { strong: "Age decides which session wins, not what it is worth." },
            " Each candidate is discounted by half for every ",
            { num: "30" },
            " days since you did it, so a recent session outranks an older and slightly better one. Once a session has won, the anchor is that session's own average at full value — ageing picks the numbers, it never shrinks them.",
          ],
        },
        {
          kind: "para",
          text: "So the anchor tracks your training: it climbs when you have been lifting more, and it holds rather than sliding when you have been away, because an old session that is still your best is still what gets used.",
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
        "Two things blunt a strength estimate — a very long set, and a set stopped a long way from failure.",
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
            [[{ strong: "Low" }], "longer than that, easier than that, or logged with no effort reported"],
          ],
        },
        { kind: "heading", text: "Why two formulas, and why only sometimes" },
        {
          kind: "para",
          text: "Two standard formulas turn a set into an estimated max, and they disagree as sets get long. Over short heavy sets they sit close together, so the app averages them and the small errors partly cancel. Past about ten effective reps one of them starts running away upward, so above that point the app drops it and uses the steadier one alone.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Lean on the band, not the digit",
          text: "A low-confidence estimate is a rough read, and the app shows it rather than hiding it — a wrong number you can see is worth more than a gap. Judge a trend across sessions rather than a single figure.",
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
                " for the bands. An anchor takes the best rating present in its session.",
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
          text: "The question the app answers each week is narrow: given what you can currently do, what weight would land the reps we are asking for, at the effort we are asking for? Everything else in this chapter is either the input to that question or a governor on the answer.",
        },
        {
          kind: "para",
          text: "Your block's goal sets the rep range it works inside. A growth block aims for the middle of a moderate range; a strength block works in a short heavy one.",
        },
        {
          kind: "table",
          columns: ["Block goal", "Aims for", "Allowed to reach"],
          rows: [
            ["growth, cutting, maintaining", [{ num: "8–12" }, " reps"], [{ num: "6–15" }]],
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
            " — and the reps are then worked out again from the rounded weight, so the weight, the reps and the effort target you are shown always agree with each other.",
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
            " where one is set. A higher target buys a lighter weight for the same reps, which is the whole of how backing off works.",
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
          text: "Weight is the coarse dial and reps are the fine one, so the app moves the fine one first. Inside a block you work up the rep range at a load you have shown you can handle, and the load moves once the range is topped out.",
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
            "The climb rides the effort ramp. A rep is added in the weeks the ",
            { to: "ug/effort-rir#the-weeks-ramp", text: "target RIR steps down" },
            ", because the extra rep is what offsets the extra effort and keeps the load steady. On a week where the ramp holds, the reps hold too.",
          ],
        },
        {
          kind: "para",
          text: [
            "And the top-out is judged on your ",
            { strong: "lowest" },
            " working set, not your best one. Every set has to reach the top of the range before the weight moves, which is what stops one strong first set from buying a load you cannot hold for the rest.",
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
          text: "An anchor only ever describes what you have already done, so a program that asked for exactly the anchor would never ask for more. The step is what turns a measurement into a demand: the app asks for your anchor plus one small increment, and only when the last session says you earned it.",
        },
        {
          kind: "para",
          text: [
            { strong: "The step is the smallest honest one the exercise can express" },
            " — either one turn of its load step or one extra rep at the same weight, whichever is the smaller move. On a lift that only goes up in tens, that means the reps move first.",
          ],
        },
        { kind: "heading", text: "What earns it" },
        {
          kind: "para",
          text: "Every one of these has to hold for the session before: you did the sets you were asked for and none of them fell short of its own ask, you reported no joint pain, the session was not reported as a rough one, the workload was not past just right, it was recent enough to still describe you, the anchor behind it is a moderately confident one, and it was a working week rather than a deload.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "It never stacks",
          text: "A step that could not be expressed — a load jump too coarse for the lift, or a rep the range would not allow — is kept rather than banked. The next chance re-arms from the measured anchor again, at one step, so the demand can never drift a run of unearned increments ahead of what you have actually lifted.",
        },
        {
          kind: "para",
          text: [
            "Where a step is held back, the reason is written into the session's own reasoning. A held week still prescribes: it asks for the anchor as measured, which is the honest thing to ask when the last session ",
            { to: "ug/effort-rir#missing-the-ask", text: "did not clear its own bar" },
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
          text: "Earning a step and being offered it are two questions. The first is about last session. The second is about pace — whether the weight you are being asked for has already been climbing fast enough for the kind of block you are in.",
        },
        {
          kind: "para",
          text: [
            "The app compares how much the ",
            { strong: "asked-for" },
            " weight has risen over the last month against a target rate for your goal, drawn from the same band your ",
            { to: "ug/cycle-model#the-four-layers", text: "macrocycle" },
            " target comes from. Already at pace, and an earned step waits. Behind it, the step ships.",
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
          text: "The rate is personal and it moves. It is fitted to your goal and your profile, and once you have a couple of completed blocks behind you it adjusts to how those blocks actually went — so two people on the same plan can be paced differently, and your own pace changes as your history builds.",
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
          text: "None of these ever invents a step. They decide when an earned one is spent, and the only thing that mints one is a session you completed as asked.",
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#leading-by-one-step",
        "ug/how-it-felt#the-session-questions",
      ],
    },
  ],
};
