// User Guide — chapter 17, "Prescription details" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 17 — doc 19 over doc 18, N75;
// `src/lib/prescription-narrative.ts`, `src/components/PrescriptionDetailSheet.tsx`,
// `log/[workoutId]/DayView.tsx:1244–1292`, `queries/audit.ts`, doc 14):
//   - THREE LAYERS, one author each (doc 19 §3). The ask line and the why lines
//     are DETERMINISTIC and always render (`composeAsk` / `composeWhyLines`);
//     an optional coaching line is APPENDED beneath them under a tracked-caps
//     `COACH` rule (`appendCoaching`) and never substitutes for them
//   - N75: the ask line IS the way into Prescription details — underlined, and
//     the row it replaced is gone from the exercise ⋮ menu
//   - the sheet's four groups: PRESCRIPTION (the tuple + the engine rationale +
//     the out-of-band tripwire), DECISION (`KIND` seed/advance · `COMPUTED
//     UNDER` Vn + date · `VERIFIED AS OF` Vn, plus the "re-verified, numbers
//     unchanged" line), EST. STRENGTH (`PRESCRIBED IMPLIES` · `TARGET ANCHOR
//     A*` · `MEASURED ANCHOR` with the winning set and its date), TRACE
//     (status-coded steps, `RULE · STATUS (GOVERNOR)`)
//   - the out-of-band tripwire fires when the live numbers no longer match the
//     recorded decision: "they were set outside the engine"
//     (`prescriptionMatchesDecision`)
//   - the strip has real loading and failure states, both user-visible:
//     "Reading the program's decision…" and a tappable
//     "Couldn't read the program's decision — tap to retry."
//
// THE O-A CONSTRAINT (22b §4.1 ②): `LLM_EXPLANATIONS` is a Vercel environment
// variable and NOT readable from a Claude session. Generation is running in
// production (`decision_explanations` had 203 rows at the Phase-0 audit);
// whether the strip SERVES them depends on the mode being `on` rather than
// `shadow`. 22b's instruction is explicit — document the deterministic ask and
// why as always rendered, and treat the coaching line as CONDITIONAL. Every
// sentence in §4 below is written to be true under both modes: the doc 19 §3
// architecture claim (the deterministic layers are the complete explanation and
// a coaching line is only ever additive) holds whether or not one appears.
//
// SEAMS: ch. 5 owns the day screen and hands the strip here; ch. 6 owns the
// effort target; ch. 10 owns the anchor, the step and the pacer — this chapter
// shows where each of them is recorded, never re-derives one; ch. 15 owns the
// load step. Claims: `C-rx-01` onward.

import type { ManualChapter } from "../types";

export const UG_PRESCRIPTION_DETAILS: ManualChapter = {
  manual: "ug",
  slug: "prescription-details",
  number: 17,
  title: "Prescription details",
  summary:
    "Every prescription can be opened up: what you are being asked for, why, and the full record of the decision that produced it.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-strip",
      title: "The strip under an exercise",
      summary:
        "Two layers, always: what the program is asking for, and the reasoning behind it.",
      keywords: [
        "why this weight",
        "prescription strip",
        "explanation",
        "reasoning",
        "the ask",
        "why line",
      ],
      blocks: [
        {
          kind: "para",
          text: "The strip under each exercise states what to do and why the prescription changed. Read the underlined ask first, then the explanation beneath it.",
        },
        {
          kind: "table",
          columns: ["Line", "Answers"],
          rows: [
            [
              [{ strong: "The ask" }, ", underlined at the top"],
              "what to do this session, in one sentence — the weight, the reps, the sets and how far short of failure to stop",
            ],
            [
              [{ strong: "The why" }, ", beneath it"],
              "how that compares with last session, and what the program decided this week — whether it moved the weight, held it, or is waiting",
            ],
          ],
        },
        {
          kind: "para",
          text: "The ask appears with the exercise. The reasoning loads from the saved prescription decision. If it cannot load, the line shows a retry control.",
        },
        {
          kind: "para",
          text: [
            "Every number comes from the program. The explanation uses the saved decision, so the same type of decision uses the same wording across exercises.",
          ],
        },
        {
          kind: "para",
          text: [
            "Sometimes a short coaching line appears beneath the reasoning. It offers advice alongside the prescription, but never changes what the program is asking you to do. ",
            {
              to: "ug/prescription-details#who-writes-the-numbers",
              text: "Read how coaching and program decisions differ.",
            },
          ],
        },
      ],
      related: [
        "ug/prescription-details#opening-the-details",
        "ug/prescription-details#who-writes-the-numbers",
        "ug/training-a-session#the-day-screen",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "opening-the-details",
      title: "Opening the details",
      summary:
        "Tapping the ask line opens the full record behind that one prescription.",
      estimate: true,
      keywords: [
        "prescription details",
        "audit",
        "where does this number come from",
        "trace",
        "decision",
        "anchor",
      ],
      blocks: [
        {
          kind: "para",
          text: "Tap the underlined ask to open Prescription details. Use this screen when a weight or rep count looks wrong and you want to inspect its source.",
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Prescription",
              text: "The numbers themselves, with the program's own one-line rationale under them.",
            },
            {
              label: "Decision",
              text: "Whether this was the block's opening prescription or a week-to-week advance, when it was worked out, and under which version of the program's settings.",
            },
            {
              label: "Est. strength",
              text: "The implied strength, target strength, and measured source behind the load. The source names the exact set and date.",
            },
            {
              label: "Trace",
              text: "The steps the program went through, each with the rule that ran and how it came out.",
            },
          ],
        },
        {
          kind: "para",
          text: [
            "The ",
            { strong: "measured" },
            " figure names the exact set behind the prescription: its weight, reps, and date. Use it to trace a surprising prescription back to the source session.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#the-anchor",
        "ug/prescription-details#when-a-prescription-changes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "when-a-prescription-changes",
      title: "When a prescription changes",
      summary: "Two version stamps, and what it means when they differ.",
      keywords: [
        "version",
        "verified as of",
        "computed under",
        "did my numbers change",
        "recompute",
        "params",
      ],
      blocks: [
        {
          kind: "para",
          text: "A saved prescription stays the same each time you open the day. The app recalculates it when the effort ramp, load step, your profile, or a program setting changes.",
        },
        {
          kind: "para",
          text: "The details sheet shows the version that created the decision and the latest version that checked it. If a newer version checked the prescription without changing it, the sheet says so.",
        },
        {
          kind: "para",
          text: [
            { strong: "Rechecking only changes future work." },
            " Logged sets remain exactly as you recorded them.",
          ],
        },
        {
          kind: "para",
          text: "If someone manually edits the row after the decision was saved, the sheet marks the mismatch. The saved details explain the original decision; the row shows the current prescription.",
        },
      ],
      related: [
        "ug/exercises-and-templates#the-load-step",
        "ug/training-a-session#adjusting-as-you-go",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "who-writes-the-numbers",
      title: "Who writes the numbers",
      summary:
        "The program authors every figure; anything written in words sits on top of them.",
      keywords: [
        "ai",
        "coach line",
        "who wrote this",
        "is this generated",
        "explanation",
        "trust",
      ],
      blocks: [
        {
          kind: "para",
          text: "The program computes every weight, rep count, set count, and effort target. The ask and explanation describe the saved decision and can be checked against the details screen.",
        },
        {
          kind: "para",
          text: [
            "Under the reasoning, ruled off beneath a ",
            { ui: "COACH" },
            " label, you may sometimes find an extra line of coaching. It is written rather than assembled, and the label is there so it is never mistaken for a program fact.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "The reasoning is the complete answer",
          text: "The ask and explanation are complete without a coaching line. When present, coaching adds advice but never changes the prescription.",
        },
        {
          kind: "para",
          text: [
            "That division is what makes the whole thing auditable. Every figure traces back through the decision to a set you logged, which is the same chain ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "your next weight",
            },
            " is chosen along.",
          ],
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#leading-by-one-step",
        "ug/prescription-details#the-strip",
      ],
    },
  ],
};
