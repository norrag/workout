// User Guide — chapter 20, "Glossary" (doc 22 §5).
//
// **Every term the app defines, in one place** — and every card here is the
// app's own copy, rendered from `src/lib/glossary.ts` at render time, which is
// doc 22 §8.1's identity contract made structural rather than promised. A term
// explained by an `InfoDot` on a screen and the same term in this chapter are
// one string.
//
// AUTHORED: the grouping and the one orienting line per group. GENERATED: every
// definition. `contracts.test.ts` asserts this chapter renders **every**
// `GlossaryKey` exactly once, so adding a term to `glossary.ts` without filing
// it here fails CI — that assertion is what makes the chapter generated in the
// sense that matters, while keeping the reading order a human decision rather
// than `Object.keys()` order.
//
// It also retires `PENDING_GLOSSARY_TERMS`: §8.1's end state (every key
// resolving to a `term` block) is now enforced by a contract that cannot be
// satisfied by a list someone forgot to shorten.
//
// A card is deliberately NOT paraphrased into a lead sentence — §8.4b rule 3
// (distill, never describe a description) forbids exactly that, and §8.1 would
// flag a paraphrase that repeated a card's opening. The lead line names what the
// group is for and gets out of the way.
//
// SEAMS: every group points at the chapter that goes deeper, because a
// definition is where a reader starts rather than where they finish. Claims:
// `C-gloss-01` onward.

import type { ManualChapter } from "../types";

export const UG_GLOSSARY: ManualChapter = {
  manual: "ug",
  slug: "glossary",
  number: 20,
  title: "Glossary",
  summary:
    "Every term the app defines, in the app's own words — the same text you get from the circled i beside a label on any screen.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "cycles",
      title: "Cycles and structure",
      summary:
        "The four layers your training is organized into, largest first.",
      keywords: [
        "macrocycle",
        "mesocycle",
        "microcycle",
        "day slot",
        "phase",
        "block",
        "week",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "How the app arranges training over time. ",
            {
              to: "ug/cycle-model#the-four-layers",
              text: "The cycle model",
            },
            " draws how they nest.",
          ],
        },
        { kind: "term", term: "macrocycle" },
        { kind: "term", term: "mesocycle" },
        { kind: "term", term: "microcycle" },
        { kind: "term", term: "day_slot" },
        { kind: "term", term: "phase" },
      ],
      related: ["ug/cycle-model#the-four-layers", "ug/glossary#effort"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "effort",
      title: "Effort",
      summary:
        "How hard a set is meant to be, how that changes week to week, and the week that spends none of it.",
      keywords: [
        "rir",
        "reps in reserve",
        "ramp",
        "deload",
        "how hard",
        "failure",
        "effort target",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The vocabulary of effort. ",
            {
              to: "ug/effort-rir#what-rir-means",
              text: "Effort: RIR and the ramp",
            },
            " is the chapter behind all three.",
          ],
        },
        { kind: "term", term: "rir" },
        { kind: "term", term: "rir_ramp" },
        { kind: "term", term: "deload" },
        { kind: "term", term: "exercise_target_rir" },
      ],
      related: ["ug/effort-rir#what-rir-means", "ug/deloads#what-a-deload-is"],
    },
    // -----------------------------------------------------------------------
    {
      slug: "strength-estimates",
      title: "Strength estimates",
      summary:
        "What the app works out about your strength from the sets you log, and how much to lean on it.",
      estimate: true,
      keywords: [
        "e1rm",
        "one rep max",
        "estimate",
        "confidence",
        "how strong",
        "anchor",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The currency every strength figure is denominated in. ",
            {
              to: "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
              text: "How your next weight is chosen",
            },
            " explains where these come from.",
          ],
        },
        { kind: "term", term: "e1rm" },
        { kind: "term", term: "e1rm_confidence" },
        { kind: "term", term: "strength_anchor" },
      ],
      related: [
        "ug/how-your-weight-is-chosen#how-sharp-the-estimate-is",
        "ug/glossary#progress-and-volume",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "progress-and-volume",
      title: "Progress and volume",
      summary:
        "The trend read on your strength, and the two rules behind every set count in the app.",
      estimate: true,
      keywords: [
        "est strength",
        "mev",
        "mrv",
        "landmarks",
        "fractional sets",
        "how sets are counted",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "How progress and workload are measured. ",
            {
              to: "ug/volume#why-a-set-can-count-as-half",
              text: "Volume",
            },
            " and ",
            {
              to: "ug/reading-your-stats#the-strength-trend",
              text: "Reading your stats",
            },
            " go further.",
          ],
        },
        { kind: "term", term: "est_strength" },
        { kind: "term", term: "volume_landmarks" },
        { kind: "term", term: "fractional_sets" },
      ],
      related: [
        "ug/volume#the-band",
        "ug/reading-your-stats#the-strength-trend",
      ],
    },
    // -----------------------------------------------------------------------
    // N81 (doc 22 Phase 7): the words the app prints on training you have
    // already done. They arrived together because they are the same kind of
    // term — a mark or a figure on a row, meaningful only once you know what
    // was counted — and `22c` §C2 had all three open.
    {
      slug: "reading-a-session",
      title: "Reading a session",
      summary:
        "The marks and figures the app puts on sessions you have already trained.",
      keywords: [
        "backed off",
        "eff load",
        "effective load",
        "adherence",
        "history rows",
        "tags",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "What a history row or a headline figure is telling you. ",
            {
              to: "ug/reading-your-stats#one-lift-at-a-time",
              text: "Reading your stats",
            },
            " reads a whole screen of them.",
          ],
        },
        { kind: "term", term: "backed_off" },
        { kind: "term", term: "effective_load" },
        { kind: "term", term: "adherence" },
      ],
      related: [
        "ug/reading-your-stats#one-lift-at-a-time",
        "ug/exercise-level-rir#what-it-does-to-your-numbers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "feedback-and-equipment",
      title: "Feedback and equipment",
      summary: "Definitions for pump, soreness, and the size of a weight jump.",
      keywords: [
        "pump",
        "workload",
        "load step",
        "weight jump",
        "feedback",
        "definitions",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "What the app asks you for after a session, and what it does with the answers — ",
            {
              to: "ug/how-it-felt#what-your-answers-do",
              text: "Why the app asks how it felt",
            },
            ".",
          ],
        },
        { kind: "term", term: "workload" },
        { kind: "term", term: "pump" },
        { kind: "term", term: "load_step" },
      ],
      related: [
        "ug/how-it-felt#workload",
        "ug/exercises-and-templates#the-load-step",
      ],
    },
  ],
};
