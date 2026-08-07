// User Guide — chapter 21, "Troubleshooting & FAQ" (doc 22 §5).
//
// **Mined, not invented** (O6). Every question here is one that was actually
// asked — `22c` Part D's F1–F18, drawn from the `S`-series in `docs/notes/`,
// workstream A's engine Q&A, and the review docs. `22b` §5.6 is the standing
// warning that came with them: **use that material for the questions and
// re-derive every answer from the code**, because its answers are a mid-2026
// snapshot.
//
// COVERAGE against `22c` Part D:
//   F1 · F2 · F7        → #the-weight-changed
//   F4 · F5 · F11       → #a-number-looks-wrong
//   F3 · F6 · F8 · F9   → #sets-and-counting
//   F12 · F13 · F14 · F15 · F16 → #where-did-that-go
//   F17                 → #it-did-not-save
//   F10 → ch. 13 (`#the-strength-trend`), linked rather than answered twice
//   F18 → RE-WRITTEN. It asked "why is the target only the low end of the
//         range?" — but `D-15` establishes that no app screen shows the band at
//         all, so the premise is only reachable through an assistant. Answered
//         in `#a-number-looks-wrong` as "where is my target", pointing at ch. 14
//
// TWO OPEN PRODUCT DECISIONS surface here (T-A7 in-session repricing, T-A8
// in-progress sets). `22c` Part E 4 is explicit: document CURRENT behavior and
// do not promise it is settled. Both are stated as what happens today.
//
// F11 IS THE ONE THAT MUST BE HERE (`22b` §4.3, `22c` Part D "must be in ch.
// 21"): the doc 21 §2 / N71 re-levelling ran in production on 2026-08-02 —
// 9 087 e1RM stamps moved, average +4.80 lb (+4.85%), strictly upward. A
// long-time user's historical numbers changed on that date, and nothing else in
// the manual would explain it.
//
// SEAMS: this chapter answers and links; it never re-derives a mechanism a
// chapter owns. Claims: `C-faq-01` onward.

import type { ManualChapter } from "../types";

export const UG_TROUBLESHOOTING: ManualChapter = {
  manual: "ug",
  slug: "troubleshooting",
  number: 21,
  title: "Troubleshooting & FAQ",
  summary:
    "The questions people actually ask — mostly about a number that looks wrong, and mostly with an answer that makes the number right.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-weight-changed",
      title: "The weight changed",
      summary:
        "Why a prescription moved down, why it sometimes holds for weeks, and why it can shift mid-session.",
      estimate: true,
      keywords: [
        "why did my weight go down",
        "same weight every week",
        "not adding weight",
        "changed mid workout",
        "lighter",
      ],
      blocks: [
        { kind: "heading", text: "Why did my weight go down?" },
        {
          kind: "para",
          text: [
            "Because each week's load is worked out afresh from your recent sessions rather than stepped along a fixed schedule. A lighter or shorter recent session moves ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "the figure it is priced off",
            },
            ", and the next ask follows. It is a re-read of where you are, not a penalty.",
          ],
        },
        { kind: "heading", text: "Why is it not adding weight every week?" },
        {
          kind: "para",
          text: [
            "By design — the reps move first. Inside a block you work up the rep range at a load you have shown you can handle, and the load steps once the range is topped out. Meanwhile the effort target is stepping down, so a week at the same weight for one more rep is a harder week than the last one. ",
            {
              to: "ug/how-your-weight-is-chosen#reps-first-then-weight",
              text: "Reps climb, then the weight steps",
            },
            " has the full turn of that cycle.",
          ],
        },
        { kind: "heading", text: "The prescription changed mid-workout" },
        {
          kind: "para",
          text: "That is current behavior and it follows from the same rule: sets you log feed the figure the app prices from, immediately. So logging a heavy first exercise can move what a later one asks for in the same session. The numbers you have already logged are untouched.",
        },
      ],
      related: [
        "ug/how-your-weight-is-chosen#the-anchor",
        "ug/how-your-weight-is-chosen#how-often-a-step-comes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "a-number-looks-wrong",
      title: "A number looks wrong",
      summary:
        "Estimates that fell after a good session, a record that reads low, and the day every historical figure moved.",
      estimate: true,
      keywords: [
        "e1rm lower",
        "pr is wrong",
        "numbers changed",
        "august",
        "estimate dropped",
        "where is my target",
      ],
      blocks: [
        { kind: "heading", text: "My strength estimate fell after a good session" },
        {
          kind: "para",
          text: [
            "Usually one of two things. An estimate folds in how much you had left: at the same weight and reps, a set you stopped with two in reserve implies more strength than one taken to failure — so a session you pushed harder can score lower. Or you are comparing two different numbers: your ",
            {
              to: "ug/reading-your-stats#reading-like-with-like",
              text: "stats show each estimate as recorded",
            },
            ", while the figure behind your next prescription fades older sessions as they age.",
          ],
        },
        { kind: "heading", text: "My best set was 115 for 11 and it shows 110" },
        {
          kind: "para",
          text: "The same distinction. A lifetime best is the best single estimate you have produced; the figure your next weight is priced off is a recency-weighted read of a whole recent session, and it deliberately sits behind your best day.",
        },
        { kind: "heading", text: "All my old numbers changed one day" },
        {
          kind: "para",
          text: [
            "On ",
            { num: "2" },
            " August 2026 every historical strength estimate was recalculated and moved ",
            { strong: "upward" },
            " — about ",
            { num: "5" },
            " lb on average. Sets logged without a reported effort had been read as taken to failure, which understated them; they are now read at the effort they were prescribed at. Nothing you logged changed; the estimate built from it did.",
          ],
        },
        { kind: "heading", text: "Where is my macrocycle target?" },
        {
          kind: "para",
          text: [
            "It is worked out and kept, and it paces your training rather than sitting on a screen. ",
            {
              to: "ug/macrocycle-goals#the-target-behind-it",
              text: "The target behind it",
            },
            " covers what it does and the two ways to read it.",
          ],
        },
      ],
      related: [
        "ug/reading-your-stats#reading-like-with-like",
        "ug/effort-rir#why-honesty-matters",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "sets-and-counting",
      title: "Sets and counting",
      summary:
        "Why a count reads lower than the sets you did, what an unfinished session contributes, and how added sets carry.",
      estimate: true,
      keywords: [
        "fewer sets",
        "half sets",
        "unfinished workout",
        "added a set",
        "deload in stats",
        "volume count",
      ],
      blocks: [
        { kind: "heading", text: "It says fewer sets than I did" },
        {
          kind: "para",
          text: [
            "Sets are counted per muscle rather than per exercise: a full set toward the muscle a movement works directly, half toward each one it helps. Six sets of a compound lift can read as three for a muscle it only assists. ",
            {
              to: "ug/volume#why-a-set-can-count-as-half",
              text: "Why a set can count as half",
            },
            " has the reasoning.",
          ],
        },
        { kind: "heading", text: "Do sets count before I finish the workout?" },
        {
          kind: "para",
          text: "Yes — immediately, as you log them. Volume, records and strength estimates all move mid-session. Next week's plan is the exception: that is worked out from sessions you have completed.",
        },
        { kind: "heading", text: "If I add a set, does it stick?" },
        {
          kind: "para",
          text: [
            "Within the block, yes — the extra set becomes the baseline the following weeks work from, which your ",
            {
              to: "ug/how-it-felt#what-your-answers-do",
              text: "feedback can then move again",
            },
            ". A new block starts from what you planned on its board rather than from where the last one finished.",
          ],
        },
        { kind: "heading", text: "How do deload weeks count?" },
        {
          kind: "para",
          text: [
            "They count as volume and can still set records, and they sit out the strength trend — a week meant to be light would otherwise read as a week you got weaker. ",
            {
              to: "ug/reading-your-stats#what-a-strength-read-leaves-out",
              text: "What a strength read leaves out",
            },
            " covers the other two exclusions.",
          ],
        },
      ],
      related: [
        "ug/volume#why-a-set-can-count-as-half",
        "ug/reading-your-stats#what-a-strength-read-leaves-out",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "where-did-that-go",
      title: "Where did that go?",
      summary:
        "Five things that moved, are hidden by default, or work differently from how they read.",
      keywords: [
        "engine audit",
        "completed cycles",
        "edit template",
        "which mesocycle",
        "edit a started block",
        "missing",
      ],
      blocks: [
        { kind: "heading", text: "Where is Engine audit?" },
        {
          kind: "para",
          text: [
            "It is called ",
            { ui: "Prescription details" },
            " now, and it moved out of the exercise menu onto the prescription itself — ",
            {
              to: "ug/prescription-details#opening-the-details",
              text: "tap the underlined ask line",
            },
            ".",
          ],
        },
        { kind: "heading", text: "Where are my completed cycles?" },
        {
          kind: "para",
          text: [
            "Tucked behind a toggle on the Cycles tab that carries their count, so a long history stays out of the way of what you are training now. A finished block inside a running macrocycle stays visible, because it is that macrocycle's record.",
          ],
        },
        { kind: "heading", text: "Which block am I in, if two are running?" },
        {
          kind: "para",
          text: [
            "The app follows the one holding your most recently logged set. More than one block ",
            {
              to: "ug/cycle-model#one-block-at-a-time",
              text: "can be live at once",
            },
            ", and that rule is what resolves it.",
          ],
        },
        { kind: "heading", text: "Can I change a block I have started?" },
        {
          kind: "para",
          text: [
            "Yes — the planner board ",
            {
              to: "ug/planning-a-mesocycle#editing-a-running-block",
              text: "opens on a running block",
            },
            ", and the day view's exercise menu edits the plan too. A finished block is frozen, because its plan is part of its record.",
          ],
        },
        { kind: "heading", text: "How do I change a saved template?" },
        {
          kind: "para",
          text: [
            "Templates are saved out of a plan, so you adjust the plan and ",
            {
              to: "ug/exercises-and-templates#templates",
              text: "save it again",
            },
            " — start a block from the template, change the board, save.",
          ],
        },
      ],
      related: [
        "ug/planning-a-mesocycle#editing-a-running-block",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "it-did-not-save",
      title: "It has not saved",
      summary:
        "A set stuck sending, and a screen that says there is no connection.",
      keywords: [
        "stuck",
        "saving",
        "not saved",
        "offline",
        "connection",
        "try again",
        "lost my sets",
      ],
      blocks: [
        { kind: "heading", text: "A set is stuck saving" },
        {
          kind: "para",
          text: [
            "It is on your phone and it is queued. Logging records the set locally and advances the session straight away; sending it happens in the background and retries on its own. Where one is taking a while you get a ",
            { ui: "TRY AGAIN" },
            " you can tap, and the session carries on either way. ",
            {
              to: "ug/your-data#live-reads-and-queued-logging",
              text: "Live reads, queued logging",
            },
            " explains the split.",
          ],
        },
        { kind: "heading", text: "A screen says there is no connection" },
        {
          kind: "para",
          text: "Reading is live, so a page you open needs the network. Rather than showing yesterday's prescriptions as though they were today's, the app says the connection has dropped and offers a retry. Anything you logged before it dropped is safe on the phone and will send when you are back.",
        },
        { kind: "heading", text: "Something else went wrong" },
        {
          kind: "para",
          text: "Messages that end with a note about your connection mean exactly that — the action did not reach the server, so try it again. Anything else the app refuses, it refuses with a reason, and the reason is usually a rule protecting logged history.",
        },
      ],
      related: [
        "ug/your-data#live-reads-and-queued-logging",
        "ug/training-a-session#logging-a-set",
      ],
    },
  ],
};
