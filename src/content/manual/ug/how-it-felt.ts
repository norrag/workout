// User Guide — chapter 11, "Why the app asks how it felt" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 11 — `engine/rules/feedback.ts`, doc 10, the active
// v25 row):
//   - **the ±1 model is what ships.** Doc 10 §3's graded MEV→MAV→MRV ramp and
//     its two-week-at-MRV auto-deload were deferred (T-A5) and are NOT
//     implemented. What exists is `modulateFromFeedback`: one set off, one set
//     on, or hold — and MEV/MAV/MRV as an advisory classification library
//     (22b §7, the spec-vs-code gap). This chapter describes ±1
//   - joint pain runs FIRST and unconditionally: `pain_cut_gate` cuts a set,
//     `pain_gate` vetoes an addition and caps the load. Neither reads workload
//   - a set is added only on ALL of: workload ≤ `workload_low`, pump ≥
//     `set_add_pump_min`, a growth goal, and the muscle's weekly sets under
//     `mg_set_ceiling` — and never over a pain veto
//   - **soreness and effort are recorded, not read by the engine.**
//     `exerciseFeedbackInputSchema` is `{jointPain, pump, workload}` and
//     `workoutFeedbackInputSchema` is `{overallFatigue, effortRating,
//     performanceRating}`, of which only fatigue and performance are used
//     (`session_dampen_require_both: true` on v25 ⇒ BOTH must fire)
//   - every number below was read from the live v25 row on 2026-08-11
//     (`get_engine_params(25)`, hash-verified) and carries its `engine_params`
//     path per doc 22 §8.2. The four this chapter added are folded into
//     22b §4.2 under that section's own rule
//   - the user-visible result is the prescription strip's why line
//     (`prescription-narrative.ts:234–252`), which names the answer that moved
//     the number — so the chapter can promise the reader will see the reason
//   - claims are registered in `docs/22a-manual-claims.md`
//
// SEAMS: ch. 5 owns when the sheets appear and what each control is; ch. 12
// owns the volume band the set counts are judged against; ch. 10 owns how the
// weight itself is chosen — this chapter is careful to say the answers move
// SETS, and that a rough session can only hold a rise, never cause a drop.

import type { ManualChapter } from "../types";

export const UG_HOW_IT_FELT: ManualChapter = {
  manual: "ug",
  slug: "how-it-felt",
  number: 11,
  title: "Why the app asks how it felt",
  summary:
    "What the app does with your answers about pain, workload, pump and fatigue — and which of them actually move next week.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-your-answers-do",
      title: "What your answers do",
      summary:
        "They move set counts — by one set at a time, for that muscle, on that day.",
      keywords: [
        "feedback",
        "what happens to my answers",
        "sets went up",
        "sets went down",
        "why fewer sets",
        "autoregulation",
      ],
      blocks: [
        {
          kind: "para",
          text: "Your answers set how much work you are given. The weight comes from the sets you logged; the questions decide whether next week's version of that muscle's work is a set longer, a set shorter, or the same.",
        },
        {
          kind: "para",
          text: "Feedback can change the prescription by one set. The change applies to the same muscle on the same day of the following week.",
        },
        { kind: "heading", text: "Every answer, and what it moves" },
        {
          kind: "table",
          columns: ["You answer", "It moves"],
          rows: [
            [
              "Joint pain",
              "on its own, ahead of everything else: it stops a set being added and holds the weight, and at its worst takes a set away",
            ],
            [
              "Workload",
              "the main input for set count — too much removes one set; too easy can add one",
            ],
            [
              "Pump",
              "the second signature on adding a set; on its own it moves nothing",
            ],
            [
              "Soreness and effort",
              "kept with the session as part of your record, for you and a connected AI to read back",
            ],
            [
              "Fatigue and performance",
              "together, whether next week's weight increase on this day goes ahead",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Wherever an answer moved a number, the ",
            {
              to: "ug/training-a-session#the-day-screen",
              text: "prescription strip",
            },
            " on that exercise says which one did it, in the same words you used to answer. The sections that follow are the reasoning behind each row.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: [
            "Skipping the questions is a real option — an unanswered muscle simply holds where it is. The sheets themselves are in ",
            {
              to: "ug/training-a-session#how-it-went",
              text: "the session chapter",
            },
            ".",
          ],
        },
      ],
      related: [
        "ug/how-it-felt#joint-pain-first",
        "ug/training-a-session#how-it-went",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "joint-pain-first",
      title: "Joint pain is read first",
      summary:
        "The one answer that acts on its own, before anything else is considered.",
      keywords: [
        "joint pain",
        "elbow",
        "knee",
        "shoulder",
        "injury",
        "niggle",
        "hurts",
        "back off",
      ],
      blocks: [
        {
          kind: "para",
          text: "Joint pain is the first thing the program looks at and the only answer that decides on its own. Whatever the rest of the session says, pain wins.",
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Moderate",
              text: "No set is added, and the weight is held where it was rather than climbing. Both stay in force until you stop reporting it.",
            },
            {
              label: "High",
              text: "A set comes off the exercise, and the reason offered is that a different movement for that muscle may fit better.",
            },
          ],
        },
        {
          kind: "para",
          text: [
            "Reporting pain makes the program reduce work for that exercise. It does not change the rest of the week. To keep the movement at a lower effort while it settles, use ",
            {
              to: "ug/effort-rir#per-exercise",
              text: "an exercise's own effort target",
            },
            " is for.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "This is dose management, not treatment",
          text: "The program can take work off a joint that hurts. It has no view on why it hurts, and pain that persists or worsens is a matter for a physio rather than a slider.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The four buttons are scored ",
                { num: "0" },
                "–",
                { num: "3" },
                ". ",
                { ui: "Moderate" },
                " is currently ",
                { code: "pain_gate" },
                " (",
                { num: "2" },
                "): additions are vetoed and a warranted weight increase is held. ",
                { ui: "High" },
                " is currently ",
                { code: "pain_cut_gate" },
                " (",
                { num: "3" },
                "): a set is removed outright.",
              ],
            },
            {
              kind: "para",
              text: "Both are checked before workload and pump are looked at, so a session you rated easy with a good pump still loses the set if the joint is complaining.",
            },
          ],
        },
      ],
      related: ["ug/how-it-felt#workload", "ug/effort-rir#per-exercise"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "workload",
      title: "How workload changes sets",
      summary:
        "How much work that muscle got — the answer the set count is really built on.",
      keywords: [
        "workload",
        "too much",
        "too easy",
        "just right",
        "set added",
        "set removed",
        "how many sets next week",
      ],
      blocks: [
        {
          kind: "para",
          text: "Once pain is out of the way, workload is what decides. It is a judgement about dose — how much work that muscle got in the session, not how hard any one set was.",
        },
        { kind: "term", term: "workload" },
        { kind: "heading", text: "What each end does" },
        {
          kind: "table",
          columns: ["You rate the session", "Next week"],
          rows: [
            [
              [{ ui: "TOO MUCH" }, " territory"],
              "a set comes off that muscle's work on this day",
            ],
            [
              ["around ", { ui: "JUST RIGHT" }],
              "the set count holds, which is the answer most weeks want",
            ],
            [
              [{ ui: "TOO EASY" }, " territory"],
              "a set may be added — see the next section for what else has to be true",
            ],
          ],
        },
        {
          kind: "para",
          text: "Report a session as too hard when the same workload would be difficult to recover from and repeat. The program removes one set the following week.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The slider records ",
                { num: "0" },
                "–",
                { num: "10" },
                " with ",
                { num: "5" },
                " as ",
                { ui: "JUST RIGHT" },
                ". A set is removed at or above ",
                { code: "workload_high" },
                ", currently ",
                { num: "8" },
                ", and a set becomes eligible at or below ",
                { code: "workload_low" },
                ", currently ",
                { num: "3" },
                ".",
              ],
            },
            {
              kind: "para",
              text: [
                "An exercise is never taken below ",
                { code: "min_sets" },
                " (currently ",
                { num: "2" },
                ") or above ",
                { code: "max_sets_per_exercise" },
                " (currently ",
                { num: "6" },
                ") by any of this.",
              ],
            },
          ],
        },
      ],
      related: ["ug/how-it-felt#pump-and-soreness", "ug/volume#the-band"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "pump-and-soreness",
      title: "Pump and soreness",
      summary:
        "Pump corroborates a light session rather than leading; soreness is kept as part of the record.",
      keywords: [
        "pump",
        "soreness",
        "sore",
        "days sore",
        "doms",
        "add a set",
        "weak signal",
      ],
      blocks: [
        {
          kind: "para",
          text: "Pump has exactly one job: it is the second signature on adding a set.",
        },
        { kind: "term", term: "pump" },
        {
          kind: "para",
          text: "An easy session adds a set only when you also report a strong pump. If the session felt easy but produced little pump, the app suggests reviewing the exercise instead.",
        },
        {
          kind: "para",
          text: "Two more conditions sit on top: the block has to be aiming at growth, and the muscle's weekly sets have to be under the ceiling the program will build to.",
        },
        { kind: "heading", text: "Soreness" },
        {
          kind: "para",
          text: "Soreness records how the muscle felt after you last trained it. It stays in your session history for you and a connected AI to review across the block. Workload, pump, and pain determine set-count changes.",
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Neither one measures growth",
          text: "Pump and soreness are limited measures of training quality. Pump can support a set increase when workload was easy. Soreness is recorded for later review but does not change the prescription.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The pump slider is ",
                { num: "0" },
                "–",
                { num: "10" },
                ". A set is added only at or above ",
                { code: "set_add_pump_min" },
                ", currently ",
                { num: "6" },
                ", and only while the muscle's weekly sets are under ",
                { code: "mg_set_ceiling" },
                ", currently ",
                { num: "20" },
                ". A pump at or below ",
                { code: "pump_low" },
                " (currently ",
                { num: "2" },
                ") on a session rated about right is what prompts the change-the-movement suggestion.",
              ],
            },
            {
              kind: "para",
              text: "Those weekly sets are counted the way every other volume number in the app is counted — a full set to the muscle the exercise mainly trains, a half to each muscle it also works.",
            },
          ],
        },
      ],
      related: [
        "ug/how-it-felt#workload",
        "ug/volume#why-a-set-can-count-as-half",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-session-questions",
      title: "The three questions at the end",
      summary:
        "Fatigue, effort and performance — a brake on next week's weight, not on your sets.",
      keywords: [
        "overall fatigue",
        "effort",
        "performance",
        "off day",
        "wiped out",
        "session feedback",
        "weight held",
      ],
      blocks: [
        {
          kind: "para",
          text: "The three completion sliders describe the whole session. Fatigue and performance can withhold next week's weight increase; they do not change the set count.",
        },
        {
          kind: "para",
          text: [
            {
              strong: "High fatigue and poor performance must occur together.",
            },
            " High fatigue alone does not block an increase when performance was good.",
          ],
        },
        { kind: "heading", text: "What a hold is, and is not" },
        {
          kind: "para",
          text: "A hold keeps the weight you already handled and recalculates the reps to match. It prevents an increase but does not reduce the weight.",
        },
        {
          kind: "para",
          text: "Effort records how hard the whole session felt. It stays beside what you lifted for you and a connected AI to review, but it does not decide the next weight.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "All three record ",
                { num: "0" },
                "–",
                { num: "10" },
                ". The hold requires fatigue at or above ",
                { code: "session_fatigue_dampen_threshold" },
                " (currently ",
                { num: "8" },
                ") ",
                { strong: "and" },
                " performance at or below ",
                { code: "session_performance_dampen_threshold" },
                " (currently ",
                { num: "3" },
                "), because ",
                { code: "session_dampen_require_both" },
                " is on.",
              ],
            },
            {
              kind: "para",
              text: "Your muscle-level answers are unaffected by it — a set added or removed from workload still happens on a session the weight was held for.",
            },
          ],
        },
      ],
      related: [
        "ug/how-it-felt#what-your-answers-do",
        "ug/training-a-session#finishing-the-session",
      ],
    },
  ],
};
