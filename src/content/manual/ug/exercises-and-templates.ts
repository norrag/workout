// User Guide — chapter 15, "Exercises & templates" (doc 22 §5).
//
// The library half of the app: what a movement is, what it remembers, and the
// two ways a plan gets reused (a template, or a share code).
//
// GROUND TRUTH (22b §7 ch. 15 — `/exercises`, `/templates`, doc 09, N67):
//   - the library filter is two axes, MUSCLE × EQUIP, ANDed, over a
//     search-narrowed set; the equipment axis is drawn from what the search
//     left (`ExercisesBrowser.tsx:38–71`)
//   - **N67, and it is the load step's whole subtlety:** steps index off the
//     last weight ENTERED, not off round numbers — the sheet's own copy says
//     88 lb with a 10 lb step goes to 98 or 78. `load_step` was added to
//     `glossary.ts` in this PR (22c §C2, ch. 15's row)
//   - a step change re-stamps this exercise's planned prescriptions on next
//     view and never touches logged history (`LoadStepSheet.tsx:26–37`,
//     doc 14 phase 3)
//   - the three bodyweight load meanings are verbatim from `NewExerciseForm`'s
//     `LOAD_HINTS` (R12) — the entered weight means something different in each
//   - delete is refused, with the reason, on stock exercises, on anything with
//     a logged set, and on anything a plan still references
//     (`exercises/actions.ts:100–117`)
//   - **N46 is open: a custom template has no edit path.** §8.4 forbids
//     documenting that as an absence, so the chapter states the positive rule —
//     adjust the block, then save it as a template (ledger `D-10`)
//   - a share code is one open code per object, one redemption, and it hands
//     over a snapshot taken when it was minted (`queries/sharing.ts:171–243`)
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_EXERCISES_AND_TEMPLATES: ManualChapter = {
  manual: "ug",
  slug: "exercises-and-templates",
  number: 15,
  title: "Exercises & templates",
  summary:
    "The movement library, what each exercise remembers, the weight jump you can set per lift, and reusing a split.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "finding-an-exercise",
      title: "Finding an exercise",
      summary:
        "Search plus two filters — the muscle it trains and the equipment it needs — narrowing the same list.",
      keywords: [
        "exercise library",
        "search exercises",
        "filter",
        "equipment",
        "muscle",
        "find a movement",
        "custom badge",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The ",
            { ui: "Exercises" },
            " tab is every movement available to you — the stock library plus anything you have made or been sent. The same list is what the planner and the day screen pick from, so anything you find here can go into a plan.",
          ],
        },
        { kind: "heading", text: "Narrowing it" },
        {
          kind: "para",
          text: [
            "Type to search by name, then narrow further with the two filter rows: ",
            { ui: "MUSCLE" },
            " and ",
            { ui: "EQUIP" },
            ". They combine — pick ",
            { ui: "back" },
            " and ",
            { ui: "cable" },
            " and you get the movements that are both. The equipment row only ever offers what is actually left in the list you are looking at, so a filter can never leave you with nothing.",
          ],
        },
        {
          kind: "para",
          text: [
            "Each row carries its primary muscle, its equipment, the date you last did it, and a ",
            { ui: "CUSTOM" },
            " mark if it is one of yours. Tapping it opens the exercise's own page.",
          ],
        },
      ],
      related: [
        "ug/exercises-and-templates#what-an-exercise-remembers",
        "ug/exercises-and-templates#your-own-exercises",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-an-exercise-remembers",
      title: "What an exercise remembers",
      summary:
        "Every set you have ever logged on a movement, as records on one tab and session history on the other.",
      estimate: true,
      keywords: [
        "exercise page",
        "history",
        "personal best",
        "pr",
        "last performed",
        "times trained",
        "session notes",
        "pinned note",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "An exercise page has two tabs. ",
            { ui: "OVERVIEW" },
            " is the summary — when you last did it, your best single set by weight, your best estimated one-rep max, your biggest set and biggest session by total weight moved, how many times you have trained it and since when. ",
            { ui: "HISTORY" },
            " is the receipts.",
          ],
        },
        { kind: "heading", text: "The history tab" },
        {
          kind: "para",
          text: [
            "Sessions are listed newest first and grouped under the block they belong to, each showing the sets as you logged them. Tapping the right-hand column flips it between the weight you lifted and what that session implies about your strength; ",
            { ui: "LOAD OLDER" },
            " reaches further back.",
          ],
        },
        {
          kind: "para",
          text: [
            "Two marks appear on session rows. ",
            { ui: "DELOAD" },
            " means the session fell in a deload week, and ",
            { ui: "BACKED OFF" },
            " means you had ",
            {
              to: "ug/effort-rir#per-exercise",
              text: "set this exercise to run easier",
            },
            " than the week asked. Both are there so a light week reads as a light week rather than as a decline.",
          ],
        },
        { kind: "heading", text: "Notes" },
        {
          kind: "para",
          text: "A note you write during a session stays with that session in the history. A note you pin to the exercise itself sits at the top of the page on every visit — the right place for a setup detail like a seat height or a grip width you keep having to rediscover.",
        },
      ],
      related: [
        "ug/exercises-and-templates#the-load-step",
        "ug/effort-rir#per-exercise",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-load-step",
      title: "The weight jump for one lift",
      summary:
        "How big a step the program takes on an exercise, and how to change it when the equipment disagrees.",
      keywords: [
        "load step",
        "increment",
        "weight jump",
        "plate math",
        "too big a jump",
        "2.5 lb",
        "microplates",
        "use default",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Reached from the exercise page's ",
            { ui: "⋮" },
            " menu → ",
            { ui: "Load step" },
            ", this is the one number about an exercise you are likely to want to change.",
          ],
        },
        { kind: "term", term: "load_step" },
        { kind: "heading", text: "When to change it" },
        {
          kind: "para",
          text: "The default follows the equipment, and mostly it is right. Set your own when the real thing behaves differently: a machine whose stack moves in fifteens, a lift where the smallest plates you own make a smaller step possible, or a movement where the standard jump is simply too much to hold form on.",
        },
        {
          kind: "para",
          text: [
            "Pick one of the offered jumps, or ",
            { ui: "CUSTOM" },
            " for anything else. ",
            { ui: "USE DEFAULT" },
            " hands the exercise back to its equipment's own step.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Changing it updates what the program asks of you from the next time you look at the exercise onward. Every set you have already logged stays exactly as you logged it.",
        },
      ],
      related: [
        "ug/exercises-and-templates#your-own-exercises",
        "ug/exercises-and-templates#what-an-exercise-remembers",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "your-own-exercises",
      title: "Making your own exercise",
      summary:
        "Name it, say what it trains and what it needs, and tell the app what an entered weight means on it.",
      keywords: [
        "custom exercise",
        "add exercise",
        "new movement",
        "bodyweight",
        "assisted",
        "weighted pull-up",
        "secondary muscle",
        "delete exercise",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "+ NEW" },
            " on the Exercises tab → ",
            { ui: "Blank exercise" },
            ". You give it a name, its equipment, the muscle it mainly trains, and up to four it also works — that split is what decides how it counts toward each muscle's weekly volume.",
          ],
        },
        { kind: "heading", text: "Bodyweight movements" },
        {
          kind: "para",
          text: "Three of the equipment choices change what a number in the weight box means, so pick the one that matches how you actually load the movement.",
        },
        {
          kind: "table",
          columns: ["Equipment", "What the entered weight means"],
          rows: [
            [
              [{ ui: "bodyweight only" }],
              "The load is your bodyweight — push-up, air squat.",
            ],
            [
              [{ ui: "bodyweight loadable" }],
              "Entered weight is ADDED to bodyweight — weighted pull-up.",
            ],
            [
              [{ ui: "machine assistance" }],
              "Entered weight is assistance REMOVED — assisted dip.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Description and notes are optional; notes are yours alone. A custom exercise is private to you until you hand out a ",
            {
              to: "ug/exercises-and-templates#sharing-by-code",
              text: "share code",
            },
            " for it.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "DELETING ONE",
          text: "An exercise you have logged sets on stays — logged history is never destroyed, and deleting the movement would take the sets with it. One a plan still uses stays too, until you take it out of the plan. In both cases the app says which of the two it is.",
        },
      ],
      related: [
        "ug/exercises-and-templates#the-load-step",
        "ug/your-profile#equipment-and-exclusions",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "templates",
      title: "Templates",
      summary:
        "Saved splits — stock ones to start from, and your own, saved out of a block you have already shaped.",
      keywords: [
        "template",
        "split",
        "push pull legs",
        "upper lower",
        "full body",
        "save as template",
        "start a meso from this",
        "reuse",
      ],
      blocks: [
        {
          kind: "para",
          text: "A template is a week's structure with no history attached: days, muscle groups, exercises and a starting set count. It is the fastest way into a new block when you already know the shape you want.",
        },
        { kind: "heading", text: "Finding one" },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "Templates" },
            " tab filters by days per week and by split, with a third row for templates written with a particular trainee in mind. Yours carry a ",
            { ui: "YOURS" },
            " mark. Opening one shows every day and exercise before you commit to it.",
          ],
        },
        {
          kind: "para",
          text: [
            { ui: "START A MESO FROM THIS" },
            " opens the planner board prefilled, where it becomes an ordinary draft you can change freely. Anything on your exclusion list is left out on the way in.",
          ],
        },
        { kind: "heading", text: "Saving your own" },
        {
          kind: "para",
          text: [
            "A template is saved out of a plan rather than typed up separately. Get a block onto the board the way you want it — new or adjusted — and ",
            { ui: "SAVE AS TEMPLATE" },
            " keeps that structure for next time. Adjust and save again to make a new one.",
          ],
        },
      ],
      related: [
        "ug/planning-a-mesocycle#starting-a-block",
        "ug/exercises-and-templates#sharing-by-code",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "sharing-by-code",
      title: "Sharing by code",
      summary:
        "An eight-character code hands someone their own copy of an exercise, a template or a block.",
      keywords: [
        "share",
        "share code",
        "send a program",
        "redeem",
        "add from a code",
        "give someone my split",
        "coach",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Exercises, templates and mesocycles you own each carry ",
            { ui: "SHARE — GET CODE" },
            ", which mints eight characters you can read out or send. The alphabet leaves out the characters people mistype, because these get typed on a phone in a gym.",
          ],
        },
        { kind: "heading", text: "What the other person gets" },
        {
          kind: "para",
          text: [
            { strong: "Their own copy, not a link to yours." },
            " They can change it however they like and nothing reaches back to you; your later edits do not reach them either. A code is good for one redemption, so once someone has used it, sharing the same thing again gives you a fresh code for the next person.",
          ],
        },
        {
          kind: "para",
          text: "What travels is the structure, never your training. A shared block arrives as a plan for them to run, with its weights chosen from their own history when they start it — and it is captured the moment you hand the code over, so if you edit the block and share it again before anyone has used the code, the capture is brought up to date.",
        },
        { kind: "heading", text: "Entering one" },
        {
          kind: "para",
          text: [
            "Codes are entered from the ",
            { ui: "+ NEW" },
            " tray on the Exercises or Templates tab, or from ",
            { ui: "Create new" },
            " on Cycles — under ",
            { ui: "OR ADD FROM A CODE" },
            ". Any code works from any of them; whatever it turns out to be lands in the right place.",
          ],
        },
      ],
      related: [
        "ug/exercises-and-templates#templates",
        "ug/exercises-and-templates#your-own-exercises",
      ],
    },
  ],
};
