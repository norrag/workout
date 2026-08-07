// User Guide — chapter 2, "Your profile" (doc 22 §5).
//
// The brief is "the fields the engine actually uses, and *what each one
// changes*". 22c §B5.2 is explicit that the app already answers half of this
// on the screen itself (`Drives starting volumes…`, `Calibrates the realistic
// muscle-gain target…`) and that the manual must **extend** those lines rather
// than restate them in different words — so both are quoted as `ui` and the
// prose picks up where they stop.
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
        "Every field on it is an input to something — none of it is decoration.",
      keywords: [
        "profile",
        "settings",
        "personal details",
        "why does it ask",
        "bodyweight",
        "as of",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "Your profile lives under ",
            { ui: "More" },
            " → your name. Every field on it feeds something: your starting set counts, the weight on a bodyweight movement, or how much progress a long-term goal should realistically expect from you.",
          ],
        },
        {
          kind: "para",
          text: "It is short on purpose, and it is worth filling in properly once. Tap a row to edit it; changes save as you make them.",
        },
        { kind: "heading", text: "Bodyweight, and when you weighed" },
        {
          kind: "para",
          text: [
            "Bodyweight shows with the date it was taken — ",
            { ui: "AS OF 12 JUL" },
            " — wherever it appears, because a number from four months ago should not read the same as one from this morning.",
          ],
        },
        {
          kind: "para",
          text: [
            "For quick entries, the ",
            { ui: "More" },
            " tab has a ",
            { ui: "Log bodyweight" },
            " row. That appends a dated measurement to your weight history rather than overwriting the profile figure, so the series is preserved.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          text: "Bodyweight is also the load on a push-up or a pull-up, so keeping it current keeps those prescriptions honest as well as the long-term targets.",
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
        "These five together set how much gain a macrocycle goal should realistically plan for.",
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
      ],
      blocks: [
        {
          kind: "para",
          text: [
            "The app's own line under ",
            { ui: "SEX" },
            " is ",
            { ui: "Calibrates the realistic muscle-gain target on your macrocycles." },
            " That is the job all five of these fields share: they set what a long-term goal should plan for, not what any single session asks of you.",
          ],
        },
        {
          kind: "table",
          columns: ["Field", "What it changes"],
          rows: [
            [
              [{ ui: "SEX" }],
              "Scales the muscle-gain side of a target. Strength targets are scaled the same for everyone — the difference the model carries is in mass, not in relative strength.",
            ],
            [
              [{ ui: "BIRTHDATE" }],
              [
                "Older lifters are moved toward the conservative end of the range, from age ",
                { num: "40" },
                " onward (",
                { code: "macro_target.age_taper_start" },
                "). A date rather than a number, so it stays true without editing.",
              ],
            ],
            [
              [{ ui: "HEIGHT" }, " · ", { ui: "BODYWEIGHT" }, " · ", { ui: "BODY FAT" }],
              "Together these say how much muscle you already carry relative to the model's ceiling — the closer you are, the slower the gain a target plans for.",
            ],
          ],
        },
        { kind: "heading", text: "Body fat: measured or estimated" },
        {
          kind: "para",
          text: [
            "Pick the closest band, enter a value you know, or connect a DEXA scan to fill it in as measured. The app keeps the two apart on the screen — ",
            { ui: "BODY FAT — MEASURED" },
            " against ",
            { ui: "BODY FAT — ESTIMATE" },
            " — so you always know which one your targets rest on.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "A model, not a measurement",
          text: "Everything derived here is a model applied to five facts about you. It produces a range, and the app shows you the conservative end of it deliberately. Treat it as a sensible plan to test, not a forecast.",
        },
        {
          kind: "detail",
          blocks: [
            {
              kind: "para",
              text: "Height, weight and body fat give a fat-free mass index — lean mass for your height — which is compared against a modeled untrained baseline and a modeled ceiling. Your position between them is the single biggest input to a long-term target.",
            },
            {
              kind: "para",
              text: "Leave body fat blank and the model uses a representative value for your height-and-weight band instead, so filling the field in moves the target smoothly rather than switching it to a different model. With height or weight missing too, it falls back to training age.",
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
            { ui: "TRAINING SINCE" },
            " is the date you started training seriously. ",
            { ui: "TRAINING EXPERIENCE" },
            " is the three-way choice under it, and the app's line there is ",
            { ui: "Drives starting volumes and how aggressively autoregulation ramps." },
          ],
        },
        { kind: "heading", text: "Which one wins" },
        {
          kind: "para",
          text: [
            "The date does, where you have given one: under a year of training reads as beginner, under four years as intermediate, and longer as advanced. ",
            { ui: "TRAINING EXPERIENCE" },
            " is what gets used when the date is blank — and it is worth setting anyway, because the two are read in different places.",
          ],
        },
        { kind: "heading", text: "What they change" },
        {
          kind: "list",
          items: [
            [
              { strong: "Your weekly set band" },
              " — the floor and ceiling of sets per muscle a plan is built against shift with experience, which is where your starting set counts come from.",
            ],
            [
              { strong: "The pace of a long-term goal" },
              " — how much strength a month is a reasonable thing for a plan to expect.",
            ],
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
