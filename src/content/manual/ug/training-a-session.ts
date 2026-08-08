// User Guide — chapter 5, "Training a session" (doc 22 §5).
//
// The app's densest screen, and the one a reader is standing in front of with a
// bar in their hands. Every control below was read off `DayView.tsx` rather
// than off doc 09 — Batch 32 moved two things on this screen the day before the
// manual plan was written (N75, N77).
//
// GROUND TRUTH (22b §7 ch. 5 — `/log/[workoutId]` code, doc 09, doc 21,
// N75/N77):
//   - the ask line IS the way into Prescription details; there is no
//     `Engine audit` row in the exercise menu any more (N75, 22c §B1.2)
//   - set logging is QUEUED (N68, hard rule 9): the tap enqueues and the row
//     advances in the same frame. Unlog and delete stay foreground, because
//     they address a server id
//   - per-set RIR capture is doc 21 §2 — the box is pre-filled with the ask and
//     an untouched box reports exactly that (ch. 6 owns the meaning)
//   - the progress bar's denominator EXCLUDES skipped slots, and a queued set
//     counts as logged (`day-rules.ts::daySetTotals`)
//   - the feedback prompt fires only on the first and group-closing exercises
//     (`DayView.tsx::handleLogged`)
//   - claims are registered in `docs/22a-manual-claims.md`
//
// SEAMS (doc 22 §8.4b rule 1 — depth follows reading order):
//   - ch. 6 owns what RIR means and what a set that misses the ask does to the
//     next prescription; this chapter says where the box is and what it starts
//     at, and links
//   - ch. 4 owns changing the plan (swaps, adds, reorders and their
//     propagation); this chapter owns the session's own controls — a set
//     skipped, a set added, weights reset
//   - ch. 11 owns *why* the feedback works the way it does; §6 and §7 here each
//     state what every answer moves, in one line, and link into it. Owner
//     review round 5 (doc 22 §8.4d rule 1): a reader lands on either chapter,
//     so the point of entry owes the working answer and the owning chapter owes
//     the depth
//   - §5 (notes) exists because notes are legible to the connector (owner,
//     round 5): a note is context for coaching, never an engine input
//   - ch. 17 owns the prescription strip's three layers and the details sheet;
//     §1 names the strip and hands off

import type { ManualChapter } from "../types";

export const UG_TRAINING_A_SESSION: ManualChapter = {
  manual: "ug",
  slug: "training-a-session",
  number: 5,
  title: "Training a session",
  summary:
    "The day screen end to end: reading the header, logging a set, adjusting on the fly, and closing the session out.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "the-day-screen",
      title: "The day screen",
      summary:
        "What the screen tells you before you touch anything — where you are, how far in, and what today asks for.",
      keywords: [
        "day view",
        "workout screen",
        "header",
        "progress bar",
        "target rir",
        "week day",
        "what am i doing today",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The ",
            { ui: "Workout" },
            " tab is the session itself. The top of the screen is the ledger line for the whole day: the coordinate ",
            { ui: "W3·D2" },
            " in the largest type on the screen, the date beside it, and under that the week's effort ask — ",
            { ui: "TARGET 2 RIR" },
            ", or ",
            { ui: "DELOAD WEEK" },
            " on a deload.",
          ],
        },
        {
          kind: "para",
          text: "The hairline below the coordinate is the day's progress, filling as you log. Sets you skip leave the count entirely, so a day you deliberately cut short still reads as finished rather than as abandoned.",
        },
        { kind: "heading", text: "Below the header" },
        {
          kind: "para",
          text: [
            "One card per exercise, in the order you will train them, each headed by its place in the day and the muscle group it is there for — ",
            { ui: "03 — BACK" },
            ". Beside that heading is the ",
            { ui: "…" },
            " menu; below it the movement's name, its equipment, and a row per planned set. Everything else about the exercise is behind those two.",
          ],
        },
        {
          kind: "para",
          text: [
            "The movement's name carries a chevron. Tapping it opens the ",
            { strong: "prescription strip" },
            " — the program explaining itself, in what it is asking for and the reasons behind it. The strip's first line is underlined, and tapping that opens the full working behind the number.",
          ],
        },
        { kind: "heading", text: "Coming back to it" },
        {
          kind: "para",
          text: "The tab returns you to the day you were last looking at rather than resetting to today, so stepping out to check something and coming back lands where you were. Close the app and it goes back to the current day.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "Opening the app is also when the program re-checks the days you have not started yet and re-does any prescription whose inputs have moved since it was worked out. Sets you have already logged are never touched.",
        },
      ],
      related: [
        "ug/training-a-session#logging-a-set",
        "ug/training-a-session#moving-between-days",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "moving-between-days",
      title: "Moving between days",
      summary:
        "The navigator behind the logotype opens the whole block — every week, every day, and which of them are done.",
      keywords: [
        "navigator",
        "week selector",
        "day chips",
        "previous workout",
        "go back a day",
        "next day",
        "planned day",
        "deload week",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The ",
            { ui: "workout" },
            " logotype at the top left carries a chevron. Tapping it drops open the block: a strip of weeks — ",
            { ui: "W1" },
            " through the last, with the deload shown as ",
            { ui: "DL" },
            " — and under the selected week, a chip per training day.",
          ],
        },
        {
          kind: "list",
          items: [
            [
              "A finished day carries a ",
              { ui: "✓" },
              ".",
            ],
            "An orange dot marks the day the block is actually up to, on both the week strip and the day chips, so you can always find your way back to it.",
            "The day you are reading is filled in solid.",
          ],
        },
        {
          kind: "para",
          text: "Tap any chip to open that day. The panel stays open as you move around, so stepping back through last week's sessions is one chip at a time rather than a trip out through the menus.",
        },
        { kind: "heading", text: "Days that have not been built yet" },
        {
          kind: "para",
          text: "A day in a week the program has not reached opens as a plan — the exercises and how many sets each is down for, without weights. Weights are chosen from your own recent sets, so they are worked out when the week comes round rather than written months ahead.",
        },
        {
          kind: "para",
          text: [
            "A day you have already completed opens as the record of it: the values you logged, as text, and every control reading ",
            { ui: "Session locked" },
            ".",
          ],
        },
      ],
      related: [
        "ug/training-a-session#the-day-screen",
        "ug/cycle-model#the-four-layers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "logging-a-set",
      title: "Logging a set",
      summary:
        "Four columns, one tap, and a write that never makes you wait for a signal.",
      keywords: [
        "log a set",
        "check the box",
        "weight",
        "reps",
        "rir box",
        "edit a logged set",
        "no signal",
        "offline",
        "didn't save",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A set row is four columns — ",
            { ui: "LB" },
            ", ",
            { ui: "REPS" },
            ", ",
            { ui: "RIR" },
            " and ",
            { ui: "LOG" },
            ". The first three arrive filled in with what the program is asking for; the box in ",
            { ui: "LOG" },
            " records the set and moves the active row down one.",
          ],
        },
        {
          kind: "para",
          text: [
            "Type over any of them first if the set went differently. Weight and reps take what you actually did, and the ",
            { ui: "RIR" },
            " box takes ",
            { to: "ug/effort-rir#report-what-you-did", text: "your report of how close to failure it was" },
            ".",
          ],
        },
        { kind: "heading", text: "Changing the weight" },
        {
          kind: "para",
          text: [
            "Edit a set's weight before you log it and its rep number re-estimates to what that weight is worth at the week's ask, so the row stays a coherent ask rather than half the program's and half yours. The weight sticks to that set; turn on ",
            { ui: "Match weight across sets" },
            " under ",
            { ui: "More" },
            " → ",
            { ui: "Account & data" },
            " and it carries onto the rest of the exercise's unlogged sets as well.",
          ],
        },
        { kind: "heading", text: "After a set is logged" },
        {
          kind: "para",
          text: "Correcting a logged row is the same three fields — the change saves as you leave the box. Tapping a ticked box again takes the set back off the record.",
        },
        {
          kind: "callout",
          tone: "note",
          label: "A TAP NEVER WAITS FOR THE NETWORK",
          text: [
            "Logging is recorded on the phone first and sent when it can be, so a dead spot in the gym cannot strand you mid-exercise. A quiet strip appears only when there is something to say — sets waiting for a connection, or one that ran out of retries, with ",
            { ui: "TRY AGAIN" },
            " beside it.",
          ],
        },
      ],
      related: [
        "ug/effort-rir#report-what-you-did",
        "ug/effort-rir#missing-the-ask",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "adjusting-as-you-go",
      title: "Adjusting as you go",
      summary:
        "Sets added, sets skipped, weights put back — the session bends without the plan being rewritten.",
      keywords: [
        "add a set",
        "skip a set",
        "delete set",
        "skip remaining",
        "reset to prescription",
        "note",
        "pinned note",
        "cut it short",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Two menus cover the session. The ",
            { ui: "⋮" },
            " on a set row acts on that set; the ",
            { ui: "…" },
            " above the exercise name acts on the exercise.",
          ],
        },
        {
          kind: "table",
          columns: ["You want to", "Where"],
          rows: [
            [
              "do an extra set",
              [{ ui: "Add set" }, " on the exercise, or ", { ui: "Add set below" }, " on a row"],
            ],
            [
              "leave a set out",
              [{ ui: "Skip set" }, " — the row greys out and stops counting, and ", { ui: "Unskip set" }, " brings it back"],
            ],
            [
              "stop this exercise here",
              [{ ui: "Skip remaining sets" }, ", which skips every set you have not logged"],
            ],
            [
              "undo your weight edits",
              [{ ui: "Reset to prescription" }, ", which puts the program's numbers back on the sets you have not logged"],
            ],
          ],
        },
        {
          kind: "para",
          text: "Skipping is the honest way to cut something short: the sets stay on the record as planned and not done, and the day's progress reads against what you actually took on.",
        },
        {
          kind: "callout",
          tone: "note",
          text: [
            "Swapping a movement out, adding one, or moving it up the order is a change to the ",
            { to: "ug/planning-a-mesocycle#editing-a-running-block", text: "plan rather than to the session" },
            ", and those controls can carry the change into later weeks. Setting one exercise's own effort target is ",
            { to: "ug/effort-rir#per-exercise", text: "in the same menu" },
            ".",
          ],
        },
      ],
      related: [
        "ug/training-a-session#notes",
        "ug/planning-a-mesocycle#editing-a-running-block",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "notes",
      title: "Notes, and who reads them",
      summary:
        "A line to yourself next week, and to whoever helps you plan — the context your numbers cannot carry.",
      keywords: [
        "note",
        "pinned note",
        "session note",
        "add note",
        "remember",
        "form cue",
        "seat setting",
        "ai",
        "coach",
        "context",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "Notes" },
            " in the exercise's ",
            { ui: "…" },
            " menu writes either kind. Left as it is, a note is ",
            { ui: "Saved with just this session" },
            " and stays with that day in the exercise's history. Tick ",
            { ui: "Pin to this exercise" },
            " and it becomes a standing line at the top of the card in every workout — a cue about form, a seat setting, a bar you cannot use.",
          ],
        },
        { kind: "heading", text: "Two readers" },
        {
          kind: "para",
          text: [
            { strong: "Both kinds are legible to a connected AI, alongside your numbers." },
            " Weights and set counts are worked out from the sets you log; a note is the context around them — an elbow that has been grumbling for three sessions, a machine that never sits right, a grip that finally made the movement click.",
          ],
        },
        {
          kind: "para",
          text: "That is the difference between an assistant planning your next block from your numbers alone and one that also knows which movements you have been getting on with. Ask it to work around a niggle, or for something that would suit you better, and your own notes are what it reasons from.",
        },
        {
          kind: "callout",
          tone: "note",
          text: "Write it in the moment you notice it. A pinned note is the right home for anything that will be true again next week; a session note is for how today went.",
        },
      ],
      related: [
        "ug/exercises-and-templates#what-an-exercise-remembers",
        "ug/training-a-session#how-it-went",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "how-it-went",
      title: "The questions after an exercise",
      summary:
        "Two short prompts per muscle group — one about recovery from last time, one about the work you have just done.",
      keywords: [
        "feedback",
        "soreness",
        "days sore",
        "joint pain",
        "pump",
        "workload",
        "recovery check",
        "why is it asking me this",
      ],
      blocks: [
        {
          kind: "para",
          text: "Finish the last set of an exercise and a short sheet may slide up. It appears twice per muscle group at most, and each time it asks about something different.",
        },
        {
          kind: "steps",
          steps: [
            {
              label: "First exercise for a muscle",
              text: [
                { ui: "RECOVERY CHECK" },
                " — how sore that muscle was after the ",
                { strong: "last" },
                " time you trained it, and how many days it stayed that way.",
              ],
            },
            {
              label: "Last exercise for a muscle",
              text: [
                "Joint pain during the work — ",
                { ui: "None" },
                " to ",
                { ui: "High" },
                ", and which movement caused it when there is a choice — then the pump you got and how the whole session's volume for that muscle felt.",
              ],
            },
          ],
        },
        {
          kind: "para",
          text: [
            "Everything in between is left alone. The sheet's subtitle says where the answers land — ",
            { ui: "FEEDS W4 TARGETS" },
            " — and this is what each one moves:",
          ],
        },
        {
          kind: "table",
          columns: ["Your answer", "What it moves"],
          rows: [
            [
              "Joint pain",
              "acts on its own: it stops a set being added and holds the weight, and at its worst takes a set away",
            ],
            [
              "Workload",
              "the main dial — too much takes a set off next week, too easy can add one",
            ],
            [
              "Pump",
              "backs up an easy session, so a set is added only when the two agree",
            ],
            [
              "Soreness",
              "kept with the session as part of your record",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "All of it lands on that muscle, on this day of next week. ",
            { to: "ug/how-it-felt#what-your-answers-do", text: "Chapter 11 has the reasoning in full" },
            " — why workload leads, and why pump only ever corroborates.",
          ],
        },
        { kind: "heading", text: "Answering it later, or changing it" },
        {
          kind: "para",
          text: [
            "The exercise ",
            { ui: "…" },
            " menu carries ",
            { ui: "Add feedback" },
            " — and ",
            { ui: "Edit feedback" },
            " once there is something to change. Dismiss it mid-session and everything stays as it was, so you can come back to it while you rack the weights.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Answer it as you found it",
          text: "These are your impressions, and they are treated as such — a nudge to next week's set count rather than a measurement of anything. A rating that flatters a session buys you work you will then have to recover from.",
        },
      ],
      related: [
        "ug/training-a-session#finishing-the-session",
        "ug/effort-rir#report-what-you-did",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "finishing-the-session",
      title: "Finishing the session",
      summary:
        "Three questions about the day as a whole, and what to do when you have to stop early.",
      keywords: [
        "complete workout",
        "finish",
        "end workout",
        "end mesocycle",
        "session notes",
        "next workout",
        "fatigue",
        "locked",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Once every set is logged or skipped, ",
            { ui: "COMPLETE WORKOUT" },
            " appears at the foot of the day. If a set is still on its way to the server the button holds as ",
            { ui: "SAVING THE LAST SETS…" },
            " for the moment it takes, so a session can never be closed against its own outstanding writes.",
          ],
        },
        {
          kind: "para",
          text: "The sheet that opens counts up what you did — exercises completed, sets logged out of sets planned, and how many you skipped — and then asks three things about the day as a whole.",
        },
        {
          kind: "table",
          columns: ["Question", "Ends"],
          rows: [
            [[{ ui: "Overall fatigue" }], [{ ui: "FRESH" }, " ↔ ", { ui: "WIPED OUT" }]],
            [[{ ui: "Effort" }], [{ ui: "EASY" }, " ↔ ", { ui: "ALL OUT" }]],
            [[{ ui: "Performance" }], [{ ui: "OFF DAY" }, " ↔ ", { ui: "STRONG" }]],
          ],
        },
        {
          kind: "para",
          text: [
            "Between them those three decide one thing: whether next week's weight goes up on this day. It takes a day you were wiped out on ",
            { strong: "and" },
            " performed badly in to hold it — a hard day you were strong in climbs as usual. ",
            { to: "ug/how-it-felt#the-session-questions", text: "Chapter 11 has the exact reading" },
            ".",
          ],
        },
        {
          kind: "para",
          text: [
            "A free-text box under them is saved with the session, and is read back by you and by a connected AI later. ",
            { ui: "NEXT WORKOUT →" },
            " files the lot and moves you on while the program works next week out from what you logged.",
          ],
        },
        { kind: "heading", text: "Stopping early" },
        {
          kind: "para",
          text: [
            "The header ",
            { ui: "⋮" },
            " carries ",
            { ui: "End workout" },
            ": it skips whatever is left and completes the day now, keeping everything already logged. ",
            { ui: "End mesocycle" },
            " does the same for every remaining day of the block and closes it. Both ask first, and both are final.",
          ],
        },
        {
          kind: "para",
          text: "A completed session becomes a record — its rows read as plain values and its controls say so. What you logged stands as you logged it.",
        },
      ],
      related: [
        "ug/training-a-session#how-it-went",
        "ug/cycle-model#one-block-at-a-time",
      ],
    },
  ],
};
