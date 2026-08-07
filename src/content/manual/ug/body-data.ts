// User Guide — chapter 16, "Body data" (doc 22 §5).
//
// GROUND TRUTH (22b §7 ch. 16 — doc 15, doc 17 §5/§6, `queries/bodyweight.ts`,
// `queries/body-comp.ts`, `queries/body-scans.ts`, `more/page.tsx`,
// `more/actions.ts`, `more/profile/actions.ts`, `log/actions.ts`,
// `more/bodyspec/**`):
//   - TWO bodyweights, deliberately (doc 17 §5 / N41). `profiles.bodyweight` is
//     the engine + profile input; `bodyweight_log` is measurement substrate for
//     the macro layer only, and `profiles.bodyweight` is NEVER derived from it
//   - the three writers differ, and this is the chapter's sharpest fact:
//     · the profile editor and the day view's bodyweight chip write BOTH
//       (`updateProfileField` / `updateBodyweightAction` → `updateProfile` +
//       `appendBodyweightPoint` with source `profile`)
//     · the More tab's `Log bodyweight` quick entry appends a point ONLY —
//       source `manual`, `profiles.bodyweight` untouched (`more/actions.ts:58`)
//     · a DEXA sync appends a point (source `dexa`) and PROPOSES the profile
//       update, which the reader confirms (`ProposalCard`, doc 15 §2.3)
//     Recorded as `D-17` — a reader could reasonably read the quick entry as
//     updating what the app trains them on
//   - one row per (user, day, source); re-entering a day replaces that point and
//     restamps `created_at` ("latest same-day entry wins on read")
//   - `profiles.bodyweight_updated_at` drives the "AS OF" freshness label
//     wherever profile bodyweight displays
//   - body fat has two provenance states — `measured` (a DEXA scan applied) and
//     `estimate` (a band pick or a custom value, validated 2–70)
//   - scans: `LEAN_LSC_LB` / `FAT_LSC_LB` are **2** lb — the least significant
//     change; deltas under it sit inside measurement noise. Cross-scanner
//     brackets refuse a delta outright ("different scanners — deltas not
//     comparable"), and `BRACKET_TOLERANCE_DAYS` is 14
//   - the page's own promise: scans "inform your macrocycle targets and outcome
//     verdicts; they never change a workout prescription" — and the macro
//     Overview's `MEASURED RMR` is display-only ("PRESCRIPTIONS AND TARGETS
//     NEVER READ IT")
//   - disconnect destroys the stored tokens; imported scans stay unless the
//     reader ticks the purge box
//
// SEAMS: ch. 2 owns which profile fields feed the model and the body-fat
// fallback chain (`C-prof-10`); ch. 13 owns the stats surfaces; ch. 14 owns the
// macrocycle target and the retrospective's `NOT COMPARABLE`. Claims:
// `C-body-01` onward.

import type { ManualChapter } from "../types";

export const UG_BODY_DATA: ManualChapter = {
  manual: "ug",
  slug: "body-data",
  number: 16,
  title: "Body data",
  summary:
    "Bodyweight, body fat and DEXA scans: what each one is for, which of them the app trains you on, and how far two measurements can honestly be compared.",
  sections: [
    // -----------------------------------------------------------------------
    {
      slug: "two-kinds-of-bodyweight",
      title: "Two kinds of bodyweight",
      summary:
        "One number the app trains you on, and a series of measurements it reads your progress from.",
      keywords: [
        "bodyweight",
        "log bodyweight",
        "weigh in",
        "as of",
        "why is my weight not updating",
        "profile weight",
      ],
      blocks: [
        {
          kind: "para",
          text: "The app keeps your bodyweight twice, on purpose. Your profile holds the one figure it works from — it is the load on a push-up, part of what a realistic goal looks like for you, and the number every screen shows with the date you last set it. Alongside it sits a dated series of measurements, which is what a long arc's mass result is read from.",
        },
        {
          kind: "table",
          columns: ["Where you enter it", "Records a measurement", "Updates the profile figure"],
          rows: [
            ["Your profile", "yes", "yes"],
            [
              ["The bodyweight chip in a session"],
              "yes",
              "yes",
            ],
            [
              [{ ui: "Log bodyweight" }, " on the More tab"],
              "yes",
              "no",
            ],
            ["A DEXA scan", "yes", "after you confirm it"],
          ],
        },
        {
          kind: "para",
          text: [
            "So ",
            { ui: "Log bodyweight" },
            " is for keeping the record: step on the scales, tap it in, and the series has the point. When you want the ",
            { strong: "app itself" },
            " to work from a new figure — because you are three kilos up and your push-ups should reflect it — edit the bodyweight on your profile, which records the measurement as well.",
          ],
        },
        {
          kind: "para",
          text: "One point per day per source, so re-entering a day's weight replaces it rather than stacking a second reading. You can date a point in the past; a date in the future is refused, because a measurement is a record of something that happened.",
        },
      ],
      related: [
        "ug/body-data#body-fat",
        "ug/your-profile#body-and-age",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "body-fat",
      title: "Body fat, measured or estimated",
      summary:
        "Two states with two different weights behind them, and the app is explicit about which one you have.",
      keywords: [
        "body fat",
        "bf%",
        "estimate",
        "measured",
        "override",
        "do i have to enter it",
      ],
      blocks: [
        {
          kind: "para",
          text: "Body fat is the one profile field that arrives two ways, and the app labels which you have rather than merging them. A scan you have imported and applied gives you a measured value. Anything you enter yourself — a band you pick, or a figure you type — is recorded as an estimate.",
        },
        {
          kind: "para",
          text: [
            "The distinction is not cosmetic. It is what lets a macrocycle's closeout say ",
            { ui: "NOT MEASURED" },
            " honestly instead of grading you against a guess you made a year ago, and it is why applying a scan is a decision you confirm rather than something a sync does to you.",
          ],
        },
        {
          kind: "para",
          text: [
            "Leaving it blank is a reasonable choice. The ",
            {
              to: "ug/macrocycle-goals#the-target-behind-it",
              text: "target model",
            },
            " reads a representative figure for your height and weight instead, so completing the field later moves your targets by degrees rather than switching them to a different model. Its reach stops at the goal layer either way: the weight on the bar comes from your logged sets.",
          ],
        },
        {
          kind: "para",
          text: [
            "Overriding works in both directions: with a measured value in place, ",
            { ui: "OVERRIDE WITH AN ESTIMATE" },
            " swaps the panel back to the picker, and the provenance flips with it.",
          ],
        },
      ],
      related: [
        "ug/body-data#importing-scans",
        "ug/your-profile#body-and-age",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "importing-scans",
      title: "Importing DEXA scans",
      summary:
        "Connect a BodySpec account once, then sync after each appointment to pull the scan history in.",
      keywords: [
        "dexa",
        "bodyspec",
        "scan",
        "connect",
        "sync",
        "lean mass",
        "visceral fat",
      ],
      blocks: [
        {
          kind: "para",
          text: [
            { ui: "More" },
            " → ",
            { ui: "BodySpec DEXA" },
            " connects your BodySpec account and pulls in your scan history — lean mass, body fat, bone density and visceral fat, all measured rather than estimated. Where the connection has not been set up for the app you are running, the page says so instead of offering a button that would fail.",
          ],
        },
        {
          kind: "steps",
          steps: [
            {
              label: "Connect",
              text: "Sign in to BodySpec once and approve the link. The page then shows the account it is connected as and when it last synced.",
            },
            {
              label: "Sync",
              text: "After an appointment, sync to import the new scan. Results land within a few days of the scan itself, so sync once they are ready rather than on the day.",
            },
            {
              label: "Confirm",
              text: "A new scan offers to update your profile's bodyweight and body fat, showing the current value beside the proposed one. Apply it, or keep what you have.",
            },
          ],
        },
        {
          kind: "para",
          text: [
            "That third step is the rule the whole integration is built on: ",
            { strong: "a measurement proposes and you decide" },
            ". Importing a scan never changes your profile on its own, and either answer is final for that scan.",
          ],
        },
        {
          kind: "para",
          text: "Disconnecting destroys the stored keys to your BodySpec account. Scans you have already imported stay, unless you tick the box asking for them to go too.",
        },
      ],
      related: [
        "ug/body-data#comparing-two-scans",
        "ug/body-data#what-body-data-changes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "comparing-two-scans",
      title: "Comparing two scans",
      summary:
        "Two rules make a scan-to-scan difference meaningful: same machine, and big enough to be real.",
      keywords: [
        "not comparable",
        "different scanners",
        "noise",
        "lean change",
        "how often should i scan",
        "measurement error",
      ],
      blocks: [
        {
          kind: "para",
          text: "A DEXA scan is precise, which is exactly why the app is careful about subtracting one from another. Two rules govern every difference it shows you.",
        },
        {
          kind: "list",
          items: [
            [
              { strong: "Same machine" },
              " — two scans from different scanners are reported as measurements and never as a difference. Machines are calibrated independently, so the gap between them can be larger than the change you are trying to read.",
            ],
            [
              { strong: "Big enough to be real" },
              " — a lean or fat change under about ",
              { num: "2" },
              " lb sits inside the measurement's own error, and a body-fat move under about a point does too. The app declines to call those a change.",
            ],
          ],
        },
        {
          kind: "para",
          text: [
            "Which is why the macro Overview's composition trend appears only once you have two scans in the window, and why it can say ",
            { ui: "NOT COMPARABLE" },
            " with both scans plainly listed above it. That is the honest reading of the data, rather than a gap in it.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "Scan quarterly, not monthly",
          text: "Real lean-mass change accumulates slowly enough that a scan every three months or so is the first interval where the signal reliably clears the noise. Scanning more often mostly buys you differences you cannot act on.",
        },
      ],
      related: [
        "ug/macrocycle-goals#finishing-an-arc",
        "ug/body-data#what-body-data-changes",
      ],
    },
    // -----------------------------------------------------------------------
    {
      slug: "what-body-data-changes",
      title: "What body data changes",
      summary:
        "It shapes your goals and grades your outcomes; the weight on the bar comes from your sets.",
      estimate: true,
      keywords: [
        "does body fat change my workout",
        "rmr",
        "metabolic rate",
        "what is it used for",
        "prescription",
      ],
      blocks: [
        {
          kind: "para",
          text: "Body data works at the macrocycle layer and stops there. It shapes what a realistic goal looks like for you, it is what a finished arc's mass and composition results are graded from, and on a cutting or gaining arc it gives you a measured resting metabolic rate for context.",
        },
        {
          kind: "para",
          text: [
            { strong: "No weight you are asked to lift reads any of it." },
            " Your next set comes from the sets you have already logged, which is a separate chain entirely — the one exception being movements where your bodyweight ",
            {
              to: "ug/exercises-and-templates#what-an-exercise-remembers",
              text: "is the load",
            },
            ", and there it is the profile figure that counts.",
          ],
        },
        {
          kind: "para",
          text: [
            "The ",
            { ui: "MEASURED RMR" },
            " figure is worked out from your lean mass and is there to be read, not acted on by the app. Your daily maintenance sits above it once you add the rest of your day, and it is context for the arc rather than an instruction.",
          ],
        },
        {
          kind: "callout",
          tone: "honesty",
          label: "The app watches training, not eating",
          text: "Every goal figure assumes food and sleep are supporting the training, and the app has no way to check either. Treat a target as what the training could support, with the rest of it up to you.",
        },
      ],
      related: [
        "ug/macrocycle-goals#the-target-behind-it",
        "ug/how-your-weight-is-chosen#the-anchor",
      ],
    },
  ],
};
