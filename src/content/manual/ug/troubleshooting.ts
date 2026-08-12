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
            "Each week's load is recalculated from recent sessions. A lighter or shorter session can lower ",
            {
              to: "ug/how-your-weight-is-chosen#the-anchor",
              text: "the strength anchor",
            },
            ", which lowers the next prescription.",
          ],
        },
        { kind: "heading", text: "Why is it not adding weight every week?" },
        {
          kind: "para",
          text: [
            "The app increases reps before weight. It raises the weight after every set reaches the top of the rep range. A week at the same weight can still be harder when it adds a rep or lowers the target RIR. ",
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
          text: "Logged sets update the strength anchor immediately. A heavy exercise early in the session can therefore change a later prescription that uses the same anchor. Sets already logged remain unchanged.",
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
        {
          kind: "heading",
          text: "My strength estimate fell after a good session",
        },
        {
          kind: "para",
          text: [
            "Check the reported effort first. At the same weight and reps, a set with two reps in reserve produces a higher estimate than a set taken to failure. Next, confirm that you are comparing the same statistic. Your ",
            {
              to: "ug/reading-your-stats#reading-like-with-like",
              text: "stats show each estimate as recorded",
            },
            "; the strength anchor behind your next prescription gives less weight to older sessions.",
          ],
        },
        {
          kind: "heading",
          text: "My best set was 115 for 11 and it shows 110",
        },
        {
          kind: "para",
          text: "A lifetime best is your highest single-set estimate. Your next weight uses a recency-weighted average from one recent session. That anchor will usually be lower than your best-ever set.",
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
            "Sets are counted by muscle. The primary muscle receives one set and each supporting muscle receives half. Six compound sets therefore count as three for an assisting muscle. ",
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
            "Within the current block, an added set becomes the starting count for later weeks. Your ",
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
            "Deload sets count toward volume and can set weight or volume records. They are excluded from the strength trend. ",
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
            "The Cycles tab places completed standalone blocks under a toggle that shows their count. Finished blocks inside an active macrocycle remain visible with that macrocycle.",
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
            "The set is saved on your phone and queued for upload. The app retries in the background while you continue the session. If the upload is slow, tap ",
            { ui: "TRY AGAIN" },
            ". ",
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
          text: "Pages need a network connection to load current prescriptions and stats. If the connection drops, the app shows a retry control. Sets already logged remain on your phone and upload when the connection returns.",
        },
        { kind: "heading", text: "Something else went wrong" },
        {
          kind: "para",
          text: "A connection message means the action did not reach the server; retry it. Other refusals include the rule that blocked the action, often because it would change logged history.",
        },
      ],
      related: [
        "ug/your-data#live-reads-and-queued-logging",
        "ug/training-a-session#logging-a-set",
      ],
    },
  ],
};
