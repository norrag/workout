// User Guide — chapter 2, "Your profile" (doc 22 §5).
//
// The brief is "the fields the engine actually uses, and *what each one
// changes*".
//
// **Owner review round 3 rewrote §1 and §2 of this chapter**, and the rules are
// doc 22 §8.4b. The first draft read 22c §B5.2's "extend, do not restate" as
// *quote the app's own line, then gloss it* — so `Drives starting volumes and
// how aggressively autoregulation ramps.` and `Calibrates the realistic
// muscle-gain target on your macrocycles.` were rendered as `ui` runs with the
// prose commenting on them. That is describing a description (§8.4b rule 3):
// the reader has already read that line on the screen, and what they want is
// the point behind it. Both quotes are gone; the sections state the point.
// §1 was also re-proportioned (rule 6) — it spent two paragraphs and a callout
// on bodyweight while barely answering its own title.
//
// GROUND TRUTH (22b §7 ch. 2 — `/more/profile` code, doc 17, `engine/macro.ts`):
//   - the field list and its copy are `more/profile/ProfileEditor.tsx`
//   - what each field reaches is `queries/plan-rate.ts::profileToMacroProfile`
//     → `engine/macro.ts` (sex factor, age taper, FFMI proximity, training-age
//     bucket) and `engine/volume.ts::muscleVolumeLandmark` (experience scale)
//   - every value stated is from the **active v25 row**, re-read 2026-08-08
//     (`get_engine_params(25)`); `bf_proxy_pct` is present on it, so the
//     BMI-band fallback described here is live
//   - 22b §4.3: the envelope loop makes pacing per-user, so no field may be
//     described as producing a fixed rate
//   - FINDING: `preferred_equipment` is stored and travels to the connector
//     (`mcp/tools/read.ts:128`) but no picker or engine path reads it, so the
//     chapter says what it *does* do (doc 22 §8.4). Logged in `22a`.
//   - claims are registered in `docs/22a-manual-claims.md`

import type { ManualChapter } from "../types";

export const UG_YOUR_PROFILE: ManualChapter = {
  manual: "ug",
  slug: "your-profile",
  number: 2,
  title: "Your profile",
  summary:
    "The handful of facts about you the program reads, and what each one changes about the numbers you are given.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "what-it-is-for",
      title: "What the profile is for",
      summary:
        "Six facts about you that the program reads, and the three jobs it reads them for.",
      keywords: [
        "profile",
        "settings",
        "personal details",
        "why does it ask",
        "what does it use",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Your profile lives under ",
            { ui: "More" },
            " → your name. It is short, and every field on it is read by the program rather than kept as a record. Three jobs between them:",
          ],
        },
        {
          kind: "list",
          items: [
            [
              { strong: "How much you should expect to gain" },
              " — sex, age, height, bodyweight and body fat set what a long-term goal can realistically plan for.",
            ],
            [
              { strong: "How much work to start you on" },
              " — your experience sets the weekly set counts a new block is built around.",
            ],
            [
              { strong: "What you get offered" },
              " — the equipment you have, and any movements you never want to see.",
            ],
          ],
        },
        {
          kind: "para",
          text: "None of it changes what a single set asks of you — that comes from your recent sets. It shapes the plan those sets sit inside.",
        },
        { kind: "heading", text: "Keeping bodyweight current" },
        {
          kind: "para",
          text: [
            "Bodyweight is the one field that goes stale, so it always shows the date it was taken — ",
            { ui: "AS OF 12 JUL" },
            ". It is also the load on a push-up or a pull-up, so a stale figure quietly misprices those. The ",
            { ui: "Log bodyweight" },
            " row on the ",
            { ui: "More" },
            " tab adds a dated reading in one tap, and keeps the old ones.",
          ],
        },
      ],
      related: [
        "ug/your-profile#body-and-age",
        "ug/your-profile#experience",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "body-and-age",
      title: "Sex, age, height, weight, body fat",
      summary:
        "These five say how much muscle you already carry relative to your potential, which is what a goal is paced against.",
      estimate: true,
      keywords: [
        "sex",
        "gender",
        "birthdate",
        "age",
        "height",
        "body fat",
        "dexa",
        "realistic target",
        "muscle gain",
        "potential",
      ],
      blocks: [
        {
          kind: "para",
          text: "Someone in their first year of training and someone ten years in do not gain at the same rate, and a plan that expects the same of both is wrong for one of them. These five fields are how the app tells the difference.",
        },
        {
          kind: "table",
          columns: ["Field", "What it changes"],
          rows: [
            [
              [{ ui: "SEX" }],
              "Shifts how much muscle a block should expect to add. Strength is scaled the same for everyone — the difference the app models is in mass, not in how much stronger you get.",
            ],
            [
              [{ ui: "BIRTHDATE" }],
              [
                "From ",
                { num: "40" },
                " onward, targets move toward the cautious end of their range. A date rather than a number, so it stays true without you editing it.",
              ],
            ],
            [
              [
                { ui: "HEIGHT" },
                " · ",
                { ui: "BODYWEIGHT" },
                " · ",
                { ui: "BODY FAT" },
              ],
              "Together they say how much muscle you already carry against how much you could. The closer you are to that, the slower the gain a plan should expect — and the further away, the more it can ask for.",
            ],
          ],
        },
        { kind: "heading", text: "Body fat is the one worth the trouble" },
        {
          kind: "para",
          text: [
            "It is optional, and it is the single biggest thing you can add: without it the app is reasoning about your muscle from height and weight alone, which cannot tell a lean 180 lb from a heavy one. Pick the closest band, enter a figure if you know it, or connect a DEXA scan — the screen keeps ",
            { ui: "BODY FAT — MEASURED" },
            " and ",
            { ui: "BODY FAT — ESTIMATE" },
            " apart so you know which one your targets rest on.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A model, not a measurement",
          text: "All of this produces a range, and the app shows you the cautious end of it. It is a sensible plan to test against, not a forecast of what you will get.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The age taper starts at ",
                { code: "macro_target.age_taper_start" },
                ", currently ",
                { num: "40" },
                ".",
              ],
            },
            {
              kind: "para",
              text: "Height, weight and body fat give lean mass for your height, placed between a modelled untrained baseline and a modelled ceiling. Your position between the two is what paces a long-term goal.",
            },
            {
              kind: "para",
              text: "Leave body fat blank and a representative value for your height-and-weight band stands in, so filling the field later moves the target smoothly rather than switching to a different calculation. With height or weight missing too, it falls back to how long you have been training.",
            },
          ],
        },
      ],
      related: [
        "ug/your-profile#experience",
        "ug/your-profile#what-it-is-for",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "experience",
      title: "Training since, and experience",
      summary:
        "Two fields that set your starting weekly set counts and how fast progress is paced.",
      keywords: [
        "training since",
        "experience",
        "beginner",
        "intermediate",
        "advanced",
        "training age",
        "starting sets",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "How long you have trained decides how much work a block starts you on. A beginner grows on less and recovers from less than someone with years behind them, so the weekly set counts a new plan is built around scale with it — and so does how much progress a long-term goal expects per month.",
          ],
        },
        { kind: "heading", text: "Two fields, and which one wins" },
        {
          kind: "para",
          text: [
            { ui: "TRAINING SINCE" },
            " is the date you started training seriously, and it wins wherever you have given one: under a year reads as beginner, under four years as intermediate, longer as advanced. ",
            { ui: "TRAINING EXPERIENCE" },
            " — the three-way choice under it — is what stands in when the date is blank. Set both; they are read in different places.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Pacing is not fixed by these fields alone. Once you have a couple of finished blocks behind you, the app reads how those actually went and paces you from your own record instead.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: [
                "The set band per muscle is scaled by ",
                { code: "volume.experience_scale" },
                " — ",
                { num: "0.7" },
                " for beginner, ",
                { num: "1.0" },
                " for intermediate, ",
                { num: "1.1" },
                " for advanced — applied to the stored per-muscle floor, working range and ceiling.",
              ],
            },
          ],
        },
      ],
      related: [
        "ug/your-profile#body-and-age",
        "ug/your-profile#equipment-and-exclusions",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "equipment-and-exclusions",
      title: "Equipment and excluded exercises",
      summary:
        "What you have access to, and the movements you would rather never be offered.",
      keywords: [
        "equipment",
        "gym",
        "excluded exercises",
        "exclusions",
        "injury",
        "hide exercise",
        "never show",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "EQUIPMENT ACCESS" },
            " is a row of toggles — barbell, dumbbell, machine, cable, smith, bodyweight, bands, kettlebell. It records what you can actually train with, and it travels with your profile to the AI connector, so a block drafted there can be built around your gym.",
          ],
        },
        {
          kind: "para",
          text: [
            "While you are browsing, the ",
            { ui: "EQUIP" },
            " filter on the Exercises tab is the faster way to narrow the library to what is in front of you.",
          ],
        },
        { kind: "heading", text: "Excluded exercises" },
        {
          kind: "para",
          text: [
            { ui: "EXCLUDED EXERCISES" },
            " is stronger, and the app states its own promise plainly: ",
            { ui: "NEVER SHOWN IN PICKERS OR TEMPLATES" },
            ". An excluded movement stops being offered anywhere you pick exercises.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Add",
              text: [
                "Tap to open the picker, search for the movement, and add it.",
              ],
            },
            {
              label: "Reason",
              text: [
                "Optional, and worth writing — ",
                { ui: "Reason — e.g. LOW BACK" },
                " is the prompt. It travels with the exclusion.",
              ],
            },
            {
              label: "Remove",
              text: "Take it off the list whenever you want the movement back.",
            },
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Excluding a movement changes what you are offered from here on. Sessions you have already logged with it stay exactly as they are.",
        },
      ],
      related: [
        "ug/your-profile#what-it-is-for",
        "ug/your-profile#experience",
      ],
    },
  ],
};
