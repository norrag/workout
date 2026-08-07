// User Guide — chapter 1, "What WORKOUT is" (doc 22 §5).
//
// The reader's first screen. It owes **orientation and nothing else**: what the
// app does, where things live, and what the screen you land on shows you.
//
// Owner review round 3 rewrote it on exactly that point, and doc 22 §8.4b rule
// 1 is the generalization — a chapter's depth is set by its place in the
// reading order. Two things were cut rather than shortened:
//   - **the Workout tab's session-resume pointer.** Real (`sessionStorage.
//     lastWorkoutId`, `BottomNav.tsx:33–40`, gated to the active meso by
//     `DayView.tsx:281`) but secondary, and it led a section that had not yet
//     told the reader what the Workout page even shows. There is no expiry in
//     the code; the pointer simply dies with the tab session, which is why a
//     relaunched PWA lands on the current workout. **Ch. 5 owns it** (Phase 3c).
//   - **the whole version-history section.** Not a primary function, and 22c
//     §B5.1a/§B6a already assign the history page and the What's New sheet to
//     **ch. 19** (Phase 3h). Ch. 1 keeps one clause in the tab table.
//
// GROUND TRUTH (22b §7 ch. 1 — README, doc 01, `BottomNav.tsx`, 22c Part A):
//   - the tab list and its order are `BottomNav.tsx:11–17`
//   - `/workout` has three states, resolved in order (`workout/page.tsx`)
//   - the day screen's four zones are 22c §B1.2, read against `DayView.tsx`
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_WHAT_WORKOUT_IS: ManualChapter = {
  manual: "ug",
  slug: "what-workout-is",
  number: 1,
  title: "What WORKOUT is",
  summary:
    "The idea behind the app, the five tabs it is built from, and the screen you land on when you open it.",
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
              "Your profile, this guide, the theme, the AI connector, body scans, your account and data, and the version you are running.",
            ],
          ],
        },
      ],
      related: [
        "ug/what-workout-is#the-workout-page",
        "ug/what-workout-is#the-idea",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-workout-page",
      title: "The Workout page",
      summary:
        "Where you land, what it shows you, and what you do on it — the screen you will spend most of your time on.",
      keywords: [
        "home screen",
        "workout page",
        "today",
        "logging",
        "start here",
        "next workout",
        "no cycles",
      ],
      blocks: [
        {
          kind: "para",
          text: "The Workout page shows the workout you are due to do next. Open the app and it is already in front of you — this is the screen you will spend most of your time on.",
        },
        { kind: "heading", text: "What is on it" },
        {
          kind: "list",
          items: [
            [
              "Where you are in the block, at the top: ",
              {
                to: "ug/cycle-model#the-four-layers",
                text: "week and day",
              },
              ", the date, and the effort to aim for this week.",
            ],
            "A thin bar under that, filling as you log — the session at a glance.",
            "Then the day's exercises in order, each with a line saying what the program is asking of it and why.",
            [
              "Under each exercise, one row per set: the weight, the reps, and a box for ",
              {
                to: "ug/effort-rir#what-rir-means",
                text: "how hard it was",
              },
              ".",
            ],
          ],
        },
        { kind: "heading", text: "What you do on it" },
        {
          kind: "para",
          text: [
            "Work down the sets, logging each one as you finish it. Weight and reps are editable, so if you did something other than what was asked, put in what you did. When the last set is in, ",
            { ui: "COMPLETE WORKOUT" },
            " at the foot closes the session and asks three quick questions about how it went — how tired you are, how hard it felt, and how you performed.",
          ],
        },
        { kind: "heading", text: "When nothing is due" },
        {
          kind: "list",
          items: [
            [
              { strong: "Everything this week is logged" },
              " — you get your last finished block's summary and a link to its full stats. Next week appears once the week closes.",
            ],
            [
              { strong: "You have no blocks yet" },
              " — you get ",
              { ui: "SET UP CYCLES" },
              ", which is where to start.",
            ],
          ],
        },
      ],
      related: [
        "ug/what-workout-is#the-five-tabs",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
  ],
};
