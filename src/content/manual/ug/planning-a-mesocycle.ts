// User Guide — chapter 4, "Planning a mesocycle" (doc 22 §5).
//
// The planner board is the single meso planning surface (doc 09), and N78
// reworked it a day before the manual plan was written — so every control in
// this chapter was read off `PlannerBoard.tsx` rather than off any spec.
//
// GROUND TRUTH (22b §7 ch. 4 — `/cycles/plan` code, doc 09, N78):
//   - **three ways to start, not four.** `cycles/plan/page.tsx` renders the
//     `Meso builder` row with `href: null` and no `scratch` flag, so it paints
//     disabled with " (soon)". 22c §B2.6 tabulates four paths from the copy
//     without noting the state. §8.4 forbids documenting an absence, so the
//     chapter carries the three that work and stays quiet about the fourth
//     (ledger `D-09`)
//   - every path lands on the same board as a DRAFT (`actions.ts:193–237`),
//     and `createDraftMeso` clears any other draft — one at a time
//   - the board is groups-first: day → muscle-group block → exercise slots,
//     drawn in `planner-structure.svg`
//   - N78: the four per-exercise controls live in one sheet; its RIR is the
//     block-wide `target_rir`, and a slot carrying per-week values reads
//     `RIR BY WEEK` (`fillRirLabel`, `PlannerBoard.tsx:196`)
//   - a draft edits live; a planned/active block stages and commits on
//     SAVE CHANGES (`PlannerBoard.tsx:238–241`), and a completed/abandoned one
//     redirects away from the board (`plan/page.tsx:57–60`)
//   - **the create sheet's deload line is stale** — it hardcodes "4 RIR" while
//     the live `deload.target_rir` is 8 (ledger `D-08`). The chapter states the
//     truth without quoting that line
//   - claims are registered in `docs/22a-manual-claims.md`
//
// OWNER REVIEW ROUND 4 (2026-08-11) — three notes, generalized as doc 22 §8.4c:
//   - §1 gained the **connector** as a planning route. The owner's point is that
//     it is the best one, not a footnote, so it gets a heading and two
//     paragraphs. It names the route and hands off; ch. 18 and the AI Manual
//     own how to use it, and the typed cross-link is owed once they exist
//     (`create_mesocycle` lands `planned`; `activate_mesocycle` is
//     confirm-gated and told to prefer in-app activation — `C-plan-01a`)
//   - §4 now **renders `volume_landmarks`** instead of deferring MEV/MRV to
//     ch. 12. A definition belongs where the reader meets the term; ch. 12
//     keeps the depth. It left `PENDING_GLOSSARY_TERMS` here
//   - §6 gained the **day view** as the other editing surface. Ch. 4 had
//     documented the board as though it were the only way to change a running
//     block (`C-plan-21`/`22`): swaps and adds carry
//     `Repeat this change on this day in future weeks`, and a reorder
//     propagates with no checkbox at all

import type { ManualChapter } from "../types";

export const UG_PLANNING_A_MESOCYCLE: ManualChapter = {
  manual: "ug",
  slug: "planning-a-mesocycle",
  number: 4,
  title: "Planning a mesocycle",
  summary:
    "Where a block comes from, how the planner board is built, and what happens when you start it.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "starting-a-block",
      title: "Where a block comes from",
      summary:
        "Three routes into the planner board — copy, template, or blank — and a fourth where you plan it in conversation.",
      keywords: [
        "new mesocycle",
        "new block",
        "plan a meso",
        "copy",
        "template",
        "from scratch",
        "draft",
        "how do i start",
        "connector",
        "claude",
        "chatgpt",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "From the ",
            { ui: "Cycles" },
            " tab, ",
            { ui: "Create new" },
            " → ",
            { ui: "Standalone mesocycle" },
            " opens ",
            { ui: "plan a meso" },
            ". Three routes in, one destination: whichever you pick, you land on the planner board with a draft in front of you.",
          ],
        },
        {
          kind: "table",
          columns: ["Route", "What you get"],
          rows: [
            [
              [{ ui: "Copy a mesocycle" }],
              "The days, groups and exercises of a block you have already run, plus its length and effort plan. Weights are not carried over — they are worked out fresh from your best recent sets when the block starts.",
            ],
            [
              [{ ui: "Start with a template" }],
              "A saved split, yours or a stock one, with the board opening prefilled. Anything you have excluded is left out.",
            ],
            [
              [{ ui: "From scratch" }],
              "An empty board. You add the days, the muscle groups and the exercises, and name it at the end.",
            ],
          ],
        },
        { kind: "heading", text: "One draft at a time" },
        {
          kind: "para",
          text: [
            "A plan you start and leave is kept as a draft, and there is one of them. It shows at the top of the page as ",
            { ui: "DRAFT IN PROGRESS" },
            " with ",
            { ui: "CONTINUE EDITING ›" },
            " — and the page says plainly that starting a new plan below replaces it.",
          ],
        },
        { kind: "heading", text: "Or plan it in conversation" },
        {
          kind: "para",
          text: [
            { strong: "The fourth route is usually the best one." },
            " Connect the app to an AI assistant — Claude or ChatGPT — and planning becomes a conversation: you say what you want the block to do, it reads your actual training history, and it drafts one. Ask for a fourth day, more pressing volume, an exercise swapped for one your gym actually has, and it redraws.",
          ],
        },
        {
          kind: "para",
          text: "What arrives is a planned block, sitting in Cycles like any other, which you open on the board and start yourself. Nothing goes live without you.",
        },
        {
          kind: "callout",
          tone: "note",
          text: [
            "Set it up from ",
            { ui: "More" },
            " → ",
            { ui: "AI connector" },
            ", which carries its own manual — what it can do, and how to ask for it.",
          ],
        },
      ],
      related: [
        "ug/planning-a-mesocycle#the-planner-board",
        "ug/cycle-model#finding-your-cycles",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-planner-board",
      title: "The planner board",
      summary:
        "Days across the top, muscle groups down the page, and one row per exercise slot inside each group.",
      keywords: [
        "planner",
        "board",
        "add day",
        "muscle group",
        "add exercise",
        "slots",
        "split",
        "reorder",
        "weekday",
      ],
      blocks: [
        {
          kind: "para",
          text: "The board is one week of training. That week repeats for the length of the block, so what you build here is the shape every week takes.",
        },
        {
          kind: "figure",
          src: "/manual/planner-structure.svg",
          alt: "A tree: a day labelled DAY 2 — PULL branches into two muscle-group blocks. BACK carries two exercise slots, filled with Barbell Row and Lat Pulldown at three sets each. BICEPS carries one slot, drawn with a dashed border and reading pick exercise, OPEN SLOT.",
          width: 460,
          height: 176,
          caption:
            "Muscle groups come first, exercises second. A dashed row is a slot you have made but not yet filled.",
        },
        { kind: "heading", text: "Building a day" },
        {
          kind: "steps",
          steps: [
            {
              label: "Add the day",
              text: [
                "The tab strip across the top is your training days; ",
                { ui: "+" },
                " at its end adds another. Give it a weekday and a label like ",
                { ui: "Lower A" },
                " so it is recognisable.",
              ],
            },
            {
              label: "Add muscle groups",
              text: [
                { ui: "+ ADD MUSCLE GROUP" },
                " picks what the day trains, and for each one you set how many exercises it gets. That creates the empty slots.",
              ],
            },
            {
              label: "Fill the slots",
              text: "Each empty slot opens the exercise picker. Filled rows can be reordered anywhere in the day with the arrows — including across groups, so a compound can lead and the isolation work follow.",
            },
          ],
        },
        {
          kind: "para",
          text: [
            "Everything about a day other than its exercises lives behind ",
            { ui: "EDIT DAY" },
            ": its weekday, its label, the order of its muscle groups, how many exercises each gets, and removing the day.",
          ],
        },
      ],
      related: [
        "ug/planning-a-mesocycle#the-exercise-sheet",
        "ug/planning-a-mesocycle#the-volume-check",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-exercise-sheet",
      title: "The exercise sheet",
      summary:
        "One tap on an exercise row opens everything you can set on it — how many sets it starts at, how hard it runs, a swap, or removal.",
      keywords: [
        "starting sets",
        "how many sets",
        "target rir",
        "swap exercise",
        "replace",
        "remove exercise",
        "rir by week",
        "exercise sheet",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "An exercise row reads as a line of plan — the name, the muscle group, the equipment, and its ",
            { num: "3 SETS / RIR 4" },
            " summary. Tap it and the four things you can do to it are in one sheet.",
          ],
        },
        { kind: "heading", text: "Starting sets" },
        {
          kind: "para",
          text: [
            { strong: "Week 1 only." },
            " You set where the exercise begins; from week 2 the set count is the program's, moved up or down by the feedback you give after each session. A number you set here is a starting point, not a standing instruction.",
          ],
        },
        { kind: "heading", text: "Target RIR" },
        {
          kind: "para",
          text: [
            "Left alone, the exercise follows the week's effort target, and the sheet shows that plan on the right so an assignment always reads as a departure from something. ",
            { ui: "+ SET A TARGET RIR" },
            " pins this one exercise to a value for the whole block instead, and the weight is repriced to meet it — easier means lighter, harder means heavier. ",
            { ui: "FOLLOW THE RAMP" },
            " hands it back.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: [
            "The board has no week axis — it is one week's shape, repeated — so a target set here covers every week. If you have already set targets week by week from the day screen, the row says ",
            { ui: "RIR BY WEEK" },
            " rather than flattening them, and the sheet tells you what setting a value would replace.",
          ],
        },
        {
          kind: "para",
          text: [
            { ui: "Replace exercise" },
            " swaps the movement and keeps the slot; ",
            { ui: "Remove from day" },
            " takes the slot out.",
          ],
        },
      ],
      related: [
        "ug/effort-rir#per-exercise",
        "ug/planning-a-mesocycle#the-planner-board",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "the-volume-check",
      title: "Checking the week before you run it",
      summary:
        "The board totals each muscle's weekly sets as you edit, and says whether that lands in a useful range.",
      keywords: [
        "weekly sets per muscle",
        "volume preview",
        "under mev",
        "over mrv",
        "too much volume",
        "not enough sets",
        "balance",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "WEEKLY SETS PER MUSCLE" },
            " sits under the day board and re-totals with every edit you make. It is the plan checking itself before a single set is logged against it.",
          ],
        },
        { kind: "heading", text: "The range each count is judged against" },
        { kind: "term", term: "volume_landmarks" },
        {
          kind: "para",
          text: [
            "Inside the band the line stays quiet. Outside it the line goes bold and names the end you are past — ",
            { ui: "UNDER MEV" },
            " or ",
            { ui: "OVER MRV" },
            ". Treat either as worth a second look rather than an alarm: the band is scaled to your training experience, and the block adjusts your set counts week by week from your feedback regardless.",
          ],
        },
        { kind: "heading", text: "Why a count lands on a half" },
        {
          kind: "para",
          text: "An exercise gives a full set to the muscle it mainly trains and a half set to each muscle it also works, so a row of pressing shows up partly under shoulders and triceps. The preview counts sets exactly the way your stats will count them afterwards, which is what makes the plan and the result comparable.",
        },
      ],
      related: [
        "ug/planning-a-mesocycle#the-planner-board",
        "ug/planning-a-mesocycle#naming-and-starting",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "naming-and-starting",
      title: "Naming it, and starting it",
      summary:
        "The create sheet sets the name, the length and the block's effort plan; starting it builds week 1.",
      keywords: [
        "create mesocycle",
        "how many weeks",
        "start mesocycle",
        "generating w1",
        "deload week",
        "start rir",
        "end rir",
        "cant start",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "With at least one exercise on the board, ",
            { ui: "CREATE MESOCYCLE" },
            " opens the last stage: a name, and the block's length in weeks. Everything else already has a sensible answer.",
          ],
        },
        {
          kind: "para",
          text: [
            "Under the length is one quiet line summarising the block's effort plan, with ",
            { ui: "EDIT" },
            " beside it. Open that and you can move the start and end of the ",
            { term: "rir_ramp", text: "RIR ramp" },
            ", set each week independently instead, or turn the final deload week off. The deload week's own effort target is the program's to set, not yours.",
          ],
        },
        { kind: "heading", text: "Starting it" },
        {
          kind: "para",
          text: [
            "Creating the block leaves it planned, not running. ",
            { ui: "START MESOCYCLE" },
            " on the block's own page is what makes it live: it lays out every week's effort target, builds week 1's workouts, chooses each exercise's opening weight from your best recent sets, and drops you on the Workout tab ready to train.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Inside a macrocycle the blocks run in order, one at a time. If an earlier block in the same macrocycle is unfinished, the start button says so up front rather than failing on the tap — finishing that block first is what lets this one open from your latest results.",
        },
      ],
      related: [
        "ug/effort-rir#the-weeks-ramp",
        "ug/planning-a-mesocycle#editing-a-running-block",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "editing-a-running-block",
      title: "Changing a block that is already running",
      summary:
        "The board reopens mid-block, edits are staged until you save, and everything you have logged is left alone.",
      keywords: [
        "edit plan",
        "change exercise mid block",
        "add a day later",
        "save changes",
        "logged history",
        "finished",
        "too late to change",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "A plan is not fixed once the block starts. ",
            { ui: "Edit plan" },
            " in the block's ",
            { ui: "⋮" },
            " menu reopens the same board on a block that is planned or in progress, so a movement that is aggravating something, or a day that needs another exercise, can be dealt with in week 2 rather than endured to week 6.",
          ],
        },
        { kind: "heading", text: "Nothing is written until you save" },
        {
          kind: "para",
          text: [
            "Edits to a running block are held on screen. The bar at the foot reads ",
            { ui: "NO CHANGES" },
            " until you make one and ",
            { ui: "SAVE CHANGES" },
            " after, and ",
            { ui: "CANCEL" },
            " throws the lot away — with a confirmation first, so a stray back-tap cannot lose your work.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          label: "WHAT AN EDIT REACHES",
          text: "Completed and in-progress workouts keep every set you logged in them, exactly as logged. An edit reaches the days that have not been started yet — the rest of this week, and the weeks after it, which pick up the new plan as they are generated. The save confirmation says so before you commit.",
        },
        { kind: "heading", text: "Or change it from the session itself" },
        {
          kind: "para",
          text: [
            "The board is not the only way in. Standing in the gym, an exercise's ",
            { ui: "⋮" },
            " menu on the day screen moves it up or down the order, swaps it for another movement, or sets its ",
            { to: "ug/effort-rir#per-exercise", text: "effort target" },
            "; the workout's own menu adds an exercise. Both surfaces write to the same plan.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: [
            "Swapping or adding an exercise there offers ",
            { ui: "Repeat this change on this day in future weeks" },
            " — tick it and the same day in every later week that has not started yet gets the change too. Reordering carries forward on its own, without asking.",
          ],
        },
        {
          kind: "para",
          text: [
            "Once a block is finished the menu row reads ",
            { ui: "FINISHED" },
            " and the board stays shut. Its plan is part of the record of what you actually did, so it is kept as it ran.",
          ],
        },
      ],
      related: [
        "ug/planning-a-mesocycle#naming-and-starting",
        "ug/cycle-model#day-slots",
      ],
    },
  ],
};
