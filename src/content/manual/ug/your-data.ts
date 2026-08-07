// User Guide — chapter 19, "Your data" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 19 — `more/account/page.tsx`,
// `more/export/route.ts` + `queries/export.ts`, `more/delete-account/**`,
// `src/lib/logging/queue.ts` (N68), `app/~offline/page.tsx`, doc 03's RLS
// strategy, hard rule 9, and doc 23's version surfaces):
//   - export is a flat CSV, one row per LOGGED SET with its context. Columns,
//     in order: performed_at · mesocycle · week · is_deload · target_rir · day ·
//     exercise · set_number · set_type · is_warmup · weight · reps ·
//     rir_reported · notes. RLS-scoped to the caller; no service role
//   - deletion: type `DELETE` to arm, then `DELETE MY ACCOUNT`. Every
//     user-owned table FK-cascades from `auth.users`, so removing the auth user
//     removes everything in one step; identity is server-derived, never an
//     argument (hard rule 4). The page names what goes and points at the export
//     first, in that order
//   - hard rule 9 as the reader meets it: reads are online-only (nothing beyond
//     immutable build assets is runtime-cached), so a navigation with no
//     connection gets `/~offline` — whose own copy is the honest framing:
//     "Prescriptions and logging are always live, so nothing is shown from a
//     stale copy." Set-logging WRITES go through the durable client queue
//     (N68), which is the reversal of the original no-outbox call
//   - `Match weight across sets` lives here under `LOGGING`, and ch. 5 already
//     documents what it does (`C-log-06`) — this chapter says where it lives
//   - doc 23: the More footer reads `WORKOUT {version} — WHAT'S NEW ›` from the
//     release registry and links to `/more/whats-new`; the What's New sheet is
//     once-only, accumulates skipped feature releases, and never appears over a
//     workout you are training (`workouts.status = in_progress`) or while the
//     logging queue still has pending writes
//
// NOT CLAIMED: the shape of the isolation mechanism (row-level security,
// policies, the service-role rule) — §8.5's "the reader's words, not the
// build's" makes that a statement about how it is built. The reader-facing
// claim is that the data is theirs and scoped to their account, which is what
// §1 states.
//
// SEAMS: ch. 5 owns logging and what the queue feels like mid-session; ch. 1
// owns the tabs; ch. 18 owns the connector's access and revocation. Claims:
// `C-data-01` onward.

import type { ManualChapter } from "../types";

export const UG_YOUR_DATA: ManualChapter = {
  manual: "ug",
  slug: "your-data",
  number: 19,
  title: "Your data",
  summary:
    "What the app stores, how to take a copy of it, how to delete all of it, and what it means that reads are live while your logging is queued.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-is-stored",
      title: "What is stored",
      summary:
        "Your training record, the plans around it, and the profile the program works from.",
      keywords: [
        "what data",
        "privacy",
        "my data",
        "stored",
        "account",
        "who can see",
      ],
      blocks: [
        {
          kind: "para",
          text: "Everything the app holds about you comes from something you entered. There is no tracking layer underneath it and no second copy of your training kept for other purposes.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Your training record" },
              " — every set, with its weight, reps, effort and any note you attached, and the feedback you gave after each exercise and session.",
            ],
            [
              { strong: "The plans around it" },
              " — macrocycles, blocks, the exercises in each day, your templates and your own custom movements.",
            ],
            [
              { strong: "Your profile" },
              " — the fields the program works from, your bodyweight measurements, and any scans you have imported.",
            ],
          ],
        },
        {
          kind: "para",
          text: "All of it is scoped to your account. Every read the app makes is filtered to the signed-in person by the database itself rather than by the screen asking, which is the layer that matters: a bug in a screen cannot reach past it.",
        },
        {
          kind: "para",
          text: [
            "The account screen is at ",
            { ui: "More" },
            " → ",
            { ui: "Account & data" },
            ". It carries one logging preference — ",
            {
              to: "ug/training-a-session#logging-a-set",
              text: "matching a weight across an exercise's sets",
            },
            " — and the two things this chapter is about: taking a copy, and deleting the lot.",
          ],
        },
      ],
      related: [
        "ug/your-data#taking-a-copy",
        "ug/your-data#deleting-your-account",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "taking-a-copy",
      title: "Taking a copy",
      summary:
        "One CSV file, one row per set, with enough context around each to be readable on its own.",
      keywords: [
        "export",
        "csv",
        "download",
        "backup",
        "spreadsheet",
        "my sets",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "Export training data" },
            " gives you your whole logged history as a single spreadsheet file. One row per set, oldest first, and each row carries the context it needs — so a row makes sense without the rest of the file around it.",
          ],
        },
        {
          kind: "table",
          columns: ["Each row carries", "Which is"],
          rows: [
            ["When", "the date and time you logged it"],
            [
              "Where in the plan",
              "the block, the week, whether that week was a deload, the week's effort target, and the day",
            ],
            ["What you did", "the exercise, the set number, the weight, the reps, and the effort you reported"],
            ["Anything you added", "whether it was a warm-up, the kind of set, and your note"],
          ],
        },
        {
          kind: "para",
          text: "It is a plain spreadsheet file, so anything that opens a spreadsheet will read it. What it holds is what you logged; the estimates and trends the app builds on top are worked out from these same rows, so a copy of them is a copy of everything downstream.",
        },
      ],
      related: [
        "ug/your-data#deleting-your-account",
        "ug/reading-your-stats#where-to-look",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "deleting-your-account",
      title: "Deleting your account",
      summary:
        "One action removes the account and everything in it, and it asks you to type the word first.",
      keywords: [
        "delete account",
        "remove my data",
        "close account",
        "permanent",
        "erase",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "More" },
            " → ",
            { ui: "Account & data" },
            " → ",
            { ui: "Delete account" },
            " removes your account and every piece of training data attached to it: macrocycles, blocks, logged workouts, your own exercises, notes and feedback. It is permanent, and the app says so before it asks for anything.",
          ],
        },
        {
          kind: "para",
          text: [
            "The screen points you at the export first, and that ordering is deliberate — ",
            {
              to: "ug/your-data#taking-a-copy",
              text: "take the copy",
            },
            " while there is still something to copy. Then the confirmation: the button stays inert until you type ",
            { ui: "DELETE" },
            " into the field above it.",
          ],
        },
        {
          kind: "para",
          text: "Deletion runs in one step, from the account outward, so there is no partial state left behind and no window where some of it is gone and some of it is not.",
        },
      ],
      related: [
        "ug/your-data#taking-a-copy",
        "ug/your-data#live-reads-and-queued-logging",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "live-reads-and-queued-logging",
      title: "Live reads, queued logging",
      summary:
        "What you read is always current; what you log is held on the phone and sent as soon as it can be.",
      keywords: [
        "offline",
        "no connection",
        "gym signal",
        "did my set save",
        "queue",
        "sync",
      ],
      blocks: [
        {
          kind: "para",
          text: "The app treats reading and writing differently, and the difference is worth knowing before you meet it in a basement gym with one bar of signal.",
        },
        {
          kind: "para",
          text: [
            { strong: "Reading is live." },
            " Prescriptions are worked out from your most recent sessions, so a page opens against the current state or it tells you it cannot. With no connection you get a short screen saying so, with a button to retry — rather than yesterday's numbers presented as today's.",
          ],
        },
        {
          kind: "para",
          text: [
            { strong: "Logging is queued." },
            " Tapping a set records it on your phone and moves you straight on to the next one; sending it to the server happens in the background, retrying on its own until it lands. A dead spot mid-exercise costs you nothing and interrupts nothing.",
          ],
        },
        {
          kind: "para",
          text: [
            "The session shows you when it is still catching up, and finishing a workout waits for the queue to drain — ",
            {
              to: "ug/training-a-session#finishing-the-session",
              text: "the completion step",
            },
            " tells you it is saving the last sets rather than closing over work that has yet to arrive.",
          ],
        },
      ],
      related: [
        "ug/training-a-session#logging-a-set",
        "ug/your-data#seeing-what-changed",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "seeing-what-changed",
      title: "Seeing what changed",
      summary:
        "The app tells you once when something new ships, and keeps the whole history for whenever you want it.",
      keywords: [
        "whats new",
        "version",
        "release notes",
        "updates",
        "changelog",
        "what changed",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The foot of the More tab carries the version you are running and a link to ",
            { ui: "what's new" },
            " — every release, newest first, with the ones that added something written out in full and the smaller fixes collapsed to a line you can open.",
          ],
        },
        {
          kind: "para",
          text: "When a release adds something, a sheet tells you once, the next time you open the app. Dismissing it is what marks it as read, so closing the app mid-sheet brings it back rather than losing it. Come back after three such releases and you get one sheet covering all three.",
        },
        {
          kind: "para",
          text: [
            "It stays out of your way while you train: it never appears over a workout you have started logging, and it waits until the last of your sets has been sent. The history page carries the same words for whenever you want to read them, so the sheet can afford to appear exactly once.",
          ],
        },
      ],
      related: [
        "ug/what-workout-is#the-five-tabs",
        "ug/your-data#live-reads-and-queued-logging",
      ],
    },
  ],
};
