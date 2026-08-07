// User Guide — chapter 1, "What WORKOUT is" (doc 22 §5).
//
// The reader's first screen, so it owes orientation rather than mechanism:
// what the app does, where everything lives, where a tap lands, and how to see
// what changed. Every mechanism it touches hands off to the chapter that owns
// it.
//
// GROUND TRUTH (22b §7 ch. 1 — README, doc 01, `BottomNav.tsx`, 22c Part A):
//   - the tab list and its order are `BottomNav.tsx:11–17`
//   - the Workout tab resolves to the last day viewed this session
//     (`sessionStorage.lastWorkoutId`), NOT to "today" — 22c Part A calls this
//     out as a behavior ch. 1 must state
//   - `/workout` has three states, resolved in order (`workout/page.tsx`)
//   - the More footer is the version, from the release registry, and it is a
//     link to `/more/whats-new` (doc 23 §8; 22c §B5.1)
//   - the What's New sheet's suppression rules are `lib/version/suppression.ts`
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_WHAT_WORKOUT_IS: ManualChapter = {
  manual: "ug",
  slug: "what-workout-is",
  number: 1,
  title: "What WORKOUT is",
  summary:
    "The idea behind the app, the five tabs it is built from, and where a tap lands when you open it.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-idea",
      title: "The idea",
      summary:
        "Training runs in planned blocks, and each session's numbers come from the sets you have already logged.",
      keywords: [
        "what is this app",
        "overview",
        "how it works",
        "premise",
        "getting started",
        "program",
      ],
      blocks: [
        {
          kind: "para",
          text: "WORKOUT is a training log with a program attached. You decide the shape of your training — the days, the exercises, how long a block runs. The app decides what to ask of you inside that shape, and it decides it from the sets you have already logged.",
        },
        { kind: "heading", text: "The two halves" },
        {
          kind: "list",
          items: [
            [
              { strong: "The plan you build" },
              " — training is organized into blocks of a few weeks, usually stepping closer to failure as the block goes on. That structure is the ",
              { to: "ug/cycle-model#the-four-layers", text: "cycle model" },
              ".",
            ],
            [
              { strong: "The program that fills it" },
              " — for every exercise on every day, a weight, a rep target and a set count, worked out from your recent sets, the week's effort target, and the feedback you gave last time.",
            ],
          ],
        },
        { kind: "heading", text: "Why this way" },
        {
          kind: "para",
          text: "A written program asks the same thing of a week you slept four hours as of a week you were fresh, and keeps asking it until you edit the spreadsheet. Deriving each week from what you actually lifted is what lets the ask follow you.",
        },
        {
          kind: "para",
          text: [
            "The cost of that is one small honesty: the app can see the weight and the reps, but ",
            {
              to: "ug/effort-rir#why-honesty-matters",
              text: "how hard the set was",
            },
            " is the one thing only you know — which is why every set row has a box for it. Most of the app's other numbers are built on what you put there.",
          ],
        },
      ],
      related: [
        "ug/cycle-model#the-four-layers",
        "ug/what-workout-is#the-five-tabs",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-five-tabs",
      title: "The five tabs",
      summary:
        "What lives on Workout, Cycles, Templates, Exercises and More, in bar order.",
      keywords: [
        "navigation",
        "tab bar",
        "menu",
        "where is",
        "cycles tab",
        "more tab",
        "find",
      ],
      blocks: [
        {
          kind: "para",
          text: "The bar along the bottom is the whole navigation. The tab you are on carries a filled square and heavier ink.",
        },
        {
          kind: "table",
          columns: ["Tab", "What lives there"],
          rows: [
            [
              [{ ui: "Workout" }],
              "The session in front of you — the day you are training, and the screen you log sets on.",
            ],
            [
              [{ ui: "Cycles" }],
              "Your blocks: what is running, what is planned, what is finished. Planning and stats both start here.",
            ],
            [
              [{ ui: "Templates" }],
              "Saved splits you can start a new block from, yours and the stock ones.",
            ],
            [
              [{ ui: "Exercises" }],
              "The movement library, plus each exercise's own history and records.",
            ],
            [
              [{ ui: "More" }],
              "Your profile, this guide, the theme, the AI connector, body scans, and your account and data.",
            ],
          ],
        },
        {
          kind: "para",
          text: "Every list and detail screen paints its own frame the moment you tap, before the data arrives, so a tap never leaves you looking at the screen you just left.",
        },
      ],
      related: [
        "ug/what-workout-is#the-workout-tab",
        "ug/what-workout-is#the-idea",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-workout-tab",
      title: "Where the Workout tab lands",
      summary:
        "The tab is the session, not a menu into it — and it returns you to the day you were last looking at.",
      keywords: [
        "home screen",
        "today",
        "opens on",
        "wrong day",
        "resting",
        "no cycles",
        "start here",
      ],
      blocks: [
        {
          kind: "para",
          text: "The Workout tab does not lead to a session. It is the session: the day you are training renders on the tab itself, with nothing to open first.",
        },
        { kind: "heading", text: "It resumes, rather than resetting" },
        {
          kind: "para",
          text: [
            "Tapping ",
            { ui: "Workout" },
            " takes you to the last day you had open in this visit, which is usually not the same thing as today. Look back at Tuesday's session and the tab keeps you there until you move — close the app and open it again, and it goes back to the current day.",
          ],
        },
        {
          kind: "para",
          text: [
            "To move deliberately, tap the ",
            { ui: "workout" },
            " logotype at the top of the day screen. That opens the week and day navigator, where every week of the block and every day inside it is one tap away.",
          ],
        },
        { kind: "heading", text: "When there is no session" },
        {
          kind: "list",
          items: [
            [
              { strong: "Every day this week is logged" },
              " — the tab shows your last finished block's summary and a link to its full stats. Next week's targets appear once the week closes.",
            ],
            [
              { strong: "You have no blocks yet" },
              " — the tab explains the cycle model in a line and offers ",
              { ui: "SET UP CYCLES" },
              ".",
            ],
          ],
        },
      ],
      related: [
        "ug/what-workout-is#the-five-tabs",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-changed",
      title: "Seeing what changed",
      summary:
        "The app is versioned, and every release is written down where you can read it.",
      keywords: [
        "version",
        "release notes",
        "update",
        "new features",
        "what's new",
        "changelog",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The foot of the ",
            { ui: "More" },
            " tab carries the version you are running, and it is a link — ",
            { ui: "WORKOUT … — WHAT'S NEW ›" },
            ". It opens the full history, newest first, with the version you are on marked.",
          ],
        },
        { kind: "heading", text: "The sheet that appears once" },
        {
          kind: "para",
          text: "When a release adds something you would notice, a sheet describes it the next time you open the app. Dismissing it is the end of it — that release is marked as seen and never appears again. Releases you were away for arrive together in one sheet rather than one after another.",
        },
        {
          kind: "para",
          text: "It waits for a sensible moment. It stays away from the logging screen entirely, it does not appear once you have logged a set into the session on screen, and it holds off while a set is still saving. Smaller fixes ship quietly and are written down in the history rather than announced.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "The history page is the durable copy. Anything the sheet told you is still there to re-read, along with every release before it.",
        },
      ],
      related: [
        "ug/what-workout-is#the-five-tabs",
        "ug/what-workout-is#the-idea",
      ],
    },
  ],
};
