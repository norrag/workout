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
          text: "Open the reasoning under any exercise in a session and you get a short ledger, ruled off down its left edge. It has a fixed shape, and reading it in order answers most of what people want to know about a prescription.",
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
          text: "The ask reads instantly, because it comes from the row itself. The reasoning takes a moment longer, since the decision behind it is fetched — you may see a line saying it is being read, and if the connection drops you get a line you can tap to try again rather than a blank space.",
        },
        {
          kind: "para",
          text: [
            "Every number in either line is the program's. The lines are written from the recorded decision rather than composed freely, which is why the wording repeats between exercises — a held weight always reads the same way, so a run of them reads as ",
            { strong: "one system" },
            " rather than as several opinions.",
          ],
        },
      ],
      related: [
        "ug/prescription-details#opening-the-details",
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
          text: "The ask line is underlined because it is a door. Tapping it opens Prescription details — the whole record behind that one exercise's numbers, in four parts. Most people never need it; it is there for the session where a number looks wrong and you want to see the working.",
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
              text: "The strength figures behind the load: what this prescription implies you can do, what it was aiming at, and the measured figure it was built from — named down to the set and the date it came from.",
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
            "That third part is the one worth knowing about. The ",
            { strong: "measured" },
            " figure names the actual set behind it — a weight, its reps and the day you lifted it — so a prescription that looks surprising can always be traced to a session you can go and check.",
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
      summary:
        "Two version stamps, and what it means when they differ.",
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
          text: "A prescription is worked out once and then kept, so the same numbers greet you every time you open the day. What keeps it honest is that the app re-checks it whenever something it depends on moves — a change to the block's effort ramp, to an exercise's weight jump, to your profile, or to the program's own settings.",
        },
        {
          kind: "para",
          text: "The details sheet shows both halves of that as version stamps: the version the decision was worked out under, and the version it has since been checked against. Where the second is ahead of the first, the sheet says plainly that it was re-checked and the numbers did not move — which is a stronger statement than silence.",
        },
        {
          kind: "para",
          text: [
            { strong: "Rechecking only ever touches what has yet to happen." },
            " Sets you have logged are a record and stay exactly as you left them, whatever changes afterwards.",
          ],
        },
        {
          kind: "para",
          text: "One case is called out rather than smoothed over: if the numbers on the row are no longer the numbers the recorded decision produced — because they were typed in directly — the sheet says so, and tells you that the record below describes the decision rather than what is on screen.",
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
          text: "One rule covers the whole strip: the program computes every weight, rep count, set count and effort target, and the words around them only ever describe what it computed. The ask and the reasoning are assembled from the recorded decision, which is why they can be checked against the details sheet line by line.",
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
          text: "A coaching line is additive by design: it appears where there is something worth adding and stays away otherwise, and the lines above it are a full explanation on their own. So a prescription that carries one and a prescription that does not are equally well explained — and either way, no line of prose has ever changed a number.",
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
