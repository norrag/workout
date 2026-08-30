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
          text: "The app stores the training, plans, profile, and body data you enter. It does not collect a separate background activity record.",
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
          text: "The database restricts every read to the signed-in account. This protection applies before a page receives the data.",
        },
        {
          kind: "para",
          text: [
            "The account screen is at ",
            { ui: "More" },
            " → ",
            { ui: "Account & data" },
            ". It includes the logging preference for ",
            {
              to: "ug/training-a-session#logging-a-set",
              text: "matching a weight across an exercise's sets",
            },
            ", plus controls to export your data or delete your account.",
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
            " downloads one spreadsheet row for every logged set, oldest first. Each row includes its date, place in the plan, exercise, weight, reps, effort, set type, and note.",
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
            [
              "What you did",
              "the exercise, the set number, the weight, the reps, and the effort you reported",
            ],
            [
              "Anything you added",
              "whether it was a warm-up, the kind of set, and your note",
            ],
          ],
        },
        {
          kind: "para",
          text: "The export is a CSV file that spreadsheet apps can open. It contains the logged sets used to calculate the app's stats and trends.",
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
            " permanently removes your account, macrocycles, blocks, logged workouts, custom exercises, notes, and feedback.",
          ],
        },
        {
          kind: "para",
          text: [
            "Use ",
            {
              to: "ug/your-data#taking-a-copy",
              text: "the export",
            },
            " before deletion if you want to keep a copy. To confirm deletion, type ",
            { ui: "DELETE" },
            " into the field; this enables the button.",
          ],
        },
        {
          kind: "para",
          text: "Deletion removes the account and its attached data in one operation.",
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
            " Pages use the latest data from the server. Without a connection, the app shows a retry screen instead of displaying an older prescription as current.",
          ],
        },
        {
          kind: "para",
          text: [
            { strong: "Logging is queued." },
            " Tapping a set records it on your phone immediately. The app sends it to the server in the background and retries until it succeeds, so you can continue logging through a weak connection.",
          ],
        },
        {
          kind: "para",
          text: [
            "The session shows when sets are still waiting to upload. When you finish, ",
            {
              to: "ug/training-a-session#finishing-the-session",
              text: "the completion step",
            },
            " waits until the remaining sets reach the server.",
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
            "The bottom of the More tab shows the installed version and links to ",
            { ui: "what's new" },
            ". The page lists every release newest first. Feature releases include full notes; fix releases appear as expandable one-line entries.",
          ],
        },
        {
          kind: "para",
          text: "After a feature release, a sheet appears the next time you open the app. Dismissing the sheet marks it as read. If you miss several releases, one sheet includes all of them. A note sometimes carries a short recording of the feature it describes.",
        },
        {
          kind: "para",
          text: [
            "The sheet waits until you are outside an active workout and all sets have uploaded. The release history keeps the same notes for later.",
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
